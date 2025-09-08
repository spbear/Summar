import { SummarDebug, SummarViewContainer, showSettingsTab, SummarRequestUrl } from "./globals";
import SummarPlugin from "./main";
import { IndexedDBManager, TrackedAPIClient } from "./summarailog";

export interface SummarAIResponse {
  status: number;
  json: any;
  text: string;
  statsId: string;
}

export class SummarAIParam {
  role: string;
  text: string;

  constructor(role: string = '', text: string = '') {
    this.role = role;
    this.text = text;
  }
}

export class SummarAI extends SummarViewContainer {
  aiModel: string = '';
  aiProvider: string = '';
  aiKey: string = '';
  feature: string = '';
  response: SummarAIResponse = { status: 0, json: null, text: '', statsId: '' };
  

  constructor(plugin: SummarPlugin, aiModel: string, feature: string) {
    super(plugin);
    this.aiModel = aiModel;
    this.feature = feature;

    const model = aiModel.toLowerCase().trim();

    if (model.includes('gpt') || 
      model.includes('davinci') || model.includes('curie') ||
      model.startsWith('o3-') || model.startsWith('o1-') ||
      model.includes('babbage') || model.includes('ada') || 
      model.includes('whisper')) {
      this.aiProvider = 'openai';
      this.aiKey = plugin.settingsv2.common.openaiApiKey;
    } else if (model.includes('gemini') || model.includes('bison') || model.includes('palm')) {
      this.aiProvider = 'gemini';
      this.aiKey = plugin.settingsv2.common.googleApiKey;
    } else if (model.includes('claude')) {
      this.aiProvider = 'anthropic';
      this.aiKey = '';
    } else if (model.includes('azure')) {
      this.aiProvider = 'azure';
      this.aiKey = '';
    } else if (model.includes('command')) {
      this.aiProvider = 'cohere';
      this.aiKey = '';
    } else {
      this.aiProvider = 'unknown';
      this.aiKey = '';
    }
    SummarDebug.log(3, `SummarAI initialized with model: ${this.aiModel}, provider: ${this.aiProvider}, key: ${this.aiKey}`);
  }

  hasKey(errDisplay: boolean, outputKey: string, label: string): boolean {
    if (this.aiKey && this.aiKey.length > 0) {
      return true;
    } else if (errDisplay) {
      const errorMessage = `Please configure ${this.aiProvider} API key in the plugin settings.`;
      this.setOutputRecord(outputKey, label)
			this.updateOutputText(errorMessage);
			// this.enableNewNote(false, outputKey);

      const fragment = document.createDocumentFragment();
      const link = document.createElement("a");
      link.textContent = `${this.aiProvider} key is missing. Please add your API key in the settings.`;
      link.href = "#";
      link.style.cursor = "pointer";
      link.style.color = "var(--text-accent)"; // 링크 색상 설정 (옵션)
      link.addEventListener("click", (event) => {
        event.preventDefault(); // 기본 동작 방지
        showSettingsTab(this.plugin, 'common-tab');
      });
      fragment.appendChild(link);
      SummarDebug.Notice(0, fragment, 0);      
    }
    return false
  }

