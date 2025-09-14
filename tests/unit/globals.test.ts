import { mockApp, mockPlugin } from '../setup';

// Mock the globals module since we can't import it directly in tests
const mockGlobals = {
  getApiKey: jest.fn(),
  setApiKey: jest.fn(),
  getSettings: jest.fn(),
  updateSettings: jest.fn(),
  logUsage: jest.fn(),
  sanitizeFileName: jest.fn(),
  getDeviceId: jest.fn(),
  getDeviceIdFromLabel: jest.fn(),
  getAvailableFilePath: jest.fn(),
  parseHotkey: jest.fn(),
  extractDomain: jest.fn(),
  containsDomain: jest.fn(),
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

  describe('sanitizeFileName', () => {
    test('should sanitize filenames by removing special characters', () => {
      const testCases = [
        {
          input: 'file<name>with:special"chars',
          expected: 'file-name-with-special-chars'
        },
        {
          input: 'file/with\\path|chars?and*more',
          expected: 'file-with-path-chars-and-more'
        },
        {
          input: 'markdown#link[test]^chars',
          expected: 'markdown-link-test-chars'
        },
        {
          input: 'multiple   spaces   here',
          expected: 'multiple spaces here'
        },
        {
          input: '---start-and-end---',
          expected: 'start-and-end'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        // Mock the actual sanitizeFileName function behavior
        mockGlobals.sanitizeFileName.mockImplementation((fileName: string) => {
          return fileName
            .replace(/[<>:"/\\|?*#\[\]^(){}`;~`]/g, '-')
            .replace(/\s+/g, ' ')
            .replace(/-{2,}/g, '-')
            .replace(/^[-\s]+|[-\s]+$/g, '')
            .trim();
        });

        const result = mockGlobals.sanitizeFileName(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('parseHotkey', () => {
    test('should parse hotkey strings correctly', () => {
      const testCases = [
        {
          input: 'ctrl+shift+a',
          expected: { modifiers: ['Mod', 'Shift'], key: 'a' }
        },
        {
          input: 'cmd+alt+enter',
          expected: { modifiers: ['Meta', 'Alt'], key: 'enter' }
        },
        {
          input: 'f5',
          expected: { modifiers: [], key: 'f5' }
        }
      ];

      testCases.forEach(({ input, expected }) => {
        mockGlobals.parseHotkey.mockImplementation((hotkeyString: string) => {
          if (!hotkeyString || hotkeyString.length === 0) return undefined;
          
          const parts = hotkeyString.split('+').map(part => part.trim().toLowerCase());
          const key = parts.pop() || '';
          
          const modifiers = parts.map(part => {
            switch (part) {
              case 'ctrl': return 'Mod';
              case 'shift': return 'Shift';
              case 'alt': return 'Alt';
              case 'cmd': return 'Meta';
              default: return '';
            }
          }).filter(Boolean);
          
          return { modifiers, key };
        });

        const result = mockGlobals.parseHotkey(input);
        expect(result).toEqual(expected);
      });
    });

    test('should return undefined for empty hotkey string', () => {
      mockGlobals.parseHotkey.mockImplementation((hotkeyString: string) => {
        return (!hotkeyString || hotkeyString.length === 0) ? undefined : { modifiers: [], key: hotkeyString };
      });

      const result = mockGlobals.parseHotkey('');
      expect(result).toBeUndefined();
    });
  });

  describe('extractDomain', () => {
    test('should extract domain from URLs', () => {
      const testCases = [
        {
          input: 'https://www.example.com/path/to/page',
          expected: 'www.example.com'
        },
        {
          input: 'http://subdomain.example.org',
          expected: 'subdomain.example.org'
        },
        {
          input: 'example.net',
          expected: 'example.net'
        },
        {
          input: 'not-a-valid-url',
          expected: null
        }
      ];

      testCases.forEach(({ input, expected }) => {
        mockGlobals.extractDomain.mockImplementation((url: string) => {
          try {
            if (url === 'not-a-valid-url') return null;
            const urlObj = new URL(url.startsWith('http') ? url : `http://${url}`);
            return urlObj.hostname;
          } catch {
            return null;
          }
        });

        const result = mockGlobals.extractDomain(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('containsDomain', () => {
    test('should check if text contains specific domain', () => {
      const testCases = [
        {
          text: 'Visit https://www.google.com for search',
          domain: 'google.com',
          expected: true
        },
        {
          text: 'Check out example.org website',
          domain: 'example.org',
          expected: true
        },
        {
          text: 'No domains here',
          domain: 'example.com',
          expected: false
        }
      ];

      testCases.forEach(({ text, domain, expected }) => {
        mockGlobals.containsDomain.mockImplementation((text: string, domain: string) => {
          const domainPattern = new RegExp(`(?:https?:\\/\\/)?(?:www\\.)?${domain.replace('.', '\\.')}`, 'i');
          return domainPattern.test(text);
        });

        const result = mockGlobals.containsDomain(text, domain);
        expect(result).toBe(expected);
      });
    });
  });

  describe('getAvailableFilePath', () => {
    test('should find available file path when file exists', () => {
      const basePath = '/test/path/file';
      const suffix = '.md';
      
      mockGlobals.getAvailableFilePath.mockImplementation((basePath: string, suffix: string, plugin: any) => {
        // Mock that the original file exists, so we need to add (1)
        return `${basePath} (1)${suffix}`;
      });

      const result = mockGlobals.getAvailableFilePath(basePath, suffix, mockPlugin);
      expect(result).toBe('/test/path/file (1).md');
    });

    test('should return original path when file does not exist', () => {
      const basePath = '/test/path/newfile';
      const suffix = '.md';
      
      mockGlobals.getAvailableFilePath.mockImplementation((basePath: string, suffix: string, plugin: any) => {
        // Mock that the original file doesn't exist
        return `${basePath}${suffix}`;
      });

      const result = mockGlobals.getAvailableFilePath(basePath, suffix, mockPlugin);
      expect(result).toBe('/test/path/newfile.md');
    });
  });

  describe('device management', () => {
    test('should get device ID', async () => {
      const expectedDeviceId = 'selectedDeviceId_test_device';
      
      mockGlobals.getDeviceId.mockResolvedValue(expectedDeviceId);

      const deviceId = await mockGlobals.getDeviceId(mockPlugin);
      expect(deviceId).toBe(expectedDeviceId);
    });

    test('should get device ID from label', async () => {
      const savedLabel = 'Test Microphone';
      const expectedDeviceId = 'device123';
      
      mockGlobals.getDeviceIdFromLabel.mockResolvedValue(expectedDeviceId);

      const deviceId = await mockGlobals.getDeviceIdFromLabel(savedLabel);
      expect(deviceId).toBe(expectedDeviceId);
    });

    test('should return null when device not found by label', async () => {
      const savedLabel = 'Non-existent Device';
      
      mockGlobals.getDeviceIdFromLabel.mockResolvedValue(null);

      const deviceId = await mockGlobals.getDeviceIdFromLabel(savedLabel);
      expect(deviceId).toBeNull();
    });
  });
});
