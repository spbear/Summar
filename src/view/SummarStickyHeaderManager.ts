import { ISummarStickyHeaderManager, ISummarViewContext } from "./SummarViewTypes";
import { SummarDebug } from "../globals";
import { setIcon } from "obsidian";

export class SummarStickyHeaderManager implements ISummarStickyHeaderManager {
  private stickyHeaderContainer: HTMLDivElement | null = null;
  private currentStickyKey: string | null = null;
  private headerObserver: IntersectionObserver | null = null;
  private visibleHeaders: Set<string> = new Set();
  private resizeObserver: ResizeObserver | null = null;
  private isToggling: boolean = false;

  constructor(private context: ISummarViewContext) {}

  setupStickyHeader(container: HTMLElement): void {
    this.stickyHeaderContainer = document.createElement('div');
    this.stickyHeaderContainer.className = 'sticky-header-container';
    
    // 초기 스타일 설정
    this.stickyHeaderContainer.style.position = 'absolute';
    this.stickyHeaderContainer.style.zIndex = '10000';
    this.stickyHeaderContainer.style.backgroundColor = 'var(--background-primary)';
    this.stickyHeaderContainer.style.border = '2px solid #ff6b35';
    this.stickyHeaderContainer.style.borderRadius = '6px';
    this.stickyHeaderContainer.style.padding = '2px';
    this.stickyHeaderContainer.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    this.stickyHeaderContainer.style.display = 'none';
    this.stickyHeaderContainer.style.pointerEvents = 'auto';
    
    // 최상위 container에 추가
    container.appendChild(this.stickyHeaderContainer);
    
    SummarDebug.log(1, `Sticky header container created as independent layer above resultContainer`);
  }

  setupHeaderObserver(): void {
    this.headerObserver = new IntersectionObserver((entries) => {
      SummarDebug.log(2, `Observer entries: ${entries.length}`);
      
      entries.forEach(entry => {
        const resultItem = entry.target.closest('.result-item') as HTMLDivElement;
        if (resultItem) {
          const key = resultItem.getAttribute('result-key');
          if (key) {
            if (entry.isIntersecting) {
              this.visibleHeaders.add(key);
              SummarDebug.log(2, `Header visible: ${key}`);
            } else {
              this.visibleHeaders.delete(key);
              SummarDebug.log(2, `Header hidden: ${key}`);
            }
          }
        }
      });
      
      SummarDebug.log(2, `Visible headers: [${Array.from(this.visibleHeaders).join(', ')}]`);
      this.updateStickyHeaderVisibility();
    }, {
      root: this.context.resultContainer,
      threshold: 0,
      rootMargin: '0px'
    });
    
    SummarDebug.log(1, 'Header observer created');
  }

  setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      SummarDebug.log(2, `Resize observer entries: ${entries.length}`);
      
