import { CATEGORY_CONFIG, type EventCategory, type ReminderResponse } from "@memo/shared";
import type { useReminders } from "../../hooks/useReminders";

interface Props {
  remindersState: ReturnType<typeof useReminders>;
  onAdd: () => void;
  onEdit: (reminder: ReminderResponse) => void;
}

export function ReminderList({ remindersState, onAdd, onEdit }: Props) {
  const { reminders, loading, updateReminder, deleteReminder } = remindersState;

  const toggleEnabled = async (reminder: ReminderResponse) => {
    await updateReminder(reminder.id, { enabled: !reminder.enabled });
  };

  const formatSchedule = (r: ReminderResponse): string => {
    if (r.type === "inactivity") {
      const hours = Math.round((r.inactivityMin ?? 60) / 60);
      return `inactivity \u00b7 ${hours}h`;
    }
    if (r.scheduleType === "daily") return `daily \u00b7 ${r.time}`;
    if (r.scheduleType === "interval") {
      const hours = Math.round((r.intervalMin ?? 60) / 60);
      return `interval \u00b7 every ${hours}h`;
    }
    return "";
  };

  if (loading) {
    return <div className="text-sm text-slate-500 py-4">Loading...</div>;
  }

  return (
    <div>
      {reminders.length > 0 && (
        <div className="space-y-2 mb-3">
          {reminders.map((r) => {
            const icon = r.category
              ? CATEGORY_CONFIG[r.category as EventCategory]?.icon ?? ""
              : "";
            return (
              <div
                key={r.id}
                className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3"
              >
                <button
                  onClick={() => onEdit(r)}
                  className="flex-1 text-left"
                >
                  <div className="text-sm font-medium text-white">
                    {icon} {r.label}
                  </div>
                  <div className="text-xs text-slate-400">
                    {formatSchedule(r)}
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleEnabled(r)}
                    className={`relative w-10 h-6 rounded-full transition-colors ${
                      r.enabled ? "bg-indigo-600" : "bg-slate-600"
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        r.enabled ? "left-5" : "left-1"
                      }`}
                    />
                  </button>
                  <button
                    onClick={() => deleteReminder(r.id)}
                    className="text-slate-500 hover:text-red-400 text-sm"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={onAdd}
        className="w-full py-2 rounded-lg text-sm font-medium border border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 transition-colors"
      >
        + Add Reminder
      </button>
    </div>
  );
}
