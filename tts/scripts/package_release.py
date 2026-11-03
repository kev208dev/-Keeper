"""Build reproducible-layout release ZIPs; never package local caches or outputs."""
import argparse
import hashlib
import importlib.metadata as metadata
import json
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = '0.1.0'

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def archive(folder, target):
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for f in sorted(folder.rglob('*')):
            if f.is_file():
                z.write(f, f.relative_to(folder.parent))

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--skip-build', action='store_true')
    args = p.parse_args()
    if not args.skip_build:
        subprocess.run([sys.executable, '-m', 'PyInstaller', '--noconfirm', '--onedir', '--console',
                        '--name', 'KeeperTTS', '--collect-all', 'supertonic', '--collect-all', 'onnxruntime',
                        '--collect-all', 'soundfile', '--recursive-copy-metadata', 'supertonic', 'tts_demo.py'],
                       cwd=ROOT, check=True)
    release = ROOT / 'release'
    release.mkdir(exist_ok=True)
    staging = release / f'v{VERSION}-staging'
    staging.mkdir(exist_ok=False)
    model_source = ROOT / 'models' / 'supertonic-3'
    model_package = staging / 'Keeper-Supertonic3-models'
    model_target = model_package / 'models' / 'supertonic-3'
    for folder in ('onnx', 'voice_styles'):
        shutil.copytree(model_source / folder, model_target / folder)
    for name in ('LICENSE', 'README.md', 'config.json'):
        shutil.copy2(model_source / name, model_target / name)
    revisions = {f.read_text().splitlines()[0] for f in (model_source / '.cache').rglob('*.metadata')}
    provenance = {
        'model': 'Supertonic 3', 'creator': 'Supertone Inc.',
        'download_source': 'https://huggingface.co/Supertone/supertonic-3',
        'archive_source': 'https://huggingface.co/supertone-oss-archive/supertonic-3',
        'original_revisions': sorted(revisions), 'weights_modified': False,
        'license': 'OpenRAIL-M; see LICENSE, including Section 5 and Attachment A',
        'sha256': {str(f.relative_to(model_target)).replace('\\', '/'): digest(f)
                   for f in sorted(model_target.rglob('*')) if f.is_file()}
    }
    (model_target / 'MODEL_SOURCE.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2), encoding='utf-8')
    notice = '''# Supertonic 3 model redistribution\n\nOriginal model: Supertone Inc.\nWeights are redistributed unchanged. Keeper is a separate integration/demo project, not the model creator, and is not endorsed by Supertone.\n\nUse and redistribution of these model files are governed by the included OpenRAIL-M LICENSE, including the use-based restrictions in Section 5 and Attachment A. These restrictions apply to subsequent users and redistributors. Retain this notice and the original license when redistributing.\n\nModel support/development by the original publisher has ended. This bundle retains a tested model revision and file checksums in MODEL_SOURCE.json.\n'''
    (model_package / 'MODEL_NOTICE.md').write_text(notice, encoding='utf-8')
    (model_package / 'README.txt').write_text('Developer model bundle only; no executable.\nExtract models/supertonic-3 beside tts_demo.py or KeeperTTS.exe.\nWindows users wanting a ready-to-run program should download Keeper-TTS-0.1.0-windows-x64.zip instead.\nAndroid requires a separate ONNX Runtime integration, not included.\nRead models/supertonic-3/LICENSE and MODEL_NOTICE.md before use/redistribution.\n', encoding='utf-8')
    win = staging / f'Keeper-TTS-{VERSION}-windows-x64'
    shutil.copytree(ROOT / 'dist' / 'KeeperTTS', win)
    shutil.copytree(model_package / 'models', win / 'models')
    shutil.copy2(model_package / 'MODEL_NOTICE.md', win / 'MODEL_NOTICE.md')
    shutil.copy2(ROOT / 'LICENSE', win / 'LICENSE')
    shutil.copy2(ROOT / 'docs' / 'WINDOWS_RELEASE.md', win / 'README.md')
    (win / 'start.cmd').write_bytes(b'@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\n"%~dp0KeeperTTS.exe" --interactive --play\r\npause\r\n')
    licenses = win / 'licenses'
    licenses.mkdir()
    shutil.copy2(Path(sys.base_prefix) / 'LICENSE.txt', licenses / 'PYTHON-LICENSE.txt')
    for dist in metadata.distributions():
        name = dist.metadata.get('Name', 'unknown')
        for item in dist.files or []:
            path = str(item).replace('\\', '/')
            if '.dist-info/' in path and any(x in path.lower() for x in ('license', 'copying', 'notice')):
                source = Path(dist.locate_file(item))
                if source.is_file():
                    target = licenses / name / path.split('.dist-info/', 1)[1]
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, target)
    for folder, filename in ((win, f'Keeper-TTS-{VERSION}-windows-x64.zip'),
                             (model_package, 'Keeper-Supertonic3-models.zip')):
        print(f'Compressing {filename}', flush=True)
        archive(folder, release / filename)
    assets = [release / f'Keeper-TTS-{VERSION}-windows-x64.zip', release / 'Keeper-Supertonic3-models.zip']
    (release / 'SHA256SUMS.txt').write_text(''.join(f'{digest(f)}  {f.name}\n' for f in assets), encoding='utf-8')
    for f in assets:
        with zipfile.ZipFile(f) as z:
            if z.testzip(): raise RuntimeError(f'Corrupt archive: {f}')
        print(f'{f.name}: {f.stat().st_size:,} bytes', flush=True)

if __name__ == '__main__':
    main()
