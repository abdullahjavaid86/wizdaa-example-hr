import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Inject,
  HttpCode,
  HttpStatus,
  HttpException,
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

@ApiTags('balances')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('balances')
export class BalancesController {
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

  @Get('me')
  @ApiOperation({ summary: "Get current employee's leave balances" })
  getMyBalance(@CurrentUser() user: AuthenticatedUser) {
    return this.send(TCP_MESSAGES.BALANCE_FIND_BY_EMPLOYEE, {
      employeeId: user.id,
      locationId: user.locationId,
    });
  }

  @Get(':employeeId')
  @Roles(Role.MANAGER, Role.ADMIN)
  @ApiOperation({ summary: "Get an employee's balances (manager only)" })
  getEmployeeBalance(
    @Param('employeeId') employeeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.send(TCP_MESSAGES.BALANCE_FIND_BY_EMPLOYEE, {
      employeeId,
      locationId: user.locationId,
    });
  }

  @Post('sync/:employeeId')
  @Roles(Role.MANAGER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger real-time HCM sync for an employee' })
  async triggerSync(@Param('employeeId') employeeId: string) {
    const result = await this.send<any>(TCP_MESSAGES.BALANCE_BATCH_SYNC, {});
    return result;
  }

  @Patch(':employeeId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually update a leave balance (admin only)' })
  async updateManual(
    @Param('employeeId') employeeId: string,
    @Body()
    body: {
      locationId: string;
      leaveType: string;
      totalDays: number;
      usedDays: number;
      year?: number;
    },
  ) {
    const result = await this.send<any>(TCP_MESSAGES.BALANCE_UPDATE_MANUAL, {
      employeeId,
      ...body,
    });
    this.eventsGateway.notifyEmployee(employeeId, 'balance.updated', result);
    return result;
  }
}