      // sticky header가 현재 표시되고 있다면 크기 업데이트
      if (this.stickyHeaderContainer && this.currentStickyKey && 
          this.stickyHeaderContainer.style.display !== 'none') {
        SummarDebug.log(1, `Container resized, updating sticky header size for key: ${this.currentStickyKey}`);
        this.updateStickyHeaderSize();
      }
    });
    
    // containerEl과 resultContainer 모두 감시
    this.resizeObserver.observe(this.context.containerEl);
    if (this.context.resultContainer) {
      this.resizeObserver.observe(this.context.resultContainer);
    }
    
    SummarDebug.log(1, 'Resize observer created');
  }

  updateStickyHeaderVisibility(): void {
    const firstVisibleItem = this.getFirstVisibleResultItem();
    
    SummarDebug.log(2, `First visible item: ${firstVisibleItem?.getAttribute('result-key') || 'none'}`);
    
    if (firstVisibleItem) {
      const key = firstVisibleItem.getAttribute('result-key');
      if (key) {
        const headerIsVisible = this.visibleHeaders.has(key);
        
        // resultText가 펼쳐져 있는지 확인
        const resultText = firstVisibleItem.querySelector('.result-text') as HTMLDivElement;
        const isTextExpanded = resultText && resultText.style.display !== 'none';
        
        SummarDebug.log(2, `Key: ${key}, Header visible: ${headerIsVisible}, Text expanded: ${isTextExpanded}`);
        
        // sticky header 표시 조건
        const shouldShowSticky = isTextExpanded && !headerIsVisible;
        
        if (shouldShowSticky) {
          SummarDebug.log(1, `Showing sticky header for key: ${key} (header hidden, text expanded)`);
          this.showStickyHeader(key);
        } else {
          const reason = !isTextExpanded ? 'text folded' : 'header visible';
          SummarDebug.log(1, `Hiding sticky header (${reason} for key: ${key})`);
          this.hideStickyHeader();
        }
      }
    } else {
      // 보이는 resultItem이 없으면 sticky header 숨김
      SummarDebug.log(1, 'No visible items, hiding sticky header');
      this.hideStickyHeader();
    }
  }

  cleanup(): void {
    // Intersection Observer 정리
    if (this.headerObserver) {
      this.headerObserver.disconnect();
      this.headerObserver = null;
    }
    
    // Resize Observer 정리
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    
    // Sticky header 정리
    if (this.stickyHeaderContainer) {
      if (this.stickyHeaderContainer.parentElement) {
        this.stickyHeaderContainer.parentElement.removeChild(this.stickyHeaderContainer);
      }
      this.stickyHeaderContainer = null;
    }
    
    // 데이터 정리
    this.visibleHeaders.clear();
    this.currentStickyKey = null;
    this.isToggling = false;
  }

  // Observer에 resultHeader 등록
  observeHeader(resultHeader: HTMLDivElement): void {
    if (this.headerObserver) {
      this.headerObserver.observe(resultHeader);
    }
  }

  // Observer에서 resultHeader 해제
  unobserveHeader(resultHeader: HTMLDivElement): void {
    if (this.headerObserver) {
      this.headerObserver.unobserve(resultHeader);
    }
  }

  private getFirstVisibleResultItem(): HTMLDivElement | null {
    const resultItems = Array.from(this.context.resultContainer.querySelectorAll('.result-item')) as HTMLDivElement[];
    const containerRect = this.context.resultContainer.getBoundingClientRect();
    
    for (const item of resultItems) {
      const rect = item.getBoundingClientRect();
      // resultContainer 영역과 겹치는 첫 번째 item 찾기
      if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
        return item;
      }
    }
    return null;
  }

  private showStickyHeader(key: string): void {
    if (!this.stickyHeaderContainer) {
      SummarDebug.log(1, 'No sticky header container');
      return;
    }
    
    SummarDebug.log(1, `showStickyHeader called for key: ${key}`);
    
    // 부모 요소 확인 및 복구
    const currentParent = this.stickyHeaderContainer.parentElement;
    if (!currentParent) {
      SummarDebug.log(1, 'Sticky container lost parent, attempting to re-attach to main container');
      try {
        this.context.containerEl.appendChild(this.stickyHeaderContainer);
        const newParent = this.stickyHeaderContainer.parentElement;
        SummarDebug.log(1, `Re-attach result: ${newParent?.className || 'still no parent'}`);
        
        if (!newParent) {
          SummarDebug.log(1, 'Failed to re-attach sticky container to DOM');
          return;
        }
      } catch (error) {
        SummarDebug.log(1, `Failed to re-attach sticky container: ${error}`);
        return;
      }
    }
    
    // 이미 같은 key의 sticky header가 표시되고 있으면 스킵
    if (this.currentStickyKey === key) {
      SummarDebug.log(2, `Sticky header already showing for key: ${key}`);
      return;
    }
    
    const resultItem = this.context.resultItems.get(key);
    if (!resultItem) {
      SummarDebug.log(1, `No result item found for key: ${key}`);
      return;
    }
    
    const originalHeader = resultItem.querySelector('.result-header') as HTMLDivElement;
    const labelElement = originalHeader?.querySelector('span') as HTMLSpanElement;
    
    if (!originalHeader || !labelElement) {
      SummarDebug.log(1, `No original header or label found for key: ${key}`);
      return;
    }
    
    // resultContainer의 실제 위치 계산
    const resultContainerRect = this.context.resultContainer.getBoundingClientRect();
    const containerRect = this.context.containerEl.getBoundingClientRect();
    
    // resultContainer 기준으로 상대 위치 계산
    const relativeTop = resultContainerRect.top - containerRect.top;
    const relativeLeft = resultContainerRect.left - containerRect.left;
    
    // 원본 resultHeader의 실제 크기 계산
    const originalHeaderRect = originalHeader.getBoundingClientRect();
    
    // 원본 header의 computed styles 확인
    const originalComputedStyle = window.getComputedStyle(originalHeader);
    const originalBoxSizing = originalComputedStyle.boxSizing;
    const originalPadding = originalComputedStyle.padding;
    const originalBorder = originalComputedStyle.border;
    
    SummarDebug.log(1, `ResultContainer position: top=${relativeTop}, left=${relativeLeft}, width=${resultContainerRect.width}`);
    SummarDebug.log(1, `Original header size: width=${originalHeaderRect.width}, height=${originalHeaderRect.height}`);
    SummarDebug.log(1, `Original header computed: boxSizing=${originalBoxSizing}, padding=${originalPadding}, border=${originalBorder}`);
    
    // 기존 sticky header 내용 제거
    this.stickyHeaderContainer.innerHTML = '';
    
    // 새로운 sticky header 생성
    const stickyHeader = this.createResultHeader(key, labelElement.textContent || '');
    stickyHeader.style.borderRadius = '0';
    stickyHeader.style.border = 'none'; // sticky header 내부의 header는 border 제거
    
    this.stickyHeaderContainer.appendChild(stickyHeader);
    
    // resultContainer 위쪽에 위치하도록 절대 좌표 설정 - 원본 header와 정확히 동일한 크기
    const styles = {
      position: 'absolute',
      top: `${relativeTop + 5}px`,
      left: `${relativeLeft + 10}px`, // resultText와 동일한 left 위치 (padding 고려)
      width: `${originalHeaderRect.width}px`, // 원본 resultHeader와 정확히 동일한 width
      height: `${originalHeaderRect.height}px`, // 원본 resultHeader와 정확히 동일한 height
      maxHeight: `${originalHeaderRect.height}px`, // height 고정
      minHeight: `${originalHeaderRect.height}px`, // height 고정
      boxSizing: 'border-box', // 원본과 동일한 box-sizing
      zIndex: '10000',
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      backgroundColor: 'var(--background-primary)', // resultHeader와 동일한 배경색
      border: '1px solid var(--background-modifier-border)', // resultHeader와 동일한 border
      borderRadius: '0px', // resultHeader와 동일하게 둥글지 않게
      padding: '0px', // resultHeader와 동일한 padding
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)', // 더 자연스러운 그림자
      pointerEvents: 'auto',
      overflow: 'hidden' // 내용이 넘치지 않도록
    };
    
    // 각 스타일을 개별적으로 강제 적용
    Object.entries(styles).forEach(([property, value]) => {
      this.stickyHeaderContainer!.style.setProperty(property, value, 'important');
    });
    
    this.stickyHeaderContainer.classList.add('visible');
    
    SummarDebug.log(1, `Sticky header positioned at: top=${relativeTop + 5}px, left=${relativeLeft + 10}px, width=${originalHeaderRect.width}px, height=${originalHeaderRect.height}px`);
    
    // DOM 강제 리플로우 유발
    this.stickyHeaderContainer.offsetHeight;
    
    // 위치 확인 (약간의 지연 후)
    const timeoutId = setTimeout(() => {
      if (this.stickyHeaderContainer) {
        const rect = this.stickyHeaderContainer.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(this.stickyHeaderContainer);
        
        SummarDebug.log(1, `Sticky header final rect after timeout: top=${rect.top}, left=${rect.left}, width=${rect.width}, height=${rect.height}`);
        SummarDebug.log(1, `Sticky header computed: boxSizing=${computedStyle.boxSizing}, padding=${computedStyle.padding}, border=${computedStyle.border}, minHeight=${computedStyle.minHeight}, maxHeight=${computedStyle.maxHeight}`);
        SummarDebug.log(1, `Original vs Sticky height: ${originalHeaderRect.height} vs ${rect.height} (diff: ${rect.height - originalHeaderRect.height})`);
        
        // 여전히 크기가 0이면 추가 강제 설정
        if (rect.width === 0 || rect.height === 0) {
          SummarDebug.log(1, 'Still zero dimensions, applying emergency fix');
          this.stickyHeaderContainer.style.cssText = `
            position: absolute !important;
            top: ${relativeTop + 5}px !important;
            left: ${relativeLeft + 10}px !important;
            width: ${originalHeaderRect.width}px !important;
            height: ${originalHeaderRect.height}px !important;
            max-height: ${originalHeaderRect.height}px !important;
            min-height: ${originalHeaderRect.height}px !important;
            box-sizing: border-box !important;
            z-index: 10000 !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            background-color: var(--background-primary) !important;
            border: 1px solid var(--background-modifier-border) !important;
            border-radius: 0px !important;
            padding: 0px !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2) !important;
            pointer-events: auto !important;
            overflow: hidden !important;
          `;
          
          // 다시 확인
          const timeoutId2 = setTimeout(() => {
            if (this.stickyHeaderContainer) {
              const finalRect = this.stickyHeaderContainer.getBoundingClientRect();
              SummarDebug.log(1, `Emergency fix result: top=${finalRect.top}, left=${finalRect.left}, width=${finalRect.width}, height=${finalRect.height}`);
            }
          }, 50);
          this.context.timeoutRefs.add(timeoutId2);
        }
      }
    }, 10);
    this.context.timeoutRefs.add(timeoutId);
    
    this.currentStickyKey = key;
    SummarDebug.log(1, `Sticky header shown as floating layer above resultContainer for key: ${key}`);
  }

  private hideStickyHeader(): void {
    if (this.stickyHeaderContainer) {
      this.stickyHeaderContainer.style.display = 'none';
      this.currentStickyKey = null;
    }
  }

  private updateStickyHeaderSize(): void {
    if (!this.stickyHeaderContainer || !this.currentStickyKey) return;
    
    this.updateStickyHeaderPosition();
  }

  private updateStickyHeaderPosition(): void {
    if (!this.stickyHeaderContainer || !this.context.resultContainer || !this.currentStickyKey) return;
    
    const resultItem = this.context.resultItems.get(this.currentStickyKey);
    if (!resultItem) return;
    
    const originalHeader = resultItem.querySelector('.result-header') as HTMLDivElement;
    if (!originalHeader) return;
    
    // resultContainer의 실제 위치 계산
    const resultContainerRect = this.context.resultContainer.getBoundingClientRect();
    const containerRect = this.context.containerEl.getBoundingClientRect();
    const originalHeaderRect = originalHeader.getBoundingClientRect();
    
    // resultContainer 기준으로 상대 위치 계산
    const relativeTop = resultContainerRect.top - containerRect.top;
    const relativeLeft = resultContainerRect.left - containerRect.left;
    
    // resultContainer 위쪽에 위치하도록 절대 좌표 설정
    const styles = {
      position: 'absolute',
      top: `${relativeTop + 5}px`,
      left: `${relativeLeft + 10}px`,
      width: `${originalHeaderRect.width}px`,
      height: `${originalHeaderRect.height}px`,
      maxHeight: `${originalHeaderRect.height}px`,
      minHeight: `${originalHeaderRect.height}px`,
      boxSizing: 'border-box',
      zIndex: '10000',
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      backgroundColor: 'var(--background-primary)',
      border: '1px solid var(--background-modifier-border)',
      borderRadius: '0px',
      padding: '0px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
      pointerEvents: 'auto',
      overflow: 'hidden'
    };
    
    // 각 스타일을 개별적으로 강제 적용
    Object.entries(styles).forEach(([property, value]) => {
      this.stickyHeaderContainer!.style.setProperty(property, value, 'important');
    });
    
    SummarDebug.log(1, `Sticky header positioned at: top=${relativeTop + 5}px, left=${relativeLeft + 10}px, width=${originalHeaderRect.width}px, height=${originalHeaderRect.height}px`);
  }

  private createStickyHeaderContent(key: string, label: string): void {
    if (!this.stickyHeaderContainer) return;
    
    this.stickyHeaderContainer.innerHTML = '';
    
    const resultHeader = this.createResultHeader(key, label);
    this.stickyHeaderContainer.appendChild(resultHeader);
  }

  private createResultHeader(key: string, label: string): HTMLDivElement {
    const resultHeader = document.createElement('div');
    resultHeader.className = 'result-header';
    resultHeader.style.width = '100%';
    resultHeader.style.display = 'flex';
    resultHeader.style.alignItems = 'center';
    resultHeader.style.gap = '0px';
    resultHeader.style.marginBottom = '0px';
    resultHeader.style.padding = '0px';
    resultHeader.style.border = '1px solid var(--background-modifier-border)';
    resultHeader.style.backgroundColor = 'var(--background-primary)';
    
    // 라벨 추가
    const labelElement = document.createElement('span');
    labelElement.textContent = label;
    labelElement.style.fontSize = '10px';
    labelElement.style.color = 'var(--text-muted)';
    labelElement.style.marginLeft = '2px';
    labelElement.style.marginRight = '0px';
    labelElement.style.fontWeight = 'bold';
    labelElement.style.flexShrink = '0';
    labelElement.style.backgroundColor = 'var(--interactive-normal)';
    labelElement.style.padding = '2px 4px';
    labelElement.style.borderRadius = '3px';
    resultHeader.appendChild(labelElement);
    
    // 헤더 버튼들 추가
    this.addStickyHeaderButtons(resultHeader, key);
    
    return resultHeader;
  }

  private addStickyHeaderButtons(resultHeader: HTMLDivElement, key: string): void {
    // Upload Wiki 버튼
    const uploadWikiButton = this.createStickyButton('upload-result-to-wiki-button', 'Upload this result to Confluence', 'file-up', key);
    
    // Upload Slack 버튼
    const uploadSlackButton = this.createStickyButton('upload-result-to-slack-button', 'Upload this result to Slack', 'hash', key);
    
    // New Note 버튼
    const newNoteButton = this.createStickyButton('new-note-button', 'Create new note with this result', 'file-output', key);
    
    // Toggle 버튼
    const toggleButton = this.createStickyToggleButton(key);
    
    // Copy 버튼
    const copyButton = this.createStickyButton('copy-result-button', 'Copy this result to clipboard', 'copy', key);
    
    resultHeader.appendChild(uploadWikiButton);
    resultHeader.appendChild(uploadSlackButton);
    resultHeader.appendChild(newNoteButton);
    resultHeader.appendChild(toggleButton);
    resultHeader.appendChild(copyButton);
  }

  private createStickyButton(buttonId: string, ariaLabel: string, iconName: string, key: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'lucide-icon-button';
    button.setAttribute('button-id', buttonId);
    button.setAttribute('aria-label', ariaLabel);
    button.style.transform = 'scale(0.7)';
    button.style.transformOrigin = 'center';
    button.style.margin = '0';
    
    // 원본 버튼 상태 동기화
    const originalItem = this.context.resultItems.get(key);
    if (originalItem) {
      const originalButton = originalItem.querySelector(`button[button-id="${buttonId}"]`) as HTMLButtonElement;
      if (originalButton) {
        button.disabled = originalButton.disabled;
        button.style.display = originalButton.style.display;
      } else {
        button.disabled = true;
        button.style.display = 'none';
      }
    }
    
    setIcon(button, iconName);
    
    // 원본 버튼 클릭으로 위임
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (originalItem) {
        const originalButton = originalItem.querySelector(`button[button-id="${buttonId}"]`) as HTMLButtonElement;
        originalButton?.click();
      }
    }, { signal: this.context.abortController.signal });
    
    return button;
  }

  private createStickyToggleButton(key: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'lucide-icon-button';
    button.setAttribute('button-id', 'toggle-fold-button');
    button.setAttribute('aria-label', 'Toggle fold/unfold this result');
    button.style.transform = 'scale(0.7)';
    button.style.transformOrigin = 'center';
    button.style.margin = '0';
    
    // 원본 토글 버튼 상태 동기화
    const originalItem = this.context.resultItems.get(key);
    if (originalItem) {
      const originalToggleButton = originalItem.querySelector('button[button-id="toggle-fold-button"]') as HTMLButtonElement;
      if (originalToggleButton) {
        const isToggled = originalToggleButton.getAttribute('toggled') === 'true';
        button.setAttribute('toggled', isToggled ? 'true' : 'false');
        setIcon(button, isToggled ? 'square-chevron-down' : 'square-chevron-up');
      }
    } else {
      button.setAttribute('toggled', 'false');
      setIcon(button, 'square-chevron-up');
    }
    
    // Toggle 버튼 특별 처리
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.handleStickyToggleClick(key, button);
    }, { signal: this.context.abortController.signal });
    
    return button;
  }

  private handleStickyToggleClick(key: string, stickyToggleButton: HTMLButtonElement): void {
    // 중복 실행 방지
    if (this.isToggling) {
      SummarDebug.log(1, `Sticky toggle already in progress for key: ${key}, skipping`);
      return;
    }
    
    this.isToggling = true;
    SummarDebug.log(1, `Sticky toggle clicked for key: ${key}`);
    
    try {
      const currentToggled = stickyToggleButton.getAttribute('toggled') === 'true';
      const newToggled = !currentToggled;
      
      // sticky 버튼 상태 업데이트
      stickyToggleButton.setAttribute('toggled', newToggled ? 'true' : 'false');
      setIcon(stickyToggleButton, newToggled ? 'square-chevron-down' : 'square-chevron-up');
      
      // 원본 버튼과 resultText 상태 동기화
      const originalItem = this.context.resultItems.get(key);
      if (originalItem) {
        const originalToggleButton = originalItem.querySelector('button[button-id="toggle-fold-button"]') as HTMLButtonElement;
        const resultText = originalItem.querySelector('.result-text') as HTMLDivElement;
        
        if (originalToggleButton && resultText) {
          originalToggleButton.setAttribute('toggled', newToggled ? 'true' : 'false');
          setIcon(originalToggleButton, newToggled ? 'square-chevron-down' : 'square-chevron-up');
          resultText.style.display = newToggled ? 'none' : 'block';
        }
      }
      
      SummarDebug.log(1, `Sticky toggle state changed to: ${newToggled ? 'folded' : 'unfolded'}`);
      
      // fold/unfold 상태 변경 시 sticky header 가시성 재평가
      this.updateStickyHeaderVisibility();
    } finally {
      // 플래그 해제
      const timeoutId = setTimeout(() => {
        this.isToggling = false;
      }, 100);
      this.context.timeoutRefs.add(timeoutId);
    }
  }
}
