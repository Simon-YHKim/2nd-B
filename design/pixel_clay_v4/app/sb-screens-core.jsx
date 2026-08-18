/* ============================================================
   2nd-Brain · Capture & Chat screens
   - Capture: 데이터 담기 충실 — 형식별 입력(글=4W1H, 링크=5박스, 사진/음성/할일)
   - Chat: 3 모드(2nd-B / Meta-B / Twi-B) 토글 + 모드별 색상 전환
   Export: window.CaptureScreen, window.ChatScreen, ScreenPad, SectionLabel
   ============================================================ */

const { useState } = React;

function ScreenPad({ children, style }) {
  return <div style={{ padding: '4px 16px 20px', ...style }}>{children}</div>;
}

function SectionLabel({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 0 10px' }}>
      <span className="md-title-small" style={{ color: window.SB.C('on-surface-variant'), wordBreak: 'keep-all' }}>{children}</span>
      {action}
    </div>
  );
}

/* small labeled field */
function Field({ icon, label, hint, value, onChange, multiline, C }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {icon && <Icon name={icon} size={15} style={{ color: C('on-surface-variant') }} />}
        <span className="md-label-medium" style={{ color: C('on-surface-variant') }}>{label}</span>
      </div>
      {multiline ? (
        <window.AutoTextarea value={value} onChange={onChange} placeholder={hint} C={C} minRows={3} />
      ) : (
        <input value={value} onChange={(ev) => onChange(ev.target.value)} placeholder={hint}
          style={{ width: '100%', border: `1px solid ${C('outline-variant')}`, borderRadius: 0, padding: '11px 13px',
            background: C('surface-container-highest'), color: C('on-surface'), fontFamily: 'var(--md-ref-typeface-plain)', fontSize: 15, outline: 'none' }} />
      )}
    </div>
  );
}

