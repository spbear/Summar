import { setIcon } from "obsidian";
import { ISummarChatManager, ISummarViewContext } from "./SummarViewTypes";
import { SummarDebug } from "../globals";

/**
 * Chat 기능 관리자
 * 채팅 컨테이너 및 메시지 처리를 담당
 */
export class SummarChatManager implements ISummarChatManager {
  private chatHeader: HTMLDivElement | null = null;
  private chatInput: HTMLTextAreaElement | null = null;
  private isChatVisible: boolean = false;
  private splitter: HTMLDivElement | null = null;
  private isResizing: boolean = false;
  private minChatHeight: number = 100;
  private maxChatHeight: number = 500;

  constructor(private context: ISummarViewContext) {}

  setupChatContainer(): void {
    // Chat header 생성
    this.chatHeader = this.createChatHeader();
    this.context.chatContainer.appendChild(this.chatHeader);

    // Chat input 영역 생성
    const chatInputContainer = this.createChatInputContainer();
    this.context.chatContainer.appendChild(chatInputContainer);

    // Splitter 생성 및 chatContainer 위에 삽입
    this.splitter = this.createSplitter();
    this.context.containerEl.insertBefore(this.splitter, this.context.chatContainer);

    // 초기에는 숨김
    this.context.chatContainer.style.display = 'none';
    this.splitter.style.display = 'none';
  }

  private createChatHeader(): HTMLDivElement {
    const header = document.createElement('div');
    header.className = 'chat-header';
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      background: var(--background-secondary);
      border-bottom: 1px solid var(--background-modifier-border);
      height: 44px;
      box-sizing: border-box;
    `;

    // 왼쪽: 채팅 제목과 아이콘
    const leftSection = document.createElement('div');
    leftSection.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    const chatIcon = document.createElement('div');
    chatIcon.className = 'chat-icon';
    setIcon(chatIcon, 'message-circle');
    leftSection.appendChild(chatIcon);

    const chatTitle = document.createElement('span');
    chatTitle.textContent = 'Chat';
    chatTitle.style.cssText = `
      font-weight: 500;
      color: var(--text-normal);
    `;
    leftSection.appendChild(chatTitle);

    // 오른쪽: 액션 버튼들
    const rightSection = document.createElement('div');
    rightSection.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
    `;

    // Clear 버튼
    const clearButton = document.createElement('button');
    clearButton.setAttribute('button-id', 'chat-clear-button');
    clearButton.setAttribute('aria-label', 'Clear chat');
    clearButton.style.cssText = `
      background: none;
      border: none;
      padding: 4px;
      cursor: pointer;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    setIcon(clearButton, 'trash-2');
    rightSection.appendChild(clearButton);

    // Close 버튼
    const closeButton = document.createElement('button');
    closeButton.setAttribute('button-id', 'chat-close-button');
    closeButton.setAttribute('aria-label', 'Close chat');
    closeButton.style.cssText = `
      background: none;
      border: none;
      padding: 4px;
      cursor: pointer;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    setIcon(closeButton, 'x');
    rightSection.appendChild(closeButton);

    header.appendChild(leftSection);
    header.appendChild(rightSection);

    return header;
  }

  private createChatInputContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'chat-input-container';
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      height: calc(100% - 44px);
      background: var(--background-primary);
    `;

    // Chat input 영역
    const inputArea = document.createElement('div');
    inputArea.className = 'chat-input-area';
    inputArea.style.cssText = `
      padding: 16px;
      display: flex;
      gap: 8px;
      align-items: flex-end;
      height: 100%;
      box-sizing: border-box;
    `;

    this.chatInput = document.createElement('textarea');
    this.chatInput.placeholder = 'Type your message...';
    this.chatInput.style.cssText = `
      flex: 1;
      min-height: 40px;
      max-height: 120px;
      padding: 8px 12px;
      border: 1px solid var(--background-modifier-border);
      border-radius: 6px;
      background: var(--background-primary);
      color: var(--text-normal);
      resize: vertical;
      font-family: var(--font-text);
      font-size: 14px;
      line-height: 1.4;
      width: 100%;
      box-sizing: border-box;
    `;

    // Enter 키 이벤트 추가
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const message = this.chatInput?.value.trim();
        if (message) {
          this.sendMessage(message);
        }
      }
    });

    inputArea.appendChild(this.chatInput);

    container.appendChild(inputArea);

    return container;
  }

  private createSplitter(): HTMLDivElement {
    const splitter = document.createElement('div');
    splitter.className = 'chat-splitter';
    splitter.style.cssText = `
      height: 4px;
      background: var(--background-modifier-border);
      cursor: ns-resize;
      border-top: 1px solid var(--background-modifier-border);
      border-bottom: 1px solid var(--background-modifier-border);
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
        splitter.style.background = 'var(--background-modifier-border)';
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
        this.splitter.style.background = 'var(--background-modifier-border)';
      }
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  private resizeChatContainer(height: number): void {
    this.context.chatContainer.style.height = `${height}px`;
    
    // Result container height 조정 (status bar 고려해서 6px 여백)
    const containerRect = this.context.containerEl.getBoundingClientRect();
    const inputHeight = 60; // 대략적인 input + button 영역 높이
    const splitterHeight = 4;
    const statusBarMargin = 6; // Obsidian status bar를 위한 여백
    const newResultHeight = containerRect.height - inputHeight - height - splitterHeight - statusBarMargin;
    
    this.context.resultContainer.style.height = `${newResultHeight}px`;
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
    this.context.chatContainer.style.display = 'block';
    this.context.chatContainer.style.height = `${chatHeight}px`;
    
    // Splitter 표시 (chatContainer 바로 위에)
    if (this.splitter) {
      this.splitter.style.display = 'block';
    }
    
    // Result container height 조정 (status bar 고려해서 6px 여백)
    const containerRect = this.context.containerEl.getBoundingClientRect();
    const inputHeight = 60; // 대략적인 input + button 영역 높이
    const splitterHeight = 4;
    const statusBarMargin = 6; // Obsidian status bar를 위한 여백
    const newResultHeight = containerRect.height - inputHeight - chatHeight - splitterHeight - statusBarMargin;
    
    this.context.resultContainer.style.height = `${newResultHeight}px`;
    
    SummarDebug.log(1, `Chat container shown, result height adjusted to ${newResultHeight}px with status bar margin`);
  }

  private hideChatContainer(): void {
    // Chat container 숨김
    this.context.chatContainer.style.display = 'none';
    
    // Splitter 숨김
    if (this.splitter) {
      this.splitter.style.display = 'none';
    }
    
    // Result container height 복원 (status bar 고려해서 6px 여백)
    const containerRect = this.context.containerEl.getBoundingClientRect();
    const inputHeight = 60; // 대략적인 input + button 영역 높이
    const statusBarMargin = 6; // Obsidian status bar를 위한 여백
    const fullResultHeight = containerRect.height - inputHeight - statusBarMargin;
    
    this.context.resultContainer.style.height = `${fullResultHeight}px`;
    
    SummarDebug.log(1, 'Chat container hidden, result height restored with status bar margin');
  }

  async sendMessage(message: string): Promise<void> {
    if (!message.trim()) return;

    SummarDebug.Notice(1, `Chat message: ${message}`);
    
    // 입력 필드 초기화
    if (this.chatInput) {
      this.chatInput.value = '';
    }
    
    // TODO: 실제 채팅 로직 구현
  }

  clearChat(): void {
    if (this.chatInput) {
      this.chatInput.value = '';
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
