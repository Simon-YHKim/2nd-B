/* ============================================================
   2nd-Brain · PRD gap-fill screens (B-series remainder)
   - PeerScreen      : 보여지는 나(peer review) — 설문 공유 + 자기/타인 비교
   - TriageScreen    : 정리함 — 미분류 별가루 태그확정/보관/삭제 + 진행감
   - ResearchScreen  : 연결 찾기 — 세컨비 군집·연관 제안 + 근거(propose→ratify)
   - PwResetScreen   : 비밀번호 재설정
   - ProfileSetupScreen : 프로필 완성(강제)
   - DobGateScreen   : 생년월일 확인(미성년 게이트)
   - PermissionsScreen : 권한 관리(민감 항목 강조)
   - PrivacyScreen   : 개인정보·약관·데이터 주권
   - SupportScreen   : 지원·공지·문의
   - ManualScreen    : 사용 매뉴얼·핵심 개념
   Export: window.<each>
   ============================================================ */
const { useState: useGp } = React;

/* ---- small shared list row (chevron) ---- */
function GapRow({ icon, label, sub, accent, badge, onClick, danger }) {
  const C = window.SB.C;
  return (
    <div className="md-interactive" onClick={onClick}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '13px 12px', borderRadius: 12, cursor: 'pointer' }}>
      <span className="md-state" />
      <div style={{ width: 38, height: 38, borderRadius: 10, flex: '0 0 auto', display: 'grid', placeItems: 'center',
        background: accent || C('surface-container-highest'), color: danger ? C('error') : C('on-surface-variant') }}>
        <Icon name={icon} size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="md-body-large" style={{ color: danger ? C('error') : C('on-surface'), wordBreak: 'keep-all' }}>{label}</div>
        {sub && <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>{sub}</div>}
      </div>
      {badge}
      <Icon name="chevron_right" size={20} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
    </div>
  );
}

function SensitiveBadge() {
  const C = window.SB.C;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
      color: C('on-error-container'), background: C('error-container'), borderRadius: 9999, padding: '3px 9px' }}>
      <Icon name="lock" size={12} />민감
    </span>
  );
}

/* ===================== 보여지는 나 (peer review) ===================== */
function PeerScreen({ t, go }) {
  const C = window.SB.C;
  const [copied, setCopied] = useGp(false);
  // self vs peer per trait (peer = 남이 본 평균)
  const pairs = [
    { k: '외향성', self: 41, peer: 60, note: '남들은 당신을 더 활발하게 봐요' },
    { k: '우호성', self: 67, peer: 74, note: '비슷하게 따뜻한 사람으로 보여요' },
    { k: '성실성', self: 58, peer: 55, note: '거의 같게 보여요' },
    { k: '개방성', self: 72, peer: 63, note: '스스로를 더 열린 사람으로 느껴요' },
  ];
  return (
    <ScreenPad>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '8px 0 2px' }}>
        <div className="md-headline-small" style={{ color: C('on-surface'), fontSize: 24, fontWeight: 700 }}>보여지는 나</div>
        <Dots level={2} color={C('tertiary')} />
      </div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 4, wordBreak: 'keep-all' }}>
        남이 보는 나는 얼마나 같을까요? 가까운 사람에게 익명 설문을 보내 모아요.
      </div>

      {/* share invite */}
      <MdCard variant="filled" style={{ background: C('secondary-container'), padding: 16, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Icon name="link" size={20} style={{ color: C('on-secondary-container') }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="md-title-small" style={{ color: C('on-secondary-container') }}>익명 설문 링크</div>
            <div className="md-body-small" style={{ color: C('on-secondary-container'), opacity: .8 }}>2nd.me/p/aria-7q · 30초 · 익명</div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: C('primary'), background: C('surface-container-highest'), borderRadius: 9999, padding: '4px 11px' }}>3명 응답</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <MdButton variant="filled" icon={copied ? 'check' : 'content_copy'} style={{ flex: 1 }} onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? '복사됨' : '링크 복사'}</MdButton>
          <MdButton variant="tonal" icon="ios_share" style={{ flex: 1 }}>공유</MdButton>
        </div>
      </MdCard>

      {/* self vs peer */}
      <SectionLabel>내가 보는 나 vs 남이 보는 나</SectionLabel>
      <MdCard variant="outlined" style={{ padding: '4px 14px 14px' }}>
        {pairs.map((p, i) => {
          const gap = Math.abs(p.self - p.peer);
          return (
            <div key={p.k} style={{ paddingTop: 14, borderTop: i ? `1px solid ${C('outline-variant')}` : 'none', marginTop: i ? 12 : 2 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="md-title-small" style={{ color: C('on-surface') }}>{p.k}</span>
                {gap >= 12 && <span style={{ fontSize: 11, fontWeight: 700, color: C('tertiary') }}>차이 {gap}p</span>}
              </div>
              {[['나', p.self, C('on-surface-variant')], ['남', p.peer, C('primary')]].map(([lab, v, col]) => (
                <div key={lab} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ width: 16, fontSize: 11, color: C('on-surface-variant'), flex: '0 0 auto' }}>{lab}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 9999, background: C('surface-container-highest'), overflow: 'hidden' }}>
                    <div style={{ width: v + '%', height: '100%', borderRadius: 9999, background: col }} />
                  </div>
                  <span style={{ width: 26, textAlign: 'right', fontSize: 12, fontWeight: 700, color: col, flex: '0 0 auto' }}>{v}</span>
                </div>
              ))}
              <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 5, wordBreak: 'keep-all' }}>{p.note}</div>
            </div>
          );
        })}
      </MdCard>

      <RatifyBlock id="peer" confidence={48} evidence={3} evidenceLabel="응답"
        estimate="남이 보는 당신은 스스로 느끼는 것보다 더 활발하고 따뜻한 편이에요. 응답이 더 모이면 또렷해져요."
        onEvidence={() => go('records')} onRefine={() => go('interview')} />

      <MdButton variant="text" icon="send" style={{ marginTop: 14 }} onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }}>설문 더 보내기</MdButton>
    </ScreenPad>
  );
}

