import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveBalance } from './entities/leave-balance.entity';
import { HcmSyncLog } from '../sync/entities/hcm-sync-log.entity';
import { TimeOffRequest } from '../requests/entities/time-off-request.entity';
import { BalancesService } from './balances.service';
import { BalancesController } from './balances.controller';
import { HcmModule } from '../hcm/hcm.module';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeaveBalance, HcmSyncLog, TimeOffRequest]),
    HcmModule,
    forwardRef(() => SyncModule),
  ],
  providers: [BalancesService],
  controllers: [BalancesController],
  exports: [BalancesService],
})
export class BalancesModule {}
