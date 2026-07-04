/* ============================================================
   2nd-Brain · 라이프 오딧 · 영역 대시보드 · 영역 전용 입력 (PRD §3.1 / §3.5)
   - LifeAuditScreen   : 7 삶의 영역 점검 종합 (한눈에 · 균형 레이더 + 점검 리스트)
   - DomainDashScreen  : 내 영역 대시보드 (조각 수 · 최근 활동 · 핵심 주제 집계)
   - DomainInputScreen : 생활영역 전용 구조화 입력 (독서·학습·식단·운동·지출·수면)
   Export: window.LifeAuditScreen, window.DomainDashScreen, window.DomainInputScreen
   ============================================================ */

/* per-domain aggregate — aligned with DOMAIN_META(별 상세) & STARS levels */
const AUDIT_DOMAINS = window.SB_DATA.audit.domains; // → data/screens/audit.json

const starOf = (id) => (window.SB.STARS || []).find((s) => s.id === id);
const lightStatus = (cov) => (cov >= 60 ? { k: '밝음', c: 'primary' } : cov >= 40 ? { k: '보통', c: 'tertiary' } : { k: '어두움', c: 'on-surface-variant' });

/* ===================== ① 라이프 오딧 종합 ===================== */
function LifeAuditScreen({ t, go }) {
  const C = window.SB.C;
  const doms = AUDIT_DOMAINS;
  const avg = Math.round(doms.reduce((s, d) => s + d.cov, 0) / doms.length);
  const darkest = doms.reduce((a, b) => (b.cov < a.cov ? b : a));

  /* heptagon radar geometry */
  const cx = 130, cy = 128, R = 96;
  const pt = (i, r) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / doms.length;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const ring = (frac) => doms.map((_, i) => pt(i, R * frac).join(',')).join(' ');
  const valPoly = doms.map((d, i) => pt(i, R * (d.cov / 100)).join(',')).join(' ');

  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      {/* hero */}
      <div style={{ padding: '14px 16px 6px', background: `radial-gradient(120% 90% at 50% 0%, ${C('primary-container')}, ${C('surface')} 76%)` }}>
        <div className="md-label-medium" style={{ color: C('on-surface-variant'), letterSpacing: '.06em' }}>삶의 영역 점검</div>
        <div className="md-headline-small" style={{ color: C('on-surface'), marginTop: 2 }}>지금, 내 삶의 균형</div>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginTop: 6, wordBreak: 'keep-all' }}>
          7개 영역이 얼마나 채워졌는지 한눈에 봐요. 점수가 아니라 <b>담긴 양</b>이에요 — 비어 있어도 괜찮아요.
        </div>
      </div>

      <ScreenPad>
        {/* radar */}
        <MdCard variant="filled" style={{ padding: '12px 8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <svg width="260" height="248" viewBox="0 0 260 256" style={{ overflow: 'visible' }}>
            {[0.33, 0.66, 1].map((f, i) => (
              <polygon key={i} points={ring(f)} fill="none" stroke={C('outline-variant')} strokeWidth="1" opacity={0.7} />
            ))}
            {doms.map((d, i) => {
              const [x, y] = pt(i, R);
              return <line key={d.id} x1={cx} y1={cy} x2={x} y2={y} stroke={C('outline-variant')} strokeWidth="1" opacity={0.5} />;
            })}
            <polygon points={valPoly} fill={C('primary')} fillOpacity="0.22" stroke={C('primary')} strokeWidth="2" />
            {doms.map((d, i) => {
              const [x, y] = pt(i, R * (d.cov / 100));
              return <circle key={d.id} cx={x} cy={y} r="3.5" fill={C('primary')} />;
            })}
            {doms.map((d, i) => {
              const [x, y] = pt(i, R + 18);
              return (
                <text key={d.id} x={x} y={y} fill={C('on-surface-variant')} fontSize="11" fontWeight="600"
                  textAnchor={Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end'} dominantBaseline="middle">{d.name}</text>
              );
            })}
          </svg>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4, marginBottom: 8 }}>
            <span className="md-display-small" style={{ color: C('primary'), fontWeight: 600 }}>{avg}%</span>
            <span className="md-body-medium" style={{ color: C('on-surface-variant') }}>평균 채움 · 7영역</span>
          </div>
        </MdCard>

        {/* 세컨비 한 줄 */}
        <MdCard variant="filled" style={{ background: C('tertiary-container'), padding: 14, marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <img src="assets/deepspace/secondb-head-front.png" alt="" style={{ width: 30, height: 30, flex: '0 0 auto' }} />
            <div className="md-body-medium" style={{ color: C('on-tertiary-container'), wordBreak: 'keep-all' }}>
              <b>{darkest.name}</b> 영역이 가장 비어 있어요. 한 영역만 또렷해져도 옆 영역까지 같이 밝아지곤 해요.
            </div>
          </div>
        </MdCard>

        {/* 점검 리스트 */}
        <SectionLabel>영역별 점검</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {doms.map((d) => {
            const st = lightStatus(d.cov);
            return (
              <MdCard key={d.id} variant="outlined" onClick={() => { const s = starOf(d.id); if (s) go('star', s); }} style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', flex: '0 0 auto',
                    background: C('secondary-container'), color: C('on-secondary-container') }}>
                    <Icon name={d.icon} size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="md-title-small" style={{ color: C('on-surface') }}>{d.name}</span>
                      <span className="md-label-small" style={{ color: C(st.c), background: C('surface-container-highest'), padding: '1px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>{st.k}</span>
                    </div>
                    <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.q}</div>
                  </div>
                  <Icon name="chevron_right" size={20} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
                </div>
                {/* mini cov/conf bars */}
                <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                  <MiniBar label="별빛" value={d.cov} color={C('primary')} C={C} />
                  <MiniBar label="확신" value={d.conf} color={C('tertiary')} C={C} />
                </div>
              </MdCard>
            );
          })}
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <MdButton variant="filled" icon="add" style={{ flex: 1 }} onClick={() => { const s = starOf(darkest.id); go('lifeinput', s); }}>가장 어두운 별 밝히기</MdButton>
          <MdButton variant="outlined" icon="dashboard" onClick={() => go('domains')}>대시보드</MdButton>
        </div>
      </ScreenPad>
    </div>
  );
}

