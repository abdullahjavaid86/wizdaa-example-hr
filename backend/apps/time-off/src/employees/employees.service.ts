import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { Role } from '@app/common';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}

  async create(data: {
    name: string;
    email: string;
    password: string;
    role?: Role;
    locationId: string;
    managerId?: string;
    hireDate?: string;
  }): Promise<Omit<Employee, 'passwordHash'>> {
    const existing = await this.employeeRepo.findOne({
      where: { email: data.email },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const employee = this.employeeRepo.create({
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role ?? Role.EMPLOYEE,
      locationId: data.locationId,
      managerId: data.managerId,
      hireDate: data.hireDate ? new Date(data.hireDate) : undefined,
    });

    const saved = await this.employeeRepo.save(employee);
    const { passwordHash: _, ...rest } = saved as Employee & { passwordHash?: string };
    return rest;
  }

  async findByEmail(email: string): Promise<Employee | null> {
    return this.employeeRepo
      .createQueryBuilder('e')
      .addSelect('e.passwordHash')
      .where('e.email = :email', { email })
      .getOne();
  }

  async findById(id: string): Promise<Omit<Employee, 'passwordHash'>> {
    const employee = await this.employeeRepo.findOne({ where: { id } });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    return employee;
  }

  async findAll(): Promise<Employee[]> {
    return this.employeeRepo.find({ order: { name: 'ASC' } });
  }
}
