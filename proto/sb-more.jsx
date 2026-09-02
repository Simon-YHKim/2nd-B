/* ============================================================
   2nd-Brain · 비서 도구 + 데이터 주권 + 성장 표현
   - FocusScreen    : 일일 집중(포모도로) — 카운트다운 링·세션·연결 별
   - RemindersScreen: 예약 리마인더 — 일정 목록·토글·출처
   - ImportScreen   : 외부 가져오기 임포트(파일/계정 · 3블록 동의 → 파싱 → 결과 → ratify · 이력/철회)
   - DataReviewScreen: 내 데이터 리뷰 — 보관 데이터·파생 신호 열람·삭제권
   - ShareCardScreen: 공유 카드 1080×1080 (insight · constellation 2변형)
   - ImagineScreen  : 공상 → 탐색 (자유발상 → 다음 한 걸음 후보)
   Export → window
   ============================================================ */
const { useState: useM, useRef: useMR, useEffect: useME } = React;

/* ===================== 일일 집중 (포모도로) ===================== */
function FocusScreen({ t, go }) {
  const C = window.SB.C;
  const PRESETS = window.SB_DATA.more.focusPresets; // → data/screens/more.json
  const [mins, setMins] = useM(25);
  const [left, setLeft] = useM(25 * 60);
  const [running, setRunning] = useM(false);
  const [sessions, setSessions] = useM(2);
  const [star, setStar] = useM('성장');
  const tickRef = useMR(null);

  useME(() => () => clearInterval(tickRef.current), []);
  useME(() => {
    if (!running) { clearInterval(tickRef.current); return; }
    tickRef.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) { clearInterval(tickRef.current); setRunning(false); setSessions((n) => n + 1); return mins * 60; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, [running, mins]);

  const setPreset = (m) => { setMins(m); setLeft(m * 60); setRunning(false); };
  const reset = () => { setLeft(mins * 60); setRunning(false); };
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const frac = 1 - left / (mins * 60);
  const R = 120, CIRC = 2 * Math.PI * R;
  const stars = window.SB_DATA.more.focusStars; // → data/screens/more.json

  return (
    <ScreenPad>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), margin: '4px 0 18px', textAlign: 'center', wordBreak: 'keep-all' }}>
        한 가지에만 집중하는 시간이에요. 끝나면 <b style={{ color: C('on-surface') }}>{star} 별</b>에 한 걸음.
      </div>

      {/* timer ring */}
      <div style={{ position: 'relative', width: 280, height: 280, margin: '0 auto' }}>
        <svg width="280" height="280" viewBox="0 0 280 280" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="140" cy="140" r={R} fill="none" stroke={C('surface-container-highest')} strokeWidth="14" />
          <circle cx="140" cy="140" r={R} fill="none" stroke={C('primary')} strokeWidth="14" strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - frac)}
            style={{ transition: 'stroke-dashoffset 1s linear', filter: `drop-shadow(0 0 8px ${C('primary')})` }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 56, fontWeight: 700, color: C('on-surface'), letterSpacing: '.02em' }}>{mm}:{ss}</div>
          <div className="md-label-large" style={{ color: C('on-surface-variant'), marginTop: 2 }}>{running ? '집중 중' : '준비됨'}</div>
        </div>
      </div>

      {/* presets */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 18 }}>
        {PRESETS.map((m) => <MdChip key={m} variant="filter" selected={mins === m} onClick={() => setPreset(m)}>{m}분</MdChip>)}
      </div>

      {/* controls */}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <MdButton variant={running ? 'tonal' : 'filled'} icon={running ? 'pause' : 'play_arrow'} style={{ flex: 2 }}
          onClick={() => setRunning((r) => !r)}>{running ? '일시정지' : '집중 시작'}</MdButton>
        <MdButton variant="outlined" icon="replay" onClick={reset}>리셋</MdButton>
      </div>

      {/* linked star */}
      <SectionLabel>어떤 별을 위해?</SectionLabel>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px', padding: '0 16px 4px' }}>
        {stars.map((s) => <MdChip key={s} icon="star_shine" variant="filter" selected={star === s} onClick={() => setStar(s)}>{s}</MdChip>)}
      </div>

      {/* today summary */}
      <MdCard variant="filled" style={{ padding: 16, marginTop: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{ width: 12, height: 12, borderRadius: '50%',
              background: i < sessions ? C('primary') : C('surface-variant') }} />
          ))}
        </div>
        <div style={{ flex: 1 }}>
          <div className="md-body-large" style={{ color: C('on-surface') }}>오늘 {sessions}회 집중</div>
          <div className="md-body-small" style={{ color: C('on-surface-variant') }}>약 {sessions * 25}분 · 목표 4회</div>
        </div>
        <Icon name="local_fire_department" fill size={22} style={{ color: '#FF8A5B' }} />
      </MdCard>
    </ScreenPad>
  );
}

