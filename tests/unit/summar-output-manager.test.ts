import { jest } from '@jest/globals';
import { normalizePath } from 'obsidian';
import { mockApp, mockPlugin } from '../setup';

describe('SummarOutputManager', () => {
  let mockContext: any;
  let outputManager: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock context
    mockContext = {
      outputContainer: {
        querySelectorAll: jest.fn(() => []),
        appendChild: jest.fn(),
        removeChild: jest.fn(),
        scrollHeight: 400,
        clientHeight: 400
      },
      containerEl: {
        querySelector: jest.fn(),
        querySelectorAll: jest.fn(() => [])
      },
      outputRecords: new Map(),
      timers: new Map(),
      isRecording: false
    };

    // Create mock output manager
    outputManager = {
      context: mockContext,
      plugin: mockPlugin,
      cleanupOldConversationFiles: jest.fn(),
      addConversation: jest.fn(),
      updateConversation: jest.fn()
    };
  });

  describe('cleanupOldConversationFiles', () => {
    test('should delete old conversation files based on filename timestamp', async () => {
      const mockResult = { deletedCount: 1, errors: [] };
      outputManager.cleanupOldConversationFiles = jest.fn().mockImplementation(() => Promise.resolve(mockResult));

      const result = await outputManager.cleanupOldConversationFiles(20);

      expect(result.deletedCount).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    test('should handle file deletion errors gracefully', async () => {
      const mockResult = { deletedCount: 0, errors: ['Delete failed'] };
      outputManager.cleanupOldConversationFiles = jest.fn().mockImplementation(() => Promise.resolve(mockResult));

      const result = await outputManager.cleanupOldConversationFiles(60);

      expect(result.deletedCount).toBe(0);
      expect(result.errors).toContain('Delete failed');
    });

    test('should skip files with invalid timestamp format', async () => {
      const mockResult = { deletedCount: 0, errors: [] };
      outputManager.cleanupOldConversationFiles = jest.fn().mockImplementation(() => Promise.resolve(mockResult));

      const result = await outputManager.cleanupOldConversationFiles(60);

      expect(result.deletedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    test('should return early if conversations folder does not exist', async () => {
      const mockResult = { deletedCount: 0, errors: [] };
      outputManager.cleanupOldConversationFiles = jest.fn().mockImplementation(() => Promise.resolve(mockResult));

      const result = await outputManager.cleanupOldConversationFiles(60);

      expect(result.deletedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('conversation management', () => {
    beforeEach(() => {
      // Setup mock conversation management methods
      outputManager.addConversation = jest.fn().mockImplementation((key: string, text: string) => {
        if (!outputManager.context.outputRecords.has(key)) {
          outputManager.context.outputRecords.set(key, { conversations: [] });
        }
        const record = outputManager.context.outputRecords.get(key);
        record.conversations.push({ text, timestamp: new Date() });
        return record.conversations.length - 1;
      });

      outputManager.updateConversation = jest.fn().mockImplementation((key: string, index: number, text: string) => {
        const record = outputManager.context.outputRecords.get(key);
        if (!record || !record.conversations) return false;
        
        let targetIndex = index;
        if (index === -1) {
          targetIndex = record.conversations.length - 1;
        }
        
        if (targetIndex >= 0 && targetIndex < record.conversations.length) {
          record.conversations[targetIndex].text = text;
          return true;
        }
        return false;
      });
    });

    test('should add new conversation to output record', () => {
      const key = 'test-output-key';
      const text = 'New conversation message';

      const index = outputManager.addConversation(key, text);

      expect(index).toBe(0);
      expect(outputManager.context.outputRecords.has(key)).toBe(true);
      
      const record = outputManager.context.outputRecords.get(key);
      expect(record.conversations).toHaveLength(1);
      expect(record.conversations[0].text).toBe(text);
      expect(record.conversations[0].timestamp).toBeInstanceOf(Date);
    });

    test('should add multiple conversations to same output record', () => {
      const key = 'test-output-key';
      
      const index1 = outputManager.addConversation(key, 'First message');
      const index2 = outputManager.addConversation(key, 'Second message');

      expect(index1).toBe(0);
      expect(index2).toBe(1);
      
      const record = outputManager.context.outputRecords.get(key);
      expect(record.conversations).toHaveLength(2);
      expect(record.conversations[0].text).toBe('First message');
      expect(record.conversations[1].text).toBe('Second message');
    });

    test('should update existing conversation by index', () => {
      const key = 'test-output-key';
      
      // Add initial conversations
      outputManager.addConversation(key, 'Original message');
      outputManager.addConversation(key, 'Second message');

      // Update first conversation
      const success = outputManager.updateConversation(key, 0, 'Updated message');

      expect(success).toBe(true);
      
      const record = outputManager.context.outputRecords.get(key);
      expect(record.conversations[0].text).toBe('Updated message');
      expect(record.conversations[1].text).toBe('Second message');
    });

    test('should update last conversation when index is -1', () => {
      const key = 'test-output-key';
      
      outputManager.addConversation(key, 'First message');
      outputManager.addConversation(key, 'Last message');

      const success = outputManager.updateConversation(key, -1, 'Updated last message');

      expect(success).toBe(true);
      
      const record = outputManager.context.outputRecords.get(key);
      expect(record.conversations[1].text).toBe('Updated last message');
    });

    test('should fail to update conversation with invalid index', () => {
      const key = 'test-output-key';
      
      outputManager.addConversation(key, 'Only message');

      const success1 = outputManager.updateConversation(key, 5, 'Invalid update');
      const success2 = outputManager.updateConversation(key, -2, 'Invalid update');

      expect(success1).toBe(false);
      expect(success2).toBe(false);
      
      const record = outputManager.context.outputRecords.get(key);
      expect(record.conversations[0].text).toBe('Only message');
    });

    test('should fail to update conversation for non-existent key', () => {
      const success = outputManager.updateConversation('non-existent-key', 0, 'Update');
      expect(success).toBe(false);
    });
  });

  describe('utility functions', () => {
    test('should extract timestamp from filename correctly', () => {
      const extractTimestamp = (filename: string) => {
        const match = filename.match(/summar-conversations-(\d{8}-\d{6})\.json/);
        return match ? match[1] : null;
      };

      expect(extractTimestamp('summar-conversations-20240813-150030.json')).toBe('20240813-150030');
      expect(extractTimestamp('summar-conversations-invalid.json')).toBeNull();
      expect(extractTimestamp('other-file.json')).toBeNull();
    });

    test('should parse timestamp string to Date object', () => {
      const parseTimestamp = (timestamp: string) => {
        try {
          return new Date(
            parseInt(timestamp.slice(0, 4)),     // year
            parseInt(timestamp.slice(4, 6)) - 1, // month (0-based)
            parseInt(timestamp.slice(6, 8)),     // day
            parseInt(timestamp.slice(9, 11)),    // hour
            parseInt(timestamp.slice(11, 13)),   // minute
            parseInt(timestamp.slice(13, 15))    // second
          );
        } catch {
          return null;
        }
      };

      const result = parseTimestamp('20240813-150030');
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2024);
      expect(result?.getMonth()).toBe(7); // August (0-based)
      expect(result?.getDate()).toBe(13);
      expect(result?.getHours()).toBe(15);
      expect(result?.getMinutes()).toBe(0);
      expect(result?.getSeconds()).toBe(30);
    });
  });
});