# 게이트 해소 런북 (2026-06-20)

> 비서(Ops) + 개인 데이터 임포트는 코드로 완성됐다(세션 PR #480~#491). 라이브에
> 완전히 켜려면 **코드 밖 게이트**만 남았다. 각 게이트를 Simon이 바로 실행할 수 있는
> 순서로 정리. 위에서부터 = 비용·위험 낮은 순.

## G0 — prod 마이그레이션 apply ✅ 완료 (2026-06-20, Supabase MCP)
0048~0055 **전부 prod 적용 + 검증 완료**. 신규 테이블 9종 모두 owner-only RLS +
정책 1개씩 확인, 보안 advisor green(신규 경고 0).
- [x] **0052~0055** (가계부·책장·마일스톤·식단) — 직전 세션에 이미 적용돼 있었음(존재+RLS 검증).
- [x] **0048~0051 간극 발견 후 적용** — 0048(ops_routines/logs)·0049(health_samples +
      ops_routine_logs.source_sample_id)·0050(미성년 health_import 잠금)·0051(srs_cards/reviews).
      이 4개는 main에 머지됐지만 prod 테이블이 없던 상태 → 0048은 **이번 세션 주간성장리뷰**가
      읽는 `ops_routine_logs`를 백킹하므로 누락 시 그 기능이 깨짐이었다.
- [x] ⚠️ **0050 보안 회귀 버그 수정 후 적용**: 원본 0050이 `clamp_minor_privacy_prefs`를
      0033 본문(`NEW.minor_tier`)으로 되돌려, 0038이 넣은 `COALESCE(OLD.minor_tier,
      NEW.minor_tier)` 하드닝(미성년이 UPDATE로 minor_tier='adult' 위조 시 clamp 우회 차단)을
      회귀시킬 뻔했다. fresh DB 빌드(0038→0050 순서)에도 잠복하던 **체인 버그** → repo의
      `0050` 파일을 COALESCE 보존 + `health_import` 추가로 수정해 영구 해소.
- 영향 화면: `/ledger` `/reading` `/milestones` `/meals` · `/ops`(루틴)·`/srs`·주간성장리뷰(`/growth`).
- 검증 쿼리: 5 테이블 RLS=on/policy=1, `source_sample_id` 컬럼 존재, clamp가 COALESCE+health_import 둘 다 보유.

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
      (스키마는 준비됨 — `health_samples` 테이블 + 미성년 `health_import` 잠금이 0049/0050으로
      prod 적용 완료. 남은 건 네이티브 권한 + 인제스트 활성 + 법무 동의 영속.)
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
**G0 ✅ 완료 → 이제 G1(무료 키)가 다음** — 가장 싸고 즉시 효과(실데이터 켜짐). G3/G4는
한 EAS 사이클로 묶고, G2/G5는 콘솔·법무 준비 후. 각 게이트는 독립이라 순서 자유.

## 검증
```bash
npm run verify            # 전체 게이트 (현재 220 suites / 1696 tests green)
npx jest src/lib/import src/lib/ops src/lib/finance src/lib/nutrition
```
