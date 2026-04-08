import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { SyncType, SyncLogStatus } from '@app/common';

@Entity('hcm_sync_logs')
export class HcmSyncLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', enum: SyncType })
  syncType: SyncType;

  @Column({ type: 'varchar', nullable: true })
  employeeId: string;

  @Column({ type: 'varchar', nullable: true })
  locationId: string;

  @Column({ type: 'varchar', enum: SyncLogStatus })
  status: SyncLogStatus;

  @Column({ type: 'text', nullable: true })
  payload: string;

  @Column({ type: 'text', nullable: true })
  response: string;

  @Column({ type: 'text', nullable: true })
  error: string;

  @Column({ type: 'integer', nullable: true })
  durationMs: number;

  @CreateDateColumn()
  createdAt: Date;
}
