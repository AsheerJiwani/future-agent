import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Minimal server-side log; replace with DB/write as needed
    console.log("THROW_LOG", JSON.stringify(body));
    // Optional webhook forward for persistence (e.g., Supabase/Sheets collector)
    const hook = process.env.LOG_WEBHOOK_URL;
    if (hook) {
      try {
        await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } catch (e) {
        console.warn('throw-log webhook failed:', e instanceof Error ? e.message : String(e));
      }
    }

    // Insert into Supabase if configured
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

        // Parse area key into horiz/band if available
        let area_horiz: string | null = null;
        let area_band: string | null = null;
        if (body.throwArea && typeof body.throwArea === 'string' && body.throwArea.includes('_')) {
          const [h, b] = String(body.throwArea).split('_');
          area_horiz = h ?? null;
          area_band = b ?? null;
        }

        const row = {
          concept_id: body.conceptId ?? null,
          coverage: body.coverage ?? null,
          formation: body.formation ?? null,
          target: body.target ?? null,
          time_frac: typeof body.time === 'number' ? body.time : null,
          play_id: body.playId ?? null,
          hold_ms: body.holdMs ?? null,
          throw_area: body.throwArea ?? null,
          area_horiz,
          area_band,
          depth_yds: body.depthYds ?? null,
          window_score: body.windowScore ?? null,
          nearest_sep_yds: body.nearestSepYds ?? null,
          grade: body.grade ?? null,
          user_agent: req.headers.get('user-agent'),
          referer: req.headers.get('referer'),
          extra: body.extra ?? null
        };
        const { error } = await supabase.from('throws').insert([row]);
        if (error) console.warn('supabase insert error:', error.message);
      } catch (e) {
        console.warn('supabase log failed:', e instanceof Error ? e.message : String(e));
      }
    }
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return Response.json({ ok: false, error: msg }, { status: 200 });
  }
}
