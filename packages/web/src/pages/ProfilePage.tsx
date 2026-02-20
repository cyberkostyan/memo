import { useState, useEffect, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api/client";
import { ReminderList } from "../components/reminders/ReminderList";
import { ReminderSheet } from "../components/reminders/ReminderSheet";
import { usePushSubscription } from "../hooks/usePushSubscription";
import { useReminders } from "../hooks/useReminders";
import type { ReminderResponse } from "@memo/shared";

export function ProfilePage() {
  const { user, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [editingReminder, setEditingReminder] = useState<ReminderResponse | null>(null);
  const { subscribed, subscribe } = usePushSubscription();
  const remindersState = useReminders();

  useEffect(() => {
    remindersState.fetchReminders();
  }, [remindersState.fetchReminders]);

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

  const handleAddReminder = async () => {
    if (!subscribed) {
      const ok = await subscribe();
      if (!ok) return;
    }
    setEditingReminder(null);
    setShowSheet(true);
  };

  const handleEditReminder = (reminder: ReminderResponse) => {
    setEditingReminder(reminder);
    setShowSheet(true);
  };

  const handleSheetClose = () => {
    setShowSheet(false);
    setEditingReminder(null);
  };

  return (
    <div className="px-4 pt-6 pb-20">
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
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg py-3 transition-colors"
        >
          {saved ? "Saved!" : saving ? "Saving..." : "Save"}
        </button>
      </form>

      {/* Reminders Section */}
      <div className="mt-8 pt-6 border-t border-slate-800 max-w-sm">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Reminders</h2>
        <ReminderList remindersState={remindersState} onAdd={handleAddReminder} onEdit={handleEditReminder} />
      </div>

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

      <div className="mt-8 pt-6 border-t border-slate-800">
        <p className="text-xs text-slate-500 mb-4">
          Member since{" "}
          {user?.createdAt
            ? new Date(user.createdAt).toLocaleDateString()
            : "..."}
        </p>
        <button
          onClick={logout}
          className="text-red-400 hover:text-red-300 text-sm font-medium"
        >
          Sign Out
        </button>
      </div>

      {showSheet && (
        <ReminderSheet
          editingReminder={editingReminder}
          onClose={handleSheetClose}
          onSaved={handleSheetClose}
          createReminder={remindersState.createReminder}
          updateReminder={remindersState.updateReminder}
        />
      )}
    </div>
  );
}
