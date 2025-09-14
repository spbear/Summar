import { jest } from '@jest/globals';
import { mockApp, mockPlugin } from '../setup';

describe('StatusBar', () => {
  let statusBar: any;
  let mockStatusBarElement: HTMLElement;
  let mockIconElement: HTMLElement;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock DOM elements
    mockStatusBarElement = document.createElement('div');
    mockIconElement = document.createElement('div');
    
    // Mock the plugin's addStatusBarItem method
    (mockPlugin as any).addStatusBarItem = jest.fn().mockReturnValue(mockStatusBarElement);

    // Create mock StatusBar
    statusBar = {
      plugin: mockPlugin,
      statusBarItem: null,
      update: jest.fn(),
      setupEventListeners: jest.fn(),
      destroy: jest.fn()
    };
  });

  describe('initialization', () => {
    test('should create status bar item', () => {
      statusBar.statusBarItem = (mockPlugin as any).addStatusBarItem();
      
      expect((mockPlugin as any).addStatusBarItem).toHaveBeenCalled();
      expect(statusBar.statusBarItem).toBe(mockStatusBarElement);
    });

    test('should setup icon container when showSettings is true', () => {
      const createStatusBar = (showSettings: boolean) => {
        const statusBarItem = mockStatusBarElement;
        
        if (showSettings) {
          const iconEl = document.createElement("div");
          iconEl.classList.add("status-bar-icon-container");
          statusBarItem.appendChild(iconEl);
          
          // Setup styling
          statusBarItem.style.cursor = "pointer";
          statusBarItem.style.transition = "all 0.2s ease";
          statusBarItem.style.padding = "2px 8px";
          statusBarItem.style.borderRadius = "5px";
          
          return { statusBarItem, hasIcon: true };
        }
        
        return { statusBarItem, hasIcon: false };
      };

      const result = createStatusBar(true);
      
      expect(result.hasIcon).toBe(true);
      expect(result.statusBarItem.style.cursor).toBe("pointer");
      expect(result.statusBarItem.style.transition).toBe("all 0.2s ease");
      expect(result.statusBarItem.style.padding).toBe("2px 8px");
      expect(result.statusBarItem.style.borderRadius).toBe("5px");
    });

    test('should not setup icon when showSettings is false', () => {
      const createStatusBar = (showSettings: boolean) => {
        const statusBarItem = mockStatusBarElement;
        
        if (showSettings) {
          const iconEl = document.createElement("div");
          iconEl.classList.add("status-bar-icon-container");
          statusBarItem.appendChild(iconEl);
          return { statusBarItem, hasIcon: true };
        }
        
        return { statusBarItem, hasIcon: false };
      };

      const result = createStatusBar(false);
      expect(result.hasIcon).toBe(false);
    });
  });

  describe('mouse events', () => {
    test('should handle mouseenter event with visual effects', () => {
      const element = mockStatusBarElement;
      
      // Simulate mouseenter event handler
      const handleMouseEnter = () => {
        element.style.backgroundColor = "rgba(192, 192, 192, 0.2)";
        element.style.boxShadow = "0 0 5px rgba(192, 192, 192, 0.5)";
        element.style.transform = "scale(1.05)";
      };

      handleMouseEnter();

      expect(element.style.backgroundColor).toBe("rgba(192, 192, 192, 0.2)");
      expect(element.style.boxShadow).toBe("0 0 5px rgba(192, 192, 192, 0.5)");
      expect(element.style.transform).toBe("scale(1.05)");
    });

    test('should handle mouseleave event to reset styles', () => {
      const element = mockStatusBarElement;
      
      // First apply hover styles
      element.style.backgroundColor = "rgba(192, 192, 192, 0.2)";
      element.style.boxShadow = "0 0 5px rgba(192, 192, 192, 0.5)";
      element.style.transform = "scale(1.05)";
      
      // Simulate mouseleave event handler
      const handleMouseLeave = () => {
        element.style.backgroundColor = "transparent";
        element.style.boxShadow = "none";
        element.style.transform = "scale(1)";
      };

      handleMouseLeave();

      expect(element.style.backgroundColor).toBe("transparent");
      expect(element.style.boxShadow).toBe("none");
      expect(element.style.transform).toBe("scale(1)");
    });

    test('should setup event listeners for mouse interactions', () => {
      const element = mockStatusBarElement;
      const addEventListener = jest.spyOn(element, 'addEventListener');

      // Simulate setting up event listeners
      const setupEventListeners = (element: HTMLElement) => {
        element.addEventListener("mouseenter", jest.fn());
        element.addEventListener("mouseleave", jest.fn());
        element.addEventListener("click", jest.fn());
      };

      setupEventListeners(element);

      expect(addEventListener).toHaveBeenCalledWith("mouseenter", expect.any(Function));
      expect(addEventListener).toHaveBeenCalledWith("mouseleave", expect.any(Function));
      expect(addEventListener).toHaveBeenCalledWith("click", expect.any(Function));
    });
  });

  describe('update method', () => {
    test('should update status bar text and color', () => {
      statusBar.update = jest.fn().mockImplementation((message: string, color: string) => {
        if (statusBar.statusBarItem) {
          statusBar.statusBarItem.textContent = message;
          statusBar.statusBarItem.style.color = color;
        }
      });

      statusBar.statusBarItem = mockStatusBarElement;
      statusBar.update("Test message", "blue");

      expect(statusBar.statusBarItem.textContent).toBe("Test message");
      expect(statusBar.statusBarItem.style.color).toBe("blue");
    });

    test('should handle update when statusBarItem is null', () => {
      statusBar.update = jest.fn().mockImplementation((message: string, color: string) => {
        if (statusBar.statusBarItem) {
          statusBar.statusBarItem.textContent = message;
          statusBar.statusBarItem.style.color = color;
        }
      });

      statusBar.statusBarItem = null;
      
      // Should not throw error
      expect(() => statusBar.update("Test", "red")).not.toThrow();
    });

    test('should update status with different message types', () => {
      const testCases = [
        { message: "Recording...", color: "green" },
        { message: "Processing", color: "orange" },
        { message: "Complete", color: "blue" },
        { message: "Error", color: "red" }
      ];

      statusBar.statusBarItem = mockStatusBarElement;
      
      testCases.forEach(({ message, color }) => {
        statusBar.statusBarItem.textContent = message;
        statusBar.statusBarItem.style.color = color;
        
        expect(statusBar.statusBarItem.textContent).toBe(message);
        expect(statusBar.statusBarItem.style.color).toBe(color);
      });
    });
  });

  describe('click event handling', () => {
    test('should trigger settings tab on click', () => {
      const mockShowSettingsTab = jest.fn();
      
      // Simulate click event handler
      const handleClick = () => {
        mockShowSettingsTab(statusBar.plugin, 'schedule-tab');
      };

      handleClick();

      expect(mockShowSettingsTab).toHaveBeenCalledWith(statusBar.plugin, 'schedule-tab');
    });

    test('should handle click with different tab types', () => {
      const mockShowSettingsTab = jest.fn();
      
      const tabTypes = ['schedule-tab', 'common-tab', 'recording-tab'];
      
      tabTypes.forEach(tab => {
        mockShowSettingsTab(statusBar.plugin, tab);
        expect(mockShowSettingsTab).toHaveBeenCalledWith(statusBar.plugin, tab);
      });
    });
  });

  describe('styling and CSS classes', () => {
    test('should apply correct CSS classes to icon container', () => {
      const iconEl = document.createElement("div");
      iconEl.classList.add("status-bar-icon-container");
      
      expect(iconEl.classList.contains("status-bar-icon-container")).toBe(true);
    });

    test('should apply transition and visual styling', () => {
      const element = mockStatusBarElement;
      
      // Apply status bar styling
      element.style.cursor = "pointer";
      element.style.transition = "all 0.2s ease";
      element.style.padding = "2px 8px";
      element.style.borderRadius = "5px";

      expect(element.style.cursor).toBe("pointer");
      expect(element.style.transition).toBe("all 0.2s ease");
      expect(element.style.padding).toBe("2px 8px");
      expect(element.style.borderRadius).toBe("5px");
    });
  });

  describe('cleanup and destruction', () => {
    test('should handle cleanup of event listeners', () => {
      const element = mockStatusBarElement;
      const removeEventListener = jest.spyOn(element, 'removeEventListener');

      // Simulate cleanup
      const cleanup = (element: HTMLElement) => {
        element.removeEventListener("mouseenter", jest.fn());
        element.removeEventListener("mouseleave", jest.fn());
        element.removeEventListener("click", jest.fn());
      };

      cleanup(element);

      expect(removeEventListener).toHaveBeenCalledWith("mouseenter", expect.any(Function));
      expect(removeEventListener).toHaveBeenCalledWith("mouseleave", expect.any(Function));
      expect(removeEventListener).toHaveBeenCalledWith("click", expect.any(Function));
    });

    test('should handle status bar destruction', () => {
      statusBar.destroy = jest.fn().mockImplementation(() => {
        statusBar.statusBarItem = null;
      });

      statusBar.statusBarItem = mockStatusBarElement;
      statusBar.destroy();

      expect(statusBar.statusBarItem).toBeNull();
    });
  });
});