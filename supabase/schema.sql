-- ============================================================================
-- FLO — Freelancing Learning Organisation
-- Production Supabase schema: tables, indexes, RLS policies, triggers.
--
-- Run once against a fresh Supabase project (SQL Editor, or `supabase db
-- push`). Statements are ordered so every foreign key already exists.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. SKILLS  (each skill track holds at most `member_capacity` members)
-- ============================================================================
create table if not exists skills (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  label           text not null,
  icon            text,
  tools           text,
  description     text,
  member_capacity int not null default 3,
  order_index     int not null default 0,
  created_at      timestamptz not null default now()
);

-- ============================================================================
-- 2. PROFILES  (one row per auth.users row — admins and members)
-- ============================================================================
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  role        text not null default 'member' check (role in ('admin','member')),
  skill_id    uuid references skills(id) on delete set null,
  phone       text,
  avatar_url  text,
  status      text not null default 'active' check (status in ('active','at_risk','inactive')),
  joined_at   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- 3. MODULES  (ordered curriculum within a skill)
-- ============================================================================
create table if not exists modules (
  id          uuid primary key default gen_random_uuid(),
  skill_id    uuid not null references skills(id) on delete cascade,
  title       text not null,
  description text,
  order_index int not null,
  created_at  timestamptz not null default now(),
  unique (skill_id, order_index)
);

