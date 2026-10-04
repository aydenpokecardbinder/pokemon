import { json, isOwner, ensureSchema, getMeta, usdToSgd } from "../../lib/server.js";
export async function onRequestGet({ request, env }) {
  await ensureSchema(env);
  const rate = Number(await getMeta(env, "usd_sgd")) || await usdToSgd(env);
  return json({ owner: await isOwner(request, env), ai: !!env.GEMINI_API_KEY, loginReady: !!(env.OWNER_USERNAME && env.OWNER_PASSWORD), usdToSgd: rate });
}
