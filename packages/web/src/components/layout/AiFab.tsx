import { useNavigate, useLocation } from "react-router-dom";
import { Sparkles } from "lucide-react";

export function AiFab() {
  const navigate = useNavigate();
  const location = useLocation();

  // Don't show on the AI page itself
  if (location.pathname === "/ai") return null;

  return (
    <button
      onClick={() => navigate("/ai")}
      className="fixed bottom-6 right-6 z-20 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg transition-transform active:scale-95"
      style={{
        background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
        boxShadow:
          "0 0 20px rgba(139, 92, 246, 0.4), 0 4px 12px rgba(0, 0, 0, 0.3)",
      }}
      aria-label="AI Analysis"
    >
      <Sparkles className="w-6 h-6" />
      {/* Pulsing glow ring */}
      <span
        className="absolute inset-0 rounded-full animate-ping"
        style={{
          background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
          opacity: 0.2,
          animationDuration: "2s",
        }}
      />
    </button>
  );
}
