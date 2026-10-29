import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const evidence=path.join(root,'tests/qa');
export const env=JSON.parse(fs.readFileSync(path.join(evidence,'env.json'),'utf8'));
Object.assign(process.env,env);
export function record(id,status,what,detail,kind='BEHAVIOR',severity=''){
 const row={id,status,what,detail,kind,severity};fs.appendFileSync(path.join(evidence,'checks.jsonl'),JSON.stringify(row)+'\n');
 console.log(`[${id}] ${status} | ${kind}: ${what} | ${detail}`);return row;
}
export function check(id,ok,what,detail,severity='Medium'){return record(id,ok?'PASS':'FAIL',what,detail,'BEHAVIOR',ok?'':severity);}
export async function request(route,{method='GET',body,token,headers={},base='http://127.0.0.1:18088',raw}={}){
 const started=performance.now();try{const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},body:raw??(body!==undefined?JSON.stringify(body):undefined),signal:AbortSignal.timeout(12000)});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return{status:r.status,data,headers:Object.fromEntries(r.headers),ms:performance.now()-started};}catch(err){return{status:0,data:{error:err.message},headers:{},ms:performance.now()-started};}
}
export const {PrismaClient}=await import('../../backend/node_modules/@prisma/client/index.js');
export const prisma=new PrismaClient();
export const jwt=(await import('../../backend/node_modules/jsonwebtoken/index.js')).default;
export function token(user,extra={},opts={}){return jwt.sign({uid:user.firebaseUid,email:user.email,email_verified:user.emailVerified,role:user.role,...extra},env.JWT_SECRET,{expiresIn:'1h',...opts});}
export async function fixtureUsers(){return Object.fromEntries((await prisma.user.findMany()).filter(u=>u.username.startsWith('qa-')).map(u=>[u.username.slice(3),u]));}
