import { Platform, setIcon, normalizePath, MarkdownView } from "obsidian";
import { createOutputHeader, createOutputHeaderButtons, getDefaultLabelIcon, setHeaderHighlight as applyHeaderHighlight, clearHeaderHighlight as resetHeaderHighlight } from "./SummarHeader";
import { ISummarOutputManager, ISummarViewContext, SummarOutputRecord, SummarViewEvents } from "./SummarViewTypes";
import { SummarDebug } from "../globals";
import { SummarAIParam, SummarAIParamType } from "../summarai-types";

export class SummarOutputManager implements ISummarOutputManager {
  private events: SummarViewEvents = {};
  // key별 지연 렌더 타이머(append 폭주 시 렌더 횟수 축소)
  private renderTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly RENDER_DEBOUNCE_MS = 60;
  // 원본 import 파일명 추적 (첫 번째 import만 유효)
  private originalImportFilename: string | null = null;

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
    rec.cleanup(); // 새로운 cleanup 메서드 사용

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
    // SummarDebug.log(1, `updateOutputText called - key: ${key}, label: ${label}, messageLength: ${message.length}, isFinal: ${isFinal}`);
    
    let rec = this.context.outputRecords.get(key) || null;
    
    if (!rec || !rec.itemEl) {
      // 새로운 outputItem 생성
      // SummarDebug.log(1, `Creating new output item for key: ${key}`);
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
    
    // SummarDebug.log(1, `updateOutputText completed for key: ${key}`);
    return key;
  }

