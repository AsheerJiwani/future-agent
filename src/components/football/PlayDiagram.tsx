"use client";

import { useMemo } from "react";
import type { Diagram, CoverageID } from "../../data/football/types";

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
          <rect x={0} y={H*0.65} width={W*0.35} height={H*0.35} fill="rgba(255,255,255,0.08)" />
          <rect x={W*0.65} y={H*0.65} width={W*0.35} height={H*0.35} fill="rgba(255,255,255,0.08)" />
        </g>
      );
    case "C3":
      return (
        <g>
          {[0,1,2].map(i => (
            <rect key={i} x={(i*W)/3} y={0} width={W/3} height={H} fill="rgba(130,180,255,0.10)" />
          ))}
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
    default:
      return null;
  }
}

export default function PlayDiagram({
  diagram,
  highlightLabels = []
}: { diagram: Diagram; highlightLabels?: string[] }) {
  const losY = diagram.losY ?? 15;

  const routes = useMemo(() => {
    return diagram.routes.map((r, idx) => {
      const d = r.path.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x)} ${sy(p.y)}`).join(" ");
      const highlighted = highlightLabels.includes(r.label);
      return (
        <path
          key={idx}
          d={d}
          fill="none"
          stroke={highlighted ? "#a7f3d0" : (r.color || "url(#routeGrad)")}
          strokeWidth={highlighted ? 5 : 3}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ strokeDasharray: 8, animation: `dash ${2 + idx*0.2}s linear infinite` }}
          markerEnd="url(#arrow)"
        />
      );
    });
  }, [diagram.routes, highlightLabels]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-2xl thin-border bg-white/5">
      <defs>
        <linearGradient id="routeGrad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%"  stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#a7f3d0" />
        </marker>
        <style>{`@keyframes dash { to { stroke-dashoffset: -1000; } }`}</style>
      </defs>

      {/* field lines */}
      {[...Array(10)].map((_,i)=>(
        <line key={i} x1={0} x2={W} y1={(H/10)*i} y2={(H/10)*i} stroke="rgba(255,255,255,0.08)" />
      ))}
      {/* LOS */}
      <line x1={0} x2={W} y1={sy(losY)} y2={sy(losY)} stroke="rgba(255,255,255,0.35)" strokeWidth={2} />

      {/* coverage */}
      <CoverageOverlay coverage={diagram.coverage} />

      {/* routes */}
      <g>{routes}</g>

      {/* players */}
      {diagram.players.map((p, idx) => (
        <g key={idx} transform={`translate(${sx(p.x)} ${sy(p.y)})`}>
          <circle r={10} fill={p.side === "O" ? "#60a5fa" : "#fca5a5"} stroke="white" strokeWidth={1.5} />
          <text x={0} y={4} textAnchor="middle" fontSize="10" fill="#0b0f17" fontWeight={700}>{p.label}</text>
        </g>
      ))}
    </svg>
  );
}
