import { setIcon } from 'obsidian';
import { ISummarViewContext, OutputHeaderHiddenButtonsState } from './SummarViewTypes';
import { SummarMenuUtils } from './SummarMenuUtils';

export type HeaderButtonsSet = {
  uploadWiki: HTMLElement;
  uploadSlack: HTMLElement;
  newNote: HTMLElement;
  reply: HTMLElement;
  toggle: HTMLElement;
  copy: HTMLElement;
  spacer: HTMLElement;
  menu: HTMLElement;
};

export type ComposerHeaderButtonsSet = {
  spacer: HTMLElement;
  clear: HTMLElement;
  close: HTMLElement;
};

export type LabelOptions = {
  icon?: string;       // lucide icon name
  iconColor?: string;  // optional color for the icon
  selectedModel?: string; // selected model for modelchip
};

export type HeaderHighlightOptions = {
  useImportant?: boolean;
};

function setStyleProperty(element: HTMLElement, property: string, value: string, useImportant: boolean): void {
  if (useImportant) {
    element.style.setProperty(property, value, 'important');
  } else {
    (element.style as any)[property.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
}

export function setHeaderHighlight(header: HTMLElement, options?: HeaderHighlightOptions): void {
  const useImportant = options?.useImportant ?? false;
  setStyleProperty(header, 'background-color', 'var(--background-modifier-hover)', useImportant);

  const textElements = header.querySelectorAll('.output-label-chip, .output-label-icon, .output-label-text, .data-label');
  textElements.forEach(element => setStyleProperty(element as HTMLElement, 'background-color', 'var(--background-primary)', useImportant));

  const buttons = header.querySelectorAll('button, .lucide-icon-button');
  buttons.forEach(button => setStyleProperty(button as HTMLElement, 'background-color', 'var(--background-primary)', useImportant));
}

export function clearHeaderHighlight(header: HTMLElement, options?: HeaderHighlightOptions): void {
  const useImportant = options?.useImportant ?? false;

  header.style.removeProperty('background-color');

  const textElements = header.querySelectorAll('.output-label-chip, .output-label-icon, .output-label-text, .data-label');
  textElements.forEach(element => setStyleProperty(element as HTMLElement, 'background-color', 'var(--background-modifier-hover)', useImportant));

  const buttons = header.querySelectorAll('button, .lucide-icon-button');
  buttons.forEach(button => setStyleProperty(button as HTMLElement, 'background-color', 'var(--background-modifier-hover)', useImportant));
}

function createIconButton(buttonId: string, ariaLabel: string, iconName: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'lucide-icon-button';
  button.setAttribute('button-id', buttonId);
  button.setAttribute('aria-label', ariaLabel);
  button.style.transform = 'scale(0.7)';
  button.style.transformOrigin = 'center';
  button.style.margin = '0';
  setIcon(button, iconName);
  return button;
}

export function createOutputHeaderButtons(key: string, context: ISummarViewContext): HeaderButtonsSet {
  const uploadWikiButton = createIconButton('upload-output-to-wiki-button', 'Upload this result to Confluence', 'file-up');
  uploadWikiButton.disabled = true;
  uploadWikiButton.style.display = 'none';

  const uploadSlackButton = createIconButton('upload-output-to-slack-button', 'Upload this result to Slack', 'hash');
  uploadSlackButton.disabled = true;
  uploadSlackButton.style.display = 'none';

  const newNoteButton = createIconButton('new-note-button', 'Create new note with this result', 'file-output');
  newNoteButton.disabled = true;
  newNoteButton.style.display = 'none';

  const replyButton = createIconButton('reply-output-button', 'reply', 'message-square-reply');
  replyButton.disabled = true;
  const canShowComposer = context.composerManager?.canShowComposer(200)?.canShow ?? false;
  replyButton.style.display = 'none';

  if (!canShowComposer) {
    replyButton.disabled = true;
  }

  const toggleButton = createIconButton('toggle-fold-button', 'Toggle fold/unfold this result', 'square-chevron-up');
  toggleButton.setAttribute('toggled', 'false');

  const copyButton = createIconButton('copy-output-button', 'Copy this result to clipboard', 'copy');
  copyButton.disabled = true;
  copyButton.style.display = 'none';

  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  spacer.style.minWidth = '8px';
  spacer.classList.add('spacer');

  const showMenuButton = createIconButton('show-menu-button', 'Show menu', 'menu');
  showMenuButton.setAttribute('data-key', key);

  return {
    uploadWiki: uploadWikiButton,
    uploadSlack: uploadSlackButton,
    newNote: newNoteButton,
    reply: replyButton,
    toggle: toggleButton,
    copy: copyButton,
    spacer,
    menu: showMenuButton,
  };
}

// Basic heuristic to suggest an icon by label.
export function getDefaultLabelIcon(label: string): string {
  const l = label.toLowerCase();
  if (/(pdf|doc|file)/.test(l)) return 'file-text';
  if (/(audio|voice|sound|mic|transcript|transtript)/.test(l)) return 'audio-lines';
  if (/(image|img|pic|png|jpg|jpeg)/.test(l)) return 'image';
  if (/(web|url|link|http|https)/.test(l)) return 'globe';
  if (/(note|memo)/.test(l)) return 'file';
  if (/(wiki|confluence)/.test(l)) return 'book';
  if (/(slack)/.test(l)) return 'hash';
  if (/(chat|composer|compose prompt)/.test(l)) return 'message-square-more';
  if (/(summary)/.test(l)) return 'clipboard-list';
  if (/(refinement)/.test(l)) return 'clipboard-check';
  if (/(custom)/.test(l)) return 'pocket-knife';
  
  return 'tag';
}

// Get a displayable model name from a model key
export function getModelDisplayText(modelKey: string): string {
  return modelKey;
  // 간단한 변환 규칙들
  if (modelKey.includes('gpt-4')) return 'GPT-4';
  if (modelKey.includes('gpt-5')) return 'GPT-5';  
  if (modelKey.includes('o1-mini')) return 'o1-mini';
  if (modelKey.includes('o3-mini')) return 'o3-mini';
  if (modelKey.includes('gemini-2.5-flash')) return 'Gemini Flash';
  if (modelKey.includes('gemini-2.0-flash')) return 'Gemini 2.0';
  if (modelKey.includes('gemini')) return 'Gemini';
  
  // 기본적으로는 원본 반환 (최대 12자로 제한)
  return modelKey.length > 12 ? modelKey.substring(0, 12) + '...' : modelKey;
}

// Show model selection dropdown
function showModelDropdown(chipElement: HTMLElement, plugin: any, onSelect: (model: string) => void): void {
  // Check if this specific model dropdown is already open
  const existingModelDropdown = document.querySelector('.model-dropdown[data-chip-id="' + chipElement.id + '"]');
  if (existingModelDropdown) {
    // If clicking the same button, close the menu
    existingModelDropdown.remove();
    // Reset chip hover state
    chipElement.style.backgroundColor = 'var(--interactive-normal)';
    chipElement.style.color = 'var(--text-muted)';
    return;
  }

  // Remove any existing Summar popup menus
  const existingMenus = document.querySelectorAll('.summar-popup-menu');
  existingMenus.forEach(menu => menu.remove());

  // Ensure chip has an ID for tracking
  if (!chipElement.id) {
    chipElement.id = 'model-chip-' + Math.random().toString(36).substr(2, 9);
  }

  // Get available models - pass plugin reference
  const availableModels = getAvailableModels(plugin);
  
  if (availableModels.length === 0) {
    return;
  }

  // Create dropdown
  const dropdown = document.createElement('div');
  dropdown.classList.add('model-dropdown', 'summar-popup-menu');
  dropdown.setAttribute('data-chip-id', chipElement.id);
  dropdown.style.position = 'absolute';
  dropdown.style.top = '100%';
  dropdown.style.left = '0';
  dropdown.style.backgroundColor = 'var(--background-primary)';
  dropdown.style.border = '1px solid var(--background-modifier-border)';
  dropdown.style.borderRadius = '6px';
  dropdown.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.15)';
  dropdown.style.zIndex = '1000';
  dropdown.style.minWidth = '200px';
  dropdown.style.maxHeight = '120px'; // 4 lines roughly
  dropdown.style.overflowY = 'auto';
  dropdown.style.padding = '4px';

  // Add model options
  availableModels.forEach(model => {
    const option = document.createElement('div');
    option.style.padding = '6px 8px';
    option.style.cursor = 'pointer';
    option.style.borderRadius = '3px';
    option.style.fontSize = '12px';
    option.style.color = 'var(--text-normal)';
    option.style.transition = 'background-color 0.1s ease';
    option.textContent = getModelDisplayText(model);
    
    option.addEventListener('mouseenter', () => {
      option.style.backgroundColor = 'var(--background-modifier-hover)';
    });
    
    option.addEventListener('mouseleave', () => {
      option.style.backgroundColor = 'transparent';
    });
    
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelect(model);
      dropdown.remove();
      
      // Reset chip hover state after selection
      chipElement.style.backgroundColor = 'var(--background-modifier-hover)';
      chipElement.style.color = 'var(--text-muted)';
    });
    
    dropdown.appendChild(option);
  });

  // Position dropdown using absolute positioning with boundary checks
  // 메뉴를 임시로 DOM에 추가하여 실제 크기 측정
  dropdown.style.position = 'fixed';
  dropdown.style.top = '-9999px';
  dropdown.style.left = '-9999px';
  dropdown.style.visibility = 'hidden';
  document.body.appendChild(dropdown);
  
  // chip의 위치를 기준으로 드롭다운 위치 계산
  const chipRect = chipElement.getBoundingClientRect();
  let top = chipRect.bottom + 5;
  let left = chipRect.left;
  
  // 화면 경계를 벗어나지 않도록 조정
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // 실제 메뉴 크기 측정
  const dropdownRect = dropdown.getBoundingClientRect();
  const menuWidth = dropdownRect.width;
  const menuHeight = dropdownRect.height;
  
  // 오른쪽 경계 체크
  if (left + menuWidth > viewportWidth) {
    left = viewportWidth - menuWidth - 10;
  }
  
  // 하단 경계 체크
  if (top + menuHeight > viewportHeight) {
    top = chipRect.top - menuHeight - 5; // chip 위쪽에 표시
  }
  
  // 최종 위치 설정
  dropdown.style.top = `${top}px`;
  dropdown.style.left = `${left}px`;
  dropdown.style.visibility = 'visible';

  // Close dropdown when clicking outside
  const closeDropdown = (e: Event) => {
    if (!dropdown.contains(e.target as Node) && !chipElement.contains(e.target as Node)) {
      dropdown.remove();
      // Reset chip hover state when dropdown closes
      chipElement.style.backgroundColor = 'var(--background-modifier-hover)';
      chipElement.style.color = 'var(--text-muted)';
      document.removeEventListener('click', closeDropdown);
    }
  };
  
  // Delay adding the listener to avoid immediate closure
  setTimeout(() => {
    document.addEventListener('click', closeDropdown);
  }, 0);
}

