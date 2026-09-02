# 개인정보처리방침 · Privacy Policy

_시행일: 2026-09-02 · 최종 개정: 2026-09-02_

---

## 한국어

하양 프로덕션(개인사업자, 대표: 배소하, 소재지: 경기도 안양시, 이하 "회사")는 「개인정보 보호법」 등 관련 법령을 준수하며, 다음과 같이 개인정보를 처리합니다.

### 1. 수집하는 개인정보 항목
- **필수(계정)**: 이메일 주소, 소셜 로그인 식별자(Google/Apple/Kakao/Naver 등), 인증 토큰.
- **연령 확인**: 생년월일 또는 연령대(연령 등급 확인 및 아동 보호 목적).
- **이용자 콘텐츠**: 이용자가 입력·생성한 성찰·기록 등 서비스 이용 데이터.
- **프로필(선택)**: 표시할 이름, 목표 문장. 가입 과정에서 선택적으로 입력하며, 비워 두어도 서비스 이용에 제한이 없습니다.
- **음성·오디오(선택)**: 이용자가 앱에서 녹음하거나 직접 고른 오디오 파일. **텍스트로 옮기는 목적으로만** 처리하며, 앱이 만든 임시 녹음 파일은 전사 직후 기기에서 삭제합니다(이용자가 고른 파일은 회사가 삭제하지 않습니다). 전사된 텍스트는 이용자 콘텐츠로 저장됩니다.
- **자동 수집**: 서비스 이용 기록, 기기·브라우저 정보, 접속 로그, 쿠키/로컬 저장소(웹).
- **결제 관련**: 결제는 Paddle이 처리하며, **회사는 카드번호 등 결제수단 전체 정보를 저장하지 않습니다.** 결제 상태·구독 정보 등 처리 결과만 수신합니다.
- **건강·활동 데이터(선택·민감정보)**: 걸음 수, 운동, 수면, 심박수. 성인 이용자가 앱에서 직접 연동을 켜고 OS 건강 연결(예: Health Connect)을 승인한 경우에만 읽어 **본인 계정에만** 저장합니다. 만 14세 미만 및 14-17세 미성년자에게는 이 기능이 잠겨 있어 수집하지 않습니다.

**민감정보 처리 고지**: 위 건강·활동 데이터는 「개인정보 보호법」상 **민감정보**로 별도 동의를 받아 처리합니다. 이 데이터는 앱 내 루틴 자동 완료 표시와 이용자 본인의 건강 기록 표시("오늘의 건강 기록") 목적으로만 쓰이며, **건강·활동 측정값은 어떠한 AI 제공자에게도 전송하지 않고 외부 제3자 제공이나 광고·판매에 사용하지 않습니다.** 이용자는 언제든 열람·내보내기·삭제할 수 있습니다.

### 2. 수집·이용 목적
회원 식별 및 계정 관리, 서비스 제공 및 개인화(AI 처리 포함), 음성·오디오의 텍스트 전사, 이용자 기록에 기반한 **자동화된 요약·정리·시각화**(제10조), 유료 구독 결제·정산, 고객지원, 서비스 개선 및 보안, 법령상 의무 이행.

### 3. 보유 및 이용 기간
① 원칙적으로 **회원 탈퇴 시 지체 없이 파기**합니다. ② 다만 관련 법령이 정한 기간 동안 보관합니다: **계약·청약철회 및 대금결제·재화공급 기록 5년, 소비자 불만·분쟁처리 기록 3년, 표시·광고 기록 6개월**(전자상거래법). 로그인 기록은 통신비밀보호법에 따라 3개월 이상 보관할 수 있습니다. ③ 위 기간 경과 또는 목적 달성 시 지체 없이 파기합니다.

### 4. 개인정보의 제3자 제공 및 처리위탁
회사는 서비스 제공을 위해 아래와 같이 개인정보 처리를 위탁하며, 수탁사는 목적 범위 내에서만 처리합니다:

