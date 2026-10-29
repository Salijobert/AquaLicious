exec(open('tools/qa/run.py',encoding='utf-8').read().split("if sys.argv[1]")[0])
def rec(id,status,what,detail):
 row=dict(id=id,status=status,kind='BEHAVIOR',what=what,detail=detail,severity='' if status=='PASS' else 'Medium')
 with open(out/'checks.jsonl','a') as f:f.write(json.dumps(row)+'\n')
 print(f'[{id}] {status} | {what} | {detail}',flush=True)
env['PM2_HOME']=str(out/'pm2');config=root/'tools/qa/ecosystem.config.cjs'
config.write_text("const c=require('../../ecosystem.config.cjs');const a=c.apps[0];a.name='aqualicious-qa';a.instances=2;a.cwd="+json.dumps(str(out))+";a.env={...a.env,...JSON.parse(require('fs').readFileSync("+json.dumps(str(out/'env.json'))+")) ,NODE_ENV:'production',PORT:18110};module.exports=c;")
pm2=root/'backend/node_modules/pm2/bin/pm2'
if pm2.exists():
 rc=run('pm2-start',['node',str(pm2),'start',str(config)],root,60)
 rc2=run('pm2-reload',['node',str(pm2),'reload',str(config)],root,60)
 run('pm2-list',['node',str(pm2),'jlist'],root,30)
 rec('8.3','PASS' if rc==rc2==0 else 'FAIL','Isolated two-worker PM2 cluster start/reload','Original ecosystem imported with test overrides: port18110, 2 workers, scratch cwd/env/PM2_HOME; tests/qa/pm2-*.log; exact production max-worker deployment not tested')
 run('pm2-stop',['node',str(pm2),'kill'],root,30)
else:rec('8.3','BLOCKED','PM2 cluster check','PM2 CLI dependency absent')
