from pathlib import Path
import subprocess,json
root=Path(__file__).resolve().parents[2];out=root/'tests/qa';scratch=root/'tools/qa/ci-sandbox';scratch.mkdir(exist_ok=True)
for d in ['frontend/dist','frontend/src','mobile/www','backend/src','backend/prisma','docs','tests']:(scratch/d).mkdir(parents=True,exist_ok=True)
for name,script,content in [('staff','check-staff-cleanliness.mjs','console.log("Staff");'),('html','wide-html-check.mjs','const alias={path:"/ok",element:1};const bad="/qa-bad.html";')]:
 f=scratch/'frontend/dist/qa-injected.js';f.write_text(content)
 try:
  p=subprocess.run(['node',str(root/'tools'/script)],cwd=scratch,capture_output=True,text=True);(out/f'ci-injection-{name}.log').write_text(p.stdout+p.stderr)
  row=dict(id='9.4',status='PASS' if p.returncode!=0 else 'FAIL',kind='BEHAVIOR',what=f'{name} CI scanner detects deliberate built-output violation',detail=f'exit={p.returncode}; isolated tools/qa/ci-sandbox replica; injection removed; tests/qa/ci-injection-{name}.log',severity='' if p.returncode else 'High')
  with open(out/'checks.jsonl','a') as fh:fh.write(json.dumps(row)+'\n')
  print(f'[9.4] {row["status"]} | {row["what"]} | {row["detail"]}')
 finally:f.unlink()
