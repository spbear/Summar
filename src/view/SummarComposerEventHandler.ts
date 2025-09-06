import { ISummarEventHandler, ISummarViewContext } from "./SummarViewTypes";
import { SummarDebug } from "../globals";

/**
 * Composer 레벨 이벤트 핸들러
 * 채팅 컨테이너의 버튼 이벤트들을 처리
 */
export class SummarComposerEventHandler implements ISummarEventHandler {
  constructor(private context: ISummarViewContext) {}

  setupEventListeners(): void {
    // Composer container의 버튼 이벤트들을 이벤트 위임 방식으로 처리
    this.context.composerContainer.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest('button') as HTMLButtonElement;
      
      if (!button) return;
      
      const buttonId = button.getAttribute('button-id');
      
      switch (buttonId) {
        case 'composer-clear-button':
          this.handleClearComposer();
          break;
        case 'composer-close-button':
          this.handleCloseComposer();
          break;
      }
    }, { signal: this.context.abortController.signal });
  }

  cleanup(): void {
    // AbortController가 이미 모든 이벤트 리스너를 정리하므로 추가 작업 없음
  }

  private handleClearComposer(): void {
    const composerManager = (this.context as any).composerManager;
    if (composerManager && composerManager.clearComposer) {
      composerManager.clearComposer();
    }
  }

  private handleCloseComposer(): void {
    const composerManager = (this.context as any).composerManager;
    if (composerManager && composerManager.toggleComposerContainer) {
      composerManager.toggleComposerContainer();
    }
  }
}
