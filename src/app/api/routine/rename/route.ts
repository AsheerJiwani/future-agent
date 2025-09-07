import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { userId?: string; oldName: string; newName: string };
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json({ ok: true, stored: false });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const uidHeader = req.headers.get('x-user-id');
    const userId = body.userId || uidHeader || null;

    // Load latest routine by oldName
    const { data, error } = await supabase
      .from('assistant_memory')
      .select('data, created_at')
      .eq('user_id', userId)
      .eq('kind', 'routine')
      .contains('data', { name: body.oldName })
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 200 });
    const drill = (data && data[0] && (data[0] as any).data?.drill) || null;
    if (!drill) return Response.json({ ok: false, error: 'routine_not_found' }, { status: 200 });

    // Insert a new routine with the new name
    await supabase.from('assistant_memory').insert([{ user_id: userId, kind: 'routine', data: { name: body.newName, drill }, created_at: new Date().toISOString() }]);
    return Response.json({ ok: true, stored: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return Response.json({ ok: false, error: msg }, { status: 200 });
  }
}

