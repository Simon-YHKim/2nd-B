"""Validate store-copy drafts and rebuild the offline review page. No publishing."""
from pathlib import Path
from datetime import datetime, timezone, timedelta
import base64
import hashlib
import html
import io
import json
import re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
draft_path = HERE / 'drafts.json'
data = json.loads(draft_path.read_text(encoding='utf-8'))
manifest = json.loads((HERE / 'source-manifest.json').read_text(encoding='utf-8'))
fields = {
    'appName': ('앱 이름 · 두 스토어', 30, 'characters'),
    'playShort': ('Google Play · 짧은 설명', 80, 'characters'),
    'appStoreSubtitle': ('App Store · 부제목', 30, 'characters'),
    'promotionalText': ('App Store · 홍보 문구', 170, 'characters'),
    'description': ('상세 설명 · 두 스토어', 4000, 'characters'),
    'keywords': ('App Store · 키워드', 100, 'utf8-bytes'),
    'releaseNotes': ('출시 노트 · 해당 변경이 포함된 업데이트용', 500, 'characters'),
}
errors, checks = [], []
locale_labels = {'ko': '한국어', 'en': 'English', 'es': 'Español (Latinoamérica)', 'pt': 'Português (Brasil)', 'id': 'Bahasa Indonesia'}
if data.get('status') != 'draft-not-submitted':
    errors.append('Expected explicit draft-not-submitted status.')
if set(data.get('locales', {})) != set(locale_labels):
    errors.append('Expected drafts for ko, en, es, pt and id.')
for locale, values in data.get('locales', {}).items():
    if set(values) != set(fields) | {'screenshotCaptions'}:
        errors.append(f'{locale}: field set differs from the documented mapping.')
    for key, (_, limit, unit) in fields.items():
        text = values.get(key)
        if not isinstance(text, str) or not text.strip():
            errors.append(f'{locale}.{key}: missing text.')
            continue
        count = len(text.encode('utf-8')) if unit == 'utf8-bytes' else len(text)
        passed = count <= limit and text == text.strip() and '\r' not in text
        if key == 'appName':
            passed = passed and len(text) >= 2 and '2nd-Brain' in text
        if key == 'keywords':
            words = text.split(',')
            passed = passed and all(len(w) >= 3 and w == w.strip() for w in words)
            passed = passed and len(set(w.casefold() for w in words)) == len(words)
        if not passed:
            errors.append(f'{locale}.{key}: field format or length needs review.')
        checks.append({'locale': locale, 'field': key, 'count': count, 'limit': limit, 'unit': unit, 'passed': passed})
    captions = values.get('screenshotCaptions', [])
    if not isinstance(captions, list) or len(captions) != 6:
        errors.append(f'{locale}: expected six screenshot captions.')
        continue
    for i, caption in enumerate(captions):
        route = caption.get('route', '')
        name = 'index' if route == '/' else route.lstrip('/')
        candidates = [ROOT / 'src/app' / f'{name}.tsx', ROOT / 'src/app' / name / 'index.tsx']
        if not route.startswith('/') or not any(p.is_file() for p in candidates) or not caption.get('text', '').strip():
            errors.append(f'{locale}.screenshotCaptions[{i}]: missing text or route file.')
for source in manifest.get('files', []):
    snapshot = HERE / source['snapshot']
    if not snapshot.is_file() or hashlib.sha256(snapshot.read_bytes()).hexdigest() != source['sha256']:
        errors.append('Historical snapshot differs: ' + source['snapshot'])
