import { MarkdownView, normalizePath, setIcon } from "obsidian";
import { ISummarEventHandler, ISummarViewContext, HiddenButtonsState, OutputHeaderHiddenButtonsState } from "./SummarViewTypes";
import { SummarDebug } from "../globals";
import { SummarMenuUtils } from "./SummarMenuUtils";

interface FileInfo {
  displayName: string;  // 표시용: "2024-12-13 14:30:22"
  originalName: string; // 원본: "summar-conversations-20241213-143022.json"
}

interface FileGroup {
  date: string;           // 20240915
  displayDate: string;    // "2024년 9월 15일"
  files: FileInfo[];
}

interface DateTimeInfo {
  date: string;      // 20240915
  time: string;      // 143022
  timestamp: string; // 20240915143022 (정렬용)
}

/**
 * Container 레벨 이벤트 핸들러
 * UI 상단의 고정 버튼들 (fetch, PDF, record, test, upload) 처리
 */
export class SummarContainerEventHandler implements ISummarEventHandler {
  private currentHiddenButtons: HiddenButtonsState = {
    uploadSlack: false,
    uploadWiki: false
  };

  private currentOutputHeaderHiddenButtons: OutputHeaderHiddenButtonsState = {
    copy: false,
    reply: false,
    newNote: false,
    uploadSlack: false,
    uploadWiki: false
  };

  constructor(private context: ISummarViewContext) {
    // 버튼 가시성 변경 이벤트 리스너 등록
    this.context.onButtonVisibilityChanged = (hiddenButtons) => {
      this.currentHiddenButtons = hiddenButtons;
    };

    // OutputHeader 버튼 가시성 변경 이벤트 리스너 등록
    this.context.onOutputHeaderButtonVisibilityChanged = (hiddenButtons) => {
      this.currentOutputHeaderHiddenButtons = hiddenButtons;
    };
  }

  setupEventListeners(): void {
    this.setupUIButtonEvents();        // fetch, PDF, record 버튼
    this.setupUploadEvents();          // Wiki, Slack 업로드 버튼
    this.setupSummarViewPopupMenuEvent();       // 테스트 메뉴 버튼
  }

  cleanup(): void {
    // AbortController가 이미 모든 이벤트 리스너를 정리하므로 추가 작업 없음
  }

  /**
   * 파일명을 사용자 친화적인 날짜 형식으로 변환
   * "summar-conversations-20241213-143022.json" → "2024-12-13 14:30:22"
   */
  private formatDisplayName(filename: string): string {
    // 'summar-conversations-'와 '.json' 제거
    const rawName = filename
      .replace(/^summar-conversations-/, '')
      .replace(/\.json$/, '');
    
    // 날짜 시간 패턴 매칭: YYYYMMDD-HHMMSS
    const match = rawName.match(/^(\d{8})-(\d{6})$/);
    if (match) {
      const [, date, time] = match;
      const formattedDate = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
      const formattedTime = `${time.slice(0,2)}:${time.slice(2,4)}:${time.slice(4,6)}`;
      return `${formattedDate} ${formattedTime}`;
    }
    
    // 패턴이 맞지 않으면 그대로 반환
    return rawName;
  }

