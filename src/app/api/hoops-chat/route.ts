// src/app/api/hoops-chat/route.ts
export const runtime = "nodejs";
export const maxDuration = 30;

import { HOOPS_SOURCES, type HoopsSource } from "../../../data/hoopsSources";

/* ---------------- Types ---------------- */
type ChatRole = "system" | "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };
type ClientMsg = { message: string; history?: ChatMessage[] };

type BotJSON = {
  answer: string;
  follow_up: string;
  sources: { title: string; url: string }[];
};

/* ---------------- Utils ---------------- */
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Server misconfigured: ${name} is not set`);
  return v;
}

function tkn(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreSource(src: HoopsSource, qTokens: string[]): number {
  const bag = new Set([
    ...tkn(src.title),
    ...(src.tags || []).flatMap(tkn),
    ...tkn(src.url),
    ...tkn(src.date || ""),
  ]);
  return qTokens.reduce((acc, w) => acc + (bag.has(w) ? 1 : 0), 0);
}

function pickSources(
  query: string,
  history: ChatMessage[] | undefined,
  k = 6
): HoopsSource[] {
  const lastUser =
    [...(history || [])].reverse().find((m) => m.role === "user")?.content ||
    "";
  const tokens = tkn(`${query} ${lastUser}`.slice(-2000));
  return [...HOOPS_SOURCES]
    .map((s) => ({ s, score: scoreSource(s, tokens) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.s);
}

async function chat(
  messages: ChatMessage[],
  expectJSON = false
): Promise<string> {
  const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages,
      response_format: expectJSON ? { type: "json_object" } : undefined,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "OpenAI request failed");
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

function safeParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/* ---------------- Handler ---------------- */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ClientMsg;
    const userMsg = body.message?.trim();
    if (!userMsg) {
      return new Response(JSON.stringify({ error: "Empty message" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1) Pick relevant sources from curated list
    const picked = pickSources(userMsg, body.history, 6);
    const sources = picked.map((p) => ({ title: p.title, url: p.url }));
    const sourcesBlock =
      picked.length === 0
        ? "(none)"
        : picked
            .map(
              (p, i) =>
                `[${i + 1}] ${p.title}${
                  p.date ? ` (${p.date})` : ""
                }\nURL: ${p.url}\nTags: ${(p.tags || []).join(", ")}`
            )
            .join("\n\n");

    // 2) Build the prompt (persona + strict JSON contract)
    const system: ChatMessage = {
      role: "system",
      content:
        `You are "Hoops Tutor" — a chill, teen-coded basketball nerd who teaches with energy.\n` +
        `STYLE:\n` +
        `- Friendly, concise, lightly slangy (tasteful), always accurate.\n` +
        `- Explain like a coach with a whiteboard. Use bullets and short paragraphs.\n\n` +
        `KNOWLEDGE & SOURCING:\n` +
        `- Use your basketball knowledge AND the curated links provided below as citations.\n` +
        `- Prefer authoritative sources (NBA/FIBA rule pages, Basketball-Reference, Wikipedia for overview, quality coaching sites).\n` +
        `- If info is uncertain or not covered, say so briefly and suggest where to look.\n\n` +
        `OUTPUT (STRICT JSON ONLY):\n` +
        `{\n` +
        `  "answer": string,\n` +
        `  "follow_up": string,\n` +
        `  "sources": [{"title": string, "url": string}] \n` +
        `}\n\n` +
        `CURATED LINKS:\n` +
        `${sourcesBlock}`,
    };

    const historyTrimmed = (body.history || []).slice(-12);
    const user: ChatMessage = { role: "user", content: userMsg };

    // 3) Ask the model for strict JSON
    const raw = await chat([system, ...historyTrimmed, user], true);
    const parsed = safeParse<BotJSON>(raw);

    const finalJSON: BotJSON =
      parsed && parsed.answer
        ? {
            answer: parsed.answer,
            follow_up:
              parsed.follow_up ||
              "What era, team, or play should we dig into next?",
            sources:
              parsed.sources && parsed.sources.length > 0
                ? parsed.sources
                : sources,
          }
        : {
            answer: raw || "I couldn't generate an answer this time.",
            follow_up: "What era, team, or play should we dig into next?",
            sources,
          };

    // Ensure at least one source is present
    if (!finalJSON.sources || finalJSON.sources.length === 0) {
      finalJSON.sources = sources;
    }

    return new Response(JSON.stringify(finalJSON), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
