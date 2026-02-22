import { useLocation, useNavigate } from "react-router-dom";
import { Drawer } from "vaul";
import {
  CalendarDays,
  List,
  Sparkles,
  Bell,
  Shield,
  User,
  LogOut,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";

interface SidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NAV_ITEMS = [
  { to: "/", icon: CalendarDays, label: "Today" },
  { to: "/journal", icon: List, label: "Events" },
  { to: "/ai", icon: Sparkles, label: "AI Analysis" },
];

const SETTINGS_ITEMS = [
  { to: "/reminders", icon: Bell, label: "Reminders" },
  { to: "/settings/privacy", icon: Shield, label: "Privacy & Data" },
  { to: "/profile", icon: User, label: "Profile" },
];

export function Sidebar({ open, onOpenChange }: SidebarProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleNav = (to: string) => {
    navigate(to);
    onOpenChange(false);
  };

  const handleLogout = () => {
    onOpenChange(false);
    logout();
  };

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <Drawer.Root direction="left" open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Drawer.Content className="fixed left-0 top-0 bottom-0 z-50 w-[280px] bg-slate-900 border-r border-slate-800 flex flex-col outline-none">
          <Drawer.Title className="sr-only">Navigation menu</Drawer.Title>

          {/* User section */}
          <div className="px-4 pt-6 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  boxShadow: '0 0 0 2px rgba(99,102,241,0.3)',
                }}
              >
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user?.name || "User"}
                </p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
            </div>
          </div>

          {/* Main nav */}
          <nav className="flex-1 py-2 overflow-y-auto">
            <div className="px-2 space-y-0.5">
              {NAV_ITEMS.map((item) => (
                <SidebarItem
                  key={item.to}
                  {...item}
                  active={location.pathname === item.to}
                  onClick={() => handleNav(item.to)}
                />
              ))}
            </div>

            <div className="mx-4 my-2 border-t border-slate-800" />

            <div className="px-2 space-y-0.5">
              {SETTINGS_ITEMS.map((item) => (
                <SidebarItem
                  key={item.to}
                  {...item}
                  active={location.pathname === item.to}
                  onClick={() => handleNav(item.to)}
                />
              ))}
            </div>
          </nav>

          {/* Sign out */}
          <div className="p-2 border-t border-slate-800">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-red-400 hover:bg-slate-800/50 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm font-medium">Sign Out</span>
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-colors ${
        active
          ? "bg-slate-800 text-white"
          : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-300"
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
