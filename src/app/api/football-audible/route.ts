// src/app/api/football-audible/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { PlaySnapshot, SnapMeta } from "@/types/play";

type FormationName = "TRIPS_RIGHT" | "DOUBLES" | "BUNCH_LEFT";
type ReceiverID = "X" | "Z" | "SLOT" | "TE" | "RB";
type RouteKeyword =
  | "GO" | "SEAM" | "BENDER"
  | "HITCH" | "OUT" | "OUT_LOW" | "OUT_MID" | "OUT_HIGH" | "SPEED_OUT" | "COMEBACK" | "COMEBACK_LOW" | "COMEBACK_MID" | "COMEBACK_HIGH" | "CURL"
  | "DIG" | "POST" | "CORNER" | "CORNER_LOW" | "CORNER_MID" | "CORNER_HIGH"
  | "CROSS" | "OVER" | "SHALLOW" | "SLANT"
  | "FLAT" | "WHEEL"
  | "CHECK" | "STICK";

// ✅ use a type alias (mapped types aren't valid in interfaces)
type Numbering = {
  [K in ReceiverID]?: { side: "left" | "right"; number: 1 | 2 | 3; band: "strong" | "weak" };
};

interface Body {
  conceptId: string;
  coverage: string;
  formation: FormationName;
  assignments?: Partial<Record<ReceiverID, RouteKeyword>>;
  numbering: Numbering;
  snapshot?: PlaySnapshot;
  snapMeta?: SnapMeta;
}

interface AudibleSuggestion {
  formation?: FormationName;
  assignments?: Partial<Record<ReceiverID, RouteKeyword>>;
  rationale?: string;
}

const SYSTEM = `You are an NFL QB coach... (unchanged)`;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const user = {
      conceptId: body.conceptId,
      coverage: body.coverage,
      formation: body.formation,
      assignments: body.assignments ?? {},
      numbering: body.numbering,
      snapshot: body.snapshot ? {
        conceptId: body.snapshot.conceptId,
        coverage: body.snapshot.coverage,
        formation: body.snapshot.formation,
        playId: body.snapshot.playId,
        rngSeed: body.snapshot.rngSeed,
      } : undefined,
      snapMeta: body.snapMeta ? {
        press: body.snapMeta.press,
        roles: body.snapMeta.roles,
        leverage: body.snapMeta.leverage
      } : undefined
    };

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(user) }
      ],
      response_format: { type: "json_object" }
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    let parsed: AudibleSuggestion;
    try { parsed = JSON.parse(raw) as AudibleSuggestion; } catch { parsed = {}; }

    const validFormations: FormationName[] = ["TRIPS_RIGHT","DOUBLES","BUNCH_LEFT"];
    if (parsed.formation && !validFormations.includes(parsed.formation)) delete parsed.formation;

    const validRoutes: RouteKeyword[] = [
        "GO","SEAM","BENDER",
        "HITCH","OUT","OUT_LOW","OUT_MID","OUT_HIGH","SPEED_OUT",
        "COMEBACK","COMEBACK_LOW","COMEBACK_MID","COMEBACK_HIGH","CURL",
        "DIG","POST","CORNER","CORNER_LOW","CORNER_MID","CORNER_HIGH",
        "CROSS","OVER","SHALLOW","SLANT",
        "FLAT","WHEEL",
        "CHECK","STICK"
        ];

    if (parsed.assignments) {
      const clean: Partial<Record<ReceiverID, RouteKeyword>> = {};
      (Object.keys(parsed.assignments) as ReceiverID[]).forEach((k) => {
        const v = parsed.assignments![k];
        if (v && validRoutes.includes(v)) clean[k] = v;
      });
      parsed.assignments = clean;
    }

    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ rationale: "Audible service error." }, { status: 200 });
  }
}
