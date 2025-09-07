import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TrackBody = {
  userId?: string;
  conceptId?: string;
  coverage?: string;
  formation?: string;
  throw?: {
    grade?: string;
    windowScore?: number;
    catchWindowScore?: number;
    heldVsBreakMs?: number;
    throwArea?: string;
    firstOpenId?: string;
    target?: string;
  };
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TrackBody;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Heuristic deltas
    // const g = (body.throw?.grade || '').toUpperCase();
    const w = typeof body.throw?.catchWindowScore === 'number' ? body.throw?.catchWindowScore : body.throw?.windowScore;
    const held = typeof body.throw?.heldVsBreakMs === 'number' ? body.throw?.heldVsBreakMs : undefined;
    const firstOpen = body.throw?.firstOpenId;
    const target = body.throw?.target;

    const deltas: Array<{ skill: string; delta: number; reason: string }> = [];
    if (typeof w === 'number') {
      if (w >= 0.75) deltas.push({ skill: 'zone_window_find', delta: +1, reason: 'Found good window at catch' });
      if (w < 0.45) deltas.push({ skill: 'zone_window_find', delta: -1, reason: 'Tight window at catch' });
    }
    if (typeof held === 'number') {
      if (held > 200) deltas.push({ skill: 'timing_rhythm', delta: -1, reason: 'Late vs break timing' });
      if (held < -150) deltas.push({ skill: 'timing_rhythm', delta: -1, reason: 'Too early vs break' });
      if (Math.abs(held) <= 160) deltas.push({ skill: 'timing_rhythm', delta: +1, reason: 'On-time rhythm' });
    }
    if (firstOpen && target && firstOpen !== target) {
      deltas.push({ skill: 'first_open_eye_speed', delta: -1, reason: 'Missed first-open' });
    } else if (firstOpen && target && firstOpen === target) {
      deltas.push({ skill: 'first_open_eye_speed', delta: +1, reason: 'Hit first-open' });
    }
    if (/C3/.test(body.coverage || '')) {
      deltas.push({ skill: 'c3_rotation_id', delta: +0, reason: 'Exposure to C3 rep' });
    }

    // No backend configured — return computed deltas
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json({ ok: true, stored: false, deltas });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const uidHeader = req.headers.get('x-user-id');
    const userId = body.userId || uidHeader || null;
    const rows = deltas.map(d => ({ user_id: userId, kind: 'skill', data: { ...d, coverage: body.coverage, conceptId: body.conceptId, at: new Date().toISOString() } }));
    if (rows.length) {
      try { await supabase.from('assistant_memory').insert(rows); } catch { /* ignore */ }
    }
    return Response.json({ ok: true, stored: true, deltas });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return Response.json({ ok: false, error: msg }, { status: 200 });
  }
}
