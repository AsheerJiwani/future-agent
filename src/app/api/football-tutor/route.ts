export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import OpenAI from "openai";
import { loadConcept } from "@data/football/loadConcept";
import type { FootballConceptId } from "@data/football/catalog";
import type { CoverageID, Concept, ReadPlan, ProgressionStep } from "@data/football/types";
import type { PlaySnapshot, SnapMeta } from "@/types/play";
import * as GradeRoute from "../football-grade/route";
import * as AudibleRoute from "../football-audible/route";
import type { NextRequest } from "next/server";
import { similarKnowledge } from "../../../lib/rag";

type ChatMsg = { role: "user" | "assistant"; content: string };
type TutorBody = {
  conceptId?: FootballConceptId;
  coverage?: CoverageID;
  formation?: string;
  history?: ChatMsg[];
  toggles?: { audibles?: boolean; tutor?: boolean; quiz?: boolean };
  throwCtx?: Record<string, unknown>;
  snapshot?: PlaySnapshot;
  snapMeta?: SnapMeta;
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TutorBody;
    const concept: Concept | null = body.conceptId ? await loadConcept(body.conceptId) : null;

    const system = `You are AI Football Tutor — an NFL coordinator-level coach integrated with a PlaySimulator. Goals: teach, challenge, and iterate reps.
Behaviors:
- If the user hasn't snapped, suggest a defensive coverage that makes pedagogical sense against the selected play and formation. Explain why in 1-2 lines.
- If audibles are enabled, suggest an audible only when it clearly improves the look; keep it minimal and explain the why.
- If play tutor is enabled, give a concise progression emphasis for the next snap (who/when/why) in 2-3 bullets.
- After a throw, read the summary and suggest what to try next (coverage or audible). Keep cycles short (~3) then suggest switching plays.
Constraints: concise, football-accurate, simulator-aware. Never reveal raw JSON; keep messages <= 120 words.`;

    const seed =
      (concept
        ? `PLAY: ${concept.name} (${concept.id})\nFAMILY: ${concept.family}\nBEST INTO: ${(concept.bestInto||[]).join(', ')}`
        : "");

    const queryText = [
      body.coverage ?? '',
      concept?.id ?? '',
      concept?.family ?? '',
      body.formation ?? '',
      body.snapshot?.assignments ? JSON.stringify(body.snapshot.assignments) : ''
    ].join(' | ');
    const know = await similarKnowledge(queryText, 5);
    const knowledgeBlock = know.length ? `\nKNOWLEDGE:\n` + know.map(k=>`- ${k.title}: ${k.bullets.join(' ')}`).join('\n') : '';
    const analysisBlock = body.throwCtx ? `\nANALYZE LAST REP:\n${JSON.stringify(body.throwCtx)}\nUse the knowledge above + coverage + play to suggest what could be improved (timing, read, leverage) in 2-3 bullets. Cite a short fragment from the relevant knowledge bullet using the pattern (Ref: <few words>).` : '';
    const userContent = `${seed}\nFORMATION: ${body.formation ?? '(n/a)'}\nTOGGLES: audibles=${!!body.toggles?.audibles}, tutor=${!!body.toggles?.tutor}, quiz=${!!body.toggles?.quiz}${knowledgeBlock}${analysisBlock}\nReturn JSON: {"reply": string, "improvements"?: string[], "reads"?: string[], "audibles"?: [{"label"?: string, "formation"?: string, "assignments"?: { [rid: string]: string }, "rationale": string }], "suggestedCoverage": "C0|C1|C2|TAMPA2|PALMS|C3|C4|QUARTERS|C6|C9", "reason": string, "quiz"?: {"question": string, "answer": string, "explain": string}}\nIf audibles=true, include up to 2 audibles. Use exact route keywords (e.g., CORNER, OUT_LOW, WHEEL, DIG). Keep each rationale to one line.`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
        ...(body.history || [])
      ],
      response_format: { type: 'json_object' }
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    let parsed: { reply?: string; improvements?: string[]; reads?: string[]; audibles?: Array<{ label?: string; formation?: string; assignments?: Record<string,string>; rationale: string }>; suggestedCoverage?: CoverageID; reason?: string; quiz?: { question: string; answer: string; explain: string } };
    try { parsed = JSON.parse(raw) as { reply?: string; improvements?: string[]; reads?: string[]; audibles?: Array<{ label?: string; formation?: string; assignments?: Record<string,string>; rationale: string }>; suggestedCoverage?: CoverageID; reason?: string; quiz?: { question: string; answer: string; explain: string } }; } catch { parsed = { reply: raw }; }
    const content = parsed.reply || '';

    // Build coverage_read/progression from concept + coverage
    let coverage_read: { family: string; cues: string[] } | undefined;
    let progression: { step: number; text: string }[] | undefined;
    if (concept && body.coverage) {
      const rp: ReadPlan | undefined = (concept.readPlans || []).find(r => r.vs === body.coverage);
      const cues: string[] = [];
      if (body.snapMeta?.coverageInsights?.mofState) cues.push(`MOF: ${body.snapMeta.coverageInsights.mofState}`);
      if (body.coverage === 'C3' && body.snapMeta?.coverageInsights?.c3Rotation) cues.push(`C3: ${body.snapMeta.coverageInsights.c3Rotation}`);
      coverage_read = { family: concept.family, cues };
      if (rp?.progression?.length) {
        progression = rp.progression.map((p: ProgressionStep) => ({ step: p.step, text: `${p.keyDefender ? `[${p.keyDefender}] ` : ''}${p.if ? `IF ${p.if} THEN ` : ''}${p.then}${p.coachingPoint ? ` — ${p.coachingPoint}` : ''}` }));
      }
    }

    // If a throwCtx is provided, grade it directly via internal route
    let gradeBlock: { grade: string; rationale: string; nextRead: string; coachingTip: string; letter?: string } | undefined;
    if (body.throwCtx && body.conceptId && body.coverage) {
      try {
        const gReq = new Request('http://local/grade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          conceptId: body.conceptId,
          coverage: body.coverage,
          formation: body.formation,
          ...(body.snapshot?.assignments ? { assignments: body.snapshot.assignments as Record<string,string> } : {}),
          numbering: body.snapshot?.numbering,
          ...body.throwCtx
        })});
        const gResp = await (GradeRoute as { POST: (r: NextRequest) => Promise<Response> }).POST(gReq as unknown as NextRequest);
        const gJson = await gResp.json() as { grade: string; rationale: string; nextRead: string; coachingTip: string };
        // Letter rating from openness at catch
        const open = Number((body.throwCtx as Record<string, unknown>)?.catchWindowScore ?? (body.throwCtx as Record<string, unknown>)?.windowScore ?? 0);
        const letter = (() => {
          if (open >= 0.90) return 'A+';
          if (open >= 0.80) return 'A';
          if (open >= 0.75) return 'B+';
          if (open >= 0.70) return 'B';
          if (open >= 0.60) return 'C+';
          if (open >= 0.50) return 'C';
          if (open >= 0.40) return 'D+';
          if (open >= 0.30) return 'D';
          return 'F';
        })();
        gradeBlock = { ...gJson, letter };
      } catch { /* ignore grading failure */ }
    }

    // Audible suggestion via internal tool if toggled
    let audible: { formation?: string; assignments?: Partial<Record<string,string>>; rationale?: string } | undefined;
    const audiblesLLM: Array<{ label?: string; formation?: string; assignments?: Record<string,string>; rationale: string }> | undefined = parsed.audibles;
    if (body.toggles?.audibles && body.conceptId && body.coverage && body.formation) {
      try {
        const aReq = new Request('http://local/aud', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          conceptId: body.conceptId,
          coverage: body.coverage,
          formation: body.formation,
          assignments: body.snapshot?.assignments as Partial<Record<string,string>> | undefined,
          numbering: body.snapshot?.numbering,
          snapshot: body.snapshot ? {
            conceptId: body.snapshot.conceptId,
            coverage: body.snapshot.coverage,
            formation: body.snapshot.formation,
            playId: body.snapshot.playId,
            rngSeed: body.snapshot.rngSeed,
          } : undefined,
          snapMeta: body.snapMeta ? {
            press: body.snapMeta.press,
            roles: body.snapMeta.roles,
            leverage: body.snapMeta.leverage
          } : undefined
        })});
        const aResp = await (AudibleRoute as { POST: (r: Request) => Promise<Response> }).POST(aReq);
        const aJson = await aResp.json() as { formation?: string; assignments?: Partial<Record<string,string>>; rationale?: string };
        audible = aJson;
      } catch { /* ignore audible failure */ }
    }

    return new Response(JSON.stringify({ reply: content, improvements: parsed.improvements, reads: parsed.reads, audibles: audiblesLLM, suggestedCoverage: parsed.suggestedCoverage, suggestedReason: parsed.reason, coverage_read, progression, grade: gradeBlock, audible, quiz: parsed.quiz }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return new Response(JSON.stringify({ reply: `Tutor error: ${msg}` }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
}
