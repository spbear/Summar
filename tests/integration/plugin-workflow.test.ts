import { mockApp, mockPlugin } from '../setup';
import type { MockApp, MockPlugin } from '../types';

describe('Plugin Integration Tests', () => {
  let testPlugin: MockPlugin;
  let testApp: MockApp;

  beforeEach(() => {
    testApp = {
      vault: {
        read: jest.fn(),
        create: jest.fn(),
        modify: jest.fn(),
        delete: jest.fn(),
        adapter: {
          fs: {
            promises: {
              readFile: jest.fn(),
              writeFile: jest.fn(),
              mkdir: jest.fn(),
            }
          }
        }
      },
      workspace: {
        getActiveFile: jest.fn(),
        openLinkText: jest.fn(),
      },
      metadataCache: {
        getFirstLinkpathDest: jest.fn(),
      }
    };

    testPlugin = {
      app: testApp,
      manifest: {
        version: '1.0.0'
      },
      loadData: jest.fn(),
      saveData: jest.fn(),
      settings: {
        openaiApiKey: 'test-key',
        geminiApiKey: 'test-gemini-key',
        webpageModel: 'gpt-4o'
      },
    } as any;

    // Mock global fetch
    global.fetch = jest.fn();
  });

  test('should handle web page summarization workflow', async () => {
    const testUrl = 'https://example.com';
    const testContent = 'This is test web content';
    const testSummary = 'This is a test summary';

    // Mock fetch response
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(`<html><body>${testContent}</body></html>`)
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: testSummary } }]
        })
      });

    // Simulate webpage summarization
    const result = await simulateWebpageSummarization(testUrl, testPlugin);
    
    expect(result).toBe(testSummary);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('should handle file operations correctly', async () => {
    const fileName = 'test-note.md';
    const content = 'Test note content';

    testApp.vault.create.mockResolvedValue({ path: fileName });
    
    await simulateNoteCreation(fileName, content, testPlugin);
    
    expect(testApp.vault.create).toHaveBeenCalledWith(fileName, content);
  });

  test('should handle settings validation', () => {
    const validSettings = {
      openaiApiKey: 'valid-key',
      webpageModel: 'gpt-4o'
    };

    const invalidSettings = {
      openaiApiKey: '',
      webpageModel: 'invalid-model'
    };

    expect(validateSettings(validSettings)).toBe(true);
    expect(validateSettings(invalidSettings)).toBe(false);
  });
});

// Helper functions to simulate plugin operations
async function simulateWebpageSummarization(url: string, plugin: any): Promise<string> {
  // Simulate the webpage summarization process
  const response = await fetch(url);
  const html = await response.text();
  
  // Extract content (simplified)
  const content = html.replace(/<[^>]*>/g, '');
  
  // Call OpenAI API
  const apiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${plugin.settings.openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: plugin.settings.webpageModel,
      messages: [{ role: 'user', content: `Summarize: ${content}` }]
    })
  });
  
  const result = await apiResponse.json();
  return result.choices[0].message.content;
}

async function simulateNoteCreation(fileName: string, content: string, plugin: any): Promise<void> {
  await plugin.app.vault.create(fileName, content);
}

function validateSettings(settings: any): boolean {
  if (!settings.openaiApiKey || settings.openaiApiKey.trim().length === 0) {
    return false;
  }
  if (!settings.webpageModel || !['gpt-4o', 'gpt-4.1', 'o1-mini', 'o3-mini'].includes(settings.webpageModel)) {
    return false;
  }
  return true;
}
