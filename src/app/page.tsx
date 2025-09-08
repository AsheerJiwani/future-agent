"use client";

import FootballPanel from "@components/football/FootballPanel";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";

/* ---------- Backgrounds (client-only) ---------- */
const Starfield = dynamic(() => import("../components/Starfield"), { ssr: false });
const Nebula   = dynamic(() => import("../components/Nebula"),   { ssr: false });

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
            An interactive experience brought to you by Asheer.
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
