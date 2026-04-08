import { useQuery, useQueryClient } from '@tanstack/react-query';
import { balanceService } from '../services/balance.service';
import type { LeaveBalance, WsBalanceEvent } from '../types';
import { useEffect } from 'react';
import { useSocketContext } from '../context/SocketContext';

export function useBalances() {
  const queryClient = useQueryClient();
  const { socket } = useSocketContext();

  const query = useQuery<LeaveBalance[]>({
    queryKey: ['balances'],
    queryFn: balanceService.getMyBalances,
  });

  useEffect(() => {
    if (!socket) return;

    const handleBalanceUpdate = (event: WsBalanceEvent) => {
      queryClient.setQueryData<LeaveBalance[]>(['balances'], (old) => {
        if (!old) return old;
        return old.map((b) => {
          if (
            b.employeeId === event.employeeId &&
            b.locationId === event.locationId &&
            b.leaveType === event.leaveType
          ) {
            return {
              ...b,
              totalDays: event.totalDays,
              usedDays: event.usedDays,
              pendingDays: event.pendingDays,
            };
          }
          return b;
        });
      });
    };

    socket.on('balance.updated', handleBalanceUpdate);
    return () => {
      socket.off('balance.updated', handleBalanceUpdate);
    };
  }, [socket, queryClient]);

  const availableFor = (leaveType: string): number => {
    const balance = query.data?.find((b) => b.leaveType === leaveType);
    if (!balance) return 0;
    return Math.max(0, balance.totalDays - balance.usedDays - balance.pendingDays);
  };

  return {
    balances: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    availableFor,
  };
}
