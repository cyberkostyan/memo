import { useState, useCallback } from "react";
import { api } from "../api/client";
import type { ReminderResponse, CreateReminderDto, UpdateReminderDto } from "@memo/shared";

export function useReminders() {
  const [reminders, setReminders] = useState<ReminderResponse[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReminders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<ReminderResponse[]>("/reminders");
      setReminders(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const createReminder = useCallback(async (dto: CreateReminderDto) => {
    const reminder = await api<ReminderResponse>("/reminders", {
      method: "POST",
      body: JSON.stringify(dto),
    });
    setReminders((prev) => [...prev, reminder]);
    return reminder;
  }, []);

  const updateReminder = useCallback(async (id: string, dto: UpdateReminderDto) => {
    const reminder = await api<ReminderResponse>(`/reminders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(dto),
    });
    setReminders((prev) => prev.map((r) => (r.id === id ? reminder : r)));
    return reminder;
  }, []);

  const deleteReminder = useCallback(async (id: string) => {
    await api(`/reminders/${id}`, { method: "DELETE" });
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { reminders, loading, fetchReminders, createReminder, updateReminder, deleteReminder };
}
