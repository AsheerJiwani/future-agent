import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { userId?: string };
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !body.userId) {
      return Response.json({ ok: true, session: {} });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data, error } = await supabase
      .from('assistant_memory')
      .select('data, created_at')
      .eq('user_id', body.userId)
      .eq('kind', 'session')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 200 });
    const session = (data && data[0] && (data[0] as any).data) || {};
    return Response.json({ ok: true, session });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return Response.json({ ok: false, error: msg }, { status: 200 });
  }
}

