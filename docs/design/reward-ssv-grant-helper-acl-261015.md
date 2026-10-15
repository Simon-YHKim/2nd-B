# SSV 직접 지급 helper 권한 회수 · 0261

#2110의 독립 검토에서 실제 service_role로 티켓 없이 두 helper의 지급이 재현됐다. 10-15 운영 ACL 읽기도 두 helper의 service_role EXECUTE=true, 공개 역할=false를 확인했다. 운영 지급 실험은 하지 않았다.

0261은 `grant_reward_credits_ssv`·`grant_chat_ad_bonus_ssv`의 PUBLIC/anon/authenticated/service_role 직접 실행 권한만 회수한다. v3→v2→helper의 동일 소유자 SECURITY DEFINER 호출을 유지한다. 데이터나 동의·요금·보관 기간을 바꾸지 않는다. 운영 관리자나 service_role의 모든 권한을 제한한다는 보장이 아니다.

선행 조건은 #2110의 0214 적용 및 같은 소유자의 함수 체인이다. 10-15 운영 rewarded-ssv v104의 세 파일은 당시 main과 같고 직접 helper 호출이 없었다. 번호 없는 초안은 독립 검토 R1 PASS(지적 0)를 받았고, 최신 main의 최댓값 0260 및 가져온 원격 참조 1,292개의 번호 중복을 확인한 뒤 0261로 승격했다. 운영 적용 전 현재 원격 가지와 운영 상태를 다시 확인한다.

검증 runner는 로컬/CI scratch에서 번호 마이그레이션이 적용된 뒤 트랜잭션 안에서 실제 service_role 직접 지급 거부→정상 티켓 reasoning/chat 지급과 동일 재시도→오래된 시각·잘못된 유닛 거부→원장 2행 확인→ROLLBACK한다. 기존 88일 정리 테스트도 회수된 권한 상태에서 계속 실행한다. 번호 마이그레이션을 runner에서 재적용하지 않으므로 본 replay에서 누락된 권한 회수를 가리지 않는다. 중복 적용은 별도 로컬 DB에서 검증한다.

운영 절차: 현재 Edge 호출부/함수 소유자·본문·ACL 재확인 → 콘솔이 0214 → 0261 순서로 각 migration을 단일 트랜잭션으로 적용 → v2와 두 helper 직접 권한 false, v3의 service_role만 true 확인 → 실제 Edge 정상/재시도/거부 canary. 지급 함수 ACL이 달라지므로 구 helper를 직접 부르는 Edge로 되돌리지 않는다. 문제가 있으면 광고를 닫고 같은 체인을 유지하며 수정한다. 운영 적용·게시·canary는 이 변경에서 실행하지 않았다.
