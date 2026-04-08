import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { EmployeesService } from '../employees.service';
import { Employee } from '../entities/employee.entity';
import { Role } from '@app/common';

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}));

describe('EmployeesService', () => {
  let service: EmployeesService;
  let employeeRepo: any;

  const createData = {
    name: 'Alice',
    email: 'alice@example.com',
    password: 'password123',
    locationId: 'US-NYC',
  };

  beforeEach(async () => {
    employeeRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((d) => d),
      save: jest
        .fn()
        .mockImplementation((e) =>
          Promise.resolve({ id: 'emp-uuid-1', ...e, passwordHash: 'hashed-password' }),
        ),
      createQueryBuilder: jest.fn().mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: getRepositoryToken(Employee), useValue: employeeRepo },
      ],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
  });

  describe('create', () => {
    it('creates an employee and omits passwordHash from response', async () => {
      const result = await service.create(createData) as any;
      expect(result.email).toBe(createData.email);
      expect(result.passwordHash).toBeUndefined();
    });

    it('throws ConflictException for duplicate email', async () => {
      employeeRepo.findOne.mockResolvedValueOnce({ id: 'existing', email: createData.email });
      await expect(service.create(createData)).rejects.toThrow(ConflictException);
    });

    it('assigns EMPLOYEE role by default', async () => {
      await service.create(createData);
      expect(employeeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: Role.EMPLOYEE }),
      );
    });

    it('can assign MANAGER role', async () => {
      await service.create({ ...createData, role: Role.MANAGER });
      expect(employeeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: Role.MANAGER }),
      );
    });
  });

  describe('findByEmail', () => {
    it('returns null when employee not found', async () => {
      employeeRepo.createQueryBuilder.mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });
      const result = await service.findByEmail('notfound@example.com');
      expect(result).toBeNull();
    });
  });
});