// Show label selection dropdown with New Prompt and open files
function showLabelDropdown(chipElement: HTMLElement, context: ISummarViewContext, onSelect: (action: string, file?: string) => void): void {
  // Check if this specific label dropdown is already open
  const existingLabelDropdown = document.querySelector('.label-dropdown[data-chip-id="' + chipElement.id + '"]');
  if (existingLabelDropdown) {
    // If clicking the same button, close the menu
    existingLabelDropdown.remove();
    // Reset chip hover state
    chipElement.style.backgroundColor = 'var(--interactive-normal)';
    chipElement.style.color = 'var(--text-muted)';
    return;
  }

  // Remove any existing Summar popup menus
  const existingMenus = document.querySelectorAll('.summar-popup-menu');
  existingMenus.forEach(menu => menu.remove());

  // Ensure chip has an ID for tracking
  if (!chipElement.id) {
    chipElement.id = 'label-chip-' + Math.random().toString(36).substr(2, 9);
  }

  // Create dropdown
  const dropdown = document.createElement('div');
  dropdown.classList.add('label-dropdown', 'summar-popup-menu');
  dropdown.setAttribute('data-chip-id', chipElement.id);
  dropdown.style.position = 'absolute';
  dropdown.style.top = '100%';
  dropdown.style.left = '0';
  dropdown.style.backgroundColor = 'var(--background-primary)';
  dropdown.style.border = '1px solid var(--background-modifier-border)';
  dropdown.style.borderRadius = '6px';
  dropdown.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.15)';
  dropdown.style.zIndex = '1000';
  dropdown.style.minWidth = '200px';
  dropdown.style.maxHeight = '200px';
  dropdown.style.overflowY = 'auto';
  dropdown.style.padding = '4px';

  // Add "New Prompt" option
  const newPromptOption = document.createElement('div');
  newPromptOption.style.padding = '6px 8px';
  newPromptOption.style.cursor = 'pointer';
  newPromptOption.style.borderRadius = '3px';
  newPromptOption.style.fontSize = '12px';
  newPromptOption.style.color = 'var(--text-normal)';
  newPromptOption.style.transition = 'background-color 0.1s ease';
  newPromptOption.style.display = 'flex';
  newPromptOption.style.alignItems = 'center';
  newPromptOption.style.gap = '6px';

  // Add icon for New Prompt
  const newPromptIcon = document.createElement('span');
  newPromptIcon.style.display = 'inline-flex';
  newPromptIcon.style.width = '14px';
  newPromptIcon.style.height = '14px';
  newPromptIcon.style.flexShrink = '0';
  setIcon(newPromptIcon, 'message-square-more');
  const newPromptSvg = newPromptIcon.querySelector('svg') as SVGElement | null;
  if (newPromptSvg) {
    newPromptSvg.style.width = '14px';
    newPromptSvg.style.height = '14px';
    newPromptSvg.style.strokeWidth = '2px';
  }
  newPromptOption.appendChild(newPromptIcon);

  const newPromptText = document.createElement('span');
  newPromptText.textContent = 'New Prompt';
  newPromptOption.appendChild(newPromptText);

  newPromptOption.addEventListener('mouseenter', () => {
    newPromptOption.style.backgroundColor = 'var(--background-modifier-hover)';
  });
  
  newPromptOption.addEventListener('mouseleave', () => {
    newPromptOption.style.backgroundColor = 'transparent';
  });
  
  newPromptOption.addEventListener('click', (e) => {
    e.stopPropagation();
    onSelect('new-prompt');
    dropdown.remove();
    
    // Reset chip hover state after selection
    chipElement.style.backgroundColor = 'var(--interactive-normal)';
    chipElement.style.color = 'var(--text-muted)';
  });
  
  dropdown.appendChild(newPromptOption);

  // Get open markdown files
  const openFiles = getOpenMarkdownFiles(context);
  
  if (openFiles.length > 0) {
    // Add separator
    const separator = document.createElement('div');
    separator.style.height = '1px';
    separator.style.backgroundColor = 'var(--background-modifier-border)';
    separator.style.margin = '4px 0';
    dropdown.appendChild(separator);

    // Add open file options
    openFiles.forEach(fileName => {
      const fileOption = document.createElement('div');
      fileOption.style.padding = '6px 8px';
      fileOption.style.cursor = 'pointer';
      fileOption.style.borderRadius = '3px';
      fileOption.style.fontSize = '12px';
      fileOption.style.color = 'var(--text-normal)';
      fileOption.style.transition = 'background-color 0.1s ease';
      fileOption.style.display = 'flex';
      fileOption.style.alignItems = 'center';
      fileOption.style.gap = '6px';

      // Add file icon
      const fileIcon = document.createElement('span');
      fileIcon.style.display = 'inline-flex';
      fileIcon.style.width = '14px';
      fileIcon.style.height = '14px';
      fileIcon.style.flexShrink = '0';
      setIcon(fileIcon, 'file-text');
      const fileSvg = fileIcon.querySelector('svg') as SVGElement | null;
      if (fileSvg) {
        fileSvg.style.width = '14px';
        fileSvg.style.height = '14px';
        fileSvg.style.strokeWidth = '2px';
      }
      fileOption.appendChild(fileIcon);

      const fileText = document.createElement('span');
      fileText.textContent = fileName;
      fileText.style.overflow = 'hidden';
      fileText.style.textOverflow = 'ellipsis';
      fileText.style.whiteSpace = 'nowrap';
      fileOption.appendChild(fileText);

      fileOption.addEventListener('mouseenter', () => {
        fileOption.style.backgroundColor = 'var(--background-modifier-hover)';
      });
      
      fileOption.addEventListener('mouseleave', () => {
        fileOption.style.backgroundColor = 'transparent';
      });
      
      fileOption.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelect('open-file', fileName);
        dropdown.remove();
        
        // Reset chip hover state after selection
        chipElement.style.backgroundColor = 'var(--interactive-normal)';
        chipElement.style.color = 'var(--text-muted)';
      });
      
      dropdown.appendChild(fileOption);
    });
  }

  // Position dropdown using absolute positioning with boundary checks
  // 메뉴를 임시로 DOM에 추가하여 실제 크기 측정
  dropdown.style.position = 'fixed';
  dropdown.style.top = '-9999px';
  dropdown.style.left = '-9999px';
  dropdown.style.visibility = 'hidden';
  document.body.appendChild(dropdown);
  
  // chip의 위치를 기준으로 드롭다운 위치 계산
  const chipRect = chipElement.getBoundingClientRect();
  let top = chipRect.bottom + 5;
  let left = chipRect.left;
  
  // 화면 경계를 벗어나지 않도록 조정
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // 실제 메뉴 크기 측정
  const dropdownRect = dropdown.getBoundingClientRect();
  const menuWidth = dropdownRect.width;
  const menuHeight = dropdownRect.height;
  
  // 오른쪽 경계 체크
  if (left + menuWidth > viewportWidth) {
    left = viewportWidth - menuWidth - 10;
  }
  
  // 하단 경계 체크
  if (top + menuHeight > viewportHeight) {
    top = chipRect.top - menuHeight - 5; // chip 위쪽에 표시
  }
  
  // 최종 위치 설정
  dropdown.style.top = `${top}px`;
  dropdown.style.left = `${left}px`;
  dropdown.style.visibility = 'visible';

  // Close dropdown when clicking outside
  const closeDropdown = (e: Event) => {
    if (!dropdown.contains(e.target as Node) && !chipElement.contains(e.target as Node)) {
      dropdown.remove();
      // Reset chip hover state when dropdown closes
      chipElement.style.backgroundColor = 'var(--interactive-normal)';
      chipElement.style.color = 'var(--text-muted)';
      document.removeEventListener('click', closeDropdown);
    }
  };
  
  // Delay adding the listener to avoid immediate closure
  setTimeout(() => {
    document.addEventListener('click', closeDropdown);
  }, 0);
}

