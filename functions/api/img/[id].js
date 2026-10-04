import { ensureSchema } from "../../../lib/server.js";
export async function onRequestGet({ params, request, env }) {
  await ensureSchema(env);
  const thumb = new URL(request.url).searchParams.get("t") === "thumb";
  const row = await env.DB.prepare(`SELECT ${thumb ? "thumb" : "image"} AS b FROM cards WHERE id=?`).bind(params.id).first();
  if (!row || !row.b) return new Response("Not found", { status: 404 });
  const bytes = row.b instanceof ArrayBuffer ? row.b : new Uint8Array(row.b).buffer;
  return new Response(bytes, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
}
