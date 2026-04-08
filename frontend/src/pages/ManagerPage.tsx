import { useState } from 'react';
import { usePendingRequests, useApproveRequest, useRejectRequest } from '../hooks/useRequests';
import { RequestCard } from '../components/RequestCard';
import { PageLoader } from '../components/LoadingSpinner';
import { useRealtimeRequests } from '../hooks/useRealtimeRequests';
import { useAuthContext } from '../context/AuthContext';

export function ManagerPage() {
  const { user } = useAuthContext();
  const { data: requests, isLoading, isError } = usePendingRequests();
  const approveMutation = useApproveRequest();
  const rejectMutation = useRejectRequest();
  useRealtimeRequests();

  const [noteMap, setNoteMap] = useState<Record<string, string>>({});

  if (user?.role === 'EMPLOYEE') {
    return (
      <p className="text-sm text-gray-500">You do not have access to this page.</p>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-gray-900 sm:text-2xl">Team Requests</h1>

      {isLoading && <PageLoader />}

      {isError && (
        <p className="text-sm text-red-500">Failed to load requests. Please refresh.</p>
      )}

      {requests && requests.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No pending requests from your team.</p>
        </div>
      )}

      {requests && requests.length > 0 && (
        <ul className="space-y-4">
          {requests.map((req) => (
            <li key={req.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <RequestCard request={req} />
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  placeholder="Manager note (optional)"
                  value={noteMap[req.id] ?? ''}
                  onChange={(e) =>
                    setNoteMap((prev) => ({ ...prev, [req.id]: e.target.value }))
                  }
                  className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() =>
                      approveMutation.mutate({ id: req.id, note: noteMap[req.id] })
                    }
                    disabled={approveMutation.isPending}
                    className="w-full rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 sm:w-auto sm:py-1.5"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() =>
                      rejectMutation.mutate({ id: req.id, note: noteMap[req.id] })
                    }
                    disabled={rejectMutation.isPending}
                    className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 sm:w-auto sm:py-1.5"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
