import { setIcon } from "obsidian";
import { ISummarComposerManager, ISummarViewContext } from "./SummarViewTypes";
import { SummarDebug } from "../globals";
import { setStandardComposerHeader, ComposerHeaderButtonsSet } from "./OutputHeaderComposer";

/**
 * Composer 기능 관리자
 * 채팅 컨테이너 및 메시지 처리를 담당
 */
export class SummarComposerManager implements ISummarComposerManager {
  private composerHeader: HTMLDivElement | null = null;
  private composerHeaderLabel: HTMLElement | null = null;
  private promptEditor: HTMLTextAreaElement | null = null;
  private isComposerVisible: boolean = false;
  private splitter: HTMLDivElement | null = null;
  private isResizing: boolean = false;
  private minComposerHeight: number = 100;
  private maxComposerHeight: number = 500;
  private targetKey: string | null = null;
  
  // 메모리 누수 방지를 위한 이벤트 정리용 AbortController
  private splitterAbortController: AbortController | null = null;

  constructor(private context: ISummarViewContext) {}

  // 현재 타겟 키 조회 getter
  get currentTargetKey(): string | null {
    return this.targetKey;
  }

  setupComposerContainer(): void {
    // composerContainer의 모든 스타일을 여기서 통합 관리
    this.setupComposerContainerStyles();

    // Composer header 생성
    this.composerHeader = this.createComposerHeader();
    this.context.composerContainer.appendChild(this.composerHeader);

    // Input area 생성 (간단한 textarea)
    this.promptEditor = this.createPromptEditor();
    this.context.composerContainer.appendChild(this.promptEditor);

    // Splitter 생성 및 composerContainer 위에 삽입
    this.splitter = this.createSplitter();
    this.context.containerEl.insertBefore(this.splitter, this.context.composerContainer);

    // 초기에는 숨김
    this.context.composerContainer.style.display = 'none';
    this.splitter.style.display = 'none';
  }

  private setupComposerContainerStyles(): void {
    // SummarUIRenderer에서 가져온 기본 스타일들
    this.context.composerContainer.style.position = "relative";
    this.context.composerContainer.style.width = "auto";
    this.context.composerContainer.style.height = "400px";
    this.context.composerContainer.style.border = "1px solid var(--background-modifier-border)";
    this.context.composerContainer.style.marginTop = "1px";
    this.context.composerContainer.style.marginLeft = "5px";
    this.context.composerContainer.style.marginRight = "5px";
    this.context.composerContainer.style.marginBottom = "25px";
    this.context.composerContainer.style.backgroundColor = "var(--background-primary)";
    this.context.composerContainer.style.color = "var(--text-normal)";
    this.context.composerContainer.style.borderRadius = "6px";
    this.context.composerContainer.style.overflow = "hidden";
    this.context.composerContainer.style.boxSizing = "border-box";
    
    // SummarComposerManager에서 추가하는 flex 스타일들
    this.context.composerContainer.style.display = 'flex';
    this.context.composerContainer.style.flexDirection = 'column';
    this.context.composerContainer.style.padding = '0';
  }

  private createComposerHeader(): HTMLDivElement {
    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    spacer.style.minWidth = '8px';

    // Clear 버튼
    const clearButton = document.createElement('button');
    clearButton.setAttribute('button-id', 'composer-clear-button');
    clearButton.setAttribute('aria-label', 'Clear prompt');
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
    closeButton.setAttribute('button-id', 'composer-close-button');
    closeButton.setAttribute('aria-label', 'Close');
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

    // ComposerHeaderButtonsSet 구성
    const buttons: ComposerHeaderButtonsSet = {
      spacer: spacer,
      clear: clearButton,
      close: closeButton
    };

    // setStandardComposerHeader 사용
    const header = setStandardComposerHeader('compose prompt', buttons, { 
      icon: 'message-square'
    });

    // label element 참조 저장
    this.composerHeaderLabel = header.querySelector('.composer-label-text') as HTMLElement;

    // 높이 설정 (OutputHeaderComposer에서 주석처리된 부분 적용)
    header.style.height = '28px';
    header.style.padding = '4px 6px';

    return header;
  }

