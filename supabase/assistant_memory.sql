-- Session memory store for the QB Assistant Agent
create table if not exists public.assistant_memory (
  user_id uuid primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.assistant_memory enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='assistant_memory' and policyname='service_role_upsert'
  ) then
    create policy service_role_upsert on public.assistant_memory for all
      to service_role using (true) with check (true);
  end if;
end $$;

create index if not exists assistant_memory_updated_idx on public.assistant_memory(updated_at desc);