  async complete( messages : SummarAIParam[] ): Promise<boolean> {
    if (messages && messages.length > 0) {
      if (this.aiProvider === 'openai') {
        const openaiMessages = messages.map(message => ({
          role: message.role,
          content: message.text
        }));
        const bodyContent = JSON.stringify({
          model: this.aiModel,
          messages: openaiMessages,
        });
        return await this.completeWithBody(bodyContent);
      } else if (this.aiProvider === 'gemini') {
        const contents = messages.map(message => ({
          role: message.role,
          parts: [
            {
              text: message.text
            }
          ]
        }));
        const bodyContent = JSON.stringify({
          contents: contents,
        });
        return await this.completeWithBody(bodyContent);
      }
    }
    return false;
  }

//   async completeWithBody( bodyContent: string | ArrayBuffer, contentType: string = 'application/json', apiUrl?: string ): Promise<boolean> {
  async completeWithBody( bodyContent: string, duration = -1 ): Promise<boolean> {
    try {
      const trackapi = new TrackedAPIClient(this.plugin);

      if ( bodyContent && bodyContent.length > 0 ) {
    //   if (bodyContent && (typeof bodyContent === 'string' ? bodyContent.length > 0 : bodyContent.byteLength > 0)) {
        if (this.aiProvider === 'openai') {
          // SummarDebug.log(1, `SummarAI.complete() - Using OpenAI chat/completion with model: ${this.aiModel}`);
          
        //   const response = await this.completeOpenai(bodyContent, false, contentType, apiUrl);
        const response = await this.completeOpenai(bodyContent, false);
          if (response.json &&
            response.json.choices &&
            response.json.choices.length > 0 &&
            response.json.choices[0].message &&
            response.json.choices[0].message.content
          ) {
            // SummarDebug.log(1, `OpenAI chat/completion response: \n${JSON.stringify(response.json)}`);
            this.response.status = response.status;
            this.response.json = response.json;
            this.response.text = response.json.choices[0].message.content || '';
            //trackapi.logAPICall('openai', this.aiModel, 'chat/completions', this.feature, bodyContent, response.json, true);

            const statsid: string = (await trackapi.logAPICall({ 
              provider: 'openai',
              model: this.aiModel,
              endpoint: 'chat/completions',
              feature: this.feature,
              requestData: bodyContent,
              responseData: response.json,
              duration: duration,
            })) || '';
            this.response.statsId = statsid;
            if (statsid) {
              await trackapi.logConversation(statsid, bodyContent, this.response.text);
            }
            return true;
          } else {
            // SummarDebug.log(1, `OpenAI chat/completion response without content: \n${JSON.stringify(response.json)}`);
            this.response.status = response.status;
            this.response.json = response.json;
            this.response.text = response.json.error ? response.json.error.message : 'No content available';
            // trackapi.logAPICall('openai', this.aiModel, 'chat/completions', this.feature, bodyContent, response.json, false, this.response.text);
            const statsid: string = (await trackapi.logAPICall({
                provider: 'openai',
                model: this.aiModel,
                endpoint: 'chat/completions',
                feature: this.feature,
                requestData: bodyContent,
                responseData: response.json,
                success: false,
                errorMessage: this.response.text,
            })) || '';
            this.response.statsId = statsid;
            if (statsid) {
              await trackapi.logConversation(statsid, bodyContent, this.response.text);
            }
            return false
          }
        }
        else if (this.aiProvider === 'gemini') {
          // SummarDebug.log(1, `SummarAI.complete() - Using Gemini generateContent with model: ${this.aiModel}`);

        //   const response = await this.completeGemini(bodyContent as string, false, contentType);
          const response = await this.completeGemini(bodyContent, false);
          if (response.json &&
            response.json.candidates &&
            response.json.candidates.length > 0 &&
            response.json.candidates[0].content &&
            response.json.candidates[0].content.parts &&
            response.json.candidates[0].content.parts.length > 0 &&
            response.json.candidates[0].content.parts[0].text
          ) {
            // SummarDebug.log(1, `Gemini generateContent response: \n${JSON.stringify(response.json)}`);
            this.response.status = response.status;
            this.response.json = response.json;
            this.response.text = response.json.candidates[0].content.parts[0].text || '';
            // trackapi.logAPICall('gemini', this.aiModel, 'generateContent', this.feature, bodyContent, response.json, true);
            const statsid: string = (await trackapi.logAPICall({
              provider: 'gemini',
              model: this.aiModel,
              endpoint: 'generateContent',
              feature: this.feature,
              requestData: bodyContent,
              responseData: response.json, 
            })) || '';
            this.response.statsId = statsid;
            if (statsid) {
              await trackapi.logConversation(statsid, bodyContent, this.response.text);
            }
            return true;
          } else {
            // SummarDebug.log(1, `Gemini generateContent response without content: \n${JSON.stringify(response.json)}`);
            this.response.status = response.status;
            this.response.json = response.json;
            this.response.text = response.json.error ? response.json.error.message : 'No content available';
            // trackapi.logAPICall('gemini', this.aiModel, 'generateContent', this.feature, bodyContent, response.json, false, this.response.text);
            const statsid: string = (await trackapi.logAPICall({
              provider: 'gemini',
              model: this.aiModel,
              endpoint: 'generateContent',
              feature: this.feature,
              requestData: bodyContent,
              responseData: response.json,
              success: false, 
              errorMessage: this.response.text,
            })) || '';
            this.response.statsId = statsid;
            if (statsid) {
              await trackapi.logConversation(statsid, bodyContent, this.response.text);
            }
            return false
          }
          SummarDebug.log(1, `API responses error: \n${JSON.stringify(response.json)}`);
        }
      }
      throw new Error(`Unsupported provider: ${this.aiProvider}`);
    } catch (error) {
      SummarDebug.error(1, `Error calling ${this.aiProvider} API:`, error);
      throw error;
    }
    return false;
  }

//   async completeWithBody( bodyContent: string | ArrayBuffer, contentType: string = 'application/json', apiUrl?: string ): Promise<boolean> {
  async audioTranscription( bodyContent: ArrayBuffer, contentType: string, duration: number ): Promise<any> {
    try {
      const trackapi = new TrackedAPIClient(this.plugin);

      if (bodyContent && bodyContent.byteLength > 0) {
        if (this.aiProvider === 'openai') {
          SummarDebug.log(1, `SummarAI.audioTranscription() - Using OpenAI audio/transcription with model: ${this.aiModel}, feature: ${this.feature}`);

          const endpoint = this.plugin.settingsv2.common.openaiApiEndpoint?.trim() || "https://api.openai.com";
          const url = `${endpoint.replace(/\/$/, "")}/v1/audio/transcriptions`;

          const response = await SummarRequestUrl(this.plugin, {
            url: url,
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.aiKey}`,
              "Content-Type": contentType,
            },
            body: bodyContent,
            throw: false
          });
          SummarDebug.log(1, `SummarAI.audioTranscription() response: \n${JSON.stringify(response.json)}`);
          // SummarDebug.log(1, `OpenAI model: ${this.aiModel}, feature: ${this.feature}, duration: ${duration}`);

          if (response && response.json) {
            this.response.status = response.status;
            this.response.json = response.json;
            if (response.json.text) {
              this.response.text = response.json.text.trim();
              if (response.json.duration) {
                duration = response.json.duration;
              }
              // trackapi.logAPICall('openai', this.aiModel, 'audio/transcription', this.feature, bodyContent, response.json, true, "", duration);
              const statsid: string = (await trackapi.logAPICall({
                provider: 'openai',
                model: this.aiModel,
                endpoint: 'audio/transcription',
                feature: this.feature,
                requestData: bodyContent,
                responseData: response.json,
                duration: duration,
              })) || '';
              this.response.statsId = statsid;
              if (statsid) {
                const promptSummary = `[audio] duration=${duration}s, model=${this.aiModel}, feature=${this.feature}`;
                await trackapi.logConversation(statsid, promptSummary, this.response.text);
              }
            }
            else {
              this.response.text = response.json.error ? response.json.error.message : 'No content available';
              // trackapi.logAPICall('openai', this.aiModel, 'audio/transcription', this.feature, bodyContent, response.json, false, this.response.text, duration);
              const statsid: string = (await trackapi.logAPICall({
                provider: 'openai',
                model: this.aiModel,
                endpoint: 'audio/transcription',
                feature: this.feature,
                requestData: bodyContent,
                responseData: response.json,
                success: false,
                errorMessage: this.response.text,
                duration: duration,
              })) || '';
              this.response.statsId = statsid;
              if (statsid) {
                const promptSummary = `[audio] duration=${duration}s, model=${this.aiModel}, feature=${this.feature}`;
                await trackapi.logConversation(statsid, promptSummary, this.response.text);
              }
            }
          }
//          trackapi.logAPICall('openai', this.aiModel, 'audio/transcription', this.feature, bodyContent, response.json, true);

          return response.json;

        }
      }
      throw new Error(`Unsupported provider: ${this.aiProvider}`);
    } catch (error) {
      SummarDebug.error(1, `Error calling ${this.aiProvider} API:`, error);
      throw error;
    }
    return false;
  }

  
  private async completeOpenai(
    bodyContent: string | ArrayBuffer, 
    throwFlag: boolean = true, 
    contentType: string = 'application/json',
    apiUrl?: string
  ): Promise<any> {
    try {
      // SummarDebug.log(1, `openaiApiKey: ${this.aiKey}`);
      // SummarDebug.log(1, `bodyContent: ${bodyContent}`);
      // SummarDebug.log(1, `contentType: ${contentType}`);
      // SummarDebug.log(1, `apiUrl: ${apiUrl}`);

      // 엔드포인트 설정 (비어있으면 기본값)
      let url = '';
      if (apiUrl && apiUrl.trim().length > 0) {
        url = apiUrl.trim();
      } else {
        const endpoint = this.plugin.settingsv2.common.openaiApiEndpoint?.trim() || "https://api.openai.com";
        url = `${endpoint.replace(/\/$/, "")}/v1/chat/completions`;
      }
      SummarDebug.log(1, `SummarAI.completeOpenai() with model: ${this.aiModel}, feature: ${this.feature}`);

      const response = await SummarRequestUrl(this.plugin, {
        url: url,
        method: "POST",
        headers: {
          "Content-Type": contentType ,
          "Authorization": `Bearer ${this.aiKey}`
        },
        body: bodyContent,
        throw: throwFlag,
      });
      SummarDebug.log(1, `SummarAI.completeOpenai() response: \n${JSON.stringify(response.json)}`);

      return response;
    } catch (error) {
      SummarDebug.error(1, "Error fetching data from OpenAI API:", error);
      throw error; // Re-throw the error for higher-level handling
    }
  }

  private async completeGemini(
    bodyContent: string, 
    throwFlag: boolean = true, 
    contentType: string = 'application/json' 
  ): Promise<any> {
    try {
      // SummarDebug.log(1, `geminiApiKey: ${this.aiKey}`);
      // SummarDebug.log(1, `bodyContent: ${bodyContent}`);
      SummarDebug.log(1, `SummarAI.completeGemini() with model: ${this.aiModel}, feature: ${this.feature}`);

      const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${this.aiModel}:generateContent?key=${this.aiKey}`;

      const response = await SummarRequestUrl(this.plugin, {
        url: API_URL,
        method: "POST",
        headers: {
          "Content-Type": contentType 
        },
        body: bodyContent,
        throw: throwFlag,
      });

      SummarDebug.log(1, `SummarAI.completeGemini() response: \n${JSON.stringify(response.json)}`);
      return response;
    } catch (error) {
      SummarDebug.error(1, "Error fetching data from Gemini API:", error);
      throw error; // Re-throw the error for higher-level handling
    }
  }

}
