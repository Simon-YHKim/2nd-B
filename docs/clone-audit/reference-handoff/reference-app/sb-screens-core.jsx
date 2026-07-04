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
          style={{ width: '100%', border: `1px solid ${C('outline-variant')}`, borderRadius: 12, padding: '11px 13px',
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
          <div key={i} style={{ position: 'relative', width: 76, height: 76, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C('outline-variant')}` }}>
            <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <button onClick={() => removeAt(i)} aria-label="삭제"
              style={{ position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer',
                display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.55)', color: '#fff' }}>
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
        {images.length < 6 && (
          <button onClick={() => inputRef.current && inputRef.current.click()} className="md-interactive"
            style={{ position: 'relative', width: 76, height: 76, borderRadius: 12, cursor: 'pointer',
              border: `1.5px dashed ${C('outline')}`, background: C('surface-container-highest'),
              display: 'grid', placeItems: 'center', color: C('on-surface-variant') }}>
            <span className="md-state" /><Icon name="add_photo_alternate" size={24} />
          </button>
        )}
      </div>
    </div>
  );
}

/* Photo capture — two intents: keep the moment (store image) OR pull the text
   out of the image with Gemini OCR and store only the lightweight text. */
function PhotoCapture({ C, caption, setCaption }) {
  const [intent, setIntent] = useState('moment');   // moment · ocr
  const [ocr, setOcr] = useState('idle');           // idle · running · done
  const [text, setText] = useState('');
  const SAMPLE = '몰입(flow)은 행위와 의식이 하나로 합쳐지는 상태다. 시간 감각이 사라지고, 자아에 대한 의식이 옅어진다. 이 상태에 자주 드는 사람일수록 삶의 만족도가 높았다.\n— 미하이 칙센트미하이, 《몰입》 p.84';
  const runOcr = () => { setOcr('running'); setTimeout(() => { setText(SAMPLE); setOcr('done'); }, 1900); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* intent segmented control */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[['moment', 'photo_camera', '순간 기록'], ['ocr', 'document_scanner', '글 추출 (OCR)']].map(([id, ic, lb]) => {
          const on = intent === id;
          return (
            <button key={id} onClick={() => setIntent(id)} className="md-interactive"
              style={{ position: 'relative', flex: 1, padding: '13px 8px', borderRadius: 14, cursor: 'pointer',
                border: `1.5px solid ${on ? C('primary') : C('outline-variant')}`,
                background: on ? C('secondary-container') : C('surface-container'), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span className="md-state" />
              <Icon name={ic} size={22} style={{ color: on ? C('on-secondary-container') : C('on-surface-variant') }} />
              <span className="md-title-small" style={{ color: on ? C('on-secondary-container') : C('on-surface') }}>{lb}</span>
            </button>
          );
        })}
      </div>
      <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', marginTop: -4 }}>
        {intent === 'moment'
          ? '그 순간을 사진 그대로 남겨요. 이미지가 기록과 함께 저장돼요.'
          : '이미지 속 글자만 뽑아 담아요. 무거운 원본 사진은 저장하지 않아 용량을 아껴요.'}
      </div>

      {/* photo dropzone (user fills) */}
      <image-slot id={intent === 'ocr' ? 'sb-capture-ocr' : 'sb-capture-photo'} shape="rounded" radius="16"
        placeholder={intent === 'ocr' ? '글자가 있는 사진을 올려요' : '사진을 올리거나 촬영'}
        style={{ display: 'block', width: '100%', height: 188, border: `1.5px dashed ${C('outline')}`, borderRadius: 16, background: C('surface-container') }}></image-slot>
      <div style={{ display: 'flex', gap: 8 }}>
        <MdButton variant="tonal" size="s" icon="photo_camera">촬영</MdButton>
        <MdButton variant="outlined" size="s" icon="image">앨범</MdButton>
      </div>

      {intent === 'moment' ? (
        <Field C={C} icon="edit_note" label="한 줄 메모" hint="이 사진은 어떤 순간인가요?" value={caption} onChange={setCaption} multiline />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ocr === 'idle' && (
            <MdButton variant="filled" full icon="auto_awesome" onClick={runOcr}>Gemini로 글 추출</MdButton>
          )}
          {ocr === 'running' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '18px 0' }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', border: `3px solid ${C('primary')}`, borderTopColor: 'transparent', animation: 'sb-spin .8s linear infinite', flex: '0 0 auto' }} />
              <span className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>Gemini가 이미지 속 글자를 읽는 중…</span>
            </div>
          )}
          {ocr === 'done' && (
            <React.Fragment>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="auto_awesome" size={15} style={{ color: C('tertiary') }} />
                <span className="md-label-medium" style={{ color: C('on-surface-variant') }}>추출한 글 · 고쳐도 돼요</span>
                <div style={{ flex: 1 }} />
                <MdButton variant="text" size="s" icon="replay" onClick={runOcr}>다시 추출</MdButton>
              </div>
              <window.AutoTextarea value={text} onChange={setText} placeholder="추출된 글" C={C} minRows={4} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, background: C('tertiary-container'), color: C('on-tertiary-container') }}>
                <Icon name="cloud_off" size={17} style={{ flex: '0 0 auto' }} />
                <span className="md-body-small" style={{ wordBreak: 'keep-all' }}>원본 이미지는 저장하지 않고, 추출한 글만 담아요.</span>
              </div>
            </React.Fragment>
          )}
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
  const [todos, setTodos] = useState(['', '']);
  const [caption, setCaption] = useState('');
  const [images, setImages] = useState([]);   // 글 양식에 첨부한 이미지 (dataURL 목록)
  const [recording, setRecording] = useState(false);
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
  // input (more natural than jumping to 위키 — the user keeps capturing).
  const finalize = (cat) => {
    if (offline) { go('records'); return; }
    if (env && env.startJob) {
      if (cat) env.startJob(`'${cat.label}' 별에 담는 중`, { doneMsg: `'${cat.label}' 별에 새 별가루을 엮었어요`, action: '위키 보기', goTo: 'records' });
      else env.startJob('세컨비가 알맞은 별을 찾는 중', { doneMsg: '세컨비가 어울리는 별로 분류했어요', action: '위키 보기', goTo: 'records' });
    }
    // reset the form and return to the capture input
    setW4({ what: '', when: '', where: '', who: '', how: '', why: '' });
    setText(''); setLinks(['', '', '', '', '']); setTodos(['', '']); setCaption(''); setImages([]);
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
          <div className="md-headline-small" style={{ color: C('on-surface'), margin: '4px 0 4px' }}>어떤 별에 담을까요?</div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 18, wordBreak: 'keep-all' }}>
            이 기록과 어울리는 별을 골라주세요. 잘 모르겠으면 세컨비에게 맡겨도 돼요.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {CATEGORIES.map((c) => (
              <MdCard key={c.id} variant="outlined" onClick={() => finalize(c)} style={{ padding: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center',
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
          <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 9, textAlign: 'center', wordBreak: 'keep-all' }}>
            세컨비가 근거를 찾아 어울리는 별로 자동 분류해요. 나중에 직접 고칠 수 있어요.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div data-scroll style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 12px' }}>

        {offline && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '11px 14px',
            borderRadius: 12, background: C('surface-container-highest'), border: `1px solid ${C('outline-variant')}` }}>
            <Icon name="cloud_off" size={18} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
            <span className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>
              오프라인이에요. 담으면 <b style={{ color: C('on-surface') }}>큐에 저장</b>됐다가, 연결되면 자동으로 동기화돼요. (분석은 그때 시작)
            </span>
          </div>
        )}

        {/* format selector */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px', padding: '0 16px 4px' }}>
          {window.SB.CAPTURE_MODES.map((m) => (
            <MdChip key={m.id} icon={m.icon} variant="filter" selected={mode === m.id} onClick={() => setMode(m.id)}>{m.label}</MdChip>
          ))}
        </div>

        {/* ===== format-specific input ===== */}
        <div style={{ marginTop: 16 }}>
          {mode === 'text' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 자유 양식 ↔ W4H1 양식 토글 */}
              <div style={{ display: 'flex', padding: 3, borderRadius: 9999, background: C('surface-container-highest'), border: `1px solid ${C('outline-variant')}` }}>
                {[{ k: false, label: '자유 양식', icon: 'edit_note' }, { k: true, label: 'W4H1 양식', icon: 'view_agenda' }].map((o) => (
                  <button key={o.label} onClick={() => setStructured(o.k)} className="md-interactive"
                    style={{ position: 'relative', flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      height: 36, borderRadius: 9999, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                      background: structured === o.k ? C('primary') : 'transparent',
                      color: structured === o.k ? C('on-primary') : C('on-surface-variant'),
                      fontSize: 13, fontWeight: structured === o.k ? 700 : 500 }}>
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
              <div className="md-body-small" style={{ color: C('on-surface-variant') }}>링크를 붙여넣으면 제목·요약을 가져와요. (최대 5개)</div>
              {links.map((v, i) => (
                <div key={i} style={{ border: `1px solid ${C('outline-variant')}`, borderRadius: 12, padding: 10, background: C('surface-container') }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 22, height: 22, borderRadius: 6, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: C('surface-container-highest'), color: C('on-surface-variant'), fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                    <input value={v} onChange={(ev) => setLinks((ls) => ls.map((x, idx) => (idx === i ? ev.target.value : x)))} placeholder="https://"
                      style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: C('on-surface'), fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 13, outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <MdButton variant="tonal" size="s" icon="add" onClick={() => pasteInto(i)}>붙여넣기</MdButton>
                    <MdButton variant="text" size="s" icon="close" onClick={() => clearAt(i)}>지우기</MdButton>
                  </div>
                </div>
              ))}
            </div>
          )}

          {mode === 'photo' && (
            <PhotoCapture C={C} caption={caption} setCaption={setCaption} />
          )}

          {mode === 'voice' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '20px 0' }}>
              <button onClick={() => setRecording((r) => !r)} className="md-interactive"
                style={{ position: 'relative', width: 88, height: 88, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: recording ? C('error') : C('primary'), color: recording ? C('on-error') : C('on-primary'),
                  boxShadow: recording ? '0 0 0 8px rgba(255,80,80,.16)' : '0 4px 16px rgba(70,90,200,.4)', transition: 'all .2s' }}>
                <span className="md-state" />
                <Icon name={recording ? 'pause' : 'mic'} fill size={36} style={{ position: 'absolute', inset: 0, margin: 'auto' }} />
              </button>
              <div className="md-body-medium" style={{ color: C('on-surface-variant') }}>{recording ? '듣고 있어요… 다시 누르면 멈춰요' : '탭하고 말하면 자동으로 받아 적어요'}</div>
              {recording && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 28 }}>
                  {[10, 18, 26, 16, 22, 12, 20, 14].map((h, i) => (
                    <span key={i} style={{ width: 3, height: h, borderRadius: 2, background: C('primary'), animation: `sb-pulse 0.9s ${i * 0.1}s ease-in-out infinite` }} />
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === 'todo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {todos.map((v, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${C('outline-variant')}`, borderRadius: 12, padding: '10px 12px', background: C('surface-container-highest') }}>
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

      {/* sticky 담기 footer */}
      <div style={{ padding: '10px 16px 14px', borderTop: `1px solid ${C('outline-variant')}`, background: C('surface') }}>
        <MdButton variant="filled" full icon={offline ? 'cloud_off' : 'arrow_forward'} onClick={submit}>{offline ? '큐에 담기 (동기화 대기)' : '담기'}</MdButton>
      </div>
    </div>
  );
}