| 수탁사 | 위탁 업무 | 비고 |
|---|---|---|
| Supabase (Supabase, Inc.) | 인증·데이터베이스 호스팅 및 Edge Functions 실행 | 계정·콘텐츠의 주 저장소는 대한민국(서울) 리전. Edge Functions는 현재 실행 리전이 고정되지 않아 호출자와 가까운 대한민국 또는 국외 리전에서 실행될 수 있음 |
| OpenAI OpCo, LLC (OpenAI API) | AI 처리(대화·분석·생성·음성 전사, 임베딩은 활성화된 경우) | 이용자가 해당 AI 기능을 사용할 때 |
| Anthropic PBC (Claude API) | AI 처리(페르소나 서술·종합, 교차 검증의 일부) | 이용자가 해당 AI 기능을 사용할 때 |
| Google (Gemini API, `@google/genai`) | AI 처리(구버전 앱 등) | 현재 새 빌드는 목적별 OpenAI·Anthropic 구성을 사용하고 자동 장애 전환은 꺼져 있음. 구버전 앱 또는 전용 벤더 설정이 주입되지 않은 빌드·런타임은 Gemini로 라우팅될 수 있음 |
| Functional Software, Inc. (dba Sentry) | 앱 오류·크래시 수집 및 분석 | Sentry를 초기화하는 기존 앱·실행 중 프로세스·새로고침되지 않은 웹 세션은 계속 전송할 수 있음. 세션 녹화는 사용하지 않음 |
| 소셜 로그인 제공자 (Google/Apple/Kakao/Naver 등) | 인증 | 이용자가 선택한 로그인 수단 |
| Google (Google Analytics 4) | 서비스 이용 통계(웹) | 이용자가 사용 통계에 동의한 경우에만. 기본값은 꺼짐 |
| Google (Firebase Analytics)·Microsoft (Microsoft Clarity) | 서비스 이용 통계(앱) | 현재 앱에서 비활성화되어 있어 수집하지 않습니다 |

**결제(독립 판매자)**: 유료 결제는 회사의 수탁사가 아니라 **판매자(Merchant of Record)인 Paddle**이 자기 책임으로 처리합니다. 결제 과정에서 Paddle은 이메일·국가·선택 상품·가격·통화·결제 상태 등의 거래 정보를 수집하고, 회사는 결제 결과와 구독 상태를 계정에 연결하기 위한 내부 계정 식별자(user_id)를 custom data로 제공합니다. 적용되는 Paddle 법인은 Paddle.com Market Limited(영국) 또는 Paddle.com Inc.(미국)이며, Paddle의 개인정보처리방침이 함께 적용됩니다.

### 5. 개인정보의 국외 이전
Supabase Edge Functions와 OpenAI·Anthropic 등 서비스 제공에 필요한 일부 수탁사는 국외에서 개인정보를 처리할 수 있습니다. 회사는 이 필수 국외 처리위탁을 「개인정보 보호법」 제28조의8 제1항 제3호에 해당하는 것으로 보고 이 방침으로 고지합니다. 가입 화면에서 필수 국외 처리 항목을 확인하지 않으면 가입을 완료할 수 없습니다. 가입 후 앞으로의 서비스 이용과 국외 처리를 중단하려면 계정 삭제를 요청할 수 있습니다. 사용 통계와 유료 결제처럼 이용자가 선택하는 처리의 거부 효과는 아래 각 항목에 따릅니다.

