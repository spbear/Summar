import { ISummarStickyHeaderManager, ISummarViewContext } from "./SummarViewTypes";
import { SummarDebug } from "../globals";
import { setIcon } from "obsidian";
import { composeStandardOutputHeader, getDefaultLabelIcon } from "./OutputHeaderComposer";
import { SummarMenuUtils, MenuItemConfig } from "./SummarMenuUtils";

export class SummarStickyHeaderManager implements ISummarStickyHeaderManager {
  private stickyHeaderContainer: HTMLDivElement | null = null;
  private currentStickyKey: string | null = null;
  private headerObserver: IntersectionObserver | null = null;
  private visibleHeaders: Set<string> = new Set();
  private resizeObserver: ResizeObserver | null = null;
  private isToggling: boolean = false;
  
  // 스크롤 이벤트 throttling용
  private scrollThrottleTimeout: NodeJS.Timeout | null = null;
  private readonly SCROLL_THROTTLE_DELAY = 100; // 100ms 간격으로 체크

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
    
    SummarDebug.log(1, `Sticky header container created as independent layer above outputContainer`);
  }

  setupHeaderObserver(): void {
    this.headerObserver = new IntersectionObserver((entries) => {
      SummarDebug.log(2, `Observer entries: ${entries.length}`);
      
      entries.forEach(entry => {
        const outputItem = entry.target.closest('.output-item') as HTMLDivElement;
        if (outputItem) {
          const key = outputItem.getAttribute('output-key');
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
      root: this.context.outputContainer,
      threshold: 0,
      rootMargin: '0px'
    });
    
    SummarDebug.log(1, 'Header observer created');
    
    // 스크롤 이벤트 리스너 추가 (IntersectionObserver 보완용)
    this.setupScrollListener();
  }

  setupScrollListener(): void {
    if (this.context.outputContainer) {
      // throttled 스크롤 이벤트 리스너 추가
      this.context.outputContainer.addEventListener('scroll', () => {
        // 이미 스케줄된 작업이 있으면 취소
        if (this.scrollThrottleTimeout) {
          clearTimeout(this.scrollThrottleTimeout);
        }
        
        // 새로운 작업을 스케줄
        this.scrollThrottleTimeout = setTimeout(() => {
          // SummarDebug.log(2, `Throttled scroll event processed, updating sticky header visibility`);
          this.updateStickyHeaderVisibility();
          this.scrollThrottleTimeout = null;
        }, this.SCROLL_THROTTLE_DELAY);
      }, { 
        signal: this.context.abortController.signal,
        passive: true // 성능 최적화
      });
      
      SummarDebug.log(1, `Scroll listener added to outputContainer with ${this.SCROLL_THROTTLE_DELAY}ms throttle`);
    }
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
    
    // containerEl과 outputContainer 모두 감시
    this.resizeObserver.observe(this.context.containerEl);
    if (this.context.outputContainer) {
      this.resizeObserver.observe(this.context.outputContainer);
    }
    
    SummarDebug.log(1, 'Resize observer created');
  }

  updateStickyHeaderVisibility(): void {
    const firstVisibleItem = this.getFirstVisibleOutputItem();
    
    if (!firstVisibleItem) {
      // 보이는 outputItem이 없으면 sticky header 숨김
      SummarDebug.log(2, `No visible items found, hiding sticky header`);
      this.hideStickyHeader();
      return;
    }

    const key = firstVisibleItem.getAttribute('output-key');
    if (!key) {
      SummarDebug.log(2, `No key found for visible item, hiding sticky header`);
      this.hideStickyHeader();
      return;
    }

    // DOM에서 실제로 존재하는지 확인 (IntersectionObserver 지연 이벤트 대응)
    const actualOutputItem = this.context.outputRecords.get(key)?.itemEl || null;
    if (!actualOutputItem || !actualOutputItem.isConnected) {
      SummarDebug.log(1, `Output item ${key} is not connected to DOM, hiding sticky header`);
      this.hideStickyHeader();
      return;
    }

    const headerIsVisible = this.visibleHeaders.has(key);
    const outputText = firstVisibleItem.querySelector('.output-text') as HTMLDivElement;
    const isTextExpanded = outputText && outputText.style.display !== 'none';
    
    // sticky header 표시 조건: 텍스트는 펼쳐져 있지만 헤더는 숨겨진 상태
    const shouldShowSticky = isTextExpanded && !headerIsVisible;
    
    SummarDebug.log(2, `Key: ${key}, shouldShow: ${shouldShowSticky} (textExpanded: ${isTextExpanded}, headerVisible: ${headerIsVisible})`);
    
    if (shouldShowSticky) {
      // 이미 같은 key로 표시중이면 스킵
      if (this.currentStickyKey === key && this.stickyHeaderContainer?.style.display !== 'none') {
        SummarDebug.log(2, `Sticky header already showing for ${key}, skipping`);
        return; // 이미 올바른 상태
      }
      SummarDebug.log(1, `Showing sticky header for ${key}`);
      this.showStickyHeader(key);
    } else {
      // sticky header가 표시중이면 숨김
      if (this.currentStickyKey !== null && this.stickyHeaderContainer?.style.display !== 'none') {
        this.hideStickyHeader();
      }
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
    
    // 스크롤 throttle timeout 정리
    if (this.scrollThrottleTimeout) {
      clearTimeout(this.scrollThrottleTimeout);
      this.scrollThrottleTimeout = null;
    }
  }

  // Observer에 outputHeader 등록
  observeHeader(outputHeader: HTMLDivElement): void {
    if (this.headerObserver) {
      this.headerObserver.observe(outputHeader);
    }
  }

  // Observer에서 outputHeader 해제
  unobserveHeader(outputHeader: HTMLDivElement): void {
    if (this.headerObserver) {
      this.headerObserver.unobserve(outputHeader);
    }
  }


  private getFirstVisibleOutputItem(): HTMLDivElement | null {
    const outputItems = Array.from(this.context.outputContainer.querySelectorAll('.output-item')) as HTMLDivElement[];
    const containerRect = this.context.outputContainer.getBoundingClientRect();
    
    // SummarDebug.log(2, `[DEBUG] getFirstVisibleOutputItem: Found ${outputItems.length} output items`);
    // SummarDebug.log(2, `[DEBUG] Container rect: top=${containerRect.top}, bottom=${containerRect.bottom}`);
    
    for (let i = 0; i < outputItems.length; i++) {
      const item = outputItems[i];
      const rect = item.getBoundingClientRect();
      const key = item.getAttribute('output-key');
      const isVisible = rect.bottom > containerRect.top && rect.top < containerRect.bottom;
      
      // SummarDebug.log(2, `[DEBUG] Item ${i} (key: ${key}): top=${rect.top}, bottom=${rect.bottom}, visible=${isVisible}`);
      
      // outputContainer 영역과 겹치는 첫 번째 item 찾기
      if (isVisible) {
        // SummarDebug.log(1, `[DEBUG] First visible item found: key=${key}`);
        return item;
      }
    }
    
    // SummarDebug.log(1, `[DEBUG] No visible items found`);
    return null;
  }

  private showStickyHeader(key: string): void {
    if (!this.stickyHeaderContainer) {
      SummarDebug.log(1, 'No sticky header container');
      return;
    }
    
    SummarDebug.log(1, `Showing sticky header for key: ${key}`);
    
    // 부모 요소 확인 및 복구 (안전장치)
    if (!this.stickyHeaderContainer.parentElement) {
      this.context.containerEl.appendChild(this.stickyHeaderContainer);
    }
    
    const outputItem = this.context.outputRecords.get(key)?.itemEl || null;
    if (!outputItem) {
      SummarDebug.log(1, `No output item found for key: ${key}`);
      return;
    }
    
    const originalHeader = outputItem.querySelector('.output-header') as HTMLDivElement;
    if (!originalHeader) {
      SummarDebug.log(1, `No original header found for key: ${key}`);
      return;
    }
    // 우선 data-label을 사용하고, 없으면 chip 내부의 텍스트 span을 조회
    const labelFromData = originalHeader.getAttribute('data-label');
    const chipTextEl = originalHeader.querySelector('.output-label-text') as HTMLSpanElement | null;
    const resolvedLabel = (labelFromData && labelFromData.length > 0)
      ? labelFromData
      : (chipTextEl?.textContent || '');
    
    if (!resolvedLabel) {
      SummarDebug.log(1, `No original header or label found for key: ${key}`);
      return;
    }
    
    // sticky header 생성 및 위치 설정
    this.createAndPositionStickyHeader(key, resolvedLabel, originalHeader);
    
    // 현재 하이라이트 상태 확인 및 적용
    this.applyCurrentHighlightState(key);
    
    this.currentStickyKey = key;
    SummarDebug.log(1, `Sticky header shown for key: ${key}`);
  }

  private createAndPositionStickyHeader(key: string, label: string, originalHeader: HTMLDivElement): void {
    // outputContainer의 실제 위치 계산
    const outputContainerRect = this.context.outputContainer.getBoundingClientRect();
    const containerRect = this.context.containerEl.getBoundingClientRect();
    
    // outputContainer 기준으로 상대 위치 계산
    const relativeTop = outputContainerRect.top - containerRect.top;
    const relativeLeft = outputContainerRect.left - containerRect.left;
    
    // 원본 outputHeader의 실제 크기 계산
    const originalHeaderRect = originalHeader.getBoundingClientRect();
    
    // 원본 header의 computed styles 확인
    const originalComputedStyle = window.getComputedStyle(originalHeader);
    const originalBoxSizing = originalComputedStyle.boxSizing;
    const originalPadding = originalComputedStyle.padding;
    const originalBorder = originalComputedStyle.border;
    
    SummarDebug.log(1, `OutputContainer position: top=${relativeTop}, left=${relativeLeft}, width=${outputContainerRect.width}`);
    SummarDebug.log(1, `Original header size: width=${originalHeaderRect.width}, height=${originalHeaderRect.height}`);
    SummarDebug.log(1, `Original header computed: boxSizing=${originalBoxSizing}, padding=${originalPadding}, border=${originalBorder}`);
    
    // 기존 sticky header 내용 제거
    this.stickyHeaderContainer!.innerHTML = '';
    
    // sticky header container에 key 정보 설정
    this.stickyHeaderContainer!.setAttribute('data-key', key);
    this.stickyHeaderContainer!.className = 'sticky-header-container sticky-header';
    
    // 새로운 sticky header 생성
    const stickyHeader = this.createOutputHeader(key, label);
    stickyHeader.style.borderRadius = '0';
    stickyHeader.style.border = 'none'; // sticky header 내부의 header는 border 제거
    
    this.stickyHeaderContainer!.appendChild(stickyHeader);
    
    // outputContainer 위쪽에 위치하도록 절대 좌표 설정 - 원본 header와 정확히 동일한 크기
    const styles = {
      position: 'absolute',
      top: `${relativeTop + 5}px`,
      left: `${relativeLeft + 10}px`, // outputText와 동일한 left 위치 (padding 고려)
      width: `${originalHeaderRect.width}px`, // 원본 outputHeader와 정확히 동일한 width
      height: `${originalHeaderRect.height}px`, // 원본 outputHeader와 정확히 동일한 height
      maxHeight: `${originalHeaderRect.height}px`, // height 고정
      minHeight: `${originalHeaderRect.height}px`, // height 고정
      boxSizing: 'border-box', // 원본과 동일한 box-sizing
      zIndex: '10000',
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      backgroundColor: 'var(--background-primary)', // outputHeader와 동일한 배경색
      border: '1px solid var(--background-modifier-border)', // outputHeader와 동일한 border
      borderRadius: '0px', // outputHeader와 동일하게 둥글지 않게
      padding: '0px', // outputHeader와 동일한 padding
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)', // 더 자연스러운 그림자
      pointerEvents: 'auto',
      overflow: 'hidden' // 내용이 넘치지 않도록
    };
    
    // 각 스타일을 개별적으로 강제 적용
    Object.entries(styles).forEach(([property, value]) => {
      this.stickyHeaderContainer!.style.setProperty(property, value, 'important');
    });
    
    this.stickyHeaderContainer!.classList.add('visible');
    
    SummarDebug.log(1, `Sticky header positioned at: top=${relativeTop + 5}px, left=${relativeLeft + 10}px, width=${originalHeaderRect.width}px, height=${originalHeaderRect.height}px`);
    
    // DOM 강제 리플로우 유발
    this.stickyHeaderContainer!.offsetHeight;
    
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
              SummarDebug.log(1, `Emergency fix output: top=${finalRect.top}, left=${finalRect.left}, width=${finalRect.width}, height=${finalRect.height}`);
            }
          }, 50);
          this.context.timeoutRefs.add(timeoutId2);
        }
      }
    }, 10);
    this.context.timeoutRefs.add(timeoutId);
    
    this.currentStickyKey = key;
    SummarDebug.log(1, `Sticky header shown as floating layer above outputContainer for key: ${key}`);
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
    if (!this.stickyHeaderContainer || !this.context.outputContainer || !this.currentStickyKey) return;
    
    const outputItem = this.context.outputRecords.get(this.currentStickyKey)?.itemEl || null;
    if (!outputItem) return;
    
    const originalHeader = outputItem.querySelector('.output-header') as HTMLDivElement;
    if (!originalHeader) return;
    
    // outputContainer의 실제 위치 계산
    const outputContainerRect = this.context.outputContainer.getBoundingClientRect();
    const containerRect = this.context.containerEl.getBoundingClientRect();
    const originalHeaderRect = originalHeader.getBoundingClientRect();
    
    // outputContainer 기준으로 상대 위치 계산
    const relativeTop = outputContainerRect.top - containerRect.top;
    const relativeLeft = outputContainerRect.left - containerRect.left;
    
    // outputContainer 위쪽에 위치하도록 절대 좌표 설정
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
    
    const outputHeader = this.createOutputHeader(key, label);
    this.stickyHeaderContainer.appendChild(outputHeader);
  }

  private createOutputHeader(key: string, label: string): HTMLDivElement {
    const uploadWikiButton = this.createStickyButton('upload-output-to-wiki-button', 'Upload this output to Confluence', 'file-up', key);
    const uploadSlackButton = this.createStickyButton('upload-output-to-slack-button', 'Upload this output to Slack', 'hash', key);
    const newNoteButton = this.createStickyButton('new-note-button', 'Create new note with this output', 'file-output', key);
    const replyButton = this.createStickyButton('reply-output-button', 'reply', 'message-square-reply', key);
    const toggleButton = this.createStickyToggleButton(key);
    const copyButton = this.createStickyButton('copy-output-button', 'Copy this output to clipboard', 'copy', key);
    const rightSpacer = document.createElement('div');
    rightSpacer.style.flex = '1';
    rightSpacer.style.minWidth = '8px';
    const showMenuButton = this.createStickyButton('show-menu-button', 'Show menu', 'menu', key);

    // Use unified record if present to keep header consistent
    const rec = this.context.outputRecords.get(key);
    const icon = rec?.icon || getDefaultLabelIcon(label);
    const stickyLabel = rec?.label || label;
    const header = composeStandardOutputHeader(stickyLabel, {
      uploadWiki: uploadWikiButton,
      uploadSlack: uploadSlackButton,
      newNote: newNoteButton,
      reply: replyButton,
      toggle: toggleButton,
      copy: copyButton,
      spacer: rightSpacer,
      menu: showMenuButton,
    }, { icon });

    return header;
  }

  private addStickyHeaderButtons(_: HTMLDivElement, __: string): void { /* deprecated by composer */ }

  private createStickyButton(buttonId: string, ariaLabel: string, iconName: string, key: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'lucide-icon-button';
    button.setAttribute('button-id', buttonId);
    button.setAttribute('aria-label', ariaLabel);
    button.style.transform = 'scale(0.7)';
    button.style.transformOrigin = 'center';
    button.style.margin = '0';
    
    // 원본 버튼 상태 동기화
    const originalItem = this.context.outputRecords.get(key)?.itemEl || null;
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
    
    // show-menu-button은 특별 처리 (sticky header 위치에 메뉴 표시)
    if (buttonId === 'show-menu-button') {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.handleStickyMenuClick(key, event);
      }, { signal: this.context.abortController.signal });
    } else {
      // 다른 버튼들은 원본 버튼 클릭으로 위임
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (originalItem) {
          const originalButton = originalItem.querySelector(`button[button-id="${buttonId}"]`) as HTMLButtonElement;
          originalButton?.click();
        }
      }, { signal: this.context.abortController.signal });
    }
    
    return button;
  }

  private createStickyToggleButton(key: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'lucide-icon-button';
    button.setAttribute('button-id', 'toggle-fold-button');
    button.setAttribute('aria-label', 'Toggle fold/unfold this output');
    button.style.transform = 'scale(0.7)';
    button.style.transformOrigin = 'center';
    button.style.margin = '0';
    
    // 원본 토글 버튼 상태 동기화
    const originalItem = this.context.outputRecords.get(key)?.itemEl || null;
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
      
      // 원본 버튼과 outputText 상태 동기화
    const originalItem = this.context.outputRecords.get(key)?.itemEl || null;
      if (originalItem) {
        const originalToggleButton = originalItem.querySelector('button[button-id="toggle-fold-button"]') as HTMLButtonElement;
        const outputText = originalItem.querySelector('.output-text') as HTMLDivElement;
        
        if (originalToggleButton && outputText) {
          originalToggleButton.setAttribute('toggled', newToggled ? 'true' : 'false');
          setIcon(originalToggleButton, newToggled ? 'square-chevron-down' : 'square-chevron-up');
          outputText.style.display = newToggled ? 'none' : 'block';
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

  getCurrentStickyKey(): string | null {
    return this.currentStickyKey;
  }

  private handleStickyMenuClick(key: string, event: MouseEvent): void {
    const button = event.target as HTMLButtonElement;
    
    const menuItems = SummarMenuUtils.createStandardMenuItems(key, this.context, true);

    SummarMenuUtils.showPopupMenu(button, menuItems, {
      zIndex: 10001, // sticky header보다 위에 표시
      context: this.context
    });

    SummarDebug.log(1, `Sticky menu opened for key: ${key}`);
  }

  private handleStickyReply(key: string): void {
    SummarMenuUtils.handleReply(key, this.context, true);
  }

  private handleStickyDeleteOutput(key: string): void {
    SummarMenuUtils.handleDeleteOutput(key, this.context);
  }

  // ===== 하이라이트 관련 메서드 =====
  
  highlightStickyHeader(key: string): void {
    // 해당 key의 sticky header 찾기
    const stickyHeader = this.context.containerEl.querySelector(`.sticky-header[data-key="${key}"] .output-header`) as HTMLElement;
    if (stickyHeader) {
      // 배색 반전 효과 적용 (!important로 강제 적용)
      this.applyInvertedColorScheme(stickyHeader);
      SummarDebug.log(1, `Sticky header highlighted with inverted colors for key: ${key}`);
    }
  }

  clearAllStickyHeaderHighlights(): void {
    // 모든 sticky header에서 하이라이팅 제거
    const stickyHeaders = this.context.containerEl.querySelectorAll('.sticky-header .output-header');
    stickyHeaders.forEach((header: HTMLElement) => {
      this.applyOriginalColorScheme(header);
    });
    SummarDebug.log(1, 'All sticky header highlights cleared');
  }

  /**
   * Sticky 헤더에 하이라이트 효과를 적용합니다 (!important 사용)
   */
  private applyInvertedColorScheme(header: HTMLElement): void {
    // 헤더 배경색 변경 (!important로 강제 적용)
    header.style.setProperty('background-color', 'var(--background-modifier-hover)', 'important');
    
    // 헤더 내부의 모든 텍스트 요소(라벨) 배경색을 투명하게 (!important로 강제 적용)
    const textElements = header.querySelectorAll('.output-label-text, .data-label, .output-label-chip, .output-label-icon');
    textElements.forEach((element: HTMLElement) => {
      element.style.setProperty('background-color', 'var(--background-primary)', 'important');
    });
    
    // 헤더 내부의 모든 버튼 배경색을 투명하게 (!important로 강제 적용)
    const buttons = header.querySelectorAll('button, .lucide-icon-button');
    buttons.forEach((button: HTMLElement) => {
      button.style.setProperty('background-color', 'var(--background-primary)', 'important');
    });
  }

  /**
   * Sticky 헤더를 원래 배색으로 복원합니다
   */
  /**
   * Sticky 헤더에서 원래 배색으로 복원합니다
   */
  private applyOriginalColorScheme(header: HTMLElement): void {
    // 헤더 배경색 제거
    header.style.removeProperty('background-color');
    
    // 헤더 내부의 모든 텍스트 요소(라벨) 배경색을 hover 색상으로
    const textElements = header.querySelectorAll('.output-label-text, .data-label, .output-label-chip, .output-label-icon');
    textElements.forEach((element: HTMLElement) => {
      element.style.setProperty('background-color', 'var(--background-modifier-hover)', 'important');
    });
    
    // 헤더 내부의 모든 버튼 배경색을 hover 색상으로
    const buttons = header.querySelectorAll('button, .lucide-icon-button');
    buttons.forEach((button: HTMLElement) => {
      button.style.setProperty('background-color', 'var(--background-modifier-hover)', 'important');
    });
  }

  private applyCurrentHighlightState(key: string): void {
    // 현재 composer의 targetKey와 일치하는지 확인
    const highlightedKey = this.context.getHighlightedKey();
    SummarDebug.log(1, `Checking highlight state: currentKey=${key}, highlightedKey=${highlightedKey}`);
    
    if (highlightedKey === key) {
      // 새로 생성된 sticky header에 하이라이트 적용
      const stickyHeader = this.context.containerEl.querySelector(`.sticky-header[data-key="${key}"] .output-header`) as HTMLElement;
      SummarDebug.log(1, `Looking for sticky header with selector: .sticky-header[data-key="${key}"] .output-header`);
      SummarDebug.log(1, `Found sticky header element:`, stickyHeader);
      
      if (stickyHeader) {
        // 배색 반전 효과 적용
        this.applyInvertedColorScheme(stickyHeader);
        SummarDebug.log(1, `Applied current inverted color scheme to sticky header for key: ${key}`);
      } else {
        SummarDebug.log(1, `Failed to find sticky header for key: ${key}`);
        // 대안으로 direct container search
        const allStickyHeaders = this.context.containerEl.querySelectorAll('.sticky-header .output-header');
        SummarDebug.log(1, `Found ${allStickyHeaders.length} sticky headers in total`);
      }
    }
  }
}
