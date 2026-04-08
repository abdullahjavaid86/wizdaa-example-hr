import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BalancesService } from '../balances.service';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { HcmSyncLog } from '../../sync/entities/hcm-sync-log.entity';
import { TimeOffRequest } from '../../requests/entities/time-off-request.entity';
import { HcmService } from '../../hcm/hcm.service';
import { LeaveType } from '@app/common';

describe('BalancesService', () => {
  let service: BalancesService;
  let balanceRepo: any;
  let syncLogRepo: any;
  let requestRepo: any;
  let dataSource: any;

  beforeEach(async () => {
    balanceRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockImplementation((e) => Promise.resolve({ id: 'bal-1', ...e })),
    };
    syncLogRepo = {
      save: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((d) => d),
    };
    requestRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    dataSource = {
      transaction: jest.fn().mockImplementation(async (fn: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(null),
          save: jest.fn().mockImplementation((Entity, e) => Promise.resolve({ id: 'saved', ...e })),
          create: jest.fn().mockImplementation((Entity, data) => data),
          find: jest.fn().mockResolvedValue([]),
        };
        return fn(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalancesService,
        { provide: getRepositoryToken(LeaveBalance), useValue: balanceRepo },
        { provide: getRepositoryToken(HcmSyncLog), useValue: syncLogRepo },
        { provide: getRepositoryToken(TimeOffRequest), useValue: requestRepo },
        { provide: HcmService, useValue: { getBalance: jest.fn(), updateBalance: jest.fn() } },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<BalancesService>(BalancesService);
  });

  describe('syncFromHcmWebhook', () => {
    it('creates a new balance record when none exists', async () => {
      const result = await service.syncFromHcmWebhook({
        employeeId: 'emp-1',
        locationId: 'US-NYC',
        leaveType: LeaveType.VACATION,
        newBalance: 12,
      });
      expect(result.balance).toBeDefined();
      expect(result.affectedRequests).toEqual([]);
    });

    it('updates totalDays when balance already exists', async () => {
      dataSource.transaction.mockImplementationOnce(async (fn: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            id: 'bal-1',
            totalDays: 15,
            usedDays: 3,
            pendingDays: 2,
            version: 1,
          }),
          save: jest.fn().mockImplementation((Entity, e) => Promise.resolve(e)),
          create: jest.fn().mockImplementation((Entity, d) => d),
          find: jest.fn().mockResolvedValue([]),
        };
        return fn(manager);
      });
      const result = await service.syncFromHcmWebhook({
        employeeId: 'emp-1',
        locationId: 'US-NYC',
        leaveType: LeaveType.VACATION,
        newBalance: 18,
      });
      expect(result.balance.totalDays).toBe(18);
    });

    it('detects overdrawn pending requests after balance decrease', async () => {
      dataSource.transaction.mockImplementationOnce(async (fn: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            id: 'bal-1',
            totalDays: 15,
            usedDays: 10,
            pendingDays: 0,
          }),
          save: jest.fn().mockImplementation((Entity, e) => Promise.resolve(e)),
          create: jest.fn().mockImplementation((Entity, d) => d),
          find: jest.fn().mockResolvedValue([
            { id: 'req-1', daysCount: 5 },
          ]),
        };
        return fn(manager);
      });
      const result = await service.syncFromHcmWebhook({
        employeeId: 'emp-1',
        locationId: 'US-NYC',
        leaveType: LeaveType.VACATION,
        newBalance: 4,
      });
      expect(result.affectedRequests).toContain('req-1');
    });
  });

  describe('processBatchSync', () => {
    it('returns updated count equal to entries processed', async () => {
      dataSource.transaction.mockImplementation(async (fn: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(null),
          save: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockImplementation((Entity, d) => d),
        };
        return fn(manager);
      });
      const result = await service.processBatchSync([
        { employeeId: 'emp-1', locationId: 'US-NYC', leaveType: LeaveType.VACATION, balance: 10, year: 2026 },
        { employeeId: 'emp-2', locationId: 'US-NYC', leaveType: LeaveType.SICK, balance: 5, year: 2026 },
      ]);
      expect(result.updated).toBe(2);
      expect(result.errors).toBe(0);
    });

    it('counts errors for failed entries', async () => {
      dataSource.transaction.mockImplementationOnce(() => Promise.reject(new Error('DB error')));
      const result = await service.processBatchSync([
        { employeeId: 'emp-1', locationId: 'US-NYC', leaveType: LeaveType.VACATION, balance: 10, year: 2026 },
      ]);
      expect(result.errors).toBe(1);
    });
  });

  describe('updateManual', () => {
    it('creates a new balance when none exists', async () => {
      const result = await service.updateManual({
        employeeId: 'emp-1',
        locationId: 'US-NYC',
        leaveType: LeaveType.VACATION,
        totalDays: 20,
        usedDays: 5,
      });
      expect(result).toBeDefined();
      expect(result.totalDays).toBe(20);
      expect(result.usedDays).toBe(5);
    });

    it('updates existing balance in-place', async () => {
      dataSource.transaction.mockImplementationOnce(async (fn: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({
            id: 'bal-1',
            totalDays: 15,
            usedDays: 3,
            pendingDays: 0,
            lastHcmSync: null,
          }),
          save: jest.fn().mockImplementation((Entity, e) => Promise.resolve(e)),
          create: jest.fn().mockImplementation((Entity, d) => d),
        };
        return fn(manager);
      });
      const result = await service.updateManual({
        employeeId: 'emp-1',
        locationId: 'US-NYC',
        leaveType: LeaveType.VACATION,
        totalDays: 25,
        usedDays: 8,
      });
      expect(result.totalDays).toBe(25);
      expect(result.usedDays).toBe(8);
    });

    it('uses provided year when specified', async () => {
      await service.updateManual({
        employeeId: 'emp-1',
        locationId: 'US-NYC',
        leaveType: LeaveType.SICK,
        totalDays: 10,
        usedDays: 2,
        year: 2025,
      });
      // transaction was called → service reached the DB layer
      expect(dataSource.transaction).toHaveBeenCalled();
    });
  });
});
