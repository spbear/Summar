import { ISummarEventHandler, ISummarViewContext } from "./SummarViewTypes";
import { SummarDebug } from "../globals";

/**
 * Chat 레벨 이벤트 핸들러
 * 채팅 컨테이너의 버튼 이벤트들을 처리
 */
export class SummarChatEventHandler implements ISummarEventHandler {
  constructor(private context: ISummarViewContext) {}

  setupEventListeners(): void {
    // Chat container의 버튼 이벤트들을 이벤트 위임 방식으로 처리
    this.context.chatContainer.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest('button') as HTMLButtonElement;
      
      if (!button) return;
      
      const buttonId = button.getAttribute('button-id');
      
      switch (buttonId) {
        case 'chat-clear-button':
          this.handleClearChat();
          break;
        case 'chat-close-button':
          this.handleCloseChat();
          break;
      }
    }, { signal: this.context.abortController.signal });
  }

  cleanup(): void {
    // AbortController가 이미 모든 이벤트 리스너를 정리하므로 추가 작업 없음
  }

  private handleClearChat(): void {
    const chatManager = (this.context as any).chatManager;
    if (chatManager && chatManager.clearChat) {
      chatManager.clearChat();
    }
  }

  private handleCloseChat(): void {
    const chatManager = (this.context as any).chatManager;
    if (chatManager && chatManager.toggleChatContainer) {
      chatManager.toggleChatContainer();
    }
  }
}
