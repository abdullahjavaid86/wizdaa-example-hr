export type Role = 'EMPLOYEE' | 'MANAGER' | 'ADMIN';

export type LeaveType = 'VACATION' | 'SICK' | 'PERSONAL' | 'MATERNITY' | 'PATERNITY';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type HcmSyncStatus = 'PENDING' | 'SYNCED' | 'FAILED';

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: Role;
  locationId: string;
  managerId?: string;
  hireDate?: string;
  createdAt: string;
}

export interface LeaveBalance {
  id: string;
  employeeId: string;
  locationId: string;
  leaveType: LeaveType;
  year: number;
  totalDays: number;
  usedDays: number;
  pendingDays: number;
  version: number;
  lastHcmSync?: string;
}

export interface TimeOffRequest {
  id: string;
  employeeId: string;
  locationId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  daysCount: number;
  status: RequestStatus;
  managerId?: string;
  reason?: string;
  managerNote?: string;
  hcmSyncStatus: HcmSyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  employee: Omit<Employee, 'passwordHash'>;
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

export interface WsRequestEvent {
  requestId: string;
  employeeId: string;
  daysCount: number;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  managerId?: string;
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  timestamp?: string;
  path?: string;
}
