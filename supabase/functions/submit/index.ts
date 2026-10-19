import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHandler } from './handler.ts';
const required = (key: string) => { const value = Deno.env.get(key); if (!value) throw new Error(`Missing ${key}`); return value; };
const db = createClient(required('SUPABASE_URL'),required('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createHandler({
 allowedOrigin:required('APP_ORIGIN'), hostname:required('TURNSTILE_HOSTNAME'),turnstileSecret:required('TURNSTILE_SECRET_KEY'),
 verify:fetch,
 async getUser(token) { const {data:{user},error} = await db.auth.getUser(token); return error?null:user; },
 async submit(name,args) { const {data,error} = await db.rpc(name,args); return {data,error}; },
}));
