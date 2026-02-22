import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CATEGORY_CONFIG, type EventCategory, type EventResponse } from "@memo/shared";

interface Props {
  event: EventResponse;
  index?: number;
  onClick: () => void;
  onDelete: () => void;
}

export function EventCard({ event, index = 0, onClick, onDelete }: Props) {
  const config = CATEGORY_CONFIG[event.category as EventCategory] ?? { label: event.category, icon: "📋", color: "#6B7280" };
  const time = new Date(event.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const summary = getSummary(event);

  const [confirming, setConfirming] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const handleDeleteTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirming) {
      onDelete();
      setConfirming(false);
    } else {
      setConfirming(true);
      resetTimer.current = setTimeout(() => setConfirming(false), 3000);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      onClick={onClick}
      className="relative flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer hover:bg-slate-700/60 transition-colors"
      style={{
        background: 'rgba(30,41,59,0.7)',
        borderLeft: `2px solid ${(config?.color ?? '#6366f1')}40`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }}
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
        <span className="flex items-center gap-1 text-xs font-medium text-indigo-400 shrink-0" title="AI Health Score">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="opacity-60">
            <path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z" />
          </svg>
          {event.rating}/10
        </span>
      )}
      <AnimatePresence mode="wait">
        {confirming ? (
          <motion.button
            key="confirm"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            onClick={handleDeleteTap}
            className="shrink-0 rounded-lg bg-red-500/20 border border-red-500/40 px-2.5 py-1 text-xs font-medium text-red-400 active:bg-red-500/30"
          >
            Delete?
          </motion.button>
        ) : (
          <motion.button
            key="delete"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={handleDeleteTap}
            className="shrink-0 p-1.5 rounded-lg text-slate-600 hover:text-red-400 active:text-red-400 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>
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
      case "toilet":
        if (d.subType === "urine") {
          detailSummary = ["Urine", d.urineColor, d.volume].filter(Boolean).join(" · ");
        } else {
          detailSummary = d.bristolScale ? `Stool · Bristol ${d.bristolScale}` : "Stool";
        }
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
      case "activity":
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
