# Navigation Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the inline bottom tab bar in App.tsx with a fixed header bar + slide-in hamburger sidebar using Vaul Drawer.

**Architecture:** Create three new layout components (AppHeader, Sidebar, AppLayout) that wrap the authenticated route tree. Remove the bottom nav entirely and replace `pb-20` padding with `pt-14` across all pages. Use Vaul `<Drawer direction="left">` for the sidebar (already in project deps).

**Tech Stack:** React 19, Vaul 1.1.2, lucide-react (new dep), React Router 7, Tailwind CSS 4

---

### Task 1: Install lucide-react

**Files:**
- Modify: `packages/web/package.json`

**Step 1: Install the dependency**

Run: `cd /Users/cyber_kostyan/git/AI/memo && pnpm add lucide-react --filter @memo/web`

Expected: lucide-react added to dependencies in packages/web/package.json

**Step 2: Verify installation**

Run: `cd /Users/cyber_kostyan/git/AI/memo && pnpm ls lucide-react --filter @memo/web`

Expected: lucide-react version listed

**Step 3: Commit**

```bash
git add packages/web/package.json pnpm-lock.yaml
git commit -m "chore: add lucide-react icon library"
```

---

### Task 2: Create Sidebar component

**Files:**
- Create: `packages/web/src/components/layout/Sidebar.tsx`

**Step 1: Create the Sidebar component**

Create `packages/web/src/components/layout/Sidebar.tsx` with this content:

```tsx
import { useLocation, useNavigate } from "react-router-dom";
import { Drawer } from "vaul";
import {
  CalendarDays,
  List,
  Bell,
  Shield,
  User,
  LogOut,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";

interface SidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NAV_ITEMS = [
  { to: "/", icon: CalendarDays, label: "Today" },
  { to: "/journal", icon: List, label: "Events" },
];

const SETTINGS_ITEMS = [
  { to: "/reminders", icon: Bell, label: "Reminders" },
  { to: "/settings/privacy", icon: Shield, label: "Privacy & Data" },
  { to: "/profile", icon: User, label: "Profile" },
];

export function Sidebar({ open, onOpenChange }: SidebarProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleNav = (to: string) => {
    navigate(to);
    onOpenChange(false);
  };

  const handleLogout = () => {
    onOpenChange(false);
    logout();
  };

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <Drawer.Root direction="left" open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Drawer.Content className="fixed left-0 top-0 bottom-0 z-50 w-[280px] bg-slate-900 border-r border-slate-800 flex flex-col outline-none">
          <Drawer.Title className="sr-only">Navigation menu</Drawer.Title>

          {/* User section */}
          <div className="px-4 pt-6 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-semibold text-white shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user?.name || "User"}
                </p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
            </div>
          </div>

          {/* Main nav */}
          <nav className="flex-1 py-2 overflow-y-auto">
            <div className="px-2 space-y-0.5">
              {NAV_ITEMS.map((item) => (
                <SidebarItem
                  key={item.to}
                  {...item}
                  active={location.pathname === item.to}
                  onClick={() => handleNav(item.to)}
                />
              ))}
            </div>

            <div className="mx-4 my-2 border-t border-slate-800" />

            <div className="px-2 space-y-0.5">
              {SETTINGS_ITEMS.map((item) => (
                <SidebarItem
                  key={item.to}
                  {...item}
                  active={location.pathname === item.to}
                  onClick={() => handleNav(item.to)}
                />
              ))}
            </div>
          </nav>

          {/* Sign out */}
          <div className="p-2 border-t border-slate-800">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-red-400 hover:bg-slate-800/50 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm font-medium">Sign Out</span>
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-colors ${
        active
          ? "bg-slate-800 text-white"
          : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-300"
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/cyber_kostyan/git/AI/memo && pnpm --filter @memo/web exec tsc --noEmit`

Expected: No errors (component is not wired up yet, but types should check out)

**Step 3: Commit**

```bash
git add packages/web/src/components/layout/Sidebar.tsx
git commit -m "feat: add Sidebar navigation component with Vaul drawer"
```

---

### Task 3: Create AppHeader component

**Files:**
- Create: `packages/web/src/components/layout/AppHeader.tsx`

**Step 1: Create the AppHeader component**

Create `packages/web/src/components/layout/AppHeader.tsx` with this content:

