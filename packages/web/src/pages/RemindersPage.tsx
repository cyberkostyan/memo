import { useState, useEffect } from "react";
import { ReminderList } from "../components/reminders/ReminderList";
import { ReminderSheet } from "../components/reminders/ReminderSheet";
import { usePushSubscription } from "../hooks/usePushSubscription";
import { useReminders } from "../hooks/useReminders";
import type { ReminderResponse } from "@memo/shared";

export function RemindersPage() {
  const [showSheet, setShowSheet] = useState(false);
  const [editingReminder, setEditingReminder] = useState<ReminderResponse | null>(null);
  const { subscribed, subscribe } = usePushSubscription();
  const remindersState = useReminders();

  useEffect(() => {
    remindersState.fetchReminders();
  }, [remindersState.fetchReminders]);

  const handleAdd = async () => {
    if (!subscribed) {
      const ok = await subscribe();
      if (!ok) return;
    }
    setEditingReminder(null);
    setShowSheet(true);
  };

  const handleEdit = (reminder: ReminderResponse) => {
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
