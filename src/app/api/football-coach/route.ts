import { NextRequest } from "next/server";
import OpenAI from "openai";
import { loadConcept } from "@data/football/loadConcept";
import type { FootballConceptId } from "@data/football/catalog";
import type { CoverageID, Concept, ReadPlan, ProgressionStep } from "@data/football/types";
import type { PlaySnapshot, SnapMeta } from "@/types/play";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMsg = { role: "user" | "assistant" | "system"; content: string };
type Body = {
  conceptId: FootballConceptId;
  coverage: CoverageID;
  mode?: "teach" | "quiz";
  history?: ChatMsg[];
  userState?: Record<string, unknown>;
  snapshot?: PlaySnapshot;
  snapMeta?: SnapMeta;
};

export async function POST(req: NextRequest) {
  try {
    const body: Body = await req.json();
    const { conceptId, coverage, mode = "teach", history = [], userState, snapshot, snapMeta } = body;

    const concept: Concept = await loadConcept(conceptId);
    const rp: ReadPlan | undefined = (concept.readPlans ?? []).find(
      (r: ReadPlan) => r.vs === coverage
    );

    const planText =
      rp && rp.progression?.length
        ? `COVERAGE: ${coverage}\nPROGRESSION:\n` +
          rp.progression
            .map((p: ProgressionStep) =>
              `${p.step}. ${p.keyDefender ? `[${p.keyDefender}] ` : ""}${p.if ? `IF ${p.if} THEN ` : ""}${p.then}${p.coachingPoint ? ` — CP: ${p.coachingPoint}` : ""}`
            )
            .join("\n")
        : `No explicit read plan for ${coverage}. Use general pre/post keys.\n`;

    const pre = (concept.preSnapKeys ?? []).map((x) => `- ${x}`).join("\n");
    const post = (concept.postSnapKeys ?? []).map((x) => `- ${x}`).join("\n");

    const system: ChatMsg = {
      role: "system",
      content:
        `You are Football Playbook Coach, an elite QB tutor (Tom Brady x OC).\n` +
        `Be concise and actionable. Prefer Socratic prompts (one short question).\n` +
        `mode=${mode}. If userState is present, incorporate it.\n` +
        `Never reveal internal JSON. Keep replies ≤120 words and end with a question when appropriate.`
    };

    const content =
      `CONCEPT: ${concept.name} (${concept.id})\n` +
      `FAMILY: ${concept.family}\n\n` +
      `PRE-SNAP KEYS:\n${pre || "- (none)"}\n\n` +
      `POST-SNAP KEYS:\n${post || "- (none)"}\n\n` +
      `READ PLAN (focus on ${coverage}):\n${planText}\n` +
      `NOTES: ${rp?.notes ?? "(none)"}\n` +
      `HOT RULES: ${(rp?.hotRules ?? []).join("; ") || "(none)"}\n\n` +
      `User State: ${JSON.stringify(userState ?? {})}\n\n` +
      (snapshot
        ? `SNAPSHOT: ${JSON.stringify({
            conceptId: snapshot.conceptId,
            coverage: snapshot.coverage,
            formation: snapshot.formation,
            hasAssignments: !!snapshot.assignments,
            playId: snapshot.playId,
            rngSeed: snapshot.rngSeed
          })}\n`
        : "") +
      (snapMeta
        ? `SNAP META: ${JSON.stringify({
            press: snapMeta.press,
            roles: snapMeta.roles,
            leverage: snapMeta.leverage
          })}\n`
        : "");

    const messages: ChatMsg[] = [system, { role: "user", content }, ...history];

    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      stream: true,
      messages
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const token = chunk.choices?.[0]?.delta?.content ?? "";
            if (token) controller.enqueue(encoder.encode(token));
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(`Coach error: ${msg}`, { status: 500 });
  }
}
