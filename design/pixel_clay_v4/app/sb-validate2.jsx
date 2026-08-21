/* ============================================================
   2nd-Brain · B그룹 — 검증 측정도구 (브리프 04-validation.md)
   - IpipNeoScreen : /ipip-neo 성격 정밀검사 IPIP-NEO-120 (도메인 5 + facet 30)
   - EsmScreen     : /esm 가벼운 체크인 (15초 순간 표집)
   카피는 브리프 원문 고정.
   ============================================================ */
const { useState: useVl } = React;

/* ── IPIP-NEO-120: 도메인 5 × facet 6 ── */
const IPIP_DOMAINS = [
{ id: 'o', name: '개방성', facets: ['상상', '예술적 관심', '감정 자각', '모험심', '지적 호기심', '자유주의'] },
{ id: 'c', name: '성실성', facets: ['자기효능감', '체계성', '의무감', '성취 추구', '자기 규율', '신중함'] },
{ id: 'e', name: '외향성', facets: ['친밀감', '사교성', '주장성', '활동 수준', '자극 추구', '쾌활함'] },
{ id: 'a', name: '우호성', facets: ['신뢰', '도덕성', '이타심', '협력', '겸손', '공감'] },
{ id: 'n', name: '신경성', facets: ['불안', '분노', '우울', '자의식', '무절제', '상처받기 쉬움'] }];
const IPIP_LIKERT = ['전혀 아니다', '대체로 아니다', '보통', '대체로 그렇다', '매우 그렇다'];
const IPIP_ITEMS = (() => {
  const stems = [
  '이 문장은 나를 잘 설명한다', '주변 사람들도 나를 그렇게 볼 것이다', '지난 한 달을 돌아봐도 그렇다', '어릴 때부터 그런 편이었다'];
  const out = [];
  IPIP_DOMAINS.forEach((d) => d.facets.forEach((f, fi) => {
    for (let k = 0; k < 4; k++) out.push({ id: `${d.id}${fi}${k}`, dom: d.id, facet: f, text: `${f} — ${stems[k]}.` });
  }));
  return out; // 5 × 6 × 4 = 120
})();

