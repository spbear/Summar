// Jest global types - using proper Jest type definitions
/// <reference types="jest" />

// Additional custom types for testing
declare global {
  namespace NodeJS {
    interface Global {
      app: any;
      Notice: any;
      Modal: any;
      Setting: any;
      PluginSettingTab: any;
    }
  }
}

// Mock types for Obsidian API
interface MockApp {
  vault: {
    adapter: {
      fs: {
        promises: {
          readFile: jest.MockedFunction<any>;
          writeFile: jest.MockedFunction<any>;
          mkdir: jest.MockedFunction<any>;
        }
      }
    };
    read: jest.MockedFunction<any>;
    create: jest.MockedFunction<any>;
    modify: jest.MockedFunction<any>;
    delete: jest.MockedFunction<any>;
  };
  workspace: {
    getActiveFile: jest.MockedFunction<any>;
    openLinkText: jest.MockedFunction<any>;
  };
  metadataCache: {
    getFirstLinkpathDest: jest.MockedFunction<any>;
  };
}

interface MockPlugin {
  app: MockApp;
  manifest: {
    version: string;
  };
  loadData: jest.MockedFunction<any>;
  saveData: jest.MockedFunction<any>;
}

export { MockApp, MockPlugin };
