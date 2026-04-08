import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Inject,
  HttpException,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, catchError, throwError } from 'rxjs';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  TCP_MESSAGES,
  TIMEOFF_SERVICE,
  Role,
  LeaveType,
  verifyHmacSignature,
} from '@app/common';
import { EventsGateway } from '../gateway/events.gateway';

@ApiTags('hcm')
@Controller('hcm')
export class HcmController {
  constructor(
    @Inject(TIMEOFF_SERVICE) private readonly timeOffClient: ClientProxy,
    private readonly eventsGateway: EventsGateway,
    private readonly configService: ConfigService,
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

  @Post('webhook/balance-update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive HCM balance-change webhook' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['employeeId', 'locationId', 'leaveType', 'newBalance'],
      properties: {
        employeeId:  { type: 'string', example: 'f6ce4e20-8ca6-4143-ac71-f664cadb9f5c' },
        locationId:  { type: 'string', example: 'pk1234' },
        leaveType:   { type: 'string', enum: ['VACATION','SICK','PERSONAL','MATERNITY','PATERNITY'], example: 'MATERNITY' },
        newBalance:  { type: 'number', example: 12 },
        triggeredAt: { type: 'string', format: 'date-time', example: '2026-04-08T10:00:00.000Z' },
      },
    },
  })
  async handleWebhook(
    @Headers('x-hcm-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
    @Body()
    body: {
      employeeId: string;
      locationId: string;
      leaveType: LeaveType;
      newBalance: number;
      triggeredAt?: string;
    },
  ) {
    const secret = this.configService.get<string>('HCM_WEBHOOK_SECRET', '');

    // Rebuild canonical JSON in the same key order the HCM mock uses when signing,
    // so verification is whitespace-independent (Swagger pretty-prints the body).
    const canonical = JSON.stringify({
      employeeId:  body.employeeId,
      locationId:  body.locationId,
      leaveType:   body.leaveType,
      newBalance:  body.newBalance,
      triggeredAt: body.triggeredAt ?? '',
    });

    if (!signature || !verifyHmacSignature(canonical, signature, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const result = await this.send<any>(TCP_MESSAGES.BALANCE_SYNC_FROM_HCM, body);

    this.eventsGateway.notifyEmployee(body.employeeId, 'balance.updated', {
      employeeId: body.employeeId,
      locationId: body.locationId,
      leaveType: body.leaveType,
      available:
        result.balance.totalDays -
        result.balance.usedDays -
        result.balance.pendingDays,
      totalDays: result.balance.totalDays,
      usedDays: result.balance.usedDays,
      pendingDays: result.balance.pendingDays,
    });

    if (result.affectedRequests?.length > 0) {
      this.eventsGateway.notifyAdmins('balance.overdrawn-warning', {
        employeeId: body.employeeId,
        affectedRequests: result.affectedRequests,
      });
    }

    return { ok: true };
  }

  @Post('sync/batch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trigger full HCM batch reconciliation (admin)' })
  async triggerBatch() {
    const result = await this.send<any>(TCP_MESSAGES.BALANCE_BATCH_SYNC, {});
    this.eventsGateway.notifyAdmins('hcm.sync.completed', {
      syncType: 'BATCH',
      ...result,
    });
    return result;
  }

  @Get('sync/logs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'View HCM sync logs (admin)' })
  getLogs() {
    return this.send(TCP_MESSAGES.SYNC_LOGS_FIND_ALL, {});
  }
}
