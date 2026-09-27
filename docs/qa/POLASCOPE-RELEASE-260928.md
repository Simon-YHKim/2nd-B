# PolaScope 이름 전환: 서버 선행·공개 게이트

2026-09-27 Simon 결정: 앱 표시명은 `PolaScope` / `폴라스코프`이고 웹·앱 5개 언어·법률/동의 문구를 함께 바꾼다. 저장소, 패키지, 웹 `/2nd-B` 경로, 기존 캐릭터 이름은 유지한다. 이 문서는 배포 순서이며 운영 적용 증거가 아니다. Supabase 운영 작업은 Grok Bot 담당이다.

## 서버 선행 조건

1. Grok Bot이 운영 migration 원장을 읽기 전용으로 확인한다. `0191`과 `0193`, 특히 기존에 보류됐던 `0194`가 적용됐는지 확인한다. `0194`가 없으면 그 파일의 Storage 리허설 선행 조건부터 충족한다.
2. [새 forward SQL 초안](../../db/migration-drafts/UNNUMBERED_polascope_consent_20260928.sql)을 최신 원격 번호로 승격하기 전에 격리 PostgreSQL에서 [회귀 테스트](../../db/migration-drafts/tests/polascope-consent-forward-contract.sql)를 실행한다. 기존 `email-v4`·`service-v1` 계약과 원장/영수증을 다시 쓰지 않는다. SQL 승격과 운영 적용은 해당 범위의 Simon 승인과 Grok Bot 소유권 규칙을 따른다.
3. SQL 적용 뒤 `service-consent` Edge의 dual-version 판을 배포한다. 다른 AI 프록시, 광고, Paddle 설정은 이 이름 전환에 포함되지 않는다.
4. 관리 Edge가 `collect` 또는 `enforce` 모드인지 확인하고, 인증된 기존 QA 계정으로 **모델 호출·원장 쓰기 없이** 읽기 전용 `status` 두 요청을 확인한다. `off`라면 503이 정상이고 이번 읽기 검증은 성립하지 않으므로 별도 설정 변경 범위를 확인한다. 구 앱 형식 `{"action":"status"}`는 `service-v1`과 과거 `2026-09-07 / 2026-09-26 / 2026-08-16`을, 새 형식 `{"action":"status","contractRevision":"service-v2"}`는 `service-v2`와 `2026-09-28` 세 판본을 돌려야 한다. 양쪽 모두 응답 필드, HTTP 상태, Edge 배포 버전과 시각을 기록한다. 인증 없는 요청은 거부돼야 한다. 실제 grant/revoke 쓰기는 별도 검증 계획과 승인 범위에서만 한다.
5. 웹·앱 클라이언트는 4번 성공 뒤 게시한다. `scripts/check-signup-consent-deployment.cjs`는 DB의 `email-v5`만 자동 확인하므로 **Edge v2 canary 증거를 대체하지 않는다**. 웹 게시 워크플로의 현재 main SHA, 법률문서 시행일(2026-09-28 KST 이후), Pages 콘텐츠/설정 해시와 공개 title·OG·PWA·법률 페이지를 확인한다.

## 중단 조건

- SQL 실실행/회귀 테스트 실패, `0194` 선행 조건 누락, v4/v1 응답 변화, v5/v2 상태 불일치, Edge canary 실패, 또는 현재 main 변경이면 새 클라이언트 게시를 멈춘다.
- 새 클라이언트 게시 후 서버 장애가 나면 원장을 되감거나 동의를 승격하지 않는다. dual-version Edge를 수정·재배포하고 상태를 다시 확인한다. 웹 롤백은 별도 운영 승인 범위에서 판단한다.
- 앱 표시명 변경은 기존 설치 앱의 업그레이드 배포를 자동으로 뜻하지 않는다. Play/App Store Console 표기, 광고 앱 이름, 스토어 제출은 각 소유자의 별도 절차로 확인한다.
