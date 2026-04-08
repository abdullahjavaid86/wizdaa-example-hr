import { useState, useCallback } from 'react';
import { useAuthContext } from '../context/AuthContext';

export function useAuth() {
  const ctx = useAuthContext();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setIsSubmitting(true);
      try {
        await ctx.login(email, password);
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ?? err?.message ?? 'Login failed';
        setError(Array.isArray(msg) ? msg.join(', ') : msg);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [ctx],
  );

  return {
    user: ctx.user,
    isAuthenticated: ctx.isAuthenticated,
    isLoading: ctx.isLoading,
    isSubmitting,
    error,
    login: handleLogin,
    logout: ctx.logout,
  };
}
