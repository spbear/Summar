import { Platform, setIcon } from "obsidian";
import { ISummarUIRenderer, ISummarViewContext } from "./SummarViewTypes";
import { SummarDebug } from "../globals";

export class SummarUIRenderer implements ISummarUIRenderer {
  constructor(private context: ISummarViewContext) {}

  renderUrlInputContainer(container: HTMLElement): HTMLDivElement {
    const urlInputContainer: HTMLDivElement = container.createEl("div", {
      cls: "url-input-container",
    });
    
    this.setupUrlInputContainerStyles(urlInputContainer);
    
    // Input field 생성
    const urlInputField = this.createUrlInputField(urlInputContainer);
    
    // Fetch button 생성
    const fetchButton = this.createFetchButton(urlInputContainer);
    
    // 이벤트 리스너 설정
    this.setupInputEvents(urlInputField, fetchButton);
    
    return urlInputContainer;
  }

  renderButtonContainer(container: HTMLElement): HTMLDivElement {
    const buttonContainer: HTMLDivElement = container.createEl("div", {
      cls: "summar-button-container",
    });
    
    this.setupButtonContainerStyles(buttonContainer);
    
    // 버튼들 생성
    const uploadWikiButton = this.createUploadWikiButton(buttonContainer);
    const uploadSlackButton = this.createUploadSlackButton(buttonContainer);
    const testButton = this.createTestButton(buttonContainer);
    
    // 구분선 추가
    this.createSeparator(buttonContainer);
    
    const pdfButton = this.createPdfButton(buttonContainer);
    const recordButton = this.createRecordButton(buttonContainer);
    
    // 플랫폼별 버튼 가시성 설정
    this.setupPlatformSpecificVisibility({
      uploadWikiButton,
      uploadSlackButton,
      testButton,
      pdfButton,
      recordButton
    });
    
    // 이벤트 리스너 설정
    this.setupButtonEvents({
      uploadWikiButton,
      uploadSlackButton,
      testButton,
      pdfButton,
      recordButton
    });
    
    return buttonContainer;
  }

  renderOutputContainer(container: HTMLElement): HTMLDivElement {
    const outputContainer: HTMLDivElement = container.createEl("div", {
      cls: "summarview-output",
    });
    
    this.setupOutputContainerStyles(outputContainer);
    
    return outputContainer;
  }

  renderComposerContainer(container: HTMLElement): HTMLDivElement {
    const composerContainer: HTMLDivElement = container.createEl("div", {
      cls: "summarview-composer",
    });
    
    // 스타일 설정은 SummarComposerManager.setupComposerContainer()에서 통합 관리
    // 여기서는 기본 클래스만 설정하고 실제 스타일은 SummarComposerManager가 담당
    
    return composerContainer;
  }

  setupContainerStyles(container: HTMLElement): void {
    // 컨테이너의 기본 스타일 설정
    container.style.height = "100%";
    container.style.overflow = "hidden";
  }

  private setupUrlInputContainerStyles(urlInputContainer: HTMLDivElement): void {
    urlInputContainer.style.display = "flex";
    urlInputContainer.style.alignItems = "center";
    urlInputContainer.style.gap = "5px";
    urlInputContainer.style.marginBottom = "1px";
    
    // Copilot 등 다른 플러그인의 CSS 간섭 방지
    urlInputContainer.style.setProperty('margin-left', '5px', 'important');
    urlInputContainer.style.setProperty('margin-right', '5px', 'important');
    urlInputContainer.classList.add('summar-url-input-container');
  }

  private createUrlInputField(container: HTMLDivElement): HTMLInputElement {
    const urlInputField: HTMLInputElement = container.createEl("input", {
      type: "text",
      placeholder: "Enter Web page URL",
      cls: "summarview-url-input",
    });
    
    urlInputField.style.flexGrow = "1";
    urlInputField.style.padding = "8px";
    urlInputField.style.border = "1px solid var(--background-modifier-border)";
    urlInputField.style.borderRadius = "5px";
    urlInputField.style.boxSizing = "border-box";
    urlInputField.style.margin = "5px";
    urlInputField.value = this.context.plugin.settingsv2.system.testUrl || "";
    
    // Store input field for later use
    this.context.plugin.urlInputField = urlInputField;
    
    return urlInputField;
  }

