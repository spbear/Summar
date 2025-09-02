import { Platform, setIcon, normalizePath, MarkdownView } from "obsidian";
import { composeStandardResultHeader, getDefaultLabelIcon } from "./ResultHeaderComposer";
import { ISummarResultManager, ISummarViewContext, SummarResultRecord, SummarViewEvents } from "./SummarViewTypes";
import { SummarDebug } from "../globals";

export class SummarResultManager implements ISummarResultManager {
  private events: SummarViewEvents = {};
  // key별 지연 렌더 타이머(append 폭주 시 렌더 횟수 축소)
  private renderTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly RENDER_DEBOUNCE_MS = 60;

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
    
    // 토글 버튼 이벤트 설정은 SummarEventHandler에서 처리
    
    // 결과 아이템을 레코드에 저장
    const rec = this.ensureRecord(key);
    rec.itemEl = resultItem;
    rec.label = label;
    
    // 컨테이너에 추가
    this.context.resultContainer.appendChild(resultItem);
    
    // 이벤트 발생
    this.events.onResultItemCreated?.(key, resultItem);
    
    return resultItem;
  }

  deleteResultItem(key: string): boolean {
    // 해당 키의 결과 아이템이 존재하는지 확인
    const rec = this.context.resultRecords.get(key);
    if (!rec || !rec.itemEl) {
      SummarDebug.log(1, `Result item not found for key: ${key}`);
      return false;
    }

    // 이벤트를 통해 resultItem 제거 알림
    this.events.onResultItemRemoved?.(key);

    // DOM에서 제거
    rec.itemEl.remove();

    // resultRecords Map에서 제거
    this.context.resultRecords.delete(key);

    // 해당 키의 렌더 타이머가 있다면 정리
    const renderTimer = this.renderTimers.get(key);
    if (renderTimer) {
      clearTimeout(renderTimer);
      this.context.timeoutRefs.delete(renderTimer);
      this.renderTimers.delete(key);
    }

    SummarDebug.log(1, `Result item deleted: ${key}`);
    return true;
  }

  appendResultText(key: string, label: string, message: string): string {
    let resultItem = this.context.resultRecords.get(key)?.itemEl || null;
    
    if (!resultItem) {
      // 새로운 resultItem 생성
      resultItem = this.createResultItem(key, label);
      return this.updateResultText(key, label, message);
    }
    
    // Map 우선: 기존 텍스트에 추가
    const currentText = this.getResult(key);
    const newText = currentText + message;

    // 저장소 갱신
    this.setResult(key, newText);

    // 렌더는 디바운스로 스케줄링
    this.scheduleRender(key);
    
    return key;
  }

  updateResultText(key: string, label: string, message: string): string {
    let resultItem = this.context.resultRecords.get(key)?.itemEl || null;
    
    if (!resultItem) {
      // 새로운 resultItem 생성
      resultItem = this.createResultItem(key, label);
    }
    
    // 텍스트 완전 교체: Map 저장 → 렌더 반영
    this.setResult(key, message);
    // 즉시 반영 대신 동일한 경로로 디바운스 렌더(일관성)
    this.scheduleRender(key);
    
    return key;
  }

  getResultText(key: string): string {
    if (key === "") {
      // 빈 키인 경우 모든 resultItem의 텍스트를 합쳐서 반환
      let allText = "";
      this.context.resultRecords.forEach((rec, itemKey) => {
        const text = rec.result || '';
        if (text) {
          allText += (allText ? '\n\n' : '') + text;
        }
      });
      return allText;
    }
    
    const resultItem = this.context.resultRecords.get(key)?.itemEl || null;
    if (!resultItem) return "";
    return this.getResult(key);
  }


  /**
   * Import result items from a JSON file placed in the plugin directory
   * and populate the view accordingly.
   * Default filename: summar-results.json
   * Expected JSON shape:
   * { "resultItems": { "0": { result, prompts, statId, key, label, noteName }, ... } }
   */
  async importResultItemsFromPluginDir(filename: string = "summar-results.json"): Promise<number> {
    let importedCount = 0;
    try {
      const plugin = this.context.plugin;
      const path = `${plugin.PLUGIN_DIR}/${filename}`;
      const exists = await plugin.app.vault.adapter.exists(path);
      if (!exists) return importedCount;

      const jsonText = await plugin.app.vault.adapter.read(path);
      const data = JSON.parse(jsonText || '{}');
      const items = data?.resultItems;

      const ingest = (it: any) => {
        if (!it || typeof it !== 'object') return;
        const key: string = it.key || plugin.generateUniqueId();
        
        // 기존에 동일한 key가 존재하는지 확인
        if (this.context.resultRecords.has(key)) {
          SummarDebug.log(1, `Skipping import for existing key: ${key}`);
          return;
        }
        
        const label: string = it.label || "imported";
        const result: string = it.result || "";
        const noteName: string | undefined = it.noteName || undefined;
        const prompts: string[] = Array.isArray(it.prompts) ? it.prompts : [];
        const statId: string | undefined = it.statId || undefined;

        // Create the UI item
        this.createResultItem(key, label);
        if (result) this.updateResultText(key, label, result);
        if (noteName) this.enableNewNote(key, noteName);
        this.foldResult(key, true);

        // Persist fields into record
        const rec = this.context.resultRecords.get(key);
        if (rec) {
          rec.prompts = prompts;
          rec.statId = statId;
        }
        
        // 성공적으로 추가된 경우 카운트 증가
        importedCount++;
      };

      if (Array.isArray(items)) {
        items.forEach(ingest);
      } else if (items && typeof items === 'object') {
        Object.keys(items).sort().forEach(k => ingest(items[k]));
      } else {
        // Nothing to import
      }
    } catch (error) {
      console.error('Failed to import result items:', error);
    }
    
    return importedCount;
  }

  foldResult(key: string | null, fold: boolean): void {
    if (!key || key === "") {
      // 모든 resultItem에 대해 동일하게 적용
      this.context.resultRecords.forEach((rec, itemKey) => {
        if (rec.itemEl) this.applyFoldToResultItem(rec.itemEl, fold);
      });
    } else {
      // 특정 key의 resultItem에만 적용
      const resultItem = this.context.resultRecords.get(key)?.itemEl || null;
      if (resultItem) {
        this.applyFoldToResultItem(resultItem, fold);
      }
    }
  }

  clearAllResultItems(): void {
    // 이벤트를 통해 각 resultItem 제거 알림
    this.context.resultRecords.forEach((rec, key) => {
      this.events.onResultItemRemoved?.(key);
    });
    
    // 데이터 정리
    this.context.resultRecords.clear();
    this.context.resultContainer.empty();

    // 보류 중인 렌더 타이머 정리
    this.renderTimers.forEach((t) => {
      clearTimeout(t);
      this.context.timeoutRefs.delete(t);
    });
    this.renderTimers.clear();
  }

  cleanup(): void {
    // 모든 지연 렌더 타이머 정리
    this.renderTimers.forEach((t) => {
      clearTimeout(t);
      this.context.timeoutRefs.delete(t);
    });
    this.renderTimers.clear();
  }



  /**
   * Serialize current result records into a JSON payload and write to plugin directory.
   * Returns the written file path.
   */
  async saveResultItemsToPluginDir(): Promise<string> {
    const resultItems: any[] = [];
    this.context.resultRecords.forEach((rec) => {
      resultItems.push({
        result: rec.result ?? "",
        prompts: Array.isArray(rec.prompts) ? rec.prompts : [],
        statId: rec.statId ?? "",
        key: rec.key ?? "",
        label: rec.label ?? "",
        noteName: rec.noteName ?? "",
      });
    });

    const payload = { resultItems };

    const ts = new Date();
    const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, "0")}${String(ts.getDate()).padStart(2, "0")}-${String(ts.getHours()).padStart(2, "0")}${String(ts.getMinutes()).padStart(2, "0")}${String(ts.getSeconds()).padStart(2, "0")}`;
    const basePath = `${this.context.plugin.PLUGIN_DIR}/summar-results-${stamp}`;
    const targetPath = `${basePath}.json`;
    await this.context.plugin.app.vault.adapter.write(targetPath, JSON.stringify(payload, null, 2));
    return targetPath
  }

  private scheduleRender(key: string): void {
    // 기존 타이머가 있으면 취소
    const prev = this.renderTimers.get(key);
    if (prev) {
      clearTimeout(prev);
      this.context.timeoutRefs.delete(prev);
    }
    const timer = setTimeout(() => {
      try {
        const resultItem = this.context.resultRecords.get(key)?.itemEl || null;
        if (!resultItem) return;
        const resultTextEl = resultItem.querySelector('.result-text') as HTMLDivElement | null;
        if (!resultTextEl) return;
        const raw = this.getResult(key);
        const rendered = this.context.markdownRenderer.render(raw);
        const cleaned = this.cleanupMarkdownOutput(rendered);
        resultTextEl.innerHTML = cleaned;
      } finally {
        // 타이머 해제 및 참조 제거
        const t = this.renderTimers.get(key);
        if (t) {
          this.context.timeoutRefs.delete(t);
        }
        this.renderTimers.delete(key);
      }
    }, this.RENDER_DEBOUNCE_MS);
    this.renderTimers.set(key, timer);
    this.context.timeoutRefs.add(timer);
  }

  enableNewNote(key: string, newNotePath?: string): void {
    const now = new Date();
    const formattedDate = now.getFullYear().toString().slice(2) +
      String(now.getMonth() + 1).padStart(2, "0") +
      now.getDate().toString().padStart(2, "0") + "-" +
      now.getHours().toString().padStart(2, "0") +
      now.getMinutes().toString().padStart(2, "0");

    let noteName = newNotePath ? newNotePath : formattedDate;
    if (!noteName.includes(".md")) {
      noteName += ".md";
    }
    const rec2 = this.ensureRecord(key);
    rec2.noteName = noteName;

    // key에 해당하는 resultItem의 버튼들을 활성화
    const resultItem = this.context.resultRecords.get(key)?.itemEl || null;
    if (resultItem) {
      this.enableResultItemButtons(resultItem);
    }
  }

  getNoteName(key: string): string {
    const rec = this.context.resultRecords.get(key);
    return rec?.noteName || "";
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
    const uploadWikiButton = this.createUploadWikiButton(key);
    const uploadSlackButton = this.createUploadSlackButton(key);
    const newNoteButton = this.createNewNoteButton(key);
    const toggleButton = this.createToggleButton();
    const copyButton = this.createCopyButton(key);
    const rightSpacer = document.createElement('div');
    rightSpacer.style.flex = '1';
    rightSpacer.style.minWidth = '8px';
    const showMenuButton = this.createShowMenuButton(key);

    // Pick an icon by label; callers could be updated to pass explicit icon if desired.
    const icon = getDefaultLabelIcon(label);
    const rec = this.ensureRecord(key);
    rec.label = label;
    rec.icon = icon;
    return composeStandardResultHeader(label, {
      uploadWiki: uploadWikiButton,
      uploadSlack: uploadSlackButton,
      newNote: newNoteButton,
      toggle: toggleButton,
      copy: copyButton,
      spacer: rightSpacer,
      menu: showMenuButton,
    }, { icon });
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
    // raw text는 Map/통합 레코드에서만 관리
    
    // 텍스트 선택 이벤트 설정
    this.setupTextSelectionEvents(resultText);
    
    return resultText;
  }

  // ===== Unified record helpers (phase 1: sync with legacy Maps) =====
  private ensureRecord(key: string): SummarResultRecord {
    let rec = this.context.resultRecords.get(key);
    if (!rec) {
      rec = { key, itemEl: null, result: '', noteName: undefined };
      this.context.resultRecords.set(key, rec);
    }
    return rec;
  }

  pushResultPrompt(key: string, prompt: string): void {
    const rec = this.ensureRecord(key);
    if (!rec.prompts) rec.prompts = [];
    rec.prompts.push(prompt);
  }


  private setResult(key: string, text: string): void {
    const rec = this.ensureRecord(key);
    rec.result = text;
  }

  private getResult(key: string): string {
    const rec = this.context.resultRecords.get(key);
    return rec?.result || '';
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

  private addHeaderButtons(_: HTMLDivElement, __: string): void { /* deprecated by composer */ }

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
    button.disabled = true;
    button.style.display = 'none';
    
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
    
    // 이벤트 리스너는 SummarEventHandler에서 처리
    
    return button;
  }

  private enableResultItemButtons(resultItem: HTMLDivElement): void {
    const buttons = [
      'new-note-button',
      'upload-result-to-wiki-button', 
      'upload-result-to-slack-button',
      'copy-result-button'
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
