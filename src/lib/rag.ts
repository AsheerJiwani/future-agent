import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { KNOWLEDGE, type KnowledgeItem } from "../data/football/knowledge";

type Vec = number[];

let cache: { vecs: Record<string, Vec>; ready: boolean } = { vecs: {}, ready: false };

type DBRow = { id: string; vec: number[] };

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function cosine(a: Vec, b: Vec): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { const x=a[i], y=b[i]; dot += x*y; na += x*x; nb += y*y; }
  const d = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dot / d;
}

function docText(k: KnowledgeItem): string {
  return `${k.title}\nTags: ${k.tags.join(', ')}\n${k.bullets.join(' ')}`;
}

async function embed(text: string): Promise<Vec> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const resp = await client.embeddings.create({ model: "text-embedding-3-small", input: text });
  return resp.data[0]?.embedding || [];
}

async function ensureEmbeddings() {
  if (cache.ready) return;
  const supa = getSupabase();
  const expectedIds = new Set(KNOWLEDGE.map(k => k.id));
  const loaded: Record<string, Vec> = {};

  // Try DB cache first
  if (supa) {
    try {
      const { data } = await supa.from('knowledge_embeddings').select('id, vec');
      (data as DBRow[] | null)?.forEach(row => { if (row && expectedIds.has(row.id)) loaded[row.id] = row.vec; });
    } catch { /* ignore */ }
  }

  // Try file cache
  if (Object.keys(loaded).length !== expectedIds.size) {
    try {
      const fs = await import('fs/promises');
      const path = '/tmp/rag-cache.json';
      const text = await fs.readFile(path, 'utf-8');
      const json = JSON.parse(text) as Record<string, number[]>;
      Object.entries(json).forEach(([id, v]) => { if (expectedIds.has(id)) loaded[id] = v; });
    } catch { /* ignore */ }
  }

  // Embed missing
  const missing = KNOWLEDGE.filter(k => !loaded[k.id]);
  if (missing.length > 0) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const resp = await client.embeddings.create({ model: "text-embedding-3-small", input: missing.map(docText) });
    resp.data.forEach((d, i) => { loaded[missing[i].id] = d.embedding; });
    // Persist to DB if available
    if (supa) {
      try {
        const rows = missing.map((m, i) => ({ id: m.id, vec: resp.data[i].embedding }));
        await supa.from('knowledge_embeddings').upsert(rows);
      } catch { /* ignore */ }
    }
    // Persist to file for warm reuse
    try {
      const fs = await import('fs/promises');
      await fs.writeFile('/tmp/rag-cache.json', JSON.stringify(loaded));
    } catch { /* ignore */ }
  }

  cache = { vecs: loaded, ready: true };
}

export async function similarKnowledge(query: string, k = 4): Promise<KnowledgeItem[]> {
  await ensureEmbeddings();
  const qv = await embed(query);
  const scored = KNOWLEDGE.map(item => ({ item, score: cosine(qv, cache.vecs[item.id] || []) }));
  return scored.sort((a,b)=> b.score - a.score).slice(0, k).map(s=>s.item);
}
