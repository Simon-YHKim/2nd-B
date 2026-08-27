// `baseUrl: "/2nd-B"` 인 정적 내보내기를 그 하위 경로에서 서빙한다.
//
// ⚠ `npx serve -s <dist>` 로는 안 된다. 그러면 `/2nd-B/_expo/...js` 요청이
//   **index.html 로 폴백**되고 브라우저는 `SyntaxError: Unexpected token '<'` 를
//   9번 뱉으며 로딩 화면에 멈춘다. 화면은 안 죽고 그냥 안 뜬다 — 조용한 고장이다.
//
// 규칙은 두 줄이다:
//   1) 파일이 있으면 그 파일.
//   2) 없으면 **`/2nd-B/index.html`** (루트 index.html 이 아니다).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const DIST = process.argv[2];
const PORT = Number(process.argv[3] || 9017);
const BASE = '/2nd-B';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
};

async function tryFile(p) {
  try {
    const s = await stat(p);
    if (s.isFile()) return p;
    if (s.isDirectory()) {
      const idx = join(p, 'index.html');
      const si = await stat(idx);
      if (si.isFile()) return idx;
    }
  } catch {}
  return null;
}

createServer(async (req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  // `/2nd-B` 접두사를 벗긴다. 없으면 그대로(루트 접근도 받아준다).
  let rel = url.startsWith(BASE) ? url.slice(BASE.length) : url;
  if (!rel.startsWith('/')) rel = '/' + rel;
  // `..` 로 위로 올라가지 못하게.
  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, '');

  let file = await tryFile(join(DIST, safe));
  // 확장자 없는 경로(라우트)는 `.html` 도 시도한다 — expo export 가 라우트별 html 을 낸다.
  if (!file && !extname(safe)) file = await tryFile(join(DIST, safe + '.html'));
  // 그래도 없으면 SPA 폴백. ⚠ 루트가 아니라 **dist 의** index.html 이다.
  if (!file) file = await tryFile(join(DIST, 'index.html'));

  if (!file) { res.writeHead(404); res.end('not found'); return; }
  // Work 0 attestation rejects a proof served without its file mtime.
  const metadata = await stat(file);
  const body = await readFile(file);
  res.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': TYPES[extname(file)] || 'application/octet-stream',
    'last-modified': metadata.mtime.toUTCString(),
  });
  res.end(body);
}).listen(PORT, () => console.log('serving ' + DIST + ' at http://localhost:' + PORT + BASE + '/'));
