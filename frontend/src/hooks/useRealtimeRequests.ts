import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocketContext } from '../context/SocketContext';

export function useRealtimeRequests() {
  const { socket } = useSocketContext();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    const invalidateAll = () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
    };

    socket.on('request.created', invalidateAll);
    socket.on('request.approved', invalidateAll);
    socket.on('request.rejected', invalidateAll);
    socket.on('request.cancelled', invalidateAll);

    return () => {
      socket.off('request.created', invalidateAll);
      socket.off('request.approved', invalidateAll);
      socket.off('request.rejected', invalidateAll);
      socket.off('request.cancelled', invalidateAll);
    };
  }, [socket, queryClient]);
}
