export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET() {
  const hasKey = !!process.env.OPENAI_API_KEY;
  const vercelEnv = process.env.VERCEL_ENV || "unknown";
  const node = process.version;
  return new Response(JSON.stringify({ ok: true, hasKey, vercelEnv, node }), {
    headers: { "Content-Type": "application/json" },
  });
}
