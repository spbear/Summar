import { ConfluenceHandler } from '../../src/confluencehandler';
import SummarPlugin from '../../src/main';
import { SummarDebug, SummarRequestUrl } from '../../src/globals';
import { SummarAI } from '../../src/summarai';
import { ConfluenceAPI } from '../../src/confluenceapi';

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
    },
    containsDomain: jest.fn(),
    SummarRequestUrl: jest.fn()
}));

jest.mock('../../src/summarai', () => ({
    SummarAI: jest.fn()
}));

jest.mock('../../src/confluenceapi', () => ({
    ConfluenceAPI: jest.fn()
}));

describe('ConfluenceHandler', () => {
    let confluenceHandler: ConfluenceHandler;
    let mockPlugin: jest.Mocked<SummarPlugin>;
    let mockSummarAI: jest.Mocked<SummarAI>;
    let mockConfluenceAPI: jest.Mocked<ConfluenceAPI>;

    beforeEach(() => {
        // Mock plugin with necessary settings
        mockPlugin = {
            settingsv2: {
                common: {
                    confluenceApiToken: 'test-api-token',
                    confluenceDomain: 'example.atlassian.net',
                    useConfluenceAPI: true
                },
                web: {
                    webPrompt: 'Please summarize the following content:',
                    webModel: 'gpt-4'
                }
            }
        } as any;

        // Create instance
        confluenceHandler = new ConfluenceHandler(mockPlugin);

        // Mock SummarAI instance
        mockSummarAI = {
            hasKey: jest.fn(() => true),
            complete: jest.fn(),
            response: {
                status: 200,
                text: 'Mocked summary response',
                json: null,
                statsId: 'test-stats-id'
            }
        } as any;

        // Mock ConfluenceAPI instance
        mockConfluenceAPI = {
            getPageId: jest.fn(),
            getPageContent: jest.fn()
        } as any;

        // Setup constructor mocks
        (SummarAI as jest.Mock).mockImplementation(() => mockSummarAI);
        (ConfluenceAPI as jest.Mock).mockImplementation(() => mockConfluenceAPI);

        // Clear all mocks
        jest.clearAllMocks();
    });

    describe('Constructor', () => {
        test('should create ConfluenceHandler instance', () => {
            expect(confluenceHandler).toBeInstanceOf(ConfluenceHandler);
        });

        test('should extend SummarViewContainer', () => {
            expect(confluenceHandler.plugin).toBe(mockPlugin);
        });
    });

    describe('fetchAndSummarize', () => {
        const testUrl = 'https://example.atlassian.net/wiki/spaces/TEST/pages/123456/Test+Page';

        beforeEach(() => {
            // Mock containsDomain to return true for Confluence URLs
            (require('../../src/globals').containsDomain as jest.Mock).mockReturnValue(true);
        });

        test('should successfully fetch and summarize Confluence page using API', async () => {
            // Setup mocks
            const mockPageInfo = {
                pageId: '123456',
                spaceKey: 'TEST',
                title: 'Test Page'
            };
            const mockPageContent = {
                title: 'Test Page',
                content: 'This is test page content from Confluence API'
            };

            mockConfluenceAPI.getPageId.mockResolvedValue(mockPageInfo);
            mockConfluenceAPI.getPageContent.mockResolvedValue(mockPageContent);

            // Execute
            await confluenceHandler.fetchAndSummarize(testUrl);

            // Verify API calls
            expect(mockConfluenceAPI.getPageId).toHaveBeenCalledWith(testUrl);
            expect(mockConfluenceAPI.getPageContent).toHaveBeenCalledWith('123456');

            // Verify flow
            expect(confluenceHandler.initOutputRecord).toHaveBeenCalledWith('web', false);
            expect(confluenceHandler.updateOutputText).toHaveBeenCalledWith('Fetching and summarizing...');
            expect(confluenceHandler.startTimer).toHaveBeenCalled();
            expect(confluenceHandler.updateOutputText).toHaveBeenCalledWith('Fedtched page content');
            expect(confluenceHandler.updateOutputText).toHaveBeenCalledWith('Generating summary using [gpt-4]...');
            expect(confluenceHandler.pushOutputPrompt).toHaveBeenCalled();
            expect(confluenceHandler.stopTimer).toHaveBeenCalled();
            expect(confluenceHandler.updateOutputText).toHaveBeenCalledWith('Mocked summary response', true);
            expect(confluenceHandler.setNewNoteName).toHaveBeenCalled();

            // Verify SummarAI interaction
            expect(SummarAI).toHaveBeenCalledWith(mockPlugin, 'gpt-4', 'web');
            expect(mockSummarAI.hasKey).toHaveBeenCalled();
            expect(mockSummarAI.complete).toHaveBeenCalledWith([{
                role: 'user',
                text: 'Please summarize the following content:\n\nThis is test page content from Confluence API'
            }]);

            // Verify logging
            expect(SummarDebug.log).toHaveBeenCalledWith(1, 'Extracted Confluence Info:');
            expect(SummarDebug.log).toHaveBeenCalledWith(1, 'Page ID: 123456');
            expect(SummarDebug.log).toHaveBeenCalledWith(1, 'Space Key: TEST');
            expect(SummarDebug.log).toHaveBeenCalledWith(1, 'Title: Test Page');
        });

        test('should fallback to web scraping when not using Confluence API', async () => {
            // Disable Confluence API
            mockPlugin.settingsv2.common.useConfluenceAPI = false;
            
            const mockPageInfo = {
                pageId: '123456',
                spaceKey: 'TEST',
                title: 'Test Page'
            };

            mockConfluenceAPI.getPageId.mockResolvedValue(mockPageInfo);
            (SummarRequestUrl as jest.Mock).mockResolvedValue({
                text: 'This is web scraped content'
            });

            await confluenceHandler.fetchAndSummarize(testUrl);

            // Should still get page ID but use web scraping for content
            expect(mockConfluenceAPI.getPageId).toHaveBeenCalledWith(testUrl);
            expect(mockConfluenceAPI.getPageContent).not.toHaveBeenCalled();
            expect(SummarRequestUrl).toHaveBeenCalledWith(mockPlugin, {
                url: testUrl,
                method: 'GET',
                headers: {
                    Authorization: 'Bearer test-api-token'
                }
            });

            expect(mockSummarAI.complete).toHaveBeenCalledWith([{
                role: 'user',
                text: 'Please summarize the following content:\n\nThis is web scraped content'
            }]);
        });

        test('should handle non-Confluence URL with standard web scraping', async () => {
            const nonConfluenceUrl = 'https://example.com/some-page';
            
            // Mock containsDomain to return false for non-Confluence URLs
            (require('../../src/globals').containsDomain as jest.Mock).mockReturnValue(false);
            
            (SummarRequestUrl as jest.Mock).mockResolvedValue({
                text: 'This is standard web content'
            });

            await confluenceHandler.fetchAndSummarize(nonConfluenceUrl);

            // Should not call Confluence API methods
            expect(mockConfluenceAPI.getPageId).not.toHaveBeenCalled();
            expect(mockConfluenceAPI.getPageContent).not.toHaveBeenCalled();

            // Should use standard web scraping
            expect(SummarRequestUrl).toHaveBeenCalledWith(mockPlugin, {
                url: nonConfluenceUrl,
                method: 'GET'
            });

            expect(mockSummarAI.complete).toHaveBeenCalledWith([{
                role: 'user',
                text: 'Please summarize the following content:\n\nThis is standard web content'
            }]);
        });

        test('should handle missing Confluence API token', async () => {
            // Remove API token
            mockPlugin.settingsv2.common.confluenceApiToken = '';

            await confluenceHandler.fetchAndSummarize(testUrl);

            expect(SummarDebug.Notice).toHaveBeenCalledWith(
                0,
                'If you want to use the Confluence API, please configure the API token in the plugin settings.',
                0
            );
        });

        test('should handle SummarAI API error', async () => {
            // Mock API error response
            mockSummarAI.response = {
                status: 500,
                text: 'Internal Server Error',
                json: null,
                statsId: 'test-stats-id'
            };

            const mockPageInfo = {
                pageId: '123456',
                spaceKey: 'TEST',
                title: 'Test Page'
            };
            const mockPageContent = {
                title: 'Test Page',
                content: 'Test content'
            };

            mockConfluenceAPI.getPageId.mockResolvedValue(mockPageInfo);
            mockConfluenceAPI.getPageContent.mockResolvedValue(mockPageContent);

            await confluenceHandler.fetchAndSummarize(testUrl);

            expect(SummarDebug.error).toHaveBeenCalledWith(1, 'OpenAI API Error:', 'Internal Server Error');
            expect(confluenceHandler.updateOutputText).toHaveBeenCalledWith('Error: 500 - Internal Server Error');
            expect(confluenceHandler.stopTimer).toHaveBeenCalled();
        });

        test('should handle empty response from SummarAI', async () => {
            // Mock empty response
            mockSummarAI.response = {
                status: 200,
                text: '',
                json: null,
                statsId: 'test-stats-id'
            };

            const mockPageInfo = {
                pageId: '123456',
                spaceKey: 'TEST',
                title: 'Test Page'
            };
            const mockPageContent = {
                title: 'Test Page',
                content: 'Test content'
            };

            mockConfluenceAPI.getPageId.mockResolvedValue(mockPageInfo);
            mockConfluenceAPI.getPageContent.mockResolvedValue(mockPageContent);

            await confluenceHandler.fetchAndSummarize(testUrl);

            expect(confluenceHandler.updateOutputText).toHaveBeenCalledWith('No valid response from OpenAI API.');
            expect(confluenceHandler.setNewNoteName).not.toHaveBeenCalled();
        });

        test('should handle SummarAI hasKey returning false', async () => {
            // Mock hasKey to return false (no API key)
            mockSummarAI.hasKey.mockReturnValue(false);

            await confluenceHandler.fetchAndSummarize(testUrl);

            // Should return early and not proceed with fetching
            expect(confluenceHandler.updateOutputText).not.toHaveBeenCalledWith('Fetching and summarizing...');
            expect(mockConfluenceAPI.getPageId).not.toHaveBeenCalled();
        });

        test('should handle Confluence API getPageContent error', async () => {
            const mockPageInfo = {
                pageId: '123456',
                spaceKey: 'TEST',
                title: 'Test Page'
            };

            mockConfluenceAPI.getPageId.mockResolvedValue(mockPageInfo);
            mockConfluenceAPI.getPageContent.mockRejectedValue(new Error('API Error'));

            await confluenceHandler.fetchAndSummarize(testUrl);

            expect(SummarDebug.error).toHaveBeenCalledWith(1, 'Failed to fetch page content:', expect.any(Error));
            // The function continues with empty page_content and still processes
            expect(mockSummarAI.complete).toHaveBeenCalledWith([{
                role: 'user',
                text: 'Please summarize the following content:\n\n'
            }]);
        });

        test('should handle overall processing error', async () => {
            // Mock an error in the main try block
            mockConfluenceAPI.getPageId.mockRejectedValue(new Error('Network Error'));

            await confluenceHandler.fetchAndSummarize(testUrl);

            expect(confluenceHandler.stopTimer).toHaveBeenCalled();
            expect(SummarDebug.error).toHaveBeenCalledWith(1, 'Error:', expect.any(Error));
            expect(confluenceHandler.updateOutputText).toHaveBeenCalledWith(
                expect.stringContaining('An error occurred while processing the request.')
            );
        });

        test('should handle error with status and message', async () => {
            const errorWithStatus = {
                status: 404,
                message: 'Page not found'
            };

            mockConfluenceAPI.getPageId.mockRejectedValue(errorWithStatus);

            await confluenceHandler.fetchAndSummarize(testUrl);

            expect(confluenceHandler.updateOutputText).toHaveBeenCalledWith(
                'An error occurred while processing the request. | 404 Page not found'
            );
        });
    });

    describe('Configuration Validation', () => {
        test('should work with minimal configuration', () => {
            const minimalPlugin = {
                settingsv2: {
                    common: {
                        confluenceApiToken: '',
                        confluenceDomain: '',
                        useConfluenceAPI: false
                    },
                    web: {
                        webPrompt: 'Summarize:',
                        webModel: 'gpt-3.5-turbo'
                    }
                }
            } as any;

            const handler = new ConfluenceHandler(minimalPlugin);
            expect(handler).toBeInstanceOf(ConfluenceHandler);
            expect(handler.plugin).toBe(minimalPlugin);
        });

        test('should access all required settings properties', () => {
            expect(mockPlugin.settingsv2.common.confluenceApiToken).toBeDefined();
            expect(mockPlugin.settingsv2.common.confluenceDomain).toBeDefined();
            expect(mockPlugin.settingsv2.common.useConfluenceAPI).toBeDefined();
            expect(mockPlugin.settingsv2.web.webPrompt).toBeDefined();
            expect(mockPlugin.settingsv2.web.webModel).toBeDefined();
        });
    });
});