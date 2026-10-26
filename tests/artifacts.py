from pathlib import Path
import zipfile,json
root=Path(__file__).resolve().parents[1]
for variant in ['debug','release']:
 apk=root/f'mobile/android/app/build/outputs/apk/{variant}/app-{variant}.apk'
 with zipfile.ZipFile(apk) as z:
  for f in ['api.js','shared.js']:
   assert z.read('assets/public/'+f)==(root/'aqualicious website/frontend/js'/f).read_bytes(),f'{variant}: stale {f}'
  config=json.loads(z.read('assets/capacitor.config.json'))
  assert config['appId']=='com.aqualicious.pos'
  assert config['plugins']['CapacitorHttp']['enabled'] is True
  assert b'ReceiptPrinterPlugin' in z.read('classes.dex') or any(b'ReceiptPrinterPlugin' in z.read(n) for n in z.namelist() if n.endswith('.dex'))
 print(f'PASS {variant} APK bundles current clients, native HTTP configuration and receipt printer')