**데이터 저장·서버 실행(Supabase)**: 계정·콘텐츠의 주 데이터베이스와 인증 정보는 Supabase, Inc.(미국)가 제공하는 대한민국(서울) 리전에 저장됩니다. 회사가 호출하는 Supabase Edge Functions는 현재 실행 리전을 고정하지 않았으므로, 서비스 요청이 호출자와 가까운 대한민국 또는 국외 리전에서 실행될 수 있습니다. 이 방침 시행일 현재 Supabase가 지원하는 국외 Edge 실행 국가는 일본·인도·싱가포르·호주·캐나다·미국·브라질·아일랜드·영국·프랑스·독일·스위스입니다. 이 과정에서 제1조의 계정 정보·이용자 콘텐츠·프로필·건강 및 활동 데이터 중 해당 기능에 필요한 내용, 관련 기록·이미지·음성 및 요청 메타데이터가 서비스 이용 시 TLS로 전송되어 인증, 요청 중계·처리, AI 처리·음성 전사·임베딩, 계정·결제 관리, 보안 및 운영 목적으로 처리될 수 있습니다. Edge gateway와 Functions는 네트워크 및 함수 요청 메타데이터 로그를 생성합니다. 계정·콘텐츠의 보유기간은 제3조와 같습니다. 이 방침 시행일 현재 프로젝트는 Free 요금제를 사용하며, Supabase API·함수 로그의 보유기간은 1일입니다(문의: privacy@supabase.com). 이 필수 처리를 확인하지 않으면 가입을 완료할 수 없습니다.

**AI 처리**: AI 기능을 이용할 때 이용자가 해당 기능에 제공한 콘텐츠가 OpenAI OpCo, LLC(미국, 문의: privacy@openai.com)의 OpenAI API로 TLS 전송되어 분석·생성·음성 전사 등에 처리되며, 임베딩(기록 검색 색인) 기능이 서버에서 활성화된 경우에는 임베딩 생성에도 처리됩니다. 일부 AI 기능(페르소나 서술·종합, 교차 검증의 일부)은 Anthropic PBC(미국, 문의: privacy@anthropic.com)의 Claude API로 전송되어 처리될 수 있습니다. 현재 새 빌드는 목적별 구성에 따라 OpenAI 또는 Anthropic을 사용하고 자동 장애 전환은 비활성화되어 있습니다. 다만 구버전 앱 또는 전용 벤더 설정이 주입되지 않은 빌드·런타임의 AI 요청은 Google의 Gemini API로 라우팅될 수 있습니다(Google 개인정보 문의: policies.google.com/privacy). 건강·활동 측정값은 어떤 AI 제공자에게도 전송하지 않습니다.

각 사의 공개 정책 기준(각 사 정책 변경에 따라 달라질 수 있음): OpenAI API 입력·출력은 이용자가 별도로 데이터 공유를 선택하지 않는 한 모델 학습에 사용되지 않으며, 적용 대상 API의 남용 감시 로그는 기본적으로 최대 30일 보관되고 법률상 의무 또는 서비스·제3자 보호를 위해 더 오래 보관될 수 있습니다. 현재 OpenAI 음성 전사 API는 남용 감시 로그와 애플리케이션 상태를 보관하지 않습니다. Anthropic API의 입력·출력은 기본적으로 수신·생성 후 30일 이내 삭제되며, 별도 보관 기능 사용·별도 합의·정책 집행 또는 법률상 의무가 있는 경우는 예외입니다. Gemini API의 처리·보존은 실제 프로젝트에 적용된 서비스 등급·ZDR·기능 설정과 Google 약관에 따라 달라질 수 있습니다. 과거 프로젝트의 계약 법인·서비스 등급·ZDR 및 정확한 적용 보유 기준은 운영 확인 전이므로 이 방침에서 단정하지 않습니다.

