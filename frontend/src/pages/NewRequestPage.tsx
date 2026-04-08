import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateRequest } from "../hooks/useRequests";
import { useBalances } from "../hooks/useBalances";
import type { LeaveType } from "../types";
import { AxiosError } from "axios";

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: "VACATION", label: "Vacation" },
  { value: "SICK", label: "Sick Leave" },
  { value: "PERSONAL", label: "Personal" },
  { value: "MATERNITY", label: "Maternity" },
  { value: "PATERNITY", label: "Paternity" },
];

function countWeekdays(start: string, end: string): number {
  if (!start || !end) return 0;
  let count = 0;
  const current = new Date(start);
  const last = new Date(end);
  while (current <= last) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export function NewRequestPage() {
  const navigate = useNavigate();
  const createMutation = useCreateRequest();
  const { balances } = useBalances();

  const [leaveType, setLeaveType] = useState<LeaveType>("VACATION");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const days = countWeekdays(startDate, endDate);
  const minDate = new Date(Date.now() + 86_400_000).toISOString().split("T")[0];

  const selectedBalance = balances?.find((b) => b.leaveType === leaveType);
  const available = selectedBalance
    ? selectedBalance.totalDays -
      selectedBalance.usedDays -
      (selectedBalance.pendingDays ?? 0)
    : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!startDate || !endDate) {
      setError("Please select start and end dates.");
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError("End date must be on or after start date.");
      return;
    }

    try {
      await createMutation.mutateAsync({
        leaveType,
        startDate,
        endDate,
        reason: reason || undefined,
      });
      navigate("/requests");
    } catch (err: unknown) {
      const msg =
        err instanceof AxiosError
          ? err.response?.data?.message || err.message
          : err instanceof Error
            ? err.message
            : "Failed to submit request.";
      setError(msg);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-0">
      <h1 className="mb-6 text-xl font-bold text-gray-900 sm:text-2xl">
        New Time-Off Request
      </h1>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Leave Type
          </label>
          <select
            title="Leave Type"
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
          {available !== null && (
            <p className="mt-1 text-xs text-gray-500">
              Available: <strong>{available}</strong> day
              {available === 1 ? "" : "s"}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Start Date
            </label>
            <input
              title="startDate"
              type="date"
              required
              min={minDate}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              End Date
            </label>
            <input
              title="endDate"
              type="date"
              required
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {days > 0 && (
          <p className="text-sm text-blue-600">
            {days} working day{days !== 1 ? "s" : ""}
            {available !== null && days > available && (
              <span className="ml-2 text-red-500">
                (exceeds available balance)
              </span>
            )}
          </p>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Reason <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            title="Reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="w-full rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
          >
            {createMutation.isPending ? "Submitting…" : "Submit Request"}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-full rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
