"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";

// Load the Three.js starfield only on the client (no SSR)
const Starfield = dynamic(() => import("../components/Starfield"), { ssr: false });

type Scenario = {
  name: string;
  summary: string;
  decade_timeline?: { year: number; milestones: string[] }[];
};

type Payload = {
  title: string;
  domains: string[];
  horizon_years: number;
  scenarios: Scenario[];
  signals: string[];
  open_questions: string[];
  suggested_actions: string[];
};

export default function Page() {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
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
      const json: Payload = await res.json();
      setData(json);
    } catch (err: any) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Futuristic background (client-only 3D) */}
      <div className="aurora" />
      <div className="pointer-events-none absolute inset-0">
        <Starfield />
      </div>

      {/* Header */}
      <header className="relative z-10 max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between">
          <div className="text-sm opacity-80">asheerjiwani.dev</div>
          <nav className="text-sm opacity-80 space-x-5">
            <a href="#agent" className="hover:opacity-100">Agent</a>
            <a href="#about" className="hover:opacity-100">About</a>
            <a href="https://vercel.com" target="_blank" rel="noreferrer" className="hover:opacity-100">
              Deployed on Vercel
            </a>
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 pb-24">
        {/* Hero */}
        <section className="text-center py-10">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-4xl md:text-6xl font-semibold leading-tight"
          >
            <span className="gradient-text">Futurecasting AI</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="mt-4 text-white/70 max-w-3xl mx-auto"
          >
            Enter a topic, and this multi-agent system imagines how it could evolve over the next 50 years—
            across markets, politics, and technology.
          </motion.p>
          <p className="mt-2 text-xs text-white/50">Exploratory scenarios. Not advice.</p>
        </section>

        {/* Agent */}
        <section id="agent" className="grid lg:grid-cols-2 gap-6">
          {/* Left: form */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="glass rounded-3xl p-6 md:p-8 shadow-glow"
          >
            <h2 className="text-xl font-semibold mb-4">
              Enter a topic and let the AI predict what will happen to it in 50 years!
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm mb-2 opacity-80">Your topic</label>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., Quantum computing in medicine"
                  className="w-full rounded-xl bg-white/5 thin-border px-3 py-3 outline-none focus:ring-2 focus:ring-cyan-400"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl py-3 font-semibold bg-gradient-to-r from-cyan-500 to-purple-500 hover:opacity-90 transition disabled:opacity-60"
              >
                {loading ? "Generating…" : "Generate Scenarios"}
              </button>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="text-red-300 text-sm"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>
            </form>
          </motion.div>

          {/* Right: output */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.5 }}
            className="glass rounded-3xl p-6 md:p-8"
          >
            <h2 className="text-xl font-semibold mb-4">Output</h2>

            {!loading && !data && (
              <div className="text-white/60 text-sm">Your scenarios will appear here.</div>
            )}

            {loading && (
              <div className="text-white/70">Synthesizing multi-agent futures…</div>
            )}

            {data && (
              <div className="space-y-6">
                <div className="text-sm text-white/70">
                  <div className="text-base text-white font-semibold">{data.title}</div>
                  <div className="opacity-70">
                    Domains: {data.domains.join(", ")} · Horizon: {data.horizon_years} yrs
                  </div>
                </div>

                {/* Scenarios */}
                <div className="grid md:grid-cols-3 gap-4">
                  {data.scenarios.map((s, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 * i }}
                      className="rounded-2xl thin-border p-4 bg-white/5"
                    >
                      <div className="text-sm uppercase tracking-wide opacity-70 mb-1">{s.name}</div>
                      <div className="font-medium mb-2">{s.summary}</div>
                      {!!s.decade_timeline?.length && (
                        <div className="text-xs opacity-80 space-y-1 mt-2">
                          <div className="opacity-60 mb-1">Milestones</div>
                          <ul className="space-y-1 list-disc ml-5">
                            {s.decade_timeline.slice(0, 5).map((t, k) => (
                              <li key={k}>
                                <span className="opacity-60">{t.year}:</span> {t.milestones.join("; ")}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* Signals / Questions / Actions */}
                <div className="grid md:grid-cols-3 gap-4">
                  {[
                    { title: "Signals to watch", items: data.signals },
                    { title: "Open questions", items: data.open_questions },
                    { title: "Next-best actions", items: data.suggested_actions }
                  ].map((blk, idx) => (
                    <div key={idx} className="rounded-2xl thin-border p-4 bg-white/5">
                      <div className="opacity-70 text-sm uppercase tracking-wide mb-1">{blk.title}</div>
                      {!blk.items?.length ? (
                        <div className="text-white/50 text-sm">—</div>
                      ) : (
                        <ul className="list-disc ml-5 space-y-1 text-sm">
                          {blk.items.map((x, i) => <li key={i}>{x}</li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </section>

        {/* About */}
        <section id="about" className="mt-16 glass rounded-3xl p-6 md:p-8">
          <h3 className="text-lg font-semibold mb-2">About this project</h3>
          <p className="text-white/70">
            A custom multi-agent system that synthesizes long-horizon drivers, generates scenarios,
            and stress-tests assumptions. Built with Next.js, Tailwind, Framer Motion, and a starfield
            rendered in Three.js. Powered by OpenAI’s gpt-4o-mini.
          </p>
        </section>

        <footer className="mt-10 text-center text-white/50 text-xs">
          © {new Date().getFullYear()} Asheer Jiwani · Source available on request
        </footer>
      </main>
      <div className="grid-overlay" />
      <div className="scanlines" />
    </div>
  );
}
