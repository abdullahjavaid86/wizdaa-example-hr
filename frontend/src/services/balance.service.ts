import api from './api';
import type { LeaveBalance } from '../types';
import type { LeaveType } from '../types';

export const balanceService = {
  async getMyBalances(): Promise<LeaveBalance[]> {
    const { data } = await api.get<LeaveBalance[]>('/balances/me');
    return data;
  },

  async getByEmployee(employeeId: string): Promise<LeaveBalance[]> {
    const { data } = await api.get<LeaveBalance[]>(`/balances/${employeeId}`);
    return data;
  },

  async triggerSync(employeeId: string): Promise<{ updated: number; errors: number }> {
    const { data } = await api.post(`/balances/sync/${employeeId}`);
    return data;
  },

  async updateManual(
    employeeId: string,
    payload: {
      locationId: string;
      leaveType: LeaveType;
      totalDays: number;
      usedDays: number;
      year?: number;
    },
  ): Promise<LeaveBalance> {
    const { data } = await api.patch<LeaveBalance>(`/balances/${employeeId}`, payload);
    return data;
  },
};
