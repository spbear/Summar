import { setIcon } from "obsidian";
import { ISummarChatManager, ISummarViewContext } from "./SummarViewTypes";
import { SummarDebug } from "../globals";
import { composeStandardChatHeader, ChatHeaderButtonsSet } from "./ResultHeaderComposer";

/**
 * Chat 기능 관리자
 * 채팅 컨테이너 및 메시지 처리를 담당
 */
export class SummarChatManager implements ISummarChatManager {
  private chatHeader: HTMLDivElement | null = null;
  private inputArea: HTMLTextAreaElement | null = null;
  private isChatVisible: boolean = false;
  private splitter: HTMLDivElement | null = null;
  private isResizing: boolean = false;
  private minChatHeight: number = 100;
  private maxChatHeight: number = 500;

  constructor(private context: ISummarViewContext) {}

  setupChatContainer(): void {
    // chatContainer의 모든 스타일을 여기서 통합 관리
    this.setupChatContainerStyles();

    // Chat header 생성
    this.chatHeader = this.createChatHeader();
    this.context.chatContainer.appendChild(this.chatHeader);

    // Input area 생성 (간단한 textarea)
    this.inputArea = this.createInputArea();
    this.context.chatContainer.appendChild(this.inputArea);

    // Splitter 생성 및 chatContainer 위에 삽입
    this.splitter = this.createSplitter();
    this.context.containerEl.insertBefore(this.splitter, this.context.chatContainer);

    // 초기에는 숨김
    this.context.chatContainer.style.display = 'none';
    this.splitter.style.display = 'none';
  }

  private setupChatContainerStyles(): void {
    // SummarUIRenderer에서 가져온 기본 스타일들
    this.context.chatContainer.style.position = "relative";
    this.context.chatContainer.style.width = "auto";
    this.context.chatContainer.style.height = "400px";
    this.context.chatContainer.style.border = "1px solid var(--background-modifier-border)";
    this.context.chatContainer.style.marginTop = "1px";
    this.context.chatContainer.style.marginLeft = "5px";
    this.context.chatContainer.style.marginRight = "5px";
    this.context.chatContainer.style.marginBottom = "25px";
    this.context.chatContainer.style.backgroundColor = "var(--background-primary)";
    this.context.chatContainer.style.color = "var(--text-normal)";
    this.context.chatContainer.style.borderRadius = "6px";
    this.context.chatContainer.style.overflow = "hidden";
    this.context.chatContainer.style.boxSizing = "border-box";
    
    // SummarChatManager에서 추가하는 flex 스타일들
    this.context.chatContainer.style.display = 'flex';
    this.context.chatContainer.style.flexDirection = 'column';
    this.context.chatContainer.style.padding = '0';
  }

  private createChatHeader(): HTMLDivElement {
    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    spacer.style.minWidth = '8px';

    // Clear 버튼
    const clearButton = document.createElement('button');
    clearButton.setAttribute('button-id', 'chat-clear-button');
    clearButton.setAttribute('aria-label', 'Clear chat');
    clearButton.style.cssText = `
      background: none;
      border: none;
      padding: 2px;
      cursor: pointer;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      transform: scale(0.8);
      transform-origin: center;
    `;
    setIcon(clearButton, 'trash-2');

    // Close 버튼
    const closeButton = document.createElement('button');
    closeButton.setAttribute('button-id', 'chat-close-button');
    closeButton.setAttribute('aria-label', 'Close chat');
    closeButton.style.cssText = `
      background: none;
      border: none;
      padding: 2px;
      cursor: pointer;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      transform: scale(0.8);
      transform-origin: center;
    `;
    setIcon(closeButton, 'x');

    // ChatHeaderButtonsSet 구성
    const buttons: ChatHeaderButtonsSet = {
      spacer: spacer,
      clear: clearButton,
      close: closeButton
    };

    // composeStandardChatHeader 사용
    const header = composeStandardChatHeader('Chat', buttons, { 
      icon: 'message-circle'
    });

    // 높이 설정 (ResultHeaderComposer에서 주석처리된 부분 적용)
    header.style.height = '28px';
    header.style.padding = '4px 6px';

    return header;
  }