/* Image attach — thumbnail strip with add/remove, used inside the 글 capture form. */
function ImageAttach({ C, images, setImages }) {
  const inputRef = React.useRef(null);
  const add = (files) => {
    const list = Array.from(files || []).slice(0, 6 - images.length);
    list.forEach((f) => {
      const r = new FileReader();
      r.onload = () => setImages((xs) => (xs.length >= 6 ? xs : [...xs, r.result]));
      r.readAsDataURL(f);
    });
  };
  const removeAt = (i) => setImages((xs) => xs.filter((_, idx) => idx !== i));
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Icon name="image" size={15} style={{ color: C('on-surface-variant') }} />
        <span className="md-label-medium" style={{ color: C('on-surface-variant') }}>이미지 첨부</span>
        <span className="md-body-small" style={{ color: C('on-surface-variant'), opacity: .7 }}>· {images.length}/6</span>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {images.map((src, i) => (
          <div key={i} style={{ position: 'relative', width: 76, height: 76, borderRadius: 0, overflow: 'hidden', border: `1px solid ${C('outline-variant')}` }}>
            <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <button onClick={() => removeAt(i)} aria-label="삭제"
              style={{ position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: 0, border: 'none', cursor: 'pointer',
                display: 'grid', placeItems: 'center', background: 'var(--ds-scrim-mix)', color: 'var(--c08)' }}>
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
        {images.length < 6 && (
          <button onClick={() => inputRef.current && inputRef.current.click()} className="md-interactive"
            style={{ position: 'relative', width: 76, height: 76, borderRadius: 0, cursor: 'pointer',
              border: `1.5px dashed ${C('outline')}`, background: C('surface-container-highest'),
              display: 'grid', placeItems: 'center', color: C('on-surface-variant') }}>
            <span className="md-state" /><Icon name="add" size={24} />
          </button>
        )}
      </div>
    </div>
  );
}

/* Photo capture — two intents: keep the moment (store image) OR pull the text
   out of the image with Gemini OCR and store only the lightweight text. */
function PhotoCapture({ C, caption, setCaption, onState }) {
  const [intent, setIntent] = useState('moment');   // moment · ocr
  const [ocr, setOcr] = useState('idle');           // idle · running · done
  const [popup, setPopup] = useState(false);
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState('');
  const SAMPLE = '몰입(flow)은 행위와 의식이 하나로 합쳐지는 상태다. 시간 감각이 사라지고, 자아에 대한 의식이 옅어진다. 이 상태에 자주 드는 사람일수록 삶의 만족도가 높았다.\n— 미하이 칙센트미하이, 《몰입》 p.84';
  const runOcr = () => { setOcr('running'); setCopied(false); setPopup(true); setTimeout(() => { setText(SAMPLE); setOcr('done'); }, 1900); };
  const copyText = () => { try { navigator.clipboard && navigator.clipboard.writeText(text); } catch (e) {} setCopied(true); setTimeout(() => setCopied(false), 1600); };
  useEffect(() => { onState && onState({ intent, ocr, run: runOcr }); }, [intent, ocr]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* intent segmented control */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[['moment', 'photo_camera', '순간 기록'], ['ocr', 'document_scanner', '글 추출 (OCR)']].map(([id, ic, lb]) => {
          const on = intent === id;
          return (
            <button key={id} onClick={() => setIntent(id)} className="md-interactive"
              style={{ position: 'relative', flex: 1, padding: '13px 8px', borderRadius: 0, cursor: 'pointer',
                border: `1.5px solid ${on ? C('primary') : C('outline-variant')}`,
                background: on ? C('secondary-container') : C('surface-container'), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span className="md-state" />
              <Icon name={ic} size={22} style={{ color: on ? C('on-secondary-container') : C('on-surface-variant') }} />
              <span className="md-title-small" style={{ color: on ? C('on-secondary-container') : C('on-surface') }}>{lb}</span>
            </button>
          );
        })}
      </div>
      <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', marginTop: -4, display: 'none' }} />

      {/* photo dropzone (user fills) */}
      <image-slot id={intent === 'ocr' ? 'sb-capture-ocr' : 'sb-capture-photo'} shape="rounded" radius="16"
        placeholder={intent === 'ocr' ? '글자가 있는 사진을 올려요' : '사진을 올리거나 촬영'}
        style={{ display: 'block', width: '100%', height: 188, border: `1.5px dashed ${C('outline')}`, borderRadius: 0, background: C('surface-container') }}></image-slot>

      {intent === 'moment' ? (
        <Field C={C} icon="edit_note" label="한 줄 메모" hint="이 사진은 어떤 순간인가요?" value={caption} onChange={setCaption} multiline />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ocr === 'running' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '18px 0' }}>
              <window.PXSpinner />
              <span className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>이미지 속 글자를 읽는 중…</span>
            </div>
          )}
          {ocr === 'done' && (
            <React.Fragment>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="auto_awesome" size={15} style={{ color: C('tertiary') }} />
                <span className="md-label-medium" style={{ color: C('on-surface-variant') }}>추출한 글 · 고쳐도 돼요</span>
                <div style={{ flex: 1 }} />
                <MdButton variant="text" size="s" icon="open_in_full" onClick={() => setPopup(true)}>크게 보기</MdButton>
              </div>
              <window.AutoTextarea value={text} onChange={setText} placeholder="추출된 글" C={C} minRows={4} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 0, background: C('tertiary-container'), color: C('on-tertiary-container') }}>
                <Icon name="cloud_off" size={17} style={{ flex: '0 0 auto' }} />
                <span className="md-body-small" style={{ wordBreak: 'keep-all' }}>원본 이미지는 저장하지 않고, 추출한 글만 담아요.</span>
              </div>
            </React.Fragment>
          )}
        </div>
      )}

      {/* 추출 결과 팝업 — 폰 프레임 안에 뜨고 하단에 복사·담기·다시 추출 */}
      {popup && (
        <div onClick={() => setPopup(false)} className="ds-scrim"
          style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} className="ds-window" role="dialog" aria-modal="true"
            style={{ width: '100%', maxWidth: 320, maxHeight: '78%', display: 'flex', flexDirection: 'column', padding: '16px 16px 12px', margin: 'var(--u)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flex: '0 0 auto' }}>
              <span style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', flex: '0 0 auto', background: C('primary-container'), color: C('on-primary-container'), boxShadow: 'var(--ds-edge)' }}>
                <Icon name="document_scanner" size={17} />
              </span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: C('on-surface') }}>사진에서 뽑은 글</span>
              <MdIconButton name="close" title="닫기" onClick={() => setPopup(false)} />
            </div>
            {ocr === 'running' ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '30px 0' }}>
                <window.PXSpinner />
                <span className="md-body-medium" style={{ color: C('on-surface-variant') }}>글자를 읽는 중…</span>
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginBottom: 12 }}>
                <window.AutoTextarea value={text} onChange={setText} placeholder="추출된 글" C={C} minRows={6} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
              <MdButton variant="outlined" size="s" icon={copied ? 'check' : 'layers'} style={{ flex: 1 }} onClick={copyText}>{copied ? '복사함' : '복사하기'}</MdButton>
              <MdButton variant="filled" size="s" icon="add_circle" style={{ flex: 1 }} onClick={() => setPopup(false)}>담기</MdButton>
              <MdButton variant="tonal" size="s" icon="replay" style={{ flex: 1 }} onClick={runOcr}>다시 추출</MdButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function CaptureScreen({ t, go, env }) {
  const C = window.SB.C;
  const [phase, setPhase] = useState('input');   // input → classify
  const [mode, setMode] = useState('text');
  const [w4, setW4] = useState({ what: '', when: '', where: '', who: '', how: '', why: '' });
  const [text, setText] = useState('');
  const [links, setLinks] = useState(['', '', '', '', '']);
  const [linkSlots, setLinkSlots] = useState(3);
  const [todos, setTodos] = useState(['', '']);
  const [caption, setCaption] = useState('');
  const [images, setImages] = useState([]);   // 글 양식에 첨부한 이미지 (dataURL 목록)
  const [photoState, setPhotoState] = useState({ intent: 'moment', ocr: 'idle', run: null });
  const [recording, setRecording] = useState(false);
  const [live, setLive] = useState('');            // 녹음 중 실시간 받아적기
  const liveRef = React.useRef(null);
  const [audio, setAudio] = useState(null);
  const [trans, setTrans] = useState('idle');
  const [transText, setTransText] = useState('');
  const audioRef = React.useRef(null);
  // 글 양식 토글: 설정값을 초기값으로, 화면에서 즉시 전환 가능
  const [structured, setStructured] = useState(!(env && env.features && env.features.captureFree));   // true=W4H1, false=자유
  const offline = t.dataState === '오프라인';
  const setW = (k, v) => setW4((s) => ({ ...s, [k]: v }));

  // categories for the post-담기 classification step (the 7 life-area stars)
  const CATEGORIES = [
    { id: 'career',   label: '커리어',   icon: 'badge',            accent: 'primary'  },
    { id: 'finance',  label: '재정',     icon: 'sell',             accent: 'primary'  },
    { id: 'relation', label: '관계',     icon: 'group',            accent: 'tertiary' },
    { id: 'growth',   label: '성장',     icon: 'self_improvement', accent: 'primary'  },
    { id: 'health',   label: '건강',     icon: 'bedtime',          accent: 'tertiary' },
    { id: 'leisure',  label: '휴식',     icon: 'lightbulb',        accent: 'tertiary' },
  ];

  const pasteInto = async (i) => {
    let txt = '';
    try { txt = await navigator.clipboard.readText(); } catch (e) {}
    if (!txt) txt = 'https://';
    setLinks((ls) => ls.map((v, idx) => (idx === i ? txt : v)));
  };
  const clearAt = (i) => setLinks((ls) => ls.map((v, idx) => (idx === i ? '' : v)));
  const setTodo = (i, v) => setTodos((ts) => ts.map((x, idx) => (idx === i ? v : x)));

  const submit = () => {
    if (offline) { go('records'); return; }   // queued offline — no false success, no analysis claim
    setPhase('classify');                     // typed → choose a category (or delegate to AI)
  };

  // finalize after the user picks a category, or delegates to the AI (cat = null).
  // The classification runs as a background job; the screen returns to a fresh 담기
  // 녹음 중 실시간 받아적기 — 말하는 속도로 한 어절씩 붙는다
  const LIVE_WORDS = ['오늘', '회의에서', '내가', '먼저', '말을', '꺼냈다.', '생각보다', '손이', '떨리지', '않았고,', '끝나고', '나니', '좀', '허탈하면서도', '기분이', '좋았다.', '다음엔', '즐거운', '마음으로', '해보고', '싶다.'];
  React.useEffect(() => {
    if (!recording) return;
    let i = live ? live.split(' ').length : 0;
    const id = setInterval(() => {
      if (i >= LIVE_WORDS.length) { clearInterval(id); return; }
      const w = LIVE_WORDS[i]; i += 1;
      setLive((s) => (s ? s + ' ' : '') + w);
      if (liveRef.current) liveRef.current.scrollTop = liveRef.current.scrollHeight;
    }, 420);
    return () => clearInterval(id);
  }, [recording]);

  // input (more natural than jumping to 위키 — the user keeps capturing).
  const finalize = (cat) => {
    if (offline) { go('records'); return; }
    if (env && env.startJob) {
      if (cat) env.startJob(`'${cat.label}' 별에 담는 중`, { doneMsg: `'${cat.label}' 별에 새 별가루을 엮었어요`, action: '위키 보기', goTo: 'records' });
      else env.startJob('세컨비가 알맞은 별을 찾는 중', { doneMsg: '세컨비가 어울리는 별로 분류했어요', action: '위키 보기', goTo: 'records' });
    }
    if (window.SBReasoning) window.SBReasoning.autoRunOnCapture(); // 자동 리즈닝 ON 이면 담는 즉시 실행 (주간 한도 소모)
    // reset the form and return to the capture input
    setW4({ what: '', when: '', where: '', who: '', how: '', why: '' });
    setText(''); setLinks(['', '', '', '', '']); setTodos(['', '']); setCaption(''); setImages([]);
    setAudio(null); setTrans('idle'); setTransText(''); setRecording(false); setLive('');
    setPhase('input');
  };

  /* ===== classify step — entered after pressing 담기 ===== */
  if (phase === 'classify') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 12px' }}>
          <button onClick={() => setPhase('input')} className="md-interactive"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent',
              color: C('primary'), cursor: 'pointer', padding: '6px 8px 6px 0', margin: '4px 0' }}>
            <span className="md-state" /><Icon name="chevron_left" size={18} /><span className="md-label-large">입력으로 돌아가기</span>
          </button>
          <div className="md-headline-small" style={{ color: C('on-surface'), margin: '4px 0 18px' }}>어떤 별에 담을까요?</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {CATEGORIES.map((c) => (
              <MdCard key={c.id} variant="outlined" onClick={() => finalize(c)} style={{ padding: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 0, display: 'grid', placeItems: 'center',
                  background: C(c.accent === 'tertiary' ? 'tertiary-container' : 'primary-container'),
                  color: C(c.accent === 'tertiary' ? 'on-tertiary-container' : 'on-primary-container') }}>
                  <Icon name={c.icon} size={22} />
                </div>
                <div className="md-title-small" style={{ color: C('on-surface'), marginTop: 10 }}>{c.label}</div>
                <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 2 }}>{c.label} 별로 엮기</div>
              </MdCard>
            ))}
          </div>
        </div>

        {/* delegate-to-AI footer */}
        <div style={{ padding: '10px 16px 14px', borderTop: `1px solid ${C('outline-variant')}`, background: C('surface') }}>
          <MdButton variant="tonal" full icon="auto_awesome" onClick={() => finalize(null)}>잘 모르겠어요 · 세컨비가 분류</MdButton>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div data-scroll style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 12px' }}>

        {offline && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '11px 14px',
            borderRadius: 0, background: C('surface-container-highest'), border: `1px solid ${C('outline-variant')}` }}>
            <Icon name="cloud_off" size={18} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
            <span className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>
              오프라인이에요. 담으면 <b style={{ color: C('on-surface') }}>큐에 저장</b>됐다가, 연결되면 자동으로 동기화돼요. (분석은 그때 시작)
            </span>
          </div>
        )}

        {/* format selector — 아이콘 위, 라벨 아래 · 5개가 한 줄에 들어가도록 */}
        <div style={{ display: 'flex', gap: 6 }}>
          {window.SB.CAPTURE_MODES.map((m) => {
            const on = mode === m.id;
            return (
              <button key={m.id} onClick={() => setMode(m.id)} aria-pressed={on} className="md-interactive"
                style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  padding: '7px 2px', border: 'none', cursor: 'pointer',
                  background: on ? C('primary') : C('surface-container-highest'),
                  color: on ? C('on-primary') : C('on-surface-variant'), boxShadow: 'var(--ds-edge)' }}>
                <span className="md-state" />
                <Icon name={m.icon} fill={on} size={16} />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-micro)', fontWeight: on ? 700 : 400, whiteSpace: 'nowrap' }}>{m.label}</span>
              </button>
            );
          })}
        </div>

        {/* ===== format-specific input ===== */}
        <div style={{ marginTop: 16 }}>
          {mode === 'text' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 자유 양식 ↔ W4H1 양식 토글 */}
              <div style={{ display: 'flex', padding: 3, borderRadius: 0, background: C('surface-container-highest'), border: `1px solid ${C('outline-variant')}` }}>
                {[{ k: false, label: '자유 양식', icon: 'edit_note' }, { k: true, label: 'W4H1 양식', icon: 'view_agenda' }].map((o) => (
                  <button key={o.label} onClick={() => setStructured(o.k)} className="md-interactive"
                    style={{ position: 'relative', flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      height: 36, borderRadius: 0, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                      background: structured === o.k ? C('primary') : 'transparent',
                      color: structured === o.k ? C('on-primary') : C('on-surface-variant'),
                      fontSize: 12, fontWeight: structured === o.k ? 700 : 500 }}>
                    <span className="md-state" /><Icon name={o.icon} size={16} />{o.label}
                  </button>
                ))}
              </div>
              {structured ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <DatePickerField C={C} icon="calendar_today" label="언제 (When)" hint="날짜를 골라요" value={w4.when} onChange={(v) => setW('when', v)} />
              <Field C={C} icon="north_east" label="어디서 (Where)" hint="회사 · 집 · 카페" value={w4.where} onChange={(v) => setW('where', v)} />
              <Field C={C} icon="person" label="누가 (Who)" hint="나 · 팀원과" value={w4.who} onChange={(v) => setW('who', v)} />
              <Field C={C} icon="edit_note" label="무엇을 (What)" hint="떠오른 생각·사건의 핵심을 적어요" value={w4.what} onChange={(v) => setW('what', v)} multiline />
              <Field C={C} icon="bolt" label="어떻게 (How)" hint="어떤 과정·방식이었는지" value={w4.how} onChange={(v) => setW('how', v)} multiline />
              <Field C={C} icon="lightbulb" label="왜 (Why)" hint="그렇게 한 이유나 마음" value={w4.why} onChange={(v) => setW('why', v)} multiline />
            </div>
          ) : (
            <Field C={C} icon="edit_note" label="자유롭게 담기" hint="형식 없이 떠오르는 대로 적어요. 세컨비가 읽고 정리해요." value={text} onChange={setText} multiline />
              )}
              {/* 이미지 첨부 (두 양식 공통) */}
              <ImageAttach C={C} images={images} setImages={setImages} />
            </div>
          )}

          {mode === 'link' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {links.slice(0, linkSlots).map((v, i) => (
                <div key={i} style={{ border: `1px solid ${C('outline-variant')}`, borderRadius: 0, padding: 10, background: C('surface-container') }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 22, height: 22, borderRadius: 0, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: C('surface-container-highest'), color: C('on-surface-variant'), fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                    <input value={v} onChange={(ev) => setLinks((ls) => ls.map((x, idx) => (idx === i ? ev.target.value : x)))} placeholder="https://"
                      style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: C('on-surface'), fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <MdButton variant="tonal" size="s" icon="add" onClick={() => pasteInto(i)}>붙여넣기</MdButton>
                    <MdButton variant="text" size="s" icon="close" onClick={() => clearAt(i)}>지우기</MdButton>
                  </div>
                </div>
              ))}
              {linkSlots < links.length && (
                <button onClick={() => setLinkSlots((n) => Math.min(links.length, n + 1))} aria-label="링크 칸 늘리기" className="md-interactive"
                  style={{ position: 'relative', height: 44, display: 'grid', placeItems: 'center', cursor: 'pointer', border: 'none',
                    background: C('surface-container-highest'), color: C('on-surface-variant'), boxShadow: 'var(--ds-edge)' }}>
                  <span className="md-state" /><Icon name="add" size={16} />
                </button>
              )}
            </div>
          )}

          {mode === 'photo' && (
            <PhotoCapture C={C} caption={caption} setCaption={setCaption} onState={setPhotoState} />
          )}

          {mode === 'voice' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '20px 0' }}>
              <button onClick={() => setRecording((r) => !r)} className="md-interactive"
                style={{ position: 'relative', width: 88, height: 88, borderRadius: 0, border: 'none', cursor: 'pointer',
                  background: recording ? C('error') : C('primary'), color: recording ? C('on-error') : C('on-primary'),
                  boxShadow: 'var(--ds-edge)' }}>
                <span className="md-state" />
                <Icon name={recording ? 'pause' : 'mic'} fill size={36} style={{ position: 'absolute', inset: 0, margin: 'auto' }} />
              </button>
              <div className="md-body-medium" style={{ color: C('on-surface-variant') }}>{recording ? '듣고 있어요… 다시 누르면 멈춰요' : '탭하고 말하면 자동으로 받아 적어요'}</div>
              {recording && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 28 }}>
                  {[10, 18, 26, 16, 22, 12, 20, 14].map((h, i) => (
                    <span key={i} style={{ width: 3, height: h, borderRadius: 0, background: C('primary'), animation: `sb-pulse 0.9s ${i * 0.1}s steps(2,end) infinite` }} />
                  ))}
                </div>
              )}

              {/* 실시간 받아적기 — 말하는 동안 어떻게 알아듣고 있는지 보여준다 */}
              {(recording || live) && (
                <div style={{ width: '100%', background: C('surface-container'), boxShadow: 'var(--ds-edge)', padding: 12, boxSizing: 'border-box', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    {recording && <span style={{ width: 8, height: 8, background: C('error'), flex: '0 0 auto', animation: 'sb-pulse 1s steps(2,end) infinite' }} />}
                    <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, letterSpacing: '.1em', color: recording ? C('error') : C('on-surface-variant') }}>
                      {recording ? '받아적는 중' : '받아적기 끝'}</span>
                    {!recording && live && (
                      <span style={{ marginLeft: 'auto' }}>
                        <MdIconButton name="close" title="지우기" onClick={() => setLive('')} />
                      </span>
                    )}
                  </div>
                  {recording ? (
                    <div ref={liveRef} style={{ minHeight: 72, maxHeight: 132, overflowY: 'auto', font: '400 12px/1.6 var(--font-ui)', color: C('on-surface'), wordBreak: 'keep-all' }}>
                      {live || <span style={{ color: C('outline') }}>말을 기다리는 중…</span>}
                      {live && <span style={{ color: 'var(--ds-core)' }}> ▮</span>}
                    </div>
                  ) : (
                    <textarea value={live} onChange={(ev) => setLive(ev.target.value)}
                      style={{ width: '100%', minHeight: 84, resize: 'vertical', border: 'none', outline: 'none',
                        background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', color: C('on-surface'),
                        font: '400 12px/1.6 var(--font-ui)', padding: 10, boxSizing: 'border-box' }} />
                  )}
                </div>
              )}

              {/* 녹음 파일 올리기 — 통화·회의 녹음도 그대로 받아적고 분석 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginTop: 4 }}>
                <span style={{ flex: 1, height: 'var(--u)', background: C('outline-variant') }} />
                <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>또는</span>
                <span style={{ flex: 1, height: 'var(--u)', background: C('outline-variant') }} />
              </div>
              <input ref={audioRef} type="file" accept="audio/*" style={{ display: 'none' }}
                onChange={(ev) => {
                  const f = ev.target.files && ev.target.files[0];
                  if (!f) return;
                  setAudio({ name: f.name, size: Math.max(1, Math.round(f.size / 1024)) });
                  setTrans('idle'); setTransText('');
                }} />
              {!audio ? (
                <button onClick={() => audioRef.current && audioRef.current.click()} className="md-interactive"
                  style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                    minHeight: 112, border: 'none', cursor: 'pointer', padding: 16, boxSizing: 'border-box',
                    background: C('surface-container'), boxShadow: 'var(--ds-edge)', color: C('on-surface') }}>
                  <span className="md-state" />
                  <Icon name="cloud_upload" size={32} style={{ color: 'var(--ds-core)' }} />
                  <span style={{ fontSize: 12, fontWeight: 700 }}>녹음 파일 올리기</span>
                  <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant') }}>m4a · mp3 · wav</span>
                </button>
              ) : (
                <div style={{ width: '100%', background: C('surface-container'), boxShadow: 'var(--ds-edge)', padding: 12, boxSizing: 'border-box' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', flex: '0 0 auto',
                      background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', color: 'var(--ds-core)' }}>
                      <Icon name="play_circle" size={18} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <span style={{ display: 'block', fontSize: 12, color: C('on-surface'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{audio.name}</span>
                      <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 2 }}>
                        {audio.size}KB{trans === 'done' ? ' · 받아적기 끝' : ''}</span>
                    </span>
                    <MdIconButton name="close" title="지우기" onClick={() => { setAudio(null); setTrans('idle'); setTransText(''); }} />
                  </div>
                  {trans === 'running' && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ marginBottom: 8, fontSize: 12, color: C('on-surface-variant') }}>녹음을 받아 적고 있어요…</div>
                      <ProgressLinear value={62} />
                    </div>
                  )}
                  {trans === 'done' && (
                    <textarea value={transText} onChange={(ev) => setTransText(ev.target.value)}
                      style={{ width: '100%', minHeight: 96, marginTop: 12, resize: 'vertical', border: 'none', outline: 'none',
                        background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', color: C('on-surface'),
                        font: '400 12px/1.6 var(--font-ui)', padding: 10, boxSizing: 'border-box' }} />
                  )}
                  {trans !== 'running' && (
                    <div style={{ marginTop: 12 }}>
                      <MdButton variant={trans === 'done' ? 'outlined' : 'filled'} full size="s" icon={trans === 'done' ? 'cached' : 'edit_note'}
                        onClick={() => {
                          setTrans('running');
                          setTimeout(() => {
                            setTrans('done');
                            setTransText('근황은 어떠냐고 물어서 — 생각보다 바쁘다고 했다. 지난주엔 야근을 세 번 했어.\n그래도 토요일에 산책하면서 생각 정리한 건 좋았어.\n다음 달엔 사람 만나는 자리를 일부러 만들어보려고 해.');
                          }, 1400);
                        }}>{trans === 'done' ? '다시 받아적기' : '받아적기'}</MdButton>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {mode === 'todo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {todos.map((v, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${C('outline-variant')}`, borderRadius: 0, padding: '10px 12px', background: C('surface-container-highest') }}>
                  <Icon name="radio_button_unchecked" size={20} style={{ color: C('outline'), flex: '0 0 auto' }} />
                  <input value={v} onChange={(ev) => setTodo(i, ev.target.value)} placeholder={`할 일 ${i + 1}`}
                    style={{ flex: 1, border: 'none', background: 'transparent', color: C('on-surface'), fontFamily: 'var(--md-ref-typeface-plain)', fontSize: 15, outline: 'none' }} />
                </div>
              ))}
              <MdButton variant="text" icon="add" style={{ alignSelf: 'flex-start' }} onClick={() => setTodos((ts) => [...ts, ''])}>할 일 추가</MdButton>
            </div>
          )}
        </div>
      </div>

      {/* sticky 담기 footer — 사진 · OCR 중이면 추출 전까지는 '글 추출하기' */}
      <div style={{ padding: '10px 16px 14px', borderTop: `1px solid ${C('outline-variant')}`, background: C('surface') }}>
        {mode === 'photo' && photoState.intent === 'ocr' && photoState.ocr !== 'done' ? (
          <MdButton variant="filled" full icon="auto_awesome" disabled={photoState.ocr === 'running'}
            onClick={() => photoState.run && photoState.run()}>{photoState.ocr === 'running' ? '읽는 중…' : '글 추출하기'}</MdButton>
        ) : (
          <MdButton variant="filled" full icon={offline ? 'cloud_off' : 'arrow_forward'} onClick={submit}>{offline ? '큐에 담기 (동기화 대기)' : '담기'}</MdButton>
        )}
      </div>
    </div>
  );
}

