import { MarkdownView, normalizePath } from "obsidian";
import { ISummarEventHandler, ISummarViewContext } from "./SummarViewTypes";
import { SummarDebug } from "../globals";

/**
 * Container 레벨 이벤트 핸들러
 * UI 상단의 고정 버튼들 (fetch, PDF, record, test, upload) 처리
 */
export class SummarContainerEventHandler implements ISummarEventHandler {
  constructor(private context: ISummarViewContext) {}

  setupEventListeners(): void {
    this.setupUIButtonEvents();        // fetch, PDF, record 버튼
    this.setupUploadEvents();          // Wiki, Slack 업로드 버튼
    this.setupTestButtonEvent();       // 테스트 메뉴 버튼
  }

  cleanup(): void {
    // AbortController가 이미 모든 이벤트 리스너를 정리하므로 추가 작업 없음
  }

  private setupUploadEvents(): void {
    // Upload to Wiki 버튼 이벤트
    const uploadWikiButton = this.context.containerEl.querySelector('button[aria-label*="Upload Note to Confluence"]') as HTMLButtonElement;
    if (uploadWikiButton) {
      uploadWikiButton.addEventListener("click", async() => {
        const viewType = await this.getCurrentMainPaneTabType();
        if (viewType === "markdown") {
          const file = this.context.plugin.app.workspace.getActiveFile();
          if (file) {
            let title = file.basename;
            const content = await this.context.plugin.app.vault.read(file);
            await this.uploadContentToWiki(title, content);
          } else {
            SummarDebug.Notice(0, "No active editor was found.");
          }
        } else {
          this.showUploadFailedMessage("Wiki Upload Failed", "No active editor was found.");
        }
      }, { signal: this.context.abortController.signal });
    }

    // Upload to Slack 버튼 이벤트
    const uploadSlackButton = this.context.containerEl.querySelector('button[aria-label*="Slack"]') as HTMLButtonElement;
    if (uploadSlackButton) {
      uploadSlackButton.addEventListener("click", async() => {
        const viewType = await this.getCurrentMainPaneTabType();
        if (viewType === "markdown") {
          const file = this.context.plugin.app.workspace.getActiveFile();
          if (file) {
            let title = file.basename;
            const content = await this.context.plugin.app.vault.read(file);
            await this.uploadContentToSlack(title, content);
          } else {
            SummarDebug.Notice(0, "No active editor was found.");
          }
        } else {
          const messageTitle = this.context.plugin.SLACK_UPLOAD_TO_CANVAS 
            ? "Slack Canvas Upload Failed" 
            : "Slack Message Send Failed";
          this.showUploadFailedMessage(messageTitle, "No active editor was found.");
        }
      }, { signal: this.context.abortController.signal });
    }
  }

  private setupTestButtonEvent(): void {
    const testButton = this.context.containerEl.querySelector('button[button-id="test-button"]') as HTMLButtonElement;
    if (testButton) {
      testButton.addEventListener("click", (event) => {
        event.stopPropagation();
        this.showTestPopupMenu(event);
      }, { signal: this.context.abortController.signal });
    }
  }

  private setupUIButtonEvents(): void {
    // Container 레벨에서 이벤트 위임 방식으로 UI 버튼들 처리
    this.context.containerEl.addEventListener('click', async (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest('button') as HTMLButtonElement | null;
      if (!button) return;

      const buttonId = button.getAttribute('button-id');
      
      switch (buttonId) {
        case 'fetch-button':
          await this.handleFetchClick();
          break;
        case 'pdf-button':
          await this.handlePdfClick();
          break;
        case 'record-button':
          await this.handleRecordClick();
          break;
      }
    }, { signal: this.context.abortController.signal });
  }

  private async handleFetchClick(): Promise<void> {
    const urlInputField = this.context.plugin.urlInputField;
    if (!urlInputField) {
      SummarDebug.Notice(0, "Input field not found.");
      return;
    }
    
    const url = urlInputField.value.trim();
    if (!url) {
      SummarDebug.Notice(0, "Please enter a valid URL.");
      return;
    }
    
    this.context.plugin.confluenceHandler.fetchAndSummarize(url);
  }

  private async handlePdfClick(): Promise<void> {
    this.context.plugin.pdfHandler.convertPdfToMarkdown();
  }

  private async handleRecordClick(): Promise<void> {
    await this.context.plugin.toggleRecording();
  }

