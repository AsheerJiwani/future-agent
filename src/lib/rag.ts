import OpenAI from "openai";
import { KNOWLEDGE, type KnowledgeItem } from "../data/football/knowledge";

type Vec = number[];

let cache: { vecs: Record<string, Vec>; ready: boolean } = { vecs: {}, ready: false };

function cosine(a: Vec, b: Vec): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { const x=a[i], y=b[i]; dot += x*y; na += x*x; nb += y*y; }
  const d = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dot / d;
}

function docText(k: KnowledgeItem): string {
  return `${k.title}\n${k.bullets.join(" ")}`;
}

async function embed(text: string): Promise<Vec> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const resp = await client.embeddings.create({ model: "text-embedding-3-small", input: text });
  return resp.data[0]?.embedding || [];
}

async function ensureEmbeddings() {
  if (cache.ready) return;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const inputs = KNOWLEDGE.map(docText);
  const resp = await client.embeddings.create({ model: "text-embedding-3-small", input: inputs });
  const vecs: Record<string, Vec> = {};
  resp.data.forEach((d, i) => { vecs[KNOWLEDGE[i].id] = d.embedding; });
  cache = { vecs, ready: true };
}

export async function similarKnowledge(query: string, k = 4): Promise<KnowledgeItem[]> {
  await ensureEmbeddings();
  const qv = await embed(query);
  const scored = KNOWLEDGE.map(item => ({ item, score: cosine(qv, cache.vecs[item.id] || []) }));
  return scored.sort((a,b)=> b.score - a.score).slice(0, k).map(s=>s.item);
}

