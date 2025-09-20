import { View, WorkspaceLeaf, normalizePath, TFile } from "obsidian";
import SummarPlugin from "../main";
import { SummarDebug, openNote } from "../globals";
import MarkdownIt from "markdown-it";

// 매니저 클래스들 import
import { SummarStyleManager } from "./SummarStyleManager";
import { SummarUIRenderer } from "./SummarUIRenderer";
import { SummarOutputManager } from "./SummarOutputManager";
import { SummarStickyHeaderManager } from "./SummarStickyHeaderManager";
import { SummarEventHandler } from "./SummarEventHandler";
import { SummarUploadManager } from "./SummarUploadManager";
import { SummarComposerManager } from "./SummarComposerManager";

// 타입 import
import { 
  ISummarViewContext, 
  ISummarStyleManager,
  ISummarUIRenderer,
  ISummarOutputManager,
  ISummarStickyHeaderManager,
  ISummarUploadManager,
  ISummarComposerManager,
  SummarViewEvents,
  SummarOutputRecord
} from "./SummarViewTypes";

export class SummarView extends View {
  static VIEW_TYPE = "summar-view";

  // Core properties
  // plugin: SummarPlugin;
  outputContainer: HTMLDivElement;
  composerContainer: HTMLDivElement;
  // 통합 레코드로 전환: 개별 Map 제거
  markdownRenderer: MarkdownIt;

  // Resource management
  private abortController: AbortController = new AbortController();
  private timeoutRefs: Set<NodeJS.Timeout> = new Set();
  private resizeObserver: ResizeObserver | null = null;

  // Managers
  private styleManager: ISummarStyleManager;
  private uiRenderer: ISummarUIRenderer;
  private outputManager: ISummarOutputManager;
  private stickyHeaderManager: ISummarStickyHeaderManager;
  private eventHandler: SummarEventHandler;
  private uploadManager: ISummarUploadManager;
  private composerManager: ISummarComposerManager;

  // Context for managers
  private context: ISummarViewContext;

