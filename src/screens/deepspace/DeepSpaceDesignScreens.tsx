import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import Svg, { Circle, Line } from "react-native-svg";

import { colors, radius, spacing } from "@/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { SecondbHead, SecondbStatusHeader } from "@/components/deepspace";
import { useAuth } from "@/lib/auth/AuthContext";
import { deleteSource, listAllWikiLinks, listSources, listWikiPages } from "@/lib/wiki/queries";
import { generateSourcePage } from "@/lib/wiki/phase2";
import { deleteRecord, getRecordById, listRecentRecords } from "@/lib/records/create";
import type { SourceRow, WikiPageRow } from "@/lib/wiki/types";
import {
  buildDeepResearchView,
  buildDeepWikiView,
  buildDomainsView,
  recencyLabel,
  type WikiEdge,
} from "./wiki-graph-view";
import {
  buildRecordsTimeline,
  relatedByTag,
  RECORD_KIND_ICON,
  type TimelineRecord,
} from "./records-timeline";

type Row = { label: string; value?: string; onPress?: () => void; on?: boolean };

// Shared loader for the two graph-backed deep-space screens (/wiki + /research).
// Mirrors what the legacy /wiki loads: pages + the full edge set, both bounded.
// A links failure degrades to a zero-edge graph rather than blanking the screen.
function useWikiGraphData() {
  const { userId, loading: authLoading } = useAuth();
  const [pages, setPages] = useState<WikiPageRow[]>([]);
  const [edges, setEdges] = useState<WikiEdge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    Promise.all([
      listWikiPages(userId, { limit: 200 }),
      listAllWikiLinks(userId).catch(() => [] as WikiEdge[]),
    ])
      .then(([p, e]) => {
        if (!alive) return;
        setPages(p);
        setEdges(e);
      })
      .catch(() => {
        if (!alive) return;
        setPages([]);
        setEdges([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  return { userId, authLoading, pages, edges, loading };
}

function GraphLoading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.cyan} />
    </View>
  );
}

function Shell({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.stars}><View style={[styles.star,{left:"12%",top:42}]} /><View style={[styles.star,{right:"18%",top:118,opacity:.55}]} /><View style={[styles.star,{left:"42%",bottom:92,opacity:.5}]} /></View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {title ? <View style={styles.titleRow}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable><View><Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View></View> : null}
        {children}
      </ScrollView>
    </View>
  );
}

function Card({ children, style }: { children: ReactNode; style?: object }) { return <View style={[styles.card, style]}>{children}</View>; }
function Action({ label, value, onPress }: Row) { return <Pressable onPress={onPress} style={styles.action}><Text style={styles.actionLabel}>{label}</Text>{value ? <Text style={styles.actionValue}>{value}</Text> : <Text style={styles.chev}>›</Text>}</Pressable>; }
function Toggle({ label, value, on = true }: Row) { return <View style={styles.action}><View><Text style={styles.actionLabel}>{label}</Text>{value ? <Text style={styles.actionValue}>{value}</Text> : null}</View><View style={[styles.toggle,on&&styles.toggleOn]}><View style={[styles.knob,on&&styles.knobOn]} /></View></View>; }

export function DeepSpaceGraphDesignScreen() {
  const clusters = [
    { x: 63, y: 135, t: "기록" }, { x: 136, y: 92, t: "관계" }, { x: 219, y: 134, t: "지식" }, { x: 106, y: 226, t: "취향" }, { x: 207, y: 225, t: "성장" },
  ];
  return <Shell title="내 두뇌 지도" subtitle="노드 128개 · 연결 342개"><SecondbStatusHeader text="지금은 기록과 지식 군집이 강하게 연결되어 있어요." tip="군집을 누르면 관련 조각만 가볍게 볼 수 있어요." /><Card style={styles.graphCard}><Svg width="100%" height={310} viewBox="0 0 300 310"><Circle cx={150} cy={160} r={34} fill={colors.soul} opacity={.95}/>{clusters.map((c,i)=><Line key={'l'+i} x1={150} y1={160} x2={c.x} y2={c.y} stroke={colors.borderHi} strokeWidth={1.4}/>) }{clusters.map((c,i)=><Circle key={'c'+i} cx={c.x} cy={c.y} r={22} fill={colors.cyan} opacity={.22}/>) }<Circle cx={150} cy={160} r={9} fill={colors.textHi}/>{[42,86,118,244,257,188,72].map((x,i)=><Circle key={i} cx={x} cy={70+i*30%190} r={4} fill={colors.cyanSoft} opacity={.75}/>)}</Svg><Text style={styles.centerCaption}>나</Text>{clusters.map((c)=><Text key={c.t} style={[styles.clusterLabel,{left:c.x-18,top:c.y+23}]}>{c.t}</Text>)}</Card><View style={styles.ctaRow}><Pressable style={styles.primary} onPress={() => router.push('/records')}><Text style={styles.primaryText}>군집 보기</Text></Pressable><Pressable style={styles.secondary} onPress={() => router.push('/research')}><Text style={styles.secondaryText}>연결 찾기</Text></Pressable></View></Shell>;
}

export function DeepSpaceIntegrationsScreen() { return <Shell title="다른 앱 연동"><SecondbStatusHeader text="외부 앱은 가져오기 전에 항상 네가 확인해요." tip="자동 저장보다 확인 후 저장이 더 안전해요." /><Card><Text style={styles.section}>AI 비서 연결</Text>{['ChatGPT','Claude','Gemini'].map((x)=><Action key={x} label={x} value="연결 대기" />)}</Card><Card><Text style={styles.section}>담기 소스</Text><Toggle label="Notion" value="페이지와 데이터베이스" /><Toggle label="Obsidian" value="로컬 마크다운" on={false} /><Toggle label="건강 · 캘린더" value="권한 필요" on={false} /></Card><Text style={styles.footer}>연동 데이터는 가져오기 전에 검토하고, 언제든 끊을 수 있어요.</Text></Shell>; }

export function DeepSpaceSupportDesignScreen() { return <Shell title="지원 · 문의"><View style={styles.center}><SecondbHead size={104} mood="positive" /><Text style={styles.prompt}>무엇을 도와드릴까요?</Text></View><Card>{[{label:'세컨비에게 묻기',onPress:()=>router.push('/secondb')},{label:'매뉴얼 보기',onPress:()=>router.push('/manual')},{label:'이메일 문의',onPress:()=>Linking.openURL('mailto:support@2nd-brain.app')},{label:'버그 신고',onPress:()=>Linking.openURL('mailto:support@2nd-brain.app?subject=Bug%20report')}].map((r)=><Action key={r.label} {...r}/>)}</Card><Text style={styles.footer}>2nd-Brain v1.0.0 · 2 business days KST</Text></Shell>; }

export function DeepSpaceAccountDesignScreen() { return <Shell title="계정"><SecondbStatusHeader text="계정 정보는 네가 소유하고, 필요한 것만 연결해요." tip="삭제와 내보내기는 언제든 직접 시작할 수 있어요." /><View style={styles.center}><View style={styles.avatar}><SecondbHead size={72} mood="neutral" /></View><Text style={styles.prompt}>Simon Kim</Text><Text style={styles.footer}>2026.06 가입 · Free plan</Text></View><Card>{[['이름','Simon Kim'],['이메일','simon@example.com'],['비밀번호','변경'],['연결 계정','Google'],['언어','한국어']].map(([label,value])=><Action key={label} label={label} value={value}/>)}</Card><Pressable style={styles.danger}><Text style={styles.dangerText}>계정 삭제</Text></Pressable></Shell>; }

