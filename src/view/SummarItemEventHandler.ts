import { Platform, MarkdownView, normalizePath, setIcon } from "obsidian";
import { ISummarEventHandler, ISummarViewContext } from "./SummarViewTypes";
import { SummarDebug, openNote } from "../globals";
import { SummarMenuUtils, MenuItemConfig } from "./SummarMenuUtils";
import SummarPlugin from "src/main";
import { SummarAIParamType } from "../summarai-types";

/**
 * Item 레벨 이벤트 핸들러
 * 개별 결과 아이템들의 버튼 이벤트 (toggle, copy, new-note, upload-output 등) 처리
 */
export class SummarItemEventHandler implements ISummarEventHandler {
  constructor(private context: ISummarViewContext) {}

  setupEventListeners(): void {
    // 결과 아이템별 버튼 이벤트는 동적으로 생성되므로
    // 이벤트 위임(event delegation) 방식 사용
    this.context.outputContainer.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest('button') as HTMLButtonElement;
      
      if (!button) {
        // 버튼이 아닌 경우, output-header 클릭인지 확인
        const outputHeader = target.closest('.output-header') as HTMLDivElement;
        if (outputHeader) {
          const outputItem = outputHeader.closest('.output-item') as HTMLDivElement;
          const key = outputItem?.getAttribute('output-key');
          if (key) {
            this.handleHeaderClick(key);
            return;
          }
        }
        return;
      }
      
      const buttonId = button.getAttribute('button-id');
      const outputItem = button.closest('.output-item') as HTMLDivElement;
      const key = outputItem?.getAttribute('output-key');
      
      if (!key) return;
      
      switch (buttonId) {
        case 'new-note-button':
          this.handleNewNoteClick(key);
          break;
        case 'upload-output-to-wiki-button':
          this.handleUploadOutputToWiki(key);
          break;
        case 'upload-output-to-slack-button':
          this.handleUploadOutputToSlack(key);
          break;
        case 'reply-output-button':
          this.handleReplyOutput(key);
          break;
        case 'copy-output-button':
          this.handleCopyOutput(key);
          break;
        // case 'show-menu-button':
        //   this.handleShowMenuClick(key, event);
        //   break;
        case 'toggle-fold-button':
          this.handleToggleClick(key, button);
          break;
      }
    }, { signal: this.context.abortController.signal });

    // Sticky header 클릭 이벤트 처리
    this.setupStickyHeaderClickListener();
  }

  cleanup(): void {
    // AbortController가 이미 모든 이벤트 리스너를 정리하므로 추가 작업 없음
  }

  private setupStickyHeaderClickListener(): void {
    // Sticky header container에 대한 클릭 이벤트 처리
    // SummarView의 container에서 sticky header 클릭을 감지
    this.context.containerEl.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      
      // Sticky header container 영역 내에서 클릭이 발생했는지 확인
      const stickyHeaderContainer = target.closest('.sticky-header-container') as HTMLDivElement;
      if (!stickyHeaderContainer) {
        return;
      }
      
      // 버튼 클릭인 경우는 기존 처리에 맡김
      const button = target.closest('button') as HTMLButtonElement;
      if (button) {
        return;
      }
      
      // sticky header container 내의 output-header를 클릭한 경우 toggle 처리
      const outputHeader = target.closest('.output-header') as HTMLDivElement;
      if (outputHeader && stickyHeaderContainer.contains(outputHeader)) {
        const stickyHeaderManager = (this.context as any).stickyHeaderManager;
        if (stickyHeaderManager && stickyHeaderManager.getCurrentStickyKey) {
          const key = stickyHeaderManager.getCurrentStickyKey();
          if (key) {
            this.handleHeaderClick(key);
          }
        }
      }
    }, { signal: this.context.abortController.signal });
  }

  private handleHeaderClick(key: string): void {
    // output-header나 sticky header를 클릭했을 때 toggle 버튼 클릭과 동일한 동작
    const outputItem = this.context.outputContainer.querySelector(`[output-key="${key}"]`) as HTMLDivElement;
    if (outputItem) {
      const toggleButton = outputItem.querySelector('[button-id="toggle-fold-button"]') as HTMLButtonElement;
      if (toggleButton) {
        this.handleToggleClick(key, toggleButton);
      }
    }
  }

  private handleReplyOutput(key: string): void {
    // SummarMenuUtils를 통해 통합된 reply 처리
    SummarMenuUtils.handleReply(key, this.context, false);
  }

  private async handleNewNoteClick(key: string): Promise<void> {
    let outputTextContent = '';
    const rec = this.context.outputRecords.get(key);
    if (rec) {
      outputTextContent = this.getNoteContent(key);
    }

    await openNote(this.context.plugin, this.getNoteName(key), outputTextContent);
  }

  private async handleUploadOutputToWiki(key: string): Promise<void> {
    const outputText = this.getOutputText(key);
    let title = this.getNoteName(key);
    
    // '/' 이후부터 '.md' 이전까지의 문자열 추출
    const lastSlashIndex = title.lastIndexOf('/');
    if (lastSlashIndex !== -1) {
      title = title.substring(lastSlashIndex + 1);
    }
    
    if (title.endsWith('.md')) {
      title = title.substring(0, title.length - 3);
    }
    
    // title이 비어있다면 기본값 설정
    if (!title) {
      title = `Output_${key}`;
    }
    
    await this.uploadContentToWiki(title, outputText);
  }

  private async handleUploadOutputToSlack(key: string): Promise<void> {
    const outputText = this.getOutputText(key);
    let title = this.getNoteName(key);
    
    // '/' 이후부터 '.md' 이전까지의 문자열 추출
    const lastSlashIndex = title.lastIndexOf('/');
    if (lastSlashIndex !== -1) {
      title = title.substring(lastSlashIndex + 1);
    }
    
    if (title.endsWith('.md')) {
      title = title.substring(0, title.length - 3);
    }
    
    // title이 비어있다면 기본값 설정
    if (!title) {
      title = `Output_${key}`;
    }
    
    await this.uploadContentToSlack(title, outputText);
  }

  private async handleCopyOutput(key: string): Promise<void> {
    try {
      // Map 기반 저장소 사용 → outputManager 경유로 원문 취득
      const outputManager = (this.context as any).outputManager as { getOutputText: (k: string) => string } | undefined;
      const output = outputManager?.getOutputText(key) || '';
      await navigator.clipboard.writeText(output || '');
      SummarDebug.Notice(1, 'Content copied to clipboard');
    } catch (error) {
      SummarDebug.error(1, "Error copying to clipboard:", error);
      SummarDebug.Notice(0, 'Failed to copy content to clipboard');
    }
  }

  // private handleShowMenuClick(key: string, event: MouseEvent): void {
  //   const button = event.target as HTMLButtonElement;
    
  //   const menuItems = SummarMenuUtils.createStandardMenuItems(key, this.context, false);

  //   SummarMenuUtils.showPopupMenu(button, menuItems, {
  //     zIndex: 1000,
  //     context: this.context
  //   });
  // }

  private handleToggleClick(key: string, toggleButton: HTMLButtonElement): void {
    // 중복 실행 방지
    if ((this.context as any).isToggling) {
      SummarDebug.log(1, `Toggle already in progress for key: ${key}, skipping`);
      return;
    }
    
    (this.context as any).isToggling = true;
    
    try {
      const outputItem = toggleButton.closest('.output-item') as HTMLDivElement;
      const outputText = outputItem?.querySelector('.output-text') as HTMLDivElement;
      
      if (!outputItem || !outputText) {
        SummarDebug.log(1, `Could not find output item or text for key: ${key}`);
        return;
      }
      
      const currentToggled = toggleButton.getAttribute('toggled') === 'true';
      const newToggled = !currentToggled;
      
      // SummarDebug.log(1, `handleToggleClick - key: ${key}, currentToggled: ${currentToggled}, newToggled: ${newToggled}`);
      
      // OutputManager의 foldOutput 메서드를 사용하여 일관된 fold/unfold 처리
      const outputManager = (this.context as any).outputManager;
      if (outputManager && outputManager.foldOutput) {
        outputManager.foldOutput(key, newToggled);
      } else {
        // Fallback: 직접 DOM 조작
        // SummarDebug.log(1, `handleToggleClick - using fallback DOM manipulation`);
        toggleButton.setAttribute('toggled', newToggled ? 'true' : 'false');
        this.setToggleButtonIcon(toggleButton, newToggled);
        outputText.style.display = newToggled ? 'none' : 'block';
      }
      
      // 통합 레코드에 접힘 상태 반영
      const rec = this.context.outputRecords.get(key);
      if (rec) {
        rec.folded = newToggled;
      }
      
      // 이벤트 발생 (StickyHeader 업데이트 등을 위해)
      if (outputManager && outputManager.events && outputManager.events.onToggleStateChanged) {
        outputManager.events.onToggleStateChanged(key, newToggled);
      }
      
    } finally {
      // 플래그 해제
      const timeoutId = setTimeout(() => {
        (this.context as any).isToggling = false;
      }, 100);
      this.context.timeoutRefs.add(timeoutId);
    }
  }

  private handleReply(key: string): void {
    SummarMenuUtils.handleReply(key, this.context, false);
  }

  private handleDeleteOutput(key: string): void {
    SummarMenuUtils.handleDeleteOutput(key, this.context);
  }

  private setToggleButtonIcon(button: HTMLButtonElement, folded: boolean): void {
    setIcon(button, folded ? 'square-chevron-down' : 'square-chevron-up');
  }

  private getOutputText(key: string): string {
    // Manager 경유(MAP) → attribute fallback 순서
    const outputManager = (this.context as any).outputManager as { getOutputText: (k: string) => string } | undefined;
    return outputManager?.getOutputText(key) || '';
  }

  private getNoteName(key: string): string {
    // OutputManager 경유해 통합 레코드 우선 사용
    const outputManager = (this.context as any).outputManager as { getNoteName: (k: string) => string } | undefined;
    if (outputManager) return outputManager.getNoteName(key);
    const rec = this.context.outputRecords.get(key);
    return rec?.noteName || "";
  }
  
  private getNoteContent(key: string) : string {
    const outputManager = (this.context as any).outputManager as { getNoteContent: (k: string) => string } | undefined;
    if (outputManager) return outputManager.getNoteContent(key);

    return '';
  }

  // 업로드 메서드들 (원래 SummarView에서 이동)
  private async uploadContentToWiki(title: string, content: string): Promise<void> {
    // 기존 uploadContentToWiki 로직
    // 여기서는 간단히 SummarUploadManager로 위임
    const uploadManager = (this.context as any).uploadManager;
    if (uploadManager) {
      await uploadManager.uploadContentToWiki(title, content);
    }
  }

  private async uploadContentToSlack(title: string, content: string): Promise<void> {
    // 기존 uploadContentToSlack 로직
    // 여기서는 간단히 SummarUploadManager로 위임
    const uploadManager = (this.context as any).uploadManager;
    if (uploadManager) {
      await uploadManager.uploadContentToSlack(title, content);
    }
  }
}
