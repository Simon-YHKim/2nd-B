# rc2 실기 QA 증거 (2026-07-21, hub 직접 adb 에뮬)

- 대상: rc2 APK build 0.1.0/14, SHA c8a82ec1
- 에뮬: Pixel_9_Pro_XL (x86_64), 콜드부트
- 01-first.png: 앱 실행 직후 = 홈 런처(첫 실행 soloader 크래시 후 복귀)
- 02-app.png: "2nd-Brain keeps stopping" 크래시 다이얼로그 (픽셀 직독)
- 크래시 원인: rc2 APK = arm64-v8a 전용(lib 29개 전부 arm64, x86_64 0개). libreactnative.so를 x86_64 에뮬에서 로드 실패. **APK 결함 아님 = 에뮬 ABI 미스매치**. 실기(arm64)에선 정상.
