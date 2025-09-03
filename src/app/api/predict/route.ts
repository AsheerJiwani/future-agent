export const runtime = "edge"; // fast on Vercel Edge

type Driver = { name: string; why_it_matters: string; indicative_metrics?: string[] };
type SynthOut = { drivers: Driver[] };

export async function POST(req: Request) {
  try {
    const { topic = "Global AI progress", domains = ["markets", "politics", "technology"], region = "Global", horizon = 50, question = "" } =
      (await req.json()) || {};

    const headers = {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    };

    async function chat(messages: any[], expectJSON = false): Promise<string> {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.6,
          messages,
          response_format: expectJSON ? { type: "json_object" } : undefined
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.choices?.[0]?.message?.content || "";
    }

    // Agent 1: Trend Synthesizer
    const synthMsg = await chat(
      [
        { role: "system", content: `You are Trend Synthesizer. Return JSON: { "drivers": [{ "name": string, "why_it_matters": string, "indicative_metrics": string[] }] }` },
        {
          role: "user",
          content: `Topic: ${topic}\nDomains: ${domains.join(", ")}\nRegion: ${region}\nHorizon: ${horizon}\nQuestion: ${question || "(none)"}\nReturn JSON only.`
        }
      ],
      true
    );
    let synth: SynthOut = { drivers: [] };
    try { synth = JSON.parse(synthMsg); } catch {}

    // Agent 2: Scenarios
    const scenMsg = await chat(
      [
        { role: "system", content: `You are Scenario Generator. Return JSON: { "scenarios":[{ "name":"Baseline|Upside|Downside", "summary": string, "decade_timeline":[{"year":number,"milestones":string[]}] }] } spanning ${horizon}y in ~10y steps.` },
        { role: "user", content: `Drivers JSON:\n${JSON.stringify(synth)}\nReturn JSON only.` }
      ],
      true
    );
    let scenarios: any[] = [];
    try { scenarios = JSON.parse(scenMsg).scenarios || []; } catch {}

    // Agent 3: Risk Auditor
    const auditMsg = await chat(
      [
        { role: "system", content: `You are Risk Auditor. Return JSON: { "signals": string[], "open_questions": string[] }` },
        {
          role: "user",
          content: `Topic: ${topic}\nDomains: ${domains.join(", ")}\nRegion: ${region}\nScenarios: ${JSON.stringify(scenarios)}\nReturn JSON only.`
        }
      ],
      true
    );
    let audit = { signals: [], open_questions: [] as string[] };
    try { audit = JSON.parse(auditMsg); } catch {}

    // Agent 4: Executive Summary
    const finalMsg = await chat(
      [
        {
          role: "system",
          content:
            `You are Executive Summarizer. Return STRICT JSON:
{
  "title": string,
  "domains": string[],
  "horizon_years": number,
  "scenarios": [{ "name": string, "summary": string, "decade_timeline": [{"year": number, "milestones": string[]}] }],
  "signals": string[],
  "open_questions": string[],
  "suggested_actions": string[]
}`
        },
        {
          role: "user",
          content: `Inputs:
Topic: ${topic}
Domains: ${domains.join(", ")}
Region: ${region}
Horizon: ${horizon}
Drivers: ${JSON.stringify(synth)}
Scenarios: ${JSON.stringify(scenarios)}
Audit: ${JSON.stringify(audit)}
Audience: analysts, founders, policymakers.`
        }
      ],
      true
    );

    let finalJSON: any;
    try {
      finalJSON = JSON.parse(finalMsg);
    } catch {
      finalJSON = {
        title: `${topic} — ${horizon}-Year Outlook`,
        domains,
        horizon_years: horizon,
        scenarios,
        signals: audit.signals || [],
        open_questions: audit.open_questions || [],
        suggested_actions: []
      };
    }

    // Ensure minimal shape
    finalJSON.title ||= `${topic} — ${horizon}-Year Outlook`;
    finalJSON.domains ||= domains;
    finalJSON.horizon_years ||= horizon;

    return new Response(JSON.stringify(finalJSON), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
