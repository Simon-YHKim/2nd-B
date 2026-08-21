/* ============================================================
   2nd-Brain · D그룹 — 담기 · 반입 (브리프 06-capture.md)
   - CaptureFullScreen : /capture-full 전체 담기(8모드 풀 컴포저)
   - FormatsScreen     : /formats 내보내기 형식 + ?view=manager 클리퍼 형식 관리자
   - ImportHubScreen   : /import-hub 개인 데이터 허브 (민감도 3계층 · 동의→파싱→리뷰→반영)
   카피는 브리프 원문 고정.
   ============================================================ */
const { useState: useCp } = React;

/* ===================== /capture-full 전체 담기 ===================== */
const CF_MODES = [
{ id: 'journal', label: '일기', icon: 'edit_note', dest: 'records' },
{ id: 'memo', label: '메모', icon: 'notes', dest: 'sources' },
{ id: 'linkclip', label: '링크', icon: 'link', dest: 'sources' },
{ id: 'ocr', label: '사진', icon: 'photo_camera', dest: 'sources' },
{ id: 'file', label: '문서', icon: 'description', dest: 'sources' },
{ id: 'voice', label: '음성', icon: 'mic', dest: 'records' },
{ id: 'todo', label: '할 일', icon: 'checklist', dest: 'records' },
{ id: 'fourw', label: '4W1H', icon: 'grid_on', dest: 'records' }];
const CF_RECENT = [
{ t: '회고 — 이번 스프린트에서 배운 것', s: '글 · 2시간 전' },
{ t: '아티클: 딥워크의 조건', s: '링크 · 어제' },
{ t: '화이트보드 사진', s: '사진 · 2일 전' }];

