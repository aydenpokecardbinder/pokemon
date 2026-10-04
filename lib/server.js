// Shared server helpers for PokeCardBinder (Cloudflare Pages Functions + D1)

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

// ---------- schema (created automatically on first use) ----------
let schemaReady = false;
export async function ensureSchema(env) {
  if (schemaReady) return;
  if (!env.DB) throw new Error("Database not connected: add a D1 binding named DB in Cloudflare Pages settings.");
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY, name TEXT DEFAULT '', number TEXT DEFAULT '', total TEXT DEFAULT '',
      set_name TEXT DEFAULT '', set_code TEXT DEFAULT '', lang TEXT DEFAULT '',
      category INTEGER, group_id INTEGER, product_id INTEGER, tcg_url TEXT DEFAULT '',
      price_usd REAL, price_updated TEXT, needs_review INTEGER DEFAULT 0,
      added_at TEXT, img_ver INTEGER DEFAULT 1, image BLOB, thumb BLOB)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT, fetched_at INTEGER)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT PRIMARY KEY, count INTEGER, first_at INTEGER)`),
  ]);
  schemaReady = true;
}
export async function getMeta(env, key) { const r = await env.DB.prepare("SELECT value FROM meta WHERE key=?").bind(key).first(); return r ? r.value : null; }
export async function setMeta(env, key, value) { await env.DB.prepare("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, String(value)).run(); }

// ---------- owner session (signed cookie) ----------
const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmacKey(env) {
  const secret = env.SESSION_SECRET || ("pcb:" + (env.OWNER_PASSWORD || ""));
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function makeSession(env, days = 30) {
  const payload = b64url(enc.encode(JSON.stringify({ u: env.OWNER_USERNAME, exp: Date.now() + days * 864e5 })));
  const sig = b64url(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(payload)));
  return `${payload}.${sig}`;
}
export async function isOwner(request, env) {
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)pcb_session=([^;]+)/);
  if (!m || !env.OWNER_PASSWORD || !env.OWNER_USERNAME) return false;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return false;
  const expect = b64url(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(payload)));
  if (!timingSafeEqual(expect, sig)) return false;
  try {
    const data = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return data.exp > Date.now() && data.u === env.OWNER_USERNAME;
  } catch { return false; }
}
export function timingSafeEqual(a, b) {
  a = String(a); b = String(b); let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
export const sessionCookie = (value, maxAge, secure = true) =>
  `pcb_session=${value}; Path=/; HttpOnly;${secure ? " Secure;" : ""} SameSite=Strict; Max-Age=${maxAge}`;

// ---------- upstream data (TCGplayer prices via tcgcsv.com, FX rate) ----------
const TCGCSV = (env) => env.TCGCSV_BASE || "https://tcgcsv.com";
const DAY = 864e5;
async function cachedJSON(env, key, url, maxAgeMs, trim) {
  const row = await env.DB.prepare("SELECT value, fetched_at FROM cache WHERE key=?").bind(key).first();
  if (row && Date.now() - row.fetched_at < maxAgeMs) return JSON.parse(row.value);
  try {
    const r = await fetch(url, { headers: { "user-agent": "PokeCardBinder/1.0 (personal collection site)" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = trim(await r.json());
    await env.DB.prepare("INSERT INTO cache(key,value,fetched_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, fetched_at=excluded.fetched_at")
      .bind(key, JSON.stringify(data), Date.now()).run();
    return data;
  } catch (e) {
    if (row) return JSON.parse(row.value);   // stale data beats no data
    throw e;
  }
}
export const CATEGORY = { en: 3, ja: 85 };   // TCGplayer: 3 = Pokemon (English), 85 = Pokemon Japan
export const groups = (env, cat) => cachedJSON(env, `groups:${cat}`, `${TCGCSV(env)}/tcgplayer/${cat}/groups`, 7 * DAY,
  (d) => (d.results || []).map((g) => ({ id: g.groupId, name: g.name || "", abbr: g.abbreviation || "" })));
export const products = (env, cat, gid) => cachedJSON(env, `products:${cat}:${gid}`, `${TCGCSV(env)}/tcgplayer/${cat}/${gid}/products`, 7 * DAY,
  (d) => (d.results || []).map((p) => {
    const ext = {}; (p.extendedData || []).forEach((e) => (ext[e.name] = e.value));
    return { id: p.productId, name: p.name || "", num: ext.Number || "", url: p.url || "" };
  }).filter((p) => p.num));
export const prices = (env, cat, gid, maxAge = DAY) => cachedJSON(env, `prices:${cat}:${gid}`, `${TCGCSV(env)}/tcgplayer/${cat}/${gid}/prices`, maxAge,
  (d) => { const m = {}; (d.results || []).forEach((p) => { const v = p.marketPrice ?? p.midPrice ?? null; if (v != null && (m[p.productId] == null || p.subTypeName === "Holofoil")) m[p.productId] = v; }); return m; });

export async function usdToSgd(env) {
  const v = await cachedJSON(env, "fx:usd", env.FX_URL || "https://open.er-api.com/v6/latest/USD", DAY, (d) => ({ sgd: d?.rates?.SGD || null }))
    .catch(() => ({ sgd: null }));
  return v.sgd || 1.28;
}

// ---------- matching a card to a TCGplayer product ----------
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const numKey = (s) => { const m = String(s || "").match(/^([a-z]*)0*(\d+)/i); return m ? (m[1].toLowerCase() + m[2]) : norm(s); };
export function cleanName(n) { return String(n || "").replace(/\s+-\s+[A-Z]{0,4}\d+\/[A-Z]{0,4}\d+.*$/i, "").replace(/\s+-\s+\d+.*$/, "").trim(); }
function codeAliases(code) {
  const c = norm(code); const out = new Set([c]);
  if (/^s\d/.test(c)) out.add("swsh" + c.slice(1));            // Japanese Sword & Shield: s12a <-> swsh12a
  if (/^swsh\d/.test(c)) out.add("s" + c.slice(4));
  return [...out];
}
export async function findGroups(env, cat, setCode) {
  if (!setCode) return [];
  const all = await groups(env, cat), al = codeAliases(setCode);
  return all.filter((g) => al.includes(norm(g.abbr)) || al.includes(norm(g.name.split(":")[0])));
}
export async function lookupCard(env, { lang, setCode, number, total }) {
  if (!number) return null;
  const cat = CATEGORY[lang] || (/^[A-Z]{3}$/.test(setCode || "") ? 3 : 85);
  const gs = await findGroups(env, cat, setCode);
  for (const g of gs) {
    const ps = await products(env, cat, g.id);
    const want = numKey(number), wantT = total ? numKey(total) : null;
    const hits = ps.filter((p) => { const [a, b] = p.num.split("/"); return numKey(a) === want && (!wantT || !b || numKey(b) === wantT); });
    if (!hits.length) continue;
    const variant = (p) => (/(master ball|poke ball|reverse)/i.test(p.name) ? 1 : 0);
    hits.sort((x, y) => variant(x) - variant(y));
    const p = hits[0], pr = await prices(env, cat, g.id).catch(() => ({}));
    return { category: cat, group_id: g.id, set_name: g.name, product_id: p.id, name: cleanName(p.name), tcg_url: p.url, price_usd: pr[p.id] ?? null };
  }
  return null;
}

// ---------- reading a card photo with Gemini (free tier, optional) ----------
export const GEMINI_MODELS = (env) => [...new Set([env.GEMINI_MODEL, "gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite"].filter(Boolean))];
export async function geminiCall(env, parts) {
  const base = env.GEMINI_BASE || "https://generativelanguage.googleapis.com";
  let lastErr = "";
  for (const model of GEMINI_MODELS(env)) {
    const r = await fetch(`${base}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }),
    });
    if (r.ok) {
      const d = await r.json();
      return { model, text: d?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "" };
    }
    const body = (await r.text()).slice(0, 300);
    let msg = body; try { msg = JSON.parse(body)?.error?.message || body; } catch {}
    lastErr = `Gemini ${model}: HTTP ${r.status} – ${msg}`;
    // 404 = model retired/renamed, 429 = that model's free quota used up -> try the next model. Anything else (bad key etc.) -> stop.
    if (r.status !== 404 && r.status !== 429) break;
  }
  throw new Error(lastErr || "Gemini request failed");
}
export async function readWithGemini(env, imageB64) {
  if (!env.GEMINI_API_KEY) return null;
  const prompt = `This is the front of one Pokémon trading card, cropped and straightened. Reply with ONLY JSON:
{"isCard":true,"rotation":0,"printedName":"","name":"","number":"","total":"","setCode":"","language":"en"}
printedName: the card name exactly as printed at the TOP-LEFT, in its own script (Japanese, Chinese, Korean or English).
name: the official ENGLISH card name (e.g. "Gholdengo ex", "Iono's Bellibolt ex", "Charizard VMAX").
number / total: the collector number at the BOTTOM-LEFT split at the slash (for "220/187": number "220", total "187"; for "TG05/TG30": "TG05","TG30").
setCode: the small set code printed at the bottom-left near the number (e.g. "sv8a", "s12a", "SV11B", or an English 3-letter code like "PAF" before "EN"). "" if none.
language: "ja", "en", "zh" or "ko" (the card's printed language).
rotation: 0 if upright, 180 if upside down.
If this is not a Pokémon card, reply {"isCard":false}.`;
  const { text } = await geminiCall(env, [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: imageB64 } }]);
  const t = text.replace(/```json|```/g, "").trim();
  try { return JSON.parse(t); } catch { throw new Error("Gemini gave an unreadable answer: " + t.slice(0, 120)); }
}

