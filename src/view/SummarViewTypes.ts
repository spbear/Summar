import { WorkspaceLeaf } from "obsidian";
import SummarPlugin from "../main";
import MarkdownIt from "markdown-it";

// 공통 인터페이스
export interface ISummarViewContext {
  plugin: SummarPlugin;
  leaf: WorkspaceLeaf;
  view?: any; // SummarView 참조 (circular dependency 방지를 위해 any 타입 사용)
  containerEl: HTMLElement;
  resultContainer: HTMLDivElement;
  composerContainer: HTMLDivElement;
  // 통합 레코드 저장소 (단계적 도입)
  resultRecords: Map<string, SummarResultRecord>;
  markdownRenderer: MarkdownIt;
  abortController: AbortController;
  timeoutRefs: Set<NodeJS.Timeout>;
}

// 결과 아이템에 대한 통합 상태 레코드
export class SummarResultRecord {
  key: string;
  itemEl: HTMLDivElement | null;
  result: string;
  label?: string;
  statId?: string;
  noteName?: string;
  icon?: string;
  folded?: boolean;
  prompts?: string[];
}

// 매니저 인터페이스들
export interface ISummarStyleManager {
  injectStyles(): void;
  removeStyles(): void;
}

export interface ISummarUIRenderer {
  renderUrlInputContainer(container: HTMLElement): HTMLDivElement;
  renderButtonContainer(container: HTMLElement): HTMLDivElement;
  renderResultContainer(container: HTMLElement): HTMLDivElement;
  renderComposerContainer(container: HTMLElement): HTMLDivElement;
  setupContainerStyles(container: HTMLElement): void;
}

export interface ISummarResultManager {
  createResultItem(key: string, label: string): HTMLDivElement;
  appendResultText(key: string, label: string, message: string): string;
  updateResultText(key: string, label: string, message: string): string;
  getResultText(key: string): string;
  pushResultPrompt(key: string, prompt: string): void;
  importResultItemsFromPluginDir(filename?: string): Promise<number>;
  saveResultItemsToPluginDir(): Promise<string>;
  foldResult(key: string | null, fold: boolean): void;
  clearAllResultItems(): void;
  enableNewNote(key: string, newNotePath?: string): void;
  getNoteName(key: string): string;
  cleanupMarkdownOutput(html: string): string;
  setEventHandlers(events: SummarViewEvents): void;
  cleanup(): void;
}

export interface ISummarStickyHeaderManager {
  setupStickyHeader(container: HTMLElement): void;
  setupHeaderObserver(): void;
  setupResizeObserver(): void;
  updateStickyHeaderVisibility(): void;
  cleanup(): void;
  observeHeader(resultHeader: HTMLDivElement): void;
  unobserveHeader(resultHeader: HTMLDivElement): void;
  getCurrentStickyKey(): string | null;
}

export interface ISummarEventHandler {
  setupEventListeners(): void;
  cleanup(): void;
}

export interface ISummarUploadManager {
  uploadContentToWiki(title: string, content: string): Promise<void>;
  uploadContentToSlack(title: string, content: string): Promise<void>;
  getCurrentMainPaneTabType(): string;
  updateSlackButtonTooltip(): void;
}

export interface ISummarComposerManager {
  setupComposerContainer(): void;
  sendMessage(message: string): Promise<void>;
  clearComposer(): void;
  toggleComposerContainer(): void;
  handleViewResize(): void;
  cleanup(): void;
}

// 이벤트 타입
export interface SummarViewEvents {
  onResultItemCreated?: (key: string, element: HTMLDivElement) => void;
  onResultItemRemoved?: (key: string) => void;
  onToggleStateChanged?: (key: string, folded: boolean) => void;
}