**오류·크래시 수집(Sentry)**: Sentry 비활성화 변경이 실제 배포된 이후의 새 JS 번들은 Sentry를 초기화하지 않습니다. 다만 그보다 이전 앱 버전, 업데이트 후 아직 재시작하지 않은 앱, 새로고침하지 않은 웹 세션은 오류·크래시 정보(스택 추적, 앱 버전, 기기·운영체제·브라우저 정보, 발생 시각 포함)를 Functional Software, Inc.(dba Sentry, 미국)로 계속 TLS 전송할 수 있습니다. 목적은 오류 진단과 서비스 안정성 확인입니다. 전송 당시 기본 개인정보 전송은 비활성화되어 있었고 웹에서는 주소·요청 정보를 제거했으며 세션 녹화는 사용하지 않았습니다. 수집된 이벤트는 회사 Sentry 프로젝트 설정과 적용 약관에 따른 기간 동안 보관되며, 정확한 계정 설정 기간은 운영 확인 전 단정하지 않습니다. 이후 전송을 원하지 않으면 앱을 업데이트한 뒤 재시작하거나 웹페이지를 새로고침할 수 있으며, 이렇게 해도 핵심 서비스 이용에는 제한이 없습니다. 잔존 이벤트 문의·삭제 요청은 kim0405@hayangzip.com, Sentry 개인정보 문의는 compliance@sentry.io로 할 수 있습니다.

**사용 통계**: 웹의 사용 통계(Google Analytics 4)는 **성인 이용자가 설정에서 켠 경우에만** Google LLC(미국)로 이전됩니다. 이전 항목은 화면 이동·조작 기록, 기기·브라우저 정보, 가명 클라이언트·기기 식별자, 쿠키·로컬 저장소 식별자, 대략적 위치 및 수집 시점에 사용되는 IP 주소이며 기록 본문·대화 내용은 포함하지 않습니다. 이전 목적은 서비스 이용 통계 확인, 시점·방법은 해당 화면을 볼 때 암호화(TLS)된 네트워크 전송, 보유기간은 계정에 설정된 기간(사용자·이벤트 수준 데이터 기준 최대 14개월)을 따르되 **표준 집계 보고서는 이 보존 설정의 적용을 받지 않습니다**. 이 이전은 「개인정보 보호법」 제28조의8 제1항 제1호에 따라 **이용자의 별도 동의**를 근거로 하며, 설정에서 끄면 이후 전송이 중단됩니다. 사용 통계에 동의하지 않아도 서비스를 이용하는 데 제한이 없습니다. 앱의 사용 통계 도구(Firebase Analytics·Microsoft Clarity)는 **현재 비활성화되어 있어 수집·이전하지 않으며**, 활성화하는 경우 본 방침을 갱신하여 고지합니다(참고: Microsoft Clarity의 공개 보존 기준은 일반 녹화 30일, 즐겨찾기·표본 녹화와 히트맵 등 집계 최대 9개월).

**결제(Paddle)**: 유료 결제를 선택하면 이메일·국가·선택 상품·가격·통화·결제 상태 등의 거래 정보와 결제 결과를 계정에 연결하기 위한 내부 계정 식별자(user_id)가 적용되는 판매자(Merchant of Record)인 Paddle.com Market Limited(영국) 또는 Paddle.com Inc.(미국)로 TLS 전송됩니다. 목적은 결제·환불·세금 처리와 거래·구독 상태의 계정 연결입니다. user_id는 Paddle transaction의 custom data로 저장되며, 구독과 이후 갱신·변경 거래에 복사될 수 있습니다. Paddle은 거래 자료를 관계가 지속되는 기간과 적용 법령상 허용·요구되는 기간, 관련 청구·조사·분쟁 기간 동안 보관합니다(문의: privacy@paddle.com). 이 처리를 거부하면 유료 결제와 구독 상태의 계정 연결을 완료할 수 없지만 무료 기능은 계속 이용할 수 있습니다.

### 6. 정보주체의 권리
이용자(및 법정대리인)는 언제든 개인정보 **열람·정정·삭제·처리정지**를 요구할 수 있습니다. 서비스는 앱 내에서 **계정 삭제 및 데이터 내보내기** 기능을 제공하며, kim0405@hayangzip.com 으로도 요청할 수 있습니다.

### 7. 만 14세 미만 아동
회사는 원칙적으로 만 14세 미만 아동의 개인정보를 수집하지 않으며, 불가피한 경우 법정대리인의 동의를 확인한 후에만 처리합니다(단계적 적용).

