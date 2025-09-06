import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const coverage = url.searchParams.get('coverage');
    const conceptId = url.searchParams.get('conceptId');
    const areaHoriz = url.searchParams.get('areaHoriz'); // 'L' | 'M' | 'R'
    const areaBand  = url.searchParams.get('areaBand');  // 'SHORT'|'MID'|'DEEP'
    const limit     = Number(url.searchParams.get('limit') || '20');

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data, error } = await supabase.rpc('get_throw_metrics', {
      p_coverage: coverage,
      p_concept_id: conceptId,
      p_area_horiz: areaHoriz,
      p_area_band: areaBand,
      p_limit: isFinite(limit) ? limit : 20
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ rows: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return Response.json({ error: msg }, { status: 500 });
  }
}
