-- ============================================================
-- BETTER THAN YESTERDAY · Supabase schema
-- Run once: Supabase dashboard → SQL Editor → New query → paste → Run
-- ============================================================

-- 1. PROFILES (one row per user)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  username    text NOT NULL,
  user_id     text NOT NULL UNIQUE,
  email       text,
  timezone    text NOT NULL DEFAULT 'UTC',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own profile" ON public.profiles;
CREATE POLICY "own profile" ON public.profiles
  FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 2. HABITS (daily quests)
CREATE TABLE IF NOT EXISTS public.habits (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  description      text NOT NULL DEFAULT '',
  emoji            text NOT NULL DEFAULT '✅',
  color            text NOT NULL DEFAULT 'cyan',
  category         text NOT NULL DEFAULT 'General',
  priority         text NOT NULL DEFAULT 'medium',
  difficulty       text NOT NULL DEFAULT 'medium',
  target_value     numeric NOT NULL DEFAULT 1,
  target_unit      text NOT NULL DEFAULT 'time',
  reminder_time    text,
  reminder_enabled boolean NOT NULL DEFAULT false,
  daily_score      integer NOT NULL DEFAULT 10,
  sort_order       integer NOT NULL DEFAULT 0,
  archived         boolean NOT NULL DEFAULT false,
  active_from      date NOT NULL DEFAULT CURRENT_DATE,
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own habits" ON public.habits;
CREATE POLICY "own habits" ON public.habits
  FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- 3. HABIT LOGS (one row per habit per day)
CREATE TABLE IF NOT EXISTS public.habit_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  habit_id       uuid NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  log_date       date NOT NULL,
  status         text NOT NULL DEFAULT 'completed',   -- completed | partial | skipped | missed
  progress       numeric NOT NULL DEFAULT 100,
  note           text,
  score_awarded  integer NOT NULL DEFAULT 10,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (habit_id, log_date)
);
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own logs" ON public.habit_logs;
CREATE POLICY "own logs" ON public.habit_logs
  FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- 4. Table permissions for signed-in users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.habits, public.habit_logs TO authenticated;

CREATE INDEX IF NOT EXISTS habits_owner_idx ON public.habits(owner_id);
CREATE INDEX IF NOT EXISTS logs_owner_date_idx ON public.habit_logs(owner_id, log_date);
