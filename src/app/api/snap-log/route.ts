import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("SNAP_LOG", JSON.stringify(body));

    // Optional webhook forward
    const hook = process.env.LOG_WEBHOOK_URL;
    if (hook) {
      try {
        await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'snap', ...body }) });
      } catch (e) {
        console.warn('snap-log webhook failed:', e instanceof Error ? e.message : String(e));
      }
    }

    // Insert into Supabase if configured (generic memory table optional)
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
        const uidHeader = req.headers.get('x-user-id');
        const userId = body.userId || uidHeader || null;
        const row = {
          user_id: userId,
          concept_id: body.conceptId ?? null,
          coverage: body.coverage ?? null,
          formation: body.formation ?? null,
          play_id: body.playId ?? null,
          rng_seed: body.rngSeed ?? null,
          c3_rotation: body.c3Rotation ?? null,
          press: body.press ?? null,
          roles: body.roles ?? null,
          leverage: body.leverage ?? null,
          created_at: new Date().toISOString()
        } as Record<string, unknown>;
        // Use assistant_memory if present, else ignore (project optional)
        try {
          await supabase.from('assistant_memory').insert([{ user_id: row.user_id, kind: 'snap', data: row }]);
        } catch (e) {
          console.warn('supabase snap memory insert failed:', e instanceof Error ? e.message : String(e));
        }
      } catch (e) {
        console.warn('supabase snap-log failed:', e instanceof Error ? e.message : String(e));
      }
    }

    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return Response.json({ ok: false, error: msg }, { status: 200 });
  }
}