export function DeepSpacePrivacyDesignScreen() { return <Shell title="개인정보"><SecondbStatusHeader text="기록은 자기 이해를 돕기 위해서만 사용돼요." tip="민감한 선택은 항상 먼저 보여주고 확인해요." /><Text style={styles.lead}>내 데이터 사용 범위를 직접 조정하세요.</Text><Card><Toggle label="자기 이해 분석에 기록 사용" value="켜짐" /><Toggle label="제품 개선 익명 통계" value="꺼짐" on={false} /><Toggle label="앱 잠금 (생체인증)" value="켜짐" /></Card><Card><Action label="개인정보 처리방침" value="보기"/><Action label="데이터 처리 기록" value="최근 7일"/><Action label="제3자 제공" value="0건"/></Card><Text style={styles.footer}>기본값은 로컬 우선입니다. 외부 전송은 확인 후 진행돼요.</Text></Shell>; }

export function DeepSpaceSignInDesignScreen() { return <Shell><View style={styles.authHero}><SecondbHead size={132} mood="positive"/><Text style={styles.big}>2nd-Brain</Text><Text style={styles.lead}>AI 시대 가장 가치있는 자산, 나 자신을 축적하세요.</Text></View><Card><TextInput placeholder="email@example.com" placeholderTextColor={colors.textLo} style={styles.input}/><TextInput placeholder="password" placeholderTextColor={colors.textLo} secureTextEntry style={styles.input}/><Pressable style={styles.primary}><Text style={styles.primaryText}>로그인</Text></Pressable><Pressable onPress={()=>router.push('/sign-up')}><Text style={styles.link}>계정 만들기</Text></Pressable></Card></Shell>; }

export function DeepSpaceSignUpDesignScreen() { return <Shell><View style={styles.authHero}><SecondbHead size={120} mood="neutral"/><Text style={styles.big}>시작하기</Text><Text style={styles.lead}>첫 조각부터 북극성을 함께 밝혀요.</Text></View><Card>{['이메일','비밀번호','출생연도'].map((p)=><TextInput key={p} placeholder={p} placeholderTextColor={colors.textLo} style={styles.input}/>) }<Pressable style={styles.primary}><Text style={styles.primaryText}>가입하기</Text></Pressable></Card></Shell>; }

export function DeepSpaceResetPasswordDesignScreen() { return <Shell title="비밀번호 재설정"><View style={styles.center}><Text style={styles.mail}>✉</Text><Text style={styles.prompt}>메일을 확인해 주세요</Text><Text style={styles.footer}>6자리 인증 코드를 입력하면 다시 설정할 수 있어요.</Text></View><View style={styles.codeRow}>{['','', '', '', '', ''].map((_,i)=><View key={i} style={styles.codeCell}/>)}</View><Text style={styles.footer}>재전송 00:42</Text><Pressable style={styles.primary}><Text style={styles.primaryText}>확인</Text></Pressable></Shell>; }

export function DeepSpaceInsightsScreen() {
  return (
    <Shell title="인사이트">
      <SecondbStatusHeader text="지난주보다 이번주, 더 많이 담았어요." tip="가장 많이 담은 주제를 눌러 흐름을 보세요." mood="positive" />
      <Card>
        <Text style={styles.section}>요즘의 나</Text>
        <Text style={styles.lead}>지난주보다 이번주의 나는</Text>
        <Text style={styles.footer}>담은 조각 · 주간</Text>
        <View style={styles.compareRow}>
          <View style={styles.compareCol}><Text style={styles.compareNum}>18</Text><Text style={styles.compareCap}>지난주</Text></View>
          <Text style={styles.chev}>›</Text>
          <View style={styles.compareCol}><Text style={[styles.compareNum, styles.compareNumHi]}>31</Text><Text style={styles.compareCap}>이번주</Text></View>
        </View>
        <Text style={styles.delta}>▲ 72% 더 많이 담았어요</Text>
      </Card>
      <Card>
        <Text style={styles.section}>이번 주 핵심 발견</Text>
        <Text style={styles.lead}>'만드는 일' 관련 기록이 절반을 넘었어요. 미래의 나와 같은 방향이에요.</Text>
      </Card>
    </Shell>
  );
}

export function DeepSpaceDataDesignScreen() {
  return (
    <Shell title="내 데이터" subtitle="무엇이 쌓였고, 어디에 쓰이는지">
      <SecondbStatusHeader text="네 데이터가 어디에 있고 어떻게 쓰이는지 보여줘요." tip="민감한 데이터는 기기 안에만 둘 수 있어요." />
      <View style={styles.statRow}>
        <View style={styles.statBox}><Text style={styles.statNum}>412</Text><Text style={styles.statCap}>담은 조각</Text></View>
        <View style={styles.statBox}><Text style={styles.statNum}>7</Text><Text style={styles.statCap}>완료한 검사</Text></View>
      </View>
      <Card>
        <Text style={styles.section}>저장 위치</Text>
        <Action label="기기 내 (민감 데이터)" value="암호화" />
        <Action label="클라우드 동기화" value="켜짐" />
      </Card>
      <Card>
        <Action label="전체 데이터 내보내기" />
        <Action label="모든 데이터 삭제" />
      </Card>
    </Shell>
  );
}

export function DeepSpaceThemeScreen() {
  return (
    <Shell title="테마 · 글꼴">
      <SecondbStatusHeader text="보기 편한 테마와 글꼴을 골라요." tip="모션을 줄이면 화면이 더 차분해져요." />
      <Card>
        <Text style={styles.section}>테마</Text>
        <Action label="딥스페이스" value="✓" />
        <Action label="미드나잇" />
      </Card>
      <Card>
        <Text style={styles.section}>글꼴</Text>
        <Action label="픽셀 · Galmuri" value="✓" />
        <Action label="읽기 편한 · Pretendard" />
      </Card>
      <Card>
        <Text style={styles.section}>글자 크기</Text>
        <View style={styles.sizeRow}>
          <Text style={styles.sizeCap}>작게</Text>
          <View style={styles.sizeTrack}><View style={styles.sizeKnob} /></View>
          <Text style={styles.sizeCapLg}>크게</Text>
        </View>
        <Toggle label="모션 줄이기" on={false} />
      </Card>
    </Shell>
  );
}

export function DeepSpaceManualScreen() {
  return (
    <Shell title="매뉴얼 · 도움말">
      <SecondbStatusHeader text="궁금한 걸 빠르게 찾아봐요." tip="찾는 게 없으면 세컨비에게 바로 물어보세요." />
      <View style={styles.searchBox}><Text style={styles.searchText}>무엇이 궁금하세요?</Text></View>
      <Card>
        <Text style={styles.section}>시작하기</Text>
        <Action label="북두칠성 7별은 무엇인가요?" />
        <Action label="북극성(소울코어)은 어떻게 밝아지나요?" />
        <Action label="검사 결과는 어떻게 정확해지나요?" />
      </Card>
      <Card>
        <Text style={styles.section}>데이터 · 프라이버시</Text>
        <Action label="IDEN 파일은 무엇인가요?" />
        <Action label="내 데이터는 어디에 저장되나요?" />
        <Action label="세컨비에게 직접 물어보기" onPress={() => router.push('/secondb')} />
      </Card>
    </Shell>
  );
}

export function DeepSpacePlansScreen() {
  return (
    <Shell title="요금제">
      <SecondbStatusHeader text="'나'를 더 깊이 쌓고 싶다면 Pro가 도와요." tip="무료로도 매일 담고 7별을 한 번씩 켤 수 있어요." mood="positive" />
      <Card style={styles.planPro}>
        <View style={styles.planHead}><Text style={styles.planName}>Pro</Text><Text style={styles.planBadge}>추천</Text></View>
        <Text style={styles.planPrice}>₩9,900 <Text style={styles.planPer}>/ 월</Text></Text>
        {["무제한 검사 · 반복 정합성","세컨비 무제한 대화 · 공상","IDEN 전체 내보내기","트렌드·점검 제안"].map((x) => <Text key={x} style={styles.planFeat}>✦ {x}</Text>)}
      </Card>
      <Card>
        <View style={styles.planHead}><Text style={styles.planName}>Free</Text><Text style={styles.footer}>현재 이용 중</Text></View>
        <Text style={styles.planFeatDim}>기본 담기 · 7별 1회 검사 · 세컨비 일 5회</Text>
      </Card>
      <Pressable style={styles.primary}><Text style={styles.primaryText}>Pro 시작하기</Text></Pressable>
    </Shell>
  );
}

