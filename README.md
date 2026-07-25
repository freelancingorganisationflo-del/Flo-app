# FLO — Freelancing Learning Organisation

Private, membership-based learning platform. Members work through skill
modules; each module's assignment must be admin-approved before the next
one unlocks. Built with React + TypeScript + Tailwind + React Query on
Supabase (Postgres, Auth, Storage, Row Level Security).

Client project tracking was intentionally **left out** of this build, per
the "no client system in v1" decision — everything here is scoped to the
member learning loop.

---

## 1. Prerequisites

- Node.js 18+ and npm
- A free [Supabase](https://supabase.com) project
- A [Vercel](https://vercel.com) account (for deployment — optional for local dev)

---

## 2. Set up the database

1. In your Supabase project, open **SQL Editor**.
2. Run `supabase/schema.sql` — creates every table, index, RLS policy, and
   the trigger functions that handle module unlocking, notifications, and
   the 3-members-per-skill cap.
3. Run `supabase/storage.sql` — creates the two storage buckets
   (`assignment-submissions`, `module-notes`) and their access policies.
4. *(Optional)* Run `supabase/seed.sql` to pre-populate the 6 skill tracks
   already used in the product (AI Video Editing, Brand-Level Design, etc).
   Skip it if you'd rather add skills yourself from the Admin → Curriculum
   screen — the schema doesn't require it.

These three files are idempotent — safe to re-run if you need to.

---

## 3. Environment variables

```bash
cp .env.example .env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from
**Project Settings → API** in your Supabase dashboard. Never commit `.env`.

---

## 4. Install and run

```bash
npm install
npm run dev
```

Visit `http://localhost:5173`.

---

## 5. Create your first admin

Every new signup becomes a `member` by default (see the `handle_new_user`
trigger) — there's no signup flow for admins, by design. To create your
first admin:

1. Sign up normally through the app's `/signup` page.
2. In Supabase → **Table Editor → profiles**, find your row and change
   `role` from `member` to `admin`.
3. Refresh the app — you'll land on `/admin` from then on.

From there, use the Admin panel to promote/manage everything else.

---

## 6. Manual QA checklist

No automated test suite is included yet (ask if you'd like one added with
Vitest + React Testing Library). Before shipping, walk through:

- [ ] Sign up a new member → confirm email → profile row appears with `role='member'`
- [ ] As admin, assign the member a skill → confirm the **first module auto-unlocks**
      (check `learning_progress`)
- [ ] Try assigning a 4th member to a skill already at 3 → should be rejected
- [ ] As the member, open the unlocked module → lecture/notes/assignment all visible;
      the *next* module should still show 🔒 locked and not be openable
- [ ] Submit an assignment file → appears in Admin → Submissions as "Pending"
- [ ] Approve it → member gets a notification, module marked completed, next
      module auto-unlocks with its own notification
- [ ] Reject / "needs improvement" → member sees feedback, can resubmit
- [ ] Submit a weekly check-in → visible to admin; admin feedback round-trips back
- [ ] Leaderboard reflects completed modules + approved assignments, ranked
      within the member's own skill only
- [ ] A member cannot query another member's submissions, progress, or
      check-ins directly via the Supabase client (RLS should block it —
      try it from the browser console with the anon key)

---

## 7. Project structure

```
src/
  lib/            Supabase client, generated-style DB types, React Query client
  contexts/       AuthContext (session, profile, role)
  hooks/          One file per domain — React Query hooks wrapping Supabase calls
  components/
    ui/           Reusable primitives (Card, Button, Badge, Modal, ProgressBar…)
    layout/       Sidebar, Member/Admin shells, ProtectedRoute, ErrorBoundary
  pages/
    auth/         Login, Signup
    member/       Dashboard, Learning (roadmap), ModuleDetail, Checkins, Resources, Leaderboard
    admin/        Dashboard, Members, Curriculum, Submissions, Checkins, Resources, Leaderboard
supabase/
  schema.sql      Tables, indexes, RLS, triggers
  storage.sql     Buckets + storage RLS
  seed.sql        Optional: the 6 real skill tracks
```

See `DEPLOYMENT.md` for shipping to Vercel.
