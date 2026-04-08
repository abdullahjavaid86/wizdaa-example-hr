import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { LeaveType } from '@app/common';

@Entity('hcm_balances')
@Unique(['employeeId', 'locationId', 'leaveType', 'year'])
export class HcmBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  employeeId: string;

  @Column({ type: 'varchar' })
  locationId: string;

  @Column({ type: 'varchar', enum: LeaveType })
  leaveType: LeaveType;

  @Column({ type: 'integer' })
  year: number;

  @Column({ type: 'real', default: 0 })
  balance: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
