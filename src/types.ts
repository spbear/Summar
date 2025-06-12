export interface PluginSettings {
  settingsSchemaVersion: string;
  openaiApiKey: string;
  googleApiKey: string;

  confluenceApiToken: string;
  confluenceParentPageUrl: string;
  confluenceParentPageSpaceKey: string;
  confluenceParentPageId: string;
  useConfluenceAPI: boolean;

  confluenceDomain: string;
  systemPrompt: string;
  webPrompt: string;
  pdfPrompt: string;
  /////
  webModel: string;
  pdfModel: string;
  
  autoRecordOnZoomMeeting: boolean;
  selectedDeviceId: string;
  recordingDir: string;
  saveTranscriptAndRefineToNewNote: boolean; // recordingResultNewNote -> saveTranscriptAndRefineToNewNote : from 1.0.0
  recordingUnit: number;
  recordingLanguage: string;
    
  sttModel: string; // transcriptSTT -> sttModel : from 1.0.0
  sttPrompt: string;  // transcribingPrompt -> sttPrompt : from 1.0.0

  transcriptSummaryModel: string; // transcriptModel -> transcriptSummaryModel : from 1.0.0
  transcriptSummaryPrompt: string; // recordingPrompt -> transcriptSummaryPrompt : from 1.0.0
  
  refineSummary: boolean;
  refineSummaryPrompt: string; // refiningPrompt -> refineSummaryPrompt : from 1.0.0
  
  /////
  testUrl: string;
  debugLevel: number;
  /////



  // customModel: string;
  cmd_max: number;
  cmd_count: number;
  [key: string]: string | number | boolean;  
  
  calendar_count: number;
  calendar_fetchdays: number;
  calendar_polling_interval: number;
  
  autoLaunchZoomOnSchedule: boolean;

  openaiApiEndpoint: string; // OpenAI API 엔드포인트 URL (기본값: https://api.openai.com)

  //////////// deprecated variables
  recordingResultNewNote: boolean; // before 1.0.0
  transcriptSTT: string; // before 1.0.0
  transcribingPrompt: string; // before 1.0.0
  transcriptModel: string; // before 1.0.0
  recordingPrompt: string; // before 1.0.0
  refiningPrompt: string; // before 1.0.0
}

export interface OpenAIResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

export interface ModelInfo {
    [key: string]: string;
}

// interface CategoryModelInfo {
//     default: string;
//     models: ModelInfo;
// }

export interface ModelList {
    webModel: ModelInfo;
    pdfModel: ModelInfo;
    sttModel: ModelInfo;
    transcriptSummaryModel: ModelInfo;
    customModel: ModelInfo;
}

export interface ModelData {
    model_list: ModelList;
}

export type ModelCategory = 'webModel' | 'pdfModel' | 'sttModel' | 'transcriptSummaryModel' | 'customModel';

/////////

export interface DefaultPrompts {
    webPrompt: string;
    pdfPrompt: string;
    sttPrompt: string;
    transcriptSummaryPrompt: string;
    refineSummaryPrompt: string;
}

export interface PromptList {
    webPrompt: string[];
    pdfPrompt: string[];
    sttPrompt: string[];
    transcriptSummaryPrompt: string[];
    refineSummaryPrompt: string[];
}

export interface LangPromptData {
    [lang: string]: PromptList;
}

export interface PromptData {
    default_prompts: LangPromptData;
}

// export type PromptCategory = 'webPrompt' | 'pdfPrompt' | 'sttPrompt' | 'transcriptSummaryPrompt' | 'refineSummaryPrompt';
