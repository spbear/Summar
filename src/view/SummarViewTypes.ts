import { WorkspaceLeaf } from "obsidian";
import SummarPlugin from "../main";
import MarkdownIt from "markdown-it";
import { SummarAIParam, SummarAIParamType } from "../summarai-types";

// ButtonContainer용 버튼 가시성 상태
export interface HiddenButtonsState {
  uploadSlack: boolean;
  uploadWiki: boolean;
}

// OutputHeader용 버튼 가시성 상태
export interface OutputHeaderHiddenButtonsState {
  copy: boolean;
  reply: boolean;
  newNote: boolean;
  uploadSlack: boolean;
  uploadWiki: boolean;
}

// 전체 버튼 가시성 상태 통합
export interface AllHiddenButtonsState {
  buttonContainer: HiddenButtonsState;
  outputHeader: OutputHeaderHiddenButtonsState;
}

// 공통 인터페이스
export interface ISummarViewContext {
  plugin: SummarPlugin;
  leaf: WorkspaceLeaf;
  view?: any; // SummarView 참조 (circular dependency 방지를 위해 any 타입 사용)
  containerEl: HTMLElement;
  outputContainer: HTMLDivElement;
  composerContainer: HTMLDivElement;
  // 통합 레코드 저장소 (단계적 도입)
  outputRecords: Map<string, SummarOutputRecord>;
  markdownRenderer: MarkdownIt;
  abortController: AbortController;
  timeoutRefs: Set<NodeJS.Timeout>;
  
  // 버튼 가시성 변경 이벤트
  onButtonVisibilityChanged?: (hiddenButtons: HiddenButtonsState) => void;
  onOutputHeaderButtonVisibilityChanged?: (hiddenButtons: OutputHeaderHiddenButtonsState) => void;
  
  // 매니저 참조들 (타입 안전성 향상)
  outputManager?: ISummarOutputManager;
  stickyHeaderManager?: ISummarStickyHeaderManager;
  uploadManager?: ISummarUploadManager;
  composerManager?: ISummarComposerManager;
  
  // 하이라이트 상태 조회 메서드
  getHighlightedKey(): string | null;
}

// 결과 아이템에 대한 통합 상태 레코드
export class SummarOutputRecord {
  key: string;
  itemEl?: HTMLDivElement | null;
  private _tempResult?: string; // 임시 결과용 캐시 (중간 결과)
  label?: string;
  statId?: string;
  noteName?: string;
  folded?: boolean;
  conversations: SummarAIParam[] = [];

  constructor(key: string = '') {
    this.key = key;
    this.conversations = [];
  }

  // Getter for result - returns temp result or latest output from conversations
  get result(): string | undefined {
    // 임시 결과가 있으면 그것을 반환 (중간 결과)
    if (this._tempResult !== undefined) {
      return this._tempResult;
    }
    
    // 없으면 conversations에서 마지막 OUTPUT 반환 (최종 결과)
    const outputMessages = this.getOutputHistory();
    if (outputMessages.length > 0) {
      return outputMessages[outputMessages.length - 1].text;
    }
    
    return undefined;
  }

  // Setter for result - sets temporary result (for intermediate updates)
  set result(value: string | undefined) {
    this._tempResult = value;
  }

  // Set temporary result for intermediate updates
  setTempResult(text: string): void {
    this._tempResult = text;
  }

  // Add final assistant response to conversations and clear temp result
  addFinalResult(text: string): void {
    this._tempResult = undefined; // 임시 결과 클리어
    const outputParam = new SummarAIParam('assistant', text, SummarAIParamType.OUTPUT);
    this.conversations.push(outputParam);
  }

  // Helper method to add conversation messages
  addConversation(role: string, text: string): void {
    const conversationParam = new SummarAIParam(role, text, SummarAIParamType.CONVERSATION);
    this.conversations.push(conversationParam);
  }

  // Helper method to get conversation history (excluding outputs)
  getConversationHistory(): SummarAIParam[] {
    return this.conversations.filter(param => param.isConversation());
  }

