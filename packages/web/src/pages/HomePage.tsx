import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "../auth/AuthContext";
import { useEvents } from "../hooks/useEvents";
import { QuickEntryGrid } from "../components/events/QuickEntryGrid";
import { EventCard } from "../components/events/EventCard";
import { EventDetailSheet } from "../components/events/EventDetailSheet";
import type { EventCategory, EventResponse } from "@memo/shared";

export function HomePage() {
  const { user } = useAuth();
  const { events, fetchEvents, createEvent, deleteEvent } = useEvents();
  const [editingEvent, setEditingEvent] = useState<EventResponse | null>(null);

  const loadToday = useCallback(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    fetchEvents({
      from: startOfDay.toISOString(),
      limit: 20,
    });
  }, [fetchEvents]);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  const handleQuickCreate = async (category: EventCategory) => {
    await createEvent({ category });
    toast.success(`${category} logged!`);
  };

  const greeting = getGreeting();

  return (
    <div className="pb-6">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <p className="text-slate-400 text-sm">{greeting}</p>
        <h1 className="text-xl font-bold">
          {user?.name || "Welcome"}
        </h1>
      </div>

      {/* Quick Entry Grid */}
      <QuickEntryGrid onQuickCreate={handleQuickCreate} />

      {/* Today's timeline */}
      {events.length > 0 && (
        <div className="mt-6 px-4">
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-3">
            Today
          </h2>
          <div className="space-y-2">
            {events.map((event, i) => (
              <EventCard
                key={event.id}
                event={event}
                index={i}
                onClick={() => setEditingEvent(event)}
                onDelete={() => deleteEvent(event.id)}
              />
            ))}
          </div>
        </div>
      )}

      {editingEvent && (
        <EventDetailSheet
          category={editingEvent.category as EventCategory}
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSaved={() => {
            setEditingEvent(null);
            loadToday();
          }}
        />
      )}
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
