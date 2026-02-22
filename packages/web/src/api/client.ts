const API_BASE = "/api";

let accessToken: string | null = localStorage.getItem("accessToken");
let refreshToken: string | null = localStorage.getItem("refreshToken");

// Online status callbacks — set by OnlineContext
let onFetchSuccess: (() => void) | null = null;
let onFetchError: (() => void) | null = null;

export function setOnlineCallbacks(
  success: () => void,
  error: () => void,
) {
  onFetchSuccess = success;
  onFetchError = error;
}

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem("accessToken", access);
  localStorage.setItem("refreshToken", refresh);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
}

export function getAccessToken() {
  return accessToken;
}

// Mutex: only one refresh at a time; concurrent callers share the same promise
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = doRefresh();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function doRefresh(): Promise<boolean> {
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      return false;
    }

    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (err) {
    onFetchError?.();
    throw err;
  }

  // Gateway errors (502/503/504) mean the backend is unreachable
  if (isGatewayError(res.status)) {
    onFetchError?.();
    throw new ApiError(res.status, "Server unreachable");
  }

  // Only report "online" for non-5xx (5xx is ambiguous — could be proxy or real error)
  if (res.status < 500) {
    onFetchSuccess?.();
  }

  // Auto-refresh on 401
  if (res.status === 401 && refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${accessToken}`;
      try {
        res = await fetch(`${API_BASE}${path}`, { ...options, headers });
      } catch (err) {
        onFetchError?.();
        throw err;
      }

      if (isGatewayError(res.status)) {
        onFetchError?.();
        throw new ApiError(res.status, "Server unreachable");
      }

      if (res.status < 500) {
        onFetchSuccess?.();
      }
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, error.message || res.statusText, error.errors);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors?: string[],
  ) {
    super(message);
  }
}

function isGatewayError(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

/** Check if an error means the server is unreachable (network error or gateway error) */
export function isServerUnreachable(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof ApiError && isGatewayError(err.status)) return true;
  return false;
}

export async function apiDownload(path: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let res = await fetch(`${API_BASE}${path}`, { headers });

  if (res.status === 401 && refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${accessToken}`;
      res = await fetch(`${API_BASE}${path}`, { headers });
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, "Export failed");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const filename =
    res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
    "memo-export.xlsx";

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
