import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HcmService } from './hcm.service';
import { HcmController } from './hcm.controller';
import { HcmSyncLog } from '../sync/entities/hcm-sync-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([HcmSyncLog])],
  providers: [HcmService],
  controllers: [HcmController],
  exports: [HcmService],
})
export class HcmModule {}