/* ===================== 예약 리마인더 ===================== */
function RemindersScreen({ t, go, param }) {
  const C = window.SB.C;
  const [items, setItems] = useM(window.SB_DATA.more.reminders.map((r) => ({ ...r }))); // → data/screens/more.json (clone per mount)
  const [timeEdit, setTimeEdit] = useM(null);   // id of reminder whose time is being edited
  const [justId, setJustId] = useM(null);       // 새로 맞춘 알림 강조
  useME(() => {
    const p = param && param.prefill;
    if (!p) return;
    const nid = Date.now();
    setItems((xs) => [{ id: nid, title: p.title, when: p.when, star: p.star, src: p.src || '세컨비 종합 의견', on: true, repeat: p.repeat || '한 번' }, ...xs]);
    setJustId(nid);
  }, []);
  const toggle = (id) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, on: !x.on } : x)));
  const setWhen = (id, when) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, when } : x)));
  const editing = items.find((x) => x.id === timeEdit);
  const onCount = items.filter((x) => x.on).length;

  return (
    <ScreenPad>
      <MdCard variant="filled" style={{ padding: 14, marginTop: 4, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon name="schedule" size={22} style={{ color: C('primary') }} />
        <div style={{ flex: 1 }}>
          <div className="md-body-large" style={{ color: C('on-surface') }}>예약된 리마인더 {onCount}개</div>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>기기 알림으로만 보내요. 내용은 기기를 떠나지 않아요.</div>
        </div>
      </MdCard>

      {justId &&
      <MdCard variant="filled" style={{ padding: 12, marginTop: 10, display: 'flex', alignItems: 'center', gap: 10,
        background: C('secondary-container') }}>
        <Icon name="check_circle" fill size={20} style={{ color: C('primary'), flex: '0 0 auto' }} />
        <div className="md-body-small" style={{ color: C('on-secondary-container'), wordBreak: 'keep-all' }}>세컨비 종합 의견에서 새 알림을 맞추었어요. 아래에서 시간을 조절할 수 있어요.</div>
      </MdCard>
      }

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {items.map((x) => (
          <MdCard key={x.id} variant="outlined" style={{ padding: 14, opacity: x.on ? 1 : .55,
            ...(x.id === justId ? { boxShadow: `0 0 0 2px ${C('primary')}` } : {}) }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, flex: '0 0 auto', display: 'grid', placeItems: 'center',
                background: C('secondary-container'), color: C('on-secondary-container') }}>
                <Icon name="notifications_active" size={19} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="md-title-small" style={{ color: C('on-surface'), wordBreak: 'keep-all' }}>{x.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  <button onClick={() => setTimeEdit(x.id)} className="md-interactive"
                    style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', cursor: 'pointer',
                      borderRadius: 9999, padding: '3px 9px 3px 8px', background: C('secondary-container') }}>
                    <span className="md-state" />
                    <Icon name="schedule" size={13} style={{ color: C('on-secondary-container') }} />
                    <span className="md-label-medium" style={{ color: C('on-secondary-container'), fontWeight: 700 }}>{x.when}</span>
                  </button>
                  <span style={{ width: 3, height: 3, borderRadius: '50%', background: C('outline') }} />
                  <span className="md-label-small" style={{ color: C('on-surface-variant') }}>{x.repeat}</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '2px 8px', borderRadius: 9999,
                  background: C('surface-container-highest') }}>
                  <Icon name="bubble_chart" size={12} style={{ color: C('tertiary') }} />
                  <span className="md-label-small" style={{ color: C('on-surface-variant') }}>{x.src} · {x.star} 별</span>
                </div>
              </div>
              <MdSwitch checked={x.on} onChange={() => toggle(x.id)} />
            </div>
          </MdCard>
        ))}
      </div>

      <MdButton variant="tonal" icon="add" full style={{ marginTop: 16 }} onClick={() => go('ops')}>오늘의 비서에서 추가</MdButton>

      {editing && <window.TimeSheet value={editing.when} title={editing.title}
        onChange={(when) => setWhen(editing.id, when)} onClose={() => setTimeEdit(null)} />}
    </ScreenPad>
  );
}

