import { useAuthContext } from "../context/AuthContext";
import { useBalances } from "../hooks/useBalances";
import { BalanceCard } from "../components/BalanceCard";
import { PageLoader } from "../components/LoadingSpinner";
import { Link } from "react-router-dom";
import { useRealtimeRequests } from "../hooks/useRealtimeRequests";

export function DashboardPage() {
  const { user } = useAuthContext();
  const { balances, isLoading, isError } = useBalances();
  useRealtimeRequests();

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
            Welcome back, {user?.name ?? user?.email}
          </h1>
          <h3 className="text-sm text-gray-500">Employee ID: <b>{user?.id}</b></h3>
          <p className="mt-1 text-sm text-gray-500">
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <Link
          to="/requests/new"
          className="self-start rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:self-auto"
        >
          + New Request
        </Link>
      </div>

      <h2 className="mb-3 text-lg font-semibold text-gray-800">
        Leave Balances
      </h2>

      {isLoading && <PageLoader />}

      {isError && (
        <p className="text-sm text-red-500">
          Failed to load balances. Please refresh.
        </p>
      )}

      {balances && balances.length === 0 && (
        <p className="text-sm text-gray-500">
          No balances found for your account.
        </p>
      )}

      {balances && balances.length > 0 && (
        <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {balances.map((b) => (
            <BalanceCard key={b.id} balance={b} />
          ))}
        </div>
      )}
    </div>
  );
}
