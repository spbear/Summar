import { Platform, setIcon, addIcon } from "obsidian";
import { ISummarUIRenderer, ISummarViewContext, HiddenButtonsState } from "./SummarViewTypes";
import { SummarDebug } from "../globals";

const PDF_SVG = `
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 24 24"
     fill="none"
     stroke="currentColor"
     stroke-width="1.5"
     stroke-linecap="round"
     stroke-linejoin="round">
  <!-- File outline with folded corner -->
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <polyline points="14 2 14 8 20 8"/>
  
  <!-- Bottom bar (black by default; themeable via 'color') -->
  <rect x="1" y="13" width="22" height="10" rx="1.2" fill="red" stroke="currentColor"/>

  <!-- 'PDF' letters in white strokes on the bar -->
  <!-- P -->
  <path d="M6 16v4" stroke="white" stroke-width="1.5"/>
  <path d="M6 16h2" stroke="white" stroke-width="1.5"/>
  <path d="M8 16c1 0 1 2 0 2H6" stroke="white" stroke-width="1.5"/>
  <!-- D -->
  <path d="M11 16v4" stroke="white" stroke-width="1.5"/>
  <path d="M11 16h2" stroke="white" stroke-width="1.5"/>
  <path d="M13 16c1.6 0 1.6 4 0 4H11" stroke="white" stroke-width="1.5"/>
  <!-- F -->
  <path d="M17 16v4" stroke="white" stroke-width="1.5"/>
  <path d="M17 16h3" stroke="white" stroke-width="1.5"/>
  <path d="M17 18h2" stroke="white" stroke-width="1.5"/>
</svg>
`;

export class SummarUIRenderer implements ISummarUIRenderer {
  // 버튼 가시성 상태 관리
  private hiddenButtons: HiddenButtonsState = {
    uploadSlack: false,
    uploadWiki: false
  };

  // 너비 임계값 설정 (2줄로 가기 전에 미리 버튼 숨김으로 1줄 유지)
  private readonly buttonVisibilityThresholds = {
    uploadSlack: 280,  // 첫 번째로 숨김 (더 큰 값)
    uploadWiki: 245   // 두 번째로 숨김 (더 작은 값)
  };

  // ResizeObserver 참조
  private resizeObserver: ResizeObserver | null = null;

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
    const webButton = this.createWebButton(buttonContainer);
    const recordButton = this.createRecordButton(buttonContainer);
    
    // 플랫폼별 버튼 가시성 설정
    this.setupPlatformSpecificVisibility({
      uploadWikiButton,
      uploadSlackButton,
      testButton,
      pdfButton,
      webButton,
      recordButton
    });
    
    // 이벤트 리스너 설정
    this.setupButtonEvents({
      uploadWikiButton,
      uploadSlackButton,
      testButton,
      pdfButton,
      webButton,
      recordButton
    });
    
    // ResizeObserver 설정으로 반응형 버튼 가시성 관리
    this.setupButtonVisibilityObserver(buttonContainer, {
      uploadWikiButton,
      uploadSlackButton
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
    buttonContainer.style.flexWrap = "nowrap";  // 2줄 방지 - 항상 1줄 유지
    buttonContainer.style.alignItems = "center";
    buttonContainer.style.alignContent = "flex-start";
    buttonContainer.style.gap = "5px";
    buttonContainer.style.marginBottom = "1px";
    buttonContainer.style.marginLeft = "5px";
    buttonContainer.style.marginRight = "5px";
    buttonContainer.style.marginTop = "0px";
    buttonContainer.style.minHeight = "auto";
    
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
      // text: "PDF",
      cls: "lucide-icon-button",
    });
    
    addIcon('pdf-file', PDF_SVG);
    setIcon(button, 'pdf-file');
    button.setAttribute("aria-label", "Convert PDF to Markdown");
    
