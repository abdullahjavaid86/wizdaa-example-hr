import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BalanceService } from '../balance/balance.service';
import { computeHmacSignature } from '@app/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

@ApiTags('webhook-trigger')
@Controller('hcm/webhook')
export class WebhookTriggerController {
  constructor(
    private readonly balanceService: BalanceService,
    private readonly configService: ConfigService,
  ) {}

  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Trigger a balance-update webhook push to ExampleHR (for testing)',
  })
  async triggerWebhook(
    @Body()
    body: {
      employeeId: string;
      locationId: string;
      leaveType: string;
      newBalance: number;
    },
  ) {
    const payload = JSON.stringify({
      employeeId: body.employeeId,
      locationId: body.locationId,
      leaveType: body.leaveType,
      newBalance: body.newBalance,
      triggeredAt: new Date().toISOString(),
    });

    const secret = this.configService.get<string>(
      'HCM_WEBHOOK_SECRET',
      'test-webhook-secret',
    );
    const signature = computeHmacSignature(payload, secret);

    const gatewayUrl = this.configService.get<string>(
      'GATEWAY_URL',
      'http://localhost:3000',
    );

    try {
      const response = await axios.post(
        `${gatewayUrl}/hcm/webhook/balance-update`,
        JSON.parse(payload),
        {
          headers: {
            'Content-Type': 'application/json',
            'X-HCM-Signature': signature,
          },
          timeout: 5000,
        },
      );
      return { sent: true, status: response.status };
    } catch (err) {
      return { sent: false, error: (err as Error).message };
    }
  }
}