// Get open markdown files
function getOpenMarkdownFiles(context: ISummarViewContext): string[] {
  const openFiles: string[] = [];
  
  try {
    // Method 1: Get all markdown leaves
    const markdownLeaves = context.plugin.app.workspace.getLeavesOfType('markdown');
    // console.log('Found markdown leaves:', markdownLeaves.length);
    
    markdownLeaves.forEach((leaf, index) => {
      // console.log(`Leaf ${index}:`, leaf);
      if (leaf.view) {
        // console.log(`Leaf ${index} view type:`, leaf.view.getViewType());
        
        // Try multiple ways to get the file
        let file = null;
        
        // Method A: Direct file property
        if ((leaf.view as any).file) {
          file = (leaf.view as any).file;
          // console.log(`Leaf ${index} file from direct property:`, file?.basename);
        }
        
        // Method B: Through getState if available
        if (!file && typeof (leaf.view as any).getState === 'function') {
          try {
            const state = (leaf.view as any).getState();
            if (state && state.file) {
              const abstractFile = context.plugin.app.vault.getAbstractFileByPath(state.file);
              if (abstractFile && 'basename' in abstractFile) {
                file = abstractFile;
                // console.log(`Leaf ${index} file from state:`, (file as any).basename);
              }
            }
          } catch (e) {
            // console.log(`Leaf ${index} getState failed:`, e);
          }
        }
        
        // Method C: Through app.workspace if it's the active leaf
        if (!file && leaf === context.plugin.app.workspace.activeLeaf) {
          file = context.plugin.app.workspace.getActiveFile();
          // console.log(`Leaf ${index} file from activeFile:`, file?.basename);
        }
        
        // Method D: Check if it's a MarkdownView and use its properties
        if (!file && leaf.view.constructor.name === 'MarkdownView') {
          try {
            const markdownView = leaf.view as any;
            if (markdownView.data && markdownView.file) {
              file = markdownView.file;
              // console.log(`Leaf ${index} file from MarkdownView:`, file?.basename);
            }
          } catch (e) {
            // console.log(`Leaf ${index} MarkdownView access failed:`, e);
          }
        }
        
        if (file && (file as any).basename) {
          openFiles.push((file as any).basename);
          // console.log(`Added file: ${(file as any).basename}`);
        } else {
          // console.log(`Leaf ${index} - no file found or no basename`);
        }
      } else {
        // console.log(`Leaf ${index} has no view`);
      }
    });

    // Method 2: Also try getting all open files from vault
    const allFiles = context.plugin.app.vault.getAllLoadedFiles();
    const openTabs = context.plugin.app.workspace.getLeavesOfType('markdown');
    
    // console.log('All loaded files count:', allFiles.length);
    // console.log('Open tabs count:', openTabs.length);
    
    // Get files that are currently in tabs
    openTabs.forEach(leaf => {
      if (leaf.view) {
        // Try to get display text or title from the leaf
        const displayText = (leaf as any).getDisplayText?.() || '';
        const tabHeaderEl = (leaf as any).tabHeaderEl;
        const tabTitle = tabHeaderEl?.querySelector('.workspace-tab-header-inner-title')?.textContent || '';
        
        // console.log('Tab display text:', displayText);
        // console.log('Tab title:', tabTitle);
        
        if (displayText && !openFiles.includes(displayText)) {
          openFiles.push(displayText);
          // console.log('Added from display text:', displayText);
        }
        
        if (tabTitle && !openFiles.includes(tabTitle)) {
          openFiles.push(tabTitle);
          // console.log('Added from tab title:', tabTitle);
        }
      }
    });

  } catch (error) {
    // console.error('Error getting open markdown files:', error);
  }
  
  // Remove duplicates and sort
  const uniqueFiles = [...new Set(openFiles)].sort();
  // console.log('Final unique files:', uniqueFiles);
  return uniqueFiles;
}

