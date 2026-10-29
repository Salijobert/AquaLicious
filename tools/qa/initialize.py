from pathlib import Path
import json,secrets,subprocess,os,shutil,zipfile
root=Path(__file__).resolve().parents[2];out=root/'tests/qa';out.mkdir(exist_ok=True)
env={'DATABASE_URL':'postgresql://qa@127.0.0.1:55432/aqualicious_qa?schema=public','NODE_ENV':'test','PORT':'18088','FAILOVER_PORT':'18089','JWT_SECRET':secrets.token_hex(32),'AQ_ADMIN_PASSWORD':secrets.token_hex(24),'ALLOW_LOCAL_AUTH_FALLBACK':'true','AQ_MOCK_MAIL':'true','SMTP_PASS':'','SMTP_USER':'aqualiciousadmin@gmail.com','ADMIN_EMAIL':'aqualiciousadmin@gmail.com','FIREBASE_PROJECT_ID':'demo-aqualicious-qa','GCLOUD_PROJECT':'demo-aqualicious-qa','GOOGLE_CLOUD_PROJECT':'demo-aqualicious-qa','FIREBASE_AUTH_EMULATOR_HOST':'127.0.0.1:19099','FIREBASE_SERVICE_ACCOUNT_KEY':'{}','FIREBASE_SERVICE_ACCOUNT_PATH':'','GOOGLE_APPLICATION_CREDENTIALS':'','CORS_ORIGINS':'http://localhost:14173,http://127.0.0.1:14173,https://localhost,https://aqualicious-qa.vercel.app','FRONTEND_URL':'http://localhost:14173','GCASH_QR_URL':'https://example.invalid/qa-gcash.png','MAYA_QR_URL':'https://example.invalid/qa-maya.png','CLEANUP_DRY_RUN':'true','VITE_API_URL':'http://127.0.0.1:18088','TZ':'UTC','CLUSTER_ID':'aqualicious-cluster-primary'}
(out/'env.json').write_text(json.dumps(env));(out/'baseline-status.txt').write_text(subprocess.check_output(['git','status','--short'],cwd=root,text=True));(out/'baseline-commit.txt').write_text(subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True))
targets=['frontend/dist','node_modules/.vite','frontend/node_modules/.vite','mobile/www','backend/dist']
inventory=[]
for name in targets:
 p=(root/name).resolve();assert p.is_relative_to(root)
 inventory.append({'path':name,'exists':p.exists(),'files':sum(1 for f in p.rglob('*') if f.is_file()) if p.exists() else 0})
 # Never delete tracked source: these are generated output directories explicitly requested for cleanup.
 tracked=subprocess.check_output(['git','ls-files',name],cwd=root,text=True).strip()
 if tracked:
  with zipfile.ZipFile(out/'baseline-generated.zip','a',zipfile.ZIP_DEFLATED) as z:
   for f in p.rglob('*'):
    if f.is_file():z.write(f,f.relative_to(root))
 if p.exists():shutil.rmtree(p)
(out/'stale-build-inventory.json').write_text(json.dumps(inventory,indent=2))
print('[0.2] PASS | BASELINE: clean tracked checkout and stale outputs removed | tests/qa/stale-build-inventory.json; application sources untouched')
