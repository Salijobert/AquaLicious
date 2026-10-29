import {prisma,record,check,request,token,fixtureUsers,env} from './common.mjs';
const u=await fixtureUsers();const a=token(u.alice),admin=token(u.admin);
const protectedRoutes=[['GET','auth'],['PATCH','auth'],['GET','auth/me'],['POST','products'],['PATCH','products'],['GET','inventory'],['POST','inventory'],['GET','sales'],['POST','sales'],['PATCH','sales'],['GET','orders'],['POST','orders'],['PATCH','orders'],['GET','reports'],['GET','users'],['POST','users'],['PATCH','users'],['DELETE','users']];
for(const [method,path] of protectedRoutes)for(const [label,t] of [['missing',null],['tampered',admin+'x'],['expired',token(u.alice,{}, {expiresIn:-10})]]){
 const r=await request('/api/'+path,{method,token:t,...(method==='GET'?{}:{body:{}})});check('3.1',r.status===401,`${label}: ${method} /api/${path}`,`HTTP ${r.status}`,'High');
}
const admins=protectedRoutes.filter(([m,p])=>['inventory','sales','users'].includes(p)||(p==='products'&&m!=='GET'));admins.push(['GET','orders?email_logs=1']);
for(const prefix of ['/api/','/backend/api/','/'])for(const [method,p] of admins){const [path,q]=p.split('?');const url=prefix+path+(prefix==='/api/'?'':'.php')+(q?'?'+q:'');const r=await request(url,{method,token:a,...(method==='GET'?{}:{body:{}})});check('3.2',r.status===403,`Customer: ${method} ${url}`,`HTTP ${r.status}`,'High');}
for(const role of ['STAFF','staff','','random']){const r=await request('/api/users',{token:token(u.alice,{role})});check('3.3',r.status===403,'Forged claim role '+JSON.stringify(role),`HTTP ${r.status}; persisted CUSTOMER remains authoritative`,'High');}
let r=await request('/api/auth',{method:'POST',base:'http://127.0.0.1:18089',body:{action:'verify_email',email:u.admin.email}});
const elevated=r.data.token?await request('/api/users',{token:r.data.token,base:'http://127.0.0.1:18089'}):{status:0};
check('3.9',!(r.status===200&&elevated.status===200),'Production unauthenticated verify_email cannot acquire Admin access',`verify_email HTTP ${r.status}; returned token GET /api/users HTTP ${elevated.status}; token redacted`,'Critical');
r=await request('/api/users',{token:admin,base:'http://127.0.0.1:18089'});check('3.9',r.status===401,'Production rejects locally signed test JWT',`HTTP ${r.status}`,'Critical');
const reg={action:'register',name:'QA New',username:'qa-new',email:'new@example.invalid',password:env.AQ_ADMIN_PASSWORD,consent:true,termsVersion:'qa-v1'};
for(const [label,extra] of [['role',{role:'ADMIN'}],['no consent',{consent:undefined}],['false consent',{consent:false}],['invalid email',{email:'bad'}]]){r=await request('/api/auth',{method:'POST',body:{...reg,...extra}});check('3.5',r.status===422||r.status===403,'Registration rejects '+label,`HTTP ${r.status}`,'High');}
r=await request('/api/auth',{method:'POST',body:{...reg,email:u.alice.email}});check('3.5',!JSON.stringify(r.data).includes('EMAIL_ALREADY_EXISTS'),'Duplicate email response does not disclose existence',`HTTP ${r.status}; ${JSON.stringify(r.data)}`,'Medium');
for(const origin of ['http://localhost:14173','https://localhost','https://aqualicious-qa.vercel.app','https://random.example','https://attacker.vercel.app']){r=await request('/api/products',{headers:{Origin:origin}});const allow=r.headers['access-control-allow-origin'];const expected=env.CORS_ORIGINS.split(',').includes(origin);check('3.11',expected?allow===origin:!allow,'CORS '+origin,`HTTP ${r.status}; ACAO=${allow||'absent'}`,'High');}
r=await request('/api/products');check('3.12',!!r.headers['content-security-policy']&&!!r.headers['x-content-type-options'],'Helmet headers',`CSP ${!!r.headers['content-security-policy']}; nosniff=${r.headers['x-content-type-options']}`);
for(const [label,raw] of [['malformed','{'],['oversized',JSON.stringify({x:'x'.repeat(12*1024*1024)})]]){r=await request('/api/auth',{method:'POST',raw});check('3.13',r.status===400||r.status===413,label+' body rejected',`HTTP ${r.status}`);}
await prisma.$disconnect();
