import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  HttpException,
  Inject,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, catchError, throwError } from 'rxjs';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TCP_MESSAGES, TIMEOFF_SERVICE, Role, AuthenticatedUser } from '@app/common';
import { EventsGateway } from '../gateway/events.gateway';
import { CreateRequestDto } from '../../../time-off/src/requests/dto/create-request.dto';
import { RejectRequestDto } from '../../../time-off/src/requests/dto/reject-request.dto';

@ApiTags('requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('requests')
export class RequestsController {
  constructor(
    @Inject(TIMEOFF_SERVICE) private readonly timeOffClient: ClientProxy,
    private readonly eventsGateway: EventsGateway,
  ) {}

  private async send<T>(pattern: string, data: unknown): Promise<T> {
    try {
      return await firstValueFrom(
        this.timeOffClient.send<T>(pattern, data).pipe(
          catchError((err) =>
            throwError(
              () =>
                new HttpException(
                  err?.message ?? 'Microservice error',
                  err?.statusCode ?? 500,
                ),
            ),
          ),
        ),
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException((err as Error).message, 500);
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a new time-off request' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRequestDto,
  ) {
    const request = await this.send<any>(TCP_MESSAGES.REQUEST_CREATE, {
      user,
      dto,
    });
    this.eventsGateway.notifyManager(user.managerId, {
      requestId: request.id,
      employeeId: user.id,
      daysCount: request.daysCount,
      leaveType: request.leaveType,
      startDate: request.startDate,
      endDate: request.endDate,
    });
    // Also broadcast to the managers room so any online manager sees it instantly
    this.eventsGateway.notifyManagers('request.created', {
      requestId: request.id,
      employeeId: user.id,
      daysCount: request.daysCount,
      leaveType: request.leaveType,
      startDate: request.startDate,
      endDate: request.endDate,
    });
    return request;
  }

  @Get()
  @ApiOperation({ summary: 'List requests (own for employees, all for managers)' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.send(TCP_MESSAGES.REQUEST_FIND_ALL, { user });
  }

  @Get('pending')
  @Roles(Role.MANAGER, Role.ADMIN)
  @ApiOperation({ summary: 'List all pending requests (manager only)' })
  findPending(@CurrentUser() user: AuthenticatedUser) {
    return this.send(TCP_MESSAGES.REQUEST_PENDING, { managerId: user.id });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single request by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.send(TCP_MESSAGES.REQUEST_FIND_ONE, { id, user });
  }

  @Patch(':id/approve')
  @Roles(Role.MANAGER, Role.ADMIN)
  @ApiOperation({ summary: 'Approve a time-off request' })
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { managerNote?: string },
  ) {
    const request = await this.send<any>(TCP_MESSAGES.REQUEST_APPROVE, {
      id,
      managerId: user.id,
      managerNote: body.managerNote,
    });
    this.eventsGateway.notifyEmployee(request.employeeId, 'request.approved', {
      requestId: request.id,
      status: request.status,
      managerNote: request.managerNote,
    });
    this.eventsGateway.notifyManagers('request.approved', { requestId: request.id });
    return request;
  }

  @Patch(':id/reject')
  @Roles(Role.MANAGER, Role.ADMIN)
  @ApiOperation({ summary: 'Reject a time-off request' })
  async reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: RejectRequestDto,
  ) {
    const request = await this.send<any>(TCP_MESSAGES.REQUEST_REJECT, {
      id,
      managerId: user.id,
      managerNote: body.managerNote,
    });
    this.eventsGateway.notifyEmployee(request.employeeId, 'request.rejected', {
      requestId: request.id,
      status: request.status,
      managerNote: request.managerNote,
    });
    this.eventsGateway.notifyManagers('request.rejected', { requestId: request.id });
    return request;
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a pending request (employee only)' })
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const request = await this.send<any>(TCP_MESSAGES.REQUEST_CANCEL, {
      id,
      employeeId: user.id,
    });
    if (user.managerId) {
      this.eventsGateway.notifyEmployee(user.managerId, 'request.cancelled', {
        requestId: request.id,
      });
    }
    return request;
  }
}
