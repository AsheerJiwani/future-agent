import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { userId?: string };
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const uidHeader = req.headers.get('x-user-id');
    const userId = body.userId || uidHeader || null;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !userId) {
      return Response.json({ ok: true, skills: {}, recs: [] });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data, error } = await supabase
      .from('assistant_memory')
      .select('data')
      .eq('user_id', userId)
      .eq('kind', 'skill')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 200 });

    const agg: Record<string, number> = {};
    type SkillRow = { data?: Record<string, unknown> };
    const items = (data || []).map((r: SkillRow) => (r?.data || {}));
    for (const it of items) {
      const s = String(it.skill || '');
      const d = Number(it.delta || 0);
      if (!s) continue;
      agg[s] = (agg[s] || 0) + d;
    }

    // Recommend 3 drills based on lowest-scoring skills
    const order = Object.entries(agg).sort((a,b)=>a[1]-b[1]);
    const top3 = order.slice(0,3);
    const recs = top3.map(([skill]) => recommendForSkill(skill as string));
    return Response.json({ ok: true, skills: agg, recs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return Response.json({ ok: false, error: msg }, { status: 200 });
  }
}

function recommendForSkill(skill: string): { skill: string; coverage: string; reason: string } {
  switch (skill) {
    case 'timing_rhythm':
      return { skill, coverage: 'C3', reason: 'Throw on rhythm vs curl/flat spacing (stick/flat timing).' };
    case 'first_open_eye_speed':
      return { skill, coverage: 'C2', reason: 'Two-high forces decisive first-open throws on rhythm.' };
    case 'zone_window_find':
      return { skill, coverage: 'TAMPA2', reason: 'Work curl/hook windows and sit in space.' };
    case 'c3_rotation_id':
      return { skill, coverage: 'C3', reason: 'Identify SKY/BUZZ/CLOUD rotation pre/post.' };
    case 'banjo_match_awareness':
      return { skill, coverage: 'C9', reason: 'Match/banjo reps vs trips/bunch looks (practice switches).' };
    case 'hot_rules_pressure':
      return { skill, coverage: 'C3', reason: 'Practice fire-zone hot/replace vs 3-under.' };
    case 'press_release_plan':
      return { skill, coverage: 'C1', reason: 'Boundary press reps; plan releases; timing adjustments.' };
    default:
      return { skill, coverage: 'C3', reason: 'Balanced drill to reinforce reads and timing.' };
  }
}
