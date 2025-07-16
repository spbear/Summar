import '@testing-library/jest-dom';
import type { MockApp, MockPlugin } from './types';

// Mock Obsidian classes and functions
const mockApp: MockApp = {
  vault: {
    adapter: {
      fs: {
        promises: {
          readFile: jest.fn(),
          writeFile: jest.fn(),
          mkdir: jest.fn(),
        }
      }
    },
    read: jest.fn(),
    create: jest.fn(),
    modify: jest.fn(),
    delete: jest.fn(),
  },
  workspace: {
    getActiveFile: jest.fn(),
    openLinkText: jest.fn(),
  },
  metadataCache: {
    getFirstLinkpathDest: jest.fn(),
  }
};

const mockPlugin: MockPlugin = {
  app: mockApp,
  manifest: {
    version: '1.0.0'
  },
  loadData: jest.fn(),
  saveData: jest.fn(),
};

const mockNotice = jest.fn();
const mockModal = jest.fn(() => ({
  open: jest.fn(),
  close: jest.fn(),
}));

const mockSetting = jest.fn(() => ({
  setName: jest.fn().mockReturnThis(),
  setDesc: jest.fn().mockReturnThis(),
  addText: jest.fn().mockReturnThis(),
  addButton: jest.fn().mockReturnThis(),
  addToggle: jest.fn().mockReturnThis(),
  addDropdown: jest.fn().mockReturnThis(),
}));

const mockSettingTab = jest.fn(() => ({
  containerEl: {
    createEl: jest.fn(),
    empty: jest.fn(),
  }
}));

// Global mocks
(global as any).app = mockApp;
(global as any).Notice = mockNotice;
(global as any).Modal = mockModal;
(global as any).Setting = mockSetting;
(global as any).PluginSettingTab = mockSettingTab;

// Mock fetch
global.fetch = jest.fn();

// Mock browser APIs
Object.defineProperty(window, 'navigator', {
  value: {
    language: 'en-US',
    languages: ['en-US', 'en'],
  },
  writable: true,
});

// Mock process.env for Node.js environment
process.env.NODE_ENV = 'test';

// Export mocks for use in tests
export { mockApp, mockPlugin, mockNotice, mockModal, mockSetting, mockSettingTab };
