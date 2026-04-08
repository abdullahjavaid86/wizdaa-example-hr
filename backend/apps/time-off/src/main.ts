import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.TCP,
      options: {
        host: process.env.TIME_OFF_TCP_HOST ?? '0.0.0.0',
        port: parseInt(process.env.TIME_OFF_TCP_PORT ?? '3001', 10),
      },
    },
  );

  await app.listen();
  console.log(
    `Time-Off microservice running on TCP port ${process.env.TIME_OFF_TCP_PORT ?? 3001}`,
  );
}

bootstrap();
