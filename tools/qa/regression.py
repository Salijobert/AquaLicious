exec(open('tools/qa/run.py',encoding='utf-8').read().split("if sys.argv[1]")[0])
env['AQ_TEST_URL_2']='http://127.0.0.1:18088/backend/api';env['AQ_TEST_WEB']='http://127.0.0.1:18088';env['AQ_UI_USERNAME']='test-owner'
for repeat in [1,2]:
 for suite in ['integration','payments','security_and_verification','clean_urls_and_routing','playwright_real_behavior']:
  run(f'fixture-{suite}-{repeat}',['node',str(root/'tools/qa/suite-fixtures.mjs')],root)
  env['AQ_TEST_URL']='http://127.0.0.1:18088'+('/backend/api' if suite in ['integration','payments'] else '')
  rc=run(f'regression-{suite}-{repeat}',['node','--import',(root/'tools/qa/safety-preload.mjs').as_uri(),str(root/f'tests/{suite}.mjs')],root,120)
  log=(out/f'regression-{suite}-{repeat}.log').read_text();passes=sum(line.startswith('PASS ') for line in log.splitlines());fails=sum(line.startswith('FAIL ') for line in log.splitlines());status='PASS' if rc==0 and not fails else 'FAIL'
  r=dict(id='9.1' if repeat==1 else '9.3',status=status,kind='STATIC' if suite=='clean_urls_and_routing' else 'BEHAVIOR',what=f'{suite} run {repeat}',detail=f'exit={rc}; printed PASS={passes}; printed FAIL={fails}; tests/qa/regression-{suite}-{repeat}.log',severity='' if status=='PASS' else 'Medium')
  with open(out/'checks.jsonl','a') as f:f.write(json.dumps(r)+'\n')
  print(f'[{r["id"]}] {status} | {r["what"]} | {r["detail"]}',flush=True)
