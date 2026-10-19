/** Only the Auth CAPTCHA is passed here; submission uses a separate one-use token. */
interface SessionClient {
  auth: {
    getSession(): Promise<{ data: { session: object | null }; error: unknown }>;
    signInAnonymously(options: { options: { captchaToken: string } }): Promise<{
      data: { session: object | null };
      error: unknown;
    }>;
  };
}
const pending = new WeakMap<SessionClient, Promise<object>>();
export async function ensureSubmissionSession(
  client: SessionClient,
  captchaToken: string,
): Promise<object> {
  const current = await client.auth.getSession();
  if (current.error)
    throw new Error(
      "Impossibile leggere la sessione. Riprova prima di inviare.",
    );
  if (current.data.session) return current.data.session;
  const existing = pending.get(client);
  if (existing) return existing;
  if (!captchaToken)
    throw new Error(
      "Completa la verifica per abilitare l’invio senza registrazione.",
    );
  const create = async () => {
    // A Google login or another tab may have established a session meanwhile.
    const latest = await client.auth.getSession();
    if (latest.error)
      throw new Error(
        "Impossibile leggere la sessione. Riprova prima di inviare.",
      );
    if (latest.data.session) return latest.data.session;
    const result = await client.auth.signInAnonymously({
      options: { captchaToken },
    });
    if (result.error || !result.data.session)
      throw new Error(
        "Sessione non creata. Ripeti la verifica anti-abuso e riprova; se persiste, attendi prima di inviare.",
      );
    return result.data.session;
  };
  const request = create();
  pending.set(client, request);
  try {
    return await request;
  } finally {
    pending.delete(client);
  }
}
