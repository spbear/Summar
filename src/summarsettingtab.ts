import { PluginSettingTab, Setting, Platform, ButtonComponent, Modal, App } from "obsidian";

import { SummarDebug, SummarRequestUrl, getDeviceId, sanitizeLabel, SummarTooltip, extractDomain } from "./globals";
import { PluginUpdater } from "./pluginupdater";
import SummarPlugin from "./main";
import { ConfluenceAPI } from "./confluenceapi";
import { SummarStatsModal } from "./summarstatsmodal";

export class SummarSettingsTab extends PluginSettingTab {
  plugin: SummarPlugin;
  savedTabId: string;
  deviceId: string;

  constructor(plugin: SummarPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
    this.savedTabId = 'common-tab';
    // 비동기 초기화 (가독성이 떨어짐)
    getDeviceId(plugin).then(deviceId => {
      this.deviceId = deviceId as string;
    });
  }

  async hide(): Promise<void> {
    await this.plugin.saveSettingsToFile();
    this.plugin.registerCustomCommandAndMenus();
  }

  async display(): Promise<void> {

    // SummarDebug.log(1, "SummarSettingsTab: Displaying settings tab");
    const { containerEl } = this;

    if (!containerEl || !this.plugin.settingsv2) {
      SummarDebug.error(1, "Settings or containerEl not initialized correctly.");
      return;
    }

    containerEl.empty();

    // Create tabs container
    const tabsContainer = containerEl.createDiv({ cls: 'settings-tabs' });

    // 터치패드 및 마우스 휠 이벤트 처리 (좌우 스크롤)
    tabsContainer.addEventListener("wheel", (event) => {
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        // 터치패드에서 수직 스크롤이 발생할 경우 가로 스크롤로 변환
        event.preventDefault();
        tabsContainer.scrollBy({
          left: event.deltaY * 2,
          behavior: "smooth",
        });
      }
    });

    // 탭 버튼 클릭 시 자동 스크롤 조정
    document.querySelectorAll(".settings-tab-button").forEach((button) => {
      button.addEventListener("click", (event) => {
        const target = event.currentTarget as HTMLElement;
        const containerRect = tabsContainer.getBoundingClientRect();
        const buttonRect = target.getBoundingClientRect();

        if (buttonRect.left < containerRect.left) {
          // 왼쪽에 가려진 경우
          tabsContainer.scrollBy({
            left: buttonRect.left - containerRect.left - 10,
            behavior: "smooth",
          });
        } else if (buttonRect.right > containerRect.right) {
          // 오른쪽에 가려진 경우
          tabsContainer.scrollBy({
            left: buttonRect.right - containerRect.right + 10,
            behavior: "smooth",
          });
        }
      });
    });

    // 모바일 및 터치스크린을 위한 터치 스크롤 기능 추가
    let isDragging = false;
    let startX = 0;
    let scrollLeft = 0;

    tabsContainer.addEventListener("mousedown", (event) => {
      isDragging = true;
      startX = event.pageX - tabsContainer.offsetLeft;
      scrollLeft = tabsContainer.scrollLeft;
    });

    tabsContainer.addEventListener("mouseleave", () => {
      isDragging = false;
    });

    tabsContainer.addEventListener("mouseup", () => {
      isDragging = false;
    });

    tabsContainer.addEventListener("mousemove", (event) => {
      if (!isDragging) return;
      event.preventDefault();
      const x = event.pageX - tabsContainer.offsetLeft;
      const walk = (x - startX) * 2; // 이동 거리 계산
      tabsContainer.scrollLeft = scrollLeft - walk;
    });

    // 터치스크린 지원 (모바일 환경)
    let touchStartX = 0;
    let touchScrollLeft = 0;

    tabsContainer.addEventListener("touchstart", (event) => {
      touchStartX = event.touches[0].pageX - tabsContainer.offsetLeft;
      touchScrollLeft = tabsContainer.scrollLeft;
    });

    tabsContainer.addEventListener("touchmove", (event) => {
      event.preventDefault();
      const touchX = event.touches[0].pageX - tabsContainer.offsetLeft;
      const touchMove = (touchX - touchStartX) * 2; // 이동 거리 계산
      tabsContainer.scrollLeft = touchScrollLeft - touchMove;
    });

    const tabContents = containerEl.createDiv({ cls: 'settings-tab-contents' });
    const tabs = [
      { name: 'Common', icon: 'settings', id: 'common-tab', tooltip: 'Common Settings' },
      { name: 'Webpage', icon: 'globe', id: 'webpage-tab', tooltip: 'Webpage Summary' },
      { name: 'PDF', icon: 'file-text', id: 'pdf-tab', tooltip: 'PDF Summary' },
      { name: 'Recording', icon: 'voicemail', id: 'recording-tab', tooltip: 'Transcription Summary' },
      { name: 'Schedule', icon: 'calendar-check', id: 'schedule-tab', tooltip: 'Auto recording' },
      { name: 'Custom command', icon: 'wand-sparkles', id: 'custom-tab', tooltip: 'Custom Commands' },
      { name: 'Stats', icon: 'bar-chart', id: 'stats-tab', tooltip: 'AI API Stats' },
    ];

    let activeTab = this.savedTabId;

    // Create tabs
    tabs.forEach((tab) => {
      // if (this.plugin.settings.debugLevel === 0 && tab.id === 'stats-tab') {
        
      // } else {  
        if ((tab.id !== 'pdf-tab' && tab.id !== 'schedule-tab') || (Platform.isMacOS && Platform.isDesktopApp)) {
          const setting = new Setting(tabsContainer);

          const tabButton = setting.addExtraButton((button) => {
            button.setIcon(tab.icon) // 적절한 아이콘 선택
              .setTooltip(tab.tooltip)
              .onClick(() => {
                // SummarDebug.log(3, `savedTabId: ${this.savedTabId}, tab.id: ${tab.id}`);

                this.savedTabId = activeTab = tab.id;

                // Update active state
                tabsContainer.querySelectorAll('.clickable-icon').forEach((btn) => {
                  btn.removeClass('active');
                });

                // ExtraButton의 내부 요소에 클래스 추가
                const buttonEl = setting.settingEl.querySelector('.clickable-icon');
                if (buttonEl) {
                  buttonEl.addClass('active');
                }
                // Show active tab content
                tabContents.querySelectorAll('.settings-tab-content').forEach((content) => {
                  // SummarDebug.log(3, `content.id: ${content.id}, activeTab: ${activeTab}`);
                  content.toggleClass('hidden', content.id !== activeTab);
                });
              });
          });

          // ExtraButton의 요소 직접 가져와 활성화
          const buttonEl = setting.settingEl.querySelector('.clickable-icon');
          (buttonEl as HTMLElement).dataset.id = tab.id;
          if (tab.id === activeTab) {
            if (buttonEl) buttonEl.addClass('active');
          }

        }
      // }
    });


