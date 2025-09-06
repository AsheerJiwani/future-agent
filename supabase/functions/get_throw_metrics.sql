-- Aggregation RPC for top-N throw metrics
create or replace function public.get_throw_metrics(
  p_coverage text default null,
  p_concept_id text default null,
  p_area_horiz text default null,
  p_area_band text default null,
  p_limit integer default 20
)
returns table (
  coverage text,
  concept_id text,
  area_horiz text,
  area_band text,
  n_throws bigint,
  avg_window_score double precision,
  avg_nearest_sep_yds double precision,
  avg_hold_ms double precision,
  completion_rate double precision
)
language sql
security definer
as $$
  select
    t.coverage,
    t.concept_id,
    t.area_horiz,
    t.area_band,
    count(*)::bigint as n_throws,
    avg(t.window_score)::float8 as avg_window_score,
    avg(t.nearest_sep_yds)::float8 as avg_nearest_sep_yds,
    avg(t.hold_ms)::float8 as avg_hold_ms,
    avg(case when t.grade in ('Great','Good','OK') then 1.0 else 0.0 end)::float8 as completion_rate
  from public.throws t
  where (p_coverage   is null or t.coverage   = p_coverage)
    and (p_concept_id is null or t.concept_id = p_concept_id)
    and (p_area_horiz is null or t.area_horiz = p_area_horiz)
    and (p_area_band  is null or t.area_band  = p_area_band)
  group by t.coverage, t.concept_id, t.area_horiz, t.area_band
  order by n_throws desc
  limit coalesce(p_limit, 20)
$$;

grant execute on function public.get_throw_metrics(text, text, text, text, integer) to anon, authenticated;

