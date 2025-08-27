import { ISummarUploadManager, ISummarViewContext } from "./SummarViewTypes";
import { SummarDebug, showSettingsTab } from "../globals";
import { ConfluenceAPI } from "../confluenceapi";
import { SlackAPI } from "../slackapi";
import MarkdownIt from "markdown-it";

export class SummarUploadManager implements ISummarUploadManager {
  constructor(private context: ISummarViewContext) {}

  async uploadContentToWiki(title: string, content: string): Promise<void> {
    // Confluence 설정 확인
    if (this.context.plugin.settingsv2.common.confluenceParentPageUrl.length == 0 || 
      this.context.plugin.settingsv2.common.confluenceParentPageSpaceKey.length == 0 || 
      this.context.plugin.settingsv2.common.confluenceParentPageId.length == 0) {
        
        this.showConfluenceConfigMessage();
        return;
    }

    SummarDebug.log(1, `title: ${title}`);
    SummarDebug.log(3, `content: ${content}`);
    
    // 타이틀 처리
    const processedTitle = this.processWikiTitle(title, content);
    
    // Markdown을 HTML로 변환
    const html = this.convertMarkdownToConfluenceHtml(content);
    
    const confluenceApi = new ConfluenceAPI(this.context.plugin);
    const { updated, statusCode, message, reason } = await confluenceApi.createPage(processedTitle, html);
    
    if (statusCode === 200) {
      this.showWikiSuccessMessage(updated, message);
    } else {
      this.showWikiErrorMessage(reason || "Unknown error", message || "Unknown message");
    }
  }

  async uploadContentToSlack(title: string, content: string): Promise<void> {
    // Slack API가 활성화되어 있는지만 확인 (토큰은 선택적)
    if (!this.context.plugin.settingsv2.common.useSlackAPI) {
      this.showSlackConfigMessage();
      return;
    }
    
    SummarDebug.log(1, `Slack upload - title: ${title}`);
    SummarDebug.log(3, `Slack upload - content: ${content}`);

    const slackApi = new SlackAPI(this.context.plugin);
    const result = await slackApi.uploadNote(title, content);
    
    if (result.success) {
      this.showSlackSuccessMessage(result);
    } else {
      this.showSlackErrorMessage(result.message);
    }
  }

  getCurrentMainPaneTabType(): string {
    const existingLeaf = this.context.plugin.app.workspace.getMostRecentLeaf();
    if (!existingLeaf) return ""; 
    return existingLeaf.view.getViewType();
  }

  updateSlackButtonTooltip(): void {
    const uploadSlackButton = this.context.plugin.uploadNoteToSlackButton;
    if (!uploadSlackButton) return;

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
      uploadSlackButton.setAttribute("aria-label", `Create Slack Canvas${channelInfo}`);
    } else {
      uploadSlackButton.setAttribute("aria-label", `Send Slack Message${channelInfo}`);
    }
  }

  private processWikiTitle(title: string, content: string): string {
    // '/' 이후부터 '.md' 이전까지의 문자열 추출
    const lastSlashIndex = title.lastIndexOf('/');
    if (lastSlashIndex !== -1) {
      title = title.substring(lastSlashIndex + 1);
    }
    
    if (title.endsWith('.md')) {
      title = title.substring(0, title.length - 3);
    }
    
    // Confluence 문서 제목 처리 로직
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
    return title;
  }

  private convertMarkdownToConfluenceHtml(content: string): string {
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
    
    return html;
  }

  private showConfluenceConfigMessage(): void {
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
    link.style.color = "var(--text-accent)";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showSettingsTab(this.context.plugin, 'common-tab');
    }, { signal: this.context.abortController.signal });
    fragment.appendChild(link);
    SummarDebug.Notice(0, fragment, 0);
  }

  private showSlackConfigMessage(): void {
    const fragment = document.createDocumentFragment();
    const message1 = document.createElement("span");
    
    if (this.context.plugin.SLACK_UPLOAD_TO_CANVAS) {
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
      showSettingsTab(this.context.plugin, 'common-tab');
    }, { signal: this.context.abortController.signal });
    fragment.appendChild(link);
    SummarDebug.Notice(0, fragment, 0);
  }

  private showWikiSuccessMessage(updated: boolean, url: string): void {
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
    link.href = url;
    link.textContent = url;
    link.style.color = "var(--link-color)";
    link.style.textDecoration = "underline";
    messageFragment.appendChild(link);

    SummarDebug.Notice(0, messageFragment, 0);
  }

  private showWikiErrorMessage(reason: string, message: string): void {
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

  private showSlackSuccessMessage(result: any): void {
    const messageFragment = document.createDocumentFragment();
      
    const successText = document.createElement("div");
    if (this.context.plugin.SLACK_UPLOAD_TO_CANVAS) {
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
      link.target = "_blank";
      messageFragment.appendChild(link);
    }

    SummarDebug.Notice(0, messageFragment, 0);
  }

  private showSlackErrorMessage(message: string): void {
    const frag = document.createDocumentFragment();
    const title = document.createElement("div");
    if (this.context.plugin.SLACK_UPLOAD_TO_CANVAS) {
      title.textContent = "⚠️ Slack Canvas Upload Failed";
    } else {
      title.textContent = "⚠️ Slack Message Send Failed";
    }
    title.style.fontWeight = "bold";
    title.style.marginBottom = "4px";

    const messageNoti = document.createElement("div");
    messageNoti.textContent = message;
    
    frag.appendChild(title);
    frag.appendChild(messageNoti);

    SummarDebug.Notice(0, frag, 0);
  }
}