/* ===================== CHAT 세컨비 (3 modes) ===================== */
const CHAT_ANSWERS = {
  '2nd': { text: '최근 2주 기록을 보면 ‘쉼’ 없이 일만 늘었어요. 당신은 사람을 만나야 충전되는 편인데, 그 시간이 부쩍 줄었네요.',
    cites: ['근거 · 기록 8건', '관계 별 ↓'], sugg: ['쉼을 한 줄 담기', '관계 별 보기'] },
  meta: { text: '데이터만 보면: 일 기록 +38%, 휴식 태그 0건, 평균 수면 5.6시간. 외향성 지표가 2주째 하락 추세예요.',
    cites: ['지표 · 4종', '추세 14일'], sugg: ['지표 자세히', '검증틀 열기'] },
  twi: { text: '당신 기록을 다르게 이어 보면 — ‘쉼’ 별과 ‘성장’ 별이 늘 따로 놀았어요. 둘을 묶으면? 혼자 걷는 30분을 ‘배우는 산책’으로 바꿔, 듣고 싶던 강연을 흘려보는 거예요. 쉬면서 자라는 시간이 생겨요.',
    cites: ['엮은 별 · 2개', '안 해본 조합'], sugg: ['이 아이디어 담기', '다른 조합 더 보기'] },
};

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

