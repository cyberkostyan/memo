import { Link } from "react-router-dom";
import { Menu } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";

interface AppHeaderProps {
  onMenuClick: () => void;
}

export function AppHeader({ onMenuClick }: AppHeaderProps) {
  const { user } = useAuth();

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
    </header>
  );
}
