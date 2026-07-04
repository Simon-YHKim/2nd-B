/* ============================================================
   2nd-Brain · 북극성 페르소나 카드 (PersonaCard)
   Tapping the Polaris star surfaces this data-generated persona.
   A deterministic synthesis of the user's Big Five (layer B) +
   the 7 life-domain star levels (layer A) + the north-star line.
   Export: window.PersonaCard
   ============================================================ */
function PersonaCard({ onClose, onRoute }) {
  const C = window.SB.C;
  const PUR = '#B794F6', PURSOFT = 'rgba(167,139,250,.16)';

  /* ---- synthesize persona from user data ---- */
  const five = window.SB.BIGFIVE; // all 5, fixed order for the pentagon
  const domains = window.SB.STARS.filter((s) => !s.big && s.id !== 'museum');
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
        padding: '64px 18px 18px', background: 'radial-gradient(120% 80% at 50% 30%, rgba(20,10,46,.62), rgba(7,10,19,.88))',
        backdropFilter: 'blur(3px)', animation: 'sb-scrim-in .28s ease' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 320, maxHeight: '100%', overflowY: 'auto',
          borderRadius: 22, border: '1px solid rgba(167,139,250,.4)',
          background: 'linear-gradient(180deg, rgba(31,20,56,.97), rgba(11,16,32,.98))',
          boxShadow: '0 24px 60px rgba(0,0,0,.6), 0 0 50px rgba(167,139,250,.22)',
          transformOrigin: 'center', animation: 'sb-persona-in .42s var(--md-sys-motion-easing-emphasized)' }}>

        {/* halo header */}
        <div style={{ position: 'relative', padding: '16px 20px 14px', textAlign: 'center', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -54, left: '50%', transform: 'translateX(-50%)', width: 200, height: 160,
            background: 'radial-gradient(circle at 50% 40%, rgba(183,148,246,.42), rgba(167,139,250,.12) 46%, transparent 70%)', pointerEvents: 'none' }} />
          <button onClick={onClose} aria-label="닫기"
            style={{ position: 'absolute', top: 12, right: 12, width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: 'pointer',
              display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.06)', color: '#CFC2F2', zIndex: 2 }}>
            <Icon name="close" size={17} />
          </button>

          <div style={{ position: 'relative', width: 46, height: 46, margin: '2px auto 10px', display: 'grid', placeItems: 'center' }}>
            <span style={{ position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(183,148,246,.5), transparent 68%)', animation: 'sb-dim 3.4s ease-in-out infinite' }} />
            <span style={{ width: 18, height: 18, borderRadius: '50%',
              background: 'radial-gradient(circle,#FFFFFF,#D6C4FF 46%,#A78BFA 86%)',
              boxShadow: '0 0 18px rgba(183,148,246,1), 0 0 38px rgba(167,139,250,.7)' }} />
          </div>

          <div style={{ fontSize: 23, fontWeight: 800, color: '#F1ECFF', marginTop: 4, letterSpacing: '-.01em' }}>{archetype}</div>
          <div style={{ fontSize: 13, color: '#C9B8F2', lineHeight: 1.5, marginTop: 7, wordBreak: 'keep-all' }}>
            “{essence}”
          </div>
        </div>

        <div style={{ padding: '0 18px 18px' }}>
          {/* synthesized read */}
          <div style={{ fontSize: 13, color: '#BFD2EE', lineHeight: 1.6, wordBreak: 'keep-all', textWrap: 'pretty',
            padding: '12px 14px', borderRadius: 13, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)' }}>
            {summary}
          </div>

          {/* Big Five — full pentagon radar (layer B) */}
          <BigFiveRadar five={five} PUR={PUR} />

          {/* dominant domains (layer A) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 7, marginTop: 12 }}>
            {topDomains.map((d) => (
              <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 9999, whiteSpace: 'nowrap',
                background: PURSOFT, border: '1px solid rgba(167,139,250,.3)', fontSize: 12.5, color: '#E6DEFB' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: PUR, boxShadow: `0 0 7px ${PUR}` }} />
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
      <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 9.5, letterSpacing: '.14em',
        color: tone, opacity: .9, margin: '18px 0 10px' }}>{children}</div>
    );
  }
}

window.PersonaCard = PersonaCard;


/* ============================================================
   BigFiveRadar — full 5-trait pentagon (radar) chart.
   ============================================================ */
function BigFiveRadar({ five, PUR }) {
  const size = 184, cx = size / 2, cy = size / 2 + 4, R = 60;
  const N = five.length;
  const ang = (i) => (-90 + i * (360 / N)) * Math.PI / 180;
  const pt = (i, r) => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r];
  const ring = (r) => five.map((_, i) => pt(i, r).join(',')).join(' ');
  const dataPts = five.map((f, i) => pt(i, R * (f.v / 100)).join(',')).join(' ');

  return (
    <div style={{ display: 'grid', placeItems: 'center', marginTop: 4 }}>
      <svg width={size} height={size + 8} viewBox={`0 0 ${size} ${size + 8}`} style={{ overflow: 'visible' }}>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <polygon key={g} points={ring(R * g)} fill="none" stroke="rgba(167,139,250,.18)" strokeWidth={1} />
        ))}
        {five.map((_, i) => {
          const [x, y] = pt(i, R);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(167,139,250,.18)" strokeWidth={1} />;
        })}
        <polygon points={dataPts} fill="rgba(167,139,250,.28)" stroke={PUR} strokeWidth={2} strokeLinejoin="round" />
        {five.map((f, i) => {
          const [x, y] = pt(i, R * (f.v / 100));
          return <circle key={f.k} cx={x} cy={y} r={2.6} fill="#FFFFFF" stroke={PUR} strokeWidth={1.4} />;
        })}
        {five.map((f, i) => {
          const [lx, ly] = pt(i, R + 16);
          const c = Math.cos(ang(i));
          const anchor = Math.abs(c) < 0.3 ? 'middle' : (c > 0 ? 'start' : 'end');
          return (
            <g key={f.k}>
              <text x={lx} y={ly - 3} textAnchor={anchor} fill="#E6DEFB" style={{ fontSize: 11, fontWeight: 600 }}>{f.k}</text>
              <text x={lx} y={ly + 10} textAnchor={anchor} fill={PUR} style={{ fontSize: 10.5, fontFamily: 'var(--md-ref-typeface-mono)' }}>{f.v}</text>
            </g>
          );
        })}
      </svg>
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
  { id: 'dev',      scope: '커리어', icon: 'code',
    role: '1인 개발자',
    roleDesc: '혼자 기획부터 개발·운영까지 짊어지고, 제품을 끝까지 짓는 사람.',
    five: [{ k: '개방', v: 76 }, { k: '성실', v: 68 }, { k: '외향', v: 36 }, { k: '우호', v: 55 }, { k: '신경', v: 34 }],
    person: '눈에 띄기보다 끝까지 짓는 쪽. 새 구조를 즐겨 시도하면서도 꾸준히 밀어붙여요.',
    strengths: ['집요한 완성력', '구조적 사고', '자기주도', '빠른 학습'],
    records: 47, conf: 3 },
  { id: 'provider', scope: '가정',   icon: 'groups',
    role: '가장',
    roleDesc: '가까운 사람의 일상을 떠받치고, 안정과 책임을 먼저 챙기는 사람.',
    five: [{ k: '개방', v: 64 }, { k: '성실', v: 62 }, { k: '외향', v: 44 }, { k: '우호', v: 74 }, { k: '신경', v: 32 }],
    person: '갈등보다 조율로 관계를 단단히 만들어요. 곁에 있는 이의 결을 먼저 읽어요.',
    strengths: ['책임감', '정서적 안정', '배려·조율', '신뢰'],
    records: 33, conf: 2 },
  { id: 'learner',  scope: '성장',   icon: 'travel_explore',
    role: '탐구하는 학습자',
    roleDesc: '새로운 결을 열어보고, 배운 것을 기록해 나를 넓혀가는 사람.',
    five: [{ k: '개방', v: 82 }, { k: '성실', v: 56 }, { k: '외향', v: 48 }, { k: '우호', v: 63 }, { k: '신경', v: 40 }],
    person: '호기심이 가장 큰 동력. 낯선 영역에도 먼저 손을 뻗고, 배운 걸 곱씀어요.',
    strengths: ['지적 호기심', '연결적 사고', '개방성', '성찰'],
    records: 44, conf: 3 },
];

function PersonaDeck({ go }) {
  const PUR = '#B794F6', PURSOFT = 'rgba(167,139,250,.16)';
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
    <div style={{ padding: '14px 0 6px',
      background: 'radial-gradient(120% 90% at 50% 0%, rgba(31,20,56,.9), rgba(11,16,32,0))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 18px 10px' }}>
        <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 9.5, letterSpacing: '.16em', color: PUR, whiteSpace: 'nowrap' }}>
          내 역할
        </span>
        <span style={{ fontSize: 11, color: 'rgba(159,178,208,.8)' }}>· 옆으로 넘겨 보기</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, color: 'rgba(159,178,208,.7)' }}>
          {idx + 1}/{SB_PERSONAS.length}
        </span>
      </div>

      <div ref={ref} onScroll={onScroll}
        style={{ display: 'flex', gap: 12, overflowX: 'auto', scrollSnapType: 'x mandatory',
          padding: '0 18px 4px', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
        {SB_PERSONAS.map((p) => (
          <div key={p.id} style={{ flex: '0 0 100%', scrollSnapAlign: 'center' }}>
            <PCard p={p} go={go} PUR={PUR} PURSOFT={PURSOFT} />
          </div>
        ))}
      </div>

      {/* dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginTop: 12 }}>
        {SB_PERSONAS.map((p, i) => (
          <button key={p.id} aria-label={`${p.scope} 페르소나`} onClick={() => goTo(i)}
            style={{ width: i === idx ? 22 : 7, height: 7, borderRadius: 9999, border: 'none', cursor: 'pointer', padding: 0,
              transition: 'width .25s', background: i === idx ? PUR : 'rgba(167,139,250,.3)' }} />
        ))}
      </div>
    </div>
  );

  function PCard({ p, go, PUR, PURSOFT }) {
    const lbl = (txt, mt) => (
      <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 9, letterSpacing: '.16em',
        color: PUR, opacity: .92, margin: `${mt}px 0 8px` }}>{txt}</div>
    );
    return (
      <div style={{ borderRadius: 20, border: '1px solid rgba(167,139,250,.34)', overflow: 'hidden',
        background: 'linear-gradient(180deg, rgba(31,20,56,.96), rgba(11,16,32,.97))',
        boxShadow: '0 14px 36px rgba(0,0,0,.45), 0 0 34px rgba(167,139,250,.14)' }}>
        {/* header — role identity */}
        <div style={{ position: 'relative', padding: '18px 16px 16px', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -64, left: '50%', transform: 'translateX(-50%)', width: 220, height: 150,
            background: 'radial-gradient(circle at 50% 40%, rgba(183,148,246,.36), transparent 66%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, flex: '0 0 auto', display: 'grid', placeItems: 'center',
              background: PURSOFT, border: '1px solid rgba(167,139,250,.4)' }}>
              <Icon name={p.icon} size={24} style={{ color: '#E6DEFB' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 9999, whiteSpace: 'nowrap',
                background: PURSOFT, border: '1px solid rgba(167,139,250,.3)', fontSize: 10.5, color: '#D9CBF7' }}>
                {p.scope}
              </span>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#F1ECFF', marginTop: 5, letterSpacing: '-.01em' }}>{p.role}</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '0 16px 16px' }}>
          {/* 어떤 역할 */}
          {lbl('어떤 역할', 2)}
          <div style={{ fontSize: 12.5, color: '#C9B8F2', lineHeight: 1.55, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            {p.roleDesc}
          </div>

          {/* Big Five — all 5 dimensions */}
          {lbl('BIG FIVE', 16)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {p.five.map((f) => (
              <div key={f.k} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 28, fontSize: 11.5, color: '#E6DEFB', flex: '0 0 auto' }}>{f.k}</span>
                <div style={{ flex: 1, height: 6, borderRadius: 9999, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
                  <div style={{ width: `${f.v}%`, height: '100%', borderRadius: 9999, background: 'linear-gradient(90deg,#7C6BD6,#B794F6)' }} />
                </div>
                <span style={{ width: 22, textAlign: 'right', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, color: PUR, flex: '0 0 auto' }}>{f.v}</span>
              </div>
            ))}
          </div>

          {/* 어떤 사람 */}
          {lbl('어떤 사람', 16)}
          <div style={{ fontSize: 12, color: '#BFD2EE', lineHeight: 1.55, wordBreak: 'keep-all', textWrap: 'pretty',
            padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)' }}>
            {p.person}
          </div>

          {/* 강점 */}
          {lbl('강점', 16)}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {p.strengths.map((s) => (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 9999, whiteSpace: 'nowrap',
                background: PURSOFT, border: '1px solid rgba(167,139,250,.3)', fontSize: 11.5, color: '#E6DEFB' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: PUR, boxShadow: `0 0 6px ${PUR}` }} />{s}
              </span>
            ))}
          </div>

          {/* provenance + actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 16 }}>
            <Icon name="bubble_chart" size={15} style={{ color: PUR, flex: '0 0 auto' }} />
            <span style={{ fontSize: 11, color: '#9FB2D0', flex: 1, lineHeight: 1.4 }}>{p.records}개 기록 · 신뢰도</span>
            <Dots level={p.conf} color={PUR} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
            <MdButton variant="filled" trailingIcon="north_east" style={{ flex: 1 }} onClick={() => go('northstar')}>문장 다듬기</MdButton>
            <MdButton variant="tonal" icon="ios_share" style={{ flex: 1 }} onClick={() => go('iden')}>내보내기</MdButton>
          </div>
        </div>
      </div>
    );
  }
}

window.PersonaDeck = PersonaDeck;
