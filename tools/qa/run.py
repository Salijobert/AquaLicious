from pathlib import Path
import os,json,subprocess,sys
root=Path(__file__).resolve().parents[2];out=root/'tests/qa'
env=os.environ.copy();env.update(json.loads((out/'env.json').read_text()))
def run(name,args,cwd=None,timeout=180):
 try:
  p=subprocess.run(args,cwd=cwd or out,env=env,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=timeout)
  output=p.stdout+p.stderr
  for key in ['JWT_SECRET','AQ_ADMIN_PASSWORD']:
   output=output.replace(env[key],'[TEST_SECRET_REDACTED]')
  (out/(name+'.log')).write_text(output,encoding='utf-8');print(name,'exit',p.returncode,'evidence tests/qa/'+name+'.log');return p.returncode
 except subprocess.TimeoutExpired:
  (out/(name+'.log')).write_text('TIMEOUT');print(name,'TIMEOUT');return 124
if sys.argv[1]=='baseline':
 run('baseline-db-push',['node',str(root/'backend/node_modules/prisma/build/index.js'),'db','push','--schema',str(root/'backend/prisma/schema.prisma')])
 run('baseline-backend-build',['node',str(root/'backend/node_modules/typescript/bin/tsc'),'-p',str(root/'backend/tsconfig.json')])
 run('baseline-frontend-build',['npm.cmd','run','build'],root/'frontend')
elif sys.argv[1]=='start':
 for port,mode in [(18088,'test'),(18089,'production')]:
  e=env.copy();e.update(PORT=str(port),NODE_ENV=mode)
  log=open(out/f'backend-{mode}.log','w',encoding='utf-8')
  p=subprocess.Popen(['node',str(root/'backend/dist/server.js')],cwd=out,env=e,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
  (out/f'backend-{mode}.pid').write_text(str(p.pid));print('Started isolated backend',port,mode,'PID',p.pid)
 log=open(out/'frontend-preview.log','w',encoding='utf-8')
 p=subprocess.Popen(['node',str(root/'frontend/node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','14173','--strictPort'],cwd=root/'frontend',env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
 (out/'frontend.pid').write_text(str(p.pid));print('Started local preview 14173 PID',p.pid)
elif sys.argv[1]=='phase1':
 for side in ['frontend','backend']:
  run(side+'-typecheck',['node',str(root/side/'node_modules/typescript/bin/tsc'),'--noEmit','-p',str(root/side/'tsconfig.json')])
  run(side+'-audit',['npm.cmd','audit','--json'],root/side)
elif sys.argv[1]=='emulator':
 e=env.copy();e['JAVA_HOME']=str(next((root/'.tools/jdk').iterdir()));e['PATH']=str(Path(e['JAVA_HOME'])/'bin')+os.pathsep+e['PATH']
 log=open(out/'firebase-emulator.log','w',encoding='utf-8')
 p=subprocess.Popen(['node',str(root/'tools/qa/node_modules/firebase-tools/lib/bin/firebase.js'),'emulators:start','--only','auth','--project','demo-aqualicious-qa','--config',str(out/'firebase.json')],cwd=out,env=e,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
 (out/'emulator.pid').write_text(str(p.pid));print('Started demo Firebase Auth emulator PID',p.pid)
