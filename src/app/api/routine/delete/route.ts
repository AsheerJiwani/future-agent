import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { userId?: string; name: string };
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json({ ok: true, deleted: false });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const uidHeader = req.headers.get('x-user-id');
    const userId = body.userId || uidHeader || null;

    // Delete all routines with matching name
    const { error } = await supabase
      .from('assistant_memory')
      .delete()
      .eq('user_id', userId)
      .eq('kind', 'routine')
      .contains('data', { name: body.name });
    if (error) return Response.json({ ok: false, error: error.message }, { status: 200 });
    return Response.json({ ok: true, deleted: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return Response.json({ ok: false, error: msg }, { status: 200 });
  }
}

