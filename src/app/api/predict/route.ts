export const runtime = "edge"; // fast on Vercel Edge

type ChatRole = "system" | "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

type RequestPayload = {
  topic: string;
  domains: string[];
  region: string;
  horizon: number;
  question: string;
};

type Driver = { name: string; why_it_matters: string; indicative_metrics?: string[] };
type SynthOut = { drivers: Driver[] };

type Timeline = { year: number; milestones: string[] };
type Scenario = { name: string; summary: string; decade_timeline: Timeline[] };

type AuditOut = { signals: string[]; open_questions: string[] };

type FinalPayload = {
  title: string;
  domains: string[];
  horizon_years: number;
  scenarios: Scenario[];
  signals: string[];
  open_questions: string[];
  suggested_actions: string[];
};

function safeParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function chat(messages: ChatMessage[], expectJSON = false): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
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
    // Surface error text for easier debugging
    const t = await res.text();
    throw new Error(t || "OpenAI request failed");
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

export async function POST(req: Request) {
  try {
    const incoming = (await req.json()) as Partial<RequestPayload> | null;

    const topic = incoming?.topic ?? "Global AI progress";
    const domains = incoming?.domains ?? ["markets", "politics", "technology"];
    const region = incoming?.region ?? "Global";
    const horizon = typeof incoming?.horizon === "number" ? incoming!.horizon : 50;
    const question = incoming?.question ?? "";

    // 1) Trend Synthesizer
    const synthMsg = await chat(
      [
        {
          role: "system",
          content:
            `You are Trend Synthesizer. Return JSON: ` +
            `{ "drivers": [{ "name": string, "why_it_matters": string, "indicative_metrics": string[] }] }`
        },
        {
          role: "user",
          content:
            `Topic: ${topic}\nDomains: ${domains.join(", ")}\nRegion: ${region}\nHorizon: ${horizon}\n` +
            `Question: ${question || "(none)"}\nReturn JSON only.`
        }
      ],
      true
    );
    const synth = safeParse<SynthOut>(synthMsg) ?? { drivers: [] };

    // 2) Scenario Generator
    const scenMsg = await chat(
      [
        {
          role: "system",
          content:
            `You are Scenario Generator. Return JSON: { "scenarios":[{ "name":"Baseline|Upside|Downside", ` +
            `"summary": string, "decade_timeline":[{"year":number,"milestones":string[]}] }] } spanning ${horizon}y in ~10y steps.`
        },
        { role: "user", content: `Drivers JSON:\n${JSON.stringify(synth)}\nReturn JSON only.` }
      ],
      true
    );
    const scenParsed = safeParse<{ scenarios: Scenario[] }>(scenMsg);
    const scenarios: Scenario[] = scenParsed?.scenarios ?? [];

    // 3) Risk Auditor
    const auditMsg = await chat(
      [
        {
          role: "system",
          content: `You are Risk Auditor. Return JSON: { "signals": string[], "open_questions": string[] }`
        },
        {
          role: "user",
          content:
            `Topic: ${topic}\nDomains: ${domains.join(", ")}\nRegion: ${region}\n` +
            `Scenarios: ${JSON.stringify(scenarios)}\nReturn JSON only.`
        }
      ],
      true
    );
    const audit = safeParse<AuditOut>(auditMsg) ?? { signals: [], open_questions: [] };

    // 4) Executive Summary
    const finalMsg = await chat(
      [
        {
          role: "system",
          content:
            `You are Executive Summarizer. Return STRICT JSON:\n` +
            `{\n  "title": string,\n  "domains": string[],\n  "horizon_years": number,\n` +
            `  "scenarios": [{ "name": string, "summary": string, "decade_timeline": [{"year": number, "milestones": string[]}] }],\n` +
            `  "signals": string[],\n  "open_questions": string[],\n  "suggested_actions": string[]\n}`
        },
        {
          role: "user",
          content:
            `Inputs:\nTopic: ${topic}\nDomains: ${domains.join(", ")}\nRegion: ${region}\nHorizon: ${horizon}\n` +
            `Drivers: ${JSON.stringify(synth)}\nScenarios: ${JSON.stringify(scenarios)}\nAudit: ${JSON.stringify(audit)}\n` +
            `Audience: analysts, founders, policymakers.`
        }
      ],
      true
    );
    const parsed = safeParse<FinalPayload>(finalMsg);

    const finalJSON: FinalPayload =
      parsed ?? {
        title: `${topic} — ${horizon}-Year Outlook`,
        domains,
        horizon_years: horizon,
        scenarios,
        signals: audit.signals,
        open_questions: audit.open_questions,
        suggested_actions: []
      };

    finalJSON.title ||= `${topic} — ${horizon}-Year Outlook`;
    finalJSON.domains ||= domains;
    finalJSON.horizon_years ||= horizon;

    return new Response(JSON.stringify(finalJSON), {
      status: 200,
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