    return button;
  }

  private createWebButton(container: HTMLDivElement): HTMLButtonElement {
    const button: HTMLButtonElement = container.createEl("button", {
      // text: "PDF",
      cls: "lucide-icon-button",
    });
    
    setIcon(button, 'globe');
    button.setAttribute("aria-label", "Fetch and summarize the web page");
    
    return button;
  }

  private createRecordButton(container: HTMLDivElement): HTMLButtonElement {
    const button: HTMLButtonElement = container.createEl("button", {
      text: "[●] record",
      cls: "summarview-button",
    });
    
    button.setAttribute("aria-label", "Record audio and summarize");
    button.style.width = "auto";
    button.style.minWidth = "70px";
    button.style.flexGrow = "1";
    button.style.flexBasis = "100px";
    button.style.marginTop = "1px";
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
    webButton: HTMLButtonElement;
    recordButton: HTMLButtonElement;
  }): void {
    // 테스트 버튼 가시성 설정 (debugLevel < 3일 때만 표시)
    // const shouldShowTestButton = this.context.plugin.settingsv2.system.debugLevel >= 3;
    
    if (!(Platform.isMacOS && Platform.isDesktopApp)) {
      // macOS 데스크톱이 아닌 경우 일부 버튼 숨김
      buttons.uploadWikiButton.style.display = "none";
      buttons.uploadWikiButton.disabled = true;
      
      buttons.uploadSlackButton.style.display = "none";
      buttons.uploadSlackButton.disabled = true;
      
      buttons.pdfButton.style.display = "none";
      buttons.pdfButton.disabled = true;
      
      // record 버튼이 전체 너비를 차지하도록 조정
      buttons.recordButton.style.flexGrow = "1";
      buttons.recordButton.style.flexBasis = "100%";
      buttons.recordButton.style.width = "100%";
      
      // macOS가 아니면 테스트 버튼 숨김
      buttons.testButton.style.display = 'none';
      buttons.testButton.disabled = true;
    } else {
      // macOS 데스크톱인 경우 초기 버튼 상태 설정
      this.context.plugin.updateSlackButtonState();
      // 테스트 버튼 표시 여부 결정 (macOS에서만 debugLevel 조건 확인)
      // if (shouldShowTestButton) {
      //   buttons.testButton.style.display = '';
      //   buttons.testButton.disabled = false;
      // } else {
      //   buttons.testButton.style.display = 'none';
      //   buttons.testButton.disabled = true;
      // }
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
    webButton: HTMLButtonElement;
    recordButton: HTMLButtonElement;
  }): void {
    // PDF 버튼 이벤트는 SummarEventHandler에서 위임 처리
    buttons.pdfButton.setAttribute('button-id', 'pdf-button');
    buttons.webButton.setAttribute('button-id', 'web-button');

    // Record 버튼 이벤트는 SummarEventHandler에서 위임 처리
    buttons.recordButton.setAttribute('button-id', 'record-button');

    // Save/Test 버튼 이벤트는 SummarEventHandler에서 위임 처리

    // 다른 버튼 이벤트들은 SummarEventHandler에서 처리
  }

  /**
   * 버튼 컨테이너의 너비 변화를 감지하여 버튼 가시성을 동적으로 관리
   */
  private setupButtonVisibilityObserver(
    buttonContainer: HTMLDivElement,
    buttons: {
      uploadWikiButton: HTMLButtonElement;
      uploadSlackButton: HTMLButtonElement;
    }
  ): void {
    // 디바운스를 위한 타이머
    let resizeTimeout: NodeJS.Timeout;

    this.resizeObserver = new ResizeObserver((entries) => {
      // 이전 타이머 제거
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
        this.context.timeoutRefs.delete(resizeTimeout);
      }

      // 디바운스 적용 (50ms 지연)
      resizeTimeout = setTimeout(() => {
        for (const entry of entries) {
          const containerWidth = entry.contentRect.width;
          this.updateButtonVisibility(containerWidth, buttons);
        }
      }, 50);

      this.context.timeoutRefs.add(resizeTimeout);
    });

    this.resizeObserver.observe(buttonContainer);
  }

  /**
   * 컨테이너 너비에 따라 버튼 가시성 업데이트
   */
  private updateButtonVisibility(
    containerWidth: number,
    buttons: {
      uploadWikiButton: HTMLButtonElement;
      uploadSlackButton: HTMLButtonElement;
    }
  ): void {
    const previousState = { ...this.hiddenButtons };

    // uploadSlack 버튼 가시성 (600px 이하에서 숨김)
    const shouldHideSlack = containerWidth <= this.buttonVisibilityThresholds.uploadSlack;
    this.hiddenButtons.uploadSlack = shouldHideSlack;

    // uploadWiki 버튼 가시성 (500px 이하에서 숨김)
    const shouldHideWiki = containerWidth <= this.buttonVisibilityThresholds.uploadWiki;
    this.hiddenButtons.uploadWiki = shouldHideWiki;

    // 실제 DOM 업데이트
    this.applyButtonVisibility(buttons);

    // 상태가 변경되었으면 이벤트 발생
    if (
      previousState.uploadSlack !== this.hiddenButtons.uploadSlack ||
      previousState.uploadWiki !== this.hiddenButtons.uploadWiki
    ) {
      this.notifyButtonVisibilityChange();
    }
  }

  /**
   * 버튼 가시성을 실제 DOM에 적용
   */
  private applyButtonVisibility(buttons: {
    uploadWikiButton: HTMLButtonElement;
    uploadSlackButton: HTMLButtonElement;
  }): void {
    // uploadSlack 버튼
    if (this.hiddenButtons.uploadSlack) {
      buttons.uploadSlackButton.style.display = 'none';
    } else {
      buttons.uploadSlackButton.style.display = '';
    }

    // uploadWiki 버튼
    if (this.hiddenButtons.uploadWiki) {
      buttons.uploadWikiButton.style.display = 'none';
    } else {
      buttons.uploadWikiButton.style.display = '';
    }
  }

  /**
   * 버튼 가시성 변경 이벤트 발생
   */
  private notifyButtonVisibilityChange(): void {
    if (this.context.onButtonVisibilityChanged) {
      this.context.onButtonVisibilityChanged({ ...this.hiddenButtons });
    }
  }

  /**
   * 현재 숨겨진 버튼 상태 반환 (외부에서 접근 가능)
   */
  getHiddenButtonsState(): HiddenButtonsState {
    return { ...this.hiddenButtons };
  }

  /**
   * 리소스 정리
   */
  cleanup(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }
}
