import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './employees/entities/employee.entity';
import { LeaveBalance } from './balances/entities/leave-balance.entity';
import { TimeOffRequest } from './requests/entities/time-off-request.entity';
import { HcmSyncLog } from './sync/entities/hcm-sync-log.entity';
import { EmployeesModule } from './employees/employees.module';
import { RequestsModule } from './requests/requests.module';
import { BalancesModule } from './balances/balances.module';
import { HcmModule } from './hcm/hcm.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'better-sqlite3',
        database: process.env.TIMEOFF_DB_PATH ?? 'time_off.db',
        entities: [Employee, LeaveBalance, TimeOffRequest, HcmSyncLog],
        synchronize: true,
      }),
    }),
    EmployeesModule,
    RequestsModule,
    BalancesModule,
    HcmModule,
    SyncModule,
  ],
})
export class AppModule {}
