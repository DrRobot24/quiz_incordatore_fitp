import { Redis } from "@upstash/redis";

// Upstash inietta KV_REST_API_URL / KV_REST_API_TOKEN (non i nomi UPSTASH_*),
// quindi passo le var esplicite invece di Redis.fromEnv().
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// Codice sync: 2+ gruppi minuscoli separati da trattino, con cifre finali.
// Es. "tennis-corda-4821". Blocca chiavi arbitrarie / injection.
const CODE_RE = /^[a-z0-9]+(-[a-z0-9]+){1,4}$/;
const MAX_BODY_BYTES = 200 * 1024; // 200 KB: i progressi sono piccoli
const TTL_SECONDS = 60 * 60 * 24 * 365; // 1 anno; rinnovato a ogni salvataggio

function keyFor(code) {
  return "progress:" + code;
}

function isValidCode(code) {
  return typeof code === "string" && code.length >= 4 && code.length <= 60 && CODE_RE.test(code);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      const code = String(req.query.code || "").trim();
      if (!isValidCode(code)) {
        return res.status(400).json({ error: "codice non valido" });
      }
      const data = await redis.get(keyFor(code));
      // Upstash deserializza automaticamente il JSON salvato come oggetto.
      return res.status(200).json({ code, data: data || null });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const code = String(body.code || "").trim();
      if (!isValidCode(code)) {
        return res.status(400).json({ error: "codice non valido" });
      }
      const data = body.data;
      if (data === undefined || data === null || typeof data !== "object") {
        return res.status(400).json({ error: "dati mancanti" });
      }
      const serialized = JSON.stringify(data);
      if (serialized.length > MAX_BODY_BYTES) {
        return res.status(413).json({ error: "dati troppo grandi" });
      }
      await redis.set(keyFor(code), data, { ex: TTL_SECONDS });
      return res.status(200).json({ ok: true, code });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "metodo non consentito" });
  } catch (err) {
    console.error("progress api error", err);
    return res.status(500).json({ error: "errore server" });
  }
}