// Get available models - use the plugin's getAllModelKeyValues method
function getAvailableModels(plugin?: any): string[] {
  try {
    // Use provided plugin reference first
    if (plugin && typeof plugin.getAllModelKeyValues === 'function') {
      const modelKeyValues = plugin.getAllModelKeyValues("customModel");
      const modelKeys = Object.keys(modelKeyValues);
      if (modelKeys.length > 0) {
        return modelKeys;
      }
    }
    
    // Try to get the plugin instance from the window as fallback
    const fallbackPlugin = (window as any).app?.plugins?.plugins?.summar;
    if (fallbackPlugin && typeof fallbackPlugin.getAllModelKeyValues === 'function') {
      const modelKeyValues = fallbackPlugin.getAllModelKeyValues("customModel");
      const modelKeys = Object.keys(modelKeyValues);
      if (modelKeys.length > 0) {
        return modelKeys;
      }
    }
  } catch (error) {
    console.error('Error getting models from plugin:', error);
  }
  
  // Fallback list if plugin method not available
  return [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gpt-4o',
    'gpt-4o-mini',
    'o1-mini',
    'o1-preview'
  ];
}

// Build a standardized output header: label + buttons in fixed order.
export function createOutputHeader(label: string, buttons: HeaderButtonsSet, context?: ISummarViewContext, options?: LabelOptions): HTMLDivElement {
  const outputHeader = document.createElement('div');
  outputHeader.className = 'output-header';
  outputHeader.style.width = '100%';
  outputHeader.style.display = 'flex';
  outputHeader.style.alignItems = 'center';
  outputHeader.style.gap = '0px';
  outputHeader.style.marginBottom = '0px';
  outputHeader.style.padding = '0px';
  outputHeader.style.border = '1px solid var(--background-modifier-border)';
  outputHeader.style.backgroundColor = 'var(--background-primary)';

  // Label
  const labelChip = document.createElement('div');
  labelChip.classList.add('output-label-chip');
  labelChip.style.display = 'inline-flex';
  labelChip.style.alignItems = 'center';
  labelChip.style.gap = '4px';
  labelChip.style.fontSize = '10px';
  labelChip.style.color = 'var(--text-muted)';
  labelChip.style.marginLeft = '2px';
  labelChip.style.marginRight = '0px';
  labelChip.style.flexShrink = '0';
  labelChip.style.backgroundColor = 'var(--interactive-normal)';
  labelChip.style.padding = '2px 6px 2px 4px';
  labelChip.style.borderRadius = '3px';

  if (options?.icon) {
    const iconHolder = document.createElement('span');
    iconHolder.classList.add('output-label-icon');
    iconHolder.style.display = 'inline-flex';
    iconHolder.style.width = '12px';
    iconHolder.style.height = '12px';
    iconHolder.style.transform = 'translateY(0)';
    iconHolder.style.color = options.iconColor || 'currentColor';
    setIcon(iconHolder as HTMLElement, options.icon);
    // Shrink SVG to fit 12x12
    const svg = iconHolder.querySelector('svg') as SVGElement | null;
    if (svg) {
      svg.style.width = '12px';
      svg.style.height = '12px';
      svg.style.strokeWidth = '2px';
    }
    labelChip.appendChild(iconHolder);
  }

  const labelText = document.createElement('span');
  labelText.classList.add('output-label-text');
  labelText.textContent = label;
  labelChip.appendChild(labelText);
  outputHeader.appendChild(labelChip);
  // Sticky header에서 안전하게 라벨을 추출할 수 있도록 data 속성도 부여
  outputHeader.setAttribute('data-label', label);

  // Buttons in canonical order
  outputHeader.appendChild(buttons.uploadWiki);
  outputHeader.appendChild(buttons.uploadSlack);
  outputHeader.appendChild(buttons.newNote);
  outputHeader.appendChild(buttons.reply);
  outputHeader.appendChild(buttons.toggle);
  outputHeader.appendChild(buttons.copy);
  outputHeader.appendChild(buttons.spacer);
  outputHeader.appendChild(buttons.menu);

  // 반응형 버튼 숨김 로직 추가 (context가 제공된 경우에만)
  if (context) {
    setupOutputHeaderResponsiveButtons(outputHeader, buttons, context);
  }

  return outputHeader;
}

