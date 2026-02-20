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
    <header className="fixed top-0 left-0 right-0 h-14 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 flex items-center justify-between px-4 z-30">
      <button
        onClick={onMenuClick}
        aria-label="Open menu"
        className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
      >
        <Menu className="w-6 h-6" />
      </button>

      <span className="text-lg font-bold text-white">Memo</span>

      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-semibold text-white">
        {initials}
      </div>
    </header>
  );
}
