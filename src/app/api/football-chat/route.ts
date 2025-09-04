export const runtime = "nodejs";
export const maxDuration = 15;

type Payload = {
  conceptId: string;
  coverage: string;
  rotateStrong?: boolean;
  nickelBlitz?: boolean;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set`);
  return v;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Payload;
    const { conceptId, coverage, rotateStrong, nickelBlitz } = body;

    // Simple local fallback (matches the UI rules)
    const fallback =
      nickelBlitz
        ? "Hot: Replace nickel blitz with quick hitch to #2 (H)."
        : rotateStrong
        ? "MOF safety rotating strong → Alert glance/now weak to X; else work hitch (H) if corner sinks, then corner (Z)."
        : `Base Smash vs ${coverage}: If cloud corner sinks with #1, throw hitch (H) now. If flat widens with hitch, throw corner (Z).`;

    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return new Response(JSON.stringify({ decision: fallback }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Ask model for a crisp, concise coaching decision
    const prompt =
`You are "Football Playbook Coach". Be concise and accurate.
Concept: Smash. Coverage: ${coverage}. rotateStrong=${!!rotateStrong}. nickelBlitz=${!!nickelBlitz}.
Return one sentence with the best coaching decision (mention route letter if helpful, e.g., H or Z).`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim();
    return new Response(JSON.stringify({ decision: text || fallback }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ decision: `Rules: ${msg}` }), {
      headers: { "Content-Type": "application/json" }, status: 200
    });
  }
}
