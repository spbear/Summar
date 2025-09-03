import { Platform, MarkdownView, normalizePath, setIcon } from "obsidian";
import { ISummarEventHandler, ISummarViewContext } from "./SummarViewTypes";
import { SummarDebug } from "../globals";
import { SummarMenuUtils, MenuItemConfig } from "./SummarMenuUtils";

/**
 * Item 레벨 이벤트 핸들러
 * 개별 결과 아이템들의 버튼 이벤트 (toggle, copy, new-note, upload-result 등) 처리
 */
export class SummarItemEventHandler implements ISummarEventHandler {
  constructor(private context: ISummarViewContext) {}

  setupEventListeners(): void {
    // 결과 아이템별 버튼 이벤트는 동적으로 생성되므로
    // 이벤트 위임(event delegation) 방식 사용
    this.context.resultContainer.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest('button') as HTMLButtonElement;
      
      if (!button) {
        // 버튼이 아닌 경우, result-header 클릭인지 확인
        const resultHeader = target.closest('.result-header') as HTMLDivElement;
        if (resultHeader) {
          const resultItem = resultHeader.closest('.result-item') as HTMLDivElement;
          const key = resultItem?.getAttribute('result-key');
          if (key) {
            this.handleHeaderClick(key);
            return;
          }
        }
        return;
      }
      
      const buttonId = button.getAttribute('button-id');
      const resultItem = button.closest('.result-item') as HTMLDivElement;
      const key = resultItem?.getAttribute('result-key');
      
      if (!key) return;
      
      switch (buttonId) {
        case 'new-note-button':
          this.handleNewNoteClick(key);
          break;
        case 'upload-result-to-wiki-button':
          this.handleUploadResultToWiki(key);
          break;
        case 'upload-result-to-slack-button':
          this.handleUploadResultToSlack(key);
          break;
        case 'copy-result-button':
          this.handleCopyResult(key);
          break;
        case 'show-menu-button':
          this.handleShowMenuClick(key, event);
          break;
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
      
      // sticky header container 내의 result-header를 클릭한 경우 toggle 처리
      const resultHeader = target.closest('.result-header') as HTMLDivElement;
      if (resultHeader && stickyHeaderContainer.contains(resultHeader)) {
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
    // result-header나 sticky header를 클릭했을 때 toggle 버튼 클릭과 동일한 동작
    const resultItem = this.context.resultContainer.querySelector(`[result-key="${key}"]`) as HTMLDivElement;
    if (resultItem) {
      const toggleButton = resultItem.querySelector('[button-id="toggle-fold-button"]') as HTMLButtonElement;
      if (toggleButton) {
        this.handleToggleClick(key, toggleButton);
      }
    }
  }

  private async handleNewNoteClick(key: string): Promise<void> {
    try {
      let noteName = this.getNoteName(key);
      const filePath = normalizePath(noteName);
      const existingFile = this.context.plugin.app.vault.getAbstractFileByPath(filePath);

      if (existingFile) {
        SummarDebug.log(1, `file exist: ${filePath}`);
        const leaves = this.context.plugin.app.workspace.getLeavesOfType("markdown");
        
        for (const leaf of leaves) {
          const view = leaf.view;
          if (view instanceof MarkdownView && view.file && view.file.path === filePath) {
            this.context.plugin.app.workspace.setActiveLeaf(leaf);
            return;
          }
        }
        await this.context.plugin.app.workspace.openLinkText(normalizePath(filePath), "", true);
      } else {
        SummarDebug.log(1, `file is not exist: ${filePath}`);
        const folderPath = filePath.substring(0, filePath.lastIndexOf("/"));
        const folderExists = await this.context.plugin.app.vault.adapter.exists(folderPath);
        if (!folderExists) {
          await this.context.plugin.app.vault.adapter.mkdir(folderPath);
        }
        
        const resultTextContent = this.getResultText(key);
        SummarDebug.log(1, `resultText content===\n${resultTextContent}`);
        await this.context.plugin.app.vault.create(filePath, resultTextContent);
        await this.context.plugin.app.workspace.openLinkText(normalizePath(filePath), "", true);
      }
    } catch (error) {
      SummarDebug.error(1, "Error creating/opening note:", error);
    }
  }

  private async handleUploadResultToWiki(key: string): Promise<void> {
    const resultText = this.getResultText(key);
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
      title = `Result_${key}`;
    }
    
    await this.uploadContentToWiki(title, resultText);
  }

  private async handleUploadResultToSlack(key: string): Promise<void> {
    const resultText = this.getResultText(key);
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
      title = `Result_${key}`;
    }
    
    await this.uploadContentToSlack(title, resultText);
  }

