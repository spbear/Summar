import { setIcon } from 'obsidian';

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
  if (/(chat|composer)/.test(l)) return 'message-square-more';
  if (/(summary)/.test(l)) return 'clipboard-list';
  if (/(refinement)/.test(l)) return 'clipboard-check';
  if (/(custom)/.test(l)) return 'pocket-knife';
  
  return 'tag';
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
export function setStandardComposerHeader(label: string, buttons: ComposerHeaderButtonsSet, options?: LabelOptions): HTMLDivElement {
  const composerHeader = document.createElement('div');
  composerHeader.className = 'composer-header';
  composerHeader.style.width = '100%';
  composerHeader.style.display = 'flex';
  composerHeader.style.alignItems = 'center';
  composerHeader.style.gap = '0px';
  composerHeader.style.marginBottom = '0px';
  composerHeader.style.padding = '0px';
  composerHeader.style.border = 'none';
  // composerHeader.style.border = '1px solid var(--background-modifier-border)';
  composerHeader.style.backgroundColor = 'var(--background-secondary)';
//  composerHeader.style.height = '44px';
  composerHeader.style.boxSizing = 'border-box';

  // Label (Chat icon + title)
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
  composerHeader.appendChild(labelChip);
  // Composer header에서 안전하게 라벨을 추출할 수 있도록 data 속성도 부여
  composerHeader.setAttribute('data-label', label);

  // Buttons in canonical order
  composerHeader.appendChild(buttons.spacer);
  composerHeader.appendChild(buttons.clear);
  composerHeader.appendChild(buttons.close);

  return composerHeader;
}
