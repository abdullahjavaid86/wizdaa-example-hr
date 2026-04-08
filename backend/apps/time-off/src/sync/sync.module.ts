import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { HcmSyncLog } from './entities/hcm-sync-log.entity';
import { SyncService } from './sync.service';
import { HcmModule } from '../hcm/hcm.module';
import { BalancesModule } from '../balances/balances.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([HcmSyncLog]),
    HcmModule,
    forwardRef(() => BalancesModule),
  ],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
