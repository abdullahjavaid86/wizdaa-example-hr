import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import { HcmSyncLog } from '../sync/entities/hcm-sync-log.entity';
import {
  HcmBalanceResponse,
  HcmBatchResponse,
  LeaveType,
  SyncType,
  SyncLogStatus,
} from '@app/common';

@Injectable()
export class HcmService {
  private readonly logger = new Logger(HcmService.name);
  private readonly client: AxiosInstance;
  private readonly hcmBaseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(HcmSyncLog)
    private readonly syncLogRepo: Repository<HcmSyncLog>,
  ) {
    this.hcmBaseUrl = this.configService.get<string>(
      'HCM_BASE_URL',
      'http://localhost:3002',
    );
    this.client = axios.create({
      baseURL: this.hcmBaseUrl,
      timeout: 5000,
      headers: {
        'x-api-key': this.configService.get<string>('HCM_API_KEY', ''),
      },
    });
  }

  async getBalance(
    employeeId: string,
    locationId: string,
    leaveType: LeaveType,
  ): Promise<HcmBalanceResponse | null> {
    const start = Date.now();
    try {
      const res = await this.client.get<HcmBalanceResponse>(
        `/hcm/balance/${employeeId}/${locationId}/${leaveType}`,
      );
      await this.logSync({
        syncType: SyncType.REALTIME,
        employeeId,
        locationId,
        status: SyncLogStatus.SUCCESS,
        payload: JSON.stringify({ employeeId, locationId, leaveType }),
        response: JSON.stringify(res.data),
        durationMs: Date.now() - start,
      });
      return res.data;
    } catch (err) {
      const error = err as Error;
      this.logger.warn(
        `HCM real-time check failed for ${employeeId}/${locationId}/${leaveType}: ${error.message}`,
      );
      await this.logSync({
        syncType: SyncType.REALTIME,
        employeeId,
        locationId,
        status: SyncLogStatus.FAILED,
        payload: JSON.stringify({ employeeId, locationId, leaveType }),
        error: error.message,
        durationMs: Date.now() - start,
      });
      return null;
    }
  }

  /**
   * Fetch all leave-type balances for an employee from HCM in one call.
   * Returns null when HCM is unreachable (caller should fall back to local cache).
   */
  async getAllBalances(
    employeeId: string,
    locationId: string,
  ): Promise<HcmBalanceResponse[] | null> {
    const start = Date.now();
    try {
      const res = await this.client.get<HcmBalanceResponse[]>(
        `/hcm/balance/${employeeId}/${locationId}`,
      );
      await this.logSync({
        syncType: SyncType.REALTIME,
        employeeId,
        locationId,
        status: SyncLogStatus.SUCCESS,
        payload: JSON.stringify({ employeeId, locationId }),
        response: JSON.stringify({ count: res.data.length }),
        durationMs: Date.now() - start,
      });
      return res.data;
    } catch (err) {
      const error = err as Error;
      this.logger.warn(
        `HCM getAllBalances failed for ${employeeId}/${locationId}: ${error.message}`,
      );
      await this.logSync({
        syncType: SyncType.REALTIME,
        employeeId,
        locationId,
        status: SyncLogStatus.FAILED,
        payload: JSON.stringify({ employeeId, locationId }),
        error: error.message,
        durationMs: Date.now() - start,
      });
      return null;
    }
  }

  async updateBalance(
    employeeId: string,
    locationId: string,
    leaveType: LeaveType,
    newBalance: number,
  ): Promise<boolean> {
    const start = Date.now();
    try {
      await this.client.put(`/hcm/balance/${employeeId}/${locationId}`, {
        leaveType,
        balance: newBalance,
      });
      await this.logSync({
        syncType: SyncType.REALTIME,
        employeeId,
        locationId,
        status: SyncLogStatus.SUCCESS,
        payload: JSON.stringify({ employeeId, locationId, leaveType, newBalance }),
        durationMs: Date.now() - start,
      });
      return true;
    } catch (err) {
      const error = err as Error;
      this.logger.error(
        `HCM balance update failed for ${employeeId}: ${error.message}`,
      );
      await this.logSync({
        syncType: SyncType.REALTIME,
        employeeId,
        locationId,
        status: SyncLogStatus.FAILED,
        error: error.message,
        durationMs: Date.now() - start,
      });
      return false;
    }
  }

  async fetchBatch(): Promise<HcmBatchResponse | null> {
    const start = Date.now();
    try {
      const res = await this.client.post<HcmBatchResponse>('/hcm/batch');
      await this.logSync({
        syncType: SyncType.BATCH,
        status: SyncLogStatus.SUCCESS,
        response: JSON.stringify({ count: res.data.entries.length }),
        durationMs: Date.now() - start,
      });
      return res.data;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`HCM batch fetch failed: ${error.message}`);
      await this.logSync({
        syncType: SyncType.BATCH,
        status: SyncLogStatus.FAILED,
        error: error.message,
        durationMs: Date.now() - start,
      });
      return null;
    }
  }

  async getLogs(): Promise<HcmSyncLog[]> {
    return this.syncLogRepo.find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  private async logSync(data: {
    syncType: SyncType;
    employeeId?: string;
    locationId?: string;
    status: SyncLogStatus;
    payload?: string;
    response?: string;
    error?: string;
    durationMs?: number;
  }): Promise<void> {
    try {
      await this.syncLogRepo.save(this.syncLogRepo.create(data));
    } catch (logErr) {
      this.logger.warn('Failed to write sync log', logErr);
    }
  }
}