/* ===================== 외부 가져오기 임포트 ===================== */
const IMPORT_HISTORY = window.SB_DATA.more.importHistory; // → data/screens/more.json
function ImportScreen({ t, go, env }) {
  const C = window.SB.C;
  const [mode, setMode] = useM('file');     // file · account
  const [phase, setPhase] = useM('pick');    // pick → parsing → result
  const [pct, setPct] = useM(0);
  const tickRef = useMR(null);
  useME(() => () => clearInterval(tickRef.current), []);

  const startParse = () => {
    setPhase('parsing'); setPct(0);
    tickRef.current = setInterval(() => {
      setPct((p) => {
        if (p >= 100) { clearInterval(tickRef.current); setPhase('result'); return 100; }
        return Math.min(100, p + 6 + Math.random() * 12);
      });
    }, 220);
  };
  const ratify = () => { env.showToast({ msg: '가져온 신호를 별에 반영했어요', action: '승인 이력', goTo: 'ratify' }); go('ratify'); };

  const consents = window.SB_DATA.more.consents; // → data/screens/more.json

  return (
    <ScreenPad>
      {phase === 'pick' && (
        <React.Fragment>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), margin: '4px 0 14px', wordBreak: 'keep-all' }}>
            다른 곳에 흩어진 나를 가져와요. 가져온 것도 <b style={{ color: C('on-surface') }}>당신의 비준</b>으로만 별에 반영돼요.
          </div>

          {/* mode toggle */}
          <div style={{ display: 'flex', gap: 8 }}>
            {window.SB_DATA.more.importModes.map(([id, ic, lb]) => ( // → data/screens/more.json
              <button key={id} onClick={() => setMode(id)} className="md-interactive"
                style={{ position: 'relative', flex: 1, padding: '14px 10px', borderRadius: 14, cursor: 'pointer',
                  border: `1.5px solid ${mode === id ? C('primary') : C('outline-variant')}`,
                  background: mode === id ? C('secondary-container') : C('surface-container'), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <span className="md-state" />
                <Icon name={ic} size={22} style={{ color: mode === id ? C('on-secondary-container') : C('on-surface-variant') }} />
                <span className="md-title-small" style={{ color: mode === id ? C('on-secondary-container') : C('on-surface') }}>{lb}</span>
              </button>
            ))}
          </div>

          {/* source */}
          <SectionLabel>{mode === 'file' ? '파일 선택' : '연결할 계정'}</SectionLabel>
          {mode === 'file' ? (
            <div style={{ border: `1.5px dashed ${C('outline')}`, borderRadius: 16, padding: '28px 16px', textAlign: 'center', background: C('surface-container') }}>
              <Icon name="cloud_upload" size={40} style={{ color: C('on-surface-variant') }} />
              <div className="md-body-large" style={{ color: C('on-surface'), marginTop: 8 }}>여기에 파일을 놓거나 선택</div>
              <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 2 }}>.json · .zip · .txt · .md · .csv</div>
              <MdButton variant="tonal" icon="attach_file" style={{ marginTop: 14 }} onClick={startParse}>파일 선택</MdButton>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {window.SB_DATA.more.accountSources.map(([k, ic]) => ( // → data/screens/more.json
                <MdCard key={k} variant="outlined" onClick={startParse} style={{ padding: 13 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Icon name={ic} size={20} style={{ color: C('on-surface-variant') }} />
                    <span className="md-body-large" style={{ flex: 1, color: C('on-surface') }}>{k}</span>
                    <Icon name="link" size={18} style={{ color: C('primary') }} />
                  </div>
                </MdCard>
              ))}
            </div>
          )}

          {/* 3-block consent */}
          <SectionLabel>가져오기 전 약속</SectionLabel>
          <MdCard variant="filled" style={{ padding: 4 }}>
            {consents.map((c, i) => (
              <div key={c.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px',
                borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
                <Icon name={c.icon} size={20} style={{ color: C('tertiary'), flex: '0 0 auto', marginTop: 1 }} />
                <div>
                  <div className="md-body-large" style={{ color: C('on-surface') }}>{c.label}</div>
                  <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>{c.note}</div>
                </div>
              </div>
            ))}
          </MdCard>

          {/* history */}
          <SectionLabel>가져오기 이력</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {IMPORT_HISTORY.map((h) => (
              <MdCard key={h.id} variant="outlined" style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="md-body-large" style={{ color: C('on-surface'), wordBreak: 'keep-all' }}>{h.src}</div>
                    <div className="md-body-small" style={{ color: C('on-surface-variant') }}>{h.when} · {h.items}개 별가루</div>
                  </div>
                  <MdButton variant="text" size="s" icon="delete" style={{ color: C('error') }}
                    onClick={() => env.showToast({ msg: `${h.src} 가져오기를 철회했어요`, action: '실행 취소' })}>철회</MdButton>
                </div>
              </MdCard>
            ))}
          </div>
        </React.Fragment>
      )}

      {phase === 'parsing' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 420, textAlign: 'center' }}>
          <div style={{ position: 'relative', width: 64, height: 64, marginBottom: 20 }}>
            <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid ${C('primary')}`,
              borderTopColor: 'transparent', animation: 'sb-spin .8s linear infinite' }} />
            <img src="assets/deepspace/secondb-head-front.png" alt="" style={{ position: 'absolute', inset: 12, width: 40, height: 40 }} />
          </div>
          <div className="md-title-medium" style={{ color: C('on-surface') }}>가져온 데이터를 읽는 중</div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginTop: 6, wordBreak: 'keep-all' }}>기기 안에서 별가루으로 나누고 있어요…</div>
          <div style={{ width: 200, marginTop: 18 }}><ProgressLinear value={pct} color={C('primary')} /></div>
          <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 13, color: C('on-surface-variant'), marginTop: 8 }}>{Math.round(pct)}%</div>
        </div>
      )}

      {phase === 'result' && (
        <React.Fragment>
          <MdCard variant="filled" style={{ padding: 16, marginTop: 4, background: C('primary-container') }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Icon name="check_circle" fill size={26} style={{ color: C('on-primary-container') }} />
              <div>
                <div className="md-title-medium" style={{ color: C('on-primary-container') }}>87개 별가루을 찾았어요</div>
                <div className="md-body-small" style={{ color: C('on-primary-container'), opacity: .8 }}>4개 별에 반영 후보예요</div>
              </div>
            </div>
          </MdCard>

          <SectionLabel>반영 후보 (비준 필요)</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {window.SB_DATA.more.ratifyCandidates.map(([s, n, chg]) => ( // → data/screens/more.json
              <MdCard key={s} variant="outlined" style={{ padding: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Icon name="star_shine" fill size={18} style={{ color: C('primary') }} />
                  <span className="md-title-small" style={{ flex: 1, color: C('on-surface') }}>{s} 별</span>
                  <span className="md-label-medium" style={{ color: C('on-surface-variant') }}>{n}개</span>
                  <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, color: C('primary'), marginLeft: 8 }}>{chg}</span>
                </div>
              </MdCard>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <MdButton variant="filled" icon="check" style={{ flex: 2 }} onClick={ratify}>모두 비준하고 반영</MdButton>
            <MdButton variant="outlined" onClick={() => go('records')}>하나씩 검토</MdButton>
          </div>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 12, textAlign: 'center', wordBreak: 'keep-all' }}>
            반영 후에도 ‘승인 이력’에서 되돌리거나 통째로 철회할 수 있어요.
          </div>
        </React.Fragment>
      )}
    </ScreenPad>
  );
}

/* ===================== 내 데이터 리뷰 ===================== */
function DataReviewScreen({ t, go, env }) {
  const C = window.SB.C;
  const [confirm, setConfirm] = React.useState(null);
  const stores = window.SB_DATA.more.stores; // → data/screens/more.json
  const signals = window.SB_DATA.more.signals; // → data/screens/more.json

  return (
    <ScreenPad>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), margin: '4px 0 14px', wordBreak: 'keep-all' }}>
        내 데이터가 어떻게 쓰이는지 전부 보여줘요. 무엇이든 열람하고 지울 수 있어요.
      </div>

      {/* stored data */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {stores.map((s) => (
          <MdCard key={s.label} variant="filled" style={{ padding: 12, textAlign: 'center' }}>
            <Icon name={s.icon} size={20} style={{ color: C(s.tone) }} />
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 18, fontWeight: 700, color: C('on-surface'), marginTop: 6 }}>{s.n}</div>
            <div className="md-label-small" style={{ color: C('on-surface-variant'), marginTop: 2, wordBreak: 'keep-all' }}>{s.label}</div>
          </MdCard>
        ))}
      </div>

      {/* derived signals */}
      <SectionLabel>파생 신호 · 무엇을 추정했나</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {signals.map((sg, i) => (
          <MdCard key={i} variant="outlined" style={{ padding: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="md-body-small" style={{ color: C('on-surface-variant') }}>{sg.from}</span>
              <Icon name="arrow_forward" size={13} style={{ color: C('outline') }} />
              <span className="md-body-medium" style={{ color: C('on-surface'), fontWeight: 600, wordBreak: 'keep-all' }}>{sg.to}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <span className="md-label-small" style={{ flex: 1, color: C('tertiary') }}>{sg.conf}</span>
              <MdButton variant="text" size="s" onClick={() => go('ratify')}>근거</MdButton>
              <MdButton variant="text" size="s" icon="delete" style={{ color: C('error') }}
                onClick={() => env.showToast({ msg: '이 파생 신호를 지웠어요', action: '실행 취소' })}>삭제</MdButton>
            </div>
          </MdCard>
        ))}
      </div>

      {/* rights */}
      <SectionLabel>내 권리</SectionLabel>
      <MdCard variant="filled" style={{ padding: 4 }}>
        {[
          { icon: 'download', label: '내 데이터 전체 내보내기', sub: 'IDEN · 원문 · 파생 신호', route: 'iden' },
          { icon: 'cloud_off', label: '파생 신호만 초기화', sub: '원문은 두고 추정만 지우기', danger: false },
          { icon: 'delete_forever', label: '계정·데이터 영구 삭제', sub: '되돌릴 수 없어요', danger: true },
        ].map((row, i) => (
          <div key={row.label} className="md-interactive"
            onClick={() => {
              if (row.route) return go(row.route);
              if (row.danger) setConfirm({ title: '정말 영구 삭제할까요?', danger: true, confirmLabel: '영구 삭제',
                body: '계정과 모든 기록·파생 신호가 영구히 삭제돼요. 이 작업은 되돌릴 수 없어요.',
                onConfirm: () => env.showToast({ msg: '영구 삭제를 접수했어요' }) });
              else setConfirm({ title: '파생 신호를 초기화할까요?', danger: false, confirmLabel: '초기화',
                body: '세컨비가 추정한 모든 신호가 지워져요. 원본 기록은 그대로 남고, 다시 쌓을 수 있어요.',
                onConfirm: () => env.showToast({ msg: '파생 신호를 초기화했어요' }) });
            }}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '12px', borderRadius: 10,
              borderTop: i ? `1px solid ${C('outline-variant')}` : 'none', cursor: 'pointer' }}>
            <span className="md-state" />
            <Icon name={row.icon} size={21} style={{ color: row.danger ? C('error') : C('on-surface-variant') }} />
            <div style={{ flex: 1 }}>
              <div className="md-body-large" style={{ color: row.danger ? C('error') : C('on-surface') }}>{row.label}</div>
              <div className="md-body-small" style={{ color: C('on-surface-variant') }}>{row.sub}</div>
            </div>
            <Icon name="chevron_right" size={20} style={{ color: C('on-surface-variant') }} />
          </div>
        ))}
      </MdCard>
      <ConfirmDialog open={!!confirm} {...(confirm || {})} onClose={() => setConfirm(null)} />
    </ScreenPad>
  );
}

/* ===================== 공유 카드 1080×1080 ===================== */
function ShareCardScreen({ t, go, env }) {
  const C = window.SB.C;
  const [variant, setVariant] = useM('insight');   // insight · constellation
  const stars = window.SB_DATA.more.shareStars; // → data/screens/more.json
  const CARD = window.SB_DATA.more.cardSize;  // preview px; exports at 1080 · → data/screens/more.json

  return (
    <ScreenPad>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), margin: '4px 0 14px', textAlign: 'center', wordBreak: 'keep-all' }}>
        1080×1080 정사각 카드로 내보내요. <b style={{ color: C('on-surface') }}>원문은 빼고</b>, 보여줄 한 줄만 담겨요.
      </div>

      {/* variant toggle */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
        {window.SB_DATA.more.shareVariants.map(([id, lb]) => ( // → data/screens/more.json
          <MdChip key={id} variant="filter" selected={variant === id} onClick={() => setVariant(id)}>{lb}</MdChip>
        ))}
      </div>

      {/* preview */}
      <div style={{ width: CARD, height: CARD, margin: '0 auto', borderRadius: 24, overflow: 'hidden', position: 'relative',
        background: 'radial-gradient(130% 100% at 50% 0%, #16203a, #070A13 75%)', boxShadow: '0 16px 44px rgba(0,0,0,.5)',
        border: '1px solid rgba(127,208,255,.18)' }} data-om-raster>
        {variant === 'insight' ? (
          <div style={{ position: 'absolute', inset: 0, padding: 30, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, letterSpacing: '.18em', color: '#7FD0FF' }}>2ND-BRAIN · 이번 주</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <div style={{ fontSize: 27, fontWeight: 700, color: '#EAF2FF', lineHeight: 1.4, wordBreak: 'keep-all' }}>
                나는 <span style={{ color: '#82D8F6' }}>먼저 다가가는</span> 사람.<br />이번 주, 관계 별이 가장 밝았어요.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="assets/deepspace/secondb-head-front.png" alt="" style={{ width: 34, height: 34 }} />
              <div style={{ fontSize: 13, color: 'rgba(220,230,255,.7)' }}>세컨비가 함께 본 한 주</div>
            </div>
          </div>
        ) : (
          <div style={{ position: 'absolute', inset: 0, padding: 26 }}>
            {/* user-fillable backdrop photo (optional) */}
            <image-slot id="sb-share-bg" shape="rect" placeholder="배경 사진 (선택)"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }}></image-slot>
            <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
              background: 'radial-gradient(120% 90% at 50% 10%, rgba(7,10,19,.35), rgba(7,10,19,.82) 78%)' }} />
            <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 11, letterSpacing: '.18em', color: '#7FD0FF', textAlign: 'center' }}>MY CONSTELLATION</div>
            <div style={{ position: 'relative', width: '100%', height: 220, marginTop: 6 }}>
              {stars.map((s) => (
                <div key={s.k} style={{ position: 'absolute', left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-50%,-50%)' }}>
                  <span style={{ display: 'block', width: s.on ? 11 : 6, height: s.on ? 11 : 6, borderRadius: '50%',
                    background: s.on ? '#BFE9FF' : 'rgba(127,208,255,.4)',
                    boxShadow: s.on ? '0 0 14px 3px rgba(130,216,246,.8)' : 'none' }} />
                </div>
              ))}
              <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 16, height: 16,
                borderRadius: '50%', background: '#EAF2FF', boxShadow: '0 0 20px 5px rgba(207,189,255,.7)' }} />
            </div>
            <div style={{ textAlign: 'center', marginTop: 6 }}>
              <div style={{ fontSize: 19, fontWeight: 700, color: '#EAF2FF' }}>5개 별이 빛나는 중</div>
              <div style={{ fontSize: 13, color: 'rgba(220,230,255,.65)', marginTop: 2 }}>2nd-Brain · 124개 별가루</div>
            </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <MdButton variant="filled" icon="download" style={{ flex: 1 }} onClick={() => env.showToast({ msg: '카드를 사진에 저장했어요', action: '보기' })}>이미지 저장</MdButton>
        <MdButton variant="tonal" icon="ios_share" style={{ flex: 1 }} onClick={() => env.showToast({ msg: '공유 시트를 열었어요' })}>공유</MdButton>
      </div>
      <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 12, textAlign: 'center', wordBreak: 'keep-all' }}>
        기록 원문·수치는 카드에 포함되지 않아요. 보여줄 문장만 골라 담아요.
      </div>
    </ScreenPad>
  );
}

/* ===================== 공상 → 탐색 ===================== */
const IMAGINE_SEEDS = window.SB_DATA.more.imagineSeeds; // → data/screens/more.json
function ImagineScreen({ t, go }) {
  const C = window.SB.C;
  const [picked, setPicked] = useM(null);
  const seed = IMAGINE_SEEDS.find((s) => s.angle === picked);

  return (
    <ScreenPad>
      <MdCard variant="filled" style={{ padding: 16, marginTop: 4, background: 'linear-gradient(135deg, var(--md-sys-color-tertiary-container), var(--md-sys-color-surface-container-low))' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Icon name="lightbulb" fill size={24} style={{ color: C('tertiary'), flex: '0 0 auto' }} />
          <div>
            <div className="md-title-medium" style={{ color: C('on-surface') }}>공상하기</div>
            <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 3, wordBreak: 'keep-all' }}>
              정답 없이 멀리 던져봐요. 마음에 드는 갈래를 고르면 <b>다음 한 걸음</b>으로 좁혀줄게요.
            </div>
          </div>
        </div>
      </MdCard>

      {/* divergent angles */}
      <SectionLabel>세컨비가 던진 갈래</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {IMAGINE_SEEDS.map((s) => {
          const on = picked === s.angle;
          return (
            <MdCard key={s.angle} variant={on ? 'filled' : 'outlined'} onClick={() => setPicked(on ? null : s.angle)}
              style={{ padding: 14, border: on ? `1.5px solid ${C('tertiary')}` : undefined, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, flex: '0 0 auto', display: 'grid', placeItems: 'center',
                  background: C('tertiary-container'), color: C('on-tertiary-container') }}>
                  <Icon name={s.icon} size={19} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="md-label-small" style={{ color: C('tertiary'), fontWeight: 700 }}>{s.angle}</span>
                  <div className="md-title-small" style={{ color: C('on-surface'), wordBreak: 'keep-all' }}>{s.title}</div>
                  <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 4, wordBreak: 'keep-all' }}>{s.body}</div>
                </div>
                <Icon name={on ? 'expand_less' : 'expand_more'} size={20} style={{ color: C('on-surface-variant') }} />
              </div>
            </MdCard>
          );
        })}
      </div>

      {/* next steps for picked */}
      {seed && (
        <React.Fragment>
          <SectionLabel>다음 한 걸음 후보</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {seed.steps.map((st, i) => (
              <MdCard key={i} variant="outlined" style={{ padding: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', flex: '0 0 auto', display: 'grid', placeItems: 'center',
                    background: C('secondary-container'), color: C('on-secondary-container'), fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                  <span className="md-body-medium" style={{ flex: 1, color: C('on-surface'), wordBreak: 'keep-all' }}>{st}</span>
                </div>
              </MdCard>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <MdButton variant="filled" icon="add" style={{ flex: 1 }} onClick={() => go('capture')}>담기로 옮기기</MdButton>
            <MdButton variant="outlined" icon="bubble_chart" onClick={() => go('chat')}>세컨비와 더</MdButton>
          </div>
        </React.Fragment>
      )}
    </ScreenPad>
  );
}

Object.assign(window, { FocusScreen, RemindersScreen, ImportScreen, DataReviewScreen, ShareCardScreen, ImagineScreen });
