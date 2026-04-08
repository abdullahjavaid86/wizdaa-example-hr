import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '@app/common';

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'text', select: false })
  passwordHash: string;

  @Column({ type: 'varchar', enum: Role, default: Role.EMPLOYEE })
  role: Role;

  @Column({ type: 'varchar' })
  locationId: string;

  @Column({ type: 'varchar', nullable: true })
  managerId: string;

  @Column({ type: 'date', nullable: true })
  hireDate: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
