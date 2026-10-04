import { json, isOwner, ensureSchema, lookupCard } from "../../../lib/server.js";
const COLS = "id,name,number,total,set_name,set_code,lang,product_id,tcg_url,price_usd,price_updated,needs_review,added_at,img_ver";

// Owner: edit details (JSON) or replace the photo (multipart with image/thumb).
export async function onRequestPatch({ request, env, params }) {
  if (!(await isOwner(request, env))) return json({ error: "Log in first." }, 401);
  await ensureSchema(env);
  const cur = await env.DB.prepare(`SELECT ${COLS} FROM cards WHERE id=?`).bind(params.id).first();
  if (!cur) return json({ error: "Card not found." }, 404);
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("multipart/form-data")) {
    const form = await request.formData(), image = form.get("image"), thumb = form.get("thumb");
    if (!image || typeof image === "string") return json({ error: "Missing photo." }, 400);
    await env.DB.prepare("UPDATE cards SET image=?, thumb=?, img_ver=img_ver+1 WHERE id=?")
      .bind(await image.arrayBuffer(), thumb && typeof thumb !== "string" ? await thumb.arrayBuffer() : null, params.id).run();
  } else {
    const d = await request.json().catch(() => ({}));
    const name = d.name != null ? String(d.name).trim() : cur.name, number = d.number != null ? String(d.number).trim() : cur.number;
    const total = d.total != null ? String(d.total).trim() : cur.total, setCode = d.setCode != null ? String(d.setCode).trim() : cur.set_code;
    const lang = d.lang != null ? String(d.lang) : cur.lang;
    let m = null;
    if (number !== cur.number || setCode !== cur.set_code || total !== cur.total || lang !== cur.lang || d.relookup) {
      try { m = await lookupCard(env, { lang, setCode, number, total }); } catch {}
    }
    const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE cards SET name=?, number=?, total=?, set_code=?, lang=?, needs_review=?,
        set_name=COALESCE(?, set_name), category=COALESCE(?, category), group_id=COALESCE(?, group_id), product_id=COALESCE(?, product_id),
        tcg_url=COALESCE(?, tcg_url), price_usd=COALESCE(?, price_usd), price_updated=COALESCE(?, price_updated) WHERE id=?`).bind(
      (m && !d.name && m.name) || name, number, total, setCode, lang, (name || (m && m.name)) && number ? 0 : 1,
      m ? m.set_name : null, m ? m.category : null, m ? m.group_id : null, m ? m.product_id : null,
      m ? m.tcg_url : null, m ? m.price_usd : null, m ? now : null, params.id).run();
  }
  const card = await env.DB.prepare(`SELECT ${COLS} FROM cards WHERE id=?`).bind(params.id).first();
  return json({ card });
}

export async function onRequestDelete({ request, env, params }) {
  if (!(await isOwner(request, env))) return json({ error: "Log in first." }, 401);
  await ensureSchema(env);
  await env.DB.prepare("DELETE FROM cards WHERE id=?").bind(params.id).run();
  return json({ ok: true });
}
