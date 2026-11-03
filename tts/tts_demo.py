"""Keeper TTS terminal demo. Default execution never downloads files."""
import argparse
import json
import math
import os
import socket
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(sys.executable if getattr(sys, 'frozen', False) else __file__).resolve().parent

def main():
    p = argparse.ArgumentParser(description='Offline Korean TTS / Supertonic 3 / CPU')
    p.add_argument('--text', default='안녕하세요. 키퍼 키오스크 도우미입니다. 원하시는 메뉴를 선택해 주세요.')
    p.add_argument('--voice', choices=[f'{g}{i}' for g in ('F', 'M') for i in range(1, 6)], default='F1')
    p.add_argument('--steps', type=int, default=5)
    p.add_argument('--speed', type=float, default=1.0)
    p.add_argument('--output', type=Path)
    p.add_argument('--download', action='store_true', help='One-time online model setup')
    p.add_argument('--play', action='store_true', help='Play generated WAV on Windows')
    p.add_argument('--interactive', action='store_true', help='Read sentences repeatedly from the terminal')
    a = p.parse_args()
    if not a.text.strip(): p.error('Text must not be empty')
    if not 1 <= a.steps <= 20: p.error('Steps must be 1 to 20')
    if not math.isfinite(a.speed) or not 0.7 <= a.speed <= 2: p.error('Speed must be 0.7 to 2')
    out = a.output or ROOT / 'outputs' / (datetime.now().strftime('keeper-%Y%m%d-%H%M%S-%f') + '.wav')
    out = out.resolve()
    if out.suffix.lower() != '.wav': p.error('Output must be .wav')
    if out.exists(): p.error(f'File already exists: {out}')
    if not a.download:
        os.environ['HF_HUB_OFFLINE'] = '1'
        os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
        # Fail any attempted network connection, including hidden download paths.
        def deny_network(*args, **kwargs):
            raise RuntimeError('Network access blocked in offline inference mode')
        socket.socket.connect = deny_network
        socket.create_connection = deny_network
    import numpy as np
    import soundfile as sf
    from supertonic import TTS
    print('Model: Supertonic 3 | Language: Korean | Device: CPU', flush=True)
    print('Mode: ' + ('one-time model download' if a.download else 'OFFLINE (network connections blocked)'), flush=True)
    started = time.perf_counter()
    tts = TTS(model='supertonic-3', model_dir=ROOT / 'models' / 'supertonic-3', auto_download=a.download,
              intra_op_num_threads=4, inter_op_num_threads=1)
    loaded = time.perf_counter() - started
    print(f'Model loaded in {loaded:.2f}s', flush=True)
    if a.interactive and a.output:
        p.error('--output cannot be combined with --interactive')
    if a.interactive:
        print('문장을 입력하세요. 빈 줄을 입력하면 종료합니다.', flush=True)
        while True:
            try:
                text = input('\n읽을 문장 > ').strip()
            except (EOFError, KeyboardInterrupt):
                break
            if not text:
                break
            target = ROOT / 'outputs' / (datetime.now().strftime('keeper-%Y%m%d-%H%M%S-%f') + '.wav')
            generate(tts, a, text, target, loaded)
    else:
        generate(tts, a, a.text, out, loaded)


def generate(tts, a, text, out, loaded):
    import numpy as np
    import soundfile as sf
    print(f'Text: {text}', flush=True)
    started = time.perf_counter()
    wav, _ = tts.synthesize(text, voice_style=tts.get_voice_style(a.voice), lang='ko',
                             total_steps=a.steps, speed=a.speed)
    elapsed = time.perf_counter() - started
    samples = np.asarray(wav).squeeze()
    if samples.ndim != 1 or not samples.size or not np.isfinite(samples).all() or np.max(np.abs(samples)) == 0:
        raise RuntimeError('Model produced invalid or silent audio')
    out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out), samples, tts.sample_rate, subtype='PCM_16')
    decoded, sr = sf.read(str(out))
    if len(decoded) != len(samples) or sr != tts.sample_rate:
        raise RuntimeError('Saved WAV validation failed')
    duration = len(decoded) / sr
    report = {'model':'supertonic-3', 'offline':not a.download, 'voice':a.voice,
              'load_seconds':round(loaded,3), 'inference_seconds':round(elapsed,3),
              'audio_seconds':round(duration,3), 'real_time_factor':round(elapsed/duration,3),
              'sample_rate':sr, 'bytes':out.stat().st_size, 'output':str(out)}
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
    out.with_suffix('.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    if a.play:
        import winsound
        winsound.PlaySound(str(out), winsound.SND_FILENAME)

if __name__ == '__main__':
    main()
