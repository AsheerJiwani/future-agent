// src/app/api/football-assistant/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { loadConcept } from "@data/football/loadConcept";
import type { FootballConceptId } from "@data/football/catalog";
import type { CoverageID, Concept, ReadPlan, ProgressionStep, ReceiverID } from "@data/football/types";
import type { PlaySnapshot, SnapMeta } from "@/types/play";

type AssistantMode = "analysis" | "teach" | "quiz";
type FocusKey = "timing" | "leverage" | "rotation" | "hot";

type AssistantRequest = {
  conceptId: FootballConceptId;
  coverage: CoverageID;
  snapshot?: PlaySnapshot;
  snapMeta?: SnapMeta;
  // Optional filters for aggregations
  filters?: { areaHoriz?: "L" | "M" | "R"; areaBand?: "SHORT" | "MID" | "DEEP" };
  mode?: AssistantMode;
  focus?: FocusKey[];
  throwCtx?: {
    target?: string;
    time?: number;
    playId?: number;
    holdMs?: number;
    throwArea?: string;
    depthYds?: number;
    windowScore?: number;
    nearestSepYds?: number;
    nearestDefender?: string | null;
    grade?: string;
  };
  overrides?: Partial<Concept>;
  userId?: string;
};

type AssistantResponse = {
  summary: string;
  coverage_read?: { family: string; cues: string[]; rotation?: string; mof?: "one-high" | "two-high" };
  progression?: { step: number; text: string }[];
  leverage?: Record<ReceiverID, { side: "inside" | "outside" | "even"; note?: string }>;
  open_reads?: Array<{ id: ReceiverID; why: string; timing?: string }>;
  audible?: { formation?: string; assignments?: Partial<Record<ReceiverID, string>>; rationale?: string };
  coaching_points?: string[];
  quiz?: { question: string; expected: string };
  stats?: Array<{ coverage: string; concept_id: string; area_horiz: string; area_band: string; n_throws: number; avg_window_score: number; avg_nearest_sep_yds: number; avg_hold_ms: number; completion_rate: number }>;
  sources?: { title: string; url: string }[];
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function conceptDigest(concept: Concept, coverage: CoverageID) {
  const rp: ReadPlan | undefined = (concept.readPlans ?? []).find((r) => r.vs === coverage);
  const pre = (concept.preSnapKeys ?? []).map((x) => `- ${x}`).join("\n");
  const post = (concept.postSnapKeys ?? []).map((x) => `- ${x}`).join("\n");
  const plan =
    rp?.progression
      ?.map(
        (p: ProgressionStep) =>
          `${p.step}. ${p.keyDefender ? `[${p.keyDefender}] ` : ""}${p.if ? `IF ${p.if} THEN ` : ""}${p.then}${p.coachingPoint ? ` (CP: ${p.coachingPoint})` : ""}`
      )
      .join("\n") ?? "(no specific plan found)";

  return {
    text:
      `CONCEPT: ${concept.name} (${concept.id})\n` +
      `FAMILY: ${concept.family}\n\n` +
      `PRE-SNAP KEYS:\n${pre || "- none"}\n\n` +
      `POST-SNAP KEYS:\n${post || "- none"}\n\n` +
      `READ PLAN vs ${coverage}:\n${plan}\n` +
      `HOT RULES: ${(rp?.hotRules ?? []).join("; ") || "(none)"}\n` +
      `NOTES: ${(rp?.notes ?? []).join(" • ") || "(none)"}`,
    sources: concept.sources ?? [],
  };
}

function applyOverrides(base: Concept, overrides?: Partial<Concept>): Concept {
  if (!overrides) return base;
  return {
    ...base,
    name: overrides.name ?? base.name,
    family: overrides.family ?? base.family,
    bestInto: overrides.bestInto ?? base.bestInto,
    weakInto: overrides.weakInto ?? base.weakInto,
    personnel: overrides.personnel ?? base.personnel,
    formations: overrides.formations ?? base.formations,
    tags: overrides.tags ?? base.tags,
    preSnapKeys: overrides.preSnapKeys ?? base.preSnapKeys,
    postSnapKeys: overrides.postSnapKeys ?? base.postSnapKeys,
    footwork: overrides.footwork ?? base.footwork,
    readPlans: overrides.readPlans ?? base.readPlans,
    commonMistakes: overrides.commonMistakes ?? base.commonMistakes,
    sources: overrides.sources ?? base.sources,
    diagram: overrides.diagram ?? base.diagram,
    coachingPoints: overrides.coachingPoints ?? base.coachingPoints,
  };
}

type MetricRow = { coverage: string; concept_id: string; area_horiz: string; area_band: string; n_throws: number; avg_window_score: number; avg_nearest_sep_yds: number; avg_hold_ms: number; completion_rate: number };

async function fetchThrowMetrics(filters?: { coverage?: string; conceptId?: string; areaHoriz?: string; areaBand?: string; limit?: number; userId?: string }): Promise<MetricRow[]> {
  // Prefer direct Supabase if configured, else try the internal API route as a fallback
  const { coverage, conceptId, areaHoriz, areaBand, limit = 12, userId } = filters || {};
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      const { data, error } = await supabase.rpc('get_throw_metrics', {
        p_coverage: coverage ?? null,
        p_concept_id: conceptId ?? null,
        p_area_horiz: areaHoriz ?? null,
        p_area_band: areaBand ?? null,
        p_limit: limit,
        p_user_id: userId ?? null
      });
      if (error) throw new Error(error.message);
      return Array.isArray(data) ? data : [];
    } catch {
      // fall through to HTTP fallback
    }
  }

  try {
    const url = new URL("http://localhost" + "/api/metrics/throw-summary");
    if (coverage) url.searchParams.set('coverage', coverage);
    if (conceptId) url.searchParams.set('conceptId', conceptId);
    if (areaHoriz) url.searchParams.set('areaHoriz', areaHoriz);
    if (areaBand) url.searchParams.set('areaBand', areaBand);
    url.searchParams.set('limit', String(limit));
    if (userId) url.searchParams.set('userId', userId);
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.rows ?? []) as MetricRow[];
  } catch {
    return [];
  }
}

