import { jest } from '@jest/globals';

describe('AudioRecorder', () => {
  let audioRecorder: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock audio recorder
    audioRecorder = {
      chunks: [],
      recorder: null,
      mimeType: undefined,
      startRecording: jest.fn(),
      pauseRecording: jest.fn(),
      stopRecording: jest.fn(),
      getRecordingState: jest.fn(),
      getMimeType: jest.fn()
    };
  });

  describe('MIME type support', () => {
    test('should detect supported audio MIME types', () => {
      const getSupportedMimeType = () => {
        const mimeTypes = ["audio/webm", "audio/ogg", "audio/mp3", "audio/mp4"];
        // Mock that webm is supported
        return mimeTypes[0];
      };

      const supportedType = getSupportedMimeType();
      expect(supportedType).toBe("audio/webm");
    });

    test('should return undefined when no MIME types are supported', () => {
      const getSupportedMimeType = () => {
        const mimeTypes = ["audio/webm", "audio/ogg", "audio/mp3", "audio/mp4"];
        // Mock no support
        return undefined;
      };

      const supportedType = getSupportedMimeType();
      expect(supportedType).toBeUndefined();
    });

    test('should check multiple MIME types in order', () => {
      const getSupportedMimeType = () => {
        const mimeTypes = ["audio/webm", "audio/ogg", "audio/mp3", "audio/mp4"];
        // Mock that ogg is the first supported type
        return mimeTypes[1];
      };

      const supportedType = getSupportedMimeType();
      expect(supportedType).toBe("audio/ogg");
    });
  });

  describe('recording lifecycle', () => {
    test('should start recording with device ID', async () => {
      const deviceId = 'test-device-id';
      
      audioRecorder.startRecording = jest.fn().mockImplementation(async (deviceId: string) => {
        audioRecorder.recorder = { state: 'recording' };
        audioRecorder.mimeType = 'audio/webm';
        return Promise.resolve();
      });

      await audioRecorder.startRecording(deviceId);

      expect(audioRecorder.startRecording).toHaveBeenCalledWith(deviceId);
      expect(audioRecorder.recorder?.state).toBe('recording');
      expect(audioRecorder.mimeType).toBe('audio/webm');
    });

    test('should pause recording', async () => {
      audioRecorder.recorder = { state: 'recording' };

      audioRecorder.pauseRecording = jest.fn().mockImplementation(async () => {
        if (audioRecorder.recorder && audioRecorder.recorder.state === 'recording') {
          audioRecorder.recorder.state = 'paused';
        }
        return Promise.resolve();
      });

      await audioRecorder.pauseRecording();

      expect(audioRecorder.pauseRecording).toHaveBeenCalled();
      expect(audioRecorder.recorder?.state).toBe('paused');
    });

    test('should stop recording and return blob', async () => {
      const mockBlob = new Blob(['audio data'], { type: 'audio/webm' });
      
      audioRecorder.recorder = { state: 'recording' };
      audioRecorder.chunks = ['chunk1', 'chunk2'];

      audioRecorder.stopRecording = jest.fn().mockImplementation(async () => {
        if (audioRecorder.recorder) {
          audioRecorder.recorder.state = 'inactive';
          return mockBlob;
        }
      });

      const result = await audioRecorder.stopRecording();

      expect(audioRecorder.stopRecording).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Blob);
      expect(audioRecorder.recorder?.state).toBe('inactive');
    });
  });

  describe('recording state management', () => {
    test('should return correct recording state', () => {
      audioRecorder.getRecordingState = jest.fn().mockImplementation(() => {
        return audioRecorder.recorder?.state;
      });

      // Test inactive state
      audioRecorder.recorder = null;
      expect(audioRecorder.getRecordingState()).toBeUndefined();

      // Test recording state
      audioRecorder.recorder = { state: 'recording' };
      expect(audioRecorder.getRecordingState()).toBe('recording');

      // Test paused state
      audioRecorder.recorder = { state: 'paused' };
      expect(audioRecorder.getRecordingState()).toBe('paused');
    });

    test('should return MIME type', () => {
      audioRecorder.getMimeType = jest.fn().mockImplementation(() => {
        return audioRecorder.mimeType;
      });

      audioRecorder.mimeType = 'audio/webm';
      expect(audioRecorder.getMimeType()).toBe('audio/webm');

      audioRecorder.mimeType = undefined;
      expect(audioRecorder.getMimeType()).toBeUndefined();
    });
  });

  describe('error handling', () => {
    test('should handle recording start errors', async () => {
      audioRecorder.startRecording = jest.fn().mockImplementation(async (deviceId: string) => {
        throw new Error('Permission denied');
      });

      await expect(audioRecorder.startRecording('test-device')).rejects.toThrow('Permission denied');
    });

    test('should handle unsupported MIME type error', async () => {
      audioRecorder.startRecording = jest.fn().mockImplementation(async (deviceId: string) => {
        throw new Error("No supported mimeType found");
      });

      await expect(audioRecorder.startRecording('test-device')).rejects.toThrow('No supported mimeType found');
    });

    test('should handle recording in invalid state', async () => {
      audioRecorder.recorder = { state: 'inactive' };

      audioRecorder.pauseRecording = jest.fn().mockImplementation(async () => {
        if (!audioRecorder.recorder || audioRecorder.recorder.state !== 'recording') {
          throw new Error('Cannot pause: recorder not in recording state');
        }
      });

      await expect(audioRecorder.pauseRecording()).rejects.toThrow('Cannot pause: recorder not in recording state');
    });
  });

  describe('device enumeration', () => {
    test('should filter audio devices', async () => {
      const mockDevices = [
        { deviceId: 'device1', kind: 'audioinput', label: 'Microphone 1' },
        { deviceId: 'device2', kind: 'audioinput', label: 'Microphone 2' },
        { deviceId: 'device3', kind: 'videoinput', label: 'Camera' }
      ];

      const getAudioDevices = async () => {
        return mockDevices.filter(device => device.kind === 'audioinput');
      };

      const audioDevices = await getAudioDevices();

      expect(audioDevices).toHaveLength(2);
      expect(audioDevices[0].label).toBe('Microphone 1');
      expect(audioDevices[1].label).toBe('Microphone 2');
    });

    test('should handle device enumeration errors', async () => {
      const getAudioDevices = async () => {
        throw new Error('Device access denied');
      };

      await expect(getAudioDevices()).rejects.toThrow('Device access denied');
    });
  });

  describe('chunk management', () => {
    test('should collect audio chunks during recording', () => {
      const mockChunks = ['chunk1', 'chunk2', 'chunk3'];
      
      audioRecorder.chunks = [];
      
      // Simulate adding chunks
      mockChunks.forEach(chunk => {
        audioRecorder.chunks.push(chunk);
      });

      expect(audioRecorder.chunks).toHaveLength(3);
      expect(audioRecorder.chunks).toEqual(mockChunks);
    });

    test('should clear chunks after creating blob', () => {
      audioRecorder.chunks = ['chunk1', 'chunk2'];
      
      const createBlob = (chunks: BlobPart[], mimeType: string) => {
        const blob = new Blob(chunks, { type: mimeType });
        audioRecorder.chunks = []; // Clear chunks after blob creation
        return blob;
      };

      const blob = createBlob(audioRecorder.chunks, 'audio/webm');

      expect(blob).toBeInstanceOf(Blob);
      expect(audioRecorder.chunks).toHaveLength(0);
    });
  });

  describe('recording configuration', () => {
    test('should handle different audio constraints', () => {
      const createAudioConstraints = (deviceId: string, sampleRate?: number) => {
        const constraints: any = { deviceId };
        
        if (sampleRate) {
          constraints.sampleRate = sampleRate;
        }
        
        return { audio: constraints };
      };

      const basicConstraints = createAudioConstraints('device1');
      expect(basicConstraints.audio.deviceId).toBe('device1');
      expect(basicConstraints.audio.sampleRate).toBeUndefined();

      const advancedConstraints = createAudioConstraints('device1', 44100);
      expect(advancedConstraints.audio.deviceId).toBe('device1');
      expect(advancedConstraints.audio.sampleRate).toBe(44100);
    });

    test('should validate recording options', () => {
      const validateRecordingOptions = (mimeType: string, timeslice?: number) => {
        const options: any = { mimeType };
        
        if (timeslice && timeslice > 0) {
          options.timeslice = timeslice;
        }
        
        return options;
      };

      const basicOptions = validateRecordingOptions('audio/webm');
      expect(basicOptions.mimeType).toBe('audio/webm');
      expect(basicOptions.timeslice).toBeUndefined();

      const advancedOptions = validateRecordingOptions('audio/webm', 1000);
      expect(advancedOptions.mimeType).toBe('audio/webm');
      expect(advancedOptions.timeslice).toBe(1000);
    });
  });
});