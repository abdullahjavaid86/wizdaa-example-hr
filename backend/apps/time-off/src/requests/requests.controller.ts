import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { TCP_MESSAGES, AuthenticatedUser } from '@app/common';
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';

@Controller()
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @MessagePattern(TCP_MESSAGES.REQUEST_CREATE)
  async create(@Payload() data: { user: AuthenticatedUser; dto: CreateRequestDto }) {
    try {
      return await this.requestsService.create(data.user, data.dto);
    } catch (err) {
      throw new RpcException({ message: (err as Error).message, statusCode: (err as any).status ?? 400 });
    }
  }

  @MessagePattern(TCP_MESSAGES.REQUEST_FIND_ALL)
  async findAll(@Payload() data: { user: AuthenticatedUser }) {
    try {
      return await this.requestsService.findAll(data.user);
    } catch (err) {
      throw new RpcException({ message: (err as Error).message, statusCode: 500 });
    }
  }

  @MessagePattern(TCP_MESSAGES.REQUEST_FIND_ONE)
  async findOne(@Payload() data: { id: string; user: AuthenticatedUser }) {
    try {
      return await this.requestsService.findOne(data.id, data.user);
    } catch (err) {
      throw new RpcException({ message: (err as Error).message, statusCode: (err as any).status ?? 404 });
    }
  }

  @MessagePattern(TCP_MESSAGES.REQUEST_APPROVE)
  async approve(@Payload() data: { id: string; managerId: string; managerNote?: string }) {
    try {
      return await this.requestsService.approve(data.id, data.managerId, data.managerNote);
    } catch (err) {
      throw new RpcException({ message: (err as Error).message, statusCode: (err as any).status ?? 400 });
    }
  }

  @MessagePattern(TCP_MESSAGES.REQUEST_REJECT)
  async reject(@Payload() data: { id: string; managerId: string; managerNote?: string }) {
    try {
      return await this.requestsService.reject(data.id, data.managerId, data.managerNote);
    } catch (err) {
      throw new RpcException({ message: (err as Error).message, statusCode: (err as any).status ?? 400 });
    }
  }

  @MessagePattern(TCP_MESSAGES.REQUEST_CANCEL)
  async cancel(@Payload() data: { id: string; employeeId: string }) {
    try {
      return await this.requestsService.cancel(data.id, data.employeeId);
    } catch (err) {
      throw new RpcException({ message: (err as Error).message, statusCode: (err as any).status ?? 400 });
    }
  }

  @MessagePattern(TCP_MESSAGES.REQUEST_PENDING)
  async findPending(@Payload() data: { managerId: string }) {
    try {
      return await this.requestsService.findPending(data.managerId);
    } catch (err) {
      throw new RpcException({ message: (err as Error).message, statusCode: 500 });
    }
  }
}