  private createInputArea(): HTMLTextAreaElement {
    const inputArea = document.createElement('textarea');
    inputArea.className = 'chat-input-area';
    inputArea.placeholder = 'Type your message here...';
    inputArea.style.cssText = `
      flex: 1;
      width: 100%;
      margin: 0;
      padding: 16px;
      background: var(--background-primary);
      border: none;
      border-radius: 0;
      resize: none;
      outline: none;
      font-family: var(--font-interface);
      font-size: var(--font-ui-small);
      color: var(--text-normal);
      box-sizing: border-box;
    `;

    // chatContainer height에서 chatHeader height를 뺀 만큼 채움
    this.updateInputAreaHeight(inputArea);

    // Enter 키 이벤트 추가
    inputArea.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const message = inputArea.value.trim();
        if (message) {
          this.sendMessage(message);
        }
      }
    });

    return inputArea;
  }

  private updateInputAreaHeight(inputArea: HTMLTextAreaElement): void {
    if (!this.chatHeader) return;
    
    // chatHeader의 실제 높이를 getBoundingClientRect로 계산 (resultHeader와 동일한 방식)
    const chatHeaderRect = this.chatHeader.getBoundingClientRect();
    const chatHeaderHeight = chatHeaderRect.height;
    
    // inputArea의 높이를 chatContainer height - chatHeader height로 설정
    inputArea.style.height = `calc(100% - ${chatHeaderHeight}px)`;
    
    SummarDebug.log(1, `Input area height updated: calc(100% - ${chatHeaderHeight}px)`);
  }

  private createSplitter(): HTMLDivElement {
    const splitter = document.createElement('div');
    splitter.className = 'chat-splitter';
    splitter.style.cssText = `
      height: 4px;
      background: transparent;
      cursor: ns-resize;
      border-top: 1px solid transparent;
      border-bottom: 1px solid transparent;
      display: none;
      user-select: none;
      position: relative;
    `;

    // 호버 효과
    splitter.addEventListener('mouseenter', () => {
      splitter.style.background = 'var(--interactive-accent)';
    });

    splitter.addEventListener('mouseleave', () => {
      if (!this.isResizing) {
        splitter.style.background = 'transparent';
      }
    });

    // 리사이징 이벤트
    splitter.addEventListener('mousedown', this.handleSplitterMouseDown.bind(this));

    return splitter;
  }

  private handleSplitterMouseDown(e: MouseEvent): void {
    e.preventDefault();
    this.isResizing = true;
    
    if (this.splitter) {
      this.splitter.style.background = 'var(--interactive-accent)';
    }

    const startY = e.clientY;
    const startHeight = parseInt(this.context.chatContainer.style.height) || 200;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = startY - e.clientY; // 위로 드래그하면 positive
      const newHeight = Math.max(
        this.minChatHeight,
        Math.min(this.maxChatHeight, startHeight + deltaY)
      );

      this.resizeChatContainer(newHeight);
    };

    const handleMouseUp = () => {
      this.isResizing = false;
      if (this.splitter) {
        this.splitter.style.background = 'transparent';
      }
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  private resizeChatContainer(height: number): void {
    this.context.chatContainer.style.height = `${height}px`;
    
    // Result container height 조정 - chatContainer의 마진을 고려
    const containerRect = this.context.containerEl.getBoundingClientRect();
    const inputHeight = 60; // 대략적인 input + button 영역 높이
    const splitterHeight = 4;
    const chatMargins = 6; // chatContainer의 하단 마진 (resultContainer와 동일한 간격)
    const newResultHeight = containerRect.height - inputHeight - height - splitterHeight - chatMargins;
    
    this.context.resultContainer.style.height = `${newResultHeight}px`;
  }

  handleViewResize(): void {
    const chatVisible = this.context.chatContainer.style.display !== 'none';
    
    if (chatVisible) {
      // chatContainer가 표시된 경우 현재 높이를 유지하면서 리사이징
      const currentChatHeight = parseInt(this.context.chatContainer.style.height) || 200;
      this.resizeChatContainer(currentChatHeight);
      
      SummarDebug.log(1, `View resized: chat visible, maintained height ${currentChatHeight}px`);
    } else {
      // chatContainer가 숨겨진 경우 resultContainer를 전체 크기로 복원
      const containerRect = this.context.containerEl.getBoundingClientRect();
      const inputHeight = 60; // 대략적인 input + button 영역 높이
      const statusBarMargin = 6; // resultContainer의 기본 하단 간격
      const fullResultHeight = containerRect.height - inputHeight - statusBarMargin;
      
      this.context.resultContainer.style.height = `${fullResultHeight}px`;
      
      SummarDebug.log(1, `View resized: chat hidden, result height restored to ${fullResultHeight}px`);
    }
  }

  toggleChatContainer(): void {
    this.isChatVisible = !this.isChatVisible;
    
    if (this.isChatVisible) {
      this.showChatContainer();
    } else {
      this.hideChatContainer();
    }
  }

  private showChatContainer(): void {
    const chatHeight = 200;
    
    // Chat container 표시
    this.context.chatContainer.style.display = 'flex';
    this.context.chatContainer.style.height = `${chatHeight}px`;
    
    // Splitter 표시 (chatContainer 바로 위에)
    if (this.splitter) {
      this.splitter.style.display = 'block';
    }
    
    // Result container height 조정 - chatContainer의 마진(좌우 2px + 하단 6px)을 고려
    const containerRect = this.context.containerEl.getBoundingClientRect();
    const inputHeight = 60; // 대략적인 input + button 영역 높이
    const splitterHeight = 4;
    const chatMargins = 6; // chatContainer의 하단 마진 (resultContainer와 동일한 간격)
    const newResultHeight = containerRect.height - inputHeight - chatHeight - splitterHeight - chatMargins;
    
    this.context.resultContainer.style.height = `${newResultHeight}px`;
    
    // 중앙 마진 관리 함수 호출
    if (this.context.view && this.context.view.updateResultContainerMargin) {
      this.context.view.updateResultContainerMargin();
    }
    
    SummarDebug.log(1, `Chat container shown, result height adjusted to ${newResultHeight}px with chat margins`);
  }

  private hideChatContainer(): void {
    // Chat container 숨김
    this.context.chatContainer.style.display = 'none';
    
    // Splitter 숨김
    if (this.splitter) {
      this.splitter.style.display = 'none';
    }
    
    // Result container height 복원 - chatContainer가 없을 때의 하단 간격 (6px)
    const containerRect = this.context.containerEl.getBoundingClientRect();
    const inputHeight = 60; // 대략적인 input + button 영역 높이
    const statusBarMargin = 6; // resultContainer의 기본 하단 간격
    const fullResultHeight = containerRect.height - inputHeight - statusBarMargin;
    
    this.context.resultContainer.style.height = `${fullResultHeight}px`;
    
    // 중앙 마진 관리 함수 호출
    if (this.context.view && this.context.view.updateResultContainerMargin) {
      this.context.view.updateResultContainerMargin();
    }
    
    SummarDebug.log(1, 'Chat container hidden, result height restored with original bottom margin');
  }

  async sendMessage(message: string): Promise<void> {
    if (!message.trim()) return;

    SummarDebug.Notice(1, `Chat message: ${message}`);
    
    // 입력 필드 초기화
    if (this.inputArea) {
      this.inputArea.value = '';
    }
    
    // TODO: 실제 채팅 로직 구현
  }

  clearChat(): void {
    if (this.inputArea) {
      this.inputArea.value = '';
    }
    
    SummarDebug.Notice(1, 'Chat cleared');
  }

  cleanup(): void {
    // 리사이징 중단
    this.isResizing = false;
    
    // Splitter 제거
    if (this.splitter) {
      this.splitter.remove();
      this.splitter = null;
    }
  }
}