  private showTestPopupMenu(event: MouseEvent): void {
    const button = event.target as HTMLButtonElement;
    const rect = button.getBoundingClientRect();
    
    // 기존 팝업 메뉴가 있다면 제거
    const existingMenu = document.querySelector('.test-popup-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    // 팝업 메뉴 생성
    const menu = document.createElement('div');
    menu.className = 'test-popup-menu';
    menu.style.cssText = `
      position: fixed;
      top: ${rect.bottom + 5}px;
      left: ${rect.left}px;
      background: var(--background-primary);
      border: 1px solid var(--background-modifier-border);
      border-radius: 5px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 1000;
      min-width: 180px;
      padding: 4px;
    `;

    // 메뉴 아이템들 생성
    const menuItems = [
      { label: 'New prompt', action: () => this.handleComposer() },
      { label: 'Load conversation', action: () => this.handleLoadAllOutputs() },
      { label: 'Save all conversations', action: () => this.handleSaveAllOutputs() },
      { label: 'Clear all conversations', action: () => this.handleDeleteAllOutputs() }
    ];

    menuItems.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.className = 'test-menu-item';
      menuItem.textContent = item.label;
      menuItem.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        border-radius: 3px;
        color: var(--text-normal);
        font-size: var(--font-ui-small);
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
      });
      
