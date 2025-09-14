import { CustomCommandHandler } from '../../src/customcommandhandler';
import SummarPlugin from '../../src/main';
import { SummarDebug } from '../../src/globals';
import { SummarAI } from '../../src/summarai';
import { MarkdownView } from 'obsidian';

// Mock dependencies
jest.mock('../../src/globals', () => ({
    SummarDebug: {
        log: jest.fn(),
        error: jest.fn(),
        Notice: jest.fn()
    },
    SummarViewContainer: class MockSummarViewContainer {
        plugin: any;
        outputRecord: any = { key: 'test-key', label: 'Test Label' };
        
        constructor(plugin: any) {
            this.plugin = plugin;
        }

        initOutputRecord = jest.fn();
        updateOutputText = jest.fn();
        startTimer = jest.fn();
        stopTimer = jest.fn();
        pushOutputPrompt = jest.fn();
        setNewNoteName = jest.fn();
    }
}));

jest.mock('../../src/summarai', () => ({
    SummarAI: jest.fn()
}));

// Mock Obsidian MarkdownView
jest.mock('obsidian', () => ({
    MarkdownView: jest.fn()
}));

// Mock navigator.clipboard
Object.assign(navigator, {
    clipboard: {
        writeText: jest.fn()
    }
});

describe('CustomCommandHandler', () => {
    let customCommandHandler: CustomCommandHandler;
    let mockPlugin: jest.Mocked<SummarPlugin>;
    let mockSummarAI: jest.Mocked<SummarAI>;
    let mockEditor: any;
    let mockView: any;

    beforeEach(() => {
        // Mock editor
        mockEditor = {
            getCursor: jest.fn(() => ({ line: 5, ch: 10 })),
            lastLine: jest.fn(() => 10),
            getLine: jest.fn(() => 'some text'),
            replaceRange: jest.fn(),
            setSelection: jest.fn(),
            listSelections: jest.fn(() => [])
        };

        // Mock view
        mockView = {
            editor: mockEditor
        };

        // Mock plugin with custom commands configuration
        mockPlugin = {
            settingsv2: {
                custom: {
                    command: [
                        {
                            model: 'gpt-4',
                            prompt: 'Summarize the following text:',
                            appendToNote: false,
                            copyToClipboard: false
                        },
                        {
                            model: 'gpt-3.5-turbo',
                            prompt: 'Translate the following text to Korean:',
                            appendToNote: true,
                            copyToClipboard: false
                        },
                        {
                            model: 'gpt-4',
                            prompt: 'Explain the following code:',
                            appendToNote: false,
                            copyToClipboard: true
                        }
                    ]
                }
            },
            app: {
                workspace: {
                    getActiveViewOfType: jest.fn(() => mockView)
                }
            }
        } as any;

        // Create instance
        customCommandHandler = new CustomCommandHandler(mockPlugin);

        // Mock SummarAI instance behavior
        mockSummarAI = {
            hasKey: jest.fn(() => true),
            complete: jest.fn(),
            response: {
                status: 200,
                text: 'Mocked command response',
                json: null,
                statsId: 'test-stats-id'
            }
        } as any;

        // Mock SummarAI constructor to return our mock
        (SummarAI as jest.Mock).mockImplementation(() => mockSummarAI);

        // Clear all mocks
        jest.clearAllMocks();
    });

    describe('Constructor', () => {
        test('should create CustomCommandHandler instance', () => {
            expect(customCommandHandler).toBeInstanceOf(CustomCommandHandler);
        });

        test('should extend SummarViewContainer', () => {
            expect(customCommandHandler.plugin).toBe(mockPlugin);
        });
    });

    describe('executePrompt', () => {
        const selectedText = 'This is some selected text for testing.';

        test('should successfully execute custom command 1 (basic)', async () => {
            await customCommandHandler.executePrompt(selectedText, 'custom-command-1');

            // Verify initialization
            expect(customCommandHandler.initOutputRecord).toHaveBeenCalledWith('custom', false);
            expect(customCommandHandler.updateOutputText).toHaveBeenCalledWith('Execute prompt with selected text using [gpt-4]...');
            
            // Verify AI interaction
            expect(SummarAI).toHaveBeenCalledWith(mockPlugin, 'gpt-4', 'custom');
            expect(mockSummarAI.hasKey).toHaveBeenCalled();
            expect(customCommandHandler.startTimer).toHaveBeenCalled();
            expect(customCommandHandler.pushOutputPrompt).toHaveBeenCalledWith(
                'Summarize the following text:\n\nThis is some selected text for testing.'
            );
            expect(mockSummarAI.complete).toHaveBeenCalledWith([{
                role: 'user',
                text: 'Summarize the following text:\n\nThis is some selected text for testing.'
            }]);

            // Verify response handling
            expect(customCommandHandler.stopTimer).toHaveBeenCalled();
            expect(customCommandHandler.updateOutputText).toHaveBeenCalledWith('Mocked command response', true);
            expect(customCommandHandler.setNewNoteName).toHaveBeenCalled();

            // Verify no additional actions (appendToNote and copyToClipboard are false)
            expect(mockEditor.replaceRange).not.toHaveBeenCalled();
            expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
        });

        test('should execute custom command 2 with appendToNote', async () => {
            await customCommandHandler.executePrompt(selectedText, 'custom-command-2');

            // Verify AI interaction with different model and prompt
            expect(SummarAI).toHaveBeenCalledWith(mockPlugin, 'gpt-3.5-turbo', 'custom');
            expect(customCommandHandler.pushOutputPrompt).toHaveBeenCalledWith(
                'Translate the following text to Korean:\n\nThis is some selected text for testing.'
            );

            // Verify append to note functionality
            expect(mockPlugin.app.workspace.getActiveViewOfType).toHaveBeenCalledWith(MarkdownView);
            expect(mockEditor.replaceRange).toHaveBeenCalledWith(
                'Mocked command response\n',
                { line: 6, ch: 0 } // cursor.line + 1
            );
            expect(mockEditor.setSelection).toHaveBeenCalledWith(
                { line: 6, ch: 0 },
                { line: 6, ch: 0 }
            );

            // Verify no clipboard action
            expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
        });

        test('should execute custom command 3 with copyToClipboard', async () => {
            await customCommandHandler.executePrompt(selectedText, 'custom-command-3');

            // Verify AI interaction
            expect(SummarAI).toHaveBeenCalledWith(mockPlugin, 'gpt-4', 'custom');
            expect(customCommandHandler.pushOutputPrompt).toHaveBeenCalledWith(
                'Explain the following code:\n\nThis is some selected text for testing.'
            );

            // Verify clipboard functionality
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Mocked command response');
            expect(SummarDebug.Notice).toHaveBeenCalledWith(1, 'Results copied to clipboard.');

            // Verify no append to note action
            expect(mockEditor.replaceRange).not.toHaveBeenCalled();
        });

        test('should handle clipboard write error', async () => {
            (navigator.clipboard.writeText as jest.Mock).mockRejectedValue(new Error('Clipboard error'));

            await customCommandHandler.executePrompt(selectedText, 'custom-command-3');

            expect(SummarDebug.error).toHaveBeenCalledWith(1, 'Failed to copy to clipboard:', expect.any(Error));
        });

        test('should handle invalid command ID', async () => {
            await customCommandHandler.executePrompt(selectedText, 'invalid-command-id');

            expect(SummarDebug.error).toHaveBeenCalledWith(1, 'Invalid cmdId: invalid-command-id');
            expect(customCommandHandler.initOutputRecord).not.toHaveBeenCalled();
        });

        test('should handle non-existent command index', async () => {
            await customCommandHandler.executePrompt(selectedText, 'custom-command-10');

            expect(SummarDebug.error).toHaveBeenCalledWith(1, 'Command not found at index: 9');
            expect(customCommandHandler.initOutputRecord).not.toHaveBeenCalled();
        });

        test('should handle SummarAI hasKey returning false', async () => {
            mockSummarAI.hasKey.mockReturnValue(false);

            await customCommandHandler.executePrompt(selectedText, 'custom-command-1');

            // Should return early and not proceed with execution
            expect(customCommandHandler.updateOutputText).not.toHaveBeenCalledWith(
                expect.stringContaining('Execute prompt with selected text')
            );
            expect(mockSummarAI.complete).not.toHaveBeenCalled();
        });

        test('should handle AI API error', async () => {
            mockSummarAI.response = {
                status: 500,
                text: 'Internal Server Error',
                json: null,
                statsId: 'test-stats-id'
            };

            await customCommandHandler.executePrompt(selectedText, 'custom-command-1');

            expect(SummarDebug.error).toHaveBeenCalledWith(1, 'AI API Error:', 'Internal Server Error');
            expect(customCommandHandler.updateOutputText).toHaveBeenCalledWith('Error: 500 - Internal Server Error');
            expect(customCommandHandler.stopTimer).toHaveBeenCalled();
        });

        test('should handle empty response from AI', async () => {
            mockSummarAI.response = {
                status: 200,
                text: '',
                json: null,
                statsId: 'test-stats-id'
            };

            await customCommandHandler.executePrompt(selectedText, 'custom-command-1');

            expect(customCommandHandler.updateOutputText).toHaveBeenCalledWith('No valid response from OpenAI API.');
            expect(customCommandHandler.setNewNoteName).not.toHaveBeenCalled();
        });

        test('should handle command with default model when not specified', async () => {
            // Add command without model specification
            (mockPlugin.settingsv2.custom.command[0] as any).model = undefined;

            await customCommandHandler.executePrompt(selectedText, 'custom-command-1');

            expect(SummarAI).toHaveBeenCalledWith(mockPlugin, 'gpt-4o', 'custom');
        });

        test('should handle command with empty prompt', async () => {
            // Set empty prompt
            mockPlugin.settingsv2.custom.command[0].prompt = '';

            await customCommandHandler.executePrompt(selectedText, 'custom-command-1');

            expect(customCommandHandler.pushOutputPrompt).toHaveBeenCalledWith(
                '\n\nThis is some selected text for testing.'
            );
        });

        test('should handle general execution error', async () => {
            // Mock an error in the try block
            mockSummarAI.complete.mockRejectedValue(new Error('Network Error'));

            await customCommandHandler.executePrompt(selectedText, 'custom-command-1');

            expect(customCommandHandler.stopTimer).toHaveBeenCalled();
            expect(SummarDebug.error).toHaveBeenCalledWith(1, 'Error:', expect.any(Error));
            expect(customCommandHandler.updateOutputText).toHaveBeenCalledWith(
                expect.stringContaining('An error occurred while processing the request.')
            );
        });

        test('should handle error with status and message', async () => {
            const errorWithStatus = {
                status: 404,
                message: 'Not Found'
            };

            mockSummarAI.complete.mockRejectedValue(errorWithStatus);

            await customCommandHandler.executePrompt(selectedText, 'custom-command-1');

            expect(customCommandHandler.updateOutputText).toHaveBeenCalledWith(
                'An error occurred while processing the request. | 404 Not Found'
            );
        });
    });

    describe('Editor Integration', () => {
        const selectedText = 'Test text';

        test('should handle cursor at end of document when appending to note', async () => {
            // Mock cursor at end of last line
            mockEditor.getCursor.mockReturnValue({ line: 10, ch: 9 });
            mockEditor.lastLine.mockReturnValue(10);
            mockEditor.getLine.mockReturnValue('some text'); // length = 9

            await customCommandHandler.executePrompt(selectedText, 'custom-command-2');

            // Should add new line first, then insert content
            expect(mockEditor.replaceRange).toHaveBeenCalledWith('\n', { line: 10, ch: 9 });
            expect(mockEditor.replaceRange).toHaveBeenCalledWith(
                'Mocked command response\n',
                { line: 11, ch: 0 }
            );
        });

        test('should handle multi-line selection when appending to note', async () => {
            // Mock multi-line selection
            mockEditor.listSelections.mockReturnValue([{
                anchor: { line: 3, ch: 5 },
                head: { line: 7, ch: 2 }
            }]);

            await customCommandHandler.executePrompt(selectedText, 'custom-command-2');

            // Should insert after the last selected line
            expect(mockEditor.replaceRange).toHaveBeenCalledWith(
                'Mocked command response\n',
                { line: 8, ch: 0 } // max(3, 7) + 1
            );
        });

        test('should handle no active markdown view when appending to note', async () => {
            (mockPlugin.app.workspace.getActiveViewOfType as jest.Mock).mockReturnValue(null);

            await customCommandHandler.executePrompt(selectedText, 'custom-command-2');

            // Should not attempt to append to note
            expect(mockEditor.replaceRange).not.toHaveBeenCalled();
            expect(customCommandHandler.updateOutputText).toHaveBeenCalledWith('Mocked command response', true);
        });

        test('should handle view without editor when appending to note', async () => {
            mockView.editor = null;

            await customCommandHandler.executePrompt(selectedText, 'custom-command-2');

            // Should not attempt to append to note
            expect(mockEditor.replaceRange).not.toHaveBeenCalled();
            expect(customCommandHandler.updateOutputText).toHaveBeenCalledWith('Mocked command response', true);
        });
    });

    describe('Configuration Validation', () => {
        test('should work with minimal command configuration', () => {
            const minimalPlugin = {
                settingsv2: {
                    custom: {
                        command: [
                            {
                                prompt: 'Test prompt'
                                // model, appendToNote, copyToClipboard not specified
                            }
                        ]
                    }
                },
                app: {
                    workspace: {
                        getActiveViewOfType: jest.fn(() => null)
                    }
                }
            } as any;

            const handler = new CustomCommandHandler(minimalPlugin);
            expect(handler).toBeInstanceOf(CustomCommandHandler);
            expect(handler.plugin).toBe(minimalPlugin);
        });

        test('should access all command configuration properties', async () => {
            const command = mockPlugin.settingsv2.custom.command[0];
            
            await customCommandHandler.executePrompt('test', 'custom-command-1');

            expect(command.model).toBeDefined();
            expect(command.prompt).toBeDefined();
            expect(command.appendToNote).toBeDefined();
            expect(command.copyToClipboard).toBeDefined();
        });
    });
});