### 8. 안전성 확보 조치
행 수준 접근통제(RLS)를 포함한 접근권한 관리, 전송 구간 TLS 암호화 및 저장 데이터 암호화, 접속기록 보관, 정기 점검 등 관리적·기술적 보호조치를 시행합니다.

### 9. 개인정보 보호책임자 및 문의
- 개인정보 보호책임자: 김양환, 연락처 kim0405@hayangzip.com
- 문의: kim0405@hayangzip.com (영업일 기준 2일 이내 회신 목표)
- 권익침해 상담: 개인정보분쟁조정위원회, 개인정보침해신고센터(privacy.kisa.or.kr) 등.

### 10. 자동화된 처리에 관한 안내
① 서비스는 이용자가 남긴 기록을 바탕으로 **자동으로** 요약을 만들고, 영역별 기록량을 밝기 단계(L1~L5)로 표시하며, 전체를 한 문장으로 모아 보여줍니다.
② **밝기와 단계는 이용자가 남긴 기록의 양과 종류를 세어 계산한 값이며, AI가 정하는 값이 아닙니다.** AI가 만드는 것은 문장이고, 숫자는 계산의 결과입니다.
③ 이 처리는 이용자 본인에게 보여주기 위한 것이며, **채용·신용·보험·자격 등 이용자의 권리나 의무에 법적 효력을 미치는 결정에 사용되지 않고, 제3자에게 제공되지도 않습니다.**
④ 이용자는 AI가 제안한 내용을 **승인하기 전까지 반영되지 않도록** 할 수 있고, 승인한 내용을 언제든 수정·삭제할 수 있으며, 설정에서 관련 기능을 끌 수 있습니다. 자동화된 처리에 대한 설명을 원하시면 kim0405@hayangzip.com 으로 요청하실 수 있습니다.

### 11. 처리방침의 변경
본 방침은 법령·서비스 변경에 따라 개정될 수 있으며, 개정 시 시행일·변경내용을 서비스 내 공지합니다. 변경 전후를 비교할 수 있도록 개정 이력을 아래 제12조에 남깁니다.

### 12. 개정 이력
| 시행일 | 변경 내용 |
|---|---|
| 2026-09-02 | 실제 처리 경로에 맞춰 제4조·제5조를 정비했습니다: OpenAI·Anthropic 및 조건부 Gemini 경로, Supabase 서울 주 저장소와 국내외 Edge Functions·1일 로그, Paddle의 user_id custom data, Sentry 구버전의 계속 전송 가능성, GA4의 가명 식별자·쿠키·위치·IP 항목, 필수 국외 처리의 가입 차단 효과를 명확히 했습니다. 건강·활동 측정값은 AI 제공자에게 전송하지 않는다고 명시했습니다. |
| 2026-08-30 | 제4조 수탁사에 Google Analytics 4·Microsoft Clarity 추가(이용자가 사용 통계에 동의한 경우에만 처리). 제5조에 두 수탁사의 국외 이전 고지 신설(별도 동의 근거·이전 항목·보유기간 명시). |
| 2026-08-16 | 최초 시행. |

---

## English

Hayang Production (sole proprietorship, Representative: Bae Soha; Anyang-si, Gyeonggi-do; the "Company") complies with Korea's Personal Information Protection Act (PIPA) and processes personal data as follows.

### 1. Personal data collected
- **Required (account)**: email address, social-login identifiers (Google/Apple/Kakao/Naver, etc.), authentication tokens.
- **Age check**: date of birth or age band (for age-tier verification and child protection).
- **User Content**: reflections/records and other usage data you input or generate.
- **Profile (optional)**: a display name and a goal sentence, entered optionally during sign-up. Leaving them blank does not limit the Service.
- **Voice/audio (optional)**: audio you record in the app or pick from your device. Processed **only to turn it into text**. Temporary recordings the app itself created are deleted from the device right after transcription; files you picked are never deleted by the Company. The resulting text is stored as User Content.
- **Automatically collected**: usage logs, device/browser info, access logs, cookies/local storage (web).
- **Payment-related**: payments are handled by Paddle; **the Company does not store full payment-instrument data (e.g., card numbers)**; it receives only processing results such as payment status and subscription info.
- **Health & activity data (optional, sensitive)**: steps, exercise, sleep, heart rate. Read only when an adult user turns on the integration in-app and approves the OS health connection (e.g., Health Connect), and stored **only in your own account**. The feature is locked for users under 14 and for 14-17 minors, so no data is collected from them.

