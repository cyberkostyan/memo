import { useState, useEffect, type FormEvent } from "react";
import { Drawer } from "vaul";
import { toast } from "sonner";
import * as Select from "@radix-ui/react-select";
import {
  CATEGORY_CONFIG,
  type EventCategory,
  type CreateEventDto,
  type UpdateEventDto,
  type EventResponse,
} from "@memo/shared";
import { api } from "../../api/client";

function getDefaultDetails(category: EventCategory): Record<string, string> {
  const hour = new Date().getHours();

  switch (category) {
    case "meal": {
      let mealType = "snack";
      if (hour < 10) mealType = "breakfast";
      else if (hour < 14) mealType = "lunch";
      else if (hour >= 17 && hour <= 21) mealType = "dinner";
      return { mealType };
    }
    case "toilet":
      return { subType: "urine", urineColor: "yellow", volume: "medium", urgency: "normal" };
    case "mood":
      return { intensity: "3" };
    case "symptom":
      return { severity: "5" };
    case "activity":
      return { duration: "30", intensity: "moderate" };
    case "water":
      return { amount: "250ml" };
    case "sleep":
      return { hours: "8", quality: "3" };
    default:
      return {};
  }
}

interface Props {
  category: EventCategory;
  event?: EventResponse;
  onClose: () => void;
  onSaved?: (event: EventResponse) => void;
}

