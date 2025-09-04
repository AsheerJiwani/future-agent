"use client";
import type { ReadPlan } from "../../data/football/types";

export default function ReadStepper({
  plan,
  highlightStep
}: { plan: ReadPlan; highlightStep?: number }) {
  return (
    <div className="rounded-2xl thin-border p-4 bg-white/5">
      <div className="text-sm uppercase opacity-70 mb-2">Read vs {plan.vs}</div>
      <ol className="space-y-2 list-decimal ml-5">
        {plan.progression.map((s) => {
          const emph = highlightStep === s.step;
          return (
            <li key={s.step} className={`leading-snug ${emph ? "font-semibold text-white" : ""}`}>
              {s.keyDefender ? <span className="text-white/90">{s.keyDefender}</span> : null}
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
    </div>
  );
}
