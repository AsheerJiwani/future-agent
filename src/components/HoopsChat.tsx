"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };
type BotResp = { answer: string; follow_up: string; sources: { title: string; url: string }[] };

export default function HoopsChat() {
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("hoops_history");
    if (saved) setHistory(JSON.parse(saved));
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
    const next: Msg[] = [...history, { role: "user", content: text }];
    setHistory(next);
    setLoading(true);
    try {
      const res = await fetch("/api/hoops-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: next })
      });
      const data = (await res.json()) as BotResp | { error: string };
      if ("error" in data) throw new Error(data.error);
      const sources = data.sources?.length
        ? "\n\nSources:\n" + data.sources.map(s => `• ${s.title} — ${s.url}`).join("\n")
        : "";
      setHistory([...next, { role: "assistant", content: `${data.answer}\n\n${data.follow_up}${sources}` }]);
    } catch {
      setHistory([...next, { role: "assistant", content: "My bad—something glitched. Try again in a sec." }]);
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
    <div className="rounded-3xl p-4 md:p-6 wonder-card thin-border">
      <div className="text-lg font-semibold mb-2">Hoops Tutor</div>
      <div className="text-white/70 text-sm mb-4">Ask me about eras, sets, rules, or strategy. I’ll quiz you back 😏</div>

      <div className="h-80 overflow-y-auto rounded-2xl p-3 bg-white/5 thin-border">
        {history.map((m, i) => (
          <div key={i} className={`mb-3 ${m.role === "user" ? "text-right" : "text-left"}`}>
            <div className={`inline-block max-w-[85%] rounded-2xl px-3 py-2 whitespace-pre-wrap ${
              m.role === "user" ? "bg-gradient-to-r from-pink-400/30 to-yellow-300/30 thin-border" : "bg-white/10 thin-border"
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 rounded-xl px-3 py-3 bg-white/5 thin-border outline-none focus:ring-2 focus:ring-fuchsia-400"
          placeholder="E.g., how did the 24-second clock change the NBA?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
        />
        <button
          onClick={send}
          disabled={loading}
          className="rounded-xl px-4 py-3 font-semibold bg-gradient-to-r from-fuchsia-500 to-amber-400 hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Thinking…" : "Send"}
        </button>
      </div>
      <div className="sparkles" />
      <div className="shine" />
    </div>
  );
}