// Build a standardized composer header: label + buttons in fixed order.
export function createComposerHeader(label: string, buttons: ComposerHeaderButtonsSet, context: ISummarViewContext, options?: LabelOptions): HTMLDivElement {
  const composerHeader = document.createElement('div');
  composerHeader.className = 'composer-header';
  composerHeader.style.width = '100%';
  composerHeader.style.display = 'flex';
  composerHeader.style.flexDirection = 'row';
  composerHeader.style.alignItems = 'flex-start';
  composerHeader.style.gap = '0px';
  composerHeader.style.marginBottom = '0px';
  composerHeader.style.border = 'none';
  composerHeader.style.backgroundColor = 'var(--background-secondary)';
  composerHeader.style.height = '40px';
  composerHeader.style.padding = '2px 2px';
  composerHeader.style.boxSizing = 'border-box';

  // Left side: label and model container
  const labelModelContainer = document.createElement('div');
  labelModelContainer.style.display = 'flex';
  labelModelContainer.style.flexDirection = 'column';
  labelModelContainer.style.gap = '1px';
  labelModelContainer.style.width = 'auto';
  labelModelContainer.style.alignItems = 'flex-start';

  // Label chip
  const labelChip = document.createElement('div');
  labelChip.classList.add('composer-label-chip');
  labelChip.style.display = 'inline-flex';
  labelChip.style.alignItems = 'center';
  labelChip.style.gap = '4px';
  labelChip.style.fontSize = '10px';
  labelChip.style.color = 'var(--text-muted)';
  labelChip.style.marginLeft = '2px';
  labelChip.style.marginRight = '0px';
  labelChip.style.flexShrink = '0';
  labelChip.style.width = 'auto';
  labelChip.style.minWidth = 'fit-content';
  labelChip.style.backgroundColor = 'var(--interactive-normal)';
  labelChip.style.padding = '2px 6px 2px 4px';
  labelChip.style.borderRadius = '3px';
  labelChip.style.cursor = 'pointer';
  labelChip.style.transition = 'all 0.2s ease';
  labelChip.style.position = 'relative';

  if (options?.icon) {
    const iconHolder = document.createElement('span');
    iconHolder.classList.add('composer-label-icon');
    iconHolder.style.display = 'inline-flex';
    iconHolder.style.width = '12px';
    iconHolder.style.height = '12px';
    iconHolder.style.transform = 'translateY(0)';
    iconHolder.style.color = options.iconColor || 'currentColor';
    setIcon(iconHolder as HTMLElement, options.icon);
    // Adjust SVG to fit 12x12 for composer header
    const svg = iconHolder.querySelector('svg') as SVGElement | null;
    if (svg) {
      svg.style.width = '12px';
      svg.style.height = '12px';
      svg.style.strokeWidth = '2px';
    }
    labelChip.appendChild(iconHolder);
  }

  const labelText = document.createElement('span');
  labelText.classList.add('composer-label-text');
  labelText.textContent = label;
  labelChip.appendChild(labelText);

  // Hover effects for labelChip
  labelChip.addEventListener('mouseenter', () => {
    labelChip.style.backgroundColor = 'var(--interactive-accent)';
    labelChip.style.color = 'var(--text-on-accent)';
  });

  labelChip.addEventListener('mouseleave', () => {
    labelChip.style.backgroundColor = 'var(--interactive-normal)';
    labelChip.style.color = 'var(--text-muted)';
  });

  // Click event for labelChip dropdown
  labelChip.addEventListener('click', (e) => {
    e.stopPropagation();
    showLabelDropdown(labelChip, context, (action: string, file?: string) => {
      if (action === 'new-prompt') {
        const composerManager = (context as any).composerManager;
        if (composerManager && composerManager.newPrompt) {
          composerManager.newPrompt();
        }
      } else if (action === 'open-file' && file) {
        const composerManager = (context as any).composerManager;
        if (composerManager && composerManager.linkNote) {
          composerManager.linkNote(file);
        }
        // context.plugin.app.workspace.openLinkText(file, '', false);
      }
    });
  });

  labelModelContainer.appendChild(labelChip);

  // Model chip
  const initialModel = options?.selectedModel || 'gemini-2.5-flash';
  const modelChip = document.createElement('div');
  modelChip.classList.add('composer-model-chip');
  modelChip.style.display = 'inline-flex';
  modelChip.style.alignItems = 'center';
  modelChip.style.gap = '4px';
  modelChip.style.fontSize = '10px';
  modelChip.style.color = 'var(--text-muted)';
  modelChip.style.marginLeft = '2px';
  modelChip.style.marginRight = '0px';
  modelChip.style.flexShrink = '0';
  modelChip.style.width = 'auto';
  modelChip.style.minWidth = 'fit-content';
  modelChip.style.backgroundColor = 'var(--background-modifier-hover)';
  modelChip.style.padding = '2px 6px 2px 4px';
  modelChip.style.borderRadius = '3px';
  modelChip.style.cursor = 'pointer';
  modelChip.style.transition = 'all 0.2s ease';
  modelChip.style.position = 'relative';

  // Icon
  const iconHolder = document.createElement('span');
  iconHolder.classList.add('composer-model-icon');
  iconHolder.style.display = 'inline-flex';
  iconHolder.style.width = '12px';
  iconHolder.style.height = '12px';
  iconHolder.style.transform = 'translateY(0)';
  iconHolder.style.color = 'currentColor';
  setIcon(iconHolder as HTMLElement, 'bot-message-square');
  const svg = iconHolder.querySelector('svg') as SVGElement | null;
  if (svg) {
    svg.style.width = '12px';
    svg.style.height = '12px';
    svg.style.strokeWidth = '2px';
  }
  modelChip.appendChild(iconHolder);

  // Text
  const modelText = document.createElement('span');
  modelText.classList.add('composer-model-text');
  modelText.textContent = getModelDisplayText(initialModel);
  modelChip.appendChild(modelText);

  // Store current model value
  modelChip.setAttribute('data-model', initialModel);

  // Hover effects
  modelChip.addEventListener('mouseenter', () => {
    modelChip.style.backgroundColor = 'var(--interactive-accent)';
    modelChip.style.color = 'var(--text-on-accent)';
  });

  modelChip.addEventListener('mouseleave', () => {
    modelChip.style.backgroundColor = 'var(--background-modifier-hover)';
    modelChip.style.color = 'var(--text-muted)';
  });

  // Click event for dropdown
  modelChip.addEventListener('click', (e) => {
    e.stopPropagation();
    showModelDropdown(modelChip, context.plugin, (selectedModel: string) => {
      context.plugin.settingsv2.conversation.conversationModel = selectedModel;
      context.plugin.settingsv2.saveSettings();
      modelChip.setAttribute('data-model', selectedModel);
      modelText.textContent = getModelDisplayText(selectedModel);
    });
  });
  
  labelModelContainer.appendChild(modelChip);

  // Right side: buttons container
  const buttonsContainer = document.createElement('div');
  buttonsContainer.style.display = 'flex';
  buttonsContainer.style.flexDirection = 'row';
  buttonsContainer.style.alignItems = 'center';
  buttonsContainer.style.gap = '0px';
  buttonsContainer.style.marginLeft = 'auto';
  buttonsContainer.style.flexShrink = '0';

  // Buttons in canonical order
  buttonsContainer.appendChild(buttons.spacer);
  buttonsContainer.appendChild(buttons.clear);
  buttonsContainer.appendChild(buttons.close);

  // Add containers to composer header
  composerHeader.appendChild(labelModelContainer);
  composerHeader.appendChild(buttonsContainer);

  // Composer header에서 안전하게 라벨을 추출할 수 있도록 data 속성도 부여
  composerHeader.setAttribute('data-label', label);

  return composerHeader;
}

