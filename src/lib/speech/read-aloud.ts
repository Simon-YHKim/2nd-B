// 소리 내어 읽기 한 곳(S-01 하루 요약). expo-speech 를 감싼다(Q-261007-33 = B, Simon 2026-10-07 '지금 추가').
//
// 무음: iOS 는 기본값(앱 오디오 세션 = 효과음 세션 .ambient)이라 무음 스위치를 따른다. Android 는 기기 TTS 가
// 미디어 음량으로 나가고 벨소리 모드를 JS 에서 읽을 길이 없다. 그래서 읽기는 사람이 [읽기]를 눌렀을 때만
// 시작한다(자동 낭독 없음).

import * as Speech from "expo-speech";

export interface ReadAloudHandlers {
  onDone: () => void;
  onError: () => void;
}

export function speakLine(text: string, language: string, handlers: ReadAloudHandlers): void {
  Speech.speak(text, { language, onDone: handlers.onDone, onError: handlers.onError });
}

export function stopSpeaking(): void {
  void Speech.stop().catch(() => undefined);
}
