import { useState, useEffect, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '../context/AuthContext';
import { useSocketContext } from '../context/SocketContext';
import { balanceService } from '../services/balance.service';
import { BalanceCard } from '../components/BalanceCard';
import { PageLoader } from '../components/LoadingSpinner';
import type { LeaveType } from '../types';

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: 'VACATION', label: 'Vacation' },
  { value: 'SICK', label: 'Sick Leave' },
  { value: 'PERSONAL', label: 'Personal' },
  { value: 'MATERNITY', label: 'Maternity' },
  { value: 'PATERNITY', label: 'Paternity' },
];

interface OverdrawnWarning {
  employeeId: string;
  affectedRequests: string[];
}

export function AdminBalancePage() {
  const { user } = useAuthContext();
  const { socket } = useSocketContext();
  const queryClient = useQueryClient();

  // Overdrawn warnings from HCM webhook sync
  const [warnings, setWarnings] = useState<OverdrawnWarning[]>([]);

  useEffect(() => {
    if (!socket) return;

    const handleWarning = (data: OverdrawnWarning) => {
      setWarnings((prev) => {
        // Deduplicate by employeeId — merge affected request IDs
        const existing = prev.find((w) => w.employeeId === data.employeeId);
        if (existing) {
          return prev.map((w) =>
            w.employeeId === data.employeeId
              ? { ...w, affectedRequests: Array.from(new Set([...w.affectedRequests, ...data.affectedRequests])) }
              : w,
          );
        }
        return [...prev, data];
      });
    };

    socket.on('balance.overdrawn-warning', handleWarning);
    return () => { socket.off('balance.overdrawn-warning', handleWarning); };
  }, [socket]);

  // Search state
  const [employeeId, setEmployeeId] = useState('');
  const [searchedId, setSearchedId] = useState('');

  // Form state
  const [locationId, setLocationId] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveType>('VACATION');
  const [totalDays, setTotalDays] = useState('');
  const [usedDays, setUsedDays] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Guard — admin only
  if (user?.role !== 'ADMIN') {
    return <p className="text-sm text-gray-500">Access restricted to admins.</p>;
  }

  // Fetch balances for searched employee
  const {
    data: balances,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin-balances', searchedId],
    queryFn: () => balanceService.getByEmployee(searchedId),
    enabled: !!searchedId,
  });

  const mutation = useMutation({
    mutationFn: () =>
      balanceService.updateManual(searchedId, {
        locationId,
        leaveType,
        totalDays: Number(totalDays),
        usedDays: Number(usedDays),
        year: Number(year),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-balances', searchedId] });
      setSuccessMsg('Balance updated successfully.');
      setFormError('');
    },
    onError: (err: Error) => {
      setFormError(err.message ?? 'Failed to update balance.');
      setSuccessMsg('');
    },
  });

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setSuccessMsg('');
    setFormError('');
    setSearchedId(employeeId.trim());
  };

  const handleUpdate = (e: FormEvent) => {
    e.preventDefault();
    setSuccessMsg('');
    setFormError('');

    if (!locationId.trim()) {
      setFormError('Location ID is required.');
      return;
    }
    if (Number(totalDays) < 0 || Number(usedDays) < 0) {
      setFormError('Days cannot be negative.');
      return;
    }
    if (Number(usedDays) > Number(totalDays)) {
      setFormError('Used days cannot exceed total days.');
      return;
    }

    mutation.mutate();
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Admin — Manage Leave Balances</h1>

      {/* Overdrawn warnings from HCM balance-change webhooks */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w) => (
            <div
              key={w.employeeId}
              className="flex items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              <div>
                <span className="font-semibold">Balance reduction warning</span> — HCM lowered the
                balance for employee <strong>{w.employeeId}</strong>.{' '}
                {w.affectedRequests.length} pending request
                {w.affectedRequests.length === 1 ? '' : 's'} may now be overdrawn:{' '}
                <span className="font-mono text-xs">{w.affectedRequests.join(', ')}</span>
              </div>
              <button
                onClick={() => setWarnings((prev) => prev.filter((x) => x.employeeId !== w.employeeId))}
                className="shrink-0 rounded p-0.5 hover:bg-amber-200"
                aria-label="Dismiss warning"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-800">Look up employee balances</h2>
        <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            placeholder="Employee ID"
            required
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:w-72"
          />
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Search
          </button>
        </form>

        {isLoading && <PageLoader />}

        {isError && searchedId && (
          <p className="mt-3 text-sm text-red-500">
            No balances found for <strong>{searchedId}</strong>.
          </p>
        )}

        {balances && balances.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-gray-500">
              Showing balances for <strong>{searchedId}</strong>
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {balances.map((b) => (
                <BalanceCard key={b.id} balance={b} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Update form — only shown after a search */}
      {searchedId && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-800">
            Update balance for <span className="text-blue-700">{searchedId}</span>
          </h2>

          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Location ID</label>
                <input
                  type="text"
                  required
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Leave Type</label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {LEAVE_TYPES.map((lt) => (
                    <option key={lt.value} value={lt.value}>
                      {lt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Year</label>
                <input
                  type="number"
                  required
                  min={2020}
                  max={2100}
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Total Days</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={totalDays}
                  onChange={(e) => setTotalDays(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Used Days</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={usedDays}
                  onChange={(e) => setUsedDays(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}
            {successMsg && <p className="text-sm text-green-600">{successMsg}</p>}

            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {mutation.isPending ? 'Saving…' : 'Update Balance'}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