// ── conversation drawer (list · new · delete) ──
function ChatDrawer({ open, convs, activeId, MODES, C, onSelect, onNew, onDelete, onClose }) {
  const [confirmId, setConfirmId] = React.useState(null);
  React.useEffect(() => { if (!open) setConfirmId(null); }, [open]);
  const list = [...convs].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return (
    <React.Fragment>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(0,0,0,.5)',
        opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity .22s' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '84%', maxWidth: 300, zIndex: 31,
        background: C('surface-container-low'), borderRight: `1px solid ${C('outline-variant')}`,
        boxShadow: '6px 0 30px rgba(0,0,0,.45)', transform: open ? 'translateX(0)' : 'translateX(-105%)',
        transition: 'transform .26s cubic-bezier(.2,.8,.2,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 8px 10px 16px', flex: '0 0 auto' }}>
          <span className="md-title-medium" style={{ flex: 1, color: C('on-surface'), fontWeight: 700 }}>대화</span>
          <button onClick={onClose} aria-label="닫기" className="md-interactive"
            style={{ position: 'relative', width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: 'transparent', color: C('on-surface-variant'), display: 'grid', placeItems: 'center' }}>
            <span className="md-state" /><Icon name="close" size={20} />
          </button>
        </div>
        <div style={{ padding: '0 12px 10px', flex: '0 0 auto' }}>
          <button onClick={onNew} className="md-interactive"
            style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', gap: 8, height: 44,
              padding: '0 14px', borderRadius: 12, cursor: 'pointer', border: `1px solid ${C('outline-variant')}`,
              background: C('surface-container-high'), color: C('on-surface') }}>
            <span className="md-state" /><Icon name="edit_square" size={18} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>새 대화</span>
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
                  borderRadius: 12, cursor: 'pointer', marginBottom: 2,
                  background: on ? md.soft : 'transparent', border: `1px solid ${on ? md.accent : 'transparent'}` }}>
                <span className="md-state" />
                <span style={{ width: 8, height: 8, borderRadius: '50%', flex: '0 0 auto', background: md.accent, boxShadow: `0 0 6px ${md.glow}` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: on ? 700 : 600, color: on ? md.onSoft : C('on-surface'),
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{convTitle(c)}</span>
                    <span style={{ flex: '0 0 auto', fontSize: 10, color: C('on-surface-variant'), opacity: .8 }}>{relTime(c.ts)}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: C('on-surface-variant'), opacity: .85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {convPreview(c) || '메시지 없음'}
                  </div>
                </div>
                {confirming ? (
                  <div style={{ display: 'flex', gap: 4, flex: '0 0 auto' }} onClick={(ev) => ev.stopPropagation()}>
                    <button onClick={() => setConfirmId(null)} className="md-interactive" style={{ position: 'relative', height: 28, padding: '0 8px', borderRadius: 8, border: `1px solid ${C('outline-variant')}`, background: 'transparent', color: C('on-surface-variant'), fontSize: 11, fontWeight: 700, cursor: 'pointer' }}><span className="md-state" />취소</button>
                    <button onClick={() => { onDelete(c.id); setConfirmId(null); }} className="md-interactive" style={{ position: 'relative', height: 28, padding: '0 8px', borderRadius: 8, border: 'none', background: C('error'), color: C('on-error'), fontSize: 11, fontWeight: 700, cursor: 'pointer' }}><span className="md-state" />삭제</button>
                  </div>
                ) : (
                  <button onClick={(ev) => { ev.stopPropagation(); setConfirmId(c.id); }} aria-label="삭제" className="md-interactive"
                    style={{ position: 'relative', width: 30, height: 30, flex: '0 0 auto', borderRadius: '50%', border: 'none',
                      background: 'transparent', color: C('on-surface-variant'), display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                    <span className="md-state" /><Icon name="delete" size={17} />
                  </button>
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
      if (out && out.trim()) return { text: out.trim(), cites: base.cites, sugg: base.sugg };
    }
  } catch (e) {}
  return { text: base.text, cites: base.cites, sugg: base.sugg };
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
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const scrollRef = React.useRef(null);

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
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [convs, activeId, typing]);

  // start a new conversation (reuse an existing blank one instead of piling up)
  const startConv = () => {
    setDrawerOpen(false); setDraft('');
    if (active && active.msgs.length === 0) return;
    const blank = convs.find((c) => c.msgs.length === 0);
    if (blank) { setActiveId(blank.id); return; }
    const nc = newConv(modeId);
    setConvs((prev) => [nc, ...prev]); setActiveId(nc.id);
  };

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
    setDraft('');
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
    setDraft('');
  };

  // render one SB message (mode-colored, with cites + suggestions)
  const renderSb = (msg, i) => {
    const mm = MODES.find((x) => x.id === msg.mode) || m;
    const a = (msg.text ? msg : CHAT_ANSWERS[msg.mode]) || CHAT_ANSWERS['2nd'];
    return (
      <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '88%' }}>
        <div style={{ padding: '12px 14px', borderRadius: '4px 16px 16px 16px', borderLeft: `3px solid ${mm.accent}`,
          background: C('surface-container-high'), color: C('on-surface') }} className="md-body-medium">
          {a.text}
        </div>
        {a.cites && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {a.cites.map((c) => (
              <span key={c} onClick={() => go('records')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 26, padding: '0 10px',
                borderRadius: 8, background: mm.soft, color: mm.onSoft, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <Icon name="bubble_chart" size={13} />{c}
              </span>
            ))}
          </div>
        )}
        {a.sugg && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {a.sugg.map((s) => (
              <MdChip key={s} onClick={() => (s.includes('담') ? go('capture') : send(s))}>{s}</MdChip>
            ))}
          </div>
        )}
      </div>
    );
  };

  const showEmpty = msgs.length === 0 && !loading && !error;
  const canSend = !!draft.trim() && !typing;

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <ChatDrawer open={drawerOpen} convs={convs} activeId={activeId} MODES={MODES} C={C}
        onSelect={selectConv} onNew={startConv} onDelete={removeConv} onClose={() => setDrawerOpen(false)} />

      {/* header: back · menu · persona · conversation title · 담기 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 10px 8px 4px', background: m.soft, borderBottom: `1px solid ${m.soft}` }}>
        {onBack &&
        <button onClick={onBack} aria-label="뒤로" className="md-interactive"
          style={{ position: 'relative', width: 38, height: 38, flex: '0 0 auto', borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'transparent', color: m.onSoft, display: 'grid', placeItems: 'center' }}>
          <span className="md-state" /><Icon name="arrow_back" size={22} />
        </button>}
        <button onClick={() => setDrawerOpen(true)} aria-label="대화 목록" className="md-interactive"
          style={{ position: 'relative', width: 38, height: 38, flex: '0 0 auto', borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'transparent', color: m.onSoft, display: 'grid', placeItems: 'center' }}>
          <span className="md-state" /><Icon name="menu" size={22} />
        </button>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.accent, boxShadow: `0 0 8px ${m.glow}`, flex: '0 0 auto' }} />
        <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 10, fontWeight: 700, color: m.onSoft, whiteSpace: 'nowrap', flex: '0 0 auto' }}>{m.tag}</span>
        <span className="md-title-small" style={{ color: C('on-surface'), fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active ? convTitle(active) : '새 대화'}</span>
        <button onClick={archive} className="md-interactive"
          style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, height: 30, padding: '0 11px', flex: '0 0 auto',
            borderRadius: 9999, border: `1.5px solid ${m.accent}`, background: 'transparent', color: m.onSoft, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
          <span className="md-state" /><Icon name="inventory_2" size={15} />담기
        </button>
      </div>

      {offline && (
        <div style={{ margin: '10px 16px 0' }}><OfflineBanner /></div>
      )}

      {/* messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <LoadingState label="대화를 준비하는 중" sub={`${m.name}가 당신의 별을 살펴보고 있어요`} />
        ) : error ? (
          <ErrorState title="답을 가져오지 못했어요" body="네트워크가 불안정해요. 잠시 후 다시 시도해 주세요." onRetry={() => {}} />
        ) : showEmpty ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 12, padding: '30px 24px' }}>
            <img src={m.face} alt="" style={{ width: 64, height: 64, animation: 'sb-bob 4s ease-in-out infinite' }} />
            <div className="md-title-medium" style={{ color: C('on-surface') }}>{m.name}와 새 대화</div>
            <div className="md-body-medium" style={{ color: C('on-surface-variant'), maxWidth: 230, wordBreak: 'keep-all' }}>
              {m.name}에게 무엇이든 물어보세요. 당신의 7개 별에서 근거를 찾아 답할게요.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
              {['요즘 나 어때?', '나 왜 지칠까?', '뭘 더 담으면 좋아?'].map((s) => <MdChip key={s} onClick={() => send(s)}>{s}</MdChip>)}
            </div>
          </div>
        ) : (
          <React.Fragment>
            {msgs.map((msg, i) => (
              msg.role === 'user' ? (
                <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '82%', padding: '10px 14px', borderRadius: '16px 16px 4px 16px',
                  background: C('primary'), color: C('on-primary'), whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} className="md-body-medium">{msg.text}</div>
              ) : renderSb(msg, i)
            ))}
            {typing && (
              <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px', borderRadius: '4px 16px 16px 16px',
                borderLeft: `3px solid ${m.accent}`, background: C('surface-container-high') }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: m.accent, opacity: .8,
                    animation: `sb-pulse 0.9s ${i * 0.15}s ease-in-out infinite` }} />
                ))}
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
              style={{ position: 'relative', flex: 1, padding: '8px 4px', borderRadius: 12, cursor: 'pointer',
                border: `1.5px solid ${on ? x.accent : C('outline-variant')}`,
                background: on ? x.soft : 'transparent', transition: 'border-color .2s, color .2s' }}>
              <span className="md-state" />
              <div style={{ fontSize: 13, fontWeight: 700, color: on ? x.onSoft : C('on-surface-variant') }}>{x.name}</div>
              <div style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 9, color: on ? x.accent : C('on-surface-variant'), marginTop: 1 }}>{x.tag}</div>
            </button>
          );
        })}
      </div>

      {/* input bar — real text field + always-visible send (Enter sends too) */}
      <div style={{ padding: '8px 12px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, height: 48, padding: '0 6px 0 16px', borderRadius: 9999,
          background: listening ? m.soft : C('surface-container-high'),
          border: listening ? `1.5px solid ${m.accent}` : '1.5px solid transparent', transition: 'all .2s' }}>
          {listening ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 18, flex: '0 0 auto' }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} style={{ width: 3, borderRadius: 2, background: m.accent,
                    animation: `sb-wave 0.9s ${i * 0.12}s ease-in-out infinite` }} />
                ))}
              </span>
              <span className="md-body-medium" style={{ flex: 1, minWidth: 0, color: m.onSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {draft || '듣고 있어요…'}
              </span>
            </div>
          ) : (
            <input value={draft} onChange={(ev) => setDraft(ev.target.value)} onKeyDown={onKey}
              placeholder={offline ? '오프라인 — 연결되면 답할게요' : `${m.name}에게 물어보기…`}
              disabled={loading || error}
              style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none',
                color: C('on-surface'), fontFamily: 'var(--md-ref-typeface-plain)', fontSize: 15 }} />
          )}
          <button onClick={() => setListening((v) => !v)} aria-label={listening ? '받아쓰기 중지' : '음성 입력'} className="md-interactive"
            style={{ position: 'relative', width: 36, height: 36, borderRadius: '50%', flex: '0 0 auto', cursor: 'pointer',
              border: 'none', display: 'grid', placeItems: 'center', transition: 'all .2s',
              background: listening ? m.accent : 'transparent', color: listening ? '#06121f' : C('on-surface-variant') }}>
            <span className="md-state" />
            {listening && <span style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: `2px solid ${m.accent}`, opacity: .5, animation: 'sb-mic-ring 1.2s ease-out infinite' }} />}
            <Icon name={listening ? 'stop' : 'mic'} fill={listening} size={22} />
          </button>
        </div>
        <button onClick={() => { setListening(false); send(); }} disabled={!canSend} aria-label="보내기" className="md-interactive"
          style={{ position: 'relative', width: 48, height: 48, borderRadius: '50%', cursor: canSend ? 'pointer' : 'default',
            border: `1.5px solid ${m.accent}`, background: canSend ? m.accent : 'transparent',
            color: canSend ? '#06121f' : m.accent, display: 'grid', placeItems: 'center', flex: '0 0 auto', transition: 'all .15s' }}>
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