stamp = datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%d %H:%M:%S KST')
result = {'checkedAtKst': stamp, 'status': 'FAIL' if errors else 'PASS', 'draftSha256': hashlib.sha256(draft_path.read_bytes()).hexdigest(), 'fields': checks, 'snapshotCount': len(manifest.get('files', [])), 'errors': errors, 'scope': 'Field structure, lengths, screenshot route existence and historical snapshot hashes. Not store approval, runtime QA or semantic review.'}
if errors:
    (HERE / 'validation.json').write_bytes((json.dumps(result, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
    raise SystemExit('\n'.join(errors))

E = html.escape
parts = []
for locale, label in locale_labels.items():
    values = data['locales'][locale]
    cards = []
    for key, (title, limit, unit) in fields.items():
        text = values[key]
        count = len(text.encode('utf-8')) if unit == 'utf8-bytes' else len(text)
        field_id = f'{locale}-{key}'
        rows = 10 if key == 'description' else 3 if key in {'promotionalText', 'releaseNotes'} else 2
        cards.append(f'<article><h3>{E(title)}</h3><p class="meta">{count} / {limit} {"바이트" if unit == "utf8-bytes" else "자"}</p><label class="sr-only" for="{field_id}">{E(label + " " + title)}</label><textarea id="{field_id}" lang="{locale}" rows="{rows}" readonly>{E(text)}</textarea><button type="button" data-copy="{field_id}">문구 복사</button></article>')
    caption_text = '\n'.join(f'{i + 1}. {c["text"]} ({c["route"]})' for i, c in enumerate(values['screenshotCaptions']))
    cards.append(f'<article><h3>새 스크린샷 촬영용 문구</h3><p>이미지는 아직 교체하지 않았습니다. 같은 화면 경로라도 질문 상태와 저장 상태를 나눠 촬영합니다.</p><textarea id="{locale}-captions" lang="{locale}" aria-label="{E(label)} 스크린샷 문구" rows="8" readonly>{E(caption_text)}</textarea><button type="button" data-copy="{locale}-captions">촬영용 문구 복사</button></article>')
    parts.append(f'<details data-locale="{locale}" {"open" if locale == "ko" else ""}><summary><span lang="{locale}">{E(label)}</span> · 등록용 초안</summary>{"".join(cards)}</details>')
readme = (HERE / 'README.md').read_text(encoding='utf-8')
resume = re.search(r'```text\n([\s\S]*?)\n```', readme).group(1)
caption_count = sum(len(values['screenshotCaptions']) for values in data['locales'].values())
content = f'''<main id="main"><p class="eyebrow">2nd-Brain · 다음 스토어 등록에 쓸 문구</p><h1>다섯 언어의 설명문 초안입니다.</h1><p class="lead">한국어·영어·스페인어·포르투갈어·인도네시아어 소개문, 홍보 문구, 키워드와 촬영용 문구를 모았습니다. 스토어 콘솔에는 아직 반영하지 않았습니다. 일부 기능과 안내가 영어로 표시되는 점도 새 초안에 적었습니다.</p><p class="meta">{stamp}</p>
<div class="cards"><section><strong>{len(locale_labels)}개 언어</strong><p>Google Play · App Store</p></section><section><strong>{len(checks)}개 필드 통과</strong><p>길이·형식 검사 / 캡션 {caption_count}개</p></section><section><strong>스토어 반영 전</strong><p>출시 빌드·콘솔 대조 필요</p></section></div>
<svg viewBox="0 0 800 92" role="img" aria-labelledby="flow-title"><title id="flow-title">문구 준비 완료. 빌드 대조, 콘솔 반영, 제출과 공개는 다음 단계입니다.</title><g fill="none" stroke="currentColor"><rect x="2" y="10" width="174" height="60" rx="7"/><path d="M177 40h29m-7-5 7 5-7 5"/><rect x="209" y="10" width="174" height="60" rx="7"/><path d="M384 40h29m-7-5 7 5-7 5"/><rect x="416" y="10" width="174" height="60" rx="7"/><path d="M591 40h29m-7-5 7 5-7 5"/><rect x="623" y="10" width="174" height="60" rx="7"/></g><g fill="currentColor" text-anchor="middle" font-size="19"><text x="89" y="48">문구 준비 완료</text><text x="296" y="48">출시 빌드 대조</text><text x="503" y="48">콘솔 반영</text><text x="710" y="48">제출 · 공개</text></g></svg>
<section><h2>사용하기 전에</h2><ul><li>문구를 고칠 때는 <a href="drafts.json">drafts.json</a>을 수정하고 README의 재생성 명령을 실행합니다.</li><li>요금제·개인정보 설명·지원 URL·제출 버전을 실제 콘솔과 빌드에서 확인합니다.</li><li>출시 노트는 이 문구 변경이 포함된 업데이트에만 사용합니다. Apple 최초 버전에는 업데이트 설명 필드가 없습니다.</li><li>예전 원본은 비교 자료입니다. <a href="source-manifest.json">원본 기록</a>과 <a href="README.md">후속 작업 안내</a>를 함께 봐 주세요.</li></ul></section>
{''.join(parts)}
<details><summary>다음 세션에 전달할 지시</summary><textarea id="resume" aria-label="다음 세션 지시" rows="8" readonly>{E(resume)}</textarea><button type="button" data-copy="resume">지시 복사</button></details>
<section><h2>확인한 기준</h2><p>필드 길이는 <a href="https://support.google.com/googleplay/android-developer/answer/9859152?hl=en">Google 등록 도움말</a>, <a href="https://support.google.com/googleplay/android-developer/answer/9859348?hl=en">Google 출시 노트</a>, <a href="https://developer.apple.com/help/app-store-connect/reference/app-information/app-information">Apple 앱 정보</a>, <a href="https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information">Apple 버전 정보</a>를 참고했습니다. 확인일은 2026-09-06이며 실제 제출 전에 다시 확인합니다.</p><p>App Store 키워드는 UTF-8 기준 100바이트 안으로 검사했습니다. 이번 검사는 문구 길이와 형식에 관한 것이며 스토어 심사 결과를 보장하지 않습니다.</p></section><p id="copy-status" role="status" aria-live="polite"></p></main>'''
font_path = ROOT / 'assets/fonts/Pretendard-Regular.otf'
font_data, font_format = font_path.read_bytes(), 'opentype'
try:
    from fontTools import subset
    from fontTools.ttLib import TTFont
    font = TTFont(font_path)
    options = subset.Options()
    sub = subset.Subsetter(options=options)
    sub.populate(text=re.sub('<[^>]+>', '', content) + '문구를 복사했습니다직접 선택해서복사해주세요')
    sub.subset(font)
    font.flavor = 'woff2'
    stream = io.BytesIO()
    font.save(stream)
    font_data, font_format = stream.getvalue(), 'woff2'
except ImportError:
    pass
font_css = f'@font-face{{font-family:ReportPretendard;src:url(data:font/{font_format};base64,{base64.b64encode(font_data).decode("ascii")}) format("{font_format}");font-display:swap}}'
css = '''
:root{--bg:#f6f8f8;--surface:#fff;--text:#192b30;--muted:#52666b;--accent:#096c69;--line:#d1dedd;color-scheme:light dark}@media(prefers-color-scheme:dark){:root{--bg:#101b1f;--surface:#16262c;--text:#e8f2f4;--muted:#b2c4c8;--accent:#88d9ce;--line:#3c535b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.7 ReportPretendard,system-ui,sans-serif}main{max-width:1020px;padding:36px 22px 60px;margin:auto}h1{font-size:clamp(28px,4vw,42px);line-height:1.3}h2,summary{font-size:21px}h3{font-size:17px;margin:0}.lead{font-size:18px}.meta{color:var(--muted);font-size:13px}.eyebrow,a{color:var(--accent)}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.cards strong{font-size:23px}section,details{padding:20px;background:var(--surface);border:1px solid var(--line);border-radius:10px;margin:18px 0}article{margin:24px 0 4px;padding-top:20px;border-top:1px solid var(--line)}summary{cursor:pointer;font-weight:700}textarea{width:100%;display:block;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:5px;padding:12px;font:inherit;resize:vertical;line-height:1.7}button{margin-top:10px;padding:8px 14px;border:1px solid var(--accent);color:var(--accent);background:var(--surface);border-radius:5px;font:inherit;cursor:pointer}button:focus-visible,summary:focus-visible,a:focus-visible,textarea:focus-visible{outline:3px solid var(--accent);outline-offset:3px}svg{width:100%;height:auto;color:var(--accent)}li{margin:8px 0}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}@media(max-width:600px){main{padding:24px 14px}.cards{grid-template-columns:1fr;gap:0}.cards section{margin:6px 0}section,details{padding:16px}.lead{font-size:16px}}'''
js = '''document.addEventListener('click',async e=>{const b=e.target.closest('button[data-copy]');if(!b)return;const t=document.getElementById(b.dataset.copy);let ok=false;try{await navigator.clipboard.writeText(t.value);ok=true}catch{t.focus();t.select();try{ok=document.execCommand('copy')}catch{}}document.getElementById('copy-status').textContent=ok?'문구를 복사했습니다.':'문구를 선택했습니다. 직접 복사해 주세요.';});'''
document = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>2nd-Brain 스토어 문구 초안</title><style>' + font_css + css + '</style></head><body>' + content + '<script>' + js + '</script></body></html>'
(HERE / 'review.html').write_bytes(document.encode('utf-8'))
result['reportSha256'] = hashlib.sha256(document.encode('utf-8')).hexdigest()
(HERE / 'validation.json').write_bytes((json.dumps(result, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
print(json.dumps({'status': result['status'], 'fields': len(checks), 'captions': caption_count, 'snapshots': result['snapshotCount'], 'report': str(HERE / 'review.html')}, ensure_ascii=True))
