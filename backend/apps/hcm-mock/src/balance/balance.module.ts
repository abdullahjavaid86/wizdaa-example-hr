import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { BalanceController } from './balance.controller';
import { BalanceService } from './balance.service';
import { HcmBalance } from './entities/hcm-balance.entity';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([HcmBalance])],
  controllers: [BalanceController],
  providers: [BalanceService],
  exports: [BalanceService],
})
export class BalanceModule {}
