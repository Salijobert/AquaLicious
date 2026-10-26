/* Shared transport. No credentials, passwords or business data are stored locally. */
window.AQ = (() => {
 // Remove credentials/authentication flags left by the retired prototype.
 for (const storage of [localStorage,sessionStorage]) for (const key of ['aq_users','aq_user','aq_notified']) storage.removeItem(key);
 const mobile = document.documentElement.dataset.mobile === 'true';
 let token = mobile ? '' : sessionStorage.getItem('aq_token') || '';
 let base = mobile ? localStorage.getItem('aq_server') || '' : new URL('../../backend/api', document.currentScript.src).href;
 const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function api(path, data, method = 'GET') {
  if (!base) throw new Error('Set your backend URL in Server Connection Settings.');
  let response;
  try { response = await fetch(base.replace(/\/$/, '') + '/' + path, {method, headers: {...(token ? {Authorization:'Bearer '+token}:{}), ...(data ? {'Content-Type':'application/json'}:{})}, body:data ? JSON.stringify(data):undefined, signal:AbortSignal.timeout(15000)}); }
  catch { throw new Error('Cannot reach the server. Check your connection. No offline transaction was recorded. Retry uses the same transaction key.'); }
  const result = await response.json().catch(() => ({error:'Invalid server response'}));
  if (!response.ok) { if (response.status === 401) { setToken(''); window.dispatchEvent(new Event('aq-expired')); } throw new Error(result.error || 'Request failed'); }
  return result;
 }
 function setToken(value) { token=value; if(!mobile) { if(value) sessionStorage.setItem('aq_token',value); else sessionStorage.removeItem('aq_token'); } }
 function setBase(value) { const url=new URL(value); const local=['localhost','127.0.0.1'].includes(url.hostname)||/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname); if(url.protocol!=='https:' && !(url.protocol==='http:' && local)) throw new Error('Use HTTPS for remote servers. Private-network HTTP is supported only in debug APKs.'); if(url.username || url.password || url.search || url.hash)throw new Error('Use a plain API base URL'); base=url.href.replace(/\/$/,''); localStorage.setItem('aq_server',base); setToken(''); }
 return {api,esc,mobile,setToken,setBase,getBase:()=>base,hasToken:()=>!!token,money:v=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(v)),key:()=>crypto.randomUUID()};
})();
