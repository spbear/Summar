// tests/__mocks__/obsidian.js

class MockModal {
  constructor(app) {
    this.app = app;
  }
  open() {}
  close() {}
}

class MockSetting {
  constructor(containerEl) {
    this.containerEl = containerEl;
  }
  setName() { return this; }
  setDesc() { return this; }
  addText() { return this; }
  addToggle() { return this; }
  addDropdown() { return this; }
}

module.exports = {
  Notice: jest.fn(),
  requestUrl: jest.fn(),
  normalizePath: jest.fn(path => path),
  Platform: {
    isMobile: false,
    isDesktop: true,
    isWin: false,
    isMac: true,
    isLinux: false
  },
  TFile: jest.fn(),
  TFolder: jest.fn(),
  Hotkey: jest.fn(),
  Modifier: jest.fn(),
  RequestUrlParam: jest.fn(),
  RequestUrlResponsePromise: jest.fn(),
  Modal: MockModal,
  Setting: MockSetting,
  App: jest.fn()
};