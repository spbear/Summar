import { setIcon } from 'obsidian';
import { ISummarViewContext } from './SummarViewTypes';

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
  // Remove any existing dropdown
  const existingDropdown = document.querySelector('.model-dropdown');
  if (existingDropdown) {
    existingDropdown.remove();
  }

  // Get available models - pass plugin reference
  const availableModels = getAvailableModels(plugin);
  
  if (availableModels.length === 0) {
    return;
  }

  // Create dropdown
  const dropdown = document.createElement('div');
  dropdown.classList.add('model-dropdown');
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

  // Position relative to chip
  chipElement.style.position = 'relative';
  chipElement.appendChild(dropdown);

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
export function composeStandardOutputHeader(label: string, buttons: HeaderButtonsSet, options?: LabelOptions): HTMLDivElement {
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
  labelChip.style.fontWeight = 'bold';
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

  return outputHeader;
}

// Build a standardized composer header: label + buttons in fixed order.
export function setStandardComposerHeader(label: string, buttons: ComposerHeaderButtonsSet, context: ISummarViewContext, options?: LabelOptions): HTMLDivElement {
  const composerHeader = document.createElement('div');
  composerHeader.className = 'composer-header';
  composerHeader.style.width = '100%';
  composerHeader.style.display = 'flex';
  composerHeader.style.flexDirection = 'row';
  composerHeader.style.alignItems = 'flex-start';
  composerHeader.style.gap = '0px';
  composerHeader.style.marginBottom = '0px';
  // composerHeader.style.padding = '0px';
  composerHeader.style.border = 'none';
  // composerHeader.style.border = '1px solid var(--background-modifier-border)';
  composerHeader.style.backgroundColor = 'var(--background-secondary)';
//  composerHeader.style.height = '44px';

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
  labelChip.style.fontWeight = 'bold';
  labelChip.style.flexShrink = '0';
  labelChip.style.width = 'auto';
  labelChip.style.minWidth = 'fit-content';
  labelChip.style.backgroundColor = 'var(--interactive-normal)';
  labelChip.style.padding = '2px 6px 2px 4px';
  labelChip.style.borderRadius = '3px';

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
  modelChip.style.fontWeight = 'bold';
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
