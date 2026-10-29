exec(open('tools/qa/run.py',encoding='utf-8').read().split("if sys.argv[1]")[0])
import time,urllib.request
e=env.copy();e.update(PORT='18120',DATABASE_URL='postgresql://qa@127.0.0.1:59998/aqualicious_unreachable?connect_timeout=1')
log=open(out/'database-loss.log','w');p=subprocess.Popen(['node',str(root/'backend/dist/server.js')],cwd=out,env=e,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
try:
 time.sleep(3)
 try:
  response=urllib.request.urlopen('http://127.0.0.1:18120/api/products',timeout=10);status=response.status
 except Exception as ex:status=type(ex).__name__
 time.sleep(1);alive=p.poll() is None
 row=dict(id='8.4',status='PASS' if alive and isinstance(status,int) and status>=500 else 'FAIL',kind='BEHAVIOR',what='Backend survives unavailable scratch database with HTTP error',detail=f'isolated backend18120 -> closed loopback DB port59998; HTTP={status}; alive={alive}; tests/qa/database-loss.log',severity='' if alive else 'High')
 with open(out/'checks.jsonl','a') as f:f.write(json.dumps(row)+'\n')
 print(f'[8.4] {row["status"]} | {row["what"]} | {row["detail"]}')
finally:
 if p.poll() is None:p.terminate();p.wait(timeout=10)
 log.close()