function CaptureFullScreen({ t, go, env, param, onBack }) {
  const C = window.SB.C;
  const [state, setState] = useCp('filled');
  const [mode, setMode] = useCp((param && param.mode) || 'journal');
  const [adv, setAdv] = useCp(!!(param && param.mode));
  const [track, setTrack] = useCp('daily');
  const [body, setBody] = useCp('');
  const [tags, setTags] = useCp((param && param.tag) ? '#' + param.tag : '');
  const [ocrApproved, setOcrApproved] = useCp(false);
  const [ocrText, setOcrText] = useCp('');
  const [extracting, setExtracting] = useCp(false);
  const [rec, setRec] = useCp(false);
  const [saved, setSaved] = useCp(null);
  const [busy, setBusy] = useCp(false);
  const [tpl, setTpl] = useCp(null);

  const cur = CF_MODES.find((m) => m.id === mode) || CF_MODES[0];
  const shown = adv ? CF_MODES : CF_MODES.slice(0, 1);
  const hint =
    mode === 'ocr' && !ocrApproved ? '추출 텍스트를 승인해야 담을 수 있어요.' :
    mode === 'file' && !body.trim() ? '파일을 선택하거나 본문을 적어야 담을 수 있어요.' :
    !body.trim() ? '내용을 적으면 담기가 켜져요.' : null;
  const canSave = !hint && !busy;

  const submit = () => {
    if (state === 'error') { env && env.showToast && env.showToast({ msg: '담지 못했어요. 잠시 뒤 다시 시도해 주세요.' }); return; }
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setSaved({ dest: cur.dest, mode });
      setBody(''); setOcrText(''); setOcrApproved(false);
    }, 800);
  };
  const extract = () => {
    setExtracting(true);
    setTimeout(() => {
      setExtracting(false);
      setOcrText('회의 결론\n· 다음 스프린트는 집중 블록을 오전에 배치\n· 회고는 금요일 오후로 고정');
      setBody('회의 결론\n· 다음 스프린트는 집중 블록을 오전에 배치\n· 회고는 금요일 오후로 고정');
    }, 1200);
  };

  const Body = ({ ph, rows }) => (
    <textarea value={body} onChange={(e) => { setBody(e.target.value); if (mode === 'ocr') setOcrApproved(false); }} placeholder={ph}
    style={{ width: '100%', minHeight: rows || 120, resize: 'vertical', border: 'none', outline: 'none', boxSizing: 'border-box',
      background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', color: C('on-surface'),
      font: '400 12px/1.6 var(--font-ui)', padding: 12 }} />);

  const pane = () => {
    if (mode === 'journal') return (
      <React.Fragment>
        <div className="px-frame" style={{ padding: 12, background: C('surface-container-low'), marginBottom: 12 }}>
          <div className="md-label-medium" style={{ color: 'var(--ds-nebula)', marginBottom: 4 }}>오늘의 성찰 질문</div>
          <div style={{ fontSize: 12, color: C('on-surface'), wordBreak: 'keep-all' }}>오늘 나를 가장 살아있게 한 순간은 언제였나요?</div>
          <div style={{ marginTop: 10 }}><MdButton variant="outlined" size="s" onClick={() => setBody((b) => b || '이 질문을 주제로 ')}>이 질문을 주제로</MdButton></div>
        </div>
        <Body ph="오늘 떠오른 생각이나 느낌을 적어주세요. 한 문장이어도 충분해요." rows={140} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '10px 12px', background: C('surface-container'), boxShadow: 'var(--ds-edge)' }}>
          <Icon name="forum" size={18} style={{ color: C('on-surface-variant') }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 12, color: C('on-surface') }}>이 기록을 세컨비에게 물어보기</span>
            <span className="md-body-small" style={{ color: C('on-surface-variant') }}>기본은 꺼짐. 세컨비의 되짚기를 받고 싶을 때만 켜세요.</span>
          </span>
          <MdSwitch checked={false} onChange={() => go('plans')} />
        </div>
        <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 8 }}>기록한 날: 12일 (오늘은 선택이에요)</div>
      </React.Fragment>);
    if (mode === 'linkclip') return (
      <React.Fragment>
        <div className="md-label-medium" style={{ color: C('on-surface-variant'), marginBottom: 6 }}>링크 또는 저장한 글</div>
        <Body ph="https://... 또는 글 내용을 붙여 넣으세요" rows={110} />
        {body.startsWith('http') && <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--ds-core)', marginTop: 6 }}>링크 자동 인식: 아티클</div>}
        <div style={{ marginTop: 10 }}><MdButton variant="outlined" full size="s" icon="layers" onClick={() => setBody((b) => b + (b ? '\n' : '') + 'https://example.com/deep-work')}>복사해 둔 내용 붙여넣기</MdButton></div>
      </React.Fragment>);
    if (mode === 'ocr') return (
      <React.Fragment>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {['카메라', '갤러리', '파일 선택'].map((l) => <span key={l} style={{ flex: 1 }}><MdButton variant="outlined" full size="s" onClick={extract}>{l}</MdButton></span>)}
        </div>
        {extracting ?
        <div style={{ padding: '20px 0' }}><ProgressLinear value={62} /><div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 8, textAlign: 'center' }}>글자를 읽는 중이에요…</div></div> :
        <React.Fragment>
          <Body ph="사진에서 읽은 글자가 여기 들어와요" rows={120} />
          {ocrText && <div style={{ marginTop: 10 }}>
            <MdButton variant={ocrApproved ? 'filled' : 'tonal'} full size="s" icon={ocrApproved ? 'check' : 'task_alt'}
            onClick={() => setOcrApproved(true)}>{ocrApproved ? '승인됨' : '추출 텍스트 승인하기'}</MdButton>
          </div>}
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 10, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            사진은 글자를 읽기 위해서만 글자 읽기 서비스로 전송돼요.
          </div>
        </React.Fragment>}
      </React.Fragment>);
    if (mode === 'voice') return (
      <React.Fragment>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '10px 0 14px' }}>
          <button onClick={() => setRec((r) => !r)} className="md-interactive"
          style={{ position: 'relative', width: 76, height: 76, border: 'none', cursor: 'pointer',
            background: rec ? C('error') : C('primary'), color: rec ? C('on-error') : C('on-primary'), boxShadow: 'var(--ds-edge)' }}>
            <span className="md-state" />
            <Icon name={rec ? 'pause' : 'mic'} fill size={32} style={{ position: 'absolute', inset: 0, margin: 'auto' }} />
          </button>
          <div className="md-body-medium" style={{ color: C('on-surface-variant') }}>{rec ? '녹음 중…' : '녹음'}</div>
          {rec && <MdButton variant="tonal" size="s" icon="edit_note" onClick={() => { setRec(false); setBody('오늘 회의에서 내가 먼저 말을 꺼냈다. 생각보다 손이 떨리지 않았고, 끝나고 나니 좀 후련했다.'); }}>멈추고 받아쓰기</MdButton>}
        </div>
        <Body ph="말한 내용이 여기 적혀요" rows={100} />
      </React.Fragment>);
    if (mode === 'file') return (
      <React.Fragment>
        <button onClick={() => setBody('문서.md — 12개 노트가 감지됐어요')} className="md-interactive"
        style={{ position: 'relative', width: '100%', minHeight: 104, border: 'none', cursor: 'pointer', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16,
          background: C('surface-container'), boxShadow: 'var(--ds-edge)', color: C('on-surface') }}>
          <span className="md-state" />
          <Icon name="description" size={28} style={{ color: 'var(--ds-core)' }} />
          <span style={{ fontSize: 12, fontWeight: 700 }}>파일 선택</span>
          <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>.md · .txt · .pdf</span>
        </button>
        <div style={{ marginTop: 10 }}><Body ph="본문을 직접 적어도 돼요" rows={90} /></div>
      </React.Fragment>);
    if (mode === 'todo') return (
      <React.Fragment>
        <Body ph="할 일을 줄바꿈으로 적어요" rows={110} />
        <div style={{ marginTop: 10 }}><MdButton variant="outlined" full size="s" icon="add" onClick={() => setBody((b) => b + (b ? '\n' : '') + '- ')}>할 일 추가</MdButton></div>
      </React.Fragment>);
    if (mode === 'fourw') return (
      <React.Fragment>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[['무엇을', '떠오른 생각·사건의 핵심을 적어요'], ['언제', '오늘 아침'], ['어디서', '회사'], ['누가', '나 · 팀원과'], ['어떻게 · 왜', '어떤 마음이었는지']].map(([l, ph], i) => (
            <AuField key={l} label={l} value={i === 0 ? body : ''} onChange={i === 0 ? setBody : () => {}} ph={ph} />))}
        </div>
      </React.Fragment>);
    return (
      <React.Fragment>
        <Body ph="메모를 적어요" rows={130} />
        <div className="px-frame" style={{ padding: 12, marginTop: 12, background: C('surface-container-low') }}>
          <div style={{ fontSize: 12, color: C('on-surface'), wordBreak: 'keep-all', textWrap: 'pretty' }}>이 자료에 딱 맞는 저장 형식이 없네요. 세컨비가 하나 제안할까요?</div>
          <div style={{ marginTop: 10 }}>
            <MdButton variant="tonal" full size="s" icon="auto_awesome" onClick={() => setTpl({ name: '회의 메모', fields: ['참석자', '결론', '다음 액션'] })}>형식 제안받기</MdButton>
          </div>
          {tpl &&
          <div style={{ marginTop: 12, padding: 12, background: C('surface-container-high'), boxShadow: 'var(--ds-edge)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C('on-surface'), marginBottom: 6 }}>{tpl.name}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {tpl.fields.map((f) => <span key={f} style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, padding: '3px 8px', background: C('surface-container-highest'), color: C('on-surface-variant'), boxShadow: 'var(--ds-edge)' }}>{f}</span>)}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" onClick={() => setTpl(null)}>내 형식으로 저장</MdButton></span>
              <span style={{ flex: 1 }}><MdButton variant="filled" full size="s" onClick={() => setTpl(null)}>저장하고 공유</MdButton></span>
            </div>
          </div>}
        </div>
      </React.Fragment>);
  };

  const content = () => {
    if (state === 'loading') return <StateView state="loading" body="담기를 준비하는 중이에요…" />;
    if (state === 'error') return <StateView state="error" title="담지 못했어요" body="잠시 뒤 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" />;
    if (saved) return (
      <MdCard variant="filled" style={{ padding: 18, marginTop: 12, textAlign: 'center' }}>
        <Icon name="check_circle" size={32} style={{ color: 'var(--ok)' }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), margin: '10px 0 14px' }}>Lumen이 새 별가루를 저장했어요</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <MdButton variant="filled" full size="s" icon={saved.dest === 'sources' ? 'lan' : 'inventory_2'}
          onClick={() => go(saved.dest === 'sources' ? 'wiki' : 'records')}>{saved.dest === 'sources' ? '그래프 보기' : '기록 보관소 보기'}</MdButton>
          <MdButton variant="outlined" full size="s" onClick={() => setSaved(null)}>또 담기</MdButton>
        </div>
      </MdCard>);
    return (
      <React.Fragment>
        {/* 트랙 토글 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 12px' }}>
          <span className="md-label-medium" style={{ color: C('on-surface-variant'), flex: '0 0 auto' }}>어디로 갈까요?</span>
          <span style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {[['daily', '일상 Wiki'], ['pro', 'Pro Wiki']].map(([k, l]) => (
              <button key={k} onClick={() => setTrack(k)} className="md-interactive"
              style={{ position: 'relative', border: 'none', cursor: 'pointer', padding: '6px 10px', minHeight: 32,
                background: track === k ? C('primary') : C('surface-container-highest'),
                color: track === k ? C('on-primary') : C('on-surface-variant'), boxShadow: 'var(--ds-edge)', fontSize: 10, fontFamily: 'var(--font-micro)' }}>
                <span className="md-state" />{l}
              </button>))}
          </span>
        </div>
        {/* 모드 탭 */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${adv ? 4 : 1},1fr)`, gap: 6, marginBottom: 6 }}>
          {shown.map((m) => {
            const on = mode === m.id;
            return (
              <button key={m.id} onClick={() => { setMode(m.id); setSaved(null); }} className="md-interactive"
              style={{ position: 'relative', border: 'none', cursor: 'pointer', minHeight: 52, padding: '6px 2px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                background: on ? C('primary') : C('surface-container-highest'), color: on ? C('on-primary') : C('on-surface-variant'),
                boxShadow: 'var(--ds-edge)' }}>
                <span className="md-state" />
                <Icon name={m.icon} size={16} />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-micro)' }}>{m.label}</span>
              </button>);
          })}
        </div>
        <div style={{ textAlign: 'right', marginBottom: 12 }}>
          <button onClick={() => { setAdv((v) => !v); if (adv) setMode('journal'); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, fontFamily: 'var(--md-ref-typeface-mono)', color: 'var(--ds-core)', padding: 0 }}>
            {adv ? '줄이기' : '더보기'}
          </button>
        </div>
        {pane()}
        {/* 해시태그 */}
        <div style={{ marginTop: 14 }}>
          <AuField label="해시태그" value={tags} onChange={setTags} ph="#딥워크 #회고"
          hint="비워 두면 저장할 때 세컨비가 자동으로 달아줘요." />
        </div>
        {/* 최근 별가루 */}
        <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '18px 0 6px' }}>최근 별가루</div>
        <MdCard variant="filled" style={{ padding: 4 }}>
          {CF_RECENT.map((r, i) => (
            <div key={r.t} className="md-interactive" onClick={() => go('record', window.SB.RECORDS[i] || window.SB.RECORDS[0])}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer',
              borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
              <span className="md-state" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, color: C('on-surface'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.t}</span>
                <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 1 }}>{r.s}</span>
              </span>
              <Icon name="chevron_right" size={16} style={{ color: C('on-surface-variant') }} />
            </div>))}
        </MdCard>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          {[['내 형식 관리하기', 'formats'], ['외부 가져오기', 'import'], ['사용 안내서', 'manual']].map(([l, r]) => (
            <button key={r} onClick={() => go(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: 10, fontFamily: 'var(--md-ref-typeface-mono)', color: 'var(--ds-core)', textDecoration: 'underline', textUnderlineOffset: 3 }}>{l}</button>))}
        </div>
      </React.Fragment>);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', paddingTop: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 48, padding: '0 8px 0 6px', flex: '0 0 auto' }}>
        <MdIconButton name="arrow_back" title="뒤로" onClick={onBack} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--ds-nebula)' }}>01. 별가루 담기</span>
          <span style={{ display: 'block', fontSize: 12, color: C('on-surface-variant') }}>기록과 자료를 저장해요</span>
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px 12px' }}>{content()}</div>
      {!saved && state === 'filled' &&
      <div style={{ padding: '10px 16px 12px', flex: '0 0 auto', borderTop: `1px solid ${C('outline-variant')}`, background: C('surface') }}>
        {hint && <div className="md-body-small" style={{ color: C('on-surface-variant'), marginBottom: 8, wordBreak: 'keep-all' }}>{hint}</div>}
        <MdButton variant="filled" full disabled={!canSave} onClick={submit}>{busy ? '담는 중…' : '담기'}</MdButton>
      </div>}
      <StateRow value={state} onChange={setState} />
    </div>);
}

/* ===================== /formats 내보내기 형식 · 클리퍼 관리자 ===================== */
const EXPORT_FORMATS = [
{ id: 'iden', name: '.iden 포터블 정체성 파일', sub: '전체 모델 + 기록', incl: ['성격 · 애착 모델', '회상 · 내러티브', '기록 원문 포함'] },
{ id: 'obsidian', name: 'Obsidian 친화', sub: '마크다운 + 프론트매터', incl: ['성격 · 애착 모델', '회상 · 내러티브'] },
{ id: 'api', name: '개발자 · API', sub: 'JSON', incl: ['성격 · 애착 모델'] }];
const CLIPPER_TEMPLATES = [
{ id: 'c1', name: '아티클 요약', sub: '링크 · 자동 연결: 도메인', shared: true, own: true },
{ id: 'c2', name: '회의 메모', sub: '메모 · 기본 태그 #회의', shared: false, own: true },
{ id: 'c3', name: '논문 카드', sub: '문서 · 커뮤니티', shared: true, own: false },
{ id: 'c4', name: '레시피 스크랩', sub: '링크 · 커뮤니티', shared: true, own: false }];

function FormatsScreen({ t, go, param }) {
  const C = window.SB.C;
  const [state, setState] = useCp('filled');
  const manager = !!(param && param.view === 'manager');
  const [view, setView] = useCp(manager ? 'manager' : 'export');
  const [fmt, setFmt] = useCp('iden');
  const [out, setOut] = useCp(null);
  const [busy, setBusy] = useCp(false);
  const [tpls, setTpls] = useCp(CLIPPER_TEMPLATES);
  const [detail, setDetail] = useCp(null);

  const run = () => { setBusy(true); setTimeout(() => { setBusy(false); setOut(EXPORT_FORMATS.find((f) => f.id === fmt)); }, 900); };

  const exportView = () => (
    <React.Fragment>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), padding: '8px 0 12px', wordBreak: 'keep-all' }}>나를 어디로든 가져가요</div>
      <MdCard variant="filled" style={{ padding: 4 }}>
        {EXPORT_FORMATS.map((f, i) => {
          const on = fmt === f.id;
          return (
            <div key={f.id} className="md-interactive" onClick={() => { setFmt(f.id); setOut(null); }}
            style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 12px', cursor: 'pointer',
              borderTop: i ? `1px solid ${C('outline-variant')}` : 'none', background: on ? 'var(--c02)' : 'transparent' }}>
              <span className="md-state" />
              <span style={{ width: 16, height: 16, flex: '0 0 auto', marginTop: 2, boxShadow: `0 0 0 2px ${on ? 'var(--ds-core)' : C('outline')}`,
                background: on ? 'var(--ds-core)' : 'transparent' }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C('on-surface'), wordBreak: 'keep-all' }}>{f.name}</span>
                <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 2 }}>{f.sub}</span>
                {on &&
                <span style={{ display: 'block', marginTop: 8 }}>
                  <span className="md-label-small" style={{ display: 'block', color: C('on-surface-variant'), marginBottom: 4 }}>포함 범위</span>
                  {f.incl.map((x) => (
                    <span key={x} style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                      <Icon name="check" size={13} style={{ color: 'var(--ok)' }} />
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-micro)', color: C('on-surface') }}>{x}</span>
                      <span style={{ marginLeft: 'auto', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--ok)' }}>포함됨</span>
                    </span>))}
                </span>}
              </span>
            </div>);
        })}
      </MdCard>
      <div style={{ marginTop: 14 }}><MdButton variant="filled" full icon="ios_share" disabled={busy} onClick={run}>{busy ? '내보내는 중…' : '내보내기'}</MdButton></div>
      {out &&
      <MdCard variant="filled" style={{ padding: 14, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Icon name="description" size={18} style={{ color: 'var(--ds-core)' }} />
          <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C('on-surface') }}>{out.name}</span>
          <MdIconButton name="close" title="닫기" onClick={() => setOut(null)} />
        </div>
        <pre style={{ margin: 0, padding: 10, background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', overflowX: 'auto',
          font: '400 10px/1.6 var(--md-ref-typeface-mono)', color: C('on-surface-variant') }}>{`{
  "northstar": "나를 깊이 이해해 더 나답게 산다.",
  "domains": { "career": 3, "relation": 2, "health": 2 },
  "records": 128
}`}</pre>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" icon="layers">복사</MdButton></span>
          <span style={{ flex: 1 }}><MdButton variant="tonal" full size="s" icon="download">내려받기</MdButton></span>
        </div>
      </MdCard>}
    </React.Fragment>);

  const managerView = () => {
    const own = tpls.filter((x) => x.own), comm = tpls.filter((x) => !x.own);
    const Row = (x, i) => (
      <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
        <span onClick={() => setDetail(x)} className="md-interactive" style={{ position: 'relative', flex: 1, minWidth: 0, cursor: 'pointer', padding: '2px 0' }}>
          <span className="md-state" />
          <span style={{ display: 'block', fontSize: 12, color: C('on-surface') }}>{x.name}</span>
          <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 1 }}>{x.sub}</span>
          <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--ds-core)', marginTop: 3 }}>눌러서 분류 기준 보기 ›</span>
        </span>
        {x.own && <MdSwitch checked={x.shared} onChange={(v) => setTpls((s) => s.map((y) => y.id === x.id ? { ...y, shared: v } : y))} />}
      </div>);
    return (
      <React.Fragment>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), padding: '8px 0 12px', wordBreak: 'keep-all' }}>내가 만든 형식과 커뮤니티가 공유한 형식</div>
        {own.length === 0 && comm.length === 0 ?
        <StateView state="empty" title="아직 형식이 없어요" body="담으면서 형식을 만들어 볼까요?" cta={() => go('capture')} ctaLabel="담으러 가기" /> :
        <React.Fragment>
          <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '0 0 6px' }}>내 형식 ({own.length})</div>
          <MdCard variant="filled" style={{ padding: 4 }}>{own.map(Row)}</MdCard>
          <div className="md-label-medium" style={{ color: C('on-surface-variant'), margin: '16px 0 6px' }}>커뮤니티 형식 ({comm.length})</div>
          <MdCard variant="filled" style={{ padding: 4 }}>{comm.map(Row)}</MdCard>
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 12, wordBreak: 'keep-all', textWrap: 'pretty' }}>
            신고하면 내 목록에서 바로 숨겨져요. 3명이 신고하면 모두에게 숨겨져요.
          </div>
        </React.Fragment>}
      </React.Fragment>);
  };

  const body = () => {
    if (state === 'loading') return <StateView state="loading" body="형식을 불러오는 중이에요…" />;
    if (state === 'error') return <StateView state="error" title="형식을 불러오지 못했어요" body="잠시 후 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" />;
    if (state === 'empty') return <StateView state="empty" title="아직 형식이 없어요" body="담으면서 형식을 만들어 볼까요?" cta={() => go('capture')} ctaLabel="담으러 가기" />;
    return view === 'manager' ? managerView() : exportView();
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ display: 'flex', gap: 4, padding: '8px 16px 0', flex: '0 0 auto' }}>
        {[['export', '내보내기 형식'], ['manager', '내 클리퍼 형식']].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} className="md-interactive"
          style={{ position: 'relative', flex: 1, border: 'none', cursor: 'pointer', minHeight: 36,
            background: view === k ? C('primary') : C('surface-container-highest'),
            color: view === k ? C('on-primary') : C('on-surface-variant'), boxShadow: 'var(--ds-edge)', fontSize: 10, fontFamily: 'var(--font-micro)' }}>
            <span className="md-state" />{l}
          </button>))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 20px' }}>{body()}</div>
      <StateRow value={state} onChange={setState} />
      {detail &&
      <div onClick={() => setDetail(null)} className="ds-scrim" style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', padding: 22 }}>
        <div onClick={(e) => e.stopPropagation()} className="ds-window" style={{ width: '100%', maxWidth: 300, padding: 18, margin: 'var(--u)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), marginBottom: 10 }}>{detail.name}</div>
          {[['자료 종류', '링크 · 문서'], ['분류 위치', '일상 Wiki'], ['기본 해시태그', '#요약'], ['자동 연결 조건', '같은 도메인 태그']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <span style={{ flex: '0 0 auto', width: 76, fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>{k}</span>
              <span style={{ flex: 1, fontSize: 12, color: C('on-surface') }}>{v}</span>
            </div>))}
          <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
            <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" onClick={() => setDetail(null)}>닫기</MdButton></span>
            {detail.own && <span style={{ flex: 1 }}><MdButton variant="filled" full size="s" icon="edit" onClick={() => setDetail(null)}>편집</MdButton></span>}
          </div>
        </div>
      </div>}
    </div>);
}

/* ===================== /import-hub 개인 데이터 허브 ===================== */
const IH_SOURCES = [
{ id: 'kakao', name: '카카오톡 대화', tier: 0, icon: 'forum', minor: true },
{ id: 'timeline', name: '구글 타임라인', tier: 0, icon: 'travel_explore', minor: true },
{ id: 'sms', name: '문자(SMS)', tier: 0, icon: 'smartphone', minor: true },
{ id: 'geo', name: '실시간 위치', tier: 0, icon: 'travel_explore', minor: true },
{ id: 'health', name: '건강', tier: 1, icon: 'cardiology' },
{ id: 'email', name: '이메일', tier: 1, icon: 'mail' },
{ id: 'notion', name: 'Notion · Obsidian', tier: 2, icon: 'description' },
{ id: 'gcal', name: '구글 캘린더', tier: 2, icon: 'calendar_today' },
{ id: 'gtask', name: '구글 할 일', tier: 2, icon: 'checklist' },
{ id: 'ics', name: '캘린더(.ics)', tier: 2, icon: 'event' }];
const IH_TIERS = ['최민감 · 명시 동의 필요', '민감', '보통'];
const IH_PROPOSALS = [
{ id: 'q1', kind: '약속', text: '금요일 14:00 팀 회고', sensitive: false },
{ id: 'q2', kind: '장소', text: '성수동 카페 (주 2회)', sensitive: true },
{ id: 'q3', kind: '노트', text: '딥워크 블록 실험 기록', sensitive: false },
{ id: 'q4', kind: '거래', text: '도서 구입 3건', sensitive: false },
{ id: 'q5', kind: '시청', text: '다큐 2편 시청', sensitive: true }];

function ImportHubScreen({ t, go, env, onBack }) {
  const C = window.SB.C;
  const [state, setState] = useCp('filled');
  const [step, setStep] = useCp('hub');   // hub | consent | input | review | history
  const [src, setSrc] = useCp(null);
  const [busy, setBusy] = useCp(false);
  const [picked, setPicked] = useCp(IH_PROPOSALS.filter((p) => !p.sensitive).map((p) => p.id));
  const [hist, setHist] = useCp([{ id: 'h1', name: 'Notion · Obsidian', n: 24, when: '3일 전' }]);
  const [err, setErr] = useCp(null);

  const openSrc = (s) => { setSrc(s); setStep('consent'); setErr(null); };
  const analyze = () => { setBusy(true); setTimeout(() => { setBusy(false); setStep('review'); }, 1100); };
  const apply = () => {
    if (state === 'error') { setErr('가져오지 못했어요. 아무것도 기록되지 않았어요. 다시 시도해 주세요.'); return; }
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setHist((h) => [{ id: 'h' + Date.now(), name: src.name, n: picked.length, when: '방금' }, ...h]);
      setStep('hub');
    }, 900);
  };

  const hub = () => (
    <React.Fragment>
      <div style={{ padding: '10px 0 4px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface') }}>무엇을 들여올까요?</div>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginTop: 4, wordBreak: 'keep-all' }}>네가 승인한 것만 기록에 남아요.</div>
      </div>
      {[0, 1, 2].map((tier) => (
        <div key={tier} style={{ marginTop: 14 }}>
          <div className="md-label-medium" style={{ color: tier === 0 ? C('error') : C('on-surface-variant'), marginBottom: 6 }}>{IH_TIERS[tier]}</div>
          <MdCard variant="filled" style={{ padding: 4 }}>
            {IH_SOURCES.filter((s) => s.tier === tier).map((s, i) => (
              <div key={s.id} className={s.minor ? '' : 'md-interactive'} onClick={() => !s.minor && openSrc(s)}
              style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                cursor: s.minor ? 'default' : 'pointer', opacity: s.minor ? 0.55 : 1,
                borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
                {!s.minor && <span className="md-state" />}
                <span style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', flex: '0 0 auto',
                  background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', color: 'var(--c11)' }}>
                  <Icon name={s.icon} size={16} />
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: C('on-surface') }}>{s.name}</span>
                <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, flex: '0 0 auto',
                  color: s.minor ? C('error') : tier === 0 ? 'var(--warn)' : C('on-surface-variant') }}>
                  {s.minor ? '잠김' : tier === 0 ? '동의 필요' : '미연결'}
                </span>
              </div>))}
          </MdCard>
        </div>))}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" icon="history" onClick={() => setStep('history')}>가져온 데이터</MdButton></span>
      </div>
    </React.Fragment>);

  const consent = () => (
    <React.Fragment>
      <div style={{ padding: '10px 0 4px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface') }}>{src.name}</div>
      </div>
      <MdCard variant="filled" style={{ padding: 14, marginTop: 10 }}>
        <div style={{ fontSize: 12, color: C('on-surface'), lineHeight: 1.55, wordBreak: 'keep-all', textWrap: 'pretty' }}>
          약속·할 일·관계 신호만 뽑아요. 메시지 본문은 저장하지 않아요.
        </div>
        <div style={{ fontSize: 12, color: C('on-surface-variant'), lineHeight: 1.55, marginTop: 8, wordBreak: 'keep-all', textWrap: 'pretty' }}>
          이 기기에서 분석하고 원문은 버려요. 파생 신호만 암호화해 보관해요.
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          {['보관 90일', '언제든 삭제', '이 기기에서만 처리'].map((x) => (
            <span key={x} style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, padding: '3px 8px',
              background: C('surface-container-highest'), color: 'var(--ok)', boxShadow: 'var(--ds-edge)' }}>{x}</span>))}
        </div>
      </MdCard>
      <div className="md-body-small" style={{ color: C('on-surface-variant'), margin: '14px 0', wordBreak: 'keep-all', textWrap: 'pretty' }}>
        수집 항목·보관 위치·기간·삭제권에 동의해요. 미성년은 통신·위치 임포트가 잠겨 있어요.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <MdButton variant="filled" full icon="attach_file" onClick={() => setStep('input')}>동의하고 파일 선택</MdButton>
        <MdButton variant="outlined" full onClick={() => setStep('input')}>대신 파일로 가져오기</MdButton>
      </div>
    </React.Fragment>);

  const input = () => (
    <React.Fragment>
      <div style={{ padding: '10px 0 10px', fontSize: 15, fontWeight: 700, color: C('on-surface') }}>{src.name}</div>
      <textarea placeholder="여기에 붙여넣기" defaultValue=""
      style={{ width: '100%', minHeight: 140, resize: 'vertical', border: 'none', outline: 'none', boxSizing: 'border-box',
        background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', color: C('on-surface'),
        font: '400 12px/1.6 var(--font-ui)', padding: 12 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        <MdButton variant="filled" full disabled={busy} onClick={analyze}>{busy ? '연결 중…' : '분석'}</MdButton>
        <MdButton variant="outlined" full icon="link" onClick={analyze}>구글 연결</MdButton>
      </div>
    </React.Fragment>);

  const review = () => (
    <React.Fragment>
      <div style={{ padding: '10px 0 4px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface') }}>반영할 항목 고르기</div>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginTop: 4, wordBreak: 'keep-all' }}>네가 승인한 것만 기록에 남아요.</div>
      </div>
      <MdCard variant="filled" style={{ padding: 4, marginTop: 10 }}>
        {IH_PROPOSALS.map((p, i) => {
          const on = picked.includes(p.id);
          return (
            <div key={p.id} className="md-interactive" onClick={() => setPicked((s) => s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id])}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer',
              borderTop: i ? `1px solid ${C('outline-variant')}` : 'none', background: on ? 'var(--c02)' : 'transparent' }}>
              <span className="md-state" />
              <span style={{ pointerEvents: 'none', display: 'inline-flex' }}><MdCheckbox checked={on} onChange={() => {}} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, color: C('on-surface'), wordBreak: 'keep-all' }}>{p.text}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>{p.kind}</span>
                  {p.sensitive && <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'var(--warn)' }}>민감 · 기본 제외</span>}
                </span>
              </span>
            </div>);
        })}
      </MdCard>
      {err && <div className="md-body-small" style={{ color: C('error'), marginTop: 10, wordBreak: 'keep-all' }}>{err}</div>}
      <div style={{ marginTop: 14 }}>
        <MdButton variant="filled" full disabled={busy || picked.length === 0} onClick={apply}>{busy ? '반영 중…' : `고른 ${picked.length}건 기록에 반영`}</MdButton>
      </div>
    </React.Fragment>);

  const history = () => (
    <React.Fragment>
      <div style={{ padding: '10px 0 10px', fontSize: 15, fontWeight: 700, color: C('on-surface') }}>가져온 데이터</div>
      {hist.length === 0 ?
      <StateView state="empty" title="아직 가져온 게 없어요" body="소스를 고르면 여기 이력이 쌓여요." cta={() => setStep('hub')} ctaLabel="소스 고르기" /> :
      <MdCard variant="filled" style={{ padding: 4 }}>
        {hist.map((h, i) => (
          <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12, color: C('on-surface') }}>{h.name}</span>
              <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 1 }}>별가루 {h.n}개 · {h.when}</span>
            </span>
            <MdButton variant="outlined" size="s" onClick={() => setHist((s) => s.filter((x) => x.id !== h.id))}>삭제</MdButton>
          </div>))}
      </MdCard>}
    </React.Fragment>);

  const content = () => {
    if (state === 'loading') return <StateView state="loading" body="불러오는 중이에요…" />;
    if (state === 'error' && step === 'hub') return <StateView state="error" title="소스를 불러오지 못했어요" body="잠시 후 다시 시도해 주세요." cta={() => setState('filled')} ctaLabel="다시 시도" />;
    if (state === 'empty' && step === 'hub') return <StateView state="empty" title="아직 가져온 게 없어요" body="파일이나 계정에서 나를 들여올 수 있어요." />;
    return step === 'hub' ? hub() : step === 'consent' ? consent() : step === 'input' ? input() : step === 'review' ? review() : history();
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', paddingTop: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 48, padding: '0 8px 0 6px', flex: '0 0 auto' }}>
        <MdIconButton name="arrow_back" title="뒤로" onClick={() => step === 'hub' ? onBack() : setStep('hub')} />
        <span className="md-title-large" style={{ color: C('on-surface') }}>가져오기</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px 20px' }}>{content()}</div>
      <StateRow value={state} onChange={setState} />
    </div>);
}

Object.assign(window, { CaptureFullScreen, FormatsScreen, ImportHubScreen });
