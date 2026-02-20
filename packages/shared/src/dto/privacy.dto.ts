import { z } from "zod";

// Consent types
export const CONSENT_TYPES = [
  "health_data_processing",
  "marketing",
  "analytics",
  "ccpa_do_not_sell",
] as const;

export type ConsentType = (typeof CONSENT_TYPES)[number];

// Grant/withdraw consent
export const updateConsentDto = z.object({
  type: z.enum(CONSENT_TYPES),
  granted: z.boolean(),
});

// Delete account request
export const deleteAccountDto = z.object({
  password: z.string().min(1),
  reason: z.string().max(500).optional(),
});

// Inferred types
export type UpdateConsentDto = z.infer<typeof updateConsentDto>;
export type DeleteAccountDto = z.infer<typeof deleteAccountDto>;

// Response types
export interface ConsentResponse {
  id: string;
  type: string;
  version: string;
  granted: boolean;
  createdAt: string;
}

export interface ConsentHistoryResponse {
  data: ConsentResponse[];
  total: number;
}

export interface DeletionRequestResponse {
  id: string;
  status: string;
  reason: string | null;
  scheduledAt: string;
  createdAt: string;
}

export interface DataExportResponse {
  exportDate: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
  };
  events: Array<{
    category: string;
    details: Record<string, unknown> | null;
    note: string | null;
    rating: number | null;
    timestamp: string;
  }>;
  reminders: Array<{
    type: string;
    label: string;
    category: string | null;
    scheduleType: string | null;
    time: string | null;
    enabled: boolean;
    createdAt: string;
  }>;
  consents: Array<{
    type: string;
    granted: boolean;
    version: string;
    createdAt: string;
  }>;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  resource: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogResponse {
  data: AuditLogEntry[];
  total: number;
}
