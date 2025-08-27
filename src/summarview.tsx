import { View, WorkspaceLeaf, Platform, setIcon, normalizePath, MarkdownView } from "obsidian";

import SummarPlugin  from "./main";
import { SummarDebug, SummarViewContainer, showSettingsTab } from "./globals";
import { ConfluenceAPI } from "./confluenceapi";
import { SlackAPI } from "./slackapi";
import MarkdownIt from "markdown-it";

export class SummarView extends View {
  static VIEW_TYPE = "summar-view";

  plugin: SummarPlugin;
  resultContainer: HTMLDivElement;
  resultItems: Map<string, HTMLDivElement> = new Map();
  newNoteNames: Map<string, string> = new Map();

  markdownRenderer: MarkdownIt;

  // Sticky header 관련 프로퍼티
  private stickyHeaderContainer: HTMLDivElement | null = null;
  private currentStickyKey: string | null = null;
  private headerObserver: IntersectionObserver | null = null;
  private visibleHeaders: Set<string> = new Set();
  private resizeObserver: ResizeObserver | null = null;
  
  // Toggle 중복 실행 방지용 플래그
  private isToggling: boolean = false;

  constructor(leaf: WorkspaceLeaf, plugin: SummarPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.markdownRenderer = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
      // breaks: false, // 자동 줄바꿈 변환 비활성화
      // xhtmlOut: false, // XHTML 출력 비활성화
    });
    
    // 생략 부호(ellipsis) 변환만 비활성화 (점 애니메이션 보존)
    // 다른 타이포그래피(따옴표, 대시 등)는 유지
    this.markdownRenderer.disable(['replacements']);
  }

  getViewType(): string {
    return SummarView.VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Summar: AI-Powered Summarizer";
  }

  getIcon(): string {
    return "scroll-text"; // 사용할 아이콘 이름 (Lucide 아이콘)
  }

  async onOpen(): Promise<void> {
    SummarDebug.log(1, "Summar View opened");
    this.renderView();
    this.setupResizeObserver();
  }

  async onClose(): Promise<void> {
    SummarDebug.log(1, "Summar View closed");
    // Intersection Observer 정리
    if (this.headerObserver) {
      this.headerObserver.disconnect();
      this.headerObserver = null;
    }
    // Resize Observer 정리
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  private async renderView(): Promise<void> {
    const container: HTMLElement = this.containerEl;
    container.empty();

    // CSS 스타일 추가 (텍스트 선택 유지 및 상하단 간격 제거)
    const style = document.createElement('style');
    style.textContent = `
      .result-text {
        -webkit-touch-callout: text;
        -webkit-user-select: text;
        -khtml-user-select: text;
        -moz-user-select: text;
        -ms-user-select: text;
        user-select: text;
        /* 모바일 터치 동작 개선 */
        -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
        touch-action: manipulation;
        cursor: text;
        line-height: 1.6;
        word-wrap: break-word;
        white-space: pre-wrap;
        overflow-wrap: break-word;
        hyphens: auto;
      }
      .result-text > *:first-child {
        margin-top: 0 !important;
        padding-top: 0 !important;
      }
      .result-text > *:last-child {
        margin-bottom: 0 !important;
        padding-bottom: 0 !important;
      }
      .result-text p {
        margin-top: 0 !important;
        margin-bottom: 0 !important;
      }
      .result-text p:first-child {
        margin-top: 0 !important;
      }
      .result-text p:last-child {
        margin-bottom: 0 !important;
      }
      .result-text::selection {
        background-color: var(--text-selection) !important;
        color: var(--text-on-accent) !important;
      }
      .result-text::-moz-selection {
        background-color: var(--text-selection) !important;
        color: var(--text-on-accent) !important;
      }
      .result-text * {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
      }
      
      /* Sticky header 스타일 - resultContainer 위쪽 별도 레이어 */
      .sticky-header-container {
        position: absolute !important;
        z-index: 10000 !important;
        background-color: var(--background-primary) !important;
        border: 1px solid var(--background-modifier-border) !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2) !important;
        display: none !important;
        border-radius: 0px !important;
        padding: 0px !important;
        margin: 0 !important;
        pointer-events: auto !important;
      }
      
      .sticky-header-container.visible {
        display: block;
      }
      
      .sticky-header-container .result-header {
        border: none !important;
        background-color: var(--background-primary) !important;
        margin: 0 !important;
      }
    `;
    document.head.appendChild(style);

    // Input Container
    const inputContainer: HTMLDivElement = container.createEl("div", {
      cls: "input-container",
    });
    inputContainer.style.display = "flex";
    inputContainer.style.alignItems = "center";
    inputContainer.style.gap = "5px"; // 간격 조정
    inputContainer.style.marginBottom = "1px";
  
    const inputField: HTMLInputElement = inputContainer.createEl("input", {
      type: "text",
      placeholder: "Enter Web page URL",
      cls: "summarview-input",
    });
    inputField.style.flexGrow = "1";
    inputField.style.padding = "8px";
    inputField.style.border = "1px solid var(--background-modifier-border)";
    inputField.style.borderRadius = "5px";
    inputField.style.boxSizing = "border-box";
    inputField.style.margin = "5px";
    inputField.value = this.plugin.settingsv2.system.testUrl || "";
  
    // Store input field for later use
    this.plugin.inputField = inputField;
  
    const fetchButton: HTMLButtonElement = inputContainer.createEl("button", {
      text: "GO",
      cls: "summarview-button",
    });
    // fetchButton.setAttribute("data-tooltip", "Fetch and summarize the web page");
    fetchButton.setAttribute("aria-label", "Fetch and summarize the web page");
    fetchButton.style.padding = "8px 12px";
    fetchButton.style.border = "1px solid var(--background-modifier-border)";
    fetchButton.style.borderRadius = "5px";
    fetchButton.style.cursor = "pointer";
    fetchButton.style.flexShrink = "0";
    fetchButton.style.margin = "5px";
    // Button Container
    const buttonContainer: HTMLDivElement = container.createEl("div", {
      cls: "button-container",
    });
    buttonContainer.style.display = "flex";
    buttonContainer.style.alignItems = "center";
    buttonContainer.style.gap = "5px"; // 간격 조정
    buttonContainer.style.marginBottom = "1px";
    buttonContainer.style.marginLeft = "0px"; // inputField와 동일한 왼쪽 margin
    buttonContainer.style.marginRight = "0px";
    buttonContainer.style.marginTop = "0px";
  
    // uploadNoteToWikiButton 추가
    const uploadNoteToWikiButton = buttonContainer.createEl("button", {
      cls: "lucide-icon-button",
    });
    uploadNoteToWikiButton.setAttribute("aria-label", "Upload Note to Confluence");
    setIcon(uploadNoteToWikiButton, "file-up");

    // uploadNoteToWikiButton 클릭 이벤트 리스너
    uploadNoteToWikiButton.addEventListener("click", async() => {
      const viewType = await this.getCurrentMainPaneTabType();
      if (viewType === "markdown") {
        const file = this.plugin.app.workspace.getActiveFile();
        if (file) {
          let title = file.basename;
          const content = await this.plugin.app.vault.read(file);
          await this.uploadContentToWiki(title, content);
        } else {
          SummarDebug.Notice(0, "No active editor was found.");
        }
      } else {
        const frag = document.createDocumentFragment();

        const title = document.createElement("div");
        title.textContent = "⚠️ Wiki Upload Failed";
        title.style.fontWeight = "bold";
        title.style.marginBottom = "4px";
        
        const message = document.createElement("div");
        message.textContent = "No active editor was found.";
        
        frag.appendChild(title);
        frag.appendChild(message);
        
        SummarDebug.Notice(0, frag);
      } 
    });

    if (!(Platform.isMacOS && Platform.isDesktopApp)) {
      // 버튼을 안보이게 하고 비활성화
      uploadNoteToWikiButton.style.display = "none"; // 안보이게 하기
      uploadNoteToWikiButton.disabled = true;        // 비활성화
      uploadNoteToWikiButton.style.width = "100%";
    }

    
    // uploadNoteToSlackButton 추가
    const uploadNoteToSlackButton = buttonContainer.createEl("button", {
      cls: "lucide-icon-button",
    });
    
    // 플러그인에 버튼 참조 저장
    this.plugin.uploadNoteToSlackButton = uploadNoteToSlackButton;
    
    // 동적으로 버튼 라벨과 아이콘 설정 (Channel ID 포함)
    const channelId = this.plugin.settingsv2.common.slackChannelId || "Not set";
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
    
    if (this.plugin.SLACK_UPLOAD_TO_CANVAS) {
      uploadNoteToSlackButton.setAttribute("aria-label", `Create Slack Canvas${channelInfo}`);
      setIcon(uploadNoteToSlackButton, "hash"); // Canvas 아이콘
    } else {
      uploadNoteToSlackButton.setAttribute("aria-label", `Send Slack Message${channelInfo}`);
      setIcon(uploadNoteToSlackButton, "hash"); // 메시지 아이콘
    }

    // uploadNoteToSlackButton 클릭 이벤트 리스너
    uploadNoteToSlackButton.addEventListener("click", async() => {
      const viewType = await this.getCurrentMainPaneTabType();
      if (viewType === "markdown") {
        const file = this.plugin.app.workspace.getActiveFile();
        if (file) {
          let title = file.basename;
          const content = await this.plugin.app.vault.read(file);
          await this.uploadContentToSlack(title, content);
        } else {
          SummarDebug.Notice(0, "No active editor was found.");
        }
      } else {
        const frag = document.createDocumentFragment();

        const title = document.createElement("div");
        if (this.plugin.SLACK_UPLOAD_TO_CANVAS) {
          title.textContent = "⚠️ Slack Canvas Upload Failed";
        } else {
          title.textContent = "⚠️ Slack Message Send Failed";
        }
        title.style.fontWeight = "bold";
        title.style.marginBottom = "4px";
        
        const message = document.createElement("div");
        message.textContent = "No active editor was found.";
        
        frag.appendChild(title);
        frag.appendChild(message);
        
        SummarDebug.Notice(0, frag);
      } 
    });

    if (!(Platform.isMacOS && Platform.isDesktopApp)) {
      // Slack 버튼도 플랫폼 제한
      uploadNoteToSlackButton.style.display = "none";
      uploadNoteToSlackButton.disabled = true;
    } else {
      // 초기 버튼 상태 설정
      this.plugin.updateSlackButtonState();
    }

    // deleteAllResultItemsButton 추가 (macOS에서만 표시)
    // if (Platform.isMacOS && Platform.isDesktopApp) {
    const deleteAllResultItemsButton = buttonContainer.createEl("button", {
      cls: "lucide-icon-button",
    });
    deleteAllResultItemsButton.setAttribute("aria-label", "Delete all result items");
    setIcon(deleteAllResultItemsButton, "trash-2");

    deleteAllResultItemsButton.addEventListener("click", () => {
      // 모든 resultItems 삭제
      this.resultItems.clear();
      this.newNoteNames.clear(); // newNoteNames Map도 정리
      this.resultContainer.empty();
      SummarDebug.Notice(1, "All result items have been deleted");
    });
    // hide
    deleteAllResultItemsButton.disabled = true;
    deleteAllResultItemsButton.style.display = 'none';

    // }
  
    
    // 구분선(|) 추가
    const separator = buttonContainer.createEl("span", {
      text: "|",
      cls: "button-separator"
    });
  
    const pdfButton: HTMLButtonElement = buttonContainer.createEl("button", {
      text: "PDF",
      cls: "summarview-button",
    });
    pdfButton.setAttribute("aria-label", "Convert PDF to Markdown");
    pdfButton.style.width = "30%";
    pdfButton.style.marginBottom = "1px"; // 간격 조정
    pdfButton.style.padding = "8px 12px";
    pdfButton.style.border = "1px solid var(--background-modifier-border)";
    pdfButton.style.borderRadius = "5px";
    pdfButton.style.cursor = "pointer";
    pdfButton.style.marginBottom = "1px";
    pdfButton.style.marginTop = "1px";
  
    const recordButton: HTMLButtonElement = buttonContainer.createEl("button", {
      text: "[●] record",
      cls: "summarview-button",
    });
    recordButton.setAttribute("aria-label", "Record audio and summarize");
    recordButton.style.width = "70%";
    recordButton.style.marginBottom = "1px"; // 간격 조정
    recordButton.style.padding = "8px 12px";
    recordButton.style.border = "1px solid var(--background-modifier-border)";
    recordButton.style.borderRadius = "5px";
    recordButton.style.cursor = "pointer";

    // Result Container
    const resultContainer: HTMLDivElement = container.createEl("div", {
      cls: "summarview-result",
    });
    resultContainer.style.position = "relative"; // sticky header positioning을 위해 추가
    resultContainer.style.width = "calc(100% - 10px)";
    resultContainer.style.height = "calc(100% - 120px)"; // status bar 높이(30px) 추가로 고려하여 80px에서 110px로 조정
    resultContainer.style.border = "1px solid var(--background-modifier-border)";
    resultContainer.style.padding = "10px";
    resultContainer.style.margin = "5px"; // 위로 붙임
    resultContainer.style.overflowY = "auto";
    resultContainer.style.overflowX = "hidden";
    resultContainer.style.backgroundColor = "var(--background-primary)";
    resultContainer.style.color = "var(--text-normal)"; // Obsidian의 기본 텍스트 색상 변수 사용
    
    // sticky header positioning을 확실히 하기 위해 강제 설정
    resultContainer.style.position = "relative !important" as any;
  
    this.resultContainer = resultContainer;

    // Sticky header 초기화 (최상위 container에 별도 레이어로 생성)
    this.setupStickyHeader(container); // resultContainer 위쪽 레이어에 생성
    this.setupHeaderObserver();

    this.plugin.recordButton = recordButton;

    if (!(Platform.isMacOS && Platform.isDesktopApp)) {
      // 버튼을 안보이게 하고 비활성화
      pdfButton.style.display = "none"; // 안보이게 하기
      pdfButton.disabled = true;        // 비활성화
      recordButton.style.width = "100%";
    }


    fetchButton.onclick = async () => {
      const url = inputField.value.trim();
      if (!url) {
        SummarDebug.Notice(0, "Please enter a valid URL.");
        return;
      }
      this.plugin.confluenceHandler.fetchAndSummarize(url);
    };

    pdfButton.onclick = async () => {
      this.plugin.pdfHandler.convertPdfToMarkdown();
    };

    recordButton.onclick = async () => {
      await this.plugin.toggleRecording();
    }
  }

  getCurrentMainPaneTabType(): string {
    const existingLeaf = this.app.workspace.getMostRecentLeaf();
    if (!existingLeaf) return ""; 
    return existingLeaf.view.getViewType();
  }

  updateSlackButtonTooltip(): void {
    try {
      if (!this.plugin.uploadNoteToSlackButton) return;
      
      // 동적으로 버튼 라벨과 아이콘 설정 (Channel ID 포함)
      const channelId = this.plugin.settingsv2.common.slackChannelId || "Not set";
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
      
      if (this.plugin.SLACK_UPLOAD_TO_CANVAS) {
        this.plugin.uploadNoteToSlackButton.setAttribute("aria-label", `Create Slack Canvas${channelInfo}`);
      } else {
        this.plugin.uploadNoteToSlackButton.setAttribute("aria-label", `Send Slack Message${channelInfo}`);
      }
    } catch (error) {
      console.error('Error updating Slack button tooltip:', error);
    }
  }

  /**
   * MarkdownIt 렌더링 결과에서 불필요한 줄바꿈을 제거합니다.
   */
  private cleanupMarkdownOutput(html: string): string {
    return html
      // 연속된 <br> 태그를 하나로 줄임
      .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '<br>')
      // p 태그 사이의 불필요한 공백 제거
      .replace(/<\/p>\s*<p>/gi, '</p><p>')
      // p 태그 내부의 시작/끝 공백 제거
      .replace(/<p>\s+/gi, '<p>')
      .replace(/\s+<\/p>/gi, '</p>')
      // 빈 p 태그 제거
      .replace(/<p>\s*<\/p>/gi, '')
      // 연속된 공백을 하나로 줄임
      .replace(/\s{2,}/gi, ' ')
      // 태그 사이의 불필요한 줄바꿈 제거
      .replace(/>\s*\n\s*</gi, '><')
      // 시작과 끝의 공백 제거
      .trim();
  }

  updateResultText(key: string, label: string, message: string): string {
    let resultItem = this.resultItems.get(key);
    let isNewItem = false;
    
    if (!resultItem) {
      // 새 resultItem 생성
      resultItem = this.createResultItem(key, label);
      this.resultItems.set(key, resultItem);
      this.resultContainer.appendChild(resultItem);
      isNewItem = true;
      
      // 새 resultItem의 resultHeader를 observer에 등록
      const resultHeader = resultItem.querySelector('.result-header') as HTMLDivElement;
      if (resultHeader && this.headerObserver) {
        this.headerObserver.observe(resultHeader);
        SummarDebug.log(1, `Observer registered for header with key: ${key}`);
      }
    }
    
    // resultText 영역 업데이트
    const resultText = resultItem.querySelector('.result-text') as HTMLDivElement;
    if (resultText) {
      resultText.setAttribute('data-raw-text', message);
      const renderedHtml = this.markdownRenderer.render(message);
      const cleanedHtml = this.cleanupMarkdownOutput(renderedHtml);
      resultText.innerHTML = cleanedHtml;
      SummarDebug.log(1, `Original message: ${message}`);
      SummarDebug.log(1, `Rendered HTML: ${renderedHtml}`);
      SummarDebug.log(1, `Cleaned HTML: ${cleanedHtml}`);
    }
    
    // 새 아이템이 추가된 경우 스크롤을 맨 아래로 이동
    if (isNewItem) {
      setTimeout(() => {
        this.resultContainer.scrollTop = this.resultContainer.scrollHeight;
      }, 10); // 렌더링 완료 후 스크롤
    }
    
    return key;
  }

  appendResultText(key: string, label: string, message: string): string {
    // SummarDebug.log(2, `SummarView.appendResultText: key=${key}, label=${label}, message="${message}"`);
    let resultItem = this.resultItems.get(key);
    
    if (!resultItem) {
      // 존재하지 않으면 updateResultText 호출
      // SummarDebug.log(2, `SummarView.appendResultText: No existing resultItem for key ${key}, calling updateResultText`);
      return this.updateResultText(key, label, message);
    }
    
    // SummarDebug.log(2, `SummarView.appendResultText: Found existing resultItem for key ${key}`);
    
    // 기존 텍스트에 추가
    const resultText = resultItem.querySelector('.result-text') as HTMLDivElement;
    if (resultText) {
      const currentText = resultText.getAttribute('data-raw-text') || '';
      const newText = currentText + message;
      // SummarDebug.log(2, `SummarView.appendResultText: Current text length: ${currentText.length}, New text length: ${newText.length}`);
      // SummarDebug.log(3, `SummarView.appendResultText: Current text: "${currentText}", New text: "${newText}"`);
      
      resultText.setAttribute('data-raw-text', newText);
      const renderedHtml = this.markdownRenderer.render(newText);
      const cleanedHtml = this.cleanupMarkdownOutput(renderedHtml);
      // SummarDebug.log(3, `SummarView.appendResultText: Rendered HTML: "${cleanedHtml}"`);
      resultText.innerHTML = cleanedHtml;
      
      // SummarDebug.log(2, `SummarView.appendResultText: Updated resultText innerHTML, new length: ${resultText.innerHTML.length}`);
    } else {
      // SummarDebug.log(1, `SummarView.appendResultText: No resultText element found for key ${key}`);
    }
    
    return key;
  }

  getResultText(key: string): string {
    if (key === "") {
      // 빈 키인 경우 모든 resultItem의 텍스트를 합쳐서 반환
      let allText = "";
      this.resultItems.forEach((resultItem, itemKey) => {
        const resultText = resultItem.querySelector('.result-text') as HTMLDivElement;
        if (resultText) {
          const text = resultText.getAttribute('data-raw-text') || '';
          if (text) {
            allText += (allText ? '\n\n' : '') + text;
          }
        }
      });
      return allText;
    }
    
    const resultItem = this.resultItems.get(key);
    if (!resultItem) {
      return "";
    }
    
    const resultText = resultItem.querySelector('.result-text') as HTMLDivElement;
    if (resultText) {
      return resultText.getAttribute('data-raw-text') || '';
    }
    
    return "";
  }

  enableNewNote(key: string, newNotePath?: string) {
    const now = new Date();
    const formattedDate = now.getFullYear().toString().slice(2) +
      String(now.getMonth() + 1).padStart(2, "0") +
      now.getDate().toString().padStart(2, "0") + "-" +
      now.getHours().toString().padStart(2, "0") +
      now.getMinutes().toString().padStart(2, "0");

    let newNoteName = newNotePath ? newNotePath : formattedDate;
    if (!newNoteName.includes(".md")) {
      newNoteName += ".md";
    }
    this.newNoteNames.set(key, newNoteName);


    // key에 해당하는 resultItem의 newNoteButton을 찾아서 enable하고 show
    const resultItem = this.resultItems.get(key);
    if (resultItem) {
      const newNoteButton = resultItem.querySelector('button[button-id="new-note-button"]') as HTMLButtonElement;
      if (newNoteButton) {
        newNoteButton.disabled = false;
        newNoteButton.style.display = '';
      }
      const uploadResultToWikiButton = resultItem.querySelector('button[button-id="upload-result-to-wiki-button"]') as HTMLButtonElement;
      if (uploadResultToWikiButton) {
        uploadResultToWikiButton.disabled = false;
        uploadResultToWikiButton.style.display = '';
      }
      const uploadResultToSlackButton = resultItem.querySelector('button[button-id="upload-result-to-slack-button"]') as HTMLButtonElement;
      if (uploadResultToSlackButton) {
        uploadResultToSlackButton.disabled = false;
        uploadResultToSlackButton.style.display = '';
      }
    }
  } 

  getNoteName(key: string): string {
    let newNoteName = this.newNoteNames.get(key);
    return (newNoteName && newNoteName.length > 0) ? newNoteName : "";
  }

  foldResult(key: string | null, fold: boolean): void {
    if (!key || key === "") {
      // 모든 resultItem에 대해 동일하게 적용
      this.resultItems.forEach((resultItem, itemKey) => {
        this.applyFoldToResultItem(resultItem, fold);
      });
    } else {
      // 특정 key의 resultItem에만 적용
      const resultItem = this.resultItems.get(key);
      if (resultItem) {
        this.applyFoldToResultItem(resultItem, fold);
      }
    }
  }

  clearAllResultItems(): void {
    this.resultItems.clear();
    this.newNoteNames.clear(); // newNoteNames Map도 정리
    this.resultContainer.empty();
    
    // Observer 관련 정리
    this.visibleHeaders.clear();
    this.hideStickyHeader();
  }

  private applyFoldToResultItem(resultItem: HTMLDivElement, fold: boolean): void {
    const toggleFoldButton = resultItem.querySelector('button[button-id="toggle-fold-button"]') as HTMLButtonElement;
    const resultText = resultItem.querySelector('.result-text') as HTMLDivElement;
    
    if (toggleFoldButton && resultText) {
      if (fold) {
        // 접기
        toggleFoldButton.setAttribute('toggled', 'true');
        setIcon(toggleFoldButton, 'square-chevron-down');
        resultText.style.display = 'none';
      } else {
        // 펼치기
        toggleFoldButton.setAttribute('toggled', 'false');
        setIcon(toggleFoldButton, 'square-chevron-up');
        resultText.style.display = 'block';
      }
      
      // fold/unfold 상태 변경 시 sticky header 가시성 재평가
      this.updateStickyHeaderVisibility();
    }
  }

  private async uploadContentToSlack(title: string, content: string): Promise<void> {
    // Slack API가 활성화되어 있는지만 확인 (토큰은 선택적)
    if (!this.plugin.settingsv2.common.useSlackAPI) {
      const fragment = document.createDocumentFragment();
      const message1 = document.createElement("span");
      
      if (this.plugin.SLACK_UPLOAD_TO_CANVAS) {
        message1.textContent = "To create a Canvas in Slack, " +
          "please enable Slack API integration. Bot Token is optional " +
          "(if not set, will attempt anonymous access). \n";
      } else {
        message1.textContent = "To send a message to Slack, " +
          "please enable Slack API integration. Bot Token and Channel ID may be required. \n";
      }
      fragment.appendChild(message1);

      // 링크 생성 및 스타일링
      const link = document.createElement("a");
      link.textContent = "Enable Slack API integration in the settings";
      link.href = "#";
      link.style.cursor = "pointer";
      link.style.color = "var(--text-accent)";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        showSettingsTab(this.plugin, 'common-tab');
      });
      fragment.appendChild(link);
      SummarDebug.Notice(0, fragment, 0);
      
      return;
    }
    
    SummarDebug.log(1, `Slack upload - title: ${title}`);
    SummarDebug.log(3, `Slack upload - content: ${content}`);

    const slackApi = new SlackAPI(this.plugin);
    const result = await slackApi.uploadNote(title, content);
    
    if (result.success) {
      // HTML 형식의 성공 메시지 생성
      const messageFragment = document.createDocumentFragment();
        
      const successText = document.createElement("div");
      if (this.plugin.SLACK_UPLOAD_TO_CANVAS) {
        successText.textContent = "Canvas has been created successfully in Slack.";
      } else {
        successText.textContent = "Message has been posted to Slack successfully.";
      }
      messageFragment.appendChild(successText);

      if (result.canvasUrl) {
        const lineBreak = document.createElement("br");
        messageFragment.appendChild(lineBreak);

        const link = document.createElement("a");
        link.href = result.canvasUrl;
        link.textContent = result.canvasUrl;
        link.style.color = "var(--link-color)";
        link.style.textDecoration = "underline";
        link.target = "_blank"; // 새 창에서 열기
        messageFragment.appendChild(link);
      }

      SummarDebug.Notice(0, messageFragment, 0);
    } else {
      const frag = document.createDocumentFragment();
      const title = document.createElement("div");
      if (this.plugin.SLACK_UPLOAD_TO_CANVAS) {
        title.textContent = "⚠️ Slack Canvas Upload Failed";
      } else {
        title.textContent = "⚠️ Slack Message Send Failed";
      }
      title.style.fontWeight = "bold";
      title.style.marginBottom = "4px";

      const messageNoti = document.createElement("div");
      messageNoti.textContent = result.message;
      
      frag.appendChild(title);
      frag.appendChild(messageNoti);

      SummarDebug.Notice(0, frag, 0);
    }
  }

  private async uploadContentToWiki(title: string, content: string): Promise<void> {
    // Confluence 설정 확인
    if (this.plugin.settingsv2.common.confluenceParentPageUrl.length == 0 || 
      this.plugin.settingsv2.common.confluenceParentPageSpaceKey.length == 0 || 
      this.plugin.settingsv2.common.confluenceParentPageId.length == 0 ) {
        const fragment = document.createDocumentFragment();
        const message1 = document.createElement("span");
        message1.textContent = "To publish your notes to Confluence, " +
          "please specify the Parent Page where the content will be saved. \n";
        fragment.appendChild(message1);

        // 링크 생성 및 스타일링
        const link = document.createElement("a");
        link.textContent = "Set the Confluence Parent Page URL in the settings to configure the Space Key and Page ID";
        link.href = "#";
        link.style.cursor = "pointer";
        link.style.color = "var(--text-accent)"; // 링크 색상 설정 (옵션)
        link.addEventListener("click", (event) => {
          event.preventDefault(); // 기본 동작 방지
          showSettingsTab(this.plugin, 'common-tab');
        });
        fragment.appendChild(link);
        SummarDebug.Notice(0, fragment, 0);
        
        return;
    }

    SummarDebug.log(1, `title: ${title}`);
    SummarDebug.log(3, `content: ${content}`);
    
    // 타이틀 처리
    if (content.includes("## Confluence 문서 제목")) {
      const match = content.match(/EN:(.*?)(?:\r?\n|$)/);
      if (match && match[1]) {
        if (title.includes("summary")) {
          title = title.replace("summary", "");
        }  
        const entitle = match[1].trim();
        title = `${title} - ${entitle}`;
      }
    }
    
    // Markdown을 HTML로 변환
    const md = new MarkdownIt({
      html: true,
      xhtmlOut: true,  // XHTML 호환 출력 모드 활성화
      breaks: true,
      linkify: true
    });
    let html = md.render(content);
    
    // Confluence XHTML 호환성을 위한 후처리
    html = html
      .replace(/<br>/g, '<br />')  // <br>을 <br />로 변경
      .replace(/<hr>/g, '<hr />')  // <hr>을 <hr />로 변경
      .replace(/<img([^>]*?)>/g, '<img$1 />')  // <img>를 자동 닫힘 태그로 변경
      .replace(/<input([^>]*?)>/g, '<input$1 />')  // <input>을 자동 닫힘 태그로 변경
      .replace(/&(?!amp;|lt;|gt;|quot;|#\d+;|#x[\da-fA-F]+;)/g, '&amp;');  // 인코딩되지 않은 & 문자 처리
    
    const confluenceApi = new ConfluenceAPI(this.plugin);
    const { updated, statusCode, message, reason } = await confluenceApi.createPage(title, html);
    
    if (statusCode === 200) {
      // HTML 형식의 성공 메시지 생성
      const messageFragment = document.createDocumentFragment();
        
      const successText = document.createElement("div");
      if (updated) {
        successText.textContent = "Page has been updated successfully.";
      } else {
        successText.textContent = "Page has been created successfully.";
      }
      messageFragment.appendChild(successText);

      const lineBreak = document.createElement("br");
      messageFragment.appendChild(lineBreak);

      const link = document.createElement("a");
      link.href = message;
      link.textContent = message;
      link.style.color = "var(--link-color)"; // Obsidian의 링크 색상 사용
      link.style.textDecoration = "underline";
      messageFragment.appendChild(link);

      SummarDebug.Notice(0, messageFragment, 0);
    } else {
      const frag = document.createDocumentFragment();
      const title = document.createElement("div");
      title.textContent = "⚠️" + reason;
      title.style.fontWeight = "bold";
      title.style.marginBottom = "4px";

      const messageNoti = document.createElement("div");
      messageNoti.textContent = message as string;
      
      frag.appendChild(title);
      frag.appendChild(messageNoti);

      SummarDebug.Notice(0, frag, 0);
    }
  }

  private createResultItem(key: string, label: string): HTMLDivElement {
    // 전체 컨테이너 생성
    const resultItem = document.createElement('div');
    resultItem.className = 'result-item';
    resultItem.style.width = '100%';
    resultItem.style.marginBottom = '8px';
    resultItem.setAttribute('result-key', key);
 
    
    // resultHeader 생성 (공통 메서드 사용)
    const resultHeader = this.createResultHeader(key, label);
    
    // resultText 영역 생성 (기존 resultItem과 합침)
    const resultText = document.createElement('div');
    resultText.className = 'result-text';
    resultText.setAttribute('data-key', key);
    
    // resultItem의 스타일을 resultText에 적용
    resultText.style.width = '100%';
    resultText.style.minHeight = '10px';
    resultText.style.border = '1px solid var(--background-modifier-border)';
    resultText.style.padding = '8px';
    resultText.style.marginBottom = '0px';
    resultText.style.backgroundColor = 'var(--background-secondary)';
    resultText.style.wordWrap = 'break-word';
    resultText.style.whiteSpace = 'pre-wrap';
    
    // resultText 기본 스타일 추가
    resultText.style.color = 'var(--text-normal)';
    resultText.style.fontSize = '12px';
    resultText.style.lineHeight = '1.4';
    resultText.style.userSelect = 'text';
    resultText.style.cursor = 'text';
    resultText.style.margin = '0';
    resultText.style.wordBreak = 'break-word';
    resultText.style.overflowWrap = 'break-word';
    resultText.style.display = 'block';
    resultText.style.verticalAlign = 'top';
    resultText.setAttribute('data-raw-text', '');
    
    // 텍스트 선택 상태 유지를 위한 이벤트 리스너 추가 (모바일 호환)
    let savedSelection: {range: Range, startOffset: number, endOffset: number} | null = null;
    
    // 텍스트 선택 처리 함수 (mouse와 touch 이벤트 공통)
    const handleSelectionEnd = () => {
      try {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
          const range = selection.getRangeAt(0);
          if (resultText.contains(range.commonAncestorContainer)) {
            savedSelection = {
              range: range.cloneRange(),
              startOffset: range.startOffset,
              endOffset: range.endOffset
            };
          }
        }
      } catch (error) {
        // 모바일에서 selection API 오류 시 무시
        console.debug('Selection handling error (safe to ignore on mobile):', error);
      }
    };
    
    // 데스크톱용 mouseup 이벤트
    resultText.addEventListener('mouseup', handleSelectionEnd);
    
    // 모바일용 touchend 이벤트
    resultText.addEventListener('touchend', handleSelectionEnd);
    
    resultText.addEventListener('blur', (e) => {
      // 포커스를 잃어도 선택 상태를 시각적으로 유지 (모바일에서는 제한적)
      if (savedSelection && !Platform.isMobileApp) {
        setTimeout(() => {
          try {
            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(savedSelection!.range);
            }
          } catch (error) {
            // 선택 복원 실패 시 무시 (모바일에서 흔함)
            console.debug('Selection restoration failed (normal on mobile):', error);
          }
        }, 10);
      }
    });
    
    // resultItem에 헤더와 텍스트 영역 직접 추가
    resultItem.appendChild(resultHeader);
    resultItem.appendChild(resultText);
    
    // 원본 resultItem의 toggle button에 event listener 추가
    const toggleButton = resultHeader.querySelector('button[button-id="toggle-fold-button"]') as HTMLButtonElement;
    if (toggleButton) {
      toggleButton.addEventListener('click', (event) => {
        event.stopPropagation();
        
        // 중복 실행 방지
        if (this.isToggling) {
          SummarDebug.log(1, `Toggle already in progress for key: ${key}, skipping`);
          return;
        }
        
        this.isToggling = true;
        SummarDebug.log(1, `Original toggle clicked for key: ${key}`);
        
        try {
          const currentToggled = toggleButton.getAttribute('toggled') === 'true';
          const newToggled = !currentToggled;
          
          // 버튼 상태 업데이트
          toggleButton.setAttribute('toggled', newToggled ? 'true' : 'false');
          setIcon(toggleButton, newToggled ? 'square-chevron-down' : 'square-chevron-up');
          
          // resultText 표시/숨김
          if (newToggled) {
            resultText.style.display = 'none';
          } else {
            resultText.style.display = 'block';
          }
          
          SummarDebug.log(1, `Original toggle state changed to: ${newToggled ? 'folded' : 'unfolded'}`);
          
          // sticky header의 버튼 상태도 동기화
          if (this.stickyHeaderContainer && this.currentStickyKey === key) {
            const stickyToggleButton = this.stickyHeaderContainer.querySelector('button[button-id="toggle-fold-button"]') as HTMLButtonElement;
            if (stickyToggleButton) {
              stickyToggleButton.setAttribute('toggled', newToggled ? 'true' : 'false');
              setIcon(stickyToggleButton, newToggled ? 'square-chevron-down' : 'square-chevron-up');
            }
          }
          
          // fold/unfold 상태 변경 시 sticky header 가시성 재평가
          this.updateStickyHeaderVisibility();
        } finally {
          // 플래그 해제
          setTimeout(() => {
            this.isToggling = false;
          }, 100);
        }
      });
    }
    
    ///////////////////////////////////////////////////////////////
    return resultItem;
    
    // chatWithContext 영역 생성
    const chatWithContext = document.createElement('div');
    chatWithContext.className = 'chat-with-context';
    chatWithContext.style.width = '100%';
    chatWithContext.style.marginTop = '0px';
    chatWithContext.style.border = '1px solid var(--background-modifier-border)';
    chatWithContext.style.backgroundColor = 'var(--background-secondary)';
    
    // chatHeader 생성
    const chatHeader = document.createElement('div');
    chatHeader.className = 'chat-header';
    chatHeader.style.width = '100%';
    chatHeader.style.display = 'flex';
    chatHeader.style.alignItems = 'center';
    chatHeader.style.gap = '0px';
    chatHeader.style.padding = '0px';
    chatHeader.style.backgroundColor = 'var(--background-primary)';
    chatHeader.style.border = 'none';
    chatHeader.style.borderBottom = '1px solid var(--background-modifier-border)';
    
    // chatHeader Label 추가
    const chatLabel = document.createElement('span');
    chatLabel.textContent = 'Chat with Context';
    chatLabel.style.fontSize = '10px';
    chatLabel.style.color = 'var(--text-muted)';
    chatLabel.style.fontWeight = 'bold';
    chatLabel.style.flexGrow = '1';
    chatLabel.style.marginLeft = '2px'; // labelElement와 동일한 왼쪽 간격 적용
    chatLabel.style.marginRight = '0px';
    chatLabel.style.border = '1px solid var(--background-modifier-border)';
    chatLabel.style.padding = '2px 4px';
    chatLabel.style.borderRadius = '3px';
    chatLabel.style.backgroundColor = 'var(--background-secondary)';
    chatHeader.appendChild(chatLabel);
    
    // chatHeader button 추가
    const chatHeaderButton = document.createElement('button');
    chatHeaderButton.className = 'lucide-icon-button';
    chatHeaderButton.setAttribute('aria-label', 'Close chat area');
    chatHeaderButton.style.transform = 'scale(0.7)';
    chatHeaderButton.style.transformOrigin = 'center';
    chatHeaderButton.style.margin = '0';
    setIcon(chatHeaderButton, 'x');
    chatHeaderButton.addEventListener('click', () => {
      // 채팅 영역 토글 기능 (추후 구현)
      SummarDebug.Notice(1, 'Chat header button clicked');
    });
    chatHeader.appendChild(chatHeaderButton);
    
    // chatInput 생성
    const chatInput = document.createElement('textarea');
    chatInput.className = 'chat-input';
    chatInput.placeholder = 'Ask questions about this content...';
    chatInput.style.width = '100%';
    chatInput.style.minHeight = '60px';
    chatInput.style.padding = '8px';
    chatInput.style.border = 'none';
    // chatInput.style.borderBottom = '1px solid var(--background-modifier-border)';
    chatInput.style.backgroundColor = 'var(--background-secondary)';
    chatInput.style.color = 'var(--text-normal)';
    chatInput.style.fontSize = '12px';
    // chatInput.style.resize = 'vertical';
    chatInput.style.outline = 'none';
    
    // chatButtonArea 생성
    const chatButtonArea = document.createElement('div');
    chatButtonArea.className = 'chat-button-area';
    chatButtonArea.style.width = '100%';
    chatButtonArea.style.display = 'flex';
    chatButtonArea.style.justifyContent = 'flex-end';
    chatButtonArea.style.padding = '4px 8px'; // 8px에서 4px로 줄임
    chatButtonArea.style.minHeight = '32px'; // 최소 높이 설정
    chatButtonArea.style.backgroundColor = 'var(--background-primary)';
    
    // chatButtonArea의 send button 추가
    const chatSendButton = document.createElement('button');
    chatSendButton.className = 'lucide-icon-button';
    chatSendButton.setAttribute('aria-label', 'Send message');
    chatSendButton.style.transform = 'scale(0.7)'; // 0.7에서 0.6으로 더 축소
    chatSendButton.style.transformOrigin = 'center';
    chatSendButton.style.margin = '0';
    chatSendButton.style.height = '24px'; // 명시적 높이 설정
    chatSendButton.style.width = '24px'; // 명시적 너비 설정
    setIcon(chatSendButton, 'message-circle-plus');
    chatSendButton.addEventListener('click', () => {
      const message = chatInput.value.trim();
      if (message) {
        // 메시지 전송 기능 (추후 구현)
        SummarDebug.Notice(1, `Chat message: ${message}`);
        chatInput.value = '';
      }
    });
    chatButtonArea.appendChild(chatSendButton);
    
    // chatWithContext에 모든 요소 추가
    chatWithContext.appendChild(chatHeader);
    chatWithContext.appendChild(chatInput);
    chatWithContext.appendChild(chatButtonArea);
    
    // resultItem에 chatWithContext 추가
    resultItem.appendChild(chatWithContext);
    
    return resultItem;
  }

  // ==================== Sticky Header 관련 메서드들 ====================

  /**
   * sticky header 컨테이너를 초기화합니다.
   * resultContainer 위쪽에 별도의 floating 레이어로 생성합니다.
   */
  private setupStickyHeader(container: HTMLElement): void {
    this.stickyHeaderContainer = document.createElement('div');
    this.stickyHeaderContainer.className = 'sticky-header-container';
    
    // 초기 스타일 설정 (위치는 showStickyHeader에서 동적으로 계산)
    this.stickyHeaderContainer.style.position = 'absolute';
    this.stickyHeaderContainer.style.zIndex = '10000';
    this.stickyHeaderContainer.style.backgroundColor = 'var(--background-primary)';
    this.stickyHeaderContainer.style.border = '2px solid #ff6b35';
    this.stickyHeaderContainer.style.borderRadius = '6px';
    this.stickyHeaderContainer.style.padding = '2px';
    this.stickyHeaderContainer.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    this.stickyHeaderContainer.style.display = 'none';
    this.stickyHeaderContainer.style.pointerEvents = 'auto';
    
    // 최상위 container(containerEl)에 추가하여 resultContainer와 독립적인 레이어 생성
    container.appendChild(this.stickyHeaderContainer);
    
    SummarDebug.log(1, `Sticky header container created as independent layer above resultContainer`);
    SummarDebug.log(1, `Container parent: ${this.stickyHeaderContainer.parentElement?.className || 'no parent'}`);
  }

  /**
   * resultHeader들의 가시성을 감지하는 Intersection Observer를 설정합니다.
   */
  private setupHeaderObserver(): void {
    this.headerObserver = new IntersectionObserver((entries) => {
      SummarDebug.log(2, `Observer entries: ${entries.length}`);
      
      entries.forEach(entry => {
        const resultItem = entry.target.closest('.result-item') as HTMLDivElement;
        if (resultItem) {
          const key = resultItem.getAttribute('result-key');
          if (key) {
            if (entry.isIntersecting) {
              this.visibleHeaders.add(key);
              SummarDebug.log(2, `Header visible: ${key}`);
            } else {
              this.visibleHeaders.delete(key);
              SummarDebug.log(2, `Header hidden: ${key}`);
            }
          }
        }
      });
      
      SummarDebug.log(2, `Visible headers: [${Array.from(this.visibleHeaders).join(', ')}]`);
      this.updateStickyHeaderVisibility();
    }, {
      root: this.resultContainer,
      threshold: 0,
      rootMargin: '0px'
    });
    
    SummarDebug.log(1, 'Header observer created');
  }

  /**
   * 컨테이너 크기 변화를 감지하는 ResizeObserver를 설정합니다.
   */
  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      SummarDebug.log(2, `Resize observer entries: ${entries.length}`);
      
      // sticky header가 현재 표시되고 있다면 크기 업데이트
      if (this.stickyHeaderContainer && this.currentStickyKey && 
          this.stickyHeaderContainer.style.display !== 'none') {
        SummarDebug.log(1, `Container resized, updating sticky header size for key: ${this.currentStickyKey}`);
        this.updateStickyHeaderSize();
      }
    });
    
    // containerEl과 resultContainer 모두 감시
    this.resizeObserver.observe(this.containerEl);
    if (this.resultContainer) {
      this.resizeObserver.observe(this.resultContainer);
    }
    
    SummarDebug.log(1, 'Resize observer created');
  }

  /**
   * 현재 보이는 resultItem들 중에서 첫 번째 항목을 찾습니다.
   */
  private getFirstVisibleResultItem(): HTMLDivElement | null {
    const resultItems = Array.from(this.resultContainer.querySelectorAll('.result-item')) as HTMLDivElement[];
    const containerRect = this.resultContainer.getBoundingClientRect();
    
    for (const item of resultItems) {
      const rect = item.getBoundingClientRect();
      // resultContainer 영역과 겹치는 첫 번째 item 찾기
      if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
        return item;
      }
    }
    return null;
  }

  /**
   * sticky header의 표시/숨김을 업데이트합니다.
   */
  private updateStickyHeaderVisibility(): void {
    const firstVisibleItem = this.getFirstVisibleResultItem();
    
    SummarDebug.log(2, `First visible item: ${firstVisibleItem?.getAttribute('result-key') || 'none'}`);
    
    if (firstVisibleItem) {
      const key = firstVisibleItem.getAttribute('result-key');
      if (key) {
        const headerIsVisible = this.visibleHeaders.has(key);
        
        // resultText가 펼쳐져 있는지 확인
        const resultText = firstVisibleItem.querySelector('.result-text') as HTMLDivElement;
        const isTextExpanded = resultText && resultText.style.display !== 'none';
        
        SummarDebug.log(2, `Key: ${key}, Header visible: ${headerIsVisible}, Text expanded: ${isTextExpanded}`);
        
        // sticky header 표시 조건 (간단하고 명확한 로직):
        // 1. text가 펼쳐져 있고
        // 2. header가 안 보이면 → sticky header 표시
        const shouldShowSticky = isTextExpanded && !headerIsVisible;
        
        if (shouldShowSticky) {
          SummarDebug.log(1, `Showing sticky header for key: ${key} (header hidden, text expanded)`);
          this.showStickyHeader(key);
        } else {
          const reason = !isTextExpanded ? 'text folded' : 'header visible';
          SummarDebug.log(1, `Hiding sticky header (${reason} for key: ${key})`);
          this.hideStickyHeader();
        }
      }
    } else {
      // 보이는 resultItem이 없으면 sticky header 숨김
      SummarDebug.log(1, 'No visible items, hiding sticky header');
      this.hideStickyHeader();
    }
  }

  /**
   * sticky header를 표시합니다.
   * resultContainer의 위치를 계산하여 그 위쪽에 floating layer로 표시합니다.
   */
  private showStickyHeader(key: string): void {
    if (!this.stickyHeaderContainer) {
      SummarDebug.log(1, 'No sticky header container');
      return;
    }
    
    SummarDebug.log(1, `showStickyHeader called for key: ${key}`);
    
    // 부모 요소 확인 및 복구
    const currentParent = this.stickyHeaderContainer.parentElement;
    if (!currentParent) {
      SummarDebug.log(1, 'Sticky container lost parent, attempting to re-attach to main container');
      try {
        this.containerEl.appendChild(this.stickyHeaderContainer);
        const newParent = this.stickyHeaderContainer.parentElement;
        SummarDebug.log(1, `Re-attach result: ${newParent?.className || 'still no parent'}`);
        
        if (!newParent) {
          SummarDebug.log(1, 'Failed to re-attach sticky container to DOM');
          return;
        }
      } catch (error) {
        SummarDebug.log(1, `Failed to re-attach sticky container: ${error}`);
        return;
      }
    }
    
    // 이미 같은 key의 sticky header가 표시되고 있으면 스킵
    if (this.currentStickyKey === key) {
      SummarDebug.log(2, `Sticky header already showing for key: ${key}`);
      return;
    }
    
    const resultItem = this.resultItems.get(key);
    if (!resultItem) {
      SummarDebug.log(1, `No result item found for key: ${key}`);
      return;
    }
    
    const originalHeader = resultItem.querySelector('.result-header') as HTMLDivElement;
    const labelElement = originalHeader?.querySelector('span') as HTMLSpanElement;
    
    if (!originalHeader || !labelElement) {
      SummarDebug.log(1, `No header or label found for key: ${key}`);
      return;
    }
    
    // resultContainer의 실제 위치 계산
    const resultContainerRect = this.resultContainer.getBoundingClientRect();
    const containerRect = this.containerEl.getBoundingClientRect();
    
    // resultContainer 기준으로 상대 위치 계산
    const relativeTop = resultContainerRect.top - containerRect.top;
    const relativeLeft = resultContainerRect.left - containerRect.left;
    
    // 원본 resultHeader의 실제 크기 계산
    const originalHeaderRect = originalHeader.getBoundingClientRect();
    
    // 원본 header의 computed styles 확인
    const originalComputedStyle = window.getComputedStyle(originalHeader);
    const originalBoxSizing = originalComputedStyle.boxSizing;
    const originalPadding = originalComputedStyle.padding;
    const originalBorder = originalComputedStyle.border;
    
    SummarDebug.log(1, `ResultContainer position: top=${relativeTop}, left=${relativeLeft}, width=${resultContainerRect.width}`);
    SummarDebug.log(1, `Original header size: width=${originalHeaderRect.width}, height=${originalHeaderRect.height}`);
    SummarDebug.log(1, `Original header computed: boxSizing=${originalBoxSizing}, padding=${originalPadding}, border=${originalBorder}`);
    
    // 기존 sticky header 내용 제거
    this.stickyHeaderContainer.innerHTML = '';
    
    // 새로운 sticky header 생성
    const stickyHeader = this.createResultHeader(key, labelElement.textContent || '');
    stickyHeader.style.borderRadius = '0';
    stickyHeader.style.border = 'none'; // sticky header 내부의 header는 border 제거
    
    this.stickyHeaderContainer.appendChild(stickyHeader);
    
    // resultContainer 위쪽에 위치하도록 절대 좌표 설정 - 원본 header와 정확히 동일한 크기
    const styles = {
      position: 'absolute',
      top: `${relativeTop + 5}px`,
      left: `${relativeLeft + 10}px`, // resultText와 동일한 left 위치 (padding 고려)
      width: `${originalHeaderRect.width}px`, // 원본 resultHeader와 정확히 동일한 width
      height: `${originalHeaderRect.height}px`, // 원본 resultHeader와 정확히 동일한 height
      maxHeight: `${originalHeaderRect.height}px`, // height 고정
      minHeight: `${originalHeaderRect.height}px`, // height 고정
      boxSizing: 'border-box', // 원본과 동일한 box-sizing
      zIndex: '10000',
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      backgroundColor: 'var(--background-primary)', // resultHeader와 동일한 배경색
      border: '1px solid var(--background-modifier-border)', // resultHeader와 동일한 border
      borderRadius: '0px', // resultHeader와 동일하게 둥글지 않게
      padding: '0px', // resultHeader와 동일한 padding
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)', // 더 자연스러운 그림자
      pointerEvents: 'auto',
      overflow: 'hidden' // 내용이 넘치지 않도록
    };
    
    // 각 스타일을 개별적으로 강제 적용
    Object.entries(styles).forEach(([property, value]) => {
      this.stickyHeaderContainer!.style.setProperty(property, value, 'important');
    });
    
    this.stickyHeaderContainer.classList.add('visible');
    
    SummarDebug.log(1, `Sticky header positioned at: top=${relativeTop + 5}px, left=${relativeLeft + 10}px, width=${originalHeaderRect.width}px, height=${originalHeaderRect.height}px`);
    
    // DOM 강제 리플로우 유발
    this.stickyHeaderContainer.offsetHeight;
    
    // 위치 확인 (약간의 지연 후)
    setTimeout(() => {
      if (this.stickyHeaderContainer) {
        const rect = this.stickyHeaderContainer.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(this.stickyHeaderContainer);
        
        SummarDebug.log(1, `Sticky header final rect after timeout: top=${rect.top}, left=${rect.left}, width=${rect.width}, height=${rect.height}`);
        SummarDebug.log(1, `Sticky header computed: boxSizing=${computedStyle.boxSizing}, padding=${computedStyle.padding}, border=${computedStyle.border}, minHeight=${computedStyle.minHeight}, maxHeight=${computedStyle.maxHeight}`);
        SummarDebug.log(1, `Original vs Sticky height: ${originalHeaderRect.height} vs ${rect.height} (diff: ${rect.height - originalHeaderRect.height})`);
        
        // 여전히 크기가 0이면 추가 강제 설정
        if (rect.width === 0 || rect.height === 0) {
          SummarDebug.log(1, 'Still zero dimensions, applying emergency fix');
          this.stickyHeaderContainer.style.cssText = `
            position: absolute !important;
            top: ${relativeTop + 5}px !important;
            left: ${relativeLeft + 10}px !important;
            width: ${originalHeaderRect.width}px !important;
            height: ${originalHeaderRect.height}px !important;
            max-height: ${originalHeaderRect.height}px !important;
            min-height: ${originalHeaderRect.height}px !important;
            box-sizing: border-box !important;
            z-index: 10000 !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            background-color: var(--background-primary) !important;
            border: 1px solid var(--background-modifier-border) !important;
            border-radius: 0px !important;
            padding: 0px !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2) !important;
            pointer-events: auto !important;
            overflow: hidden !important;
          `;
          
          // 다시 확인
          setTimeout(() => {
            if (this.stickyHeaderContainer) {
              const finalRect = this.stickyHeaderContainer.getBoundingClientRect();
              SummarDebug.log(1, `Emergency fix result: top=${finalRect.top}, left=${finalRect.left}, width=${finalRect.width}, height=${finalRect.height}`);
            }
          }, 50);
        }
      }
    }, 10);
    
    this.currentStickyKey = key;
    SummarDebug.log(1, `Sticky header shown as floating layer above resultContainer for key: ${key}`);
  }

  /**
   * 현재 표시중인 sticky header의 크기를 업데이트합니다.
   * 컨테이너 리사이징 시 호출됩니다.
   */
  private updateStickyHeaderSize(): void {
    if (!this.stickyHeaderContainer || !this.currentStickyKey) {
      SummarDebug.log(2, 'No sticky header to update');
      return;
    }

    const resultItem = this.resultItems.get(this.currentStickyKey);
    if (!resultItem) {
      SummarDebug.log(1, `No result item found for sticky update, key: ${this.currentStickyKey}`);
      return;
    }

    const originalHeader = resultItem.querySelector('.result-header') as HTMLDivElement;
    if (!originalHeader) {
      SummarDebug.log(1, `No original header found for sticky update, key: ${this.currentStickyKey}`);
      return;
    }

    // 현재 위치와 크기 다시 계산
    const resultContainerRect = this.resultContainer.getBoundingClientRect();
    const containerRect = this.containerEl.getBoundingClientRect();
    const originalHeaderRect = originalHeader.getBoundingClientRect();

    // 새로운 위치와 크기 계산
    const relativeTop = resultContainerRect.top - containerRect.top;
    const relativeLeft = resultContainerRect.left - containerRect.left;

    SummarDebug.log(1, `Updating sticky header size: width=${originalHeaderRect.width}, height=${originalHeaderRect.height}`);

    // 위치와 크기를 다시 설정
    const styles = {
      top: `${relativeTop + 5}px`,
      left: `${relativeLeft + 10}px`,
      width: `${originalHeaderRect.width}px`,
      height: `${originalHeaderRect.height}px`,
      maxHeight: `${originalHeaderRect.height}px`,
      minHeight: `${originalHeaderRect.height}px`,
      boxSizing: 'border-box'
    };

    // 스타일 업데이트
    Object.entries(styles).forEach(([property, value]) => {
      this.stickyHeaderContainer!.style.setProperty(property, value, 'important');
    });

    SummarDebug.log(1, `Sticky header size updated to: width=${originalHeaderRect.width}px, height=${originalHeaderRect.height}px`);
  }

  /**
   * sticky header를 숨깁니다.
   */
  private hideStickyHeader(): void {
    if (!this.stickyHeaderContainer) return;
    
    // 강제로 숨김
    this.stickyHeaderContainer.style.display = 'none';
    this.stickyHeaderContainer.classList.remove('visible');
    this.currentStickyKey = null;
    SummarDebug.log(1, 'Sticky header hidden');
  }

  /**
   * resultHeader를 생성하는 공통 메서드입니다.
   */
  private createResultHeader(key: string, label: string): HTMLDivElement {
    const resultHeader = document.createElement('div');
    resultHeader.className = 'result-header';
    resultHeader.style.width = '100%';
    resultHeader.style.display = 'flex';
    resultHeader.style.alignItems = 'center';
    resultHeader.style.gap = '0px';
    resultHeader.style.marginBottom = '0px';
    resultHeader.style.padding = '0px';
    resultHeader.style.border = '1px solid var(--background-modifier-border)';
    resultHeader.style.backgroundColor = 'var(--background-primary)';
    
    // 라벨 추가
    const labelElement = document.createElement('span');
    labelElement.textContent = label;
    labelElement.style.fontSize = '10px';
    labelElement.style.color = 'var(--text-muted)';
    labelElement.style.marginLeft = '2px';
    labelElement.style.marginRight = '0px';
    labelElement.style.fontWeight = 'bold';
    labelElement.style.flexShrink = '0';
    labelElement.style.backgroundColor = 'var(--interactive-normal)';
    labelElement.style.padding = '2px 4px';
    labelElement.style.borderRadius = '3px';
    resultHeader.appendChild(labelElement);
    
    // 버튼들 추가
    this.addHeaderButtons(resultHeader, key);
    
    return resultHeader;
  }

  /**
   * resultHeader에 버튼들을 추가합니다.
   */
  private addHeaderButtons(resultHeader: HTMLDivElement, key: string): void {
    // uploadResultToWikiButton 추가
    const uploadResultToWikiButton = document.createElement('button');
    uploadResultToWikiButton.className = 'lucide-icon-button';
    uploadResultToWikiButton.setAttribute('aria-label', 'Upload this result to Confluence');
    uploadResultToWikiButton.setAttribute('button-id', 'upload-result-to-wiki-button'); 
    uploadResultToWikiButton.style.transform = 'scale(0.7)';
    uploadResultToWikiButton.style.transformOrigin = 'center';
    uploadResultToWikiButton.style.margin = '0';
    
    // 버튼 상태 동기화
    const originalButton = this.getOriginalButton(key, 'upload-result-to-wiki-button');
    if (originalButton) {
      uploadResultToWikiButton.disabled = originalButton.disabled;
      uploadResultToWikiButton.style.display = originalButton.style.display;
    } else {
      uploadResultToWikiButton.disabled = true;
      uploadResultToWikiButton.style.display = 'none';
    }
    
    setIcon(uploadResultToWikiButton, 'file-up');
    uploadResultToWikiButton.addEventListener('click', () => {
      let title = this.getNoteName(key);
      
      const lastSlashIndex = title.lastIndexOf('/');
      if (lastSlashIndex !== -1) {
        title = title.substring(lastSlashIndex + 1);
      }
      
      if (title.endsWith('.md')) {
        title = title.substring(0, title.length - 3);
      }
      
      const content = this.getResultText(key);
      this.uploadContentToWiki(title, content);
    });
    resultHeader.appendChild(uploadResultToWikiButton);
    
    // uploadResultToSlackButton 추가
    const uploadResultToSlackButton = document.createElement('button');
    uploadResultToSlackButton.className = 'lucide-icon-button';
    uploadResultToSlackButton.setAttribute('aria-label', 'Upload this result to Slack');
    uploadResultToSlackButton.setAttribute('button-id', 'upload-result-to-slack-button'); 
    uploadResultToSlackButton.style.transform = 'scale(0.7)';
    uploadResultToSlackButton.style.transformOrigin = 'center';
    uploadResultToSlackButton.style.margin = '0';
    
    // 버튼 상태 동기화
    const originalSlackButton = this.getOriginalButton(key, 'upload-result-to-slack-button');
    if (originalSlackButton) {
      uploadResultToSlackButton.disabled = originalSlackButton.disabled;
      uploadResultToSlackButton.style.display = originalSlackButton.style.display;
    } else {
      uploadResultToSlackButton.disabled = true;
      uploadResultToSlackButton.style.display = 'none';
    }
    
    setIcon(uploadResultToSlackButton, 'hash');
    uploadResultToSlackButton.addEventListener('click', () => {
      let title = this.getNoteName(key);
      
      const lastSlashIndex = title.lastIndexOf('/');
      if (lastSlashIndex !== -1) {
        title = title.substring(lastSlashIndex + 1);
      }
      
      if (title.endsWith('.md')) {
        title = title.substring(0, title.length - 3);
      }
      
      const content = this.getResultText(key);
      this.uploadContentToSlack(title, content);
    });
    resultHeader.appendChild(uploadResultToSlackButton);
    
    // newNoteButton 추가
    const newNoteButton = document.createElement('button');
    newNoteButton.className = 'lucide-icon-button';
    newNoteButton.setAttribute('aria-label', 'Create new note with this result');
    newNoteButton.setAttribute('button-id', 'new-note-button'); 
    newNoteButton.style.transform = 'scale(0.7)';
    newNoteButton.style.transformOrigin = 'center';
    newNoteButton.style.margin = '0';
    
    // 버튼 상태 동기화
    const originalNewNoteButton = this.getOriginalButton(key, 'new-note-button');
    if (originalNewNoteButton) {
      newNoteButton.disabled = originalNewNoteButton.disabled;
      newNoteButton.style.display = originalNewNoteButton.style.display;
    } else {
      newNoteButton.disabled = true;
      newNoteButton.style.display = 'none';
    }
    
    setIcon(newNoteButton, 'file-output');
    newNoteButton.addEventListener('click', async () => {
      try {
        let newNoteName = this.getNoteName(key);

        const filePath = normalizePath(newNoteName);
        const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);

        if (existingFile) {
          SummarDebug.log(1, `file exist: ${filePath}`);
          const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
          
          for (const leaf of leaves) {
            const view = leaf.view;
            if (view instanceof MarkdownView && view.file && view.file.path === filePath) {
              this.plugin.app.workspace.setActiveLeaf(leaf);
              return;
            }
          }
          await this.plugin.app.workspace.openLinkText(normalizePath(filePath), "", true);
        } else {
          SummarDebug.log(1, `file is not exist: ${filePath}`);
          const folderPath = filePath.substring(0, filePath.lastIndexOf("/"));
          const folderExists = await this.plugin.app.vault.adapter.exists(folderPath);
          if (!folderExists) {
            await this.plugin.app.vault.adapter.mkdir(folderPath);
          }
          
          const resultTextContent = this.getResultText(key);
          SummarDebug.log(1, `resultText content===\n${resultTextContent}`);
          await this.plugin.app.vault.create(filePath, resultTextContent);
          await this.plugin.app.workspace.openLinkText(normalizePath(filePath), "", true);
        }
      } catch (error) {
        SummarDebug.log(1, `Error creating new note: ${error}`);
        SummarDebug.Notice(1, 'Failed to create new note');
      }
    });
    resultHeader.appendChild(newNoteButton);
    
    // toggleFoldButton 추가
    const toggleFoldButton = document.createElement('button');
    toggleFoldButton.className = 'lucide-icon-button';
    toggleFoldButton.setAttribute('aria-label', 'Toggle fold/unfold this result');
    toggleFoldButton.setAttribute('button-id', 'toggle-fold-button');
    toggleFoldButton.setAttribute('toggled', 'false');
    toggleFoldButton.style.transform = 'scale(0.7)';
    toggleFoldButton.style.transformOrigin = 'center';
    toggleFoldButton.style.margin = '0';
    
    // 원본 버튼의 상태를 가져와서 동기화
    const originalToggleButton = this.getOriginalButton(key, 'toggle-fold-button');
    if (originalToggleButton) {
      const isToggled = originalToggleButton.getAttribute('toggled') === 'true';
      toggleFoldButton.setAttribute('toggled', isToggled ? 'true' : 'false');
      setIcon(toggleFoldButton, isToggled ? 'square-chevron-down' : 'square-chevron-up');
    } else {
      setIcon(toggleFoldButton, 'square-chevron-up');
    }
    
    toggleFoldButton.addEventListener('click', (event) => {
      event.stopPropagation();
      
      // 중복 실행 방지
      if (this.isToggling) {
        SummarDebug.log(1, `Toggle already in progress for key: ${key}, skipping sticky header click`);
        return;
      }
      
      this.isToggling = true;
      SummarDebug.log(1, `Sticky header toggle clicked for key: ${key}`);
      
      try {
        // 직접 fold 상태 토글 (원본 버튼 클릭 대신)
        const resultItem = this.resultItems.get(key);
        if (resultItem) {
          const originalToggleButton = resultItem.querySelector('button[button-id="toggle-fold-button"]') as HTMLButtonElement;
          const resultText = resultItem.querySelector('.result-text') as HTMLDivElement;
          
          if (originalToggleButton && resultText) {
            const currentToggled = originalToggleButton.getAttribute('toggled') === 'true';
            const newToggled = !currentToggled;
            
            // 원본 버튼 상태 업데이트
            originalToggleButton.setAttribute('toggled', newToggled ? 'true' : 'false');
            setIcon(originalToggleButton, newToggled ? 'square-chevron-down' : 'square-chevron-up');
            
            // sticky 버튼 상태 업데이트
            toggleFoldButton.setAttribute('toggled', newToggled ? 'true' : 'false');
            setIcon(toggleFoldButton, newToggled ? 'square-chevron-down' : 'square-chevron-up');
            
            // resultText 표시/숨김
            if (newToggled) {
              resultText.style.display = 'none';
            } else {
              resultText.style.display = 'block';
            }
            
            SummarDebug.log(1, `Sticky toggle state changed to: ${newToggled ? 'folded' : 'unfolded'}`);
            
            // fold/unfold 상태 변경 시 sticky header 가시성 재평가
            this.updateStickyHeaderVisibility();
          }
        }
      } finally {
        // 플래그 해제
        setTimeout(() => {
          this.isToggling = false;
        }, 100);
      }
    });
    
    resultHeader.appendChild(toggleFoldButton);
    
    // copyResultButton 추가
    const copyResultButton = document.createElement('button');
    copyResultButton.className = 'lucide-icon-button';
    copyResultButton.setAttribute('aria-label', 'Copy this result to clipboard');
    copyResultButton.style.transform = 'scale(0.7)';
    copyResultButton.style.transformOrigin = 'center';
    copyResultButton.style.margin = '0';
    
    setIcon(copyResultButton, 'copy');
    copyResultButton.addEventListener('click', async () => {
      try {
        const resultItem = this.resultItems.get(key);
        if (resultItem) {
          const resultText = resultItem.querySelector('.result-text') as HTMLDivElement;
          if (resultText) {
            const rawText = resultText.getAttribute('data-raw-text') || '';
            await navigator.clipboard.writeText(rawText);
            SummarDebug.Notice(1, 'Content copied to clipboard');
          }
        }
      } catch (error) {
        SummarDebug.log(1, `Error copying to clipboard: ${error}`);
        SummarDebug.Notice(0, 'Failed to copy content to clipboard');
      }
    });
    resultHeader.appendChild(copyResultButton);
    
    // deleteResultItemButton 추가
    const deleteResultItemButton = document.createElement('button');
    deleteResultItemButton.className = 'lucide-icon-button';
    deleteResultItemButton.setAttribute('aria-label', 'Delete this result item');
    deleteResultItemButton.style.transform = 'scale(0.7)';
    deleteResultItemButton.style.transformOrigin = 'center';
    deleteResultItemButton.style.margin = '0';
    deleteResultItemButton.style.marginLeft = 'auto';
    deleteResultItemButton.disabled = true;
    deleteResultItemButton.style.display = 'none';
    
    setIcon(deleteResultItemButton, 'trash-2');
    deleteResultItemButton.addEventListener('click', () => {
      this.resultItems.delete(key);
      this.newNoteNames.delete(key);
      const resultItem = this.resultItems.get(key);
      if (resultItem) {
        resultItem.remove();
      }
    });
    resultHeader.appendChild(deleteResultItemButton);
  }

  /**
   * 원본 resultItem에서 특정 버튼을 찾습니다.
   */
  private getOriginalButton(key: string, buttonId: string): HTMLButtonElement | null {
    const resultItem = this.resultItems.get(key);
    if (!resultItem) return null;
    
    return resultItem.querySelector(`button[button-id="${buttonId}"]`) as HTMLButtonElement;
  }


}