  // Helper method to get all output messages
  getOutputHistory(): SummarAIParam[] {
    return this.conversations.filter(param => param.isOutput());
  }

  // Clear temporary result
  clearTempResult(): void {
    this._tempResult = undefined;
  }

  // Memory cleanup method
  cleanup(): void {
    // Clear temporary result
    this._tempResult = undefined;
    
    // Clear conversations array completely
    if (this.conversations) {
      this.conversations.length = 0;
      this.conversations = [];
    }
    
    // Clear DOM reference
    this.itemEl = null;
  }
}

// 매니저 인터페이스들
export interface ISummarStyleManager {
  injectStyles(): void;
  removeStyles(): void;
}

export interface ISummarUIRenderer {
  // renderUrlInputContainer(container: HTMLElement): HTMLDivElement;
  renderButtonContainer(container: HTMLElement): HTMLDivElement;
  renderOutputContainer(container: HTMLElement): HTMLDivElement;
  renderComposerContainer(container: HTMLElement): HTMLDivElement;
  setupContainerStyles(container: HTMLElement): void;
}

export interface ISummarOutputManager {
  createOutputItem(key: string, label: string): SummarOutputRecord;
  enableOutputItemButtons(outputItem: HTMLDivElement, buttons: string[]): void;
  appendOutputText(key: string, label: string, message: string): string;
  updateOutputText(key: string, label: string, message: string, isFinal: boolean): string;
  setNewNoteName(key: string, newNotePath?: string): void;
  pushOutputPrompt(key: string, prompt: string): void;
  addConversation(key: string, role: string, text: string): { conversations: SummarAIParam[], addedIndex: number };
  updateConversation(key: string, index: number, newText: string): boolean;

  getOutputText(key: string): string;
  foldOutput(key: string | null, fold: boolean): void;
  getNoteName(key: string): string;
  highlightOutputHeader(key: string): void;

  setEventHandlers(events: SummarViewEvents): void;

  importOutputItemsFromPluginDir(filename?: string): Promise<number>;
  saveOutputItemsToPluginDir(): Promise<string>;
  clearAllOutputItems(): Promise<void>;
  
  cleanupMarkdownOutput(html: string): string;
  cleanup(): void;
  
  // 하이라이트 관련 메서드
  clearAllHeaderHighlights(): void;
}

export interface ISummarStickyHeaderManager {
  setupStickyHeader(container: HTMLElement): void;
  setupHeaderObserver(): void;
  setupResizeObserver(): void;
  updateStickyHeaderVisibility(): void;
  cleanup(): void;
  observeHeader(outputHeader: HTMLDivElement): void;
  unobserveHeader(outputHeader: HTMLDivElement): void;
  getCurrentStickyKey(): string | null;
  
  // 하이라이트 관련 메서드
  highlightStickyHeader(key: string): void;
  clearAllStickyHeaderHighlights(): void;
}

export interface ISummarEventHandler {
  setupEventListeners(): void;
  cleanup(): void;
}

export interface ISummarUploadManager {
  uploadContentToWiki(title: string, content: string): Promise<void>;
  uploadContentToSlack(title: string, content: string): Promise<void>;
  updateSlackButtonTooltip(): void;
}

export interface ISummarComposerManager {
  setupComposerContainer(): void;
  sendMessage(message: string): Promise<void>;
  clearComposer(): void;
  newPrompt(): void;
  linkNote(filePath: string): void;
  showComposerContainer(): void;
  hideComposerContainer(): void;
  setOutput(key: string): void;
  handleViewResize(): void;
  cleanup(): void;
  canShowComposer(proposedHeight: number): { canShow: boolean; containerHeight: number; maxAllowedHeight: number };
  
  // 현재 타겟 키 조회
  get currentTargetKey(): string | null;
}

// 이벤트 타입
export interface SummarViewEvents {
  onOutputItemCreated?: (key: string, element: HTMLDivElement) => void;
  onOutputItemRemoved?: (key: string) => void;
  onToggleStateChanged?: (key: string, folded: boolean) => void;
}