-- ============================================================================
-- 4. LECTURES  (video lectures attached to a module)
-- ============================================================================
create table if not exists lectures (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references modules(id) on delete cascade,
  title       text not null,
  video_url   text,
  order_index int not null default 0,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- 5. NOTES  (written material / PDFs attached to a module)
-- ============================================================================
create table if not exists notes (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references modules(id) on delete cascade,
  title       text not null,
  content     text,
  file_url    text,
  order_index int not null default 0,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- 6. ASSIGNMENTS  (one practical assignment per module)
-- ============================================================================
create table if not exists assignments (
  id           uuid primary key default gen_random_uuid(),
  module_id    uuid not null unique references modules(id) on delete cascade,
  title        text not null,
  instructions text,
  created_at   timestamptz not null default now()
);

-- ============================================================================
-- 7. ASSIGNMENT SUBMISSIONS  (a member may resubmit; latest row wins)
-- ============================================================================
create table if not exists assignment_submissions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  member_id     uuid not null references profiles(id) on delete cascade,
  file_url      text not null,
  file_type     text,
  status        text not null default 'pending'
                  check (status in ('pending','approved','needs_improvement','rejected')),
  feedback      text,
  submitted_at  timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid references profiles(id)
);

-- ============================================================================
-- 8. LEARNING PROGRESS  (per member, per module)
-- ============================================================================
create table if not exists learning_progress (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references profiles(id) on delete cascade,
  module_id    uuid not null references modules(id) on delete cascade,
  status       text not null default 'locked' check (status in ('locked','unlocked','completed')),
  unlocked_at  timestamptz,
  completed_at timestamptz,
  unique (member_id, module_id)
);

-- ============================================================================
-- 9. WEEKLY CHECK-INS
-- ============================================================================
create table if not exists weekly_checkins (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references profiles(id) on delete cascade,
  week_number     int not null,
  what_learned    text,
  what_completed  text,
  problems_faced  text,
  admin_feedback  text,
  submitted_at    timestamptz not null default now(),
  unique (member_id, week_number)
);

-- ============================================================================
-- 10. NOTIFICATIONS
-- ============================================================================
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  type       text not null check (type in
               ('new_lecture','assignment_feedback','module_unlocked','weekly_reminder','general')),
  title      text not null,
  message    text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 11. RESOURCES  (shared library — AI tools, templates, fonts, icons, prompts)
-- ============================================================================
create table if not exists resources (
  id          uuid primary key default gen_random_uuid(),
  category    text not null check (category in
                ('ai_tools','templates','fonts','icons','prompt_library','websites')),
  title       text not null,
  url         text,
  description text,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
create index if not exists idx_profiles_skill        on profiles(skill_id);
create index if not exists idx_modules_skill          on modules(skill_id, order_index);
create index if not exists idx_lectures_module        on lectures(module_id, order_index);
create index if not exists idx_notes_module           on notes(module_id, order_index);
create index if not exists idx_assignments_module     on assignments(module_id);
create index if not exists idx_submissions_assignment on assignment_submissions(assignment_id);
create index if not exists idx_submissions_member     on assignment_submissions(member_id, submitted_at desc);
create index if not exists idx_progress_member        on learning_progress(member_id);
create index if not exists idx_progress_module        on learning_progress(module_id);
create index if not exists idx_checkins_member        on weekly_checkins(member_id, week_number desc);
create index if not exists idx_notifications_user     on notifications(user_id, read, created_at desc);
create index if not exists idx_resources_category     on resources(category);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Is the current JWT holder an admin? Used throughout the RLS policies below.
create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
alter table skills                 enable row level security;
alter table profiles               enable row level security;
alter table modules                enable row level security;
alter table lectures               enable row level security;
alter table notes                  enable row level security;
alter table assignments            enable row level security;
alter table assignment_submissions enable row level security;
alter table learning_progress      enable row level security;
alter table weekly_checkins        enable row level security;
alter table notifications          enable row level security;
alter table resources              enable row level security;

-- ============================================================================
-- POLICIES — skills (catalog is visible to every signed-in user)
-- ============================================================================
drop policy if exists "skills_select" on skills;
create policy "skills_select" on skills for select
  using (auth.uid() is not null);

drop policy if exists "skills_write" on skills;
create policy "skills_write" on skills for all
  using (is_admin()) with check (is_admin());

-- ============================================================================
-- POLICIES — profiles
-- ============================================================================
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or is_admin());

drop policy if exists "profiles_update_self" on profiles;
create policy "profiles_update_self" on profiles for update
  using (id = auth.uid() or is_admin())
  with check (id = auth.uid() or is_admin());

drop policy if exists "profiles_admin_delete" on profiles;
create policy "profiles_admin_delete" on profiles for delete
  using (is_admin());

-- ============================================================================
-- POLICIES — modules (titles/order visible to any signed-in user so the
-- roadmap can render locked steps; full content is gated table-by-table below)
-- ============================================================================
drop policy if exists "modules_select" on modules;
create policy "modules_select" on modules for select
  using (auth.uid() is not null);

drop policy if exists "modules_write" on modules;
create policy "modules_write" on modules for all
  using (is_admin()) with check (is_admin());

-- ============================================================================
-- POLICIES — lectures / notes / assignments: only visible once the member's
-- learning_progress row for that module says unlocked/completed (or is_admin)
-- ============================================================================
drop policy if exists "lectures_select" on lectures;
create policy "lectures_select" on lectures for select
  using (
    is_admin() or exists (
      select 1 from learning_progress lp
      where lp.module_id = lectures.module_id
        and lp.member_id = auth.uid()
        and lp.status in ('unlocked','completed')
    )
  );
drop policy if exists "lectures_write" on lectures;
create policy "lectures_write" on lectures for all
  using (is_admin()) with check (is_admin());

drop policy if exists "notes_select" on notes;
create policy "notes_select" on notes for select
  using (
    is_admin() or exists (
      select 1 from learning_progress lp
      where lp.module_id = notes.module_id
        and lp.member_id = auth.uid()
        and lp.status in ('unlocked','completed')
    )
  );
drop policy if exists "notes_write" on notes;
create policy "notes_write" on notes for all
  using (is_admin()) with check (is_admin());

drop policy if exists "assignments_select" on assignments;
create policy "assignments_select" on assignments for select
  using (
    is_admin() or exists (
      select 1 from learning_progress lp
      where lp.module_id = assignments.module_id
        and lp.member_id = auth.uid()
        and lp.status in ('unlocked','completed')
    )
  );
drop policy if exists "assignments_write" on assignments;
create policy "assignments_write" on assignments for all
  using (is_admin()) with check (is_admin());

-- ============================================================================
-- POLICIES — assignment_submissions
-- Members insert their own submissions (only for a module already unlocked
-- for them) and can read their own history; only admins update status/feedback.
-- ============================================================================
drop policy if exists "submissions_select" on assignment_submissions;
create policy "submissions_select" on assignment_submissions for select
  using (member_id = auth.uid() or is_admin());

drop policy if exists "submissions_insert" on assignment_submissions;
create policy "submissions_insert" on assignment_submissions for insert
  with check (
    member_id = auth.uid()
    and exists (
      select 1 from assignments a
      join learning_progress lp on lp.module_id = a.module_id
      where a.id = assignment_id
        and lp.member_id = auth.uid()
        and lp.status in ('unlocked','completed')
    )
  );

drop policy if exists "submissions_admin_update" on assignment_submissions;
create policy "submissions_admin_update" on assignment_submissions for update
  using (is_admin()) with check (is_admin());

-- ============================================================================
-- POLICIES — learning_progress
-- Members only ever read their own rows; all writes go through the
-- SECURITY DEFINER trigger functions below (owned by the migration role,
-- so they bypass RLS) — direct writes are admin-only.
-- ============================================================================
drop policy if exists "progress_select" on learning_progress;
create policy "progress_select" on learning_progress for select
  using (member_id = auth.uid() or is_admin());

drop policy if exists "progress_admin_write" on learning_progress;
create policy "progress_admin_write" on learning_progress for all
  using (is_admin()) with check (is_admin());

-- ============================================================================
-- POLICIES — weekly_checkins
-- ============================================================================
drop policy if exists "checkins_select" on weekly_checkins;
create policy "checkins_select" on weekly_checkins for select
  using (member_id = auth.uid() or is_admin());

drop policy if exists "checkins_insert" on weekly_checkins;
create policy "checkins_insert" on weekly_checkins for insert
  with check (member_id = auth.uid());

drop policy if exists "checkins_admin_update" on weekly_checkins;
create policy "checkins_admin_update" on weekly_checkins for update
  using (is_admin()) with check (is_admin());

-- ============================================================================
-- POLICIES — notifications
-- ============================================================================
drop policy if exists "notifications_select" on notifications;
create policy "notifications_select" on notifications for select
  using (user_id = auth.uid() or is_admin());

drop policy if exists "notifications_mark_read" on notifications;
create policy "notifications_mark_read" on notifications for update
  using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

drop policy if exists "notifications_admin_insert" on notifications;
create policy "notifications_admin_insert" on notifications for insert
  with check (is_admin());

-- ============================================================================
-- POLICIES — resources
-- ============================================================================
drop policy if exists "resources_select" on resources;
create policy "resources_select" on resources for select
  using (auth.uid() is not null);

drop policy if exists "resources_write" on resources;
create policy "resources_write" on resources for all
  using (is_admin()) with check (is_admin());

-- ============================================================================
-- TRIGGER — create a profile row automatically when someone signs up
-- ============================================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'member'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- TRIGGER — enforce the "max N members per skill" cohort cap
-- ============================================================================
create or replace function enforce_skill_capacity()
returns trigger
language plpgsql
security definer
as $$
declare
  cap   int;
  taken int;
begin
  if new.skill_id is null then
    return new;
  end if;
  if new.role <> 'member' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.skill_id is not distinct from new.skill_id then
    return new;
  end if;

  select member_capacity into cap from skills where id = new.skill_id;
  select count(*) into taken from profiles
    where skill_id = new.skill_id and role = 'member' and id <> new.id;

  if taken >= cap then
    raise exception 'This skill track is already at capacity (% members)', cap;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_skill_capacity on profiles;
create trigger trg_enforce_skill_capacity
  before insert or update of skill_id on profiles
  for each row execute function enforce_skill_capacity();

-- ============================================================================
-- TRIGGER — when a member is assigned a skill, unlock that skill's first module
-- ============================================================================
create or replace function unlock_first_module()
returns trigger
language plpgsql
security definer
as $$
declare
  first_module uuid;
begin
  if new.skill_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.skill_id is not distinct from new.skill_id then
    return new;
  end if;

  select id into first_module from modules
    where skill_id = new.skill_id
    order by order_index asc
    limit 1;

  if first_module is not null then
    insert into learning_progress (member_id, module_id, status, unlocked_at)
    values (new.id, first_module, 'unlocked', now())
    on conflict (member_id, module_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_unlock_first_module on profiles;
create trigger trg_unlock_first_module
  after insert or update of skill_id on profiles
  for each row execute function unlock_first_module();

-- ============================================================================
-- TRIGGER — on assignment review: notify the member, and if approved,
-- mark the module complete + unlock the next module in that skill
-- ============================================================================
create or replace function handle_submission_review()
returns trigger
language plpgsql
security definer
as $$
declare
  v_module_id    uuid;
  v_skill_id     uuid;
  v_order        int;
  v_next_module  uuid;
begin
  if new.status = old.status then
    return new;
  end if;

  select a.module_id into v_module_id from assignments a where a.id = new.assignment_id;
  select m.skill_id, m.order_index into v_skill_id, v_order from modules m where m.id = v_module_id;

  -- Always notify the member their submission was reviewed
  insert into notifications (user_id, type, title, message)
  values (
    new.member_id,
    'assignment_feedback',
    case new.status
      when 'approved' then 'Assignment approved 🎉'
      when 'needs_improvement' then 'Assignment needs improvement'
      when 'rejected' then 'Assignment rejected'
      else 'Assignment reviewed'
    end,
    coalesce(new.feedback, '')
  );

  if new.status = 'approved' then
    update learning_progress
      set status = 'completed', completed_at = now()
      where member_id = new.member_id and module_id = v_module_id;

    select id into v_next_module from modules
      where skill_id = v_skill_id and order_index = v_order + 1;

    if v_next_module is not null then
      insert into learning_progress (member_id, module_id, status, unlocked_at)
      values (new.member_id, v_next_module, 'unlocked', now())
      on conflict (member_id, module_id) do update set status = 'unlocked', unlocked_at = now()
        where learning_progress.status = 'locked';

      insert into notifications (user_id, type, title, message)
      values (new.member_id, 'module_unlocked', 'Next module unlocked',
        (select title from modules where id = v_next_module));
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_submission_review on assignment_submissions;
create trigger trg_submission_review
  after update of status on assignment_submissions
  for each row execute function handle_submission_review();

-- ============================================================================
-- TRIGGER — notify enrolled members when a new lecture is added to a module
-- they've already unlocked
-- ============================================================================
create or replace function notify_new_lecture()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into notifications (user_id, type, title, message)
  select lp.member_id, 'new_lecture', 'New lecture added', new.title
  from learning_progress lp
  where lp.module_id = new.module_id
    and lp.status in ('unlocked','completed');
  return new;
end;
$$;

drop trigger if exists trg_notify_new_lecture on lectures;
create trigger trg_notify_new_lecture
  after insert on lectures
  for each row execute function notify_new_lecture();

-- ============================================================================
-- FUNCTION — leaderboard (ranked within a skill; top 3 by definition since
-- each skill caps at 3 members, but the ranking works for any capacity)
--
-- A plain view would run with the view owner's privileges and silently
-- bypass RLS on profiles, so this is a SECURITY DEFINER function instead:
-- it explicitly scopes results to the caller's own skill (admins may pass
-- any skill_id, or null for every skill).
-- ============================================================================
create or replace function get_leaderboard(p_skill_id uuid default null)
returns table (
  member_id           uuid,
  full_name           text,
  skill_id            uuid,
  skill_label         text,
  completed_modules   bigint,
  approved_assignments bigint,
  score               bigint,
  skill_rank          bigint
)
language plpgsql
security definer
stable
as $$
declare
  caller_skill uuid;
  caller_admin boolean;
begin
  select role = 'admin', skill_id into caller_admin, caller_skill
    from profiles where id = auth.uid();

  if caller_admin is not true and p_skill_id is not null and p_skill_id <> caller_skill then
    raise exception 'Not authorized to view that skill''s leaderboard';
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.skill_id,
    s.label,
    count(distinct lp.module_id) filter (where lp.status = 'completed'),
    count(distinct sub.id) filter (where sub.status = 'approved'),
    (count(distinct lp.module_id) filter (where lp.status = 'completed') * 10
     + count(distinct sub.id) filter (where sub.status = 'approved') * 5),
    rank() over (
      partition by p.skill_id
      order by (
        count(distinct lp.module_id) filter (where lp.status = 'completed') * 10
        + count(distinct sub.id) filter (where sub.status = 'approved') * 5
      ) desc
    )
  from profiles p
  join skills s on s.id = p.skill_id
  left join learning_progress lp on lp.member_id = p.id
  left join assignment_submissions sub on sub.member_id = p.id and sub.status = 'approved'
  where p.role = 'member'
    and (
      caller_admin is true
      and (p_skill_id is null or p.skill_id = p_skill_id)
      or caller_admin is not true and p.skill_id = caller_skill
    )
  group by p.id, p.full_name, p.skill_id, s.label;
end;
$$;

grant execute on function get_leaderboard(uuid) to authenticated;