// OutputHeader 반응형 버튼 숨김 시스템 설정
function setupOutputHeaderResponsiveButtons(outputHeader: HTMLElement, buttons: HeaderButtonsSet, context: ISummarViewContext): void {
  // 버튼 가시성 상태 초기화
  const hiddenButtons: OutputHeaderHiddenButtonsState = {
    uploadSlack: false,
    uploadWiki: false,
    newNote: false,
    copy: false,
    reply: false,
  };

  // 너비 임계값 설정 (실제 테스트 기반으로 조정된 값)
  // 더 보수적으로 설정하여 버튼이 겹치지 않도록 함
  const buttonVisibilityThresholds = {
    uploadSlack: 270,      // 첫 번째로 숨김 (Upload Slack 버튼)
    uploadWiki: 240,     // 두 번째로 숨김 (Upload Wiki 버튼)
    newNote: 210,   // 세 번째로 숨김 (New Note 버튼)
    copy: 180, // 네 번째로 숨김 (Copy 버튼)
    reply: 150   // 마지막으로 숨김 (Reply 버튼)
  };

  // 버튼 가시성 업데이트 함수
  const updateButtonVisibility = (width: number) => {
    let changed = false;

    // 숨김 순서: copy → reply → newNote → uploadSlack → uploadWiki
    const newCopyHidden = width <= buttonVisibilityThresholds.copy;
    const newReplyHidden = width <= buttonVisibilityThresholds.reply;
    const newNewNoteHidden = width <= buttonVisibilityThresholds.newNote;
    const newUploadSlackHidden = width <= buttonVisibilityThresholds.uploadSlack;
    const newUploadWikiHidden = width <= buttonVisibilityThresholds.uploadWiki;

    if (hiddenButtons.copy !== newCopyHidden) {
      hiddenButtons.copy = newCopyHidden;
      buttons.copy.style.display = newCopyHidden ? 'none' : 'block';
      changed = true;
    }

    // Reply 버튼은 항상 composer 가용성 체크 (조건 없이 매번 실행)
    const canShowComposer = context.composerManager?.canShowComposer(200)?.canShow ?? false;
    const shouldShowReply = !newReplyHidden && canShowComposer;
    const currentReplyDisplay = buttons.reply.style.display;
    const newReplyDisplay = shouldShowReply ? 'block' : 'none';
    
    if (hiddenButtons.reply !== newReplyHidden || currentReplyDisplay !== newReplyDisplay) {
      hiddenButtons.reply = newReplyHidden;
      buttons.reply.style.display = newReplyDisplay;
      changed = true;
    }

    if (hiddenButtons.newNote !== newNewNoteHidden) {
      hiddenButtons.newNote = newNewNoteHidden;
      buttons.newNote.style.display = newNewNoteHidden ? 'none' : 'block';
      changed = true;
    }

    if (hiddenButtons.uploadSlack !== newUploadSlackHidden) {
      hiddenButtons.uploadSlack = newUploadSlackHidden;
      buttons.uploadSlack.style.display = newUploadSlackHidden ? 'none' : 'block';
      changed = true;
    }

    if (hiddenButtons.uploadWiki !== newUploadWikiHidden) {
      hiddenButtons.uploadWiki = newUploadWikiHidden;
      buttons.uploadWiki.style.display = newUploadWikiHidden ? 'none' : 'block';
      changed = true;
    }

    // 변경사항이 있으면 이벤트 콜백 호출
    if (changed && context.onOutputHeaderButtonVisibilityChanged) {
      context.onOutputHeaderButtonVisibilityChanged(hiddenButtons);
    }
  };

  // ResizeObserver 설정
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const width = entry.contentRect.width;
      updateButtonVisibility(width);
    }
  });

  // 관찰 시작
  resizeObserver.observe(outputHeader);

  // 정리 함수를 AbortController에 연결
  context.abortController.signal.addEventListener('abort', () => {
    resizeObserver.disconnect();
  });

  // menu 버튼에 클릭 이벤트 추가 (숨겨진 버튼 메뉴 표시)
  setupOutputHeaderMenuButton(buttons.menu, buttons, hiddenButtons, context);

  // 초기 크기 체크
  const initialWidth = outputHeader.clientWidth;
  if (initialWidth > 0) {
    updateButtonVisibility(initialWidth);
  }
}

