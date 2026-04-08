import { Role, LeaveType, RequestStatus, HcmSyncStatus } from '../enums';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  locationId: string;
  managerId?: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  locationId: string;
  managerId?: string;
}

export interface HcmBalanceResponse {
  employeeId: string;
  locationId: string;
  leaveType: LeaveType;
  balance: number;
  year: number;
  transactionId?: string;
}

export interface HcmBatchEntry {
  employeeId: string;
  locationId: string;
  leaveType: LeaveType;
  balance: number;
  year: number;
}

export interface HcmBatchResponse {
  entries: HcmBatchEntry[];
  generatedAt: string;
}

export interface WsRequestEvent {
  requestId: string;
  employeeId: string;
  daysCount: number;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  managerId?: string;
}

export interface WsBalanceEvent {
  employeeId: string;
  locationId: string;
  leaveType: LeaveType;
  available: number;
  totalDays: number;
  usedDays: number;
  pendingDays: number;
}

export interface WsSyncEvent {
  syncType: string;
  status: string;
  updatedCount: number;
}

export interface TimeOffRequestData {
  id: string;
  employeeId: string;
  locationId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  daysCount: number;
  status: RequestStatus;
  reason: string;
  managerNote?: string;
  hcmSyncStatus: HcmSyncStatus;
  createdAt: string;
  updatedAt: string;
}
