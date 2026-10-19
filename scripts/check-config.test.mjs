import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectConfig, parseEnv } from "./check-config.mjs";
const valid = {
  VITE_SUPABASE_URL: "https://test.supabase.co",
  VITE_SUPABASE_ANON_KEY: "sb_publishable_public",
  VITE_TURNSTILE_SITE_KEY: "site-key",
};
test("accetta solo configurazione pubblica prevista", () =>
  assert.deepEqual(inspectConfig(valid), []));
test("non stampa i valori dei segreti", () => {
  // Valore sintetico non valido, usato per verificare la redazione degli errori.
  const sampleValue = "sb_secret_private";
  const out = inspectConfig({ ...valid, VITE_SUPABASE_ANON_KEY: sampleValue });
  assert.ok(out.length);
  assert.ok(!out.join("").includes(sampleValue));
});
test("rifiuta ruolo service_role in JWT pubblico", () => {
  const payload = Buffer.from(
    JSON.stringify({ role: "service_role" }),
  ).toString("base64url");
  assert.ok(
    inspectConfig({ ...valid, VITE_SUPABASE_ANON_KEY: `a.${payload}.z` }).some(
      (x) => x.includes("ruolo anon"),
    ),
  );
});
test("blocca variabili pubbliche sconosciute", () =>
  assert.ok(
    inspectConfig({ ...valid, VITE_SECRET: "private" }).some((x) =>
      x.includes("non prevista"),
    ),
  ));
test("rifiuta URL non https e valori segnaposto", () => {
  assert.ok(
    inspectConfig({ ...valid, VITE_SUPABASE_URL: "http://localhost" }).length,
  );
  assert.ok(
    inspectConfig({ ...valid, VITE_TURNSTILE_SITE_KEY: "YOUR_KEY" }).length,
  );
});
test("legge env senza eseguire comandi", () =>
  assert.deepEqual(
    parseEnv('# hi\nexport VITE_A="$(echo nope)"\nVITE_B=x # comment\n'),
    { VITE_A: "$(echo nope)", VITE_B: "x" },
  ));

test("blocca site key Turnstile di prova in produzione", () => {
  for (const value of [
    "1x00000000000000000000AA",
    "2x00000000000000000000AB",
    "1x00000000000000000000BB",
    "2x00000000000000000000BB",
    "3x00000000000000000000FF",
  ]) {
    assert.ok(
      inspectConfig({ ...valid, VITE_TURNSTILE_SITE_KEY: value }).some((x) =>
        x.includes("Turnstile di prova"),
      ),
    );
  }
});
