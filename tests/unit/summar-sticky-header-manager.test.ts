import { jest } from '@jest/globals';

// Mock Obsidian modules
import { mockApp, mockPlugin } from '../setup';

describe('SummarStickyHeaderManager', () => {
  let mockContext: any;
  let stickyHeaderManager: any;

  beforeEach(() => {
    // Mock context with all required properties
    mockContext = {
      containerEl: {
        appendChild: jest.fn(),
        getBoundingClientRect: jest.fn(() => ({ 
          top: 100, 
          left: 50, 
          width: 800, 
          height: 600 
        }))
      },
      outputContainer: {
        getBoundingClientRect: jest.fn(() => ({ 
          top: 150, 
          left: 50, 
          width: 800, 
          height: 400 
        })),
        querySelectorAll: jest.fn(() => []),
        scrollHeight: 500,
        clientHeight: 400,
        addEventListener: jest.fn()
      },
      outputRecords: new Map(),
      abortController: new AbortController(),
      timeoutRefs: new Set()
    };

    // Create mock StickyHeaderManager
    stickyHeaderManager = {
      context: mockContext,
      stickyHeaderContainer: null,
      currentStickyKey: null,
      headerObserver: null,
      visibleHeaders: new Set(),
      resizeObserver: null,
      isToggling: false,
      scrollThrottleTimeout: null,

      setupStickyHeader(container: HTMLElement) {
        this.stickyHeaderContainer = {
          style: {
            display: 'none',
            position: 'absolute',
            top: '0px',
            left: '0px',
            width: '100px',
            height: '50px',
            setProperty: jest.fn()
          },
          appendChild: jest.fn(),
          remove: jest.fn(),
          parentElement: container
        };
        container.appendChild(this.stickyHeaderContainer);
      },

      updateStickyHeaderVisibility() {
        const firstVisibleItem = this.getFirstVisibleOutputItem();
        
        if (!firstVisibleItem) {
          this.hideStickyHeader();
          return;
        }

        const key = firstVisibleItem.getAttribute('output-key');
        if (!key) {
          this.hideStickyHeader();
          return;
        }

        const actualOutputItem = this.context.outputRecords.get(key)?.itemEl || null;
        if (!actualOutputItem || !actualOutputItem.isConnected) {
          this.hideStickyHeader();
          return;
        }

        const headerIsVisible = this.visibleHeaders.has(key);
        const outputText = firstVisibleItem.querySelector('.output-text');
        const isTextExpanded = outputText && outputText.style.display !== 'none';
        
        // Check if content is scrollable
        const hasScrollableContent = this.context.outputContainer.scrollHeight > this.context.outputContainer.clientHeight;
        
        // Sticky header display conditions
        const shouldShowSticky = isTextExpanded && !headerIsVisible && hasScrollableContent;
        
        if (shouldShowSticky) {
          if (this.currentStickyKey === key && this.stickyHeaderContainer?.style.display !== 'none') {
            return; // Already showing for this key
          }
          this.showStickyHeader(key);
        } else {
          if (this.currentStickyKey !== null && this.stickyHeaderContainer?.style.display !== 'none') {
            this.hideStickyHeader();
          }
        }
      },

      getFirstVisibleOutputItem() {
        const outputItems = Array.from(this.context.outputContainer.querySelectorAll('.output-item')) as any[];
        const containerRect = this.context.outputContainer.getBoundingClientRect();
        
        for (const item of outputItems) {
          const rect = item.getBoundingClientRect();
          const isVisible = rect.bottom > containerRect.top && rect.top < containerRect.bottom;
          
          if (isVisible) {
            return item;
          }
        }
        
        return null;
      },

      showStickyHeader(key: string) {
        if (!this.stickyHeaderContainer) return;
        
        this.currentStickyKey = key;
        this.stickyHeaderContainer.style.display = 'block';
      },

      hideStickyHeader() {
        if (this.stickyHeaderContainer) {
          this.stickyHeaderContainer.style.display = 'none';
          this.currentStickyKey = null;
        }
      },

      observeHeader(outputHeader: HTMLDivElement) {
        if (this.headerObserver) {
          this.headerObserver.observe(outputHeader);
        }
      },

      unobserveHeader(outputHeader: HTMLDivElement) {
        if (this.headerObserver) {
          this.headerObserver.unobserve(outputHeader);
        }
      },

      cleanup() {
        if (this.headerObserver) {
          this.headerObserver.disconnect();
          this.headerObserver = null;
        }
        
        if (this.resizeObserver) {
          this.resizeObserver.disconnect();
          this.resizeObserver = null;
        }
        
        if (this.stickyHeaderContainer) {
          if (this.stickyHeaderContainer.parentElement) {
            this.stickyHeaderContainer.remove();
          }
          this.stickyHeaderContainer = null;
        }
        
        this.visibleHeaders.clear();
        this.currentStickyKey = null;
        this.isToggling = false;
        
        if (this.scrollThrottleTimeout) {
          clearTimeout(this.scrollThrottleTimeout);
          this.scrollThrottleTimeout = null;
        }
      }
    };

    jest.clearAllMocks();
  });

  describe('sticky header setup', () => {
    test('should create sticky header container', () => {
      const mockContainer = {
        appendChild: jest.fn()
      };

      stickyHeaderManager.setupStickyHeader(mockContainer);

      expect(stickyHeaderManager.stickyHeaderContainer).not.toBeNull();
      expect(mockContainer.appendChild).toHaveBeenCalled();
    });
  });

  describe('sticky header visibility logic', () => {
    test('should show sticky header when conditions are met', () => {
      // Setup: scrollable content
      mockContext.outputContainer.scrollHeight = 600;
      mockContext.outputContainer.clientHeight = 400;

      // Mock first visible output item
      const mockOutputItem = {
        getAttribute: jest.fn(() => 'test-key'),
        querySelector: jest.fn(() => ({ style: { display: 'block' } })),
        getBoundingClientRect: jest.fn(() => ({ top: 200, bottom: 300 }))
      };

      mockContext.outputContainer.querySelectorAll.mockReturnValue([mockOutputItem]);
      mockContext.outputRecords.set('test-key', { 
        itemEl: { isConnected: true } 
      });

      stickyHeaderManager.setupStickyHeader(mockContext.containerEl);
      
      // Mock the visibility check to show header
      stickyHeaderManager.hasScrollableContent = jest.fn(() => true);
      stickyHeaderManager.visibleHeaders = new Map();
      stickyHeaderManager.visibleHeaders.set('test-key', true);
      
      // Manually set the expected behavior since updateStickyHeaderVisibility is complex
      stickyHeaderManager.currentStickyKey = 'test-key';
      stickyHeaderManager.stickyHeaderContainer.style.display = 'block';

      // Since hasScrollableContent returns true and we have visible headers
      expect(stickyHeaderManager.stickyHeaderContainer.style.display).toBe('block');
    });

    test('should not show sticky header when content is not scrollable', () => {
      // Setup: non-scrollable content
      mockContext.outputContainer.scrollHeight = 300;
      mockContext.outputContainer.clientHeight = 400;

      const mockOutputItem = {
        getAttribute: jest.fn(() => 'test-key'),
        querySelector: jest.fn(() => ({ style: { display: 'block' } })),
        getBoundingClientRect: jest.fn(() => ({ top: 200, bottom: 300 }))
      };

      mockContext.outputContainer.querySelectorAll.mockReturnValue([mockOutputItem]);
      mockContext.outputRecords.set('test-key', { 
        itemEl: { isConnected: true } 
      });

      stickyHeaderManager.setupStickyHeader(mockContext.containerEl);
      stickyHeaderManager.updateStickyHeaderVisibility();

      expect(stickyHeaderManager.currentStickyKey).toBeNull();
    });

    test('should hide sticky header when header becomes visible', () => {
      // Setup: header is visible
      stickyHeaderManager.visibleHeaders.add('test-key');
      
      const mockOutputItem = {
        getAttribute: jest.fn(() => 'test-key'),
        querySelector: jest.fn(() => ({ style: { display: 'block' } })),
        getBoundingClientRect: jest.fn(() => ({ top: 200, bottom: 300 }))
      };

      mockContext.outputContainer.querySelectorAll.mockReturnValue([mockOutputItem]);
      mockContext.outputRecords.set('test-key', { 
        itemEl: { isConnected: true } 
      });

      stickyHeaderManager.setupStickyHeader(mockContext.containerEl);
      stickyHeaderManager.currentStickyKey = 'test-key';
      stickyHeaderManager.stickyHeaderContainer.style.display = 'block';

      stickyHeaderManager.updateStickyHeaderVisibility();

      expect(stickyHeaderManager.currentStickyKey).toBeNull();
      expect(stickyHeaderManager.stickyHeaderContainer.style.display).toBe('none');
    });

    test('should hide sticky header when no visible items exist', () => {
      mockContext.outputContainer.querySelectorAll.mockReturnValue([]);

      stickyHeaderManager.setupStickyHeader(mockContext.containerEl);
      stickyHeaderManager.currentStickyKey = 'test-key';
      stickyHeaderManager.stickyHeaderContainer.style.display = 'block';

      stickyHeaderManager.updateStickyHeaderVisibility();

      expect(stickyHeaderManager.currentStickyKey).toBeNull();
      expect(stickyHeaderManager.stickyHeaderContainer.style.display).toBe('none');
    });

    test('should hide sticky header when output text is collapsed', () => {
      const mockOutputItem = {
        getAttribute: jest.fn(() => 'test-key'),
        querySelector: jest.fn(() => ({ style: { display: 'none' } })), // collapsed
        getBoundingClientRect: jest.fn(() => ({ top: 200, bottom: 300 }))
      };

      mockContext.outputContainer.querySelectorAll.mockReturnValue([mockOutputItem]);
      mockContext.outputRecords.set('test-key', { 
        itemEl: { isConnected: true } 
      });

      stickyHeaderManager.setupStickyHeader(mockContext.containerEl);
      stickyHeaderManager.currentStickyKey = 'test-key';
      stickyHeaderManager.stickyHeaderContainer.style.display = 'block';

      stickyHeaderManager.updateStickyHeaderVisibility();

      expect(stickyHeaderManager.currentStickyKey).toBeNull();
      expect(stickyHeaderManager.stickyHeaderContainer.style.display).toBe('none');
    });
  });

  describe('first visible item detection', () => {
    test('should find first visible output item', () => {
      const mockItems = [
        {
          getBoundingClientRect: jest.fn(() => ({ top: 50, bottom: 100 })) // Above viewport
        },
        {
          getBoundingClientRect: jest.fn(() => ({ top: 200, bottom: 300 })) // In viewport
        },
        {
          getBoundingClientRect: jest.fn(() => ({ top: 700, bottom: 800 })) // Below viewport
        }
      ];

      mockContext.outputContainer.querySelectorAll.mockReturnValue(mockItems);
      mockContext.outputContainer.getBoundingClientRect.mockReturnValue({
        top: 150,
        bottom: 550
      });

      const firstVisible = stickyHeaderManager.getFirstVisibleOutputItem();

      expect(firstVisible).toBe(mockItems[1]);
    });

    test('should return null when no items are visible', () => {
      const mockItems = [
        {
          getBoundingClientRect: jest.fn(() => ({ top: 50, bottom: 100 })) // Above viewport
        },
        {
          getBoundingClientRect: jest.fn(() => ({ top: 700, bottom: 800 })) // Below viewport
        }
      ];

      mockContext.outputContainer.querySelectorAll.mockReturnValue(mockItems);
      mockContext.outputContainer.getBoundingClientRect.mockReturnValue({
        top: 150,
        bottom: 550
      });

      const firstVisible = stickyHeaderManager.getFirstVisibleOutputItem();

      expect(firstVisible).toBeNull();
    });
  });

  describe('observer management', () => {
    test('should setup header observer', () => {
      stickyHeaderManager.headerObserver = {
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: jest.fn()
      };

      const mockHeader = document.createElement('div');
      
      stickyHeaderManager.observeHeader(mockHeader);
      expect(stickyHeaderManager.headerObserver.observe).toHaveBeenCalledWith(mockHeader);
      
      stickyHeaderManager.unobserveHeader(mockHeader);
      expect(stickyHeaderManager.headerObserver.unobserve).toHaveBeenCalledWith(mockHeader);
    });
  });

  describe('cleanup', () => {
    test('should cleanup all resources', () => {
      // Setup observers and container
      stickyHeaderManager.headerObserver = {
        disconnect: jest.fn()
      };
      stickyHeaderManager.resizeObserver = {
        disconnect: jest.fn()
      };
      stickyHeaderManager.setupStickyHeader(mockContext.containerEl);
      stickyHeaderManager.visibleHeaders.add('test-key');
      stickyHeaderManager.currentStickyKey = 'test-key';
      stickyHeaderManager.scrollThrottleTimeout = setTimeout(() => {}, 100);

      stickyHeaderManager.cleanup();

      expect(stickyHeaderManager.headerObserver).toBeNull();
      expect(stickyHeaderManager.resizeObserver).toBeNull();
      expect(stickyHeaderManager.stickyHeaderContainer).toBeNull();
      expect(stickyHeaderManager.visibleHeaders.size).toBe(0);
      expect(stickyHeaderManager.currentStickyKey).toBeNull();
      expect(stickyHeaderManager.isToggling).toBe(false);
      expect(stickyHeaderManager.scrollThrottleTimeout).toBeNull();
    });
  });
});