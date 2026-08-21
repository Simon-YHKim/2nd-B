/* ============================================================
   2nd-Brain · 북극성 페르소나 카드 (PersonaCard)
   Tapping the Polaris star surfaces this data-generated persona.
   A deterministic synthesis of the user's Big Five (layer B) +
   the 7 life-domain star levels (layer A) + the north-star line.
   Export: window.PersonaCard
   ============================================================ */
function PersonaCard({ onClose, onRoute }) {
  const C = window.SB.C;
  const PUR = 'var(--ds-nebula)', PURSOFT = 'rgba(167,139,250,.16)';

  /* ---- synthesize persona from user data ---- */
  const five = window.SB.BIGFIVE; // all 5, fixed order for the pentagon
  const domains = window.SB.STARS.filter((s) => !s.big && !s.portal);
  const topDomains = [...domains].sort((a, b) => b.level - a.level).slice(0, 3);
  const records = 124; // mock corpus size

  // archetype = blend of dominant trait + dominant domain leaning
  const archetype = '탐구하는 항해자';
  const essence = '나를 깊이 이해해 더 나답게 산다.';
  const summary =
    '깊이 파고드는 호기심으로 새로운 결을 먼저 열어보는 사람이에요. 동시에 곁에 있는 이의 마음을 세심히 살펴, ' +
    '낯선 길에서도 사람을 잃지 않아요. 정해진 틀보다 스스로 납득한 방향을 택하고, 서두르기보다 천천히 단단하게 쌓아 올려요.';

  return (
    <div onClick={onClose}
      style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'grid', placeItems: 'center',
        padding: '64px 18px 18px', background: 'radial-gradient(120% 80% at 50% 30%, rgba(20,10,46,.62), rgba(7,10,19,.88))', animation: 'sb-scrim-in .28s ease' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 320, maxHeight: '100%', overflowY: 'auto',
          borderRadius: 0, border: '1px solid rgba(167,139,250,.4)',
          background: 'linear-gradient(180deg, rgba(31,20,56,.97), rgba(11,16,32,.98))',
          boxShadow: 'none',
          transformOrigin: 'center', animation: 'sb-persona-in .42s var(--md-sys-motion-easing-emphasized)' }}>

        {/* halo header */}
        <div style={{ position: 'relative', padding: '16px 20px 14px', textAlign: 'center', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -54, left: '50%', transform: 'translateX(-50%)', width: 200, height: 160,
            background: 'radial-gradient(circle at 50% 40%, rgba(183,148,246,.42), rgba(167,139,250,.12) 46%, transparent 70%)', pointerEvents: 'none' }} />
          <button onClick={onClose} aria-label="닫기"
            style={{ position: 'absolute', top: 12, right: 12, width: 30, height: 30, borderRadius: 0, border: 'none', cursor: 'pointer',
              display: 'grid', placeItems: 'center', background: 'var(--panel-2)', color: 'var(--ds-polaris)', zIndex: 2 }}>
            <Icon name="close" size={17} />
          </button>

          <div style={{ position: 'relative', width: 46, height: 46, margin: '2px auto 10px', display: 'grid', placeItems: 'center' }}>
            <span style={{ position: 'absolute', inset: 0, borderRadius: 0,
              background: 'radial-gradient(circle, rgba(183,148,246,.5), transparent 68%)', animation: 'sb-dim 3.4s ease-in-out infinite' }} />
            <span style={{ width: 18, height: 18, borderRadius: 0,
              background: 'radial-gradient(circle,var(--c08),var(--ds-polaris) 46%,var(--ds-nebula) 86%)',
              boxShadow: 'none' }} />
          </div>

          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--c07)', marginTop: 4, letterSpacing: '-.01em' }}>{archetype}</div>
          <div style={{ fontSize: 12, color: 'var(--ds-polaris)', lineHeight: 1.5, marginTop: 7, wordBreak: 'keep-all' }}>
            “{essence}”
          </div>
        </div>

        <div style={{ padding: '0 18px 18px' }}>
          {/* synthesized read */}
          <div style={{ fontSize: 12, color: 'var(--c05)', lineHeight: 1.6, wordBreak: 'keep-all', textWrap: 'pretty',
            padding: '12px 14px', borderRadius: 0, background: 'var(--panel-2)', border: '1px solid var(--panel-2)' }}>
            {summary}
          </div>

          {/* Big Five — full pentagon radar (layer B) */}
          <BigFiveRadar five={five} PUR={PUR} />

          {/* dominant domains (layer A) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 7, marginTop: 12 }}>
            {topDomains.map((d) => (
              <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 0, whiteSpace: 'nowrap',
                background: PURSOFT, border: '1px solid rgba(167,139,250,.3)', fontSize: 12, color: 'var(--ds-nebula-soft)' }}>
                <span style={{ width: 6, height: 6, borderRadius: 0, background: PUR, boxShadow: 'none' }} />
                {d.domain}
              </span>
            ))}
          </div>

          {/* actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <MdButton variant="filled" trailingIcon="north_east" style={{ flex: 1 }} onClick={() => onRoute('me')}>북극성 종합</MdButton>
            <MdButton variant="tonal" icon="ios_share" style={{ flex: 1 }} onClick={() => onRoute('iden')}>IDEN 내보내기</MdButton>
          </div>
        </div>
      </div>
    </div>
  );

  function Label({ children, tone }) {
    return (
      <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, letterSpacing: '.14em',
        color: tone, opacity: .9, margin: '18px 0 10px' }}>{children}</div>
    );
  }
}

window.PersonaCard = PersonaCard;


/* ============================================================
   BigFiveRadar — 5개 특성 레이더. 번들 픽셀 차트 엔진(radar) + HTML 라벨.
   ============================================================ */
function BigFiveRadar({ five, PUR, compact }) {
  /* 5각형 레이더 — 정수좌표 rect only. 격자·축은 1px 선, 데이터 면은 가로 스캔라인으로 채운다. */
  const box = compact ? 88 : 132;
  const pad = compact ? 30 : 34;
  const size = box + pad * 2;
  const C0 = box / 2, R = C0 - 2;
  const N = five.length;
  const ang = (i) => (-90 + i * (360 / N)) * Math.PI / 180;
  const pt = (i, r) => [C0 + Math.cos(ang(i)) * r, C0 + Math.sin(ang(i)) * r];

  const cells = [];
  const px = (x, y, w, h, f) => cells.push([Math.round(x), Math.round(y), w || 1, h || 1, f]);
  const lineTo = (a, b, f) => {
    let x0 = Math.round(a[0]), y0 = Math.round(a[1]);
    const x1 = Math.round(b[0]), y1 = Math.round(b[1]);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 400; n++) {
      px(x0, y0, 1, 1, f);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  const ring = (r, f) => { for (let i = 0; i < N; i++) lineTo(pt(i, r), pt((i + 1) % N, r), f); };

  const GRID = 'var(--c03)', EDGE = 'var(--c04)';
  const poly = five.map((f, i) => pt(i, R * Math.max(0.06, f.v / 100)));
  let yMin = Infinity, yMax = -Infinity;
  poly.forEach((p) => { yMin = Math.min(yMin, p[1]); yMax = Math.max(yMax, p[1]); });
  for (let y = Math.floor(yMin); y <= Math.ceil(yMax); y++) {
    const xs = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      /* 50% 디더 — 불투명도 대신 격자무늬로 채워 아래 격자가 비쳐 보이게 한다 */
      const x0 = Math.round(xs[k]), x1 = Math.round(xs[k + 1]);
      for (let x = x0; x < x1; x++) if ((x + y) % 2 === 0) px(x, y, 1, 1, 'var(--accent-deep)');
    }
  }
  /* 격자·축은 채움 위에 — 오각형 틀이 면에 가려지지 않는다 */
  [0.34, 0.67].forEach((g) => ring(R * g, GRID));
  ring(R, EDGE);
  for (let i = 0; i < N; i++) lineTo([C0, C0], pt(i, R), GRID);
  for (let i = 0; i < N; i++) lineTo(poly[i], poly[(i + 1) % N], 'var(--ds-core)');
  poly.forEach((p) => px(p[0] - 1, p[1] - 1, 3, 3, 'var(--ds-star)'));

  return (
    <div style={{ display: 'grid', placeItems: 'center', marginTop: 4 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg viewBox={`0 0 ${box} ${box}`} width={box} height={box} shapeRendering="crispEdges" role="img" aria-label="Big Five 레이더"
          style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', display: 'block', maxWidth: 'none' }}>
          {cells.map((c, i) => <rect key={i} x={c[0]} y={c[1]} width={c[2]} height={c[3]} fill={c[4]} />)}
        </svg>
        {five.map((f, i) => {
          const c = Math.cos(ang(i)), sn = Math.sin(ang(i));
          const off = compact ? 14 : 20;
          const lx = C0 + pad + c * (R + off), ly = C0 + pad + sn * (R + off);
          const align = Math.abs(c) < 0.3 ? 'center' : c > 0 ? 'left' : 'right';
          return (
            <div key={f.k} style={{ position: 'absolute', left: lx, top: ly,
              transform: `translate(${align === 'center' ? '-50%' : align === 'left' ? '0' : '-100%'}, -50%)`,
              textAlign: align, whiteSpace: 'nowrap',
              ...(compact ? { display: 'flex', alignItems: 'baseline', gap: 4 } : null) }}>
              <div style={{ fontSize: compact ? 10 : 12, fontWeight: 700, color: 'var(--ds-nebula-soft)' }}>{f.k}</div>
              <div style={{ fontSize: 10, fontFamily: 'var(--md-ref-typeface-mono)', color: PUR }}>{f.v}</div>
            </div>);
        })}
      </div>
    </div>
  );
}
window.BigFiveRadar = BigFiveRadar;


/* ============================================================
   PersonaDeck — swipeable carousel of data-generated personas,
   shown at the top of 북극성 종합 (MeScreen). The "전체" persona is
   the layer-C synthesis; the rest are context-scoped facets
   (커리어·관계 …). All are propose-only — ratify to adopt.
   Export: window.PersonaDeck
   ============================================================ */
const SB_PERSONAS = [
  { id: 'dev',      scope: '커리어', icon: 'code', job: 'dev',
    role: '1인 개발자',
    roleDesc: '혼자서도 끝까지 짓습니다.',
    five: [{ k: '개방', v: 76 }, { k: '성실', v: 68 }, { k: '외향', v: 36 }, { k: '우호', v: 55 }, { k: '신경', v: 34 }],
    person: '눈에 띄기보다 끝까지 짓는 쪽. 새 구조를 즐겨 시도하면서도 꾸준히 밀어붙여요.',
    strengths: ['집요한 완성력', '구조적 사고', '자기주도', '빠른 학습'],
    records: 47, conf: 3 },
  { id: 'provider', scope: '가정',   icon: 'groups', job: 'clerk',
    role: '가장',
    roleDesc: '곁의 하루를 먼저 챙깁니다.',
    five: [{ k: '개방', v: 64 }, { k: '성실', v: 62 }, { k: '외향', v: 44 }, { k: '우호', v: 74 }, { k: '신경', v: 32 }],
    person: '갈등보다 조율로 관계를 단단히 만들어요. 곁에 있는 이의 결을 먼저 읽어요.',
    strengths: ['책임감', '정서적 안정', '배려·조율', '신뢰'],
    records: 33, conf: 2 },
  { id: 'learner',  scope: '성장',   icon: 'travel_explore', job: 'scientist',
    role: '탐구하는 학습자',
    roleDesc: '낯선 것에 먼저 손을 뻗습니다.',
    five: [{ k: '개방', v: 82 }, { k: '성실', v: 56 }, { k: '외향', v: 48 }, { k: '우호', v: 63 }, { k: '신경', v: 40 }],
    person: '호기심이 가장 큰 동력. 낯선 영역에도 먼저 손을 뻗고, 배운 걸 곱씀어요.',
    strengths: ['지적 호기심', '연결적 사고', '개방성', '성찰'],
    records: 44, conf: 3 },
];

/* Holland RIASEC 정적 테이블 — 값 바인딩이라 호이스팅되지 않는다. 모듈 스코프에 둔다. */
const RIASEC = [
  { c: 'R', ko: '현실형', en: 'Realistic' }, { c: 'I', ko: '탐구형', en: 'Investigative' },
  { c: 'A', ko: '예술형', en: 'Artistic' },  { c: 'S', ko: '사회형', en: 'Social' },
  { c: 'E', ko: '진취형', en: 'Enterprising' }, { c: 'C', ko: '관습형', en: 'Conventional' }
];

function PersonaDeck({ go, heading, fill }) {
  const PUR = 'var(--ds-nebula)', PURSOFT = 'rgba(167,139,250,.16)';
  const [idx, setIdx] = useState(0);
  const ref = useRef(null);

  const step = () => {
    const el = ref.current; if (!el || !el.children.length) return 1;
    return el.children[0].getBoundingClientRect().width + 12; // card width + gap
  };
  const onScroll = () => {
    const el = ref.current; if (!el) return;
    const i = Math.min(SB_PERSONAS.length - 1, Math.round(el.scrollLeft / step()));
    if (i !== idx) setIdx(i);
  };
  const goTo = (i) => {
    const el = ref.current; if (!el) return;
    el.scrollTo({ left: i * step(), behavior: 'smooth' });
  };

  return (
    /* fill: 오버레이에서는 창 높이를 채우고 카드 안에서만 스크롤한다 — 카드가 잘려 보이지 않게 */
    <div style={{ padding: '6px 0 2px', background: fill ? 'transparent' : 'radial-gradient(120% 90% at 50% 0%, rgba(31,20,56,.9), rgba(11,16,32,0))',
      ...(fill ? { height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, boxSizing: 'border-box' } : null) }}>
      {heading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 18px 10px' }}>
          <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, letterSpacing: '.16em', color: PUR, whiteSpace: 'nowrap' }}>{heading}</span>
          <span style={{ fontSize: 12, color: 'rgba(159,178,208,.8)' }}>· 옆으로 넘겨 보기</span>
        </div>
      )}
      <div ref={ref} onScroll={onScroll}
        style={{ display: 'flex', gap: 12, overflowX: 'auto', scrollSnapType: 'x mandatory',
          padding: '0 18px', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
          ...(fill ? { flex: 1, minHeight: 0 } : null) }}>
        {SB_PERSONAS.map((p) => (
          <div key={p.id} style={{ flex: '0 0 100%', scrollSnapAlign: 'center',
            ...(fill ? { height: '100%', overflowY: 'auto', scrollbarWidth: 'thin', padding: '0 0 4px', boxSizing: 'border-box' } : null) }}>
            <PCard p={p} go={go} PUR={PUR} PURSOFT={PURSOFT} n={SB_PERSONAS.indexOf(p) + 1} total={SB_PERSONAS.length} hideActions={fill} />
          </div>
        ))}
      </div>

      {fill && (
        <div style={{ display: 'flex', gap: 8, flex: '0 0 auto', padding: '8px 18px 0' }}>
          <MdButton variant="filled" trailingIcon="north_east" style={{ flex: 1 }} onClick={() => go('northstar')}>문장 다듬기</MdButton>
          <MdButton variant="tonal" icon="ios_share" style={{ flex: 1 }} onClick={() => go('iden')}>내보내기</MdButton>
        </div>
      )}

      {/* dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginTop: 12 }}>
        {SB_PERSONAS.map((p, i) => (
          <button key={p.id} aria-label={`${p.scope} 페르소나`} onClick={() => goTo(i)}
            style={{ width: i === idx ? 22 : 7, height: 7, borderRadius: 0, border: 'none', cursor: 'pointer', padding: 0,
              transition: 'width .25s', background: i === idx ? PUR : 'rgba(167,139,250,.3)' }} />
        ))}
      </div>
    </div>
  );

  /* 카드마다 다른 결과 → 아바타도 그 역할을 입는다. 얼굴은 내 프로필 그대로, 직업만 바뀐다. */
  function personaAvatar(p) {
    const A = window.PXAvatar64;
    const base = (window.SBProfile && window.SBProfile.get().avatar) || null;
    if (!A) return base;
    const seed = (base && base.seed) || 'nova';
    /* 동물 아바타는 직업 옷을 입힐 수 없다(ops 가 job 을 무시) — 그대로 둔다.
       액세서리는 유지 — 모자 있는 직업은 생성기가 알아서 모자를 우선한다. */
    if (base && base.type === 'animal') return base;
    return A.avatarSpec(seed, { ...(base || {}), type: 'human', job: p.job || null });
  }

  /* 적합성 이론 (Person-Environment Fit) — Holland RIASEC 흥미 유형과
     하위 적합도(직무·조직·진로)를 Big Five 에서 결정적으로 도출한다.
     연결 강도는 Barrick 외 메타분석의 Big Five ↔ RIASEC 대응을 따른다.
     PCard 보다 뒤에 오므로 반드시 호이스팅되는 function 선언이어야 한다. */
  function fiveOf(p) {
    const g = (k) => (p.five.find((f) => f.k === k) || { v: 50 }).v;
    return { O: g('개방'), Co: g('성실'), E: g('외향'), A: g('우호'), N: g('신경') };
  }
  function riasec(p) {
    const f = fiveOf(p);
    const s = {
      R: Math.round(100 - f.O * 0.4 - f.E * 0.2 + f.Co * 0.2),
      I: Math.round(f.O * 0.62 + (100 - f.E) * 0.18 + f.Co * 0.2),
      A: Math.round(f.O * 0.74 + (100 - f.Co) * 0.16 + f.E * 0.1),
      S: Math.round(f.A * 0.5 + f.E * 0.38 + (100 - f.N) * 0.12),
      E: Math.round(f.E * 0.66 + f.O * 0.2 + (100 - f.A) * 0.14),
      C: Math.round(f.Co * 0.7 + (100 - f.O) * 0.2 + (100 - f.E) * 0.1)
    };
    const rank = RIASEC.map((x) => ({ ...x, v: Math.max(0, Math.min(100, s[x.c])) })).sort((x, y) => y.v - x.v);
    return { rank, code: rank.slice(0, 3).map((x) => x.c).join('') };
  }
  /* 하위 적합도 — P-J 요구·능력, P-O 가치 일치, P-V 진로 흥미 */
  function fitScores(p) {
    const f = fiveOf(p), r = riasec(p);
    return [
      { k: 'P-J', ko: '직무', sub: '요구 · 능력', v: Math.round(f.Co * 0.5 + f.O * 0.25 + (100 - f.N) * 0.25) },
      { k: 'P-O', ko: '조직', sub: '가치 일치', v: Math.round(f.A * 0.45 + f.Co * 0.3 + f.E * 0.25) },
      { k: 'P-V', ko: '진로', sub: '흥미 방향', v: Math.round(r.rank[0].v * 0.6 + r.rank[1].v * 0.4) }
    ];
  }
  /* 조사 — 끝 글자 받침으로 갈린다. 숫자는 읽는 소리 기준(0136780=받침 있음). */
  function hasJong(s) {
    const c = String(s).trim().slice(-1);
    if (/[0-9]/.test(c)) return '013678'.indexOf(c) >= 0;
    const code = c.charCodeAt(0) - 0xAC00;
    return code >= 0 && code < 11172 && code % 28 !== 0;
  }
  function josa(s, withJong, withoutJong) { return s + (hasJong(s) ? withJong : withoutJong); }

  /* 3줄 요약 — Big Five 최고·최저, Holland 상위 2유형, 적합도 강·약 축 */
  function fitSummary(p) {
    const f = fiveOf(p), r = riasec(p), s = fitScores(p);
    const sorted = [...p.five].sort((a2, b2) => b2.v - a2.v);
    const hi = sorted[0], lo = sorted[sorted.length - 1];
    const best = [...s].sort((a2, b2) => b2.v - a2.v)[0];
    const worst = [...s].sort((a2, b2) => a2.v - b2.v)[0];
    const calm = f.N <= 45 ? '흔들림이 적은 편이에요' : f.N >= 65 ? '자극에 민감한 편이에요' : '기복은 보통이에요';
    return [
      `${hi.k} ${josa(hi.v, '으로', '로')} 가장 높고 ${lo.k} ${josa(lo.v, '으로', '로')} 가장 낮아요 — ${calm}.`,
      `흥미는 ${r.rank[0].ko}·${r.rank[1].ko} 쪽으로 기울어요 (${r.code}).`,
      best.v - worst.v >= 12
        ? `${best.ko} 적합이 ${josa(best.v, '으로', '로')} 가장 높고 ${josa(worst.ko, '이', '가')} ${josa(worst.v, '으로', '로')} 뒤처져요 — ${josa(worst.sub, '을', '를')} 먼저 살펴보세요.`
        : `세 축이 ${worst.v}~${josa(best.v, '으로', '로')} 고르게 맞아요 — 지금 자리와 크게 어긋나지 않아요.`
    ];
  }
  function fitLabel(v) { return v >= 75 ? '잘 맞아요' : v >= 60 ? '대체로 맞아요' : v >= 45 ? '보통이에요' : '어긋나는 편이에요'; }

  function PCard({ p, go, PUR, PURSOFT, n, total, hideActions }) {
    const lbl = (txt, mt) => (
      <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, letterSpacing: '.16em',
        color: PUR, opacity: .92, margin: `${mt}px 0 8px` }}>{txt}</div>
    );
    return (
      /* overflow:hidden 을 두면 판의 높이가 슬라이드 스크롤에 반영되지 않아 마지막 블록이
         스크롤 불가로 잘려나간다 — 헤더 글로우만 그 안에서 따로 자른다. */
      <div style={{ borderRadius: 0, border: '1px solid rgba(167,139,250,.34)',
        background: 'linear-gradient(180deg, rgba(31,20,56,.96), rgba(11,16,32,.97))',
        boxShadow: '0 0 0 var(--u) var(--edge-soft)' }}>
        {/* header — role identity */}
        <div style={{ position: 'relative', padding: '30px 16px 8px', overflow: 'hidden' }}>
          <span style={{ position: 'absolute', top: 12, left: 14, zIndex: 2, display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', whiteSpace: 'nowrap', background: PURSOFT, boxShadow: 'var(--ds-edge)',
            fontSize: 12, color: 'var(--ds-polaris)' }}>
            <Icon name={p.icon} size={13} />{p.scope}
          </span>
          {n && (
            <span style={{ position: 'absolute', top: 12, right: 14, zIndex: 2, padding: '2px 7px',
              background: PURSOFT, border: '1px solid rgba(167,139,250,.3)',
              fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--ds-polaris)' }}>{n}/{total}</span>
          )}
          {/* 아바타를 크게 — 그 아래에 어떤 사람인지 */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, flex: '0 0 auto', display: 'grid', placeItems: 'center',
              background: PURSOFT, boxShadow: 'var(--ds-edge)', overflow: 'hidden' }}>
              {window.SbAvatar
                ? <window.SbAvatar spec={personaAvatar(p)} size={52} crop />
                : <Icon name={p.icon} size={32} style={{ color: 'var(--ds-nebula-soft)' }} />}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--c07)', marginTop: 4, letterSpacing: '-.01em', wordBreak: 'keep-all' }}>{p.role}</div>
          </div>
        </div>

        <div style={{ padding: '0 16px 16px' }}>
          {/* 내 브랜드 — 한 줄 캐치프레이즈 */}
          {lbl('내 브랜드', 2)}
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ds-nebula-soft)', lineHeight: 1.5, wordBreak: 'keep-all', textWrap: 'balance' }}>
            {p.roleDesc}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ds-polaris)', lineHeight: 1.6, marginTop: 6, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            {p.person}
          </div>

          {/* 강점 */}
          {lbl('강점', 10)}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {p.strengths.map((s) => (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 0, whiteSpace: 'nowrap',
                background: PURSOFT, border: '1px solid rgba(167,139,250,.3)', fontSize: 12, color: 'var(--ds-nebula-soft)' }}>
                <span style={{ width: 5, height: 5, borderRadius: 0, background: PUR, boxShadow: 'none' }} />{s}
              </span>
            ))}
          </div>

          {/* Big Five + P-E Fit — 커리어 카드에만 */}
          {p.scope === '커리어' && (
            <React.Fragment>
              {lbl('BIG FIVE · 적합성', 10)}
              <div style={{ background: 'var(--panel-2)', boxShadow: 'var(--ds-edge)', padding: '4px 8px 8px' }}>
                <window.BigFiveRadar five={p.five} PUR={PUR} compact />

                {/* Holland 흥미 코드 — 적합성 이론의 사람 쪽 좌표 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10,
                  paddingTop: 10, boxShadow: '0 calc(-1*var(--u)) 0 0 var(--edge-soft)' }}>
                  <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, letterSpacing: '.1em', color: PUR, flex: '0 0 auto' }}>HOLLAND</span>
                  <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 15, fontWeight: 700, letterSpacing: '.14em', color: 'var(--ds-nebula-soft)' }}>{riasec(p).code}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--font-micro)', color: 'var(--fg-muted)', textAlign: 'right', wordBreak: 'keep-all' }}>
                    {riasec(p).rank.slice(0, 3).map((x) => x.ko).join(' · ')}
                  </span>
                </div>

                {/* 하위 적합도 — 직무·조직·진로 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                  {fitScores(p).map((s) => (
                    <div key={s.k} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 26, flex: '0 0 auto', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: PUR }}>{s.k}</span>
                      <span style={{ width: 26, flex: '0 0 auto', fontSize: 10, fontFamily: 'var(--font-micro)', color: 'var(--ds-nebula-soft)' }}>{s.ko}</span>
                      <span style={{ flex: 1, height: 8, background: 'var(--sunken)', boxShadow: 'var(--ds-edge)', position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: Math.max(0, Math.min(100, s.v)) + '%', background: PUR }} />
                      </span>
                      <span style={{ width: 20, flex: '0 0 auto', textAlign: 'right', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, fontWeight: 700, color: 'var(--ds-nebula-soft)' }}>{s.v}</span>
                    </div>
                  ))}
                </div>
                {/* 3줄 요약 — 성향 · 흥미 방향 · 적합도 해석 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10,
                  paddingTop: 9, boxShadow: '0 calc(-1*var(--u)) 0 0 var(--edge-soft)' }}>
                  {fitSummary(p).map((line, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <span style={{ flex: '0 0 auto', width: 4, height: 4, marginTop: 6, background: PUR }} />
                      <span style={{ flex: 1, fontSize: 10, fontFamily: 'var(--font-micro)', lineHeight: 1.6,
                        color: 'var(--ds-nebula-soft)', wordBreak: 'keep-all', textWrap: 'pretty' }}>{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            </React.Fragment>
          )}

          {/* provenance + actions — fill 이면 덱 푸터가 대신 그린다 */}
          {!hideActions && <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
            <MdButton variant="filled" trailingIcon="north_east" style={{ flex: 1 }} onClick={() => go('northstar')}>문장 다듬기</MdButton>
            <MdButton variant="tonal" icon="ios_share" style={{ flex: 1 }} onClick={() => go('iden')}>내보내기</MdButton>
          </div>}
        </div>
      </div>
    );
  }
}

window.PersonaDeck = PersonaDeck;
window.SB_PERSONAS_PUBLIC = SB_PERSONAS;
