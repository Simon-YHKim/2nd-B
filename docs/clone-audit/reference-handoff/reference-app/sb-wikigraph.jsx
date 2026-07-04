/* ============================================================
   2nd-Brain · 위키 노드 그래프 (지식 그래프)
   - 7개 도메인 별 + 별가루(기록) 노드, 북극성 중심
   - 진짜 물리 시뮬레이션: 중심장력 · 반발력 · 링크장력 · 링크거리
   - 노드 드래그 가능 · 확대/축소(드래그 팬 · 휠 · 핀치)
   - 팝업 탭: 필터 / 표시 / 장력
   Export: window.WikiGraph
   ============================================================ */
(function () {
  const { useState, useRef, useEffect, useLayoutEffect, useMemo } = React;

  /* ---- domain palette (그래프에서 도메인 구분용 distinct hue) ---- */
  const DOMAINS = [
    { id: 'career',   name: '커리어',   color: '#6FB1FF', level: 3, line: '무엇을 만들고 쌓아왔나요?' },
    { id: 'finance',  name: '재정',     color: '#5BD6B0', level: 2, line: '돈은 나의 무엇을 말해주나요?' },
    { id: 'relation', name: '관계',     color: '#FF9DB0', level: 3, line: '가까운 사람들과 나는 어떤가요?' },
    { id: 'growth',   name: '성장',     color: '#A78BFA', level: 3, line: '어느 시기가 지금의 나를 만들었나요?' },
    { id: 'health',   name: '건강',     color: '#7BE0A3', level: 2, line: '요즘 내 컨디션과 리듬은요?' },
    { id: 'leisure',  name: '휴식',     color: '#FFCF6E', level: 2, line: '무엇이 나를 쉬게 하나요?' },
    { id: 'catchall', name: '담아내기', color: '#9AA7C7', level: 4, line: '아직 어디에도 못 담은 것들.' },
  ];
  const DCOLOR = Object.fromEntries(DOMAINS.map((d) => [d.id, d.color]));
  const DNAME = Object.fromEntries(DOMAINS.map((d) => [d.id, d.name]));

  const TYPE_ICON = { text: 'edit_note', link: 'link', voice: 'mic', photo: 'photo_camera', todo: 'check_circle' };
  const TYPE_LABEL = { text: '글', link: '링크', voice: '음성', photo: '사진', todo: '할 일' };
  const TYPE_ORDER = ['text', 'link', 'voice', 'photo', 'todo'];

  /* ---- 별가루(기록) — 태그가 도메인을 넘어 겹치며 연결을 만든다 ---- */
  const RECS = [
    // 커리어
    { id: 'c1', d: 'career', type: 'text', date: '2026-06-26', title: '회의에서 먼저 제안을 꺼냈다', tags: ['주도성', '몰입', '발표'],
      body: '기획 회의에서 평소 같으면 묻어뒀을 의견을 먼저 꺼냈다. 손은 떨렸는데, 말하고 나니 의외로 후련했다. 다음엔 좀 더 일찍 손을 들어봐야지.',
      summary: '먼저 의견을 낸 순간을 외향성·주도성 신호로 읽었어요. 최근 2주 ‘먼저 말 꺼냄’ 기록이 3건으로 늘었어요.' },
    { id: 'c2', d: 'career', type: 'todo', date: '2026-06-18', title: '사이드 프로젝트 첫 배포', tags: ['몰입', '성취', '개발'],
      body: '두 달 붙잡고 있던 사이드 프로젝트를 드디어 배포했다. 새벽 두 시. 아무도 안 보지만, 내 손으로 끝까지 밀어붙여 끝냈다는 게 좋다.',
      summary: '몰입해서 끝까지 밀어붙인 작업이에요. ‘성장·몰입’ 태그와 이어져, 일에서 자율성이 높을 때 에너지가 난다는 패턴을 받쳐줘요.' },
    { id: 'c3', d: 'career', type: 'link', date: '2026-06-05', title: '이직 제안 메일 정리', tags: ['커리어', '돈', '선택'],
      body: '헤드헌터 메일을 정리했다. 연봉은 오르는데 하는 일이 지금보다 좁아진다. 돈이냐 의미냐… 일단 적어두고 며칠 더 두고 보기로 했다.',
      summary: '보상(돈)과 의미 사이의 저울질이 담겨 있어요. 재정 별의 ‘여행 적금’ 기록과 같은 ‘돈’ 맥락으로 묶었어요.' },
    // 재정
    { id: 'f1', d: 'finance', type: 'todo', date: '2026-06-20', title: '구독 6개 점검·2개 해지', tags: ['돈', '정리'],
      body: '안 쓰는 구독 여섯 개를 들여다보고 두 개를 해지했다. 월 이만 원 정도. 작지만 새는 걸 스스로 막았다는 감각이 좋다.',
      summary: '새는 지출을 스스로 점검한 기록이에요. 성실성 신호로 읽었고, ‘정리’ 태그가 담아내기 별과도 닿아요.' },
    { id: 'f2', d: 'finance', type: 'text', date: '2026-06-12', title: '6월 지출 회고', tags: ['돈', '회고'],
      body: '이번 달은 카페랑 여가에 평소보다 많이 썼다. 스트레스를 돈으로 푸는 버릇이 있는 것 같다. 다음 달은 항목별 한도를 정해보자.',
      summary: '한 달의 돈 흐름을 돌아본 메모예요. 카페·여가 지출이 늘어, 휴식 별의 기록들과 같은 시기에 몰려 있어요.' },
    { id: 'f3', d: 'finance', type: 'todo', date: '2026-05-30', title: '여행 적금 시작', tags: ['돈', '여행', '계획'],
      body: '매달 이십만 원씩 여행 적금을 시작했다. 일 년 뒤 어딘가로 떠날 나를 위해. 미래의 나에게 미리 보내두는 돈이라고 생각하니 덜 아깝다.',
      summary: '미래의 나를 위한 준비예요. 휴식 별의 ‘등산·여행’ 기록과 ‘여행’ 태그로 이어져요.' },
    // 관계
    { id: 'r1', d: 'relation', type: 'todo', date: '2026-06-27', title: '엄마에게 전화하기', tags: ['가족', '사람'],
      body: '엄마한테 전화했다. 별일 없냐는 말에 그냥 목소리 들으려고 했다니까 웃으셨다. 용건 없이 거는 전화를 더 자주 해야지.',
      summary: '가까운 사람에게 먼저 다가간 기록이에요. 관계 별이 어두워질 때 이런 행동이 별을 다시 밝혀요.' },
    { id: 'r2', d: 'relation', type: 'photo', date: '2026-06-15', title: '오랜 친구와 커피', tags: ['사람', '카페'],
      body: '오랜만에 본 친구. 두 시간이 십 분처럼 지나갔다. 사람한테 충전된다는 게 이런 거구나, 오랜만에 느꼈다.',
      summary: '사람을 만나 충전된 시간이에요. ‘카페’ 태그로 휴식 별의 ‘멍 때리기’와 닿아, 쉼의 결이 사람과 함께일 때 더 깊다는 신호예요.' },
    { id: 'r3', d: 'relation', type: 'text', date: '2026-06-08', title: '팀 동료와 갈등 정리', tags: ['사람', '불안'],
      body: '불편했던 동료와 결국 마주 앉아 얘기했다. 피하고만 싶었는데, 막상 꺼내니 별일 아니었다. 며칠 마음에 얹혀 있던 게 풀렸다.',
      summary: '불편을 회피하지 않고 마주한 기록이에요. 건강 별의 ‘불안’ 기록과 같은 감정선을 공유해요.' },
    // 성장
    { id: 'g1', d: 'growth', type: 'link', date: '2026-06-22', title: '칼 뉴포트 ‘몰입’ 글 메모', tags: ['독서', '몰입'],
      body: '딥 워크에 관한 글. 방해 없는 구십 분이 산만한 하루보다 낫다는 문장에 밑줄. 생각해보면 내 배포 작업도 그런 구십 분들이 모인 거였다.',
      summary: '몰입을 다룬 글에서 밑줄 친 부분이에요. 커리어 별의 ‘배포·제안’ 기록과 ‘몰입’으로 강하게 연결돼요.' },
    { id: 'g2', d: 'growth', type: 'text', date: '2026-06-19', title: '새벽 글쓰기 7일째', tags: ['글쓰기', '루틴'],
      body: '새벽 글쓰기 이레째. 잘 써지진 않지만 안 빠지고 책상에 앉는다는 것 자체가 중요한 것 같다. 꾸준함이 천천히 쌓이는 느낌.',
      summary: '꾸준함이 쌓이는 루틴이에요. 성실성·개방성 신호가 함께 또렷해지는 중이에요.' },
    { id: 'g3', d: 'growth', type: 'photo', date: '2026-06-10', title: '서점에서 산 책 표지', tags: ['독서', '영감'],
      body: '충동적으로 산 책. 내용도 모르고 표지가 좋아서 집었다. 아직 안 읽었지만, 이 끌림이 다음 관심사의 씨앗일지도 모르겠다.',
      summary: '새 관심사의 씨앗이에요. ‘독서’ 태그로 다른 학습 기록과 군집을 이뤄요.' },
    // 건강
    { id: 'h1', d: 'health', type: 'text', date: '2026-06-25', title: '수면 5.6시간 기록', tags: ['수면', '컨디션'],
      body: '또 여섯 시간을 못 잤다. 이렇게 이 주째다. 머리가 멍하고 사소한 일에도 예민해진다. 알면서도 자꾸 늦게 눕는다.',
      summary: '2주째 평균 수면이 6시간 아래예요. 휴식 별의 ‘쉼’ 기록과 함께 보면 회복이 부족한 신호로 읽혀요.' },
    { id: 'h2', d: 'health', type: 'todo', date: '2026-06-17', title: '달리기 3km', tags: ['운동', '컨디션'],
      body: '오랜만에 삼 킬로미터를 뛰었다. 숨은 찼지만 끝나고 나니 머리가 맑아졌다. 몸을 움직이면 잡생각이 확실히 줄어든다.',
      summary: '몸을 움직여 컨디션을 끌어올린 기록이에요. ‘운동’ 태그로 휴식 별의 등산과 이어져요.' },
    { id: 'h3', d: 'health', type: 'voice', date: '2026-06-09', title: '요즘 자주 불안하다', tags: ['불안', '마음'],
      body: '(음성 메모) 요즘 이유 없이 불안하다. 가슴이 답답하고 잠도 얕다. 일 때문인지 사람 때문인지, 뭐가 먼저인지도 잘 모르겠다.',
      summary: '신경성 신호예요. 관계 별의 ‘갈등 정리’와 같은 시기에 모여, 사람 사이 긴장이 마음에 남았을 수 있어요.' },
    // 휴식
    { id: 'l1', d: 'leisure', type: 'photo', date: '2026-06-21', title: '주말 등산 사진', tags: ['운동', '여행', '쉼'],
      body: '주말 등산. 정상에서 본 능선이 좋았다. 가만히 누워 쉬는 것보다, 몸을 쓰고 나서 쉬는 게 나한텐 더 맞는 것 같다.',
      summary: '몸을 쓰며 쉰 하루예요. 건강 별의 달리기, 재정 별의 여행 적금과 태그가 겹쳐 ‘활동적인 쉼’을 좋아하는 결을 보여줘요.' },
    { id: 'l2', d: 'leisure', type: 'link', date: '2026-06-14', title: '새 플레이리스트', tags: ['음악', '쉼'],
      body: '요즘 듣는 곡들을 모아 플레이리스트를 만들었다. 일할 때도, 걸을 때도 이걸 튼다. 나한텐 소리로 쉬는 방식이 따로 있는 모양이다.',
      summary: '소리로 쉬는 방식이에요. 혼자 회복하는 쉼의 한 갈래로 묶었어요.' },
    { id: 'l3', d: 'leisure', type: 'text', date: '2026-06-07', title: '카페에서 멍 때리기', tags: ['카페', '쉼', '수면'],
      body: '카페 구석에서 한 시간을 멍하니 보냈다. 아무것도 안 했는데 이상하게 채워졌다. 가끔은 이런 텅 빈 시간이 필요한 것 같다.',
      summary: '아무것도 안 하며 채운 시간이에요. ‘카페’로 관계 별과, ‘수면’으로 건강 별과 닿는 교차점이에요.' },
    // 담아내기
    { id: 'x1', d: 'catchall', type: 'voice', date: '2026-06-24', title: '산책하며 떠오른 생각 (0:42)', tags: ['미분류', '영감'],
      body: '(음성 0:42) 걷다가 문득 떠오른 생각인데, 지금 정리하긴 어렵고… 흘려보내기엔 아까워서 일단 남겨둔다. 나중에 다시 들어보자.',
      summary: '아직 어느 별에도 닿지 못한 조각이에요. ‘영감’ 태그로 성장 별의 책 기록과 묶일 가능성이 보여요.' },
    { id: 'x2', d: 'catchall', type: 'link', date: '2026-06-11', title: '스크랩: 우주 사진', tags: ['미분류', '영감'],
      body: '왜 저장했는지 모르겠는 우주 사진. 그냥 끌려서 담았다. 이런 정체 모를 끌림이 쌓이다 보면 언젠가 뭔가 보이지 않을까.',
      summary: '왜 저장했는지 아직 모를 조각이에요. 정리하면 성장이나 휴식 별로 옮겨갈 수 있어요.' },
  ];

  const fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${+m}월 ${+d}일`; };
  const today = new Date('2026-06-28');
  const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

  /* ---- deterministic radial seed layout (시뮬레이션 시작 위치) ---- */
  function buildGraph() {
    const W = 760, H = 600, cx = W / 2, cy = H / 2;
    const nodes = [{ id: 'polaris', kind: 'polaris', x: cx, y: cy }];
    const domRing = 188;
    DOMAINS.forEach((dom, i) => {
      const ang = (i / DOMAINS.length) * Math.PI * 2 - Math.PI / 2;
      const dx = cx + Math.cos(ang) * domRing, dy = cy + Math.sin(ang) * domRing;
      nodes.push({ id: dom.id, kind: 'domain', x: dx, y: dy, dom, ang });
      const recs = RECS.filter((r) => r.d === dom.id);
      const spread = Math.min(1.5, 0.5 + recs.length * 0.28);
      recs.forEach((r, k) => {
        const t = recs.length === 1 ? 0 : (k / (recs.length - 1) - 0.5);
        const ra = ang + t * spread;
        const rr = 96 + (k % 2) * 16;
        nodes.push({ id: r.id, kind: 'record', x: dx + Math.cos(ra) * rr, y: dy + Math.sin(ra) * rr, rec: r, domId: dom.id });
      });
    });
    const pos = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const edges = [];
    DOMAINS.forEach((dom) => edges.push({ a: 'polaris', b: dom.id, kind: 'spine' }));
    RECS.forEach((r) => edges.push({ a: r.d, b: r.id, kind: 'branch', color: DCOLOR[r.d] }));
    for (let i = 0; i < RECS.length; i++) {
      for (let j = i + 1; j < RECS.length; j++) {
        const A = RECS[i], B = RECS[j];
        if (A.d === B.d) continue;
        const shared = A.tags.filter((t) => B.tags.includes(t));
        if (shared.length) edges.push({ a: A.id, b: B.id, kind: 'link', tag: shared[0] });
      }
    }
    return { W, H, cx, cy, nodes, edges, pos };
  }

  /* ---- graph physics/display config ---- */
  const DEFAULT_CFG = { centerF: 0.45, repelF: 0.45, linkF: 0.55, linkDist: 0.45, nodeScale: 1, linkScale: 1, arrows: false };
  const CFG_KEY = 'sb-graph-cfg-v1';
  function loadCfg() {
    try { const j = JSON.parse(localStorage.getItem(CFG_KEY)); if (j && typeof j === 'object') return { ...DEFAULT_CFG, ...j }; } catch (e) {}
    return { ...DEFAULT_CFG };
  }

  function WikiGraph({ go, labels, setLabel = () => {} }) {
    const C = window.SB.C;
    const G = useMemo(buildGraph, []);
    const vpRef = useRef(null);
    const worldRef = useRef(null);
    const gesture = useRef({ pts: new Map(), dragging: false, last: null, moved: false, pinchDist: 0, node: null });
    const [tf, setTf] = useState({ x: 0, y: 0, k: 0.5 });
    const tfRef = useRef(tf);
    const fitted = useRef(false);
    const [sel, setSel] = useState(null);

    // filters
    const [doms, setDoms] = useState(() => new Set(DOMAINS.map((d) => d.id)));
    const [types, setTypes] = useState(() => new Set(TYPE_ORDER));
    const [kw, setKw] = useState('');
    const [dateMode, setDateMode] = useState('all'); // all | 7 | 30 | range
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [showTagLinks, setShowTagLinks] = useState(true);
    const [filterOpen, setFilterOpen] = useState(false);
    const [tab, setTab] = useState('filter'); // filter | display | force

    // physics/display config
    const [cfg, setCfg] = useState(loadCfg);
    const cfgRef = useRef(cfg);
    useEffect(() => { cfgRef.current = cfg; if (sim.current) sim.current.alpha = Math.max(sim.current.alpha || 0, 0.5); try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} }, [cfg]);
    const setC = (patch) => setCfg((c) => ({ ...c, ...patch }));

    const clampK = (k) => Math.max(0.4, Math.min(3.4, k));
    const apply = (t) => { if (worldRef.current) worldRef.current.style.transform = `translate(${t.x}px,${t.y}px) scale(${t.k})`; };

    // initial fit — center the graph in a stable region
    useLayoutEffect(() => {
      const vp = vpRef.current; if (!vp || fitted.current) return;
      const r = vp.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const FIT = 560;
      const k = clampK(Math.min(r.width / FIT, r.height / FIT) * 0.96);
      const t = { k, x: r.width / 2 - G.cx * k, y: r.height / 2 - G.cy * k };
      fitted.current = true; setTf(t); tfRef.current = t; apply(t);
    });
    useEffect(() => { tfRef.current = tf; apply(tf); }, [tf]);

    // ---- force simulation state ----
    const nodeEls = useRef({});
    const edgeEls = useRef([]);
    const sim = useRef(null);
    const reduceMotion = useRef(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const float = useMemo(() => {
      let s = 20210; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      const o = {};
      G.nodes.forEach((n) => { o[n.id] = { sx: 0.18 + rnd() * 0.22, sy: 0.18 + rnd() * 0.22, px: rnd() * 6.28, py: rnd() * 6.28 }; });
      return o;
    }, [G]);

    // init sim positions from seed layout
    useEffect(() => {
      const pos = {}, vel = {};
      G.nodes.forEach((n) => { pos[n.id] = { x: n.x, y: n.y }; vel[n.id] = { vx: 0, vy: 0 }; });
      sim.current = { pos, vel, alpha: 1, fixed: { polaris: { x: G.cx, y: G.cy } } };
      pos.polaris = { x: G.cx, y: G.cy };
    }, [G]);

    const reheat = (a) => { if (sim.current) sim.current.alpha = Math.max(sim.current.alpha || 0, a); };

    // simulation loop
    useEffect(() => {
      if (!sim.current) return;
      const ids = G.nodes.map((n) => n.id);
      const n = ids.length;
      let raf;
      const DRIFT_AMP = 2.4; // px — barely-there breathing on top of the settled layout
      const tick = (now) => {
        const S = sim.current; const { pos, vel, fixed } = S;
        const alpha = S.alpha == null ? 0 : S.alpha;
        const active = alpha > 0.004; // run heavy physics only while settling / re-warmed
        if (active) {
          const c = cfgRef.current;
          const CENTER = c.centerF * 0.045;
          const REPEL = 300 + c.repelF * 3000;
          const LINKK = 0.01 + c.linkF * 0.13;
          const LDIST = 40 + c.linkDist * 110;
          const DAMP = 0.84;
          const fx = {}, fy = {};
          for (let i = 0; i < n; i++) { const id = ids[i]; fx[id] = 0; fy[id] = 0; }
          // center pull
          for (let i = 0; i < n; i++) {
            const id = ids[i]; const p = pos[id];
            fx[id] += (G.cx - p.x) * CENTER;
            fy[id] += (G.cy - p.y) * CENTER;
          }
          // pairwise repel
          for (let i = 0; i < n; i++) {
            const a = ids[i], pa = pos[a];
            for (let j = i + 1; j < n; j++) {
              const b = ids[j], pb = pos[b];
              let dx = pa.x - pb.x, dy = pa.y - pb.y;
              let d2 = dx * dx + dy * dy; if (d2 < 1) { d2 = 1; dx = 0.6; }
              const dist = Math.sqrt(d2);
              const f = REPEL / Math.max(d2, 80);
              const ux = dx / dist, uy = dy / dist;
              fx[a] += ux * f; fy[a] += uy * f; fx[b] -= ux * f; fy[b] -= uy * f;
            }
          }
          // link springs
          const E = G.edges;
          for (let i = 0; i < E.length; i++) {
            const e = E[i]; const pa = pos[e.a], pb = pos[e.b]; if (!pa || !pb) continue;
            const rest = LDIST * (e.kind === 'spine' ? 1.95 : e.kind === 'branch' ? 1.18 : 2.4);
            let dx = pb.x - pa.x, dy = pb.y - pa.y;
            let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
            const f = (dist - rest) * LINKK;
            const ux = dx / dist, uy = dy / dist;
            fx[e.a] += ux * f; fy[e.a] += uy * f; fx[e.b] -= ux * f; fy[e.b] -= uy * f;
          }
          // integrate — movement scaled by alpha so the layout eases to rest
          for (let i = 0; i < n; i++) {
            const id = ids[i];
            if (fixed[id]) { const fp = fixed[id]; pos[id].x = fp.x; pos[id].y = fp.y; vel[id].vx = 0; vel[id].vy = 0; continue; }
            const v = vel[id];
            v.vx = (v.vx + fx[id]) * DAMP; v.vy = (v.vy + fy[id]) * DAMP;
            v.vx = Math.max(-10, Math.min(10, v.vx)); v.vy = Math.max(-10, Math.min(10, v.vy));
            pos[id].x += v.vx * alpha; pos[id].y += v.vy * alpha;
          }
          S.alpha = alpha * 0.96; // cool toward rest (layout)
        }
        // gentle perpetual float — a visual overlay on the settled positions, NOT a force,
        // so it never compounds through the springs. center star & dragged node stay steady.
        const T = now / 1000;
        const dispX = {}, dispY = {};
        for (let i = 0; i < n; i++) {
          const id = ids[i]; const p = pos[id];
          if (fixed[id] || reduceMotion.current) { dispX[id] = p.x; dispY[id] = p.y; continue; }
          const f = float[id];
          dispX[id] = p.x + Math.sin(T * f.sx * 2.3 + f.px) * DRIFT_AMP;
          dispY[id] = p.y + Math.sin(T * f.sy * 2.3 + f.py) * DRIFT_AMP;
        }
        // apply to DOM (settled position + drift)
        for (let i = 0; i < G.nodes.length; i++) {
          const nd = G.nodes[i]; const el = nodeEls.current[nd.id];
          if (el) el.style.transform = `translate(calc(-50% + ${dispX[nd.id] - nd.x}px), calc(-50% + ${dispY[nd.id] - nd.y}px))`;
        }
        const EL = edgeEls.current;
        for (let i = 0; i < EL.length; i++) {
          const ent = EL[i]; if (!ent) continue;
          const ax = dispX[ent.a], ay = dispY[ent.a], bx = dispX[ent.b], by = dispY[ent.b];
          if (ax == null || bx == null) continue;
          let x2 = bx, y2 = by;
          if (ent.kind === 'spine') { const dx = bx - ax, dy = by - ay, L = Math.sqrt(dx * dx + dy * dy) || 1, s = (L - 13) / L; x2 = ax + dx * s; y2 = ay + dy * s; }
          ent.el.setAttribute('x1', ax); ent.el.setAttribute('y1', ay); ent.el.setAttribute('x2', x2); ent.el.setAttribute('y2', y2);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [G, float]);

    // ---- pointer: pan / pinch / node-drag ----
    const vpPoint = (e) => { const r = vpRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const toWorld = (clientX, clientY) => { const r = vpRef.current.getBoundingClientRect(); const t = tfRef.current; return { x: (clientX - r.left - t.x) / t.k, y: (clientY - r.top - t.y) / t.k }; };
    const zoomAt = (factor, px, py) => setTf((t) => { const k = clampK(t.k * factor); const r = k / t.k; return { k, x: px - (px - t.x) * r, y: py - (py - t.y) * r }; });

    const onWheel = (e) => { e.preventDefault(); const p = vpPoint(e); zoomAt(e.deltaY < 0 ? 1.12 : 0.89, p.x, p.y); };

    const onNodeDown = (e, id) => {
      e.stopPropagation();
      const g = gesture.current;
      g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { vpRef.current.setPointerCapture(e.pointerId); } catch (x) {}
      g.node = id; g.dragging = false; g.moved = false; g.last = { x: e.clientX, y: e.clientY };
      if (sim.current && id !== 'polaris') sim.current.fixed[id] = { ...sim.current.pos[id] };
    };
    const onDown = (e) => {
      const g = gesture.current; g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { vpRef.current.setPointerCapture(e.pointerId); } catch (x) {}
      if (g.pts.size === 1) { g.dragging = true; g.last = { x: e.clientX, y: e.clientY }; g.moved = false; g.node = null; }
      else if (g.pts.size === 2) { const a = [...g.pts.values()]; g.pinchDist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); g.dragging = false; g.node = null; }
    };
    const onMove = (e) => {
      const g = gesture.current; if (!g.pts.has(e.pointerId)) return;
      const prev = g.pts.get(e.pointerId);
      g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (g.node) {
        if (Math.abs(e.clientX - g.last.x) + Math.abs(e.clientY - g.last.y) > 3) g.moved = true;
        if (g.node !== 'polaris' && sim.current) { const w = toWorld(e.clientX, e.clientY); sim.current.fixed[g.node] = w; sim.current.pos[g.node] = { ...w }; reheat(0.5); }
        return;
      }
      if (g.pts.size === 2) {
        const a = [...g.pts.values()]; const dist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        if (g.pinchDist) { const r = vpRef.current.getBoundingClientRect(); zoomAt(dist / g.pinchDist, (a[0].x + a[1].x) / 2 - r.left, (a[0].y + a[1].y) / 2 - r.top); }
        g.pinchDist = dist; return;
      }
      if (g.dragging && g.last) {
        const dx = e.clientX - g.last.x, dy = e.clientY - g.last.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true;
        g.last = { x: e.clientX, y: e.clientY };
        setTf((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
      }
    };
    const onUp = (e) => {
      const g = gesture.current;
      const wasNode = g.node;
      g.pts.delete(e.pointerId);
      try { vpRef.current.releasePointerCapture(e.pointerId); } catch (x) {}
      if (wasNode) {
        if (wasNode !== 'polaris' && sim.current) { delete sim.current.fixed[wasNode]; reheat(0.35); }
        if (!g.moved) setSel((s) => (s === wasNode ? s : wasNode));
        g.node = null; if (g.pts.size === 0) g.dragging = false; return;
      }
      if (g.pts.size < 2) g.pinchDist = 0;
      if (g.pts.size === 0) { g.dragging = false; if (!g.moved && e.target === e.currentTarget) setSel(null); }
      else if (g.pts.size === 1) { const only = [...g.pts.values()][0]; g.dragging = true; g.last = { x: only.x, y: only.y }; }
    };

    // ---- filters ----
    const inDate = (iso) => {
      if (dateMode === 'all') return true;
      if (dateMode === '7') return iso >= daysAgo(7);
      if (dateMode === '30') return iso >= daysAgo(30);
      if (dateMode === 'range') { if (from && iso < from) return false; if (to && iso > to) return false; return true; }
      return true;
    };
    const kwl = kw.trim().toLowerCase();
    const recMatch = (r) => {
      if (!doms.has(r.d)) return false;
      if (!types.has(r.type)) return false;
      if (!inDate(r.date)) return false;
      if (kwl) { const hay = (r.title + ' ' + r.tags.join(' ') + ' ' + r.summary).toLowerCase(); if (!hay.includes(kwl)) return false; }
      return true;
    };
    const visible = useMemo(() => {
      const v = {};
      RECS.forEach((r) => { v[r.id] = recMatch(r); });
      DOMAINS.forEach((d) => { v[d.id] = doms.has(d.id); });
      v.polaris = true;
      return v;
    }, [doms, types, kwl, dateMode, from, to]);
    const shown = RECS.filter((r) => visible[r.id]).length;
    const filtersOn = doms.size < DOMAINS.length || types.size < TYPE_ORDER.length || !!kwl || dateMode !== 'all';
    const filterCount = (doms.size < DOMAINS.length ? 1 : 0) + (types.size < TYPE_ORDER.length ? 1 : 0) + (kwl ? 1 : 0) + (dateMode !== 'all' ? 1 : 0);

    const selNode = sel ? G.pos[sel] : null;
    const toggleDom = (id) => setDoms((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x.size ? x : new Set(DOMAINS.map((d) => d.id)); });
    const toggleType = (id) => setTypes((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x.size ? x : new Set(TYPE_ORDER); });
    const resetFilters = () => { setKw(''); setDoms(new Set(DOMAINS.map((d) => d.id))); setTypes(new Set(TYPE_ORDER)); setDateMode('all'); setFrom(''); setTo(''); };
    const gl = labels && labels.mode ? labels : { mode: 'zoom', threshold: 0.9 };
    const labelsOn = gl.mode === 'always' ? true : gl.mode === 'off' ? false : tf.k >= gl.threshold;
    const ls = cfg.linkScale, nsc = cfg.nodeScale;

    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div ref={vpRef} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          style={{ position: 'relative', flex: 1, minHeight: 220, overflow: 'hidden', touchAction: 'none', cursor: 'grab',
            background: 'radial-gradient(120% 70% at 50% 26%,rgba(26,72,120,.5) 0%,rgba(11,33,66,.3) 42%,#070A13 76%)' }}>
          {/* deep-space neural field — identical backdrop to the 별자리 home (fixed, does not pan) */}
          {window.NeuralField && <window.NeuralField style={{ zIndex: 0 }} />}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
            background: 'radial-gradient(circle at 50% 30%,transparent 0 40%,rgba(7,10,19,.3) 72%,rgba(7,10,19,.62) 100%)' }} />
          <div ref={worldRef} style={{ position: 'absolute', top: 0, left: 0, width: G.W, height: G.H, transformOrigin: '0 0', zIndex: 2 }}>
            <svg width={G.W} height={G.H} viewBox={`0 0 ${G.W} ${G.H}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
              <defs>
                <marker id="wg-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5.4" markerHeight="5.4" orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" fill="rgba(180,158,255,.8)" />
                </marker>
              </defs>
              {G.edges.map((e, i) => {
                const a = G.pos[e.a], b = G.pos[e.b]; if (!a || !b) return null;
                const vis = visible[e.a] && visible[e.b];
                const reg = (el) => { edgeEls.current[i] = el ? { el, a: e.a, b: e.b, kind: e.kind } : null; };
                if (e.kind === 'spine') return <line key={i} ref={reg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(167,139,250,.32)" strokeWidth={1.4 * ls} opacity={vis ? 1 : 0.1} markerEnd={cfg.arrows ? 'url(#wg-arrow)' : undefined} />;
                if (e.kind === 'branch') return <line key={i} ref={reg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={e.color} strokeWidth={1.2 * ls} opacity={vis ? 0.5 : 0.07} />;
                return <line key={i} ref={reg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#7FE3FF" strokeWidth={1 * ls} strokeDasharray="3 4" opacity={!showTagLinks ? 0 : vis ? 0.42 : 0.05} />;
              })}
            </svg>
            <GNode node={G.pos.polaris} selected={sel === 'polaris'} showLabel={labelsOn || sel === 'polaris'} scale={nsc} reg={(el) => (nodeEls.current.polaris = el)} onDown={onNodeDown} />
            {G.nodes.filter((nd) => nd.kind !== 'polaris').map((nd) => (
              <GNode key={nd.id} node={nd} selected={sel === nd.id} dim={!visible[nd.id]} showLabel={labelsOn || sel === nd.id} scale={nsc} reg={(el) => (nodeEls.current[nd.id] = el)} onDown={onNodeDown} />
            ))}
          </div>

          {/* filter trigger */}
          <button onClick={() => { setTab('filter'); setFilterOpen(true); }} onPointerDown={(e) => e.stopPropagation()} className="md-interactive"
            style={{ position: 'absolute', left: 10, bottom: 10, zIndex: 6, display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px 0 11px', borderRadius: 9999, cursor: 'pointer', whiteSpace: 'nowrap',
              border: `1px solid ${filtersOn ? '#9DC2FF' : 'rgba(143,170,220,.4)'}`, background: 'rgba(10,16,28,.82)', color: filtersOn ? '#BFD4FF' : '#CFE6FF', backdropFilter: 'blur(4px)' }}>
            <span className="md-state" /><Icon name="tune" size={17} />
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>필터</span>
            {filterCount > 0 && <span style={{ minWidth: 16, height: 16, padding: '0 4px', borderRadius: 9999, background: C('primary'), color: C('on-primary'), fontSize: 10, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{filterCount}</span>}
          </button>

          {/* count */}
          <span style={{ position: 'absolute', right: 10, bottom: 10, zIndex: 6, whiteSpace: 'nowrap', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, fontWeight: 700, color: '#BFE7FF',
            background: 'rgba(10,16,28,.7)', borderRadius: 9999, padding: '4px 10px', backdropFilter: 'blur(4px)' }}>
            {filtersOn ? `${shown}/${RECS.length}` : RECS.length} 별가루
          </span>

          {/* detail sheet */}
          {selNode && <DetailSheet node={selNode} C={C} go={go} onClose={() => setSel(null)} />}

          {/* control popup (tabs) */}
          {filterOpen && (
            <div onPointerDown={(e) => e.stopPropagation()} style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
              <div onClick={() => setFilterOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)' }} />
              <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, borderRadius: 20, padding: 16, background: 'rgba(14,19,30,.98)',
                border: `1px solid ${C('outline-variant')}`, boxShadow: '0 -8px 30px rgba(0,0,0,.55)', backdropFilter: 'blur(10px)', maxHeight: '94%', overflowY: 'auto' }}>
                {/* tabs + close */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ flex: 1, display: 'flex', background: 'rgba(255,255,255,.05)', borderRadius: 9999, padding: 3, gap: 2 }}>
                    {[['filter', '필터'], ['display', '표시'], ['force', '장력']].map(([id, lb]) => {
                      const on = tab === id;
                      return (
                        <button key={id} onClick={() => setTab(id)} className="md-interactive"
                          style={{ position: 'relative', flex: 1, height: 34, borderRadius: 9999, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                            background: on ? C('primary') : 'transparent', color: on ? C('on-primary') : 'rgba(200,220,255,.7)' }}>
                          <span className="md-state" />{lb}{id === 'filter' && filterCount > 0 ? ` ${filterCount}` : ''}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => setFilterOpen(false)} aria-label="닫기" style={{ width: 32, height: 32, flex: '0 0 auto', borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.06)', color: 'rgba(220,230,255,.8)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon name="close" size={18} /></button>
                </div>

                {/* ===== FILTER TAB ===== */}
                {tab === 'filter' && <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 12px', borderRadius: 12, background: 'rgba(255,255,255,.06)', marginBottom: 16 }}>
                    <Icon name="search" size={18} style={{ color: 'rgba(200,220,255,.6)', flex: '0 0 auto' }} />
                    <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="제목·태그·내용 검색"
                      style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', color: '#EAF2FF', fontFamily: 'var(--md-ref-typeface-plain)', fontSize: 14 }} />
                    {kw && <button onClick={() => setKw('')} aria-label="지우기" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(200,220,255,.7)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><Icon name="close" size={15} /></button>}
                  </div>

                  <div className="md-label-medium" style={{ color: 'rgba(200,220,255,.65)', marginBottom: 8 }}>별 · 영역 {doms.size < DOMAINS.length ? `(${doms.size}/${DOMAINS.length})` : ''}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 18 }}>
                    {DOMAINS.map((d) => {
                      const on = doms.has(d.id);
                      return (
                        <button key={d.id} onClick={() => toggleDom(d.id)} className="md-interactive"
                          style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 13px',
                            borderRadius: 9999, cursor: 'pointer', border: `1.5px solid ${on ? d.color : 'rgba(143,170,220,.3)'}`, background: on ? d.color + '22' : 'transparent' }}>
                          <span className="md-state" />
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, opacity: on ? 1 : 0.4, boxShadow: on ? `0 0 6px ${d.color}` : 'none' }} />
                          <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: on ? '#EAF2FF' : 'rgba(200,220,255,.6)' }}>{d.name}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="md-label-medium" style={{ color: 'rgba(200,220,255,.65)', marginBottom: 8 }}>유형 {types.size < TYPE_ORDER.length ? `(${types.size}/${TYPE_ORDER.length})` : ''}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 18 }}>
                    {TYPE_ORDER.map((tp) => {
                      const on = types.has(tp);
                      return (
                        <button key={tp} onClick={() => toggleType(tp)} className="md-interactive"
                          style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px',
                            borderRadius: 9999, cursor: 'pointer', border: `1.5px solid ${on ? 'rgba(143,208,242,.8)' : 'rgba(143,170,220,.3)'}`, background: on ? 'rgba(143,208,242,.16)' : 'transparent' }}>
                          <span className="md-state" />
                          <Icon name={TYPE_ICON[tp]} size={15} style={{ color: on ? '#BFE7FF' : 'rgba(200,220,255,.5)' }} />
                          <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: on ? '#EAF2FF' : 'rgba(200,220,255,.6)' }}>{TYPE_LABEL[tp]}</span>
                        </button>
                      );
                    })}
                  </div>

                  <ToggleRow C={C} label="태그 연결선 표시" sub="별가루끼리 공유 태그를 잇는 점선" on={showTagLinks} onToggle={() => setShowTagLinks((v) => !v)} />

                  <div className="md-label-medium" style={{ color: 'rgba(200,220,255,.65)', margin: '14px 0 8px' }}>기간</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[['all', '전체'], ['7', '최근 7일'], ['30', '최근 30일'], ['range', '기간 지정']].map(([id, lb]) => {
                      const on = dateMode === id;
                      return (
                        <button key={id} onClick={() => setDateMode(id)} className="md-interactive"
                          style={{ position: 'relative', height: 34, padding: '0 14px', borderRadius: 9999, cursor: 'pointer',
                            border: `1px solid ${on ? 'transparent' : 'rgba(143,170,220,.3)'}`, background: on ? C('primary') : 'transparent',
                            color: on ? C('on-primary') : 'rgba(200,220,255,.7)', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          <span className="md-state" />{lb}
                        </button>
                      );
                    })}
                  </div>
                  {dateMode === 'range' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                      <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)}
                        style={{ colorScheme: 'dark', flex: 1, border: '1px solid rgba(143,170,220,.3)', background: 'rgba(255,255,255,.05)', color: '#EAF2FF', borderRadius: 10, padding: '8px 10px', fontSize: 13, fontFamily: 'var(--md-ref-typeface-plain)' }} />
                      <span style={{ color: 'rgba(200,220,255,.6)', fontSize: 13 }}>~</span>
                      <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)}
                        style={{ colorScheme: 'dark', flex: 1, border: '1px solid rgba(143,170,220,.3)', background: 'rgba(255,255,255,.05)', color: '#EAF2FF', borderRadius: 10, padding: '8px 10px', fontSize: 13, fontFamily: 'var(--md-ref-typeface-plain)' }} />
                    </div>
                  )}

                  {filtersOn && <button onClick={resetFilters} className="md-interactive" style={{ position: 'relative', width: '100%', height: 38, marginTop: 16, borderRadius: 10, border: '1px solid rgba(143,170,220,.3)', background: 'transparent', color: '#9DC2FF', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}><span className="md-state" />필터 초기화</button>}
                </div>}

                {/* ===== DISPLAY TAB ===== */}
                {tab === 'display' && <div>
                  <Slider label="노드 크기" value={cfg.nodeScale} min={0.7} max={1.6} step={0.05} onChange={(v) => setC({ nodeScale: v })} fmt={(v) => '×' + v.toFixed(2)} />
                  <Slider label="연결선 두께" value={cfg.linkScale} min={0.4} max={2.4} step={0.1} onChange={(v) => setC({ linkScale: v })} fmt={(v) => '×' + v.toFixed(1)} />
                  <ToggleRow C={C} label="화살표 표시" sub="북극성 → 별 방향을 화살표로" on={cfg.arrows} onToggle={() => setC({ arrows: !cfg.arrows })} />

                  {/* 별 이름 표시 — 그래프에서 바로 조절 */}
                  <div className="md-label-medium" style={{ color: 'rgba(200,220,255,.7)', margin: '18px 0 8px' }}>별 이름 표시</div>
                  <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,.05)', borderRadius: 9999, padding: 3 }}>
                    {[['always', '항상'], ['zoom', '확대했을 때'], ['off', '숨김']].map(([id, lb]) => {
                      const on = gl.mode === id;
                      return (
                        <button key={id} onClick={() => setLabel('mode', id)} className="md-interactive"
                          style={{ position: 'relative', flex: 1, height: 34, borderRadius: 9999, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
                            background: on ? C('primary') : 'transparent', color: on ? C('on-primary') : 'rgba(200,220,255,.7)' }}>
                          <span className="md-state" />{lb}
                        </button>
                      );
                    })}
                  </div>
                  {gl.mode === 'zoom' &&
                    <div style={{ marginTop: 12 }}>
                      <Slider label="보이기 시작하는 확대 수준" value={gl.threshold} min={0.5} max={2.4} step={0.1} onChange={(v) => setLabel('threshold', v)}
                        fmt={(v) => v <= 0.75 ? '조금만' : v >= 1.4 ? '많이' : '적당히'} />
                      <button onClick={() => setLabel('threshold', +Math.max(0.5, Math.min(2.4, tf.k)).toFixed(2))} className="md-interactive"
                        style={{ position: 'relative', width: '100%', height: 34, marginTop: 2, borderRadius: 10, border: '1px solid rgba(143,170,220,.3)', background: 'transparent', color: '#CFE0F5', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                        <span className="md-state" />지금 확대 수준으로 맞추기
                      </button>
                    </div>}
                </div>}

                {/* ===== FORCE TAB ===== */}
                {tab === 'force' && <div>
                  <Slider label="중심 장력" value={cfg.centerF} min={0} max={1} step={0.01} onChange={(v) => setC({ centerF: v })} fmt={(v) => Math.round(v * 100)} />
                  <Slider label="반발력" value={cfg.repelF} min={0} max={1} step={0.01} onChange={(v) => setC({ repelF: v })} fmt={(v) => Math.round(v * 100)} />
                  <Slider label="링크 장력" value={cfg.linkF} min={0} max={1} step={0.01} onChange={(v) => setC({ linkF: v })} fmt={(v) => Math.round(v * 100)} />
                  <Slider label="링크 거리" value={cfg.linkDist} min={0} max={1} step={0.01} onChange={(v) => setC({ linkDist: v })} fmt={(v) => Math.round(v * 100)} />
                  <button onClick={() => setC({ centerF: DEFAULT_CFG.centerF, repelF: DEFAULT_CFG.repelF, linkF: DEFAULT_CFG.linkF, linkDist: DEFAULT_CFG.linkDist })}
                    className="md-interactive" style={{ position: 'relative', width: '100%', height: 38, marginTop: 6, borderRadius: 10, border: '1px solid rgba(143,170,220,.3)', background: 'transparent', color: '#9DC2FF', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}><span className="md-state" />장력 기본값으로</button>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,.04)' }}>
                    <Icon name="drag_pan" size={16} style={{ color: 'rgba(180,205,255,.7)', flex: '0 0 auto', marginTop: 1 }} />
                    <span style={{ fontSize: 11.5, color: 'rgba(200,220,255,.65)', lineHeight: 1.5 }}>노드를 길게 끌어 옮길 수 있어요. 놓으면 다시 별자리가 스스로 자리를 잡아요.</span>
                  </div>
                </div>}

                <button onClick={() => setFilterOpen(false)} className="md-interactive"
                  style={{ position: 'relative', width: '100%', height: 46, marginTop: 18, borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: C('primary'), color: C('on-primary'), fontSize: 14, fontWeight: 700 }}>
                  <span className="md-state" />{tab === 'filter' && filtersOn ? `${shown}개 별가루 보기` : '완료'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---- slider / toggle controls ---- */
  function Slider({ label, value, min, max, step, onChange, fmt }) {
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
          <span className="md-label-medium" style={{ color: '#D7E3F5', fontWeight: 600, whiteSpace: 'nowrap', flex: '0 0 auto', paddingRight: 10 }}>{label}</span>
          <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11.5, color: '#9DC2FF', whiteSpace: 'nowrap' }}>{fmt ? fmt(value) : value}</span>
        </div>
        <input type="range" min={min} max={max} step={step} value={value} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ width: '100%', height: 22, accentColor: '#7FB4FF', cursor: 'pointer' }} />
      </div>
    );
  }
  function ToggleRow({ label, sub, on, onToggle, C }) {
    return (
      <button onClick={onToggle} onPointerDown={(e) => e.stopPropagation()} className="md-interactive"
        style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="md-body-medium" style={{ color: '#EAF2FF' }}>{label}</div>
          {sub && <div style={{ fontSize: 11, color: 'rgba(200,220,255,.55)', marginTop: 2 }}>{sub}</div>}
        </div>
        <span style={{ width: 42, height: 25, borderRadius: 9999, flex: '0 0 auto', background: on ? C('primary') : 'rgba(255,255,255,.15)', position: 'relative', transition: 'background .15s' }}>
          <span style={{ position: 'absolute', top: 3, left: on ? 20 : 3, width: 19, height: 19, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.4)' }} />
        </span>
      </button>
    );
  }

  /* ---- a single graph node (polaris / domain / record) ---- */
  function GNode({ node, selected, dim, onDown, reg, showLabel, scale }) {
    const s = scale || 1;
    const down = (e) => onDown(e, node.id);
    if (node.kind === 'polaris') {
      const d = 22 * s;
      return (
        <button ref={reg} onPointerDown={down} style={nodeBtn(node)}>
          <span style={{ display: 'block', width: d, height: d, borderRadius: '50%', background: 'radial-gradient(circle,#fff,#A78BFA 82%)',
            boxShadow: selected ? '0 0 0 4px rgba(167,139,250,.4), 0 0 20px rgba(167,139,250,.9)' : '0 0 18px rgba(167,139,250,.85)' }} />
          <Lbl on={showLabel} color="#E2D6FF" size={11} weight={800} top={d / 2 + 9}>북극성</Lbl>
        </button>
      );
    }
    if (node.kind === 'domain') {
      const c = node.dom.color; const d = 16 * s;
      return (
        <button ref={reg} onPointerDown={down} style={{ ...nodeBtn(node), opacity: dim ? 0.16 : 1, pointerEvents: dim ? 'none' : 'auto' }}>
          <span style={{ display: 'block', width: d, height: d, borderRadius: '50%', background: `radial-gradient(circle,#fff,${c} 70%)`,
            boxShadow: selected ? `0 0 0 4px ${c}55, 0 0 16px ${c}` : `0 0 12px ${c}cc` }} />
          <Lbl on={showLabel} color={c} size={11} weight={800} top={d / 2 + 7}>{node.dom.name}</Lbl>
        </button>
      );
    }
    const col = '#8FD0F2'; const d = 24 * s;
    return (
      <button ref={reg} onPointerDown={down} style={{ ...nodeBtn(node), opacity: dim ? 0.14 : 1, pointerEvents: dim ? 'none' : 'auto' }}>
        <span style={{ display: 'grid', placeItems: 'center', width: d, height: d, borderRadius: '50%',
          background: selected ? col : 'rgba(16,28,48,.9)', border: `1.5px solid ${selected ? '#fff' : 'rgba(143,208,242,.7)'}`,
          boxShadow: selected ? `0 0 0 4px rgba(143,208,242,.35), 0 0 14px ${col}` : `0 0 8px rgba(143,208,242,.4)` }}>
          <Icon name={TYPE_ICON[node.rec.type]} size={13 * s} style={{ color: selected ? '#06121f' : '#BFE7FF' }} />
        </span>
        <Lbl on={showLabel} color="rgba(205,228,255,.95)" size={11} weight={700} top={d / 2 + 7}>{node.rec.tags[0]}</Lbl>
      </button>
    );
  }
  const nodeBtn = (n) => ({ position: 'absolute', left: n.x, top: n.y, transform: 'translate(-50%,-50%)', border: 0, background: 'transparent', cursor: 'grab', padding: 0, zIndex: n.kind === 'record' ? 2 : 3, touchAction: 'none' });
  function Lbl({ children, color, size, weight, top, max, on = true }) {
    if (!on) return null;
    return <span style={{ position: 'absolute', top: `calc(50% + ${top}px)`, left: '50%', transform: 'translateX(-50%)', whiteSpace: max ? 'normal' : 'nowrap',
      maxWidth: max, textAlign: 'center', lineHeight: 1.15, fontSize: size, fontWeight: weight, color, textShadow: '0 1px 4px rgba(0,0,0,.85), 0 0 10px rgba(0,0,0,.6)', pointerEvents: 'none' }}>{children}</span>;
  }

  /* ---- node detail sheet (세컨비가 정리한 내용) ---- */
  function DetailSheet({ node, C, go, onClose }) {
    const isRec = node.kind === 'record';
    const isDom = node.kind === 'domain';
    const accent = isRec ? DCOLOR[node.domId] : isDom ? node.dom.color : '#A78BFA';
    const rec = node.rec;
    const domRecs = isDom ? RECS.filter((r) => r.d === node.dom.id) : [];
    return (
      <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
        style={{ position: 'absolute', left: 8, right: 8, bottom: 8, zIndex: 10, maxHeight: '82%', overflowY: 'auto',
          borderRadius: 18, padding: 16, background: 'rgba(12,17,28,.97)', border: `1px solid ${accent}55`,
          boxShadow: '0 -8px 30px rgba(0,0,0,.5)', backdropFilter: 'blur(10px)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', marginTop: 6, flex: '0 0 auto', background: accent, boxShadow: `0 0 8px ${accent}` }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {isRec && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: accent }}>{DNAME[node.domId]}</span>
              <span style={{ fontSize: 11, color: 'rgba(200,220,255,.6)' }}>{TYPE_LABEL[rec.type]} · {fmtDate(rec.date)}</span>
            </div>}
            {isDom && <div style={{ fontSize: 11, fontWeight: 700, color: accent, marginBottom: 4 }}>도메인 별 · {domRecs.length}개 별가루</div>}
            <div className="md-title-medium" style={{ color: '#EAF2FF', fontWeight: 700, wordBreak: 'keep-all' }}>{isRec ? rec.title : isDom ? node.dom.name : '북극성'}</div>
          </div>
          <button onClick={onClose} aria-label="닫기" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(200,220,255,.7)', display: 'grid', placeItems: 'center', flex: '0 0 auto', width: 30, height: 30 }}><Icon name="close" size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: 9, marginTop: 12, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.05)' }}>
          <img src="assets/deepspace/secondb-head-front.png" alt="" style={{ width: 26, height: 26, flex: '0 0 auto' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, letterSpacing: '.04em', color: accent, marginBottom: 4 }}>세컨비가 정리한 내용</div>
            <div className="md-body-medium" style={{ color: '#D7E3F5', wordBreak: 'keep-all', lineHeight: 1.55 }}>
              {isRec ? rec.summary
                : isDom ? `${node.dom.line} 지금 이 별엔 별가루 ${domRecs.length}개가 모여 또렷함 L${node.dom.level}이에요. 아래 기록들이 서로를 받쳐줘요.`
                : '7개의 삶 별을 모아 ‘지금의 나’를 비추는 중심이에요. 각 별이 고르게 밝아질수록 북극성이 또렷해져요.'}
            </div>
          </div>
        </div>

        {isRec && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {rec.tags.map((tg) => <span key={tg} style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 7, background: accent + '22', color: '#E6EEFC' }}># {tg}</span>)}
        </div>}

        {isRec && (() => {
          const links = RECS.filter((o) => o.id !== rec.id && o.tags.some((t) => rec.tags.includes(t)));
          return links.length ? <div style={{ marginTop: 12 }}>
            <div className="md-label-small" style={{ color: 'rgba(200,220,255,.6)', marginBottom: 6 }}>이어지는 별가루 {links.length}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {links.slice(0, 4).map((o) => (
                <div key={o.id} onClick={() => go('record', { graph: true, id: o.id })} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 10, background: 'rgba(255,255,255,.04)', cursor: 'pointer' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: DCOLOR[o.d], flex: '0 0 auto' }} />
                  <span className="md-body-small" style={{ color: '#CFE0F5', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.title}</span>
                  <span style={{ fontSize: 10, color: 'rgba(200,220,255,.55)', flex: '0 0 auto' }}>#{o.tags.find((t) => rec.tags.includes(t))}</span>
                  <Icon name="chevron_right" size={15} style={{ color: 'rgba(200,220,255,.5)', flex: '0 0 auto' }} />
                </div>
              ))}
            </div>
          </div> : null;
        })()}

        {isDom && <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {domRecs.map((o) => (
            <div key={o.id} onClick={() => go('record', { graph: true, id: o.id })} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,.04)', cursor: 'pointer' }}>
              <Icon name={TYPE_ICON[o.type]} size={16} style={{ color: accent, flex: '0 0 auto' }} />
              <span className="md-body-small" style={{ color: '#CFE0F5', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.title}</span>
              <span style={{ fontSize: 10, color: 'rgba(200,220,255,.55)', flex: '0 0 auto' }}>{fmtDate(o.date)}</span>
              <Icon name="chevron_right" size={15} style={{ color: 'rgba(200,220,255,.5)', flex: '0 0 auto' }} />
            </div>
          ))}
        </div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {isRec && <button onClick={() => go('record', { graph: true, id: rec.id, type: rec.type, icon: TYPE_ICON[rec.type], title: rec.title, time: fmtDate(rec.date), date: rec.date, tags: rec.tags, star: DNAME[rec.d], domId: rec.d, body: rec.body, summary: rec.summary })}
            className="md-interactive" style={{ position: 'relative', flex: 1, height: 40, borderRadius: 10, border: 'none', cursor: 'pointer', background: accent, color: '#06121f', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <span className="md-state" /><Icon name="open_in_full" size={16} />원문 열기</button>}
          {isDom && <button onClick={() => go('star', (window.SB.STARS || []).find((s) => s.id === node.dom.id) || { id: node.dom.id, domain: node.dom.name, level: node.dom.level, line: node.dom.line, route: 'star' })}
            className="md-interactive" style={{ position: 'relative', flex: 1, height: 40, borderRadius: 10, border: 'none', cursor: 'pointer', background: accent, color: '#06121f', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <span className="md-state" /><Icon name="travel_explore" size={16} />이 별 여행하기</button>}
          {node.kind === 'polaris' && <button onClick={() => go('me')}
            className="md-interactive" style={{ position: 'relative', flex: 1, height: 40, borderRadius: 10, border: 'none', cursor: 'pointer', background: '#A78BFA', color: '#1b1430', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <span className="md-state" /><Icon name="auto_awesome" size={16} />북극성 종합 보기</button>}
        </div>
      </div>
    );
  }

  window.WikiGraph = WikiGraph;
  window.SB = window.SB || {};
  window.SB.WIKI_DOMAINS = DOMAINS;
  window.SB.WIKI_RECS = RECS;
})();
