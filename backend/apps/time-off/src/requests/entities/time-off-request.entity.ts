import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';
import { LeaveType, RequestStatus, HcmSyncStatus } from '@app/common';

@Entity('time_off_requests')
export class TimeOffRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  @Index()
  idempotencyKey: string;

  @Column({ type: 'varchar' })
  @Index()
  employeeId: string;

  @Column({ type: 'varchar' })
  locationId: string;

  @Column({ type: 'varchar', enum: LeaveType })
  leaveType: LeaveType;

  @Column({ type: 'date' })
  startDate: Date;

  @Column({ type: 'date' })
  endDate: Date;

  @Column({ type: 'real' })
  daysCount: number;

  @Column({ type: 'varchar', enum: RequestStatus, default: RequestStatus.PENDING })
  @Index()
  status: RequestStatus;

  @Column({ type: 'varchar', nullable: true })
  managerId: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'text', nullable: true })
  managerNote: string;

  @Column({
    type: 'varchar',
    enum: HcmSyncStatus,
    default: HcmSyncStatus.PENDING,
  })
  hcmSyncStatus: HcmSyncStatus;

  @Column({ type: 'varchar', nullable: true })
  hcmTransactionId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
