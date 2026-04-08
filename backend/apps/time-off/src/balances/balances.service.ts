import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveBalance } from './entities/leave-balance.entity';
import { HcmService } from '../hcm/hcm.service';
import { HcmBatchEntry, LeaveType, SyncType, SyncLogStatus } from '@app/common';
import { HcmSyncLog } from '../sync/entities/hcm-sync-log.entity';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TimeOffRequest } from '../requests/entities/time-off-request.entity';
import { RequestStatus } from '@app/common';
import { Logger } from '@nestjs/common';

@Injectable()
export class BalancesService {
  private readonly logger = new Logger(BalancesService.name);

  constructor(
    @InjectRepository(LeaveBalance)
    private readonly balanceRepo: Repository<LeaveBalance>,
    @InjectRepository(HcmSyncLog)
    private readonly syncLogRepo: Repository<HcmSyncLog>,
    @InjectRepository(TimeOffRequest)
    private readonly requestRepo: Repository<TimeOffRequest>,
    private readonly hcmService: HcmService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * HCM is the source of truth for leave balances.
   * We always try to pull fresh data from HCM and refresh the local cache.
   * If HCM is unreachable we fall back to the local cache transparently.
   *
   * Local cache stores:
   *   totalDays  = hcm.balance + usedDays  (reconstructed allocation)
   *   usedDays   = days deducted on approval (tracked by us)
   *   pendingDays = in-flight requests not yet approved (tracked by us)
   */
  async findByEmployee(
    employeeId: string,
    locationId: string,
  ): Promise<LeaveBalance[]> {
    const year = new Date().getFullYear();

    const hcmBalances = await this.hcmService.getAllBalances(employeeId, locationId);

    if (hcmBalances && hcmBalances.length > 0) {
      await this.dataSource.transaction(async (manager) => {
        for (const hcm of hcmBalances) {
          let local = await manager.findOne(LeaveBalance, {
            where: { employeeId, locationId, leaveType: hcm.leaveType, year },
          });

          if (local) {
            // Reconstruct the allocation: HCM holds "remaining available after approvals",
            // so total = remaining + what we already marked as used.
            local.totalDays = Math.round((hcm.balance + local.usedDays) * 10) / 10;
            local.lastHcmSync = new Date();
          } else {
            // No local record yet — initialise from HCM; zero used/pending since we have no history
            local = manager.create(LeaveBalance, {
              employeeId,
              locationId,
              leaveType: hcm.leaveType,
              year,
              totalDays: hcm.balance,
              usedDays: 0,
              pendingDays: 0,
              lastHcmSync: new Date(),
            });
          }

          await manager.save(LeaveBalance, local);
        }
      });
    } else {
      this.logger.warn(
        `HCM unavailable for ${employeeId}/${locationId} — serving leave balances from local cache`,
      );
    }

    return this.balanceRepo.find({ where: { employeeId, locationId, year } });
  }

  async syncFromHcmWebhook(data: {
    employeeId: string;
    locationId: string;
    leaveType: LeaveType;
    newBalance: number;
  }): Promise<{ balance: LeaveBalance; affectedRequests: string[] }> {
    const year = new Date().getFullYear();

    return this.dataSource.transaction(async (manager) => {
      let balance = await manager.findOne(LeaveBalance, {
        where: {
          employeeId: data.employeeId,
          locationId: data.locationId,
          leaveType: data.leaveType,
          year,
        },
      });

      if (!balance) {
        balance = manager.create(LeaveBalance, {
          employeeId: data.employeeId,
          locationId: data.locationId,
          leaveType: data.leaveType,
          year,
          totalDays: data.newBalance,
          usedDays: 0,
          pendingDays: 0,
        });
      } else {
        balance.totalDays = data.newBalance;
        balance.lastHcmSync = new Date();
      }

      const saved = await manager.save(LeaveBalance, balance);

      const pendingRequests = await manager.find(TimeOffRequest, {
        where: {
          employeeId: data.employeeId,
          locationId: data.locationId,
          leaveType: data.leaveType,
          status: RequestStatus.PENDING,
        },
      });

      const available = saved.totalDays - saved.usedDays;
      const overdrawnIds: string[] = [];

      for (const req of pendingRequests) {
        if (req.daysCount > available) {
          overdrawnIds.push(req.id);
          this.logger.warn(
            `Pending request ${req.id} may be overdrawn after HCM balance update`,
          );
        }
      }

      await this.syncLogRepo.save(
        this.syncLogRepo.create({
          syncType: SyncType.WEBHOOK,
          employeeId: data.employeeId,
          locationId: data.locationId,
          status: SyncLogStatus.SUCCESS,
          payload: JSON.stringify(data),
          response: JSON.stringify({ newTotalDays: data.newBalance, overdrawnCount: overdrawnIds.length }),
        }),
      );

      return { balance: saved, affectedRequests: overdrawnIds };
    });
  }

  async processBatchSync(
    entries: HcmBatchEntry[],
  ): Promise<{ updated: number; errors: number }> {
    let updated = 0;
    let errors = 0;

    const start = Date.now();

    for (const entry of entries) {
      try {
        await this.dataSource.transaction(async (manager) => {
          let balance = await manager.findOne(LeaveBalance, {
            where: {
              employeeId: entry.employeeId,
              locationId: entry.locationId,
              leaveType: entry.leaveType,
              year: entry.year,
            },
          });

          if (!balance) {
            balance = manager.create(LeaveBalance, {
              employeeId: entry.employeeId,
              locationId: entry.locationId,
              leaveType: entry.leaveType,
              year: entry.year,
              totalDays: entry.balance,
              usedDays: 0,
              pendingDays: 0,
            });
          } else {
            const diff = entry.balance - balance.totalDays;
            balance.totalDays = entry.balance;
            balance.lastHcmSync = new Date();
            if (diff !== 0) {
              this.logger.log(
                `Balance drift detected for ${entry.employeeId}: diff=${diff}`,
              );
            }
          }
          await manager.save(LeaveBalance, balance);
        });
        updated++;
      } catch (err) {
        errors++;
        this.logger.error(`Batch sync error for ${entry.employeeId}: ${(err as Error).message}`);
      }
    }

    await this.syncLogRepo.save(
      this.syncLogRepo.create({
        syncType: SyncType.BATCH,
        status: errors === 0 ? SyncLogStatus.SUCCESS : SyncLogStatus.PARTIAL,
        payload: JSON.stringify({ totalEntries: entries.length }),
        response: JSON.stringify({ updated, errors }),
        durationMs: Date.now() - start,
      }),
    );

    return { updated, errors };
  }

  async updateManual(data: {
    employeeId: string;
    locationId: string;
    leaveType: LeaveType;
    totalDays: number;
    usedDays: number;
    year?: number;
  }): Promise<LeaveBalance> {
    const year = data.year ?? new Date().getFullYear();

    return this.dataSource.transaction(async (manager) => {
      let balance = await manager.findOne(LeaveBalance, {
        where: {
          employeeId: data.employeeId,
          locationId: data.locationId,
          leaveType: data.leaveType,
          year,
        },
      });

      if (balance) {
        balance.totalDays = data.totalDays;
        balance.usedDays = data.usedDays;
        balance.lastHcmSync = new Date();
      } else {
        balance = manager.create(LeaveBalance, {
          employeeId: data.employeeId,
          locationId: data.locationId,
          leaveType: data.leaveType,
          year,
          totalDays: data.totalDays,
          usedDays: data.usedDays,
          pendingDays: 0,
        });
      }

      const saved = await manager.save(LeaveBalance, balance);

      await this.syncLogRepo.save(
        this.syncLogRepo.create({
          syncType: SyncType.REALTIME,
          employeeId: data.employeeId,
          locationId: data.locationId,
          status: SyncLogStatus.SUCCESS,
          payload: JSON.stringify(data),
          response: JSON.stringify({ totalDays: saved.totalDays, usedDays: saved.usedDays }),
        }),
      );

      return saved;
    });
  }
}
