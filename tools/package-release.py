import os
from pathlib import Path
import zipfile, hashlib, json, shutil

root = Path(__file__).resolve().parents[1]
out = root / 'deliverables'
out.mkdir(exist_ok=True)

IGNORE = {'node_modules', 'vendor', '.gradle', 'build', 'runtime', '.tools', '.git', '.cache'}

def add_folder_to_zip(zip_file, folder_name):
    base_dir = root / folder_name
    if not base_dir.exists():
        return
    for dirpath, dirnames, filenames in os.walk(base_dir):
        # Prune ignored directories in-place
        dirnames[:] = [d for d in dirnames if d not in IGNORE]
        for f in filenames:
            if f in ['.env', 'local.properties'] or f.endswith(('.log', '.p12', '.jks')):
                continue
            full_path = Path(dirpath) / f
            rel_path = full_path.relative_to(root)
            zip_file.write(full_path, rel_path)

# 1. Web & Backend Package
with zipfile.ZipFile(out / 'AquaLicious-Web-API.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for folder in ['backend', 'frontend']:
        add_folder_to_zip(z, folder)

# 2. Complete Source Package
with zipfile.ZipFile(out / 'AquaLicious-Source.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for folder in ['backend', 'frontend', 'mobile', 'docs', 'tests', 'tools', 'aqualicious website']:
        add_folder_to_zip(z, folder)
    for extra in ['README.md', '.gitignore', 'compose.yaml']:
        extra_path = root / extra
        if extra_path.exists():
            z.write(extra_path, extra)

# 3. APK Deliverables
for variant in ['debug', 'release']:
    apk = root / f'mobile/android/app/build/outputs/apk/{variant}/app-{variant}.apk'
    if apk.exists():
        shutil.copy2(apk, out / f'AquaLicious-{variant}.apk')

# 4. Checksums Manifest
manifest = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.suffix in ['.apk', '.zip']}
(out / 'SHA256SUMS.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('\n'.join(f'{p.name}: {p.stat().st_size:,} bytes' for p in out.iterdir()))
