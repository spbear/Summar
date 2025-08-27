import { Platform, MarkdownView, normalizePath } from "obsidian";
import { ISummarEventHandler, ISummarViewContext } from "./SummarViewTypes";
import { SummarDebug, showSettingsTab } from "../globals";

export class SummarEventHandler implements ISummarEventHandler {
  constructor(private context: ISummarViewContext) {}

  setupEventListeners(): void {
    this.setupUploadEvents();
    this.setupDeleteAllEvent();
    this.setupResultItemEvents();
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

  private setupDeleteAllEvent(): void {
    const deleteAllButton = this.context.containerEl.querySelector('button[aria-label*="Delete all result items"]') as HTMLButtonElement;
    if (deleteAllButton) {
      deleteAllButton.addEventListener("click", () => {
        this.context.resultItems.clear();
        this.context.newNoteNames.clear();
        this.context.resultContainer.empty();
        SummarDebug.Notice(1, "All result items have been deleted");
      }, { signal: this.context.abortController.signal });
    }
  }

  private setupResultItemEvents(): void {
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
      }
    }, { signal: this.context.abortController.signal });
  }

  private async handleNewNoteClick(key: string): Promise<void> {
    try {
      let newNoteName = this.getNoteName(key);
      const filePath = normalizePath(newNoteName);
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
      const resultItem = this.context.resultItems.get(key);
      if (resultItem) {
        const resultText = resultItem.querySelector('.result-text') as HTMLDivElement;
        if (resultText) {
          const rawText = resultText.getAttribute('data-raw-text') || '';
          await navigator.clipboard.writeText(rawText);
          SummarDebug.Notice(1, 'Content copied to clipboard');
        }
      }
    } catch (error) {
      SummarDebug.error(1, "Error copying to clipboard:", error);
      SummarDebug.Notice(0, 'Failed to copy content to clipboard');
    }
  }

  private getCurrentMainPaneTabType(): string {
    const existingLeaf = this.context.plugin.app.workspace.getMostRecentLeaf();
    if (!existingLeaf) return ""; 
    return existingLeaf.view.getViewType();
  }

  private getResultText(key: string): string {
    const resultItem = this.context.resultItems.get(key);
    if (!resultItem) return "";
    
    const resultText = resultItem.querySelector('.result-text') as HTMLDivElement;
    if (resultText) {
      return resultText.getAttribute('data-raw-text') || '';
    }
    
    return "";
  }

  private getNoteName(key: string): string {
    let newNoteName = this.context.newNoteNames.get(key);
    return (newNoteName && newNoteName.length > 0) ? newNoteName : "";
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
