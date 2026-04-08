import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule as TimeOffAppModule } from '../apps/time-off/src/app.module';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule as GatewayAppModule } from '../apps/api-gateway/src/app.module';
import { HttpExceptionFilter } from '../apps/api-gateway/src/filters/http-exception.filter';

/**
 * E2E helper: boots both the time-off TCP microservice and the API Gateway
 * pointing to each other on ephemeral ports.
 */
export async function createTestApps(): Promise<{
  app: INestApplication;
  teardown: () => Promise<void>;
}> {
  // 1. Start time-off microservice on TCP 13001
  process.env.TIME_OFF_TCP_PORT = '13001';
  process.env.TIMEOFF_DB_PATH = ':memory:';
  process.env.HCM_DB_PATH = ':memory:';
  process.env.HCM_BASE_URL = 'http://localhost:13002';

  const msApp = await NestFactory.createMicroservice<MicroserviceOptions>(
    TimeOffAppModule,
    {
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port: 13001 },
    },
  );
  await msApp.listen();

  // 2. Start API Gateway on HTTP 13000
  process.env.GATEWAY_PORT = '13000';
  process.env.TIME_OFF_TCP_HOST = '127.0.0.1';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.HCM_WEBHOOK_SECRET = 'test-webhook-secret';
  process.env.FRONTEND_URL = 'http://localhost:5173';

  const module: TestingModule = await Test.createTestingModule({
    imports: [GatewayAppModule],
  }).compile();

  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();

  return {
    app,
    teardown: async () => {
      await app.close();
      await msApp.close();
    },
  };
}