  constructor(leaf: WorkspaceLeaf, plugin: SummarPlugin) {
    super(leaf);
    // this.plugin = plugin;
    
    // Initialize markdown renderer
    this.markdownRenderer = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
    });
    this.markdownRenderer.disable(['replacements']);
    this.setupMarkdownLinkHandling();

    // Create context for managers
    this.context = {
      // plugin: this.plugin,
      plugin: plugin,
      leaf: leaf,
      view: this, // SummarView 참조 추가
      containerEl: this.containerEl,
      outputContainer: this.outputContainer, // Will be set in renderView
      composerContainer: this.composerContainer, // Will be set in renderView
      outputRecords: new Map<string, SummarOutputRecord>(),
      markdownRenderer: this.markdownRenderer,
      abortController: this.abortController,
      timeoutRefs: this.timeoutRefs,
      
      // 하이라이트 상태 조회 메서드
      getHighlightedKey: () => {
        return this.composerManager?.currentTargetKey || null;
      }
    };

    // Initialize managers
    this.initializeManagers();

    // Setup link interception once per view
    this.registerDomEvent(this.containerEl, 'click', this.handleNoteLinkClick);
  }

  private initializeManagers(): void {
    this.styleManager = new SummarStyleManager();
    this.uiRenderer = new SummarUIRenderer(this.context);
    this.outputManager = new SummarOutputManager(this.context);
    this.stickyHeaderManager = new SummarStickyHeaderManager(this.context);
    this.eventHandler = new SummarEventHandler(this.context);
    this.uploadManager = new SummarUploadManager(this.context);
    this.composerManager = new SummarComposerManager(this.context);

    // Set up event handlers for output manager
    const events: SummarViewEvents = {
      onOutputItemCreated: (key: string, element: HTMLDivElement) => {
        const outputHeader = element.querySelector('.output-header') as HTMLDivElement;
        if (outputHeader) {
          this.stickyHeaderManager.observeHeader(outputHeader);
        }
      },
      onOutputItemRemoved: (key: string) => {
        // Cleanup sticky header when output item is removed
        this.stickyHeaderManager.updateStickyHeaderVisibility();
      },
      onToggleStateChanged: (key: string, folded: boolean) => {
        this.stickyHeaderManager.updateStickyHeaderVisibility();
      }
    };
    
    this.outputManager.setEventHandlers(events);

    // Add manager references to context for type safety
    this.context.outputManager = this.outputManager;
    this.context.stickyHeaderManager = this.stickyHeaderManager;
    this.context.uploadManager = this.uploadManager;
    this.context.composerManager = this.composerManager;
  }

  getViewType(): string {
    return SummarView.VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Summar: AI-Powered Summarizer";
  }

  getIcon(): string {
    return "scroll-text";
  }

  async onOpen(): Promise<void> {
    SummarDebug.log(1, "Summar View opened");
    await this.renderView();
    this.stickyHeaderManager.setupResizeObserver();
  }

  async onClose(): Promise<void> {
    SummarDebug.log(1, "Summar View closed");
    
    // Save conversations before cleanup
    try {
      SummarDebug.log(1, `Starting conversation save on view close - outputRecords size: ${this.context.outputRecords.size}`);
      await this.outputManager.clearAllOutputItems();
      SummarDebug.log(1, "Saved conversations before view close");
    } catch (error) {
      SummarDebug.error(1, "Failed to save conversations during view close:", error);
    }
    
    // Cleanup all managers
    this.outputManager.cleanup();
    this.stickyHeaderManager.cleanup();
    this.eventHandler.cleanup();
    this.composerManager.cleanup();
    
    // Cleanup ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    
    // Cleanup resources
    this.abortController.abort();
    this.timeoutRefs.forEach(timeoutId => clearTimeout(timeoutId));
    this.timeoutRefs.clear();
    
    // Clear data
    this.context.outputRecords.clear();
    
    // Create new AbortController for potential reuse
    this.abortController = new AbortController();
    this.context.abortController = this.abortController;
  }

  /**
   * Public method to save conversations before plugin unload
   * This method is called by the main plugin during onunload()
   */
  async saveConversationsBeforeUnload(): Promise<void> {
    if (this.outputManager && this.context.outputRecords.size > 0) {
      await this.outputManager.clearAllOutputItems();
      SummarDebug.log(1, "Saved conversations before plugin unload");
    } else {
      SummarDebug.log(1, "No conversations to save during plugin unload");
    }
  }

  private setupStyleProtection(urlInputContainer: HTMLDivElement | null, buttonContainer: HTMLDivElement): void {
    // 다른 플러그인의 스타일 변경을 감지하고 복원하는 MutationObserver
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const target = mutation.target as HTMLElement;
          
          // urlInputContainer 또는 buttonContainer의 마진이 변경된 경우 복원
          if (target === urlInputContainer || target === buttonContainer) {
            if (target.style.marginLeft !== '5px') {
              target.style.setProperty('margin-left', '5px', 'important');
            }
            if (target.style.marginRight !== '5px') {
              target.style.setProperty('margin-right', '5px', 'important');
            }
          }
        }
      });
    });

    // urlInputContainer buttonContainer 감시
    if (urlInputContainer) {
      observer.observe(urlInputContainer, { 
        attributes: true, 
        attributeFilter: ['style'] 
      });
    }
    observer.observe(buttonContainer, { 
      attributes: true, 
      attributeFilter: ['style'] 
    });

    // cleanup 시 observer도 정리
    this.context.abortController.signal.addEventListener('abort', () => {
      observer.disconnect();
    });
  }

  private setupMarkdownLinkHandling(): void {
    const defaultRender = this.markdownRenderer.renderer.rules.link_open ?? ((tokens, idx, options, env, self) => {
      return self.renderToken(tokens, idx, options);
    });

    this.markdownRenderer.renderer.rules.link_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const hrefIndex = token.attrIndex('href');
      if (hrefIndex >= 0 && token.attrs) {
        const hrefValue = token.attrs[hrefIndex][1] ?? '';
        const vaultPath = this.resolveVaultFilePath(hrefValue);
        if (vaultPath) {
          token.attrSet('href', '#');
          token.attrSet('data-obsidian-path', vaultPath);
          token.attrJoin('class', 'obsidian-note-link');
        } else {
          const outputKey = this.resolveOutputKey(hrefValue);
          if (outputKey) {
            token.attrSet('href', '#');
            token.attrSet('data-summar-output-key', outputKey);
            token.attrJoin('class', 'summar-output-key-link');
          }
        }
      }

      return defaultRender(tokens, idx, options, env, self);
    };
  }

  private resolveOutputKey(href: string): string | null {
    if (!href) {
      return null;
    }

    const trimmed = href.trim();
    if (!trimmed) {
      return null;
    }

    if (this.context.outputRecords.has(trimmed)) {
      return trimmed;
    }

    return null;
  }

  private resolveVaultFilePath(href: string): string | null {
    if (!href) {
      return null;
    }
    const trimmed = href.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('mailto:')) {
      return null;
    }
    if (trimmed.startsWith('#')) {
      return null;
    }

    let decoded = trimmed;
    try {
      decoded = decodeURI(trimmed);
    } catch (error) {
      SummarDebug.log(1, `Failed to decode link URI: ${trimmed}`);
    }

    const normalized = normalizePath(decoded);
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (file && file instanceof TFile) {
      return normalized;
    }

    return null;
  }

  private handleNoteLinkClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const internalAnchor = target.closest('a.summar-output-key-link') as HTMLAnchorElement | null;
    if (internalAnchor) {
      event.preventDefault();
      event.stopPropagation();

      const outputKey = internalAnchor.getAttribute('data-summar-output-key');
      if (!outputKey) {
        return;
      }

      if (this.eventHandler && typeof (this.eventHandler as any).handleNewNoteClick === 'function') {
        Promise.resolve(this.eventHandler.handleNewNoteClick(outputKey)).catch((error) => {
          SummarDebug.log(1, `Error handling new note click for key ${outputKey}: ${error}`);
        });
      }

      return;
    }

    const anchor = target.closest('a.obsidian-note-link') as HTMLAnchorElement | null;
    if (!anchor) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const filePath = anchor.getAttribute('data-obsidian-path');
    if (!filePath) {
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      SummarDebug.log(1, `Note link target not found: ${filePath}`);
      return;
    }

    openNote(this.context.plugin, filePath, '');
  };

  private async renderView(): Promise<void> {
    const container: HTMLElement = this.containerEl;
    container.empty();

    // SummarView 식별을 위한 속성 추가 (Copilot 등 다른 플러그인과의 충돌 방지)
    container.setAttribute('data-summar-view', 'true');
    container.classList.add('summar-view-container');

    // Inject styles
    this.styleManager.injectStyles();

    // Setup container styles
    this.uiRenderer.setupContainerStyles(container);

    // Render UI components
    // const urlInputContainer = this.uiRenderer.renderUrlInputContainer(container);
    const buttonContainer = this.uiRenderer.renderButtonContainer(container);
    const outputContainer = this.uiRenderer.renderOutputContainer(container);
    const composerContainer = this.uiRenderer.renderComposerContainer(container);

    // Store container references
    this.outputContainer = outputContainer;
    this.composerContainer = composerContainer;
    this.context.outputContainer = outputContainer;
    this.context.composerContainer = composerContainer;

    // Copilot 등 다른 플러그인의 스타일 간섭 방지를 위한 MutationObserver 설정
    this.setupStyleProtection(null, buttonContainer);

    // Setup composer container
    this.composerManager.setupComposerContainer();

    // Setup sticky header
    this.stickyHeaderManager.setupStickyHeader(container);
    this.stickyHeaderManager.setupHeaderObserver();

    // Setup event listeners
    this.eventHandler.setupEventListeners();

    // Setup resize handling for composer container
    this.setupResizeHandling();

    SummarDebug.log(1, "SummarView rendered successfully with composer container");
  }

  // ==================== Public API Methods ====================
  // These methods maintain the existing interface for external components

  /**
   * outputManager에 대한 안전한 접근을 제공합니다.
   * @returns ISummarOutputManager 인스턴스
   */
  getOutputManager(): ISummarOutputManager {
    return this.outputManager;
  }

  updateSlackButtonTooltip(): void {
    this.uploadManager.updateSlackButtonTooltip();
  }

  // ==================== Output Item Management ====================

  /**
   * 개별 outputItem을 안전하게 삭제합니다.
   */
  private removeOutputItem(key: string): void {
    const rec = this.context.outputRecords.get(key);
    const outputItem = rec?.itemEl || null;
    if (outputItem) {
      // Observer에서 제거
      const outputHeader = outputItem.querySelector('.output-header') as HTMLDivElement;
      if (outputHeader) {
        this.stickyHeaderManager.unobserveHeader(outputHeader);
      }
      
      // DOM에서 제거
      if (outputItem.parentElement) {
        outputItem.parentElement.removeChild(outputItem);
      }
      
      // Map에서 제거
      this.context.outputRecords.delete(key);
      
      SummarDebug.log(1, `Output item ${key} removed successfully`);
    }
  }

  private setupResizeHandling(): void {
    // ResizeObserver를 사용하여 컨테이너 크기 변화 감지
    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    
    this.resizeObserver.observe(this.containerEl);
  }

  updateOutputContainerMargin(): void {
    const composerVisible = this.composerContainer.style.display !== 'none';
    const marginValue = composerVisible ? "1px" : "25px";
    
    this.outputContainer.style.marginBottom = marginValue;
    
    SummarDebug.log(1, `OutputContainer margin updated to ${marginValue} (composer visible: ${composerVisible})`);
  }

  private handleResize(): void {
    // SummarComposerManager의 공용 리사이징 메서드 호출
    this.composerManager.handleViewResize();
    
    // 마진 업데이트
    this.updateOutputContainerMargin();
  }
}
