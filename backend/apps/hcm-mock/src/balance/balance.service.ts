import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HcmBalance } from './entities/hcm-balance.entity';
import { LeaveType, HcmBalanceResponse, HcmBatchResponse, computeHmacSignature } from '@app/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);

  constructor(
    @InjectRepository(HcmBalance)
    private readonly balanceRepo: Repository<HcmBalance>,
    private readonly configService: ConfigService,
  ) {}

  async getBalance(
    employeeId: string,
    locationId: string,
  ): Promise<HcmBalanceResponse[]> {
    const year = new Date().getFullYear();
    const balances = await this.balanceRepo.find({
      where: { employeeId, locationId, year },
    });

    return balances.map((b) => ({
      employeeId: b.employeeId,
      locationId: b.locationId,
      leaveType: b.leaveType,
      balance: b.balance,
      year: b.year,
      transactionId: uuidv4(),
    }));
  }

  async getBalanceByType(
    employeeId: string,
    locationId: string,
    leaveType: LeaveType,
  ): Promise<HcmBalanceResponse> {
    const year = new Date().getFullYear();
    const balance = await this.balanceRepo.findOne({
      where: { employeeId, locationId, leaveType, year },
    });

    if (!balance) {
      throw new NotFoundException(
        `No HCM balance found for employee ${employeeId}, location ${locationId}, type ${leaveType}`,
      );
    }

    return {
      employeeId: balance.employeeId,
      locationId: balance.locationId,
      leaveType: balance.leaveType,
      balance: balance.balance,
      year: balance.year,
      transactionId: uuidv4(),
    };
  }

  async updateBalance(
    employeeId: string,
    locationId: string,
    leaveType: LeaveType,
    newBalance: number,
  ): Promise<HcmBalanceResponse> {
    const year = new Date().getFullYear();
    let record = await this.balanceRepo.findOne({
      where: { employeeId, locationId, leaveType, year },
    });

    if (!record) {
      record = this.balanceRepo.create({
        employeeId,
        locationId,
        leaveType,
        year,
        balance: newBalance,
      });
    } else {
      record.balance = newBalance;
    }

    await this.balanceRepo.save(record);

    return {
      employeeId,
      locationId,
      leaveType,
      balance: newBalance,
      year,
      transactionId: uuidv4(),
    };
  }

  async getBatch(): Promise<HcmBatchResponse> {
    const year = new Date().getFullYear();
    const all = await this.balanceRepo.find({ where: { year } });
    return {
      entries: all.map((b) => ({
        employeeId: b.employeeId,
        locationId: b.locationId,
        leaveType: b.leaveType,
        balance: b.balance,
        year: b.year,
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  async applyAnniversaryBonus(
    employeeId: string,
    locationId: string,
    bonusDays: number,
  ): Promise<HcmBalanceResponse[]> {
    const year = new Date().getFullYear();
    const vacBalance = await this.balanceRepo.findOne({
      where: {
        employeeId,
        locationId,
        leaveType: LeaveType.VACATION,
        year,
      },
    });

    if (vacBalance) {
      vacBalance.balance = Math.round((vacBalance.balance + bonusDays) * 10) / 10;
      await this.balanceRepo.save(vacBalance);
      await this.pushWebhook(employeeId, locationId, LeaveType.VACATION, vacBalance.balance);
    }

    return this.getBalance(employeeId, locationId);
  }

  async applyYearReset(year: number, resetValues: Record<LeaveType, number>): Promise<void> {
    const newYear = year;
    const existing = await this.balanceRepo
      .createQueryBuilder('b')
      .select('DISTINCT b.employeeId, b.locationId')
      .getRawMany();

    const pairs: Array<{ employeeId: string; locationId: string }> = existing.map((r) => ({
      employeeId: r.b_employeeId ?? r.employeeId,
      locationId: r.b_locationId ?? r.locationId,
    }));

    for (const { employeeId, locationId } of pairs) {
      for (const [leaveType, balance] of Object.entries(resetValues)) {
        await this.updateBalance(employeeId, locationId, leaveType as LeaveType, balance);
        await this.pushWebhook(employeeId, locationId, leaveType as LeaveType, balance);
      }
    }
  }

  private async pushWebhook(
    employeeId: string,
    locationId: string,
    leaveType: LeaveType,
    newBalance: number,
  ): Promise<void> {
    const gatewayUrl = this.configService.get<string>('GATEWAY_URL', 'http://localhost:3000');
    const secret = this.configService.get<string>('HCM_WEBHOOK_SECRET', 'test-webhook-secret');

    const payload = JSON.stringify({
      employeeId,
      locationId,
      leaveType,
      newBalance,
      triggeredAt: new Date().toISOString(),
    });
    const signature = computeHmacSignature(payload, secret);

    try {
      await axios.post(
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
    } catch (err) {
      this.logger.warn(
        `Failed to push webhook to gateway for ${employeeId}/${leaveType}: ${(err as Error).message}`,
      );
    }
  }

  async seedDefaultBalance(
    employeeId: string,
    locationId: string,
  ): Promise<void> {
    const year = new Date().getFullYear();
    const defaults: Array<{ leaveType: LeaveType; balance: number }> = [
      { leaveType: LeaveType.VACATION, balance: 15 },
      { leaveType: LeaveType.SICK, balance: 10 },
      { leaveType: LeaveType.PERSONAL, balance: 3 },
    ];

    for (const { leaveType, balance } of defaults) {
      const exists = await this.balanceRepo.findOne({
        where: { employeeId, locationId, leaveType, year },
      });
      if (!exists) {
        await this.balanceRepo.save(
          this.balanceRepo.create({ employeeId, locationId, leaveType, year, balance }),
        );
      }
    }
  }
}
