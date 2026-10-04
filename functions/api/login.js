import { json, ensureSchema, makeSession, sessionCookie, timingSafeEqual } from "../../lib/server.js";

export async function onRequestPost({ request, env }) {
  await ensureSchema(env);
  if (!env.OWNER_USERNAME || !env.OWNER_PASSWORD) return json({ error: "Owner login isn't set up yet. Add OWNER_USERNAME and OWNER_PASSWORD in Cloudflare." }, 503);
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const now = Date.now(), WINDOW = 15 * 60e3, MAX = 8;
  const row = await env.DB.prepare("SELECT count, first_at FROM login_attempts WHERE ip=?").bind(ip).first();
  if (row && now - row.first_at < WINDOW && row.count >= MAX) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  let body = {}; try { body = await request.json(); } catch {}
  const ok = timingSafeEqual(String(body.username || "").trim().toLowerCase(), String(env.OWNER_USERNAME).trim().toLowerCase())
           & timingSafeEqual(String(body.password || ""), String(env.OWNER_PASSWORD));
  if (!ok) {
    if (!row || now - row.first_at >= WINDOW) await env.DB.prepare("INSERT INTO login_attempts(ip,count,first_at) VALUES(?,1,?) ON CONFLICT(ip) DO UPDATE SET count=1, first_at=excluded.first_at").bind(ip, now).run();
    else await env.DB.prepare("UPDATE login_attempts SET count=count+1 WHERE ip=?").bind(ip).run();
    return json({ error: "Wrong username or password." }, 401);
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE ip=?").bind(ip).run();
  const secure = new URL(request.url).protocol === "https:";
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(await makeSession(env, 30), 30 * 86400, secure) });
}
