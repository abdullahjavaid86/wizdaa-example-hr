import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { TCP_MESSAGES, Role } from '@app/common';
import { EmployeesService } from './employees.service';

@Controller()
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @MessagePattern(TCP_MESSAGES.EMPLOYEE_CREATE)
  async create(
    @Payload()
    data: {
      name: string;
      email: string;
      password: string;
      role?: Role;
      locationId: string;
      managerId?: string;
      hireDate?: string;
    },
  ) {
    try {
      return await this.employeesService.create(data);
    } catch (err) {
      throw new RpcException({ message: (err as Error).message, statusCode: (err as any).status ?? 400 });
    }
  }

  @MessagePattern(TCP_MESSAGES.EMPLOYEE_FIND_BY_EMAIL)
  async findByEmail(@Payload() data: { email: string }) {
    try {
      return await this.employeesService.findByEmail(data.email);
    } catch (err) {
      throw new RpcException({ message: (err as Error).message, statusCode: 404 });
    }
  }

  @MessagePattern(TCP_MESSAGES.EMPLOYEE_FIND_ONE)
  async findOne(@Payload() data: { id: string }) {
    try {
      return await this.employeesService.findById(data.id);
    } catch (err) {
      throw new RpcException({ message: (err as Error).message, statusCode: 404 });
    }
  }

  @MessagePattern(TCP_MESSAGES.EMPLOYEE_FIND_ALL)
  async findAll() {
    try {
      return await this.employeesService.findAll();
    } catch (err) {
      throw new RpcException({ message: (err as Error).message, statusCode: 500 });
    }
  }
}
