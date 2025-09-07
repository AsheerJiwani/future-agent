-- Persistent cache for RAG embeddings (jsonb vec)
create table if not exists public.knowledge_embeddings (
  id text primary key,
  vec jsonb not null
);

alter table public.knowledge_embeddings enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='knowledge_embeddings' and policyname='service_role_rw'
  ) then
    create policy service_role_rw on public.knowledge_embeddings for all
      to service_role using (true) with check (true);
  end if;
end $$;

