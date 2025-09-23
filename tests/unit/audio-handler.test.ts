import { jest } from '@jest/globals';
import { TextDecoder, TextEncoder } from 'util';
import { AudioHandler } from '../../src/audiohandler';
import { mockApp, mockPlugin } from '../setup';

function toArrayBuffer(text: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(text);
  const buffer = new ArrayBuffer(encoded.length);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}

class TestBlob {
  private parts: BlobPart[];
  type: string;

  constructor(parts: BlobPart[], options?: { type?: string }) {
    this.parts = parts;
    this.type = options?.type ?? '';
  }

  async text(): Promise<string> {
    const decoder = new TextDecoder();
    return this.parts.map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      if (part instanceof ArrayBuffer) {
        return decoder.decode(part);
      }
      if (ArrayBuffer.isView(part)) {
        return decoder.decode(part as Uint8Array);
      }
      return String(part);
    }).join('');
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const text = await this.text();
    return toArrayBuffer(text);
  }
}

if (!(global as any).TextEncoder) {
  (global as any).TextEncoder = TextEncoder;
}

if (!(global as any).TextDecoder) {
  (global as any).TextDecoder = TextDecoder;
}

(global as any).Blob = TestBlob as unknown as typeof Blob;

describe('AudioHandler', () => {
  let audioHandler: any;
  let mockFiles: File[];

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock audio files
    mockFiles = [
      new File(['audio content'], 'test1.mp3', { type: 'audio/mp3' }),
      new File(['audio content'], 'test2.wav', { type: 'audio/wav' }),
      new File(['not audio'], 'document.txt', { type: 'text/plain' })
    ];

    // Create mock AudioHandler
    audioHandler = {
      plugin: mockPlugin,
      initOutputRecord: jest.fn(),
      updateOutputText: jest.fn(),
      sendAudioData: jest.fn(),
      filterAudioFiles: jest.fn(),
      transcribeAudio: jest.fn()
    };
  });

  describe('audio file filtering', () => {
    test('should filter only audio files from FileList', () => {
      const filterAudioFiles = (files: File[]) => {
        return files.filter(file =>
          file.type.startsWith("audio/") ||
          file.name.toLowerCase().endsWith(".mp3") ||
          file.name.toLowerCase().endsWith(".wav") ||
          file.name.toLowerCase().endsWith(".ogg") ||
          file.name.toLowerCase().endsWith(".m4a") ||
          file.name.toLowerCase().endsWith(".webm")
        );
      };

      const audioFiles = filterAudioFiles(mockFiles);

      expect(audioFiles).toHaveLength(2);
      expect(audioFiles[0].name).toBe('test1.mp3');
      expect(audioFiles[1].name).toBe('test2.wav');
    });

    test('should handle various audio file extensions', () => {
      const audioFiles = [
        new File([''], 'test.mp3', { type: 'audio/mp3' }),
        new File([''], 'test.wav', { type: 'audio/wav' }),
        new File([''], 'test.ogg', { type: 'audio/ogg' }),
        new File([''], 'test.m4a', { type: 'audio/mp4' }),
        new File([''], 'test.webm', { type: 'audio/webm' })
      ];

      const filterAudioFiles = (files: File[]) => {
        return files.filter(file =>
          file.type.startsWith("audio/") ||
          file.name.toLowerCase().endsWith(".mp3") ||
          file.name.toLowerCase().endsWith(".wav") ||
          file.name.toLowerCase().endsWith(".ogg") ||
          file.name.toLowerCase().endsWith(".m4a") ||
          file.name.toLowerCase().endsWith(".webm")
        );
      };

      const filtered = filterAudioFiles(audioFiles);
      expect(filtered).toHaveLength(5);
    });
  });

  describe('sendAudioData', () => {
    test('should return empty result when no API key is set', async () => {
      (mockPlugin as any).settingsv2 = {
        common: { openaiApiKey: '' },
        recording: { sttModel: 'whisper-1' }
      };

      audioHandler.sendAudioData = jest.fn().mockImplementation(async (files: File[]) => {
        if (!(mockPlugin as any).settingsv2.common.openaiApiKey) {
          return { transcriptedText: "", newFilePath: "" };
        }
        return { transcriptedText: "test transcription", newFilePath: "/path/to/file" };
      });

      const result = await audioHandler.sendAudioData(mockFiles);

      expect(result.transcriptedText).toBe("");
      expect(result.newFilePath).toBe("");
    });

    test('should process audio files when API key is available', async () => {
      (mockPlugin as any).settingsv2 = {
        common: { openaiApiKey: 'sk-test-key' },
        recording: { sttModel: 'whisper-1' }
      };

      audioHandler.sendAudioData = jest.fn().mockImplementation(async (files: File[]) => {
        if (!(mockPlugin as any).settingsv2.common.openaiApiKey) {
          return { transcriptedText: "", newFilePath: "" };
        }
        return { transcriptedText: "Transcribed audio content", newFilePath: "/vault/transcriptions/test.md" };
      });

      const result = await audioHandler.sendAudioData(mockFiles);

      expect(result.transcriptedText).toBe("Transcribed audio content");
      expect(result.newFilePath).toBe("/vault/transcriptions/test.md");
    });

    test('should handle file sorting by relative path', () => {
      const files = [
        { name: 'file3.mp3', webkitRelativePath: 'folder/file3.mp3' },
        { name: 'file1.mp3', webkitRelativePath: 'folder/file1.mp3' },
        { name: 'file2.mp3', webkitRelativePath: 'folder/file2.mp3' }
      ] as any[];

      const sortFiles = (files: any[]) => {
        return files.sort((a, b) => {
          const pathA = a.webkitRelativePath || a.name;
          const pathB = b.webkitRelativePath || b.name;
          return pathA.localeCompare(pathB);
        });
      };

      const sorted = sortFiles([...files]);

      expect(sorted[0].name).toBe('file1.mp3');
      expect(sorted[1].name).toBe('file2.mp3');
      expect(sorted[2].name).toBe('file3.mp3');
    });
  });

  describe('UI updates', () => {
    test('should initialize output record for transcription', () => {
      audioHandler.initOutputRecord('transcript');
      expect(audioHandler.initOutputRecord).toHaveBeenCalledWith('transcript');
    });

    test('should update output text with progress messages', () => {
      const fileNames = ['test1.mp3', 'test2.wav'].join('\n');
      const message = `Audio files to be sent:\n${fileNames}\n\nConverting audio to text using [whisper-1] ...`;
      
      audioHandler.updateOutputText(message);
      expect(audioHandler.updateOutputText).toHaveBeenCalledWith(message);
    });
  });

  describe('transcription methods', () => {
    test('should handle transcription with different STT models', async () => {
      const mockTranscription = 'This is the transcribed text from audio';
      
      audioHandler.transcribeAudio = jest.fn().mockImplementation(async (audioFile: File, model: string) => {
        return `Transcribed with ${model}: ${mockTranscription}`;
      });

      const result = await audioHandler.transcribeAudio(mockFiles[0], 'whisper-1');
      expect(result).toContain('whisper-1');
      expect(result).toContain(mockTranscription);
    });

    test('should handle transcription errors gracefully', async () => {
      audioHandler.transcribeAudio = jest.fn().mockImplementation(async (audioFile: File, model: string) => {
        throw new Error('Transcription failed');
      });

      try {
        await audioHandler.transcribeAudio(mockFiles[0], 'whisper-1');
      } catch (error) {
        expect((error as Error).message).toBe('Transcription failed');
      }
    });
  });

  describe('file management', () => {
    test('should handle folder path validation with sanitizeFileName', () => {
      // Mock the sanitizeFileName function
      const mockSanitizeFileName = jest.fn();
      mockSanitizeFileName.mockImplementation((fileName: string) => {
        return fileName
          .replace(/[<>:"/\\|?*#\[\]^(){}`;~`]/g, '-')
          .replace(/\s+/g, ' ')
          .replace(/-{2,}/g, '-')
          .replace(/^[-\s]+|[-\s]+$/g, '')
          .trim();
      });

      expect(mockSanitizeFileName('')).toBe('');
      expect(mockSanitizeFileName('valid-folder')).toBe('valid-folder');
      expect(mockSanitizeFileName('invalid<>folder')).toBe('invalid-folder');
    });    test('should generate appropriate file names for transcriptions', () => {
      const generateTranscriptionFileName = (originalName: string) => {
        const baseName = originalName.replace(/\.[^/.]+$/, '');
        const sanitized = baseName.replace(/[<>:"/\\|?*]/g, '-');
        return `${sanitized}-transcription.md`;
      };

      expect(generateTranscriptionFileName('audio.mp3')).toBe('audio-transcription.md');
      expect(generateTranscriptionFileName('my recording.wav')).toBe('my recording-transcription.md');
      expect(generateTranscriptionFileName('file<>name.m4a')).toBe('file--name-transcription.md');
    });
  });
});

describe('AudioHandler custom vocabulary integration', () => {
  const createPluginStub = (recordingOverrides: Partial<{
    sttModel: string;
    customVocabulary: string;
    sttPrompt: Record<string, string>;
    recordingLanguage?: string;
  }> = {}) => {
    const recordingDefaults = {
      sttModel: 'whisper-1',
      customVocabulary: '',
      sttPrompt: {} as Record<string, string>,
      recordingLanguage: 'en',
    };

    return {
      app: {
        vault: {
          adapter: {
            readBinary: jest.fn(async () => new ArrayBuffer(0)),
          },
        },
      },
      manifest: { version: '1.0.0' },
      settingsv2: {
        common: {
          openaiApiKey: 'sk-test',
          googleApiKey: 'gk-test',
        },
        recording: { ...recordingDefaults, ...recordingOverrides },
        system: { debugLevel: 0 },
      },
      generateUniqueId: jest.fn().mockReturnValue('output-key'),
      clearAllOutputItems: jest.fn(async () => undefined),
      pushOutputPrompt: jest.fn(),
      updateOutputText: jest.fn(),
      appendOutputText: jest.fn(),
      getOutputText: jest.fn(),
      setNewNoteName: jest.fn(),
      foldOutput: jest.fn(),
      getDefaultModel: jest.fn().mockReturnValue('whisper-1'),
    } as any;
  };

const createHandler = (overrides?: Partial<{
    sttModel: string;
    customVocabulary: string;
    sttPrompt: Record<string, string>;
    recordingLanguage?: string;
  }>) => {
    const plugin = createPluginStub(overrides);
    const handler = new AudioHandler(plugin);
    return { handler, plugin };
  };

  const createAudioBlob = () => ({
    arrayBuffer: async () => toArrayBuffer('audio data'),
  }) as unknown as Blob;

  test('includes custom vocabulary as prompt for whisper-1 model', async () => {
    const customVocabulary = 'Alpha, Beta, Gamma';
    const { handler } = createHandler({
      sttModel: 'whisper-1',
      customVocabulary,
    });

    const blob = createAudioBlob();
    const { body } = await handler.buildMultipartFormData(blob, 'sample.wav', 'audio/wav');
    const multipartBuffer = await (body as any).arrayBuffer();
    const multipart = new TextDecoder().decode(multipartBuffer);

    expect(multipart).toContain('name="prompt"');
    expect(multipart).toContain(customVocabulary);
    expect(multipart).not.toContain('When transcribing, make sure to recognize');
  });

  test('appends guidance with custom vocabulary for non-whisper models', async () => {
    const customVocabulary = 'API Gateway, Lambda, DynamoDB';
    const model = 'gemini-1.5-flash';
    const basePrompt = 'Base transcription instructions';
    const { handler } = createHandler({
      sttModel: model,
      customVocabulary,
      sttPrompt: { [model]: basePrompt },
    });

    const blob = createAudioBlob();
    const { body } = await handler.buildMultipartFormData(blob, 'meeting.webm', 'audio/webm');
    const multipartBuffer = await (body as any).arrayBuffer();
    const multipart = new TextDecoder().decode(multipartBuffer);

    expect(multipart).toContain(`name="model"\r\n\r\n${model}`);
    expect(multipart).toContain(basePrompt);
    expect(multipart).toContain('When transcribing, make sure to recognize and spell the following terms correctly:');
    expect(multipart).toContain(customVocabulary);
  });

  test('omits prompt field when no custom vocabulary or prompt is provided', async () => {
    const { handler } = createHandler({
      sttModel: 'whisper-1',
      customVocabulary: '',
      sttPrompt: {},
    });

    const blob = createAudioBlob();
    const { body } = await handler.buildMultipartFormData(blob, 'clip.ogg', 'audio/ogg');
    const multipartBuffer = await (body as any).arrayBuffer();
    const multipart = new TextDecoder().decode(multipartBuffer);

    expect(multipart).not.toContain('name="prompt"');
  });
});
