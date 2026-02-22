import { useState } from "react";
import { motion } from "motion/react";
import {
  EVENT_CATEGORIES,
  CATEGORY_CONFIG,
  type EventCategory,
  type CreateEventDto,
  type UpdateEventDto,
  type EventResponse,
  type AttachmentMeta,
} from "@memo/shared";
import { EventDetailSheet } from "./EventDetailSheet";

interface Props {
  onSaved?: () => void;
  createEvent?: (dto: CreateEventDto) => Promise<EventResponse>;
  updateEvent?: (id: string, dto: UpdateEventDto) => Promise<EventResponse>;
  uploadAttachment?: (eventId: string, file: File) => Promise<AttachmentMeta>;
  deleteAttachment?: (eventId: string) => Promise<void>;
}

export function QuickEntryGrid({ onSaved, createEvent, updateEvent, uploadAttachment, deleteAttachment }: Props) {
  const [detailCategory, setDetailCategory] = useState<EventCategory | null>(null);

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
              onClick={() => setDetailCategory(cat)}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/8 py-5 select-none touch-manipulation transition-all duration-200"
              style={{
                background: `linear-gradient(145deg, ${config.color}10, rgba(30,41,59,0.9))`,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.3)',
              }}
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
          onSaved={onSaved}
          createEvent={createEvent}
          updateEvent={updateEvent}
          uploadAttachment={uploadAttachment}
          deleteAttachment={deleteAttachment}
        />
      )}
    </>
  );
}
