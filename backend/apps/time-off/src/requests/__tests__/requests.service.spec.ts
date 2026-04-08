import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { RequestsService } from '../requests.service';
import { TimeOffRequest } from '../entities/time-off-request.entity';
import { LeaveBalance } from '../../balances/entities/leave-balance.entity';
import { HcmService } from '../../hcm/hcm.service';
import { LeaveType, RequestStatus, Role } from '@app/common';
import type { AuthenticatedUser } from '@app/common';

const mockEmployee: AuthenticatedUser = {
  id: 'emp-uuid-1',
  email: 'alice@example.com',
  role: Role.EMPLOYEE,
  locationId: 'US-NYC',
};

function makeMockRepo(overrides = {}) {
  return {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((data) => data),
    save: jest.fn().mockImplementation((e) => Promise.resolve({ id: 'req-1', ...e })),
    ...overrides,
  };
}

function makeMockDataSource(txResult?: any) {
  return {
    transaction: jest.fn().mockImplementation(async (isolationOrFn: any, fn?: any) => {
      const cb = typeof isolationOrFn === 'function' ? isolationOrFn : fn;
      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: 'bal-1',
          totalDays: 15,
          usedDays: 3,
          pendingDays: 0,
          version: 1,
        }),
        save: jest.fn().mockImplementation((Entity, e) => Promise.resolve({ id: 'saved', ...e })),
        create: jest.fn().mockImplementation((Entity, data) => data),
      };
      return cb(manager);
    }),
  };
}

describe('RequestsService', () => {
  let service: RequestsService;
  let requestRepo: ReturnType<typeof makeMockRepo>;
  let balanceRepo: ReturnType<typeof makeMockRepo>;
  let hcmService: jest.Mocked<HcmService>;
  let dataSource: ReturnType<typeof makeMockDataSource>;

  beforeEach(async () => {
    requestRepo = makeMockRepo({ findOne: jest.fn().mockResolvedValue(null) });
    balanceRepo = makeMockRepo({
      findOne: jest.fn().mockResolvedValue({
        id: 'bal-1',
        totalDays: 15,
        usedDays: 3,
        pendingDays: 0,
      }),
    });
    hcmService = {
      getBalance: jest.fn().mockResolvedValue({
        balance: 12,
        leaveType: LeaveType.VACATION,
        employeeId: mockEmployee.id,
        locationId: mockEmployee.locationId,
        year: 2026,
      }),
      updateBalance: jest.fn().mockResolvedValue(true),
      fetchBatch: jest.fn(),
      getLogs: jest.fn(),
    } as any;
    dataSource = makeMockDataSource();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestsService,
        { provide: getRepositoryToken(TimeOffRequest), useValue: requestRepo },
        { provide: getRepositoryToken(LeaveBalance), useValue: balanceRepo },
        { provide: HcmService, useValue: hcmService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<RequestsService>(RequestsService);
  });

  describe('create', () => {
    const dto = {
      leaveType: LeaveType.VACATION,
      startDate: '2026-06-02',
      endDate: '2026-06-04',
      reason: 'Vacation',
    };

    it('creates a PENDING request with valid inputs', async () => {
      const result = await service.create(mockEmployee, dto);
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('throws ConflictException for duplicate idempotency key', async () => {
      requestRepo.findOne.mockResolvedValueOnce({
        id: 'existing-id',
        status: RequestStatus.PENDING,
        idempotencyKey: 'abc',
      });
      await expect(service.create(mockEmployee, dto)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when dates overlap an existing request', async () => {
      // First findOne (idempotency) → null, second findOne (overlap) → overlapping request
      requestRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'overlap-req',
          status: RequestStatus.PENDING,
          startDate: new Date('2026-06-03'),
          endDate: new Date('2026-06-06'),
        });
      await expect(service.create(mockEmployee, dto)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when balance is insufficient', async () => {
      hcmService.getBalance.mockResolvedValueOnce({
        balance: 1,
        leaveType: LeaveType.VACATION,
        employeeId: mockEmployee.id,
        locationId: 'US-NYC',
        year: 2026,
      });
      balanceRepo.findOne.mockResolvedValueOnce({
        totalDays: 15,
        usedDays: 14,
        pendingDays: 0,
      });
      await expect(service.create(mockEmployee, dto)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for past start date', async () => {
      await expect(
        service.create(mockEmployee, {
          ...dto,
          startDate: '2020-01-01',
          endDate: '2020-01-02',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses local balance when HCM is unavailable', async () => {
      hcmService.getBalance.mockResolvedValueOnce(null);
      const result = await service.create(mockEmployee, dto);
      expect(result).toBeDefined();
    });
  });

  describe('cancel', () => {
    it('throws ForbiddenException when employee tries to cancel another employee request', async () => {
      requestRepo.findOne = jest.fn().mockResolvedValue({
        id: 'req-1',
        employeeId: 'other-emp',
        status: RequestStatus.PENDING,
        startDate: new Date('2026-06-02'),
        daysCount: 3,
        leaveType: LeaveType.VACATION,
        locationId: 'US-NYC',
      });
      await expect(service.cancel('req-1', mockEmployee.id)).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when cancelling non-PENDING request', async () => {
      requestRepo.findOne = jest.fn().mockResolvedValue({
        id: 'req-1',
        employeeId: mockEmployee.id,
        status: RequestStatus.APPROVED,
        startDate: new Date('2026-06-02'),
        daysCount: 3,
        leaveType: LeaveType.VACATION,
        locationId: 'US-NYC',
      });
      await expect(service.cancel('req-1', mockEmployee.id)).rejects.toThrow(ConflictException);
    });
  });

  describe('approve', () => {
    it('rejects when HCM reports insufficient balance', async () => {
      requestRepo.findOne = jest.fn().mockResolvedValue({
        id: 'req-1',
        status: RequestStatus.PENDING,
        employeeId: mockEmployee.id,
        locationId: 'US-NYC',
        leaveType: LeaveType.VACATION,
        startDate: new Date('2026-06-02'),
        daysCount: 5,
      });
      hcmService.getBalance.mockResolvedValueOnce({
        balance: 2,
        leaveType: LeaveType.VACATION,
        employeeId: mockEmployee.id,
        locationId: 'US-NYC',
        year: 2026,
      });
      await expect(service.approve('req-1', 'mgr-1')).rejects.toThrow(BadRequestException);
    });

    it('uses local balance as fallback when HCM is down', async () => {
      requestRepo.findOne = jest.fn().mockResolvedValue({
        id: 'req-1',
        status: RequestStatus.PENDING,
        employeeId: mockEmployee.id,
        locationId: 'US-NYC',
        leaveType: LeaveType.VACATION,
        startDate: new Date('2026-06-02'),
        daysCount: 3,
        hcmSyncStatus: 'PENDING',
      });
      hcmService.getBalance.mockResolvedValueOnce(null);
      const result = await service.approve('req-1', 'mgr-1');
      expect(result).toBeDefined();
    });
  });
});
