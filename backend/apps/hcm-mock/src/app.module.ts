import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalanceModule } from './balance/balance.module';
import { HcmBalance } from './balance/entities/hcm-balance.entity';
import { WebhookTriggerController } from './webhook/webhook-trigger.controller';
import { BalanceService } from './balance/balance.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'better-sqlite3',
        database: process.env.HCM_DB_PATH ?? 'hcm_mock.db',
        entities: [HcmBalance],
        synchronize: true,
      }),
    }),
    BalanceModule,
  ],
  controllers: [WebhookTriggerController],
})
export class AppModule {}