function QuantPager({ items, page, perPage, responses, onPick, likert }) {
  const C = window.SB.C;
  const slice = items.slice(page * perPage, page * perPage + perPage);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {slice.map((it, i) => (
        <div key={it.id} style={{ background: C('surface-container'), boxShadow: 'var(--ds-edge)', padding: 12 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), flex: '0 0 auto', paddingTop: 2 }}>
              {String(page * perPage + i + 1).padStart(3, '0')}
            </span>
            <span style={{ flex: 1, fontSize: 12, color: C('on-surface'), lineHeight: 1.5, wordBreak: 'keep-all' }}>{it.text}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${likert.length},1fr)`, gap: 4 }}>
            {likert.map((lb, v) => {
              const on = responses[it.id] === v + 1;
              return (
                <button key={v} onClick={() => onPick(it.id, v + 1)} className="md-interactive"
                style={{ position: 'relative', border: 'none', cursor: 'pointer', minHeight: 44, padding: '6px 2px',
                  background: on ? C('primary') : C('surface-container-highest'),
                  color: on ? C('on-primary') : C('on-surface-variant'), boxShadow: 'var(--ds-edge)',
                  fontSize: 10, fontFamily: 'var(--font-micro)', lineHeight: 1.25, wordBreak: 'keep-all' }}>
                  <span className="md-state" />{lb}
                </button>);
            })}
          </div>
        </div>))}
    </div>);
}

function FacetBar({ label, value, max = 5, tone }) {
  const C = window.SB.C;
  const pct = Math.round(value / max * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      <span style={{ flex: '0 0 auto', width: 82, fontSize: 10, fontFamily: 'var(--font-micro)', color: C('on-surface-variant'), wordBreak: 'keep-all' }}>{label}</span>
      <span style={{ flex: 1, height: 10, background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', position: 'relative' }}>
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct + '%', background: tone || 'var(--ds-core)' }} />
      </span>
      <span style={{ flex: '0 0 auto', width: 26, textAlign: 'right', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface') }}>{value.toFixed(1)}</span>
    </div>);
}

function IpipNeoScreen({ t, go, env, onBack }) {
  const C = window.SB.C;
  const [state, setState] = useVl('filled');
  const [taking, setTaking] = useVl(false);
  const [intro, setIntro] = useVl(false);
  const [page, setPage] = useVl(0);
  const [resp, setResp] = useVl({});
  const [quit, setQuit] = useVl(false);
  const [saved, setSaved] = useVl(false);
  const PER = 8, PAGES = Math.ceil(IPIP_ITEMS.length / PER);
  const answered = Object.keys(resp).length;
  const pageDone = IPIP_ITEMS.slice(page * PER, page * PER + PER).every((i) => resp[i.id]);

  // 결과: 응답이 있으면 실제 평균, 없으면 데모 시드
  const scores = React.useMemo(() => {
    const out = {};
    IPIP_DOMAINS.forEach((d) => {
      out[d.id] = { name: d.name, facets: {}, avg: 0 };
      let sum = 0;
      d.facets.forEach((f, fi) => {
        const items = IPIP_ITEMS.filter((i) => i.dom === d.id && i.facet === f);
        const vals = items.map((i) => resp[i.id]).filter(Boolean);
        const v = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 2.6 + (fi % 3) * 0.7 + (d.id.charCodeAt(0) % 5) * 0.14;
        out[d.id].facets[f] = Math.min(5, v);
        sum += out[d.id].facets[f];
      });
      out[d.id].avg = sum / d.facets.length;
    });
    return out;
  }, [resp]);

  const start = () => { setIntro(false); setTaking(true); setPage(0); };
  const save = () => {
    setSaved(true);
    setTimeout(() => { setSaved(false); setTaking(false); }, 1400);
  };

  if (taking) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 56, padding: '6px 8px 6px 6px', flex: '0 0 auto' }}>
          <MdIconButton name="arrow_back" title="뒤로" onClick={() => setQuit(true)} />
          <span className="md-title-large" style={{ color: C('on-surface') }}>정밀검사 · IPIP-NEO-120</span>
        </div>
        <div style={{ padding: '0 16px 10px', flex: '0 0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ flex: 1 }}><ProgressLinear value={Math.round(answered / IPIP_ITEMS.length * 100)} /></span>
            <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>{answered} / 120</span>
          </div>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>이 문장이 당신을 얼마나 정확히 묘사하는지 골라주세요.</div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 12px' }}>
          {saved ?
          <div style={{ display: 'grid', placeItems: 'center', padding: '48px 12px', textAlign: 'center' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'center' }}><SbHead size={64} expression="positive" track={false} /></div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), marginTop: 14 }}>저장됐어요 · 페르소나에서 다시 만나요</div>
            </div>
          </div> :
          <QuantPager items={IPIP_ITEMS} page={page} perPage={PER} responses={resp} likert={IPIP_LIKERT}
          onPick={(id, v) => setResp((s) => ({ ...s, [id]: v }))} />}
        </div>
        {!saved &&
        <div style={{ display: 'flex', gap: 8, padding: '10px 16px 14px', flex: '0 0 auto' }}>
          {page > 0 && <MdButton variant="outlined" size="s" icon="chevron_left" onClick={() => setPage((p) => p - 1)}>이전</MdButton>}
          <span style={{ flex: 1 }}>
            {page < PAGES - 1 ?
            <MdButton variant="filled" full disabled={!pageDone} onClick={() => setPage((p) => p + 1)}>다음</MdButton> :
            <MdButton variant="filled" full disabled={answered < IPIP_ITEMS.length} onClick={save}>결과 저장</MdButton>}
          </span>
        </div>}
        {quit &&
        <div onClick={() => setQuit(false)} className="ds-scrim" style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} className="ds-window" style={{ width: '100%', maxWidth: 300, padding: 20, margin: 'var(--u)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), marginBottom: 8 }}>그만두시겠어요?</div>
            <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', marginBottom: 16 }}>
              정말 종료하시겠습니까? 작성 중이던 답변이 저장되지 않고 사라집니다.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" onClick={() => setQuit(false)}>계속하기</MdButton></span>
              <span style={{ flex: 1 }}><MdButton variant="filled" full size="s" onClick={() => { setQuit(false); setTaking(false); setResp({}); }}>종료</MdButton></span>
            </div>
          </div>
        </div>}
      </div>);
  }

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="검사를 불러오는 중이에요…" />;
    if (state === 'error') return <StateView state="error" title="불러오지 못했어요" body="잠시 후 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" />;
    if (state === 'empty') return <StateView state="empty" title="아직 이 별은 어두워요" body="성격 검사를 한 번 마치면 지금의 나 별이 켜져요." cta={() => setIntro(true)} ctaLabel="검사 시작" />;
    return (
      <React.Fragment>
        <div style={{ padding: '10px 0 4px' }}>
          <div className="md-label-medium" style={{ color: C('on-surface-variant') }}>세부 특질 30가지</div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginTop: 4, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            5가지 축을 그 아래 세부 특질까지 펼쳐봤어요. 막대는 자기보고 기준이에요.
          </div>
        </div>
        {IPIP_DOMAINS.map((d) => (
          <MdCard key={d.id} variant="filled" style={{ padding: 14, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C('on-surface') }}>{d.name}</span>
              <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, color: 'var(--ds-core)' }}>{scores[d.id].avg.toFixed(1)}/5</span>
            </div>
            {d.facets.map((f) => <FacetBar key={f} label={f} value={scores[d.id].facets[f]} />)}
          </MdCard>))}
        <div style={{ marginTop: 16 }}><MdButton variant="outlined" full icon="cached" onClick={() => setIntro(true)}>다시 검사하기</MdButton></div>
      </React.Fragment>);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState} />
      {intro &&
      <div onClick={() => setIntro(false)} className="ds-scrim" style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', padding: 24 }}>
        <div onClick={(e) => e.stopPropagation()} className="ds-window" style={{ width: '100%', maxWidth: 306, padding: 20, margin: 'var(--u)' }}>
          <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, letterSpacing: '.12em', color: 'var(--ds-nebula)', marginBottom: 6 }}>정밀검사 · IPIP-NEO-120</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), marginBottom: 8, wordBreak: 'keep-all' }}>이 문장이 당신을 얼마나 정확히 묘사하는지 골라주세요.</div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', textWrap: 'pretty', marginBottom: 6 }}>
            120문항이에요. 5가지 축과 그 아래 30개 세부 특질까지 함께 봅니다.
          </div>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', marginBottom: 16 }}>
            한국어 문항은 검증되지 않은 참고 번역이에요. 검증 원본은 영어판입니다.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" onClick={() => setIntro(false)}>취소</MdButton></span>
            <span style={{ flex: 1 }}><MdButton variant="filled" full size="s" onClick={start}>검사 시작</MdButton></span>
          </div>
        </div>
      </div>}
    </div>);
}

/* ===================== /esm 가벼운 체크인 ===================== */
const ESM_TAGS = ['혼자', '사람들과', '일/공부', '이동 중', '쉬는 중', '밖'];

function EsmScreen({ t, go, env }) {
  const C = window.SB.C;
  const [state, setState] = useVl('filled');
  const [kind, setKind] = useVl('context');
  const [scale, setScale] = useVl(null);
  const [tags, setTags] = useVl([]);
  const [done, setDone] = useVl(false);
  const reset = () => { setScale(null); setTags([]); };
  const canSave = kind === 'energy' ? scale != null : tags.length > 0;
  const save = () => {
    if (state === 'error') { env && env.showToast && env.showToast({ msg: '저장하지 못했어요. 다시 시도해 주세요.' }); return; }
    setDone(true); reset();
  };

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="체크인을 준비하는 중이에요…" />;
    return (
      <React.Fragment>
        {/* 히어로 */}
        <div style={{ position: 'relative', padding: '18px 16px', background: C('surface-container-low'), boxShadow: 'var(--ds-edge)', marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SbHead size={48} expression="neutral" track />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface') }}>지금의 단서 하나</div>
              <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--ds-core)', marginTop: 3 }}>알림 없이, 내가 열었을 때만 · 15초</div>
            </div>
          </div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginTop: 10, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            판단이 아니라 지금 순간의 작은 신호만 남겨요.
          </div>
        </div>

        {done ?
        <MdCard variant="filled" style={{ padding: 18, marginTop: 14, textAlign: 'center' }}>
          <Icon name="check_circle" size={32} style={{ color: 'var(--ok)' }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), margin: '10px 0 4px' }}>저장했어요. 작은 단서 하나가 더해졌어요.</div>
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" onClick={() => setDone(false)}>하나 더</MdButton></span>
            <span style={{ flex: 1 }}><MdButton variant="filled" full size="s" onClick={() => go('home')}>홈으로</MdButton></span>
          </div>
        </MdCard> :
        <MdCard variant="filled" style={{ padding: 16, marginTop: 14 }}>
          <div className="md-label-medium" style={{ color: C('on-surface-variant'), marginBottom: 8 }}>오늘은 어떤 단서로 남길까요?</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
            {[['context', '맥락'], ['energy', '에너지']].map(([k, l]) => {
              const on = kind === k;
              return (
                <button key={k} onClick={() => { setKind(k); setDone(false); reset(); }} className="md-interactive"
                style={{ position: 'relative', border: 'none', cursor: 'pointer', minHeight: 44,
                  background: on ? C('primary') : C('surface-container-highest'), color: on ? C('on-primary') : C('on-surface-variant'),
                  boxShadow: 'var(--ds-edge)', fontSize: 12, fontWeight: 700 }}>
                  <span className="md-state" />{l}
                </button>);
            })}
          </div>
          {kind === 'energy' ? (
            <React.Fragment>
              <div className="md-body-medium" style={{ color: C('on-surface'), marginBottom: 10, wordBreak: 'keep-all' }}>지금 남아 있는 힘은 어느 정도인가요?</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
                {[1, 2, 3, 4, 5].map((v) => {
                  const on = scale === v;
                  return (
                    <button key={v} onClick={() => setScale(v)} className="md-interactive"
                    style={{ position: 'relative', border: 'none', cursor: 'pointer', minHeight: 52, display: 'grid', placeItems: 'center',
                      background: on ? C('primary') : C('surface-container-highest'), color: on ? C('on-primary') : C('on-surface-variant'),
                      boxShadow: 'var(--ds-edge)' }}>
                      <span className="md-state" />
                      <span style={{ width: 6 + v * 3, height: 6 + v * 3, background: 'currentColor' }} />
                    </button>);
                })}
              </div>
            </React.Fragment>) : (
            <React.Fragment>
              <div className="md-body-medium" style={{ color: C('on-surface'), marginBottom: 10, wordBreak: 'keep-all' }}>지금 어디에 누구와 있나요?</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ESM_TAGS.map((tg) => (
                  <MdChip key={tg} variant="filter" selected={tags.includes(tg)}
                  onClick={() => setTags((s) => s.includes(tg) ? s.filter((x) => x !== tg) : [...s, tg])}>{tg}</MdChip>))}
              </div>
            </React.Fragment>)}
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 16, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            이 기록은 판단이나 꼬리표가 아니에요. 나중에 흐름을 더 선명하게 보는 작은 단서예요.
          </div>
          <div style={{ marginTop: 14 }}><MdButton variant="filled" full disabled={!canSave} onClick={save}>체크인 저장</MdButton></div>
        </MdCard>}
      </React.Fragment>);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', paddingTop: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 48, padding: '0 8px 0 6px', flex: '0 0 auto' }}>
        <MdIconButton name="arrow_back" title="뒤로" onClick={() => go('home')} />
        <span className="md-title-large" style={{ color: C('on-surface') }}>가벼운 체크인</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState} />
    </div>);
}

Object.assign(window, { IpipNeoScreen, EsmScreen, QuantPager, FacetBar, IPIP_DOMAINS, IPIP_ITEMS, IPIP_LIKERT });
