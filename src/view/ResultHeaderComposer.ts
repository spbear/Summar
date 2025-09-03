import { setIcon } from 'obsidian';

export type HeaderButtonsSet = {
  uploadWiki: HTMLElement;
  uploadSlack: HTMLElement;
  newNote: HTMLElement;
  toggle: HTMLElement;
  copy: HTMLElement;
  spacer: HTMLElement;
  menu: HTMLElement;
};

export type ChatHeaderButtonsSet = {
  spacer: HTMLElement;
  clear: HTMLElement;
  close: HTMLElement;
};

export type LabelOptions = {
  icon?: string;       // lucide icon name
  iconColor?: string;  // optional color for the icon
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
  if (/(chat)/.test(l)) return 'message-square-more';
  if (/(summary)/.test(l)) return 'clipboard-list';
  if (/(refinement)/.test(l)) return 'clipboard-check';
  if (/(custom)/.test(l)) return 'pocket-knife';
  
  return 'tag';
}

// Build a standardized result header: label + buttons in fixed order.
export function composeStandardResultHeader(label: string, buttons: HeaderButtonsSet, options?: LabelOptions): HTMLDivElement {
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

  // Label
  const labelChip = document.createElement('div');
  labelChip.classList.add('result-label-chip');
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
    iconHolder.classList.add('result-label-icon');
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
  labelText.classList.add('result-label-text');
  labelText.textContent = label;
  labelChip.appendChild(labelText);
  resultHeader.appendChild(labelChip);
  // Sticky header에서 안전하게 라벨을 추출할 수 있도록 data 속성도 부여
  resultHeader.setAttribute('data-label', label);

  // Buttons in canonical order
  resultHeader.appendChild(buttons.uploadWiki);
  resultHeader.appendChild(buttons.uploadSlack);
  resultHeader.appendChild(buttons.newNote);
  resultHeader.appendChild(buttons.toggle);
  resultHeader.appendChild(buttons.copy);
  resultHeader.appendChild(buttons.spacer);
  resultHeader.appendChild(buttons.menu);

  return resultHeader;
}

// Build a standardized chat header: label + buttons in fixed order.
export function composeStandardChatHeader(label: string, buttons: ChatHeaderButtonsSet, options?: LabelOptions): HTMLDivElement {
  const chatHeader = document.createElement('div');
  chatHeader.className = 'chat-header';
  chatHeader.style.width = '100%';
  chatHeader.style.display = 'flex';
  chatHeader.style.alignItems = 'center';
  chatHeader.style.gap = '0px';
  chatHeader.style.marginBottom = '0px';
  chatHeader.style.padding = '0px';
  chatHeader.style.border = '1px solid var(--background-modifier-border)';
  chatHeader.style.backgroundColor = 'var(--background-secondary)';
//  chatHeader.style.height = '44px';
  chatHeader.style.boxSizing = 'border-box';

  // Label (Chat icon + title)
  const labelChip = document.createElement('div');
  labelChip.classList.add('chat-label-chip');
  labelChip.style.display = 'inline-flex';
  labelChip.style.alignItems = 'center';
  labelChip.style.gap = '4px';
  labelChip.style.fontSize = '10px';
  labelChip.style.color = 'var(--text-normal)';
  labelChip.style.marginLeft = '2px';
  labelChip.style.marginRight = '0px';
  labelChip.style.fontWeight = 'bold';
  labelChip.style.flexShrink = '0';
  labelChip.style.backgroundColor = 'var(--interactive-normal)';
  labelChip.style.padding = '2px 6px 2px 4px';
  labelChip.style.borderRadius = '3px';

  if (options?.icon) {
    const iconHolder = document.createElement('span');
    iconHolder.classList.add('chat-label-icon');
    iconHolder.style.display = 'inline-flex';
    iconHolder.style.width = '12px';
    iconHolder.style.height = '12px';
    iconHolder.style.transform = 'translateY(0)';
    iconHolder.style.color = options.iconColor || 'currentColor';
    setIcon(iconHolder as HTMLElement, options.icon);
    // Adjust SVG to fit 12x12 for chat header
    const svg = iconHolder.querySelector('svg') as SVGElement | null;
    if (svg) {
      svg.style.width = '12px';
      svg.style.height = '12px';
      svg.style.strokeWidth = '2px';
    }
    labelChip.appendChild(iconHolder);
  }

  const labelText = document.createElement('span');
  labelText.classList.add('chat-label-text');
  labelText.textContent = label;
  labelChip.appendChild(labelText);
  chatHeader.appendChild(labelChip);
  // Chat header에서 안전하게 라벨을 추출할 수 있도록 data 속성도 부여
  chatHeader.setAttribute('data-label', label);

  // Buttons in canonical order
  chatHeader.appendChild(buttons.spacer);
  chatHeader.appendChild(buttons.clear);
  chatHeader.appendChild(buttons.close);

  return chatHeader;
}
