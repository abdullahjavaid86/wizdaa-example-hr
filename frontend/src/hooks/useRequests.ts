import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { requestsService } from '../services/requests.service';
import type { TimeOffRequest } from '../types';

export function useRequests() {
  return useQuery<TimeOffRequest[]>({
    queryKey: ['requests'],
    queryFn: requestsService.list,
  });
}

export function usePendingRequests() {
  return useQuery<TimeOffRequest[]>({
    queryKey: ['requests', 'pending'],
    queryFn: requestsService.pending,
  });
}

export function useCreateRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: requestsService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
    },
  });
}

export function useApproveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      requestsService.approve(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}

export function useRejectRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      requestsService.reject(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}

export function useCancelRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => requestsService.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
    },
  });
}
