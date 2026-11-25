// Lists candidate voices for the phone agent: Australian accents first, then
// neutral English. Read-only; costs nothing.
//
//   RETELL_API_KEY=... npx vite-node --config vitest.config.mts scripts/phone-agent/voices.ts
//
// Listen to the preview links, pick 2–3, then try each in the Retell
// dashboard's Test Audio with the real prompt. Retell's own platform voices
// (1.5¢/min) are American/British/Mexican only; Australian accents come from
// ElevenLabs (4–10¢/min) or Cartesia/MiniMax (1.5¢/min) voices.
const key = process.env.RETELL_API_KEY;
if (!key) throw new Error("Set RETELL_API_KEY.");
const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

type Voice = { voice_id: string; voice_name?: string; provider?: string; accent?: string; gender?: string; age?: string; preview_audio_url?: string };

async function main() {
  const rows: Voice[] = [];
  const list = await fetch("https://api.retellai.com/list-voices", { headers });
  if (list.ok) rows.push(...((await list.json()) as Voice[]));
  else console.warn(`list-voices: HTTP ${list.status}`);

  // Community voice search (ElevenLabs / Cartesia / MiniMax) for Australian accents.
  for (const voice_provider of ["elevenlabs", "cartesia", "minimax"]) {
    const res = await fetch("https://api.retellai.com/search-community-voice", {
      method: "POST",
      headers,
      body: JSON.stringify({ voice_provider, search_query: "Australian" }),
    });
    if (!res.ok) { console.warn(`search ${voice_provider}: HTTP ${res.status}`); continue; }
    const body = (await res.json()) as { voices?: Voice[] } | Voice[];
    const found = Array.isArray(body) ? body : body.voices ?? [];
    rows.push(...found.map((v) => ({ ...v, provider: v.provider ?? voice_provider, accent: v.accent ?? "Australian (community search)" })));
  }

  const aus = rows.filter((v) => /austral/i.test(`${v.accent} ${v.voice_name}`));
  const neutral = rows.filter((v) => !aus.includes(v) && /american|british|neutral|english/i.test(v.accent ?? ""));
  const show = (v: Voice) => `${(v.voice_id ?? "").padEnd(36)} ${(v.provider ?? "").padEnd(11)} ${(v.gender ?? "").padEnd(7)} ${(v.accent ?? "").padEnd(28)} ${v.preview_audio_url ?? ""}`;
  console.log(`\nAustralian (${aus.length})\n` + aus.slice(0, 25).map(show).join("\n"));
  console.log(`\nNeutral English (${neutral.length}, first 15)\n` + neutral.slice(0, 15).map(show).join("\n"));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
