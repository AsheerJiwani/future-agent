import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { userId?: string; session?: Record<string, unknown> };
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !body.userId) {
      return Response.json({ ok: true, stored: false });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const row = { user_id: body.userId, kind: 'session', data: body.session ?? {}, created_at: new Date().toISOString() } as Record<string, unknown>;
    await supabase.from('assistant_memory').insert([row]);
    return Response.json({ ok: true, stored: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return Response.json({ ok: false, error: msg }, { status: 200 });
  }
}

