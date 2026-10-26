from pathlib import Path
import zipfile,hashlib,json,shutil
root=Path(__file__).resolve().parents[1]
out=root/'deliverables';out.mkdir(exist_ok=True)
web=root/'aqualicious website'
with zipfile.ZipFile(out/'AquaLicious-Web-API.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in web.rglob('*'):
  if p.is_file() and p.name!='.env':z.write(p,p.relative_to(web))
with zipfile.ZipFile(out/'AquaLicious-Source.zip','w',zipfile.ZIP_DEFLATED) as z:
 for folder in ['aqualicious website','mobile','docs','tests','tools']:
  for p in (root/folder).rglob('*'):
   if not p.is_file():continue
   rel=p.relative_to(root)
   if any(x in rel.parts for x in ['node_modules','vendor','.gradle','build','runtime','.tools']):continue
   if p.name in ['local.properties','.env'] or p.suffix in ['.jks','.p12']:continue
   z.write(p,rel)
 z.write(root/'README.md','README.md');z.write(root/'.gitignore','.gitignore');z.write(root/'compose.yaml','compose.yaml')
for variant in ['debug','release']:
 apk=root/f'mobile/android/app/build/outputs/apk/{variant}/app-{variant}.apk'
 if apk.exists():shutil.copy2(apk,out/f'AquaLicious-{variant}.apk')
manifest={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.suffix in ['.apk','.zip']}
(out/'SHA256SUMS.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('\n'.join(f'{p.name}: {p.stat().st_size:,} bytes' for p in out.iterdir()))