  private createPromptEditor(): HTMLTextAreaElement {
    const promptEditor = document.createElement('textarea');
    promptEditor.className = 'composer-prompt-editor';
    promptEditor.placeholder = 'Type your message here...';
    promptEditor.style.cssText = `
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

    // composerContainer height에서 composerHeader height를 뺀 만큼 채움
    this.updatePromptEditorHeight(promptEditor);

    // IME 조합 상태 추적 변수
    let isComposing = false;

    // IME 조합 시작 이벤트
    promptEditor.addEventListener('compositionstart', () => {
      isComposing = true;
      SummarDebug.log(2, 'IME composition started');
    });

    // IME 조합 완료 이벤트
    promptEditor.addEventListener('compositionend', () => {
      isComposing = false;
      SummarDebug.log(2, 'IME composition ended');
    });

    // Enter 키 이벤트 추가 (IME 조합 중일 때는 무시)
    promptEditor.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // IME 조합 중일 때는 엔터 이벤트 무시
        if (isComposing) {
          SummarDebug.log(2, 'Enter key ignored during IME composition');
          return;
        }
        
        e.preventDefault();
        const message = promptEditor.value.trim();
        if (message) {
          SummarDebug.log(1, `Sending message: "${message}"`);
          this.sendMessage(message);
        }
      }
    });

    return promptEditor;
  }

  private updatePromptEditorHeight(promptEditor: HTMLTextAreaElement): void {
    if (!this.composerHeader) return;
    
    // composerHeader의 실제 높이를 getBoundingClientRect로 계산 (outputHeader와 동일한 방식)
    const composerHeaderRect = this.composerHeader.getBoundingClientRect();
    const composerHeaderHeight = composerHeaderRect.height;
    
    // promptEditor의 높이를 composerContainer height - composerHeader height로 설정
    promptEditor.style.height = `calc(100% - ${composerHeaderHeight}px)`;
    
    SummarDebug.log(1, `Input area height updated: calc(100% - ${composerHeaderHeight}px)`);
  }

  private createSplitter(): HTMLDivElement {
    const splitter = document.createElement('div');
    splitter.className = 'composer-splitter';
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
      if (!this.isResizing) {
        splitter.style.background = 'var(--interactive-accent)';
        SummarDebug.log(2, 'Splitter hover enter');
      }
    });

    splitter.addEventListener('mouseleave', () => {
      if (!this.isResizing) {
        splitter.style.background = 'transparent';
        SummarDebug.log(2, 'Splitter hover leave');
      }
    });

    // 리사이징 이벤트
    splitter.addEventListener('mousedown', this.handleSplitterMouseDown.bind(this));

    return splitter;
  }

  private handleSplitterMouseDown(e: MouseEvent): void {
    e.preventDefault();
    this.isResizing = true;
    
    // 이전 AbortController가 있다면 정리
    if (this.splitterAbortController) {
      this.splitterAbortController.abort();
    }
    
    // 새로운 AbortController 생성
    this.splitterAbortController = new AbortController();
    const signal = this.splitterAbortController.signal;
    
    if (this.splitter) {
      this.splitter.style.background = 'var(--interactive-accent)';
    }

    const startY = e.clientY;
    const startHeight = parseInt(this.context.composerContainer.style.height) || 200;
    
    SummarDebug.log(1, `Splitter mousedown: startY=${startY}, startHeight=${startHeight}`);

    const handleMouseMove = (e: MouseEvent) => {
      if (signal.aborted || !this.isResizing) return;  // isResizing 체크 추가
      
      const deltaY = startY - e.clientY; // 위로 드래그하면 positive
      const newHeight = Math.max(
        this.minComposerHeight,
        Math.min(this.maxComposerHeight, startHeight + deltaY)
      );

      this.resizeComposerContainer(newHeight);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (signal.aborted) return;
      
      SummarDebug.log(1, `Splitter mouseup: resizing=${this.isResizing}`);
      
      this.isResizing = false;
      if (this.splitter) {
        this.splitter.style.background = 'transparent';
      }
      
      // 이벤트 리스너 완전히 제거
      if (this.splitterAbortController) {
        this.splitterAbortController.abort();
        this.splitterAbortController = null;
      }
    };

    // AbortController를 사용하여 이벤트 리스너 등록
    document.addEventListener('mousemove', handleMouseMove, { signal });
    document.addEventListener('mouseup', handleMouseUp, { signal });
  }

  private resizeComposerContainer(height: number): void {
    this.context.composerContainer.style.height = `${height}px`;
    
    // Output container height 조정 - composerContainer의 마진을 고려
    const containerRect = this.context.containerEl.getBoundingClientRect();
    const inputHeight = 60; // 대략적인 input + button 영역 높이
    const splitterHeight = 4;
    const composerMargins = 6; // composerContainer의 하단 마진 (outputContainer와 동일한 간격)
    const newOutputHeight = containerRect.height - inputHeight - height - splitterHeight - composerMargins;
    
    this.context.outputContainer.style.height = `${newOutputHeight}px`;
  }

  handleViewResize(): void {
    const composerVisible = this.context.composerContainer.style.display !== 'none';
    
    if (composerVisible) {
      // composerContainer가 표시된 경우 현재 높이를 유지하면서 리사이징
      const currentComposerHeight = parseInt(this.context.composerContainer.style.height) || 200;
      this.resizeComposerContainer(currentComposerHeight);
      
      SummarDebug.log(1, `View resized: composer visible, maintained height ${currentComposerHeight}px`);
    } else {
      // composerContainer가 숨겨진 경우 outputContainer를 전체 크기로 복원
      const containerRect = this.context.containerEl.getBoundingClientRect();
      const inputHeight = 60; // 대략적인 input + button 영역 높이
      const statusBarMargin = 6; // outputContainer의 기본 하단 간격
      const fullOutputHeight = containerRect.height - inputHeight - statusBarMargin;
      
      this.context.outputContainer.style.height = `${fullOutputHeight}px`;
      
      SummarDebug.log(1, `View resized: composer hidden, output height restored to ${fullOutputHeight}px`);
    }
  }

  toggleComposerContainer(): void {
    this.isComposerVisible = !this.isComposerVisible;
    
    if (this.isComposerVisible) {
      this.showComposerContainer();
    } else {
      this.hideComposerContainer();
    }
  }

  showComposerContainer(): void {
    const composerHeight = 200;
    
    // Composer container 표시
    this.context.composerContainer.style.display = 'flex';
    this.context.composerContainer.style.height = `${composerHeight}px`;
    
    // Splitter 표시 (composerContainer 바로 위에)
    if (this.splitter) {
      this.splitter.style.display = 'block';
    }
    
    // Output container height 조정 - composerContainer의 마진(좌우 2px + 하단 6px)을 고려
    const containerRect = this.context.containerEl.getBoundingClientRect();
    const inputHeight = 60; // 대략적인 input + button 영역 높이
    const splitterHeight = 4;
    const composerMargins = 6; // composerContainer의 하단 마진 (outputContainer와 동일한 간격)
    const newOutputHeight = containerRect.height - inputHeight - composerHeight - splitterHeight - composerMargins;
    
    this.context.outputContainer.style.height = `${newOutputHeight}px`;
    
    // 중앙 마진 관리 함수 호출
    if (this.context.view && this.context.view.updateOutputContainerMargin) {
      this.context.view.updateOutputContainerMargin();
    }
    
    SummarDebug.log(1, `Composer container shown, output height adjusted to ${newOutputHeight}px with composer margins`);
  }

  hideComposerContainer(): void {
    // Composer container 숨김
    this.context.composerContainer.style.display = 'none';
    
    // Splitter 숨김
    if (this.splitter) {
      this.splitter.style.display = 'none';
    }
    
    // targetKey 초기화 및 하이라이팅 제거
    this.targetKey = null;
    this.clearAllHighlighting();
    this.resetComposerLabel();
    
    // Output container height 복원 - composerContainer가 없을 때의 하단 간격 (6px)
    const containerRect = this.context.containerEl.getBoundingClientRect();
    const inputHeight = 60; // 대략적인 input + button 영역 높이
    const statusBarMargin = 6; // outputContainer의 기본 하단 간격
    const fullOutputHeight = containerRect.height - inputHeight - statusBarMargin;
    
    this.context.outputContainer.style.height = `${fullOutputHeight}px`;
    
    // 중앙 마진 관리 함수 호출
    if (this.context.view && this.context.view.updateOutputContainerMargin) {
      this.context.view.updateOutputContainerMargin();
    }
    
    SummarDebug.log(1, 'Composer container hidden, output height restored with original bottom margin');
  }

  async sendMessage(message: string): Promise<void> {
    if (!message.trim()) return;

    SummarDebug.Notice(1, `Composer message: ${message}`);
    
    // 입력 필드 초기화
    if (this.promptEditor) {
      this.promptEditor.value = '';
    }
    
    // TODO: 실제 채팅 로직 구현
  }

  clearComposer(): void {
    if (this.promptEditor) {
      this.promptEditor.value = '';
    }
    
    // targetKey 초기화 및 하이라이팅 제거
    this.targetKey = null;
    this.clearAllHighlighting();
    this.resetComposerLabel();
    
    SummarDebug.Notice(1, 'Composer cleared');
  }

  setOutput(key: string): void {
    this.targetKey = key;
    
    // 이전 하이라이팅 제거 및 새로운 하이라이팅 적용
    this.updateHeaderHighlighting(key);
    
    // 컴포저 헤더 라벨 업데이트
    this.updateComposerLabel(key);
    
    SummarDebug.log(1, `Composer target set to output key: ${key}`);
  }

  private updateHeaderHighlighting(key: string): void {
    // 모든 하이라이팅 제거
    this.clearAllHighlighting();
    
    // 새로운 하이라이팅 적용
    if (this.context.outputManager) {
      this.context.outputManager.highlightOutputHeader(key);
    }
    if (this.context.stickyHeaderManager) {
      this.context.stickyHeaderManager.highlightStickyHeader(key);
    }
  }

  private clearAllHighlighting(): void {
    if (this.context.outputManager) {
      this.context.outputManager.clearAllHeaderHighlights();
    }
    if (this.context.stickyHeaderManager) {
      this.context.stickyHeaderManager.clearAllStickyHeaderHighlights();
    }
  }

  private updateComposerLabel(key: string): void {
    if (!this.composerHeaderLabel) return;

    // outputRecords에서 타겟 아이템의 라벨 찾기
    const targetRecord = this.context.outputRecords.get(key);
    let targetLabel = '';
    
    if (targetRecord && targetRecord.label) {
      targetLabel = targetRecord.label;
    }

    // 저장된 label element 직접 사용
    if (targetLabel) {
      this.composerHeaderLabel.textContent = `reply to: ${targetLabel}`;
      SummarDebug.log(1, `Composer label updated to: Reply to: ${targetLabel}`);
    }
  }

  private resetComposerLabel(): void {
    if (!this.composerHeaderLabel) return;

    // 저장된 label element 직접 사용
    this.composerHeaderLabel.textContent = 'compose prompt';
    SummarDebug.log(1, 'Composer label reset to default');
  }

  cleanup(): void {
    // 리사이징 중단
    this.isResizing = false;
    
    // Splitter 이벤트 정리
    if (this.splitterAbortController) {
      this.splitterAbortController.abort();
      this.splitterAbortController = null;
    }
    
    // Splitter 제거
    if (this.splitter) {
      this.splitter.remove();
      this.splitter = null;
    }
    
    // 기타 DOM 요소 정리
    this.composerHeader = null;
    this.composerHeaderLabel = null;
    this.promptEditor = null;
    this.targetKey = null;
  }
}