  pushConversations(key: string, conversation: SummarAIParam) : number {
    let rec = this.context.outputRecords.get(key);
    if (!rec || !rec.itemEl) {
      // SummarDebug.log(1, `Output item not found for key: ${key}`);
      rec = this.createOutputItem(key);
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

  addConversation(key: string, role: string, text: string): { conversations: SummarAIParam[], addedIndex: number } {
    // outputRecords에서 해당 key의 itemEl 찾기
    const rec = this.context.outputRecords.get(key);
    if (!rec || !rec.itemEl) {
      // SummarDebug.log(1, `Output item not found for key: ${key}`);
      return { conversations: [], addedIndex: -1 };
    }

    // conversations에 데이터 저장
    const conversationParam = new SummarAIParam(role, text, SummarAIParamType.CONVERSATION);
    const newLength = rec.conversations.push(conversationParam);
    const addedIndex = newLength - 1; // 전체 conversations 배열에서의 index

    // UI 생성
    this.addConversationUI(key, role, text);

    // SummarDebug.log(1, `Conversation added for key: ${key}, role: ${role}, globalIndex: ${addedIndex}`);
    return { conversations: rec.conversations, addedIndex: addedIndex };
  }

  /**
   * 기존 conversation-item의 텍스트를 업데이트합니다.
   * @param key 출력 아이템의 키
   * @param index 전체 conversations 배열에서의 index (0부터 시작, -1이면 마지막)
   * @param newText 새로운 텍스트
   */
  updateConversation(key: string, index: number, newText: string): boolean {
    const rec = this.context.outputRecords.get(key);
    if (!rec || !rec.itemEl) {
      SummarDebug.log(1, `Output item not found for key: ${key}`);
      return false;
    }

    if (rec.conversations.length === 0) {
      SummarDebug.log(1, `No conversations found for key: ${key}`);
      return false;
    }

    // index 처리 (-1이면 마지막, 범위 체크)
    let targetIndex = index;
    if (index === -1) {
      targetIndex = rec.conversations.length - 1;
    }

    if (targetIndex < 0 || targetIndex >= rec.conversations.length) {
      SummarDebug.log(1, `Invalid index ${index} for key ${key}, available: 0-${rec.conversations.length - 1}`);
      return false;
    }

    // conversations 배열에서 해당 index의 conversation 가져오기
    const targetConversation = rec.conversations[targetIndex];
    
    // CONVERSATION 타입인지 확인
    if (targetConversation.type !== SummarAIParamType.CONVERSATION) {
      SummarDebug.log(1, `Conversation at index ${targetIndex} is not CONVERSATION type: ${targetConversation.type}`);
      return false;
    }

    // conversations 배열 업데이트
    targetConversation.text = newText;
    const targetRole = targetConversation.role;

    // DOM에서 해당 conversation-item 찾아서 업데이트
    // CONVERSATION 타입의 item들만 카운트하여 DOM index 찾기
    const conversationItems = rec.itemEl.querySelectorAll('.conversation-item') as NodeListOf<HTMLDivElement>;
    let conversationTypeCount = 0;
    
    for (let i = 0; i < rec.conversations.length; i++) {
      const conv = rec.conversations[i];
      if (conv.type === SummarAIParamType.CONVERSATION) {
        if (i === targetIndex) {
          // 찾았음: conversationTypeCount번째 conversation-item을 업데이트
          if (conversationTypeCount < conversationItems.length) {
            const targetItem = conversationItems[conversationTypeCount];
            
            // 마크다운 렌더링 및 업데이트
            const rendered = this.context.markdownRenderer.render(newText);
            const cleaned = this.cleanupMarkdownOutput(rendered);
            const enhanced = this.enhanceCodeBlocks(cleaned);
            targetItem.innerHTML = enhanced;
            
            SummarDebug.log(1, `Conversation updated for key: ${key}, globalIndex: ${targetIndex}, role: ${targetRole}, domIndex: ${conversationTypeCount}`);
            return true;
          }
          break;
        }
        conversationTypeCount++;
      }
    }

    SummarDebug.log(1, `Conversation UI element not found for key: ${key}, globalIndex: ${targetIndex}`);
    return false;
  }

  /**
   * conversations 배열에 추가하지 않고 UI만 생성 (import 시 사용)
   */
  private addConversationUI(key: string, role: string, text: string): void {
    const rec = this.context.outputRecords.get(key);
    if (!rec || !rec.itemEl) {
      // SummarDebug.log(1, `Output item not found for key: ${key}`);
      return;
    }

    // 대화 요소 UI 생성
    const conversationDiv = document.createElement('div');
    conversationDiv.className = 'conversation-item';
    conversationDiv.setAttribute('data-role', role);
    conversationDiv.setAttribute('data-key', key);
    
    // createOutputText() 참고한 스타일 설정
    conversationDiv.style.width = '100%';
    conversationDiv.style.minHeight = '10px';
    conversationDiv.style.border = '1px solid var(--background-modifier-border)';
    conversationDiv.style.padding = '0px 8px'; // 상하 패딩을 0px로 최소화
    conversationDiv.style.marginBottom = '0px'; // 간격 제거
    conversationDiv.style.wordWrap = 'break-word';
    conversationDiv.style.whiteSpace = 'pre-wrap';
    conversationDiv.style.color = 'var(--text-normal)';
    conversationDiv.style.fontSize = '12px';
    conversationDiv.style.lineHeight = '1.4'; // 라인 간격을 1.4에서 1.2로 줄임
    conversationDiv.style.userSelect = 'text';
    conversationDiv.style.cursor = 'text';
    conversationDiv.style.wordBreak = 'break-word';
    conversationDiv.style.overflowWrap = 'break-word';
    conversationDiv.style.display = 'block';
    conversationDiv.style.verticalAlign = 'top';
    
    // role에 따른 배경색 설정
    if (role === 'user') {
      conversationDiv.style.backgroundColor = 'var(--background-primary)';
    } else if (role === 'assistant') {
      conversationDiv.style.backgroundColor = 'var(--background-secondary)';
    } else {
      conversationDiv.style.backgroundColor = 'var(--background-secondary)';
    }

    // scheduleRender()와 동일한 마크다운 렌더링 로직 적용
    const rendered = this.context.markdownRenderer.render(text);
    const cleaned = this.cleanupMarkdownOutput(rendered);
    const enhanced = this.enhanceCodeBlocks(cleaned);
    conversationDiv.innerHTML = enhanced;

    // itemEl에 appendChild
    rec.itemEl.appendChild(conversationDiv);

    // SummarDebug.log(1, `Conversation UI added for key: ${key}, role: ${role}`);
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
    // this.cleanupOldConversationFiles();

    // 첫 번째 import인지 확인 (빈 상태에서만 originalImportFilename 설정)
    const isFirstImport = this.context.outputRecords.size === 0;

    let importedCount = 0;
    let actualReadPath = ""; // 실제로 읽은 파일의 전체 경로
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
              // SummarDebug.log(1, `Found latest conversation file: ${conversationFiles[0]}`);
            }
          }
        } catch (error) {
          // SummarDebug.log(1, `Error searching for conversation files:`, error);
        }
      }
      
      if (!exists) {
        // SummarDebug.log(1, `File does not exist: ${path}`);
        return importedCount;
      }

      // 파일을 성공적으로 찾았으므로 실제 읽은 경로 저장
      actualReadPath = path;

      const jsonText = await plugin.app.vault.adapter.read(path);
      // SummarDebug.log(1, `File content length: ${jsonText.length} characters`);
      
      const data = JSON.parse(jsonText || '{}');
      const items = data?.outputItems || data?.resultItems; // outputItems와 resultItems 둘 다 지원
      
      // SummarDebug.log(1, `Parsed data structure:`, data);
      if (Array.isArray(items)) {
        // SummarDebug.log(1, `Found ${items.length} items in array format`);
      } else if (items && typeof items === 'object') {
        // SummarDebug.log(1, `Found ${Object.keys(items).length} items in object format`);
      } else {
        // SummarDebug.log(1, `No valid items structure found in file (looking for 'outputItems' or 'resultItems')`);
      }

      const ingest = (it: any) => {
        if (!it || typeof it !== 'object') {
          // SummarDebug.log(1, `Invalid item structure, skipping:`, it);
          return;
        }
        
        const key: string = it.key || plugin.generateUniqueId();
        // SummarDebug.log(1, `Processing item with key: ${key}`);
        
        // 기존에 동일한 key가 존재하는지 확인
        if (this.context.outputRecords.has(key)) {
          // SummarDebug.log(1, `Skipping import for existing key: ${key}`);
          return;
        }
        
        try {
          const label: string = it.label || "imported";
          const noteName: string | undefined = it.noteName || undefined;
          const statId: string | undefined = it.statId || undefined;
          const conversations: any[] = Array.isArray(it.conversations) ? it.conversations : [];

          // Create the UI item
          this.createOutputItem(key, label);
          
          // Persist fields into record first
          const rec = this.context.outputRecords.get(key);
          if (rec) {
            rec.statId = statId;
            // conversations 필드 먼저 복원
            if (conversations.length > 0) {
              rec.conversations = conversations;
            }
          }
          
          // Process conversations array for UI display
          if (conversations.length > 0) {
            // SummarDebug.log(1, `Processing ${conversations.length} conversations for key: ${key}`);
            
            // Process all conversations and add UI elements for conversation type
            let lastAssistantOutput = '';
            let noteSyncOutput: string | null = null;
            for (let i = 0; i < conversations.length; i++) {
              const conv = conversations[i];
              // SummarDebug.log(1, `Conversation ${i}: role="${conv.role}", type="${conv.type}", textLength=${conv.text?.length || 0}`);
              
              // Add conversation-type items to UI using addConversationUI (데이터 중복 방지)
              if (conv.type === 'conversation' || conv.type === SummarAIParamType.CONVERSATION) {
                // SummarDebug.log(1, `Adding conversation item to UI: role="${conv.role}"`);
                this.addConversationUI(key, conv.role, conv.text || '');
              } else {
                // SummarDebug.log(1, `Skipping conversation item (not conversation type): role="${conv.role}", type="${conv.type}"`);
              }
              
              // Find the last assistant OUTPUT message to display in main output area
              if (conv.role === 'assistant') {
                const convType = conv.type;
                if ((convType === SummarAIParamType.NOTESYNC || convType === 'notesync') && noteName) {
                  const encodedPath = encodeURI(noteName).replace(/%5B/g, '[').replace(/%5D/g, ']'); // 공백·한글 처리
                  const segments = noteName.split(/[\\\/]/);
                  const lastSegment = segments.length > 0 ? segments[segments.length - 1] : noteName;
                  const dotIndex = lastSegment.lastIndexOf('.');
                  const displayName = dotIndex > 0 ? lastSegment.slice(0, dotIndex) : lastSegment;
                  
                  noteSyncOutput = `from: [[${displayName}](${encodedPath})]`;
                } else if (convType === 'output' || convType === SummarAIParamType.OUTPUT) {
                  lastAssistantOutput = conv.text || '';
                  // SummarDebug.log(1, `Found matching assistant OUTPUT at index ${i}`);
                }
              }
            }
            
            const outputText = noteSyncOutput ?? lastAssistantOutput;
            if (outputText) {
              // SummarDebug.log(1, `Found assistant OUTPUT message for key: ${key}`);
              // SummarDebug.log(1, `Message length: ${lastAssistantOutput.length}, content preview: ${lastAssistantOutput.substring(0, 100)}...`);
              // isFinal=false로 설정하여 conversations에 추가하지 않고 UI만 업데이트
              this.updateOutputText(key, label, outputText, false);
              
              // 추가 디버깅: 업데이트 후 상태 확인
              const updatedRec = this.context.outputRecords.get(key);
              // SummarDebug.log(1, `After updateOutputText - record exists: ${!!updatedRec}, result length: ${updatedRec?.result?.length || 0}`);
            } else {
              // SummarDebug.log(1, `No assistant OUTPUT message found for key: ${key}`);
            }
          } else if (it.result) {
            // For backward compatibility: if no conversations but has result, 
            // create a conversation from the result
            // SummarDebug.log(1, `Converting legacy result field to conversation for key: ${key}`);
            this.updateOutputText(key, label, it.result, true); // isFinal=true to add to conversations
          }
          
          if (noteName) this.setNewNoteName(key, noteName);
          
          // // conversation item들이 있으면 unfold 상태로 시작
          // const hasConversationItems = conversations.some(conv => 
          //   conv.type === 'conversation' || conv.type === SummarAIParamType.CONVERSATION);
          // this.foldOutput(key, hasConversationItems ? false : true);
          this.foldOutput(key, true);
          // 성공적으로 추가된 경우 카운트 증가
          importedCount++;
          // SummarDebug.log(1, `Successfully imported item with key: ${key}, total imported: ${importedCount}`);
          
        } catch (error) {
          // SummarDebug.error(1, `Failed to import item with key: ${key}`, error);
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

      // 첫 번째 import이고 성공적으로 아이템을 import했다면 원본 파일명 저장
      if (isFirstImport && importedCount > 0 && actualReadPath) {
        // 파일명만 추출 (전체 경로에서 파일명만)
        const filename = actualReadPath.split('/').pop() || '';
        this.originalImportFilename = filename;
        SummarDebug.log(1, `First import successful: originalImportFilename set to "${filename}"`);
      } else if (!isFirstImport) {
        SummarDebug.log(1, `Not first import (outputRecords.size=${this.context.outputRecords.size}): originalImportFilename ignored`);
      }
    } catch (error) {
      console.error('Failed to import output items:', error);
    }
    
    return importedCount;
  }

  foldOutput(key: string | null, fold: boolean): void {
    // SummarDebug.log(1, `foldOutput called - key: ${key}, fold: ${fold}`);
    
    if (!key || key === "") {
      // 모든 outputItem에 대해 동일하게 적용
      // SummarDebug.log(1, `foldOutput - applying to all output items, fold: ${fold}`);
      this.context.outputRecords.forEach((rec, itemKey) => {
        if (rec.itemEl) this.applyFoldToOutputItem(rec.itemEl, fold);
      });
    } else {
      // 특정 key의 outputItem에만 적용
      // SummarDebug.log(1, `foldOutput - applying to specific key: ${key}, fold: ${fold}`);
      const outputItem = this.context.outputRecords.get(key)?.itemEl || null;
      if (outputItem) {
        this.applyFoldToOutputItem(outputItem, fold);
      } else {
        // SummarDebug.log(1, `foldOutput - no outputItem found for key: ${key}`);
      }
    }
  }

  async clearAllOutputItems(): Promise<void> {
    // 저장할 데이터가 있는지 먼저 확인
    if (this.context.outputRecords.size === 0) {
      SummarDebug.log(1, "No output items to save - outputRecords is empty");
      return;
    }

    SummarDebug.log(1, `Starting to save ${this.context.outputRecords.size} output items before clearing`);

    try {
      // 저장 완료까지 기다림
      const savedPath = await this.saveOutputItemsToPluginDir();
      if (savedPath) {
        SummarDebug.log(1, `Successfully saved conversations to: ${savedPath}`);
      } else {
        SummarDebug.log(1, "No conversations were saved (empty data)");
      }
      
      // 저장 완료 후 메모리 정리 실행
      this.performMemoryCleanup();
    } catch (error) {
      SummarDebug.error(1, 'Failed to save output items before clearing:', error);
      // 저장 실패해도 메모리 정리는 진행 (데이터 누수 방지)
      this.performMemoryCleanup();
    }
  }

  private performMemoryCleanup(): void {
    // 이벤트를 통해 각 outputItem 제거 알림
    this.context.outputRecords.forEach((rec, key) => {
      this.events.onOutputItemRemoved?.(key);
      
      // conversations 배열의 메모리 정리
      rec.cleanup(); // 새로운 cleanup 메서드 사용
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

    // 원본 import 파일명 초기화
    this.originalImportFilename = null;
    SummarDebug.log(1, "originalImportFilename reset to null after cleanup");
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
  
  setHeaderHighlight(key: string): void {
    // 해당 key의 output item에서 header 찾기
    const targetRecord = this.context.outputRecords.get(key);
    if (targetRecord && targetRecord.itemEl) {
      const header = targetRecord.itemEl.querySelector('.output-header') as HTMLElement;
      if (header) {
        applyHeaderHighlight(header);
      }
    }
  }

  clearHeaderHighlight(): void {
    // outputRecords를 통해 모든 output header에서 하이라이팅 제거
    this.context.outputRecords.forEach((record) => {
      if (record.itemEl) {
        const header = record.itemEl.querySelector('.output-header') as HTMLElement;
        if (header) {
          resetHeaderHighlight(header);
        }
      }
    });
    // SummarDebug.log(1, 'All output header highlights cleared');
  }



  /**
   * Clean up old conversation files from the conversations directory.
   * Deletes files older than the specified number of minutes based on their filename timestamps.
   * @param minutes Number of minutes - files older than this will be deleted (default: from settings)
   * @returns Object containing deletion count and any errors encountered
   */
  async cleanupOldConversationFiles(minutes: number = -1): Promise<{ deletedCount: number, errors: string[] }> {
    // Use settings value if default parameter is used
    if (minutes === -1) {
      minutes = this.context.plugin.settingsv2.conversation.cleanupRetentionMinutes;
    }
    
    SummarDebug.log(1, `cleanupOldConversationFiles called with minutes=${minutes}`);

    const errors: string[] = [];
    let deletedCount = 0;
    
    try {
      const conversationsDir = normalizePath(`${this.context.plugin.PLUGIN_DIR}/conversations`);
      SummarDebug.log(1, `Checking conversations directory: ${conversationsDir}`);
      
      // Check if conversations directory exists
      const dirExists = await this.context.plugin.app.vault.adapter.exists(conversationsDir);
      if (!dirExists) {
        SummarDebug.log(1, `Conversations directory does not exist`);
        return { deletedCount: 0, errors: ['Conversations directory does not exist'] };
      }

      // Get list of files in conversations directory
      const files = await this.context.plugin.app.vault.adapter.list(conversationsDir);
      SummarDebug.log(1, `Raw files list:`, files);
      SummarDebug.log(1, `Files array:`, files.files);
      
      // Extract filenames from full paths and filter
      const conversationFiles = files.files
        .map(fullPath => {
          // Extract filename from full path: .obsidian/plugins/summar/conversations/filename.json -> filename.json
          const filename = fullPath.split('/').pop() || '';
          return { fullPath, filename };
        })
        .filter(({ filename }) => 
          filename.startsWith('summar-conversations-') && filename.endsWith('.json')
        );

      SummarDebug.log(1, `Found ${conversationFiles.length} conversation files: ${conversationFiles.map(f => f.filename).join(', ')}`);

      if (conversationFiles.length === 0) {
        SummarDebug.log(1, `No conversation files found, checking filter logic...`);
        files.files.forEach((file, index) => {
          const filename = file.split('/').pop() || '';
          const startsWithCheck = filename.startsWith('summar-conversations-');
          const endsWithCheck = filename.endsWith('.json');
          SummarDebug.log(1, `File ${index}: "${file}" -> filename: "${filename}" - starts with: ${startsWithCheck}, ends with: ${endsWithCheck}`);
        });
        return { deletedCount: 0, errors: [] };
      }

      // Calculate cutoff time (current time - minutes)
      const cutoffTime = new Date(Date.now() - (minutes * 60 * 1000));
      SummarDebug.log(1, `Cutoff time: ${cutoffTime.toISOString()} (${minutes} minutes ago)`);
      
      // Process each file
      for (const { fullPath, filename } of conversationFiles) {
        try {
          // Extract timestamp from filename: summar-conversations-YYYYMMDD-HHMMSS.json
          const timestampMatch = filename.match(/summar-conversations-(\d{8})-(\d{6})\.json$/);
          if (!timestampMatch) {
            SummarDebug.log(1, `Skipping file with invalid format: ${filename}`);
            continue; // Skip files that don't match expected format
          }

          const [, dateStr, timeStr] = timestampMatch;
          
          // Parse date and time: YYYYMMDD-HHMMSS
          const year = parseInt(dateStr.substring(0, 4));
          const month = parseInt(dateStr.substring(4, 6)) - 1; // Month is 0-indexed
          const day = parseInt(dateStr.substring(6, 8));
          const hour = parseInt(timeStr.substring(0, 2));
          const minute = parseInt(timeStr.substring(2, 4));
          const second = parseInt(timeStr.substring(4, 6));

          const fileTime = new Date(year, month, day, hour, minute, second);
          SummarDebug.log(1, `File ${filename}: timestamp=${fileTime.toISOString()}`);
          
          // Check if file is older than cutoff time
          if (fileTime < cutoffTime) {
            const filePath = normalizePath(`${conversationsDir}/${filename}`);
            await this.context.plugin.app.vault.adapter.remove(filePath);
            deletedCount++;
            SummarDebug.log(1, `Deleted old conversation file: ${filename} (${fileTime.toISOString()})`);
          } else {
            SummarDebug.log(1, `Keeping recent file: ${filename} (${fileTime.toISOString()})`);
          }
        } catch (fileError) {
          const errorMsg = `Failed to process file ${filename}: ${fileError instanceof Error ? fileError.message : String(fileError)}`;
          errors.push(errorMsg);
          SummarDebug.error(1, errorMsg);
        }
      }

    } catch (error) {
      const errorMsg = `Failed to cleanup conversation files: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      SummarDebug.error(1, errorMsg);
    }

    SummarDebug.log(1, `Cleanup completed: ${deletedCount} files deleted, ${errors.length} errors`);
    return { deletedCount, errors };
  }

  /**
   * Serialize current result records into a JSON payload and write to plugin directory.
   * Returns the written file path.
   */
  async saveOutputItemsToPluginDir(): Promise<string> {
    SummarDebug.log(1, `saveOutputItemsToPluginDir called`);
    await this.cleanupOldConversationFiles();

    const outputItems: any[] = [];
    let skippedCount = 0;
    this.context.outputRecords.forEach((rec) => {
      // Skip items with empty conversations array
      if (!Array.isArray(rec.conversations) || rec.conversations.length === 0) {
        skippedCount++;
        SummarDebug.log(1, `Skipping outputItem with key "${rec.key}" - empty conversations array`);
        return;
      }

      outputItems.push({
        key: rec.key ?? "",
        label: rec.label ?? "",
        noteName: rec.noteName ?? "",
        conversations: rec.conversations,
        // result field removed - data is now only in conversations
        // statId: rec.statId ?? "",
      });
    });

    SummarDebug.log(1, `Preparing to save ${outputItems.length} output items (skipped ${skippedCount} items with empty conversations)`);

    // outputItems가 비어있으면 저장하지 않고 반환
    if (outputItems.length === 0) {
      SummarDebug.log(1, `No output items to save - all items were skipped due to empty conversations`);
      return ""; // 빈 문자열 반환하여 저장하지 않았음을 표시
    }

    const payload = { outputItems };

    // 저장할 파일 경로 결정: originalImportFilename이 있으면 해당 파일명 사용, 없으면 새 타임스탬프 파일명
    let targetPath: string;
    const conversationsDir = normalizePath(`${this.context.plugin.PLUGIN_DIR}/conversations`);
    
    if (this.originalImportFilename) {
      // 원본 import 파일명으로 덮어쓰기
      targetPath = normalizePath(`${conversationsDir}/${this.originalImportFilename}`);
      SummarDebug.log(1, `Using original import filename for save: ${this.originalImportFilename}`);
    } else {
      // 새로운 타임스탬프 파일명으로 저장
      const ts = new Date();
      const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, "0")}${String(ts.getDate()).padStart(2, "0")}-${String(ts.getHours()).padStart(2, "0")}${String(ts.getMinutes()).padStart(2, "0")}${String(ts.getSeconds()).padStart(2, "0")}`;
      targetPath = normalizePath(`${conversationsDir}/summar-conversations-${stamp}.json`);
      SummarDebug.log(1, `Creating new timestamped file: summar-conversations-${stamp}.json`);
    }
    
    SummarDebug.log(1, `Target file path: ${targetPath}`);
    
    try {
      // conversations 디렉토리만 생성 (파일명이 아닌 디렉토리)
      const exists = await this.context.plugin.app.vault.adapter.exists(conversationsDir);
      if (!exists) {
        await this.context.plugin.app.vault.createFolder(conversationsDir);
        SummarDebug.log(1, "Directory created:", conversationsDir);
      } else {
        SummarDebug.log(1, "Directory already exists:", conversationsDir);
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
    SummarDebug.log(1, `Writing JSON file with ${JSON.stringify(payload).length} characters`);
    await this.context.plugin.app.vault.adapter.write(targetPath, JSON.stringify(payload, null, 2));
    SummarDebug.log(1, `Successfully saved conversation file: ${targetPath}`);
    return targetPath;
  }

  private scheduleRender(key: string): void {
    // SummarDebug.log(1, `scheduleRender called for key: ${key}`);
    // 기존 타이머가 있으면 취소
    const prev = this.renderTimers.get(key);
    if (prev) {
      clearTimeout(prev);
      this.context.timeoutRefs.delete(prev);
    }
    const timer = setTimeout(() => {
      try {
        // SummarDebug.log(1, `scheduleRender timer executing for key: ${key}`);
        const outputItem = this.context.outputRecords.get(key)?.itemEl || null;
        if (!outputItem) {
          // SummarDebug.log(1, `scheduleRender - no outputItem found for key: ${key}`);
          return;
        }
        const outputTextEl = outputItem.querySelector('.output-text') as HTMLDivElement | null;
        if (!outputTextEl) {
          // SummarDebug.log(1, `scheduleRender - no outputTextEl found for key: ${key}`);
          return;
        }
        const raw = this.getOutput(key);
        // SummarDebug.log(1, `scheduleRender - raw text length: ${raw.length} for key: ${key}`);
        const rendered = this.context.markdownRenderer.render(raw);
        const cleaned = this.cleanupMarkdownOutput(rendered);
        const enhanced = this.enhanceCodeBlocks(cleaned);
        outputTextEl.innerHTML = enhanced;
        // SummarDebug.log(1, `scheduleRender - innerHTML set for key: ${key}`);
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

  getNoteContent(key: string): string {
    const rec = this.context.outputRecords.get(key);
    if (!rec || !Array.isArray(rec.conversations)) {
      return '';
    }

    for (let i = rec.conversations.length - 1; i >= 0; i--) {
      const conv = rec.conversations[i];
      if (!conv) continue;
      const { role, type, text } = conv as { role?: string; type?: string; text?: string };
      if (role === 'assistant' && (type === SummarAIParamType.OUTPUT || type === SummarAIParamType.NOTESYNC || type === 'output' || type === 'notesync')) {
        return text || '';
      }
    }

    return '';    
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
    const buttons = createOutputHeaderButtons(key, this.context);

    // Pick an icon by label; callers could be updated to pass explicit icon if desired.
    const icon = getDefaultLabelIcon(label);
    const rec = this.ensureRecord(key);
    rec.label = label;
    return createOutputHeader(label, buttons, this.context, { icon });
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
    // SummarDebug.log(1, `setOutput called - key: ${key}, textLength: ${text.length}, isFinal: ${isFinal}`);
    const rec = this.ensureRecord(key);
    
    if (isFinal) {
      // Final result: add to conversations as 'assistant' message
      rec.addFinalResult(text);
      // SummarDebug.log(1, `setOutput() - added final result to conversations, isFinal=${isFinal}`);
    } else {
      // Intermediate result: set as temporary result
      rec.setTempResult(text);
      // SummarDebug.log(1, `setOutput() - set temporary result, isFinal=${isFinal}`);
    }
    
    // 결과 확인
    const resultAfter = rec.result;
    // SummarDebug.log(1, `setOutput completed - result length: ${resultAfter?.length || 0}`);
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

  enableOutputItemButtons(outputItem: HTMLDivElement, buttons: string[] = [
    'new-note-button',
    'upload-output-to-wiki-button', 
    'upload-output-to-slack-button',
    'copy-output-button',
    'reply-output-button'
  ]): void {
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
      // SummarDebug.log(1, `applyFoldToOutputItem: Set output-text display to ${fold ? 'none' : 'block'}`);
    }

    // conversation-item 요소들도 함께 숨기거나 보여주기
    // outputItem 내부의 모든 conversation-item 요소를 직접 자식으로 찾기
    const conversationItems = outputItem.querySelectorAll('.conversation-item') as NodeListOf<HTMLDivElement>;
    // SummarDebug.log(1, `applyFoldToOutputItem: Found ${conversationItems.length} conversation items, fold=${fold}`);
    
    conversationItems.forEach((conversationItem, index) => {
      // 추가 안전장치: conversation-item이 실제로 현재 outputItem의 직접 자식인지 확인
      if (conversationItem.parentElement === outputItem) {
        // SummarDebug.log(1, `applyFoldToOutputItem: Setting conversation item ${index} display to ${fold ? 'none' : 'block'}`);
        
        // 강제로 스타일 적용
        conversationItem.style.setProperty('display', fold ? 'none' : 'block', 'important');
        conversationItem.style.setProperty('visibility', fold ? 'hidden' : 'visible', 'important');
        
        // 적용 후 실제 스타일 확인
        const computedStyle = window.getComputedStyle(conversationItem);
        // SummarDebug.log(1, `applyFoldToOutputItem: Conversation item ${index} actual display: ${computedStyle.display}, visibility: ${computedStyle.visibility}`);
      } else {
        // SummarDebug.log(1, `applyFoldToOutputItem: Conversation item ${index} is not a direct child of outputItem`);
      }
    });
  }
}
