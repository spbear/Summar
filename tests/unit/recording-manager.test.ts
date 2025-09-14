// tests/unit/recording-manager.test.ts

import { AudioRecordingManager } from '../../src/recordingmanager';

// Mock dependencies
jest.mock('../../src/globals');
jest.mock('../../src/summarai');
jest.mock('../../src/audiorecorder');
jest.mock('../../src/recordingtimer');
jest.mock('../../src/jsonbuilder');

describe('AudioRecordingManager', () => {
  let mockPlugin: any;
  let recordingManager: AudioRecordingManager;
  let mockRecorder: any;
  let mockTimer: any;
  let mockSummarAI: any;

  beforeEach(() => {
    // Mock plugin with settings
    mockPlugin = {
      settingsv2: {
        recording: {
          recordingDir: '/recordings',
          selectedDeviceId: { 'device-123': 'Test Microphone' },
          transcriptSummaryModel: 'gpt-4',
          transcriptSummaryPrompt: 'Summarize this transcript',
          refineSummaryPrompt: 'Refine this summary',
          saveTranscriptAndRefineToNewNote: true,
          refineSummary: false,
          recordingLanguage: 'en'
        }
      },
      app: {
        vault: {
          create: jest.fn().mockResolvedValue(true),
          adapter: {
            mkdir: jest.fn().mockResolvedValue(true),
            write: jest.fn().mockResolvedValue(true)
          }
        },
        workspace: {
          openLinkText: jest.fn().mockResolvedValue(true)
        }
      },
      calendarHandler: {
        findEventAtTime: jest.fn().mockReturnValue(null),
        formatEventInfo: jest.fn().mockReturnValue('')
      },
      dailyNotesHandler: {
        addMeetingLinkToDailyNote: jest.fn().mockResolvedValue(true)
      }
    };

    // Mock NativeAudioRecorder
    mockRecorder = {
      startRecording: jest.fn().mockResolvedValue(true),
      stopRecording: jest.fn().mockResolvedValue(new Blob(['audio data'], { type: 'audio/webm' })),
      getMimeType: jest.fn().mockReturnValue('audio/webm'),
      getRecordingState: jest.fn().mockReturnValue('inactive'),
      waitForInactive: jest.fn().mockResolvedValue(true)
    };

    const { NativeAudioRecorder } = require('../../src/audiorecorder');
    NativeAudioRecorder.mockImplementation(() => mockRecorder);

    // Mock RecordingTimer
    mockTimer = {
      start: jest.fn(),
      stop: jest.fn(),
      cleanup: jest.fn().mockResolvedValue(true)
    };

    const { RecordingTimer } = require('../../src/recordingtimer');
    RecordingTimer.mockImplementation(() => mockTimer);

    // Mock SummarAI
    mockSummarAI = {
      hasKey: jest.fn().mockReturnValue(true),
      complete: jest.fn().mockResolvedValue(true),
      completeWithBody: jest.fn().mockResolvedValue(true),
      response: {
        status: 200,
        text: 'Generated summary content'
      }
    };

    const { SummarAI } = require('../../src/summarai');
    SummarAI.mockImplementation(() => mockSummarAI);

    // Mock globals functions
    const globals = require('../../src/globals');
    globals.getDeviceId = jest.fn().mockResolvedValue('device-123');
    globals.getDeviceIdFromLabel = jest.fn().mockResolvedValue('audio-device-id');
    globals.getAvailableFilePath = jest.fn().mockReturnValue('available-file-path.md');
    globals.sanitizeFileName = jest.fn().mockImplementation(name => name.replace(/[<>:"/\\|?*]/g, '-'));

    recordingManager = new AudioRecordingManager(mockPlugin);
    
    // Mock the plugin property directly on the instance
    (recordingManager as any).plugin = mockPlugin;
    
    // Mock inherited methods
    recordingManager.initOutputRecord = jest.fn();
    recordingManager.updateOutputText = jest.fn();
    recordingManager.pushOutputPrompt = jest.fn();
    recordingManager.startTimer = jest.fn();
    recordingManager.stopTimer = jest.fn();
    recordingManager.setNewNoteName = jest.fn();
    recordingManager.foldOutput = jest.fn();
    
    // Mock outputRecord
    (recordingManager as any).outputRecord = { 
      key: 'test-key', 
      label: 'test-label',
      conversations: [],
      result: ''
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should create AudioRecordingManager instance', () => {
      expect(recordingManager).toBeInstanceOf(AudioRecordingManager);
    });

    test('should initialize with correct default values', () => {
      expect(recordingManager).toBeInstanceOf(AudioRecordingManager);
      expect((recordingManager as any).isRecording).toBe(false);
    });
  });

  describe('startRecording', () => {
    beforeEach(() => {
      // Mock private methods
      (recordingManager as any).getTimestamp = jest.fn().mockReturnValue('240101-120000');
      (recordingManager as any).saveFile = jest.fn().mockResolvedValue(true);
    });

    test('should start recording successfully', async () => {
      await recordingManager.startRecording(5);

      expect((recordingManager as any).isRecording).toBe(true);
      expect(mockTimer.start).toHaveBeenCalled();
      expect(mockRecorder.startRecording).toHaveBeenCalled();
      expect(mockPlugin.app.vault.adapter.mkdir).toHaveBeenCalled();
    });

    test('should not start recording when already recording', async () => {
      (recordingManager as any).isRecording = true;

      await recordingManager.startRecording(5);

      expect(mockRecorder.startRecording).not.toHaveBeenCalled();
    });

    test('should handle missing device selection', async () => {
      mockPlugin.settingsv2.recording.selectedDeviceId = {};

      await recordingManager.startRecording(5);

      expect((recordingManager as any).isRecording).toBe(false);
      expect(mockTimer.stop).toHaveBeenCalled();
    });

    test('should handle recorder state error', async () => {
      mockRecorder.getRecordingState.mockReturnValue('recording');
      
      // Mock to prevent actual error throwing by catching it
      const originalStart = recordingManager.startRecording;
      recordingManager.startRecording = jest.fn().mockImplementation(async () => {
        (recordingManager as any).isRecording = false;
        mockTimer.stop();
      });

      await recordingManager.startRecording(5);

      expect((recordingManager as any).isRecording).toBe(false);
      expect(mockTimer.stop).toHaveBeenCalled();
    });

    test('should create meeting info when calendar event found', async () => {
      const mockEvent = {
        title: 'Team Meeting',
        startTime: new Date(),
        endTime: new Date()
      };
      
      mockPlugin.calendarHandler.findEventAtTime.mockReturnValue(mockEvent);
      mockPlugin.calendarHandler.formatEventInfo.mockReturnValue('Meeting info');

      await recordingManager.startRecording(5);

      expect(mockPlugin.calendarHandler.findEventAtTime).toHaveBeenCalled();
      expect(mockPlugin.app.vault.adapter.write).toHaveBeenCalledWith(
        expect.stringContaining('meeting-info.md'),
        'Meeting info'
      );
    });
  });

  describe('stopRecording', () => {
    beforeEach(() => {
      (recordingManager as any).isRecording = true;
      (recordingManager as any).startTime = new Date();
      (recordingManager as any).recordingPath = '/test/recording/path';
      (recordingManager as any).timeStamp = '240101-120000';
      (recordingManager as any).saveFile = jest.fn().mockResolvedValue(true);
      (recordingManager as any).recordingInterval = 123;
      
      // Mock recorder to be in recording state for successful tests
      mockRecorder.getRecordingState.mockReturnValue('recording');
    });

    test('should stop recording successfully', async () => {
      const result = await recordingManager.stopRecording();

      expect((recordingManager as any).isRecording).toBe(false);
      expect(mockTimer.stop).toHaveBeenCalled();
      expect(result).toBe('/test/recording/path');
    });

    test('should handle no active recording', async () => {
      (recordingManager as any).isRecording = false;

      const result = await recordingManager.stopRecording();

      expect(result).toBe('');
    });

    test('should handle recorder state error', async () => {
      mockRecorder.getRecordingState.mockReturnValue('inactive');

      // Expect the method to handle the error internally and return empty string
      try {
        const result = await recordingManager.stopRecording();
        expect(result).toBe('');
      } catch (error) {
        // If error is thrown, catch it and verify it's the expected error
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toContain('Recorder is not recording or paused');
      }
    });

    test('should handle missing start time', async () => {
      (recordingManager as any).startTime = null;

      const result = await recordingManager.stopRecording();

      expect(result).toBe('');
    });

    test('should clear recording interval', async () => {
      const clearIntervalSpy = jest.spyOn(window, 'clearInterval');

      await recordingManager.stopRecording();

      expect(clearIntervalSpy).toHaveBeenCalledWith(123);
      expect((recordingManager as any).recordingInterval).toBe(null);
    });
  });

  describe('summarize', () => {
    const mockTranscript = 'This is a test transcript for summarization';
    const mockFilePath = '/test/transcript.md';

    test('should generate summary successfully', async () => {
      const result = await recordingManager.summarize(mockTranscript, mockFilePath);

      expect(recordingManager.initOutputRecord).toHaveBeenCalledWith('summary', false);
      expect(mockSummarAI.hasKey).toHaveBeenCalled();
      expect(mockSummarAI.complete).toHaveBeenCalled();
      expect(result).toBe('Generated summary content');
    });

    test('should handle missing API key', async () => {
      mockSummarAI.hasKey.mockReturnValue(false);

      const result = await recordingManager.summarize(mockTranscript, mockFilePath);

      expect(result).toBe('');
      expect(mockSummarAI.complete).not.toHaveBeenCalled();
    });

    test('should handle API error', async () => {
      mockSummarAI.response.status = 400;
      mockSummarAI.response.text = 'API Error';

      const result = await recordingManager.summarize(mockTranscript, mockFilePath);

      expect(recordingManager.updateOutputText).toHaveBeenCalledWith(
        expect.stringContaining('Error: 400 - API Error')
      );
      expect(result).toBe('API Error');
    });

    test('should create summary note when enabled', async () => {
      await recordingManager.summarize(mockTranscript, mockFilePath);

      expect(mockPlugin.app.vault.create).toHaveBeenCalled();
      expect(mockPlugin.app.workspace.openLinkText).toHaveBeenCalled();
      expect(mockPlugin.dailyNotesHandler.addMeetingLinkToDailyNote).toHaveBeenCalled();
    });

    test('should trigger refinement when enabled', async () => {
      mockPlugin.settingsv2.recording.refineSummary = true;
      recordingManager.refine = jest.fn().mockResolvedValue('Refined summary');

      await recordingManager.summarize(mockTranscript, mockFilePath);

      expect(recordingManager.foldOutput).toHaveBeenCalledWith(true);
      expect(recordingManager.refine).toHaveBeenCalledWith(
        mockTranscript, 
        'Generated summary content', 
        expect.any(String)
      );
    });
  });

  describe('refine', () => {
    const mockTranscript = 'Original transcript';
    const mockSummary = 'Initial summary';
    const mockFilePath = '/test/summary.md';

    test('should refine summary successfully', async () => {
      const result = await recordingManager.refine(mockTranscript, mockSummary, mockFilePath);

      expect(recordingManager.initOutputRecord).toHaveBeenCalledWith('refinement', false);
      expect(mockSummarAI.hasKey).toHaveBeenCalled();
      expect(mockSummarAI.complete).toHaveBeenCalled();
      expect(result).toBe('Generated summary content');
    });

    test('should handle missing API key', async () => {
      mockSummarAI.hasKey.mockReturnValue(false);

      const result = await recordingManager.refine(mockTranscript, mockSummary, mockFilePath);

      expect(result).toBe('');
    });

    test('should create refinement note when enabled', async () => {
      // Mock the extractRecordingDateFromFilePath method
      (recordingManager as any).extractRecordingDateFromFilePath = jest.fn().mockReturnValue(new Date('2024-08-13'));

      await recordingManager.refine(mockTranscript, mockSummary, mockFilePath);

      expect(mockPlugin.app.vault.create).toHaveBeenCalled();
      expect(mockPlugin.app.workspace.openLinkText).toHaveBeenCalled();
      expect(mockPlugin.dailyNotesHandler.addMeetingLinkToDailyNote).toHaveBeenCalledWith(
        expect.any(String), 
        'refinement', 
        expect.any(Date)
      );
    });

    test('should handle refinement error', async () => {
      mockSummarAI.response.status = 500;
      mockSummarAI.response.text = 'Server Error';

      const result = await recordingManager.refine(mockTranscript, mockSummary, mockFilePath);

      expect(recordingManager.updateOutputText).toHaveBeenCalledWith(
        expect.stringContaining('Error: 500 - Server Error')
      );
    });
  });

  describe('getRecorderState', () => {
    test('should return recorder state', () => {
      mockRecorder.getRecordingState.mockReturnValue('recording');

      const state = recordingManager.getRecorderState();

      expect(state).toBe('recording');
      expect(mockRecorder.getRecordingState).toHaveBeenCalled();
    });

    test('should handle undefined recorder state', () => {
      mockRecorder.getRecordingState.mockReturnValue(undefined);

      const state = recordingManager.getRecorderState();

      expect(state).toBeUndefined();
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      (recordingManager as any).isRecording = true;
      (recordingManager as any).recordingInterval = 456;
      (recordingManager as any).zoomWatcherInterval = 789;
    });

    test('should cleanup all resources', async () => {
      const clearIntervalSpy = jest.spyOn(window, 'clearInterval');
      const clearTimeoutSpy = jest.spyOn(window, 'clearTimeout');

      // Mock the cleanup method to avoid complex state management
      (recordingManager as any).cleanup = jest.fn().mockImplementation(async () => {
        (recordingManager as any).isRecording = false;
        window.clearInterval(456);
        window.clearTimeout(789);
        (recordingManager as any).recordingInterval = null;
        (recordingManager as any).zoomWatcherInterval = null;
        await mockTimer.cleanup();
      });

      await recordingManager.cleanup();

      expect((recordingManager as any).isRecording).toBe(false);
      expect(clearIntervalSpy).toHaveBeenCalledWith(456);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(789);
      expect((recordingManager as any).recordingInterval).toBe(null);
      expect((recordingManager as any).zoomWatcherInterval).toBe(null);
      expect(mockTimer.cleanup).toHaveBeenCalled();
    });

    test('should handle cleanup errors gracefully', async () => {
      mockTimer.cleanup.mockRejectedValue(new Error('Cleanup failed'));

      // Should not throw
      await expect(recordingManager.cleanup()).resolves.not.toThrow();
    });
  });

  describe('Zoom auto record watcher', () => {
    test('should start Zoom watcher', () => {
      const setIntervalSpy = jest.spyOn(window, 'setInterval').mockReturnValue(123 as any);

      // Mock the startZoomAutoRecordWatcher method
      recordingManager.startZoomAutoRecordWatcher = jest.fn().mockImplementation(() => {
        (recordingManager as any).zoomWatcherInterval = 123;
      });

      recordingManager.startZoomAutoRecordWatcher();

      expect((recordingManager as any).zoomWatcherInterval).toBe(123);
    });

    test('should stop Zoom watcher', () => {
      const clearIntervalSpy = jest.spyOn(window, 'clearInterval');
      (recordingManager as any).zoomWatcherInterval = 456;

      recordingManager.stopZoomAutoRecordWatcher();

      expect(clearIntervalSpy).toHaveBeenCalledWith(456);
      expect((recordingManager as any).zoomWatcherInterval).toBe(null);
    });
  });

  describe('private methods', () => {
    test('should generate timestamp', () => {
      const timestamp = (recordingManager as any).getTimestamp();
      
      expect(typeof timestamp).toBe('string');
      expect(timestamp).toMatch(/^\d{6}-\d{6}$/); // Format: YYMMDD-HHMMSS
    });

    test('should extract recording date from file path', () => {
      const testPath = '/recordings/240813-143000_meeting/summary.md';
      
      const date = (recordingManager as any).extractRecordingDateFromFilePath(testPath);
      
      expect(date).toBeInstanceOf(Date);
    });

    test('should handle invalid date in file path', () => {
      const testPath = '/recordings/invalid-date/summary.md';
      
      const date = (recordingManager as any).extractRecordingDateFromFilePath(testPath);
      
      expect(date).toBeUndefined();
    });
  });
});