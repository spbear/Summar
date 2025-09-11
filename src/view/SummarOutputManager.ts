import { Platform, setIcon, normalizePath, MarkdownView } from "obsidian";
import { composeStandardOutputHeader, getDefaultLabelIcon } from "./OutputHeaderComposer";
import { ISummarOutputManager, ISummarViewContext, SummarOutputRecord, SummarViewEvents } from "./SummarViewTypes";
import { SummarDebug } from "../globals";
import { SummarAIParam } from "../summarai";

export class SummarOutputManager implements ISummarOutputManager {
  private events: SummarViewEvents = {};
  // key별 지연 렌더 타이머(append 폭주 시 렌더 횟수 축소)
  private renderTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly RENDER_DEBOUNCE_MS = 60;

  constructor(private context: ISummarViewContext) {}

  setEventHandlers(events: SummarViewEvents): void {
    this.events = events;
  }

  createOutputItem(key: string, label: string='compose prompt'): SummarOutputRecord {
    // 전체 컨테이너 생성
    const outputItem = document.createElement('div');
    outputItem.className = 'output-item';
    outputItem.style.width = '100%';
    outputItem.style.marginBottom = '8px';
    outputItem.setAttribute('output-key', key);
    
    // outputHeader 생성
    const outputHeader = this.createOutputHeader(key, label);
    
    // outputText 영역 생성
    const outputText = this.createOutputText(key);
    
    // outputItem에 헤더와 텍스트 영역 추가
    outputItem.appendChild(outputHeader);
    outputItem.appendChild(outputText);
    
    // 토글 버튼 이벤트 설정은 SummarEventHandler에서 처리
    
    // 결과 아이템을 레코드에 저장
    const rec = this.ensureRecord(key);
    rec.itemEl = outputItem;
    rec.label = label;
    
    // 컨테이너에 추가
    this.context.outputContainer.appendChild(outputItem);
    
    // 이벤트 발생
    this.events.onOutputItemCreated?.(key, outputItem);
    
    return rec;
  }

  deleteOutputItem(key: string): boolean {
    // 해당 키의 결과 아이템이 존재하는지 확인
    const rec = this.context.outputRecords.get(key);
    if (!rec || !rec.itemEl) {
      SummarDebug.log(1, `Output item not found for key: ${key}`);
      return false;
    }

    // 이벤트를 통해 outputItem 제거 알림
    this.events.onOutputItemRemoved?.(key);

    // DOM 요소의 이벤트 리스너 정리 (AbortController가 처리하지만 명시적으로 정리)
    const outputText = rec.itemEl.querySelector('.output-text') as HTMLDivElement;
    if (outputText) {
      // 추가적인 정리가 필요한 경우 여기서 처리
      outputText.removeAttribute('data-key');
    }

    // DOM에서 제거
    rec.itemEl.remove();

    // outputRecords Map에서 제거
    this.context.outputRecords.delete(key);

    // 해당 키의 렌더 타이머가 있다면 정리
    const renderTimer = this.renderTimers.get(key);
    if (renderTimer) {
      clearTimeout(renderTimer);
      this.context.timeoutRefs.delete(renderTimer);
      this.renderTimers.delete(key);
    }

    // conversations 배열의 메모리 정리
    if (rec.conversations) {
      rec.conversations.length = 0; // 배열 내용 정리
    }

    SummarDebug.log(1, `Output item deleted: ${key}`);
    return true;
  }

  appendOutputText(key: string, label: string, message: string): string {
    let rec = this.context.outputRecords.get(key) || null;
    
    if (!rec || !rec.itemEl) {
      // 새로운 outputItem 생성
      this.createOutputItem(key, label);
      return this.updateOutputText(key, label, message);
    } else if (rec.label !== label) {
      rec.label = label;
      this.context.outputRecords.set(key, rec);
      this.scheduleHeaderRender(key);
    }
    
    // Map 우선: 기존 텍스트에 추가
    const currentText = this.getOutput(key);
    const newText = currentText + message;

    // 저장소 갱신
    this.setOutput(key, newText);

    // 렌더는 디바운스로 스케줄링
    this.scheduleRender(key);
    
    return key;
  }