// OutputHeader 메뉴 버튼 설정
function setupOutputHeaderMenuButton(menuButton: HTMLElement, buttons: HeaderButtonsSet, hiddenButtons: OutputHeaderHiddenButtonsState, context: ISummarViewContext): void {
  menuButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const key = menuButton.getAttribute('data-key') || '';
    showOutputHeaderHiddenButtonsMenu(menuButton, buttons, hiddenButtons, context, key);
  }, { signal: context.abortController.signal });
}

// 숨겨진 버튼들의 메뉴 표시
function showOutputHeaderHiddenButtonsMenu(menuButton: HTMLElement, buttons: HeaderButtonsSet, hiddenButtons: OutputHeaderHiddenButtonsState, context: ISummarViewContext, key: string): void {
  // Check if this specific output header menu is already open
  const existingOutputHeaderMenu = document.querySelector('.output-header-hidden-menu[data-key="' + key + '"]');
  if (existingOutputHeaderMenu) {
    // If clicking the same button, close the menu
    existingOutputHeaderMenu.remove();
    return;
  }

  // 숨겨진 버튼들의 메뉴 아이템 생성
  const hiddenButtonMenuItems = getOutputHeaderHiddenButtonMenuItems(buttons, hiddenButtons);
  
  // 표준 메뉴 아이템들 가져오기 (Delete Output 등)
  const standardMenuItems = SummarMenuUtils.createStandardMenuItems(key, context);
  
  // 통합 메뉴 아이템 배열 생성
  const allMenuItems = [
    ...hiddenButtonMenuItems.map(item => ({
      label: item.tooltip,
      action: item.action,
      isHiddenButton: true,
      icon: item.icon
    })),
    ...standardMenuItems.map(item => ({
      label: item.label,
      action: item.action,
      isHiddenButton: false,
      icon: item.icon
    }))
  ];
  
  if (allMenuItems.length === 0) {
    return; // 메뉴 아이템이 없으면 메뉴를 표시하지 않음
  }

  // 기존 Summar 팝업 메뉴들이 있다면 모두 제거
  const existingMenus = document.querySelectorAll('.summar-popup-menu');
  existingMenus.forEach(menu => menu.remove());

  // 드롭다운 메뉴 생성
  const dropdown = document.createElement('div');
  dropdown.classList.add('output-header-hidden-menu', 'summar-popup-menu');
  dropdown.setAttribute('data-key', key);
  dropdown.style.position = 'fixed'; // fixed positioning like existing menus
  dropdown.style.backgroundColor = 'var(--background-primary)';
  dropdown.style.border = '1px solid var(--background-modifier-border)';
  dropdown.style.borderRadius = '6px';
  dropdown.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.15)';
  dropdown.style.zIndex = '10001'; // StickyHeader보다 위에 표시
  dropdown.style.minWidth = '150px';
  dropdown.style.maxHeight = '200px';
  dropdown.style.overflowY = 'auto';
  dropdown.style.padding = '4px';

  // 메뉴 아이템들 추가 (크기 측정을 위해)
  allMenuItems.forEach((item, index) => {
    const menuItem = document.createElement('div');
    menuItem.style.padding = '6px 8px';
    menuItem.style.cursor = 'pointer';
    menuItem.style.borderRadius = '3px';
    menuItem.style.fontSize = 'var(--font-ui-small)'; // 기존 메뉴와 동일한 CSS 변수 사용
    menuItem.style.color = 'var(--text-normal)';
    menuItem.style.transition = 'background-color 0.1s ease';
    menuItem.style.display = 'flex';
    menuItem.style.alignItems = 'center';
    menuItem.style.gap = '6px';
    
    // 아이콘 추가 (숨겨진 버튼들에만)
    if (item.icon) {
      const iconHolder = document.createElement('span');
      iconHolder.style.display = 'inline-flex';
      iconHolder.style.width = '14px';
      iconHolder.style.height = '14px';
      iconHolder.style.flexShrink = '0';
      SummarMenuUtils.setMenuItemIcon(iconHolder, item.icon);
      
      // 추가 스타일 조정
      const svg = iconHolder.querySelector('svg') as SVGElement | null;
      if (svg) {
        svg.style.strokeWidth = '2px';
      }
      
      menuItem.appendChild(iconHolder);
    }
    
    // 텍스트 라벨 추가
    const textSpan = document.createElement('span');
    textSpan.textContent = item.label;
    menuItem.appendChild(textSpan);
    
    menuItem.addEventListener('mouseenter', () => {
      menuItem.style.backgroundColor = 'var(--background-modifier-hover)';
    });
    
    menuItem.addEventListener('mouseleave', () => {
      menuItem.style.backgroundColor = 'transparent';
    });
    
    menuItem.addEventListener('click', (e) => {
      e.stopPropagation();
      item.action();
      dropdown.remove();
    });
    
    dropdown.appendChild(menuItem);
    
    // 숨겨진 버튼과 표준 메뉴 사이에 구분선 추가
    if (index === hiddenButtonMenuItems.length - 1 && standardMenuItems.length > 0) {
      const separator = document.createElement('div');
      separator.style.height = '1px';
      separator.style.backgroundColor = 'var(--background-modifier-border)';
      separator.style.margin = '4px 0';
      dropdown.appendChild(separator);
    }
  });

  // 메뉴를 임시로 DOM에 추가하여 실제 크기 측정 (SummarMenuUtils.ts와 동일한 패턴)
  dropdown.style.top = '-9999px';
  dropdown.style.left = '-9999px';
  dropdown.style.visibility = 'hidden';
  document.body.appendChild(dropdown);
  
  // 메뉴 버튼의 위치를 기준으로 드롭다운 위치 계산
  const rect = menuButton.getBoundingClientRect();
  let top = rect.bottom + 5;
  let left = rect.left;
  
  // 화면 경계를 벗어나지 않도록 조정
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // 실제 메뉴 크기 측정
  const dropdownRect = dropdown.getBoundingClientRect();
  const menuWidth = dropdownRect.width;
  const menuHeight = dropdownRect.height;
  
  // 오른쪽 경계 체크
  if (left + menuWidth > viewportWidth) {
    left = viewportWidth - menuWidth - 10;
  }
  
  // 하단 경계 체크
  if (top + menuHeight > viewportHeight) {
    top = rect.top - menuHeight - 5; // 버튼 위쪽에 표시
  }
  
  // 최종 위치 설정
  dropdown.style.top = `${top}px`;
  dropdown.style.left = `${left}px`;
  dropdown.style.visibility = 'visible';

  // 외부 클릭 시 드롭다운 닫기
  const closeDropdown = (e: Event) => {
    if (!dropdown.contains(e.target as Node) && !menuButton.contains(e.target as Node)) {
      dropdown.remove();
      document.removeEventListener('click', closeDropdown);
    }
  };
  
  // 지연 후 이벤트 리스너 추가 (즉시 닫힘 방지)
  setTimeout(() => {
    document.addEventListener('click', closeDropdown);
  }, 0);
}

