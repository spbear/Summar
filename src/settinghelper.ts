import { Modal, Setting, Notice } from 'obsidian';
import SummarPlugin from './main';
import { SettingHelperConfig } from './types';

export class SettingHelperModal extends Modal {
    plugin: SummarPlugin;
    helperConfig: SettingHelperConfig;
    private openaiCheckbox: HTMLInputElement;
    private confluenceCheckbox: HTMLInputElement;
    private slackWorkspaceCheckbox: HTMLInputElement;
    private slackApiCheckbox: HTMLInputElement;
    private onApply?: () => void;

    constructor(plugin: SummarPlugin, helperConfig: SettingHelperConfig, onApply?: () => void) {
        super(plugin.app);
        this.plugin = plugin;
        this.helperConfig = helperConfig;
        this.onApply = onApply;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // 모달 제목 설정
        contentEl.createEl("h2", { text: "Setting Helper" });

        // 설명 텍스트 추가
        const descEl = contentEl.createEl("p", { 
            text: this.helperConfig.helper_desc,
            cls: "setting-helper-description"
        });
        descEl.style.marginBottom = "20px";
        descEl.style.color = "var(--text-muted)";

        // Default Domain 섹션
        if (this.helperConfig.common) {
            const defaultDomainSection = contentEl.createDiv({ cls: "setting-helper-default-domain" });
            defaultDomainSection.createEl("h3", { text: "Default Domain" });
            
            // 설명 텍스트
            const descriptionText = defaultDomainSection.createEl("p", {
                text: "These are the default settings for our office. Would you like to apply the following configurations?"
            });
            descriptionText.style.marginBottom = "15px";
            
            // 설정 정보 표시 (각각 체크박스 포함)
            const settingsInfo = defaultDomainSection.createDiv({ cls: "settings-info" });
            settingsInfo.style.marginLeft = "20px";
            settingsInfo.style.fontSize = "0.9em";
            
            const { common } = this.helperConfig;
            
            // OpenAI API Endpoint URL
            const openaiDiv = settingsInfo.createEl("div");
            openaiDiv.style.marginBottom = "8px";
            openaiDiv.style.display = "flex";
            openaiDiv.style.alignItems = "center";
            this.openaiCheckbox = openaiDiv.createEl("input", { type: "checkbox" });
            this.openaiCheckbox.style.marginRight = "8px";
            this.openaiCheckbox.checked = true;
            const openaiSpan = openaiDiv.createEl("span");
            openaiSpan.innerHTML = `OpenAI API Endpoint URL : <span style="color: var(--text-accent)">${common.openaiApiEndpoint || 'N/A'}</span>`;
            
            // Confluence Domain
            const confluenceDiv = settingsInfo.createEl("div");
            confluenceDiv.style.marginBottom = "8px";
            confluenceDiv.style.display = "flex";
            confluenceDiv.style.alignItems = "center";
            this.confluenceCheckbox = confluenceDiv.createEl("input", { type: "checkbox" });
            this.confluenceCheckbox.style.marginRight = "8px";
            this.confluenceCheckbox.checked = true;
            const confluenceSpan = confluenceDiv.createEl("span");
            confluenceSpan.innerHTML = `Confluence Domain : <span style="color: var(--text-accent)">${common.confluenceDomain || 'N/A'}</span>`;
            
            // Slack Workspace Domain
            const slackWorkspaceDiv = settingsInfo.createEl("div");
            slackWorkspaceDiv.style.marginBottom = "8px";
            slackWorkspaceDiv.style.display = "flex";
            slackWorkspaceDiv.style.alignItems = "center";
            this.slackWorkspaceCheckbox = slackWorkspaceDiv.createEl("input", { type: "checkbox" });
            this.slackWorkspaceCheckbox.style.marginRight = "8px";
            this.slackWorkspaceCheckbox.checked = true;
            const slackWorkspaceSpan = slackWorkspaceDiv.createEl("span");
            slackWorkspaceSpan.innerHTML = `Slack Workspace Domain : <span style="color: var(--text-accent)">${common.slackWorkspaceDomain || 'N/A'}</span>`;
            
            // Slack API Domain
            const slackApiDiv = settingsInfo.createEl("div");
            slackApiDiv.style.marginBottom = "8px";
            slackApiDiv.style.display = "flex";
            slackApiDiv.style.alignItems = "center";
            this.slackApiCheckbox = slackApiDiv.createEl("input", { type: "checkbox" });
            this.slackApiCheckbox.style.marginRight = "8px";
            this.slackApiCheckbox.checked = true;
            const slackApiSpan = slackApiDiv.createEl("span");
            slackApiSpan.innerHTML = `Slack API Domain : <span style="color: var(--text-accent)">${common.slackApiDomain || 'N/A'}</span>`;
        }

        // PAT 구하기 섹션
        if (this.helperConfig.common) {
            const patSection = contentEl.createDiv({ cls: "setting-helper-pat" });
            patSection.style.marginTop = "20px";
            patSection.createEl("h3", { text: "Get PAT (Personal Access Token)" });
            
            const patList = patSection.createEl("ul");
            
            // ChatAI PAT
            const chatAIItem = patList.createEl("li");
            chatAIItem.innerHTML = `Get ChatAI PAT : <a href="${this.helperConfig.common.getChatAIPat || '#'}" target="_blank">Go to link</a>`;
            
            // Confluence PAT
            const confluenceItem = patList.createEl("li");
            confluenceItem.innerHTML = `Get Confluence PAT : <a href="${this.helperConfig.common.getConfluencePat || '#'}" target="_blank">Go to link</a>`;
        }

        // etc 섹션
        if (this.helperConfig.common) {
            const etcSection = contentEl.createDiv({ cls: "setting-helper-etc" });
            etcSection.style.marginTop = "20px";
            etcSection.createEl("h3", { text: "etc" });
            
            const patList = etcSection.createEl("ul");
            const slackProxyInfo = patList.createEl("li");
            slackProxyInfo.innerHTML = `Reference Slack API Proxy Help : <a href="${this.helperConfig.common.slackApiProxyDoc || '#'}" target="_blank">Go to link</a>`;
            
            // Slack API Proxy 사용 시 설명 추가
            const slackProxyDesc = patList.createEl("li");
            slackProxyDesc.style.marginLeft = "20px";
            slackProxyDesc.style.fontSize = "0.9em";
            slackProxyDesc.style.color = "var(--text-muted)";
            slackProxyDesc.innerHTML = `When using Slack API proxy in the office, Slack bot token is not required.`;
        }

        // 버튼 영역
        const buttonContainer = contentEl.createDiv({ cls: "setting-helper-buttons" });
        buttonContainer.style.marginTop = "20px";
        buttonContainer.style.display = "flex";
        buttonContainer.style.gap = "10px";
        buttonContainer.style.justifyContent = "flex-end";

        // Apply Selected Settings 버튼
        new Setting(buttonContainer)
            .addButton((button) => {
                button
                    .setButtonText("Apply Selected Settings")
                    .setCta()
                    .onClick(() => {
                        this.applySelectedSettings();
                        if (this.onApply) {
                            this.onApply();
                        }
                        this.close();
                    });
            });

        // 닫기 버튼
        new Setting(buttonContainer)
            .addButton((button) => {
                button
                    .setButtonText("Close")
                    .onClick(() => {
                        this.close();
                    });
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }

    private applySelectedSettings() {
        try {
            if (!this.helperConfig.common) return;

            const { common } = this.helperConfig;
            let appliedCount = 0;
            
            // 선택된 설정값들만 플러그인 설정에 적용
            if (this.openaiCheckbox?.checked && common.openaiApiEndpoint) {
                this.plugin.settingsv2.common.openaiApiEndpoint = common.openaiApiEndpoint;
                appliedCount++;
            }
            if (this.confluenceCheckbox?.checked && common.confluenceDomain) {
                this.plugin.settingsv2.common.confluenceDomain = common.confluenceDomain;
                appliedCount++;
            }
            if (this.slackWorkspaceCheckbox?.checked && common.slackWorkspaceDomain) {
                this.plugin.settingsv2.common.slackWorkspaceDomain = common.slackWorkspaceDomain;
                appliedCount++;
            }
            if (this.slackApiCheckbox?.checked && common.slackApiDomain) {
                this.plugin.settingsv2.common.slackApiDomain = common.slackApiDomain;
                appliedCount++;
            }

            if (appliedCount === 0) {
                new Notice('Please select settings to apply.');
                return;
            }

            // 설정 저장
            this.plugin.settingsv2.saveSettings().then(() => {
                // 사용자에게 완료 알림
                new Notice(`${appliedCount} setting(s) have been applied.`);
            }).catch((error) => {
                new Notice('An error occurred while applying settings.');
                console.error('Error applying selected settings:', error);
            });
        } catch (error) {
            new Notice('An error occurred while applying settings.');
            console.error('Error in applySelectedSettings:', error);
        }
    }
}