  private setupUploadEvents(): void {
    // Upload to Wiki 버튼 이벤트
    const uploadWikiButton = this.context.containerEl.querySelector('button[aria-label*="Upload Note to Confluence"]') as HTMLButtonElement;
    if (uploadWikiButton) {
      uploadWikiButton.addEventListener("click", async() => {
        const viewType = this.getCurrentMainPaneTabType();
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
        const viewType = this.getCurrentMainPaneTabType();
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

  private setupSummarViewPopupMenuEvent(): void {
    const menuButton = this.context.containerEl.querySelector('button[button-id="summarview-menu-button"]') as HTMLButtonElement;
    if (menuButton) {
      menuButton.addEventListener("click", (event) => {
        event.stopPropagation();
        this.showSummarViewPopupMenu(event);
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
        case 'pdf-button':
          await this.handlePdfClick();
          break;
        case 'web-button':
          await this.handleWebClick();
          break;
        case 'record-button':
          await this.handleRecordClick();
          break;
      }
    }, { signal: this.context.abortController.signal });
  }

  private async handlePdfClick(): Promise<void> {
    this.context.plugin.pdfHandler.convertPdfToMarkdown();
  }

  private async handleWebClick(): Promise<void> {
    this.context.plugin.openUrlInputDialog((url) => {
      if (url) {
        this.context.plugin.activateView();
        this.context.plugin.confluenceHandler.fetchAndSummarize(url);
      } else {
        SummarDebug.Notice(0, "No URL provided.");
      }
    });
  }

  private async handleRecordClick(): Promise<void> {
    await this.context.plugin.toggleRecording();
  }

  private showSummarViewPopupMenu(event: MouseEvent): void {
    const button = event.target as HTMLButtonElement;
    
    // Check if this specific SummarView menu is already open
    const existingSummarViewMenu = document.querySelector('.summarview-popup-menu[data-button-id="' + button.getAttribute('button-id') + '"]');
    if (existingSummarViewMenu) {
      // If clicking the same button, close the menu
      existingSummarViewMenu.remove();
      return;
    }
    
    const rect = button.getBoundingClientRect();
    
    // 기존 Summar 팝업 메뉴들이 있다면 모두 제거
    const existingMenus = document.querySelectorAll('.summar-popup-menu');
    existingMenus.forEach(menu => menu.remove());

    // 팝업 메뉴 생성
    const menu = document.createElement('div');
    menu.className = 'summarview-popup-menu summar-popup-menu';
    menu.setAttribute('data-button-id', button.getAttribute('button-id') || '');
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

    // 숨겨진 버튼들의 메뉴 아이템 생성
    const hiddenButtonItems = this.getHiddenButtonMenuItems();
    
    // 기존 메뉴 아이템들 (아이콘 포함)
    const defaultMenuItems = [];
    
    // New prompt 항목은 composer 가용성 확인
    const canShowComposer = this.context.composerManager?.canShowComposer(200)?.canShow ?? false;
    if (canShowComposer) {
      defaultMenuItems.push({ label: 'New prompt', action: () => this.handleComposer(), icon: 'message-square-more' });
    }
    
    // 나머지 항목들 추가
    defaultMenuItems.push(
      { label: 'Load conversations', action: () => this.handleLoadAllOutputs(), icon: 'history' },
      // { label: 'Save all conversations', action: () => this.handleSaveAllOutputs(), icon: 'save' },
      { label: 'Clear all conversations', action: async () => await this.context.plugin.clearAllOutputItems(), icon: 'sparkles' }
    );

    // 숨겨진 버튼 메뉴들을 맨 앞에 추가
    const allMenuItems = [...hiddenButtonItems, ...defaultMenuItems];

    allMenuItems.forEach((item, index) => {
      const menuItem = document.createElement('div');
      menuItem.className = 'summarview-menu-item';
      menuItem.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        border-radius: 3px;
        color: var(--text-normal);
        font-size: var(--font-ui-small);
        display: flex;
        align-items: center;
        gap: 6px;
      `;
      
      // 아이콘 추가
      if (item.icon) {
        const iconHolder = document.createElement('span');
        iconHolder.style.display = 'inline-flex';
        iconHolder.style.width = '14px';
        iconHolder.style.height = '14px';
        iconHolder.style.flexShrink = '0';
        SummarMenuUtils.setMenuItemIcon(iconHolder, item.icon);
        
        // 추가 스타일 조정
        const svg = iconHolder.querySelector('svg') as SVGElement | null;
        if (svg) {
          svg.style.strokeWidth = '2px';
        }
        
        menuItem.appendChild(iconHolder);
      }
      
      // 텍스트 라벨 추가
      const textSpan = document.createElement('span');
      textSpan.textContent = item.label;
      menuItem.appendChild(textSpan);
      
      // 숨겨진 버튼 메뉴들은 다른 스타일 적용
      if (index < hiddenButtonItems.length) {
        // menuItem.style.fontWeight = 'bold';
        menuItem.style.marginBottom = '4px';
        // menuItem.style.borderBottom = '1px solid var(--background-modifier-border)';
      }
      
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
      
      // 숨겨진 버튼과 기본 메뉴 사이에 구분선 추가
      if (index === hiddenButtonItems.length - 1 && defaultMenuItems.length > 0) {
        const separator = document.createElement('div');
        separator.style.height = '1px';
        separator.style.backgroundColor = 'var(--background-modifier-border)';
        separator.style.margin = '4px 0';
        menu.appendChild(separator);
      }
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

  // private handleDeleteAllOutputs(): void {
  //   this.context.outputRecords.clear();
  //   this.context.outputContainer.empty();
  //   SummarDebug.Notice(1, "All output items have been deleted");
  // }

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
    if (composerManager && composerManager.newPrompt) {
      composerManager.newPrompt();
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
        .sort((a, b) => {
          // 파일명의 타임스탬프 기준으로 최신이 위로 (내림차순)
          const timestampA = this.extractDateTimeFromFilename(a).timestamp;
          const timestampB = this.extractDateTimeFromFilename(b).timestamp;
          return timestampB.localeCompare(timestampA);
        });

      if (jsonFiles.length === 0) {
        SummarDebug.Notice(1, "No saved result files found");
        return;
      }

      // FileInfo 배열로 변환
      const fileInfos: FileInfo[] = jsonFiles.map(filename => ({
        displayName: this.formatDisplayName(filename),
        originalName: filename
      }));

      // JSON 파일 선택 메뉴 표시
      this.showFileSelectionMenu(fileInfos);

    } catch (error) {
      SummarDebug.error(1, 'Failed to list result files:', error);
      SummarDebug.Notice(0, 'Failed to list result files. Check console for details.');
    }
  }

  private showFileSelectionMenu(fileInfos: FileInfo[]): void {
    // 기존 Summar 팝업 메뉴들이 있다면 모두 제거
    const existingMenus = document.querySelectorAll('.summar-popup-menu');
    existingMenus.forEach(menu => menu.remove());

    // 날짜별로 그룹화
    const groupedFiles = this.groupFilesByDate(fileInfos);

    // 팝업 메뉴 컨테이너 생성
    const menu = document.createElement('div');
    menu.className = 'file-selection-menu summar-popup-menu';
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
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    // 헤더 영역 (제목 + X 버튼)
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 16px 0 16px;
      flex-shrink: 0;
    `;

    // 제목
    const title = document.createElement('div');
    title.textContent = 'Select a file to load:';
    title.style.cssText = `
      font-size: 16px;
      font-weight: bold;
      color: var(--text-normal);
    `;

    // X 버튼
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '×';
    closeButton.style.cssText = `
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: var(--text-muted);
      padding: 4px 8px;
      border-radius: 3px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
    `;

    closeButton.addEventListener('mouseenter', () => {
      closeButton.style.backgroundColor = 'var(--background-modifier-hover)';
      closeButton.style.color = 'var(--text-normal)';
    });

    closeButton.addEventListener('mouseleave', () => {
      closeButton.style.backgroundColor = 'transparent';
      closeButton.style.color = 'var(--text-muted)';
    });

    closeButton.addEventListener('click', () => {
      menu.remove();
    });

    header.appendChild(title);
    header.appendChild(closeButton);
    menu.appendChild(header);

    // 스크롤 가능한 컨텐츠 영역
    const content = document.createElement('div');
    content.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px 16px 16px;
    `;

    // 날짜별 그룹 렌더링
    groupedFiles.forEach((group, groupIndex) => {
      // 날짜 구분자 추가 (첫 번째 그룹 제외)
      if (groupIndex > 0) {
        const separator = document.createElement('div');
        separator.style.cssText = `
          border-top: 1px solid var(--background-modifier-border);
          margin: 12px 0 8px 0;
        `;
        content.appendChild(separator);
      }
      
      // 날짜 헤더 추가
      const dateHeader = document.createElement('div');
      dateHeader.textContent = group.displayDate;
      dateHeader.style.cssText = `
        font-size: 12px;
        color: var(--text-muted);
        text-align: center;
        margin-bottom: 8px;
        font-weight: 500;
      `;
      content.appendChild(dateHeader);
      
      // 파일 목록 추가 (border 제거됨)
      group.files.forEach(fileInfo => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-menu-item';
        fileItem.textContent = fileInfo.displayName; // 표시용 이름 사용
        fileItem.style.cssText = `
          padding: 12px 16px;
          cursor: pointer;
          border-radius: 4px;
          color: var(--text-normal);
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
          await this.loadSelectedFile(fileInfo.originalName); // 원본 파일명 사용
        });
        
        content.appendChild(fileItem);
      });
    });

    // 컨텐츠 영역을 메뉴에 추가
    menu.appendChild(content);
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
    return this.context.plugin.getCurrentMainPaneTabType();
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

  /**
   * 숨겨진 버튼들을 위한 메뉴 아이템 생성
   */
  private getHiddenButtonMenuItems(): Array<{ label: string; action: () => void; icon: string }> {
    const items: Array<{ label: string; action: () => void; icon: string }> = [];

    // uploadWiki 버튼이 숨겨져 있으면 메뉴에 추가 (우선순위 높음)
    if (this.currentHiddenButtons.uploadWiki) {
      items.push({
        label: 'Upload Note to Confluence',
        action: () => this.executeUploadWikiAction(),
        icon: 'file-up'
      });
    }

    // uploadSlack 버튼이 숨겨져 있으면 메뉴에 추가
    if (this.currentHiddenButtons.uploadSlack) {
      items.push({
        label: this.getSlackButtonTooltip(),
        action: () => this.executeUploadSlackAction(),
        icon: 'hash'
      });
    }

    return items;
  }

  /**
   * Slack 버튼의 tooltip 텍스트 동적 생성
   */
  private getSlackButtonTooltip(): string {
    const channelId = this.context.plugin.settingsv2.common.slackChannelId || "Not set";
    let channelInfo = " (No Channel)";
    
    if (channelId !== "Not set") {
      if (channelId.includes("#")) {
        channelInfo = ` (Channel: ${channelId})`;
      } else if (channelId.includes("@")) {
        channelInfo = ` (DM: ${channelId})`;
      } else {
        channelInfo = ` (Channel: ${channelId})`;
      }
    }
    
    if (this.context.plugin.SLACK_UPLOAD_TO_CANVAS) {
      return `Create Slack Canvas${channelInfo}`;
    } else {
      return `Send Slack Message${channelInfo}`;
    }
  }

  /**
   * Wiki 업로드 액션 실행 (기존 버튼 클릭과 동일한 로직)
   */
  private async executeUploadWikiAction(): Promise<void> {
    const viewType = this.getCurrentMainPaneTabType();
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
  }

  /**
   * Slack 업로드 액션 실행 (기존 버튼 클릭과 동일한 로직)
   */
  private async executeUploadSlackAction(): Promise<void> {
    const viewType = this.getCurrentMainPaneTabType();
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
  }

  /**
   * 파일명에서 날짜/시간 정보를 추출합니다
   */
  private extractDateTimeFromFilename(filename: string): DateTimeInfo {
    const match = filename.match(/summar-conversations-(\d{8})-(\d{6})\.json/);
    if (match) {
      return {
        date: match[1],     // 20240915
        time: match[2],     // 143022
        timestamp: match[1] + match[2]  // 20240915143022 (정렬용)
      };
    }
    return { date: '', time: '', timestamp: '' };
  }

  /**
   * 날짜 문자열을 표시용으로 포맷팅합니다
   */
  private formatDateForDisplay(dateStr: string): string {
    if (dateStr.length !== 8) return dateStr;
    
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10);
    const day = parseInt(dateStr.substring(6, 8), 10);

    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
      return dateStr;
    }

    const jsDate = new Date(year, month - 1, day);
    if (Number.isNaN(jsDate.getTime())) {
      return dateStr;
    }

    const formatter = new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    return formatter.format(jsDate);
  }

  /**
   * 파일들을 날짜별로 그룹화합니다
   */
  private groupFilesByDate(files: FileInfo[]): FileGroup[] {
    const groups = new Map<string, FileInfo[]>();
    
    files.forEach(file => {
      const { date } = this.extractDateTimeFromFilename(file.originalName);
      if (date) {
        if (!groups.has(date)) {
          groups.set(date, []);
        }
        groups.get(date)!.push(file);
      }
    });
    
    // 날짜별로 정렬 (최신 날짜가 위로)
    return Array.from(groups.entries())
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
      .map(([date, files]) => ({
        date,
        displayDate: this.formatDateForDisplay(date),
        files: files.sort((a, b) => {
          const timestampA = this.extractDateTimeFromFilename(a.originalName).timestamp;
          const timestampB = this.extractDateTimeFromFilename(b.originalName).timestamp;
          return timestampB.localeCompare(timestampA); // 같은 날짜 내에서도 최신이 위로
        })
      }));
  }
}
