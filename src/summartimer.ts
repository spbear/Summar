import { SummarViewContainer, SummarDebug } from "./globals";
import SummarPlugin from "./main";

export class SummarTimer extends SummarViewContainer {
  timerInterval: number | undefined; // 타이머 ID
  dotCount = 0; // 점(.)의 개수
  started = false; // 시작 여부

  constructor(plugin: SummarPlugin) {
    super(plugin);
  }
  // 타이머 시작 함수
  start(resultKey: string, label: string): void {
    if (this.started) {
      // SummarDebug.log(1, `SummarTimer: Already started for key: ${resultKey}`);
      return;
    }
    // SummarDebug.log(1, `SummarTimer: Starting timer for key: ${resultKey}, label: ${label}`);
    this.started = true; // 시작 여부 변경
    this.dotCount = 0; // 초기화
    this.timerInterval = window.setInterval(() => {
      // 텍스트에 점(.) 추가
      // SummarDebug.log(2, `SummarTimer: Adding dot for key: ${resultKey}, count: ${this.dotCount + 1}`);
      const result = this.appendResultText(resultKey, label, ".");
      // SummarDebug.log(2, `SummarTimer: appendResultText returned: ${result}`);
      // this.enableNewNote(false, resultKey);
      this.dotCount++;
    }, 500); // 500ms마다 실행
    // SummarDebug.log(1, `SummarTimer: Timer interval created with ID: ${this.timerInterval}`);
  }

  // 타이머 정지 함수
  stop(): void {
    if (this.timerInterval !== undefined) {
      // SummarDebug.log(1, `SummarTimer: Stopping timer with ID: ${this.timerInterval}`);
      clearInterval(this.timerInterval); // 타이머 종료
      this.started = false; // 시작 여부 변경
      this.timerInterval = undefined;
    } else {
      // SummarDebug.log(1, `SummarTimer: No active timer to stop`);
    }
  }
}