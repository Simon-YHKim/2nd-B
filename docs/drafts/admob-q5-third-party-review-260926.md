# AdMob Q5 자체 검토 · 2026-09-26

**작성 방향: AdMob 광고 SDK의 이용자 정보 송신은 개인정보의 제3자 제공으로 분류한다.** 현재 광고는 비활성이다. 이 문서는 활성화 전 문안의 판단 근거이며, 완성된 개인정보 처리방침이나 이용자 동의문은 아니다. AdMob 계정의 실제 수신 법인, 이전 국가와 Google의 적용 보유기간이 확인되지 않아 광고를 켜지 않는다.

## 분류 근거와 실제 흐름

- 대법원은 수신자가 **자신의 업무와 이익**을 위해 정보를 처리하면 제3자 제공, 위탁자의 업무와 이익을 위해 지시·감독 아래 처리하면 처리위탁이라고 구별했다. [대법원 2016도13263](https://law.go.kr/LSW/precInfoP.do?precSeq=184700). Google은 AdMob 광고 제공에서 게시자와 Google이 각각 독립된 개인정보처리자이고 광고 알고리즘 시험, 지연 관리, 예측 개선 등의 결정을 스스로 내린다고 설명한다. 일부 별도 기능은 수탁자 역할일 수 있으나 그 사실로 광고 SDK 전체를 위탁으로 분류할 수 없다. [Google AdMob 역할 설명](https://support.google.com/admob/answer/7666366?hl=en). Google의 GDPR상 역할 표현을 한국법의 결론으로 그대로 치환한 것은 아니다. 실제 목적과 계약을 위 대법원 기준에 대조한 자체 판단이다.
- Google Mobile Ads SDK는 Android에서 IP 주소, 앱 실행·탭·동영상 시청 등 상호작용, 진단 정보, 광고 ID와 app set ID 등을 광고 제공·분석·부정행위 방지 목적으로 자동 수집·공유한다. iOS에서도 IP, 진단, 기기 ID, 광고 노출과 상호작용 등을 처리할 수 있다. [Android 공개](https://developers.google.com/admob/android/privacy/play-data-disclosure), [iOS 공개](https://developers.google.com/admob/ios/privacy/data-disclosure). Google은 파트너 앱의 정보를 서비스 개선, 광고 효과 측정, 부정행위 방지와 허용된 광고 개인화에 이용한다고 밝힌다. [Google 파트너 앱 안내](https://policies.google.com/technologies/partner-sites?hl=en-IN_IN).
- 이 앱의 보상형 경로는 계정 UUID를 서버에 보내 일회용 티켓을 받고, **티켓만** AdMob 요청의 `customData`에 넣는다. 계정 ID·이메일·기록 본문·대화는 그 요청에 넣지 않는다. 티켓도 광고 식별자·IP와 같은 요청에서 처리되므로 제공 항목에서 빼지 않는다. `src/lib/ads/rewarded.native.ts`와 `supabase/functions/rewarded-ssv/index.ts`를 근거로 한 코드 판단이다. Google의 서명 콜백은 Google에서 앱으로 돌아오는 보상 증빙이다. SSV에 별도 수탁 계약이 확인되기 전까지 그 기술 단계를 근거로 AdMob 전체를 처리위탁 표에 넣지 않는다.

## 고지·동의 계약

「개인정보 보호법」 [제17조 제2항](https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1020398699)은 제공받는 자, 목적, 항목, 보유·이용기간, 거부권과 효과를 동의 전에 알리도록 한다. [제22조](https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1006184067)는 다른 동의사항을 구분하도록 한다. [제28조의8 제1항·제2항](https://law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1020398611)은 별도 동의 등 국외 이전 근거와 항목, 국가·시기·방법, 수신자 연락처, 목적·기간, 거부 방법·효과를 요구한다. 한국 이용자의 선택형 광고를 필수 계약 이행을 위한 처리위탁이라고 주장하지 않는다.

출시 전 개인정보 처리방침의 **제3자 제공 표**에 Google AdMob의 독립적 광고 처리 목적과 항목을 기록하고, **국외 이전 절**에 이전 근거와 필수 세부사항을 기록한다. 광고 설정 화면에는 제3자 제공과 국외 이전의 각 선택 동의를 명확히 구분하여 제시하고, 판본·선택·시각을 서버에서 보존한다. 기존 `privacy_prefs.ads=true`, 가입 시 처리방침 확인, Google UMP, iOS ATT 중 어느 것도 이 새 한국법상 동의를 대신하지 않는다. 거부 시 기본 서비스는 유지하고 광고 및 광고 시청 보상만 제공하지 않는다. 철회 후 앱은 신규 광고 요청을 중단한다. 이미 Google에 전달된 정보는 Google의 보유 정책에 따른다.

문안 골격(미확인 정보는 실제 이용자 화면에 내지 않음): “성인 무료 이용자가 별도 동의하면 앱의 Google AdMob SDK가 **확인된 수신 법인**에 광고·기기 식별자, IP 주소와 그로 추정한 대략적 위치, 앱·광고 상호작용과 진단 정보, 일회용 보상 티켓을 전달합니다. 수신자는 독립적으로 광고 제공·효과 측정·부정행위 방지·광고 제품 개선 및 허용된 개인화를 위해 처리합니다. 보유기간은 **확인된 제공받는 자의 기준**을 따릅니다. 동의를 거부하거나 철회해도 기본 서비스는 이용할 수 있지만 광고 보상은 받을 수 없습니다.” 국외 이전 문안에는 **확인된 국가·수신 법인과 연락처·시기·방법·목적·기간·거부 효과**를 기재한다.

## 확인 전 차단과 후속 확인

1. AdMob 계정 Terms 첫 문단에서 **실제 계약 법인**을 확인한다. Google은 계정별 계약 법인이 다르다고 안내한다. [계정 확인 방법](https://support.google.com/admob/answer/2772511?hl=en-GB). Google Asia Pacific Pte. Ltd.(싱가포르)는 가능한 법인의 예시일 뿐 현재 계정의 확정 수신자가 아니다. [Google 법인 안내](https://support.google.com/admob/answer/4385995?hl=en).
2. Google 광고 데이터의 이전 **국가**와 적용 보유·이용기간을 계약/공식 확인 경로로 검증한다. Google은 광고 데이터 처리 위치가 트래픽에 따라 달라질 수 있다고 설명한다. [국제 이전 설명 8쪽](https://services.google.com/fh/files/misc/safeguards_for_international_data_transfers.pdf). 광고 로그의 IP 9개월·쿠키 18개월은 **익명화 시점**이며 모든 광고 정보의 삭제 시점이 아니다. [Google 보관 설명](https://policies.google.com/technologies/retention?hl=en-GB). 단일 국가나 `18개월 보관`을 임의 기입하지 않는다.
3. 콘솔의 mediation/ad technology partner를 확인한다. Google 이외 제공자가 활성이라면 각 수신자·목적·국가를 추가 확인할 때까지 끈다. UMP가 허용하더라도 앱 자체의 새 동의가 없으면 SDK 초기화·광고 로드를 하지 않는다. 광고 동의 거부·미성년·철회 상태의 실제 Android/iOS 네트워크를 측정해 초기 송신 여부를 확인한다.
   현재 `app.json`은 AdMob 플러그인의 `delayAppMeasurementInit: true`를 지정하고 JS 진입점은 법률 게이트에서 닫는다. 네이티브 SDK가 앱 시작 때 송신하지 않는다는 증거는 아직 아니므로 실제 빌드의 네트워크 측정까지 활성화 차단을 유지한다.
4. 위 정보가 검증되면 개인정보 처리방침의 세 사본(KO/EN), `PRIVACY_POLICY_VERSION`, 가입·서비스 동의 SQL 계약, 광고 선택 UI, 회귀 검사를 **같은 판본으로** 갱신한다. 이전 동의를 새 광고 동의로 승계하지 않는다. 이 파일 작성 시점의 코드 게이트는 `src/lib/ads/legal-readiness.ts`에서 닫혀 있으며 운영 광고 ON은 별도 승인 전까지 금지다.
