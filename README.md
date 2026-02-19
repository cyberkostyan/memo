# Memo

A personal health & wellness tracker designed as a mobile-first PWA. Log meals, mood, symptoms, medication, exercise, water intake, sleep, and more — all from a quick-tap interface.

## Features

- **Quick Entry Grid** — tap to log an event instantly, long-press to add details (notes, rating, category-specific fields)
- **Journal View** — browse past entries in a timeline, filter by category and date range
- **Category-Specific Details** — each event type has its own structured fields:
  - Meal (type, items, amount) · Stool (Bristol scale, color) · Mood (emotion, intensity) · Symptom (name, severity, location) · Medication (name, dose) · Exercise (type, duration, intensity) · Water (amount) · Sleep (hours, quality)
- **Auth** — JWT-based registration/login with refresh token rotation
- **PWA-ready** — installable on mobile with `manifest.json` and mobile-optimized UI

## Tech Stack

| Layer    | Tech                                                        |
|----------|-------------------------------------------------------------|
| Frontend | React 19, Vite, Tailwind CSS 4, Motion, Vaul, Radix UI     |
| Backend  | NestJS 11, Passport JWT, bcrypt                             |
| Database | PostgreSQL 16, Prisma ORM                                   |
| Shared   | Zod schemas, TypeScript, pnpm workspaces                    |

## Project Structure

```
memo/
├── packages/
│   ├── api/          # NestJS backend
│   ├── web/          # React + Vite frontend
│   └── shared/       # Zod DTOs, event types, shared interfaces
├── prisma/           # Schema & migrations
├── docker-compose.yml
└── pnpm-workspace.yaml
```

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker (for PostgreSQL)

### Setup

```bash
# Clone the repo
git clone https://github.com/cyberkostyan/memo.git
cd memo

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your own secrets

# Start PostgreSQL
docker compose up -d

# Run migrations & generate Prisma client
pnpm prisma:migrate
pnpm prisma:generate

# Start dev servers (API + Web)
pnpm dev
```

The web app runs at `http://localhost:5173` and the API at `http://localhost:3000`.

## API Endpoints

| Method | Path               | Description           |
|--------|--------------------|-----------------------|
| POST   | `/auth/register`   | Create account        |
| POST   | `/auth/login`      | Login                 |
| POST   | `/auth/refresh`    | Refresh access token  |
| POST   | `/auth/logout`     | Revoke refresh token  |
| GET    | `/users/me`        | Get current user      |
| PATCH  | `/users/me`        | Update profile        |
| POST   | `/events`          | Create event          |
| GET    | `/events`          | List events (filtered)|
| GET    | `/events/:id`      | Get single event      |
| PATCH  | `/events/:id`      | Update event          |
| DELETE | `/events/:id`      | Delete event          |

All `/events` and `/users` endpoints require a `Bearer` token in the `Authorization` header.

## License

MIT