export function DeepSpacePermissionsScreen() {
  return (
    <Shell title="권한">
      <SecondbStatusHeader text="더 잘 담으려면 필요한 권한만 요청해요." tip="언제든 끌 수 있어요." />
      <Card>
        <Toggle label="알림" value="담기 리마인드 · 점검 제안" />
        <Toggle label="사진 · 카메라" value="사진으로 담기" on={false} />
        <Toggle label="마이크" value="음성으로 담기" on={false} />
      </Card>
      <Pressable style={styles.primary}><Text style={styles.primaryText}>계속</Text></Pressable>
    </Shell>
  );
}

export function DeepSpaceDiscoverScreen() {
  return (
    <Shell title="트렌드">
      <SecondbStatusHeader text="요즘 너의 관심이 향하는 다음 한 걸음." tip="제안을 누르면 관련 검사나 기록으로 이어져요." mood="positive" />
      <Text style={styles.lead}>요즘 너의 관심이 향하는 다음 한 걸음</Text>
      <Card>
        <View style={styles.trendHead}><Text style={styles.section}>자기이해 도구</Text><Text style={styles.delta}>▲ 관심 +32%</Text></View>
        <Text style={styles.planFeatDim}>최근 3주간 가장 자주 담은 주제. 관련 검사 애착(ECR-S)를 해볼까요?</Text>
      </Card>
      <Card>
        <View style={styles.trendHead}><Text style={styles.section}>아침 루틴</Text><Text style={styles.delta}>▲ 관심 +18%</Text></View>
        <Text style={styles.planFeatDim}>기분이 좋은 날의 공통점. 리듬에 기록을 더 담아볼까요?</Text>
      </Card>
      <Text style={styles.footer}>데이터가 더 쌓이면 새로운 제안이 나타납니다.</Text>
    </Shell>
  );
}

export function DeepSpaceReviewScreen() {
  return (
    <Shell title="점검">
      <SecondbStatusHeader text="내가 달라졌다면 별자리도 함께 점검해요." tip="승인해야만 반영돼요." />
      <Text style={styles.lead}>내가 달라졌다면 별자리도 함께 점검</Text>
      <Card>
        <Text style={styles.section}>세컨비의 제안</Text>
        <Text style={styles.planFeatDim}>최근 기록을 보면 외향성이 올라간 것 같아요. 별 밝기를 올릴까요?</Text>
        <View style={styles.compareRow}>
          <View style={styles.compareCol}><Text style={styles.compareCap}>지금</Text><Text style={styles.compareNum}>61</Text></View>
          <Text style={styles.chev}>›</Text>
          <View style={styles.compareCol}><Text style={styles.compareCap}>제안</Text><Text style={[styles.compareNum, styles.compareNumHi]}>68</Text></View>
        </View>
        <Text style={styles.footer}>근거 기록 5건</Text>
      </Card>
      <Text style={styles.footer}>승인해야만 반영됩니다 · 모든 제안은 기록에 남습니다</Text>
      <View style={styles.ctaRow}>
        <Pressable style={styles.secondary}><Text style={styles.secondaryText}>보류</Text></Pressable>
        <Pressable style={styles.primary}><Text style={styles.primaryText}>승인</Text></Pressable>
      </View>
    </Shell>
  );
}

function FilterChip({ label, active, violet, onPress }: { label: string; active?: boolean; violet?: boolean; onPress?: () => void }) {
  const inner = (
    <Text style={[styles.fchipText, active && styles.fchipTextActive, violet && styles.fchipTextViolet]}>{label}</Text>
  );
  const chipStyle = [styles.fchip, active && styles.fchipActive, violet && styles.fchipViolet];
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={chipStyle}
        accessibilityRole="button"
        accessibilityState={{ selected: !!active }}
        accessibilityLabel={label}
      >
        {inner}
      </Pressable>
    );
  }
  return <View style={chipStyle}>{inner}</View>;
}

function TimelineRow({ icon, title, time, tag, dim }: { icon: string; title: string; time?: string; tag?: string; dim?: boolean }) {
  return (
    <View style={{ gap: 5 }}>
      <View style={styles.tlRow}>
        <View style={[styles.tlDot, dim && styles.tlDotDim]} />
        <Text style={styles.tlIcon}>{icon}</Text>
        <Text style={[styles.tlTitle, dim && styles.tlTitleDim]} numberOfLines={1}>{title}</Text>
        {time ? <Text style={styles.tlTime}>{time}</Text> : null}
      </View>
      {tag ? <View style={styles.tlTagRow}><Text style={styles.tlTag}>{tag}</Text></View> : null}
    </View>
  );
}

const RECORD_KIND_FILTERS: { id: TimelineRecord["kind"] | null; label: string }[] = [
  { id: null, label: "전체" },
  { id: "journal", label: "일기" },
  { id: "note", label: "메모" },
  { id: "audit_response", label: "점검" },
];