/* ===================== CHAT 세컨비 (3 modes) ===================== */
const CHAT_ANSWERS = {
  '2nd': { text: '최근 2주 기록을 보면 ‘쉼’ 없이 일만 늘었어요. 당신은 사람을 만나야 충전되는 편인데, 그 시간이 부쩍 줄었네요.',
    cites: ['이유 · 기록 8건'] },
  meta: { text: '데이터만 보면: 일 기록 +38%, 휴식 태그 0건, 평균 수면 5.6시간. 외향성 지표가 2주째 하락 추세예요.',
    cites: ['지표 · 4종', '추세 14일'] },
  twi: { text: '당신 기록을 다르게 이어 보면 — ‘쉼’ 별과 ‘성장’ 별이 늘 따로 놀았어요. 둘을 묶으면? 혼자 걷는 30분을 ‘배우는 산책’으로 바꿔, 듣고 싶던 강연을 흘려보는 거예요. 쉬면서 자라는 시간이 생겨요.',
    cites: ['엮은 별 · 2개', '안 해본 조합'] },
};

/* 인용 칩을 누르면 뜨는 근거 목록 — 어떤 기록·지표에서 나온 말인지 한눈에 */
const CITE_DETAIL = {
  '이유 · 기록 8건': { title: '이 말의 근거', sub: '최근 2주 기록 8건', items: [
    { icon: 'edit_note', t: '오늘도 야근. 저녁 약속 취소했다', m: '어제 · 글', s: '커리어' },
    { icon: 'edit_note', t: '회의 3개 연달아. 점심도 자리에서', m: '2일 전 · 글', s: '커리어' },
    { icon: 'mic', t: '주말에도 노트북 열게 되네 (0:38)', m: '3일 전 · 음성', s: '커리어' },
    { icon: 'edit_note', t: '동아리 모임 다음으로 미뤘다', m: '5일 전 · 글', s: '관계' },
    { icon: 'check_box', t: '“민서에게 연락하기” 3주째 밀림', m: '6일 전 · 할 일', s: '관계' },
    { icon: 'edit_note', t: '혼자 있는 시간이 늘었는데 안 쉬어진다', m: '8일 전 · 글', s: '휴식' },
    { icon: 'link', t: '번아웃 자가진단 아티클', m: '10일 전 · 링크', s: '건강' },
    { icon: 'edit_note', t: '사람 만나고 오면 확실히 기운이 난다', m: '12일 전 · 글', s: '관계' }] },
  '관계 별 ↓': { title: '관계 별이 어두워졌어요', sub: '2주 전 대비', items: [
    { icon: 'trending_down', t: '관계 기록 6건 → 1건', m: '주당 평균', s: '−83%' },
    { icon: 'schedule', t: '마지막 만남 기록', m: '11일 전', s: '평소 4일' },
    { icon: 'check_box', t: '미룬 연락 할 일', m: '3건 누적', s: '최장 3주' },
    { icon: 'star', t: '관계 별 밝기', m: 'L3 → L2', s: '한 단계' }] },
  '지표 · 4종': { title: '본 지표', sub: '이번 답에 쓰인 4종', items: [
    { icon: 'edit_note', t: '일 기록 빈도', m: '주 11건 → 15건', s: '+38%' },
    { icon: 'bedtime', t: '휴식 태그', m: '2주간 0건', s: '이전 7건' },
    { icon: 'monitor_heart', t: '평균 수면', m: '5.6시간', s: '−1.2h' },
    { icon: 'insights', t: '외향성 지표', m: '47 → 41', s: '2주 연속 ↓' }] },
  '추세 14일': { title: '14일 추세', sub: '일 기록 · 휴식 태그', items: [
    { icon: 'trending_up', t: '1–4일차', m: '일 4건 · 휴식 2건', s: '균형' },
    { icon: 'trending_up', t: '5–8일차', m: '일 6건 · 휴식 0건', s: '기울기 시작' },
    { icon: 'trending_up', t: '9–11일차', m: '일 7건 · 휴식 0건', s: '수면 5.9h' },
    { icon: 'trending_down', t: '12–14일차', m: '일 8건 · 휴식 0건', s: '수면 5.2h' }] },
  '엮은 별 · 2개': { title: '엮은 별', sub: '따로 놀던 두 별', items: [
    { icon: 'bedtime', t: '휴식 별', m: '기록 14건 · 혼자 걷기 6건', s: 'L2' },
    { icon: 'school', t: '성장 별', m: '기록 21건 · 오디오북 9건', s: 'L3' },
    { icon: 'hub', t: '겹치는 기록', m: '0건', s: '연결 없음' }] },
  '안 해본 조합': { title: '아직 안 해본 조합', sub: '기록에 흔적이 없는 것들', items: [
    { icon: 'directions_run', t: '걷기 + 듣기', m: '따로는 15건, 같이는 0건', s: '새로움' },
    { icon: 'forum', t: '산책 + 통화', m: '관계 별에도 닿음', s: '일석이조' },
    { icon: 'edit_note', t: '걷고 나서 한 줄', m: '담기 습관과 붙음', s: '가벼움' }] }
};

