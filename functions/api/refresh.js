import { json, isOwner, refreshSome } from "../../lib/server.js";
export async function onRequestPost({ request, env }) {
  if (!(await isOwner(request, env))) return json({ error: "Log in first." }, 401);
  const n = await refreshSome(env, 6, true);
  return json({ ok: true, groupsRefreshed: n });
}
