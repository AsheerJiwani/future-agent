// src/app/api/predict/route.ts
export const runtime = "nodejs";
export const maxDuration = 30;

type ChatRole = "system" | "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

type RequestPayload = {
  topic: string;
  domains: string[];
  region: string;
  horizon: number;
  question: string;
};

type Timeline = { year: number; milestones: string[] };
type Scenario = { name: string; summary: string; decade_timeline: Timeline[] };

type FinalPayload = {
  title: string;
  domains: string[];
  horizon_years: number;
  scenarios: Scenario[];
  signals: string[];
  open_questions: string[];
  suggested_actions: string[];
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Server misconfigured: ${name} is not set`);
  return v;
}

function safeParse<T>(text: string): T | null {
  try { return JSON.parse(text) as T; } catch { return null; }
}

async function chat(messages: ChatMessage[], expectJSON = false): Promise<string> {
  const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages,
      response_format: expectJSON ? { type: "json_object" } : undefined
    })
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("[api/predict] OpenAI error:", t);
    throw new Error(t || "OpenAI request failed");
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

export async function POST(req: Request) {
  try {
    const incoming = (await req.json()) as Partial<RequestPayload> | null;
    const topic    = incoming?.topic    ?? "Global AI progress";
    const domains  = incoming?.domains  ?? ["markets", "politics", "technology", "society"];
    const region   = incoming?.region   ?? "Global";
    const horizon  = typeof incoming?.horizon === "number" ? incoming!.horizon : 50;
    const question = incoming?.question ?? "";

    const system: ChatMessage = {
      role: "system",
      content:
`You are a single-pass Futurecasting multi-agent in one body.
Write ONLY strict JSON with keys:
{
  "title": string,
  "domains": string[],
  "horizon_years": number,
  "scenarios": [
    { "name": "Baseline", "summary": string, "decade_timeline": [{"year": number, "milestones": string[]}] },
    { "name": "Upside",   "summary": string, "decade_timeline": [{"year": number, "milestones": string[]}] },
    { "name": "Downside", "summary": string, "decade_timeline": [{"year": number, "milestones": string[]}] }
  ],
  "signals": string[],
  "open_questions": string[],
  "suggested_actions": string[]
}
Constraints:
- horizon spans ~10-year steps up to the given number of years
- each summary <= 120 words
- keep signals/actions concise and concrete
- NO markdown, NO commentary, JSON only`
    };

    const user: ChatMessage = {
      role: "user",
      content:
`Topic: ${topic}
Domains: ${domains.join(", ")}
Region: ${region}
Horizon: ${horizon}
Question: ${question || "(none)"}`
    };

    const jsonStr = await chat([system, user], true);
    const parsed = safeParse<FinalPayload>(jsonStr);
    const fallback: FinalPayload = {
      title: `${topic} — ${horizon}-Year Outlook`,
      domains, horizon_years: horizon,
      scenarios: [],
      signals: [], open_questions: [], suggested_actions: []
    };

    return new Response(JSON.stringify(parsed ?? fallback), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
