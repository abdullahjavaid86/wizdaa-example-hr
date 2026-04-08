import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RequestsController } from './requests.controller';
import { EventsGateway } from '../gateway/events.gateway';
import { TIMEOFF_SERVICE } from '@app/common';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
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
  ],
  controllers: [RequestsController],
  providers: [EventsGateway],
})
export class RequestsModule {}
