import { ISummarEventHandler, ISummarViewContext } from "./SummarViewTypes";
import { SummarContainerEventHandler } from "./SummarContainerEventHandler";
import { SummarItemEventHandler } from "./SummarItemEventHandler";

/**
 * 통합 이벤트 핸들러
 * Container와 Item 레벨 이벤트 핸들러들을 관리하는 래퍼 클래스
 */
export class SummarEventHandler implements ISummarEventHandler {
  private containerEventHandler: SummarContainerEventHandler;
  private itemEventHandler: SummarItemEventHandler;

  constructor(private context: ISummarViewContext) {
    this.containerEventHandler = new SummarContainerEventHandler(context);
    this.itemEventHandler = new SummarItemEventHandler(context);
  }

  setupEventListeners(): void {
    // Container 레벨 이벤트 핸들러 설정
    this.containerEventHandler.setupEventListeners();
    
    // Item 레벨 이벤트 핸들러 설정
    this.itemEventHandler.setupEventListeners();
  }

  cleanup(): void {
    // 각 핸들러들 정리
    this.containerEventHandler.cleanup();
    this.itemEventHandler.cleanup();
  }
}
