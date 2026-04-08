import { Link } from 'react-router-dom';
import { useRequests, useCancelRequest } from '../hooks/useRequests';
import { RequestCard } from '../components/RequestCard';
import { PageLoader } from '../components/LoadingSpinner';
import { useRealtimeRequests } from '../hooks/useRealtimeRequests';

export function RequestsPage() {
  const { data: requests, isLoading, isError } = useRequests();
  const cancelMutation = useCancelRequest();
  useRealtimeRequests();

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">My Time-Off Requests</h1>
        <Link
          to="/requests/new"
          className="self-start rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:self-auto"
        >
          + New Request
        </Link>
      </div>

      {isLoading && <PageLoader />}

      {isError && (
        <p className="text-sm text-red-500">Failed to load requests. Please refresh.</p>
      )}

      {requests && requests.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No requests yet.</p>
          <Link to="/requests/new" className="mt-2 text-sm text-blue-600 hover:underline">
            Submit your first request →
          </Link>
        </div>
      )}

      {requests && requests.length > 0 && (
        <ul className="space-y-3">
          {requests.map((req) => (
            <li key={req.id}>
              <RequestCard
                request={req}
                actions={
                  req.status === 'PENDING' ? (
                    <button
                      onClick={() => cancelMutation.mutate(req.id)}
                      disabled={cancelMutation.isPending}
                      className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