/* 근거 목록 시트 — 칩에서 올라오는 바텀시트 */
function CiteSheet({ label, C, onClose, onAll }) {
  const d = CITE_DETAIL[label] || { title: label, sub: '관련 항목', items: [] };
  return (
    <div onClick={onClose} className="ds-scrim" style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} className="ds-window"
      style={{ width: '100%', maxHeight: '82%', display: 'flex', flexDirection: 'column', margin: 'var(--u)', background: C('surface') }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 10px', flex: '0 0 auto' }}>
          <span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', flex: '0 0 auto',
            background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', color: 'var(--ds-core)' }}>
            <Icon name="bubble_chart" size={18} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: C('on-surface') }}>{d.title}</span>
            <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('outline'), marginTop: 2 }}>{d.sub}</span>
          </span>
          <MdIconButton name="close" title="닫기" onClick={onClose} />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 14px 4px' }}>
          {d.items.map((it, i) =>
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
            borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
            <span style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', flex: '0 0 auto',
              background: C('surface-container-high'), boxShadow: 'var(--ds-edge)', color: 'var(--c11)' }}>
              <Icon name={it.icon} size={16} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12, color: C('on-surface'), wordBreak: 'keep-all' }}>{it.t}</span>
              <span style={{ display: 'block', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: C('on-surface-variant'), marginTop: 2 }}>{it.m}</span>
            </span>
            <span style={{ flex: '0 0 auto', fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, padding: '3px 7px',
              background: C('surface-container-highest'), boxShadow: 'var(--ds-edge)', color: C('on-surface-variant') }}>{it.s}</span>
          </div>)}
        </div>
        <div style={{ padding: '10px 14px 14px', flex: '0 0 auto' }}>
          <MdButton variant="outlined" full size="s" icon="inventory_2" onClick={onAll}>위키에서 전체 보기</MdButton>
        </div>
      </div>
    </div>);
}

