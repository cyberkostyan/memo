import { z } from "zod";
import { EVENT_CATEGORIES } from "../event-types";

// Auth DTOs
export const registerDto = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

export const loginDto = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const refreshDto = z.object({
  refreshToken: z.string(),
});

// Event DTOs
export const createEventDto = z.object({
  category: z.enum(EVENT_CATEGORIES),
  details: z.record(z.unknown()).optional(),
  note: z.string().optional(),
  rating: z.number().int().min(0).max(10).optional(),
  timestamp: z.string().datetime().optional(),
});

export const updateEventDto = z.object({
  details: z.record(z.unknown()).optional(),
  note: z.string().optional(),
  rating: z.number().int().min(0).max(10).nullable().optional(),
  timestamp: z.string().datetime().optional(),
});

export const eventQueryDto = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// Export DTOs
export const exportQueryDto = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  categories: z.string().optional(), // comma-separated: "meal,mood,sleep"
});

// Reminder DTOs
export const createReminderDto = z.object({
  type: z.enum(["scheduled", "inactivity"]),
  label: z.string().min(1).max(100),
  category: z.enum(EVENT_CATEGORIES).optional(),
  scheduleType: z.enum(["daily", "interval"]).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  intervalMin: z.number().int().min(15).max(1440).optional(),
  inactivityMin: z.number().int().min(30).max(1440).optional(),
  activeFrom: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
  activeTo: z.string().regex(/^\d{2}:\d{2}$/).default("22:00"),
  timezone: z.string(),
});

export const updateReminderDto = z.object({
  label: z.string().min(1).max(100).optional(),
  scheduleType: z.enum(["daily", "interval"]).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  intervalMin: z.number().int().min(15).max(1440).optional(),
  inactivityMin: z.number().int().min(30).max(1440).optional(),
  activeFrom: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  activeTo: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  enabled: z.boolean().optional(),
});

export const pushSubscriptionDto = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

// User DTOs
export const updateUserDto = z.object({
  name: z.string().optional(),
});

// Inferred types
export type RegisterDto = z.infer<typeof registerDto>;
export type LoginDto = z.infer<typeof loginDto>;
export type RefreshDto = z.infer<typeof refreshDto>;
export type CreateEventDto = z.infer<typeof createEventDto>;
export type UpdateEventDto = z.infer<typeof updateEventDto>;
export type EventQueryDto = z.infer<typeof eventQueryDto>;
export type ExportQueryDto = z.infer<typeof exportQueryDto>;
export type CreateReminderDto = z.infer<typeof createReminderDto>;
export type UpdateReminderDto = z.infer<typeof updateReminderDto>;
export type PushSubscriptionDto = z.infer<typeof pushSubscriptionDto>;
export type UpdateUserDto = z.infer<typeof updateUserDto>;

// Response types
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface EventResponse {
  id: string;
  category: string;
  details: Record<string, unknown> | null;
  note: string | null;
  rating: number | null;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderResponse {
  id: string;
  type: string;
  label: string;
  category: string | null;
  scheduleType: string | null;
  time: string | null;
  intervalMin: number | null;
  inactivityMin: number | null;
  activeFrom: string;
  activeTo: string;
  enabled: boolean;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}
