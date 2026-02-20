import { useState } from "react";
import { Drawer } from "vaul";
import {
  EVENT_CATEGORIES,
  CATEGORY_CONFIG,
  type EventCategory,
  type ReminderResponse,
  type CreateReminderDto,
} from "@memo/shared";

type ReminderCategory = EventCategory | undefined;
import { useReminders } from "../../hooks/useReminders";

interface Props {
  editingReminder: ReminderResponse | null;
  onClose: () => void;
  onSaved: () => void;
}

const PRESETS: Array<Omit<CreateReminderDto, "timezone">> = [
  { type: "inactivity", label: "Drink water", category: "water", inactivityMin: 120, activeFrom: "08:00", activeTo: "22:00" },
  { type: "scheduled", label: "Take medication", category: "medication", scheduleType: "daily", time: "09:00", activeFrom: "08:00", activeTo: "22:00" },
  { type: "inactivity", label: "Log meals", category: "meal", inactivityMin: 240, activeFrom: "08:00", activeTo: "22:00" },
  { type: "scheduled", label: "Track mood", category: "mood", scheduleType: "interval", intervalMin: 240, activeFrom: "08:00", activeTo: "22:00" },
];

export function ReminderSheet({ editingReminder, onClose, onSaved }: Props) {
  const { createReminder, updateReminder } = useReminders();

  const [type, setType] = useState<"scheduled" | "inactivity">(
    (editingReminder?.type as any) ?? "scheduled",
  );
  const [label, setLabel] = useState(editingReminder?.label ?? "");
  const [category, setCategory] = useState<string>(editingReminder?.category ?? "");
  const [scheduleType, setScheduleType] = useState<"daily" | "interval">(
    (editingReminder?.scheduleType as any) ?? "daily",
  );
  const [time, setTime] = useState(editingReminder?.time ?? "09:00");
  const [intervalMin, setIntervalMin] = useState(editingReminder?.intervalMin ?? 120);
  const [inactivityMin, setInactivityMin] = useState(editingReminder?.inactivityMin ?? 120);
  const [activeFrom, setActiveFrom] = useState(editingReminder?.activeFrom ?? "08:00");
  const [activeTo, setActiveTo] = useState(editingReminder?.activeTo ?? "22:00");
  const [saving, setSaving] = useState(false);

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setType(preset.type as any);
    setLabel(preset.label);
    setCategory(preset.category ?? "");
    if (preset.scheduleType) setScheduleType(preset.scheduleType as any);
    if (preset.time) setTime(preset.time);
    if (preset.intervalMin) setIntervalMin(preset.intervalMin);
    if (preset.inactivityMin) setInactivityMin(preset.inactivityMin);
    setActiveFrom(preset.activeFrom);
    setActiveTo(preset.activeTo);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const dto: CreateReminderDto = {
        type,
        label,
        category: (category || undefined) as ReminderCategory,
        scheduleType: type === "scheduled" ? scheduleType : undefined,
        time: type === "scheduled" && scheduleType === "daily" ? time : undefined,
        intervalMin: type === "scheduled" && scheduleType === "interval" ? intervalMin : undefined,
        inactivityMin: type === "inactivity" ? inactivityMin : undefined,
        activeFrom,
        activeTo,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      if (editingReminder) {
        const { type: _, timezone: __, ...updateFields } = dto;
        await updateReminder(editingReminder.id, updateFields);
      } else {
        await createReminder(dto);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer.Root open onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 rounded-t-2xl max-h-[85vh] overflow-y-auto">
          <div className="mx-auto w-12 h-1.5 bg-slate-700 rounded-full mt-3 mb-2" />
          <div className="px-4 pb-8">
            <h2 className="text-lg font-semibold text-white mb-4">
              {editingReminder ? "Edit Reminder" : "New Reminder"}
            </h2>

            {/* Presets (only for new) */}
            {!editingReminder && (
              <div className="mb-4">
                <p className="text-xs text-slate-400 mb-2">Quick start</p>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => {
                    const icon = p.category
                      ? CATEGORY_CONFIG[p.category as EventCategory]?.icon
                      : "";
                    return (
                      <button
                        key={p.label}
                        onClick={() => applyPreset(p)}
                        className="px-3 py-1.5 rounded-full bg-slate-800 text-xs text-slate-300 hover:bg-slate-700"
                      >
                        {icon} {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Type selector */}
            <div className="mb-4">
              <label className="block text-xs text-slate-400 mb-1">Type</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setType("scheduled")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                    type === "scheduled"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  Scheduled
                </button>
                <button
                  onClick={() => setType("inactivity")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                    type === "inactivity"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  Inactivity
                </button>
              </div>
            </div>

            {/* Label */}
            <div className="mb-4">
              <label className="block text-xs text-slate-400 mb-1">Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                placeholder="Reminder name"
              />
            </div>

            {/* Category */}
            <div className="mb-4">
              <label className="block text-xs text-slate-400 mb-1">Category</label>
              <div className="flex flex-wrap gap-1.5">
                {EVENT_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat === category ? "" : cat)}
                    className={`px-2.5 py-1 rounded-full text-xs ${
                      category === cat
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {CATEGORY_CONFIG[cat].icon} {CATEGORY_CONFIG[cat].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scheduled options */}
            {type === "scheduled" && (
              <div className="mb-4 space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Schedule</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setScheduleType("daily")}
                      className={`flex-1 py-2 rounded-lg text-sm ${
                        scheduleType === "daily"
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      Daily
                    </button>
                    <button
                      onClick={() => setScheduleType("interval")}
                      className={`flex-1 py-2 rounded-lg text-sm ${
                        scheduleType === "interval"
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      Interval
                    </button>
                  </div>
                </div>
                {scheduleType === "daily" && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Time</label>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                  </div>
                )}
                {scheduleType === "interval" && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Every (minutes)
                    </label>
                    <input
                      type="number"
                      value={intervalMin}
                      onChange={(e) => setIntervalMin(Number(e.target.value))}
                      min={15}
                      max={1440}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Inactivity options */}
            {type === "inactivity" && (
              <div className="mb-4">
                <label className="block text-xs text-slate-400 mb-1">
                  Alert after (minutes without logging)
                </label>
                <input
                  type="number"
                  value={inactivityMin}
                  onChange={(e) => setInactivityMin(Number(e.target.value))}
                  min={30}
                  max={1440}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
            )}

            {/* Active window */}
            <div className="mb-6">
              <label className="block text-xs text-slate-400 mb-1">
                Active window (don't notify outside)
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="time"
                  value={activeFrom}
                  onChange={(e) => setActiveFrom(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                />
                <span className="text-slate-500">&mdash;</span>
                <input
                  type="time"
                  value={activeTo}
                  onChange={(e) => setActiveTo(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || !label}
              className="w-full py-3 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : editingReminder ? "Update" : "Create Reminder"}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