// ── chat: multi-conversation persistence (survives navigation + refresh) ──
const CHAT_LS = 'sb_chat_v3';
let _cseq = 0;
function newConv(mode = '2nd') {
  _cseq += 1;
  return { id: 'c' + Date.now().toString(36) + _cseq.toString(36), title: '', mode, msgs: [], ts: Date.now() };
}
function seedConvs() {
  const now = Date.now();
  return [
    { id: 'c-seed-1', title: '요즘 왜 이렇게 지칠까', mode: '2nd', ts: now,
      msgs: [
        { role: 'user', text: '나 요즘 너무 지치는데 왜 그럴까?', ts: now - 60000 },
        { role: 'sb', mode: '2nd', ts: now - 59000 },
      ] },
    { id: 'c-seed-2', title: '지표로만 보면', mode: 'meta', ts: now - 5400000,
      msgs: [
        { role: 'user', text: '데이터로만 보면 나 어떤 추세야?', ts: now - 5401000 },
        { role: 'sb', mode: 'meta', ts: now - 5400500 },
      ] },
  ];
}
function loadChat() {
  try { const r = JSON.parse(localStorage.getItem(CHAT_LS)); if (r && Array.isArray(r.convs)) return r; } catch (e) {}
  return null;
}
function saveChat(convs, activeId) {
  try { localStorage.setItem(CHAT_LS, JSON.stringify({ convs, activeId })); } catch (e) {}
}
// display helpers for the conversation list
function convText(msg) {
  if (!msg) return '';
  if (msg.text) return msg.text;
  if (msg.role === 'sb') { const a = CHAT_ANSWERS[msg.mode] || CHAT_ANSWERS['2nd']; return a ? a.text : ''; }
  return '';
}
function convTitle(c) {
  if (c.title) return c.title;
  const f = c.msgs.find((x) => x.role === 'user');
  return (f && f.text) ? f.text : '새 대화';
}
function convPreview(c) { return convText(c.msgs[c.msgs.length - 1]); }
function relTime(ts) {
  if (!ts) return '';
  const d = Date.now() - ts;
  if (d < 60000) return '방금';
  if (d < 3600000) return Math.floor(d / 60000) + '분 전';
  if (d < 86400000) return Math.floor(d / 3600000) + '시간 전';
  if (d < 604800000) return Math.floor(d / 86400000) + '일 전';
  const dt = new Date(ts); return (dt.getMonth() + 1) + '월 ' + dt.getDate() + '일';
}

/* 말풍선 — 5줄을 넘으면 접고 '더보기'로 전문을 띄운다 */
function ChatBubble({ text, style, onMore, className }) {
  const ref = React.useRef(null);
  const [over, setOver] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setOver(el.scrollHeight - el.clientHeight > 2);
  }, [text]);
  return (
    <React.Fragment>
      <div ref={ref} className={className}
        style={{ display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden', ...style }}>
        {text}
      </div>
      {over && (
        <button onClick={() => onMore(text)} className="md-interactive"
          style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 44,
            border: 'none', background: 'transparent', cursor: 'pointer', padding: '10px 0 4px',
            fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: 'currentColor' }}>
          <span className="md-state" />더보기<Icon name="expand_more" size={13} />
        </button>
      )}
    </React.Fragment>
  );
}

