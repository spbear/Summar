import { Platform, MarkdownView, normalizePath, setIcon } from "obsidian";
import { ISummarEventHandler, ISummarViewContext } from "./SummarViewTypes";
import { SummarDebug } from "../globals";

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
      
      if (!button) return;
      
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
  }

  cleanup(): void {
    // AbortController가 이미 모든 이벤트 리스너를 정리하므로 추가 작업 없음
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
    const rect = button.getBoundingClientRect();
    
    // 기존 팝업 메뉴가 있다면 제거
    const existingMenu = document.querySelector('.item-popup-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    // 팝업 메뉴 생성 (임시로 화면 밖에 배치하여 크기 측정)
    const menu = document.createElement('div');
    menu.className = 'item-popup-menu';
    menu.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      background: var(--background-primary);
      border: 1px solid var(--background-modifier-border);
      border-radius: 5px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 1000;
      min-width: 150px;
      padding: 4px;
      visibility: hidden;
    `;

    // 메뉴 아이템들 생성
    const menuItems = [
      { label: 'Reply', action: () => this.handleReply(key) },
      { label: 'Delete result', action: () => this.handleDeleteResult(key) }
    ];

    menuItems.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.className = 'item-menu-item';
      menuItem.textContent = item.label;
      menuItem.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        border-radius: 3px;
        color: var(--text-normal);
      `;
      
      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.backgroundColor = 'var(--background-modifier-hover)';
      });
      
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.backgroundColor = 'transparent';
      });
      
      menuItem.addEventListener('click', () => {
        item.action();
        menu.remove();
        // 스크롤 이벤트 리스너 제거
        this.context.resultContainer.removeEventListener('scroll', closeMenuOnScroll);
      });
      
      menu.appendChild(menuItem);
    });

    // 임시로 DOM에 추가하여 크기 측정
    document.body.appendChild(menu);
    const menuRect = menu.getBoundingClientRect();

    // 메뉴 위치 계산
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    // 기본적으로 버튼의 오른쪽 아래에 배치
    let menuTop = rect.bottom + 5;
    let menuLeft = rect.right - menuRect.width;

    // 화면 오른쪽을 벗어나는 경우 버튼 왼쪽으로 이동
    if (menuLeft < 0) {
      menuLeft = rect.left;
    }

    // 화면 하단을 벗어나는 경우 버튼 위쪽으로 이동
    if (menuTop + menuRect.height > viewportHeight) {
      menuTop = rect.top - menuRect.height - 5;
    }

    // 최종 위치 설정
    menu.style.cssText = `
      position: fixed;
      top: ${menuTop}px;
      left: ${menuLeft}px;
      background: var(--background-primary);
      border: 1px solid var(--background-modifier-border);
      border-radius: 5px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 1000;
      min-width: 150px;
      padding: 4px;
      visibility: visible;
    `;

    // 스크롤 시 메뉴 닫기를 위한 이벤트 리스너
    const closeMenuOnScroll = () => {
      menu.remove();
      this.context.resultContainer.removeEventListener('scroll', closeMenuOnScroll);
      document.removeEventListener('click', closeMenu);
    };

    // 메뉴 외부 클릭 시 닫기
    const closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
        this.context.resultContainer.removeEventListener('scroll', closeMenuOnScroll);
      }
    };
    
    // 스크롤 이벤트 리스너 추가
    this.context.resultContainer.addEventListener('scroll', closeMenuOnScroll);
    
    // 약간의 지연 후 이벤트 리스너 추가 (현재 클릭 이벤트가 즉시 닫히는 것을 방지)
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 100);
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
    SummarDebug.Notice(1, `Reply: ${key}`);
  }

  private handleDeleteResult(key: string): void {
    const resultManager = (this.context as any).resultManager;
    if (resultManager && resultManager.deleteResultItem) {
      resultManager.deleteResultItem(key);
    }
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
