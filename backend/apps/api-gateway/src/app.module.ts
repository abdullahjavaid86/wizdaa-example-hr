import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './auth/auth.module';
import { RequestsController } from './requests/requests.controller';
import { BalancesController } from './balances/balances.controller';
import { EmployeesController } from './employees/employees.controller';
import { HcmController } from './hcm/hcm.controller';
import { EventsGateway } from './gateway/events.gateway';
import { TIMEOFF_SERVICE } from '@app/common';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClientsModule.registerAsync([
      {
        name: TIMEOFF_SERVICE,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('TIME_OFF_TCP_HOST', 'localhost'),
            port: config.get<number>('TIME_OFF_TCP_PORT', 3001),
          },
        }),
      },
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'fallback-secret'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRY', '15m') },
      }),
    }),
    AuthModule,
  ],
  controllers: [
    RequestsController,
    BalancesController,
    EmployeesController,
    HcmController,
  ],
  providers: [EventsGateway],
})
export class AppModule {}
