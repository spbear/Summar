// tests/unit/daily-notes-handler.test.ts

import { DailyNotesHandler, DailyNotesConfig } from '../../src/dailynoteshandler';

// Mock dependencies
jest.mock('../../src/globals');

describe('DailyNotesHandler', () => {
  let mockPlugin: any;
  let dailyNotesHandler: DailyNotesHandler;
  let mockApp: any;

  beforeEach(() => {
    // Mock Obsidian app
    mockApp = {
      internalPlugins: {
        plugins: {
          'daily-notes': {
            enabled: true,
            instance: {
              options: {
                folder: 'Daily Notes',
                format: 'YYYY-MM-DD',
                template: 'Templates/Daily Note Template.md'
              }
            }
          }
        }
      },
      vault: {
        getAbstractFileByPath: jest.fn(),
        read: jest.fn(),
        create: jest.fn(),
        modify: jest.fn()
      }
    };

    // Mock plugin
    mockPlugin = {
      app: mockApp,
      settingsv2: {
        recording: {
          addLinkToDailyNotes: true
        }
      }
    };

    // Mock globals
    const globals = require('../../src/globals');
    globals.SummarDebug = {
      log: jest.fn(),
      error: jest.fn()
    };
    globals.sanitizeFileName = jest.fn().mockImplementation(name => name.replace(/[<>:"/\\|?*]/g, '-'));

    dailyNotesHandler = new DailyNotesHandler(mockPlugin);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should create DailyNotesHandler instance', () => {
      expect(dailyNotesHandler).toBeInstanceOf(DailyNotesHandler);
    });
  });

  describe('getDailyNotesConfig', () => {
    test('should return config when core plugin is enabled', async () => {
      const config = await dailyNotesHandler.getDailyNotesConfig();

      expect(config).toEqual({
        folder: 'Daily Notes',
        format: 'YYYY-MM-DD',
        template: 'Templates/Daily Note Template.md'
      });
    });

    test('should return null when core plugin is disabled', async () => {
      mockApp.internalPlugins.plugins['daily-notes'].enabled = false;

      const config = await dailyNotesHandler.getDailyNotesConfig();

      expect(config).toBeNull();
    });

    test('should use default values when options are missing', async () => {
      mockApp.internalPlugins.plugins['daily-notes'].instance.options = {};

      const config = await dailyNotesHandler.getDailyNotesConfig();

      expect(config).toEqual({
        folder: '',
        format: 'YYYY-MM-DD',
        template: ''
      });
    });

    test('should merge with community plugin config when available', async () => {
      mockApp.internalPlugins.plugins['daily-notes'].instance.options = {
        folder: 'Daily Notes'
      };

      const communityConfigFile = { path: '.obsidian/plugins/daily-notes/data.json' };
      const communityConfigContent = JSON.stringify({
        format: 'YYYY/MM/DD',
        template: 'Community Template.md'
      });

      mockApp.vault.getAbstractFileByPath.mockReturnValue(communityConfigFile);
      mockApp.vault.read.mockResolvedValue(communityConfigContent);

      const config = await dailyNotesHandler.getDailyNotesConfig();

      expect(config).toEqual({
        folder: 'Daily Notes', // Core config takes priority
        format: 'YYYY/MM/DD',   // From community config
        template: 'Community Template.md' // From community config
      });
    });

    test('should handle errors gracefully', async () => {
      mockApp.internalPlugins = null;

      const config = await dailyNotesHandler.getDailyNotesConfig();

      expect(config).toBeNull();
    });
  });

  describe('getDailyNoteFilePath', () => {
    const config: DailyNotesConfig = {
      folder: 'Daily Notes',
      format: 'YYYY-MM-DD',
      template: ''
    };

    test('should generate file path with folder', () => {
      const date = new Date('2024-08-13');
      const filePath = dailyNotesHandler.getDailyNoteFilePath(config, date);

      expect(filePath).toBe('Daily Notes/2024-08-13.md');
    });

    test('should generate file path without folder', () => {
      const configNoFolder = { ...config, folder: '' };
      const date = new Date('2024-08-13');
      
      const filePath = dailyNotesHandler.getDailyNoteFilePath(configNoFolder, date);

      expect(filePath).toBe('2024-08-13.md');
    });

    test('should use current date when no date provided', () => {
      const filePath = dailyNotesHandler.getDailyNoteFilePath(config);

      expect(filePath).toMatch(/Daily Notes\/\d{4}-\d{2}-\d{2}\.md/);
    });

    test('should format date according to different formats', () => {
      const date = new Date('2024-08-13');
      
      const formats = [
        { format: 'YYYY-MM-DD', expected: '2024-08-13' },
        { format: 'YYYYMMDD', expected: '20240813' },
        { format: 'YY-MM-DD', expected: '24-08-13' },
        { format: 'YYYY/MM/DD', expected: '2024/08/13' },
        { format: 'YYYY.MM.DD', expected: '2024.08.13' },
        { format: 'M/D/YYYY', expected: '8/13/2024' }
      ];

      formats.forEach(({ format, expected }) => {
        const testConfig = { ...config, format };
        const filePath = dailyNotesHandler.getDailyNoteFilePath(testConfig, date);
        expect(filePath).toBe(`Daily Notes/${expected}.md`);
      });
    });
  });

  describe('addMeetingLinkToDailyNote', () => {
    const mockMeetingFilePath = 'Recordings/240813-143000_meeting/summary.md';

    beforeEach(() => {
      dailyNotesHandler.getDailyNotesConfig = jest.fn().mockResolvedValue({
        folder: 'Daily Notes',
        format: 'YYYY-MM-DD',
        template: ''
      });
    });

    test('should add link to existing daily note', async () => {
      const mockDailyNoteFile = { path: 'Daily Notes/2024-08-13.md' };
      const existingContent = '# Daily Note\n\n## Meetings\n\n';
      
      mockApp.vault.getAbstractFileByPath.mockReturnValue(mockDailyNoteFile);
      mockApp.vault.read.mockResolvedValue(existingContent);

      const recordingDate = new Date('2024-08-13');
      const result = await dailyNotesHandler.addMeetingLinkToDailyNote(
        mockMeetingFilePath, 
        'summary', 
        recordingDate
      );

      expect(result).toBe(true);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockDailyNoteFile,
        expect.stringContaining('- [[summary]]')
      );
    });

    test('should create new daily note when it does not exist', async () => {
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

      const recordingDate = new Date('2024-08-13');
      const result = await dailyNotesHandler.addMeetingLinkToDailyNote(
        mockMeetingFilePath, 
        'transcript', 
        recordingDate
      );

      expect(result).toBe(true);
      expect(mockApp.vault.create).toHaveBeenCalledWith(
        'Daily Notes/2024-08-13.md',
        expect.stringContaining('- [[summary]]')
      );
    });

    test('should use template content when creating new daily note', async () => {
      const templateFile = { path: 'Templates/Daily Note Template.md' };
      const templateContent = '# {{title}}\n\n## Tasks\n\n## Meetings\n\n';
      
      mockApp.vault.getAbstractFileByPath
        .mockReturnValueOnce(null) // Daily note doesn't exist
        .mockReturnValueOnce(templateFile); // Template exists
      mockApp.vault.read.mockResolvedValue(templateContent);

      dailyNotesHandler.getDailyNotesConfig = jest.fn().mockResolvedValue({
        folder: 'Daily Notes',
        format: 'YYYY-MM-DD',
        template: 'Templates/Daily Note Template.md'
      });

      const recordingDate = new Date('2024-08-13');
      const result = await dailyNotesHandler.addMeetingLinkToDailyNote(
        mockMeetingFilePath, 
        'summary', 
        recordingDate
      );

      expect(result).toBe(true);
      expect(mockApp.vault.create).toHaveBeenCalledWith(
        'Daily Notes/2024-08-13.md',
        expect.stringContaining(templateContent)
      );
    });

    test('should not add duplicate links', async () => {
      const mockDailyNoteFile = { path: 'Daily Notes/2024-08-13.md' };
      const existingContent = '# Daily Note\n\n- [[summary]]\n\n';
      
      mockApp.vault.getAbstractFileByPath.mockReturnValue(mockDailyNoteFile);
      mockApp.vault.read.mockResolvedValue(existingContent);

      const recordingDate = new Date('2024-08-13');
      const result = await dailyNotesHandler.addMeetingLinkToDailyNote(
        mockMeetingFilePath, 
        'summary', 
        recordingDate
      );

      expect(result).toBe(true);
      expect(mockApp.vault.modify).not.toHaveBeenCalled();
    });

    test('should return false when daily notes linking is disabled', async () => {
      mockPlugin.settingsv2.recording.addLinkToDailyNotes = false;

      const result = await dailyNotesHandler.addMeetingLinkToDailyNote(mockMeetingFilePath);

      expect(result).toBe(false);
      expect(dailyNotesHandler.getDailyNotesConfig).not.toHaveBeenCalled();
    });

    test('should return false when daily notes config is not available', async () => {
      dailyNotesHandler.getDailyNotesConfig = jest.fn().mockResolvedValue(null);

      const result = await dailyNotesHandler.addMeetingLinkToDailyNote(mockMeetingFilePath);

      expect(result).toBe(false);
    });

    test('should extract date from file path when no recording date provided', async () => {
      const mockDailyNoteFile = { path: 'Daily Notes/2024-08-13.md' };
      
      mockApp.vault.getAbstractFileByPath.mockReturnValue(mockDailyNoteFile);
      mockApp.vault.read.mockResolvedValue('# Daily Note\n\n');

      const result = await dailyNotesHandler.addMeetingLinkToDailyNote(
        'Recordings/20240813-143000_meeting/transcript.md'
      );

      expect(result).toBe(true);
      expect(mockApp.vault.modify).toHaveBeenCalled();
    });

    test('should handle different meeting types', async () => {
      const mockDailyNoteFile = { path: 'Daily Notes/2024-08-13.md' };
      
      mockApp.vault.getAbstractFileByPath.mockReturnValue(mockDailyNoteFile);
      mockApp.vault.read.mockResolvedValue('# Daily Note\n\n');

      const meetingTypes = ['transcript', 'summary', 'refinement'] as const;
      
      for (const type of meetingTypes) {
        await dailyNotesHandler.addMeetingLinkToDailyNote(
          `Recordings/meeting_${type}.md`, 
          type, 
          new Date('2024-08-13')
        );
      }

      expect(mockApp.vault.modify).toHaveBeenCalledTimes(3);
    });

    test('should handle errors gracefully', async () => {
      dailyNotesHandler.getDailyNotesConfig = jest.fn().mockRejectedValue(new Error('Config error'));

      const result = await dailyNotesHandler.addMeetingLinkToDailyNote(mockMeetingFilePath);

      expect(result).toBe(false);
    });
  });

  describe('date formatting', () => {
    test('should format dates correctly for various patterns', () => {
      const testDate = new Date('2024-08-13');
      
      const formatTests = [
        { format: 'YYYY-MM-DD', expected: '2024-08-13' },
        { format: 'YYYY/MM/DD', expected: '2024/08/13' },
        { format: 'DD-MM-YYYY', expected: '13-08-2024' },
        { format: 'M/D/YY', expected: '8/13/24' },
        { format: 'YYYYMMDD', expected: '20240813' }
      ];

      formatTests.forEach(({ format, expected }) => {
        const config: DailyNotesConfig = { folder: '', format, template: '' };
        const result = dailyNotesHandler.getDailyNoteFilePath(config, testDate);
        expect(result).toBe(`${expected}.md`);
      });
    });
  });

  describe('date extraction from file paths', () => {
    test('should extract dates from various file path formats', () => {
      const pathTests = [
        { path: '/recordings/2024-08-13/summary.md', expectedDate: '2024-08-13' },
        { path: '/recordings/20240813-143000/transcript.md', expectedDate: '2024-08-13' },
        { path: '/recordings/240813_meeting/refinement.md', expectedDate: '2024-08-13' },
        { path: '/recordings/2024.08.13_notes/summary.md', expectedDate: '2024-08-13' },
        { path: '/recordings/2024/08/13/meeting.md', expectedDate: '2024-08-13' }
      ];

      pathTests.forEach(({ path, expectedDate }) => {
        // Access private method through type assertion
        const extractedDate = (dailyNotesHandler as any).extractDateFromFilePath(path);
        if (extractedDate) {
          const dateString = extractedDate.toISOString().split('T')[0];
          // For YYMMDD format (240813), it should be interpreted as 2024-08-13
          // But JavaScript Date constructor might handle timezone differently
          // So we check if the date is close to expected
          const expectedDateObj = new Date(expectedDate);
          const timeDiff = Math.abs(extractedDate.getTime() - expectedDateObj.getTime());
          const dayInMs = 24 * 60 * 60 * 1000;
          expect(timeDiff).toBeLessThan(dayInMs); // Within 1 day tolerance
        } else {
          fail(`Expected to extract date from ${path}`);
        }
      });
    });

    test('should return null for paths without valid dates', () => {
      const invalidPaths = [
        '/recordings/meeting_notes/summary.md',
        '/recordings/13-25-2024/invalid.md', // Invalid month
        '/recordings/no_date_here.md'
      ];

      invalidPaths.forEach(path => {
        const extractedDate = (dailyNotesHandler as any).extractDateFromFilePath(path);
        expect(extractedDate).toBeNull();
      });
    });
  });
});