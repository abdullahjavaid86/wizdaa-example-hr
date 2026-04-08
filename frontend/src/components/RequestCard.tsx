import type { TimeOffRequest } from '../types';
import { RequestStatusBadge } from './RequestStatusBadge';

const LEAVE_LABELS: Record<string, string> = {
  VACATION: 'Vacation',
  SICK: 'Sick Leave',
  PERSONAL: 'Personal',
  MATERNITY: 'Maternity',
  PATERNITY: 'Paternity',
};

interface Props {
  request: TimeOffRequest;
  actions?: React.ReactNode;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function RequestCard({ request, actions }: Props) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium text-gray-900">
            {LEAVE_LABELS[request.leaveType] ?? request.leaveType}
          </p>
          <p className="mt-0.5 text-sm text-gray-500">
            {fmt(request.startDate)} – {fmt(request.endDate)} · {request.daysCount} day
            {request.daysCount !== 1 ? 's' : ''}
          </p>
          {request.reason && (
            <p className="mt-1 text-sm text-gray-600">{request.reason}</p>
          )}
          {request.managerNote && (
            <p className="mt-1 text-sm italic text-gray-500">
              Manager note: {request.managerNote}
            </p>
          )}
        </div>
        <RequestStatusBadge status={request.status} />
      </div>
      {actions && <div className="mt-3 flex gap-2">{actions}</div>}
    </div>
  );
}
