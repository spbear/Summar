import { Platform, setIcon } from "obsidian";
import { ISummarUIRenderer, ISummarViewContext } from "./SummarViewTypes";
import { SummarDebug } from "../globals";

export class SummarUIRenderer implements ISummarUIRenderer {
  constructor(private context: ISummarViewContext) {}

  renderInputContainer(container: HTMLElement): HTMLDivElement {
    const inputContainer: HTMLDivElement = container.createEl("div", {
      cls: "input-container",
    });
    
    this.setupInputContainerStyles(inputContainer);
    
    // Input field 생성
    const inputField = this.createInputField(inputContainer);
    
    // Fetch button 생성
    const fetchButton = this.createFetchButton(inputContainer);
    
    // 이벤트 리스너 설정
    this.setupInputEvents(inputField, fetchButton);
    
    return inputContainer;
  }

  renderButtonContainer(container: HTMLElement): HTMLDivElement {
    const buttonContainer: HTMLDivElement = container.createEl("div", {
      cls: "button-container",
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

  renderResultContainer(container: HTMLElement): HTMLDivElement {
    const resultContainer: HTMLDivElement = container.createEl("div", {
      cls: "summarview-result",
    });
    
    this.setupResultContainerStyles(resultContainer);
    
    return resultContainer;
  }

  setupContainerStyles(container: HTMLElement): void {
    // 컨테이너의 기본 스타일 설정
    container.style.height = "100%";
    container.style.overflow = "hidden";
  }

  private setupInputContainerStyles(inputContainer: HTMLDivElement): void {
    inputContainer.style.display = "flex";
    inputContainer.style.alignItems = "center";
    inputContainer.style.gap = "5px";
    inputContainer.style.marginBottom = "1px";
  }

  private createInputField(container: HTMLDivElement): HTMLInputElement {
    const inputField: HTMLInputElement = container.createEl("input", {
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
    inputField.value = this.context.plugin.settingsv2.system.testUrl || "";
    
    // Store input field for later use
    this.context.plugin.inputField = inputField;
    
    return inputField;
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
    buttonContainer.style.marginLeft = "0px";
    buttonContainer.style.marginRight = "0px";
    buttonContainer.style.marginTop = "0px";
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

  private setupResultContainerStyles(resultContainer: HTMLDivElement): void {
    resultContainer.style.position = "relative";
    resultContainer.style.width = "calc(100% - 10px)";
    resultContainer.style.height = "calc(100% - 120px)";
    resultContainer.style.border = "1px solid var(--background-modifier-border)";
    resultContainer.style.padding = "10px";
    resultContainer.style.margin = "5px";
    resultContainer.style.overflowY = "auto";
    resultContainer.style.overflowX = "hidden";
    resultContainer.style.backgroundColor = "var(--background-primary)";
    resultContainer.style.color = "var(--text-normal)";
    
    // sticky header positioning을 확실히 하기 위해 강제 설정
    resultContainer.style.position = "relative !important" as any;
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

  private setupInputEvents(inputField: HTMLInputElement, fetchButton: HTMLButtonElement): void {
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
