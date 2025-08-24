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
  }

  async onClose(): Promise<void> {
    SummarDebug.log(1, "Summar View closed");
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
    resultContainer.style.width = "calc(100% - 10px)";
    resultContainer.style.height = "calc(100% - 120px)"; // status bar 높이(30px) 추가로 고려하여 80px에서 110px로 조정
    resultContainer.style.border = "1px solid var(--background-modifier-border)";
    resultContainer.style.padding = "10px";
    resultContainer.style.margin = "5px"; // 위로 붙임
    resultContainer.style.overflowY = "auto";
    resultContainer.style.overflowX = "hidden";
    resultContainer.style.backgroundColor = "var(--background-primary)";
    resultContainer.style.color = "var(--text-normal)"; // Obsidian의 기본 텍스트 색상 변수 사용
  
    this.resultContainer = resultContainer;

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
    let resultItem = this.resultItems.get(key);
    
    if (!resultItem) {
      // 존재하지 않으면 updateResultText 호출
      return this.updateResultText(key, label, message);
    }
    
    // 기존 텍스트에 추가
    const resultText = resultItem.querySelector('.result-text') as HTMLDivElement;
    if (resultText) {
      const currentText = resultText.getAttribute('data-raw-text') || '';
      const newText = currentText + message;
      resultText.setAttribute('data-raw-text', newText);
      const renderedHtml = this.markdownRenderer.render(newText);
      const cleanedHtml = this.cleanupMarkdownOutput(renderedHtml);
      resultText.innerHTML = cleanedHtml;
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
 
    
    // resultHeader 생성
    const resultHeader = document.createElement('div');
    resultHeader.className = 'result-header';
    resultHeader.style.width = '100%';
    resultHeader.style.display = 'flex';
    resultHeader.style.alignItems = 'center';
    resultHeader.style.gap = '0px'; // 간격을 0으로 변경
    resultHeader.style.marginBottom = '0px'; // 4px에서 0px로 변경
    resultHeader.style.padding = '0px';
    resultHeader.style.border = '1px solid var(--background-modifier-border)';
    resultHeader.style.backgroundColor = 'var(--background-primary)';
    
    // 라벨 추가
    const labelElement = document.createElement('span');
    labelElement.textContent = label;
    labelElement.style.fontSize = '10px';
    labelElement.style.color = 'var(--text-muted)';
    labelElement.style.marginLeft = '2px'; // 상하단 간격(1px)만큼 왼쪽 간격 추가
    labelElement.style.marginRight = '0px'; // 버튼과 붙이기 위해 0으로 변경
    labelElement.style.fontWeight = 'bold';
    labelElement.style.flexShrink = '0'; // 라벨이 축소되지 않도록 설정
    labelElement.style.backgroundColor = 'var(--interactive-normal)'; // lucide icon button과 동일한 바탕색
    labelElement.style.padding = '2px 4px'; // 패딩 추가로 바탕색이 잘 보이도록
    labelElement.style.borderRadius = '3px'; // 둥근 모서리 추가
    resultHeader.appendChild(labelElement);
    
    // uploadResultToWikiButton 추가
    const uploadResultToWikiButton = document.createElement('button');
    uploadResultToWikiButton.className = 'lucide-icon-button';
    uploadResultToWikiButton.setAttribute('aria-label', 'Upload this result to Confluence');
    uploadResultToWikiButton.setAttribute('button-id', 'upload-result-to-wiki-button'); 
    uploadResultToWikiButton.style.transform = 'scale(0.7)'; // 70% 크기로 변경
    uploadResultToWikiButton.style.transformOrigin = 'center'; // 중앙 기준으로 축소
    uploadResultToWikiButton.style.margin = '0'; // 버튼 간격 제거
    
    // newNoteButton을 초기에는 disable하고 hide
    uploadResultToWikiButton.disabled = true;
    uploadResultToWikiButton.style.display = 'none';
    
    setIcon(uploadResultToWikiButton, 'file-up');
    uploadResultToWikiButton.addEventListener('click', () => {
      let title = this.getNoteName(key);
      
      // 맨 마지막 '/'까지 제거
      const lastSlashIndex = title.lastIndexOf('/');
      if (lastSlashIndex !== -1) {
        title = title.substring(lastSlashIndex + 1);
      }
      
      // 맨 뒤의 '.md' 제거
      if (title.endsWith('.md')) {
        title = title.substring(0, title.length - 3);
      }
      
      const content = this.getResultText(key);
      this.uploadContentToWiki(title, content)

      // SummarDebug.Notice(1, 'uploadResultToWikiButton');
    });
    resultHeader.appendChild(uploadResultToWikiButton);
    
    // uploadResultToSlackButton 추가
    const uploadResultToSlackButton = document.createElement('button');
    uploadResultToSlackButton.className = 'lucide-icon-button';
    uploadResultToSlackButton.setAttribute('aria-label', 'Upload this result to Slack');
    uploadResultToSlackButton.setAttribute('button-id', 'upload-result-to-slack-button'); 
    uploadResultToSlackButton.style.transform = 'scale(0.7)'; // 70% 크기로 변경
    uploadResultToSlackButton.style.transformOrigin = 'center'; // 중앙 기준으로 축소
    uploadResultToSlackButton.style.margin = '0'; // 버튼 간격 제거
    
    // newNoteButton을 초기에는 disable하고 hide
    uploadResultToSlackButton.disabled = true;
    uploadResultToSlackButton.style.display = 'none';
    
    setIcon(uploadResultToSlackButton, 'hash');
    uploadResultToSlackButton.addEventListener('click', () => {
      let title = this.getNoteName(key);
      
      // 맨 마지막 '/'까지 제거
      const lastSlashIndex = title.lastIndexOf('/');
      if (lastSlashIndex !== -1) {
        title = title.substring(lastSlashIndex + 1);
      }
      
      // 맨 뒤의 '.md' 제거
      if (title.endsWith('.md')) {
        title = title.substring(0, title.length - 3);
      }
      
      const content = this.getResultText(key);
      this.uploadContentToSlack(title, content)
      // SummarDebug.Notice(1, 'uploadResultToSlackButton');
    });
    resultHeader.appendChild(uploadResultToSlackButton);
    
    // newNoteButton 추가
    const newNoteButton = document.createElement('button');
    newNoteButton.className = 'lucide-icon-button';
    newNoteButton.setAttribute('aria-label', 'Create new note with this result');
    newNoteButton.setAttribute('button-id', 'new-note-button'); 
    newNoteButton.style.transform = 'scale(0.7)'; // 70% 크기로 변경
    newNoteButton.style.transformOrigin = 'center'; // 중앙 기준으로 축소
    newNoteButton.style.margin = '0'; // 버튼 간격 제거
    
    // newNoteButton을 초기에는 disable하고 hide
    newNoteButton.disabled = true;
    newNoteButton.style.display = 'none';
    
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
          
          // resultText의 내용을 가져와서 노트 생성
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
    toggleFoldButton.style.transform = 'scale(0.7)'; // 70% 크기로 변경
    toggleFoldButton.style.transformOrigin = 'center'; // 중앙 기준으로 축소
    toggleFoldButton.style.margin = '0'; // 버튼 간격 제거
    
    setIcon(toggleFoldButton, 'square-chevron-up');
    
    // fold/unfold 기능을 수행하는 공통 함수
    const toggleFold = () => {
      const isToggled = toggleFoldButton.getAttribute('toggled') === 'true';
      
      if (isToggled) {
        // 현재 접혀있는 상태 -> 펼치기
        toggleFoldButton.setAttribute('toggled', 'false');
        setIcon(toggleFoldButton, 'square-chevron-up');
        resultText.style.display = 'block'; // resultText 보이기
      } else {
        // 현재 펼쳐져있는 상태 -> 접기
        toggleFoldButton.setAttribute('toggled', 'true');
        setIcon(toggleFoldButton, 'square-chevron-down');
        resultText.style.display = 'none'; // resultText 숨기기
      }
    };
    
    // toggleFoldButton 클릭 이벤트
    toggleFoldButton.addEventListener('click', (event) => {
      event.stopPropagation(); // 버튼 클릭 시 부모 요소 클릭 이벤트 차단
      toggleFold();
    });
    
    // resultHeader 클릭 이벤트 (toggleFoldButton과 동일한 동작)
    resultHeader.addEventListener('click', (event) => {
      // 버튼들을 클릭했을 때는 fold 동작을 하지 않도록 체크
      const target = event.target as HTMLElement;
      const isButton = target.tagName === 'BUTTON' || target.closest('button');
      
      if (!isButton) {
        toggleFold();
      }
    });
    
    resultHeader.appendChild(toggleFoldButton);
    
    
    // copyResultButton 추가
    const copyResultButton = document.createElement('button');
    copyResultButton.className = 'lucide-icon-button';
    copyResultButton.setAttribute('aria-label', 'Copy this result to clipboard');
    copyResultButton.style.transform = 'scale(0.7)'; // 70% 크기로 변경
    copyResultButton.style.transformOrigin = 'center'; // 중앙 기준으로 축소
    copyResultButton.style.margin = '0'; // 버튼 간격 제거
    
    setIcon(copyResultButton, 'copy');
    copyResultButton.addEventListener('click', async () => {
      try {
        const rawText = resultText.getAttribute('data-raw-text') || '';
        await navigator.clipboard.writeText(rawText);
        SummarDebug.Notice(1, 'Content copied to clipboard');
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
    deleteResultItemButton.style.transform = 'scale(0.7)'; // 70% 크기로 변경
    deleteResultItemButton.style.transformOrigin = 'center'; // 중앙 기준으로 축소
    deleteResultItemButton.style.margin = '0'; // 버튼 간격 제거
    deleteResultItemButton.style.marginLeft = 'auto'; // 오른쪽으로 정렬
    setIcon(deleteResultItemButton, 'trash-2');
    deleteResultItemButton.addEventListener('click', () => {
      // 현재 resultItem 삭제
      this.resultItems.delete(key);
      this.newNoteNames.delete(key); // newNoteNames Map에서도 해당 key 제거
      resultItem.remove();
    });
    resultHeader.appendChild(deleteResultItemButton);
    // hide
    deleteResultItemButton.disabled = true;
    deleteResultItemButton.style.display = 'none';

    
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
    
    return resultItem;
  }


}