export function DeepSpaceRecordsScreen() {
  const { userId, loading: authLoading } = useAuth();
  const [records, setRecords] = useState<TimelineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<TimelineRecord["kind"] | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    listRecentRecords(userId)
      .then((rows) => {
        if (alive) setRecords(rows as TimelineRecord[]);
      })
      .catch(() => {
        if (alive) setRecords([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const groups = useMemo(() => {
    const filtered = kind === null ? records : records.filter((r) => r.kind === kind);
    return buildRecordsTimeline(filtered);
  }, [records, kind]);

  if (authLoading) {
    return <Shell title="기록 보관소"><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const total = records.length;
  return (
    <Shell title="기록 보관소">
      <SecondbStatusHeader
        text={total > 0 ? `지금까지 담은 조각 ${total}개예요.` : "아직 담은 조각이 없어요."}
        tip="타입이나 시점으로 좁혀 보세요."
      />
      <Text style={styles.lead}>담은 모든 것이 하나의 시간으로</Text>
      <View style={styles.filterRow}>
        {RECORD_KIND_FILTERS.map((f) => (
          <FilterChip
            key={f.label}
            label={f.label}
            active={kind === f.id}
            onPress={() => setKind(f.id)}
          />
        ))}
      </View>
      {loading ? (
        <GraphLoading />
      ) : groups.length === 0 ? (
        <View style={styles.wikiPageOpen}>
          <Text style={styles.wikiBody}>
            {kind === null
              ? "보관소가 비어 있어요. 오늘의 조각을 담으면 하나의 시간으로 모여요."
              : "이 타입의 기록이 아직 없어요."}
          </Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text style={styles.primaryText}>+ 조각 담기</Text>
          </Pressable>
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.label}>
            <Text style={styles.tlLabel}>{g.label}</Text>
            <View style={styles.tlGroup}>
              {g.items.map((it) => (
                <TimelineRow key={it.id} icon={it.icon} title={it.title} time={it.timeLabel || undefined} tag={it.tag} dim={it.dim} />
              ))}
            </View>
          </View>
        ))
      )}
    </Shell>
  );
}

const SOURCE_KIND_ICON: Record<string, string> = {
  inbox: "✎",
  article: "🔗",
  video: "🎬",
  paper: "📄",
  reddit: "💬",
  code: "⌨",
  ai_tool: "🤖",
  self_knowledge: "🪞",
};

function sourceTitle(s: SourceRow): string {
  const t = s.title?.trim();
  return t && t.length > 0 ? t : "제목 없는 조각";
}

export function DeepSpaceInboxScreen() {
  const { userId, loading: authLoading } = useAuth();
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useMemo(
    () => async (uid: string) => {
      const rows = await listSources(uid, { ingested: false, limit: 50 });
      setSources(rows);
    },
    [],
  );

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    load(userId)
      .catch(() => {
        if (alive) setSources([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId, load]);

  async function promote(s: SourceRow) {
    if (!userId) return;
    setBusyId(s.id);
    try {
      await generateSourcePage(userId, s.id);
      await load(userId);
    } catch {
      // best-effort; the row stays in the queue to retry
    } finally {
      setBusyId(null);
    }
  }

  async function discard(s: SourceRow) {
    if (!userId) return;
    setBusyId(s.id);
    try {
      await deleteSource(userId, s.id);
      await load(userId);
    } catch {
      // best-effort
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading) {
    return <Shell title="정리함"><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const pending = sources.length;
  const [current, ...queue] = sources;

  return (
    <Shell title="정리함">
      <SecondbStatusHeader
        text={pending > 0 ? `정리 안 된 조각 ${pending}개가 기다려요.` : "정리할 조각이 없어요. 깔끔해요."}
        tip="한 개씩 보내면 금방 비워져요."
      />
      {loading ? (
        <GraphLoading />
      ) : pending === 0 ? (
        <View style={styles.wikiPageOpen}>
          <Text style={styles.wikiBody}>모두 정리됐어요. 새 조각을 담으면 여기로 와요.</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text style={styles.primaryText}>+ 조각 담기</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.lead}>남은 {pending}개만 비우면 끝나요</Text>
          <Card style={styles.triageCard}>
            <View style={styles.triageMeta}>
              <Text style={styles.tlIcon}>{SOURCE_KIND_ICON[current.kind] ?? "•"}</Text>
              <Text style={styles.metaLabel}>{current.kind}</Text>
            </View>
            <Text style={styles.triageBody} numberOfLines={3}>{sourceTitle(current)}</Text>
            {current.tags.length > 0 ? (
              <View style={styles.filterRow}>
                {current.tags.slice(0, 4).map((tag) => (
                  <FilterChip key={tag} label={`#${tag}`} active />
                ))}
              </View>
            ) : null}
            <View style={styles.ctaRow}>
              <Pressable
                style={styles.iconBtn}
                onPress={() => void discard(current)}
                disabled={busyId !== null}
                accessibilityRole="button"
                accessibilityLabel="이 조각 버리기"
              >
                <Text style={styles.iconBtnText}>🗑</Text>
              </Pressable>
              <Pressable
                style={styles.primary}
                onPress={() => void promote(current)}
                disabled={busyId !== null}
                accessibilityRole="button"
                accessibilityLabel="이 조각 보관하기"
              >
                <Text style={styles.primaryText}>{busyId === current.id ? "보관 중…" : "보관하기"}</Text>
              </Pressable>
            </View>
          </Card>
          {queue.length > 0 ? (
            <>
              <Text style={styles.tlLabel}>다음 차례</Text>
              <View style={{ gap: 7 }}>
                {queue.slice(0, 8).map((s, i) => (
                  <View key={s.id} style={[styles.queueItem, i > 0 && styles.queueItemDim]}>
                    <Text style={styles.tlIcon}>{SOURCE_KIND_ICON[s.kind] ?? "•"}</Text>
                    <Text style={styles.queueText} numberOfLines={1}>{sourceTitle(s)}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
    </Shell>
  );
}

// Fixed satellite slots around the central god-node; we light up as many as
// there are real hubs (capped at 4). STEP 3 will replace this with true
// clusters — for now it honestly mirrors the top-cited pages.
const RESEARCH_SAT = [
  { cx: 70, cy: 40, r: 5, fill: colors.cyan, stroke: colors.borderHi },
  { cx: 200, cy: 38, r: 4, fill: colors.cyanDim, stroke: colors.borderHi },
  { cx: 95, cy: 92, r: 4, fill: colors.soul, stroke: colors.soulLine },
  { cx: 185, cy: 90, r: 4, fill: colors.cyanDim, stroke: colors.border },
] as const;

export function DeepSpaceResearchScreen() {
  const { userId, authLoading, pages, edges, loading } = useWikiGraphData();
  const view = useMemo(() => buildDeepResearchView(pages, edges), [pages, edges]);

  if (authLoading) {
    return <Shell title="연결 찾기"><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const satellites = RESEARCH_SAT.slice(0, Math.max(1, Math.min(view.hubs.length, 4)));
  const headerText =
    view.headline !== null
      ? `흩어진 기록 사이에서 ${view.edgeCount}개의 연결을 찾았어요.`
      : "기록이 쌓이면 사이의 연결을 찾아 보여드려요.";

  return (
    <Shell title="연결 찾기">
      <SecondbStatusHeader text={headerText} tip="태그를 누르면 군집이 보여요." mood="positive" />
      <Text style={styles.lead}>흩어진 기록이 이렇게 이어져요</Text>
      {loading ? (
        <GraphLoading />
      ) : view.pageCount === 0 ? (
        <View style={styles.insightViolet}>
          <Text style={styles.insightVioletText}>아직 이어줄 기록이 없어요. 오늘의 조각을 담으면 여기서 연결을 그려드려요.</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text style={styles.primaryText}>+ 조각 담기</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {view.clusters.length > 0 ? (
            <View style={styles.filterRow}>
              {view.clusters.map((c, i) => (
                <FilterChip key={c.tag} label={`${c.tag} · ${c.count}`} violet={i === 0} />
              ))}
            </View>
          ) : null}
          <View style={styles.researchGraph}>
            <Svg width="100%" height={118} viewBox="0 0 260 118">
              {satellites.map((s, i) => (
                <Line key={`l${i}`} x1={135} y1={62} x2={s.cx} y2={s.cy} stroke={s.stroke} strokeWidth={1} />
              ))}
              {satellites.map((s, i) => (
                <Circle key={`c${i}`} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} />
              ))}
              <Circle cx={135} cy={62} r={8} fill={colors.textTitle} />
            </Svg>
            <Text style={styles.graphTag}>
              {view.clusters.length > 0 ? `${view.clusters[0].tag} 군집` : "지식 군집"}
            </Text>
          </View>
          {view.headline !== null ? (
            <View style={styles.insightViolet}>
              <Text style={styles.insightVioletText}>
                가장 많이 이어진 지식은 ‘{view.headline.title}’예요. 여러 기록이 이 한 점으로 모여요.
              </Text>
              <View style={styles.evRow}>
                <Text style={styles.evChip}>📎 페이지 {view.pageCount}</Text>
                <Text style={styles.evChip}>연결 {view.headline.inDegree}</Text>
                {view.orphanCount > 0 ? <Text style={styles.evChip}>외딴 조각 {view.orphanCount}</Text> : null}
              </View>
            </View>
          ) : (
            <View style={styles.insightViolet}>
              <Text style={styles.insightVioletText}>조각은 쌓였지만 아직 서로 이어지지 않았어요. 더 담으면 연결이 자라나요.</Text>
            </View>
          )}
          {view.surprise !== null ? (
            <View style={styles.insightViolet}>
              <Text style={styles.insightVioletText}>
                뜻밖의 연결을 찾았어요. ‘{view.surprise.fromTitle}’과(와) ‘{view.surprise.toTitle}’이(가) 서로 다른 주제인데 이어져 있어요.
              </Text>
              <View style={styles.evRow}>
                <Text style={styles.evChip}>지식 군집 {view.islandCount}</Text>
              </View>
            </View>
          ) : null}
        </>
      )}
    </Shell>
  );
}

export function DeepSpaceFormatsScreen() {
  // TODO: wire format selection + scope toggles to the export pipeline. Dummy from records-archive.dc.html.
  return (
    <Shell title="내보내기 형식">
      <SecondbStatusHeader text="너의 정체성을 어디로든 가져갈 수 있어요." tip="형식을 고르고 범위를 정하세요." />
      <Text style={styles.lead}>나를 어디로든 가져가요</Text>
      <View style={styles.formatGrid}>
        <View style={[styles.formatCard, styles.formatCardSel]}><Text style={[styles.formatName, styles.formatNameSel]}>.iden</Text><Text style={styles.formatDesc}>포터블 정체성 파일</Text></View>
        <View style={styles.formatCard}><Text style={styles.formatName}>Markdown</Text><Text style={styles.formatDesc}>Obsidian 친화</Text></View>
        <View style={styles.formatCard}><Text style={styles.formatName}>JSON</Text><Text style={styles.formatDesc}>개발자 · API</Text></View>
        <View style={styles.formatCard}><Text style={styles.formatName}>PDF</Text><Text style={styles.formatDesc}>읽기 · 인쇄용</Text></View>
      </View>
      <Text style={styles.tlLabel}>포함 범위</Text>
      <Card>
        <Toggle label="성격 · 애착 모델" on />
        <Toggle label="회상 · 내러티브" on />
        <Toggle label="기록 원문 248개" on={false} />
      </Card>
      <Pressable style={styles.soulPrimary}><Text style={styles.primaryText}>.iden 내보내기</Text></Pressable>
    </Shell>
  );
}

export function DeepSpaceImportScreen() {
  // TODO: wire external connectors + review-before-import. Dummy from records-archive.dc.html.
  return (
    <Shell title="외부 가져오기">
      <SecondbStatusHeader text="다른 앱의 기록도 불러올 수 있어요." tip="가져오기 전 항상 네가 확인해요." />
      <Text style={styles.lead}>다른 곳의 기록도 한 곳으로</Text>
      <View style={{ gap: 8 }}>
        <View style={styles.sourceRow}><Text style={styles.tlIcon}>🗒</Text><View style={{ flex: 1 }}><Text style={styles.sourceName}>Notion</Text><Text style={styles.sourceDesc}>페이지 · 데이터베이스</Text></View><Text style={styles.sourceCta}>연결</Text></View>
        <View style={styles.sourceRow}><Text style={styles.tlIcon}>🔮</Text><View style={{ flex: 1 }}><Text style={styles.sourceName}>Obsidian</Text><Text style={styles.sourceDesc}>마크다운 볼트</Text></View><Text style={styles.sourceCta}>연결</Text></View>
        <View style={[styles.sourceRow, styles.sourceRowDim]}><Text style={styles.tlIcon}>❤</Text><View style={{ flex: 1 }}><Text style={styles.sourceNameDim}>건강</Text><Text style={styles.sourceDesc}>수면 · 활동</Text></View><Text style={styles.sourceSoon}>준비 중</Text></View>
      </View>
      <Card>
        <Text style={styles.reviewLabel}>가져오기 전 검토</Text>
        <View style={styles.mapRow}><Text style={styles.mapFrom}>Notion 제목</Text><Text style={styles.mapArrow}>→</Text><Text style={styles.mapTo}>기록 제목</Text></View>
        <View style={styles.mapRow}><Text style={styles.mapFrom}>태그</Text><Text style={styles.mapArrow}>→</Text><Text style={styles.mapTo}>자동 태그</Text></View>
        <View style={styles.mapRow}><Text style={styles.mapFrom}>생성일</Text><Text style={styles.mapArrow}>→</Text><Text style={styles.mapTo}>담은 시점</Text></View>
        <Text style={styles.footerLeft}>42개 항목을 가져와요. 네 승인 없이는 아무것도 반영되지 않아요.</Text>
      </Card>
      <View style={styles.ctaRow}>
        <Pressable style={styles.secondary}><Text style={styles.secondaryText}>취소</Text></Pressable>
        <Pressable style={[styles.primary, styles.primaryWide]}><Text style={styles.primaryText}>42개 가져오기</Text></Pressable>
      </View>
    </Shell>
  );
}

interface DetailRecord {
  id: string;
  kind: string;
  body: string | null;
  topic: string | null;
  summary: string | null;
  conclusion: string | null;
  tags: string[] | null;
  created_at: string;
}

const RECORD_KIND_KO: Record<string, string> = {
  journal: "일기",
  note: "메모",
  audit_response: "점검",
};

function recordTitle(r: DetailRecord): string {
  const s = r.summary?.trim() || r.topic?.trim();
  if (s) return s;
  const body = r.body?.trim();
  if (body) {
    const line = body.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
    if (line) return line;
  }
  return "기록";
}

export function DeepSpaceRecordDetailScreen() {
  const { userId, loading: authLoading } = useAuth();
  const params = useLocalSearchParams();
  const idParam = params.id;
  const recordId = Array.isArray(idParam) ? idParam[0] : idParam;

  const [record, setRecord] = useState<DetailRecord | null>(null);
  const [all, setAll] = useState<TimelineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!userId || !recordId) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    Promise.all([getRecordById(userId, recordId), listRecentRecords(userId)])
      .then(([r, rows]) => {
        if (!alive) return;
        setRecord((r as DetailRecord) ?? null);
        setAll(rows as TimelineRecord[]);
      })
      .catch(() => {
        if (alive) setRecord(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId, recordId]);

  async function handleDelete() {
    if (!userId || !record) return;
    setDeleting(true);
    try {
      await deleteRecord(userId, record.id);
      router.back();
    } catch {
      setDeleting(false);
    }
  }

  if (authLoading) {
    return <Shell title="기록 상세"><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  if (loading) {
    return <Shell title="기록 상세"><GraphLoading /></Shell>;
  }
  if (record === null) {
    return (
      <Shell title="기록 상세">
        <View style={styles.wikiPageOpen}>
          <Text style={styles.wikiBody}>기록을 찾을 수 없어요. 보관소로 돌아가 다시 열어보세요.</Text>
          <Pressable style={styles.primary} onPress={() => router.replace("/records")}>
            <Text style={styles.primaryText}>보관소로</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  const related = relatedByTag(record.id, record.tags, all);
  const kindLabel = RECORD_KIND_KO[record.kind] ?? "기록";
  const kindIcon = RECORD_KIND_ICON[record.kind] ?? "•";

  return (
    <Shell title="기록 상세">
      <SecondbStatusHeader
        text={related.length > 0 ? `이 조각은 ${related.length}개의 기록과 이어져 있어요.` : "이 조각을 천천히 다시 볼까요?"}
        tip="같은 태그의 기록으로 이어져요."
      />
      <View style={styles.recMetaRow}>
        <Text style={styles.recMetaType}>{kindIcon} {kindLabel}</Text>
        <Text style={styles.recMetaDot}>·</Text>
        <Text style={styles.recMeta}>{recencyLabel(record.created_at) || "기록"}</Text>
        <Text style={styles.recMetaDot}>·</Text>
        <Text style={styles.recMeta}>직접 작성</Text>
      </View>
      <Text style={styles.recTitle}>{recordTitle(record)}</Text>
      {record.body && record.body.trim().length > 0 ? (
        <View style={styles.recBody}>
          <Text style={styles.recBodyText}>{record.body}</Text>
        </View>
      ) : null}
      {record.tags && record.tags.length > 0 ? (
        <View style={styles.filterRow}>
          {record.tags.slice(0, 5).map((tag) => (
            <FilterChip key={tag} label={`#${tag}`} active />
          ))}
        </View>
      ) : null}
      {record.conclusion && record.conclusion.trim().length > 0 ? (
        <View style={styles.insightViolet}>
          <Text style={styles.insightVioletText}>{record.conclusion}</Text>
        </View>
      ) : null}
      {related.length > 0 ? (
        <>
          <Text style={styles.tlLabel}>연결된 기록</Text>
          <View style={styles.tlGroup}>
            {related.map((r) => (
              <TimelineRow
                key={r.id}
                icon={RECORD_KIND_ICON[r.kind] ?? "•"}
                title={recordTitle(r as DetailRecord)}
                time={recencyLabel(r.created_at) || undefined}
                dim
              />
            ))}
          </View>
        </>
      ) : null}
      <View style={styles.ctaRow}>
        <Pressable style={styles.secondary} onPress={() => router.push("/capture")}>
          <Text style={styles.secondaryText}>새 기록</Text>
        </Pressable>
        <Pressable
          style={[styles.iconBtn, styles.iconBtnDanger]}
          onPress={() => void handleDelete()}
          disabled={deleting}
          accessibilityRole="button"
          accessibilityLabel="이 기록 삭제"
        >
          <Text style={styles.iconBtnText}>🗑</Text>
        </Pressable>
      </View>
    </Shell>
  );
}

export function DeepSpaceOpsScreen() {
  // TODO: wire domain selection + recommendations + calendar/share hand-off. Dummy from ops-wiki.dc.html.
  return (
    <Shell title="루틴">
      <SecondbStatusHeader text="오늘은 어떤 영역을 챙겨볼까요?" tip="받은 걸음은 캘린더로 보낼 수 있어요." />
      <Text style={styles.lead}>내 기록에서 뽑은 다음 한 걸음</Text>
      <View style={styles.filterRow}>
        <FilterChip label="건강" active />
        <FilterChip label="배움" />
        <FilterChip label="관계" />
        <FilterChip label="재정" />
      </View>
      <View style={styles.opsStep}>
        <View style={styles.opsStepHead}>
          <Text style={styles.opsStepTitle}>아침 산책 15분</Text>
          <Text style={styles.timeChipMint}>내일 아침</Text>
        </View>
        <Text style={styles.opsReason}>기분이 좋았던 날의 80%에 아침 산책 기록이 있었어요.</Text>
        <View style={styles.opsStepFoot}>
          <Text style={styles.evChip}>📎 기록 6건</Text>
          <Pressable style={styles.smallBtn}><Text style={styles.smallBtnText}>캘린더에 추가</Text></Pressable>
        </View>
      </View>
      <View style={styles.opsStep}>
        <View style={styles.opsStepHead}>
          <Text style={styles.opsStepTitle}>자기 전 스트레칭</Text>
          <Text style={styles.timeChipCyan}>밤 11시</Text>
        </View>
        <Text style={styles.opsReason}>늦게 잔 날 다음날 집중이 떨어진다고 자주 적었어요.</Text>
        <View style={styles.opsStepFoot}>
          <Text style={styles.evChip}>📎 기록 4건</Text>
          <Pressable style={styles.smallBtnGhost}><Text style={styles.smallBtnGhostText}>캘린더에 추가</Text></Pressable>
        </View>
      </View>
      <Pressable style={styles.primary}><Text style={styles.primaryText}>받은 걸음 캘린더로 보내기</Text></Pressable>
    </Shell>
  );
}

export function DeepSpaceWikiScreen() {
  const { userId, authLoading, pages, edges, loading } = useWikiGraphData();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const view = useMemo(() => buildDeepWikiView(pages, edges, { activeTag }), [pages, edges, activeTag]);

  if (authLoading) {
    return <Shell title="지식"><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const headerText =
    view.pageCount > 0
      ? `지금까지 ${view.pageCount}개의 지식이 자라고 있어요.`
      : "아직 지식이 비어 있어요. 오늘의 조각을 담아볼까요?";
  const [first, ...rest] = view.pages;

  return (
    <Shell title="지식">
      <SecondbStatusHeader text={headerText} tip="태그로 좁혀 보세요." mood="positive" />
      <View style={styles.wikiStatRow}>
        <View style={styles.wikiStat}><Text style={styles.wikiStatNum}>{view.pageCount}</Text><Text style={styles.wikiStatCap}>페이지</Text></View>
        <View style={styles.wikiStat}><Text style={[styles.wikiStatNum, styles.wikiStatNumCyan]}>{view.edgeCount}</Text><Text style={styles.wikiStatCap}>연결</Text></View>
      </View>
      {view.tagChips.length > 0 ? (
        <View style={styles.filterRow}>
          <FilterChip label="전체" active={activeTag === null} onPress={() => setActiveTag(null)} />
          {view.tagChips.map((c) => (
            <FilterChip
              key={c.tag}
              label={c.tag}
              active={activeTag === c.tag}
              onPress={() => setActiveTag((prev) => (prev === c.tag ? null : c.tag))}
            />
          ))}
        </View>
      ) : null}
      {loading ? (
        <GraphLoading />
      ) : view.pages.length === 0 ? (
        <View style={styles.wikiPageOpen}>
          <Text style={styles.wikiBody}>
            {activeTag !== null
              ? "이 태그에 담긴 지식이 아직 없어요. 다른 태그를 눌러보거나 조각을 담아보세요."
              : "창고가 조용해요. 오늘의 조각이나 링크를 담으면 여기서 다시 만날 수 있어요."}
          </Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text style={styles.primaryText}>+ 조각 담기</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {first ? (
            <View style={styles.wikiPageOpen}>
              <View style={styles.wikiPageHead}>
                <Text style={styles.wikiPageTitle}>{first.title}</Text>
                <Text style={styles.wikiCaret}>⌄</Text>
              </View>
              {first.snippet.length > 0 ? (
                <Text style={styles.wikiBody}>{first.snippet}</Text>
              ) : null}
              <View style={styles.wikiBacklinkRow}>
                <Text style={styles.wikiBacklink}>↩ 연결된 기록 {first.connections}</Text>
                {first.tags[0] ? <Text style={styles.tlTag}>{first.tags[0]}</Text> : null}
              </View>
            </View>
          ) : null}
          {rest.map((p) => (
            <View key={p.id} style={styles.wikiPageRow}>
              <View style={styles.wikiRowHead}>
                <Text style={styles.wikiRowTitle} numberOfLines={1}>{p.title}</Text>
                <Text style={styles.wikiRowConn}>연결 {p.connections}</Text>
              </View>
              {p.snippet.length > 0 ? (
                <Text style={styles.wikiRowDesc} numberOfLines={1}>{p.snippet}</Text>
              ) : null}
            </View>
          ))}
        </>
      )}
    </Shell>
  );
}

export function DeepSpaceDomainsScreen() {
  const { userId, authLoading, pages, edges, loading } = useWikiGraphData();
  const view = useMemo(() => buildDomainsView(pages, edges), [pages, edges]);

  if (authLoading) {
    return <Shell title="내 영역"><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <Shell title="내 영역">
      <SecondbStatusHeader
        text={view.domains.length > 0 ? "네 영역이 이렇게 쌓이고 있어요." : "아직 영역이 비어 있어요."}
        tip="비어 있는 영역을 더 담아볼까요?"
      />
      <Text style={styles.lead}>네 영역을 한눈에</Text>
      {loading ? (
        <GraphLoading />
      ) : view.domains.length === 0 ? (
        <View style={styles.wikiPageOpen}>
          <Text style={styles.wikiBody}>조각에 태그가 붙으면 영역으로 모여요. 오늘의 조각을 담아보세요.</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text style={styles.primaryText}>+ 데이터 추가</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.formatGrid}>
            {view.domains.map((d, i) => {
              const active = i === 0;
              return (
                <View
                  key={d.tag}
                  style={[styles.domainCard, active && styles.domainCardActive, !d.recent && styles.domainCardDim]}
                >
                  <Text style={d.recent ? styles.domainName : styles.domainNameDim} numberOfLines={1}>{d.tag}</Text>
                  <View style={styles.domainNumRow}>
                    <Text style={[styles.domainNum, active && styles.domainNumActive, !d.recent && styles.domainNumDim]}>{d.count}</Text>
                    <Text style={styles.domainUnit}>조각</Text>
                  </View>
                  <Text style={styles.domainSub}>{recencyLabel(d.lastActivity) || "기록 없음"}</Text>
                </View>
              );
            })}
          </View>
          {view.topTopics !== null && view.topTopics.titles.length > 0 ? (
            <>
              <Text style={styles.tlLabel}>{view.topTopics.tag} · 핵심 주제</Text>
              <View style={styles.topicCol}>
                {view.topTopics.titles.map((title, i) => (
                  <View key={title} style={styles.topicRow}>
                    <View style={[styles.topicDot, i > 0 && styles.topicDotDim]} />
                    <Text style={i > 0 ? styles.topicTextDim : styles.topicText} numberOfLines={1}>{title}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text style={styles.primaryText}>+ 데이터 추가</Text>
          </Pressable>
        </>
      )}
    </Shell>
  );
}

const styles = StyleSheet.create({ root:{flex:1,backgroundColor:colors.bgDeep}, stars:{...StyleSheet.absoluteFill,overflow:'hidden'}, star:{position:'absolute',width:3,height:3,borderRadius:2,backgroundColor:colors.cyanSoft}, scroll:{padding:spacing.lg,paddingBottom:40,gap:spacing.md}, titleRow:{flexDirection:'row',alignItems:'center',gap:spacing.md,marginBottom:spacing.xs}, back:{color:colors.cyanSoft,fontSize:34,lineHeight:38,fontFamily:fontFamilies.pixelKo}, title:{color:colors.textTitle,fontSize:18,lineHeight:24,fontFamily:fontFamilies.pixelKo}, subtitle:{color:colors.textLo,fontSize:11,lineHeight:17,fontFamily:fontFamilies.readable}, card:{backgroundColor:colors.cardBg,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md,gap:spacing.sm}, graphCard:{height:332,overflow:'hidden'}, centerCaption:{position:'absolute',left:0,right:0,top:156,textAlign:'center',color:colors.bgDeep,fontFamily:fontFamilies.pixelKo,fontSize:11}, clusterLabel:{position:'absolute',color:colors.cyanSoft,fontFamily:fontFamilies.readable,fontSize:11}, ctaRow:{flexDirection:'row',gap:spacing.sm}, primary:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:colors.cyan,borderRadius:radius.md,paddingVertical:spacing.md}, primaryText:{color:colors.bgDeep,fontFamily:fontFamilies.pixelKo,fontSize:13}, secondary:{flex:1,alignItems:'center',justifyContent:'center',borderColor:colors.borderHi,borderWidth:1,borderRadius:radius.md,paddingVertical:spacing.md}, secondaryText:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:13}, section:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:13,marginBottom:spacing.xs}, action:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:colors.border,paddingVertical:spacing.sm}, actionLabel:{color:colors.textHi,fontFamily:fontFamilies.readable,fontSize:14}, actionValue:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:12}, chev:{color:colors.cyanSoft,fontSize:22}, toggle:{width:42,height:24,borderRadius:12,backgroundColor:colors.border,justifyContent:'center',padding:3}, toggleOn:{backgroundColor:colors.cyan}, knob:{width:18,height:18,borderRadius:9,backgroundColor:colors.textLo}, knobOn:{alignSelf:'flex-end',backgroundColor:colors.bgDeep}, footer:{color:colors.textLo,textAlign:'center',fontFamily:fontFamilies.readable,fontSize:12,lineHeight:18}, center:{alignItems:'center',gap:spacing.sm}, prompt:{color:colors.textHi,fontFamily:fontFamilies.pixelKo,fontSize:16,lineHeight:24,textAlign:'center'}, avatar:{width:92,height:92,borderRadius:46,borderWidth:1,borderColor:colors.borderHi,alignItems:'center',justifyContent:'center',backgroundColor:colors.cardBg}, danger:{alignSelf:'center',padding:spacing.md},dangerText:{color:colors.clay,fontFamily:fontFamilies.readable,fontSize:13}, lead:{color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:14,lineHeight:21,textAlign:'center'}, authHero:{alignItems:'center',paddingTop:32,gap:spacing.md}, big:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:24,lineHeight:32}, input:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,color:colors.textHi,fontFamily:fontFamilies.readable,backgroundColor:colors.bgDeep}, link:{color:colors.cyanSoft,textAlign:'center',fontFamily:fontFamilies.readable,paddingTop:spacing.sm}, mail:{fontSize:44,color:colors.cyanSoft}, codeRow:{flexDirection:'row',justifyContent:'center',gap:spacing.xs}, codeCell:{width:40,height:48,borderRadius:radius.sm,borderWidth:1,borderColor:colors.borderHi,backgroundColor:colors.cardBg}, pill:{borderWidth:1,borderColor:colors.border,borderRadius:radius.pill,paddingHorizontal:spacing.sm,paddingVertical:spacing.xs},pillText:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelEn,fontSize:8}, compareRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:spacing.lg,paddingVertical:spacing.sm}, compareCol:{alignItems:'center',gap:spacing.xs}, compareNum:{color:colors.textMid,fontFamily:fontFamilies.pixelKo,fontSize:30}, compareNumHi:{color:colors.cyan}, compareCap:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:11}, delta:{color:colors.mint,textAlign:'center',fontFamily:fontFamilies.readable,fontSize:13}, statRow:{flexDirection:'row',gap:spacing.sm}, statBox:{flex:1,alignItems:'center',gap:spacing.xs,backgroundColor:colors.cardBg,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,paddingVertical:spacing.md}, statNum:{color:colors.cyan,fontFamily:fontFamilies.pixelKo,fontSize:28}, statCap:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:11}, sizeRow:{flexDirection:'row',alignItems:'center',gap:spacing.sm}, sizeCap:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:12}, sizeCapLg:{color:colors.textHi,fontFamily:fontFamilies.readable,fontSize:18}, sizeTrack:{flex:1,height:4,borderRadius:2,backgroundColor:colors.border,justifyContent:'center'}, sizeKnob:{width:18,height:18,borderRadius:9,backgroundColor:colors.cyan,marginLeft:'46%'}, searchBox:{backgroundColor:colors.cardBg,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,paddingHorizontal:spacing.md,paddingVertical:spacing.md}, searchText:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:13}, planPro:{borderColor:colors.borderHi}, planHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, planName:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:15}, planBadge:{color:colors.bgDeep,backgroundColor:colors.cyan,fontFamily:fontFamilies.pixelEn,fontSize:8,paddingHorizontal:spacing.sm,paddingVertical:3,borderRadius:radius.sm,overflow:'hidden'}, planPrice:{color:colors.textHi,fontFamily:fontFamilies.pixelKo,fontSize:22,marginVertical:spacing.xs}, planPer:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:12}, planFeat:{color:colors.cyanSoft,fontFamily:fontFamilies.readable,fontSize:13,lineHeight:22}, planFeatDim:{color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:13,lineHeight:20}, trendHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, primaryWide:{flex:1.6}, filterRow:{flexDirection:'row',flexWrap:'wrap',gap:6}, fchip:{paddingVertical:6,paddingHorizontal:11,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm}, fchipActive:{borderColor:colors.cyan,backgroundColor:colors.cardBg}, fchipViolet:{borderColor:colors.soulLine,backgroundColor:colors.cardBg}, fchipText:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:11}, fchipTextActive:{color:colors.textTitle}, fchipTextViolet:{color:colors.soul}, tlLabel:{color:colors.cyanDim,fontFamily:fontFamilies.pixelEn,fontSize:7,letterSpacing:0.7,marginTop:spacing.sm}, tlGroup:{paddingLeft:16,borderLeftWidth:1,borderLeftColor:colors.border,gap:12,marginTop:spacing.xs}, tlRow:{flexDirection:'row',alignItems:'center',gap:9}, tlDot:{width:8,height:8,borderRadius:4,backgroundColor:colors.cyan}, tlDotDim:{backgroundColor:colors.cyanDim}, tlIcon:{fontSize:14}, tlTitle:{flex:1,color:colors.textTitle,fontFamily:fontFamilies.readable,fontSize:12.5}, tlTitleDim:{color:colors.textMid}, tlTime:{color:colors.cyanDim,fontFamily:fontFamilies.readable,fontSize:10}, tlTagRow:{flexDirection:'row',paddingLeft:32}, tlTag:{color:colors.cyanDim,fontFamily:fontFamilies.pixelEn,fontSize:5,letterSpacing:0.4,paddingHorizontal:6,paddingVertical:3,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm}, progressRow:{flexDirection:'row',alignItems:'center',gap:10}, progressTrack:{flex:1,height:6,borderRadius:3,backgroundColor:colors.border,overflow:'hidden'}, progressFill:{height:'100%',borderRadius:3,backgroundColor:colors.cyan}, progressLabel:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:11}, triageCard:{borderColor:colors.borderHi}, triageMeta:{flexDirection:'row',alignItems:'center',gap:9}, metaLabel:{color:colors.cyanDim,fontFamily:fontFamilies.pixelEn,fontSize:6,letterSpacing:0.5}, triageBody:{color:colors.textTitle,fontFamily:fontFamilies.readable,fontSize:13.5,lineHeight:21}, footerLeft:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:11,lineHeight:16}, iconBtn:{width:46,paddingVertical:11,borderWidth:1,borderColor:colors.borderHi,borderRadius:radius.md,alignItems:'center',backgroundColor:colors.bgDeep}, iconBtnText:{fontSize:15}, queueItem:{flexDirection:'row',alignItems:'center',gap:9,paddingVertical:9,paddingHorizontal:11,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm,backgroundColor:colors.cardBg}, queueItemDim:{opacity:0.6}, queueText:{flex:1,color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:12}, researchGraph:{height:118,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,backgroundColor:colors.bgDeep,overflow:'hidden',justifyContent:'center',alignItems:'center'}, graphTag:{position:'absolute',bottom:14,color:colors.textMid,fontFamily:fontFamilies.pixelKo,fontSize:10}, insightViolet:{borderWidth:1,borderColor:colors.soulLine,borderRadius:radius.lg,backgroundColor:colors.cardBg,padding:spacing.md,gap:spacing.sm}, insightVioletText:{color:colors.textTitle,fontFamily:fontFamilies.readable,fontSize:13,lineHeight:20}, evRow:{flexDirection:'row',gap:6}, evChip:{color:colors.cyanDim,fontFamily:fontFamilies.readable,fontSize:10,paddingHorizontal:8,paddingVertical:4,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm}, formatGrid:{flexDirection:'row',flexWrap:'wrap',gap:9}, formatCard:{width:'47%',padding:13,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,gap:4}, formatCardSel:{borderColor:colors.soulLine}, formatName:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:13}, formatNameSel:{color:colors.soul}, formatDesc:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:10.5,lineHeight:15}, soulPrimary:{alignItems:'center',justifyContent:'center',backgroundColor:colors.soul,borderRadius:radius.md,paddingVertical:spacing.md}, sourceRow:{flexDirection:'row',alignItems:'center',gap:11,paddingVertical:11,paddingHorizontal:13,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg}, sourceRowDim:{opacity:0.7}, sourceName:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:13}, sourceNameDim:{color:colors.textMid,fontFamily:fontFamilies.pixelKo,fontSize:13}, sourceDesc:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:10}, sourceCta:{color:colors.cyan,fontFamily:fontFamilies.pixelKo,fontSize:11}, sourceSoon:{color:colors.cyanDim,fontFamily:fontFamilies.readable,fontSize:10}, reviewLabel:{color:colors.cyanBright,fontFamily:fontFamilies.pixelEn,fontSize:7,letterSpacing:0.7,marginBottom:spacing.xs}, mapRow:{flexDirection:'row',alignItems:'center',gap:8}, mapFrom:{color:colors.cyanSoft,fontFamily:fontFamilies.readable,fontSize:12}, mapArrow:{color:colors.cyanDim,fontFamily:fontFamilies.readable,fontSize:12}, mapTo:{color:colors.textTitle,fontFamily:fontFamilies.readable,fontSize:12}, recMetaRow:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'}, recMetaType:{color:colors.cyanSoft,fontFamily:fontFamilies.readable,fontSize:11}, recMetaDot:{color:colors.textLo,fontSize:11}, recMeta:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:11}, recTitle:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:17,lineHeight:24}, recBody:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,padding:spacing.md}, recBodyText:{color:colors.textHi,fontFamily:fontFamilies.readable,fontSize:12.5,lineHeight:20}, iconBtnDanger:{borderColor:colors.clay}, opsStep:{borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,backgroundColor:colors.cardBg,padding:spacing.md,gap:spacing.sm}, opsStepHead:{flexDirection:'row',alignItems:'flex-start',gap:spacing.sm}, opsStepTitle:{flex:1,color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:13.5,lineHeight:19}, timeChipMint:{color:colors.mint,fontFamily:fontFamilies.readable,fontSize:10,borderWidth:1,borderColor:colors.mint,borderRadius:radius.sm,paddingHorizontal:8,paddingVertical:3,overflow:'hidden'}, timeChipCyan:{color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:10,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm,paddingHorizontal:8,paddingVertical:3,overflow:'hidden'}, opsReason:{color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:11.5,lineHeight:17}, opsStepFoot:{flexDirection:'row',alignItems:'center',gap:spacing.sm}, smallBtn:{marginLeft:'auto',backgroundColor:colors.cyan,borderRadius:radius.sm,paddingHorizontal:12,paddingVertical:7}, smallBtnText:{color:colors.bgDeep,fontFamily:fontFamilies.pixelKo,fontSize:11}, smallBtnGhost:{marginLeft:'auto',borderWidth:1,borderColor:colors.borderHi,borderRadius:radius.sm,paddingHorizontal:12,paddingVertical:7}, smallBtnGhostText:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:11}, wikiStatRow:{flexDirection:'row',gap:spacing.sm}, wikiStat:{flex:1,flexDirection:'row',alignItems:'baseline',gap:6,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,paddingHorizontal:13,paddingVertical:11}, wikiStatNum:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:20}, wikiStatNumCyan:{color:colors.cyan}, wikiStatCap:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:10.5}, wikiPageOpen:{borderWidth:1,borderColor:colors.borderHi,borderRadius:radius.lg,backgroundColor:colors.cardBg,padding:spacing.md,gap:spacing.sm}, wikiPageHead:{flexDirection:'row',alignItems:'center',gap:7}, wikiPageTitle:{flex:1,color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:13.5}, wikiCaret:{color:colors.cyanDim,fontSize:14}, wikiBody:{color:colors.textHi,fontFamily:fontFamilies.readable,fontSize:11.5,lineHeight:18}, wikiBacklinkRow:{flexDirection:'row',gap:6,flexWrap:'wrap',alignItems:'center'}, wikiBacklink:{color:colors.cyanSoft,fontFamily:fontFamilies.readable,fontSize:9.5,borderWidth:1,borderColor:colors.soulLine,borderRadius:radius.sm,paddingHorizontal:8,paddingVertical:4,overflow:'hidden'}, wikiPageRow:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,paddingHorizontal:13,paddingVertical:11,gap:5}, wikiRowHead:{flexDirection:'row',alignItems:'center',gap:7}, wikiRowTitle:{flex:1,color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:13}, wikiRowConn:{color:colors.cyanDim,fontFamily:fontFamilies.readable,fontSize:9.5}, wikiRowDesc:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:11}, domainCard:{width:'47%',padding:14,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,gap:8}, domainCardActive:{borderColor:colors.cyan}, domainCardDim:{borderStyle:'dashed',borderColor:colors.borderHi,opacity:0.65}, domainName:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:14}, domainNameDim:{color:colors.textMid,fontFamily:fontFamilies.pixelKo,fontSize:14}, domainNumRow:{flexDirection:'row',alignItems:'baseline',gap:5}, domainNum:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:22}, domainNumActive:{color:colors.cyan}, domainNumDim:{color:colors.textLo}, domainUnit:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:10}, domainSub:{color:colors.cyanDim,fontFamily:fontFamilies.readable,fontSize:9.5}, topicCol:{gap:8}, topicRow:{flexDirection:'row',alignItems:'center',gap:9,paddingVertical:10,paddingHorizontal:13,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg}, topicDot:{width:6,height:6,borderRadius:3,backgroundColor:colors.cyan}, topicDotDim:{backgroundColor:colors.cyanDim}, topicText:{flex:1,color:colors.textTitle,fontFamily:fontFamilies.readable,fontSize:12.5}, topicTextDim:{flex:1,color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:12.5}});