      menu.appendChild(menuItem);
    });

    document.body.appendChild(menu);

    // 메뉴 외부 클릭 시 닫기
    const closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    
    // 약간의 지연 후 이벤트 리스너 추가 (현재 클릭 이벤트가 즉시 닫히는 것을 방지)
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 100);
  }

  private handleDeleteAllOutputs(): void {
    this.context.outputRecords.clear();
    this.context.outputContainer.empty();
    SummarDebug.Notice(1, "All output items have been deleted");
  }

  private async handleSaveAllOutputs(): Promise<void> {
    try {
      const mgr = (this.context as any).outputManager as { saveOutputItemsToPluginDir: () => Promise<string> } | undefined;
      const path = await mgr?.saveOutputItemsToPluginDir();
      if (path) {
        SummarDebug.Notice(1, `Saved output items to ${path}`);
      }
    } catch (error) {
      SummarDebug.error(1, 'Failed to save output items:', error);
      SummarDebug.Notice(0, 'Failed to save output items. Check console for details.');
    }
  }

  private async handleComposer(): Promise<void> {
    const composerManager = (this.context as any).composerManager;
    if (composerManager && composerManager.toggleComposerContainer) {
      composerManager.toggleComposerContainer();
    }
  }

  private async handleLoadAllOutputs(): Promise<void> {
    try {
      // 플러그인 디렉토리에서 JSON 파일들 찾기
      const plugin = this.context.plugin;
      const conversationsDir = normalizePath(`${plugin.PLUGIN_DIR}/conversations`);

      try {
        // conversations 디렉토리만 생성 (파일명이 아닌 디렉토리)
        const exists = await this.context.plugin.app.vault.adapter.exists(conversationsDir);
        if (!exists) {
          await this.context.plugin.app.vault.createFolder(conversationsDir);
          SummarDebug.log(1, "Directory created:", conversationsDir);
        }
      } catch (error) {
        // 폴백으로 adapter.mkdir 시도
        try {
          await this.context.plugin.app.vault.adapter.mkdir(conversationsDir);
          SummarDebug.log(1, "Directory created via adapter:", conversationsDir);
        } catch (adapterError) {
          SummarDebug.error(1, "Failed to create directory:", conversationsDir, adapterError);
          throw new Error(`Failed to create directory: ${conversationsDir}`);
        }
      }
      
      // 디렉토리가 존재하는지 확인
      const dirExists = await plugin.app.vault.adapter.exists(conversationsDir);
      if (!dirExists) {
        SummarDebug.Notice(0, "conversations directory not found");
        return;
      }

      // 디렉토리의 파일 목록 가져오기
      const files = await plugin.app.vault.adapter.list(conversationsDir);
      const jsonFiles = files.files
        .filter(file => file.endsWith('.json') && file.includes('summar-conversations'))
        .map(file => file.replace(`${conversationsDir}/`, '')) // 상대 경로로 변환
        .sort((a, b) => b.localeCompare(a)); // 최신 파일이 위로 오도록 정렬

      if (jsonFiles.length === 0) {
        SummarDebug.Notice(1, "No saved result files found");
        return;
      }

      // JSON 파일 선택 메뉴 표시
      this.showFileSelectionMenu(jsonFiles);

    } catch (error) {
      SummarDebug.error(1, 'Failed to list result files:', error);
      SummarDebug.Notice(0, 'Failed to list result files. Check console for details.');
    }
  }

  private showFileSelectionMenu(jsonFiles: string[]): void {
    // 기존 팝업 메뉴가 있다면 제거
    const existingMenu = document.querySelector('.file-selection-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    // 팝업 메뉴 생성
    const menu = document.createElement('div');
    menu.className = 'file-selection-menu';
    menu.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--background-primary);
      border: 1px solid var(--background-modifier-border);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      z-index: 1000;
      min-width: 400px;
      max-width: 600px;
      max-height: 500px;
      overflow-y: auto;
      padding: 16px;
    `;

    // 제목 추가
    const title = document.createElement('div');
    title.textContent = 'Select a file to load:';
    title.style.cssText = `
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 12px;
      color: var(--text-normal);
      text-align: center;
    `;
    menu.appendChild(title);

    // 파일 목록 추가
    jsonFiles.forEach(filename => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-menu-item';
      fileItem.textContent = filename;
      fileItem.style.cssText = `
        padding: 12px 16px;
        cursor: pointer;
        border-radius: 4px;
        color: var(--text-normal);
        border-bottom: 1px solid var(--background-modifier-border);
        font-family: var(--font-monospace);
        font-size: 14px;
      `;
      
      fileItem.addEventListener('mouseenter', () => {
        fileItem.style.backgroundColor = 'var(--background-modifier-hover)';
      });
      
      fileItem.addEventListener('mouseleave', () => {
        fileItem.style.backgroundColor = 'transparent';
      });
      
      fileItem.addEventListener('click', async () => {
        menu.remove();
        await this.loadSelectedFile(filename);
      });
      
      menu.appendChild(fileItem);
    });

    // 취소 버튼 추가
    const cancelButton = document.createElement('div');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = `
      padding: 12px 16px;
      cursor: pointer;
      border-radius: 4px;
      color: var(--text-muted);
      text-align: center;
      margin-top: 8px;
      border: 1px solid var(--background-modifier-border);
    `;
    
    cancelButton.addEventListener('mouseenter', () => {
      cancelButton.style.backgroundColor = 'var(--background-modifier-hover)';
    });
    
    cancelButton.addEventListener('mouseleave', () => {
      cancelButton.style.backgroundColor = 'transparent';
    });
    
    cancelButton.addEventListener('click', () => {
      menu.remove();
    });
    
    menu.appendChild(cancelButton);
    document.body.appendChild(menu);

    // 메뉴 외부 클릭 시 닫기
    const closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    
    // 약간의 지연 후 이벤트 리스너 추가
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 100);
  }

  private async loadSelectedFile(filename: string): Promise<void> {
    try {
      const mgr = (this.context as any).outputManager as { importOutputItemsFromPluginDir: (filename?: string) => Promise<number> } | undefined;
      const importedCount = await mgr?.importOutputItemsFromPluginDir(filename);
      
      if (importedCount !== undefined && importedCount > 0) {
        SummarDebug.Notice(1, `Loaded ${importedCount} output items from ${filename}`);
      } else if (importedCount === 0) {
        SummarDebug.Notice(1, `No new output items to load from ${filename} (all items already exist)`);
      } else {
        SummarDebug.Notice(1, `No output items found in ${filename}`);
      }
    } catch (error) {
      SummarDebug.error(1, `Failed to load output items from ${filename}:`, error);
      SummarDebug.Notice(0, `Failed to load output items from ${filename}. Check console for details.`);
    }
  }

  private getCurrentMainPaneTabType(): string {
    const existingLeaf = this.context.plugin.app.workspace.getMostRecentLeaf();
    if (!existingLeaf) return ""; 
    return existingLeaf.view.getViewType();
  }

  private showUploadFailedMessage(title: string, message: string): void {
    const frag = document.createDocumentFragment();
    
    const titleDiv = document.createElement("div");
    titleDiv.textContent = `⚠️ ${title}`;
    titleDiv.style.fontWeight = "bold";
    titleDiv.style.marginBottom = "4px";
    
    const messageDiv = document.createElement("div");
    messageDiv.textContent = message;
    
    frag.appendChild(titleDiv);
    frag.appendChild(messageDiv);
    
    SummarDebug.Notice(0, frag);
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
