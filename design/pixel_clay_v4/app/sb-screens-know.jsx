/* ============================================================
   2nd-Brain · Knowing-axis screens
   Records, RecordDetail, Interview, BigFive, Audit
   Export: window.RecordsScreen, RecordDetailScreen, InterviewScreen,
           BigFiveScreen, AuditScreen
   ============================================================ */

const { useState } = React;

const STAR_COLORS = {
  '지금의 나': 'primary', '리듬': 'tertiary', '관계 · 지식': 'secondary',
  '일 · 성장': 'primary', '회상': 'tertiary', '미래의 나': 'secondary',
};

function Dots({ level, max = 5, color }) {
  const C = window.SB.C;
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} style={{ width: 6, height: 6, borderRadius: 0,
          background: i < level ? (color || C('primary')) : C('surface-variant') }} />
      ))}
    </span>
  );
}

/* ===================== RECORDS 기록 보관소 ===================== */
function RecordsScreen({ t, go, env }) {
  const C = window.SB.C;
  const WikiGraph = window.WikiGraph;
  const ds = t.dataState || '채움';

  if (ds === '로딩') return <LoadingState label="위키를 엮는 중" sub="담은 별가루을 별과 태그로 연결하고 있어요." />;
  if (ds === '오류') return <ErrorState onRetry={() => go('records')} />;
  if (ds === '빈') return (
    <EmptyState icon="inbox" title="아직 담은 별가루이 없어요"
      body="떠오른 생각을 한 줄 담으면, 세컨비가 별로 엮어드려요." cta="첫 별가루 담기" onCta={() => go('capture')} />
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {ds === '오프라인' && <div style={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 30 }}><OfflineBanner /></div>}
      <WikiGraph go={go} labels={env && env.graphLabels} setLabel={env && env.setGraphLabel} />
    </div>
  );
}