  updateOutputText(key: string, label: string, message: string, isFinal: boolean = false): string {
    let rec = this.context.outputRecords.get(key) || null;
    
    if (!rec || !rec.itemEl) {
      // 새로운 outputItem 생성
      this.createOutputItem(key, label);
    } else if (rec.label !== label) {
      rec.label = label;
      this.context.outputRecords.set(key, rec);
      this.scheduleHeaderRender(key);
    }

    
    // 텍스트 완전 교체: Map 저장 → 렌더 반영
    this.setOutput(key, message, isFinal);
    // 즉시 반영 대신 동일한 경로로 디바운스 렌더(일관성)
    this.scheduleRender(key);
    
    return key;
  }

  pushConversations(key: string, conversation: SummarAIParam) : number {
    let rec = this.context.outputRecords.get(key);
    if (!rec || !rec.itemEl) {
      SummarDebug.log(1, `Output item not found for key: ${key}`);
      rec = this.createOutputItem(key);
    }
    
    // conversations 배열이 없으면 초기화
    if (!rec.conversations) {
      rec.conversations = [];
    }
    
    // conversation 추가하고 새로운 배열 길이 반환

// SummarDebug.log(1, `pushConversations()\n${conversation.role}\n${conversation.text}`);    
    return rec.conversations.push(conversation);
  }

  getConversations(key: string): SummarAIParam[] | null {
    if (key === "") {
      return null;
    }
    const conversations = this.context.outputRecords.get(key)?.conversations || null;
    return conversations;
  }

  getOutputText(key: string): string {
    if (key === "") {
      // 빈 키인 경우 모든 outputItem의 텍스트를 합쳐서 반환
      let allText = "";
      this.context.outputRecords.forEach((rec, itemKey) => {
        const text = rec.result || '';
        if (text) {
          allText += (allText ? '\n\n' : '') + text;
        }
      });
      return allText;
    }
    
    const outputItem = this.context.outputRecords.get(key)?.itemEl || null;
    if (!outputItem) return "";
    return this.getOutput(key);
  }


  /**
   * Import output items from a JSON file placed in the plugin directory
   * and populate the view accordingly.
   * Default filename: summar-conversations.json
   * Expected JSON shape:
   * { "outputItems": [ { result, prompts, statId, key, label, noteName }, ... ] }
   */
  async importOutputItemsFromPluginDir(filename: string = "summar-conversations.json"): Promise<number> {
    let importedCount = 0;
    try {
      const plugin = this.context.plugin;
      
      // conversations 디렉토리에서 파일 찾기
      let path = `${plugin.PLUGIN_DIR}/conversations/${filename}`;
      let exists = await plugin.app.vault.adapter.exists(path);
      
      // conversations 디렉토리에 없으면 플러그인 루트에서 찾기
      if (!exists) {
        path = `${plugin.PLUGIN_DIR}/${filename}`;
        exists = await plugin.app.vault.adapter.exists(path);
      }
      
      // 파일명에 타임스탬프가 없으면 최신 파일 찾기
      if (!exists && filename === "summar-conversations.json") {
        try {
          const conversationsDir = `${plugin.PLUGIN_DIR}/conversations`;
          const dirExists = await plugin.app.vault.adapter.exists(conversationsDir);
          if (dirExists) {
            const files = await plugin.app.vault.adapter.list(conversationsDir);
            const conversationFiles = files.files
              .filter(f => f.startsWith('summar-conversations-') && f.endsWith('.json'))
              .sort()
              .reverse(); // 최신 파일 우선
            
            if (conversationFiles.length > 0) {
              path = `${conversationsDir}/${conversationFiles[0]}`;
              exists = true;
              SummarDebug.log(1, `Found latest conversation file: ${conversationFiles[0]}`);
            }
          }
        } catch (error) {
          SummarDebug.log(1, `Error searching for conversation files:`, error);
        }
      }
      
      if (!exists) {
        SummarDebug.log(1, `File does not exist: ${path}`);
        return importedCount;
      }

      const jsonText = await plugin.app.vault.adapter.read(path);
      SummarDebug.log(1, `File content length: ${jsonText.length} characters`);
      
      const data = JSON.parse(jsonText || '{}');
      const items = data?.outputItems || data?.resultItems; // outputItems와 resultItems 둘 다 지원
      
      SummarDebug.log(1, `Parsed data structure:`, data);
      if (Array.isArray(items)) {
        SummarDebug.log(1, `Found ${items.length} items in array format`);
      } else if (items && typeof items === 'object') {
        SummarDebug.log(1, `Found ${Object.keys(items).length} items in object format`);
      } else {
        SummarDebug.log(1, `No valid items structure found in file (looking for 'outputItems' or 'resultItems')`);
      }

      const ingest = (it: any) => {
        if (!it || typeof it !== 'object') {
          SummarDebug.log(1, `Invalid item structure, skipping:`, it);
          return;
        }
        
        const key: string = it.key || plugin.generateUniqueId();
        SummarDebug.log(1, `Processing item with key: ${key}`);
        
        // 기존에 동일한 key가 존재하는지 확인
        if (this.context.outputRecords.has(key)) {
          SummarDebug.log(1, `Skipping import for existing key: ${key}`);
          return;
        }
        
        try {
          const label: string = it.label || "imported";
          const result: string = it.result || "";
          const noteName: string | undefined = it.noteName || undefined;
          const statId: string | undefined = it.statId || undefined;
          const conversations: any[] = Array.isArray(it.conversations) ? it.conversations : [];

          // Create the UI item
          this.createOutputItem(key, label);
          if (result) this.updateOutputText(key, label, result);
          if (noteName) this.setNewNoteName(key, noteName);
          this.foldOutput(key, true);

          // Persist fields into record
          const rec = this.context.outputRecords.get(key);
          if (rec) {
            rec.statId = statId;
            // conversations 필드도 복원
            if (conversations.length > 0) {
              rec.conversations = conversations;
            }
          }
          
          // 성공적으로 추가된 경우 카운트 증가
          importedCount++;
          SummarDebug.log(1, `Successfully imported item with key: ${key}, total imported: ${importedCount}`);
          
        } catch (error) {
          SummarDebug.error(1, `Failed to import item with key: ${key}`, error);
          // 에러가 발생해도 카운트는 증가시키지 않음
        }
      };

      if (Array.isArray(items)) {
        items.forEach(ingest);
      } else if (items && typeof items === 'object') {
        Object.keys(items).sort().forEach(k => ingest(items[k]));
      } else {
        // Nothing to import
      }
    } catch (error) {
      console.error('Failed to import output items:', error);
    }
    
    return importedCount;
  }

