import { WorkspaceLeaf } from "obsidian";
import SummarPlugin from "../main";
import MarkdownIt from "markdown-it";
import { SummarAIParam } from "src/summarai";

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
  itemEl: HTMLDivElement | null;
  result: string;
  label?: string;
  statId?: string;
  noteName?: string;
  folded?: boolean;
  conversations?: SummarAIParam[];
}

// 매니저 인터페이스들
export interface ISummarStyleManager {
  injectStyles(): void;
  removeStyles(): void;
}

export interface ISummarUIRenderer {
  renderUrlInputContainer(container: HTMLElement): HTMLDivElement;
  renderButtonContainer(container: HTMLElement): HTMLDivElement;
  renderOutputContainer(container: HTMLElement): HTMLDivElement;
  renderComposerContainer(container: HTMLElement): HTMLDivElement;
  setupContainerStyles(container: HTMLElement): void;
}

export interface ISummarOutputManager {
  createOutputItem(key: string, label: string): SummarOutputRecord;
  appendOutputText(key: string, label: string, message: string): string;
  updateOutputText(key: string, label: string, message: string, isFinal: boolean): string;
  getOutputText(key: string): string;
  pushOutputPrompt(key: string, prompt: string): void;
  importOutputItemsFromPluginDir(filename?: string): Promise<number>;
  saveOutputItemsToPluginDir(): Promise<string>;
  foldOutput(key: string | null, fold: boolean): void;
  clearAllOutputItems(): void;
  setNewNoteName(key: string, newNotePath?: string): void;
  getNoteName(key: string): string;
  cleanupMarkdownOutput(html: string): string;
  setEventHandlers(events: SummarViewEvents): void;
  cleanup(): void;
  
  // 하이라이트 관련 메서드
  highlightOutputHeader(key: string): void;
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
  toggleComposerContainer(): void;
  showComposerContainer(): void;
  hideComposerContainer(): void;
  setOutput(key: string): void;
  handleViewResize(): void;
  cleanup(): void;
  
  // 현재 타겟 키 조회
  get currentTargetKey(): string | null;
}

// 이벤트 타입
export interface SummarViewEvents {
  onOutputItemCreated?: (key: string, element: HTMLDivElement) => void;
  onOutputItemRemoved?: (key: string) => void;
  onToggleStateChanged?: (key: string, folded: boolean) => void;
}
