import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import './safety_guard.mjs';
const base=process.env.AQ_TEST_URL||'http://127.0.0.1:8090/backend/api';
const second=process.env.AQ_TEST_URL_2||'http://127.0.0.1:8091/backend/api';
const adminUsername=process.env.AQ_UI_USERNAME||'test-owner';
const password=process.env.AQ_ADMIN_PASSWORD;
if(!password)throw new Error('AQ_ADMIN_PASSWORD required; tests run only against a disposable database.');
for(let i=0;i<30;i++){try{await fetch(base+'/config.php');break;}catch{await new Promise(r=>setTimeout(r,100));}}
let passed=0;
function ok(condition,label){assert.ok(condition,label);console.log('PASS '+label);passed++;}
async function req(path,data,method='GET',token='',url=base){const r=await fetch(url+'/'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});return {code:r.status,data:await r.json()};}
const login=await req('auth.php',{username:adminUsername,password},'POST');ok(login.code===200,'Administrator sign-in');const a=login.data.token;
const register=await req('auth.php',{action:'register',name:'Test Customer',username:'customer-'+randomUUID(),email:'admin-attempt-'+randomUUID()+'@example.com',password,role:'Administrator'},'POST');ok(register.code===403,'Public Administrator registration rejected');
const noConsent=await req('auth.php',{action:'register',name:'No Consent Customer',username:'customer-'+randomUUID(),email:'noconsent-'+randomUUID()+'@example.com',password},'POST');ok(noConsent.code===422,'Registration without consent rejected');
const customerEmail = 'customer-'+randomUUID()+'@example.com';
const c1=await req('auth.php',{action:'register',name:'Test Customer',username:'customer-'+randomUUID(),email:customerEmail,password,consent:true,termsVersion:'2026-10-27.2'},'POST');ok(c1.code===200,'Customer registration');let c=c1.data.token;

// Forgot password returns identical 200 for existing and non-existing email (anti-enumeration)
const fpNonExistent = await req('auth.php', { action: 'forgot_password', email: 'nonexistent-'+randomUUID()+'@example.com' }, 'POST');
const fpAdmin = await req('auth.php', { action: 'forgot_password', email: 'aqualiciousadmin@gmail.com' }, 'POST');
ok(fpNonExistent.code === 200 && fpAdmin.code === 200 && fpNonExistent.data.message === fpAdmin.data.message, 'Forgot password returns identical 200 for existing and non-existing email');

// Unverified customer blocked from createOrder (403 EMAIL_NOT_VERIFIED)
const preVerifyOrder = await req('orders.php', { items: [{ product_id: 1, qty: 1 }], fulfillment: 'PICKUP', method: 'CASH', request_key: randomUUID() }, 'POST', c);
ok(preVerifyOrder.code === 403 && preVerifyOrder.data.code === 'EMAIL_NOT_VERIFIED', 'Unverified customer blocked from createOrder (403 EMAIL_NOT_VERIFIED)');

// Unauthenticated verify_email rejected
const verifyRes = await req('auth.php', { action: 'verify_email', email: c1.data.user.email }, 'POST');
ok(verifyRes.code === 401 || verifyRes.code === 403 || verifyRes.code === 404, 'Customer unauthenticated verify_email rejected (401/403/404)');

// Customer email verified via authorized claims
const { PrismaClient } = await import('../backend/node_modules/@prisma/client/index.js');
const prisma = new PrismaClient();
const updatedUser = await prisma.user.update({
  where: { email: c1.data.user.email },
  data: { emailVerified: true }
});
const { generateTestToken } = await import('../backend/dist/config/index.js');
c = generateTestToken({
  uid: updatedUser.firebaseUid,
  email: updatedUser.email,
  role: 'CUSTOMER',
  email_verified: true
});
await prisma.$disconnect();
const staffProvision = await req('users.php', { name: 'Cashier', username: 'staff-' + randomUUID(), password, role: 'Staff' }, 'POST', a);
ok(staffProvision.code === 422, 'Role "Staff" is strictly rejected when provisioning users (422)');

