import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : (res as any).message ?? res;
    } else if (
      typeof exception === 'object' &&
      exception !== null &&
      'statusCode' in exception
    ) {
      // RpcException forwarded with statusCode
      status = (exception as any).statusCode ?? HttpStatus.BAD_REQUEST;
      message = (exception as any).message ?? 'Request failed';
    }

    const exposeDetails =
      process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

    const body: Record<string, unknown> = {
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (exposeDetails && exception instanceof Error) {
      body.stack = exception.stack;
    }

    this.logger.error(
      `${request.method} ${request.url} → ${status}`,
      exposeDetails && exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json(body);
  }
}
