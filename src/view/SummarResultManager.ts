import { Platform, setIcon, normalizePath, MarkdownView } from "obsidian";
import { ISummarResultManager, ISummarViewContext, SummarViewEvents } from "./SummarViewTypes";
import { SummarDebug } from "../globals";

export class SummarResultManager implements ISummarResultManager {
  private events: SummarViewEvents = {};

  constructor(private context: ISummarViewContext) {}

  setEventHandlers(events: SummarViewEvents): void {
    this.events = events;
  }

  createResultItem(key: string, label: string): HTMLDivElement {
    // 전체 컨테이너 생성
    const resultItem = document.createElement('div');
    resultItem.className = 'result-item';
    resultItem.style.width = '100%';
    resultItem.style.marginBottom = '8px';
    resultItem.setAttribute('result-key', key);
    
    // resultHeader 생성
    const resultHeader = this.createResultHeader(key, label);
    
    // resultText 영역 생성
    const resultText = this.createResultText(key);
    
    // resultItem에 헤더와 텍스트 영역 추가
    resultItem.appendChild(resultHeader);
    resultItem.appendChild(resultText);
    
    // 토글 버튼 이벤트 설정
    this.setupToggleButton(resultItem, resultText, key);
    
    // 결과 아이템을 Map에 저장
    this.context.resultItems.set(key, resultItem);
    
    // 컨테이너에 추가
    this.context.resultContainer.appendChild(resultItem);
    
    // 이벤트 발생
    this.events.onResultItemCreated?.(key, resultItem);
    
    return resultItem;
  }

  appendResultText(key: string, label: string, message: string): string {
    let resultItem = this.context.resultItems.get(key);
    
    if (!resultItem) {
      // 새로운 resultItem 생성
      resultItem = this.createResultItem(key, label);
      return this.updateResultText(key, label, message);
    }
    
    // 기존 텍스트에 추가
    const resultText = resultItem.querySelector('.result-text') as HTMLDivElement;
    if (resultText) {
      const currentText = resultText.getAttribute('data-raw-text') || '';
      const newText = currentText + message;
      
      resultText.setAttribute('data-raw-text', newText);
      const renderedHtml = this.context.markdownRenderer.render(newText);
      const cleanedHtml = this.cleanupMarkdownOutput(renderedHtml);
      resultText.innerHTML = cleanedHtml;
    }
    
    return key;
  }

  updateResultText(key: string, label: string, message: string): string {
    let resultItem = this.context.resultItems.get(key);
    
    if (!resultItem) {
      // 새로운 resultItem 생성
      resultItem = this.createResultItem(key, label);
    }
    
    // 텍스트 완전 교체
    const resultText = resultItem.querySelector('.result-text') as HTMLDivElement;
    if (resultText) {
      resultText.setAttribute('data-raw-text', message);
      const renderedHtml = this.context.markdownRenderer.render(message);
      const cleanedHtml = this.cleanupMarkdownOutput(renderedHtml);
      resultText.innerHTML = cleanedHtml;
    }
    
    return key;
  }

  getResultText(key: string): string {
    if (key === "") {
      // 빈 키인 경우 모든 resultItem의 텍스트를 합쳐서 반환
      let allText = "";
      this.context.resultItems.forEach((resultItem, itemKey) => {
        const resultText = resultItem.querySelector('.result-text') as HTMLDivElement;
        if (resultText) {
          const text = resultText.getAttribute('data-raw-text') || '';
          if (text) {
            allText += (allText ? '\n\n' : '') + text;
          }
        }
      });
      return allText;
    }
    
    const resultItem = this.context.resultItems.get(key);
    if (!resultItem) {
      return "";
    }
    
    const resultText = resultItem.querySelector('.result-text') as HTMLDivElement;
    if (resultText) {
      return resultText.getAttribute('data-raw-text') || '';
    }
    
    return "";
  }

