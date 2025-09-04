export const runtime = "nodejs";
export const maxDuration = 30;

type ChatRole = "system" | "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

type ClientMsg = { message: string; history?: ChatMessage[] };

type KBItem = { title: string; url: string; text: string; tags: string[] };

const KB: KBItem[] = [
  { title: "Origins of Basketball (1891)", url: "https://en.wikipedia.org/wiki/James_Naismith",
    text: "James Naismith invented basketball in 1891 at Springfield College; 13 original rules; peach baskets.",
    tags: ["history","origins","Naismith","rules"] },
  { title: "24-second Shot Clock (1954)", url: "https://en.wikipedia.org/wiki/Shot_clock",
    text: "NBA adopted the 24-second shot clock in 1954 to speed up play; Danny Biasone credited.",
    tags: ["rules","shot clock","1954","NBA"] },
  { title: "Three-Point Line", url: "https://en.wikipedia.org/wiki/Three-point_field_goal",
    text: "ABA used a 3-point arc in 1967; NBA added it in 1979; distance and corner geometry changed pace/space.",
    tags: ["3pt","ABA","NBA","spacing","1979"] },
  { title: "Triangle Offense", url: "https://en.wikipedia.org/wiki/Triangle_offense",
    text: "Tex Winter/Phil Jackson system using sideline triangle + two-man game weakside; reads over set plays.",
    tags: ["offense","triangle","Bulls","Lakers"] },
  { title: "Pick-and-Roll", url: "https://en.wikipedia.org/wiki/Pick_and_roll",
    text: "High PnR: ball screen → options: drive, short roll, pop, skip; defenses: drop, switch, hedge, blitz.",
    tags: ["pick and roll","PnR","offense","defense coverages"] },
  { title: "Princeton Offense", url: "https://en.wikipedia.org/wiki/Princeton_offense",
    text: "Read-based: backdoor cuts, spacing, passing; used to equalize talent gaps.",
    tags: ["Princeton","offense","backdoor"] },
  { title: "Zone vs Illegal Defense", url: "https://en.wikipedia.org/wiki/Zone_defense#NBA",
    text: "NBA removed illegal defense in 2001; zone allowed; defensive 3-second rule introduced.",
    tags: ["defense","zone","illegal defense","2001","defensive 3 seconds"] },
  { title: "Hand-Checking Changes", url: "https://en.wikipedia.org/wiki/Hand-checking",
    text: "2004 rules reduced hand-checking on perimeter; boosted guard scoring and pace.",
    tags: ["rules","hand-checking","2004","pace"] },
  { title: "Pace-and-Space & Threes", url: "https://www.basketball-reference.com/",
    text: "Modern NBA emphasizes 3s, rim attempts, pace; four-out/5-out spacing; analytics influence.",
    tags: ["modern","analytics","spacing","pace"] },
  { title: "Iconic Sets: Spain PnR", url: "https://www.breakthroughbasketball.com/offense/spain-pick-and-roll.html",
    text: "Spain PnR: backscreen on the roller after the ball screen; forces switching chain reactions.",
    tags: ["Spain PnR","sets","advanced"] },
  { title: "Classic Teams & Eras", url: "https://www.basketball-reference.com/teams/",
    text: "Celtics dynasty (60s), Showtime Lakers, 90s Bulls, 2010s Warriors small-ball & gravity.",
    tags: ["history","teams","Warriors","Bulls","Lakers","Celtics"] },
];

function tokenize(s: string): string[] {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}
function score(item: KBItem, queryTokens: string[]): number {
  const t = new Set(item.tags.concat(tokenize(item.text)).concat(tokenize(item.title)));
  return queryTokens.reduce((acc, w) => acc + (t.has(w) ? 1 : 0), 0);
}
function retrieve(query: string, history: ChatMessage[] | undefined, k = 5): KBItem[] {
  const lastUser = [...(history || [])].reverse().find((m) => m.role === "user")?.content || "";
  const q = `${query} ${lastUser}`.slice(-2000);
  const tokens = tokenize(q);
  return [...KB].map((it) => [it, score(it, tokens)] as const)
    .sort((a,b) => b[1]-a[1]).slice(0, k).map(([it]) => it);
}

type BotJSON = {
  answer: string;
  follow_up: string;
  sources: { title: string; url: string }[];
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Server misconfigured: ${name} is not set`);
  return v;
}

async function chat(messages: ChatMessage[], expectJSON = false): Promise<string> {
  const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages,
      response_format: expectJSON ? { type: "json_object" } : undefined
    })
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ClientMsg;
    const userMsg = body.message?.trim();
    if (!userMsg) return new Response(JSON.stringify({ error: "Empty message" }), { status: 400 });

    const context = retrieve(userMsg, body.history, 5);
    const contextBlock = context.map((c,i)=>`[${i+1}] ${c.title}\nURL: ${c.url}\n${c.text}`).join("\n\n");
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
`You are "Hoops Tutor" — a chill, teen-coded basketball nerd who teaches with energy.
STYLE:
- Friendly, concise, a little slang (keep it tasteful), always accurate.
- Explain like you're on the court with a marker board.
- Use bullet points and short paragraphs.

TASK:
- Use ONLY the provided context snippets (below) for facts.
- If something isn't covered, say so briefly and suggest a next angle.
- ALWAYS end with a short follow-up question to keep the convo going.
- Return STRICT JSON: {"answer": string, "follow_up": string, "sources":[{"title":string,"url":string}]}

CONTEXT SNIPPETS:
${contextBlock}`
      },
      ...(body.history || []).slice(-12), // last 12 turns
      { role: "user", content: userMsg }
    ];

    const raw = await chat(messages, true);
    let parsed: BotJSON | null = null;
    try { parsed = JSON.parse(raw) as BotJSON; } catch {}
    if (!parsed) parsed = { answer: raw, follow_up: "What era or team should we dive into next?", sources: context.map(c=>({title:c.title,url:c.url})) };

    return new Response(JSON.stringify(parsed), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
