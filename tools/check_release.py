"""Validate the source/release inventory without printing file contents."""
from pathlib import Path
import argparse, json, re, subprocess, sys, zipfile
ROOT = Path(__file__).resolve().parents[1]
SKIP = {'.git', 'node_modules', 'bin', 'obj', 'dist'}
BANNED = {'ParentTreeData', '.git-credentials', '.env', '.env.local'}
SECRET = [
    re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    re.compile(r'\bgh[pousr]_[A-Za-z0-9]{30,}\b'),
    re.compile(r'\bgithub_pat_[A-Za-z0-9_]{30,}\b'),
    re.compile(r'https?://(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?=[:/\s]|$)'),
    re.compile(r'[A-Za-z]:[\\/]Users[\\/][^\\/\s\x00]+', re.I),
]
def fail(message):
    raise SystemExit('FAIL: ' + message)
def source_files():
    if (ROOT / '.git').exists():
        raw = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT)
        return [ROOT / p.decode('utf-8') for p in raw.split(b'\0') if p]
    return [p for p in ROOT.rglob('*') if p.is_file() and not any(x in SKIP for x in p.relative_to(ROOT).parts)]
def scan_bytes(path, data):
    for text in (data.decode('utf-8', errors='ignore'), data.decode('utf-16le', errors='ignore')):
        if any(pattern.search(text) for pattern in SECRET):
            fail('sensitive pattern in ' + str(path))
def validate_demo(path):
    demo = json.loads(path.read_text(encoding='utf-8'))
    if len(demo.get('nodes', [])) != 8:
        fail('unexpected demonstration population: ' + str(path))
    if not all('Вымышленный' in n.get('data', {}).get('notes', '') for n in demo['nodes']):
        fail('demonstration lacks fictional-data markers')
    if demo.get('metadata', {}).get('treeId'):
        fail('unexpected external identity in demo')
def main():
    args = argparse.ArgumentParser()
    args.add_argument('--dist', type=Path)
    options = args.parse_args()
    files = source_files()
    for path in files:
        rel = path.relative_to(ROOT)
        if any(part in BANNED for part in rel.parts) or path.suffix.lower() in {'.pem', '.key', '.pfx', '.p12', '.exe', '.cab', '.log', '.pdb'}:
            fail('unexpected source inventory: ' + str(rel))
        if path.suffix.lower() == '.fam':
            if rel.as_posix() not in {'desktop/demo.fam', 'examples/Ивановы.fam'}:
                fail('unexpected document: ' + str(rel))
            validate_demo(path)
        scan_bytes(rel, path.read_bytes())
    if not (ROOT / 'desktop/demo.fam').read_bytes() == (ROOT / 'examples/Ивановы.fam').read_bytes():
        fail('demo copies differ')
    project = (ROOT / 'desktop/ParentTree.Desktop.csproj').read_text(encoding='utf-8')
    if 'Runtime.cab' in project or 'clientkey' in project.lower():
        fail('unexpected embedded resource')
    assets = ROOT / 'desktop/OfflineWeb.zip'
    if assets.exists():
        with zipfile.ZipFile(assets) as archive:
            for entry in archive.infolist():
                if entry.is_dir():
                    continue
                if entry.filename.endswith(('.fam', '.json')) or '..' in Path(entry.filename).parts:
                    fail('document or unsafe path in UI resources')
                scan_bytes(entry.filename, archive.read(entry))
    if options.dist:
        folder = options.dist.resolve()
        if not (folder / 'ParentTreeDesktop.exe').is_file():
            fail('desktop executable missing')
        if (folder / 'ParentTreeData').exists():
            fail('working profile in release folder')
        for path in folder.rglob('*'):
            if path.is_file():
                if path.suffix.lower() == '.pdb':
                    fail('debug symbols must not be shipped')
                if path.suffix.lower() == '.fam':
                    validate_demo(path)
                if path.suffix.lower() != '.zip':
                    scan_bytes(path.relative_to(folder), path.read_bytes())
    print(json.dumps({'status':'PASS', 'source_files':len(files), 'demo_people':8, 'user_profiles':0}, ensure_ascii=False))
if __name__ == '__main__':
    main()