  foldResult(key: string | null, fold: boolean): void {
    if (!key || key === "") {
      // 모든 resultItem에 대해 동일하게 적용
      this.context.resultItems.forEach((resultItem, itemKey) => {
        this.applyFoldToResultItem(resultItem, fold);
      });
    } else {
      // 특정 key의 resultItem에만 적용
      const resultItem = this.context.resultItems.get(key);
      if (resultItem) {
        this.applyFoldToResultItem(resultItem, fold);
      }
    }
  }

  clearAllResultItems(): void {
    // 이벤트를 통해 각 resultItem 제거 알림
    this.context.resultItems.forEach((resultItem, key) => {
      this.events.onResultItemRemoved?.(key);
    });
    
    // 데이터 정리
    this.context.resultItems.clear();
    this.context.newNoteNames.clear();
    this.context.resultContainer.empty();
  }

  enableNewNote(key: string, newNotePath?: string): void {
    const now = new Date();
    const formattedDate = now.getFullYear().toString().slice(2) +
      String(now.getMonth() + 1).padStart(2, "0") +
      now.getDate().toString().padStart(2, "0") + "-" +
      now.getHours().toString().padStart(2, "0") +
      now.getMinutes().toString().padStart(2, "0");

    let newNoteName = newNotePath ? newNotePath : formattedDate;
    if (!newNoteName.includes(".md")) {
      newNoteName += ".md";
    }
    this.context.newNoteNames.set(key, newNoteName);

    // key에 해당하는 resultItem의 버튼들을 활성화
    const resultItem = this.context.resultItems.get(key);
    if (resultItem) {
      this.enableResultItemButtons(resultItem);
    }
  }

  getNoteName(key: string): string {
    let newNoteName = this.context.newNoteNames.get(key);
    return (newNoteName && newNoteName.length > 0) ? newNoteName : "";
  }

  cleanupMarkdownOutput(html: string): string {
    return html
      // 연속된 <br> 태그를 하나로 줄임
      .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '<br>')
      // p 태그 사이의 불필요한 공백 제거
      .replace(/<\/p>\s*<p>/gi, '</p><p>')
      // p 태그 내부의 시작/끝 공백 제거
      .replace(/<p>\s+/gi, '<p>')
      .replace(/\s+<\/p>/gi, '</p>')
      // 빈 p 태그 제거
      .replace(/<p>\s*<\/p>/gi, '')
      // 연속된 공백을 하나로 줄임
      .replace(/\s{2,}/gi, ' ')
      // 태그 사이의 불필요한 줄바꿈 제거
      .replace(/>\s*\n\s*</gi, '><')
      // 시작과 끝의 공백 제거
      .trim();
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
    
    // 버튼들 추가
    this.addHeaderButtons(resultHeader, key);
    
