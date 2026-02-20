# Reminders Feature Design

## Overview

Server-side push notification reminders for the Memo health tracker. Two types: scheduled reminders (daily time or repeating interval) and inactivity reminders (no event logged for N hours). Delivered via Web Push through a Service Worker.

## Architecture

```
[Frontend]                            [Backend]
ProfilePage
  └─ RemindersSection                 ReminderController
     ├─ Enable Push (permission)        ├─ CRUD /reminders
     ├─ List reminders                  └─ POST /push/subscribe
     ├─ Create/Edit/Delete
     └─ Toggle on/off                PushService (web-push + VAPID)

Service Worker ◄──── Web Push ◄──── ReminderCronService (@nestjs/schedule)
  └─ show notification                 ├─ every 60s: check reminders
                                       ├─ scheduled: time match or interval elapsed
                                       ├─ inactivity: no event for N minutes
                                       └─ send push via PushService
```

## Data Model

### Reminder table

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| userId | UUID (FK) | Owner |
| type | String | "scheduled" or "inactivity" |
| label | String | Display name ("Take Vitamin D") |
| category | String? | EventCategory (for inactivity checks) |
| scheduleType | String? | "daily" or "interval" (for scheduled type) |
| time | String? | "09:00" (for daily) |
| intervalMin | Int? | Minutes between reminders (for interval) |
| inactivityMin | Int? | Minutes without event before reminding |
| activeFrom | String | Start of active window (default "08:00") |
| activeTo | String | End of active window (default "22:00") |
| enabled | Boolean | Toggle (default true) |
| timezone | String | IANA timezone from device |
| lastSentAt | DateTime? | Prevents duplicate sends |

Indexes: `(userId, enabled)`

### PushSubscription table

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| userId | UUID (FK) | Owner |
| endpoint | String (unique) | Push endpoint URL |
| p256dh | String | Client public key |
| auth | String | Auth secret |

Index: `(userId)`

One user can have multiple push subscriptions (multiple devices/browsers).

## Reminder Types

### Scheduled — Daily

Fires once per day at the specified `time` in the user's timezone.
Example: "Take Vitamin D" at 09:00 every day.

### Scheduled — Interval

Fires every `intervalMin` minutes, but only within the active window (activeFrom—activeTo).
Example: "Track mood" every 4 hours between 08:00-22:00.

### Inactivity

Fires when no event with the specified `category` has been logged for `inactivityMin` minutes, but only within the active window.
Example: "Drink water" if no water event logged for 2 hours.

## Cron Logic (every 60 seconds)

```
1. Fetch all enabled reminders (join with PushSubscription)
2. For each reminder:
   a. Calculate "now" in user's timezone
   b. Check active window (activeFrom <= now <= activeTo), skip if outside
   c. If type = "scheduled":
      - daily: current HH:MM == reminder.time AND not already sent today
      - interval: (now - lastSentAt) >= intervalMin
   d. If type = "inactivity":
      - Query last Event with matching category for this user
      - (now - lastEvent.timestamp) >= inactivityMin AND (now - lastSentAt) >= inactivityMin
   e. If should fire → send Web Push to all user's subscriptions → update lastSentAt
```

## Preset Templates

| Template | Type | Category | Default Schedule |
|----------|------|----------|-----------------|
| Drink water | inactivity | water | 120 min without event |
| Take medication | scheduled (daily) | medication | daily at 09:00 |
| Log meals | inactivity | meal | 240 min without event |
| Track mood | scheduled (interval) | mood | every 240 min |

User picks a template, can customize schedule and active window, then saves.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /reminders | Yes | List user's reminders |
| POST | /reminders | Yes | Create reminder |
| PATCH | /reminders/:id | Yes | Update reminder |
| DELETE | /reminders/:id | Yes | Delete reminder |
| POST | /push/subscribe | Yes | Register push subscription |
| DELETE | /push/subscribe | Yes | Remove push subscription |

## Frontend UI

### Reminders section on Profile page

```
🔔 Reminders
┌──────────────────────────────────┐
│ 💧 Drink water          [ON/OFF]│
│    inactivity · every 2h         │
│ 💊 Take Vitamin D       [ON/OFF]│
│    daily · 09:00                 │
│ 😊 Track mood           [ON/OFF]│
│    interval · every 4h           │
└──────────────────────────────────┘
[+ Add Reminder]
```

### Add/Edit Reminder (bottom sheet)

1. Pick template or "Custom"
2. Set type (scheduled/inactivity)
3. Configure time/interval
4. Set active window (from/to)
5. Save

### Push permission flow

On first reminder creation, if no push subscription exists:
1. Show explanation: "Memo needs notification permission to send reminders"
2. Request browser permission (Notification.requestPermission)
3. Register Service Worker
4. Create push subscription (PushManager.subscribe with VAPID public key)
5. Send subscription to backend (POST /push/subscribe)

## Service Worker

Minimal Service Worker for push handling:

```javascript
// Handle incoming push
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Memo", {
      body: data.body,
      icon: "/favicon.svg",
      data: { url: "/" },
    })
  );
});

// Handle notification click — open app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url ?? "/"));
});
```

## Dependencies

**Backend:**
- `@nestjs/schedule` — cron scheduler
- `web-push` — Web Push protocol (VAPID)

**Frontend:**
- Service Worker (vanilla JS, no library)

**Environment variables:**
- `VAPID_PUBLIC_KEY` — public VAPID key
- `VAPID_PRIVATE_KEY` — private VAPID key
- `VAPID_EMAIL` — contact email for VAPID

## Files to Create/Modify

### New files (backend):
- `packages/api/src/reminders/reminders.module.ts`
- `packages/api/src/reminders/reminders.controller.ts`
- `packages/api/src/reminders/reminders.service.ts`
- `packages/api/src/push/push.module.ts`
- `packages/api/src/push/push.controller.ts`
- `packages/api/src/push/push.service.ts`
- `packages/api/src/reminders/reminder-cron.service.ts`

### New files (frontend):
- `packages/web/public/sw.js` — Service Worker
- `packages/web/src/components/reminders/ReminderList.tsx`
- `packages/web/src/components/reminders/ReminderSheet.tsx`
- `packages/web/src/hooks/useReminders.ts`
- `packages/web/src/hooks/usePushSubscription.ts`

### Modified files:
- `prisma/schema.prisma` — add Reminder and PushSubscription models
- `packages/api/src/app.module.ts` — register RemindersModule, PushModule, ScheduleModule
- `packages/shared/src/dto/index.ts` — add reminder DTOs
- `packages/web/src/pages/ProfilePage.tsx` — add RemindersSection
- `.env.example` — add VAPID variables

## Error Handling

- Push subscription expired/invalid → remove from DB, log warning
- Notification permission denied → show message explaining why reminders won't work
- Cron failure → log error, continue to next reminder (don't block entire batch)
- No events found for inactivity check → treat as "never logged" → send reminder

## Decisions Made

- **Server-side cron** over client-side: reliable delivery when app is closed
- **Web Push** over alternatives: works across browsers (Chrome, Firefox, Safari 16+)
- **60-second cron interval**: good balance of timeliness vs. DB load
- **Active window**: prevents unwanted notifications at night
- **Multiple subscriptions per user**: supports multiple devices
- **Preset templates**: lower friction for getting started
