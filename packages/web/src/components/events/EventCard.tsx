import { motion } from "motion/react";
import { CATEGORY_CONFIG, type EventCategory, type EventResponse } from "@memo/shared";

interface Props {
  event: EventResponse;
  index?: number;
  onClick: () => void;
  onDelete: () => void;
}

export function EventCard({ event, index = 0, onClick, onDelete }: Props) {
  const config = CATEGORY_CONFIG[event.category as EventCategory];
  const time = new Date(event.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const summary = getSummary(event);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      onClick={onClick}
      className="flex items-center gap-3 bg-slate-800/60 rounded-xl px-4 py-3 cursor-pointer hover:bg-slate-800 transition-colors group"
    >
      <span className="text-2xl shrink-0">{config?.icon ?? "📋"}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-sm">{config?.label ?? event.category}</span>
          <span className="text-xs text-slate-500">{time}</span>
        </div>
        {summary && (
          <p className="text-xs text-slate-400 truncate mt-0.5">{summary}</p>
        )}
      </div>
      {event.rating != null && (
        <span className="text-xs font-medium text-indigo-400 shrink-0">
          {event.rating}/10
        </span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-sm"
      >
        ✕
      </button>
    </motion.div>
  );
}

function getSummary(event: EventResponse): string {
  const d = event.details as Record<string, unknown> | null;

  let detailSummary = "";
  if (d) {
    switch (event.category) {
      case "meal":
        detailSummary = [d.items, d.mealType && `(${d.mealType})`].filter(Boolean).join(" ");
        break;
      case "stool":
        detailSummary = d.bristolScale ? `Bristol ${d.bristolScale}` : "";
        break;
      case "mood":
        detailSummary = [d.emotion, d.intensity && `(${d.intensity}/5)`].filter(Boolean).join(" ");
        break;
      case "symptom":
        detailSummary = [d.symptom, d.severity && `(${d.severity}/10)`, d.location].filter(Boolean).join(" ");
        break;
      case "medication":
        detailSummary = [d.name, d.dose].filter(Boolean).join(" ");
        break;
      case "exercise":
        detailSummary = [d.type, d.duration && `${d.duration}min`, d.intensity].filter(Boolean).join(" ");
        break;
      case "water":
        detailSummary = d.amount ? String(d.amount) : "";
        break;
      case "sleep":
        detailSummary = [d.hours && `${d.hours}h`, d.quality && `quality ${d.quality}/5`]
          .filter(Boolean)
          .join(", ");
        break;
    }
  }

  return [detailSummary, event.note].filter(Boolean).join(" · ");
}
