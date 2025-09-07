"use client";
import React, { useMemo, useState } from "react";
import type { FootballConceptId } from "@data/football/catalog";
import type { CoverageID } from "@data/football/types";
import type { PlaySnapshot, SnapMeta, ThrowSummary } from "@/types/play";

type MetricRow = { coverage: string; concept_id: string; area_horiz: string; area_band: string; n_throws: number; avg_window_score: number; avg_nearest_sep_yds: number; avg_hold_ms: number; completion_rate: number };

type AssistantResponse = {
  summary: string;
  coverage_read?: { family: string; cues: string[]; rotation?: string; mof?: "one-high" | "two-high" };
  progression?: { step: number; text: string }[];
  leverage?: Record<string, { side: "inside" | "outside" | "even"; note?: string }>;
  open_reads?: Array<{ id: string; why: string; timing?: string }>;
  audible?: { formation?: string; assignments?: Record<string, string>; rationale?: string };
  coaching_points?: string[];
  quiz?: { question: string; expected: string };
  stats?: MetricRow[];
  stats_user?: MetricRow[];
  sources?: { title: string; url: string }[];
};

type FocusState = { timing: boolean; leverage: boolean; rotation: boolean; hot: boolean };

export default function AIAssistant({
  conceptId,
  coverage,
  snapshot,
  snapMeta,
  lastThrow,
  userId
}: {
  conceptId: FootballConceptId;
  coverage: CoverageID;
  snapshot?: PlaySnapshot;
  snapMeta?: SnapMeta;
  lastThrow?: ThrowSummary;
  userId?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AssistantResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [band, setBand] = useState<"" | "SHORT" | "MID" | "DEEP">("");
  const [horiz, setHoriz] = useState<"" | "L" | "M" | "R">("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [focus, setFocus] = useState<FocusState>({ timing: true, leverage: true, rotation: false, hot: false });
  const [useAgent, setUseAgent] = useState(true);
  const [usedFallback, setUsedFallback] = useState(false);
  const [audiblesOn, setAudiblesOn] = useState(true);
  const [tutorOn, setTutorOn] = useState(true);
  const ZONE_SET = useMemo(() => new Set<CoverageID>(["C2","TAMPA2","C3","C4"] as CoverageID[]), []);

  const filters = useMemo(() => ({
    areaBand: band || undefined,
    areaHoriz: horiz || undefined
  }), [band, horiz]);

  async function analyze() {
    setLoading(true); setError(null);
    try {
      setUsedFallback(false);
      const payload = {
        conceptId,
        coverage,
        snapshot,
        snapMeta,
        throwCtx: lastThrow,
        filters,
        focus: Object.entries(focus).filter(([, v]) => v).map(([k]) => k),
        userId,
        toggles: { audibles: audiblesOn, tutor: tutorOn },
        mode: "analysis" as const
      };

      async function callClassic() {
        const res2 = await fetch("/api/football-assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
        const json2 = (await res2.json()) as AssistantResponse;
        setUsedFallback(true);
        return json2;
      }

      const json: Promise<AssistantResponse> = useAgent
        ? (() => {
            return fetch("/api/football-assistant/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
              .then((r) => (r.ok ? (r.json() as Promise<AssistantResponse>) : Promise.reject(new Error(`HTTP ${r.status}`))))
              .catch(() => callClassic());
          })()
        : (callClassic() as Promise<AssistantResponse>);

      const out = await json;
      setData(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (!autoRefresh || !lastThrow) return;
    void analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastThrow]);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 md:p-4 backdrop-blur-lg">
      <div className="text-xs uppercase tracking-wide text-white/60 mb-2">AI Assistant — Per-Play Analysis</div>
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <label className="text-xs text-white/70">Band
          <select value={band} onChange={(e) => setBand(e.target.value as "" | "SHORT" | "MID" | "DEEP")} className="ml-2 bg-white/10 text-white rounded px-2 py-1">
            <option value="">Any</option>
            <option value="SHORT">SHORT</option>
            <option value="MID">MID</option>
            <option value="DEEP">DEEP</option>
          </select>
        </label>
        <label className="text-xs text-white/70">Side
          <select value={horiz} onChange={(e) => setHoriz(e.target.value as "" | "L" | "M" | "R")} className="ml-2 bg-white/10 text-white rounded px-2 py-1">
            <option value="">Any</option>
            <option value="L">L</option>
            <option value="M">M</option>
            <option value="R">R</option>
          </select>
        </label>
        <div className="hidden md:block text-white/40 text-xs">Focus</div>
        {([
          { key: "timing", label: "Rhythm/Timing" },
          { key: "leverage", label: "Leverage" },
          { key: "rotation", label: "Rotation" },
          { key: "hot", label: "Hot" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={(e) => { e.preventDefault(); setFocus((f) => ({ ...f, [key]: !f[key] } as FocusState)); }}
            className={`px-2 py-1 rounded-full text-xs border ${focus[key as keyof typeof focus] ? 'border-fuchsia-400 text-fuchsia-200 bg-fuchsia-500/10' : 'border-white/15 text-white/70 bg-white/5'}`}
          >
            {label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-white/70">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Auto refresh on throw
        </label>
        <label className="flex items-center gap-2 text-xs text-white/70">
          <input type="checkbox" checked={useAgent} onChange={(e) => setUseAgent(e.target.checked)} />
          Use Agent
        </label>
        <label className="flex items-center gap-2 text-xs text-white/70">
          <input type="checkbox" checked={audiblesOn} onChange={(e)=>setAudiblesOn(e.target.checked)} />
          Audible Suggestions
        </label>
        <label className="flex items-center gap-2 text-xs text-white/70">
          <input type="checkbox" checked={tutorOn} onChange={(e)=>setTutorOn(e.target.checked)} />
          Play Tutor
        </label>
        <button onClick={analyze} disabled={loading} className="ml-0 md:ml-auto px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white disabled:opacity-50">
          {loading ? "Analyzing…" : "Analyze Last Snapshot"}
        </button>
      </div>

      {error && <div className="text-rose-300 text-sm">{error}</div>}
      {data && (
        <div className="space-y-3">
          {usedFallback && (
            <div className="text-amber-300/80 text-xs">Agent unavailable; used Assistant fallback.</div>
          )}
          {/* Optional Grade panel if summary contains a JSON grade blob */}
          {(() => {
            try {
              const parsed = data.summary && data.summary.trim().startsWith("{") ? JSON.parse(data.summary) as { grade?: string; rationale?: string; nextRead?: string; coachingTip?: string } : null;
              if (parsed && (parsed.grade || parsed.rationale || parsed.nextRead || parsed.coachingTip)) {
                return (
                  <div>
                    <div className="text-white/60 text-xs mb-1">Grade</div>
                    <div className="text-white/90 text-sm space-y-0.5">
                      {parsed.grade && <div><span className="text-white/60">Grade:</span> {parsed.grade}</div>}
                      {parsed.rationale && <div><span className="text-white/60">Why:</span> {parsed.rationale}</div>}
                      {parsed.nextRead && <div><span className="text-white/60">Next Read:</span> {parsed.nextRead}</div>}
                      {parsed.coachingTip && <div><span className="text-white/60">Tip:</span> {parsed.coachingTip}</div>}
                    </div>
                  </div>
                );
              }
              return null;
            } catch { return null; }
          })()}
          <div>
            <div className="text-white/60 text-xs mb-1">Summary</div>
            <div className="text-white/90 text-sm whitespace-pre-wrap">
              {typeof data.summary === 'string' ? data.summary : JSON.stringify(data.summary)}
            </div>
          </div>

          {data.coverage_read && (
            <div>
              <div className="text-white/60 text-xs mb-1">Coverage Read</div>
              <div className="text-white/90 text-sm">
                <div>Family: {data.coverage_read.family}{data.coverage_read.mof ? ` — MOF: ${data.coverage_read.mof}` : ""}{data.coverage_read.rotation ? ` — Rot: ${data.coverage_read.rotation}` : ""}</div>
                {data.coverage_read.cues?.length ? <ul className="list-disc list-inside text-white/80">{data.coverage_read.cues.map((c, i) => (<li key={i}>{c}</li>))}</ul> : null}
              </div>
            </div>
          )}

          {Array.isArray(data.progression) && data.progression.length > 0 && (
            <div>
              <div className="text-white/60 text-xs mb-1">Progression</div>
              <ol className="list-decimal list-inside text-white/90 text-sm">
                {data.progression.map((p, i) => (<li key={i}>{p.text}</li>))}
              </ol>
            </div>
          )}

          {(!ZONE_SET.has(coverage) && data.leverage) && (
            <div>
              <div className="text-white/60 text-xs mb-1">Leverage</div>
              <div className="grid grid-cols-2 gap-x-3 text-white/90 text-sm">
                {Object.entries(data.leverage).map(([rid, v]) => (
                  <div key={rid}><span className="text-white/60 mr-1">{rid}:</span>{v.side}{v.note ? ` — ${v.note}` : ''}</div>
                ))}
              </div>
            </div>
          )}

          {Array.isArray(data.open_reads) && data.open_reads.length > 0 && (
            <div>
              <div className="text-white/60 text-xs mb-1">Open Reads</div>
              <ul className="list-disc list-inside text-white/90 text-sm">
                {data.open_reads.map((r, i) => (<li key={i}><span className="text-white/60">{r.id}:</span> {r.why}{r.timing ? ` — ${r.timing}` : ''}</li>))}
              </ul>
            </div>
          )}

          {data.audible && (data.audible.formation || (data.audible.assignments && Object.keys(data.audible.assignments).length > 0)) && (
            <div>
              <div className="text-white/60 text-xs mb-1">Audible Suggestion</div>
              <div className="text-white/90 text-sm">
                {data.audible.formation && <div>Formation: {data.audible.formation}</div>}
                {data.audible.assignments && (
                  <div>
                    Assignments:
                    <ul className="list-disc list-inside">
                      {Object.entries(data.audible.assignments).map(([k, v]) => (<li key={k}><span className="text-white/60">{k}:</span> {v}</li>))}
                    </ul>
                  </div>
                )}
                {data.audible.rationale && <div className="text-white/80">{data.audible.rationale}</div>}
              </div>
            </div>
          )}

          {data.coaching_points && data.coaching_points.length > 0 && (
            <div>
              <div className="text-white/60 text-xs mb-1">Coaching Points</div>
              <ul className="list-disc list-inside text-white/90 text-sm">
                {data.coaching_points.map((c, i) => (<li key={i}>{c}</li>))}
              </ul>
            </div>
          )}

          {data.stats && data.stats.length > 0 && (
            <div>
              <div className="text-white/60 text-xs mb-1">Recent Throw Stats (Top-N)</div>
              <div className="text-white/80 text-xs space-y-1">
                {data.stats.map((s, i) => (
                  <div key={i} className="flex flex-wrap gap-x-2">
                    <span className="text-white/50">{s.coverage} {s.concept_id} {s.area_horiz}_{s.area_band}</span>
                    <span>n={s.n_throws}</span>
                    <span>win={s.avg_window_score?.toFixed?.(2) ?? "-"}</span>
                    <span>sep={s.avg_nearest_sep_yds?.toFixed?.(2) ?? "-"}yd</span>
                    <span>hold={s.avg_hold_ms?.toFixed?.(0) ?? "-"}ms</span>
                    <span>comp%={(s.completion_rate * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {Array.isArray(data.stats_user) && data.stats_user.length > 0 && (
            <div>
              <div className="text-white/60 text-xs mb-1">Your Recent Stats</div>
              <div className="text-white/80 text-xs space-y-1">
                {data.stats_user.map((s, i) => (
                  <div key={i} className="flex flex-wrap gap-x-2">
                    <span className="text-white/50">{s.coverage} {s.concept_id} {s.area_horiz}_{s.area_band}</span>
                    <span>n={s.n_throws}</span>
                    <span>win={s.avg_window_score?.toFixed?.(2) ?? "-"}</span>
                    <span>sep={s.avg_nearest_sep_yds?.toFixed?.(2) ?? "-"}yd</span>
                    <span>hold={s.avg_hold_ms?.toFixed?.(0) ?? "-"}ms</span>
                    <span>comp%={(s.completion_rate * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.sources && data.sources.length > 0 && (
            <div>
              <div className="text-white/60 text-xs mb-1">Sources</div>
              <ul className="list-disc list-inside text-white/80 text-xs">
                {data.sources.map((s, i) => (<li key={i}><a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-dotted">{s.title}</a></li>))}
              </ul>
            </div>
          )}

          {data.quiz && (
            <div className="border-t border-white/10 pt-2">
              <div className="text-white/60 text-xs mb-1">Quiz</div>
              <div className="text-white/90 text-sm">{data.quiz.question}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
