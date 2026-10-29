from pathlib import Path
import subprocess,json,re,gzip
root=Path(__file__).resolve().parents[2];out=root/'tests/qa'
def rec(id,status,what,detail,severity=''):
 row=dict(id=id,status=status,kind='STATIC',what=what,detail=detail,severity=severity)
 with open(out/'checks.jsonl','a') as f:f.write(json.dumps(row)+'\n')
 print(f'[{id}] {status} | STATIC: {what} | {detail}')
for side in ['frontend','backend']:
 package=json.loads((root/side/'package.json').read_text());rec('1.2','BLOCKED' if 'lint' not in package.get('scripts',{}) else 'SKIPPED',side+' lint','No lint script configured' if 'lint' not in package.get('scripts',{}) else 'Not executed')
 rec('1.1','PASS',side+' TypeScript compilation','tests/qa/'+side+'-typecheck.log; exit 0')
 audit=json.loads((out/(side+'-audit.log')).read_text());v=audit.get('vulnerabilities',{});high=[x for x in v if v[x]['severity'] in ['high','critical']]
 rec('1.4','FAIL' if high else 'PASS',side+' npm audit',json.dumps({p:v[p]['severity'] for p in high}), 'High' if high else '')
rows=[];secrets=[];files=subprocess.check_output(['git','ls-files'],cwd=root,text=True).splitlines()
patterns={'private key':r'-----BEGIN (?:RSA )?PRIVATE KEY-----','passworded DB URL':r'postgres(?:ql)?://[^\s:/]+:([^@\s]+)@','credential assignment':r'(?i)(?:SMTP_PASS(?:WORD)?|JWT_SECRET)\s*[=:]\s*[\x22\x27]?([^\s\x22\x27;,}]+)'}
removed=re.compile(r'Staff|STAFF|Admin & Staff Portal|Station Management Platform|Atomic POS|Log In to Station|test-owner|admin123|LandingPage|ServerSettingsPage|\.html')
def scan(label,text):
 for line,s in enumerate(text.splitlines(),1):
  for kind,rx in patterns.items():
   if re.search(rx,s):secrets.append({'file':label,'line':line,'kind':kind,'classification':'candidate only; redacted; requires contextual review'})
for file in files:
 p=root/file
 if not p.is_file() or p.stat().st_size>3000000 or p.suffix.lower() not in ['.ts','.tsx','.js','.mjs','.cjs','.json','.md','.html','.css','.yml','.yaml','.sql','.example','.py','.ps1','.env','.txt']:continue
 text=p.read_text(errors='replace');scan(file,text)
 for i,line in enumerate(text.splitlines(),1):
  matches=removed.findall(line)
  if matches:
   reason=''
   if 'migrations/' in file:reason='Historical schema migration and negative precheck'
   elif file.startswith(('tests/','tools/')):reason='Test or audit tooling; retained in evidence, not counted as UI behavior'
   elif file.startswith(('docs/','aqualicious website/')) or file.endswith('.md'):reason='Documentation or legacy prototype; not proof absent from shipped assets'
   elif file.endswith('vercel.json') or (file.endswith('App.tsx') and ('<Route path=' in line or 'isHomePage' in line)):reason='Alias mapping/redirect or legacy route detection'
   elif file.endswith('index.html') and all(x=='.html' for x in matches):reason='SPA entrypoint'
   rows.append(dict(file=file,line=i,matches=matches,excluded=bool(reason),reason=reason))
(out/'leftovers.json').write_text(json.dumps(rows,indent=2));rec('1.6','FAIL' if any(not r['excluded'] for r in rows) else 'PASS','Requested strings and .html scan',f'{len(rows)} matching lines including every excluded match; tests/qa/leftovers.json','Medium')
history=subprocess.check_output(['git','rev-list','--all'],cwd=root,text=True).splitlines();seen=set()
for commit in history:
 entries=subprocess.check_output(['git','ls-tree','-r',commit],cwd=root,text=True).splitlines()
 for entry in entries:
  meta,file=entry.split('\t',1);sha=meta.split()[-1]
  if sha in seen:continue
  seen.add(sha)
  if not re.search(r'(\.env|\.example|\.json|\.md|\.ts|\.js|\.mjs|\.php|\.ps1|\.yml|\.yaml|\.txt)$',file):continue
  size=int(subprocess.check_output(['git','cat-file','-s',sha],cwd=root,text=True))
  if size>2000000:continue
  scan(commit[:8]+':'+file,subprocess.check_output(['git','cat-file','-p',sha],cwd=root).decode(errors='replace'))
(out/'secret-candidates-redacted.json').write_text(json.dumps(secrets,indent=2));rec('1.5','BLOCKED' if secrets else 'PASS','Tracked/history heuristic secret scan',f'{len(history)} commits; {len(secrets)} redacted candidates; no claim all are real secrets; contextual triage needed: tests/qa/secret-candidates-redacted.json')
assets=list((root/'frontend/dist/assets').glob('*.js'));sizes=[dict(name=p.name,bytes=p.stat().st_size,gzip=len(gzip.compress(p.read_bytes()))) for p in assets];(out/'bundle-sizes.json').write_text(json.dumps(sizes,indent=2));rec('8.2','PASS','Bundle size inventory',f'{len(sizes)} JS chunks; raw={sum(x["bytes"] for x in sizes)}; gzip={sum(x["gzip"] for x in sizes)}; tests/qa/bundle-sizes.json')
same=all((root/'mobile/www/assets'/p.name).is_file() and p.read_bytes()==(root/'mobile/www/assets'/p.name).read_bytes() for p in assets);rec('1.7','PASS' if same else 'FAIL','Web/mobile bundle bytes match','Compared all JS files byte-for-byte')
rec('7.3','FAIL','API target restricted to build-time configuration','frontend/src/api/multiServerResolver.ts contains hardcoded remote tunnel and localhost fallback; browser external requests blocked during audit','High')
rec('9.2','FAIL','Existing suite assertions provide false assurance','clean_urls_and_routing tests source includes(); integration and security suites treat unauthenticated verify_email token issuance as expected PASS','High')
