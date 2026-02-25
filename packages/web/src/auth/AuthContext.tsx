import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api, ApiError, setTokens, clearTokens, getAccessToken, resetEncryptionExpired } from "../api/client";
import { clearOfflineData } from "../offline/event-store";
import type { UserResponse, AuthTokens } from "@memo/shared";

interface AuthState {
  user: UserResponse | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string, consentToHealthData?: boolean) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(() => {
    try {
      const cached = localStorage.getItem("cachedUser");
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    try {
      const u = await api<UserResponse>("/users/me");
      setUser(u);
      localStorage.setItem("cachedUser", JSON.stringify(u));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        localStorage.removeItem("cachedUser");
        setUser(null);
      }
      // On 5xx/network: keep cached user + tokens, session survives server restarts
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (email: string, password: string) => {
    const tokens = await api<AuthTokens>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setTokens(tokens.accessToken, tokens.refreshToken);
    resetEncryptionExpired();
    await fetchUser();
  };

  const register = async (email: string, password: string, name?: string, consentToHealthData?: boolean) => {
    const tokens = await api<AuthTokens>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name, consentToHealthData: consentToHealthData ?? true }),
    });
    setTokens(tokens.accessToken, tokens.refreshToken);
    await fetchUser();
  };

  const logout = () => {
    const rt = localStorage.getItem("refreshToken");
    if (rt) {
      api("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken: rt }),
      }).catch(() => {});
    }
    clearTokens();
    localStorage.removeItem("cachedUser");
    clearOfflineData().catch(() => {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
