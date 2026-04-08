import api from './api';
import type { TimeOffRequest } from '../types';

export const requestsService = {
  async list(): Promise<TimeOffRequest[]> {
    const { data } = await api.get<TimeOffRequest[]>('/requests');
    return data;
  },

  async pending(): Promise<TimeOffRequest[]> {
    const { data } = await api.get<TimeOffRequest[]>('/requests/pending');
    return data;
  },

  async getById(id: string): Promise<TimeOffRequest> {
    const { data } = await api.get<TimeOffRequest>(`/requests/${id}`);
    return data;
  },

  async create(payload: {
    leaveType: string;
    startDate: string;
    endDate: string;
    reason?: string;
  }): Promise<TimeOffRequest> {
    const { data } = await api.post<TimeOffRequest>('/requests', payload);
    return data;
  },

  async approve(id: string, managerNote?: string): Promise<TimeOffRequest> {
    const { data } = await api.patch<TimeOffRequest>(`/requests/${id}/approve`, { managerNote });
    return data;
  },

  async reject(id: string, managerNote?: string): Promise<TimeOffRequest> {
    const { data } = await api.patch<TimeOffRequest>(`/requests/${id}/reject`, { managerNote });
    return data;
  },

  async cancel(id: string): Promise<TimeOffRequest> {
    const { data } = await api.patch<TimeOffRequest>(`/requests/${id}/cancel`);
    return data;
  },
};
