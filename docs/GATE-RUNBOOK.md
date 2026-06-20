# 게이트 해소 런북 (2026-06-20)

> 비서(Ops) + 개인 데이터 임포트는 코드로 완성됐다(세션 PR #480~#491). 라이브에
> 완전히 켜려면 **코드 밖 게이트**만 남았다. 각 게이트를 Simon이 바로 실행할 수 있는
> 순서로 정리. 위에서부터 = 비용·위험 낮은 순.

## G0 — prod 마이그레이션 apply (게이트: Supabase 콘솔, blast-radius)
CI dry-run 통과 완료(0052~0055). prod 적용 시 가계부·책장·마일스톤·식단 저장이 켜진다.
- [ ] Supabase 대시보드 → SQL Editor에 순서대로 실행:
      `db/migrations/0052_ops_ledger.sql` · `0053_ops_reading.sql` ·
      `0054_ops_milestones.sql` · `0055_ops_meal_plan.sql`
- [ ] 또는 CLI: `supabase db push` (마이그레이션 폴더 연결 시)
- [ ] 적용 후 Supabase advisor(보안) green 확인 — 전부 owner-only RLS 내장.
- 영향 화면: `/ledger` `/reading` `/milestones` `/meals`.

## G1 — 무료 공개 API 키 (게이트: data.go.kr / 수출입은행 가입)
키 미설정 시 graceful(원화-only / 아이디어-only)로 이미 동작. 키 넣으면 실데이터.
- [ ] **환율**: 한국수출입은행 OpenAPI 신청(koreaexim.go.kr) → 발급 키를
      `EXPO_PUBLIC_EXIM_FX_KEY` 로 EAS/Vercel 환경변수 등록. (`src/lib/finance/fx.ts`)
- [ ] **식품영양**: data.go.kr "식품의약품안전처 식품영양성분DB" 활용신청 →
      서비스키를 `EXPO_PUBLIC_MFDS_FOOD_KEY` 로 등록. (`src/lib/nutrition/foods.ts`)
- ⚠️ 클라이언트 번들에 키가 들어가므로 공개-데이터 키만(저민감). 민감하면 엣지 프록시로 이전.

## G2 — Google Calendar/Tasks 읽기 (게이트: GCP 콘솔 OAuth)
현재 캘린더는 *내보내기(push)* 만. 읽기 연동 시 일정 맥락 확보.
- [ ] GCP 프로젝트 → OAuth 동의화면 구성(외부, 범위 `calendar.readonly`,
      `tasks.readonly`) → 클라이언트 ID 발급(iOS/Android/Web).
- [ ] redirect/scheme 등록, `EXPO_PUBLIC_ENABLE_GOOGLE_CAL` 류 플래그로 게이트.
- [ ] 임포트 허브 "구글 캘린더·할일" 커넥터(B) 배선. (대안: 이미 있는 `.ics` 파일 임포트로 무게이트 동작)

## G3 — 네이티브 빌드(EAS) + 실기기 QA (게이트: EAS, ANDROID_QA)
- [ ] `expo-notifications`(리마인더)·`expo-calendar`(기기 캘린더 직접등록)는 코드 완성 —
      EAS dev/prod 빌드에서 활성. 실기기에서 권한·알림 검증.
- [ ] `expo-location`(실시간 위치, 임포트 허브 커넥터): 권한 "사용 중에만", 백그라운드 미사용.
      app config 플러그인 + 권한 카피.
- [ ] Health Connect(Android)/HealthKit(iOS) 라이브: 민감정보 → **G5 법무 동반**.
- [ ] `ANDROID_QA_GUIDELINES.md` 준수(OOM/SVG/AsyncStorage/BackHandler).

## G4 — 파일 피커 (게이트: 의존성 추가)
임포트 허브는 현재 *붙여넣기*. 실제 파일 선택 시:
- [ ] `expo-document-picker` 추가($0, Expo SDK 내) + app config 플러그인 + EAS 리빌드.
- [ ] `ImportHubScreen` 입력 단계의 paste를 파일 선택 + `expo-file-system` 읽기로 교체
      (detect→parse는 그대로). 웹은 input[type=file] 폴백.

## G5 — 임포트 영속 + 암호화 + 법무 (게이트: PIPA, 스키마)
임포트 허브는 현재 승인분을 기존 `sources`(captureFromMarkdown)로 저장 + 로컬 이력.
민감(위치·통신) 신호를 별도 보관하려면:
- [ ] 파생 신호 전용 테이블 + **암호화 at rest** + 90일 만료 잡(동의 카피와 일치).
- [ ] PIPA 민감정보 동의 레코드(수집 항목·보관·기간·삭제권) 영속 + 미성년 서버 잠금(C10, 0032 패턴).
- [ ] 동의 전 0 byte·온디바이스·원문 비보존 계약 유지(`docs/PERSONAL-DATA-IMPORT-SPEC.md`).

## 우선순위 권고
**G0(마이그레이션) → G1(무료 키)** 가 가장 싸고 즉시 효과(저장·실데이터 켜짐). G3/G4는
한 EAS 사이클로 묶고, G2/G5는 콘솔·법무 준비 후. 각 게이트는 독립이라 순서 자유.

## 검증
```bash
npm run verify            # 전체 게이트 (현재 220 suites / 1696 tests green)
npx jest src/lib/import src/lib/ops src/lib/finance src/lib/nutrition
```