  foldOutput(key: string | null, fold: boolean): void {
    if (!key || key === "") {
      // 모든 outputItem에 대해 동일하게 적용
      this.context.outputRecords.forEach((rec, itemKey) => {
        if (rec.itemEl) this.applyFoldToOutputItem(rec.itemEl, fold);
      });
    } else {
      // 특정 key의 outputItem에만 적용
      const outputItem = this.context.outputRecords.get(key)?.itemEl || null;
      if (outputItem) {
        this.applyFoldToOutputItem(outputItem, fold);
      }
    }
  }

  clearAllOutputItems(): void {
    // 이벤트를 통해 각 outputItem 제거 알림
    this.context.outputRecords.forEach((rec, key) => {
      this.events.onOutputItemRemoved?.(key);
      
      // conversations 배열의 메모리 정리
      if (rec.conversations) {
        rec.conversations.length = 0;
      }
    });
    
    // 데이터 정리
    this.context.outputRecords.clear();
    this.context.outputContainer.empty();

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

  // ===== 하이라이트 관련 메서드 =====
  
  highlightOutputHeader(key: string): void {
    // 해당 key의 output item에서 header 찾기
    const targetRecord = this.context.outputRecords.get(key);
    if (targetRecord && targetRecord.itemEl) {
      const header = targetRecord.itemEl.querySelector('.output-header') as HTMLElement;
      if (header) {
        // 배색 반전 효과 적용
        this.applyInvertedColorScheme(header);
        SummarDebug.log(1, `Output header highlighted with inverted colors for key: ${key}`);
      }
    }
  }

  clearAllHeaderHighlights(): void {
    // outputRecords를 통해 모든 output header에서 하이라이팅 제거
    this.context.outputRecords.forEach((record) => {
      if (record.itemEl) {
        const header = record.itemEl.querySelector('.output-header') as HTMLElement;
        if (header) {
          // 원래 배색으로 복원
          this.applyOriginalColorScheme(header);
        }
      }
    });
    SummarDebug.log(1, 'All output header highlights cleared');
  }

  /**
   * 헤더에 하이라이트 효과를 적용합니다
   */
  private applyInvertedColorScheme(header: HTMLElement): void {
    header.style.backgroundColor = 'var(--background-modifier-hover)';
    
    // 헤더 내부의 모든 텍스트 요소(라벨) 배경색을 투명하게
    const textElements = header.querySelectorAll('.output-label-chip, .output-label-icon, .output-label-text');
    textElements.forEach((element: HTMLElement) => {
      element.style.backgroundColor = 'var(--background-primary)';
    });
    
    // 헤더 내부의 모든 버튼 배경색을 투명하게
    const buttons = header.querySelectorAll('button, .lucide-icon-button');
    buttons.forEach((button: HTMLElement) => {
      button.style.backgroundColor = 'var(--background-primary)';
    });
  }

  /**
   * 헤더를 원래 배색으로 복원합니다
   */
  private applyOriginalColorScheme(header: HTMLElement): void {
    header.style.backgroundColor = '';
    
    // 헤더 내부의 모든 텍스트 요소(라벨) 배경색을 hover 색상으로
    const textElements = header.querySelectorAll('.output-label-chip, .output-label-icon, .output-label-text');
    textElements.forEach((element: HTMLElement) => {
      element.style.backgroundColor = 'var(--background-modifier-hover)';
    });
    
    // 헤더 내부의 모든 버튼 배경색을 hover 색상으로
    const buttons = header.querySelectorAll('button, .lucide-icon-button');
    buttons.forEach((button: HTMLElement) => {
      button.style.backgroundColor = 'var(--background-modifier-hover)';
    });
  }



  /**
   * Serialize current result records into a JSON payload and write to plugin directory.
   * Returns the written file path.
   */
  async saveOutputItemsToPluginDir(): Promise<string> {
    const outputItems: any[] = [];
    this.context.outputRecords.forEach((rec) => {
      outputItems.push({
        key: rec.key ?? "",
        label: rec.label ?? "",
        noteName: rec.noteName ?? "",
        // prompts: Array.isArray(rec.prompts) ? rec.prompts : [],
        conversations: Array.isArray(rec.conversations) ? rec.conversations : [],
        result: rec.result ?? "",
        // statId: rec.statId ?? "",
      });
    });

    const payload = { outputItems };

    const ts = new Date();
    const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, "0")}${String(ts.getDate()).padStart(2, "0")}-${String(ts.getHours()).padStart(2, "0")}${String(ts.getMinutes()).padStart(2, "0")}${String(ts.getSeconds()).padStart(2, "0")}`;
    
    // 올바른 경로 분리: 디렉토리와 파일 경로를 명확히 구분
    const conversationsDir = normalizePath(`${this.context.plugin.PLUGIN_DIR}/conversations`);
    const targetPath = normalizePath(`${conversationsDir}/summar-conversations-${stamp}.json`);
    
    try {
      // conversations 디렉토리만 생성 (파일명이 아닌 디렉토리)
      const exists = await this.context.plugin.app.vault.adapter.exists(conversationsDir);
      if (!exists) {
        await this.context.plugin.app.vault.createFolder(conversationsDir);
        SummarDebug.log(1, "Directory created:", conversationsDir);
      }
    } catch (error) {
      // 폴백으로 adapter.mkdir 시도
      try {
        await this.context.plugin.app.vault.adapter.mkdir(conversationsDir);
        SummarDebug.log(1, "Directory created via adapter:", conversationsDir);
      } catch (adapterError) {
        SummarDebug.error(1, "Failed to create directory:", conversationsDir, adapterError);
        throw new Error(`Failed to create directory: ${conversationsDir}`);
      }
    }

    // JSON 파일 생성
    await this.context.plugin.app.vault.adapter.write(targetPath, JSON.stringify(payload, null, 2));
    return targetPath;
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
        const outputItem = this.context.outputRecords.get(key)?.itemEl || null;
        if (!outputItem) return;
        const outputTextEl = outputItem.querySelector('.output-text') as HTMLDivElement | null;
        if (!outputTextEl) return;
        const raw = this.getOutput(key);
        const rendered = this.context.markdownRenderer.render(raw);
        const cleaned = this.cleanupMarkdownOutput(rendered);
        const enhanced = this.enhanceCodeBlocks(cleaned);
        outputTextEl.innerHTML = enhanced;
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

  private updateOutputHeader(key: string, outputItem: HTMLDivElement): void {
    const rec = this.context.outputRecords.get(key);
    if (!rec) return;
    
    // 기존 헤더 찾기
    const existingHeader = outputItem.querySelector('.output-header') as HTMLDivElement;
    if (!existingHeader) return;
    
    // 새로운 헤더 생성
    const newHeader = this.createOutputHeader(key, rec.label || 'compose prompt');
    
    // 기존 헤더를 새 헤더로 교체
    outputItem.replaceChild(newHeader, existingHeader);
  }

  /**
   * 특정 키의 헤더만 다시 렌더링
   */
  scheduleHeaderRender(key: string): void {
    const outputItem = this.context.outputRecords.get(key)?.itemEl || null;
    if (outputItem) {
      this.updateOutputHeader(key, outputItem);
    }
  }

  setNewNoteName(key: string, newNotePath?: string): void {
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

    // key에 해당하는 outputItem의 버튼들을 활성화
    let outputItem = this.context.outputRecords.get(key)?.itemEl || null;
    if (!outputItem) {
      // UI가 없으면 생성 (레코드는 이미 ensureRecord로 존재함)
      const rec = this.context.outputRecords.get(key);
      if (rec) {
        this.createOutputItem(key, rec.label || 'compose prompt');
        outputItem = rec.itemEl || null;
      }
    }
    
    if (outputItem) {
      this.enableOutputItemButtons(outputItem);
    }
  }

  getNoteName(key: string): string {
    const rec = this.context.outputRecords.get(key);
    return rec?.noteName || "";
  }

  cleanupMarkdownOutput(html: string): string {
    // 코드 블록 내용을 임시로 보호하기 위해 플레이스홀더로 대체
    const codeBlocks: string[] = [];
    let processedHtml = html.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (match, codeContent) => {
      const index = codeBlocks.length;
      codeBlocks.push(codeContent);
      return `<pre><code>__CODE_PLACEHOLDER_${index}__</code></pre>`;
    });
    
    // 일반적인 정리 작업 수행
    processedHtml = processedHtml
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
    
    // 코드 블록 내용을 복원
    processedHtml = processedHtml.replace(/<pre><code>__CODE_PLACEHOLDER_(\d+)__<\/code><\/pre>/gi, (match, index) => {
      const codeContent = codeBlocks[parseInt(index)];
      return `<pre><code>${codeContent}</code></pre>`;
    });
    
    return processedHtml;
  }

  /**
   * Enhance code blocks in rendered HTML with visual styling and proper boxing
   * Finds <pre><code> blocks and wraps them with enhanced styling classes
   */
  private enhanceCodeBlocks(html: string): string {
    // <pre><code>...</code></pre> 패턴을 찾아서 박스 스타일로 래핑
    return html.replace(
      /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
      (match, codeContent) => {
        // 코드 내용에서 줄바꿈을 보존하되, 앞뒤 공백만 제거
        const preservedContent = codeContent.replace(/^\s+|\s+$/g, '');
        
        return `<div class="summar-code-block-container"><pre class="summar-code-block"><code>${preservedContent}</code></pre></div>`;
      }
    );
  }

  private createOutputHeader(key: string, label: string): HTMLDivElement {
    const uploadWikiButton = this.createUploadWikiButton(key);
    const uploadSlackButton = this.createUploadSlackButton(key);
    const newNoteButton = this.createNewNoteButton(key);
    const replyButton = this.createReplyButton(key);
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
    return composeStandardOutputHeader(label, {
      uploadWiki: uploadWikiButton,
      uploadSlack: uploadSlackButton,
      newNote: newNoteButton,
      reply: replyButton,
      toggle: toggleButton,
      copy: copyButton,
      spacer: rightSpacer,
      menu: showMenuButton,
    }, { icon });
  }

  private createOutputText(key: string): HTMLDivElement {
    const outputText = document.createElement('div');
    outputText.className = 'output-text';
    outputText.setAttribute('data-key', key);
    
    // 스타일 설정
    outputText.style.width = '100%';
    outputText.style.minHeight = '10px';
    outputText.style.border = '1px solid var(--background-modifier-border)';
    outputText.style.padding = '8px';
    outputText.style.marginBottom = '0px';
    outputText.style.backgroundColor = 'var(--background-secondary)';
    outputText.style.wordWrap = 'break-word';
    outputText.style.whiteSpace = 'pre-wrap';
    outputText.style.color = 'var(--text-normal)';
    outputText.style.fontSize = '12px';
    outputText.style.lineHeight = '1.4';
    outputText.style.userSelect = 'text';
    outputText.style.cursor = 'text';
    outputText.style.margin = '0';
    outputText.style.wordBreak = 'break-word';
    outputText.style.overflowWrap = 'break-word';
    outputText.style.display = 'block';
    outputText.style.verticalAlign = 'top';
    // raw text는 Map/통합 레코드에서만 관리
    
    // 텍스트 선택 이벤트 설정
    this.setupTextSelectionEvents(outputText);
    
    return outputText;
  }

  // ===== Unified record helpers (phase 1: sync with legacy Maps) =====
  private ensureRecord(key: string): SummarOutputRecord {
    let rec = this.context.outputRecords.get(key);
    if (!rec) {
      rec = new SummarOutputRecord(key);
      this.context.outputRecords.set(key, rec);
    }
    return rec;
  }

  pushOutputPrompt(key: string, prompt: string): void {
  // SummarDebug.log(1, `pushOutputPrompt()\nkey=${key}\nprompt=${prompt}`);
    const rec = this.ensureRecord(key);
    this.pushConversations(key, new SummarAIParam('user', prompt));
  }


  private setOutput(key: string, text: string, isFinal: boolean = false): void {
    const rec = this.ensureRecord(key);
    
    if (isFinal) {
      // Final result: add to conversations as 'assistant' message
      rec.addFinalResult(text);
      // SummarDebug.log(1, `setOutput() - added final result to conversations, isFinal=${isFinal}`);
    } else {
      // Intermediate result: only update the cached value
      rec.result = text;
      // SummarDebug.log(1, `setOutput() - updated cached result only, isFinal=${isFinal}`);
    }
  }

  private getOutput(key: string): string {
    const rec = this.context.outputRecords.get(key);
    return rec?.result || '';
  }

  private setupTextSelectionEvents(outputText: HTMLDivElement): void {
    let savedSelection: {range: Range, startOffset: number, endOffset: number} | null = null;
    
    const handleSelectionEnd = () => {
      try {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
          const range = selection.getRangeAt(0);
          if (outputText.contains(range.commonAncestorContainer)) {
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
    
    outputText.addEventListener('mouseup', handleSelectionEnd, { signal });
    outputText.addEventListener('touchend', handleSelectionEnd, { signal });
    
    outputText.addEventListener('blur', (e) => {
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
          // 메모리 누수 방지: savedSelection 참조 해제
          savedSelection = null;
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

  private createReplyButton(key: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'lucide-icon-button';
    button.setAttribute('button-id', 'reply-output-button');
    button.setAttribute('aria-label', 'reply');
    button.style.transform = 'scale(0.7)';
    button.style.transformOrigin = 'center';
    button.style.margin = '0';
    button.disabled = true;
    button.style.display = 'none';
    
    setIcon(button, 'message-square-reply');
    
    // 이벤트 리스너는 별도 매니저에서 처리
    
    return button;
  }

  private createUploadWikiButton(key: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'lucide-icon-button';
    button.setAttribute('button-id', 'upload-output-to-wiki-button');
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
    button.setAttribute('button-id', 'upload-output-to-slack-button');
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
    button.setAttribute('button-id', 'copy-output-button');
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

  private enableOutputItemButtons(outputItem: HTMLDivElement): void {
    const buttons = [
      'new-note-button',
      'upload-output-to-wiki-button', 
      'upload-output-to-slack-button',
      'copy-output-button',
      'reply-output-button'
    ];
    
    buttons.forEach(buttonId => {
      const button = outputItem.querySelector(`button[button-id="${buttonId}"]`) as HTMLButtonElement;
      if (button) {
        button.disabled = false;
        button.style.display = '';
      }
    });
  }

  private applyFoldToOutputItem(outputItem: HTMLDivElement, fold: boolean): void {
    const toggleButton = outputItem.querySelector('button[button-id="toggle-fold-button"]') as HTMLButtonElement;
    const outputText = outputItem.querySelector('.output-text') as HTMLDivElement;
    
    if (toggleButton && outputText) {
      toggleButton.setAttribute('toggled', fold ? 'true' : 'false');
      setIcon(toggleButton, fold ? 'square-chevron-down' : 'square-chevron-up');
      outputText.style.display = fold ? 'none' : 'block';
    }
  }
}
