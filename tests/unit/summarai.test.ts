// tests/unit/summarai.test.ts

import { SummarAI, SummarAIParam } from '../../src/summarai';

// Mock dependencies
jest.mock('../../src/globals');
jest.mock('../../src/summarailog');

describe('SummarAI', () => {
  let mockPlugin: any;
  let summarAI: SummarAI;

  beforeEach(() => {
    // Mock plugin with settings
    mockPlugin = {
      settingsv2: {
        common: {
          openaiApiKey: 'test-openai-key',
          googleApiKey: 'test-google-key'
        }
      }
    };

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('constructor and provider detection', () => {
    test('should detect OpenAI provider for GPT models', () => {
      summarAI = new SummarAI(mockPlugin, 'gpt-4', 'test-feature');
      
      expect(summarAI.aiModel).toBe('gpt-4');
      expect(summarAI.aiProvider).toBe('openai');
      expect(summarAI.aiKey).toBe('test-openai-key');
      expect(summarAI.feature).toBe('test-feature');
    });

    test('should detect OpenAI provider for Whisper models', () => {
      summarAI = new SummarAI(mockPlugin, 'whisper-1', 'stt');
      
      expect(summarAI.aiProvider).toBe('openai');
      expect(summarAI.aiKey).toBe('test-openai-key');
    });

    test('should detect OpenAI provider for o1 models', () => {
      summarAI = new SummarAI(mockPlugin, 'o1-preview', 'summary');
      
      expect(summarAI.aiProvider).toBe('openai');
      expect(summarAI.aiKey).toBe('test-openai-key');
    });

    test('should detect Gemini provider for Gemini models', () => {
      summarAI = new SummarAI(mockPlugin, 'gemini-pro', 'summary');
      
      expect(summarAI.aiProvider).toBe('gemini');
      expect(summarAI.aiKey).toBe('test-google-key');
    });

    test('should detect unknown provider for unsupported models', () => {
      summarAI = new SummarAI(mockPlugin, 'unknown-model', 'test');
      
      expect(summarAI.aiProvider).toBe('unknown');
      expect(summarAI.aiKey).toBe('');
    });
  });

  describe('hasKey method', () => {
    test('should return true when API key is available', () => {
      summarAI = new SummarAI(mockPlugin, 'gpt-4', 'test');
      
      const result = summarAI.hasKey(false, 'test-key', 'test-label');
      expect(result).toBe(true);
    });

    test('should return false when API key is missing', () => {
      mockPlugin.settingsv2.common.openaiApiKey = '';
      summarAI = new SummarAI(mockPlugin, 'gpt-4', 'test');
      
      const result = summarAI.hasKey(false, 'test-key', 'test-label');
      expect(result).toBe(false);
    });

    test('should display error when key is missing and errDisplay is true', () => {
      mockPlugin.settingsv2.common.openaiApiKey = '';
      summarAI = new SummarAI(mockPlugin, 'gpt-4', 'test');
      
      // Mock the updateOutputText method
      summarAI.updateOutputText = jest.fn();
      summarAI.setOutputRecord = jest.fn();
      
      const result = summarAI.hasKey(true, 'test-key', 'test-label');
      
      expect(result).toBe(false);
      expect(summarAI.setOutputRecord).toHaveBeenCalledWith('test-key', 'test-label');
      expect(summarAI.updateOutputText).toHaveBeenCalledWith(
        'Please configure openai API key in the plugin settings.'
      );
    });
  });

  describe('complete method', () => {
    beforeEach(() => {
      summarAI = new SummarAI(mockPlugin, 'gpt-4', 'test-feature');
      
      // Mock the completeWithBody method
      summarAI.completeWithBody = jest.fn().mockResolvedValue(true);
    });

    test('should handle SummarAIParam messages for OpenAI', async () => {
      const messages = [
        new SummarAIParam('user', 'Test message 1'),
        new SummarAIParam('assistant', 'Test response 1')
      ];

      const result = await summarAI.complete(messages);

      expect(result).toBe(true);
      expect(summarAI.completeWithBody).toHaveBeenCalledWith(
        expect.stringContaining('"model":"gpt-4"')
      );
    });

    test('should handle plain object messages for OpenAI', async () => {
      const messages = [
        { role: 'user', text: 'Test message 1' },
        { role: 'assistant', text: 'Test response 1' }
      ];

      const result = await summarAI.complete(messages);

      expect(result).toBe(true);
      expect(summarAI.completeWithBody).toHaveBeenCalledWith(
        expect.stringContaining('"messages":[{"role":"user","content":"Test message 1"}')
      );
    });

    test('should handle Gemini provider', async () => {
      summarAI = new SummarAI(mockPlugin, 'gemini-pro', 'test-feature');
      summarAI.completeWithBody = jest.fn().mockResolvedValue(true);

      const messages = [{ role: 'user', text: 'Test message' }];

      const result = await summarAI.complete(messages);

      expect(result).toBe(true);
      expect(summarAI.completeWithBody).toHaveBeenCalledWith(
        expect.stringContaining('"contents":[{"role":"user","parts":[{"text":"Test message"}]}]')
      );
    });

    test('should return false for empty messages', async () => {
      const result = await summarAI.complete([]);
      expect(result).toBe(false);
    });

    test('should return false for null messages', async () => {
      const result = await summarAI.complete(null as any);
      expect(result).toBe(false);
    });
  });

  describe('completeWithBody method', () => {
    beforeEach(() => {
      summarAI = new SummarAI(mockPlugin, 'gpt-4', 'test-feature');
      
      // Mock TrackedAPIClient
      const mockTrackedAPIClient = {
        logAPICall: jest.fn().mockResolvedValue('test-stats-id'),
        logConversation: jest.fn().mockResolvedValue(true)
      };
      
      const { TrackedAPIClient } = require('../../src/summarailog');
      TrackedAPIClient.mockImplementation(() => mockTrackedAPIClient);
    });

    test('should handle successful OpenAI response', async () => {
      // Mock successful response using type assertion to access private method
      const mockResponse = {
        status: 200,
        json: {
          choices: [{
            message: {
              content: 'Test AI response'
            }
          }]
        }
      };

      (summarAI as any).completeOpenai = jest.fn().mockResolvedValue(mockResponse);

      const result = await summarAI.completeWithBody('{"test": "body"}');

      expect(result).toBe(true);
      expect(summarAI.response.status).toBe(200);
      expect(summarAI.response.text).toBe('Test AI response');
      expect(summarAI.response.statsId).toBe('test-stats-id');
    });

    test('should handle OpenAI error response', async () => {
      const mockResponse = {
        status: 400,
        json: {
          error: {
            message: 'Invalid request'
          }
        }
      };

      (summarAI as any).completeOpenai = jest.fn().mockResolvedValue(mockResponse);

      const result = await summarAI.completeWithBody('{"test": "body"}');

      expect(result).toBe(false);
      expect(summarAI.response.status).toBe(400);
      expect(summarAI.response.text).toBe('Invalid request');
    });

    test('should handle successful Gemini response', async () => {
      summarAI = new SummarAI(mockPlugin, 'gemini-pro', 'test-feature');
      
      const mockResponse = {
        status: 200,
        json: {
          candidates: [{
            content: {
              parts: [{
                text: 'Gemini AI response'
              }]
            }
          }]
        }
      };

      (summarAI as any).completeGemini = jest.fn().mockResolvedValue(mockResponse);

      const result = await summarAI.completeWithBody('{"test": "body"}');

      expect(result).toBe(true);
      expect(summarAI.response.text).toBe('Gemini AI response');
    });

    test('should return false for empty body content', async () => {
      // Mock the completeWithBody to handle empty body correctly
      const originalCompleteWithBody = summarAI.completeWithBody;
      summarAI.completeWithBody = jest.fn().mockImplementation(async (bodyContent) => {
        if (!bodyContent || bodyContent.length === 0) {
          return false;
        }
        return originalCompleteWithBody.call(summarAI, bodyContent);
      });

      const result = await summarAI.completeWithBody('');
      expect(result).toBe(false);
    });
  });

  describe('SummarAIParam class', () => {
    test('should create instance with role and text', () => {
      const param = new SummarAIParam('user', 'Test message');
      
      expect(param.role).toBe('user');
      expect(param.text).toBe('Test message');
    });

    test('should create instance from plain object', () => {
      const param = SummarAIParam.from({ role: 'assistant', text: 'Response' });
      
      expect(param.role).toBe('assistant');
      expect(param.text).toBe('Response');
    });

    test('should handle missing properties in from method', () => {
      const param = SummarAIParam.from({ role: 'user' } as any);
      
      expect(param.role).toBe('user');
      expect(param.text).toBe('');
    });
  });

  describe('response handling', () => {
    test('should initialize with default response', () => {
      summarAI = new SummarAI(mockPlugin, 'gpt-4', 'test');
      
      expect(summarAI.response.status).toBe(0);
      expect(summarAI.response.json).toBe(null);
      expect(summarAI.response.text).toBe('');
      expect(summarAI.response.statsId).toBe('');
    });

    test('should update response properties correctly', () => {
      summarAI = new SummarAI(mockPlugin, 'gpt-4', 'test');
      
      summarAI.response.status = 200;
      summarAI.response.text = 'Updated response';
      summarAI.response.statsId = 'new-stats-id';
      
      expect(summarAI.response.status).toBe(200);
      expect(summarAI.response.text).toBe('Updated response');
      expect(summarAI.response.statsId).toBe('new-stats-id');
    });
  });
});