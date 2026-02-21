import { useNavigate } from "react-router-dom";
import { Sparkles, Shield } from "lucide-react";

export function ConsentRequired() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4">
        <Sparkles className="w-8 h-8 text-indigo-400" />
      </div>

      <h2 className="text-lg font-semibold text-white mb-2">
        Enable AI Analysis
      </h2>

      <p className="text-sm text-slate-400 max-w-xs mb-6">
        To use AI-powered health analysis, you need to enable data sharing
        in your privacy settings. Your data is sent to OpenAI for analysis
        and is not stored by the AI provider.
      </p>

      <button
        onClick={() => navigate("/settings/privacy")}
        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl px-6 py-3 transition-colors"
      >
        <Shield className="w-4 h-4" />
        Open Privacy Settings
      </button>
    </div>
  );
}