// 숨겨진 버튼들의 메뉴 아이템 생성
function getOutputHeaderHiddenButtonMenuItems(buttons: HeaderButtonsSet, hiddenButtons: OutputHeaderHiddenButtonsState): Array<{tooltip: string, action: () => void, icon: string}> {
  // 버튼 타입별 아이콘 매핑
  const buttonIconMap = {
    uploadWiki: 'file-up',
    uploadSlack: 'hash',
    newNote: 'file-output',
    reply: 'message-square-reply',
    copy: 'copy'
  };

  const menuItems: Array<{tooltip: string, action: () => void, icon: string}> = [];

  // 숨겨진 버튼들만 메뉴에 추가 (표시 순서: uploadWiki → uploadSlack → newNote → reply → copy)
  if (hiddenButtons.uploadWiki) {
    menuItems.push({
      tooltip: buttons.uploadWiki.getAttribute('aria-label') || 'Upload to Wiki',
      action: () => buttons.uploadWiki.click(),
      icon: buttonIconMap.uploadWiki
    });
  }

  if (hiddenButtons.uploadSlack) {
    menuItems.push({
      tooltip: buttons.uploadSlack.getAttribute('aria-label') || 'Upload to Slack',
      action: () => buttons.uploadSlack.click(),
      icon: buttonIconMap.uploadSlack
    });
  }

  if (hiddenButtons.newNote) {
    menuItems.push({
      tooltip: buttons.newNote.getAttribute('aria-label') || 'Create New Note',
      action: () => buttons.newNote.click(),
      icon: buttonIconMap.newNote
    });
  }

  if (hiddenButtons.reply) {
    menuItems.push({
      tooltip: buttons.reply.getAttribute('aria-label') || 'Reply',
      action: () => buttons.reply.click(),
      icon: buttonIconMap.reply
    });
  }

  if (hiddenButtons.copy) {
    menuItems.push({
      tooltip: buttons.copy.getAttribute('aria-label') || 'Copy',
      action: () => buttons.copy.click(),
      icon: buttonIconMap.copy
    });
  }

  return menuItems;
}
