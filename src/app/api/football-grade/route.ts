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
};

type GradeJSON = {
  grade: "Great" | "Good" | "OK" | "Risky" | "Late" | "Missed hot" | "Wrong read";
  rationale: string;
  nextRead: string;
  coachingTip: string;
};

export async function POST(req: NextRequest) {
  try {
    const { conceptId, coverage, target, time, formation, assignments, numbering, windowScore, nearestSepYds, nearestDefender, playId, holdMs, throwArea }: Body = await req.json();

    const concept: Concept = await loadConcept(conceptId);
    const rp: ReadPlan | undefined = (concept.readPlans ?? []).find((r) => r.vs === coverage);

    const pre = (concept.preSnapKeys ?? []).map((x) => `- ${x}`).join("\n");
    const post = (concept.postSnapKeys ?? []).map((x) => `- ${x}`).join("\n");
    const plan =
      rp?.progression?.map((p: ProgressionStep) =>
        `${p.step}. ${p.keyDefender ? `[${p.keyDefender}] ` : ""}${p.if ? `IF ${p.if} THEN ` : ""}${p.then}${p.coachingPoint ? ` (CP: ${p.coachingPoint})` : ""}`
      ).join("\n") ?? "(no specific plan found)";

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

PRE-SNAP KEYS:
${pre || "- none"}

POST-SNAP KEYS:
${post || "- none"}

READ PLAN (for this coverage):
${plan}

Return a strict JSON object:
{"grade": "...","rationale": "...","nextRead": "...","coachingTip": "..."}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an elite QB coach. Be precise, concise, and actionable." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3
    });

    const text = completion.choices[0]?.message?.content?.trim() || "{}";

    let data: GradeJSON;
    try {
      data = JSON.parse(text) as GradeJSON;
      // Minimal guards:
      if (!data.grade || !data.rationale) throw new Error("bad JSON");
    } catch {
      data = {
        grade: "OK",
        rationale: "Could not parse model JSON; defaulting to neutral.",
        nextRead: "Re-run and throw on rhythm.",
        coachingTip: "Keep base quiet; quick eyes."
      };
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