// ---------- incremental daily price refresh (runs in the background on page views) ----------
export async function refreshSome(env, maxGroups = 2, force = false) {
  await ensureSchema(env);
  const fx = await usdToSgd(env); await setMeta(env, "usd_sgd", fx);
  const cutoff = new Date(Date.now() - (force ? 0 : DAY)).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT category, group_id, MIN(COALESCE(price_updated,'')) AS oldest FROM cards
     WHERE product_id IS NOT NULL AND COALESCE(price_updated,'') < ? GROUP BY category, group_id ORDER BY oldest LIMIT ?`).bind(cutoff, maxGroups).all();
  for (const g of results || []) {
    const pr = await prices(env, g.category, g.group_id, force ? 0 : DAY).catch(() => null);
    if (!pr) continue;
    const { results: cards } = await env.DB.prepare("SELECT id, product_id FROM cards WHERE category=? AND group_id=?").bind(g.category, g.group_id).all();
    const now = new Date().toISOString();
    if (cards.length) await env.DB.batch(cards.map((c) => env.DB.prepare("UPDATE cards SET price_usd=COALESCE(?, price_usd), price_updated=? WHERE id=?").bind(pr[c.product_id] ?? null, now, c.id)));
  }
  await setMeta(env, "last_refresh", new Date().toISOString());
  return (results || []).length;
}
