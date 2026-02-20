# Navigation Redesign: Hamburger Sidebar

## Goal

Replace the bottom tab bar with a hamburger sidebar navigation pattern — a fixed top header bar with a slide-in sidebar from the left.

## Why

- Bottom tab bar takes up screen space on a mobile-first health tracking app
- Visual appearance doesn't match the app's dark theme aesthetic
- Pattern doesn't scale well for 4-5+ navigation sections
- Hamburger sidebar is the standard mobile pattern for content-heavy apps

## Architecture

### Header Bar (Fixed Top)
- Fixed at top of viewport, `h-14`
- Left: hamburger icon (Menu from Lucide React) — opens sidebar
- Center: "Memo" app title
- Right: user avatar circle (initials fallback)
- Background: `bg-slate-900/95 backdrop-blur-sm`, bottom border `border-slate-800`
- Z-index above content, below sidebar overlay

### Sidebar (Slide-in Drawer)
- Uses Vaul `<Drawer>` with `direction="left"` (already in project dependencies)
- Width: `w-[280px]`
- Background: `bg-slate-900` with `border-r border-slate-800`
- Overlay: semi-transparent backdrop

### Sidebar Content
```
[User section — avatar + name + email]
─────────────────────────────
  Today          (CalendarDays)
  Events         (List)
─────────────────────────────
  Reminders      (Bell)
  Privacy & Data (Shield)
  Profile        (User)
─────────────────────────────
  Sign Out       (LogOut)
```

- Icons: Lucide React (already in dependencies or to be added)
- Active page: `bg-slate-800 text-white` highlight
- Inactive: `text-slate-400 hover:bg-slate-800/50`
- Sections separated by `border-t border-slate-800`
- Drawer closes on navigation (item click)

### Layout Changes
- Remove `BottomNav` component entirely
- Remove `pb-16/pb-20` padding from all pages (no longer needed for bottom nav)
- Add `pt-14` padding to main content area (for fixed header)
- Content area: full height minus header

## Components

| Component | Path | Purpose |
|-----------|------|---------|
| `AppHeader` | `components/layout/AppHeader.tsx` | Fixed top bar with hamburger, title, avatar |
| `Sidebar` | `components/layout/Sidebar.tsx` | Drawer content with nav items |
| `AppLayout` | `components/layout/AppLayout.tsx` | Wraps header + sidebar + content area |

## Tech Stack
- Vaul `<Drawer direction="left">` for sidebar
- Lucide React for icons
- React Router `useLocation()` for active page detection
- Existing auth context for user info (name, email)

## Data Flow
1. User taps hamburger icon -> Drawer opens
2. User taps nav item -> React Router navigates + Drawer closes
3. Active page determined by `useLocation().pathname`
4. User info (name/email/avatar) from auth context