export function EventDetailSheet({ category, event, onClose, onSaved }: Props) {
  const config = CATEGORY_CONFIG[category] ?? { label: category, icon: "📋", color: "#6B7280" };
  const existingDetails = (event?.details ?? {}) as Record<string, unknown>;

  const [note, setNote] = useState(event?.note ?? "");
  const [timestamp, setTimestamp] = useState(() => {
    const d = event ? new Date(event.timestamp) : new Date();
    // Format as YYYY-MM-DDTHH:MM for datetime-local input
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [details, setDetails] = useState<Record<string, string>>(() => {
    if (event) {
      const d: Record<string, string> = {};
      for (const [k, v] of Object.entries(existingDetails)) {
        d[k] = String(v ?? "");
      }
      return d;
    }
    return getDefaultDetails(category);
  });
  const [saving, setSaving] = useState(false);

  // Pre-fill medication/note from last used values
  useEffect(() => {
    if (event) return;
    if (category !== "medication" && category !== "note") return;

    api<{ data: EventResponse[] }>(`/events?category=${category}&limit=1`)
      .then(({ data }) => {
        if (data.length === 0) return;
        const last = data[0];
        if (category === "note" && last.note) {
          setNote(last.note);
        }
        const lastDetails = (last.details ?? {}) as Record<string, unknown>;
        if (Object.keys(lastDetails).length > 0) {
          const d: Record<string, string> = {};
          for (const [k, v] of Object.entries(lastDetails)) {
            d[k] = String(v ?? "");
          }
          setDetails(d);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDetail = (key: string, value: string) => {
    setDetails((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Clean up empty detail values
      const cleanDetails: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(details)) {
        if (v !== "") {
          // Parse numbers where appropriate
          const num = Number(v);
          cleanDetails[k] = isNaN(num) ? v : num;
        }
      }

      const ts = new Date(timestamp).toISOString();

      let saved: EventResponse;
      if (event) {
        const dto: UpdateEventDto = {
          details: Object.keys(cleanDetails).length > 0 ? cleanDetails : undefined,
          note: note || undefined,
          timestamp: ts,
        };
        saved = await api<EventResponse>(`/events/${event.id}`, {
          method: "PATCH",
          body: JSON.stringify(dto),
        });
      } else {
        const dto: CreateEventDto = {
          category,
          details: Object.keys(cleanDetails).length > 0 ? cleanDetails : undefined,
          note: note || undefined,
          timestamp: ts,
        };
        saved = await api<EventResponse>("/events", {
          method: "POST",
          body: JSON.stringify(dto),
        });
      }
      onSaved?.(saved);
      onClose();
      toast.success(event ? "Updated" : "Saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer.Root open onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-slate-900 border-t border-slate-700 max-h-[85vh]">
          {/* Drag handle */}
          <div className="mx-auto mt-3 mb-1 h-1 w-10 shrink-0 rounded-full bg-slate-700" />

          <div className="overflow-y-auto p-5 pb-8">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">{config.icon}</span>
              <Drawer.Title className="text-lg font-semibold">
                {event ? "Edit" : "Add"} {config.label}
              </Drawer.Title>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Category-specific fields */}
              <CategoryFields category={category} details={details} setDetail={setDetail} />

              {/* Date & Time */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Date & Time</label>
                <input
                  type="datetime-local"
                  value={timestamp}
                  onChange={(e) => setTimestamp(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
                />
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Note</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                  placeholder="Optional note..."
                />
              </div>

              {/* AI Rating (read-only) */}
              {event?.rating != null && (
                <div className="flex items-center justify-between rounded-lg bg-slate-800/50 border border-slate-700/50 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">AI Health Score</span>
                  </div>
                  <span className="text-sm font-semibold text-indigo-400 tabular-nums">
                    {event.rating}/10
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full disabled:opacity-50 text-white font-medium rounded-lg py-3 transition-all duration-200 active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  boxShadow: '0 0 0 1px rgba(99,102,241,0.3), 0 4px 15px rgba(99,102,241,0.25)',
                }}
              >
                {saving ? "Saving..." : event ? "Update" : "Save"}
              </button>
            </form>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function CategoryFields({
  category,
  details,
  setDetail,
}: {
  category: EventCategory;
  details: Record<string, string>;
  setDetail: (key: string, value: string) => void;
}) {
  const input = (label: string, key: string, props?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label className="block text-sm text-slate-400 mb-1">{label}</label>
      <input
        value={details[key] ?? ""}
        onChange={(e) => setDetail(key, e.target.value)}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        {...props}
      />
    </div>
  );

  const select = (label: string, key: string, options: { value: string; label: string }[]) => (
    <div>
      <label className="block text-sm text-slate-400 mb-1">{label}</label>
      <Select.Root value={details[key] ?? ""} onValueChange={(v) => setDetail(key, v)}>
        <Select.Trigger className="flex items-center justify-between w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500">
          <Select.Value placeholder="Select..." />
          <Select.Icon className="text-slate-400 ml-2">▾</Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={4}
            className="z-[100] w-[var(--radix-select-trigger-width)] max-h-60 overflow-auto rounded-lg bg-slate-800 border border-slate-700 shadow-xl"
          >
            <Select.Viewport className="p-1">
              {options.map((o) => (
                <Select.Item
                  key={o.value}
                  value={o.value}
                  className="relative flex items-center px-3 py-2 rounded-md text-sm text-white cursor-pointer select-none outline-none data-[highlighted]:bg-indigo-600/30 data-[highlighted]:text-white"
                >
                  <Select.ItemText>{o.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );

  switch (category) {
    case "meal":
      return (
        <>
          {input("What did you eat?", "items", { placeholder: "e.g. Salad, chicken..." })}
          {select("Meal type", "mealType", [
            { value: "breakfast", label: "Breakfast" },
            { value: "lunch", label: "Lunch" },
            { value: "dinner", label: "Dinner" },
            { value: "snack", label: "Snack" },
          ])}
          {input("Amount", "amount", { placeholder: "e.g. 1 plate" })}
        </>
      );
    case "toilet": {
      const currentSubType = details.subType || "stool";
      const handleSubTypeChange = (newSubType: string) => {
        if (newSubType === currentSubType) return;
        // Reset fields when switching sub-type
        if (newSubType === "stool") {
          setDetail("subType", "stool");
          setDetail("bristolScale", "4");
          setDetail("color", "");
          setDetail("urineColor", "");
          setDetail("volume", "");
          setDetail("urgency", "");
        } else {
          setDetail("subType", "urine");
          setDetail("bristolScale", "");
          setDetail("color", "");
          setDetail("urineColor", "yellow");
          setDetail("volume", "medium");
          setDetail("urgency", "normal");
        }
      };
      return (
        <>
          {/* Sub-type toggle */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Type</label>
            <div className="flex rounded-lg overflow-hidden border border-slate-700">
              {[
                { value: "stool", label: "Stool" },
                { value: "urine", label: "Urine" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSubTypeChange(opt.value)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    currentSubType === opt.value
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {currentSubType === "stool" ? (
            <>
              {select("Bristol Scale (1-7)", "bristolScale", [
                { value: "1", label: "1 - Separate hard lumps" },
                { value: "2", label: "2 - Lumpy sausage" },
                { value: "3", label: "3 - Sausage with cracks" },
                { value: "4", label: "4 - Smooth sausage" },
                { value: "5", label: "5 - Soft blobs" },
                { value: "6", label: "6 - Mushy" },
                { value: "7", label: "7 - Watery" },
              ])}
              {input("Color", "color", { placeholder: "e.g. brown, dark" })}
            </>
          ) : (
            <>
              {select("Urine Color", "urineColor", [
                { value: "clear", label: "Clear" },
                { value: "light_yellow", label: "Light yellow" },
                { value: "yellow", label: "Yellow" },
                { value: "dark_yellow", label: "Dark yellow" },
                { value: "amber", label: "Amber" },
                { value: "brown", label: "Brown" },
                { value: "pink_red", label: "Pink / Red" },
                { value: "orange", label: "Orange" },
              ])}
              {select("Volume", "volume", [
                { value: "small", label: "Small" },
                { value: "medium", label: "Medium" },
                { value: "large", label: "Large" },
              ])}
              {select("Urgency", "urgency", [
                { value: "normal", label: "Normal" },
                { value: "urgent", label: "Urgent" },
                { value: "very_urgent", label: "Very urgent" },
              ])}
            </>
          )}
        </>
      );
    }
    case "mood":
      return (
        <>
          {input("Emotion", "emotion", { placeholder: "e.g. happy, anxious, calm" })}
          {select("Intensity (1-5)", "intensity", [
            { value: "1", label: "1 - Very low" },
            { value: "2", label: "2 - Low" },
            { value: "3", label: "3 - Medium" },
            { value: "4", label: "4 - High" },
            { value: "5", label: "5 - Very high" },
          ])}
        </>
      );
    case "symptom": {
      const sev = Number(details.severity) || 0;
      const sevColor = severityColor(sev);
      return (
        <>
          {input("Symptom", "symptom", { placeholder: "e.g. headache, nausea" })}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label className="text-sm text-slate-400">Severity</label>
              <span className="text-lg font-semibold tabular-nums" style={{ color: sevColor }}>
                {sev || "—"}
                <span className="text-sm font-normal text-slate-500">/10</span>
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={sev || 1}
              onChange={(e) => setDetail("severity", e.target.value)}
              className="severity-slider w-full"
            />
            <div className="flex justify-between mt-1" style={{ padding: "0 11px" }}>
              {Array.from({ length: 10 }, (_, i) => (
                <span
                  key={i + 1}
                  className={`text-[10px] tabular-nums ${
                    sev === i + 1 ? "font-semibold" : "text-slate-600"
                  }`}
                  style={sev === i + 1 ? { color: sevColor } : undefined}
                >
                  {i + 1}
                </span>
              ))}
            </div>
          </div>
          {input("Location", "location", { placeholder: "e.g. head, stomach" })}
        </>
      );
    }
    case "medication":
      return (
        <>
          {input("Medication name", "name", { placeholder: "e.g. Ibuprofen" })}
          {input("Dose", "dose", { placeholder: "e.g. 200mg" })}
        </>
      );
    case "activity":
      return (
        <>
          {input("Activity type", "type", { placeholder: "e.g. running, yoga, desk work" })}
          {input("Duration (minutes)", "duration", { type: "number", min: 0 })}
          {select("Intensity", "intensity", [
            { value: "sedentary", label: "Sedentary" },
            { value: "light", label: "Light" },
            { value: "moderate", label: "Moderate" },
            { value: "intense", label: "Intense" },
          ])}
        </>
      );
    case "water":
      return input("Amount", "amount", { placeholder: "e.g. 250ml, 1 glass" });
    case "sleep":
      return (
        <>
          {input("Hours", "hours", { type: "number", min: 0, max: 24, step: 0.5 })}
          {select("Quality (1-5)", "quality", [
            { value: "1", label: "1 - Very poor" },
            { value: "2", label: "2 - Poor" },
            { value: "3", label: "3 - Okay" },
            { value: "4", label: "4 - Good" },
            { value: "5", label: "5 - Excellent" },
          ])}
        </>
      );
    case "note":
      return null;
  }
}

function severityColor(value: number): string {
  if (value <= 0) return "#94a3b8"; // slate-400
  // 1=green, 5=yellow, 10=red
  const t = (value - 1) / 9;
  if (t <= 0.5) {
    // green → yellow
    const r = Math.round(34 + (234 - 34) * (t * 2));
    const g = Math.round(197 + (179 - 197) * (t * 2));
    const b = Math.round(94 + (8 - 94) * (t * 2));
    return `rgb(${r},${g},${b})`;
  }
  // yellow → red
  const r = Math.round(234 + (239 - 234) * ((t - 0.5) * 2));
  const g = Math.round(179 - 179 * ((t - 0.5) * 2));
  const b = Math.round(8 + (68 - 8) * ((t - 0.5) * 2));
  return `rgb(${r},${g},${b})`;
}
