/* ============================================================
   px-avatar64.js — 64×64 픽셀 아바타 (전체 자산)
   16×16 확장팩(pxc-ext-*.js)의 전량을 4배 그리드로 이전한 판.
   헤어 24 · 액세서리 20 · 얼굴 14 · 표정 10 · 동물 26 · 직업 44
   규칙: 정수좌표 rect only · 곡선 0 · 안티에일리어싱 0
   API 는 PXC_EXT 와 호환 — window.PXAvatar64
   ============================================================ */
(function (root) {
  'use strict';
  var K = '#241c18', W = '#f7f2e8';

  function h2(n) { return n.toString(16).padStart(2, '0'); }
  function parse(h) {
    if (typeof h !== 'string' || h.charAt(0) !== '#') return [128, 128, 128];
    var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function toHex(a) { return '#' + a.map(function (v) { return h2(Math.max(0, Math.min(255, Math.round(v)))); }).join(''); }
  function shade(h, t) { var c = parse(h); var f = function (v) { return t < 0 ? v * (1 + t) : v + (255 - v) * t; }; return toHex([f(c[0]), f(c[1]), f(c[2])]); }
  function mix(a, b, t) { var x = parse(a), y = parse(b); return toHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }
  function lum(h) { var c = parse(h); return (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000; }
  function ink(h) { return lum(h) > 150 ? shade(h, -0.62) : shade(h, -0.3); }

  var SKIN = ['#f7dcc0', '#f2c9a0', '#e0aa78', '#d99e7a', '#c98e5e', '#a86f43', '#7d4f2e', '#5a3820', '#8f6a4a', '#eab98f'];
  var HAIRC = ['#2b211b', '#5a3820', '#8f4f1a', '#c97a2e', '#e8c33a', '#b53a2a', '#4d5a8c', '#7d9463', '#a8917d', '#d97757', '#5c4a3f', '#f0dced', '#3f8fbf', '#8f6fb5', '#e278a1', '#f2e9d8'];
  var EYEC = ['#3a2a1e', '#5c4a3f', '#2f5fc0', '#2e7d6e', '#6d3f6b', '#4d7a8c', '#8f4f1a', '#46b6ff'];
  var CLOTH = ['#d97757', '#4d7a8c', '#7d9463', '#e0a63c', '#bf4a44', '#8f6fb5', '#3f8fbf', '#c9a877', '#5c8a3c', '#e278a1', '#2f5fc0', '#6b4a2f', '#2f3b5c', '#a8917d', '#4a4a52', '#f2e9d8'];
  var FUR = ['#e8a860', '#c97a2e', '#8f4f1a', '#5c4a3f', '#a8917d', '#f2e9d8', '#2b211b', '#b0b9cc', '#d9c9a8', '#7d9463', '#cbb8d6', '#e0a63c'];

  function hash32(s) { var h = 2166136261 >>> 0; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function rngOf(seed) { var a = hash32(String(seed)) || 1; return function () { a ^= a << 13; a >>>= 0; a ^= a >> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; }; }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }

  /* ══ 머리통 · 몸통 ═══════════════════════════════════════════════ */
  function headBase(s) {
    var sd = shade(s, -0.17), hl = shade(s, 0.15), o = [];
    var R = function (x, y, w, h, c) { o.push([x, y, w, h, c]); };
    R(24, 10, 16, 2, s); R(22, 12, 20, 2, s); R(20, 14, 24, 2, s);
    R(18, 16, 28, 18, s);
    R(20, 34, 24, 2, s); R(22, 36, 20, 2, s); R(26, 38, 12, 2, s);
    R(16, 23, 2, 7, s); R(46, 23, 2, 7, s);
    R(16, 25, 1, 3, sd); R(47, 25, 1, 3, sd);
    R(40, 16, 6, 18, sd); R(38, 32, 8, 2, sd); R(36, 34, 8, 2, sd); R(24, 36, 14, 2, sd);
    R(22, 16, 10, 4, hl); R(20, 20, 4, 6, hl);
    return o;
  }
  function torso(s, c) {
    var cd = shade(c, -0.2), cl = shade(c, 0.14), o = [];
    var R = function (x, y, w, h, cc) { o.push([x, y, w, h, cc]); };
    R(27, 38, 10, 6, shade(s, -0.24)); R(27, 38, 10, 2, shade(s, -0.36));
    R(20, 44, 24, 2, c); R(16, 46, 32, 4, c); R(14, 50, 36, 14, c);
    R(38, 46, 10, 18, cd); R(44, 50, 4, 14, shade(c, -0.32)); R(14, 50, 4, 14, cl);
    R(26, 44, 12, 2, cd);
    return o;
  }

  /* ══ 표정 10종 — 눈썹·눈·입 조합으로 기술 ════════════════════════ */
  var EXPR = [
    { id: 'neutral', ko: '무표정', en: 'Neutral', brow: 'flat', eye: 'open', mouth: 'line' },
    { id: 'smile', ko: '미소', en: 'Smile', brow: 'up', eye: 'squint', mouth: 'smile' },
    { id: 'grin', ko: '활짝', en: 'Grin', brow: 'up', eye: 'squint', mouth: 'grin' },
    { id: 'sad', ko: '슬픔', en: 'Sad', brow: 'sad', eye: 'half', mouth: 'frown' },
    { id: 'angry', ko: '화남', en: 'Angry', brow: 'angry', eye: 'open', mouth: 'frown' },
    { id: 'surprise', ko: '놀람', en: 'Surprise', brow: 'up', eye: 'wide', mouth: 'open' },
    { id: 'wink', ko: '윙크', en: 'Wink', brow: 'up', eye: 'wink', mouth: 'smirk' },
    { id: 'sleepy', ko: '졸림', en: 'Sleepy', brow: 'flat', eye: 'closed', mouth: 'line' },
    { id: 'cry', ko: '울음', en: 'Cry', brow: 'sad', eye: 'closed', mouth: 'open', tear: true },
    { id: 'smirk', ko: '씩', en: 'Smirk', brow: 'angry', eye: 'half', mouth: 'smirk' }
  ];
  var EXPR_BY_ID = {}; EXPR.forEach(function (e) { EXPR_BY_ID[e.id] = e; });

  function eyePair(o, mode, eye, s) {
    var R = function (x, y, w, h, c) { o.push([x, y, w, h, c]); };
    function one(x, m) {
      if (m === 'closed') { R(x, 26, 7, 1, K); R(x + 1, 27, 5, 1, shade(s, -0.35)); return; }
      var eh = m === 'wide' ? 7 : m === 'squint' ? 3 : m === 'half' ? 3 : 5;
      var y = m === 'wide' ? 23 : m === 'squint' ? 26 : m === 'half' ? 25 : 24;
      R(x, y - 1, 7, 1, K);
      R(x, y, 7, eh, W);
      var ih = Math.max(1, eh - 2);
      R(x + 2, y + 1, 3, ih, eye);
      R(x + 3, y + 1, 1, 1, K);
      R(x + 2, y + 1, 1, 1, W);
      if (m === 'half') R(x, y, 7, 1, shade(s, -0.3));
    }
    if (mode === 'wink') { one(24, 'closed'); one(33, 'open'); }
    else { one(24, mode); one(33, mode); }
  }
  function face(s, eye, hc, exprId, noEyes) {
    var E = EXPR_BY_ID[exprId] || EXPR[0];
    var sd = shade(s, -0.3), lip = mix(s, '#a8433f', 0.5), o = [];
    var R = function (x, y, w, h, c) { o.push([x, y, w, h, c]); };
    var hd = shade(hc, -0.28); if (lum(hd) > 160) hd = shade(hc, -0.6);
    if (noEyes) { R(31, 28, 2, 3, sd); R(30, 30, 1, 1, sd); return o; }
    if (E.brow === 'sad') { R(24, 20, 7, 2, hd); R(33, 21, 7, 2, hd); }
    else if (E.brow === 'angry') { R(24, 21, 7, 2, hd); R(33, 21, 7, 2, hd); R(26, 20, 4, 1, hd); R(34, 20, 4, 1, hd); }
    else if (E.brow === 'up') { R(24, 19, 7, 2, hd); R(33, 19, 7, 2, hd); }
    else { R(24, 20, 7, 2, hd); R(33, 20, 7, 2, hd); }
    eyePair(o, E.eye, eye, s);
    R(31, 28, 2, 3, sd); R(30, 30, 1, 1, sd);
    if (E.mouth === 'smile') { R(28, 34, 8, 2, lip); R(27, 33, 1, 1, lip); R(36, 33, 1, 1, lip); R(29, 36, 6, 1, shade(lip, -0.25)); }
    else if (E.mouth === 'grin') { R(27, 33, 10, 5, shade(lip, -0.45)); R(28, 34, 8, 2, W); R(26, 32, 1, 1, lip); R(37, 32, 1, 1, lip); }
    else if (E.mouth === 'frown') { R(28, 35, 8, 2, lip); R(27, 36, 1, 1, lip); R(36, 36, 1, 1, lip); }
    else if (E.mouth === 'open') { R(29, 33, 6, 5, shade(lip, -0.4)); R(30, 36, 4, 2, lip); }
    else if (E.mouth === 'smirk') { R(28, 35, 6, 2, lip); R(34, 33, 2, 2, lip); }
    else { R(29, 34, 6, 2, lip); }
    if (E.tear) { R(25, 30, 2, 5, '#7fc9f2'); R(38, 30, 2, 4, '#7fc9f2'); R(25, 35, 2, 2, '#a8dcf7'); }
    var bl = mix(s, '#e0709b', 0.32);
    R(21, 30, 4, 3, bl); R(39, 30, 4, 3, bl);
    return o;
  }

  /* ══ 헤어 24종 ═══════════════════════════════════════════════════ */
  function cap(c) {
    var hl = shade(c, 0.24);
    return [[24, 8, 16, 2, c], [22, 10, 20, 2, c], [20, 12, 24, 2, c], [18, 14, 28, 4, c],
      [24, 8, 8, 2, hl], [22, 10, 6, 2, hl], [20, 12, 5, 2, hl]];
  }
  function HA(id, ko, en, f) { return { id: id, ko: ko, en: en, f: f }; }
  var HAIR = [
    HA('short', '숏컷', 'Short', function (c) { return cap(c).concat([[18, 18, 3, 7, c], [43, 18, 3, 7, c], [18, 18, 3, 3, shade(c, 0.15)]]); }),
    HA('long', '롱', 'Long', function (c) { return cap(c).concat([[17, 18, 4, 26, c], [43, 18, 4, 26, c], [16, 30, 2, 12, c], [48, 30, 2, 12, c], [17, 40, 4, 4, shade(c, -0.25)], [43, 40, 4, 4, shade(c, -0.25)]]); }),
    HA('bob', '단발', 'Bob', function (c) { return cap(c).concat([[17, 18, 4, 15, c], [43, 18, 4, 15, c], [17, 31, 4, 2, shade(c, -0.22)], [43, 31, 4, 2, shade(c, -0.22)]]); }),
    HA('bun', '번', 'Bun', function (c) { return cap(c).concat([[27, 2, 10, 7, c], [29, 1, 6, 2, shade(c, 0.24)], [18, 18, 3, 5, c], [43, 18, 3, 5, c]]); }),
    HA('spike', '스파이크', 'Spiky', function (c) { var hl = shade(c, 0.22); return [[20, 14, 24, 4, c], [22, 12, 20, 2, c], [21, 6, 4, 8, c], [27, 3, 4, 11, c], [33, 4, 4, 10, c], [39, 7, 4, 7, c], [21, 6, 4, 3, hl], [27, 3, 4, 3, hl], [33, 4, 4, 3, hl]]; }),
    HA('buzz', '버즈컷', 'Buzz', function (c) { var d = shade(c, -0.15); return [[24, 11, 16, 2, d], [22, 13, 20, 2, d], [20, 15, 24, 2, d], [24, 11, 7, 2, shade(c, 0.18)]]; }),
    HA('wavy', '웨이브', 'Wavy', function (c) { var d = shade(c, -0.2); return cap(c).concat([[17, 18, 4, 6, c], [19, 24, 3, 5, c], [17, 29, 4, 5, d], [43, 18, 4, 6, c], [42, 24, 3, 5, c], [43, 29, 4, 5, d]]); }),
    HA('curly', '곱슬', 'Curly', function (c) { var hl = shade(c, 0.2); return [[20, 6, 24, 4, c], [17, 9, 30, 7, c], [15, 14, 5, 8, c], [44, 14, 5, 8, c],
      [21, 4, 6, 4, c], [30, 3, 7, 4, c], [38, 5, 6, 4, c], [21, 5, 5, 3, hl], [30, 4, 5, 3, hl], [17, 10, 6, 4, hl]]; }),
    HA('ponytail', '포니테일', 'Ponytail', function (c) { return cap(c).concat([[18, 18, 3, 6, c], [43, 18, 3, 6, c], [46, 20, 6, 5, c], [47, 25, 6, 12, c], [48, 37, 4, 6, shade(c, -0.22)], [44, 19, 4, 4, '#bf4a44']]); }),
    HA('twintail', '트윈테일', 'Twin tails', function (c) { return cap(c).concat([[13, 21, 5, 4, c], [12, 25, 5, 13, c], [46, 21, 5, 4, c], [47, 25, 5, 13, c], [12, 36, 5, 3, shade(c, -0.22)], [47, 36, 5, 3, shade(c, -0.22)], [17, 19, 4, 3, '#e278a1'], [43, 19, 4, 3, '#e278a1']]); }),
    HA('mohawk', '모히칸', 'Mohawk', function (c) { var hl = shade(c, 0.22), d = shade(c, -0.35); return [[28, 1, 8, 16, c], [30, 0, 4, 2, c], [28, 1, 4, 8, hl], [20, 14, 8, 3, d], [36, 14, 8, 3, d]]; }),
    HA('afro', '아프로', 'Afro', function (c) { var hl = shade(c, 0.2), d = shade(c, -0.2); return [[20, 0, 24, 3, c], [16, 2, 32, 4, c], [12, 5, 40, 8, c], [10, 9, 44, 8, c], [12, 16, 8, 8, c], [44, 16, 8, 8, c],
      [20, 1, 12, 3, hl], [16, 4, 8, 4, hl], [12, 8, 6, 5, hl], [44, 12, 8, 6, d], [12, 21, 8, 3, d]]; }),
    HA('sidepart', '사이드파트', 'Side part', function (c) { var hl = shade(c, 0.24), d = shade(c, -0.2); return [[24, 8, 16, 2, c], [22, 10, 20, 2, c], [20, 12, 24, 2, c], [18, 14, 28, 4, c],
      [18, 18, 12, 3, c], [18, 18, 3, 6, c], [43, 18, 3, 5, d], [24, 9, 6, 3, hl], [33, 12, 1, 6, d]]; }),
    HA('fringe', '뱅', 'Fringe', function (c) { var hl = shade(c, 0.2); return cap(c).concat([[18, 18, 28, 4, c], [18, 22, 5, 4, c], [41, 22, 5, 4, c], [22, 18, 8, 3, hl]]); }),
    HA('braid', '땋은머리', 'Braid', function (c) { var d = shade(c, -0.25); return cap(c).concat([[18, 18, 3, 5, c], [43, 18, 3, 5, c],
      [45, 22, 5, 4, c], [45, 26, 5, 4, d], [45, 30, 5, 4, c], [45, 34, 5, 4, d], [46, 38, 3, 3, c]]); }),
    HA('undercut', '언더컷', 'Undercut', function (c) { return [[22, 10, 20, 2, c], [20, 12, 24, 2, c], [18, 14, 28, 3, c], [18, 17, 11, 2, c], [22, 10, 7, 2, shade(c, 0.22)], [18, 19, 3, 3, shade(c, -0.2)], [43, 17, 3, 4, shade(c, -0.2)]]; }),
    HA('topknot', '상투', 'Top knot', function (c) { return cap(c).concat([[29, 1, 6, 5, c], [28, 5, 8, 3, shade(c, -0.2)], [30, 1, 3, 2, shade(c, 0.24)], [18, 18, 3, 4, c], [43, 18, 3, 4, c]]); }),
    HA('dreads', '드레드', 'Dreads', function (c) { var d = shade(c, -0.24); return cap(c).concat([[17, 18, 4, 22, c], [22, 18, 3, 16, d], [39, 18, 3, 16, d], [43, 18, 4, 22, c],
      [17, 26, 4, 3, d], [43, 26, 4, 3, d], [17, 34, 4, 3, d], [43, 34, 4, 3, d]]); }),
    HA('pixie', '픽시', 'Pixie', function (c) { var hl = shade(c, 0.22); return [[24, 8, 16, 2, c], [22, 10, 20, 2, c], [20, 12, 24, 3, c], [18, 15, 28, 3, c],
      [17, 18, 4, 6, c], [43, 18, 4, 6, c], [40, 10, 6, 3, c], [24, 9, 7, 2, hl]]; }),
    HA('hime', '히메컷', 'Hime', function (c) { var d = shade(c, -0.22); return cap(c).concat([[18, 18, 28, 4, c], [16, 18, 5, 14, c], [43, 18, 5, 14, c],
      [16, 30, 5, 2, d], [43, 30, 5, 2, d], [19, 32, 3, 12, c], [42, 32, 3, 12, c]]); }),
    HA('wavelong', '롱웨이브', 'Long wave', function (c) { var d = shade(c, -0.2); return cap(c).concat([[17, 18, 4, 10, c], [15, 28, 4, 8, c], [17, 36, 4, 8, d], [43, 18, 4, 10, c], [45, 28, 4, 8, c], [43, 36, 4, 8, d]]); }),
    HA('halfup', '하프업', 'Half up', function (c) { return cap(c).concat([[27, 3, 10, 6, c], [29, 2, 6, 2, shade(c, 0.24)], [17, 18, 4, 16, c], [43, 18, 4, 16, c], [17, 32, 4, 2, shade(c, -0.22)], [43, 32, 4, 2, shade(c, -0.22)]]); }),
    HA('messy', '덥수룩', 'Messy', function (c) { var hl = shade(c, 0.2), d = shade(c, -0.2); return cap(c).concat([[16, 12, 4, 8, c], [44, 12, 4, 8, c],
      [21, 5, 5, 5, c], [30, 4, 4, 6, c], [37, 6, 5, 4, c], [18, 18, 4, 6, d], [42, 18, 4, 6, d], [21, 6, 4, 3, hl]]); }),
    HA('bald', '민머리', 'Bald', function () { return []; })
  ];

  /* ══ 액세서리 20종 ═══════════════════════════════════════════════ */
  function AC(id, ko, en, f) { return { id: id, ko: ko, en: en, f: f }; }
  var ACC = [
    AC('none', '없음', 'None', function () { return []; }),
    AC('headband', '머리띠', 'Headband', function (p) { return [[17, 15, 30, 4, p.cloth], [17, 15, 30, 1, shade(p.cloth, 0.25)]]; }),
    AC('beanie', '비니', 'Beanie', function (p) { return [[18, 4, 28, 12, p.cloth], [22, 1, 20, 4, p.cloth], [16, 13, 32, 5, shade(p.cloth, -0.2)], [29, 0, 6, 3, shade(p.cloth, 0.2)]]; }),
    AC('capback', '캡(뒤로)', 'Cap', function (p) { return [[19, 6, 26, 9, p.cloth], [17, 13, 30, 3, shade(p.cloth, -0.2)], [45, 13, 8, 4, p.cloth], [19, 6, 12, 3, shade(p.cloth, 0.2)]]; }),
    AC('flowerpin', '꽃핀', 'Flower pin', function () { return [[41, 10, 4, 4, '#e278a1'], [39, 12, 4, 4, '#e278a1'], [43, 12, 4, 4, '#e278a1'], [41, 14, 4, 4, '#e278a1'], [41, 12, 4, 4, '#e0a63c']]; }),
    AC('headphone', '헤드폰', 'Headphones', function () { return [[22, 4, 20, 3, '#2f3b5c'], [19, 6, 4, 4, '#2f3b5c'], [41, 6, 4, 4, '#2f3b5c'], [13, 20, 7, 12, '#3a3f4a'], [44, 20, 7, 12, '#3a3f4a'], [15, 22, 3, 8, '#5a6070'], [46, 22, 3, 8, '#5a6070']]; }),
    AC('bandana', '반다나', 'Bandana', function (p) { return [[17, 12, 30, 6, p.cloth], [15, 16, 6, 10, p.cloth], [15, 24, 6, 3, shade(p.cloth, -0.25)], [20, 13, 8, 2, shade(p.cloth, 0.2)]]; }),
    AC('hairclip', '헤어핀', 'Hair clip', function () { return [[38, 12, 9, 3, '#e0a63c'], [38, 12, 3, 3, '#f2c04a']]; }),
    AC('halo', '헤일로', 'Halo', function () { return [[22, 0, 20, 3, '#f2c04a'], [19, 1, 3, 3, '#e0a63c'], [42, 1, 3, 3, '#e0a63c'], [24, 0, 8, 2, '#fff0b8']]; }),
    AC('catears', '고양이 귀', 'Cat ears', function (p) { return earTri(18, 10, p.hairColor, '#e0709b').concat(earTri(36, 10, p.hairColor, '#e0709b')); }),
    AC('crownsm', '작은 왕관', 'Small crown', function () { return [[20, 8, 24, 4, '#e0a63c'], [20, 3, 4, 6, '#e0a63c'], [30, 1, 4, 8, '#e0a63c'], [40, 3, 4, 6, '#e0a63c'], [30, 4, 4, 3, '#bf4a44'], [20, 8, 10, 2, '#f2c04a']]; }),
    AC('earrings', '귀걸이', 'Earrings', function () { return [[15, 30, 3, 3, '#e0a63c'], [46, 30, 3, 3, '#e0a63c'], [16, 33, 1, 3, '#f2c04a'], [47, 33, 1, 3, '#f2c04a']]; }),
    AC('scarf', '목도리', 'Scarf', function (p) { var c = p.cloth2 || '#bf4a44'; return [[22, 41, 20, 6, c], [20, 44, 24, 4, shade(c, -0.2)], [38, 47, 7, 14, c], [38, 58, 7, 3, shade(c, -0.3)], [24, 42, 8, 2, shade(c, 0.2)]]; }),
    AC('bowtie', '나비넥타이', 'Bow tie', function () { return [[22, 45, 8, 7, '#bf4a44'], [34, 45, 8, 7, '#bf4a44'], [30, 46, 4, 5, '#8f2f2a'], [23, 46, 3, 3, '#d9605a']]; }),
    AC('hoodup', '후드', 'Hood up', function (p) { var c = p.cloth; return [[14, 8, 36, 12, shade(c, -0.15)], [12, 16, 8, 30, shade(c, -0.3)], [44, 16, 8, 30, shade(c, -0.3)], [18, 6, 28, 4, c], [14, 8, 12, 4, shade(c, 0.15)]]; }),
    AC('antenna', '안테나', 'Antenna', function () { return [[31, 0, 2, 9, '#b0b9cc'], [28, 0, 8, 4, '#46b6ff'], [29, 1, 3, 2, '#ccfaff']]; }),
    AC('horns', '뿔', 'Horns', function () { return [[17, 4, 5, 10, '#c9a877'], [15, 0, 4, 6, '#d9bd8f'], [42, 4, 5, 10, '#c9a877'], [45, 0, 4, 6, '#d9bd8f'], [17, 4, 2, 5, '#e0d0a8']]; }),
    AC('visor', '바이저', 'Visor', function () { return [[16, 20, 32, 9, '#2f3b5c'], [18, 22, 28, 5, '#46b6ff'], [19, 23, 10, 2, '#ccfaff'], [16, 20, 32, 2, '#5a6788']]; }),
    AC('facemask', '마스크', 'Mask', function () { return [[22, 30, 20, 12, '#e8f2f7'], [22, 30, 20, 2, '#c9d6de'], [18, 26, 5, 6, '#c9d6de'], [41, 26, 5, 6, '#c9d6de'], [24, 34, 16, 1, '#d4e0e8']]; }),
    AC('freckleset', '헤어밴드+핀', 'Band + pin', function (p) { return [[17, 15, 30, 3, p.cloth], [38, 11, 8, 3, '#e0a63c'], [21, 30, 4, 2, mix(p.skin, '#a8433f', 0.3)], [39, 30, 4, 2, mix(p.skin, '#a8433f', 0.3)]]; })
  ];

  /* ══ 얼굴 디테일 14종 ════════════════════════════════════════════ */
  function glassesFrame(c, round) {
    if (round) return [[22, 22, 10, 1, c], [22, 29, 10, 1, c], [22, 23, 1, 6, c], [31, 23, 1, 6, c],
      [23, 21, 8, 1, c], [23, 30, 8, 1, c], [32, 22, 10, 1, c], [32, 29, 10, 1, c], [32, 23, 1, 6, c], [41, 23, 1, 6, c],
      [33, 21, 8, 1, c], [33, 30, 8, 1, c], [30, 25, 3, 1, c], [16, 24, 6, 1, c], [42, 24, 6, 1, c]];
    return [[21, 22, 12, 1, c], [21, 29, 12, 1, c], [21, 23, 1, 6, c], [32, 23, 1, 6, c],
      [32, 22, 12, 1, c], [32, 29, 12, 1, c], [43, 23, 1, 6, c], [30, 25, 3, 1, c], [16, 24, 5, 1, c], [44, 24, 5, 1, c]];
  }
  function FC(id, ko, en, f) { return { id: id, ko: ko, en: en, f: f }; }
  var FACE = [
    FC('none', '없음', 'None', function () { return []; }),
    FC('glasses', '안경', 'Glasses', function () { return glassesFrame('#3a3f4a'); }),
    FC('roundglass', '동그란 안경', 'Round glasses', function () { return glassesFrame('#6b4a2f', true); }),
    FC('sunglasses', '선글라스', 'Sunglasses', function () { return [[20, 21, 24, 9, '#241c18'], [21, 22, 10, 7, '#3f4a5c'], [33, 22, 10, 7, '#3f4a5c'], [22, 23, 4, 2, '#6d7a90'], [16, 23, 5, 2, '#241c18'], [44, 23, 5, 2, '#241c18']]; }),
    FC('monocle', '모노클', 'Monocle', function () { return [[32, 21, 11, 1, '#e0a63c'], [32, 30, 11, 1, '#e0a63c'], [31, 22, 1, 8, '#e0a63c'], [43, 22, 1, 8, '#e0a63c'], [43, 31, 1, 8, '#e0a63c'], [40, 38, 4, 1, '#e0a63c']]; }),
    FC('eyepatch', '안대', 'Eye patch', function () { return [[21, 21, 12, 10, '#241c18'], [16, 19, 32, 2, '#241c18'], [23, 23, 4, 3, '#3a3230']]; }),
    FC('beard', '턱수염', 'Beard', function (p) { var c = shade(p.hairColor, -0.12); return [[18, 30, 4, 10, c], [42, 30, 4, 10, c], [20, 38, 24, 8, c], [24, 44, 16, 4, c], [26, 32, 12, 2, c], [28, 40, 8, 3, shade(c, -0.2)]]; }),
    FC('mustache', '콧수염', 'Mustache', function (p) { var c = shade(p.hairColor, -0.12); return [[26, 31, 12, 3, c], [24, 32, 3, 2, c], [37, 32, 3, 2, c]]; }),
    FC('goatee', '염소수염', 'Goatee', function (p) { var c = shade(p.hairColor, -0.12); return [[27, 31, 10, 2, c], [29, 37, 6, 6, c], [30, 43, 4, 2, shade(c, -0.2)]]; }),
    FC('stubble', '무정면도', 'Stubble', function (p) { var c = mix(p.skin, shade(p.hairColor, -0.2), 0.45); return [[21, 33, 22, 6, c], [24, 39, 16, 3, c], [26, 30, 12, 2, c]]; }),
    FC('freckles', '주근깨', 'Freckles', function (p) { var c = mix(p.skin, '#a8433f', 0.42); return [[22, 30, 2, 2, c], [25, 32, 2, 2, c], [21, 33, 2, 2, c], [38, 30, 2, 2, c], [41, 32, 2, 2, c], [37, 33, 2, 2, c]]; }),
    FC('blush', '볼터치', 'Blush', function (p) { var c = mix(p.skin, '#e0709b', 0.55); return [[20, 29, 6, 5, c], [38, 29, 6, 5, c]]; }),
    FC('scar', '흉터', 'Scar', function (p) { var c = mix(p.skin, '#a8433f', 0.55); return [[37, 18, 2, 12, c], [35, 20, 2, 2, c], [39, 25, 2, 2, c]]; }),
    FC('mole', '점', 'Mole', function (p) { return [[26, 35, 2, 2, shade(p.skin, -0.55)]]; })
  ];

  /* ══ 동물 26종 ═══════════════════════════════════════════════════ */
  function earTri(x, w, c, ic) {
    var o = [], cx = x, cw = w, y = 14;
    while (cw > 1 && y > 0) { y -= 3; o.push([cx, y, cw, 3, c]); cx += 1; cw -= 2; }
    if (ic) o.push([x + 3, y + 4, Math.max(1, w - 6), 5, ic]);
    return o;
  }
  function ears(kind, f, inner) {
    var d = shade(f, -0.24), i2 = inner || d;
    if (kind === 'tri') return earTri(18, 10, f, i2).concat(earTri(36, 10, f, i2));
    if (kind === 'tri-sharp') return earTri(17, 9, f, i2).concat(earTri(38, 9, f, i2));
    if (kind === 'round') return [[17, 6, 11, 9, f], [36, 6, 11, 9, f], [20, 8, 5, 5, i2], [39, 8, 5, 5, i2]];
    if (kind === 'round-big') return [[13, 8, 14, 12, f], [37, 8, 14, 12, f], [16, 11, 8, 6, i2], [40, 11, 8, 6, i2]];
    if (kind === 'floppy') return [[13, 14, 6, 18, d], [45, 14, 6, 18, d], [13, 30, 6, 2, shade(f, -0.4)], [45, 30, 6, 2, shade(f, -0.4)]];
    if (kind === 'tall') return [[21, 0, 6, 16, f], [37, 0, 6, 16, f], [22, 2, 4, 12, i2], [38, 2, 4, 12, i2]];
    if (kind === 'side') return [[10, 18, 9, 14, f], [45, 18, 9, 14, f], [12, 21, 5, 8, i2], [47, 21, 5, 8, i2]];
    if (kind === 'tuft') return [[19, 8, 6, 7, f], [39, 8, 6, 7, f]];
    return [];
  }
  function muzzle(f, light, nose) {
    var o = [];
    o.push([25, 29, 14, 9, light]); o.push([25, 36, 14, 2, shade(light, -0.15)]);
    o.push([29, 30, 6, 4, nose]); o.push([30, 31, 2, 1, shade(nose, 0.3)]);
    o.push([31, 34, 2, 3, ink(light)]);
    o.push([28, 36, 3, 1, ink(light)]); o.push([33, 36, 3, 1, ink(light)]);
    return o;
  }
  function snout(f, c, nose) {
    return [[24, 30, 16, 9, c], [24, 30, 16, 2, shade(c, 0.15)], [27, 33, 4, 4, nose], [33, 33, 4, 4, nose]];
  }
  function beak(c) { return [[27, 28, 10, 5, c], [29, 33, 6, 3, shade(c, -0.2)], [29, 29, 3, 2, shade(c, 0.3)]]; }
  function bigEyes(o, wc, pc) {
    o.push([21, 20, 10, 11, wc]); o.push([33, 20, 10, 11, wc]);
    o.push([24, 23, 5, 5, pc]); o.push([36, 23, 5, 5, pc]);
    o.push([24, 23, 2, 2, W]); o.push([36, 23, 2, 2, W]);
  }
  function AN(id, ko, en, fur, o) { return Object.assign({ id: id, ko: ko, en: en, fur: fur }, o || {}); }
  var ANIMAL = [
    AN('cat', '고양이', 'Cat', ['#e8a860', '#5c4a3f', '#b0b9cc', '#f2e9d8'], { ear: 'tri', inner: '#e0709b',
      post: function (f) { return muzzle(f, shade(f, 0.3), '#e0709b').concat([[12, 31, 6, 1, W], [12, 34, 6, 1, W], [46, 31, 6, 1, W], [46, 34, 6, 1, W]]); } }),
    AN('cat2', '검은고양이', 'Black cat', ['#2b211b'], { ear: 'tri', inner: '#8f4f5a',
      post: function (f) { return muzzle(f, shade(f, 0.22), '#e0709b').concat([[12, 31, 6, 1, '#8f98aa'], [12, 34, 6, 1, '#8f98aa'], [46, 31, 6, 1, '#8f98aa'], [46, 34, 6, 1, '#8f98aa']]); } }),
    AN('fox', '여우', 'Fox', ['#e8a860', '#d97757', '#c97a2e'], { ear: 'tri-sharp', inner: '#241c18', earColor: '#c9552a',
      post: function (f) { var m = mix(W, f, 0.2); return [[25, 28, 14, 1, shade(f, -0.34)]].concat(muzzle(f, m, '#241c18')).concat([[18, 26, 5, 8, m], [41, 26, 5, 8, m]]); } }),
    AN('dog', '개', 'Dog', ['#c9a877', '#8f4f1a', '#d9c9a8', '#5c4a3f'], { ear: 'floppy',
      post: function (f) { return muzzle(f, shade(f, 0.26), '#241c18').concat([[24, 12, 8, 4, shade(f, -0.3)]]); } }),
    AN('wolf', '늑대', 'Wolf', ['#8f98aa', '#5a6070', '#b0b9cc'], { ear: 'tri-sharp',
      post: function (f) { return [[25, 28, 14, 1, shade(f, -0.34)]].concat(muzzle(f, mix(W, f, 0.25), '#241c18')).concat([[28, 12, 8, 5, shade(f, -0.25)]]); } }),
    AN('bear', '곰', 'Bear', ['#8f6a4a', '#6b4a2f', '#a8917d'], { ear: 'round',
      post: function (f) { return muzzle(f, shade(f, 0.22), '#241c18'); } }),
    AN('panda', '판다', 'Panda', ['#f2e9d8'], { ear: 'round', earColor: '#2b211b', ownEyes: true,
      post: function (f) { var o = [[20, 20, 11, 11, '#2b211b'], [33, 20, 11, 11, '#2b211b']];
        o.push([24, 23, 5, 5, W]); o.push([35, 23, 5, 5, W]); o.push([25, 24, 3, 3, '#241c18']); o.push([36, 24, 3, 3, '#241c18']); o.push([25, 24, 1, 1, W]); o.push([36, 24, 1, 1, W]);
        return o.concat([[25, 32, 14, 1, '#2b211b']]).concat(muzzle(f, mix(W, '#c9bfae', 0.35), '#241c18')); } }),
    AN('tiger', '호랑이', 'Tiger', ['#e0a63c', '#e8a860'], { ear: 'round', inner: '#241c18',
      post: function (f) { var s2 = '#241c18'; return [[21, 14, 3, 7, s2], [28, 12, 3, 6, s2], [35, 12, 3, 6, s2], [42, 14, 3, 7, s2], [17, 22, 3, 6, s2], [45, 22, 3, 6, s2]]
        .concat(muzzle(f, W, '#241c18')); } }),
    AN('lion', '사자', 'Lion', ['#e0a63c', '#c9a877'], { ear: 'round',
      pre: function (f) { var m = shade(f, -0.3); return [[10, 8, 44, 30, m], [8, 14, 48, 20, m], [12, 4, 40, 8, m], [14, 34, 36, 10, m], [12, 8, 12, 8, shade(f, -0.18)]]; },
      post: function (f) { return muzzle(f, shade(f, 0.28), '#241c18'); } }),
    AN('pig', '돼지', 'Pig', ['#f0b8c4', '#e8a0b0'], { ear: 'tri', inner: '#d98fa0',
      post: function (f) { return snout(f, shade(f, -0.1), '#c9758a').concat([[31, 39, 2, 2, ink(f)]]); } }),
    AN('cow', '소', 'Cow', ['#f2e9d8'], { ear: 'side', earColor: '#2b211b',
      pre: function () { return [[18, 4, 5, 7, '#d9c9a8'], [41, 4, 5, 7, '#d9c9a8']]; },
      post: function (f) { return [[19, 14, 10, 9, '#2b211b'], [38, 30, 8, 7, '#2b211b'], [24, 45, 12, 8, '#2b211b']]
        .concat(snout(f, '#f0b8c4', '#c9758a')); } }),
    AN('sheep', '양', 'Sheep', ['#f7f2e8', '#e8e2d4'], { ear: 'side', earColor: '#d9c9a8',
      pre: function (f) { var c = shade(f, 0.05); return [[16, 2, 32, 8, c], [12, 6, 40, 8, c], [18, 0, 10, 5, c], [32, 0, 10, 5, c], [14, 12, 10, 8, c], [40, 12, 10, 8, c]]; },
      post: function (f) { return muzzle('#d9c9a8', '#e8e2d4', '#8f7a63'); } }),
    AN('mouse', '쥐', 'Mouse', ['#b0b9cc', '#a8917d', '#cbb8d6'], { ear: 'round-big', inner: '#e0709b',
      post: function (f) { return muzzle(f, shade(f, 0.26), '#e0709b').concat([[10, 32, 8, 1, W], [46, 32, 8, 1, W]]); } }),
    AN('hamster', '햄스터', 'Hamster', ['#e0a63c', '#d9c9a8', '#c9a877'], { ear: 'round',
      post: function (f) { return [[14, 28, 10, 10, shade(f, 0.18)], [40, 28, 10, 10, shade(f, 0.18)]].concat(muzzle(f, W, '#c9758a')); } }),
    AN('rabbit', '토끼', 'Rabbit', ['#f2e9d8', '#d9c9a8', '#cbb8d6', '#a8917d'], { ear: 'tall', inner: '#e0709b',
      post: function (f) { return muzzle(f, shade(f, 0.24), '#e0709b').concat([[30, 34, 4, 1, ink(f)], [29, 37, 6, 3, W]]); } }),
    AN('frog', '개구리', 'Frog', ['#5c8a3c', '#7d9463', '#2e7d6e'], { ownEyes: true,
      pre: function (f) { return [[16, 8, 12, 10, f], [36, 8, 12, 10, f]]; },
      post: function (f) { return [[18, 10, 8, 7, W], [38, 10, 8, 7, W], [20, 12, 4, 4, '#241c18'], [40, 12, 4, 4, '#241c18'], [20, 12, 1, 1, W], [40, 12, 1, 1, W],
        [22, 30, 20, 3, ink(f)], [20, 28, 3, 3, ink(f)], [41, 28, 3, 3, ink(f)], [24, 22, 4, 2, shade(f, 0.2)]]; } }),
    AN('bird', '새', 'Bird', ['#3f8fbf', '#e8c33a', '#e278a1'], { ownEyes: true,
      pre: function (f) { return [[28, 2, 3, 7, '#e0a63c'], [32, 1, 3, 8, '#e0a63c'], [36, 3, 3, 6, '#e0a63c']]; },
      post: function (f) { var o = []; bigEyes(o, W, '#241c18'); return o.concat(beak('#e0a63c')); } }),
    AN('penguin', '펭귄', 'Penguin', ['#2f3b5c'], { ownEyes: true,
      post: function (f) { var o = [[22, 18, 20, 20, '#f7f2e8'], [20, 44, 24, 20, '#f7f2e8']]; bigEyes(o, W, '#241c18'); return o.concat(beak('#e0a63c')); } }),
    AN('owl', '부엉이', 'Owl', ['#8f6a4a', '#a8917d', '#6b4a2f'], { ear: 'tuft', ownEyes: true,
      post: function (f) { var o = [[19, 18, 12, 14, shade(f, 0.28)], [33, 18, 12, 14, shade(f, 0.28)]]; bigEyes(o, '#f2c04a', '#241c18'); return o.concat(beak('#c9852a')); } }),
    AN('deer', '사슴', 'Deer', ['#c9a877', '#e0a63c'], { ear: 'side',
      pre: function () { var a = '#8f6a4a'; return [[19, 0, 3, 12, a], [15, 2, 4, 3, a], [14, 5, 3, 5, a], [42, 0, 3, 12, a], [45, 2, 4, 3, a], [47, 5, 3, 5, a]]; },
      post: function (f) { return [[22, 16, 4, 4, W], [38, 18, 4, 4, W], [26, 12, 4, 4, W]].concat(muzzle(f, shade(f, 0.2), '#241c18')); } }),
    AN('monkey', '원숭이', 'Monkey', ['#8f6a4a', '#6b4a2f'], { ear: 'round-big', inner: '#c9a877',
      post: function (f) { return [[20, 22, 24, 18, '#e0c0a0'], [22, 20, 20, 4, '#e0c0a0']].concat(muzzle('#e0c0a0', '#e8cdb0', '#8f6a4a')); } }),
    AN('koala', '코알라', 'Koala', ['#b0b9cc', '#8f98aa'], { ear: 'side', inner: '#e8e2d4',
      post: function (f) { return [[26, 28, 12, 10, '#3a3f4a'], [27, 26, 10, 3, '#3a3f4a'], [29, 30, 3, 2, '#6d7a90']]; } }),
    AN('raccoon', '너구리', 'Raccoon', ['#8f98aa', '#a8917d'], { ear: 'round', ownEyes: true,
      post: function (f) { var o = [[18, 20, 28, 10, '#2b211b'], [22, 18, 20, 3, '#2b211b']];
        o.push([24, 23, 6, 5, W]); o.push([34, 23, 6, 5, W]); o.push([26, 24, 3, 3, '#241c18']); o.push([36, 24, 3, 3, '#241c18']); o.push([26, 24, 1, 1, W]); o.push([36, 24, 1, 1, W]);
        return o.concat(muzzle(f, W, '#241c18')); } }),
    AN('turtle', '거북', 'Turtle', ['#7d9463', '#5c8a3c'], { ear: 'none',
      post: function (f) { var sh = '#6b4a2f'; return [[12, 44, 40, 20, sh], [16, 42, 32, 4, sh],
        [20, 48, 10, 8, shade(sh, 0.22)], [34, 48, 10, 8, shade(sh, 0.22)], [27, 56, 10, 6, shade(sh, 0.22)]]
        .concat(muzzle(f, shade(f, 0.2), '#3a4a2a')); } }),
    AN('dragon', '드래곤', 'Dragon', ['#5c8a3c', '#8f6fb5', '#bf4a44', '#3f8fbf'], { ear: 'none',
      pre: function (f) { var hn = '#e0d0a8'; return [[16, 2, 5, 12, hn], [14, 0, 4, 5, hn], [43, 2, 5, 12, hn], [46, 0, 4, 5, hn]]; },
      post: function (f) { var sc = shade(f, 0.2); return [[24, 8, 4, 4, sc], [32, 6, 4, 4, sc], [38, 9, 4, 4, sc]]
        .concat(muzzle(f, shade(f, -0.12), '#241c18')).concat([[27, 40, 3, 3, W], [34, 40, 3, 3, W]]); } }),
    AN('unicorn', '유니콘', 'Unicorn', ['#f7f2e8', '#cbb8d6', '#f0dced'], { ear: 'tri-sharp',
      pre: function () { return [[30, 0, 4, 12, '#f2c04a'], [29, 4, 6, 2, '#e0a63c'], [29, 8, 6, 2, '#e0a63c']]; },
      post: function (f) { return [[18, 10, 6, 10, '#e278a1'], [40, 10, 6, 10, '#8f6fb5'], [24, 8, 6, 8, '#7fc9f2']]
        .concat(muzzle(f, shade(f, -0.06), '#e0709b')); } })
  ];
  var ANIMAL_BY_ID = {}; ANIMAL.forEach(function (a) { ANIMAL_BY_ID[a.id] = a; });

  /* ══ 직업 44종 ═══════════════════════════════════════════════════ */
  var JOB_GROUPS = [
    { id: 'medical', ko: '의료·건강', en: 'Medical' }, { id: 'it', ko: 'IT·개발', en: 'IT' },
    { id: 'education', ko: '교육·연구', en: 'Education' }, { id: 'food', ko: '요리·식음료', en: 'Food' },
    { id: 'construction', ko: '건설·제조', en: 'Construction' }, { id: 'art', ko: '예술·창작', en: 'Art' },
    { id: 'safety', ko: '공공·안전', en: 'Safety' }, { id: 'business', ko: '비즈니스·사무', en: 'Business' },
    { id: 'transport', ko: '운송·물류', en: 'Transport' }, { id: 'agriculture', ko: '농림·어업', en: 'Agriculture' },
    { id: 'service', ko: '서비스·미용', en: 'Service' }, { id: 'fantasy', ko: '판타지·기타', en: 'Fantasy' }
  ];
  /* 모자 템플릿 */
  function capHat(c, badge) { var o = [[19, 6, 26, 8, c], [16, 13, 32, 3, shade(c, -0.25)], [19, 6, 26, 2, shade(c, 0.2)]];
    if (badge) { o.push([29, 8, 6, 5, badge]); o.push([31, 9, 2, 3, shade(badge, 0.3)]); } return o; }
  function helmetHat(c, band) { var o = [[17, 4, 30, 11, c], [14, 14, 36, 3, shade(c, -0.28)], [17, 4, 30, 2, shade(c, 0.18)]];
    if (band) o.push([28, 6, 8, 6, band]); return o; }
  function brimHat(crown, brim) { return [[20, 2, 24, 8, crown], [11, 9, 42, 4, brim], [20, 2, 12, 2, shade(crown, 0.2)], [20, 8, 24, 2, shade(crown, -0.25)]]; }
  function beretHat(c) { return [[19, 5, 26, 8, c], [17, 11, 30, 3, shade(c, -0.22)], [41, 2, 4, 4, c], [19, 5, 12, 2, shade(c, 0.2)]]; }
  function bandHat(c) { return [[17, 14, 30, 5, c], [17, 14, 30, 1, shade(c, 0.25)]]; }
  function tieEx(c) { return [[30, 44, 4, 4, c], [29, 48, 6, 12, c], [30, 58, 4, 3, shade(c, -0.3)], [24, 44, 16, 2, W]]; }
  function apronEx(c) { return [[21, 48, 22, 16, c], [21, 48, 22, 2, shade(c, 0.18)], [26, 46, 12, 3, shade(c, -0.2)]]; }
  function coatEx(c) { return [[24, 44, 3, 20, shade(c, -0.12)], [37, 44, 3, 20, shade(c, -0.12)]]; }
  function vestEx(c) { return [[19, 50, 26, 4, c], [19, 57, 26, 4, c]]; }
  function JB(id, ko, en, group, cloth, hat, extra) { return { id: id, ko: ko, en: en, group: group, cloth: cloth, hat: hat, extra: extra }; }
  var JOB = [
    /* 의료 */
    JB('doctor', '의사', 'Doctor', 'medical', '#f2e9d8', null, function (c) { return coatEx(c).concat([[22, 46, 3, 10, '#3a3f4a'], [39, 46, 3, 10, '#3a3f4a'], [24, 55, 16, 2, '#3a3f4a'], [29, 56, 6, 5, '#b0b9cc'], [30, 57, 4, 3, '#8f98aa']]); }),
    JB('nurse', '간호사', 'Nurse', 'medical', '#a8d8e8', function () { return [[22, 8, 20, 6, W], [20, 12, 24, 2, W], [29, 9, 6, 2, '#bf4a44'], [31, 8, 2, 5, '#bf4a44']]; }, function () { return [[24, 44, 16, 2, '#e0e8ec']]; }),
    JB('dentist', '치과의사', 'Dentist', 'medical', '#e8f2f7', null, function (c) { return coatEx(c).concat([[22, 30, 20, 12, '#e8f2f7'], [22, 30, 20, 2, '#c9d6de'], [18, 26, 5, 6, '#c9d6de'], [41, 26, 5, 6, '#c9d6de']]); }),
    /* IT */
    JB('dev', '개발자', 'Developer', 'it', '#4a4a52', null, function (c) { return [[14, 46, 36, 5, shade(c, -0.15)], [20, 44, 24, 2, shade(c, -0.15)], [14, 46, 6, 18, shade(c, -0.3)], [44, 46, 6, 18, shade(c, -0.3)],
      [28, 50, 2, 10, '#d97757'], [34, 50, 2, 10, '#d97757']]; }),
    JB('gamer', '게이머', 'Gamer', 'it', '#2f3b5c', function () { return [[22, 4, 20, 3, '#2f3b5c'], [19, 6, 4, 4, '#2f3b5c'], [41, 6, 4, 4, '#2f3b5c'], [13, 20, 7, 12, '#3a3f4a'], [44, 20, 7, 12, '#3a3f4a'], [15, 22, 3, 8, '#46b6ff'], [46, 22, 3, 8, '#46b6ff']]; }, null),
    JB('designer', '디자이너', 'Designer', 'it', '#8f6fb5', null, function () { return glassesFrame('#241c18').concat([[20, 50, 6, 4, '#d97757'], [27, 50, 6, 4, '#e0a63c'], [34, 50, 6, 4, '#5c8a3c']]); }),
    /* 교육 */
    JB('teacher', '교사', 'Teacher', 'education', '#7d9463', null, function () { return glassesFrame('#3a3f4a').concat(tieEx('#bf4a44')); }),
    JB('professor', '교수', 'Professor', 'education', '#4a3f52', function () { return [[14, 6, 36, 4, '#241c18'], [22, 2, 20, 5, '#241c18'], [44, 8, 3, 12, '#e0a63c'], [43, 19, 5, 3, '#e0a63c']]; },
      function () { return glassesFrame('#6b4a2f', true); }),
    JB('scientist', '과학자', 'Scientist', 'education', '#f2e9d8', null, function (c) { return coatEx(c).concat([[20, 16, 24, 6, '#46b6ff'], [18, 18, 3, 4, '#3a3f4a'], [43, 18, 3, 4, '#3a3f4a'], [22, 17, 8, 2, '#ccfaff']]); }),
    /* 요리 */
    JB('chef', '요리사', 'Chef', 'food', '#f7f2e8', function () { return [[20, 1, 24, 11, W], [18, 10, 28, 5, '#e8e2d4'], [22, 0, 8, 3, '#fffaf0'], [24, 3, 6, 3, '#fffaf0']]; },
      function () { return [[27, 46, 10, 3, '#3a3f4a'], [22, 50, 20, 14, '#e8e2d4']]; }),
    JB('barista', '바리스타', 'Barista', 'food', '#e8e2d4', capHat('#3a3f4a') && function () { return capHat('#3a3f4a'); }, function () { return apronEx('#6b4a2f'); }),
    JB('baker', '제빵사', 'Baker', 'food', '#f2e9d8', function () { return [[20, 3, 24, 9, W], [18, 10, 28, 4, '#e8e2d4'], [23, 2, 8, 3, '#fffaf0']]; }, function () { return apronEx('#c9a877'); }),
    /* 건설 */
    JB('builder', '건설노동자', 'Builder', 'construction', '#e0a63c', function () { return helmetHat('#f2c04a'); }, function () { return vestEx('#e8c33a'); }),
    JB('engineer', '엔지니어', 'Engineer', 'construction', '#4d7a8c', function () { return helmetHat('#e8f2f7'); }, function () { return [[20, 50, 5, 8, '#e0a63c'], [26, 50, 3, 8, '#b0b9cc']]; }),
    JB('welder', '용접공', 'Welder', 'construction', '#5c4a3f', function () { return [[16, 12, 32, 22, '#3a3f4a'], [19, 18, 26, 8, '#241c18'], [21, 20, 8, 3, '#46b6ff'], [16, 8, 32, 5, '#4a4a52']]; }, null),
    /* 예술 */
    JB('artist', '화가', 'Artist', 'art', '#8f6fb5', function () { return beretHat('#6d4f8c'); },
      function () { return [[20, 48, 24, 16, '#c9a877'], [22, 52, 6, 5, '#d97757'], [30, 54, 5, 4, '#4d7a8c'], [37, 51, 5, 5, '#5c8a3c']]; }),
    JB('photographer', '사진가', 'Photographer', 'art', '#3a3f4a', null, function () { return [[22, 46, 20, 4, '#241c18'], [24, 50, 16, 12, '#4a4a52'], [28, 53, 8, 7, '#241c18'], [30, 55, 4, 3, '#46b6ff'], [37, 51, 3, 2, '#e8c33a']]; }),
    JB('musician', '음악가', 'Musician', 'art', '#2f3b5c', null, function () { return [[20, 46, 24, 3, '#e0a63c'], [22, 50, 6, 12, '#6b4a2f'], [28, 52, 14, 3, '#8f6a4a'], [24, 52, 3, 8, '#e8e2d4']]; }),
    /* 안전 */
    JB('police', '경찰', 'Police', 'safety', '#2f3b5c', function () { return capHat('#2f3b5c', '#e0a63c'); }, function () { return [[20, 50, 5, 6, '#e0a63c'], [21, 51, 3, 4, '#f2c04a'], [24, 44, 16, 2, '#1f2740']]; }),
    JB('firefighter', '소방관', 'Firefighter', 'safety', '#bf4a44', function () { return [[18, 5, 28, 10, '#a83a34'], [14, 14, 36, 3, '#8f2f2a'], [18, 5, 28, 2, '#d9605a'], [28, 7, 8, 6, '#f2e9d8'], [30, 8, 4, 4, '#bf4a44']]; },
      function () { return [[14, 54, 36, 3, '#e8c33a'], [14, 58, 36, 2, '#3a3f4a']]; }),
    JB('soldier', '군인', 'Soldier', 'safety', '#5c6b47', function () { return helmetHat('#4a5a38'); }, function (c) { return [[16, 50, 8, 6, shade(c, -0.2)], [26, 52, 10, 5, shade(c, 0.15)], [38, 48, 8, 7, shade(c, -0.2)]]; }),
    /* 비즈니스 */
    JB('clerk', '사무직', 'Office', 'business', '#4d7a8c', null, function () { return tieEx('#2f3b5c'); }),
    JB('lawyer', '변호사', 'Lawyer', 'business', '#2f3b5c', null, function () { return tieEx('#8f2f2a').concat([[20, 48, 4, 14, '#f2e9d8'], [40, 48, 4, 14, '#f2e9d8']]); }),
    JB('judge', '판사', 'Judge', 'business', '#241c18', function () { return [[16, 6, 32, 8, '#e8e2d4'], [13, 12, 38, 5, '#e8e2d4'], [16, 6, 14, 3, '#f7f2e8'], [14, 17, 8, 8, '#e8e2d4'], [42, 17, 8, 8, '#e8e2d4']]; },
      function () { return [[24, 44, 16, 3, '#f2e9d8'], [28, 47, 8, 10, '#f2e9d8']]; }),
    /* 운송 */
    JB('pilot', '파일럿', 'Pilot', 'transport', '#2f3b5c', function () { return capHat('#1f2740', '#e0a63c'); }, function () { return [[20, 50, 8, 4, '#e0a63c'], [20, 56, 5, 3, '#f2c04a'], [24, 44, 16, 2, W]]; }),
    JB('sailor', '선원', 'Sailor', 'transport', '#f2e9d8', function () { return [[20, 6, 24, 7, W], [17, 12, 30, 3, W], [20, 6, 24, 2, '#e8e2d4'], [28, 8, 8, 4, '#2f5fc0']]; },
      function () { return [[18, 46, 28, 4, '#2f5fc0'], [24, 50, 16, 3, '#2f5fc0']]; }),
    JB('driver', '운전기사', 'Driver', 'transport', '#4a4a52', function () { return capHat('#241c18'); }, function () { return [[24, 44, 16, 2, '#6d7a90'], [20, 52, 6, 4, '#e0a63c']]; }),
    /* 농림 */
    JB('farmer', '농부', 'Farmer', 'agriculture', '#5c8a3c', function () { return brimHat('#e0a63c', '#c9852a'); },
      function () { return [[22, 46, 4, 18, '#4d7a8c'], [38, 46, 4, 18, '#4d7a8c'], [22, 52, 20, 12, '#4d7a8c'], [28, 56, 8, 5, '#3f6578']]; }),
    JB('fisher', '어부', 'Fisher', 'agriculture', '#e0a63c', function () { return brimHat('#c9a877', '#a8917d'); },
      function () { return [[14, 48, 36, 4, '#4d7a8c'], [18, 54, 28, 3, '#4d7a8c'], [20, 44, 4, 20, '#3f6578']]; }),
    JB('miner', '광부', 'Miner', 'agriculture', '#5c4a3f', function () { return helmetHat('#e0a63c', '#f2c04a').concat([[28, 4, 8, 5, '#ccfaff']]); },
      function (c) { return [[18, 52, 28, 3, shade(c, -0.3)]]; }),
    /* 서비스 */
    JB('barber', '미용사', 'Barber', 'service', '#e8e2d4', null, function () { return apronEx('#241c18').concat([[22, 52, 5, 8, '#b0b9cc'], [30, 52, 3, 8, '#8f98aa'], [36, 52, 5, 6, '#d97757']]); }),
    JB('cleaner', '청소원', 'Cleaner', 'service', '#4d7a8c', function () { return bandHat('#e8c33a'); }, function () { return vestEx('#e8c33a').concat([[42, 44, 4, 20, '#c9a877']]); }),
    JB('courier', '택배기사', 'Courier', 'service', '#c9852a', function () { return capHat('#8f5a1a'); }, function () { return [[22, 48, 20, 14, '#c9a877'], [22, 53, 20, 2, '#8f6a4a'], [30, 48, 4, 14, '#8f6a4a']]; }),
    /* 판타지 */
    JB('wizard', '마법사', 'Wizard', 'fantasy', '#4c3a8c', function () { return [[28, 0, 8, 6, '#5c4aa8'], [24, 5, 16, 5, '#5c4aa8'], [19, 9, 26, 5, '#5c4aa8'], [14, 13, 36, 4, '#4c3a8c'], [28, 1, 4, 4, '#8f6fb5'], [30, 10, 4, 4, '#f2c04a']]; },
      function () { return [[24, 44, 16, 3, '#3a2a6c'], [29, 47, 6, 5, '#f2c04a']]; }),
    JB('knight', '기사', 'Knight', 'fantasy', '#8f98aa', function () { return [[17, 6, 30, 22, '#b0b9cc'], [20, 16, 24, 6, '#3a3f4a'], [30, 22, 4, 8, '#8f98aa'], [17, 6, 30, 3, '#ccd6e0'], [29, 0, 6, 7, '#bf4a44']]; }, null),
    JB('ninja', '닌자', 'Ninja', 'fantasy', '#2f3b5c', function () { return [[16, 6, 32, 16, '#1f2740'], [16, 28, 32, 12, '#1f2740'], [14, 12, 4, 20, '#1f2740'], [16, 6, 32, 2, '#3a4a6c']]; }, null),
    JB('pirate', '해적', 'Pirate', 'fantasy', '#8f2f2a', function () { return [[16, 8, 32, 7, '#241c18'], [14, 14, 36, 3, '#241c18'], [18, 9, 10, 3, '#4a4a52']]; },
      function () { return [[21, 21, 12, 10, '#241c18'], [16, 19, 32, 2, '#241c18']].concat([[24, 44, 16, 3, '#e8e2d4']]); }),
    JB('viking', '바이킹', 'Viking', 'fantasy', '#6b4a2f', function () { return [[18, 6, 28, 9, '#a8917d'], [15, 13, 34, 3, '#8f7a63'], [12, 0, 6, 12, '#e0d0a8'], [46, 0, 6, 12, '#e0d0a8'], [10, 0, 4, 5, '#e0d0a8'], [50, 0, 4, 5, '#e0d0a8']]; },
      function (c) { return [[18, 48, 28, 4, '#a8917d'], [24, 44, 16, 3, shade(c, -0.3)]]; }),
    JB('king', '왕', 'King', 'fantasy', '#8f2f2a', function () { return [[19, 7, 26, 7, '#e0a63c'], [19, 1, 5, 7, '#e0a63c'], [29, 0, 6, 8, '#e0a63c'], [40, 1, 5, 7, '#e0a63c'], [30, 3, 4, 3, '#bf4a44'], [21, 4, 3, 3, '#46b6ff'], [41, 4, 3, 3, '#5c8a3c'], [19, 7, 26, 2, '#f2c04a']]; },
      function () { return [[16, 46, 32, 5, '#f7f2e8'], [20, 51, 6, 5, '#241c18'], [38, 51, 6, 5, '#241c18']]; }),
    JB('monk', '승려', 'Monk', 'fantasy', '#c9852a', null, function () { return [[18, 46, 30, 5, '#e0a63c'], [22, 51, 24, 4, '#c9852a'], [26, 40, 12, 3, '#8f5a1a']]; }),
    JB('samurai', '사무라이', 'Samurai', 'fantasy', '#2f3b5c', function () { return [[17, 8, 30, 8, '#3a3f4a'], [14, 15, 36, 4, '#241c18'], [22, 2, 6, 8, '#e0a63c'], [36, 2, 6, 8, '#e0a63c'], [28, 5, 8, 5, '#bf4a44']]; },
      function () { return [[20, 46, 24, 4, '#8f2f2a'], [24, 44, 16, 2, '#e8e2d4']]; }),
    JB('astronaut', '우주비행사', 'Astronaut', 'fantasy', '#e8f2f7', function () { return [[14, 4, 36, 30, '#e8f2f7'], [18, 12, 28, 16, '#1f2740'], [21, 15, 8, 5, '#46b6ff'], [14, 4, 36, 3, '#ccd6e0'], [12, 16, 4, 10, '#b0b9cc'], [48, 16, 4, 10, '#b0b9cc']]; },
      function () { return [[20, 48, 8, 6, '#bf4a44'], [30, 48, 6, 6, '#46b6ff'], [24, 44, 16, 3, '#c9d6de']]; }),
    JB('detective', '탐정', 'Detective', 'fantasy', '#5c4a3f', function () { return [[19, 5, 26, 8, '#8f7a63'], [13, 12, 38, 4, '#8f7a63'], [19, 5, 12, 2, '#a8917d'], [19, 11, 26, 2, '#6b5a4a']]; },
      function () { return [[24, 44, 16, 3, '#e8e2d4'], [22, 47, 20, 14, '#6b5a4a'], [29, 47, 6, 14, '#5c4a3f']]; }),
    JB('athlete', '운동선수', 'Athlete', 'fantasy', '#d97757', function () { return bandHat('#f7f2e8'); },
      function () { return [[14, 50, 36, 3, W], [14, 56, 36, 3, W], [28, 46, 8, 8, W], [30, 48, 4, 4, '#d97757']]; })
  ];
  var JOB_BY_ID = {}; JOB.forEach(function (j) { JOB_BY_ID[j.id] = j; });

  /* ══ spec · 조립 ═════════════════════════════════════════════════ */
  /* 16 그리드 저장본·스튜디오 패치는 색·부품을 인덱스로 담는다 — 여기서 흡수 */
  function pxc(v, arr, d2) {
    if (typeof v === 'number') return arr[Math.abs(v) % arr.length];
    if (typeof v === 'string' && v.charAt(0) === '#') return v;
    return d2;
  }
  function pid(v, arr) {
    if (typeof v === 'number') return arr[Math.abs(v) % arr.length].id;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === v) return v;
    return arr[0].id;
  }
  function normalize(s) {
    s.skin = pxc(s.skin, SKIN, SKIN[1]);
    s.hairColor = pxc(s.hairColor, HAIRC, HAIRC[0]);
    s.eye = pxc(s.eye, EYEC, EYEC[0]);
    s.cloth = pxc(s.cloth, CLOTH, CLOTH[1]);
    s.cloth2 = pxc(s.cloth2, CLOTH, CLOTH[0]);
    s.fur = pxc(s.fur, FUR, FUR[0]);
    s.hair = pid(s.hair, HAIR); s.acc = pid(s.acc, ACC); s.face = pid(s.face, FACE);
    s.expr = pid(s.expr, EXPR); s.species = pid(s.species, ANIMAL);
    if (s.job != null && !JOB_BY_ID[s.job]) s.job = (typeof s.job === 'number' && JOB[Math.abs(s.job) % JOB.length]) ? JOB[Math.abs(s.job) % JOB.length].id : null;
    if (s.type !== 'animal') s.type = 'human';
    return s;
  }
  function spec(seed, ov) {
    var r = rngOf(seed == null ? 'nova' : seed);
    var s = {
      v: 64, seed: seed == null ? 'nova' : seed,
      type: r() < 0.8 ? 'human' : 'animal',
      skin: pick(r, SKIN), hairColor: pick(r, HAIRC), eye: pick(r, EYEC), cloth: pick(r, CLOTH), cloth2: pick(r, CLOTH), fur: pick(r, FUR),
      hair: pick(r, HAIR).id, acc: r() < 0.55 ? 'none' : pick(r, ACC).id, face: r() < 0.6 ? 'none' : pick(r, FACE).id,
      expr: pick(r, EXPR).id, species: pick(r, ANIMAL).id, job: null
    };
    if (ov) for (var k in ov) if (ov[k] !== undefined) s[k] = ov[k];
    normalize(s);
    if (s.type === 'animal' && !(ov && typeof ov.fur === 'string')) {
      var A = ANIMAL_BY_ID[s.species];
      if (A && A.fur) s.fur = A.fur[Math.floor(rngOf(s.seed + s.species)() * A.fur.length) % A.fur.length];
    }
    return s;
  }
  function ops(sp0) {
    var sp = normalize(Object.assign({ v: 64, seed: 'nova', type: 'human' }, sp0 || {}));
    var o = [];
    var P = { skin: sp.skin, hairColor: sp.hairColor, cloth: sp.cloth, cloth2: sp.cloth2 || shade(sp.cloth, -0.3), fur: sp.fur };
    if (sp.type === 'animal') {
      var A = ANIMAL_BY_ID[sp.species] || ANIMAL[0];
      var f = sp.fur || FUR[0];
      if (A.pre) o = o.concat(A.pre(f));
      if (A.ear) o = o.concat(ears(A.ear, A.earColor || f, A.inner));
      o = o.concat(headBase(f));
      o = o.concat(face(f, sp.eye, shade(f, -0.3), sp.expr, !!A.ownEyes));
      o = o.concat(torso(f, sp.cloth));
      if (A.post) o = o.concat(A.post(f));
      var AC2 = ACC.filter(function (a) { return a.id === sp.acc; })[0];
      if (AC2 && sp.acc !== 'none' && sp.acc !== 'catears') o = o.concat(AC2.f(P));
      return o;
    }
    var J = sp.job ? JOB_BY_ID[sp.job] : null;
    var cloth = J ? J.cloth : sp.cloth;
    P.cloth = cloth;
    var H = HAIR.filter(function (h) { return h.id === sp.hair; })[0] || HAIR[0];
    o = o.concat(headBase(sp.skin));
    var hairOps = H.f(sp.hairColor);
    if (J && J.hat) hairOps = hairOps.filter(function (c) { return c[1] > 15; });
    o = o.concat(hairOps);
    o = o.concat(face(sp.skin, sp.eye, sp.hairColor, sp.expr));
    o = o.concat(torso(sp.skin, cloth));
    if (J && J.hat) o = o.concat(J.hat(sp.hairColor));
    if (J && J.extra) o = o.concat(J.extra(cloth));
    var F = FACE.filter(function (x) { return x.id === sp.face; })[0];
    if (F && sp.face !== 'none') o = o.concat(F.f(P));
    var A3 = ACC.filter(function (a) { return a.id === sp.acc; })[0];
    if (A3 && sp.acc !== 'none' && !(J && J.hat)) o = o.concat(A3.f(P));
    return o;
  }
  function rawSVG(sp, size) {
    var body = ops(sp).map(function (c) {
      return '<rect x="' + c[0] + '" y="' + c[1] + '" width="' + c[2] + '" height="' + c[3] + '" fill="' + c[4] + '"/>';
    }).join('');
    var px = size || 64;
    return '<svg viewBox="0 0 64 64" width="' + px + '" height="' + px + '" shape-rendering="crispEdges" ' +
      'style="display:block;width:100%;height:100%;image-rendering:pixelated" aria-hidden="true">' + body + '</svg>';
  }
  function svg(sp, size) { return '<span class="px-pavatar">' + rawSVG(sp, size) + '</span>'; }

  root.PXAvatar64 = {
    HAIR: HAIR, ACC: ACC, FACE: FACE, EXPR: EXPR, ANIMAL: ANIMAL, JOB: JOB, JOB_GROUPS: JOB_GROUPS, JOB_BY_ID: JOB_BY_ID,
    SKIN: SKIN, HAIRC: HAIRC, EYEC: EYEC, CLOTH: CLOTH, FUR: FUR,
    avatarSpec: spec, avatarSVG: svg, avatarRawSVG: rawSVG, spec: spec, svg: rawSVG, ops: ops,
    shade: shade, mix: mix, GRID: 64
  };
})(window);