/* ===================== 정리함 (triage) ===================== */
function TriageScreen({ t, go }) {
  const C = window.SB.C;
  const seed = [
    { id: 't1', icon: 'mic', title: '산책하며 떠오른 생각 (0:42)', sub: '음성 · 오전 9:14', tag: '리듬', why: '"혼자", "걷다" 표현이 리듬 별 신호와 겹쳐요.' },
    { id: 't2', icon: 'edit_note', title: '요즘 사람들 앞에서 덜 긴장된다', sub: '글 · 어제', tag: '관계', why: '관계·외향성 신호. 최근 통화 기록과도 이어져요.' },
    { id: 't3', icon: 'link', title: '딥워크 관련 아티클', sub: '링크 · 어제', tag: '성장', why: '학습·몰입 주제가 성장 별로 모여요.' },
    { id: 't4', icon: 'photo_camera', title: '새로 산 러닝화', sub: '사진 · 2일 전', tag: '건강', why: '운동 루틴 신호로 보여요.' },
  ];
  const stars = ['커리어', '재정', '성장', '관계', '건강', '휴식', '담아내기'];
  const [queue, setQueue] = useGp(seed);
  const [idx, setIdx] = useGp(0);
  const [tagFor, setTagFor] = useGp(null);
  const [confirm, setConfirm] = useGp(false);
  const total = seed.length;
  const done = total - queue.length;
  const cur = queue[0];

  const advance = () => { setQueue((q) => q.slice(1)); setTagFor(null); setIdx((i) => i + 1); };

  if (!cur) return (
    <EmptyState icon="task_alt" title="다 정리했어요" body={`미분류 ${total}개를 모두 별로 보냈어요. 새 별가루이 쌓이면 다시 알려드릴게요.`} cta="기록 보관소로" onCta={() => go('records')} />
  );

  return (
    <ScreenPad>
      {/* progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 14px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="md-title-small" style={{ color: C('on-surface') }}>정리함</span>
            <span className="md-body-small" style={{ color: C('on-surface-variant') }}>남은 {queue.length}개 · {done}/{total}</span>
          </div>
          <div style={{ height: 8, borderRadius: 9999, background: C('surface-container-highest'), overflow: 'hidden' }}>
            <div style={{ width: (done / total * 100) + '%', height: '100%', borderRadius: 9999, background: C('primary'), transition: 'width .3s' }} />
          </div>
        </div>
      </div>

      {/* current fragment card */}
      <MdCard variant="elevated" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: C('secondary-container'), color: C('on-secondary-container') }}>
            <Icon name={cur.icon} size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="md-title-medium" style={{ color: C('on-surface'), wordBreak: 'keep-all' }}>{cur.title}</div>
            <div className="md-body-small" style={{ color: C('on-surface-variant') }}>{cur.sub}</div>
          </div>
        </div>

        {/* secondb proposal */}
        <div style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 12, background: C('surface-container-high') }}>
          <img src="assets/deepspace/secondb-head-front.png" alt="" style={{ width: 26, height: 26, flex: '0 0 auto' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="md-body-small" style={{ color: C('on-surface-variant'), opacity: .8, marginBottom: 3 }}>세컨비 제안</div>
            <div className="md-body-medium" style={{ color: C('on-surface'), wordBreak: 'keep-all' }}>
              <b style={{ color: C('primary') }}>{tagFor || cur.tag}</b> 별로 보낼까요?
            </div>
            <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 4, wordBreak: 'keep-all' }}>{cur.why}</div>
          </div>
        </div>

        {/* reassign chips */}
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
          {stars.map((s) => (
            <MdChip key={s} variant="filter" selected={(tagFor || cur.tag) === s} onClick={() => setTagFor(s)}>{s}</MdChip>
          ))}
        </div>
      </MdCard>

      {/* actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <MdButton variant="filled" icon="task_alt" style={{ flex: 1 }} onClick={advance}>이 별로 확정</MdButton>
        <MdButton variant="tonal" icon="inbox" onClick={advance}>보관</MdButton>
        <MdIconButton name="delete" variant="outlined" onClick={() => setConfirm(true)} style={{ color: C('error') }} />
      </div>
      <div className="md-body-small" style={{ color: C('on-surface-variant'), textAlign: 'center', marginTop: 10 }}>
        확정한 것만 그 별에 반영돼요 · 보관은 별 없이 보관소에만 남아요
      </div>

      <ConfirmDialog open={confirm} danger title="이 별가루을 삭제할까요?" body="삭제하면 기록과 파생 신호에서 완전히 제거돼요. 되돌릴 수 없어요."
        confirmLabel="삭제" onConfirm={advance} onClose={() => setConfirm(false)} />
    </ScreenPad>
  );
}

/* ===================== 연결 찾기 (research) ===================== */
function ResearchScreen({ t, go }) {
  const C = window.SB.C;
  const clusters = [
    { id: 'c1', title: '몰입과 회복의 균형', star: '리듬 · 건강', icon: 'bubble_chart',
      members: ['딥워크 아티클', '"쫓기듯 산다"는 메모', '러닝화 사진'], evd: 5,
      why: '몰입을 좇는 기록과 지친다는 신호가 번갈아 나타나요. 회복 루틴이 비는 시기와 겹쳐요.' },
    { id: 'c2', title: '먼저 말 꺼내는 나', star: '관계 · 외향성', icon: 'forum',
      members: ['회의에서 먼저 말함', '덜 긴장된다는 메모', '엄마에게 전화'], evd: 4,
      why: '최근 한 달, 먼저 다가가는 행동이 늘었어요. 외향성 신호가 모여요.' },
  ];
  const [accepted, setAccepted] = useGp({});
  return (
    <ScreenPad>
      <div style={{ display: 'flex', gap: 10, margin: '10px 0 4px' }}>
        <img src="assets/deepspace/secondb-head-front.png" alt="" style={{ width: 34, height: 34, flex: '0 0 auto', marginTop: 2 }} />
        <div>
          <div className="md-headline-small" style={{ color: C('on-surface'), fontSize: 22, fontWeight: 700 }}>연결 찾기</div>
          <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>기록들 사이에서 2개의 패턴을 찾았어요. 맞으면 별에 이어둘게요.</div>
        </div>
      </div>

      {clusters.map((cl) => {
        const ok = accepted[cl.id];
        return (
          <MdCard key={cl.id} variant="filled" style={{ padding: 16, marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: C('tertiary-container'), color: C('on-tertiary-container') }}>
                <Icon name={cl.icon} size={21} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="md-title-medium" style={{ color: C('on-surface'), wordBreak: 'keep-all' }}>{cl.title}</div>
                <div className="md-body-small" style={{ color: C('primary') }}>{cl.star}</div>
              </div>
            </div>
            {/* member records */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {cl.members.map((m) => (
                <button key={m} className="md-interactive" onClick={() => go('records')}
                  style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, border: 'none', cursor: 'pointer',
                    background: C('surface-container-high'), color: C('on-surface'), textAlign: 'left', font: 'inherit' }}>
                  <span className="md-state" />
                  <Icon name="link" size={15} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
                  <span className="md-body-small" style={{ flex: 1, wordBreak: 'keep-all' }}>{m}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, padding: 11, borderRadius: 11, background: C('surface-container-highest'), marginBottom: 12 }}>
              <Icon name="lightbulb" size={16} fill style={{ color: C('tertiary'), flex: '0 0 auto', marginTop: 1 }} />
              <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>{cl.why}</div>
            </div>

            {!ok ? (
              <React.Fragment>
                <div className="md-body-small" style={{ color: C('on-surface-variant'), display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Icon name="lock" size={13} />비준하기 전엔 별에 이어지지 않아요 · 근거 {cl.evd}건
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <MdButton variant="filled" icon="task_alt" style={{ flex: 1 }} onClick={() => setAccepted((a) => ({ ...a, [cl.id]: true }))}>연결 수락</MdButton>
                  <MdButton variant="outlined" style={{ flex: 1 }} onClick={() => setAccepted((a) => ({ ...a, [cl.id]: 'no' }))}>나중에</MdButton>
                </div>
              </React.Fragment>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: C('surface-container-highest') }}>
                <Icon name={ok === 'no' ? 'schedule' : 'task_alt'} size={18} fill={ok !== 'no'} style={{ color: ok === 'no' ? C('on-surface-variant') : C('primary') }} />
                <span className="md-body-small" style={{ color: C('on-surface'), flex: 1 }}>{ok === 'no' ? '나중에 다시 볼게요' : `${cl.star.split(' · ')[0]} 별에 이어졌어요`}</span>
                <button onClick={() => setAccepted((a) => ({ ...a, [cl.id]: undefined }))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C('on-surface-variant'), textDecoration: 'underline' }}>되돌리기</button>
              </div>
            )}
          </MdCard>
        );
      })}
    </ScreenPad>
  );
}