/* ===================== RECORD DETAIL 별가루 상세 ===================== */
/* 그래프 노드에서 연 별가루 — 그 노드의 실제 글/데이터 */
function GraphRecordDetail({ g, go, C }) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [moveTo, setMoveTo] = useState(null);
  const DOMS = window.SB.WIKI_DOMAINS || [];
  const WR = window.SB.WIKI_RECS || [];
  const dom = DOMS.find((d) => d.id === g.d) || {};
  const accent = dom.color || C('primary');
  const TL = { text: '글', link: '링크', voice: '음성', photo: '사진', todo: '할 일' };
  const TI = { text: 'edit_note', link: 'link', voice: 'mic', photo: 'photo_camera', todo: 'check_circle' };
  const fmt = (iso) => { const p = (iso || '').split('-'); return p.length === 3 ? `${+p[1]}월 ${+p[2]}일` : (g.time || ''); };
  const links = WR.filter((o) => o.id !== g.id && o.tags.some((tg) => g.tags.includes(tg)));
  const dur = ((g.title || '').match(/\(([0-9]+:[0-9]{2})\)/) || [])[1] || '0:42';
  return (
    <ScreenPad>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 10px', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 0, background: accent + '26', flex: '0 0 auto' }}>
          <span style={{ width: 7, height: 7, borderRadius: 0, background: accent, flex: '0 0 auto' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C('on-surface'), whiteSpace: 'nowrap' }}>{dom.name || g.star || ''}</span>
        </span>
        <span className="md-label-large" style={{ color: C('on-surface-variant') }}>{TL[g.type] || '글'} · {fmt(g.date)}</span>
      </div>

      <div className="md-title-large" style={{ color: C('on-surface'), wordBreak: 'keep-all', marginBottom: 14 }}>{g.title}</div>

      {g.type === 'photo' && (
        <div style={{ height: 150, borderRadius: 0, marginBottom: 10, display: 'grid', placeItems: 'center',
          background: `linear-gradient(135deg, ${accent}33, ${accent}10)`, border: `1px solid ${accent}33` }}>
          <Icon name="photo_camera" size={30} style={{ color: accent }} />
        </div>
      )}
      {g.type === 'voice' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 0, marginBottom: 10, background: C('surface-container-highest') }}>
          <div style={{ width: 38, height: 38, borderRadius: 0, display: 'grid', placeItems: 'center', background: accent, color: 'var(--ds-space-2)', flex: '0 0 auto' }}>
            <Icon name="play_arrow" fill size={22} />
          </div>
          <div style={{ flex: 1, height: 24, display: 'flex', alignItems: 'center', gap: 2, overflow: 'hidden' }}>
            {Array.from({ length: 32 }).map((_, i) => <span key={i} style={{ flex: 1, height: `${24 + Math.round(64 * Math.abs(Math.sin(i * 1.27)))}%`, background: 'rgba(180,205,255,.45)', borderRadius: 0 }} />)}
          </div>
          <span style={{ fontFamily: 'var(--md-ref-typeface-mono)', fontSize: 12, color: C('on-surface-variant'), flex: '0 0 auto' }}>{dur}</span>
        </div>
      )}
      {g.type === 'link' && (
        <a href="#" onClick={(e) => e.preventDefault()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', borderRadius: 0, marginBottom: 10, background: C('surface-container-highest'), textDecoration: 'none' }}>
          <Icon name="link" size={18} style={{ color: accent, flex: '0 0 auto' }} />
          <span className="md-body-small" style={{ color: C('primary'), flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>저장한 링크 · 원문 열기</span>
          <Icon name="open_in_new" size={16} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
        </a>
      )}
      <MdCard variant="outlined" style={{ padding: 16 }}>
        <div className="md-label-small" style={{ color: C('on-surface-variant'), marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name={TI[g.type] || 'edit_note'} size={15} />{g.type === 'voice' ? '받아쓰기' : g.type === 'photo' ? '메모' : '원문'}
        </div>
        <div className="md-body-large" style={{ color: C('on-surface'), wordBreak: 'keep-all', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{g.body || g.summary}</div>
      </MdCard>

      <div style={{ marginTop: 22 }}>
        <window.DialogBox compact kindLabel="세컨비가 읽은 의미" line={g.summary}
        head={<window.SbHead size={32} track={false} />}
        choices={[{ label: `${dom.name} 별 보기`, icon: 'travel_explore', on: () => go('star', (window.SB.STARS || []).find((s) => s.id === g.d) || { id: g.d, domain: dom.name, level: dom.level, line: dom.line, route: 'star' }) }]} />
      </div>

      <SectionLabel>태그</SectionLabel>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {g.tags.map((tag) => <MdChip key={tag} variant="input" icon="sell">{tag}</MdChip>)}
      </div>

      {links.length > 0 && (
        <React.Fragment>
          <SectionLabel>{'이어지는\u00A0별가루\u00A0' + links.length}</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {links.map((o) => {
              const oc = (DOMS.find((d) => d.id === o.d) || {}).color || C('primary');
              const shared = o.tags.find((tg) => g.tags.includes(tg));
              return (
                <MdCard key={o.id} variant="outlined" onClick={() => go('record', { graph: true, id: o.id })} style={{ padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 0, background: oc, flex: '0 0 auto' }} />
                    <Icon name={TI[o.type]} size={18} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
                    <span className="md-body-medium" style={{ color: C('on-surface'), flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.title}</span>
                    {shared && <span style={{ fontSize: 12, color: C('on-surface-variant'), flex: '0 0 auto', whiteSpace: 'nowrap' }}>#{shared}</span>}
                    <Icon name="chevron_right" size={18} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
                  </div>
                </MdCard>
              );
            })}
          </div>
        </React.Fragment>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
        <MdButton variant="outlined" icon="edit" style={{ flex: 1 }} onClick={() => go('capture')}>편집</MdButton>
        <MdButton variant="outlined" icon="drive_file_move" style={{ flex: 1 }} onClick={() => setMoveOpen(true)}>이동</MdButton>
        <MdIconButton name="delete" variant="standard" style={{ color: C('error') }} title="삭제" onClick={() => setDelOpen(true)} />
      </div>

      {/* 이동 — 어느 별로 옮길지 고른다 */}
      {moveOpen &&
      <div onClick={() => setMoveOpen(false)} className="ds-scrim" role="dialog" aria-modal="true"
        style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', alignItems: 'flex-end' }}>
        <div onClick={(e) => e.stopPropagation()} className="ds-window" style={{ width: '100%', padding: '16px 18px 20px', margin: 'var(--u)' }}>
          <div aria-hidden="true" style={{ width: 32, height: 'var(--u)', background: 'var(--c03)', margin: '0 auto 14px' }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), marginBottom: 12 }}>어느 별로 옮길까요?</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(window.SB.STARS || []).filter((s) => !s.big && !s.portal).map((s) => (
              <MdChip key={s.id} variant="filter" selected={moveTo === s.domain} onClick={() => setMoveTo(s.domain)}>{s.domain}</MdChip>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <MdButton variant="filled" full disabled={!moveTo} onClick={() => { setMoveOpen(false); go('records'); }}>옮기기</MdButton>
          </div>
        </div>
      </div>}

      {/* 삭제 — 되돌릴 수 없으니 한 번 묻는다 */}
      {delOpen &&
      <div onClick={() => setDelOpen(false)} className="ds-scrim" role="dialog" aria-modal="true"
        style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', padding: 22 }}>
        <div onClick={(e) => e.stopPropagation()} className="ds-window" style={{ width: '100%', maxWidth: 300, padding: 20, margin: 'var(--u)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), marginBottom: 8 }}>이 별가루을 지울까요?</div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', marginBottom: 16 }}>
            지우면 되돌릴 수 없어요. 이어져 있던 별에서도 사라져요.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" onClick={() => setDelOpen(false)}>그대로 두기</MdButton></span>
            <span style={{ flex: 1 }}><MdButton variant="filled" full size="s" onClick={() => { setDelOpen(false); go('records'); }}>지우기</MdButton></span>
          </div>
        </div>
      </div>}
    </ScreenPad>
  );
}

/* ===================== RECORD DETAIL 별가루 상세 ===================== */
function RecordDetailScreen({ t, go, param }) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [moveTo, setMoveTo] = useState(null);
  const C = window.SB.C;
  const g = (param && param.graph) ? ((window.SB.WIKI_RECS || []).find((x) => x.id === param.id) || param) : null;
  if (g) return <GraphRecordDetail g={g} go={go} C={C} />;
  const r = param || window.SB.RECORDS[0];
  return (
    <ScreenPad>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px' }}>
        <div style={{ width: 40, height: 40, borderRadius: 0, display: 'grid', placeItems: 'center',
          background: C('secondary-container'), color: C('on-secondary-container') }}>
          <Icon name={r.icon} size={22} />
        </div>
        <span className="md-label-large" style={{ color: C('on-surface-variant') }}>
          {r.type === 'text' ? '글' : r.type === 'link' ? '링크' : r.type === 'voice' ? '음성' : r.type === 'photo' ? '사진' : '할 일'} · {r.time}
        </span>
      </div>

      <div className="md-title-large" style={{ color: C('on-surface'), wordBreak: 'keep-all', marginBottom: 14 }}>{r.title}</div>

      {/* 세컨비 한 줄 — 어느 별과 연결 + 근거 */}
      <div style={{ marginTop: 16 }}>
        <window.DialogBox compact kindLabel="세컨비" line="이 별가루은 ‘관계’ 별과 이어져요. 비슷한 기록 5건이 같은 시간대에 모여 있어요."
        head={<window.SbHead size={32} track={false} />}
        choices={[{ label: '이유 보기', icon: 'north_east', on: () => go('bigfive') }]} />
      </div>

      <SectionLabel>태그</SectionLabel>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {r.tags.map((tag) => <MdChip key={tag} variant="input" icon="sell">{tag}</MdChip>)}
        <MdChip icon="add">태그 추가</MdChip>
      </div>

      <SectionLabel>연결된 기록</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {window.SB.RECORDS.slice(2, 4).map((x) => (
          <MdCard key={x.id} variant="outlined" onClick={() => go('record', x)} style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name={x.icon} size={20} style={{ color: C('on-surface-variant') }} />
              <span className="md-body-medium" style={{ color: C('on-surface'), flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.title}</span>
              <Icon name="chevron_right" size={18} style={{ color: C('on-surface-variant') }} />
            </div>
          </MdCard>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
        <MdButton variant="outlined" icon="edit" style={{ flex: 1 }} onClick={() => go('capture')}>편집</MdButton>
        <MdButton variant="outlined" icon="drive_file_move" style={{ flex: 1 }} onClick={() => setMoveOpen(true)}>이동</MdButton>
        <MdIconButton name="delete" variant="standard" style={{ color: C('error') }} title="삭제" onClick={() => setDelOpen(true)} />
      </div>

      {/* 이동 — 어느 별로 옮길지 고른다 */}
      {moveOpen &&
      <div onClick={() => setMoveOpen(false)} className="ds-scrim" role="dialog" aria-modal="true"
        style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', alignItems: 'flex-end' }}>
        <div onClick={(e) => e.stopPropagation()} className="ds-window" style={{ width: '100%', padding: '16px 18px 20px', margin: 'var(--u)' }}>
          <div aria-hidden="true" style={{ width: 32, height: 'var(--u)', background: 'var(--c03)', margin: '0 auto 14px' }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), marginBottom: 12 }}>어느 별로 옮길까요?</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(window.SB.STARS || []).filter((s) => !s.big && !s.portal).map((s) => (
              <MdChip key={s.id} variant="filter" selected={moveTo === s.domain} onClick={() => setMoveTo(s.domain)}>{s.domain}</MdChip>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <MdButton variant="filled" full disabled={!moveTo} onClick={() => { setMoveOpen(false); go('records'); }}>옮기기</MdButton>
          </div>
        </div>
      </div>}

      {/* 삭제 — 되돌릴 수 없으니 한 번 묻는다 */}
      {delOpen &&
      <div onClick={() => setDelOpen(false)} className="ds-scrim" role="dialog" aria-modal="true"
        style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', padding: 22 }}>
        <div onClick={(e) => e.stopPropagation()} className="ds-window" style={{ width: '100%', maxWidth: 300, padding: 20, margin: 'var(--u)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C('on-surface'), marginBottom: 8 }}>이 별가루을 지울까요?</div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', marginBottom: 16 }}>
            지우면 되돌릴 수 없어요. 이어져 있던 별에서도 사라져요.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ flex: 1 }}><MdButton variant="outlined" full size="s" onClick={() => setDelOpen(false)}>그대로 두기</MdButton></span>
            <span style={{ flex: 1 }}><MdButton variant="filled" full size="s" onClick={() => { setDelOpen(false); go('records'); }}>지우기</MdButton></span>
          </div>
        </div>
      </div>}
    </ScreenPad>
  );
}

/* ===================== INTERVIEW 심층 인터뷰 ===================== */
function InterviewScreen({ t, go }) {
  const C = window.SB.C;
  const [step, setStep] = useState(0);
  const total = 5;
  const ratify = step >= total;
  if (ratify) {
    return (
      <ScreenPad>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 16px' }}>
          <Icon name="task_alt" fill size={22} style={{ color: C('primary') }} />
          <span className="md-title-large" style={{ color: C('on-surface') }}>이렇게 반영할까요?</span>
        </div>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 14 }}>
          답을 종합한 변경 제안이에요. <b>승인한 것만</b> 렌즈에 반영돼요.
        </div>
        {[
          { lens: '지금의 나 · 외향성', from: 'L3', to: 'L4', delta: '+6' },
          { lens: '리듬', from: 'L2', to: 'L3', delta: '명확' },
        ].map((d) => (
          <MdCard key={d.lens} variant="outlined" style={{ marginBottom: 10, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="md-title-small" style={{ color: C('on-surface') }}>{d.lens}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: C('primary') }}>
                {d.from} <Icon name="arrow_forward" size={14} /> {d.to}
              </span>
            </div>
            <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 4 }}>변화 {d.delta} · 근거 4건</div>
          </MdCard>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <MdButton variant="outlined" style={{ flex: 1 }} onClick={() => setStep(0)}>다시</MdButton>
          <MdButton variant="filled" style={{ flex: 2 }} icon="check" onClick={() => go('bigfive')}>승인하고 반영</MdButton>
        </div>
      </ScreenPad>
    );
  }
  const QS = [
    '요즘 사람들과 함께 있을 때, 에너지가 차오르나요 빠져나가나요?',
    '혼자 있는 저녁과 약속이 있는 저녁 중, 어느 쪽이 더 당신답나요?',
    '처음 만난 자리에서 먼저 말을 거는 편인가요?',
    '지친 하루의 끝, 누군가에게 연락하고 싶어지나요?',
    '돌아보면, 당신을 가장 살아있게 한 순간은 혼자였나요 함께였나요?',
  ];
  return (
    <ScreenPad>
      <div style={{ margin: '6px 0 4px' }}>
        <ProgressLinear value={(step / total) * 100} height={6} />
        <div className="md-label-medium" style={{ color: C('on-surface-variant'), marginTop: 8 }}>질문 {step + 1} / {total} · 회상 인터뷰</div>
      </div>
      <div style={{ margin: '26px 0 8px' }}>
        <window.DialogBox compact kindLabel={`질문 ${step + 1} / ${total}`} line={QS[step]}
        head={<window.SbHead size={48} track={false} />} />
      </div>
      <div className="md-body-small" style={{ color: C('tertiary'), margin: '10px 0 18px' }}>같은 핵심을 조금씩 다르게 되물어요. 더 또렷해지려고요.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {['그렇다', '조금 그렇다', '중간', '조금 아니다', '아니다'].map((a) => (
          <MdCard key={a} variant="outlined" onClick={() => setStep(step + 1)} style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="md-body-large" style={{ color: C('on-surface') }}>{a}</span>
              <Icon name="radio_button_unchecked" size={20} style={{ color: C('outline') }} />
            </div>
          </MdCard>
        ))}
      </div>
    </ScreenPad>
  );
}

/* ===================== BIG FIVE 지금의 나 ===================== */
function BigFiveScreen({ t, go }) {
  const C = window.SB.C;
  return (
    <ScreenPad>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '8px 0 4px' }}>
        <div className="md-headline-small" style={{ color: C('on-surface') }}>검증 · Big Five</div>
        <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 0, background: C('primary-container'), color: C('on-primary-container') }}>L4</span>
        <span className="md-label-small" style={{ color: C('on-surface-variant') }}>확신 64%</span>
      </div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 18 }}>숨은 결(레이어 B) · 도메인 행동을 삼각측량해 추정한 제안이에요</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {window.SB.BIGFIVE.map((b) => (
          <div key={b.k}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="md-body-medium" style={{ color: C('on-surface') }}>{b.k}</span>
              <span className="md-body-medium" style={{ color: b.delta ? C('primary') : C('on-surface-variant'), fontWeight: 700 }}>
                {b.v}{b.delta ? ` ↑${b.delta}` : ''}
              </span>
            </div>
            <ProgressLinear value={b.v} color={b.delta ? C('tertiary') : C('primary')} />
          </div>
        ))}
      </div>

      <RatifyBlock id="bigfive-extra" confidence={64} evidence={23} evidenceLabel="관계·휴식 기록"
        estimate="요즘 사람을 더 자주 만나신 것 같아요. 바깥으로 향하는 기운이 늘었어요."
        onEvidence={() => go('ratify')} onRefine={() => go('interview')} />

      <MdCard variant="filled" onClick={() => go('attachment')} style={{ marginTop: 12, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="forum" size={20} style={{ color: window.SB.C('tertiary') }} />
          <span className="md-body-medium" style={{ color: window.SB.C('on-surface'), flex: 1 }}>다른 검사 · 애착 유형 보기</span>
          <Icon name="chevron_right" size={20} style={{ color: window.SB.C('on-surface-variant') }} />
        </div>
      </MdCard>

      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <MdButton variant="tonal" icon="replay" style={{ flex: 1 }} onClick={() => go('interview')}>다시 측정</MdButton>
        <MdButton variant="filled" icon="add" style={{ flex: 1 }} onClick={() => go('capture')}>데이터 추가</MdButton>
      </div>
    </ScreenPad>
  );
}

/* ===================== AUDIT 회상 · 시기별 ===================== */
function AuditScreen({ t, go }) {
  const C = window.SB.C;
  return (
    <ScreenPad>
      <div className="md-headline-small" style={{ color: C('on-surface'), margin: '8px 0 4px' }}>과거의 나</div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 18 }}>시기를 골라 그때의 당신을 다시 떠올려봐요.</div>
      <div style={{ position: 'relative', paddingLeft: 20 }}>
        <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, background: C('outline-variant') }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {window.SB.ERAS.map((e) => (
            <div key={e.k} style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: -19, top: 18, width: 12, height: 12, borderRadius: 0,
                background: C('primary'), border: `2px solid ${C('surface')}`, boxShadow: 'none' }} />
              <MdCard variant="filled" onClick={() => go('interview')} style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div className="md-title-medium" style={{ color: C('on-surface') }}>{e.k}</div>
                    <div className="md-body-small" style={{ color: C('on-surface-variant') }}>{e.range}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Dots level={e.level} />
                    <div className="md-label-small" style={{ color: C('on-surface-variant'), marginTop: 4 }}>또렷함 L{e.level}</div>
                  </div>
                  <Icon name="chevron_right" size={20} style={{ color: C('on-surface-variant') }} />
                </div>
              </MdCard>
            </div>
          ))}
        </div>
      </div>
    </ScreenPad>
  );
}

Object.assign(window, { RecordsScreen, RecordDetailScreen, InterviewScreen, BigFiveScreen, AuditScreen, Dots });
