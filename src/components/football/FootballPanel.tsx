"use client";

import { useEffect, useMemo, useState } from "react";
import type { Concept, CoverageID, ReadPlan, Diagram } from "@data/football/types";
import { CONCEPTS, type FootballConceptId } from "@data/football/catalog";
import { loadConcept } from "@data/football/loadConcept";

/* ---------- Inline diagram/stepper (local to this file) ---------- */
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

      {[...Array(10)].map((_,i)=>(
        <line key={i} x1={0} x2={900} y1={(H/10)*i} y2={(H/10)*i} stroke="rgba(255,255,255,0.08)" />
      ))}
      <line x1={0} x2={900} y1={H - (losY/100)*H} y2={H - (losY/100)*H} stroke="rgba(255,255,255,0.35)" strokeWidth={2} />

      <CoverageOverlay coverage={diagram.coverage} />
      <g>{routes}</g>

      {diagram.players.map((p, idx) => (
        <g key={idx} transform={`translate(${(p.x/100)*W} ${H - (p.y/100)*H})`}>
          <circle r={10} fill={p.side === "O" ? "#60a5fa" : "#fca5a5"} stroke="white" strokeWidth={1.5} />
          <text x={0} y={4} textAnchor="middle" fontSize="10" fill="#0b0f17" fontWeight={700}>{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

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

/* ---------- Main FootballPanel ---------- */
export default function FootballPanel() {
  const [selectedId, setSelectedId] = useState<FootballConceptId>("SMASH");
  const [concept, setConcept] = useState<Concept | null>(null);
  const [loadingConcept, setLoadingConcept] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoadingConcept(true);
    setError(null);
    loadConcept(selectedId)
      .then((c) => { if (alive) setConcept(c); })
      .catch((e) => { if (alive) setError("Failed to load concept: " + (e?.message || e)); })
      .finally(() => { if (alive) setLoadingConcept(false); });
    return () => { alive = false; };
  }, [selectedId]);

  const COVERAGE_OPTIONS: CoverageID[] = useMemo(() => {
    const fb: CoverageID[] = ["C2","TAMPA2","PALMS","C3","C4","QUARTERS"];
    if (!concept?.readPlans?.length) return fb;
    const uniq = Array.from(new Set(concept.readPlans.map(r => r.vs)));
    return uniq.length ? uniq : fb;
  }, [concept]);

  const [coverage, setCoverage] = useState<CoverageID>("C2");
  useEffect(() => {
    if (concept?.readPlans?.length) setCoverage(concept.readPlans[0].vs);
  }, [concept]);

  const [rotateStrong, setRotateStrong] = useState(false);
  const [nickelBlitz, setNickelBlitz] = useState(false);
  const [explain, setExplain] = useState("");

  const plan = useMemo<ReadPlan | null>(() => {
    if (!concept) return null;
    return concept.readPlans.find(r => r.vs === coverage) ?? concept.readPlans[0] ?? null;
  }, [concept, coverage]);

  function computeDecision(cov: CoverageID, opts: { rotateStrong: boolean; nickelBlitz: boolean }) {
    let highlight: string | null = null;
    let activeStep = 1;
    let decision = "";

    if (opts.nickelBlitz) {
      highlight = "H"; activeStep = 1;
      decision = "Hot: replace nickel blitz with quick hitch to H (ball out now).";
    } else if (opts.rotateStrong && (cov === "C2" || cov === "TAMPA2" || cov === "PALMS")) {
      highlight = "X"; activeStep = 3;
      decision = "Rotation strong: avoid throwing into overlap—alert weak-side glance to X or checkdown weak hook.";
    } else if (cov === "C2" || cov === "TAMPA2") {
      highlight = "Z"; activeStep = 2;
      decision = "Base vs Cover 2: cloud corner then flat; if flat widens, hit the corner to Z at 18–22.";
    } else if (cov === "PALMS") {
      highlight = "H"; activeStep = 1;
      decision = "Vs Palms (2-read), corners can trap the hitch—confirm corner behavior; if he squeezes #2, work hitch now.";
    } else if (cov === "C3") {
      highlight = "H"; activeStep = 1;
      decision = "Vs Cover 3 cloud looks, hitch windows are there early; progress to checkdown if curl/flat squeezes.";
    } else {
      highlight = "H"; activeStep = 1;
      decision = "Default: start on hitch timing, don’t drift, progress as flat width dictates.";
    }
    return { highlight, activeStep, decision };
  }

  const { highlight, activeStep, decision } = useMemo(
    () => computeDecision(coverage, { rotateStrong, nickelBlitz }),
    [coverage, rotateStrong, nickelBlitz]
  );

  async function getExplanation() {
    try {
      if (!concept) return;
      const res = await fetch("/api/football-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conceptId: concept.id.toLowerCase().replace(/\s+/g, "_"),
          coverage,
          rotateStrong,
          nickelBlitz
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { explanation: string; sources?: { title: string; url: string }[] };
      setExplain(`${data.explanation}${data.sources?.length ? `\n\nSources:\n${data.sources.map(s => `• ${s.title} — ${s.url}`).join("\n")}` : ""}`);
    } catch {
      setExplain("Could not fetch explanation right now. Try again.");
    }
  }

  const diagram: Diagram | null = useMemo(() => {
    if (!concept?.diagram) return null;
    return { ...concept.diagram, coverage };
  }, [concept, coverage]);

  return (
    <div className="panel-surface thin-border" style={{ background: "var(--surface)" }}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
        <h2 className="text-xl font-semibold">Football Playbook Coach</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm opacity-80">Concept:</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value as FootballConceptId)}
            className="rounded-md bg-white/5 thin-border px-2 py-1 ring-accent"
          >
            {CONCEPTS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <label className="text-sm opacity-80 ml-3">Coverage:</label>
          <select
            value={coverage}
            onChange={(e) => setCoverage(e.target.value as CoverageID)}
            className="rounded-md bg-white/5 thin-border px-2 py-1 ring-accent"
            disabled={!concept}
          >
            {COVERAGE_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <label className="ml-3 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={rotateStrong} onChange={(e) => setRotateStrong(e.target.checked)} />
            Rotate strong
          </label>
          <label className="ml-2 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={nickelBlitz} onChange={(e) => setNickelBlitz(e.target.checked)} />
            Nickel blitz
          </label>

          <button onClick={getExplanation} className="btn-accent ml-2" disabled={!concept || loadingConcept}>
            {loadingConcept ? "Loading…" : "Explain this read"}
          </button>
        </div>
      </div>

      {error && <div className="text-red-300 text-sm mb-3">{error}</div>}
      {!concept && !loadingConcept && !error && <div className="text-white/60 text-sm mb-3">Select a concept to load.</div>}

      {concept && (
        <div className="text-white/70 text-sm mb-2">
          Concept: <span className="font-medium">{concept.name}</span>
          {concept.footwork ? <> · Footwork: <span className="font-medium">{concept.footwork}</span></> : null}
        </div>
      )}

      {diagram ? (
        <PlayDiagram diagram={diagram} highlightLabel={highlight} />
      ) : concept ? (
        <div className="rounded-2xl thin-border p-4 bg-white/5 text-white/70">
          No diagram provided for this concept yet.
        </div>
      ) : null}

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        {plan ? <ReadStepper plan={plan} activeIndex={activeStep} /> : (
          <div className="rounded-2xl thin-border p-4 bg-white/5 text-white/70">
            No read plan for {coverage} yet.
          </div>
        )}

        <div className="rounded-2xl thin-border p-4 bg-white/5">
          <div className="opacity-70 uppercase text-sm mb-2">Decision</div>
          <div className="text-base">{decision}</div>

          {!!concept?.preSnapKeys?.length && (
            <>
              <div className="opacity-70 uppercase text-sm mt-4 mb-2">Pre / Post-snap Keys</div>
              <ul className="list-disc ml-5">
                {concept.preSnapKeys.map((k,i)=><li key={`pre-${i}`}>{k}</li>)}
              </ul>
            </>
          )}
          {!!concept?.postSnapKeys?.length && (
            <ul className="list-disc ml-5 mt-2">
              {concept.postSnapKeys.map((k,i)=><li key={`post-${i}`}>{k}</li>)}
            </ul>
          )}

          {!!concept?.commonMistakes?.length && (
            <>
              <div className="opacity-70 uppercase text-sm mt-4 mb-2">Common mistakes</div>
              <ul className="list-disc ml-5">
                {concept.commonMistakes.map((k,i)=><li key={`cm-${i}`}>{k}</li>)}
              </ul>
            </>
          )}
        </div>
      </div>

      {explain ? (
        <div className="mt-4 rounded-2xl thin-border p-4 bg-white/5 whitespace-pre-wrap">
          {explain}
        </div>
      ) : null}
    </div>
  );
}
