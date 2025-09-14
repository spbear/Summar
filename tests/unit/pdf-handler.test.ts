// tests/unit/pdf-handler.test.ts

import { PdfHandler } from '../../src/pdfhandler';

// Mock dependencies
jest.mock('../../src/globals');
jest.mock('../../src/summarai');
jest.mock('../../src/pdftopng');
jest.mock('../../src/jsonbuilder');

describe('PdfHandler', () => {
  let mockPlugin: any;
  let pdfHandler: PdfHandler;
  let mockSummarAI: any;
  let mockPdfToPng: any;
  let mockJsonBuilder: any;

  beforeEach(() => {
    // Mock plugin with settings
    mockPlugin = {
      settingsv2: {
        pdf: {
          pdfModel: 'gpt-4-vision-preview',
          pdfPrompt: 'Convert this PDF to markdown format'
        }
      },
      app: {
        vault: {
          create: jest.fn().mockResolvedValue(true),
          adapter: {
            mkdir: jest.fn().mockResolvedValue(true)
          }
        },
        workspace: {
          openLinkText: jest.fn().mockResolvedValue(true)
        }
      }
    };

    // Mock SummarAI
    mockSummarAI = {
      hasKey: jest.fn().mockReturnValue(true),
      completeWithBody: jest.fn().mockResolvedValue(true),
      response: {
        status: 200,
        text: 'Converted markdown content'
      }
    };

    const { SummarAI } = require('../../src/summarai');
    SummarAI.mockImplementation(() => mockSummarAI);

    // Mock PdfToPng
    mockPdfToPng = {
      isPopplerInstalled: jest.fn().mockResolvedValue(true),
      convert: jest.fn().mockResolvedValue(['base64image1', 'base64image2'])
    };

    const { PdfToPng } = require('../../src/pdftopng');
    PdfToPng.mockImplementation(() => mockPdfToPng);

    // Mock JsonBuilder
    mockJsonBuilder = {
      addData: jest.fn(),
      addToArray: jest.fn(),
      toString: jest.fn().mockReturnValue('{"messages": []}')
    };

    const { JsonBuilder } = require('../../src/jsonbuilder');
    JsonBuilder.mockImplementation(() => mockJsonBuilder);

    pdfHandler = new PdfHandler(mockPlugin);
    
    // Mock the plugin property directly on the instance
    (pdfHandler as any).plugin = mockPlugin;
    
    // Mock inherited methods
    pdfHandler.initOutputRecord = jest.fn();
    pdfHandler.updateOutputText = jest.fn();
    pdfHandler.pushOutputPrompt = jest.fn();
    pdfHandler.startTimer = jest.fn();
    pdfHandler.stopTimer = jest.fn();
    
    // Mock outputRecord with essential properties
    (pdfHandler as any).outputRecord = { 
      key: 'test-key', 
      label: 'test-label',
      conversations: [],
      result: '',
      setTempResult: jest.fn(),
      addFinalResult: jest.fn()
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should create PdfHandler instance', () => {
      expect(pdfHandler).toBeInstanceOf(PdfHandler);
    });
  });

  describe('convertPdfToMarkdown', () => {
    test('should create file input and trigger file selection', () => {
      // Mock document.createElement
      const mockFileInput = {
        type: '',
        accept: '',
        onchange: null as any,
        click: jest.fn()
      };
      
      const originalCreateElement = document.createElement;
      document.createElement = jest.fn().mockReturnValue(mockFileInput);

      pdfHandler.convertPdfToMarkdown();

      expect(document.createElement).toHaveBeenCalledWith('input');
      expect(mockFileInput.type).toBe('file');
      expect(mockFileInput.accept).toBe('.pdf');
      expect(mockFileInput.click).toHaveBeenCalled();

      // Restore original function
      document.createElement = originalCreateElement;
    });

    test('should handle file selection and call convertToMarkdownFromPdf', async () => {
      const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      
      pdfHandler.convertToMarkdownFromPdf = jest.fn();

      const mockFileInput = {
        type: 'file',
        accept: '.pdf',
        onchange: null as any,
        click: jest.fn(),
        files: [mockFile]
      };
      
      const originalCreateElement = document.createElement;
      document.createElement = jest.fn().mockReturnValue(mockFileInput);

      pdfHandler.convertPdfToMarkdown();
      
      // Simulate file selection
      if (mockFileInput.onchange) {
        await mockFileInput.onchange();
      }

      expect(pdfHandler.convertToMarkdownFromPdf).toHaveBeenCalledWith(mockFile);

      // Restore original function
      document.createElement = originalCreateElement;
    });
  });

  describe('convertToMarkdownFromPdf', () => {
    let mockFile: File;

    beforeEach(() => {
      mockFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      
      // Mock createNewNoteFromPdf method
      pdfHandler.createNewNoteFromPdf = jest.fn();
    });

    test('should successfully convert PDF to markdown', async () => {
      await pdfHandler.convertToMarkdownFromPdf(mockFile);

      expect(pdfHandler.initOutputRecord).toHaveBeenCalledWith('pdf', false);
      expect(mockSummarAI.hasKey).toHaveBeenCalled();
      expect(mockPdfToPng.isPopplerInstalled).toHaveBeenCalled();
      expect(mockPdfToPng.convert).toHaveBeenCalled();
      expect(mockSummarAI.completeWithBody).toHaveBeenCalled();
      expect(pdfHandler.createNewNoteFromPdf).toHaveBeenCalledWith(
        'test.pdf', 
        'Converted markdown content'
      );
    });

    test('should handle missing API key', async () => {
      mockSummarAI.hasKey.mockReturnValue(false);

      await pdfHandler.convertToMarkdownFromPdf(mockFile);

      expect(pdfHandler.initOutputRecord).toHaveBeenCalled();
      expect(mockSummarAI.hasKey).toHaveBeenCalled();
      expect(mockPdfToPng.isPopplerInstalled).not.toHaveBeenCalled();
    });

    test('should handle Poppler not installed', async () => {
      mockPdfToPng.isPopplerInstalled.mockResolvedValue(false);

      await pdfHandler.convertToMarkdownFromPdf(mockFile);

      expect(mockPdfToPng.isPopplerInstalled).toHaveBeenCalled();
      expect(pdfHandler.updateOutputText).toHaveBeenCalledWith(
        expect.stringContaining('Poppler is not installed')
      );
      expect(mockPdfToPng.convert).not.toHaveBeenCalled();
    });

    test('should handle AI API error', async () => {
      mockSummarAI.response.status = 400;
      mockSummarAI.response.text = 'API Error';

      await pdfHandler.convertToMarkdownFromPdf(mockFile);

      expect(pdfHandler.updateOutputText).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] AI analysis failed: 400 - API Error')
      );
      expect(pdfHandler.createNewNoteFromPdf).not.toHaveBeenCalled();
    });

    test('should handle empty AI response', async () => {
      mockSummarAI.response.text = '';

      await pdfHandler.convertToMarkdownFromPdf(mockFile);

      expect(pdfHandler.updateOutputText).toHaveBeenCalledWith(
        '[ERROR] No valid response received from AI API.'
      );
      expect(pdfHandler.createNewNoteFromPdf).not.toHaveBeenCalled();
    });

    test('should handle PDF conversion error', async () => {
      mockPdfToPng.convert.mockRejectedValue(new Error('Conversion failed'));

      await pdfHandler.convertToMarkdownFromPdf(mockFile);

      expect(pdfHandler.updateOutputText).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] Error occurred during PDF conversion')
      );
      expect(pdfHandler.stopTimer).toHaveBeenCalled();
    });

    test('should build JSON request correctly', async () => {
      await pdfHandler.convertToMarkdownFromPdf(mockFile);

      // Verify JsonBuilder calls
      expect(mockJsonBuilder.addData).toHaveBeenCalledWith('model', 'gpt-4-vision-preview');
      expect(mockJsonBuilder.addToArray).toHaveBeenCalledWith('messages', 
        expect.objectContaining({
          role: 'system',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: 'Convert this PDF to markdown format'
            })
          ])
        })
      );
      
      // Should add user messages for each page
      expect(mockJsonBuilder.addToArray).toHaveBeenCalledWith('messages',
        expect.objectContaining({
          role: 'user',
          content: expect.arrayContaining([
            expect.objectContaining({ type: 'text' }),
            expect.objectContaining({ 
              type: 'image_url',
              image_url: expect.objectContaining({
                url: expect.stringMatching(/^data:image\/png;base64,/)
              })
            })
          ])
        })
      );
    });
  });

  describe('extractMarkdownContent', () => {
    test('should extract markdown content from code block', () => {
      const fullText = `Here is the result:

\`\`\`markdown
# Title
This is markdown content
\`\`\`

End of response.`;

      const result = pdfHandler.extractMarkdownContent(fullText);
      expect(result).toBe('# Title\nThis is markdown content');
    });

    test('should return full text when no markdown block found', () => {
      const fullText = 'This is just plain text without markdown blocks';

      const result = pdfHandler.extractMarkdownContent(fullText);
      expect(result).toBe(fullText);
    });

    test('should handle multiline markdown content', () => {
      const fullText = `\`\`\`markdown
# Heading 1
## Heading 2

- List item 1
- List item 2

**Bold text**
\`\`\``;

      const result = pdfHandler.extractMarkdownContent(fullText);
      expect(result).toBe('# Heading 1\n## Heading 2\n\n- List item 1\n- List item 2\n\n**Bold text**');
    });

    test('should handle empty markdown block', () => {
      const fullText = `\`\`\`markdown\n\n\`\`\``;

      const result = pdfHandler.extractMarkdownContent(fullText);
      expect(result).toBe('');
    });
  });

  describe('progress tracking', () => {
    test('should update progress messages during conversion', async () => {
      const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      pdfHandler.createNewNoteFromPdf = jest.fn();

      await pdfHandler.convertToMarkdownFromPdf(mockFile);

      // Check if progress messages were called
      expect(pdfHandler.updateOutputText).toHaveBeenCalledWith(
        expect.stringContaining('[10%] Preparing PDF file')
      );
      expect(pdfHandler.updateOutputText).toHaveBeenCalledWith(
        expect.stringContaining('[15%] Converting to images')
      );
      expect(pdfHandler.updateOutputText).toHaveBeenCalledWith(
        expect.stringContaining('[30%] Image conversion completed')
      );
      expect(pdfHandler.updateOutputText).toHaveBeenCalledWith(
        expect.stringContaining('[100%] Markdown conversion completed')
      );
    });
  });

  describe('error handling', () => {
    test('should handle JSON builder errors gracefully', async () => {
      mockJsonBuilder.toString.mockImplementation(() => {
        throw new Error('JSON building failed');
      });

      const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      
      await pdfHandler.convertToMarkdownFromPdf(mockFile);

      expect(pdfHandler.updateOutputText).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] Error occurred during PDF conversion')
      );
    });
  });
});