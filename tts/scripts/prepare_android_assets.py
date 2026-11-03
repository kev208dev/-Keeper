"""Copy model runtime files into Android assets and record original checksums."""
import hashlib,json,shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=root/'models/supertonic-3'
target=root/'android/app/src/main/assets/supertonic-3'
if not (source/'onnx/vocoder.onnx').is_file():
    raise SystemExit('Run setup-tts.ps1 first to download the model.')
target.mkdir(parents=True,exist_ok=True)
for name in ('onnx','voice_styles'):
    shutil.copytree(source/name,target/name,dirs_exist_ok=True)
for name in ('LICENSE','README.md','config.json'):
    shutil.copy2(source/name,target/name)
files=[p for name in ('onnx','voice_styles') for p in sorted((target/name).glob('*')) if p.is_file()]
files += [target/name for name in ('LICENSE','README.md','config.json')]
checksums={p.relative_to(target).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
revisions=sorted({p.read_text().splitlines()[0] for p in (source/'.cache').rglob('*.metadata')})
(target/'MODEL_SOURCE.json').write_text(json.dumps({'model':'Supertonic 3','creator':'Supertone Inc.','source':'https://huggingface.co/Supertone/supertonic-3','original_revisions':revisions,'weights_modified':False,'sha256':checksums},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Prepared {len(files)} model files for offline APK.')
