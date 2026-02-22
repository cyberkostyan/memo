import { useState, useEffect, useCallback, useMemo } from "react";
import { GroupedVirtuoso } from "react-virtuoso";
import {
  EVENT_CATEGORIES,
  CATEGORY_CONFIG,
  type EventCategory,
  type EventResponse,
} from "@memo/shared";
import { useEvents } from "../../hooks/useEvents";
import { apiDownload } from "../../api/client";
import { EventCard } from "../events/EventCard";
import { EventDetailSheet } from "../events/EventDetailSheet";

export function JournalView() {
  const { events, loading, loadingMore, hasMore, fetchEvents, loadMore, deleteEvent } =
    useEvents();
  const [filter, setFilter] = useState<EventCategory | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventResponse | null>(null);
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setScrollParent(document.getElementById("root"));
  }, []);

  const filterParams = useMemo(
    () => ({
      category: filter ?? undefined,
      from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      to: dateTo ? new Date(dateTo + "T23:59:59").toISOString() : undefined,
    }),
    [filter, dateFrom, dateTo],
  );

  const loadEvents = useCallback(() => {
    fetchEvents(filterParams);
  }, [fetchEvents, filterParams]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const { groupLabels, groupCounts, flatEvents } = useMemo(() => {
    const labels: string[] = [];
    const counts: number[] = [];
    const flat: EventResponse[] = [];

    let currentLabel = "";
    let currentCount = 0;

    for (const event of events) {
      const label = new Date(event.timestamp).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

      if (label !== currentLabel) {
        if (currentLabel) {
          labels.push(currentLabel);
          counts.push(currentCount);
        }
        currentLabel = label;
        currentCount = 0;
      }
      currentCount++;
      flat.push(event);
    }

    if (currentLabel) {
      labels.push(currentLabel);
      counts.push(currentCount);
    }

    return { groupLabels: labels, groupCounts: counts, flatEvents: flat };
  }, [events]);

  const handleDelete = async (id: string) => {
    await deleteEvent(id);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", new Date(dateFrom).toISOString());
      if (dateTo) params.set("to", new Date(dateTo + "T23:59:59").toISOString());
      if (filter) params.set("categories", filter);
      const qs = params.toString();
      await apiDownload(`/events/export${qs ? `?${qs}` : ""}`);
    } catch {
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleEndReached = useCallback(() => {
    if (hasMore && !loadingMore) {
      loadMore(filterParams);
    }
  }, [hasMore, loadingMore, loadMore, filterParams]);

  return (
    <div className="pb-6">
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

      {/* Export button */}
      <div className="px-4 py-2">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {exporting ? "Exporting..." : "Export XLSX"}
        </button>
      </div>

      {/* Event list */}
      {loading && events.length === 0 ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : events.length === 0 ? (
        <div className="text-center text-slate-500 py-12">No events yet</div>
      ) : scrollParent ? (
        <GroupedVirtuoso
          customScrollParent={scrollParent}
          groupCounts={groupCounts}
          groupContent={(index) => (
            <div className="px-4 pt-4 pb-1 bg-slate-900/95 backdrop-blur-sm">
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                {groupLabels[index]}
              </h3>
            </div>
          )}
          itemContent={(index) => (
            <div className="px-4 pt-2">
              <EventCard
                event={flatEvents[index]}
                onClick={() => setEditingEvent(flatEvents[index])}
                onDelete={() => handleDelete(flatEvents[index].id)}
              />
            </div>
          )}
          endReached={handleEndReached}
          overscan={200}
          components={{
            Footer: () =>
              loadingMore ? (
                <div className="text-center text-slate-500 py-4 text-sm">
                  Loading more...
                </div>
              ) : null,
          }}
        />
      ) : null}

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