  private createFetchButton(container: HTMLDivElement): HTMLButtonElement {
    const fetchButton: HTMLButtonElement = container.createEl("button", {
      text: "GO",
      cls: "summarview-button",
    });
    
    fetchButton.setAttribute("aria-label", "Fetch and summarize the web page");
    fetchButton.style.padding = "8px 12px";
    fetchButton.style.border = "1px solid var(--background-modifier-border)";
    fetchButton.style.borderRadius = "5px";
    fetchButton.style.cursor = "pointer";
    fetchButton.style.flexShrink = "0";
    fetchButton.style.margin = "5px";
    
    return fetchButton;
  }

  private setupButtonContainerStyles(buttonContainer: HTMLDivElement): void {
    buttonContainer.style.display = "flex";
    buttonContainer.style.alignItems = "center";
    buttonContainer.style.gap = "5px";
    buttonContainer.style.marginBottom = "1px";
    buttonContainer.style.marginLeft = "5px";
    buttonContainer.style.marginRight = "5px";
    buttonContainer.style.marginTop = "0px";
    
    // Copilot 등 다른 플러그인의 CSS 간섭 방지
    buttonContainer.style.setProperty('margin-left', '5px', 'important');
    buttonContainer.style.setProperty('margin-right', '5px', 'important');
    buttonContainer.classList.add('summar-button-container');
  }

  private createUploadWikiButton(container: HTMLDivElement): HTMLButtonElement {
    const button = container.createEl("button", {
      cls: "lucide-icon-button",
    });
    button.setAttribute("aria-label", "Upload Note to Confluence");
    setIcon(button, "file-up");
    return button;
  }

  private createUploadSlackButton(container: HTMLDivElement): HTMLButtonElement {
    const button = container.createEl("button", {
      cls: "lucide-icon-button",
    });
    
    // 플러그인에 버튼 참조 저장
    this.context.plugin.uploadNoteToSlackButton = button;
    
    // 동적으로 버튼 라벨과 아이콘 설정
    this.updateSlackButtonLabels(button);
    
    return button;
  }