const staffReg = await req('auth.php', { action: 'register', name: 'Bad Actor', username: 'hacker-' + randomUUID(), email: 'hacker@example.com', password, consent: true, termsVersion: '2026-10-27-v1', role: 'Staff' }, 'POST');
ok(staffReg.code === 403, 'Public registration with role is rejected (403)');

const s1 = await req('users.php', { name: 'New Customer', username: 'customer-' + randomUUID(), password, role: 'Customer' }, 'POST', a);
ok(s1.code === 200, 'Administrator provisions Customer account');

const lastAdminDelete = await req('users.php', { id: 1 }, 'DELETE', a);
ok(lastAdminDelete.code === 409, 'Administrator cannot delete the last active Administrator (409)');

ok((await req('inventory.php', { product_id: 1, type: 'RESTOCK', quantity: 100, notes: 'Opening count' }, 'POST', c)).code === 403, 'Customer cannot restock');
ok((await req('reports.php', null, 'GET', c)).code === 403, 'Customer cannot read analytics');
ok((await req('sales.php', null, 'GET', c)).code === 403, 'Customer cannot list sales');
ok((await req('products.php', null, 'GET')).data.every(p => !('production_cost' in p)), 'Public catalog hides costs');
await req('products.php', { id: 1, production_cost: '10.00' }, 'PATCH', a);
for(const product_id of [1,2])ok((await req('inventory.php',{product_id,type:'ADJUSTMENT',quantity:20,notes:'Test opening balance'},'POST',a)).code===200,'Opening stock '+product_id);
const payload={items:[{product_id:1,qty:2},{product_id:2,qty:1}],cash_tendered:'500.00',request_key:randomUUID()};
ok((await req('sales.php',{...payload,expected_total:'1.00',request_key:randomUUID()},'POST',a)).code===409,'Stale POS total rejected before charging');
const sale=await req('sales.php',payload,'POST',a);ok(sale.code===200 && sale.data.items.length===2 && Number(sale.data.total)===310,'Multi-item receipt and server prices');
const retry=await req('sales.php',payload,'POST',a);ok(retry.data.id===sale.data.id,'Checkout retry is idempotent');
ok((await req('sales.php',{...payload,cash_tendered:'600.00'},'POST',a)).code===409,'Changed payload cannot reuse key');
let ps=(await req('products.php',null,'GET',a)).data;ok(Number(ps.find(p=>p.id==1).stock)===18 && Number(ps.find(p=>p.id==2).stock)===19,'Single stock deduction');
const p=ps.find(p=>p.id==1);await req('products.php',{...p,production_cost:'20.00'},'PATCH',a);
const historical=await req('sales.php?id='+sale.data.id,null,'GET',a);ok(Number(historical.data.items.find(l=>l.product_id==1).unit_cost_snapshot)===10,'Historical cost snapshot survives price edits');
ok((await req('sales.php', { id: sale.data.id, reason: 'Unauthorized reversal' }, 'PATCH', c)).code === 403, 'Customer cannot void sales (403)');
ok((await req('sales.php', { reason: 'Missing sale id' }, 'PATCH', a)).code === 422, 'Void without sale id rejected (422)');
const vp={id:sale.data.id,admin_username:adminUsername,admin_password:password,reason:'Test reversal'};
ok((await req('sales.php',vp,'PATCH',a)).data.status==='VOIDED','Administrator direct void');
await req('sales.php',vp,'PATCH',a);ps=(await req('products.php',null,'GET',a)).data;ok(Number(ps.find(p=>p.id==1).stock)===20,'Repeated void restores stock only once');
const orderBody={items:[{product_id:1,qty:3}],fulfillment:'PICKUP',address:'',method:'CASH',request_key:randomUUID()};
ok((await req('orders.php',{...orderBody,expected_total:'1.00',request_key:randomUUID()},'POST',c)).code===409,'Stale customer total rejected before reserving');
const order=await req('orders.php',orderBody,'POST',c);ok(order.code===200,'Verified customer successfully places order');
ok((await req('orders.php',orderBody,'POST',c)).data.id===order.data.id,'Order retry is idempotent');
let receipts = [];
for (let i = 0; i < 25; i++) {
  await new Promise(r => setTimeout(r, 300));
  const emailLogs = (await req('orders.php?email_logs=' + order.data.id, null, 'GET', a)).data;
  receipts = (emailLogs || []).filter(l => l.type === 'ORDER_RECEIPT');
  if (receipts.length > 0) break;
}
ok(receipts.length === 1, 'Idempotent order checkout sends only one receipt email');
ps=(await req('products.php',null,'GET',a)).data;ok(Number(ps.find(p=>p.id==1).stock)===17,'Order reserves stock');
ok((await req('orders.php',{id:order.data.id,action:'status',status:'COMPLETED',cash_received:true},'PATCH',c)).code>=400,'Customer cannot complete order');
await req('orders.php',{id:order.data.id,action:'status',status:'CONFIRMED'},'PATCH',a);
ok((await req('orders.php',{id:order.data.id,action:'status',status:'COMPLETED',cash_received:true},'PATCH',a)).data.status==='COMPLETED','Cash order completion');
ps=(await req('products.php',null,'GET',a)).data;ok(Number(ps.find(p=>p.id==1).stock)===17,'Order completion does not deduct twice');
const cancel=await req('orders.php',{...orderBody,request_key:randomUUID()},'POST',c);
await req('orders.php',{id:cancel.data.id,action:'status',status:'CANCELLED',notes:'Changed mind'},'PATCH',c);
ps=(await req('products.php',null,'GET',a)).data;ok(Number(ps.find(p=>p.id==1).stock)===17,'Cancellation returns reserved stock');
ok((await req('orders.php',{id:cancel.data.id,action:'status',status:'CANCELLED',notes:'Again'},'PATCH',c)).code===409,'Repeated cancellation rejected');
await req('inventory.php',{product_id:1,type:'ADJUSTMENT',quantity:1,notes:'Last unit race fixture'},'POST',a);
const a2User = await req('users.php', { name: 'Second Admin', username: 'admin2-' + randomUUID(), password, role: 'Administrator' }, 'POST', a);
const a2 = (await req('auth.php', { username: a2User.data.username, password }, 'POST')).data.token;
const race=await Promise.all([req('sales.php',{items:[{product_id:1,qty:1}],cash_tendered:'30',request_key:randomUUID()},'POST',a),req('sales.php',{items:[{product_id:1,qty:1}],cash_tendered:'30',request_key:randomUUID()},'POST',a2)]);
ok(race.filter(r=>r.code===200).length===1 && race.filter(r=>r.code===409).length===1,'Concurrent cashiers cannot oversell final unit');
const before=(await req('products.php',null,'GET',a)).data.find(p=>p.id==2).stock;
ok((await req('sales.php',{items:[{product_id:2,qty:1},{product_id:1,qty:1}],cash_tendered:'1000',request_key:randomUUID()},'POST',a)).code===409,'Insufficient stock aborts multi-item checkout');
ok((await req('products.php',null,'GET',a)).data.find(p=>p.id==2).stock===before,'Failed cart rolls back every item');
const report=(await req('reports.php',null,'GET',a)).data;ok(report.series.length===30 && report.series.some(d=>d.revenue===0),'Reports include zero-sales days');
ok(typeof report.trend.sma === 'number' && typeof report.trend.label === 'string', 'Seven completed-day forecast calculated');
const forbidden=await fetch(base+'/products.php',{headers:{Origin:'https://untrusted.example'}});ok(forbidden.status===403,'Unapproved CORS origin rejected');
const allowed=await fetch(base+'/products.php',{method:'OPTIONS',headers:{Origin:'https://localhost','Access-Control-Request-Headers':'authorization'}});ok(allowed.status===204 && allowed.headers.get('access-control-allow-origin')==='https://localhost','Android CORS preflight accepted');
const ledger=(await req('inventory.php?ledger=1',null,'GET',a)).data;ok(ledger.every(l=>Number(l.previous_balance)+Number(l.change_qty)===Number(l.new_balance)),'Ledger balances reconcile');
console.log(`\n${passed} integration checks passed.`);