    return resultHeader;
  }

  private createResultText(key: string): HTMLDivElement {
    const resultText = document.createElement('div');
    resultText.className = 'result-text';
    resultText.setAttribute('data-key', key);
    
    // 스타일 설정
    resultText.style.width = '100%';
    resultText.style.minHeight = '10px';
    resultText.style.border = '1px solid var(--background-modifier-border)';
    resultText.style.padding = '8px';
    resultText.style.marginBottom = '0px';
    resultText.style.backgroundColor = 'var(--background-secondary)';
    resultText.style.wordWrap = 'break-word';
    resultText.style.whiteSpace = 'pre-wrap';
    resultText.style.color = 'var(--text-normal)';
    resultText.style.fontSize = '12px';
    resultText.style.lineHeight = '1.4';
    resultText.style.userSelect = 'text';
    resultText.style.cursor = 'text';
    resultText.style.margin = '0';
    resultText.style.wordBreak = 'break-word';
    resultText.style.overflowWrap = 'break-word';
    resultText.style.display = 'block';
    resultText.style.verticalAlign = 'top';
    resultText.setAttribute('data-raw-text', '');
    
    // 텍스트 선택 이벤트 설정
    this.setupTextSelectionEvents(resultText);
    
    return resultText;
  }

  private setupTextSelectionEvents(resultText: HTMLDivElement): void {
    let savedSelection: {range: Range, startOffset: number, endOffset: number} | null = null;
    
    const handleSelectionEnd = () => {
      try {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
          const range = selection.getRangeAt(0);
          if (resultText.contains(range.commonAncestorContainer)) {
            savedSelection = {
              range: range.cloneRange(),
              startOffset: range.startOffset,
              endOffset: range.endOffset
            };
          }
        }
      } catch (error) {
        console.debug('Selection handling error (safe to ignore on mobile):', error);
      }
    };
    
    const signal = this.context.abortController.signal;
    
    resultText.addEventListener('mouseup', handleSelectionEnd, { signal });
    resultText.addEventListener('touchend', handleSelectionEnd, { signal });
    
    resultText.addEventListener('blur', (e) => {
      if (savedSelection && !Platform.isMobileApp) {
        const timeoutId = setTimeout(() => {
          try {
            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(savedSelection!.range);
            }
          } catch (error) {
            console.debug('Selection restoration failed (normal on mobile):', error);
          }
        }, 10);
        
        this.context.timeoutRefs.add(timeoutId);
      }
    }, { signal });
  }

  private setupToggleButton(resultItem: HTMLDivElement, resultText: HTMLDivElement, key: string): void {
    const toggleButton = resultItem.querySelector('button[button-id="toggle-fold-button"]') as HTMLButtonElement;
    if (toggleButton) {
      toggleButton.addEventListener('click', (event) => {
        event.stopPropagation();
        
        // 중복 실행 방지
        if ((this.context as any).isToggling) {
          SummarDebug.log(1, `Toggle already in progress for key: ${key}, skipping`);
          return;
        }
        
        (this.context as any).isToggling = true;
        
        try {
          const currentToggled = toggleButton.getAttribute('toggled') === 'true';
          const newToggled = !currentToggled;
          
          // 버튼 상태 업데이트
          toggleButton.setAttribute('toggled', newToggled ? 'true' : 'false');
          setIcon(toggleButton, newToggled ? 'square-chevron-down' : 'square-chevron-up');
          
          // resultText 표시/숨김
          resultText.style.display = newToggled ? 'none' : 'block';
          
          // 이벤트 발생
          this.events.onToggleStateChanged?.(key, newToggled);
          
        } finally {
          // 플래그 해제
          const timeoutId = setTimeout(() => {
            (this.context as any).isToggling = false;
          }, 100);
          this.context.timeoutRefs.add(timeoutId);
        }
      }, { signal: this.context.abortController.signal });
    }
  }

  private addHeaderButtons(resultHeader: HTMLDivElement, key: string): void {
    // Upload Wiki 버튼 (첫 번째)
    const uploadWikiButton = this.createUploadWikiButton(key);
    
    // Upload Slack 버튼 (두 번째)
    const uploadSlackButton = this.createUploadSlackButton(key);
    
    // New Note 버튼 (세 번째)
    const newNoteButton = this.createNewNoteButton(key);
    
    // Toggle 버튼 (네 번째)
    const toggleButton = this.createToggleButton();
    
    // Copy 버튼 (다섯 번째)
    const copyButton = this.createCopyButton(key);
    
    // 우측 정렬용 spacer
    const rightSpacer = document.createElement('div');
    rightSpacer.style.flex = '1';
    rightSpacer.style.minWidth = '8px';
    
    // Show Menu 버튼 (맨 오른쪽)
    const showMenuButton = this.createShowMenuButton(key);
    
    resultHeader.appendChild(uploadWikiButton);
    resultHeader.appendChild(uploadSlackButton);
    resultHeader.appendChild(newNoteButton);
    resultHeader.appendChild(toggleButton);
    resultHeader.appendChild(copyButton);
    resultHeader.appendChild(rightSpacer);
    resultHeader.appendChild(showMenuButton);
  }

  private createToggleButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'lucide-icon-button';
    button.setAttribute('button-id', 'toggle-fold-button');
    button.setAttribute('toggled', 'false');
    button.setAttribute('aria-label', 'Toggle fold/unfold this result');
    button.style.transform = 'scale(0.7)';
    button.style.transformOrigin = 'center';
    button.style.margin = '0';
    
    setIcon(button, 'square-chevron-up');
    
    return button;
  }

  private createNewNoteButton(key: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'lucide-icon-button';
    button.setAttribute('button-id', 'new-note-button');
    button.setAttribute('aria-label', 'Create new note with this result');
    button.style.transform = 'scale(0.7)';
    button.style.transformOrigin = 'center';
    button.style.margin = '0';
    button.disabled = true;
    button.style.display = 'none';
    
    setIcon(button, 'file-output');
    
    // 이벤트 리스너는 별도 매니저에서 처리
    
    return button;
  }

  private createUploadWikiButton(key: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'lucide-icon-button';
    button.setAttribute('button-id', 'upload-result-to-wiki-button');
    button.setAttribute('aria-label', 'Upload this result to Confluence');
    button.style.transform = 'scale(0.7)';
    button.style.transformOrigin = 'center';
    button.style.margin = '0';
    button.disabled = true;
    button.style.display = 'none';
    
    setIcon(button, 'file-up');
    
    return button;
  }

  private createUploadSlackButton(key: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'lucide-icon-button';
    button.setAttribute('button-id', 'upload-result-to-slack-button');
    button.setAttribute('aria-label', 'Upload this result to Slack');
    button.style.transform = 'scale(0.7)';
    button.style.transformOrigin = 'center';
    button.style.margin = '0';
    button.disabled = true;
    button.style.display = 'none';
    
    setIcon(button, 'hash');
    
    return button;
  }

  private createCopyButton(key: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'lucide-icon-button';
    button.setAttribute('button-id', 'copy-result-button');
    button.setAttribute('aria-label', 'Copy this result to clipboard');
    button.style.transform = 'scale(0.7)';
    button.style.transformOrigin = 'center';
    button.style.margin = '0';
    
    setIcon(button, 'copy');
    
    return button;
  }
  
  private createShowMenuButton(key: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'lucide-icon-button';
    button.setAttribute('button-id', 'show-menu-button');
    button.setAttribute('aria-label', 'Show menu');
    button.style.transform = 'scale(0.7)';
    button.style.transformOrigin = 'center';
    button.style.margin = '0';
    
    setIcon(button, 'menu');
    
    // 클릭 시 Notice 호출
    button.addEventListener('click', () => {
      try {
        SummarDebug.Notice(1, `Show menu clicked: ${key}`);
      } catch (e) {
        // 안전하게 무시
        console.debug('Notice call failed', e);
      }
    }, { signal: this.context.abortController.signal });
    
    return button;
  }

  private enableResultItemButtons(resultItem: HTMLDivElement): void {
    const buttons = [
      'new-note-button',
      'upload-result-to-wiki-button', 
      'upload-result-to-slack-button'
    ];
    
    buttons.forEach(buttonId => {
      const button = resultItem.querySelector(`button[button-id="${buttonId}"]`) as HTMLButtonElement;
      if (button) {
        button.disabled = false;
        button.style.display = '';
      }
    });
  }

  private applyFoldToResultItem(resultItem: HTMLDivElement, fold: boolean): void {
    const toggleButton = resultItem.querySelector('button[button-id="toggle-fold-button"]') as HTMLButtonElement;
    const resultText = resultItem.querySelector('.result-text') as HTMLDivElement;
    
    if (toggleButton && resultText) {
      toggleButton.setAttribute('toggled', fold ? 'true' : 'false');
      setIcon(toggleButton, fold ? 'square-chevron-down' : 'square-chevron-up');
      resultText.style.display = fold ? 'none' : 'block';
    }
  }
}