**Sensitive-data notice**: the health and activity data above is **sensitive data** under Korea's PIPA and is processed with separate consent. It is used only for in-app routine auto-completion and to show your own health records ("Today's health records"); **health and activity measurements are not sent to any AI provider, shared with external third parties, or used for advertising or sale.** You may view, export, or delete it at any time.

### 2. Purposes
Member identification and account management; service provision and personalization (including AI processing); transcription of voice/audio into text; **automated summarization, organization, and visualization** based on your records (Section 10); paid-subscription billing/settlement; customer support; service improvement and security; compliance with legal obligations.

### 3. Retention
(1) In principle, data is **destroyed without delay upon account closure**. (2) Certain records are retained for statutory periods: **contract/withdrawal and payment/supply records 5 years, consumer complaint/dispute records 3 years, ad/display records 6 months** (Korean e-commerce law); access logs may be kept 3+ months (Protection of Communications Secrets Act). (3) Data is destroyed without delay once the period lapses or the purpose is fulfilled.

### 4. Third-party sharing & processing entrustment
The Company entrusts processing as below; processors act only within the stated purpose:

| Processor | Function | Notes |
|---|---|---|
| Supabase (Supabase, Inc.) | Authentication, database hosting, and Edge Functions | Primary account and User Content storage is in Seoul, South Korea. Edge Functions are not currently region-pinned and may run in South Korea or an overseas region close to the caller |
| OpenAI OpCo, LLC (OpenAI API) | AI processing (chat, analysis, generation, voice transcription; embeddings when enabled) | When you use the relevant AI feature |
| Anthropic PBC (Claude API) | AI processing (persona narrative/synthesis, part of cross-checking) | When you use the relevant AI feature |
| Google (Gemini API, `@google/genai`) | AI processing (older app versions, etc.) | Current new builds use purpose-specific OpenAI or Anthropic routing with automatic failover disabled. Older app versions or builds or runtimes without the dedicated vendor settings may route to Gemini |
| Functional Software, Inc. (dba Sentry) | App error and crash reporting and analysis | Existing apps that initialize Sentry, running processes, and web sessions that have not refreshed may continue to transmit. No session replay |
| Social-login providers (Google/Apple/Kakao/Naver, etc.) | Authentication | Login method you choose |
| Google (Google Analytics 4) | Service usage statistics (web) | Only if you turn usage statistics on. Off by default |
| Google (Firebase Analytics) and Microsoft (Microsoft Clarity) | Service usage statistics (app) | Currently disabled in the app; nothing is collected |

**Payments (independent seller)**: paid purchases are processed by **Paddle as the Merchant of Record** on its own responsibility, rather than as a processor of the Company. During checkout, Paddle collects transaction data such as email, country, selected product, price, currency, and payment status, and the Company provides an internal account identifier (user_id) as custom data to link the payment result and subscription status to the account. The applicable Paddle entity is Paddle.com Market Limited (United Kingdom) or Paddle.com Inc. (United States), and Paddle's privacy policy also applies.

### 5. Overseas transfer
Some processors needed to provide the Service, including Supabase Edge Functions, OpenAI, and Anthropic, may process personal data abroad. The Company treats this essential overseas processing entrustment as falling under Article 28-8(1)3 of Korea's PIPA and discloses it through this policy. If you do not acknowledge the required overseas processing at sign-up, you cannot complete sign-up. After sign-up, you may request account deletion to stop future use of the Service and future overseas processing. The effects of declining user-selected processing, such as usage statistics and paid purchases, are described below.

