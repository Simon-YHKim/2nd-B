import type { ReactNode } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import Svg, { Circle, Line } from "react-native-svg";

import { colors, radius, spacing } from "@/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { SecondbHead, SecondbStatusHeader } from "@/components/deepspace";

type Row = { label: string; value?: string; onPress?: () => void; on?: boolean };

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

const styles = StyleSheet.create({ root:{flex:1,backgroundColor:colors.bgDeep}, stars:{...StyleSheet.absoluteFill,overflow:'hidden'}, star:{position:'absolute',width:3,height:3,borderRadius:2,backgroundColor:colors.cyanSoft}, scroll:{padding:spacing.lg,paddingBottom:40,gap:spacing.md}, titleRow:{flexDirection:'row',alignItems:'center',gap:spacing.md,marginBottom:spacing.xs}, back:{color:colors.cyanSoft,fontSize:34,lineHeight:38,fontFamily:fontFamilies.pixelKo}, title:{color:colors.textTitle,fontSize:18,lineHeight:24,fontFamily:fontFamilies.pixelKo}, subtitle:{color:colors.textLo,fontSize:11,lineHeight:17,fontFamily:fontFamilies.readable}, card:{backgroundColor:colors.cardBg,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md,gap:spacing.sm}, graphCard:{height:332,overflow:'hidden'}, centerCaption:{position:'absolute',left:0,right:0,top:156,textAlign:'center',color:colors.bgDeep,fontFamily:fontFamilies.pixelKo,fontSize:11}, clusterLabel:{position:'absolute',color:colors.cyanSoft,fontFamily:fontFamilies.readable,fontSize:11}, ctaRow:{flexDirection:'row',gap:spacing.sm}, primary:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:colors.cyan,borderRadius:radius.md,paddingVertical:spacing.md}, primaryText:{color:colors.bgDeep,fontFamily:fontFamilies.pixelKo,fontSize:13}, secondary:{flex:1,alignItems:'center',justifyContent:'center',borderColor:colors.borderHi,borderWidth:1,borderRadius:radius.md,paddingVertical:spacing.md}, secondaryText:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:13}, section:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:13,marginBottom:spacing.xs}, action:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:colors.border,paddingVertical:spacing.sm}, actionLabel:{color:colors.textHi,fontFamily:fontFamilies.readable,fontSize:14}, actionValue:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:12}, chev:{color:colors.cyanSoft,fontSize:22}, toggle:{width:42,height:24,borderRadius:12,backgroundColor:colors.border,justifyContent:'center',padding:3}, toggleOn:{backgroundColor:colors.cyan}, knob:{width:18,height:18,borderRadius:9,backgroundColor:colors.textLo}, knobOn:{alignSelf:'flex-end',backgroundColor:colors.bgDeep}, footer:{color:colors.textLo,textAlign:'center',fontFamily:fontFamilies.readable,fontSize:12,lineHeight:18}, center:{alignItems:'center',gap:spacing.sm}, prompt:{color:colors.textHi,fontFamily:fontFamilies.pixelKo,fontSize:16,lineHeight:24,textAlign:'center'}, avatar:{width:92,height:92,borderRadius:46,borderWidth:1,borderColor:colors.borderHi,alignItems:'center',justifyContent:'center',backgroundColor:colors.cardBg}, danger:{alignSelf:'center',padding:spacing.md},dangerText:{color:colors.clay,fontFamily:fontFamilies.readable,fontSize:13}, lead:{color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:14,lineHeight:21,textAlign:'center'}, authHero:{alignItems:'center',paddingTop:32,gap:spacing.md}, big:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:24,lineHeight:32}, input:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,color:colors.textHi,fontFamily:fontFamilies.readable,backgroundColor:colors.bgDeep}, link:{color:colors.cyanSoft,textAlign:'center',fontFamily:fontFamilies.readable,paddingTop:spacing.sm}, mail:{fontSize:44,color:colors.cyanSoft}, codeRow:{flexDirection:'row',justifyContent:'center',gap:spacing.xs}, codeCell:{width:40,height:48,borderRadius:radius.sm,borderWidth:1,borderColor:colors.borderHi,backgroundColor:colors.cardBg}, pill:{borderWidth:1,borderColor:colors.border,borderRadius:radius.pill,paddingHorizontal:spacing.sm,paddingVertical:spacing.xs},pillText:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelEn,fontSize:8}, compareRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:spacing.lg,paddingVertical:spacing.sm}, compareCol:{alignItems:'center',gap:spacing.xs}, compareNum:{color:colors.textMid,fontFamily:fontFamilies.pixelKo,fontSize:30}, compareNumHi:{color:colors.cyan}, compareCap:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:11}, delta:{color:colors.mint,textAlign:'center',fontFamily:fontFamilies.readable,fontSize:13}, statRow:{flexDirection:'row',gap:spacing.sm}, statBox:{flex:1,alignItems:'center',gap:spacing.xs,backgroundColor:colors.cardBg,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,paddingVertical:spacing.md}, statNum:{color:colors.cyan,fontFamily:fontFamilies.pixelKo,fontSize:28}, statCap:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:11}});
