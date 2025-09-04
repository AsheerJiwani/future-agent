"use client";

import FootballPanel from "@components/football/FootballPanel";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";

/* ---------- Backgrounds (client-only) ---------- */
const Starfield = dynamic(() => import("../components/Starfield").then(m => m.default), { ssr: false });
const Nebula   = dynamic(() => import("../components/Nebula").then(m => m.default),   { ssr: false });

/* =========================================================
   ==============  FUTURECASTING (unchanged) ===============
   ========================================================= */

type Timeline = { year: number; milestones: string[] };
type Scenario = { name: string; summary: string; decade_timeline?: Timeline[] };
type FuturePayload = {
  title: string;
  domains: string[];
  horizon_years: number;
  scenarios: Scenario[];
  signals: string[];
  open_questions: string[];
  suggested_actions: string[];
};

function FuturecastingPanel() {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FuturePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setData(null);
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic || "Global AI progress",
          domains: ["markets", "politics", "technology", "society"],
          region: "Global",
          horizon: 50,
          question: ""
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as FuturePayload;
      setData(json);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel-surface glass thin-border" style={{ background: "var(--surface)" }}>
      <h2 className="text-xl font-semibold mb-4">Futurecasting AI</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm mb-2 opacity-80">
            Enter a topic and let the AI predict what will happen to it in 50 years!
          </label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Quantum computing in medicine"
            className="w-full rounded-xl bg-white/5 thin-border px-3 py-3 ring-accent"
            required
          />
        </div>

        <button type="submit" disabled={loading} className="w-full btn-accent">
          {loading ? "Generating…" : "Generate Scenarios"}
        </button>

        {error && <div className="text-red-300 text-sm">{error}</div>}
      </form>

      <div className="mt-6">
        {!loading && !data && <div className="text-white/60 text-sm">Your scenarios will appear here.</div>}
        {loading && <div className="text-white/70">Synthesizing long-horizon futures…</div>}

        {data && (
          <div className="space-y-6">
            <div className="text-sm text-white/70">
              <div className="text-base text-white font-semibold">{data.title}</div>
              <div className="opacity-70">
                Domains: {data.domains.join(", ")} · Horizon: {data.horizon_years} yrs
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {data.scenarios.map((s, i) => (
                <div key={i} className="rounded-2xl thin-border p-4 bg-white/5">
                  <div className="text-sm uppercase tracking-wide opacity-70 mb-1">{s.name}</div>
                  <div className="font-medium mb-2">{s.summary}</div>
                  {!!s.decade_timeline?.length && (
                    <div className="text-xs opacity-80 space-y-1 mt-2">
                      <div className="opacity-60 mb-1">Milestones</div>
                      <ul className="space-y-1 list-disc ml-5">
                        {s.decade_timeline.slice(0, 5).map((t, k) => (
                          <li key={k}><span className="opacity-60">{t.year}:</span> {t.milestones.join("; ")}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {[
                { title: "Signals to watch", items: data.signals },
                { title: "Open questions", items: data.open_questions },
                { title: "Next-best actions", items: data.suggested_actions }
              ].map((blk, idx) => (
                <div key={idx} className="rounded-2xl thin-border p-4 bg-white/5">
                  <div className="opacity-70 text-sm uppercase tracking-wide mb-1">{blk.title}</div>
                  {blk.items.length === 0 ? (
                    <div className="text-white/50 text-sm">—</div>
                  ) : (
                    <ul className="list-disc ml-5 space-y-1 text-sm">{blk.items.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   =====================  HOOPS CHAT  ======================
   ========================================================= */

type ChatMsg = { role: "user" | "assistant"; content: string };
type HoopsResp = { answer: string; follow_up: string; sources: { title: string; url: string }[] };

function HoopsChat() {
  const [history, setHistory] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("hoops_history");
    if (saved) setHistory(JSON.parse(saved) as ChatMsg[]);
    else setHistory([{ role: "assistant", content: "Yo! I’m Hoops Tutor 🏀 What do you want to learn—triangle offense, Spain PnR, or an era like the 2010s Warriors?" }]);
  }, []);
  useEffect(() => {
    localStorage.setItem("hoops_history", JSON.stringify(history));
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const base = [...history, { role: "user", content: text } as ChatMsg];
    const placeholderIndex = base.length;
    base.push({ role: "assistant", content: "" });
    setHistory(base);
    setLoading(true);

    try {
      const res = await fetch("/api/hoops-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: base })
      });

      const ct = res.headers.get("content-type") || "";

      if (res.body && (ct.includes("text/event-stream") || ct.includes("text/plain"))) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        const nextArr = [...base];

        while (!done) {
          const chunk = await reader.read();
          done = chunk.done;
          if (chunk.value) {
            const s = decoder.decode(chunk.value, { stream: true });
            const append = s.replace(/^data:\s*/gm, "");
            nextArr[placeholderIndex] = {
              role: "assistant",
              content: (nextArr[placeholderIndex]?.content || "") + append
            };
            setHistory([...nextArr]);
          }
        }
      } else {
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as HoopsResp | { error: string };
        if ("error" in data) throw new Error(data.error);

        const sources = data.sources?.length
          ? "\n\nSources:\n" + data.sources.map(s => `• ${s.title} — ${s.url}`).join("\n")
          : "";

        const nextArr = [...base];
        nextArr[placeholderIndex] = { role: "assistant", content: `${data.answer}\n\n${data.follow_up}${sources}` };
        setHistory(nextArr);
      }
    } catch (e) {
      console.error(e);
      setHistory([...history, { role: "user", content: text }, { role: "assistant", content: "My bad—something glitched. Try again in a sec." }]);
    } finally {
      setLoading(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="panel-surface thin-border wonder-card" style={{ background: "var(--surface)" }}>
      <div className="text-lg font-semibold mb-2">Hoops Tutor</div>
      <div className="text-white/70 text-sm mb-4">Ask me about eras, sets, rules, or strategy. I’ll quiz you back 😏</div>

      <div className="h-80 overflow-y-auto rounded-2xl p-3 thin-border bubble-bot">
        {history.map((m, i) => (
          <div key={i} className={`mb-3 ${m.role === "user" ? "text-right" : "text-left"}`}>
            <div className={`inline-block max-w-[85%] rounded-2xl px-3 py-2 whitespace-pre-wrap ${
              m.role === "user" ? "bubble-user" : "bubble-bot"
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 rounded-xl px-3 py-3 bg-white/5 thin-border ring-accent"
          placeholder="E.g., how did the 24-second clock change the NBA?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
        />
        <button onClick={send} disabled={loading} className="btn-accent">
          {loading ? "Thinking…" : "Send"}
        </button>
      </div>

      <div className="sparkles" />
      <div className="shine" />
    </div>
  );
}

/* =========================================================
   ==============  FOOTBALL PLAYBOOK COACH  ================
   ========================================================= */

/* --- Football types (inline so no extra files needed) --- */
type CoverageID =
  | "C0" | "C1" | "C2" | "TAMPA2" | "PALMS" | "C3" | "C4" | "QUARTERS" | "C6" | "C9";
type Personnel = "10"|"11"|"12"|"21"|"22";
type FormationFamily = "2x2"|"3x1"|"Bunch"|"Trips"|"Empty"|"I"|"OffsetGun";

type ReadStep = { step: number; keyDefender?: string; if?: string; then?: string; coachingPoint?: string; };
type ReadPlan  = { vs: CoverageID; progression: ReadStep[]; hotRules?: string[]; notes?: string[]; };
type DiagramRoute = { label: string; color?: string; path: Array<{ x:number; y:number }>; };
type Diagram = {
  losY?: number;
  players: Array<{ label: string; x: number; y: number; side: "O"|"D" }>;
  routes: DiagramRoute[];
  coverage?: CoverageID;
};
type Concept = {
  id: string; name: string; family: "Quick"|"Dropback"|"PlayAction"|"RPO";
  bestInto: CoverageID[]; weakInto?: CoverageID[]; personnel: Personnel[]; formations: FormationFamily[];
  tags?: string[]; preSnapKeys?: string[]; postSnapKeys?: string[]; footwork?: string;
  readPlans: ReadPlan[]; commonMistakes?: string[]; sources?: { title: string; url: string }[]; diagram?: Diagram;
};

/* --- One concept: Smash (you can add more later) --- */
const SMASH_CONCEPT: Concept = {
  id: "SMASH",
  name: "Smash",
  family: "Dropback",
  bestInto: ["C2", "TAMPA2", "PALMS"],
  weakInto: ["C4", "QUARTERS"],
  personnel: ["10", "11"],
  formations: ["2x2", "3x1", "Bunch"],
  tags: ["corner + hitch", "high-low corner"],
  preSnapKeys: [
    "Two-high shell / cloud corners",
    "Corner depth/leverage on #1",
    "Apex width vs #2"
  ],
  postSnapKeys: [
    "Flat defender widens with hitch",
    "Cloud corner bails/sinks with #1",
    "MOF safety overlap on corner"
  ],
  footwork: "Gun 3 + hitch",
  readPlans: [
    {
      vs: "C2",
      progression: [
        { step: 1, keyDefender: "Cloud corner", if: "sinks with #1 deep", then: "Hitch to #1 now", coachingPoint: "Ball out on hitch foot; no drift" },
        { step: 2, keyDefender: "Flat/overhang", if: "widens hard with hitch", then: "Corner at 18–22 on landmark", coachingPoint: "Hold MOF safety with eyes one beat" },
        { step: 3, if: "MOF safety overlaps corner window", then: "Checkdown weak hook" }
      ],
      hotRules: ["Replace nickel blitz with quick hitch"],
      notes: ["Alert 'glance' to weak X vs press-bail if MOF safety leans strong pre-snap"]
    }
  ],
  commonMistakes: [
    "Late to hitch vs squat corner",
    "Forcing corner vs mid-1/2 safety"
  ],
  sources: [{ title: "Tampa-2 (overview)", url: "https://en.wikipedia.org/wiki/Tampa_2" }],
  diagram: {
    losY: 15,
    coverage: "C2",
    players: [
      { label: "X",  x: 20, y:  8, side: "O" },
      { label: "H",  x: 35, y: 12, side: "O" },
      { label: "RB", x: 50, y:  6, side: "O" },
      { label: "Y",  x: 65, y: 12, side: "O" },
      { label: "Z",  x: 80, y:  8, side: "O" },
      { label: "QB", x: 50, y:  4, side: "O" },

      { label: "CB", x: 15, y: 20, side: "D" },
      { label: "CB", x: 85, y: 20, side: "D" },
      { label: "SS", x: 35, y: 32, side: "D" },
      { label: "FS", x: 65, y: 32, side: "D" },
      { label: "OLB",x: 30, y: 18, side: "D" },
      { label: "OLB",x: 70, y: 18, side: "D" },
      { label: "MLB",x: 50, y: 22, side: "D" }
    ],
    routes: [
      { label: "X", path: [ { x: 20, y:  8 }, { x: 20, y: 12 }, { x: 24, y: 18 }, { x: 30, y: 22 } ] },
      { label: "H", path: [ { x: 35, y: 12 }, { x: 35, y: 16 } ] },
      { label: "Z", path: [ { x: 80, y:  8 }, { x: 80, y: 12 }, { x: 76, y: 18 }, { x: 70, y: 22 } ] },
      { label: "Y", path: [ { x: 65, y: 12 }, { x: 65, y: 16 } ] },
      { label: "RB",path: [ { x: 50, y:  6 }, { x: 48, y: 10 }, { x: 46, y: 12 } ] }
    ]
  }
};

/* --- Inline Play Diagram (with highlightLabel) --- */
function PlayDiagram({ diagram, highlightLabel }: { diagram: Diagram; highlightLabel?: string | null; }) {
  const W = 900; const H = 540;
  const sx = (x: number) => (x / 100) * W;
  const sy = (y: number) => H - (y / 100) * H;

  function CoverageOverlay({ coverage }: { coverage?: CoverageID }) {
    if (!coverage) return null;
    switch (coverage) {
      case "C2":
      case "TAMPA2":
        return (
          <g>
            <rect x={0} y={0} width={W/2} height={H} fill="rgba(130,180,255,0.10)" />
            <rect x={W/2} y={0} width={W/2} height={H} fill="rgba(130,180,255,0.10)" />
            <rect x={0} y={H*0.65} width={W*0.35} height={H*0.35} fill="rgba(255,255,255,0.10)" />
            <rect x={W*0.65} y={H*0.65} width={W*0.35} height={H*0.35} fill="rgba(255,255,255,0.10)" />
          </g>
        );
      case "C3":
        return (
          <g>
            <rect x={0} y={0} width={W/3} height={H} fill="rgba(130,180,255,0.10)" />
            <rect x={W/3} y={0} width={W/3} height={H} fill="rgba(130,180,255,0.10)" />
            <rect x={(2*W)/3} y={0} width={W/3} height={H} fill="rgba(130,180,255,0.10)" />
          </g>
        );
      case "C4":
      case "QUARTERS":
        return (
          <g>
            {[0,1,2,3].map(i => (
              <rect key={i} x={(i*W)/4} y={0} width={W/4} height={H} fill="rgba(130,180,255,0.10)" />
            ))}
          </g>
        );
      default: return null;
    }
  }

  const losY = diagram.losY ?? 15;

  const routes = useMemo(() => {
    return diagram.routes.map((r, idx) => {
      const d = r.path.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x)} ${sy(p.y)}`).join(" ");
      const isHL = highlightLabel && r.label === highlightLabel;
      return (
        <path
          key={idx}
          d={d}
          fill="none"
          stroke={isHL ? "#bef264" : (r.color || "url(#routeGrad)")}
          strokeWidth={isHL ? 5 : 3}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ strokeDasharray: 8, animation: `dash ${2 + idx*0.2}s linear infinite` }}
          markerEnd="url(#arrow)"
          opacity={isHL ? 1 : 0.95}
        />
      );
    });
  }, [diagram.routes, highlightLabel]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-2xl thin-border bg-white/5">
      <defs>
        <linearGradient id="routeGrad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%"  stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#a7f3d0" />
        </marker>
        <style>{`@keyframes dash { to { stroke-dashoffset: -1000; } }`}</style>
      </defs>

      {/* yard stripes */}
      {[...Array(10)].map((_,i)=>(
        <line key={i} x1={0} x2={900} y1={(H/10)*i} y2={(H/10)*i} stroke="rgba(255,255,255,0.08)" />
      ))}
      {/* LOS */}
      <line x1={0} x2={900} y1={H - (losY/100)*H} y2={H - (losY/100)*H} stroke="rgba(255,255,255,0.35)" strokeWidth={2} />

      {/* coverage overlay */}
      <CoverageOverlay coverage={diagram.coverage} />

      {/* routes */}
      <g>{routes}</g>

      {/* players */}
      {diagram.players.map((p, idx) => (
        <g key={idx} transform={`translate(${(p.x/100)*W} ${H - (p.y/100)*H})`}>
          <circle r={10} fill={p.side === "O" ? "#60a5fa" : "#fca5a5"} stroke="white" strokeWidth={1.5} />
          <text x={0} y={4} textAnchor="middle" fontSize="10" fill="#0b0f17" fontWeight={700}>{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

/* --- Read stepper (with active emphasis) --- */
function ReadStepper({ plan, activeIndex }: { plan: ReadPlan; activeIndex?: number; }) {
  return (
    <div className="rounded-2xl thin-border p-4 bg-white/5">
      <div className="text-sm uppercase opacity-70 mb-2">Read vs {plan.vs}</div>
      <ol className="space-y-2 list-decimal ml-5">
        {plan.progression.map((s) => {
          const active = activeIndex === s.step;
          return (
            <li key={s.step} className={`leading-snug ${active ? "bg-white/10 rounded-md px-2 py-1" : ""}`}>
              {s.keyDefender ? <span className="text-white/90 font-semibold">{s.keyDefender}</span> : null}
              {s.if ? <> — <span className="opacity-80">if</span> <em>{s.if}</em></> : null}
              {s.then ? <> → <span className="opacity-80">then</span> <strong>{s.then}</strong></> : null}
              {s.coachingPoint ? <div className="text-xs text-white/70 mt-1">CP: {s.coachingPoint}</div> : null}
            </li>
          );
        })}
      </ol>
      {plan.hotRules?.length ? (
        <div className="mt-3 text-xs">
          <div className="opacity-70 uppercase mb-1">Hot rules</div>
          <ul className="list-disc ml-5 space-y-1">{plan.hotRules.map((h,i)=><li key={i}>{h}</li>)}</ul>
        </div>
      ) : null}
      {plan.notes?.length ? (
        <div className="mt-3 text-xs">
          <div className="opacity-70 uppercase mb-1">Notes</div>
          <ul className="list-disc ml-5 space-y-1">{plan.notes.map((h,i)=><li key={i}>{h}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}

/* =========================================================
   =======================  PAGE  ==========================
   ========================================================= */

export default function Page() {
  const [openFuture, setOpenFuture] = useState(false);
  const [openHoops, setOpenHoops] = useState(false);
  const [openFootball, setOpenFootball] = useState(false);

  const futureRef = useRef<HTMLDivElement>(null);
  const hoopsRef = useRef<HTMLDivElement>(null);
  const footballRef = useRef<HTMLDivElement>(null);

  function toggleFuture() {
    const next = !openFuture;
    setOpenFuture(next);
    if (next) setTimeout(() => futureRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }
  function toggleHoops() {
    const next = !openHoops;
    setOpenHoops(next);
    if (next) setTimeout(() => hoopsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }
  function toggleFootball() {
    const next = !openFootball;
    setOpenFootball(next);
    if (next) setTimeout(() => footballRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  return (
    <div className="relative min-h-screen">
      {/* Dreamy site background */}
      <div className="aurora" />
      <div className="pointer-events-none absolute inset-0 -z-10">
        <Nebula />
        <Starfield />
      </div>

      {/* Header */}
      <header className="relative z-10 max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between">
          <div className="text-sm opacity-80">asheerjiwani.dev</div>
          <nav className="text-sm opacity-80 space-x-5">
            <a href="#tabs" className="hover:opacity-100">Home</a>
            <a href="#about" className="hover:opacity-100">About</a>
          </nav>
        </div>
      </header>

      {/* Tiles */}
      <main id="tabs" className="relative z-10 max-w-6xl mx-auto px-6 pb-24">
        <section className="text-center py-6">
          <h1 className="text-4xl md:text-5xl font-semibold gradient-text">Interactive Labs</h1>
          <p className="mt-2 text-white/70">Pick a tile to open a full experience below.</p>
        </section>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* FUTURECAST TILE */}
          <button onClick={toggleFuture} className="tab-card tab-future group" aria-expanded={openFuture} aria-controls="future-panel">
            <div className="tab-inner">
              <div className="tab-title">Futurecasting AI</div>
              <div className="tab-sub">50-year scenarios across markets, politics, tech.</div>
            </div>
            <div className="tab-dots" />
          </button>

          {/* HOOPS TILE */}
          <button onClick={toggleHoops} className="tab-card tab-wonder group" aria-expanded={openHoops} aria-controls="hoops-panel">
            <div className="tab-inner">
              <div className="tab-title">Hoops Tutor</div>
              <div className="tab-sub">Learn plays, eras, and strategy—get quizzed as you go.</div>
            </div>
            <div className="sparkles" />
            <div className="shine" />
          </button>

          {/* FOOTBALL TILE */}
          <button
            onClick={toggleFootball}
            className="tab-card group"
            style={{
              background:
                "radial-gradient(110% 90% at 20% 10%, rgba(52,211,153,.18), transparent 60%),\
                 radial-gradient(110% 90% at 80% 20%, rgba(34,211,238,.18), transparent 60%),\
                 rgba(11,15,15,1)"
            }}
            aria-expanded={openFootball}
            aria-controls="football-panel"
          >
            <div className="tab-inner">
              <div className="tab-title">Football Playbook Coach</div>
              <div className="tab-sub">Read plays vs coverages with QB-level tips.</div>
            </div>
          </button>
        </div>

        {/* Inline panels */}
        <div ref={futureRef} id="future-panel" className="panel-inline">
          <AnimatePresence>
            {openFuture && (
              <motion.section
                key="future"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                className="theme-future"
              >
                <FuturecastingPanel />
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        <div ref={hoopsRef} id="hoops-panel" className="panel-inline">
          <AnimatePresence>
            {openHoops && (
              <motion.section
                key="hoops"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                className="theme-hoops"
              >
                <HoopsChat />
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        <div ref={footballRef} id="football-panel" className="panel-inline">
          <AnimatePresence>
            {openFootball && (
              <motion.section
                key="football"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                className="theme-football"
              >
                <FootballPanel />
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        {/* About */}
        <section id="about" className="mt-16 glass rounded-3xl p-6 md:p-8">
          <h3 className="text-lg font-semibold mb-2">About</h3>
          <p className="text-white/70">
            Three vibes: a dreamy site background, a star-lit Futurecasting AI, a bright Hoops Tutor, and a crisp Football Coach.
          </p>
        </section>

        <footer className="mt-10 text-center text-white/50 text-xs">
          © {new Date().getFullYear()} Asheer Jiwani · Exploratory only
        </footer>
      </main>

      {/* Foreground HUD overlays */}
      <div className="grid-overlay" />
      <div className="scanlines" />
    </div>
  );
}
