import { setIcon } from "obsidian";
import { ISummarComposerManager, ISummarViewContext, SummarOutputRecord } from "./SummarViewTypes";
import { SummarDebug } from "../globals";
import { createComposerHeader, ComposerHeaderButtonsSet } from "./SummarHeader";
import { SummarAI } from "../summarai";
import { SummarAIParam, SummarAIParamType } from "../summarai-types";

/**
 * Composer 기능 관리자
 * 채팅 컨테이너 및 메시지 처리를 담당
 */
export class SummarComposerManager implements ISummarComposerManager {
  private composerHeader: HTMLDivElement | null = null;
  private composerHeaderLabel: HTMLElement | null = null;
  private promptEditor: HTMLTextAreaElement | null = null;
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

    // createComposerHeader 사용
    const header = createComposerHeader('compose prompt', buttons, this.context, { 
      icon: 'message-square',
      selectedModel: this.context.plugin.settingsv2.conversation.conversationModel ? this.context.plugin.settingsv2.conversation.conversationModel : 'gpt-4.1-mini'
    });

    // label element 참조 저장
    this.composerHeaderLabel = header.querySelector('.composer-label-text') as HTMLElement;

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
      padding: 6px 6px 6px 12px;
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
      // SummarDebug.log(2, 'IME composition started');
    });

    // IME 조합 완료 이벤트
    promptEditor.addEventListener('compositionend', () => {
      isComposing = false;
      // SummarDebug.log(2, 'IME composition ended');
    });

    // Enter 키 이벤트 추가 (IME 조합 중일 때는 무시)
    promptEditor.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // IME 조합 중일 때는 엔터 이벤트 무시
        if (isComposing) {
          // SummarDebug.log(2, 'Enter key ignored during IME composition');
          return;
        }
        
        e.preventDefault();
        const message = promptEditor.value.trim();
        if (message) {
          // SummarDebug.log(1, `Sending message: "${message}"`);
          this.sendMessage(message);
        }
      }
      
      // ESC 키 처리 - composer 닫기
      if (e.key === 'Escape') {
        e.preventDefault();
        this.hideComposerContainer();
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
      // composerContainer가 표시된 경우
      const currentComposerHeight = parseInt(this.context.composerContainer.style.height) || 200;
      
      // 현재 composer 높이로 가용성 체크
      const { canShow } = this.canShowComposer(currentComposerHeight);
      
      if (!canShow) {
        // canShow가 false가 되면 composer를 자동으로 숨김
        SummarDebug.log(1, `View resized: composer cannot be shown anymore (height=${currentComposerHeight}px), hiding automatically`);
        this.hideComposerContainer();
        return;
      }
      
      // canShow가 true면 기존 높이 유지하면서 리사이징
      this.resizeComposerContainer(currentComposerHeight);
      SummarDebug.log(1, `View resized: composer visible, maintained height ${currentComposerHeight}px`);
    } else {
      // composerContainer가 숨겨진 경우 outputContainer를 전체 크기로 복원
      // canShow가 true가 되어도 자동으로 보여주지는 않음 (사용자 의도 존중)
      const containerRect = this.context.containerEl.getBoundingClientRect();
      const inputHeight = 60; // 대략적인 input + button 영역 높이
      const statusBarMargin = 6; // outputContainer의 기본 하단 간격
      const fullOutputHeight = containerRect.height - inputHeight - statusBarMargin;
      
      this.context.outputContainer.style.height = `${fullOutputHeight}px`;
      
      SummarDebug.log(1, `View resized: composer hidden, output height restored to ${fullOutputHeight}px`);
    }
  }

  /**
   * Composer를 표시할 수 있는지 확인합니다
   * @param proposedHeight 제안된 composer 높이
   * @returns 표시 가능 여부와 관련 정보
   */
  canShowComposer(proposedHeight: number): { canShow: boolean; containerHeight: number; maxAllowedHeight: number } {
    const containerHeight = this.context.containerEl.getBoundingClientRect().height;
    const maxAllowedHeight = containerHeight / 2;
    
    return {
      canShow: proposedHeight <= maxAllowedHeight,
      containerHeight,
      maxAllowedHeight
    };
  }

  newPrompt(): void {

    // targetKey 초기화 및 하이라이팅 제거
    this.targetKey = null;
    this.clearAllHighlighting();
    this.resetComposerLabel();
    this.showComposerContainer();

    // this.isComposerVisible = !this.isComposerVisible;

    // if (this.isComposerVisible) {
    //   this.showComposerContainer();
    // } else {
    //   this.hideComposerContainer();
    // }
  }

  async linkNote(filePath: string): Promise<void> {
    this.targetKey = null;
    this.clearAllHighlighting();

    const segments = filePath.split(/[\\\/]/);
    const lastSegment = segments.length > 0 ? segments[segments.length - 1] : filePath;
    const dotIndex = lastSegment.lastIndexOf('.');
    const displayName = dotIndex > 0 ? lastSegment.slice(0, dotIndex) : lastSegment;
    this.setComposerLabel(displayName);

    this.targetKey = this.context.plugin.generateUniqueId();


    if (this.context.outputManager) {
      let rec = this.context.outputRecords.get(this.targetKey);
      if (!rec) {
        // this.context.outputManager.setNewNoteName(this.targetKey, filePath);

        const rec = new SummarOutputRecord(this.targetKey);
        rec.noteName = filePath;
        rec.label = displayName;
        rec.noteName = filePath;
        rec.syncNote = true;
        const notePrompt = "I will provide the full content of a note.\n" + 
                           "Please read and understand the note carefully.\n" +
                           "After that, I will ask you a question. When answering, \n" + 
                           "make sure to base your response primarily on the content of the note, \n "+ 
                           "while also using your own reasoning if necessary. " + 
                           "Do not ignore or overlook the note — it is the main context for your answer";

        const noteContent = await this.context.plugin.app.vault.adapter.read(filePath).catch((error) => {
          SummarDebug.log(1, `Failed to read note content: ${error}`);
          return '';
        });

        
        rec.conversations.push(new SummarAIParam('user', notePrompt, SummarAIParamType.NOTESYNC));
        rec.conversations.push(new SummarAIParam('assistant', noteContent, SummarAIParamType.NOTESYNC));
        this.context.outputRecords.set(this.targetKey, rec);
        
SummarDebug.log(1, `filePath: ${filePath}`);       
      }
    }

    this.showComposerContainer();
    SummarDebug.log(1, `Composer linked to note: ${displayName} (key: ${this.targetKey})`);
  }

  showComposerContainer(): void {
    const proposedHeight = 200;
    const { canShow, containerHeight, maxAllowedHeight } = this.canShowComposer(proposedHeight);
    
    // 높이 제한 검사 - composer가 전체 높이의 절반보다 클 경우 표시하지 않음
    if (!canShow) {
      // 사용자에게 알림
      SummarDebug.Notice(0, `Composer cannot be shown: required height (${proposedHeight}px) exceeds half of view height (${Math.floor(maxAllowedHeight)}px)`);
      
      SummarDebug.log(1, `Composer display blocked: containerHeight=${containerHeight}px, maxAllowed=${maxAllowedHeight}px, proposed=${proposedHeight}px`);
      return;
    }
    
    const composerHeight = proposedHeight;
    
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
    
    // 입력창에 포커스 설정
    if (this.promptEditor) {
      // DOM 업데이트 완료 후 포커스 설정을 위해 짧은 지연
      setTimeout(() => {
        if (this.promptEditor) {
          this.promptEditor.focus();
          SummarDebug.log(2, 'Focus set to prompt editor');
        }
      }, 50);
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

    // SummarDebug.Notice(1, `Composer message: ${message}`);
    // Get selected model from modelchip
    const selectedModel = this.getSelectedModel();
    const summarai = new SummarAI(this.context.plugin, selectedModel, 'conversation');
    if (!summarai.hasKey(true)) return;
    
    // 입력 필드 초기화
    if (this.promptEditor) {
      this.promptEditor.value = '';
    }

    if (!this.targetKey && this.context.outputManager) {
      this.targetKey = this.context.plugin.generateUniqueId();
    }

    if (this.targetKey && this.context.outputManager) {
      let rec = this.context.outputRecords.get(this.targetKey) || null;
      if (!rec || !rec.itemEl) {
        const composerLabel = this.composerHeaderLabel?.textContent || 'compose prompt';
        const headerLabel = composerLabel === 'compose prompt' ? 'conversation' : composerLabel;

        rec = this.context.outputRecords.get(this.targetKey) || null;

        let outputText = '';
        if (rec?.syncNote) {
          const encodedPath = encodeURI(rec.noteName as string).replace(/%5B/g, '[').replace(/%5D/g, ']'); // 공백·한글 처리
          outputText = `[${rec.label}](${encodedPath})`;
        }
        this.context.plugin.updateOutputText(this.targetKey,
                                            headerLabel,
                                            outputText,
                                            false);

        const outputItem = rec?.itemEl || null;
        if (outputItem) {
          if (rec?.syncNote) {
            this.context.outputManager.enableOutputItemButtons(outputItem as HTMLDivElement, 
              [
                'new-note-button',
                'upload-output-to-wiki-button', 
                'upload-output-to-slack-button',
                'copy-output-button',
                'reply-output-button'
              ]
            );
          } else {
            this.context.outputManager.enableOutputItemButtons(outputItem as HTMLDivElement, ['reply-output-button']);
          }
        }
        this.setOutput(this.targetKey);
      }

      const result = this.context.outputManager.addConversation(this.targetKey, 'user', message);

      // summarai.complete()에 전달할 conversations 준비
      const conversationsForAI = this.prepareConversations(result.conversations, selectedModel);
      
      // 임시 응답 생성 - AI 응답 대기 중 표시
      const resultResponse = this.context.outputManager.addConversation(this.targetKey, 'assistant', '.');
      this.scrollToLatestConversation(this.targetKey);
      
      // 진행 상황 애니메이션 타이머 시작
      let dotCount = 1;
      const thinkingTimer = setInterval(() => {
        if (this.targetKey && resultResponse.addedIndex >= 0 && this.context.outputManager) {
          dotCount++;
          const dots = '.'.repeat(dotCount);
          this.context.outputManager.updateConversation(this.targetKey, resultResponse.addedIndex, dots);
        }
      }, 500); // 500ms마다 점 추가
      
      this.context.timeoutRefs.add(thinkingTimer);
      
      try {
        await summarai.complete(conversationsForAI);
        
        // AI 응답 완료 후 실제 응답으로 교체
        const status = summarai.response.status;
        const response = summarai.response.text;
        if (this.targetKey && resultResponse.addedIndex >= 0 && this.context.outputManager) {
          this.context.outputManager.updateConversation(this.targetKey, resultResponse.addedIndex, response);
        }
      } catch (error) {
        // AI 호출 실패 시 에러 메시지 표시
        if (this.targetKey && resultResponse.addedIndex >= 0 && this.context.outputManager) {
          this.context.outputManager.updateConversation(this.targetKey, resultResponse.addedIndex, 'Error: Failed to get AI response');
        }
        SummarDebug.log(1, `AI completion error: ${error}`);
      } finally {
        // 타이머 정리
        clearInterval(thinkingTimer);
        this.context.timeoutRefs.delete(thinkingTimer);
      }      
      // 새로 추가된 conversation-item으로 스크롤
      this.scrollToLatestConversation(this.targetKey);
      
      SummarDebug.log(1, `Message sent to output key: ${this.targetKey}`);
    } else {
      SummarDebug.log(1, `No target key set for conversation`);
    }
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
      this.context.outputManager.setHeaderHighlight(key);
    }
    if (this.context.stickyHeaderManager) {
      this.context.stickyHeaderManager.setHeaderHighlight(key);
    }
  }

  private clearAllHighlighting(): void {
    if (this.context.outputManager) {
      this.context.outputManager.clearHeaderHighlight();
    }
    if (this.context.stickyHeaderManager) {
      this.context.stickyHeaderManager.clearHeaderHighlight();
    }
  }

  private updateComposerLabel(key: string): void {
    const targetRecord = this.context.outputRecords.get(key);
    let targetLabel = '';
    
    if (targetRecord && targetRecord.label) {
      targetLabel = targetRecord.label;
    }

    if (targetLabel) {
      this.setComposerLabel(`reply to: ${targetLabel}`);
      SummarDebug.log(1, `Composer label updated to: Reply to: ${targetLabel}`);
    }
  }

  private resetComposerLabel(): void {
    this.setComposerLabel('compose prompt');
    SummarDebug.log(1, 'Composer label reset to default');
  }

  private setComposerLabel(label: string): void {
    if (!this.composerHeaderLabel) return;
    this.composerHeaderLabel.textContent = label;
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

  /**
   * 특정 key의 가장 최근 conversation-item으로 스크롤합니다.
   */
  private scrollToLatestConversation(key: string): void {
    // DOM 업데이트가 완료될 때까지 잠시 대기
    const timeoutId = setTimeout(() => {
      try {
        const outputItem = this.context.outputRecords.get(key)?.itemEl;
        if (!outputItem) {
          SummarDebug.log(1, `Output item not found for scrolling: ${key}`);
          return;
        }

        // 해당 outputItem 내의 모든 conversation-item 찾기
        const conversationItems = outputItem.querySelectorAll('.conversation-item');
        if (conversationItems.length === 0) {
          SummarDebug.log(1, `No conversation items found for scrolling: ${key}`);
          return;
        }

        // 마지막 conversation-item
        const lastConversationItem = conversationItems[conversationItems.length - 1] as HTMLElement;
        
        // 스크롤 동작 실행
        lastConversationItem.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });

        SummarDebug.log(1, `Scrolled to latest conversation item for key: ${key}`);
      } catch (error) {
        SummarDebug.log(1, `Error scrolling to conversation: ${error}`);
      }
    }, 100); // DOM 업데이트 후 스크롤 실행

    this.context.timeoutRefs.add(timeoutId);
  }

  /**
   * AI에 전달할 대화 내역을 준비합니다.
   * - type이 'output'인 항목들은 모두 유지
   * - type이 'conversation'인 항목들은 최근 3개만 선택
   * - Gemini 모델의 경우 'assistant' role을 'model'로 변환
   */
  private prepareConversations(conversations: SummarAIParam[], selectedModel: string): SummarAIParam[] {
    // 1. type별로 분리
    const outputConversations = conversations.filter(conv => conv.type === 'output');
    const noteItems = conversations.filter(conv => conv.type === 'notesync');
    const conversationItems = conversations.filter(conv => conv.type === 'conversation');
    
    // 2. conversation 타입은 최근 15개만 선택
    const recentConversations = conversationItems.slice(-15);
    
    // 3. 순서를 유지하면서 합치기 (output + 최근 conversation)
    const filteredConversations = [...outputConversations, ...noteItems, ...recentConversations];
    
    // 4. Gemini 모델인 경우 assistant -> model 변환
    if (selectedModel.includes('gemini')) {
      return filteredConversations.map(conv => {
        if (conv.role === 'assistant') {
          return new SummarAIParam('model', conv.text, conv.type);
        }
        return conv; // 'user' 등 다른 role은 그대로 유지
      });
    } else {
      // Gemini가 아닌 모델일 경우 원본 그대로 반환
      return filteredConversations;
    }
  }

  // Get selected model from modelchip in composer header
  private getSelectedModel(): string {
    try {
      const composerElement = this.context.containerEl.querySelector('.composer-header');
      if (!composerElement) {
        return 'gpt-4.1-mini'; // fallback
      }

      const modelChip = composerElement.querySelector('.composer-model-chip') as HTMLElement;
      if (!modelChip) {
        return 'gpt-4.1-mini'; // fallback
      }

      const selectedModel = modelChip.getAttribute('data-model');
      return selectedModel || 'gpt-4.1-mini'; // fallback
    } catch (error) {
      SummarDebug.log(1, `Error getting selected model: ${error}`);
      return 'gpt-4.1-mini'; // fallback
    }
  }
}
