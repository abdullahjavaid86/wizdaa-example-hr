import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Logger } from '@nestjs/common';
import { HcmService } from '../hcm/hcm.service';
import { BalancesService } from '../balances/balances.service';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly hcmService: HcmService,
    @Inject(forwardRef(() => BalancesService))
    private readonly balancesService: BalancesService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runDailyBatchSync(): Promise<void> {
    this.logger.log('Starting daily HCM batch reconciliation...');
    await this.triggerBatchSync();
  }

  async triggerBatchSync(): Promise<{ updated: number; errors: number }> {
    const batch = await this.hcmService.fetchBatch();
    if (!batch) {
      this.logger.error('Batch sync failed: could not fetch from HCM');
      return { updated: 0, errors: 1 };
    }

    const result = await this.balancesService.processBatchSync(batch.entries);
    this.logger.log(`Batch sync complete: updated=${result.updated}, errors=${result.errors}`);
    return result;
  }
}
