// src/app/api/football-assistant/agent/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionMessageToolCall } from "openai/resources/chat/completions";
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

async function getMetrics({ coverage, conceptId, areaHoriz, areaBand, limit = 12, userId }: { coverage?: string; conceptId?: string; areaHoriz?: string; areaBand?: string; limit?: number; userId?: string }) {
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
  // fallback to internal route
  const url = new URL("http://localhost/api/metrics/throw-summary");
  if (coverage) url.searchParams.set('coverage', coverage);
  if (conceptId) url.searchParams.set('conceptId', conceptId);
  if (areaHoriz) url.searchParams.set('areaHoriz', areaHoriz);
  if (areaBand) url.searchParams.set('areaBand', areaBand);
  url.searchParams.set('limit', String(limit));
  if (userId) url.searchParams.set('userId', userId);
  const res = await fetch(url);
  const json = await res.json();
  return json?.rows ?? [];
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
          parameters: { type: "object", additionalProperties: true }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "suggest_audible",
          description: "Call internal audible suggester to adjust assignments",
          parameters: { type: "object", additionalProperties: true }
        }
      }
    ];

    const sys =
      `You are QB Coach Agent. Use tools to fetch concept, metrics, session memory, and grading.\n` +
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
      throwCtx
    };

    const sessionMemory = await getSessionMemory(userId);

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: sys },
      { role: 'user', content: JSON.stringify({ ...user, sessionMemory }) }
    ];

    type ToolArgs = Record<string, unknown>;
    type ToolResult = Record<string, unknown>;
    async function execTool(name: string, args: ToolArgs): Promise<ToolResult> {
      if (name === 'get_concept_digest') {
        const concept = await loadConcept(String(args.conceptId) as FootballConceptId);
        return { digest: conceptDigest(concept, String(args.coverage) as CoverageID), sources: concept.sources ?? [] } as ToolResult;
      }
      if (name === 'get_throw_metrics') {
        const rows = await getMetrics({ coverage: String(args.coverage || ''), conceptId: String(args.conceptId || ''), areaHoriz: String(args.areaHoriz || ''), areaBand: String(args.areaBand || ''), limit: Number(args.limit || 12), userId: args.userId ? String(args.userId) : undefined });
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
        const res = await fetch("http://localhost/api/football-grade", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
        try { return (await res.json()) as ToolResult; } catch { return {}; }
      }
      if (name === 'suggest_audible') {
        const res = await fetch("http://localhost/api/football-audible", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
        try { return (await res.json()) as ToolResult; } catch { return {}; }
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
      return new Response(content, { headers: { 'Content-Type': 'application/json' } });
    }

    // Fallback if loop didn’t return a final message
    return new Response(JSON.stringify({ summary: "Agent could not finalize response." }), { headers: { 'Content-Type': 'application/json' }, status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return new Response(JSON.stringify({ summary: `Agent error: ${msg}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}
