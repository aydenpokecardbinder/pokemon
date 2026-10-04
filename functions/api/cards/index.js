import { json, isOwner, ensureSchema, getMeta, refreshSome, lookupCard } from "../../../lib/server.js";

const COLS = "id,name,number,total,set_name,set_code,lang,product_id,tcg_url,price_usd,price_updated,needs_review,added_at,img_ver,copies";

// Public: list cards (no images). Also kicks off the daily background price refresh when due.
export async function onRequestGet({ env, waitUntil }) {
  await ensureSchema(env);
  const { results } = await env.DB.prepare(`SELECT ${COLS} FROM cards ORDER BY added_at DESC`).all();
  const last = await getMeta(env, "last_refresh");
  if (!last || Date.now() - Date.parse(last) > 6 * 3600e3) waitUntil(refreshSome(env, 2).catch(() => {}));
  return json({ cards: results || [], usdToSgd: Number(await getMeta(env, "usd_sgd")) || 1.28, lastRefresh: last });
}

// Owner: add a card. multipart/form-data with image (jpeg), thumb (jpeg), data (JSON: name, number, total, setCode, lang, match?)
export async function onRequestPost({ request, env }) {
  if (!(await isOwner(request, env))) return json({ error: "Log in first." }, 401);
  await ensureSchema(env);
  const form = await request.formData();
  const image = form.get("image"), thumb = form.get("thumb");
  if (!image || typeof image === "string") return json({ error: "Missing photo." }, 400);
  if (image.size > 1900000) return json({ error: "Photo too large." }, 413);
  let d = {}; try { d = JSON.parse(form.get("data") || "{}"); } catch {}
  let m = d.match || null;
  if (!m && d.number) { try { m = await lookupCard(env, { lang: d.lang, setCode: d.setCode, number: d.number, total: d.total }); } catch {} }
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 20), now = new Date().toISOString();
  const name = (m && m.name) || d.name || "";
  await env.DB.prepare(`INSERT INTO cards (id,name,number,total,set_name,set_code,lang,category,group_id,product_id,tcg_url,price_usd,price_updated,needs_review,added_at,img_ver,image,thumb)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`).bind(
    id, name, String(d.number || ""), String(d.total || ""), (m && m.set_name) || "", d.setCode || "", d.lang || "",
    m ? m.category : null, m ? m.group_id : null, m ? m.product_id : null, (m && m.tcg_url) || "",
    m ? m.price_usd : null, m ? now : null, (name && d.number) ? 0 : 1, now,
    await image.arrayBuffer(), thumb && typeof thumb !== "string" ? await thumb.arrayBuffer() : null).run();
  const card = await env.DB.prepare(`SELECT ${COLS} FROM cards WHERE id=?`).bind(id).first();
  return json({ card });
}
