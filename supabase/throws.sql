-- Supabase table for throw logging (free tier compatible)
-- Ensure pgcrypto for gen_random_uuid()
create extension if not exists pgcrypto;

create table if not exists public.throws (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid,
  concept_id text,
  coverage text,
  formation text,
  target text,
  time_frac double precision,
  play_id integer,
  hold_ms integer,
  throw_area text,
  area_horiz text check (area_horiz in ('L','M','R')),
  area_band text check (area_band in ('SHORT','MID','DEEP')),
  depth_yds integer,
  window_score double precision,
  nearest_sep_yds double precision,
  grade text,
  user_agent text,
  referer text
);

-- Optional row level security setup (open insert from service role only)
alter table public.throws enable row level security;
-- Add flexible JSONB column for extra metadata
alter table public.throws add column if not exists extra jsonb;
-- Add user_id column if missing + helpful index
alter table public.throws add column if not exists user_id uuid;
create index if not exists throws_user_id_created_idx on public.throws(user_id, created_at desc);
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='throws' and policyname='service_role_insert_only'
  ) then
    create policy service_role_insert_only on public.throws for insert
      to service_role with check (true);
  end if;
end $$;