function MiniBar({ label, value, color, C }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="md-label-small" style={{ color: C('on-surface-variant') }}>{label}</span>
        <span className="md-label-small" style={{ color, fontWeight: 700 }}>{value}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: C('surface-container-highest'), overflow: 'hidden' }}>
        <div style={{ width: value + '%', height: '100%', borderRadius: 3, background: color }} />
      </div>
    </div>
  );
}

/* ===================== ② 내 영역 대시보드 ===================== */
function DomainDashScreen({ t, go }) {
  const C = window.SB.C;
  const doms = AUDIT_DOMAINS;
  const total = doms.reduce((s, d) => s + d.count, 0);
  const [sort, setSort] = React.useState('활동'); // 활동 | 조각수 | 밝기
  const sorted = [...doms].sort((a, b) =>
    sort === '조각수' ? b.count - a.count : sort === '밝기' ? b.cov - a.cov : 0);

  return (
    <ScreenPad>
      {/* summary strip */}
      <MdCard variant="filled" style={{ padding: 16, marginTop: 4, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div>
          <div className="md-display-small" style={{ color: C('on-surface'), fontWeight: 600, lineHeight: 1 }}>{total}</div>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 4 }}>전체 조각</div>
        </div>
        <div style={{ width: 1, alignSelf: 'stretch', background: C('outline-variant') }} />
        <div style={{ flex: 1 }}>
          <div className="md-body-medium" style={{ color: C('on-surface'), wordBreak: 'keep-all' }}>
            7개 영역에 흩어진 기록을 영역별로 모아 봐요. 조각이 쌓일수록 그 별이 밝아져요.
          </div>
        </div>
      </MdCard>

      {/* sort */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {window.SB_DATA.audit.sortOptions.map((s) => ( // → data/screens/audit.json
          <MdChip key={s} variant="filter" selected={sort === s} onClick={() => setSort(s)}>{s} 순</MdChip>
        ))}
      </div>

      {/* domain cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
        {sorted.map((d) => (
          <MdCard key={d.id} variant="outlined" onClick={() => { const s = starOf(d.id); if (s) go('star', s); }} style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center',
                background: C('secondary-container'), color: C('on-secondary-container') }}>
                <Icon name={d.icon} size={18} />
              </div>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: C('primary'),
                opacity: 0.3 + (d.level / 5) * 0.7, boxShadow: `0 0 8px ${C('primary')}` }} />
            </div>
            <div className="md-title-small" style={{ color: C('on-surface'), marginTop: 10 }}>{d.name}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 2 }}>
              <span className="md-title-medium" style={{ color: C('primary'), fontWeight: 600 }}>{d.count}</span>
              <span className="md-body-small" style={{ color: C('on-surface-variant') }}>조각 · {d.last}</span>
            </div>
            {/* core themes */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
              {d.themes.map((th) => (
                <span key={th} className="md-label-small" style={{ color: C('on-surface-variant'),
                  background: C('surface-container-highest'), padding: '2px 8px', borderRadius: 7, whiteSpace: 'nowrap' }}>{th}</span>
              ))}
            </div>
          </MdCard>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <MdButton variant="filled" icon="checklist" style={{ flex: 1 }} onClick={() => go('audit-full')}>종합 점검 보기</MdButton>
        <MdButton variant="outlined" icon="add" onClick={() => go('lifeinput')}>영역 기록</MdButton>
      </div>
    </ScreenPad>
  );
}

/* ===================== ③ 생활영역 전용 입력 ===================== */
const INPUT_TEMPLATES = window.SB_DATA.audit.inputTemplates; // → data/screens/audit.json

function DomainInputScreen({ t, go, param }) {
  const C = window.SB.C;
  const preset = param && param.tplId ? INPUT_TEMPLATES.find((x) => x.id === param.tplId)
    : param && param.id ? INPUT_TEMPLATES.find((x) => x.star === param.id) : null;
  const [tpl, setTpl] = React.useState(preset || null);
  const [vals, setVals] = React.useState({});
  const [rating, setRating] = React.useState(0);
  const [slide, setSlide] = React.useState(50);
  const [chip, setChip] = React.useState('');
  const [mood, setMood] = React.useState('');
  const [done, setDone] = React.useState(false);
  const setV = (k, v) => setVals((s) => ({ ...s, [k]: v }));
  const MOODS = window.SB_DATA.audit.moods; // → data/screens/audit.json

  /* picker */
  if (!tpl) {
    return (
      <ScreenPad>
        <div className="md-headline-small" style={{ color: C('on-surface'), margin: '8px 0 4px' }}>영역 기록</div>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 16, wordBreak: 'keep-all' }}>
          형식이 정해진 기록은 칸을 따라 적으면 돼요. 세컨비가 알맞은 별로 엮어요.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {INPUT_TEMPLATES.map((x) => (
            <MdCard key={x.id} variant="outlined" onClick={() => { setTpl(x); setVals({}); }} style={{ padding: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center',
                background: C(x.accent === 'tertiary' ? 'tertiary-container' : 'primary-container'),
                color: C(x.accent === 'tertiary' ? 'on-tertiary-container' : 'on-primary-container') }}>
                <Icon name={x.icon} size={22} />
              </div>
              <div className="md-title-small" style={{ color: C('on-surface'), marginTop: 10 }}>{x.label}</div>
              <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 2 }}>{x.domain}</div>
            </MdCard>
          ))}
        </div>
      </ScreenPad>
    );
  }

  /* success */
  if (done) {
    return (
      <ScreenPad>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 420, gap: 18, textAlign: 'center' }}>
          <div style={{ width: 88, height: 88, borderRadius: '50%', display: 'grid', placeItems: 'center',
            background: C('primary-container'), color: C('on-primary-container') }}>
            <Icon name="check" size={42} stroke={2.4} />
          </div>
          <div className="md-headline-small" style={{ color: C('on-surface') }}>담았어요</div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', maxWidth: 280 }}>
            <b>{tpl.label}</b> 기록을 <b>{tpl.domain}</b> 별로 엮는 중이에요. 분석은 백그라운드에서 진행되니 계속 쓰셔도 돼요.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <MdButton variant="tonal" icon="add" onClick={() => { setTpl(null); setDone(false); setVals({}); setRating(0); setSlide(50); setChip(''); setMood(''); }}>다른 영역</MdButton>
            <MdButton variant="filled" icon="auto_awesome" onClick={() => { const s = starOf(tpl.star); if (s) go('star', s); else go('records'); }}>그 별 보기</MdButton>
          </div>
        </div>
      </ScreenPad>
    );
  }

  /* form */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 12px' }}>
        <button onClick={() => setTpl(null)} className="md-interactive"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent',
            color: C('primary'), cursor: 'pointer', padding: '6px 8px 6px 0', margin: '4px 0' }}>
          <span className="md-state" /><Icon name="chevron_left" size={18} /><span className="md-label-large">형식 다시 고르기</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 16px' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', flex: '0 0 auto',
            background: C(tpl.accent === 'tertiary' ? 'tertiary-container' : 'primary-container'),
            color: C(tpl.accent === 'tertiary' ? 'on-tertiary-container' : 'on-primary-container') }}>
            <Icon name={tpl.icon} size={24} />
          </div>
          <div>
            <div className="md-headline-small" style={{ color: C('on-surface') }}>{tpl.label}</div>
            <div className="md-body-small" style={{ color: C('on-surface-variant') }}>{tpl.domain} 별로 엮여요</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tpl.fields.map((f) => (
            f.date ? (
              <DatePickerField key={f.k} C={C} icon={f.icon} label={f.label} hint="날짜를 골라요" futureOnly={f.futureOnly}
                value={vals[f.k] || ''} onChange={(v) => setV(f.k, v)} />
            ) : (
              <AField key={f.k} C={C} icon={f.icon} label={f.label} hint={f.hint} multi={f.multi}
                value={vals[f.k] || ''} onChange={(v) => setV(f.k, v)} />
            )
          ))}

          {tpl.chips && (
            <div>
              <FieldLabel C={C} icon="label">{tpl.chips.label}</FieldLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {tpl.chips.opts.map((o) => (
                  <MdChip key={o} variant="filter" selected={chip === o} onClick={() => setChip(o)}>{o}</MdChip>
                ))}
              </div>
            </div>
          )}

          {tpl.rating && (
            <div>
              <FieldLabel C={C} icon="star">{tpl.rating}</FieldLabel>
              <div style={{ display: 'flex', gap: 6 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setRating(n)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 2 }}>
                    <Icon name="star" fill={n <= rating} size={30} style={{ color: n <= rating ? C('tertiary') : C('outline-variant') }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {tpl.slider && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <FieldLabel C={C} icon="tune">{tpl.slider.label}</FieldLabel>
                <span className="md-title-small" style={{ color: C('primary'), fontWeight: 700 }}>
                  {tpl.slider.max ? Math.round((slide / 100) * tpl.slider.max) : slide}{tpl.slider.unit}
                </span>
              </div>
              <input type="range" min="0" max="100" value={slide} onChange={(e) => setSlide(+e.target.value)}
                style={{ width: '100%', accentColor: C('primary') }} />
            </div>
          )}

          {tpl.mood && (
            <div>
              <FieldLabel C={C} icon="favorite">{tpl.mood}</FieldLabel>
              <div style={{ display: 'flex', gap: 8 }}>
                {MOODS.map(([ic, lb]) => (
                  <button key={lb} onClick={() => setMood(lb)} className="md-interactive"
                    style={{ flex: 1, border: `1px solid ${mood === lb ? C('primary') : C('outline-variant')}`, borderRadius: 12,
                      background: mood === lb ? C('primary-container') : C('surface-container'), color: C('on-surface'),
                      padding: '10px 0', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span className="md-state" />
                    <Icon name={ic} size={22} style={{ color: mood === lb ? C('on-primary-container') : C('on-surface-variant') }} />
                    <span className="md-label-small" style={{ color: C('on-surface-variant') }}>{lb}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* submit bar */}
      <div style={{ padding: '10px 16px calc(10px + env(safe-area-inset-bottom))', borderTop: `1px solid ${C('outline-variant')}`, background: C('surface') }}>
        <MdButton variant="filled" icon="check" style={{ width: '100%' }} onClick={() => setDone(true)}>담기</MdButton>
      </div>
    </div>
  );
}

/* local field helpers (self-contained — matches capture's Field look) */
function FieldLabel({ icon, children, C }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      {icon && <Icon name={icon} size={15} style={{ color: C('on-surface-variant') }} />}
      <span className="md-label-medium" style={{ color: C('on-surface-variant') }}>{children}</span>
    </div>
  );
}
function AField({ icon, label, hint, value, onChange, multi, C }) {
  return (
    <div>
      <FieldLabel C={C} icon={icon}>{label}</FieldLabel>
      {multi ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={hint} rows={3}
          style={{ width: '100%', resize: 'none', border: `1px solid ${C('outline-variant')}`, borderRadius: 12, padding: '11px 13px',
            background: C('surface-container-highest'), color: C('on-surface'), fontFamily: 'var(--md-ref-typeface-plain)', fontSize: 15, lineHeight: 1.5, outline: 'none' }} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={hint}
          style={{ width: '100%', border: `1px solid ${C('outline-variant')}`, borderRadius: 12, padding: '11px 13px',
            background: C('surface-container-highest'), color: C('on-surface'), fontFamily: 'var(--md-ref-typeface-plain)', fontSize: 15, outline: 'none' }} />
      )}
    </div>
  );
}

window.LifeAuditScreen = LifeAuditScreen;
window.DomainDashScreen = DomainDashScreen;
window.DomainInputScreen = DomainInputScreen;
