import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimeOffRequest } from './entities/time-off-request.entity';
import { LeaveBalance } from '../balances/entities/leave-balance.entity';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';
import { HcmModule } from '../hcm/hcm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TimeOffRequest, LeaveBalance]),
    HcmModule,
  ],
  providers: [RequestsService],
  controllers: [RequestsController],
  exports: [RequestsService],
})
export class RequestsModule {}