    // Create tab contents
    (async () => {
      for (const tab of tabs) {
        const tabContent = tabContents.createDiv({
          cls: 'settings-tab-content hidden',
          attr: { id: tab.id },
        });

        if (tab.id === activeTab) {
          tabContent.removeClass('hidden');
        }

        switch (tab.id) {
          case 'common-tab':
            tabContent.style.width = "100%";
            tabContent.style.maxWidth = "none";
            await this.buildCommonSettings(tabContent);
            break;
          case 'webpage-tab':
            tabContent.style.width = "100%";
            tabContent.style.maxWidth = "none";
            await this.buildWebpageSettings(tabContent);
            break;
          case 'pdf-tab':
            if (Platform.isMacOS && Platform.isDesktopApp) {
              tabContent.style.width = "100%";
              tabContent.style.maxWidth = "none";
              await this.buildPdfSettings(tabContent);
            }
            break;
          case 'recording-tab':
            tabContent.style.width = "100%";
            tabContent.style.maxWidth = "none";
            await this.buildRecordingSettings(tabContent);
            break;
          case 'custom-tab':
            tabContent.style.width = "100%";
            tabContent.style.maxWidth = "none";
            await this.buildCustomCommandSettings(tabContent);
            break;
          case 'stats-tab':
            // 통계 대시보드 탭에 SummarStatsModal의 buildStatsView 사용
            // if (this.plugin.settings.debugLevel > 0) {
              // 1. 로딩중 표시 먼저 보여주기
              tabContent.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:320px;">
                <span style="color:var(--text-muted);font-size:1.1em;">통계 대시보드 로딩 중...</span>
              </div>`;
              // 2. 다음 tick에 실제 대시보드 렌더링 (UI thread 양보)
              setTimeout(async () => {
                tabContent.innerHTML = ""; // 기존 로딩중 메시지 제거
                const statsModal = new SummarStatsModal(this.plugin);
                await statsModal.buildStatsView(tabContent);
              }, 0);
            // }
            break;

          case 'schedule-tab':
            if (Platform.isMacOS && Platform.isDesktopApp) {
              tabContent.style.width = "100%";
              tabContent.style.maxWidth = "none";
              await this.buildCalendarSettings(tabContent);
            }
            break;
        }
      }
    })();
  }

async activateTab(tabId: string): Promise<void> {
    const { containerEl } = this;

    if (!containerEl) {
        SummarDebug.error(1, "SummarSettingsTab: containerEl is not available");
        return;
    }

    // 현재 탭 ID 저장
    this.savedTabId = tabId;

    // // 활성화할 탭 찾기
    // const tabsContainer = containerEl.querySelector('.settings-tabs');
    // const tabContents = containerEl.querySelector('.settings-tab-contents');

    // if (!tabsContainer || !tabContents) {
    //     SummarDebug.error(1, "SummarSettingsTab: tabsContainer or tabContents not found");
    //     return;
    // }

    // // 모든 버튼에서 active 클래스 제거
    // tabsContainer.querySelectorAll('.clickable-icon').forEach((btn) => {
    //   SummarDebug.log(1, `btn id: ${(btn as HTMLElement).dataset.id}`);
    //   if ((btn as HTMLElement).dataset.id === tabId) {
    //     btn.addClass('active');
    //   } else {
    //     btn.removeClass('active');
    //   }
    // });

    this.display();
    // SummarDebug.log(1, `SummarSettingsTab: Activated tab '${tabId}'`);
}

  async buildCommonSettings(containerEl: HTMLElement): Promise<void> {
    // ...기존 코드...
    containerEl.createEl("h2", { text: "Common Settings" });

    // Current version과 Available version을 Setting UI로 분리
    const currentVersion = this.plugin.manifest.version;
    let remoteVersion: string | null = null;
    let forceUpdateButton: ButtonComponent | undefined; // undefined 허용

    // Setting 생성
    const versionSetting = new Setting(containerEl)
      .setName(`Currently installed Summar version: ${currentVersion}`)
      .setDesc('Available version: checking...')
      .addButton((button) => {
        forceUpdateButton = button;
        button.setButtonText('Force update and restart');
        button.setDisabled(true);
        button.buttonEl.style.marginLeft = '12px';
        button.buttonEl.style.minWidth = '170px';
        button.buttonEl.style.fontWeight = 'bold';
        button.buttonEl.setAttribute('data-tooltip', 'This will update to the latest version and restart Obsidian.');
        button.onClick(async () => {
          if (!remoteVersion || remoteVersion === currentVersion) return;
          button.setDisabled(true);
          button.setButtonText('Updating...');
          try {
            const pluginUpdater = new PluginUpdater(this.plugin);
            await pluginUpdater.updatePlugin(true);
          } catch (error) {
            SummarDebug.error(1, 'Error during plugin update:', error);
            button.setButtonText('Force update and restart');
            button.setDisabled(false);
          }
        });
      });

    // 비동기로 최신 버전 정보 가져와서 UI 업데이트
    (async () => {
      try {
        const pluginUpdater = new PluginUpdater(this.plugin);
        // @ts-ignore
        remoteVersion = await pluginUpdater.getRemoteVersion(pluginUpdater.REMOTE_MANIFEST_URL);
        if (remoteVersion) {
          versionSetting.setDesc(`Available version: ${remoteVersion}`);
          if (forceUpdateButton) {
            if (remoteVersion !== currentVersion) {
              // 업데이트 필요: 버튼 활성화 및 하이라이트
              forceUpdateButton.setDisabled(false);
              forceUpdateButton.setCta(); // Obsidian 스타일 강조
              
              const response = await SummarRequestUrl(this.plugin,"https://api.github.com/repos/mcgabby/summar/releases/latest", false);
              const body = response.json.body;
              if (body && body.length > 0) {  
                forceUpdateButton.setTooltip('');
                const summarTooltip = new SummarTooltip(this.plugin);
                summarTooltip.attach(forceUpdateButton.buttonEl, body);
              }
            } else {
              // 최신: 버튼 비활성화
              forceUpdateButton.setDisabled(true);
              forceUpdateButton.buttonEl.classList.remove('mod-cta');
            }
          }
        } else {
          versionSetting.setDesc('Available version: unknown');
        }
      } catch (e) {
        versionSetting.setDesc('Available version: error');
      }
    })();

    // 기존 안내 메시지 및 force update/reload UI 제거
    // (message1, forceUpdate, message2, forceReload, message3 삭제)

    containerEl.createEl("p"); 

    new Setting(containerEl)
      .setName("OpenAI API Key")
      .setDesc("Enter your OpenAI API key.")
      .addText((text) => {
        text
          .setPlaceholder("Enter OpenAI API Key")
          .setValue(this.plugin.settingsv2.common.openaiApiKey || "")
          .onChange(async (value) => {
            this.plugin.settingsv2.common.openaiApiKey = value;
            await this.plugin.settingsv2.saveSettings();
          });
        const textAreaEl = text.inputEl;
        textAreaEl.style.width = "100%";
      });

    // OpenAI API Endpoint 입력란 추가
    new Setting(containerEl)
      .setName("OpenAI API Endpoint URL")
      .setDesc("(Optional) Enter the OpenAI API endpoint URL.")
      .addText((text) => {
        text
          .setPlaceholder("https://api.openai.com")
          .setValue(this.plugin.settingsv2.common.openaiApiEndpoint || "")
          .onChange(async (value) => {
            this.plugin.settingsv2.common.openaiApiEndpoint = value;
            await this.plugin.settingsv2.saveSettings();
          });
        const textAreaEl = text.inputEl;
        textAreaEl.style.width = "100%";
      });

      new Setting(containerEl)
      .setName("Gemini API Key")
      .setDesc("Enter your Gemini API key.")
      .addText((text) => {
        text
          .setPlaceholder("Enter Gemini API Key")
          .setValue(this.plugin.settingsv2.common.googleApiKey || "")
          .onChange(async (value) => {
            this.plugin.settingsv2.common.googleApiKey = value;
            await this.plugin.settingsv2.saveSettings();
          });

        const textAreaEl = text.inputEl;
        textAreaEl.style.width = "100%";
      });

      containerEl.createEl("p"); 

    new Setting(containerEl)
      .setName("Confluence API Token")
      .setDesc("Enter your Confluence API token.")
      .addText((text) => {
        text
          .setPlaceholder("Enter Confluence API Token")
          .setValue(this.plugin.settingsv2.common.confluenceApiToken || "")
          .onChange(async (value) => {
            this.plugin.settingsv2.common.confluenceApiToken = value;
            await this.plugin.settingsv2.saveSettings();
          });

        const textAreaEl = text.inputEl;
        textAreaEl.style.width = "100%";
      });

    // Confluence Base URL with a checkbox in the same line
    new Setting(containerEl)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settingsv2.common.useConfluenceAPI).onChange(async (value) => {
          this.plugin.settingsv2.common.useConfluenceAPI = value;
          await this.plugin.settingsv2.saveSettings();

          // Dynamically enable/disable the input field
          const inputField = containerEl.querySelector<HTMLInputElement>(".confluence-url-input");
          if (inputField) {
            inputField.disabled = !value;
          }
        })
      )
      .addText((text) => {
        text.setPlaceholder("Enter your Confluence Domain")
          .setValue(this.plugin.settingsv2.common.confluenceDomain || "")
          .onChange(async (value) => {
            this.plugin.settingsv2.common.confluenceDomain = value;
            await this.plugin.settingsv2.saveSettings();
          });

        const textAreaEl = text.inputEl;
        textAreaEl.style.width = "100%";

        // Assign a custom class for targeting
        text.inputEl.classList.add("confluence-url-input");

        // Disable the text field if "useConfluenceAPI" is false on initialization
        text.inputEl.disabled = !this.plugin.settingsv2.common.useConfluenceAPI;
      })
      .setName("Confluence Domain")
      .setDesc("If you want to use the Confluence Open API, toggle it on; if not, toggle it off.");
      
      let checkButton: ButtonComponent; // ButtonComponent 객체를 저장

      if (Platform.isMacOS && Platform.isDesktopApp) {
        const urlContainer = new Setting(containerEl)
        .setName("Confluence Parent Page URL")
        .setDesc(
          "To post content to a Confluence page, you need the space key and the ID of the parent page where the content will be stored. " +
          "Enter the Confluence page URL here so you can get the required space key and parent page ID.")
        .addText((text) => {
          text
            .setPlaceholder("Enter Confluence page URL")
            .setValue(this.plugin.settingsv2.common.confluenceParentPageUrl || "")
            .onChange(async (value) => {
              // URL이 변경될 때마다 저장
              checkButton.setDisabled(!value.trim()); // ButtonComponent의 메서드로 상태 변경 
            });
            const textEl = text.inputEl;
            // textEl.style.width = "calc(100% - 40px)"; // 체크 버튼을 위한 공간 확보
            // 📏 입력창 크기 크게 조정
            textEl.style.width = "100%";
            // textEl.style.height = "3em";
            textEl.style.fontSize = "1em";
            textEl.style.padding = "8px";

            // 🔠 긴 URL도 잘 보이도록
            textEl.style.whiteSpace = "normal";
            textEl.style.overflowWrap = "break-word";          
        })
        .addButton((button) => {
          checkButton = button; // ButtonComponent 객체 저장
          button
            .setButtonText("✓")
            .setClass("check-button")
            .setDisabled(true)
            .onClick(async () => {

              const urlInput = urlContainer.controlEl.querySelector("input") as HTMLInputElement;
              const url = urlInput.value.trim();
              spaceKeyInput.setValue("");
              pageIdInput.setValue("");

              if (url) {
                try {
                  // URL에서 도메인 추출 및 confluenceDomain 설정
                  const domain = extractDomain(url);
                  if (domain) {
                    this.plugin.settingsv2.common.confluenceDomain = domain;
                    // Confluence Domain 입력 필드 업데이트
                    const domainInput = containerEl.querySelector<HTMLInputElement>(".confluence-url-input");
                    if (domainInput) {
                      domainInput.value = domain;
                    }
                  }

                  const conflueceapi = new ConfluenceAPI(this.plugin);
                  const result = await conflueceapi.getPageId(url);
                  
                  // if (result.spaceKey) {
                  //   spaceKeyInput.setValue(result.spaceKey);
                  //   this.plugin.settings.confluenceParentPageSpaceKey = result.spaceKey;
                  // }
                  
                  if (result.pageId) {
                    pageIdInput.setValue(result.pageId);
                    this.plugin.settingsv2.common.confluenceParentPageId = result.pageId;
                    const spaceKey = await conflueceapi.getSpaceKey(result.pageId);
                    if (spaceKey) {
                      spaceKeyInput.setValue(spaceKey);
                      this.plugin.settingsv2.common.confluenceParentPageSpaceKey = spaceKey;
                      this.plugin.settingsv2.common.confluenceParentPageUrl = url;
                    }
                  }

                  // 설정 저장
                  await this.plugin.settingsv2.saveSettings();
                } catch (error) {
                  console.error("Error fetching page info:", error);
                }
              }
            });
          button.buttonEl.style.marginLeft = "4px";
          // checkButtonEl = button.buttonEl;
          return button;
        });

        // Space Key 입력 필드 (읽기 전용)
      let spaceKeyInput: any;
      new Setting(containerEl)
        .setName("Space Key")
        .setDesc("Space Key will be automatically filled when checking the URL")
        .addText((text) => {
          spaceKeyInput = text;
          text
            .setPlaceholder("Space Key")
            .setValue(this.plugin.settingsv2.common.confluenceParentPageSpaceKey || "")
            .setDisabled(true);
          const textEl = text.inputEl;
          textEl.style.width = "100%";
        });

      // Parent Page ID 입력 필드 (읽기 전용)
      let pageIdInput: any;
      new Setting(containerEl)
        .setName("Parent Page ID")
        .setDesc("Parent Page ID will be automatically filled when checking the URL")
        .addText((text) => {
          pageIdInput = text;
          text
            .setPlaceholder("Parent Page ID")
            .setValue(this.plugin.settingsv2.common.confluenceParentPageId || "")
            .setDisabled(true);
          const textEl = text.inputEl;
          textEl.style.width = "100%";
        });      
      }
  }

  async buildWebpageSettings(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl("h2", { text: "Webpage Summary" });

    new Setting(containerEl)
      .setName("Prompt (for Web page summary)")
      .setDesc("This prompt will guide the AI response.")
      .addDropdown(dropdown => {
        const options = this.plugin.getAllModelKeyValues("webModel");
        if (Object.keys(options).length === 0) {
          options['gpt-4o'] = 'gpt-4o'; 
          options['gpt-4.1'] = 'gpt-4.1';
          options['o1-mini'] = 'o1-mini';
          options['o3-mini'] = 'o3-mini';
        }            
        dropdown
          .addOptions(options)
          .setValue(this.plugin.settingsv2.web.webModel)
          .onChange(async (value) => {
            this.plugin.settingsv2.web.webModel = value;
            await this.plugin.settingsv2.saveSettings();
          })
      });

    // --- 버튼 2개 (set default, revert) 및 텍스트에 따른 상태 관리 ---
    let initialPrompt: string | null = null; // 탭 활성화 시의 초기값
    let setDefaultButton: ButtonComponent | undefined;
    let revertButton: ButtonComponent | undefined;
    let promptTextAreaEl: HTMLTextAreaElement;

    const promptSettingButtons = new Setting(containerEl)
      .setHeading();

    // set default 버튼
    promptSettingButtons.addButton((button) => {
      setDefaultButton = button;
      button.setButtonText("set default prompt")
        .setDisabled(true)
        .setClass("set-default-btn");
      button.onClick(async () => {
        if (setDefaultButton && !setDefaultButton.buttonEl.hasAttribute('disabled')) {
          // set default 클릭 시에도 revert 버튼은 활성화
          this.plugin.settingsv2.web.webPrompt = promptTextAreaEl.value = this.plugin.defaultPrompts.webPrompt;
          await this.plugin.settingsv2.saveSettings();
          setDefaultButton.setDisabled(true);
          if (revertButton) {
            if (promptTextAreaEl.value !== initialPrompt) {
              revertButton.setDisabled(false);
            } else {
              revertButton.setDisabled(true);
            }
          }
        }
      });
    });
    // revert 버튼
    promptSettingButtons.addButton((button) => {
      revertButton = button;
      button.setButtonText("revert")
        .setDisabled(true)
        .setClass("revert-btn");
      button.onClick(() => {
        if (initialPrompt !== null) {
          this.plugin.settingsv2.web.webPrompt = promptTextAreaEl.value = initialPrompt;
          if (revertButton) revertButton.setDisabled(true);
          // setDefaultButton 상태 재조정
          if (setDefaultButton) {
            if (promptTextAreaEl.value !== this.plugin.defaultPrompts.webPrompt) {
              setDefaultButton.setDisabled(false);
            } else {
              setDefaultButton.setDisabled(true);
            }
          }
        }
      });
    });

    // 버튼과 textarea 사이에 줄바꿈 추가
    const promptTextArea = new Setting(containerEl)
      .setHeading();

    // 텍스트에어리어 추가
    promptTextArea.addTextArea((text) => {
      const value = this.plugin.settingsv2.web.webPrompt || "";
      initialPrompt = value; // 탭 활성화 시의 초기값 저장
      text
        .setPlaceholder("Enter prompt")
        .setValue(value)
        .onChange(async (newValue) => {
          this.plugin.settingsv2.web.webPrompt = newValue;
          await this.plugin.settingsv2.saveSettings();
          // set default 버튼 상태
          if (setDefaultButton) {
            if (newValue !== this.plugin.defaultPrompts.webPrompt) {
              setDefaultButton.setDisabled(false);
            } else {
              setDefaultButton.setDisabled(true);
            }
          }
          // revert 버튼: 값이 초기값과 다르면 활성화, 같으면 비활성화
          if (revertButton) {
            if (newValue !== initialPrompt) {
              revertButton.setDisabled(false);
            } else {
              revertButton.setDisabled(true);
            }
          }
        });
      promptTextAreaEl = text.inputEl;
      promptTextAreaEl.style.width = "100%";
      promptTextAreaEl.style.height = "150px";
      promptTextAreaEl.style.resize = "none";
      // 초기화 시 set default/revert 버튼 상태 조정
      if (setDefaultButton) {
        if (value !== this.plugin.defaultPrompts.webPrompt) {
          setDefaultButton.setDisabled(false);
        } else {
          setDefaultButton.setDisabled(true);
        }
      }
      if (revertButton) {
        revertButton.setDisabled(true); // 탭 진입 시 revert는 항상 비활성화
      }
    });
  }

  async buildPdfSettings(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl("h2", { text: "PDF Summary" });

    // PDF 모델 선택 드롭다운 및 프롬프트 입력 UI를 Webpage와 동일하게 구성
    new Setting(containerEl)
      .setName("Prompt (for PDF to Markdown)")
      .setDesc("This prompt will guide the AI response.")
      .addDropdown(dropdown => {
        const options = this.plugin.getAllModelKeyValues("pdfModel");
        if (Object.keys(options).length === 0) {
          options['gpt-4o'] = 'gpt-4o';
          options['gpt-4.1'] = 'gpt-4.1';
          options['gpt-4.1-mini'] = 'gpt-4.1-mini';
        }
        dropdown
          .addOptions(options)
          .setValue(String(this.plugin.settingsv2.pdf.pdfModel))
          .onChange(async (value) => {
            this.plugin.settingsv2.pdf.pdfModel = value;
            await this.plugin.settingsv2.saveSettings();
          });
      });      

    // --- 버튼 2개 (set default, revert) 및 텍스트에 따른 상태 관리 ---
    let initialPrompt: string | null = null; // 탭 활성화 시의 초기값
    let setDefaultButton: ButtonComponent | undefined;  
    let revertButton: ButtonComponent | undefined;
    let promptTextAreaEl: HTMLTextAreaElement;

    const promptSettingButtons = new Setting(containerEl)
      .setHeading();

    // set default 버튼
    promptSettingButtons.addButton((button) => {
      setDefaultButton = button;
      button.setButtonText("set default prompt")
        .setDisabled(true)
        .setClass("set-default-btn");
      button.onClick(() => {
        if (setDefaultButton && !setDefaultButton.buttonEl.hasAttribute('disabled')) {
          // set default 클릭 시에도 revert 버튼은 활성화
          this.plugin.settingsv2.pdf.pdfPrompt = promptTextAreaEl.value = this.plugin.defaultPrompts.pdfPrompt;
          setDefaultButton.setDisabled(true);
          if (revertButton) {
            if (promptTextAreaEl.value !== initialPrompt) {
              revertButton.setDisabled(false);
            } else {
              revertButton.setDisabled(true);
            }
          }
        }
      });
    });
    // revert 버튼
    promptSettingButtons.addButton((button) => {
      revertButton = button;
      button.setButtonText("revert")
        .setDisabled(true)
        .setClass("revert-btn");
      button.onClick(() => {
        if (initialPrompt !== null) {
          this.plugin.settingsv2.pdf.pdfPrompt = promptTextAreaEl.value = initialPrompt;
          if (revertButton) revertButton.setDisabled(true);
          // setDefaultButton 상태 재조정
          if (setDefaultButton) {
            if (promptTextAreaEl.value !== this.plugin.defaultPrompts.pdfPrompt) {
              setDefaultButton.setDisabled(false);
            } else {
              setDefaultButton.setDisabled(true);
            }
          }
        }
      });
    });

    // 버튼과 textarea 사이에 줄바꿈 추가    
    const promptTextArea = new Setting(containerEl)
      .setHeading();

    // 텍스트에어리어 추가
    promptTextArea.addTextArea((text) => {
      const value = this.plugin.settingsv2.pdf.pdfPrompt || "";
      initialPrompt = value; // 탭 활성화 시의 초기값 저장
      text
        .setPlaceholder("Enter prompt")
        .setValue(value)
        .onChange(async (newValue) => {
          this.plugin.settingsv2.pdf.pdfPrompt = newValue;
          // set default 버튼 상태
          if (setDefaultButton) {
            if (newValue !== this.plugin.defaultPrompts.pdfPrompt) {
              setDefaultButton.setDisabled(false);
            } else {
              setDefaultButton.setDisabled(true);
            }
          }
          // revert 버튼: 값이 초기값과 다르면 활성화, 같으면 비활성화
          if (revertButton) {
            if (newValue !== initialPrompt) {
              revertButton.setDisabled(false);
            } else {
              revertButton.setDisabled(true);
            }
          }
        });
      promptTextAreaEl = text.inputEl;
      promptTextAreaEl.style.width = "100%";
      promptTextAreaEl.style.height = "150px";
      promptTextAreaEl.style.resize = "none";
      // 초기화 시 set default/revert 버튼 상태 조정
      if (setDefaultButton) {
        if (value !== this.plugin.defaultPrompts.webPrompt) {
          setDefaultButton.setDisabled(false);
        } else {
          setDefaultButton.setDisabled(true);
        }
      }
      if (revertButton) {
        revertButton.setDisabled(true); // 탭 진입 시 revert는 항상 비활성화
      }
    });
  }

  async buildRecordingSettings(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl("h2", { text: "Transcription Summary" });

    if ((Platform.isMacOS && Platform.isDesktopApp)) {
      new Setting(containerEl)
        .setName("Auto record on Zoom meeting")
        .setDesc("Automatically start recording when a Zoom meeting starts, and stop when it ends.")
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settingsv2.recording.autoRecordOnZoomMeeting).onChange(async (value) => {
            this.plugin.settingsv2.recording.autoRecordOnZoomMeeting = value;
            await this.plugin.settingsv2.saveSettings();
            await this.plugin.saveSettingsToFile();
            this.plugin.updateZoomAutoRecordWatcher(); // 토글 변경 시 감시 상태 갱신
          })
        );
    }
    /////////////////////////////////////////////////////
    // containerEl.createEl("h2", { text: "Audio Input Plugin Settings" });

    // Get list of audio devices
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioDevices = devices.filter(
      (audioDevice) => audioDevice.kind === "audioinput"
    );

    // Audio device dropdown
    new Setting(containerEl)
      .setName("Audio Input Device")
      .setDesc("Select the audio input device for recording.")
      .addDropdown(async (dropdown) => {

        if (audioDevices.length === 0) {
          dropdown.addOption("", "No Devices Found");
        } else {
          audioDevices.forEach((audioDevice) => {
            const label = audioDevice.label || "Unknown Device";
            const sanitizedLabel = sanitizeLabel(label);

            dropdown.addOption(sanitizedLabel, label);
          });
        }

        // 이전에 선택한 장치 라벨 불러오기
        const savedDeviceLabel = this.plugin.settingsv2.recording.selectedDeviceId[this.deviceId] || "";
        dropdown.setValue(savedDeviceLabel);

        dropdown.onChange(async (value) => {
          this.plugin.settingsv2.recording.selectedDeviceId[this.deviceId] = value;
          await this.plugin.settingsv2.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Temporary folder")
      .setDesc("Specify the path in the vault where to save the audio files and the transcription files")
      .addText((text) => {
        text
          .setPlaceholder("Specify temporary folder")
          .setValue(this.plugin.settingsv2.recording.recordingDir || "")
          .onChange(async (value) => {
            this.plugin.settingsv2.recording.recordingDir = value;
            await this.plugin.settingsv2.saveSettings();
          });

        const textAreaEl = text.inputEl;
        textAreaEl.style.width = "100%";
      });

      new Setting(containerEl)
      .setName("Save to a New Note")
      .setDesc("Enable this toggle button to save the summary results to a new note.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settingsv2.recording.saveTranscriptAndRefineToNewNote).onChange(async (value) => {
          this.plugin.settingsv2.recording.saveTranscriptAndRefineToNewNote = value;
          await this.plugin.settingsv2.saveSettings();
        }));

    // Daily Notes 연동 설정 추가
    const dailyNotesAvailable = (this.plugin.app as any).internalPlugins?.plugins?.['daily-notes']?.enabled;
    
    new Setting(containerEl)
      .setName('Add meeting links to Daily Notes')
      .setDesc(dailyNotesAvailable 
        ? 'When enabled, automatically adds links to transcripts and meeting notes to the Daily Note based on the recording date.'
        : '⚠️ Daily Notes core plugin is not enabled. Please enable it in Settings → Core plugins → Daily notes to use this feature.'
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settingsv2.recording.addLinkToDailyNotes)
          .setDisabled(!dailyNotesAvailable)
          .onChange(async (value) => {
            this.plugin.settingsv2.recording.addLinkToDailyNotes = value;
            await this.plugin.settingsv2.saveSettings();
            await this.plugin.saveSettingsToFile();
          });
      });

    // Recording Unit
    new Setting(containerEl)
      .setName("Recording Unit")
      .setDesc("Set the unit of time for recording (in seconds).")
      .addSlider((slider) => {
        slider
          .setLimits(1, 20, 1)
          .setValue(this.plugin.settingsv2.recording.recordingUnit)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settingsv2.recording.recordingUnit = value;
            await this.plugin.settingsv2.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Transcription Language")
      .setDesc("Please select the language of the recorded meeting transcript.")
      .addDropdown(dropdown =>
          dropdown
          .addOptions({
            "": "Auto Detect",
            "ko-KR": "Korean (ko)",
            "ja-JP": "Japanese (ja)",
            "en-US": "English (en)",
            "zh-TW": "Chinese (zh)",
            "th-TH": "ภาษาไทย (th)",
            "vi-VN": "Tiếng Việt (vi)"
          })
          .setValue(this.plugin.settingsv2.recording.recordingLanguage || "")
          .onChange(async (value) => {
            this.plugin.settingsv2.recording.recordingLanguage = value;
            await this.plugin.settingsv2.saveSettings();
          })
      );


    // Speech to Text Model dropdown 및 프롬프트 영역
    let promptSettingDiv: HTMLDivElement | null = null;
    let promptTextArea: HTMLTextAreaElement | null = null;
    let promptButtonsDiv: HTMLDivElement | null = null;
    
    // STT 프롬프트 버튼 관리 변수들
    let initialSttPrompt: string | null = null;
    let setDefaultSttButton: ButtonComponent | undefined;
    let revertSttButton: ButtonComponent | undefined;
    
    new Setting(containerEl)
      .setName("Speech to Text Model")
      .setDesc("Select the STT model to transcribe the audio")
      .addDropdown(dropdown => {
        const options = this.plugin.getAllModelKeyValues("sttModel");
        if (Object.keys(options).length === 0) {
          options['whisper-1'] = 'whisper-1';
          options['gpt-4o-mini-transcribe'] = 'gpt-4o-mini-transcribe';
          options['gpt-4o-transcribe'] = 'gpt-4o-transcribe';
          options['gemini-2.0-flash'] = 'gemini-2.0-flash';
        }
        dropdown
          .addOptions(options)
          .setValue(this.plugin.settingsv2.recording.sttModel)
          .onChange(async (value) => {
            this.plugin.settingsv2.recording.sttModel = value;
            await this.plugin.settingsv2.saveSettings();
            
            // 프롬프트 영역 표시/숨김 처리
            if (promptSettingDiv && promptButtonsDiv) {
              if (value === "gpt-4o-mini-transcribe" || 
                value === "gpt-4o-transcribe" ||
                value === "gemini-2.0-flash" ||
                value === "gemini-2.5-flash") {
                promptSettingDiv.style.display = "";
                promptButtonsDiv.style.display = "";
                // 해당 모델의 프롬프트 값으로 텍스트 영역 업데이트
                if (promptTextArea) {
                  const newPrompt = this.plugin.settingsv2.recording.sttPrompt[value] || "";
                  promptTextArea.value = newPrompt;
                  initialSttPrompt = newPrompt; // 새로운 초기값 설정
                  
                  // 버튼 상태 업데이트
                  const defaultPrompt = this.plugin.defaultPrompts.sttPrompt[value] || "";
                  if (setDefaultSttButton) {
                    setDefaultSttButton.setDisabled(newPrompt === defaultPrompt);
                  }
                  if (revertSttButton) {
                    revertSttButton.setDisabled(true); // 모델 변경 시 revert는 비활성화
                  }
                }
              } else {
                promptSettingDiv.style.display = "none";
                promptButtonsDiv.style.display = "none";
              }
            }
          });
      });

    // STT 프롬프트 버튼들을 위한 별도 div
    promptButtonsDiv = containerEl.createDiv({ cls: "transcription-prompt-buttons" });
    const sttPromptSettingButtons = new Setting(promptButtonsDiv)
      .setHeading();

    // set default 버튼
    sttPromptSettingButtons.addButton((button) => {
      setDefaultSttButton = button;
      button.setButtonText("set default prompt")
        .setDisabled(true)
        .setClass("set-default-btn");
      button.onClick(async () => {
        if (setDefaultSttButton && !setDefaultSttButton.buttonEl.hasAttribute('disabled')) {
          const selectedModel = this.plugin.settingsv2.recording.sttModel;
          const defaultPrompt = this.plugin.defaultPrompts.sttPrompt[selectedModel] || "";
          
          this.plugin.settingsv2.recording.sttPrompt[selectedModel] = defaultPrompt;
          if (promptTextArea) {
            promptTextArea.value = defaultPrompt;
          }
          await this.plugin.settingsv2.saveSettings();
          
          setDefaultSttButton.setDisabled(true);
          if (revertSttButton) {
            if (defaultPrompt !== initialSttPrompt) {
              revertSttButton.setDisabled(false);
            } else {
              revertSttButton.setDisabled(true);
            }
          }
        }
      });
    });

    // revert 버튼
    sttPromptSettingButtons.addButton((button) => {
      revertSttButton = button;
      button.setButtonText("revert")
        .setDisabled(true)
        .setClass("revert-btn");
      button.onClick(async () => {
        if (initialSttPrompt !== null) {
          const selectedModel = this.plugin.settingsv2.recording.sttModel;
          this.plugin.settingsv2.recording.sttPrompt[selectedModel] = initialSttPrompt;
          if (promptTextArea) {
            promptTextArea.value = initialSttPrompt;
          }
          await this.plugin.settingsv2.saveSettings();
          
          if (revertSttButton) revertSttButton.setDisabled(true);
          
          // setDefaultButton 상태 재조정
          if (setDefaultSttButton) {
            const defaultPrompt = this.plugin.defaultPrompts.sttPrompt[selectedModel] || "";
            if (initialSttPrompt !== defaultPrompt) {
              setDefaultSttButton.setDisabled(false);
            } else {
              setDefaultSttButton.setDisabled(true);
            }
          }
        }
      });
    });

    // 텍스트에어리어를 별도의 div로 감싸고, 클래스를 부여
    promptSettingDiv = containerEl.createDiv({ cls: "transcription-prompt-setting" });
    new Setting(promptSettingDiv)
      .setHeading()
      .addTextArea((text) => {
        const currentModel = this.plugin.settingsv2.recording.sttModel;
        const currentPrompt = this.plugin.settingsv2.recording.sttPrompt[currentModel] || "";
        initialSttPrompt = currentPrompt; // 초기값 저장
        
        text
          .setPlaceholder("Enter prompt for transcribing")
          .setValue(currentPrompt)
          .onChange(async (value) => {
            const selectedModel = this.plugin.settingsv2.recording.sttModel;
            if (selectedModel === "gpt-4o-mini-transcribe" || 
                selectedModel === "gpt-4o-transcribe" ||
                selectedModel === "gemini-2.0-flash" ||
                selectedModel === "gemini-2.5-flash") {
              this.plugin.settingsv2.recording.sttPrompt[selectedModel] = value;
              await this.plugin.settingsv2.saveSettings();
              
              // 버튼 상태 업데이트
              const defaultPrompt = this.plugin.defaultPrompts.sttPrompt[selectedModel] || "";
              if (setDefaultSttButton) {
                setDefaultSttButton.setDisabled(value === defaultPrompt);
              }
              if (revertSttButton) {
                revertSttButton.setDisabled(value === initialSttPrompt);
              }
            }
          });

        promptTextArea = text.inputEl;
        promptTextArea.classList.add("transcription-prompt-textarea");
        promptTextArea.style.width = "100%";
        promptTextArea.style.height = "150px";
        promptTextArea.style.resize = "none";
        
        // 초기 버튼 상태 설정
        const initModel = this.plugin.settingsv2.recording.sttModel;
        const defaultPrompt = this.plugin.defaultPrompts.sttPrompt[initModel] || "";
        if (setDefaultSttButton) {
          setDefaultSttButton.setDisabled(currentPrompt === defaultPrompt);
        }
        if (revertSttButton) {
          revertSttButton.setDisabled(true); // 초기에는 항상 비활성화
        }
      });

    // 드롭다운 값에 따라 최초 표시/숨김 상태를 정확히 반영 (display로 직접 제어)
    const currentSttModel = this.plugin.settingsv2.recording.sttModel;
    if (currentSttModel !== "gpt-4o-mini-transcribe" 
      && currentSttModel !== "gpt-4o-transcribe"
      && currentSttModel !== "gemini-2.0-flash"
      && currentSttModel !== "gemini-2.5-flash") {
      promptSettingDiv.style.display = "none";
      if (promptButtonsDiv) promptButtonsDiv.style.display = "none";
    } else {
      promptSettingDiv.style.display = "";
      if (promptButtonsDiv) promptButtonsDiv.style.display = "";
    }
    
    new Setting(containerEl)
      .setName("Prompt (for summarizing recorded content))")
      .setDesc("This prompt will guide the AI response.")
      .addDropdown(dropdown => {
        const options = this.plugin.getAllModelKeyValues("transcriptSummaryModel");
        if (Object.keys(options).length === 0) {
          options['gpt-4o'] = 'gpt-4o'; 
          options['gpt-4.1'] = 'gpt-4.1';
          options['o1-mini'] = 'o1-mini';
          options['o3-mini'] = 'o3-mini';
        }    

        dropdown
          .addOptions(options)
          .setValue(this.plugin.settingsv2.recording.transcriptSummaryModel)
          .onChange(async (value) => {
            this.plugin.settingsv2.recording.transcriptSummaryModel = value;
            await this.plugin.settingsv2.saveSettings();
          })
      });

    // --- 버튼 2개 (set default, revert) 및 텍스트에 따른 상태 관리 ---
    let initialPromptForSummary: string | null = null; // 탭 활성화 시의 초기값
    let setDefaultButtonForSummary: ButtonComponent | undefined;
    let revertButtonForSummary: ButtonComponent | undefined;
    let promptTextAreaElForSummary: HTMLTextAreaElement;
    const promptSettingButtonsForSummary = new Setting(containerEl)
      .setHeading();
    // set default 버튼
    promptSettingButtonsForSummary.addButton((button) => {
      setDefaultButtonForSummary = button;
      button.setButtonText("set default prompt")
        .setDisabled(true)
        .setClass("set-default-btn");
      button.onClick(() => {
        if (setDefaultButtonForSummary && !setDefaultButtonForSummary.buttonEl.hasAttribute('disabled')) {
          // set default 클릭 시에도 revert 버튼은 활성화
          this.plugin.settingsv2.recording.transcriptSummaryPrompt = promptTextAreaElForSummary.value = this.plugin.defaultPrompts.transcriptSummaryPrompt;
          setDefaultButtonForSummary.setDisabled(true);
          if (revertButtonForSummary) {
            if (promptTextAreaElForSummary.value !== initialPromptForSummary) {
              revertButtonForSummary.setDisabled(false);
            } else {
              revertButtonForSummary.setDisabled(true);
            }
          }
        }
      });
    });
    // revert 버튼
    promptSettingButtonsForSummary.addButton((button) => {
      revertButtonForSummary = button;
      button.setButtonText("revert")
        .setDisabled(true)
        .setClass("revert-btn");
      button.onClick(() => {
        if (initialPromptForSummary !== null) {
          this.plugin.settingsv2.recording.transcriptSummaryPrompt = promptTextAreaElForSummary.value = initialPromptForSummary;
          if (revertButtonForSummary) revertButtonForSummary.setDisabled(true);
          // setDefaultButton 상태 재조정
          if (setDefaultButtonForSummary) {
            if (promptTextAreaElForSummary.value !== this.plugin.defaultPrompts.transcriptSummaryPrompt) {
              setDefaultButtonForSummary.setDisabled(false);
            } else {
              setDefaultButtonForSummary.setDisabled(true);
            }
          }
        }
      });
    });
    // 버튼과 textarea 사이에 줄바꿈 추가
    const promptTextAreaForSummary = new Setting(containerEl)
      .setHeading();
    // 텍스트에어리어 추가
    promptTextAreaForSummary.addTextArea((text) => {
      const value = this.plugin.settingsv2.recording.transcriptSummaryPrompt || "";
      initialPromptForSummary = value; // 탭 활성화 시의 초기값 저장
      text
        .setPlaceholder("Enter prompt")
        .setValue(value)
        .onChange(async (newValue) => {
          this.plugin.settingsv2.recording.transcriptSummaryPrompt = newValue;
          await this.plugin.settingsv2.saveSettings();
          // set default 버튼 상태
          if (setDefaultButtonForSummary) {
            if (newValue !== this.plugin.defaultPrompts.transcriptSummaryPrompt) {
              setDefaultButtonForSummary.setDisabled(false);
            } else {
              setDefaultButtonForSummary.setDisabled(true);
            }
          }
          // revert 버튼: 값이 초기값과 다르면 활성화, 같으면 비활성화
          if (revertButtonForSummary) {
            if (newValue !== initialPromptForSummary) {
              revertButtonForSummary.setDisabled(false);
            } else {
              revertButtonForSummary.setDisabled(true);
            }
          }
        });
      promptTextAreaElForSummary = text.inputEl;
      promptTextAreaElForSummary.style.width = "100%";
      promptTextAreaElForSummary.style.height = "150px";
      promptTextAreaElForSummary.style.resize = "none";
      // 초기화 시 set default/revert 버튼 상태 조정
      if (setDefaultButtonForSummary) {
        if (value !== this.plugin.defaultPrompts.transcriptSummaryPrompt) {
          setDefaultButtonForSummary.setDisabled(false);
        } else {
          setDefaultButtonForSummary.setDisabled(true);
        }
      }
      if (revertButtonForSummary) {
        revertButtonForSummary.setDisabled(true); // 탭 진입 시 revert는 항상 비활성화
      }
    });
    /////////////////////////////////////////////////////
    containerEl.createEl("p"); 

    // Refining summary
    new Setting(containerEl)
        .setName("Refine summary based on transcription")
        .setDesc("Use this prompt to refine the summary by comparing it with the recorded transcription.")
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settingsv2.recording.refineSummary).onChange(async (value) => {
            this.plugin.settingsv2.recording.refineSummary = value;
            await this.plugin.settingsv2.saveSettings();
            const promptTextArea = containerEl.querySelector(".refining-prompt-textarea") as HTMLTextAreaElement;
            if (promptTextArea) {
              promptTextArea.parentElement?.toggleClass("hidden", !this.plugin.settingsv2.recording.refineSummary);
            }
      }));

    // --- 버튼 2개 (set default, revert) 및 텍스트에 따른 상태 관리 ---
    let initialRefinePrompt: string | null = null; // 탭 활성화 시의 초기값
    let setDefaultRefineButton: ButtonComponent | undefined;
    let revertRefineButton: ButtonComponent | undefined;
    let refinePromptTextAreaEl: HTMLTextAreaElement;
    const refinePromptSettingButtons = new Setting(containerEl)
      .setHeading();
    // set default 버튼
    refinePromptSettingButtons.addButton((button) => {
      setDefaultRefineButton = button;
      button.setButtonText("set default prompt")
        .setDisabled(true)
        .setClass("set-default-btn");
      button.onClick(() => {
        if (setDefaultRefineButton && !setDefaultRefineButton.buttonEl.hasAttribute('disabled')) {
          // set default 클릭 시에도 revert 버튼은 활성화
          this.plugin.settingsv2.recording.refineSummaryPrompt = refinePromptTextAreaEl.value = this.plugin.defaultPrompts.refineSummaryPrompt;
          setDefaultRefineButton.setDisabled(true);
          if (revertRefineButton) {
            if (refinePromptTextAreaEl.value !== initialRefinePrompt) {
              revertRefineButton.setDisabled(false);
            } else {
              revertRefineButton.setDisabled(true);
            }
          }
        }
      });
    });
    // revert 버튼
    refinePromptSettingButtons.addButton((button) => {
      revertRefineButton = button;
      button.setButtonText("revert")
        .setDisabled(true)
        .setClass("revert-btn");
      button.onClick(() => {
        if (initialRefinePrompt !== null) {
          this.plugin.settingsv2.recording.refineSummaryPrompt = refinePromptTextAreaEl.value = initialRefinePrompt;
          if (revertRefineButton) revertRefineButton.setDisabled(true);
          // setDefaultButton 상태 재조정
          if (setDefaultRefineButton) {
            if (refinePromptTextAreaEl.value !== this.plugin.defaultPrompts.refineSummaryPrompt) {
              setDefaultRefineButton.setDisabled(false);
            } else {
              setDefaultRefineButton.setDisabled(true);
            }
          }
        }
      });
    });
    // 버튼과 textarea 사이에 줄바꿈 추가
    const refinePromptTextArea = new Setting(containerEl)
      .setHeading();
    // 텍스트에어리어 추가
    refinePromptTextArea.addTextArea((text) => {
      const value = this.plugin.settingsv2.recording.refineSummaryPrompt || "";
      initialRefinePrompt = value; // 탭 활성화 시의 초기값 저장
      text
        .setPlaceholder("Enter prompt")
        .setValue(value)
        .onChange(async (newValue) => {
          this.plugin.settingsv2.recording.refineSummaryPrompt = newValue;
          await this.plugin.settingsv2.saveSettings();
          // set default 버튼 상태
          if (setDefaultRefineButton) {
            if (newValue !== this.plugin.defaultPrompts.refineSummaryPrompt) {
              setDefaultRefineButton.setDisabled(false);
            } else {
              setDefaultRefineButton.setDisabled(true);
            }
          }
          // revert 버튼: 값이 초기값과 다르면 활성화, 같으면 비활성화
          if (revertRefineButton) {
            if (newValue !== initialRefinePrompt) {
              revertRefineButton.setDisabled(false);
            } else {
              revertRefineButton.setDisabled(true);
            }
          }
        });
      refinePromptTextAreaEl = text.inputEl;
      refinePromptTextAreaEl.style.width = "100%";
      refinePromptTextAreaEl.style.height = "150px";
      refinePromptTextAreaEl.style.resize = "none";
      // 초기화 시 set default/revert 버튼 상태 조정
      if (setDefaultRefineButton) {
        if (value !== this.plugin.defaultPrompts.refineSummaryPrompt) {
          setDefaultRefineButton.setDisabled(false);
        } else {
          setDefaultRefineButton.setDisabled(true);
        }
      }
      if (revertRefineButton) {
        revertRefineButton.setDisabled(true); // 탭 진입 시 revert는 항상 비활성화
      }
    });
  
  }

  async buildCustomCommandSettings(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl("h2", { text: "Custom commands" });

    new Setting(containerEl)
      .setName("Custom Prompt (for Selected Text in the Note)")
      .setDesc("The menu name you enter here will appear in the context menu or command palette when you select highlighted text in your note. \nRunning this menu will trigger the prompt you set here.");


    for (let i = 1; i <= this.plugin.settingsv2.custom.command.length; i++) {
      this.createCustomCommandSetting(containerEl, i);
    }
    new Setting(containerEl)
      .addButton(button => button
        .setButtonText('Add Command')
        .onClick(async () => {
          if (this.plugin.settingsv2.custom.command.length < this.plugin.settingsv2.custom.max) {  
            this.plugin.settingsv2.custom.command.push({
              text: '',
              prompt: '',
              hotkey: '',
              model: 'gpt-4o',
              appendToNote: false,
              copyToClipboard: false
            });
            await this.plugin.settingsv2.saveSettings();
            this.display();
          } else {
            SummarDebug.Notice(0, `You can only add up to ${this.plugin.settingsv2.custom.max} commands.`);
          }
        }));
  }

  createCustomCommandSetting(containerEl: HTMLElement, index: number): void {
    const commandIndex = index - 1; // 0-based index for array
    const command = this.plugin.settingsv2.custom.command[commandIndex];
    
    if (!command) {
      return;
    }
    
    if (!command.model || command.model.length === 0) {
      command.model = 'gpt-4o';
      SummarDebug.log(1,`[set gpt-4o] cmd_model_${index}: ` + command.model);
    }
    else {
      SummarDebug.log(1,`cmd_model_${index}: ` + command.model);
    }

    new Setting(containerEl)
      .setHeading()
      .addText((text) => {
        text
          .setPlaceholder('Menu Name')
          .setValue(command.text)
          .onChange(async (value) => {
            command.text = value;
            await this.plugin.settingsv2.saveSettings();
          });
        const textEl = text.inputEl;
        textEl.style.width = "100%";
      })
      
      .addDropdown(dropdown => {
        const options = this.plugin.getAllModelKeyValues("customModel");
        if (Object.keys(options).length === 0) {
          options['gpt-4o'] = 'gpt-4o';
          options['gpt-4.1'] = 'gpt-4.1';
          options['o1-mini'] = 'o1-mini';
          options['o3-mini'] = 'o3-mini';
        }    

        dropdown
          .addOptions(options)
          .setValue(command.model)
          .onChange(async (value) => {
            command.model = value;
            await this.plugin.settingsv2.saveSettings();
          })
      })
  
      .addText((hotkeyInput) => {
        hotkeyInput
          .setPlaceholder('Press a hotkey...')
          .setValue(command.hotkey)
          .onChange(async (value) => {
            command.hotkey = value;
            await this.plugin.settingsv2.saveSettings();
          });
        const hotkeyEl = hotkeyInput.inputEl;
        hotkeyEl.style.width = "150px";
        hotkeyEl.readOnly = true;

        // 핫키 입력 리스너 추가
        hotkeyEl.addEventListener('keydown', async (event) => {
          event.preventDefault(); // 기본 입력 방지

          const modifiers = [];
          // if (event.ctrlKey || event.metaKey) modifiers.push('Ctrl');
          if (event.ctrlKey) modifiers.push('Ctrl');
          if (event.metaKey) modifiers.push('Cmd');
          if (event.shiftKey) modifiers.push('Shift');
          if (event.altKey) modifiers.push('Alt');

          const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
          const hotkey = [...modifiers, key].join('+');

          SummarDebug.log(1, `Hotkey changed: ${hotkey}`);
          if (hotkey !== 'Escape') {
            if (hotkey === 'Backspace' || hotkey === 'Delete' || hotkey === ' ')
              hotkeyEl.value = "";
            else
              hotkeyEl.value = hotkey;
            command.hotkey = hotkeyEl.value;
            await this.plugin.settingsv2.saveSettings();
          }
        });
      })
      .addExtraButton(button => button
        .setIcon('trash-2')
        .setTooltip('Remove Command')
        .onClick(async () => {
          this.plugin.settingsv2.custom.command.splice(commandIndex, 1);
          await this.plugin.settingsv2.saveSettings();
          this.display();
        }));


    // new Setting(containerEl)
    // .setHeading()
    // .setName("OpenAI Model")
    //   .setDesc("Select the OpenAI model to use in the prompt.")
    //   .addDropdown(dropdown =>
    //     dropdown
    //       .addOptions({
    //         "gpt-4o": "gpt-4o",
    //         "o1-mini": "o1-mini",
    //         "o3-mini": "o3-mini"
    //       })
    //       .setValue(this.plugin.settings[`cmd_model_${index}`] as string)
    //       .onChange(async (value) => {
    //         this.plugin.settings[`cmd_model_${index}`] = value;
    //       })
    //   );

      new Setting(containerEl)
      .setHeading()
      .addTextArea((textarea) => {
        textarea
          .setPlaceholder('Run OpenAI’s API using the text you selected in the note. Type the prompt you want to use here.')
          .setValue(command.prompt)
          .onChange(async (value) => {
            command.prompt = value;
            await this.plugin.settingsv2.saveSettings();
          })
        const textAreaEl = textarea.inputEl;
        textAreaEl.style.width = "100%";
        textAreaEl.style.height = "80px";
        textAreaEl.style.resize = "none";
      });

    // 옵션 토글 2개: Append Results to Note, Copy Results to Clipboard (TextArea 바로 아래, 한 줄, 우측 정렬)
    const optionRow = document.createElement('div');
    optionRow.className = 'custom-command-options-row';
    optionRow.style.display = 'flex';
    optionRow.style.justifyContent = 'flex-end';
    optionRow.style.gap = '24px';
    optionRow.style.marginTop = '4px';
    optionRow.style.marginBottom = '4px';

    // Append Results to Note
    const appendLabel = document.createElement('label');
    appendLabel.style.display = 'flex';
    appendLabel.style.alignItems = 'center';
    appendLabel.style.gap = '4px';
    appendLabel.style.fontSize = '0.95em';
    appendLabel.style.cursor = 'pointer';
    const appendToggle = document.createElement('input');
    appendToggle.type = 'checkbox';
    appendToggle.checked = command.appendToNote;
    appendToggle.addEventListener('change', async () => {
      command.appendToNote = appendToggle.checked;
      await this.plugin.settingsv2.saveSettings();
    });
    appendLabel.appendChild(appendToggle);
    appendLabel.appendChild(document.createTextNode('Append Results to Note'));
    optionRow.appendChild(appendLabel);

    // Copy Results to Clipboard
    const copyLabel = document.createElement('label');
    copyLabel.style.display = 'flex';
    copyLabel.style.alignItems = 'center';
    copyLabel.style.gap = '4px';
    copyLabel.style.fontSize = '0.95em';
    copyLabel.style.cursor = 'pointer';
    const copyToggle = document.createElement('input');
    copyToggle.type = 'checkbox';
    copyToggle.checked = command.copyToClipboard;
    copyToggle.addEventListener('change', async () => {
      command.copyToClipboard = copyToggle.checked;
      await this.plugin.settingsv2.saveSettings();
    });
    copyLabel.appendChild(copyToggle);
    copyLabel.appendChild(document.createTextNode('Copy Results to Clipboard'));
    optionRow.appendChild(copyLabel);

    containerEl.appendChild(optionRow);
  }

  async buildCalendarSettings(containerEl: HTMLElement): Promise<void> {
    // 안내문 먼저 렌더링
    containerEl.createEl('h2', { text: 'Calendar integration' });
    containerEl.createEl('p', {
      text: 'This feature works on macOS and integrates with the default macOS Calendar.'
    });

    // 권한 확인 버튼을 안내문 바로 아래에 배치
    new Setting(containerEl)
      .setName("Check Calendar Permission")
      .setDesc("Check and request access to macOS Calendar events.")
      .addButton((button) => {
        button.setButtonText("Check Permission");
        button.onClick(async () => {
          const { spawn, exec } = require('child_process');
          const { normalizePath, FileSystemAdapter } = require('obsidian');
          button.setDisabled(true);
          button.setButtonText("Checking...");
          // swift 런타임 존재 여부 확인
          exec('which swift', (err: any, stdout: string, stderr: string) => {
            if (err || !stdout.trim()) {
              // swift 런타임 없음: 안내 모달 표시
              button.setDisabled(false);
              button.setButtonText("Check Permission");
              class SwiftRuntimeModal extends Modal {
                constructor(app: App) {
                  super(app);
                }
                onOpen() {
                  const { contentEl } = this;
                  contentEl.empty();
                  contentEl.style.width = "450px";
                  contentEl.style.maxWidth = "90vw";
                  contentEl.style.padding = "32px 24px";
                  contentEl.style.textAlign = "center";
                  contentEl.createEl("h2", { text: "Swift Runtime Not Found" }).style.marginBottom = "16px";
                  // 안내 메시지 텍스트
                  const infoMsg = "Swift runtime (swift) is not installed, so calendar permission check cannot be used.";
                  const infoEl = contentEl.createEl("p", { text: infoMsg });
                  infoEl.style.fontSize = "1.08em";
                  infoEl.style.margin = "0 0 12px 0";
                  infoEl.style.wordBreak = "keep-all";
                  infoEl.style.whiteSpace = "pre-line";
                  // 설치 방법 텍스트
                  const installText =
                    "How to install:\n" +
                    "- Install Xcode or Apple Command Line Tools.\n" +
                    "- Run 'xcode-select --install' in Terminal.";
                  // 복사 가능한 textarea 생성
                  const textarea = contentEl.createEl("textarea", {
                    text: installText,
                  });
                  textarea.readOnly = true;
                  textarea.style.width = "100%";
                  textarea.style.height = "80px";
                  textarea.style.fontSize = "1.05em";
                  textarea.style.margin = "0 0 12px 0";
                  textarea.style.resize = "none";
                  textarea.style.background = "var(--background-secondary)";
                  textarea.style.border = "1px solid var(--background-modifier-border)";
                  textarea.style.borderRadius = "6px";
                  textarea.style.padding = "8px";
                  textarea.style.whiteSpace = "pre-line";
                  // 닫기 버튼
                  const closeBtn = contentEl.createEl("button", { text: "Close" });
                  closeBtn.style.marginTop = "18px";
                  closeBtn.style.padding = "8px 24px";
                  closeBtn.style.fontSize = "1em";
                  closeBtn.style.borderRadius = "6px";
                  closeBtn.style.background = "var(--background-secondary)";
                  closeBtn.style.border = "1px solid var(--background-modifier-border)";
                  closeBtn.style.cursor = "pointer";
                  closeBtn.onclick = () => this.close();
                }
                onClose() {
                  const { contentEl } = this;
                  contentEl.empty();
                }
              }
              new SwiftRuntimeModal(this.plugin.app).open();
              return;
            }
            // swift 런타임 있음: 기존 로직 실행
            const adapter = this.plugin.app.vault.adapter;
            const basePath: string = (adapter instanceof (FileSystemAdapter as any))
              ? (adapter as typeof FileSystemAdapter).getBasePath()
              : require('process').cwd();
            const scriptPath: string = normalizePath(basePath + "/.obsidian/plugins/summar/fetch_calendar.swift");
            const swiftProcess = spawn('swift', [scriptPath, '--check-permission']);
            let output: string = '';
            let errorOutput: string = '';
            swiftProcess.stdout.on('data', (data: Buffer) => {
              output += data.toString();
            });
            swiftProcess.stderr.on('data', (data: Buffer) => {
              errorOutput += data.toString();
            });
            swiftProcess.on('close', (code: number) => {
              button.setDisabled(false);
              button.setButtonText("Check Permission");
              let result = output.trim();
              let message = "";
              if (code !== 0) {
                message = `Error: ${errorOutput || 'Swift process error.'}`;
              } else if (result === "authorized") {
                message = "✅ Calendar access is authorized.";
              } else if (result === "denied") {
                message = "❌ Calendar access is denied. Please allow access in System Settings > Privacy & Security > Calendar.";
              } else if (result === "notDetermined") {
                message = "Permission request initiated. If no popup appears, please allow access manually in System Settings.";
              } else {
                message = `Unknown result: ${result}`;
              }
              class CalendarPermissionModal extends Modal {
                constructor(app: App, message: string) {
                  super(app);
                  this.message = message;
                }
                message: string;
                onOpen() {
                  const { contentEl } = this;
                  contentEl.empty();
                  // 원래 크기(360px)로 복구
                  contentEl.style.width = "360px";
                  contentEl.style.maxWidth = "90vw";
                  contentEl.style.padding = "32px 24px";
                  contentEl.style.textAlign = "center";
                  contentEl.createEl("h2", { text: "Calendar Permission Status" }).style.marginBottom = "16px";
                  const msgEl = contentEl.createEl("p", { text: this.message });
                  msgEl.style.fontSize = "1.15em";
                  msgEl.style.margin = "0 0 12px 0";
                  msgEl.style.wordBreak = "keep-all";
                  msgEl.style.whiteSpace = "pre-line";
                  // 닫기 버튼 추가
                  const closeBtn = contentEl.createEl("button", { text: "Close" });
                  closeBtn.style.marginTop = "18px";
                  closeBtn.style.padding = "8px 24px";
                  closeBtn.style.fontSize = "1em";
                  closeBtn.style.borderRadius = "6px";
                  closeBtn.style.background = "var(--background-secondary)";
                  closeBtn.style.border = "1px solid var(--background-modifier-border)";
                  closeBtn.style.cursor = "pointer";
                  closeBtn.onclick = () => this.close();
                }
                onClose() {
                  const { contentEl } = this;
                  contentEl.empty();
                }
              }
              new CalendarPermissionModal(this.plugin.app, message).open();
            });
          });
        });
      });
    // ...기존 안내문 및 권한 확인 버튼 렌더링...
    new Setting(containerEl)
      .setName('Enter the macOS calendar to search for events')
      .setDesc('Click Add Calendar and select a calendar to fetch events.')
      .addButton(button => button
        .setButtonText('Add Calendar')
        .onClick(async () => {
          if (this.plugin.settingsv2.schedule.calendarName.length < 5) {
            this.plugin.settingsv2.schedule.calendarName.push('');
            await this.plugin.settingsv2.saveSettings();
            this.display();
          } else {
            SummarDebug.Notice(0, 'You can only add up to 5 calendars.');
          }
        }));

    // 기존 캘린더 필드들을 먼저 빠르게 렌더링 (캘린더 목록 없이)
    const calendarContainer = containerEl.createDiv();
    for (let i = 1; i <= this.plugin.settingsv2.schedule.calendarName.length; i++) {
      this.createCalendarField(containerEl, i); // await 제거하고 캘린더 목록 없이 먼저 렌더링
    }

    new Setting(containerEl)
      .setName('Automatically launches Zoom meetings for calendar events.')
      .setDesc('If the toggle switch is turned on, Zoom meetings will automatically launch at the scheduled time of events')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settingsv2.schedule.autoLaunchZoomOnSchedule).onChange(async (value) => {
          this.plugin.settingsv2.schedule.autoLaunchZoomOnSchedule = value;
          await this.plugin.settingsv2.saveSettings();
          await this.plugin.calendarHandler.displayEvents(value);
          if (value) {
            this.plugin.reservedStatus.setStatusbarIcon('calendar-clock', 'red');
          } else {
            this.plugin.reservedStatus.setStatusbarIcon('calendar-x', 'var(--text-muted)');
          }
          // 하위 옵션 활성화/비활성화
          const onlyAcceptedSetting = containerEl.querySelector('.only-accepted-setting') as HTMLElement;
          if (onlyAcceptedSetting) {
            if (value) {
              onlyAcceptedSetting.removeClass('disabled');
            } else {
              onlyAcceptedSetting.addClass('disabled');
            }
          }
        }));
    
    const onlyAcceptedSetting = new Setting(containerEl)
      .setName('Only join Zoom meetings that I have accepted')
      .setDesc('When enabled, auto-launch will only work for calendar events where I have accepted the invitation. Disabled means all events with Zoom links will auto-launch.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settingsv2.schedule.autoLaunchZoomOnlyAccepted).onChange(async (value) => {
          this.plugin.settingsv2.schedule.autoLaunchZoomOnlyAccepted = value;
          await this.plugin.settingsv2.saveSettings();
          await this.plugin.saveSettingsToFile();
          // 설정 변경 시 이벤트 리스트 다시 렌더링
          await this.plugin.calendarHandler.displayEvents(this.plugin.settingsv2.schedule.autoLaunchZoomOnSchedule);
        }));
    
    // 클래스 추가하여 CSS로 제어할 수 있도록 함
    onlyAcceptedSetting.settingEl.addClass('only-accepted-setting');
    
    // 초기 상태 설정
    if (!this.plugin.settingsv2.schedule.autoLaunchZoomOnSchedule) {
      onlyAcceptedSetting.settingEl.addClass('disabled');
    }

    // 이벤트 표시용 컨테이너 생성 (로딩 표시기와 함께)
    const eventsContainer = containerEl.createDiv();
    const loadingEl = eventsContainer.createEl('p', { 
      text: 'Loading calendar data...', 
      cls: 'calendar-loading' 
    });

    // 백그라운드에서 캘린더 목록과 이벤트를 비동기로 로드
    this.loadCalendarDataInBackground(eventsContainer, loadingEl);
  }

  // 백그라운드에서 캘린더 데이터를 로드하는 비동기 함수
  private async loadCalendarDataInBackground(eventsContainer: HTMLElement, loadingEl: HTMLElement): Promise<void> {
    try {
      // 캘린더 목록 로드
      const calendarsPromise = this.plugin.calendarHandler.getAvailableCalendars();
      
      // 이벤트 표시 (별도로 처리)
      const eventsPromise = (async () => {
        try {
          await this.plugin.calendarHandler.displayEvents(this.plugin.settingsv2.schedule.autoLaunchZoomOnSchedule, eventsContainer);
          loadingEl.remove(); // 이벤트 로딩 완료 후 로딩 텍스트 제거
        } catch (error: any) {
          loadingEl.textContent = 'Failed to load calendar events';
          console.error('Calendar events loading error:', error);
        }
      })();

      // 캘린더 목록 처리
      const calendars = await calendarsPromise;
      if (calendars) {
        this.updateCalendarDropdowns(calendars);
      }

      // 이벤트 로딩 대기 (에러 처리는 위에서 이미 됨)
      await eventsPromise;

    } catch (error: any) {
      loadingEl.textContent = 'Failed to load calendar data';
      console.error('Calendar data loading error:', error);
    }
  }

  // 모든 캘린더 드롭다운을 업데이트하는 헬퍼 함수
  private updateCalendarDropdowns(calendars: string[]): void {
    // 모든 캘린더 드롭다운을 찾아서 업데이트
    const dropdowns = document.querySelectorAll('[data-calendar-dropdown]');
    dropdowns.forEach((dropdown) => {
      const selectEl = dropdown as HTMLSelectElement;
      const currentValue = selectEl.value;
      
      // 기존 옵션 제거
      while (selectEl.options.length > 0) selectEl.remove(0);
      
      // 새 옵션 추가
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Select calendar';
      selectEl.appendChild(defaultOption);
      
      calendars.forEach((calendar) => {
        const option = document.createElement('option');
        option.value = calendar;
        option.textContent = calendar;
        selectEl.appendChild(option);
      });
      
      // 기존 값 복원
      selectEl.value = currentValue;
      selectEl.disabled = false;
    });
  }

  async createCalendarField(containerEl: HTMLElement, index: number, calendars?: string[]): Promise<void> {
    const setting = new Setting(containerEl)
      .setHeading();

    // 1. V2 설정에서 현재 값 가져오기
    const currentValue = this.plugin.settingsv2.schedule.calendarName[index - 1] || '';
    let dropdownComponent: any = null;
    setting.addDropdown((dropdown) => {
      dropdownComponent = dropdown;
      const selectEl = (dropdown as any).selectEl as HTMLSelectElement;
      
      // 캘린더 드롭다운임을 표시하는 데이터 속성 추가
      selectEl.setAttribute('data-calendar-dropdown', 'true');
      
      dropdown.addOption('', 'Select calendar');
      if (currentValue) {
        dropdown.addOption(currentValue, currentValue);
      }
      dropdown.setValue(currentValue);
      selectEl.disabled = true; // 최초엔 disable
      dropdown.onChange(async (value: string) => {
        this.plugin.settingsv2.schedule.calendarName[index - 1] = value;
        await this.plugin.settingsv2.saveSettings();
        await this.plugin.calendarHandler.updateScheduledMeetings();
        await this.plugin.calendarHandler.displayEvents();
      });
    });

    // 캘린더 목록이 제공되면 즉시 업데이트
    if (calendars !== undefined) {
      this.updateSingleCalendarDropdown(dropdownComponent, calendars, currentValue);
    }

    // 삭제 버튼은 기존대로 유지
    setting.addExtraButton(button => button
      .setIcon('trash-2')
      .setTooltip('Remove Calendar')
      .onClick(async () => {
        this.plugin.settingsv2.schedule.calendarName.splice(index - 1, 1);
        await this.plugin.settingsv2.saveSettings();
        this.display();
        await this.plugin.calendarHandler.updateScheduledMeetings();
        await this.plugin.calendarHandler.displayEvents();
      })
    );
  }

  // 단일 캘린더 드롭다운 업데이트 헬퍼 함수
  private updateSingleCalendarDropdown(dropdownComponent: any, calendars: string[], currentValue: string): void {
    if (dropdownComponent) {
      const selectEl = (dropdownComponent as any).selectEl as HTMLSelectElement;
      selectEl.disabled = false;
      // 기존 옵션 모두 제거
      while (selectEl.options.length > 0) selectEl.remove(0);
      dropdownComponent.addOption('', 'Select calendar');
      if (calendars && calendars.length > 0) {
        calendars.forEach((item: string) => {
          dropdownComponent.addOption(item, item);
        });
      }
      dropdownComponent.setValue(currentValue);
    }
  }
}

