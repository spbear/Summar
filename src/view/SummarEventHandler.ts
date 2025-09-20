import { ISummarEventHandler, ISummarViewContext } from "./SummarViewTypes";
import { SummarContainerEventHandler } from "./SummarContainerEventHandler";
import { SummarItemEventHandler } from "./SummarItemEventHandler";
import { SummarComposerEventHandler } from "./SummarComposerEventHandler";

/**
 * 통합 이벤트 핸들러
 * Container, Item, Composer 레벨 이벤트 핸들러들을 관리하는 래퍼 클래스
 */
export class SummarEventHandler implements ISummarEventHandler {
  private containerEventHandler: SummarContainerEventHandler;
  private itemEventHandler: SummarItemEventHandler;
  private composerEventHandler: SummarComposerEventHandler;

  constructor(private context: ISummarViewContext) {
    this.containerEventHandler = new SummarContainerEventHandler(context);
    this.itemEventHandler = new SummarItemEventHandler(context);
    this.composerEventHandler = new SummarComposerEventHandler(context);
  }

  setupEventListeners(): void {
    // Container 레벨 이벤트 핸들러 설정
    this.containerEventHandler.setupEventListeners();
    
    // Item 레벨 이벤트 핸들러 설정
    this.itemEventHandler.setupEventListeners();
    
    // Composer 레벨 이벤트 핸들러 설정
    this.composerEventHandler.setupEventListeners();
  }

  cleanup(): void {
    // 각 핸들러들 정리
    this.containerEventHandler.cleanup();
    this.itemEventHandler.cleanup();
    this.composerEventHandler.cleanup();
  }

  async handleNewNoteClick(key: string): Promise<void> {
    await this.itemEventHandler.handleNewNoteClick(key);
  }
}
