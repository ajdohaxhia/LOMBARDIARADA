// Cloudflare's documented dummy secrets contain 31 zeroes (35 characters total).
// https://developers.cloudflare.com/turnstile/troubleshooting/testing/
export function validateDeploymentSecret(secret: string): void {
 if (!secret.trim() || /^[123]x0{31}AA$/.test(secret.trim())) {
  throw new Error('Configurare TURNSTILE_SECRET_KEY con una chiave reale prima di avviare il backend.');
 }
}
export interface SubmitDependencies {
 allowedOrigin: string;
 hostname: string;
 turnstileSecret: string;
 getUser(token: string): Promise<{ id: string } | null>;
 verify: typeof fetch;
 submit(name: string, args: {p_user: string; p_data: Record<string, unknown>}): Promise<{data: unknown; error: {code?: string} | null}>;
}
const MAX_BYTES = 20_000;
class PayloadTooLarge extends Error {}
async function readBody(req: Request): Promise<unknown> {
 if (Number(req.headers.get('content-length') || 0) > MAX_BYTES) throw new PayloadTooLarge();
 const reader = req.body?.getReader();
 if (!reader) throw new Error('Missing body');
 let size = 0;
 const chunks: Uint8Array[] = [];
 try {
  while (true) {
   const {done,value} = await reader.read();
   if (done) break;
   size += value.byteLength;
   if (size > MAX_BYTES) { await reader.cancel(); throw new PayloadTooLarge(); }
   chunks.push(value);
  }
 } finally { reader.releaseLock(); }
 const bytes = new Uint8Array(size);
 let offset = 0;
 for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export function createHandler(deps: SubmitDependencies) {
 const headers = { 'Access-Control-Allow-Origin': deps.allowedOrigin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', Vary: 'Origin' };
 return async (req: Request): Promise<Response> => {
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body),{status,headers});
  if (req.headers.get('origin') !== deps.allowedOrigin) return reply(403,{error:'Origine non consentita'});
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers});
  if (req.method !== 'POST') return reply(405,{error:'Metodo non consentito'});
  try {
   const auth = req.headers.get('authorization');
   if (!auth?.startsWith('Bearer ') || !auth.slice(7).trim()) return reply(401,{error:'Accedi per inviare'});
   const user = await deps.getUser(auth.slice(7));
   if (!user) return reply(401,{error:'Sessione scaduta'});
   const body = await readBody(req);
   if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400,{error:'Dati non validi'});
   const input = body as Record<string,unknown>;
   if (!['contribution','abuse'].includes(String(input.action)) || typeof input.turnstileToken !== 'string' || !input.turnstileToken.trim() || input.turnstileToken.length>2048 || !input.data || typeof input.data !== 'object' || Array.isArray(input.data)) return reply(400,{error:'Dati non validi'});
   const verification = await deps.verify('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:deps.turnstileSecret,response:input.turnstileToken}),signal:AbortSignal.timeout(10000)});
   if (!verification.ok) return reply(503,{error:'Verifica temporaneamente non disponibile'});
   const result = await verification.json();
   if (result?.success !== true || result.hostname!==deps.hostname || result.action!=='submit') return reply(400,{error:'Verifica antispam non riuscita. Riprova.'});
   const fields = input.action==='abuse' ? ['contribution_id','reason'] : ['kind','title','description','zone','category','latitude','longitude','event_at','testimony','source_url'];
   const supplied = input.data as Record<string,unknown>;
   const safeData = Object.fromEntries(fields.filter(key => Object.hasOwn(supplied,key)).map(key => [key,supplied[key]]));
   const {data,error} = await deps.submit(input.action==='abuse'?'submit_abuse':'submit_contribution',{p_user:user.id,p_data:safeData});
   if (error) return reply(error.code==='P0001'?429:400,{error:error.code==='P0001'?'Invio non disponibile: controlla il limite orario e i dati.':'Dati non validi. Controlla i campi richiesti.'});
   return reply(201,{id:data});
  } catch (error) { return reply(error instanceof PayloadTooLarge?413:400,{error:error instanceof PayloadTooLarge?'Richiesta troppo grande':'Impossibile elaborare la richiesta. Riprova.'}); }
 };
}
