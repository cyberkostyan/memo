import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api/client";

export function ProfilePage() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ name: name || undefined }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 pt-6 pb-6">
      <h1 className="text-xl font-bold mb-6">Profile</h1>

      <form onSubmit={handleSave} className="space-y-4 max-w-sm">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Email</label>
          <input
            type="email"
            value={user?.email ?? ""}
            disabled
            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 text-slate-500 cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            placeholder="Your name"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full disabled:opacity-50 text-white font-medium rounded-lg py-3 transition-all duration-200 active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            boxShadow: '0 0 0 1px rgba(99,102,241,0.3), 0 4px 15px rgba(99,102,241,0.25)',
          }}
        >
          {saved ? "Saved!" : saving ? "Saving..." : "Save"}
        </button>
      </form>

      {/* Privacy & Data Section */}
      <div className="mt-8 pt-6 border-t border-slate-800 max-w-sm">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Privacy & Data</h2>
        <Link
          to="/settings/privacy"
          className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 hover:bg-slate-800 transition-colors"
        >
          <span className="text-sm text-white">Privacy Settings</span>
          <span className="text-slate-500">&rsaquo;</span>
        </Link>
      </div>
    </div>
  );
}
