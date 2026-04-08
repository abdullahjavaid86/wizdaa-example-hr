import {
  Controller,
  Get,
  Param,
  UseGuards,
  Inject,
  HttpException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, catchError, throwError } from 'rxjs';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TCP_MESSAGES, TIMEOFF_SERVICE, Role } from '@app/common';

@ApiTags('employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees')
export class EmployeesController {
  constructor(
    @Inject(TIMEOFF_SERVICE) private readonly timeOffClient: ClientProxy,
  ) {}

  private async send<T>(pattern: string, data: unknown): Promise<T> {
    try {
      return await firstValueFrom(
        this.timeOffClient.send<T>(pattern, data).pipe(
          catchError((err) =>
            throwError(
              () =>
                new HttpException(
                  err?.message ?? 'Microservice error',
                  err?.statusCode ?? 500,
                ),
            ),
          ),
        ),
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException((err as Error).message, 500);
    }
  }

  @Get()
  @Roles(Role.MANAGER, Role.ADMIN)
  @ApiOperation({ summary: 'List all employees' })
  findAll() {
    return this.send(TCP_MESSAGES.EMPLOYEE_FIND_ALL, {});
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get employee by ID' })
  findOne(@Param('id') id: string) {
    return this.send(TCP_MESSAGES.EMPLOYEE_FIND_ONE, { id });
  }
}