```tsx
import { Menu } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";

interface AppHeaderProps {
  onMenuClick: () => void;
}

export function AppHeader({ onMenuClick }: AppHeaderProps) {
  const { user } = useAuth();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 flex items-center justify-between px-4 z-30">
      <button
        onClick={onMenuClick}
        aria-label="Open menu"
        className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
      >
        <Menu className="w-6 h-6" />
      </button>

      <span className="text-lg font-bold text-white">Memo</span>

      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-semibold text-white">
        {initials}
      </div>
    </header>
  );
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/cyber_kostyan/git/AI/memo && pnpm --filter @memo/web exec tsc --noEmit`

Expected: No errors

**Step 3: Commit**

```bash
git add packages/web/src/components/layout/AppHeader.tsx
git commit -m "feat: add AppHeader component with hamburger menu button"
```

---

### Task 4: Create AppLayout component

**Files:**
- Create: `packages/web/src/components/layout/AppLayout.tsx`

**Step 1: Create the AppLayout wrapper**

Create `packages/web/src/components/layout/AppLayout.tsx` with this content:

```tsx
import { useState, type ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { Sidebar } from "./Sidebar";

export function AppLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
      <main className="flex-1 pt-14">{children}</main>
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/cyber_kostyan/git/AI/memo && pnpm --filter @memo/web exec tsc --noEmit`

Expected: No errors

**Step 3: Commit**

```bash
git add packages/web/src/components/layout/AppLayout.tsx
git commit -m "feat: add AppLayout wrapper with header and sidebar"
```

---

### Task 5: Wire AppLayout into App.tsx and remove bottom nav

**Files:**
- Modify: `packages/web/src/App.tsx`

This is the critical integration step. We need to:
1. Import `AppLayout`
2. Wrap the authenticated Routes in `<AppLayout>`
3. Remove the `<nav>` bottom tab bar and the `TabLink` component entirely
4. Remove the outer `<div className="min-h-screen flex flex-col">` (moved into AppLayout)

**Step 1: Replace the authenticated section of App.tsx**

Replace the entire return block for authenticated users (lines 40-63) and remove the `TabLink` function (lines 66-81) with:

```tsx
// Add import at top:
import { AppLayout } from "./components/layout/AppLayout";

// Replace the authenticated return (lines 40-63):
  return (
    <>
      <Toaster theme="dark" position="top-center" />
      <AppLayout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/reminders" element={<ProfilePage />} />
          <Route path="/settings/privacy" element={<PrivacySettingsPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/cookie-policy" element={<CookiePolicyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppLayout>
      <ConsentBanner />
    </>
  );

// Delete the TabLink function entirely (lines 66-81)
```

Note: `/reminders` route temporarily points to ProfilePage (reminders section lives there). We can create a dedicated RemindersPage later if needed.

**Step 2: Remove unused imports**

Remove `NavLink` from the react-router-dom import since `TabLink` is deleted:

```tsx
import { Routes, Route, Navigate } from "react-router-dom";
```

**Step 3: Verify it compiles**

Run: `cd /Users/cyber_kostyan/git/AI/memo && pnpm --filter @memo/web exec tsc --noEmit`

Expected: No errors

**Step 4: Commit**

```bash
git add packages/web/src/App.tsx
git commit -m "feat: wire AppLayout into App.tsx, remove bottom tab bar"
```

---

### Task 6: Remove pb-20 padding from all pages

**Files:**
- Modify: `packages/web/src/pages/HomePage.tsx:36` — change `pb-20` to remove it
- Modify: `packages/web/src/pages/ProfilePage.tsx:60` — change `pb-20` to remove it
- Modify: `packages/web/src/pages/PrivacySettingsPage.tsx:101,108` — change `pb-20` to remove it (2 occurrences)
- Modify: `packages/web/src/pages/PrivacyPolicyPage.tsx:5` — change `pb-20` to remove it
- Modify: `packages/web/src/pages/CookiePolicyPage.tsx:5` — change `pb-20` to remove it
- Modify: `packages/web/src/components/journal/JournalView.tsx:67` — change `pb-20` to remove it

The bottom nav is gone, so `pb-20` bottom padding is no longer needed. Remove it from every page.

**Step 1: Update each file**

For each file listed above, find the `pb-20` class and remove it from the className string.

Specific changes:

- `HomePage.tsx:36`: `<div className="pb-20">` → `<div>`
- `ProfilePage.tsx:60`: `className="px-4 pt-6 pb-20"` → `className="px-4 pt-6 pb-6"`
- `PrivacySettingsPage.tsx:101`: `className="px-4 pt-6 pb-20"` → `className="px-4 pt-6 pb-6"`
- `PrivacySettingsPage.tsx:108`: `className="px-4 pt-6 pb-20"` → `className="px-4 pt-6 pb-6"`
- `PrivacyPolicyPage.tsx:5`: `className="px-4 pt-6 pb-20 max-w-2xl mx-auto"` → `className="px-4 pt-6 pb-6 max-w-2xl mx-auto"`
- `CookiePolicyPage.tsx:5`: `className="px-4 pt-6 pb-20 max-w-2xl mx-auto"` → `className="px-4 pt-6 pb-6 max-w-2xl mx-auto"`
- `JournalView.tsx:67`: `className="pb-20"` → remove `pb-20` (keep other classes if any, or remove attribute if sole class)

Note: We keep a small `pb-6` for comfortable bottom spacing, but the large `pb-20` that compensated for the bottom nav is no longer needed.

**Step 2: Verify it compiles**

Run: `cd /Users/cyber_kostyan/git/AI/memo && pnpm --filter @memo/web exec tsc --noEmit`

Expected: No errors

**Step 3: Commit**

```bash
git add packages/web/src/pages/HomePage.tsx packages/web/src/pages/ProfilePage.tsx packages/web/src/pages/PrivacySettingsPage.tsx packages/web/src/pages/PrivacyPolicyPage.tsx packages/web/src/pages/CookiePolicyPage.tsx packages/web/src/components/journal/JournalView.tsx
git commit -m "fix: remove pb-20 bottom padding now that bottom nav is gone"
```

---

### Task 7: Clean up ProfilePage — remove Sign Out button and redundant sections

**Files:**
- Modify: `packages/web/src/pages/ProfilePage.tsx`

Since Sign Out is now in the sidebar, and Privacy & Data is accessible from the sidebar menu, these can be removed from the Profile page.

**Step 1: Remove the Sign Out section from ProfilePage**

In `packages/web/src/pages/ProfilePage.tsx`, remove the last `<div>` block (lines 112-125) that contains:
- "Member since" text
- "Sign Out" button

Also remove the `logout` destructuring from `useAuth()` call (line 12) since it's no longer used here:

```tsx
// Change from:
const { user, logout } = useAuth();
// To:
const { user } = useAuth();
```

Keep the Privacy & Data section for now (it provides a useful shortcut), but remove the Sign Out button since it lives in the sidebar now.

**Step 2: Verify it compiles**

Run: `cd /Users/cyber_kostyan/git/AI/memo && pnpm --filter @memo/web exec tsc --noEmit`

Expected: No errors

**Step 3: Commit**

```bash
git add packages/web/src/pages/ProfilePage.tsx
git commit -m "refactor: remove Sign Out from ProfilePage (moved to sidebar)"
```

---

### Task 8: Update ConsentBanner positioning

**Files:**
- Modify: `packages/web/src/components/privacy/ConsentBanner.tsx`

The ConsentBanner was positioned at `bottom-16` to sit above the bottom tab bar. Now that the bottom nav is gone, it should be at `bottom-0`.

**Step 1: Find and check current positioning**

Read `packages/web/src/components/privacy/ConsentBanner.tsx` and find the `bottom-16` class.

**Step 2: Update the position**

Change `bottom-16` to `bottom-0` in the banner's container className.

**Step 3: Verify it compiles**

Run: `cd /Users/cyber_kostyan/git/AI/memo && pnpm --filter @memo/web exec tsc --noEmit`

Expected: No errors

**Step 4: Commit**

```bash
git add packages/web/src/components/privacy/ConsentBanner.tsx
git commit -m "fix: move ConsentBanner to bottom-0 now that bottom nav is removed"
```

---

### Task 9: Full build verification

**Files:** None (verification only)

**Step 1: Run TypeScript check**

Run: `cd /Users/cyber_kostyan/git/AI/memo && pnpm --filter @memo/web exec tsc --noEmit`

Expected: No errors

**Step 2: Run full build**

Run: `cd /Users/cyber_kostyan/git/AI/memo && pnpm --filter @memo/web build`

Expected: Build succeeds with no errors

**Step 3: Verify no remaining references to old navigation**

Search for `TabLink`, `NavLink` in App.tsx, and `pb-20` across all page files to make sure nothing was missed.

Run: `grep -r "TabLink\|pb-20" packages/web/src/`

Expected: No results (or only in test files / comments)
