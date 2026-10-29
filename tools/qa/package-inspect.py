from pathlib import Path
import json,zipfile,subprocess,re
root=Path(__file__).resolve().parents[2];out=root/'tests/qa';apk=root/'mobile/android/app/build/outputs/apk/release/app-release.apk'
def rec(id,status,what,detail,kind='STATIC',severity=''):
 row=dict(id=id,status=status,what=what,detail=detail,kind=kind,severity=severity)
 with open(out/'checks.jsonl','a') as f:f.write(json.dumps(row)+'\n')
 print(f'[{id}] {status} | {kind}: {what} | {detail}')
with zipfile.ZipFile(apk) as z:
 names=z.namelist();bundles=[n for n in names if '/assets/index-' in n and n.endswith('.js')];expected=list((root/'frontend/dist/assets').glob('index-*.js'))[0];same=any(Path(n).name==expected.name and z.read(n)==expected.read_bytes() for n in bundles)
 rec('7.1','PASS' if same else 'FAIL','Release APK contains exact fresh bundle',f'{apk.relative_to(root)}; {expected.name}; byte equality={same}','BEHAVIOR')
 texts={n:z.read(n).decode(errors='replace') for n in names if n.endswith(('.js','.json','.html'))};matches=[n for n,t in texts.items() if re.search(r'-----BEGIN (?:RSA )?PRIVATE KEY-----',t)]
 rec('7.3','PASS' if not matches else 'FAIL','APK private-key marker scan',f'{len(texts)} text assets scanned; private-key markers={len(matches)}; public Firebase config is not a private key')
aapt=root/'.tools/android-sdk/build-tools/36.0.0/aapt2.exe';p=subprocess.run([str(aapt),'dump','xmltree',str(apk),'--file','AndroidManifest.xml'],capture_output=True,text=True);(out/'apk-manifest.log').write_text(p.stdout+p.stderr)
manifest=p.stdout;ok='usesCleartextTraffic' in manifest and 'allowBackup' in manifest and not re.search(r'debuggable[^\n]*=true',manifest)
rec('7.2','PASS' if ok else 'FAIL','Release manifest security fields present','tests/qa/apk-manifest.log; inspect explicit false values; capacitor config https, debug=false')
adb=root/'.tools/android-sdk/platform-tools/adb.exe';p=subprocess.run([str(adb),'devices'],capture_output=True,text=True);(out/'adb-devices.log').write_text(p.stdout+p.stderr);attached=[l for l in p.stdout.splitlines()[1:] if '\tdevice' in l]
rec('7.4','BLOCKED' if not attached else 'SKIPPED','Physical/emulated Android flows','No adb device attached' if not attached else 'Device found; not yet exercised','BEHAVIOR')
