import { motion } from "motion/react";
import { CATEGORY_CONFIG, type EventCategory, type DailyTip } from "@memo/shared";
import { X, Lightbulb, Sparkles } from "lucide-react";

interface Props {
  tip: DailyTip;
  onDismiss: () => void;
}

const FALLBACK_COLOR = "#6B7280";

export function TipCard({ tip, onDismiss }: Props) {
  const config = CATEGORY_CONFIG[tip.category as EventCategory];
  const color = config?.color ?? FALLBACK_COLOR;
  const icon = config?.icon ?? "💡";
  const isAnalysis = tip.source === "analysis";

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="mx-4 mb-2 relative overflow-hidden rounded-xl border border-slate-700/50"
      style={{
        background: "rgba(30,41,59,0.6)",
        borderLeft: `3px solid ${color}80`,
      }}
    >
      {/* Subtle gradient glow matching category color */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 0% 50%, ${color}, transparent 70%)`,
        }}
      />

      <div className="relative flex items-start gap-3 px-4 py-3">
        {/* Category icon */}
        <span className="text-xl shrink-0 mt-0.5">{icon}</span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            {isAnalysis ? (
              <Sparkles className="w-3 h-3 text-amber-400/70" />
            ) : (
              <Lightbulb className="w-3 h-3 text-slate-500" />
            )}
            <span className="text-[10px] uppercase tracking-wider font-medium text-slate-500">
              {isAnalysis ? "From your analysis" : "Daily tip"}
            </span>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{tip.text}</p>
        </div>

        {/* Dismiss button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="shrink-0 p-1 rounded-md text-slate-600 hover:text-slate-400 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}
