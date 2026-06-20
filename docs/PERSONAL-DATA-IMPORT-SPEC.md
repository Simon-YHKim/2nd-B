# 개인 데이터 임포트 — 엔지니어링 명세서 (2026-06-20)

> VISION 축 (2) 개인 비서 기반. 사용자 *본인* 데이터를 외부 서비스에서 들여와 비서의
> 추천·리마인더 근거로 쓴다. 동반: `docs/ASSISTANT_OPS.md`(실행), 클로드 디자인
> `ops-ia` / 임포트 허브 정본(UX). 이 문서는 **데이터·프라이버시 계약**(파서 → 파생 신호 →
> assistant). 화면 UX는 디자인 정본이 담당.

## 1. 왜 "내보내기 → 파일 임포트"인가 (라이브 커넥터가 아닌 이유)
| 소스 | 라이브 API | 결론 |
|---|---|---|
| 카카오톡 대화 | 없음(전송 API만) | export .txt만 |
| 문자(SMS) | iOS 금지 · Android Play 제한 | 백업 XML만 |
| 구글 위치이력 | Timeline API 폐기(온디바이스) | Takeout JSON만 |
| 애플 헬스 | HealthKit(네이티브+법무 게이트) | export.xml = 게이트-없는 대안 |
| 이메일 | IMAP 중량 | .eml 파일 |
| 캘린더 | OAuth(게이트) | .ics 파일 = 게이트-없는 대안 |

→ 공통 흐름: **detect → parse(순수) → derive(파생 신호) → propose→ratify(사용자 승인분만 저장)**.

## 2. 구현된 파서 (전부 PURE · 네트워크/LLM/저장 0 · $0 · 온디바이스)
| 파일 | 입력 | 출력(원시) | 파생 신호 | 민감도 |
|---|---|---|---|---|
| `src/lib/import/kakao.ts` | 카톡 .txt | `KakaoMessage[]` | `extractAppointmentHints` | 🔴 통신 |
| `src/lib/import/sms.ts` | SMS B&R XML | `SmsMessage[]` | `extractSmsAppointmentHints` | 🔴 통신 |
| `src/lib/import/location.ts` | Takeout JSON | `LocationVisit[]` | `summarizeLocations`(장소/기간) | 🔴 위치 |
| `src/lib/import/ics.ts` | .ics | `CalendarEvent[]` | (이벤트 자체) | 🟡 일정 |
| `src/lib/import/health-export.ts` | 애플 헬스 export.xml | `HealthRecord[]` | `summarizeHealth`(타입별 합계) | 🟠 건강 |
| `src/lib/import/email.ts` | .eml | `EmailMessage` | `emailLooksLikeAppointment` | 🟠 이메일 |
| `src/lib/import/detect.ts` | filename+content | `ImportKind` | (라우팅) | — |
| `src/lib/import/hints.ts` | text | `looksLikeAppointment` | 공유 약속 판정 | — |

테스트: `src/lib/import/__tests__/` (kakao·sms·location·ics·health-export·detect). `npm run verify` green.

## 3. 프라이버시 계약 (불가침 — 구현 시 강제)
1. **원문 비보존**: 메시지/위치 원문은 기기에서 파싱·파생 후 **버린다**. 서버엔 파생 신호만
   (약속 카운트·장소명·타입별 합계), 암호화.
2. **온디바이스 우선**: 파서는 전부 순수 함수 → 파일 파싱·파생은 기기에서. 서버 업로드는 파생물만.
3. **명시 동의(PIPA 민감정보)**: 위치·통신은 동의 없이 1 byte도 안 들어감. 동의 문구에 *수집 항목·
   보관 위치·보관 기간·삭제권* 명문. (`privacy_prefs` 신규 키 per source, ops_push 패턴 재사용.)
4. **C10 미성년 잠금**: 미성년은 통신·위치 임포트 서버잠금(0032 패턴, MINOR_PROMOTABLE 제외).
5. **propose→ratify**: 파생 신호는 *제안*으로 표시 → 사용자 승인분만 기록/위키에 반영. 자동 실행 없음.
6. **C9/C3**: 파생 텍스트를 LLM에 태울 때만 분류·감사. 단 이건 *본인 입력*이라 #478 third-party
   경로와 구분(본인 데이터 = 사용자-입력 안전경로가 맞음).

## 4. 파생 신호 → 비서 연결 (구현 시)
| 소스 | 파생 | 비서 활용 |
|---|---|---|
| 카톡·문자·이메일 | 약속 힌트(시간·상대) | 리마인더/캘린더 푸시 후보(기존 push.ts/reminders) |
| 캘린더(.ics) | 이벤트 | /ops 일정 맥락, 충돌 회피 |
| 위치(Takeout) | 장소·이동 패턴 | 운동·집중·집정리 루틴 자동완료 근거(health-link 패턴) |
| 애플 헬스 | 타입별 합계(걸음 등) | 운동·건강 루틴 자동완료(applyHealthAutoComplete 결정론 매핑) |

## 5. 남은 일 + 게이트
- **임포트 허브 화면 + 동의/철회 UX** — 클로드 디자인 정본(전송됨) 도착 후 키트로 배선.
- **파생 신호 저장 스키마 + 암호화** — 마이그레이션 + 동의 게이트(법무). 위치·통신은 최중량.
- **위치 라이브(expo-location)·HealthKit·Calendar/Tasks OAuth** — 네이티브/콘솔 게이트.
- **수동 입력 마이그레이션 prod apply** — 0052~0055 (별도).

## 검증
```bash
npm run verify
npx jest src/lib/import
```