**Data storage and server execution (Supabase)**: the primary database for account data and User Content, together with authentication data, is stored in the Seoul, South Korea region provided by Supabase, Inc. (United States). The Company does not currently pin the execution region for the Supabase Edge Functions it invokes, so a service request may run in South Korea or an overseas region close to the caller. As of this policy's effective date, the overseas Edge execution countries supported by Supabase are Japan, India, Singapore, Australia, Canada, the United States, Brazil, Ireland, the United Kingdom, France, Germany, and Switzerland. Depending on the requested function, the processed data may include the account data, User Content, profile, and health and activity data in Section 1, related entries, images, audio, and request metadata. These are transmitted over TLS while you use the Service and may be processed for authentication, request relay and execution, AI processing, voice transcription, embeddings, account and payment administration, security, and operations. The Edge gateway and Functions generate network and function request-metadata logs. Account and User Content retention follows Section 3. As of this policy's effective date, the project uses the Free plan, and Supabase retains API and function logs for one day (contact: privacy@supabase.com). You cannot complete sign-up without acknowledging this essential processing.

**AI processing**: when you use an AI feature, content you provide to that feature is transferred over TLS to OpenAI OpCo, LLC (United States; privacy inquiries: privacy@openai.com) via the OpenAI API for analysis, generation, or voice transcription, and, where the embeddings (record search indexing) feature is enabled on the server, for generating embeddings. Some AI features (persona narrative/synthesis and part of cross-checking) may be transferred to and processed by Anthropic PBC (United States; privacy inquiries: privacy@anthropic.com) via the Claude API. Current new builds use OpenAI or Anthropic under purpose-specific routing, with automatic failover disabled. However, AI requests from older app versions or builds or runtimes where the dedicated vendor settings were not injected may be routed to Google's Gemini API (Google privacy inquiries: policies.google.com/privacy). Health and activity measurements are not sent to any AI provider.

Per each provider's published policies (subject to change by each provider): OpenAI API inputs and outputs are not used to train models unless the customer separately opts in to data sharing; abuse-monitoring logs for applicable APIs are retained by default for up to 30 days and may be kept longer where required by law or reasonably necessary to protect the service or a third party; the OpenAI audio transcription API currently retains neither abuse-monitoring logs nor application state. Anthropic API inputs and outputs are deleted by default within 30 days of receipt or generation, except where a storage feature is used, a separate agreement applies, or retention is needed for policy enforcement or legal obligations. Gemini API processing and retention may depend on the service tier, ZDR status, feature settings, and Google terms applicable to the actual project. The historical project's contracting entity, service tier, ZDR status, and exact applicable retention rule have not yet been operationally verified, so this policy does not assert them.

**Error and crash reporting (Sentry)**: new JS bundles deployed after the Sentry-disable change takes effect do not initialize Sentry. However, app versions from before that deployment, apps that have not restarted after an update, and web sessions that have not refreshed may continue to transmit error and crash data over TLS to Functional Software, Inc. (dba Sentry, United States), including stack traces, app version, device, operating-system and browser information, and event timestamps. The purpose is error diagnosis and service-stability monitoring. Default personal-data forwarding was disabled, the web client removed address and request information, and no session replay was used. Collected events are retained for the period set in the Company's Sentry project and under the applicable terms; the exact account setting is not asserted until operationally verified. To stop future transmission, update and restart the app or refresh the web page; doing so does not limit access to the core Service. Contact kim0405@hayangzip.com about remaining events or deletion requests, or compliance@sentry.io for Sentry privacy inquiries.

