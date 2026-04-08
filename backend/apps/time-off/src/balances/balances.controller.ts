import { Controller, Inject, forwardRef } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { TCP_MESSAGES, LeaveType } from '@app/common';
import { BalancesService } from './balances.service';
import { SyncService } from '../sync/sync.service';

@Controller()
export class BalancesController {
  constructor(
    private readonly balancesService: BalancesService,
    @Inject(forwardRef(() => SyncService))
    private readonly syncService: SyncService,
  ) {}

  @MessagePattern(TCP_MESSAGES.BALANCE_FIND_BY_EMPLOYEE)
  async findByEmployee(@Payload() data: { employeeId: string; locationId: string }) {
    try {
      return await this.balancesService.findByEmployee(data.employeeId, data.locationId);
    } catch (err) {
      throw new RpcException({ message: (err as Error).message, statusCode: 500 });
    }
  }

  @MessagePattern(TCP_MESSAGES.BALANCE_SYNC_FROM_HCM)
  async syncFromHcm(
    @Payload()
    data: {
      employeeId: string;
      locationId: string;
      leaveType: LeaveType;
      newBalance: number;
    },
  ) {
    try {
      return await this.balancesService.syncFromHcmWebhook(data);
    } catch (err) {
      throw new RpcException({ message: (err as Error).message, statusCode: 500 });
    }
  }

  @MessagePattern(TCP_MESSAGES.BALANCE_BATCH_SYNC)
  async batchSync() {
    try {
      return await this.syncService.triggerBatchSync();
    } catch (err) {
      throw new RpcException({ message: (err as Error).message, statusCode: 500 });
    }
  }

  @MessagePattern(TCP_MESSAGES.BALANCE_UPDATE_MANUAL)
  async updateManual(
    @Payload()
    data: {
      employeeId: string;
      locationId: string;
      leaveType: LeaveType;
      totalDays: number;
      usedDays: number;
      year?: number;
    },
  ) {
    try {
      return await this.balancesService.updateManual(data);
    } catch (err) {
      throw new RpcException({ message: (err as Error).message, statusCode: 500 });
    }
  }
}
