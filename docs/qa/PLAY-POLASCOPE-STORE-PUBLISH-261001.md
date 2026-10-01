# Play PolaScope 스토어 등록정보 게시 · 2026-10-01

## 결과

- Simon의 [Q-260928-06 결정](../../DECISIONS.md)은 Google 승인 후, 게시 준비 목록이 이름 변경 관련 두 건뿐일 때 코딩 세션이 Simon의 Chrome에서 최종 게시하도록 위임했다. [Google의 관리형 게시 안내](https://support.google.com/googleplay/android-developer/answer/9859654?hl=ko)에 따르면 `변경사항이 게시 준비됨`은 검토·승인을 마친 상태다.
- 2026-10-01 09:37 KST, 로그인된 Simon의 Chrome에서 PolaScope(`com.simonk.secondbrain`)의 **영어(미국) 기본 스토어 등록정보 두 건**을 관리형 게시했다. 게시 직전 목록에는 앱 이름을 `PolaScope`로 변경하는 항목과 전체 설명 변경 항목만 있었다. 검토 중인 다른 변경은 화면에 표시되지 않았다.
- Play Console [제출 활동의 제출 5](https://play.google.com/console/u/0/developers/4795577270086966748/app/4972454515325629178/publishing/submission-activity/5/details)는 두 항목을 `출시됨`으로 표시하고 게시 시각을 **2026-10-01 09:37 KST**로 기록했다. 게시 개요의 최근 게시일도 10월 1일로 바뀌었고 `게시 준비됨` 목록은 비었다.

## 범위와 남은 확인

- 이는 스토어 등록정보 게시다. 프로덕션 접근 신청·앱 바이너리 새 출시·Play 데이터 보안 Revision 2 제출·광고 활성화는 실행하지 않았다. 비공개 alpha의 vc56과 데이터 보안 Draft에 관한 기존 게이트는 유지한다.
- Google Play 사용자 화면에 새 문구가 실제로 전파됐는지는 별도로 확인하지 않았다. Play Console은 변경이 보통 1시간 이내에 표시되지만 더 걸릴 수 있다고 안내했다.
- Q-260928-08의 App Store Connect 부제 `Self-understanding from notes`는 Simon의 Chrome에서 Apple 계정 로그인 화면(`authResult=FAILED`)으로 이동해 입력하지 못했다. 자격증명은 읽거나 입력하지 않았다.

## 로컬 원증거

계정 화면은 Git 밖 `E:\2ndB\.git\app-parity\`의 `play-polascope-publish-261001-before.png`, `play-polascope-publish-261001-confirm.png`, `play-polascope-publish-261001-after.png`에만 보관했다. 마지막 화면의 SHA-256은 `3AD04EBDC4ABFCF481C29B2C786D23129AF9CAB0CD162152222D47823189339B`다.
