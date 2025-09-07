import { NextRequest } from "next/server";
import OpenAI from "openai";
import { loadConcept } from "@data/football/loadConcept";
import type { FootballConceptId } from "@data/football/catalog";
import type { CoverageID, Concept, ReadPlan, ProgressionStep } from "@data/football/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type Body = {
  conceptId: FootballConceptId;
  coverage: CoverageID;
  target: string;
  time: number; // 0..1
  // Optional richer context from the simulator
  formation?: string;
  assignments?: Partial<Record<string, string>>;
  numbering?: Record<string, unknown>;
  // Throw window metadata
  windowScore?: number;
  nearestSepYds?: number;
  nearestDefender?: string;
  playId?: number;
  holdMs?: number;
  throwArea?: string;
  // Additional timing context
  targetBreakMs?: number;
  heldVsBreakMs?: number; // holdMs - targetBreakMs
  firstOpenId?: string;
  firstOpenMs?: number;
  // Openness at catch point
  catchWindowScore?: number;
  catchSepYds?: number;
};

type GradeJSON = {
  grade: "Great" | "Good" | "OK" | "Risky" | "Late" | "Missed hot" | "Wrong read";
  rationale: string;
  nextRead: string;
  coachingTip: string;
};

export async function POST(req: NextRequest) {
  try {
    const { conceptId, coverage, target, time, formation, assignments, numbering, windowScore, nearestSepYds, nearestDefender, playId, holdMs, throwArea, targetBreakMs, heldVsBreakMs, firstOpenId, firstOpenMs, catchWindowScore, catchSepYds }: Body = await req.json();

    const concept: Concept = await loadConcept(conceptId);
    const rp: ReadPlan | undefined = (concept.readPlans ?? []).find((r) => r.vs === coverage);

    const pre = (concept.preSnapKeys ?? []).map((x) => `- ${x}`).join("\n");
    const post = (concept.postSnapKeys ?? []).map((x) => `- ${x}`).join("\n");
    const plan =
      rp?.progression?.map((p: ProgressionStep) =>
        `${p.step}. ${p.keyDefender ? `[${p.keyDefender}] ` : ""}${p.if ? `IF ${p.if} THEN ` : ""}${p.then}${p.coachingPoint ? ` (CP: ${p.coachingPoint})` : ""}`
      ).join("\n") ?? "(no specific plan found)";

    // Heuristic signals to guide grading
    const timingHint = (() => {
      if (typeof heldVsBreakMs !== 'number') return 'unknown';
      if (heldVsBreakMs < -180) return 'early';
      if (heldVsBreakMs > 220) return 'late';
      return 'on-time';
    })();
    const windowHint = typeof windowScore === 'number' ? (windowScore >= 0.75 ? 'very-open' : windowScore >= 0.6 ? 'open' : windowScore >= 0.45 ? 'tight' : 'covered') : 'unknown';

    const prompt =
`You are grading a QB decision in a play simulator.

CONCEPT: ${concept.name} (${concept.id})
COVERAGE: ${coverage}
PLAY TIME: ${time.toFixed(2)} (0..1)
TARGET CHOSEN: ${target}
PLAY ID: ${playId ?? "(n/a)"}
FORMATION: ${formation ?? "(n/a)"}
ASSIGNMENTS: ${assignments ? JSON.stringify(assignments) : "(n/a)"}
NUMBERING: ${numbering ? JSON.stringify(numbering) : "(n/a)"}

  THROW WINDOW (if provided):
    windowScore: ${windowScore ?? "(n/a)"}
    nearestDefender: ${nearestDefender ?? "(n/a)"}
    nearestSepYds: ${nearestSepYds ?? "(n/a)"}
    holdMs: ${holdMs ?? "(n/a)"}
    throwArea: ${throwArea ?? "(n/a)"}
  targetBreakMs: ${targetBreakMs ?? "(n/a)"}
  heldVsBreakMs: ${heldVsBreakMs ?? "(n/a)"}
  timingHint: ${timingHint}
  windowHint: ${windowHint}
  firstOpen: ${firstOpenId ?? "(n/a)"} @ ${firstOpenMs ?? "(n/a)"}ms
  opennessAtCatch: ${typeof catchWindowScore === 'number' ? catchWindowScore.toFixed(2) : '(n/a)'} (${catchSepYds ?? '(n/a)'} yds)

PRE-SNAP KEYS:
${pre || "- none"}

POST-SNAP KEYS:
${post || "- none"}

READ PLAN (for this coverage):
${plan}

Your grading rubric:
- Great: on-time rhythm/anticipation, window open enough, correct read progression, safe ball.
- Good: adequate timing, minor hitch but ball out before window closes.
- OK: acceptable but could be faster/better window.
- Risky: window tight/closing, defender proximity high.
- Late: significantly after break; throws into closing window.
- Missed hot: pressure/quick answer ignored.
- Wrong read: threw against progression or leverage.

Return STRICT JSON ONLY (no markdown/code fences) with keys:
{"grade": "Great|Good|OK|Risky|Late|Missed hot|Wrong read","rationale": "<=120 chars","nextRead": "<=100 chars","coachingTip": "<=100 chars"}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an elite QB coach. Be precise, concise, and actionable." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'qb_grade',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              grade: { type: 'string', enum: ["Great","Good","OK","Risky","Late","Missed hot","Wrong read"] },
              rationale: { type: 'string' },
              nextRead: { type: 'string' },
              coachingTip: { type: 'string' }
            },
            required: [ 'grade', 'rationale', 'nextRead', 'coachingTip' ]
          },
          strict: true
        }
      }
    });

    const text = completion.choices[0]?.message?.content?.trim() || "{}";

    let data: GradeJSON | null = null;
    try {
      data = JSON.parse(text) as GradeJSON;
    } catch {
      // try to extract first JSON object as a fallback
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try { data = JSON.parse(text.slice(start, end + 1)) as GradeJSON; } catch { /* ignore */ }
      }
    }
    if (!data || !data.grade || !data.rationale) {
      // Heuristic fallback grade
      const fallbackGrade: GradeJSON = (() => {
        const g = timingHint === 'late' ? 'Late' : windowHint === 'covered' ? 'Risky' : 'OK';
        const why = timingHint !== 'unknown' ? `Timing ${timingHint}.` : `Window ${windowHint}.`;
        const tip = timingHint === 'late' ? 'Speed up progression; throw on the break.' : windowHint === 'tight' ? 'Keep ball safe; find earlier window.' : 'Keep base quiet; quick eyes.';
        return { grade: g as GradeJSON['grade'], rationale: why, nextRead: firstOpenId ? `Find ${firstOpenId} earlier.` : 'Reset to first in progression.', coachingTip: tip };
      })();
      data = fallbackGrade;
    }

    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return Response.json(
      { grade: "OK", rationale: `Grader error: ${msg}`, nextRead: "Retry the rep.", coachingTip: "Reset & breathe." },
      { status: 200 }
    );
  }
}
