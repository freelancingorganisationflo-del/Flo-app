# FLO — Freelancing Learning Organisation

Private, membership-based learning platform. Members work through skill modules; each module's assignment must be admin-approved before the next one unlocks.

## Stack

- **Frontend:** React 18 + TypeScript + Tailwind CSS + React Query
- **Backend:** Supabase (Postgres, Auth, Storage, Row Level Security)
- **Build tool:** Vite

## Running the app

```
npm run dev
```

The dev server starts on port 5000. The workflow "Start application" is configured to run this automatically.

## Required secrets

| Secret | Where to find it |
|--------|-----------------|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon/public key |

## First-time database setup

1. In your Supabase project, open **SQL Editor**.
2. Run `supabase/schema.sql` — creates all tables, indexes, RLS policies, and triggers.
3. Run `supabase/storage.sql` — creates the two storage buckets (`assignment-submissions`, `module-notes`).
4. *(Optional)* Run `supabase/seed.sql` to pre-populate the 6 skill tracks.

## Creating your first admin

1. Sign up through the app's `/signup` page.
2. In Supabase → Table Editor → `profiles`, change your `role` from `member` to `admin`.
3. Refresh — you'll land on `/admin`.

## Project structure

```
src/
  lib/            Supabase client, DB types, React Query client
  contexts/       AuthContext (session, profile, role)
  hooks/          React Query hooks per domain
  components/
    ui/           Reusable primitives (Card, Button, Badge, Modal…)
    layout/       Sidebar, Member/Admin shells, ProtectedRoute, ErrorBoundary
  pages/
    auth/         Login, Signup
    member/       Dashboard, Learning, ModuleDetail, Checkins, Resources, Leaderboard
    admin/        Dashboard, Members, Curriculum, Submissions, Checkins, Resources, Leaderboard
supabase/
  schema.sql      Tables, indexes, RLS, triggers
  storage.sql     Buckets + storage RLS
  seed.sql        Optional: 6 real skill tracks
```

## Deployment

See `DEPLOYMENT.md` for Vercel instructions.
