import { ISummarViewContext } from "./SummarViewTypes";
import { SummarDebug } from "../globals";

export interface MenuItemConfig {
  label: string;
  action: () => void;
}

export interface MenuOptions {
  zIndex?: number;
  context: ISummarViewContext;
}

/**
 * 공통 팝업 메뉴 유틸리티
 * output item과 sticky header에서 공통으로 사용
 */
export class SummarMenuUtils {
  
  /**
   * 팝업 메뉴를 생성하고 표시합니다
   * @param button 클릭된 버튼 요소
   * @param menuItems 메뉴 아이템 설정 배열
   * @param options 메뉴 옵션 (z-index, context 등)
   */
  static showPopupMenu(
    button: HTMLButtonElement, 
    menuItems: MenuItemConfig[], 
    options: MenuOptions
  ): void {
    const rect = button.getBoundingClientRect();
    const { zIndex = 1000, context } = options;
    
    // 기존 팝업 메뉴가 있다면 제거
    const existingMenu = document.querySelector('.item-popup-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    // 팝업 메뉴 생성 (임시로 화면 밖에 배치하여 크기 측정)
    const menu = document.createElement('div');
    menu.className = 'item-popup-menu';
    menu.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      background: var(--background-primary);
      border: 1px solid var(--background-modifier-border);
      border-radius: 5px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: ${zIndex};
      min-width: 150px;
      padding: 4px;
      visibility: hidden;
    `;

    // 메뉴 정리를 위한 AbortController 생성
    const menuAbortController = new AbortController();
    const signal = menuAbortController.signal;

    // 메뉴 정리 함수
    const cleanupMenu = () => {
      menu.remove();
      menuAbortController.abort();
    };

    // 메뉴 아이템들 생성
    menuItems.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.className = 'item-menu-item';
      menuItem.textContent = item.label;
      menuItem.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        border-radius: 3px;
        color: var(--text-normal);
        font-size: var(--font-ui-small);
      `;
      
      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.backgroundColor = 'var(--background-modifier-hover)';
      }, { signal });
      
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.backgroundColor = 'transparent';
      }, { signal });
      
      menuItem.addEventListener('click', () => {
        item.action();
        cleanupMenu();
      }, { signal });
      
      menu.appendChild(menuItem);
    });

    // 임시로 DOM에 추가하여 크기 측정
    document.body.appendChild(menu);
    const menuRect = menu.getBoundingClientRect();

    // 메뉴 위치 계산
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    // 기본적으로 버튼의 오른쪽 아래에 배치
    let menuTop = rect.bottom + 5;
    let menuLeft = rect.right - menuRect.width;

    // 화면 오른쪽을 벗어나는 경우 버튼 왼쪽으로 이동
    if (menuLeft < 0) {
      menuLeft = rect.left;
    }

    // 화면 하단을 벗어나는 경우 버튼 위쪽으로 이동
    if (menuTop + menuRect.height > viewportHeight) {
      menuTop = rect.top - menuRect.height - 5;
    }

    // 최종 위치 설정
    menu.style.cssText = `
      position: fixed;
      top: ${menuTop}px;
      left: ${menuLeft}px;
      background: var(--background-primary);
      border: 1px solid var(--background-modifier-border);
      border-radius: 5px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: ${zIndex};
      min-width: 150px;
      padding: 4px;
      visibility: visible;
    `;

    // 스크롤 시 메뉴 닫기를 위한 이벤트 리스너
    const closeMenuOnScroll = () => {
      cleanupMenu();
    };

    // 메뉴 외부 클릭 시 닫기
    const closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        cleanupMenu();
      }
    };
    
    // 스크롤 이벤트 리스너 추가 (AbortController로 관리)
    context.outputContainer.addEventListener('scroll', closeMenuOnScroll, { signal });
    
    // 약간의 지연 후 이벤트 리스너 추가 (현재 클릭 이벤트가 즉시 닫히는 것을 방지)
    const timeoutId = setTimeout(() => {
      // AbortController가 이미 abort되었는지 확인
      if (!signal.aborted) {
        document.addEventListener('click', closeMenu, { signal });
      }
    }, 100);
    
    // timeout도 정리될 수 있도록 추가
    context.timeoutRefs.add(timeoutId);
    
    // signal이 abort되면 timeout도 정리
    signal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      context.timeoutRefs.delete(timeoutId);
    });
  }

  /**
   * Reply 액션을 처리합니다
   * @param key 결과 아이템의 키
   * @param context 뷰 컨텍스트
   * @param isFromStickyHeader sticky header에서 호출되었는지 여부
   */
  static handleReply(key: string, context: ISummarViewContext, isFromStickyHeader: boolean = false): void {
    // ComposerManager를 통해 composer 표시 및 타겟 설정
    const composerManager = context.composerManager;
    if (composerManager && composerManager.showComposerContainer) {
      // Composer 표시
      composerManager.showComposerContainer();
      // 타겟 아이템 설정
      composerManager.setOutput(key);
      
      const source = isFromStickyHeader ? 'sticky header' : 'output item';
      SummarDebug.log(1, `Reply initiated from ${source} for output key: ${key}`);
    } else {
      SummarDebug.log(1, `ComposerManager not found, cannot initiate reply for key: ${key}`);
    }
  }

  /**
   * Delete 액션을 처리합니다
   * @param key 결과 아이템의 키
   * @param context 뷰 컨텍스트
   */
  static handleDeleteOutput(key: string, context: ISummarViewContext): void {
    const outputManager = (context as any).outputManager;
    if (outputManager && outputManager.deleteOutputItem) {
      outputManager.deleteOutputItem(key);
    }
  }

  /**
   * 표준 메뉴 아이템들을 생성합니다
   * @param key 결과 아이템의 키
   * @param context 뷰 컨텍스트
   * @param isFromStickyHeader sticky header에서 호출되었는지 여부
   * @returns 메뉴 아이템 설정 배열
   */
  static createStandardMenuItems(
    key: string, 
    context: ISummarViewContext, 
    isFromStickyHeader: boolean = false
  ): MenuItemConfig[] {
    return [
      // { 
      //   label: 'Reply', 
      //   action: () => this.handleReply(key, context, isFromStickyHeader) 
      // },
      { 
        label: 'Delete Output', 
        action: () => this.handleDeleteOutput(key, context) 
      }
    ];
  }
}
