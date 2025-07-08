import SummarPlugin from "./main";
import { RecordingConfirmModal } from "./recordingconfirmmodal";

export class RecordingTimer {
  timerInterval: number | undefined; // 타이머 ID
  plugin: SummarPlugin;
  elapsedTime: number;
  private readonly TWO_HOURS_IN_MS = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
  private readonly ONE_HOUR_IN_MS = 1 * 60 * 60 * 1000; // 1 hour in milliseconds
  private nextWarningTime: number = 0;
  private isModalOpen: boolean = false;

  constructor(plugin: SummarPlugin) {
    this.plugin = plugin;
  }
  // 타이머 시작 함수
  start(): void {
    this.elapsedTime = 0;
    this.nextWarningTime = this.TWO_HOURS_IN_MS; // Set first warning at 2 hours
    this.isModalOpen = false;

    this.timerInterval = window.setInterval(() => {
      this.elapsedTime += 1000;
      const seconds = Math.floor(this.elapsedTime / 1000) % 60;
      const minutes = Math.floor(this.elapsedTime / 1000 / 60) % 60;
      const hours = Math.floor(this.elapsedTime / 1000 / 60 / 60);
  
      const pad = (n: number) => (n < 10 ? "0" + n : n);
  
      const timeElapsed = `[■] ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
      this.plugin.recordButton.textContent = timeElapsed;
      this.plugin.recordButton.style.color = "red";
      this.plugin.recordingStatus.update(timeElapsed, "red");
      
      // Check if warning time has been reached
      if (this.elapsedTime >= this.nextWarningTime && !this.isModalOpen) {
        this.showTwoHourWarning();
      }
    }, 1000); 
  }

  // 타이머 정지 함수
  stop(): void {
    if (this.timerInterval !== undefined) {
      this.plugin.recordButton.textContent =`[●] record`;
      this.plugin.recordButton.style.color = "var(--text-normal)";
      this.plugin.recordingStatus.update("", "var(--text-normal)");
      clearInterval(this.timerInterval); // 타이머 종료
    }
  }
  
  private showTwoHourWarning(): void {
    this.isModalOpen = true;
    const modal = new RecordingConfirmModal(this.plugin.app, (continueRecording: boolean) => {
      this.isModalOpen = false;
      if (!continueRecording) {
        // Stop recording
        this.plugin.toggleRecording();
      } else {
        // Continue recording - extend by 1 hour
        this.nextWarningTime = this.elapsedTime + this.ONE_HOUR_IN_MS;
      }
    });
    modal.open();
  }
}
