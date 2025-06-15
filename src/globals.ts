import { Notice, requestUrl, Hotkey, Modifier, RequestUrlParam, RequestUrlResponsePromise } from "obsidian";
import * as os from 'os';
import { Device } from '@capacitor/device';

import SummarPlugin from "./main";
import { PluginSettings } from "./types";

// SWIFT_SCRIPT_TEMPLATE 삭제됨. 이제 외부 Swift 파일을 사용하세요.

export class SummarViewContainer {
   plugin: SummarPlugin;

  constructor(plugin: SummarPlugin) {
    this.plugin = plugin;
  }

  /**
   * Updates the value of a result container.
   * @param resultContainer The container object to update.
   * @param message The message to set as the value.
   */
  updateResultText(message: string): void {
      this.plugin.resultContainer.value = message;
  }

  appendResultText(message: string): void {
      this.plugin.resultContainer.value += message;
  }

  enableNewNote(enabled: boolean, newNotePath?: string) {
    if (this.plugin.newNoteButton) {
      this.plugin.newNoteButton.disabled = !enabled;
      this.plugin.newNoteButton.classList.toggle("disabled", !enabled);
    }

    if (this.plugin.newNoteLabel) {
      this.plugin.newNoteLabel.classList.toggle("disabled", !enabled);
    }

    if (enabled) {
      const now = new Date();
      const formattedDate = now.getFullYear().toString().slice(2) +
        String(now.getMonth() + 1).padStart(2, "0") +
        now.getDate().toString().padStart(2, "0") + "-" +
        now.getHours().toString().padStart(2, "0") +
        now.getMinutes().toString().padStart(2, "0");

      this.plugin.newNoteName = newNotePath ? newNotePath : formattedDate;
      if (!this.plugin.newNoteName.includes(".md")) {
        this.plugin.newNoteName += ".md";
      }
    } else {
      this.plugin.newNoteName = "";
    }
  } 
}

