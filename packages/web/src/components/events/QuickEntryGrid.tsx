import { useState, useRef } from "react";
import { motion } from "motion/react";
import {
  EVENT_CATEGORIES,
  CATEGORY_CONFIG,
  type EventCategory,
} from "@memo/shared";
import { EventDetailSheet } from "./EventDetailSheet";

interface Props {
  onQuickCreate: (category: EventCategory) => Promise<void>;
}

export function QuickEntryGrid({ onQuickCreate }: Props) {
  const [detailCategory, setDetailCategory] = useState<EventCategory | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const handlePointerDown = (category: EventCategory) => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setDetailCategory(category);
    }, 500);
  };

  const handlePointerUp = (category: EventCategory) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!longPressTriggered.current) {
      onQuickCreate(category);
    }
  };

  const handlePointerLeave = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-3 px-4">
        {EVENT_CATEGORIES.map((cat, i) => {
          const config = CATEGORY_CONFIG[cat];
          return (
            <motion.button
              key={cat}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
              whileTap={{ scale: 0.92 }}
              onPointerDown={() => handlePointerDown(cat)}
              onPointerUp={() => handlePointerUp(cat)}
              onPointerLeave={handlePointerLeave}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-slate-800/80 border border-slate-700/50 py-5 select-none touch-manipulation"
            >
              <span className="text-3xl">{config.icon}</span>
              <span className="text-xs font-medium text-slate-300">
                {config.label}
              </span>
            </motion.button>
          );
        })}
      </div>

      {detailCategory && (
        <EventDetailSheet
          category={detailCategory}
          onClose={() => setDetailCategory(null)}
        />
      )}
    </>
  );
}
