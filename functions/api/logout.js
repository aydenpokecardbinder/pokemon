import { json, sessionCookie } from "../../lib/server.js";
export async function onRequestPost({ request }) {
  const secure = new URL(request.url).protocol === "https:";
  return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0, secure) });
}
