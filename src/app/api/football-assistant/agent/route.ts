// src/app/api/football-assistant/agent/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionMessageToolCall } from "openai/resources/chat/completions";
import type { NextRequest } from "next/server";
import * as GradeRoute from "../../football-grade/route";
import * as AudibleRoute from "../../football-audible/route";
import * as MetricsRoute from "../../metrics/throw-summary/route";
import { createClient } from "@supabase/supabase-js";
import { loadConcept } from "@data/football/loadConcept";
import type { FootballConceptId } from "@data/football/catalog";
import type { CoverageID, Concept, ReadPlan, ProgressionStep } from "@data/football/types";
import type { PlaySnapshot, SnapMeta } from "@/types/play";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const PLAY_SIMULATOR_GUIDE = `
PlaySimulator Key Semantics (condensed):
- Clock ~3000 ms; t in [0..1].
- Openness is nearest defender separation mapped 1.5yd->0 to 6yd->1.
- Throw Area: L/M/R by hashes; Bands SHORT/MID/DEEP by depth from LOS.
- Press outcomes (C0/C1) delay WR starts; affects timing.
- C3 rotation: SKY/BUZZ/CLOUD_STRONG; MOF and trap/carry cues in meta.
`;

type AgentBody = {
  conceptId: FootballConceptId;
  coverage: CoverageID;
  snapshot?: PlaySnapshot;
  snapMeta?: SnapMeta;
  filters?: { areaHoriz?: "L" | "M" | "R"; areaBand?: "SHORT" | "MID" | "DEEP" };
  focus?: Array<"timing"|"leverage"|"rotation"|"hot">;
  userId?: string;
  throwCtx?: Record<string, unknown>;
  toggles?: { audibles?: boolean; tutor?: boolean };
};

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
  return (
    `CONCEPT: ${concept.name} (${concept.id})\n` +
    `FAMILY: ${concept.family}\n\n` +
    `PRE:\n${pre || "- none"}\n\nPOST:\n${post || "- none"}\n\nREAD PLAN vs ${coverage}:\n${plan}`
  );
}

async function getMetrics({ coverage, conceptId, areaHoriz, areaBand, limit = 12, userId, baseOrigin }: { coverage?: string; conceptId?: string; areaHoriz?: string; areaBand?: string; limit?: number; userId?: string; baseOrigin: string }) {
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
        p_user_id: userId ?? null,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    } catch {}
  }
  // fallback: call internal metrics handler directly
  try {
    const url = new URL("/api/metrics/throw-summary", baseOrigin);
    if (coverage) url.searchParams.set('coverage', coverage);
    if (conceptId) url.searchParams.set('conceptId', conceptId);
    if (areaHoriz) url.searchParams.set('areaHoriz', areaHoriz);
    if (areaBand) url.searchParams.set('areaBand', areaBand);
    url.searchParams.set('limit', String(limit));
    if (userId) url.searchParams.set('userId', userId);
    const req = new Request(url, { method: 'GET' });
    const resp = await MetricsRoute.GET(req as unknown as NextRequest);
    const json = await resp.json();
    return (json?.rows ?? []) as unknown[];
  } catch {
    return [];
  }
}

async function getSessionMemory(userId?: string): Promise<Record<string, unknown>> {
  if (!userId) return {};
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return {};
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data, error } = await supabase.from('assistant_memory').select('data').eq('user_id', userId).maybeSingle();
    if (error) return {};
    return (data?.data as Record<string, unknown>) || {};
  } catch {
    return {};
  }
}

