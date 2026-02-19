import { useState, useEffect, useCallback } from "react";
import {
  EVENT_CATEGORIES,
  CATEGORY_CONFIG,
  type EventCategory,
  type EventResponse,
} from "@memo/shared";
import { useEvents } from "../../hooks/useEvents";
import { EventCard } from "../events/EventCard";
import { EventDetailSheet } from "../events/EventDetailSheet";

export function JournalView() {
  const { events, loading, fetchEvents, deleteEvent } = useEvents();
  const [filter, setFilter] = useState<EventCategory | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editingEvent, setEditingEvent] = useState<EventResponse | null>(null);

  const loadEvents = useCallback(() => {
    fetchEvents({
      category: filter ?? undefined,
      from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      to: dateTo ? new Date(dateTo + "T23:59:59").toISOString() : undefined,
      limit: 100,
    });
  }, [fetchEvents, filter, dateFrom, dateTo]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleDelete = async (id: string) => {
    await deleteEvent(id);
  };

  // Group events by date
  const grouped = events.reduce<Record<string, EventResponse[]>>((acc, event) => {
    const dateKey = new Date(event.timestamp).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(event);
    return acc;
  }, {});

  return (
    <div className="pb-20">
      {/* Date range filter */}
      <div className="flex gap-2 px-4 pt-3">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="flex-1 bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-1.5 border border-slate-700"
          placeholder="From"
        />
        <span className="text-slate-500 self-center">{"\u2014"}</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="flex-1 bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-1.5 border border-slate-700"
          placeholder="To"
        />
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2 px-4 py-3">
        <button
          onClick={() => setFilter(null)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            filter === null
              ? "bg-indigo-600 text-white"
              : "bg-slate-800 text-slate-400"
          }`}
        >
          All
        </button>
        {EVENT_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat === filter ? null : cat)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === cat
                ? "bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-400"
            }`}
          >
            {CATEGORY_CONFIG[cat].icon} {CATEGORY_CONFIG[cat].label}
          </button>
        ))}
      </div>

      {/* Event list */}
      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : events.length === 0 ? (
        <div className="text-center text-slate-500 py-12">No events yet</div>
      ) : (
        <div className="px-4 space-y-5">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                {date}
              </h3>
              <div className="space-y-2">
                {items.map((event, i) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    index={i}
                    onClick={() => setEditingEvent(event)}
                    onDelete={() => handleDelete(event.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editingEvent && (
        <EventDetailSheet
          category={editingEvent.category as EventCategory}
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSaved={() => {
            setEditingEvent(null);
            loadEvents();
          }}
        />
      )}
    </div>
  );
}