/* ===================== 비밀번호 재설정 ===================== */
function PwResetScreen({ t, go }) {
  const C = window.SB.C;
  const [sent, setSent] = useGp(false);
  if (sent) return (
    <ScreenPad>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 16px' }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, display: 'grid', placeItems: 'center', background: C('secondary-container'), color: C('on-secondary-container'), marginBottom: 18 }}>
          <Icon name="check" size={30} />
        </div>
        <div className="md-headline-small" style={{ color: C('on-surface'), fontSize: 22, fontWeight: 700, marginBottom: 8 }}>메일을 확인하세요</div>
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', maxWidth: 280 }}>
          aria@example.com 으로 재설정 링크를 보냈어요. 5분 안에 도착하지 않으면 스팸함도 확인해 주세요.
        </div>
        <MdButton variant="tonal" style={{ marginTop: 22 }} onClick={() => setSent(false)}>다시 보내기</MdButton>
        <MdButton variant="text" style={{ marginTop: 4 }} onClick={() => go('auth')}>로그인으로 돌아가기</MdButton>
      </div>
    </ScreenPad>
  );
  return (
    <ScreenPad>
      <div className="md-headline-small" style={{ color: C('on-surface'), fontSize: 22, fontWeight: 700, margin: '14px 0 6px' }}>비밀번호 재설정</div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 18, wordBreak: 'keep-all' }}>
        가입한 이메일을 알려주시면 재설정 링크를 보내드려요.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 56, padding: '0 16px', borderRadius: 14, background: C('surface-container-highest') }}>
        <Icon name="forum" size={20} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: C('on-surface-variant') }}>이메일</div>
          <div className="md-body-large" style={{ color: C('on-surface') }}>aria@example.com</div>
        </div>
      </div>
      <MdButton variant="filled" full icon="send" style={{ marginTop: 18 }} onClick={() => setSent(true)}>재설정 링크 보내기</MdButton>
    </ScreenPad>
  );
}

