import api from './api';
import type { AuthTokens } from '../types';

export const authService = {
  async login(email: string, password: string): Promise<AuthTokens> {
    const { data } = await api.post<AuthTokens>('/auth/login', { email, password });
    return data;
  },

  async register(payload: {
    name: string;
    email: string;
    password: string;
    locationId: string;
    role?: string;
    managerId?: string;
  }): Promise<AuthTokens> {
    const { data } = await api.post<AuthTokens>('/auth/register', payload);
    return data;
  },

  async me() {
    const { data } = await api.get('/auth/me');
    return data;
  },

  logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  },
};
