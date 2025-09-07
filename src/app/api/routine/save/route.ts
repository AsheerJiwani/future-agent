import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { routine?: { name: string; drill: Record<string, unknown> }, userId?: string };
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json({ ok: true, stored: false });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const uidHeader = req.headers.get('x-user-id');
    const userId = body.userId || uidHeader || null;
    const row = { user_id: userId, kind: 'routine', data: { name: body.routine?.name ?? 'Routine', drill: body.routine?.drill ?? {} }, created_at: new Date().toISOString() } as Record<string, unknown>;
    await supabase.from('assistant_memory').insert([row]);
    return Response.json({ ok: true, stored: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return Response.json({ ok: false, error: msg }, { status: 200 });
  }
}