/* ===================== 프로필 완성(강제) ===================== */
function ProfileSetupScreen({ t, go }) {
  const C = window.SB.C;
  const [name, setName] = useGp('아리아');
  const [handle, setHandle] = useGp('aria');
  const [goal, setGoal] = useGp('');
  const [dob, setDob] = useGp('1996-04-12');
  const [dobOpen, setDobOpen] = useGp(false);
  const fields = [!!name, !!handle, !!dob, !!goal];
  const filled = fields.filter(Boolean).length;
  const ready = filled === fields.length;
  const Field = ({ label, icon, value, placeholder, prefix }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '8px 16px', borderRadius: 14, background: C('surface-container-highest') }}>
      <Icon name={icon} size={20} style={{ color: value ? C('primary') : C('on-surface-variant'), flex: '0 0 auto' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: C('on-surface-variant') }}>{label}</div>
        <div className="md-body-large" style={{ color: value ? C('on-surface') : C('on-surface-variant'), wordBreak: 'keep-all' }}>{prefix}{value || placeholder}</div>
      </div>
      {value ? <Icon name="check" size={18} style={{ color: C('primary') }} /> : <span style={{ fontSize: 11, color: C('tertiary'), fontWeight: 700 }}>필요</span>}
    </div>
  );
  return (
    <ScreenPad>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 8 }}>
        <div style={{ position: 'relative' }}>
          <div style={{ width: 84, height: 84, borderRadius: '50%', display: 'grid', placeItems: 'center', background: C('secondary-container'), color: C('on-secondary-container') }}>
            <Icon name="person" size={42} />
          </div>
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', background: C('primary'), color: C('on-primary'), border: `2px solid ${C('surface')}` }}>
            <Icon name="photo_camera" size={15} />
          </div>
        </div>
        <div className="md-title-medium" style={{ color: C('on-surface'), marginTop: 12 }}>프로필을 마저 채워요</div>
        <div className="md-body-small" style={{ color: C('on-surface-variant') }}>나를 쌓기 전에 한 번만요</div>
      </div>

      {/* completion bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 14px' }}>
        <div style={{ flex: 1, height: 8, borderRadius: 9999, background: C('surface-container-highest'), overflow: 'hidden' }}>
          <div style={{ width: (filled / fields.length * 100) + '%', height: '100%', borderRadius: 9999, background: C('primary'), transition: 'width .3s' }} />
        </div>
        <span className="md-body-small" style={{ color: C('on-surface-variant'), fontWeight: 700 }}>{filled}/{fields.length}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="이름" icon="person" value={name} />
        <Field label="핸들" icon="badge" value={handle} prefix="@" />
        <button onClick={() => setDobOpen(true)} className="md-interactive"
          style={{ position: 'relative', border: 'none', cursor: 'pointer', background: 'transparent', padding: 0, textAlign: 'left' }}>
          <Field label="생년월일 (눌러서 달력 열기)" icon="calendar_today" value={window.sbFmtDate(dob)} />
        </button>
        <button onClick={() => setGoal(goal ? '' : '나를 더 잘 이해하고 더 나답게 살기')} className="md-interactive"
          style={{ position: 'relative', border: 'none', cursor: 'pointer', background: 'transparent', padding: 0, textAlign: 'left' }}>
          <Field label="한 줄 목표 (눌러서 예시 채우기)" icon="auto_awesome" value={goal} placeholder="나는 왜 이 앱을 쓰나요?" />
        </button>
      </div>

      {dobOpen && <window.CalendarSheet value={dob} title="생년월일" pastOnly onChange={setDob} onClose={() => setDobOpen(false)} />}

      <MdButton variant="filled" full icon={ready ? 'task_alt' : undefined} style={{ marginTop: 20, opacity: ready ? 1 : .5 }} onClick={() => ready && go('home')}>
        {ready ? '시작하기' : '항목을 모두 채워주세요'}
      </MdButton>
    </ScreenPad>
  );
}

/* ===================== 생년월일 확인(미성년 게이트) ===================== */
function DobGateScreen({ t, go }) {
  const C = window.SB.C;
  const [dob, setDob] = useGp('1996-04-12');
  const [dobOpen, setDobOpen] = useGp(false);
  const birth = dob ? new Date(dob + 'T00:00:00') : null;
  const now = new Date();
  let age = 0;
  if (birth) { age = now.getFullYear() - birth.getFullYear(); const mo = now.getMonth() - birth.getMonth(); if (mo < 0 || (mo === 0 && now.getDate() < birth.getDate())) age--; }
  const minor = !!birth && age < 14;
  return (
    <ScreenPad>
      <div className="md-headline-small" style={{ color: C('on-surface'), fontSize: 22, fontWeight: 700, margin: '14px 0 6px' }}>생년월일을 알려주세요</div>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), marginBottom: 20, wordBreak: 'keep-all' }}>
        나이에 따라 보호 수준이 달라져요. 위치·통신 같은 민감한 데이터는 미성년에겐 잠겨요.
      </div>

      {/* date picker */}
      <div style={{ padding: '8px 0 4px' }}>
        <button onClick={() => setDobOpen(true)} className="md-interactive"
          style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
            border: `1px solid ${C('outline-variant')}`, borderRadius: 16, padding: '16px 16px', cursor: 'pointer', background: C('surface-container-highest') }}>
          <span className="md-state" />
          <Icon name="calendar_today" size={22} style={{ color: C('primary'), flex: '0 0 auto' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="md-body-small" style={{ color: C('on-surface-variant') }}>생년월일</div>
            <div className="md-title-medium" style={{ color: C('on-surface') }}>{window.sbFmtDate(dob) || '날짜를 골라요'}</div>
          </div>
          <span className="md-body-small" style={{ color: C('on-surface-variant'), whiteSpace: 'nowrap' }}>만 {age}세</span>
        </button>
      </div>

      {dobOpen && <window.CalendarSheet value={dob} title="생년월일" pastOnly onChange={setDob} onClose={() => setDobOpen(false)} />}

      {minor ? (
        <MdCard variant="filled" style={{ background: C('error-container'), padding: 16, marginTop: 4 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <Icon name="lock" size={22} style={{ color: C('on-error-container'), flex: '0 0 auto' }} />
            <div>
              <div className="md-title-small" style={{ color: C('on-error-container') }}>만 14세 이상만 가입할 수 있어요</div>
              <div className="md-body-small" style={{ color: C('on-error-container'), opacity: .85, marginTop: 4, wordBreak: 'keep-all' }}>
                보호자 동의와 별도 보호 정책이 필요해요. 통신·위치 데이터 수집은 서버에서 잠겨 있어요.
              </div>
            </div>
          </div>
        </MdCard>
      ) : (
        <MdButton variant="filled" full icon="arrow_forward" style={{ marginTop: 8 }} onClick={() => go('profilesetup')}>계속하기</MdButton>
      )}
    </ScreenPad>
  );
}

/* ===================== 권한 관리 ===================== */
function PermissionsScreen({ t, go }) {
  const C = window.SB.C;
  const [p, setP] = useGp({ notify: true, mic: true, camera: false, calendar: true, location: false, contacts: false });
  const set = (k, v) => setP((s) => ({ ...s, [k]: v }));
  const rows = [
    { k: 'notify', icon: 'bubble_chart', label: '알림', sub: '새 통찰·연속기록·완료를 알려요' },
    { k: 'mic', icon: 'mic', label: '마이크', sub: '음성 메모·통화 녹음 받아쓰기' },
    { k: 'camera', icon: 'photo_camera', label: '카메라', sub: '사진으로 별가루 담기' },
    { k: 'calendar', icon: 'today', label: '캘린더', sub: '비서가 보낸 루틴을 일정으로' },
  ];
  const sensitive = [
    { k: 'location', icon: 'workspaces', label: '위치', sub: '맥락 신호 (선택) · 기본 꺼짐' },
    { k: 'contacts', icon: 'forum', label: '통신·연락처', sub: '관계 신호 (선택) · 기본 꺼짐' },
  ];
  return (
    <ScreenPad>
      <div className="md-body-medium" style={{ color: C('on-surface-variant'), margin: '10px 0 4px', wordBreak: 'keep-all' }}>
        필요한 것만 켜세요. 끈 권한의 데이터는 절대 수집하지 않아요.
      </div>
      <SectionLabel>기본 권한</SectionLabel>
      <MdCard variant="filled" style={{ padding: 4 }}>
        {rows.map((r, i) => (
          <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
            <Icon name={r.icon} size={22} style={{ color: p[r.k] ? C('primary') : C('on-surface-variant'), flex: '0 0 auto' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="md-body-large" style={{ color: C('on-surface') }}>{r.label}</div>
              <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>{r.sub}</div>
            </div>
            <MdSwitch checked={p[r.k]} onChange={(v) => set(r.k, v)} />
          </div>
        ))}
      </MdCard>

      <SectionLabel>민감 권한 · 명시 동의</SectionLabel>
      <MdCard variant="outlined" style={{ padding: 4, borderColor: C('error') }}>
        {sensitive.map((r, i) => (
          <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
            <Icon name={r.icon} size={22} style={{ color: p[r.k] ? C('error') : C('on-surface-variant'), flex: '0 0 auto' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span className="md-body-large" style={{ color: C('on-surface') }}>{r.label}</span>
                <SensitiveBadge />
              </div>
              <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>{r.sub}</div>
            </div>
            <MdSwitch checked={p[r.k]} onChange={(v) => set(r.k, v)} />
          </div>
        ))}
      </MdCard>
      <div style={{ display: 'flex', gap: 8, padding: 12, marginTop: 12, borderRadius: 12, background: C('surface-container-high') }}>
        <Icon name="badge" size={18} style={{ color: C('tertiary'), flex: '0 0 auto', marginTop: 1 }} />
        <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>
          위치·통신은 명시 동의 없이는 한 건도 수집하지 않아요. 미성년 계정에선 서버에서 잠겨요.
        </div>
      </div>
    </ScreenPad>
  );
}

/* ===================== 개인정보·약관·데이터 주권 ===================== */
function PrivacyScreen({ t, go }) {
  const C = window.SB.C;
  const facts = [
    { icon: 'badge', label: '온디바이스 우선', v: '원문은 기기에서 분석하고, 파생 신호만 암호화해 남겨요.' },
    { icon: 'inbox', label: '수집 항목', v: '담은 별가루·렌즈 점수·사용 패턴. 위치·통신은 동의 시에만.' },
    { icon: 'schedule', label: '보관 기간', v: '계정이 살아있는 동안 · 탈퇴 시 30일 내 완전 삭제.' },
    { icon: 'delete', label: '삭제권', v: '언제든 항목·전체를 삭제할 수 있어요.' },
  ];
  return (
    <ScreenPad>
      <SectionLabel>한눈에</SectionLabel>
      <MdCard variant="filled" style={{ padding: 4 }}>
        {facts.map((f, i) => (
          <div key={f.label} style={{ display: 'flex', gap: 13, padding: '13px 12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
            <Icon name={f.icon} size={20} style={{ color: C('on-surface-variant'), flex: '0 0 auto', marginTop: 1 }} />
            <div>
              <div className="md-body-large" style={{ color: C('on-surface') }}>{f.label}</div>
              <div className="md-body-small" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all' }}>{f.v}</div>
            </div>
          </div>
        ))}
      </MdCard>

      <SectionLabel>문서</SectionLabel>
      <MdCard variant="filled" style={{ padding: 4 }}>
        <GapRow icon="shield_person" label="개인정보 처리방침" sub="2026. 06 개정" onClick={() => {}} />
        <div style={{ borderTop: `1px solid ${C('outline-variant')}` }} />
        <GapRow icon="auto_stories" label="이용약관" sub="2026. 06 개정" onClick={() => {}} />
      </MdCard>

      <MdButton variant="tonal" full icon="shield_person" style={{ marginTop: 16 }} onClick={() => go('datareview')}>내 데이터 리뷰 열기</MdButton>
    </ScreenPad>
  );
}

/* ===================== 지원·공지 ===================== */
function SupportScreen({ t, go }) {
  const C = window.SB.C;
  const [open, setOpen] = useGp(null);
  const faqs = [
    { q: '밝기(별빛)와 확신은 뭐가 다른가요?', a: '별빛은 그 영역을 얼마나 많이 담았는지, 확신은 세컨비의 추정이 얼마나 검증됐는지예요. 둘은 따로 움직여요.' },
    { q: '유료가 더 똑똑한가요?', a: '아니요. 답의 질은 모든 요금제가 같아요. 횟수·보관·내보내기 한도만 달라요.' },
    { q: '통화 녹음은 안전한가요?', a: '녹음은 기기에서 받아쓰고 즉시 삭제해요. 텍스트와 신호만 암호화해 남겨요.' },
  ];
  const notices = [
    { t: '세컨비 3모드 출시', d: '06. 20', tag: '새 기능' },
    { t: 'AI 뮤지엄 8개 컬렉션 공개', d: '06. 12', tag: '콘텐츠' },
    { t: '온디바이스 STT 개선', d: '06. 02', tag: '개선' },
  ];
  return (
    <ScreenPad>
      <SectionLabel>문의</SectionLabel>
      <div style={{ display: 'flex', gap: 8 }}>
        <MdButton variant="filled" icon="forum" style={{ flex: 1 }}>채팅 문의</MdButton>
        <MdButton variant="tonal" icon="send" style={{ flex: 1 }}>이메일 보내기</MdButton>
      </div>

      <SectionLabel>자주 묻는 질문</SectionLabel>
      <MdCard variant="filled" style={{ padding: 4 }}>
        {faqs.map((f, i) => (
          <div key={f.q} style={{ borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
            <button className="md-interactive" onClick={() => setOpen((o) => o === i ? null : i)}
              style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 12px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
              <span className="md-state" />
              <span className="md-body-large" style={{ flex: 1, color: C('on-surface'), wordBreak: 'keep-all' }}>{f.q}</span>
              <Icon name={open === i ? 'expand_less' : 'chevron_right'} size={20} style={{ color: C('on-surface-variant'), flex: '0 0 auto' }} />
            </button>
            {open === i && <div className="md-body-medium" style={{ color: C('on-surface-variant'), padding: '0 12px 14px', wordBreak: 'keep-all' }}>{f.a}</div>}
          </div>
        ))}
      </MdCard>

      <SectionLabel>공지사항</SectionLabel>
      <MdCard variant="filled" style={{ padding: 4 }}>
        {notices.map((n, i) => (
          <div key={n.t} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px', borderTop: i ? `1px solid ${C('outline-variant')}` : 'none' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C('on-secondary-container'), background: C('secondary-container'), borderRadius: 9999, padding: '3px 9px', flex: '0 0 auto' }}>{n.tag}</span>
            <span className="md-body-large" style={{ flex: 1, color: C('on-surface'), wordBreak: 'keep-all' }}>{n.t}</span>
            <span className="md-body-small" style={{ color: C('on-surface-variant'), flex: '0 0 auto' }}>{n.d}</span>
          </div>
        ))}
      </MdCard>

      <div className="md-body-small" style={{ color: C('on-surface-variant'), textAlign: 'center', marginTop: 18 }}>2nd-Brain · 버전 0.9.2 (rev2)</div>
    </ScreenPad>
  );
}

/* ===================== 사용 매뉴얼 ===================== */
function ManualScreen({ t, go }) {
  const C = window.SB.C;
  const concepts = [
    { icon: 'auto_awesome', title: '별 = 삶의 영역', body: '북두칠성 7별은 커리어·재정·성장·관계·건강·휴식·담아내기예요. 별을 눌러 그 영역의 나를 봐요.' },
    { icon: 'workspaces', title: '북극성 = 나의 종합', body: '7별을 모아 정체성 한 문장으로 비춰요. 별이 고르게 밝아질수록 또렷해져요.' },
    { icon: 'bubble_chart', title: '별빛 ≠ 확신', body: '별빛은 얼마나 담았는지, 확신은 얼마나 검증됐는지. 모르면 모른다고 말해요.' },
    { icon: 'task_alt', title: '비준(propose→ratify)', body: '세컨비의 추정은 제안일 뿐이에요. "맞아요"로 비준한 것만 나에게 반영돼요.' },
    { icon: 'inbox', title: '담기', body: '글·링크·사진·음성·할 일을 흘려보내지 말고 담아요. 분류는 세컨비가 도와요.' },
    { icon: 'forum', title: '세컨비 3모드', body: '세컨비(나를 아는)·메타비(객관적)·트위비(창의적). 필요에 따라 바꿔 대화해요.' },
  ];
  return (
    <ScreenPad>
      <div style={{ display: 'flex', gap: 10, margin: '10px 0 6px' }}>
        <img src="assets/deepspace/secondb-head-front.png" alt="" style={{ width: 36, height: 36, flex: '0 0 auto' }} />
        <div className="md-body-medium" style={{ color: C('on-surface-variant'), wordBreak: 'keep-all', alignSelf: 'center' }}>
          처음이세요? 6가지만 알면 충분해요.
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        {concepts.map((c) => (
          <MdCard key={c.title} variant="filled" style={{ padding: 14 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: C('secondary-container'), color: C('on-secondary-container') }}>
                <Icon name={c.icon} size={21} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="md-title-small" style={{ color: C('on-surface') }}>{c.title}</div>
                <div className="md-body-small" style={{ color: C('on-surface-variant'), marginTop: 3, wordBreak: 'keep-all' }}>{c.body}</div>
              </div>
            </div>
          </MdCard>
        ))}
      </div>
      <MdButton variant="tonal" full icon="replay" style={{ marginTop: 16 }} onClick={() => { try { localStorage.removeItem('sb_coach'); } catch (e) {} go('home'); }}>홈에서 코치마크 다시 보기</MdButton>
    </ScreenPad>
  );
}

Object.assign(window, {
  PeerScreen, TriageScreen, ResearchScreen, PwResetScreen, ProfileSetupScreen,
  DobGateScreen, PermissionsScreen, PrivacyScreen, SupportScreen, ManualScreen, GapRow,
});
