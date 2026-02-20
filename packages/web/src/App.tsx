import { Routes, Route, Navigate, NavLink } from "react-router-dom";
import { Toaster } from "sonner";
import { useAuth } from "./auth/AuthContext";
import { LoginPage } from "./auth/LoginPage";
import { RegisterPage } from "./auth/RegisterPage";
import { HomePage } from "./pages/HomePage";
import { JournalPage } from "./pages/JournalPage";
import { ProfilePage } from "./pages/ProfilePage";
import { PrivacySettingsPage } from "./pages/PrivacySettingsPage";
import { PrivacyPolicyPage } from "./pages/PrivacyPolicyPage";
import { CookiePolicyPage } from "./pages/CookiePolicyPage";
import { ConsentBanner } from "./components/privacy/ConsentBanner";

export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Toaster theme="dark" position="top-center" />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/cookie-policy" element={<CookiePolicyPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Toaster theme="dark" position="top-center" />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings/privacy" element={<PrivacySettingsPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/cookie-policy" element={<CookiePolicyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur border-t border-slate-800 flex justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <TabLink to="/" icon="🏠" label="Home" />
        <TabLink to="/journal" icon="📖" label="Journal" />
        <TabLink to="/profile" icon="👤" label="Profile" />
      </nav>
      <ConsentBanner />
    </div>
  );
}

function TabLink({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex flex-col items-center gap-0.5 px-4 py-1 transition-colors ${
          isActive ? "text-indigo-400" : "text-slate-500"
        }`
      }
    >
      <span className="text-xl">{icon}</span>
      <span className="text-[10px] font-medium">{label}</span>
    </NavLink>
  );
}
