import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  Unique,
} from 'typeorm';
import { LeaveType } from '@app/common';

@Entity('leave_balances')
@Unique(['employeeId', 'locationId', 'leaveType', 'year'])
export class LeaveBalance {
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
  totalDays: number;

  @Column({ type: 'real', default: 0 })
  usedDays: number;

  @Column({ type: 'real', default: 0 })
  pendingDays: number;

  @VersionColumn()
  version: number;

  @Column({ type: 'datetime', nullable: true })
  lastHcmSync: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
