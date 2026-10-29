exec(open('tools/qa/run.py',encoding='utf-8').read().split("if sys.argv[1]")[0])
run('mobile-sync',['node',str(root/'tools/sync-mobile.mjs')],root)
run('capacitor-sync',['node',str(root/'mobile/node_modules/@capacitor/cli/bin/capacitor'),'sync','android'],root/'mobile')
run('apk-release-retry',['pwsh','-NoProfile','-ExecutionPolicy','Bypass','-File',str(root/'tools/build-local-release.ps1')],root,600)
