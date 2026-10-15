# 보상 광고 초안 #2110 · 2026-10-15 운영 읽기 재대조

현재 큐에 연결된 초안부터 정리한다는 사용자 결정에 따라 [#2110](https://github.com/Simon-YHKim/2nd-B/pull/2110)을 최신 main과 대조했다. 기존 0214 번호와 PR을 유지하며, 운영 DB·Edge·플래그는 변경하지 않았다. 날짜만 보고 예전 초안을 적용하지 않는다.

## 인수 기록과 다른 것

- T66의 “0221 적용 대기”는 현재 상태와 다르다. 운영 `supabase_migrations.schema_migrations`에 version `20261006093612`, name `0221_reward_retention_health_due`가 있다. 운영 이력은 네 자리 번호가 아니라 적용 시각을 version으로 쓰기도 하므로 version `0221` 검색만으로 미적용을 판단하지 않는다.
- 함수 `reward_retention_health()` 본문은 89일 기준, `reward_purge_last_due(now())`, 최근 예정 실행과 성공 시각 비교를 포함한다. SECURITY DEFINER, service_role 실행 허용, anon/authenticated 실행 거부다.
- 2026-10-15 12:50:59 UTC의 읽기 호출 결과 `ok=true`, `cron_active=true`, `cron_stale=false`, `cron_failures_7d=0`, 연체 항목 8종 모두 0. 예정 실행 `2026-10-14 19:37 UTC`, 최근 성공 `19:37:00.230191 UTC`. 이 한 번의 정상 결과가 향후 정상 동작이나 광고 지급 전체를 보장하지는 않는다.
- 배포 `rewarded-ssv` **v104** 소스를 읽었다. `settle_reward_ssv_ticket_v3` 호출 1곳, v2 호출 0곳. 예전 PR의 v99는 당시 기록이며 지금 배포본 번호가 아니다. v104를 이번 세션이 배포한 것은 아니다. 배포본의 세 파일 `index.ts`·`reward-contract.ts`·`verifier-key-cache.ts`는 main `a1e09fae`의 해당 파일과 본문 전체가 같았다. 이 내용만을 위해 같은 소스를 다시 배포할 필요는 없다.

## 아직 남은 0214

운영 v2/v3는 둘 다 postgres 소유 SECURITY DEFINER다. v3는 v2를 호출하며 service_role이 v3를 실행할 수 있고 anon/authenticated는 없다. 그러나 **v2도 service_role 직접 실행 권한이 남아 있다.** 0214 적용 이력을 찾지 못했고 실제 권한도 미적용 상태와 맞는다. 이 권한으로 v3의 콜백 신선도 검사를 건너뛰는 서버 호출 길이 남는다. 일반 로그인 사용자가 v2를 실행할 수 있다는 뜻은 아니다.

0214는 PUBLIC·anon·authenticated·service_role의 v2 직접 실행 권한을 회수한다. 같은 소유자의 v3 내부 호출은 유지한다. 운영 적용 전에는 v104 이후 다른 배포가 있었는지 다시 읽고 호출 경로와 ACL을 재확인한다. 저장소 머지와 운영 적용은 별도다.

## 검증과 다음 조건

- 최신 main을 기존 초안 가지에 merge하여 과거 변경 4파일을 대조했다. 이 재대조 문서를 다섯째 파일로 추가했다.
- 로컬 PostgreSQL 16의 격리된 scratch DB에 0214를 두 번 적용하고 `reward_records_90d_purge_regression.sql` P1~P17을 실행했다. P17은 JWT 문자열만 바꾸지 않고 실제 `SET ROLE service_role`로 v2 거부와 v3 지급 1행을 확인한다. 로컬 DB에는 운영 데이터가 없다.
- 전체 verify·독립 검토·CI의 최종 판정은 PR의 정확한 HEAD 기준으로 남긴다. 기존 10-06 검증을 새 검증으로 세지 않는다.
- 운영 적용은 콘솔 소유 절차를 따른다. 적용 후 v2 직접 실행 권한 false / v3 true / 공개 역할 false를 재확인하고, 새 권한 아래 실제 Edge 정상·재시도·오래된 콜백 거부 canary를 확인한다. 실광고 게시·활성화·승인 조건을 이 문서로 대신하지 않는다.
- `rollback/0214_down.sql`은 v2 직접 권한을 되살린다. 평상시 롤백이나 자동 실행으로 사용하지 않는다. 비상 중 이전 Edge로 되돌려야 할 때 콘솔이 위험을 확인하고 사용하며, 사건 기록과 후속 재차단을 남긴다.

T66은 0221 미적용 작업으로 그대로 반복하지 않는다. Edge 재배포가 더 필요한지는 현재 main과 배포본의 변경 차이 및 0255 선행 규칙을 별도로 대조한 뒤 판단한다. 0214·실제 광고 canary·앱 확인이 남아 있으므로 전체 완료로 세지 않는다.

## 독립 검토에서 추가로 찾은 기존 경로

0214를 적용한 로컬 scratch DB에서도 기존 `grant_reward_credits_ssv(uuid,text,integer,text)`와 `grant_chat_ad_bonus_ssv(uuid,text)`는 service_role이 직접 실행할 수 있었다. 독립 검토자는 실제 service_role·service JWT로 티켓 없이 두 지급을 재현했다. 0172부터 있던 권한이며 이번 0214가 새로 열지 않았지만, 광고 지급 전체가 신선도·티켓 검사를 강제한다고 말할 수 없다.

- [ ] 호출부를 확인하고 두 helper의 직접 권한 회수 후속을 별도로 준비한다. 현재 main Edge에는 직접 helper 호출이 없고 v3→v2 내부 호출을 쓴다. 소유자·SECURITY DEFINER·실제 역할 지급/재시도/거부를 검증한다.
- [ ] 운영의 helper ACL도 읽어 대조하고, 코드·독립 검토·CI 뒤 콘솔 적용과 실제 Edge canary 조건으로 남긴다. 이번 세션의 운영 직접 지급 실험은 없다.

기존 0214 설명의 “발급 뒤 5분 안”도 바로잡았다. 실제 0213은 콜백 timestamp가 최근 1일이며 발급 시각보다 5분 넘게 이르지 않을 것을 요구한다. 발급 10분 후의 현재 콜백도 다른 조건이 맞으면 허용된다. 설명을 코드에 맞춘 것이며 신선도 조건을 바꾸지 않았다.
