"use client";
import { useEffect, useRef, useState } from "react";
import type { FootballConceptId } from "@data/football/catalog";
import type { CoverageID } from "@data/football/types";
import type { PlaySnapshot, SnapMeta } from "@/types/play";

type ChatMsg = { role: "user" | "assistant"; content: string };

export default function CoachChat({
  conceptId,
  coverage,
  mode = "teach",
  snapshot,
  snapMeta
}: {
  conceptId: FootballConceptId;
  coverage: CoverageID;
  mode?: "teach" | "quiz";
  snapshot?: PlaySnapshot;
  snapMeta?: SnapMeta;
}) {
  const [history, setHistory] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // kick off with a first coach message
    void askCoach("(start)");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptId, coverage, mode]);

  useEffect(() => {
    viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: "smooth" });
  }, [history, loading]);

  async function askCoach(userMsg: string) {
    setLoading(true);
    const payload = {
      conceptId,
      coverage,
      mode,
      history: [
        { role: "user", content: `User: ${userMsg}` },
        ...history
      ],
      snapshot,
      snapMeta
    };
    const res = await fetch("/api/football-coach", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });
    if (!res.ok || !res.body) {
      setHistory(h => [...h, { role: "assistant", content: "Coach hit a snag; try again." }]);
      setLoading(false);
      return;
    }
    // stream the response
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    setHistory(h => [...h, { role: "assistant", content: "" }]);

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      setHistory(h => {
        const copy = [...h];
        copy[copy.length - 1] = { role: "assistant", content: acc };
        return copy;
      });
    }
    setLoading(false);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 md:p-4 backdrop-blur-lg">
      <div className="text-xs uppercase tracking-wide text-white/60 mb-2">
        Football Playbook Coach — {conceptId} vs {coverage} ({mode})
      </div>
      <div ref={viewportRef} className="h-56 md:h-64 overflow-auto space-y-3 p-2 bg-white/5 rounded-xl">
        {history.map((m, i) => (
          <div key={i} className={m.role === "assistant" ? "text-white/90" : "text-fuchsia-300"}>
            <span className="text-[10px] px-2 py-0.5 rounded-full mr-2 bg-white/10">
              {m.role === "assistant" ? "Coach" : "You"}
            </span>
            <span className="align-middle whitespace-pre-wrap">{m.content}</span>
          </div>
        ))}
        {loading && <div className="text-white/50 text-sm italic">Coach is thinking…</div>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim()) return;
          setHistory(h => [...h, { role: "user", content: input.trim() }]);
          const toSend = input.trim();
          setInput("");
          void askCoach(toSend);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe the shell or your read…"
          className="flex-1 bg-white/10 rounded-xl px-3 py-2 text-white placeholder-white/40 outline-none"
        />
        <button
          disabled={loading}
          className="px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