  private async handleCopyResult(key: string): Promise<void> {
    try {
      // Map 기반 저장소 사용 → resultManager 경유로 원문 취득
      const resultManager = (this.context as any).resultManager as { getResultText: (k: string) => string } | undefined;
      const result = resultManager?.getResultText(key) || '';
      await navigator.clipboard.writeText(result || '');
      SummarDebug.Notice(1, 'Content copied to clipboard');
    } catch (error) {
      SummarDebug.error(1, "Error copying to clipboard:", error);
      SummarDebug.Notice(0, 'Failed to copy content to clipboard');
    }
  }

  private handleShowMenuClick(key: string, event: MouseEvent): void {
    const button = event.target as HTMLButtonElement;
    
    const menuItems = SummarMenuUtils.createStandardMenuItems(key, this.context, false);

    SummarMenuUtils.showPopupMenu(button, menuItems, {
      zIndex: 1000,
      context: this.context
    });
  }

  private handleToggleClick(key: string, toggleButton: HTMLButtonElement): void {
    // 중복 실행 방지
    if ((this.context as any).isToggling) {
      SummarDebug.log(1, `Toggle already in progress for key: ${key}, skipping`);
      return;
    }
    
    (this.context as any).isToggling = true;
    
    try {
      const resultItem = toggleButton.closest('.result-item') as HTMLDivElement;
      const resultText = resultItem?.querySelector('.result-text') as HTMLDivElement;
      
      if (!resultItem || !resultText) {
        SummarDebug.log(1, `Could not find result item or text for key: ${key}`);
        return;
      }
      
      const currentToggled = toggleButton.getAttribute('toggled') === 'true';
      const newToggled = !currentToggled;
      
      // 버튼 상태 업데이트
      toggleButton.setAttribute('toggled', newToggled ? 'true' : 'false');
      this.setToggleButtonIcon(toggleButton, newToggled);
      
      // resultText 표시/숨김
      resultText.style.display = newToggled ? 'none' : 'block';
      
      // 통합 레코드에 접힘 상태 반영
      const rec = this.context.resultRecords.get(key);
      if (rec) {
        rec.folded = newToggled;
      }
      
      // 이벤트 발생 (StickyHeader 업데이트 등을 위해)
      // Note: 이벤트 시스템이 필요하면 resultManager를 통해 호출
      const resultManager = (this.context as any).resultManager;
      if (resultManager && resultManager.events && resultManager.events.onToggleStateChanged) {
        resultManager.events.onToggleStateChanged(key, newToggled);
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
    SummarMenuUtils.handleReply(key, false);
  }

  private handleDeleteResult(key: string): void {
    SummarMenuUtils.handleDeleteResult(key, this.context);
  }

  private setToggleButtonIcon(button: HTMLButtonElement, folded: boolean): void {
    setIcon(button, folded ? 'square-chevron-down' : 'square-chevron-up');
  }

  private getResultText(key: string): string {
    // Manager 경유(MAP) → attribute fallback 순서
    const resultManager = (this.context as any).resultManager as { getResultText: (k: string) => string } | undefined;
    return resultManager?.getResultText(key) || '';
  }

  private getNoteName(key: string): string {
    // ResultManager 경유해 통합 레코드 우선 사용
    const resultManager = (this.context as any).resultManager as { getNoteName: (k: string) => string } | undefined;
    if (resultManager) return resultManager.getNoteName(key);
    const rec = this.context.resultRecords.get(key);
    return rec?.noteName || "";
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
