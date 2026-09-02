/* ============================================================
   2nd-Brain · 관계 노드 그래프 (RelationGraph)
   위키 노드 그래프(sb-wikigraph.jsx)와 "같은 시스템"으로 그린다.
   - 진짜 물리 시뮬레이션: 중심장력 · 반발력 · 링크장력 · 링크거리
   - 드래그 팬 · 휠/핀치 줌 · 노드 드래그 · idle 부유
   - 팝업 탭: 필터 / 표시 / 장력
   - 단, 노드는 '사람'뿐 — 사람↔사람 관계(연줄)만 보여준다.
   Export: window.RelationGraph
   ============================================================ */
(function () {
  const { useState, useRef, useEffect, useLayoutEffect, useMemo } = React;

  /* ---- 관계 카테고리(별 색 대신 '관계 유형' 색) ---- */
  const CATS = window.SB_DATA.relations.graph.cats; // → data/screens/relations.json
  const CCOLOR = Object.fromEntries(CATS.map((c) => [c.id, c.color]));
  const CNAME = Object.fromEntries(CATS.map((c) => [c.id, c.name]));

  const TIER_LABEL = window.SB_DATA.relations.graph.tierLabels; // 친밀도 (0 가까움 → 2 느슨함) — → data/screens/relations.json

  /* ---- 사람 노드 ---- */
  const PEOPLE = window.SB_DATA.relations.graph.people; // → data/screens/relations.json

  /* ---- 사람↔사람 관계(연줄) — 나를 거치지 않는, 사람 사이의 직접 관계 ---- */
  const BONDS = window.SB_DATA.relations.graph.bonds; // → data/screens/relations.json

  const today = new Date(window.SB_DATA.relations.graph.refDate); // → data/screens/relations.json
  const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const lastText = (iso) => {
    const d = new Date(iso); const days = Math.round((today - d) / 86400000);
    if (days <= 0) return '오늘'; if (days === 1) return '어제'; if (days < 7) return days + '일 전';
    if (days < 14) return '지난주'; if (days < 31) return Math.floor(days / 7) + '주 전';
    if (days < 61) return '지난달'; return Math.floor(days / 30) + '개월 전';
  };

  /* ---- 시작 배치(시뮬레이션 seed) ---- */
  function build() {
    const W = 560, H = 460, cx = W / 2, cy = H / 2;
    const nodes = [{ id: 'me', kind: 'me', x: cx, y: cy }];
    PEOPLE.forEach((p, i) => {
      const ang = (i / PEOPLE.length) * Math.PI * 2 - Math.PI / 2;
      const rr = 156 - p.tier * 16; // 가까운 tier일수록 안쪽
      nodes.push({ id: p.id, kind: 'person', p, x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr });
    });
    const pos = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const edges = [];
    PEOPLE.forEach((p) => edges.push({ a: 'me', b: p.id, kind: 'spine', cat: p.cat, tier: p.tier }));
    BONDS.forEach((bd) => edges.push({ a: bd.a, b: bd.b, kind: 'bond', label: bd.label }));
    return { W, H, cx, cy, nodes, edges, pos };
  }

  const SPINE_W = window.SB_DATA.relations.graph.spineW, SPINE_O = window.SB_DATA.relations.graph.spineO, NODE_D = window.SB_DATA.relations.graph.nodeD; // → data/screens/relations.json

  /* ---- physics/display config (위키와 동일 구조 · 별도 저장키) ---- */
  const DEFAULT_CFG = window.SB_DATA.relations.graph.defaultCfg; // → data/screens/relations.json
  const CFG_KEY = window.SB_DATA.relations.graph.cfgKey; // → data/screens/relations.json
  function loadCfg() {
    try { const j = JSON.parse(localStorage.getItem(CFG_KEY)); if (j && typeof j === 'object') return { ...DEFAULT_CFG, ...j }; } catch (e) {}
    return { ...DEFAULT_CFG };
  }

  function RelationGraph({ C, go, height = 440 }) {
    const CC = C || window.SB.C;
    const G = useMemo(build, []);
    const vpRef = useRef(null), worldRef = useRef(null);
    const gesture = useRef({ pts: new Map(), dragging: false, last: null, moved: false, pinchDist: 0, node: null });
    const [tf, setTf] = useState({ x: 0, y: 0, k: 0.7 });
    const tfRef = useRef(tf);
    const fitted = useRef(false);
    const [sel, setSel] = useState(null);

    // filters
    const [cats, setCats] = useState(() => new Set(CATS.map((c) => c.id)));
    const [tiers, setTiers] = useState(() => new Set([0, 1, 2]));
    const [kw, setKw] = useState('');
    const [dateMode, setDateMode] = useState('all'); // all | 7 | 30 | range
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [filterOpen, setFilterOpen] = useState(false);
    const [tab, setTab] = useState('filter'); // filter | display | force

    // physics/display config
    const [cfg, setCfg] = useState(loadCfg);
    const cfgRef = useRef(cfg);
    useEffect(() => { cfgRef.current = cfg; if (sim.current) sim.current.alpha = Math.max(sim.current.alpha || 0, 0.5); try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} }, [cfg]);
    const setC = (patch) => setCfg((c) => ({ ...c, ...patch }));

    const clampK = (k) => Math.max(0.4, Math.min(3.4, k));
    const apply = (t) => { if (worldRef.current) worldRef.current.style.transform = `translate(${t.x}px,${t.y}px) scale(${t.k})`; };

    // initial fit
    useLayoutEffect(() => {
      const vp = vpRef.current; if (!vp || fitted.current) return;
      const r = vp.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const FIT = 430;
      const k = clampK(Math.min(r.width / FIT, r.height / FIT) * 0.98);
      const t = { k, x: r.width / 2 - G.cx * k, y: r.height / 2 - G.cy * k };
      fitted.current = true; setTf(t); tfRef.current = t; apply(t);
    });
    useEffect(() => { tfRef.current = tf; apply(tf); }, [tf]);

    // ---- force simulation state ----
    const nodeEls = useRef({});
    const edgeEls = useRef([]);
    const bondTextEls = useRef({});
    const sim = useRef(null);
    const reduceMotion = useRef(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const float = useMemo(() => {
      let s = 91037; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      const o = {};
      G.nodes.forEach((n) => { o[n.id] = { sx: 0.18 + rnd() * 0.22, sy: 0.18 + rnd() * 0.22, px: rnd() * 6.28, py: rnd() * 6.28 }; });
      return o;
    }, [G]);

    useEffect(() => {
      const pos = {}, vel = {};
      G.nodes.forEach((n) => { pos[n.id] = { x: n.x, y: n.y }; vel[n.id] = { vx: 0, vy: 0 }; });
      sim.current = { pos, vel, alpha: 1, fixed: { me: { x: G.cx, y: G.cy } } };
      pos.me = { x: G.cx, y: G.cy };
    }, [G]);

    const reheat = (a) => { if (sim.current) sim.current.alpha = Math.max(sim.current.alpha || 0, a); };

    useEffect(() => {
      if (!sim.current) return;
      const ids = G.nodes.map((n) => n.id);
      const n = ids.length;
      let raf;
      const DRIFT_AMP = 2.4;
      const tick = (now) => {
        const S = sim.current; const { pos, vel, fixed } = S;
        const alpha = S.alpha == null ? 0 : S.alpha;
        const active = alpha > 0.004;
        if (active) {
          const c = cfgRef.current;
          const CENTER = c.centerF * 0.045;
          const REPEL = 300 + c.repelF * 3000;
          const LINKK = 0.01 + c.linkF * 0.13;
          const LDIST = 40 + c.linkDist * 110;
          const DAMP = 0.84;
          const fx = {}, fy = {};
          for (let i = 0; i < n; i++) { const id = ids[i]; fx[id] = 0; fy[id] = 0; }
          for (let i = 0; i < n; i++) {
            const id = ids[i]; const p = pos[id];
            fx[id] += (G.cx - p.x) * CENTER; fy[id] += (G.cy - p.y) * CENTER;
          }
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
          const E = G.edges;
          for (let i = 0; i < E.length; i++) {
            const e = E[i]; const pa = pos[e.a], pb = pos[e.b]; if (!pa || !pb) continue;
            const rest = LDIST * (e.kind === 'spine' ? (1.1 + (e.tier || 0) * 0.5) : 2.1);
            let dx = pb.x - pa.x, dy = pb.y - pa.y;
            let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
            const f = (dist - rest) * LINKK;
            const ux = dx / dist, uy = dy / dist;
            fx[e.a] += ux * f; fy[e.a] += uy * f; fx[e.b] -= ux * f; fy[e.b] -= uy * f;
          }
          for (let i = 0; i < n; i++) {
            const id = ids[i];
            if (fixed[id]) { const fp = fixed[id]; pos[id].x = fp.x; pos[id].y = fp.y; vel[id].vx = 0; vel[id].vy = 0; continue; }
            const v = vel[id];
            v.vx = (v.vx + fx[id]) * DAMP; v.vy = (v.vy + fy[id]) * DAMP;
            v.vx = Math.max(-10, Math.min(10, v.vx)); v.vy = Math.max(-10, Math.min(10, v.vy));
            pos[id].x += v.vx * alpha; pos[id].y += v.vy * alpha;
          }
          S.alpha = alpha * 0.96;
        }
        const T = now / 1000;
        const dispX = {}, dispY = {};
        for (let i = 0; i < n; i++) {
          const id = ids[i]; const p = pos[id];
          if (fixed[id] || reduceMotion.current) { dispX[id] = p.x; dispY[id] = p.y; continue; }
          const f = float[id];
          dispX[id] = p.x + Math.sin(T * f.sx * 2.3 + f.px) * DRIFT_AMP;
          dispY[id] = p.y + Math.sin(T * f.sy * 2.3 + f.py) * DRIFT_AMP;
        }
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
        for (const k in bondTextEls.current) {
          const tx = bondTextEls.current[k]; if (!tx) continue; const ent = edgeEls.current[k]; if (!ent) continue;
          const ax = dispX[ent.a], ay = dispY[ent.a], bx = dispX[ent.b], by = dispY[ent.b];
          if (ax == null || bx == null) continue;
          tx.setAttribute('x', (ax + bx) / 2); tx.setAttribute('y', (ay + by) / 2 - 4);
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
      if (sim.current && id !== 'me') sim.current.fixed[id] = { ...sim.current.pos[id] };
    };
    const onDown = (e) => {
      const g = gesture.current; g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { vpRef.current.setPointerCapture(e.pointerId); } catch (x) {}
      if (g.pts.size === 1) { g.dragging = true; g.last = { x: e.clientX, y: e.clientY }; g.moved = false; g.node = null; }
      else if (g.pts.size === 2) { const a = [...g.pts.values()]; g.pinchDist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); g.dragging = false; g.node = null; }
    };
    const onMove = (e) => {
      const g = gesture.current; if (!g.pts.has(e.pointerId)) return;
      g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (g.node) {
        if (Math.abs(e.clientX - g.last.x) + Math.abs(e.clientY - g.last.y) > 3) g.moved = true;
        if (g.node !== 'me' && sim.current) { const w = toWorld(e.clientX, e.clientY); sim.current.fixed[g.node] = w; sim.current.pos[g.node] = { ...w }; reheat(0.5); }
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
      const g = gesture.current; const wasNode = g.node;
      g.pts.delete(e.pointerId);
      try { vpRef.current.releasePointerCapture(e.pointerId); } catch (x) {}
      if (wasNode) {
        if (wasNode !== 'me' && sim.current) { delete sim.current.fixed[wasNode]; reheat(0.35); }
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
    const personMatch = (p) => {
      if (!cats.has(p.cat)) return false;
      if (!tiers.has(p.tier)) return false;
      if (!inDate(p.last)) return false;
      if (kwl) { const hay = (p.name + ' ' + CNAME[p.cat] + ' ' + p.note).toLowerCase(); if (!hay.includes(kwl)) return false; }
      return true;
    };
    const visible = useMemo(() => {
      const v = {};
      PEOPLE.forEach((p) => { v[p.id] = personMatch(p); });
      v.me = true;
      return v;
    }, [cats, tiers, kwl, dateMode, from, to]);
    const shown = PEOPLE.filter((p) => visible[p.id]).length;
    const filtersOn = cats.size < CATS.length || tiers.size < 3 || !!kwl || dateMode !== 'all';
    const filterCount = (cats.size < CATS.length ? 1 : 0) + (tiers.size < 3 ? 1 : 0) + (kwl ? 1 : 0) + (dateMode !== 'all' ? 1 : 0);

    const selNode = sel ? G.pos[sel] : null;
    const toggleCat = (id) => setCats((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x.size ? x : new Set(CATS.map((c) => c.id)); });
    const toggleTier = (id) => setTiers((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x.size ? x : new Set([0, 1, 2]); });
    const resetFilters = () => { setKw(''); setCats(new Set(CATS.map((c) => c.id))); setTiers(new Set([0, 1, 2])); setDateMode('all'); setFrom(''); setTo(''); };

    const labelsOn = cfg.labelMode === 'always' ? true : cfg.labelMode === 'off' ? false : tf.k >= cfg.labelThreshold;
    const ls = cfg.linkScale, nsc = cfg.nodeScale;

    return (
      <React.Fragment>
        <SectionLabel>인물 맵 · 관계 그래프</SectionLabel>
        <MdCard variant="outlined" style={{ padding: 0, overflow: 'hidden' }}>
          <div ref={vpRef} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            style={{ position: 'relative', width: '100%', height, overflow: 'hidden', touchAction: 'none', cursor: 'grab',
              background: 'radial-gradient(120% 70% at 50% 26%,rgba(26,72,120,.5) 0%,rgba(11,33,66,.3) 42%,#070A13 76%)' }}>
            {window.NeuralField && <window.NeuralField style={{ zIndex: 0 }} />}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
              background: 'radial-gradient(circle at 50% 30%,transparent 0 40%,rgba(7,10,19,.3) 72%,rgba(7,10,19,.62) 100%)' }} />
            <div ref={worldRef} style={{ position: 'absolute', top: 0, left: 0, width: G.W, height: G.H, transformOrigin: '0 0', zIndex: 2 }}>
              <svg width={G.W} height={G.H} viewBox={`0 0 ${G.W} ${G.H}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
                <defs>
                  <marker id="rg-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5.2" markerHeight="5.2" orient="auto">
                    <path d="M0,0 L10,5 L0,10 z" fill="rgba(180,205,255,.8)" />
                  </marker>
                </defs>
                {G.edges.map((e, i) => {
                  const a = G.pos[e.a], b = G.pos[e.b]; if (!a || !b) return null;
                  const vis = visible[e.a] && visible[e.b];
                  const reg = (el) => { edgeEls.current[i] = el ? { el, a: e.a, b: e.b, kind: e.kind } : null; };
                  if (e.kind === 'spine') {
                    const col = CCOLOR[e.cat];
                    return <line key={i} ref={reg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={SPINE_W[e.tier] * ls} opacity={vis ? SPINE_O[e.tier] : 0.08} markerEnd={cfg.arrows ? 'url(#rg-arrow)' : undefined} />;
                  }
                  const showThis = cfg.showBonds && vis;
                  return (
                    <g key={i}>
                      <line ref={reg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#7FE3FF" strokeWidth={1.1 * ls} strokeDasharray="3 4" opacity={showThis ? 0.42 : 0.05} />
                      {cfg.showBondLabels && showThis && labelsOn &&
                        <text ref={(el) => (bondTextEls.current[i] = el)} x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} textAnchor="middle"
                          style={{ fontSize: 10.5, fontWeight: 700, fill: '#9FE6FF', paintOrder: 'stroke', stroke: 'rgba(7,10,19,.9)', strokeWidth: 3, fontFamily: 'var(--md-ref-typeface-plain)' }}>{e.label}</text>}
                    </g>
                  );
                })}
              </svg>
              <MeNode reg={(el) => (nodeEls.current.me = el)} node={G.pos.me} onDown={onNodeDown} selected={sel === 'me'} showLabel={labelsOn || sel === 'me'} scale={nsc} />
              {PEOPLE.map((p) => (
                <PersonNode key={p.id} reg={(el) => (nodeEls.current[p.id] = el)} node={G.pos[p.id]} p={p} onDown={onNodeDown} selected={sel === p.id} dim={!visible[p.id]} showLabel={labelsOn || sel === p.id} scale={nsc} />
              ))}
            </div>

            {/* filter trigger */}
            <button onClick={() => { setTab('filter'); setFilterOpen(true); }} onPointerDown={(e) => e.stopPropagation()} className="md-interactive"
              style={{ position: 'absolute', left: 10, bottom: 10, zIndex: 6, display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px 0 11px', borderRadius: 9999, cursor: 'pointer', whiteSpace: 'nowrap',
                border: `1px solid ${filtersOn ? '#9DC2FF' : 'rgba(143,170,220,.4)'}`, background: 'rgba(10,16,28,.82)', color: filtersOn ? '#BFD4FF' : '#CFE6FF', backdropFilter: 'blur(4px)' }}>
              <span className="md-state" /><Icon name="tune" size={17} />
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>필터</span>
              {filterCount > 0 && <span style={{ minWidth: 17, height: 17, padding: '0 5px', borderRadius: 9999, background: CC('primary'), color: CC('on-primary'), fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{filterCount}</span>}
            </button>

            {/* count */}
            <span style={{ position: 'absolute', right: 10, bottom: 10, zIndex: 6, whiteSpace: 'nowrap', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, fontWeight: 700, color: '#BFE7FF',
              background: 'rgba(10,16,28,.7)', borderRadius: 9999, padding: '4px 10px', backdropFilter: 'blur(4px)' }}>
              {filtersOn ? `${shown}/${PEOPLE.length}` : PEOPLE.length} 인물
            </span>

            {/* detail sheet */}
            {selNode && <RelDetail node={selNode} CC={CC} go={go} onPick={(id) => setSel(id)} onClose={() => setSel(null)} />}

            {/* control popup (tabs) */}
            {filterOpen && (
              <div onPointerDown={(e) => e.stopPropagation()} style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
                <div onClick={() => setFilterOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)' }} />
                <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, borderRadius: 20, padding: 16, background: 'rgba(14,19,30,.98)',
                  border: `1px solid ${CC('outline-variant')}`, boxShadow: '0 -8px 30px rgba(0,0,0,.55)', backdropFilter: 'blur(10px)', maxHeight: '94%', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <div style={{ flex: 1, display: 'flex', background: 'rgba(255,255,255,.05)', borderRadius: 9999, padding: 3, gap: 2 }}>
                      {[['filter', '필터'], ['display', '표시'], ['force', '장력']].map(([id, lb]) => {
                        const on = tab === id;
                        return (
                          <button key={id} onClick={() => setTab(id)} className="md-interactive"
                            style={{ position: 'relative', flex: 1, height: 34, borderRadius: 9999, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                              background: on ? CC('primary') : 'transparent', color: on ? CC('on-primary') : 'rgba(200,220,255,.7)' }}>
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
                      <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="이름·관계 검색"
                        style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', color: '#EAF2FF', fontFamily: 'var(--md-ref-typeface-plain)', fontSize: 14 }} />
                      {kw && <button onClick={() => setKw('')} aria-label="지우기" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(200,220,255,.7)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><Icon name="close" size={15} /></button>}
                    </div>

                    <div className="md-label-medium" style={{ color: 'rgba(200,220,255,.65)', marginBottom: 8 }}>관계 {cats.size < CATS.length ? `(${cats.size}/${CATS.length})` : ''}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 18 }}>
                      {CATS.map((d) => {
                        const on = cats.has(d.id);
                        return (
                          <button key={d.id} onClick={() => toggleCat(d.id)} className="md-interactive"
                            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 13px',
                              borderRadius: 9999, cursor: 'pointer', border: `1.5px solid ${on ? d.color : 'rgba(143,170,220,.3)'}`, background: on ? d.color + '22' : 'transparent' }}>
                            <span className="md-state" />
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, opacity: on ? 1 : 0.4, boxShadow: on ? `0 0 6px ${d.color}` : 'none' }} />
                            <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: on ? '#EAF2FF' : 'rgba(200,220,255,.6)' }}>{d.name}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="md-label-medium" style={{ color: 'rgba(200,220,255,.65)', marginBottom: 8 }}>친밀도 {tiers.size < 3 ? `(${tiers.size}/3)` : ''}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 18 }}>
                      {[0, 1, 2].map((tp) => {
                        const on = tiers.has(tp);
                        return (
                          <button key={tp} onClick={() => toggleTier(tp)} className="md-interactive"
                            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 13px',
                              borderRadius: 9999, cursor: 'pointer', border: `1.5px solid ${on ? 'rgba(143,208,242,.8)' : 'rgba(143,170,220,.3)'}`, background: on ? 'rgba(143,208,242,.16)' : 'transparent' }}>
                            <span className="md-state" />
                            <span style={{ width: 10 - tp * 2, height: 10 - tp * 2, borderRadius: '50%', background: '#BFE7FF', opacity: on ? 1 : 0.4 }} />
                            <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: on ? '#EAF2FF' : 'rgba(200,220,255,.6)' }}>{TIER_LABEL[tp]}</span>
                          </button>
                        );
                      })}
                    </div>

                    <ToggleRow C={CC} label="사람 사이 연결선 표시" sub="나를 거치지 않는, 사람 간의 관계(연줄)" on={cfg.showBonds} onToggle={() => setC({ showBonds: !cfg.showBonds })} />

                    <div className="md-label-medium" style={{ color: 'rgba(200,220,255,.65)', margin: '14px 0 8px' }}>마지막 연락</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {[['all', '전체'], ['7', '최근 7일'], ['30', '최근 30일'], ['range', '기간 지정']].map(([id, lb]) => {
                        const on = dateMode === id;
                        return (
                          <button key={id} onClick={() => setDateMode(id)} className="md-interactive"
                            style={{ position: 'relative', height: 34, padding: '0 14px', borderRadius: 9999, cursor: 'pointer',
                              border: `1px solid ${on ? 'transparent' : 'rgba(143,170,220,.3)'}`, background: on ? CC('primary') : 'transparent',
                              color: on ? CC('on-primary') : 'rgba(200,220,255,.7)', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
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
                    <ToggleRow C={CC} label="관계 이름 표시" sub="사람 사이 연결선에 ‘부부 · 동기’처럼" on={cfg.showBondLabels} onToggle={() => setC({ showBondLabels: !cfg.showBondLabels })} />
                    <ToggleRow C={CC} label="화살표 표시" sub="나 → 사람 방향을 화살표로" on={cfg.arrows} onToggle={() => setC({ arrows: !cfg.arrows })} />

                    <div className="md-label-medium" style={{ color: 'rgba(200,220,255,.7)', margin: '18px 0 8px' }}>이름 표시</div>
                    <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,.05)', borderRadius: 9999, padding: 3 }}>
                      {[['always', '항상'], ['zoom', '확대했을 때'], ['off', '숨김']].map(([id, lb]) => {
                        const on = cfg.labelMode === id;
                        return (
                          <button key={id} onClick={() => setC({ labelMode: id })} className="md-interactive"
                            style={{ position: 'relative', flex: 1, height: 34, borderRadius: 9999, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
                              background: on ? CC('primary') : 'transparent', color: on ? CC('on-primary') : 'rgba(200,220,255,.7)' }}>
                            <span className="md-state" />{lb}
                          </button>
                        );
                      })}
                    </div>
                    {cfg.labelMode === 'zoom' &&
                      <div style={{ marginTop: 12 }}>
                        <Slider label="보이기 시작하는 확대 수준" value={cfg.labelThreshold} min={0.5} max={2.4} step={0.1} onChange={(v) => setC({ labelThreshold: v })}
                          fmt={(v) => v <= 0.75 ? '조금만' : v >= 1.4 ? '많이' : '적당히'} />
                        <button onClick={() => setC({ labelThreshold: +Math.max(0.5, Math.min(2.4, tf.k)).toFixed(2) })} className="md-interactive"
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
                      <span style={{ fontSize: 11.5, color: 'rgba(200,220,255,.65)', lineHeight: 1.5 }}>사람을 길게 끌어 옮길 수 있어요. 놓으면 관계망이 스스로 다시 자리를 잡아요.</span>
                    </div>
                  </div>}

                  <button onClick={() => setFilterOpen(false)} className="md-interactive"
                    style={{ position: 'relative', width: '100%', height: 46, marginTop: 18, borderRadius: 12, border: 'none', cursor: 'pointer',
                      background: CC('primary'), color: CC('on-primary'), fontSize: 14, fontWeight: 700 }}>
                    <span className="md-state" />{tab === 'filter' && filtersOn ? `${shown}명 보기` : '완료'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </MdCard>
      </React.Fragment>
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

  const nodeBtn = (z, x, y) => ({ position: 'absolute', left: x, top: y, transform: 'translate(-50%,-50%)', border: 0, background: 'transparent', cursor: 'grab', padding: 0, zIndex: z, touchAction: 'none' });
  function Lbl({ children, color, size, weight, top, on = true }) {
    if (!on) return null;
    return <span style={{ position: 'absolute', top: `calc(50% + ${top}px)`, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap',
      fontSize: size, fontWeight: weight, color, textShadow: '0 1px 4px rgba(0,0,0,.85), 0 0 10px rgba(0,0,0,.6)', pointerEvents: 'none' }}>{children}</span>;
  }

  function MeNode({ node, onDown, reg, selected, showLabel, scale }) {
    const d = 24 * (scale || 1);
    return (
      <button ref={reg} onPointerDown={(e) => onDown(e, 'me')} style={nodeBtn(4, node.x, node.y)}>
        <span style={{ display: 'block', width: d, height: d, borderRadius: '50%', background: 'radial-gradient(circle,#fff,#5AA6FF 80%)',
          boxShadow: selected ? '0 0 0 4px rgba(90,166,255,.4), 0 0 22px rgba(90,166,255,.95)' : '0 0 20px rgba(90,166,255,.9)' }} />
        <Lbl on={showLabel} color="#CFE6FF" size={11} weight={800} top={d / 2 + 9}>나</Lbl>
      </button>
    );
  }
  function PersonNode({ node, p, onDown, reg, selected, dim, showLabel, scale }) {
    const c = CCOLOR[p.cat], d = NODE_D[p.tier] * (scale || 1);
    return (
      <button ref={reg} onPointerDown={(e) => onDown(e, p.id)} style={{ ...nodeBtn(3, node.x, node.y), opacity: dim ? 0.14 : 1, pointerEvents: dim ? 'none' : 'auto' }}>
        <span style={{ display: 'block', width: d, height: d, borderRadius: '50%', background: `radial-gradient(circle,#fff,${c} 70%)`,
          boxShadow: selected ? `0 0 0 4px ${c}55, 0 0 16px ${c}` : `0 0 12px ${c}cc` }} />
        <Lbl on={showLabel} color={c} size={11} weight={800} top={d / 2 + 7}>{p.name}</Lbl>
      </button>
    );
  }

  /* ---- 노드 디테일 시트 (위키 시트와 동일 톤) ---- */
  function RelDetail({ node, CC, go, onPick, onClose }) {
    const isMe = node.kind === 'me';
    const p = node.p;
    const accent = isMe ? '#5AA6FF' : CCOLOR[p.cat];
    // 이 사람과 직접 이어진 다른 사람들(연줄)
    const links = isMe ? [] : BONDS.filter((b) => b.a === p.id || b.b === p.id).map((b) => {
      const otherId = b.a === p.id ? b.b : b.a;
      return { person: PEOPLE.find((x) => x.id === otherId), label: b.label };
    }).filter((x) => x.person);
    return (
      <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
        style={{ position: 'absolute', left: 8, right: 8, bottom: 8, zIndex: 10, maxHeight: '86%', overflowY: 'auto',
          borderRadius: 18, padding: 16, background: 'rgba(12,17,28,.97)', border: `1px solid ${accent}55`,
          boxShadow: '0 -8px 30px rgba(0,0,0,.5)', backdropFilter: 'blur(10px)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', marginTop: 6, flex: '0 0 auto', background: accent, boxShadow: `0 0 8px ${accent}` }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: accent }}>{isMe ? '관계망 중심' : CNAME[p.cat]}</span>
              {!isMe && <span style={{ fontSize: 11, color: 'rgba(200,220,255,.6)' }}>{TIER_LABEL[p.tier]} · 마지막 연락 {lastText(p.last)}</span>}
            </div>
            <div className="md-title-medium" style={{ color: '#EAF2FF', fontWeight: 700, wordBreak: 'keep-all' }}>{isMe ? '나' : p.name}</div>
          </div>
          <button onClick={onClose} aria-label="닫기" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(200,220,255,.7)', display: 'grid', placeItems: 'center', flex: '0 0 auto', width: 30, height: 30 }}><Icon name="close" size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: 9, marginTop: 12, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.05)' }}>
          <img src="assets/deepspace/secondb-head-front.png" alt="" style={{ width: 26, height: 26, flex: '0 0 auto' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, letterSpacing: '.04em', color: accent, marginBottom: 4 }}>세컨비가 본 관계</div>
            <div className="md-body-medium" style={{ color: '#D7E3F5', wordBreak: 'keep-all', lineHeight: 1.55 }}>
              {isMe ? `가까운 사람부터 느슨한 사이까지 ${PEOPLE.length}명과 이어져 있어요. 선이 밝을수록 자주 닿는 관계예요. 사람끼리 이어진 점선은 나를 거치지 않는 그들 사이의 연줄이고요.` : p.note}
            </div>
          </div>
        </div>

        {!isMe && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 7, whiteSpace: 'nowrap', background: accent + '22', color: '#E6EEFC' }}># {CNAME[p.cat]}</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 7, whiteSpace: 'nowrap', background: 'rgba(255,255,255,.06)', color: '#CFE0F5' }}>함께한 기록 {p.recs}</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 7, whiteSpace: 'nowrap', background: 'rgba(255,255,255,.06)', color: '#CFE0F5' }}>마지막 {lastText(p.last)}</span>
        </div>}

        {/* 이 사람과 직접 이어진 사람들 (사람↔사람 연줄) */}
        {!isMe && links.length > 0 && <div style={{ marginTop: 12 }}>
          <div className="md-label-small" style={{ color: 'rgba(200,220,255,.8)', marginBottom: 6 }}>이 사람과 이어진 사람 {links.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {links.map(({ person: o, label }) => (
              <div key={o.id} onClick={() => onPick(o.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 10, background: 'rgba(255,255,255,.04)', cursor: 'pointer' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: CCOLOR[o.cat], flex: '0 0 auto', boxShadow: `0 0 6px ${CCOLOR[o.cat]}` }} />
                <span className="md-body-small" style={{ color: '#CFE0F5', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                <span style={{ fontSize: 11, color: 'rgba(200,220,255,.75)', flex: '0 0 auto' }}>{label}</span>
                <Icon name="chevron_right" size={15} style={{ color: 'rgba(200,220,255,.5)', flex: '0 0 auto' }} />
              </div>
            ))}
          </div>
        </div>}

        {!isMe && go && <button onClick={() => go('chat')} className="md-interactive"
          style={{ position: 'relative', width: '100%', height: 40, marginTop: 14, borderRadius: 10, border: 'none', cursor: 'pointer', background: accent, color: '#06121f', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <span className="md-state" /><Icon name="bubble_chart" size={16} />세컨비와 이 관계 이야기</button>}
      </div>
    );
  }

  window.RelationGraph = RelationGraph;
})();
