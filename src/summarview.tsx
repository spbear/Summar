import { View, WorkspaceLeaf, Platform, setIcon, normalizePath, MarkdownView } from "obsidian";

import SummarPlugin  from "./main";
import { SummarDebug, SummarViewContainer, showSettingsTab } from "./globals";
import { ConfluenceAPI } from "./confluenceapi";
import { SlackAPI } from "./slackapi";
import MarkdownIt from "markdown-it";

export class SummarView extends View {
  static VIEW_TYPE = "summar-view";

  plugin: SummarPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: SummarPlugin) {
    super(leaf);
    this.plugin = plugin;
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
    buttonContainer.style.margin = "5px";
  
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
            
            // SummarDebug.Notice(0, "Please set Confluence Parent Page URL, Space Key, and ID in the settings.",0);
            return;
        }
        // SummarDebug.Notice(1, "uploadNoteToWiki");
        const file = this.plugin.app.workspace.getActiveFile();
        if (file) {
          let title = file.basename;
          const content = await this.plugin.app.vault.read(file);
          SummarDebug.log(1, `title: ${title}`);
          SummarDebug.log(3, `content: ${content}`);
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
        } else {
          SummarDebug.Notice(0, "No active editor was found.");
        }
      }
      else {
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
        
        const file = this.plugin.app.workspace.getActiveFile();
        if (file) {
          let title = file.basename;
          const content = await this.plugin.app.vault.read(file);
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
  

    const newNoteButton = buttonContainer.createEl("button", {
      cls: "lucide-icon-button",
    });
    newNoteButton.setAttribute("aria-label", "Create new note with results");
    setIcon(newNoteButton, "file-output");

    // newNoteButton 클릭 이벤트 리스너
    newNoteButton.addEventListener("click", async() => {

      let newNoteName = this.plugin.newNoteName;
      
      if (!newNoteName || newNoteName === "") {
        const summarView = new SummarViewContainer(this.plugin);
        summarView.enableNewNote(true, newNoteName);
        newNoteName = this.plugin.newNoteName;
      }

      const filePath = normalizePath(newNoteName);
      const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);

      if (existingFile) {
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
        SummarDebug.log(1, `resultContainer.value===\n${this.plugin.resultContainer.value}`);
        await this.plugin.app.vault.create(filePath, this.plugin.resultContainer.value);
        await this.plugin.app.workspace.openLinkText(normalizePath(filePath), "", true);
      }
    });

    this.plugin.newNoteButton = newNoteButton;

    if (this.plugin.newNoteButton) {
      this.plugin.newNoteButton.disabled = true;
      this.plugin.newNoteButton.classList.toggle("disabled", true);
    }
    
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
    const resultContainer: HTMLTextAreaElement = container.createEl("textarea", {
      cls: "summarview-result",
    });
    resultContainer.style.width = "calc(100% - 10px)";
    resultContainer.style.height = "calc(100% - 110px)"; // status bar 높이(30px) 추가로 고려하여 80px에서 110px로 조정
    resultContainer.style.border = "1px solid var(--background-modifier-border)";
    resultContainer.style.padding = "10px";
    resultContainer.style.margin = "5px"; // 위로 붙임
    resultContainer.style.whiteSpace = "pre-wrap";
    resultContainer.style.wordWrap = "break-word";
    resultContainer.style.overflowY = "auto";
    resultContainer.style.overflowX = "hidden";
    resultContainer.style.resize = "none";
    resultContainer.readOnly = true;
    resultContainer.style.color = "var(--text-normal)"; // Obsidian의 기본 텍스트 색상 변수 사용
  
    this.plugin.resultContainer = resultContainer;
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

}