export async function fetchOpenai(plugin: SummarPlugin, openaiApiKey: string, bodyContent: string): Promise<any> {
  try {
    SummarDebug.log(1, `openaiApiKey: ${openaiApiKey}`);
    SummarDebug.log(2, `bodyContent: ${bodyContent}`);

    // 엔드포인트 설정 (비어있으면 기본값)
    const endpoint = plugin.settings.openaiApiEndpoint?.trim() || "https://api.openai.com";
    const url = `${endpoint.replace(/\/$/, "")}/v1/chat/completions`;

    const response = await SummarRequestUrl(plugin, {
      url: url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`
      },
      body: bodyContent,
    });
    return response;
  } catch (error) {
    SummarDebug.error(1, "Error fetching data from OpenAI API:", error);
    throw error; // Re-throw the error for higher-level handling
  }
}

export async function fetchGemini(plugin: SummarPlugin, geminiModel: string, geminiApiKey: string, bodyContent: string): Promise<any> {
  try {
    SummarDebug.log(1, `geminiApiKey: ${geminiApiKey}`);
    SummarDebug.log(2, `bodyContent: ${bodyContent}`);

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;

    const response = await SummarRequestUrl(plugin, {
      url: API_URL,
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: bodyContent,
    });
    
    return response;
  } catch (error) {
    SummarDebug.error(1, "Error fetching data from Gemini API:", error);
    throw error; // Re-throw the error for higher-level handling
  }
}

export class SummarDebug {
  private static debugLevel: number = 0;

  static initialize(debugLevel: number): void {
    this.debugLevel = debugLevel;
  }

  static Notice(debugLevel: number, msg: string | DocumentFragment, duration?: number): void {
    if (this.debugLevel >= debugLevel)
      new Notice(msg, duration);
  }
  static log(debugLevel: number, message?: any, ...optionalParams: any[]): void {
    if (this.debugLevel >= debugLevel)
      console.log(message, ...optionalParams);
  }

  static error(debugLevel: number, message?: any, ...optionalParams: any[]): void {
    if (this.debugLevel >= debugLevel)
      console.error(message, ...optionalParams);
  }
  static level(): number {
    return this.debugLevel;
  }
}

export function SummarRequestUrl(plugin: SummarPlugin, request: RequestUrlParam | string): RequestUrlResponsePromise {
  let requestParam: RequestUrlParam;
  
  if (typeof request === 'string') {
    // request가 문자열이면 객체로 변환
    requestParam = { url: request, headers: {}, method: "GET", throw: true }; 
  } else {
    // request가 객체이면 그대로 사용
    requestParam = request;
    // 기존 헤더가 없으면 빈 객체로 초기화
    if (!requestParam.headers) {
      requestParam.headers = {};
    }
  }

  // User-Agent 헤더 추가
  requestParam.headers = { ...requestParam.headers, "user-agent": `Obsidian-Summar/${plugin.manifest.version}` };


  
  // curl 디버깅 로그 출력
  let curlDebug = `curl -X ${requestParam.method} "${requestParam.url}" \\`;
  for (const [key, value] of Object.entries(requestParam.headers)) {
    curlDebug += `\n-H "${key}: ${value}" \\`;
  }
  if (requestParam.body) {
    if (typeof requestParam.body === "string") {
      curlDebug += `\n-d '${requestParam.body}' \\`;
    } else if (requestParam.body instanceof ArrayBuffer) {
      const byteArray = new Uint8Array(requestParam.body);
      const base64String = btoa(String.fromCharCode(...byteArray));
      curlDebug += `\n--data-binary '${base64String}' \\`;
    }
  }
  curlDebug += `\n--write-out "\\n\\n[HTTP Response Code]: %{http_code}\\n" \\`;
  curlDebug += `\n--silent \\`;
  curlDebug += `\n--show-error`;
  SummarDebug.log(3, curlDebug);

  return requestUrl(requestParam); // 수정된 객체로 requestUrl 호출
}

export function extractDomain(url: string): string | null {
  // URL에서 도메인을 추출하는 정규식
  const domainPattern = /^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i;
  const match = url.match(domainPattern);
  return match ? match[1] : null;
}

export function containsDomain(text: string, domain: string): boolean {
  // 정규식을 사용해 특정 도메인이 포함되어 있는지 확인
  const domainPattern = new RegExp(`(?:https?:\\/\\/)?(?:www\\.)?${domain.replace('.', '\\.')}`, 'i');
  return domainPattern.test(text);
}

export function parseHotkey(hotkeyString: string): Hotkey | undefined{
  if (!hotkeyString || hotkeyString.length===0) return undefined;
  const parts = hotkeyString.split('+').map(part => part.trim().toLowerCase());
  const key = parts.pop() || '';  // 마지막 부분은 실제 키

  const modifiers: Modifier[] = parts.map(part => {
    switch (part) {
      case 'ctrl': return 'Mod';
      case 'shift': return 'Shift';
      case 'alt': return 'Alt';
      case 'cmd': return 'Meta';
      default: return '' as Modifier;  // 빈 문자열을 Modifier로 캐스팅
    }
  }).filter(Boolean) as Modifier[];  // 타입 필터링

  return { modifiers, key };
}

async function getDeviceName(): Promise<string> {
  // 데스크탑 환경인 경우
  if (os && os.hostname) {
    SummarDebug.log(1, `desktop: ${os.hostname()}`);
    return os.hostname();
  }

  // 모바일(Android, iOS) 환경인 경우
  try {
      const info = await Device.getInfo();
      SummarDebug.log(1, `mobile: ${info.name}`);
      return info.name || "Unknown Device";
  } catch (error) {
      SummarDebug.error(1, 'Failed to get device name:', error);
      return "Unknown Device";
  }
}

function replaceAllSpecialChars(input: string): string {
  // 알파벳, 숫자를 제외한 모든 문자를 '_'로 변환
  const encodedInput = encodeURIComponent(input);
  const allSpecialCharsRegex = /[^a-zA-Z0-9]/g;
  return encodedInput.replace(allSpecialCharsRegex, '_');
}

// 디바이스 ID 로드 또는 생성
export async function getDeviceId(plugin: any): Promise<string> {
  const deviceName = await getDeviceName();

  const deviceId = `selectedDeviceId_${replaceAllSpecialChars(deviceName)}`;
  SummarDebug.log(1, `deviceId: ${deviceId}`);
  return deviceId;
}

// 특수문자 제거 및 안전한 키 생성 함수
export function sanitizeLabel(label: string): string {
  return label.replace(/[ .,+'"']/g, '_').toLowerCase();
}

// 저장된 라벨을 기반으로 deviceId를 반환하는 함수
export async function getDeviceIdFromLabel(savedLabel: string): Promise<string | null> {
  try {
      // 마이크 권한 요청 및 초기화
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());

      // 초기화 지연 (Android 환경 안정화)
      await new Promise(resolve => setTimeout(resolve, 500));

      // 장치 목록 가져오기
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter(device => device.kind === 'audioinput');

      // 저장된 라벨을 정규화
      const normalizedSavedLabel = sanitizeLabel(savedLabel);

      // 라벨 비교를 통해 일치하는 deviceId 찾기
      for (const device of audioDevices) {
          const deviceLabel = device.label || "Unknown Device";
          const normalizedDeviceLabel = sanitizeLabel(deviceLabel);

          if (normalizedDeviceLabel === normalizedSavedLabel) {
              return device.deviceId;
          }
      }

      // 일치하는 장치가 없는 경우
      // console.warn("No matching device found for label:", savedLabel);
      SummarDebug.log(1,`No matching device found for label: ${savedLabel}`);
      return null;

  } catch (error) {
      SummarDebug.error(1, "Error while retrieving deviceId from label:", error);
      return null;
  }
}


// Function to find the next available filename with postfix
export function getAvailableFilePath(basePath: string, suffix: string, plugin: SummarPlugin): string  {
  let index = 1;
  let currentPath = `${basePath}${suffix}`;
  while (plugin.app.vault.getAbstractFileByPath(currentPath)) {
    currentPath = `${basePath} (${index})${suffix}`;
    index++;
  }
  return currentPath;
}

export async function showSettingsTab(plugin: SummarPlugin, tabname: string) {
  // 설정 창 열기
  (plugin.app as any).commands.executeCommandById("app:open-settings");

  // Shadow DOM까지 모두 탐색하는 재귀 함수
  const deepQuerySelectorAll = (root: ParentNode, selector: string): HTMLElement[] => {
    const elements = Array.from(root.querySelectorAll(selector)) as HTMLElement[];
    const shadowHosts = Array.from(root.querySelectorAll('*')).filter(el => (el as HTMLElement).shadowRoot) as HTMLElement[];

    shadowHosts.forEach(shadowHost => {
      if (shadowHost.shadowRoot) {
        elements.push(...deepQuerySelectorAll(shadowHost.shadowRoot, selector));
      }
    });

    return elements;
  };

  // Summar 설정창이 열릴 때까지 감시하는 함수
  const waitForSummarTab = () => {
    const settingsContainer = document.querySelector('.mod-settings');
    if (settingsContainer) {
      // SummarDebug.log(3, "설정창 감지 완료");

      // 현재 선택된 탭 확인
      const activeTab = settingsContainer.querySelector('.vertical-tab-nav-item.is-active') as HTMLElement;
      if (activeTab) {
        // SummarDebug.log(3, "현재 선택된 탭:", activeTab.innerText);
      }

      // Summar 탭 찾기
      const navLinks = deepQuerySelectorAll(settingsContainer, '.vertical-tab-nav-item');
      let summarTabClicked = false;

      navLinks.forEach((link) => {
        const linkEl = link as HTMLElement;
        // SummarDebug.log(3, "탭 이름:", linkEl.innerText);

        if (linkEl.innerText.includes("Summar")) {
          // SummarDebug.log(3, "Summar 설정창 활성화 시도");

          // Summar 탭 클릭
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          linkEl.dispatchEvent(clickEvent);

          summarTabClicked = true;
        }
      });

      // Summar 설정창이 선택되지 않으면 계속 감시
      if (!summarTabClicked) {
        // SummarDebug.log(3, "Summar 설정창이 즉시 열리지 않음, 다시 감지...");
        requestAnimationFrame(waitForSummarTab);
      } else {
        // SummarDebug.log(3, "Summar 설정창 클릭됨, schedule-tab 감지 시작");
        plugin.summarSettingTab.activateTab(tabname);
      }
    } else {
      // SummarDebug.log(3, "설정창이 아직 로드되지 않음, 다시 확인...");
      requestAnimationFrame(waitForSummarTab);
    }
  };

  // 설정창이 완전히 열릴 때까지 감시 시작
  requestAnimationFrame(waitForSummarTab);
}

export class SummarTooltip {
  private plugin: SummarPlugin;  
  private tooltipEl: HTMLElement | null = null;
  private showTimeout: number | null = null;

  constructor(plugin: SummarPlugin) {
    this.plugin = plugin;
    this.plugin.register(() => this.cleanup());
  }

  attach(el: HTMLElement, content: string, delay = 300) {
    el.addEventListener('mouseenter', () => {
      this.showTimeout = window.setTimeout(() => {
        this.showTooltip(el, content);
      }, delay);
    });

    el.addEventListener('mouseleave', () => {
      this.hideTooltip();
    });

    el.addEventListener('blur', () => {
      this.hideTooltip();
    });

    el.addEventListener('focus', () => {
      this.showTooltip(el, content);
    });
  }

  private showTooltip(anchor: HTMLElement, content: string) {
    if (this.tooltipEl) return;

    const tooltip = createDiv('custom-tooltip');
    tooltip.setText(content);

    document.body.appendChild(tooltip);
    this.tooltipEl = tooltip;
  
    requestAnimationFrame(() => {
      const styles = getComputedStyle(document.body);
  
      let bgColor = styles.getPropertyValue('--tooltip-bg').trim();
      let textColor = styles.getPropertyValue('--tooltip-text').trim();

      if (bgColor === '' || bgColor === 'transparent' || /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)/.test(bgColor)) {
        bgColor = '#2e2e2e'; // 어두운 회색 계열 기본값
      }

      tooltip.setCssStyles({
        position: 'fixed',
        backgroundColor: bgColor,
        color: textColor || '#ffffff',
        padding: '6px 12px',
        borderRadius: '4px',
        fontSize: '12px',
        maxWidth: '300px',
        textAlign: 'left',
        whiteSpace: 'pre-wrap',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        zIndex: '9999',
        pointerEvents: 'none'
      });

      const rect = anchor.getBoundingClientRect();
      const tipRect = tooltip.getBoundingClientRect();

      tooltip.setCssStyles({
        top: `${rect.bottom + 5}px`,
        left: `${Math.max(5, rect.left + rect.width / 2 - tipRect.width / 2)}px`
      });
    });
  }

  private hideTooltip() {
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
      this.showTimeout = null;
    }
    if (this.tooltipEl) {
      this.tooltipEl.remove();
      this.tooltipEl = null;
    }
  }

  private cleanup() {
    this.hideTooltip();
  }
}