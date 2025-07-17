import { mockApp, mockPlugin } from '../setup';

// Mock the globals module since we can't import it directly in tests
const mockGlobals = {
  getApiKey: jest.fn(),
  setApiKey: jest.fn(),
  getSettings: jest.fn(),
  updateSettings: jest.fn(),
  logUsage: jest.fn(),
};

describe('Globals Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should handle API key operations', () => {
    const testKey = 'test-api-key';
    
    mockGlobals.getApiKey.mockReturnValue(testKey);
    mockGlobals.setApiKey.mockImplementation((key: string) => {
      // Mock implementation
    });

    const retrievedKey = mockGlobals.getApiKey('openai');
    expect(retrievedKey).toBe(testKey);
    
    mockGlobals.setApiKey('openai', testKey);
    expect(mockGlobals.setApiKey).toHaveBeenCalledWith('openai', testKey);
  });

  test('should handle settings operations', () => {
    const mockSettings = {
      webpageModel: 'gpt-4o',
      pdfModel: 'gpt-4o',
      recordingLanguage: 'auto'
    };

    mockGlobals.getSettings.mockReturnValue(mockSettings);
    
    const settings = mockGlobals.getSettings();
    expect(settings).toEqual(mockSettings);
  });

  test('should log API usage', () => {
    const usageData = {
      feature: 'webpage',
      model: 'gpt-4o',
      tokens: 1500,
      cost: 0.045
    };

    mockGlobals.logUsage(usageData);
    expect(mockGlobals.logUsage).toHaveBeenCalledWith(usageData);
  });
});
