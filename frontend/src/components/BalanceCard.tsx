import type { LeaveBalance } from '../types';

const LEAVE_LABELS: Record<string, string> = {
  VACATION: 'Vacation',
  SICK: 'Sick Leave',
  PERSONAL: 'Personal',
  MATERNITY: 'Maternity',
  PATERNITY: 'Paternity',
};

interface Props {
  balance: LeaveBalance;
}

export function BalanceCard({ balance }: Props) {
  const available = balance.totalDays - balance.usedDays - (balance.pendingDays ?? 0);
  const pct = balance.totalDays > 0 ? (balance.usedDays / balance.totalDays) * 100 : 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700">
        {LEAVE_LABELS[balance.leaveType] ?? balance.leaveType}
      </h3>
      <div className="mt-2 flex items-end justify-between">
        <span className="text-3xl font-bold text-blue-700">{available}</span>
        <span className="text-xs text-gray-400">/ {balance.totalDays} days</span>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Used {balance.usedDays}
        {balance.pendingDays > 0 ? ` · Pending ${balance.pendingDays}` : ''}
      </p>
    </div>
  );
}