async function mergeSessionMemory(userId: string | undefined, patch: Record<string, unknown>): Promise<{ ok: boolean }>{
  if (!userId) return { ok: false };
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { ok: false };
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const current = await getSessionMemory(userId);
    const merged = { ...current, ...patch };
    const { error } = await supabase.from('assistant_memory').upsert({ user_id: userId, data: merged, updated_at: new Date().toISOString() });
    if (error) return { ok: false };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AgentBody;
    const { conceptId, coverage, snapshot, snapMeta, filters, focus = [], userId, throwCtx } = body;

    const tools = [
      {
        type: "function" as const,
        function: {
          name: "get_concept_digest",
          description: "Load and summarize the concept with coverage-specific read plan",
          parameters: {
            type: "object",
            properties: {
              conceptId: { type: "string" },
              coverage: { type: "string" }
            },
            required: ["conceptId", "coverage"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "get_throw_metrics",
          description: "Fetch aggregated throw metrics (optionally user-specific)",
          parameters: {
            type: "object",
            properties: {
              coverage: { type: "string" },
              conceptId: { type: "string" },
              areaHoriz: { type: "string" },
              areaBand: { type: "string" },
              limit: { type: "number" },
              userId: { type: "string" }
            }
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "get_session_memory",
          description: "Retrieve compact session memory for personalization",
          parameters: {
            type: "object",
            properties: { userId: { type: "string" } },
            required: ["userId"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "set_session_memory",
          description: "Merge small JSON patch into session memory",
          parameters: {
            type: "object",
            properties: { userId: { type: "string" }, patch: { type: "object", additionalProperties: true } },
            required: ["userId", "patch"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "grade_throw",
          description: "Call internal grader for a throw decision",
          parameters: {
            type: "object",
            properties: {
              conceptId: { type: "string", description: "Concept ID (e.g., SMASH)" },
              coverage: { type: "string", description: "Coverage ID (e.g., C3, C1)" },
              target: { type: "string", description: "Receiver ID: X, Z, SLOT, TE, RB" },
              time: { type: "number", description: "Play clock fraction 0..1 at the throw" },
              formation: { type: "string" },
              assignments: { type: "object", additionalProperties: { type: "string" }, description: "Receiver->RouteKeyword map" },
              numbering: { type: "object" },
              windowScore: { type: "number" },
              nearestSepYds: { type: "number" },
              nearestDefender: { type: "string" },
              playId: { type: "number" },
              holdMs: { type: "number" },
              throwArea: { type: "string" }
            },
            required: ["conceptId", "coverage", "target", "time"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "suggest_audible",
          description: "Call internal audible suggester to adjust assignments",
          parameters: {
            type: "object",
            properties: {
              conceptId: { type: "string" },
              coverage: { type: "string" },
              formation: { type: "string" },
              assignments: { type: "object", additionalProperties: { type: "string" } },
              numbering: { type: "object" },
              snapshot: { type: "object" },
              snapMeta: { type: "object" }
            },
            required: ["conceptId", "coverage", "formation", "numbering"]
          }
        }
      }
    ];

    const sys =
      `You are QB Coach Agent. Use tools to fetch concept, metrics, session memory, grading, and audibles.\n` +
      `Respond with STRICT JSON: {summary, coverage_read, progression, leverage, open_reads, audible, coaching_points, quiz, stats, sources}.\n` +
      `Maintain a tiny session memory: track user tendencies and 2-3 coaching themes; keep it under 20 short keys.\n` +
      `Prefer updating memory only when a meaningful habit is seen.\n` +
      `Prioritize FOCUS: ${focus.join(', ') || '(none)'}. ${PLAY_SIMULATOR_GUIDE}`;

    const user = {
      conceptId,
      coverage,
      snapshot: snapshot ? { conceptId: snapshot.conceptId, coverage: snapshot.coverage, formation: snapshot.formation, playId: snapshot.playId } : undefined,
      snapMeta,
      filters,
      userId,
      throwCtx,
      toggles: body.toggles ?? {}
    };

    const sessionMemory = await getSessionMemory(userId);

    // Resolve base origin for internal tool fetches
    const origin = (() => {
      try { const u = new URL(req.url); return u.origin; } catch { /* no-op */ }
      const proto = (req.headers as Headers).get('x-forwarded-proto') ?? 'https';
      const host = (req.headers as Headers).get('host') ?? 'localhost';
      return `${proto}://${host}`;
    })();

    const togglesText = (() => {
      const t = body.toggles ?? {};
      return `\nTOGGLES: audibles=${!!t.audibles}, tutor=${!!t.tutor}. If audibles=true, populate 'audible' with concrete suggestions (routes/formation) using tool as needed. If tutor=true, ensure 'progression' is populated with concise, next-snap coaching bullet points.`;
    })();

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: sys },
      { role: 'user', content: JSON.stringify({ ...user, sessionMemory }) + togglesText }
    ];

    type ToolArgs = Record<string, unknown>;
    type ToolResult = Record<string, unknown>;
    async function execTool(name: string, args: ToolArgs): Promise<ToolResult> {
      if (name === 'get_concept_digest') {
        const concept = await loadConcept(String(args.conceptId) as FootballConceptId);
        return { digest: conceptDigest(concept, String(args.coverage) as CoverageID), sources: concept.sources ?? [] } as ToolResult;
      }
      if (name === 'get_throw_metrics') {
        const rows = await getMetrics({ coverage: String(args.coverage || ''), conceptId: String(args.conceptId || ''), areaHoriz: String(args.areaHoriz || ''), areaBand: String(args.areaBand || ''), limit: Number(args.limit || 12), userId: args.userId ? String(args.userId) : undefined, baseOrigin: origin });
        return { rows } as ToolResult;
      }
      if (name === 'get_session_memory') {
        const mem = await getSessionMemory(args.userId ? String(args.userId) : undefined);
        return { data: mem } as ToolResult;
      }
      if (name === 'set_session_memory') {
        const ok = await mergeSessionMemory(args.userId ? String(args.userId) : undefined, (args.patch as Record<string, unknown>) || {});
        return { ok } as ToolResult;
      }
      if (name === 'grade_throw') {
        try {
          const req = new Request(new URL('/api/football-grade', origin), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
          const resp = await (GradeRoute as { POST: (r: NextRequest) => Promise<Response> }).POST(req as unknown as NextRequest);
          const json = (await resp.json()) as ToolResult;
          return json;
        } catch {
          return {};
        }
      }
      if (name === 'suggest_audible') {
        try {
          const req = new Request(new URL('/api/football-audible', origin), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
          const resp = await (AudibleRoute as { POST: (r: Request) => Promise<Response> }).POST(req);
          const json = (await resp.json()) as ToolResult;
          return json;
        } catch {
          return {};
        }
      }
      return {};
    }

    for (let step = 0; step < 4; step++) {
      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.2
      });
      const msg = resp.choices[0]?.message;
      if (!msg) break;
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        // Include the assistant message that requested the tool calls
        messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls } as ChatCompletionMessageParam);

        for (const tc of (msg.tool_calls as ChatCompletionMessageToolCall[])) {
          if (tc.type !== 'function') continue;
          const tname = tc.function.name || "";
          const argStr = tc.function.arguments || "{}";
          const args: ToolArgs = (() => { try { return JSON.parse(argStr) as ToolArgs; } catch { return {}; } })();
          const out = await execTool(tname, args);
          messages.push({ role: 'tool', content: JSON.stringify(out), tool_call_id: tc.id } as ChatCompletionMessageParam);
        }
        continue; // iterate to give model tool outputs
      }
      // No tools, final content intended
      const content = msg.content || "{}";
      try {
        const obj = JSON.parse(content) as { summary?: unknown } & Record<string, unknown>;
        if (obj && typeof obj.summary !== 'string') {
          obj.summary = JSON.stringify(obj.summary);
        }
        return new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } });
      } catch {
        // If model didn't return JSON (shouldn't happen), wrap as string summary
        const fallback = { summary: String(content) };
        return new Response(JSON.stringify(fallback), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Fallback if loop didn’t return a final message
    return new Response(JSON.stringify({ summary: "Agent could not finalize response." }), { headers: { 'Content-Type': 'application/json' }, status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return new Response(JSON.stringify({ summary: `Agent error: ${msg}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}
