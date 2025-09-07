import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Drill = {
  suggestedCoverage: string;
  suggestedFormation?: 'TRIPS_RIGHT'|'DOUBLES'|'BUNCH_LEFT';
  motions?: Array<{ rid: 'X'|'Z'|'SLOT'|'TE'|'RB'; type?: 'jet'|'short'|'across'; dir?: 'left'|'right' }>;
  fireZone?: { on: boolean; preset?: 'NICKEL'|'SAM'|'WILL' };
  reason?: string;
  recs?: Array<{ skill: string; coverage: string; reason: string }>;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { userId?: string; coverage?: string; conceptId?: string };
    // Try to pull skill summary (best-effort)
    let recs: Array<{ skill: string; coverage: string; reason: string }> = [];
    try {
      const res = await fetch('http://local/skills/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: body.userId }) });
      const data = await res.json() as { recs?: Array<{ skill: string; coverage: string; reason: string }> };
      recs = data.recs || [];
    } catch { /* ignore */ }
    const suggestedCoverage = recs[0]?.coverage || (body.coverage || 'C3');
    // Suggest formation + motion presets by weakest skill
    const weakest = recs[0]?.skill || '';
    const drill: Drill = { suggestedCoverage, reason: recs[0]?.reason, recs };
    switch (weakest) {
      case 'banjo_match_awareness':
        drill.suggestedFormation = 'BUNCH_LEFT';
        drill.motions = [{ rid: 'SLOT', type: 'short', dir: 'left' }];
        break;
      case 'press_release_plan':
        drill.suggestedFormation = 'DOUBLES';
        // Nudge boundary X/SLOT to shape leverage if desired — keep simple for now
        break;
      case 'motion_usage':
        drill.suggestedFormation = 'TRIPS_RIGHT';
        drill.motions = [{ rid: 'SLOT', type: 'jet', dir: 'right' }];
        break;
      case 'c3_rotation_id':
        drill.suggestedFormation = 'TRIPS_RIGHT';
        drill.motions = [{ rid: 'SLOT', type: 'jet', dir: 'right' }];
        break;
      case 'hot_rules_pressure':
        // Use C3 fire-zone with a Nickel blitz preset
        drill.suggestedCoverage = 'C3';
        drill.fireZone = { on: true, preset: 'NICKEL' };
        drill.suggestedFormation = 'TRIPS_RIGHT';
        break;
      case 'mof_identification':
        // Encourage split-field coverage recognition with C6 (QQH)
        drill.suggestedCoverage = 'C6';
        drill.suggestedFormation = 'TRIPS_RIGHT';
        drill.motions = [{ rid: 'SLOT', type: 'short', dir: 'right' }];
        break;
      case 'leverage_read_in_out':
        drill.suggestedCoverage = drill.suggestedCoverage || 'C1';
        drill.suggestedFormation = 'DOUBLES';
        break;
      default:
        // keep formation as-is
        break;
    }
    return Response.json(drill);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return Response.json({ suggestedCoverage: 'C3', reason: `fallback: ${msg}` }, { status: 200 });
  }
}
