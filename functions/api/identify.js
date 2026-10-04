import { json, isOwner, ensureSchema, readWithGemini, lookupCard } from "../../lib/server.js";

// Owner only. Body: { image: base64 JPEG (cropped card), hint: { setCode, number, total, lang } from on-device OCR }
export async function onRequestPost({ request, env }) {
  if (!(await isOwner(request, env))) return json({ error: "Log in first." }, 401);
  await ensureSchema(env);
  let body = {}; try { body = await request.json(); } catch {}
  let read = null, aiError = null;
  if (body.image && env.GEMINI_API_KEY) {
    try { read = await readWithGemini(env, body.image); } catch (e) { aiError = String(e.message || e); }
  }
  const h = body.hint || {};
  const info = read && read.isCard !== false ? {
    name: read.name || "", printedName: read.printedName || "", number: String(read.number || ""), total: String(read.total || ""),
    setCode: read.setCode || "", lang: read.language || "", rotation: Number(read.rotation) || 0,
  } : { name: h.name || "", number: String(h.number || ""), total: String(h.total || ""), setCode: h.setCode || "", lang: h.lang || "", rotation: 0 };
  if (read && read.isCard === false) return json({ isCard: false });
  let match = null;
  try { match = await lookupCard(env, info); } catch (e) { aiError = aiError || ("Price lookup failed: " + (e.message || e)); }
  return json({ isCard: true, ...info, match, aiError });
}
