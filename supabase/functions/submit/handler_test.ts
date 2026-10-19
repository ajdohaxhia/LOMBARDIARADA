import {createHandler, validateDeploymentSecret, type SubmitDependencies} from './handler.ts';
function assert(condition: unknown,message='Assertion failed'): asserts condition { if(!condition) throw new Error(message); }
const origin='https://radar.example';
function fixture(overrides: Partial<SubmitDependencies>={}) {
 const calls: {name:string;args:{p_user:string;p_data:Record<string,unknown>}}[]=[];
 let verified=0;
 const handle=createHandler({allowedOrigin:origin,hostname:'radar.example',turnstileSecret:'test-secret',getUser:async token=>token==='valid'?{id:'server-user'}:null,verify:async()=>{verified++;return Response.json({success:true,hostname:'radar.example',action:'submit'});},submit:async(name,args)=>{calls.push({name,args});return {data:'new-id',error:null};},...overrides});
 return {handle,calls,verified:()=>verified};
}
function request(body: unknown={action:'contribution',turnstileToken:'valid-token',data:{kind:'report'}},headers:Record<string,string>={}) {
 return new Request(origin,{method:'POST',headers:{origin,authorization:'Bearer valid',...headers},body:JSON.stringify(body)});
}
Deno.test('origin rejected before auth or verification',async()=>{
 const f=fixture({getUser:()=>{throw new Error('must not authenticate');}});
 assert((await f.handle(request(undefined,{origin:'https://evil.example'}))).status===403);
 assert(f.verified()===0&&f.calls.length===0);
});
Deno.test('missing and invalid authentication never reach Turnstile or database',async()=>{
 for(const authorization of ['','Bearer ','Bearer expired']) {
  const f=fixture(); assert((await f.handle(request(undefined,{authorization}))).status===401);
  assert(f.verified()===0&&f.calls.length===0);
 }
});
for(const result of [{success:false,'error-codes':['timeout-or-duplicate']},{success:true,hostname:'evil.example',action:'submit'},{success:true,hostname:'radar.example',action:'other'},{success:'true',hostname:'radar.example',action:'submit'}]) {
 Deno.test(`Turnstile failure rejects ${JSON.stringify(result)}`,async()=>{
  const f=fixture({verify:async()=>Response.json(result)});
  assert((await f.handle(request())).status===400);assert(f.calls.length===0);
 });
}
Deno.test('Turnstile verifier receives secret and token server-side',async()=>{
 const f=fixture({verify:async(url,init)=>{
  assert(String(url)==='https://challenges.cloudflare.com/turnstile/v0/siteverify');
  const form=init?.body as URLSearchParams;assert(form.get('secret')==='test-secret');assert(form.get('response')==='valid-token');
  return Response.json({success:true,hostname:'radar.example',action:'submit'});
 }});
 assert((await f.handle(request())).status===201);
});
Deno.test('forged author, editorial status and fact status are not forwarded',async()=>{
 const f=fixture();
 const response=await f.handle(request({action:'contribution',turnstileToken:'token',p_user:'attacker',data:{kind:'report',title:'Title',author_id:'attacker',editorial_status:'approved',fact_status:'corroborated',merged_into:'target'}}));
 assert(response.status===201);assert(f.calls[0].args.p_user==='server-user');
 assert(JSON.stringify(f.calls[0].args.p_data)===JSON.stringify({kind:'report',title:'Title'}));
});
Deno.test('abuse only forwards allowed fields',async()=>{
 const f=fixture();assert((await f.handle(request({action:'abuse',turnstileToken:'token',data:{contribution_id:'target',reason:'Reason',author_id:'other'}}))).status===201);
 assert(f.calls[0].name==='submit_abuse');assert(!('author_id' in f.calls[0].args.p_data));
});
Deno.test('rate limit errors produce 429 without leaking database details',async()=>{
 const f=fixture({submit:async()=>({data:null,error:{code:'P0001',message:'SECRET'} as {code:string}})});
 const response=await f.handle(request());assert(response.status===429);assert(!(await response.text()).includes('SECRET'));
});
Deno.test('invalid JSON and malformed objects fail before verification',async()=>{
 for(const value of ['{', 'null','[]',JSON.stringify({action:'contribution',turnstileToken:'',data:{}}),JSON.stringify({action:'contribution',turnstileToken:'token',data:[]})]) {
  const f=fixture();const req=new Request(origin,{method:'POST',headers:{origin,authorization:'Bearer valid'},body:value});
  assert((await f.handle(req)).status===400);assert(f.verified()===0&&f.calls.length===0);
 }
});
Deno.test('streamed multibyte payload is bounded in bytes and cancelled',async()=>{
 let cancelled=false;
 const stream=new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new TextEncoder().encode('è'.repeat(6000)));},cancel(){cancelled=true;}});
 const f=fixture();const req=new Request(origin,{method:'POST',headers:{origin,authorization:'Bearer valid'},body:stream});
 assert((await f.handle(req)).status===413);assert(cancelled);assert(f.verified()===0&&f.calls.length===0);
});
Deno.test('Turnstile unavailable fails closed',async()=>{
 const f=fixture({verify:async()=>new Response('',{status:503})});assert((await f.handle(request())).status===503);assert(f.calls.length===0);
});

Deno.test('deployment rejects all documented dummy secrets without revealing values',()=>{
 for (const prefix of ['1','2','3']) {
  const secret=prefix+'x'+'0'.repeat(31)+'AA';
  let caught=false;
  try { validateDeploymentSecret(secret); } catch(error) {
   caught=true;assert(error instanceof Error);assert(!error.message.includes(secret));
  }
  assert(caught,'Dummy secret must fail startup');
 }
 validateDeploymentSecret('real-key-format-is-provider-owned');
});
Deno.test('deployment rejects blank secret',()=>{
 let caught=false;try {validateDeploymentSecret(' ');}catch{caught=true;}assert(caught);
});
