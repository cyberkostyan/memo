import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ReminderList } from "../components/reminders/ReminderList";
import { ReminderSheet } from "../components/reminders/ReminderSheet";
import { usePushSubscription } from "../hooks/usePushSubscription";
import { useReminders } from "../hooks/useReminders";
import { useOnline } from "../contexts/OnlineContext";
import type { ReminderResponse } from "@memo/shared";

export function RemindersPage() {
  const [showSheet, setShowSheet] = useState(false);
  const [editingReminder, setEditingReminder] = useState<ReminderResponse | null>(null);
  const { subscribed, subscribe } = usePushSubscription();
  const remindersState = useReminders();
  const { isOnline } = useOnline();

  useEffect(() => {
    remindersState.fetchReminders();
  }, [remindersState.fetchReminders]);

  const handleAdd = async () => {
    if (!isOnline) {
      toast.error("This feature requires an internet connection");
      return;
    }
    if (!subscribed) {
      const ok = await subscribe();
      if (!ok) return;
    }
    setEditingReminder(null);
    setShowSheet(true);
  };

  const handleEdit = (reminder: ReminderResponse) => {
    if (!isOnline) {
      toast.error("This feature requires an internet connection");
      return;
    }
    setEditingReminder(reminder);
    setShowSheet(true);
  };

  const handleSheetClose = () => {
    setShowSheet(false);
    setEditingReminder(null);
  };

  return (
    <div className="px-4 pt-6 pb-6">
      <h1 className="text-xl font-bold mb-6">Reminders</h1>

      <div className="max-w-sm">
        <ReminderList remindersState={remindersState} onAdd={handleAdd} onEdit={handleEdit} />
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