  private updateSlackButtonLabels(button: HTMLButtonElement): void {
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
      button.setAttribute("aria-label", `Create Slack Canvas${channelInfo}`);
      setIcon(button, "hash");
    } else {
      button.setAttribute("aria-label", `Send Slack Message${channelInfo}`);
      setIcon(button, "hash");
    }
  }

  private createTestButton(container: HTMLDivElement): HTMLButtonElement {
    const button = container.createEl("button", {
      cls: "lucide-icon-button",
    });
    button.setAttribute("aria-label", "Test menu");
    button.setAttribute("button-id", "test-button");
    setIcon(button, "menu");
    button.disabled = false;
    button.style.display = '';
    return button;
  }


  private createSeparator(container: HTMLDivElement): HTMLElement {
    return container.createEl("span", {
      text: "|",
      cls: "button-separator"
    });
  }

  private createPdfButton(container: HTMLDivElement): HTMLButtonElement {
    const button: HTMLButtonElement = container.createEl("button", {
      text: "PDF",
      cls: "summarview-button",
    });
    
    button.setAttribute("aria-label", "Convert PDF to Markdown");
    button.style.width = "30%";
    button.style.marginBottom = "1px";
    button.style.padding = "8px 12px";
    button.style.border = "1px solid var(--background-modifier-border)";
    button.style.borderRadius = "5px";
    button.style.cursor = "pointer";
    button.style.marginTop = "1px";
    
    return button;
  }

  private createRecordButton(container: HTMLDivElement): HTMLButtonElement {
    const button: HTMLButtonElement = container.createEl("button", {
      text: "[●] record",
      cls: "summarview-button",
    });
    
    button.setAttribute("aria-label", "Record audio and summarize");
    button.style.width = "70%";
    button.style.marginBottom = "1px";
    button.style.padding = "8px 12px";
    button.style.border = "1px solid var(--background-modifier-border)";
    button.style.borderRadius = "5px";
    button.style.cursor = "pointer";
    
    // Store record button for later use
    this.context.plugin.recordButton = button;
    
    return button;
  }

  private setupOutputContainerStyles(outputContainer: HTMLDivElement): void {
    outputContainer.style.position = "relative";
    outputContainer.style.width = "auto"; // urlInputContainer와 동일하게 auto로 설정
    outputContainer.style.height = "calc(100% - 140px)"; // 120px + 6px for status bar
    outputContainer.style.border = "1px solid var(--background-modifier-border)";
    outputContainer.style.padding = "10px";
    outputContainer.style.marginTop = "5px";
    outputContainer.style.marginLeft = "5px";
    outputContainer.style.marginRight = "5px";
    outputContainer.style.marginBottom = "25px";
    outputContainer.style.overflowY = "auto";
    outputContainer.style.overflowX = "hidden";
    outputContainer.style.backgroundColor = "var(--background-primary)";
    outputContainer.style.color = "var(--text-normal)";
    outputContainer.style.boxSizing = "border-box"; // padding 포함한 크기 계산
    
    // sticky header positioning을 확실히 하기 위해 강제 설정
    outputContainer.style.position = "relative !important" as any;
  }

  private setupPlatformSpecificVisibility(buttons: {
    uploadWikiButton: HTMLButtonElement;
    uploadSlackButton: HTMLButtonElement;
    testButton: HTMLButtonElement;
    pdfButton: HTMLButtonElement;
    recordButton: HTMLButtonElement;
  }): void {
    // 테스트 버튼 가시성 설정 (debugLevel < 3일 때만 표시)
    const shouldShowTestButton = this.context.plugin.settingsv2.system.debugLevel >= 3;
    
    if (!(Platform.isMacOS && Platform.isDesktopApp)) {
      // macOS 데스크톱이 아닌 경우 일부 버튼 숨김
      buttons.uploadWikiButton.style.display = "none";
      buttons.uploadWikiButton.disabled = true;
      buttons.uploadWikiButton.style.width = "100%";
      
      buttons.uploadSlackButton.style.display = "none";
      buttons.uploadSlackButton.disabled = true;
      
      buttons.pdfButton.style.display = "none";
      buttons.pdfButton.disabled = true;
      
      buttons.recordButton.style.width = "100%";
      // macOS가 아니면 테스트 버튼 숨김
      buttons.testButton.style.display = 'none';
      buttons.testButton.disabled = true;
    } else {
      // macOS 데스크톱인 경우 초기 버튼 상태 설정
      this.context.plugin.updateSlackButtonState();
      // 테스트 버튼 표시 여부 결정 (macOS에서만 debugLevel 조건 확인)
      if (shouldShowTestButton) {
        buttons.testButton.style.display = '';
        buttons.testButton.disabled = false;
      } else {
        buttons.testButton.style.display = 'none';
        buttons.testButton.disabled = true;
      }
    }
  }

  private setupInputEvents(urlInputField: HTMLInputElement, fetchButton: HTMLButtonElement): void {
    // Fetch 버튼 이벤트는 SummarEventHandler에서 위임 처리
    fetchButton.setAttribute('button-id', 'fetch-button');
  }

  private setupButtonEvents(buttons: {
    uploadWikiButton: HTMLButtonElement;
    uploadSlackButton: HTMLButtonElement;
    testButton: HTMLButtonElement;
    pdfButton: HTMLButtonElement;
    recordButton: HTMLButtonElement;
  }): void {
    // PDF 버튼 이벤트는 SummarEventHandler에서 위임 처리
    buttons.pdfButton.setAttribute('button-id', 'pdf-button');

    // Record 버튼 이벤트는 SummarEventHandler에서 위임 처리
    buttons.recordButton.setAttribute('button-id', 'record-button');

    // Save/Test 버튼 이벤트는 SummarEventHandler에서 위임 처리

    // 다른 버튼 이벤트들은 SummarEventHandler에서 처리
  }
}
