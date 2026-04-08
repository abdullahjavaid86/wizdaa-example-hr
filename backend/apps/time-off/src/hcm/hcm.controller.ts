import { Controller } from '@nestjs/common';
import { MessagePattern, RpcException } from '@nestjs/microservices';
import { TCP_MESSAGES } from '@app/common';
import { HcmService } from './hcm.service';

@Controller()
export class HcmController {
  constructor(private readonly hcmService: HcmService) {}

  @MessagePattern(TCP_MESSAGES.SYNC_LOGS_FIND_ALL)
  async getLogs() {
    try {
      return await this.hcmService.getLogs();
    } catch (err) {
      throw new RpcException({ message: (err as Error).message, statusCode: 500 });
    }
  }
}
