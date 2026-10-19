import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function inspectConfig(env) {
  const problems = [];
  const publicNames = [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_TURNSTILE_SITE_KEY",
    "VITE_TURNSTILE_AUTH_SITE_KEY",
  ];
  for (const name of publicNames) {
    const value = env[name]?.trim();
    if (!value || /YOUR_|INSERISCI|example/i.test(value))
      problems.push(`${name}: manca un valore reale.`);
  }
  for (const name of ["VITE_TURNSTILE_SITE_KEY", "VITE_TURNSTILE_AUTH_SITE_KEY"]) {
    if (/^[123]x0{20}(AA|AB|BB|FF)$/.test(env[name] || ""))
      problems.push(`${name}: chiave Turnstile di prova vietata nel build di produzione.`);
  }
  try {
    const url = new URL(env.VITE_SUPABASE_URL);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".supabase.co") ||
      url.username ||
      url.password ||
      url.pathname !== "/"
    ) {
      problems.push(
        "VITE_SUPABASE_URL: usa l’URL HTTPS del progetto Supabase, senza credenziali o percorsi.",
      );
    }
  } catch {
    problems.push("VITE_SUPABASE_URL: URL non valido.");
  }
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith("VITE_") || !value) continue;
    if (!publicNames.includes(name))
      problems.push(
        `${name}: variabile pubblica non prevista; rimuovila prima del deploy.`,
      );
    if (/sb_secret_|service_role|-----BEGIN.*PRIVATE KEY/.test(value))
      problems.push(
        `${name}: possibile segreto nel frontend. Non distribuirlo.`,
      );
  }
  const key = env.VITE_SUPABASE_ANON_KEY || "";
  if (key.split(".").length === 3) {
    try {
      const payload = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString("utf8"),
      );
      if (payload.role !== "anon")
        problems.push(
          "La chiave JWT Supabase pubblica deve avere il ruolo anon.",
        );
    } catch {
      problems.push("La chiave Supabase non contiene un payload JWT valido.");
    }
  } else if (key && !key.startsWith("sb_publishable_")) {
    problems.push(
      "Usa una chiave Supabase anon oppure publishable; mai secret o service_role.",
    );
  }
  return problems;
}

export function parseEnv(text) {
  return Object.fromEntries(
    text.split(/\r?\n/).flatMap((line) => {
      const match = line.match(
        /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/,
      );
      if (!match) return [];
      const raw = match[2];
      const value = /^(["']).*\1$/.test(raw)
        ? raw.slice(1, -1)
        : raw.replace(/\s+#.*$/, "");
      return [[match[1], value]];
    }),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const env = {};
  for (const path of [
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
  ]) {
    if (existsSync(path))
      Object.assign(env, parseEnv(readFileSync(path, "utf8")));
  }
  const problems = inspectConfig({ ...env, ...process.env });
  if (problems.length) {
    console.error(
      "Configurazione non pronta per il deploy:\n" +
        problems.map((p) => `- ${p}`).join("\n"),
    );
    console.error(
      "Segui README.md. I valori delle chiavi non vengono stampati.",
    );
    process.exitCode = 1;
  } else {
    console.log(
      "Variabili pubbliche valide. Questo controllo non verifica OAuth, RLS, segreti backend o disponibilità dei servizi: completa la prova operativa nel README.",
    );
  }
}
