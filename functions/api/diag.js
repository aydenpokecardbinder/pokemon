import { json, isOwner, ensureSchema, geminiCall, groups, usdToSgd, GEMINI_MODELS } from "../../lib/server.js";

// Owner-only self-check: open /api/diag while logged in.
export async function onRequestGet({ request, env }) {
  if (!(await isOwner(request, env))) return json({ error: "Log in first, then open this page again." }, 401);
  const out = {};
  try { await ensureSchema(env); const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM cards").first(); out.database = `OK (${r.n} cards)`; }
  catch (e) { out.database = "PROBLEM: " + (e.message || e); }
  if (!env.GEMINI_API_KEY) out.gemini = "PROBLEM: GEMINI_API_KEY is not set (add it as a Secret, then redeploy).";
  else {
    try { const r = await geminiCall(env, [{ text: 'Reply with exactly this JSON: {"ok":true}' }]); out.gemini = `OK (model ${r.model})`; }
    catch (e) { out.gemini = "PROBLEM: " + (e.message || e); }
    out.geminiModelsTried = GEMINI_MODELS(env);
  }
  try { const g = await groups(env, 85); out.prices = `OK (${g.length} Japanese sets found)`; }
  catch (e) { out.prices = "PROBLEM: " + (e.message || e); }
  try { out.exchangeRate = `OK (US$1 = S$${await usdToSgd(env)})`; } catch (e) { out.exchangeRate = "PROBLEM: " + (e.message || e); }
  return json(out);
}
