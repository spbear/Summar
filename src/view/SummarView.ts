import { View, WorkspaceLeaf } from "obsidian";
import SummarPlugin from "../main";
import { SummarDebug } from "../globals";
import MarkdownIt from "markdown-it";

// 매니저 클래스들 import
import { SummarStyleManager } from "./SummarStyleManager";
import { SummarUIRenderer } from "./SummarUIRenderer";
import { SummarResultManager } from "./SummarResultManager";
import { SummarStickyHeaderManager } from "./SummarStickyHeaderManager";
import { SummarEventHandler } from "./SummarEventHandler";
import { SummarUploadManager } from "./SummarUploadManager";

// 타입 import
import { 
  ISummarViewContext, 
  ISummarStyleManager,
  ISummarUIRenderer,
  ISummarResultManager,
  ISummarStickyHeaderManager,
  ISummarEventHandler,
  ISummarUploadManager,
  SummarViewEvents
} from "./SummarViewTypes";

export class SummarView extends View {
  static VIEW_TYPE = "summar-view";

  // Core properties
  plugin: SummarPlugin;
  resultContainer: HTMLDivElement;
  resultItems: Map<string, HTMLDivElement> = new Map();
  newNoteNames: Map<string, string> = new Map();
  markdownRenderer: MarkdownIt;

  // Resource management
  private abortController: AbortController = new AbortController();
  private timeoutRefs: Set<NodeJS.Timeout> = new Set();

  // Managers
  private styleManager: ISummarStyleManager;
  private uiRenderer: ISummarUIRenderer;
  private resultManager: ISummarResultManager;
  private stickyHeaderManager: ISummarStickyHeaderManager;
  private eventHandler: ISummarEventHandler;
  private uploadManager: ISummarUploadManager;

  // Context for managers
  private context: ISummarViewContext;

  constructor(leaf: WorkspaceLeaf, plugin: SummarPlugin) {
    super(leaf);
    this.plugin = plugin;
    
    // Initialize markdown renderer
    this.markdownRenderer = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
    });
    this.markdownRenderer.disable(['replacements']);

    // Create context for managers
    this.context = {
      plugin: this.plugin,
      leaf: leaf,
      containerEl: this.containerEl,
      resultContainer: this.resultContainer, // Will be set in renderView
      resultItems: this.resultItems,
      newNoteNames: this.newNoteNames,
      markdownRenderer: this.markdownRenderer,
      abortController: this.abortController,
      timeoutRefs: this.timeoutRefs
    };

    // Initialize managers
    this.initializeManagers();
  }

  private initializeManagers(): void {
    this.styleManager = new SummarStyleManager();
    this.uiRenderer = new SummarUIRenderer(this.context);
    this.resultManager = new SummarResultManager(this.context);
    this.stickyHeaderManager = new SummarStickyHeaderManager(this.context);
    this.eventHandler = new SummarEventHandler(this.context);
    this.uploadManager = new SummarUploadManager(this.context);

    // Set up event handlers for result manager
    const events: SummarViewEvents = {
      onResultItemCreated: (key: string, element: HTMLDivElement) => {
        const resultHeader = element.querySelector('.result-header') as HTMLDivElement;
        if (resultHeader) {
          this.stickyHeaderManager.observeHeader(resultHeader);
        }
      },
      onResultItemRemoved: (key: string) => {
        // Cleanup sticky header when result item is removed
        this.stickyHeaderManager.updateStickyHeaderVisibility();
      },
      onToggleStateChanged: (key: string, folded: boolean) => {
        this.stickyHeaderManager.updateStickyHeaderVisibility();
      }
    };
    
    this.resultManager.setEventHandlers(events);

    // Add upload manager reference to context for event handler
    (this.context as any).uploadManager = this.uploadManager;
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
    
    // Cleanup all managers
    this.stickyHeaderManager.cleanup();
    this.eventHandler.cleanup();
    
    // Cleanup resources
    this.abortController.abort();
    this.timeoutRefs.forEach(timeoutId => clearTimeout(timeoutId));
    this.timeoutRefs.clear();
    
    // Clear data
    this.resultItems.clear();
    this.newNoteNames.clear();
    
    // Create new AbortController for potential reuse
    this.abortController = new AbortController();
    this.context.abortController = this.abortController;
  }

  private async renderView(): Promise<void> {
    const container: HTMLElement = this.containerEl;
    container.empty();

    // Inject styles
    this.styleManager.injectStyles();

    // Setup container styles
    this.uiRenderer.setupContainerStyles(container);

    // Render UI components
    const inputContainer = this.uiRenderer.renderInputContainer(container);
    const buttonContainer = this.uiRenderer.renderButtonContainer(container);
    const resultContainer = this.uiRenderer.renderResultContainer(container);

    // Store result container reference
    this.resultContainer = resultContainer;
    this.context.resultContainer = resultContainer;

    // Setup sticky header
    this.stickyHeaderManager.setupStickyHeader(container);
    this.stickyHeaderManager.setupHeaderObserver();

    // Setup event listeners
    this.eventHandler.setupEventListeners();

    SummarDebug.log(1, "SummarView rendered successfully with new architecture");
  }

  // ==================== Public API Methods ====================
  // These methods maintain the existing interface for external components

  updateResultText(key: string, label: string, message: string): string {
    return this.resultManager.updateResultText(key, label, message);
  }

  appendResultText(key: string, label: string, message: string): string {
    return this.resultManager.appendResultText(key, label, message);
  }

  getResultText(key: string): string {
    return this.resultManager.getResultText(key);
  }

  updateResultInfo(key: string, statId: string, prompt: string, newNotePath: string) {
  }

  enableNewNote(key: string, newNotePath?: string): void {
    this.resultManager.enableNewNote(key, newNotePath);
  }

  getNoteName(key: string): string {
    return this.resultManager.getNoteName(key);
  }

  foldResult(key: string | null, fold: boolean): void {
    this.resultManager.foldResult(key, fold);
  }

  clearAllResultItems(): void {
    this.resultManager.clearAllResultItems();
  }

  getCurrentMainPaneTabType(): string {
    return this.uploadManager.getCurrentMainPaneTabType();
  }

  updateSlackButtonTooltip(): void {
    this.uploadManager.updateSlackButtonTooltip();
  }

  /**
   * MarkdownIt 렌더링 결과에서 불필요한 줄바꿈을 제거합니다.
   */
  cleanupMarkdownOutput(html: string): string {
    return this.resultManager.cleanupMarkdownOutput(html);
  }

  // ==================== Upload Methods ====================

  private async uploadContentToSlack(title: string, content: string): Promise<void> {
    return this.uploadManager.uploadContentToSlack(title, content);
  }

  private async uploadContentToWiki(title: string, content: string): Promise<void> {
    return this.uploadManager.uploadContentToWiki(title, content);
  }

  // ==================== Result Item Management ====================

  /**
   * 개별 resultItem을 안전하게 삭제합니다.
   */
  private removeResultItem(key: string): void {
    const resultItem = this.resultItems.get(key);
    if (resultItem) {
      // Observer에서 제거
      const resultHeader = resultItem.querySelector('.result-header') as HTMLDivElement;
      if (resultHeader) {
        this.stickyHeaderManager.unobserveHeader(resultHeader);
      }
      
      // DOM에서 제거
      if (resultItem.parentElement) {
        resultItem.parentElement.removeChild(resultItem);
      }
      
      // Map에서 제거
      this.resultItems.delete(key);
      this.newNoteNames.delete(key);
      
      SummarDebug.log(1, `Result item ${key} removed successfully`);
    }
  }
}