**Usage statistics**: web usage statistics (Google Analytics 4) are transferred to Google LLC (United States) **only if an adult user turns them on in settings**. The transferred items are screen navigation and interaction records, device/browser information, pseudonymous client and device identifiers, cookie and local-storage identifiers, approximate location, and the IP address used at collection; they do not include the body of your records or your conversations. The purpose is to see how the Service is used; transfers occur over TLS-encrypted connections while you view those screens; retention follows the period set on the account (up to 14 months for user- and event-level data), while **standard aggregated reports are not governed by that retention setting**. This transfer rests on **your separate consent** under Article 28-8(1)1 of Korea's PIPA, and turning it off in settings stops further transfers. Declining usage statistics does not limit your use of the Service. The app's usage-statistics tools (Firebase Analytics and Microsoft Clarity) are **currently disabled and collect or transfer nothing**; if they are enabled, this policy will be updated first (for reference, Microsoft Clarity's published retention is 30 days for regular recordings and up to 9 months for favorite/sample recordings and aggregates such as heatmaps).

**Payments (Paddle)**: if you choose a paid purchase, transaction data such as email, country, selected product, price, currency, and payment status, together with the internal account identifier (user_id) used to link the payment result to your account, is transferred over TLS to the applicable Merchant of Record, Paddle.com Market Limited (United Kingdom) or Paddle.com Inc. (United States). The purposes are payment, refund, and tax processing and linking transaction and subscription status to the account. The user_id is stored as custom data on the Paddle transaction and may be copied to the subscription and later renewal or change transactions. Paddle retains transaction data while its relationship with you continues and for periods permitted or required by applicable law, including periods connected with claims, investigations, or disputes (contact: privacy@paddle.com). If you decline this processing, you cannot complete a paid purchase or link subscription status to your account, but you may continue to use the free features.

### 6. Your rights
You (and legal representatives) may request **access, correction, deletion, or suspension of processing** at any time. The Service provides **in-app account deletion and data export**, and you may also contact kim0405@hayangzip.com.

### 7. Children under 14
The Company generally does not collect personal data of children under 14 and, where unavoidable, processes it only after verifying guardian consent (phased rollout).

### 8. Security measures
Access-rights management with row-level access control (RLS), TLS encryption in transit and encrypted storage, access-log retention, and regular vulnerability checks.

### 9. Data Protection Officer & contact
- DPO: Kim Yang-hwan, kim0405@hayangzip.com
- Contact: kim0405@hayangzip.com (aim to reply within 2 business days)
- Remedies: Korea's Personal Information Dispute Mediation Committee, KISA privacy center (privacy.kisa.or.kr).

### 10. Automated processing
(1) The Service **automatically** builds summaries from the records you leave, shows how much you have recorded in each area as a brightness level (L1-L5), and gathers the whole into a single sentence.
(2) **The brightness levels are counted from the amount and kind of records you left; they are not produced by the AI.** The AI writes sentences; the numbers are the result of counting.
(3) This processing exists to show you your own material. It is **not used for any decision with legal effect on your rights or obligations (hiring, credit, insurance, licensing) and is not provided to third parties.**
(4) You can keep an AI suggestion from taking effect **until you approve it**, edit or delete anything you have approved, and turn the related features off in settings. To request an explanation of this automated processing, write to kim0405@hayangzip.com.

### 11. Changes
This policy may be revised per law/service changes; revisions (effective date and content) will be announced in the Service. A revision history is kept in Section 12 so you can compare what changed.

### 12. Revision history
| Effective | What changed |
|---|---|
| 2026-09-02 | Reworked Sections 4 and 5 to match the actual processing paths: disclosed OpenAI, Anthropic, and conditional Gemini routing; distinguished Supabase's primary Seoul storage from unpinned domestic or overseas Edge Functions and one-day logs; disclosed Paddle user_id custom data; clarified continuing transmission from older Sentry builds; added GA4 pseudonymous identifiers, cookies, location, and IP items; and aligned the required overseas-processing refusal effect with sign-up. Also clarified that health and activity measurements are not sent to AI providers. |
| 2026-08-30 | Added Google Analytics 4 and Microsoft Clarity to the processors in Section 4 (processed only if you turn usage statistics on). Added an overseas-transfer notice for both in Section 5 (legal basis, transferred items, retention). |
| 2026-08-16 | Initial version. |