const PLAY_SIMULATOR_GUIDE = `
PlaySimulator Key Semantics (condensed):
- Clock: play runs ~3000 ms. Client passes t in [0..1].
- Speed multipliers: receivers ~1.0 (TE 0.90, RB 0.98, SLOT 0.98); defenders ~0.88–1.00.
- Openness: computed as nearest defender separation in yards mapped to [0..1] where 1.5 yds → 0, 6.0 yds → 1.0.
- Throw areas: horizontal L/M/R by hash marks; vertical bands SHORT (<=10 yds beyond LOS), MID (<=20), DEEP (>20).
- Leverage: computed per WR vs likely man defender; recorded as inside/outside/even with notes.
- Press: CBs may press in man (C0/C1); outcomes include JAM_LOCK/WHIFF/JAM_AND_RELEASE causing early route delays.
- Cover 3 rotation: SKY/BUZZ/CLOUD_STRONG affects flat/curl and safety fits; meta.c3Rotation is provided when relevant.
- Snapshot provides conceptId, coverage, formation, align, routes (post-leverage), assignments, numbering, speeds, rngSeed, playId.
- SnapMeta provides press outcomes, block states, leverage map, leverageAdjust, and coverageInsights (e.g., MOF state, Palms trap cues).
- Use Read Plans from concept JSON to align the QB progression by coverage.
`;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AssistantRequest;
    const { conceptId, coverage, snapshot, snapMeta, focus = [], mode = "analysis" } = body;

    let concept = await loadConcept(conceptId);
    concept = applyOverrides(concept, body.overrides);
    const digest = conceptDigest(concept, coverage);

    const statsGlobal = await fetchThrowMetrics({
      coverage,
      conceptId,
      areaHoriz: body.filters?.areaHoriz,
      areaBand: body.filters?.areaBand,
      limit: 12,
    });
    const statsUser = body.userId ? await fetchThrowMetrics({
      coverage,
      conceptId,
      areaHoriz: body.filters?.areaHoriz,
      areaBand: body.filters?.areaBand,
      limit: 12,
      userId: body.userId
    }) : [];

    const system = {
      role: "system" as const,
      content:
        `You are QB Assistant, an elite NFL-level coach-agent.\n` +
        `Task: provide per-play feedback focused on progression, leverage, coverage IDs, and route concepts.\n` +
        `Be concise, specific, and actionable. If teaching, keep bullets tight. If quiz, ask one probing question.\n` +
        `Return STRICT JSON only (no markdown). Keys: summary, coverage_read, progression, leverage, open_reads, audible, coaching_points, quiz, stats, sources.\n` +
        `If FOCUS keys are provided (timing, leverage, rotation, hot), prioritize coaching on those dimensions.\n` +
        `Never include extra keys or commentary.`
    };

    const userContent =
      `${PLAY_SIMULATOR_GUIDE}\n` +
      `\nCONCEPT DIGEST:\n${digest.text}\n` +
      (snapshot
        ? `\nSNAPSHOT:\n${JSON.stringify({
            conceptId: snapshot.conceptId,
            coverage: snapshot.coverage,
            formation: snapshot.formation,
            hasAssignments: !!snapshot.assignments,
            hasNumbering: !!snapshot.numbering,
            recSpeed: snapshot.recSpeed,
            defSpeed: snapshot.defSpeed,
            rngSeed: snapshot.rngSeed,
            playId: snapshot.playId
          })}\n`
        : "") +
      (snapMeta
        ? `\nSNAP META:\n${JSON.stringify(snapMeta)}\n`
        : "") +
      (body.throwCtx ? `\nLAST THROW:\n${JSON.stringify(body.throwCtx)}\n` : "") +
      `\nAGG_STATS_GLOBAL (top-N):\n${JSON.stringify(statsGlobal)}\n` +
      (body.userId ? `\nAGG_STATS_USER (${body.userId}):\n${JSON.stringify(statsUser)}\n` : "") +
      `\nMODE: ${mode}\nFOCUS: ${focus.join(", ") || "(none)"}`;

    const messages = [system, { role: "user" as const, content: userContent }];

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages,
      response_format: { type: "json_object" }
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    let parsed: AssistantResponse | null = null;
    try { parsed = JSON.parse(raw) as AssistantResponse; } catch {}

    const fallback: AssistantResponse = {
      summary: "Assistant could not produce JSON; provide brief actionable cues.",
      coverage_read: undefined,
      progression: [],
      leverage: undefined,
      open_reads: [],
      coaching_points: [],
      stats: statsGlobal,
      sources: digest.sources?.slice(0, 3) ?? []
    };

    const base = parsed && typeof parsed.summary === 'string' ? parsed : fallback;
    const finalResult: AssistantResponse & { stats_user?: MetricRow[] } = {
      ...base,
      stats: base.stats ?? statsGlobal,
      sources: base.sources && base.sources.length > 0 ? base.sources : (digest.sources?.slice(0, 3) ?? []),
      ...(statsUser.length ? { stats_user: statsUser } : {})
    };

    return new Response(JSON.stringify(finalResult), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ summary: `Assistant error: ${msg}` }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
}
