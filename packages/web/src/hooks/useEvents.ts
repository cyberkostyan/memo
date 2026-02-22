import { useState, useCallback, useRef } from "react";
import { api } from "../api/client";
import type {
  EventResponse,
  PaginatedResponse,
  CreateEventDto,
  UpdateEventDto,
  EventCategory,
} from "@memo/shared";

const PAGE_SIZE = 30;

export function useEvents() {
  const [events, setEvents] = useState<EventResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const eventsRef = useRef(events);
  eventsRef.current = events;

  const loadingMoreRef = useRef(false);

  const fetchEvents = useCallback(
    async (params?: {
      from?: string;
      to?: string;
      category?: EventCategory;
      limit?: number;
      offset?: number;
    }) => {
      setLoading(true);
      try {
        const query = new URLSearchParams();
        if (params?.from) query.set("from", params.from);
        if (params?.to) query.set("to", params.to);
        if (params?.category) query.set("category", params.category);
        query.set("limit", String(params?.limit ?? PAGE_SIZE));
        if (params?.offset) query.set("offset", String(params.offset));

        const qs = query.toString();
        const res = await api<PaginatedResponse<EventResponse>>(
          `/events${qs ? `?${qs}` : ""}`,
        );
        setEvents(res.data);
        setTotal(res.total);
        return res;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loadMore = useCallback(
    async (params?: {
      from?: string;
      to?: string;
      category?: EventCategory;
    }) => {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
      try {
        const query = new URLSearchParams();
        if (params?.from) query.set("from", params.from);
        if (params?.to) query.set("to", params.to);
        if (params?.category) query.set("category", params.category);
        query.set("limit", String(PAGE_SIZE));
        query.set("offset", String(eventsRef.current.length));

        const qs = query.toString();
        const res = await api<PaginatedResponse<EventResponse>>(
          `/events${qs ? `?${qs}` : ""}`,
        );

        setEvents((prev) => {
          const existingIds = new Set(prev.map((e) => e.id));
          const newItems = res.data.filter((e) => !existingIds.has(e.id));
          return [...prev, ...newItems];
        });
        setTotal(res.total);
      } finally {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    },
    [],
  );

  const hasMore = events.length < total;

  const createEvent = useCallback(async (dto: CreateEventDto) => {
    const event = await api<EventResponse>("/events", {
      method: "POST",
      body: JSON.stringify(dto),
    });
    setEvents((prev) => [event, ...prev]);
    setTotal((prev) => prev + 1);
    return event;
  }, []);

  const updateEvent = useCallback(async (id: string, dto: UpdateEventDto) => {
    const event = await api<EventResponse>(`/events/${id}`, {
      method: "PATCH",
      body: JSON.stringify(dto),
    });
    setEvents((prev) => prev.map((e) => (e.id === id ? event : e)));
    return event;
  }, []);

  const deleteEvent = useCallback(async (id: string) => {
    await api(`/events/${id}`, { method: "DELETE" });
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setTotal((prev) => prev - 1);
  }, []);

  return {
    events,
    total,
    loading,
    loadingMore,
    hasMore,
    fetchEvents,
    loadMore,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}
