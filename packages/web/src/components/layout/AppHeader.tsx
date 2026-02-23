import { Link } from "react-router-dom";
import { Menu, ShieldCheck, ShieldAlert } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../auth/AuthContext";
import { getAccessToken } from "../../api/client";

interface AppHeaderProps {
  onMenuClick: () => void;
}

interface SessionStatus {
  encryptionSessionActive: boolean;
  expiresIn: number;
}

function formatRemaining(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m remaining`;
  return `${m}m remaining`;
}

export function AppHeader({ onMenuClick }: AppHeaderProps) {
  const { user } = useAuth();
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const fetchStatus = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const res = await fetch("/api/auth/session-status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSession(await res.json());
      }
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [popoverOpen]);

  const isActive = session?.encryptionSessionActive ?? false;
  const isWarning = isActive && session!.expiresIn < 3600;

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <header
      className="fixed top-0 left-0 right-0 h-14 bg-slate-950/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-4 z-30"
      style={{ boxShadow: '0 1px 0 0 rgba(99,102,241,0.15), 0 4px 20px 0 rgba(0,0,0,0.4)' }}
    >
      <button
        onClick={onMenuClick}
        aria-label="Open menu"
        className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
      >
        <Menu className="w-6 h-6" />
      </button>

      <Link to="/" className="text-lg font-bold text-white">Memo</Link>

      <div className="flex items-center gap-3">
        {/* Encryption status indicator */}
        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => setPopoverOpen((v) => !v)}
            aria-label="Encryption status"
            className="p-1 transition-colors"
          >
            {isActive ? (
              <ShieldCheck
                className={`w-5 h-5 ${isWarning ? "text-amber-400" : "text-emerald-400"}`}
              />
            ) : (
              <ShieldAlert className="w-5 h-5 text-slate-500" />
            )}
          </button>

          {popoverOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-slate-700/50 rounded-xl p-4 shadow-xl"
              style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                {isActive ? (
                  <ShieldCheck
                    className={`w-5 h-5 ${isWarning ? "text-amber-400" : "text-emerald-400"}`}
                  />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-slate-500" />
                )}
                <span className="text-sm font-semibold text-white">
                  End-to-end encrypted
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-1">
                {isActive
                  ? `Session active: ${formatRemaining(session!.expiresIn)}`
                  : "Session expired — sign in to unlock"}
              </p>
              <p className="text-xs text-slate-500 mb-2">
                Only you can read your data
              </p>
              {!isActive && (
                <a
                  href="/login"
                  onClick={() => {
                    localStorage.removeItem("accessToken");
                    localStorage.removeItem("refreshToken");
                  }}
                  className="block w-full text-center text-xs font-medium py-1.5 rounded-lg text-white transition-opacity hover:opacity-90"
                  style={{
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  }}
                >
                  Sign in to unlock
                </a>
              )}
            </div>
          )}
        </div>

        <Link
          to="/profile"
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
          style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            boxShadow: '0 0 0 2px rgba(99,102,241,0.3)',
          }}
        >
          {initials}
        </Link>
      </div>
    </header>
  );
}
