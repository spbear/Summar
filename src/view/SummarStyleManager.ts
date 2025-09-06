import { ISummarStyleManager } from "./SummarViewTypes";

export class SummarStyleManager implements ISummarStyleManager {
  private static readonly STYLE_ID = 'summar-view-styles';

  injectStyles(): void {
    // 기존 스타일 태그 확인 및 제거 (완전한 중복 방지)
    this.removeStyles();
    
    const style = document.createElement('style');
    style.id = SummarStyleManager.STYLE_ID;
    style.textContent = this.getStyleContent();
    document.head.appendChild(style);
  }

  removeStyles(): void {
    const existingStyle = document.getElementById(SummarStyleManager.STYLE_ID);
    if (existingStyle) {
      existingStyle.remove();
    }
  }

  private getStyleContent(): string {
    return `
      .output-text {
        -webkit-touch-callout: text;
        -webkit-user-select: text;
        -khtml-user-select: text;
        -moz-user-select: text;
        -ms-user-select: text;
        user-select: text;
        /* 모바일 터치 동작 개선 */
        -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
        touch-action: manipulation;
        cursor: text;
        line-height: 1.6;
        word-wrap: break-word;
        white-space: pre-wrap;
        overflow-wrap: break-word;
        hyphens: auto;
      }
      .output-text > *:first-child {
        margin-top: 0 !important;
        padding-top: 0 !important;
      }
      .output-text > *:last-child {
        margin-bottom: 0 !important;
        padding-bottom: 0 !important;
      }
      .output-text p {
        margin-top: 0 !important;
        margin-bottom: 0 !important;
      }
      .output-text p:first-child {
        margin-top: 0 !important;
      }
      .output-text p:last-child {
        margin-bottom: 0 !important;
      }
      .output-text::selection {
        background-color: var(--text-selection) !important;
        color: var(--text-on-accent) !important;
      }
      .output-text::-moz-selection {
        background-color: var(--text-selection) !important;
        color: var(--text-on-accent) !important;
      }
      .output-text * {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
      }
      
      /* Sticky header 스타일 - outputContainer 위쪽 별도 레이어 */
      .sticky-header-container {
        position: absolute !important;
        z-index: 10000 !important;
        background-color: var(--background-primary) !important;
        border: 1px solid var(--background-modifier-border) !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2) !important;
        display: none !important;
        border-radius: 0px !important;
        padding: 0px !important;
        margin: 0 !important;
        pointer-events: auto !important;
      }
      
      .sticky-header-container.visible {
        display: block;
      }
      
      .sticky-header-container .output-header {
        border: none !important;
        background-color: var(--background-primary) !important;
        margin: 0 !important;
      }
    `;
  }
}
