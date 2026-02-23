import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email, newPassword }),
      });
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Password reset failed",
      );
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-3xl font-bold mb-2">Memo</h1>
          <p className="text-slate-400 mb-8">Password Reset</p>

          <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-lg p-4 mb-6">
            Your password has been reset successfully. All previous health data
            has been deleted.
          </div>

          <Link
            to="/login"
            className="text-indigo-400 hover:text-indigo-300 text-sm"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center mb-2">Memo</h1>
        <p className="text-slate-400 text-center mb-8">Reset Password</p>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-6">
          <p className="text-amber-400 font-semibold text-sm mb-2">
            Warning
          </p>
          <p className="text-amber-300/80 text-sm leading-relaxed">
            Resetting your password will permanently delete all your health
            data, including events, attachments, and analysis history. This
            cannot be undone.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">
              {error}
            </div>
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />

          <input
            type="password"
            placeholder="New password (min 6 chars)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full disabled:opacity-50 text-white font-medium rounded-lg py-3 transition-all duration-200 active:scale-[0.98]"
            style={{
              background:
                "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
              boxShadow:
                "0 0 0 1px rgba(220,38,38,0.3), 0 4px 15px rgba(220,38,38,0.25)",
            }}
          >
            {loading
              ? "Resetting..."
              : "Reset password and delete data"}
          </button>
        </form>

        <p className="text-center text-slate-400 text-sm mt-6">
          <Link
            to="/login"
            className="text-indigo-400 hover:text-indigo-300"
          >
            Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
