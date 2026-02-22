import { useState, useCallback, useRef } from "react";
import { api } from "../api/client";
import { useOnline } from "../contexts/OnlineContext";
import { useAuth } from "../auth/AuthContext";
import {
  cacheEvents,
  cacheEvent,
  getCachedEvents,
  removeCachedEvent,
  addPendingOp,
} from "../offline/event-store";
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
  const { isOnline, refreshPendingCount } = useOnline();
  const { user } = useAuth();

  const eventsRef = useRef(events);
  eventsRef.current = events;

  const loadingMoreRef = useRef(false);
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const userId = user?.id ?? "";

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
        if (isOnlineRef.current) {
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

          // Cache fetched events
          if (userId) {
            await cacheEvents(res.data, userId);
          }
          return res;
        } else {
          // Offline: read from IndexedDB
          const cached = await getCachedEvents(userId);
          setEvents(cached);
          setTotal(cached.length);
          return { data: cached, total: cached.length };
        }
      } catch {
        // Fetch failed — try cache
        const cached = await getCachedEvents(userId);
        setEvents(cached);
        setTotal(cached.length);
        return { data: cached, total: cached.length };
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  const loadMore = useCallback(
    async (params?: {
      from?: string;
      to?: string;
      category?: EventCategory;
    }) => {
      if (loadingMoreRef.current) return;
      if (!isOnlineRef.current) return; // No pagination offline — all cached events already loaded
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

        // Cache newly loaded events
        if (userId) {
          await cacheEvents(res.data, userId);
        }
      } finally {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    },
    [userId],
  );

  const hasMore = events.length < total;

  const createEvent = useCallback(
    async (dto: CreateEventDto) => {
      if (isOnlineRef.current) {
        try {
          const event = await api<EventResponse>("/events", {
            method: "POST",
            body: JSON.stringify(dto),
          });
          setEvents((prev) => [event, ...prev]);
          setTotal((prev) => prev + 1);

          // Cache synced event
          if (userId) {
            await cacheEvent(event, userId);
          }
          return event;
        } catch (err) {
          // If fetch error (network), fall through to offline path
          if (err instanceof TypeError) {
            // Network error — save offline
          } else {
            throw err; // Re-throw API errors
          }
        }
      }

      // Offline: create with temp ID
      const tempId = `temp-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const offlineEvent: EventResponse = {
        id: tempId,
        category: dto.category,
        details: (dto.details as Record<string, unknown>) ?? null,
        note: dto.note ?? null,
        rating: null,
        ratedAt: null,
        timestamp: dto.timestamp ?? now,
        createdAt: now,
        updatedAt: now,
      };

      setEvents((prev) => [offlineEvent, ...prev]);
      setTotal((prev) => prev + 1);

      if (userId) {
        await cacheEvent(offlineEvent, userId, "pending");
        await addPendingOp({
          type: "create",
          eventId: tempId,
          data: dto as unknown as Record<string, unknown>,
        });
        await refreshPendingCount();
      }

      return offlineEvent;
    },
    [userId, refreshPendingCount],
  );

  const updateEvent = useCallback(
    async (id: string, dto: UpdateEventDto) => {
      if (isOnlineRef.current) {
        try {
          const event = await api<EventResponse>(`/events/${id}`, {
            method: "PATCH",
            body: JSON.stringify(dto),
          });
          setEvents((prev) => prev.map((e) => (e.id === id ? event : e)));

          if (userId) {
            await cacheEvent(event, userId);
          }
          return event;
        } catch (err) {
          if (err instanceof TypeError) {
            // Network error — fall through to offline path
          } else {
            throw err;
          }
        }
      }

      // Offline: update locally
      const now = new Date().toISOString();
      let updatedEvent: EventResponse | undefined;

      setEvents((prev) =>
        prev.map((e) => {
          if (e.id !== id) return e;
          updatedEvent = {
            ...e,
            details: (dto.details as Record<string, unknown>) ?? e.details,
            note: dto.note !== undefined ? dto.note ?? null : e.note,
            timestamp: dto.timestamp ?? e.timestamp,
            updatedAt: now,
          };
          return updatedEvent;
        }),
      );

      if (userId && updatedEvent) {
        await cacheEvent(updatedEvent, userId, "pending");
        await addPendingOp({
          type: "update",
          eventId: id,
          data: dto as unknown as Record<string, unknown>,
        });
        await refreshPendingCount();
      }

      return updatedEvent!;
    },
    [userId, refreshPendingCount],
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      if (isOnlineRef.current) {
        try {
          await api(`/events/${id}`, { method: "DELETE" });
          setEvents((prev) => prev.filter((e) => e.id !== id));
          setTotal((prev) => prev - 1);

          if (userId) {
            await removeCachedEvent(id);
          }
          return;
        } catch (err) {
          if (err instanceof TypeError) {
            // Network error — fall through to offline
          } else {
            throw err;
          }
        }
      }

      // Offline: remove locally
      setEvents((prev) => prev.filter((e) => e.id !== id));
      setTotal((prev) => prev - 1);

      if (userId) {
        await removeCachedEvent(id);
        await addPendingOp({ type: "delete", eventId: id });
        await refreshPendingCount();
      }
    },
    [userId, refreshPendingCount],
  );

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
