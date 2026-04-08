import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HcmService } from '../hcm.service';
import { HcmSyncLog } from '../../sync/entities/hcm-sync-log.entity';
import { LeaveType } from '@app/common';

describe('HcmService', () => {
  let service: HcmService;
  let syncLogRepo: any;
  let mockAxiosInstance: any;

  beforeEach(async () => {
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
    };

    syncLogRepo = {
      save: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((d) => d),
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HcmService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('http://localhost:3002') } },
        { provide: getRepositoryToken(HcmSyncLog), useValue: syncLogRepo },
      ],
    }).compile();

    service = module.get<HcmService>(HcmService);
    // Inject mock axios instance
    (service as any).client = mockAxiosInstance;
  });

  describe('getBalance', () => {
    it('returns balance on successful HCM response', async () => {
      const balanceData = {
        employeeId: 'emp-1',
        locationId: 'US-NYC',
        leaveType: LeaveType.VACATION,
        balance: 12,
        year: 2026,
      };
      mockAxiosInstance.get.mockResolvedValueOnce({ data: balanceData });
      const result = await service.getBalance('emp-1', 'US-NYC', LeaveType.VACATION);
      expect(result).toEqual(balanceData);
      expect(syncLogRepo.save).toHaveBeenCalled();
    });

    it('returns null and logs failure on HCM timeout', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('timeout'));
      const result = await service.getBalance('emp-1', 'US-NYC', LeaveType.VACATION);
      expect(result).toBeNull();
      expect(syncLogRepo.save).toHaveBeenCalled();
    });

    it('returns null on 500 error from HCM', async () => {
      const err: any = new Error('Internal Server Error');
      err.response = { status: 500 };
      mockAxiosInstance.get.mockRejectedValueOnce(err);
      const result = await service.getBalance('emp-1', 'US-NYC', LeaveType.VACATION);
      expect(result).toBeNull();
    });
  });

  describe('updateBalance', () => {
    it('returns true on successful update', async () => {
      mockAxiosInstance.put.mockResolvedValueOnce({ data: {} });
      const result = await service.updateBalance('emp-1', 'US-NYC', LeaveType.VACATION, 10);
      expect(result).toBe(true);
    });

    it('returns false and logs error when update fails', async () => {
      mockAxiosInstance.put.mockRejectedValueOnce(new Error('network error'));
      const result = await service.updateBalance('emp-1', 'US-NYC', LeaveType.VACATION, 10);
      expect(result).toBe(false);
    });
  });

  describe('fetchBatch', () => {
    it('returns batch response on success', async () => {
      const batchData = { entries: [], generatedAt: new Date().toISOString() };
      mockAxiosInstance.post.mockResolvedValueOnce({ data: batchData });
      const result = await service.fetchBatch();
      expect(result).toEqual(batchData);
    });

    it('returns null on failure', async () => {
      mockAxiosInstance.post.mockRejectedValueOnce(new Error('HCM down'));
      const result = await service.fetchBatch();
      expect(result).toBeNull();
    });
  });
});