// ── conversation drawer (list · new · delete) ──
function ChatDrawer({ open, convs, activeId, MODES, C, onSelect, onNew, onDelete, onRename, onClose }) {
  const [confirmId, setConfirmId] = React.useState(null);
  const [editId, setEditId] = React.useState(null);
  const [editText, setEditText] = React.useState('');
  React.useEffect(() => { if (!open) { setConfirmId(null); setEditId(null); } }, [open]);
  const startEdit = (c) => { setConfirmId(null); setEditId(c.id); setEditText(convTitle(c)); };
  const commitEdit = () => { if (editId) onRename(editId, editText.trim()); setEditId(null); };
  const list = [...convs].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return (
    <React.Fragment>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'var(--ds-scrim-mix)',
        opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity .22s' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '84%', maxWidth: 300, zIndex: 31,
        background: C('surface-container-low'), borderRight: `1px solid ${C('outline-variant')}`,
        boxShadow: 'none', transform: open ? 'translateX(0)' : 'translateX(-105%)',
        transition: 'transform .26s cubic-bezier(.2,.8,.2,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 8px 10px 16px', flex: '0 0 auto' }}>
          <span className="md-title-medium" style={{ flex: 1, color: C('on-surface'), fontWeight: 700 }}>대화</span>
          <button onClick={onClose} aria-label="닫기" className="md-interactive"
            style={{ position: 'relative', width: 36, height: 36, borderRadius: 0, border: 'none', cursor: 'pointer',
              background: 'transparent', color: C('on-surface-variant'), display: 'grid', placeItems: 'center' }}>
            <span className="md-state" /><Icon name="close" size={20} />
          </button>
        </div>
        <div style={{ padding: '0 12px 10px', flex: '0 0 auto' }}>
          <button onClick={onNew} className="md-interactive"
            style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', gap: 8, height: 44,
              padding: '0 14px', borderRadius: 0, cursor: 'pointer', border: `1px solid ${C('outline-variant')}`,
              background: C('surface-container-high'), color: C('on-surface') }}>
            <span className="md-state" /><Icon name="edit_square" size={18} />
            <span style={{ fontSize: 15, fontWeight: 700 }}>새 대화</span>
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '2px 8px 12px' }}>
          {list.length === 0 ? (
            <div className="md-body-small" style={{ color: C('on-surface-variant'), textAlign: 'center', padding: '24px 12px' }}>아직 대화가 없어요</div>
          ) : list.map((c) => {
            const md = MODES.find((x) => x.id === c.mode) || MODES[0];
            const on = c.id === activeId;
            const confirming = confirmId === c.id;
            return (
              <div key={c.id} onClick={() => { if (!confirming) onSelect(c.id); }} className="md-interactive"
                style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 6px 9px 10px',
                  borderRadius: 0, cursor: 'pointer', marginBottom: 2,
                  background: on ? md.soft : 'transparent', border: `1px solid ${on ? md.accent : 'transparent'}` }}>
                <span className="md-state" />
                <span style={{ width: 8, height: 8, borderRadius: 0, flex: '0 0 auto', background: md.accent, boxShadow: 'none' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    {editId === c.id ? (
                      <input autoFocus value={editText} onClick={(ev) => ev.stopPropagation()}
                        onChange={(ev) => setEditText(ev.target.value)}
                        onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); commitEdit(); } if (ev.key === 'Escape') setEditId(null); }}
                        onBlur={commitEdit}
                        style={{ flex: 1, minWidth: 0, height: 26, padding: '0 6px', border: 'none', outline: 'none',
                          background: 'var(--panel-2)', boxShadow: 'var(--ds-edge)', color: 'var(--c07)',
                          fontFamily: 'var(--md-ref-typeface-plain)', fontSize: 15 }} />
                    ) : (
                      <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: on ? 700 : 600, color: on ? md.onSoft : C('on-surface'),
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{convTitle(c)}</span>
                    )}
                    <span style={{ flex: '0 0 auto', fontSize: 10, color: C('on-surface-variant'), opacity: .8 }}>{relTime(c.ts)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C('on-surface-variant'), opacity: .85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {convPreview(c) || '메시지 없음'}
                  </div>
                </div>
                {confirming ? (
                  <div style={{ display: 'flex', gap: 4, flex: '0 0 auto' }} onClick={(ev) => ev.stopPropagation()}>
                    <button onClick={() => setConfirmId(null)} className="md-interactive" style={{ position: 'relative', height: 28, padding: '0 8px', borderRadius: 0, border: `1px solid ${C('outline-variant')}`, background: 'transparent', color: C('on-surface-variant'), fontSize: 12, fontWeight: 700, cursor: 'pointer' }}><span className="md-state" />취소</button>
                    <button onClick={() => { onDelete(c.id); setConfirmId(null); }} className="md-interactive" style={{ position: 'relative', height: 28, padding: '0 8px', borderRadius: 0, border: 'none', background: C('error'), color: C('on-error'), fontSize: 12, fontWeight: 700, cursor: 'pointer' }}><span className="md-state" />삭제</button>
                  </div>
                ) : editId === c.id ? (
                  <button onClick={(ev) => { ev.stopPropagation(); commitEdit(); }} aria-label="이름 저장" className="md-interactive"
                    style={{ position: 'relative', width: 30, height: 30, flex: '0 0 auto', border: 'none',
                      background: 'transparent', color: md.accent, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                    <span className="md-state" /><Icon name="check" size={17} />
                  </button>
                ) : (
                  <div style={{ display: 'flex', flex: '0 0 auto' }} onClick={(ev) => ev.stopPropagation()}>
                    <button onClick={() => startEdit(c)} aria-label="이름 수정" className="md-interactive"
                      style={{ position: 'relative', width: 30, height: 30, border: 'none',
                        background: 'transparent', color: C('on-surface-variant'), display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                      <span className="md-state" /><Icon name="edit" size={16} />
                    </button>
                    <button onClick={() => setConfirmId(c.id)} aria-label="삭제" className="md-interactive"
                      style={{ position: 'relative', width: 30, height: 30, border: 'none',
                        background: 'transparent', color: C('on-surface-variant'), display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                      <span className="md-state" /><Icon name="delete" size={17} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </React.Fragment>
  );
}

// build SB's reply for a given mode + the user's question.
// uses window.claude.complete when available (real test), else the mode's canned answer.
async function sbReply(modeId, question, history) {
  const base = CHAT_ANSWERS[modeId] || CHAT_ANSWERS['2nd'];
  const persona = {
    '2nd': '너는 사용자를 잘 아는 \u201c세컨비\u201d. 사용자의 기록(별)을 근거로 따뜻하게, 그러나 솔직하게 답한다.',
    meta: '너는 객관적인 \u201c메타비\u201d. 감정을 빼고 데이터·지표·추세로만 간결하게 답한다.',
    twi: '너는 창의적인 \u201c트위비\u201d. 사용자의 기록(별)을 근거로, 사용자가 미처 생각 못 한 엉뚱하고 신선한 가능성·조합·아이디어를 제안한다. 비판이 아니라 영감을 준다.',
  }[modeId];
  try {
    if (window.claude && window.claude.complete) {
      const ctx = history.filter((x) => x.text).slice(-6)
        .map((x) => `${x.role === 'user' ? '사용자' : 'SB'}: ${x.text}`).join('\n');
      const prompt = `${persona}\n한국어로 2~3문장, 존댓말, 군더더기 없이.\n\n이전 대화:\n${ctx}\n\n사용자: ${question}\nSB:`;
      const out = await window.claude.complete(prompt);
      if (out && out.trim()) return { text: out.trim(), cites: base.cites };
    }
  } catch (e) {}
  return { text: base.text, cites: base.cites };
}

function ChatScreen({ t, go, env, param, onBack }) {
  const C = window.SB.C;
  const MODES = window.SB.CHAT_MODES;
  const e = env || {};
  const ds = t.dataState || '채움';
  const offline = ds === '오프라인';
  const loading = ds === '로딩';
  const error = ds === '오류';

  // multi-conversation: a list of conversations, one active. The persona (mode)
  // is stored per-conversation and can change per reply; each keeps its own thread.
  const boot = React.useRef(null);
  if (!boot.current) {
    const _seed = (param && param.seed) || window.__sbPendingSeed || null;
    if (_seed) {
      // drill-down 진입(인생의 장 → 메타비): 새 대화를 만들고 메타비가 먼저 말을 건다.
      // 'chat'은 루트라 go() 가 param을 초기화함 → 전역 시드를 마운트 시 소비한다.
      try { window.__sbPendingSeed = null; } catch (e) {}
      const _now = Date.now();
      const _sc = { id: 'c' + _now.toString(36) + 'dd', title: _seed.title || '', mode: _seed.mode || 'meta',
        msgs: _seed.intro ? [{ role: 'sb', mode: _seed.mode || 'meta', text: _seed.intro, ts: _now }] : [], ts: _now };
      const _saved = loadChat();
      const _rest = (_saved && _saved.convs && _saved.convs.length) ? _saved.convs : seedConvs();
      boot.current = { convs: [_sc, ..._rest], activeId: _sc.id };
    } else if (ds === '빈') { const nc = newConv('2nd'); boot.current = { convs: [nc], activeId: nc.id }; }
    else {
      const saved = loadChat();
      if (saved && saved.convs && saved.convs.length) {
        const okActive = saved.convs.some((c) => c.id === saved.activeId);
        boot.current = { convs: saved.convs, activeId: okActive ? saved.activeId : saved.convs[0].id };
      } else { const seeded = seedConvs(); boot.current = { convs: seeded, activeId: seeded[0].id }; }
    }
  }
  const [convs, setConvs] = useState(boot.current.convs);
  const [activeId, setActiveId] = useState(boot.current.activeId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cite, setCite] = useState(null);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const scrollRef = React.useRef(null);
  const [full, setFull] = useState(null);   // 전문 보기 팝업

  // mic dictation — simulate a growing transcript while listening
  React.useEffect(() => {
    if (!listening) return;
    const phrases = ['오늘 ', '오늘 회의에서 ', '오늘 회의에서 느낀 점을 ', '오늘 회의에서 느낀 점을 담아줘'];
    let i = 0;
    const id = setInterval(() => {
      i = Math.min(i + 1, phrases.length);
      setDraft(phrases[i - 1] || '');
      if (i >= phrases.length) clearInterval(id);
    }, 700);
    return () => clearInterval(id);
  }, [listening]);

  const active = convs.find((c) => c.id === activeId) || convs[0] || null;
  const modeId = active ? active.mode : '2nd';
  const m = MODES.find((x) => x.id === modeId) || MODES[0];
  const msgs = active ? active.msgs : [];
  const setModeId = (id) => setConvs((prev) => prev.map((c) => (c.id === activeId ? { ...c, mode: id } : c)));

  // persist whenever the session changes; keep latest message in view
  React.useEffect(() => { saveChat(convs, activeId); }, [convs, activeId]);
  const stickBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  React.useEffect(() => { stickBottom(); }, [convs, activeId, typing, stickBottom]);
  /* 입력창이 세로로 자라면 대화 영역이 줄어든다 — 바닥에 붙여 최신 글이 가려지지 않게 */
  React.useEffect(() => {
    const box = document.querySelector('[data-chat-box]');
    if (!box || !window.ResizeObserver) return;
    const ro = new ResizeObserver(() => stickBottom());
    ro.observe(box);
    return () => ro.disconnect();
  }, [stickBottom]);
  /* 가상 키보드 — visualViewport 가 줄면 그만큼 하단 여백을 만든다 */
  const [kb, setKb] = useState(0);
  React.useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onVV = () => {
      const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKb(gap > 80 ? gap : 0);
      stickBottom();
    };
    vv.addEventListener('resize', onVV); vv.addEventListener('scroll', onVV);
    return () => { vv.removeEventListener('resize', onVV); vv.removeEventListener('scroll', onVV); };
  }, [stickBottom]);

  /* 전송·초기화 뒤 입력창 높이를 한 줄로 되돌린다 */
  const resetBox = () => {
    const el = document.querySelector('[data-chat-box]');
    if (el) el.style.height = 'auto';
  };
  // start a new conversation (reuse an existing blank one instead of piling up)
  const startConv = () => {
    setDrawerOpen(false); setDraft(''); resetBox();
    if (active && active.msgs.length === 0) return;
    const blank = convs.find((c) => c.msgs.length === 0);
    if (blank) { setActiveId(blank.id); return; }
    const nc = newConv(modeId);
    setConvs((prev) => [nc, ...prev]); setActiveId(nc.id);
  };

  const renameConv = (id, title) => setConvs((prev) => prev.map((c) => (c.id === id ? { ...c, title: title || '' } : c)));
  // delete a conversation; always keep at least one (a fresh blank)
  const removeConv = (id) => {
    const rest = convs.filter((c) => c.id !== id);
    if (rest.length === 0) { const nc = newConv(modeId); setConvs([nc]); setActiveId(nc.id); }
    else { setConvs(rest); if (id === activeId) setActiveId(rest[0].id); }
  };

  const selectConv = (id) => { setActiveId(id); setDrawerOpen(false); };

  const send = async (raw) => {
    const text = (raw != null ? raw : draft).trim();
    if (!text || typing || loading || error || !active) return;
    const replyMode = modeId;
    const id = activeId;
    const now = Date.now();
    setDraft(''); resetBox();
    setConvs((prev) => prev.map((c) => (c.id === id
      ? { ...c, ts: now, title: c.title || text.slice(0, 40), msgs: [...c.msgs, { role: 'user', text, ts: now }] }
      : c)));
    setTyping(true);
    const hist = [...active.msgs.filter((x) => x.text), { role: 'user', text, ts: now }];
    const built = await sbReply(replyMode, text, hist);
    setTyping(false);
    setConvs((prev) => prev.map((c) => (c.id === id
      ? { ...c, ts: Date.now(), msgs: [...c.msgs, { role: 'sb', mode: replyMode, ...built, ts: Date.now() }] }
      : c)));
  };

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  // 담기 — archive the active conversation for analysis, then drop it
  const archive = () => {
    if (!active || !active.msgs.some((x) => x.role === 'user' || x.text)) { e.showToast && e.showToast('담을 대화가 아직 없어요'); return; }
    if (e.startJob) e.startJob('이 대화를 분석해 별로 엮는 중', { doneMsg: '대화를 분석해 위키에 담았어요', action: '위키 보기', goTo: 'records' });
    removeConv(active.id);
    setDraft(''); resetBox();
  };

  // render one SB message (mode-colored, with cites + suggestions)
  const meProf = window.SBProfile ? window.SBProfile.get() : null;
  const meName = (meProf && meProf.name) || '나';
  const meAvatar = meProf && meProf.avatar;
  const renderSb = (msg, i) => {
    const mm = MODES.find((x) => x.id === msg.mode) || m;
    const a = (msg.text ? msg : CHAT_ANSWERS[msg.mode]) || CHAT_ANSWERS['2nd'];
    return (
      <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '88%' }}>
        {/* 보내는 이 — 아바타 + 이름 + 인용 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
          <span style={{ width: 40, height: 40, flex: '0 0 auto', display: 'grid', placeItems: 'center',
            background: mm.soft, boxShadow: 'var(--ds-edge)' }}>
            <window.SbHead size={32} expression={mm.id === 'twi' ? 'positive' : 'neutral'} track={false} accent={mm.accent} />
          </span>
          <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, letterSpacing: '.06em', color: mm.accent }}>{mm.name}</span>
          {a.cites && a.cites.map((c, ci) => (
            <span key={c} onClick={() => setCite(c)} className="md-interactive"
              style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 8px',
                marginLeft: ci === 0 ? 'auto' : 0,
                background: mm.soft, color: mm.onSoft, fontSize: 10, fontFamily: 'var(--font-micro)', fontWeight: 700,
                boxShadow: 'var(--ds-edge)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <span className="md-state" />
              <Icon name="bubble_chart" size={12} />{c}
            </span>
          ))}
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 0, borderLeft: `3px solid ${mm.accent}`,
          background: C('surface-container-high'), color: C('on-surface') }}>
          <ChatBubble className="md-body-medium" text={a.text} onMore={setFull}
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} />
        </div>
      </div>
    );
  };

  const showEmpty = msgs.length === 0 && !loading && !error;
  const canSend = !!draft.trim() && !typing;

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {cite && <CiteSheet label={cite} C={C} onClose={() => setCite(null)} onAll={() => { setCite(null); go('records'); }} />}
      {full && (
        <div onClick={() => setFull(null)} className="ds-scrim" role="dialog" aria-modal="true"
          style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', padding: 18 }}>
          <div onClick={(ev) => ev.stopPropagation()} className="ds-window"
            style={{ width: '100%', maxHeight: '82%', display: 'flex', flexDirection: 'column', margin: 'var(--u)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 6px 6px 14px', flex: '0 0 auto' }}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C('on-surface') }}>전체 보기</span>
              <MdIconButton name="close" title="닫기" onClick={() => setFull(null)} />
            </div>
            <div className="md-body-medium" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px 18px',
              color: C('on-surface'), whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.7 }}>{full}</div>
          </div>
        </div>
      )}
      <ChatDrawer open={drawerOpen} convs={convs} activeId={activeId} MODES={MODES} C={C}
        onSelect={selectConv} onNew={startConv} onDelete={removeConv} onRename={renameConv} onClose={() => setDrawerOpen(false)} />

      {/* header: back · menu · persona · conversation title · 담기 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 10px 8px 4px', background: m.soft, borderBottom: `1px solid ${m.soft}` }}>
        {onBack &&
        <button onClick={onBack} aria-label="뒤로" className="md-interactive"
          style={{ position: 'relative', width: 38, height: 38, flex: '0 0 auto', borderRadius: 0, border: 'none', cursor: 'pointer',
            background: 'transparent', color: m.onSoft, display: 'grid', placeItems: 'center' }}>
          <span className="md-state" /><Icon name="arrow_back" size={22} />
        </button>}
        <button onClick={() => setDrawerOpen(true)} aria-label="대화 목록" className="md-interactive"
          style={{ position: 'relative', width: 38, height: 38, flex: '0 0 auto', borderRadius: 0, border: 'none', cursor: 'pointer',
            background: 'transparent', color: m.onSoft, display: 'grid', placeItems: 'center' }}>
          <span className="md-state" /><Icon name="menu" size={22} />
        </button>
        <span style={{ width: 8, height: 8, borderRadius: 0, background: m.accent, boxShadow: 'none', flex: '0 0 auto' }} />
        <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, fontWeight: 700, color: m.onSoft, whiteSpace: 'nowrap', flex: '0 0 auto' }}>{m.tag}</span>
        <span className="md-title-small" style={{ color: C('on-surface'), fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active ? convTitle(active) : '새 대화'}</span>
        <button onClick={archive} aria-label="담기" title="담기" className="md-interactive"
          style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, height: 30, padding: '0 11px', flex: '0 0 auto',
            borderRadius: 0, border: `1.5px solid ${m.accent}`, background: 'transparent', color: m.onSoft, cursor: 'pointer', width: 30, justifyContent: 'center', padding: 0 }}>
          <span className="md-state" /><Icon name="inventory_2" size={17} />
        </button>
      </div>

      {offline && (
        <div style={{ margin: '10px 16px 0' }}><OfflineBanner /></div>
      )}

      {/* messages */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <LoadingState label="대화를 준비하는 중" sub={`${m.name}가 당신의 별을 살펴보고 있어요`} />
        ) : error ? (
          <ErrorState title="답을 가져오지 못했어요" body="네트워크가 불안정해요. 잠시 후 다시 시도해 주세요." onRetry={() => {}} />
        ) : showEmpty ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 12, padding: '30px 24px' }}>
            <img src={m.face} alt="" style={{ width: 64, height: 64, animation: 'sb-bob 4s ease-in-out infinite' }} />
            <div className="md-title-medium" style={{ color: C('on-surface') }}>{m.name}와 새 대화</div>
            <div className="md-body-medium" style={{ color: C('on-surface-variant'), maxWidth: 230, wordBreak: 'keep-all' }}>
              {m.name}에게 무엇이든 물어보세요. 당신의 7개 별에서 이유를 찾아 답할게요.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
              {['요즘 나 어때?', '나 왜 지칠까?', '뭘 더 담으면 좋아?'].map((s) => <MdChip key={s} onClick={() => send(s)}>{s}</MdChip>)}
            </div>
          </div>
        ) : (
          <React.Fragment>
            {msgs.map((msg, i) => (
              msg.role === 'user' ? (
                <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '82%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginBottom: 5 }}>
                    <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, letterSpacing: '.06em', color: C('on-surface-variant') }}>{meName}</span>
                    <span style={{ width: 40, height: 40, flex: '0 0 auto', display: 'grid', placeItems: 'center',
                      background: 'var(--panel-2)', boxShadow: 'var(--ds-edge)', overflow: 'hidden' }}>
                      {window.SbAvatar ? <window.SbAvatar spec={meAvatar} size={40} crop /> : <Icon name="person" size={20} />}
                    </span>
                  </div>
                  <div style={{ padding: '10px 14px', borderRadius: 0, background: C('primary'), color: C('on-primary') }}>
                    <ChatBubble className="md-body-medium" text={msg.text} onMore={setFull}
                      style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} />
                  </div>
                </div>
              ) : renderSb(msg, i)
            ))}
            {typing && (
              <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                <span style={{ width: 40, height: 40, flex: '0 0 auto', display: 'grid', placeItems: 'center',
                  background: m.soft, boxShadow: 'var(--ds-edge)' }}>
                  <window.SbHead size={32} expression="neutral" track={false} accent={m.accent} />
                </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px', borderRadius: 0,
                borderLeft: `3px solid ${m.accent}`, background: C('surface-container-high') }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{ width: 7, height: 7, borderRadius: 0, background: m.accent, opacity: .8,
                    animation: `sb-pulse 0.9s ${i * 0.15}s ease-in-out infinite` }} />
                ))}
              </div>
              </div>
            )}
          </React.Fragment>
        )}
      </div>

      {/* persona toggle — switches who answers next in THIS conversation */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px 0' }}>
        {MODES.map((x) => {
          const on = x.id === modeId;
          return (
            <button key={x.id} onClick={() => setModeId(x.id)} className="md-interactive"
              style={{ position: 'relative', flex: 1, padding: '8px 4px', borderRadius: 0, cursor: 'pointer',
                border: `1.5px solid ${on ? x.accent : C('outline-variant')}`,
                background: on ? x.soft : 'transparent', transition: 'border-color .2s, color .2s' }}>
              <span className="md-state" />
              <div style={{ fontSize: 12, fontWeight: 700, color: on ? x.onSoft : C('on-surface-variant') }}>{x.name}</div>
              <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, color: on ? x.accent : C('on-surface-variant'), marginTop: 1 }}>{x.tag}</div>
            </button>
          );
        })}
      </div>

      {/* input bar — real text field + always-visible send (Enter sends too) */}
      <div style={{ padding: '8px 12px 12px', display: 'flex', alignItems: 'flex-end', gap: 8, flex: '0 0 auto',
        marginBottom: kb, transition: 'margin-bottom .12s steps(2,end)' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 8, minHeight: 48, padding: '6px 6px 6px 16px', borderRadius: 0,
          background: listening ? m.soft : C('surface-container-high'),
          border: listening ? `1.5px solid ${m.accent}` : '1.5px solid transparent', transition: 'all .2s' }}>
          {listening ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 18, flex: '0 0 auto' }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} style={{ width: 3, borderRadius: 0, background: m.accent,
                    animation: `sb-wave 0.9s ${i * 0.12}s ease-in-out infinite` }} />
                ))}
              </span>
              <span className="md-body-medium" style={{ flex: 1, minWidth: 0, color: m.onSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {draft || '듣고 있어요…'}
              </span>
            </div>
          ) : (
            <textarea data-chat-box value={draft} rows={1}
              onChange={(ev) => { setDraft(ev.target.value); const el = ev.target; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 108) + 'px'; stickBottom(); }}
              onFocus={stickBottom}
              onKeyDown={onKey}
              placeholder={offline ? '오프라인 — 연결되면 답할게요' : `${m.name}에게 물어보기…`}
              disabled={loading || error}
              style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', resize: 'none',
                overflowY: 'auto', maxHeight: 108, minHeight: 24, padding: '6px 0', display: 'block',
                color: C('on-surface'), fontFamily: 'var(--md-ref-typeface-plain)', fontSize: 15, lineHeight: 1.5 }} />
          )}
          <button onClick={() => setListening((v) => !v)} aria-label={listening ? '받아쓰기 중지' : '음성 입력'} className="md-interactive"
            style={{ position: 'relative', width: 36, height: 36, borderRadius: 0, flex: '0 0 auto', cursor: 'pointer', alignSelf: 'flex-end',
              border: 'none', display: 'grid', placeItems: 'center', transition: 'all .2s',
              background: listening ? m.accent : 'transparent', color: listening ? 'var(--ds-space-2)' : C('on-surface-variant') }}>
            <span className="md-state" />
            {listening && <span style={{ position: 'absolute', inset: -4, borderRadius: 0, border: `2px solid ${m.accent}`, opacity: .5, animation: 'sb-mic-ring 1.2s ease-out infinite' }} />}
            <Icon name={listening ? 'stop' : 'mic'} fill={listening} size={22} />
          </button>
        </div>
        <button onClick={() => { setListening(false); send(); }} disabled={!canSend} aria-label="보내기" className="md-interactive"
          style={{ position: 'relative', width: 48, height: 48, borderRadius: 0, cursor: canSend ? 'pointer' : 'default',
            border: `1.5px solid ${m.accent}`, background: canSend ? m.accent : 'transparent',
            color: canSend ? 'var(--ds-space-2)' : m.accent, display: 'grid', placeItems: 'center', flex: '0 0 auto', transition: 'all .15s' }}>
          <span className="md-state" />
          <Icon name="send" fill size={22} />
        </button>
      </div>
    </div>
  );
}

window.CaptureScreen = CaptureScreen;
window.ChatScreen = ChatScreen;
window.ScreenPad = ScreenPad;
window.SectionLabel = SectionLabel;
window.Field = Field;
