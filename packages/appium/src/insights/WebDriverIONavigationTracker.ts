import { NavigationTracker } from './NavigationTracker';
const { logger } = require('../../../sdk-utils/src/insights/insights-logger');

// Define the interface locally since it's not exported from NavigationTracker
interface NavigationTrackerOptions {
  enableApiUpload?: boolean;
  apiUploadOptions?: any;
}

/**
 * WebDriverIO-specific wrapper for NavigationTracker
 * Handles WebDriverIO-specific method differences and session management
 */
export class WebDriverIONavigationTracker extends NavigationTracker {
  private webdriverBrowser: any;
  
  constructor(browser: any, options: NavigationTrackerOptions = {}) {
    // Create a proxy driver that translates WebDriverIO methods to Appium-compatible ones
    const driverProxy = new Proxy(browser, {
      get(target, prop, receiver) {
        // Handle URL fetching method difference
        if (prop === 'getCurrentUrl' && !target.getCurrentUrl && target.getUrl) {
          return target.getUrl.bind(target);
        }
        
        // Handle capabilities access
        if (prop === 'capabilities') {
          return target.capabilities || target.requestedCapabilities || target.desiredCapabilities;
        }
        
        // Handle session ID access
        if (prop === 'sessionId') {
          return target.sessionId || 
                 (target.session && target.session.id) ||
                 (target.options && target.options.sessionId);
        }
        
        return Reflect.get(target, prop, receiver);
      }
    });
    
    super(driverProxy, options);
    
    // Store the original browser reference after super()
    this.webdriverBrowser = browser;
    
    logger.init('WebDriverIO NavigationTracker initialized');
  }

  /**
   * Enhanced test name extraction specifically for WebDriverIO context
   */
  public getWebDriverIOTestName(): string {
    try {
      const browser = this.webdriverBrowser;
      
      // Check for WebDriverIO test context
      if (browser && browser.sessionId) {
        // Check for current test context from WebDriverIO
        if ((global as any).currentTestTitle) {
          return (global as any).currentTestTitle;
        }
        
        // Check for test name in capabilities
        const caps = browser.capabilities || browser.requestedCapabilities || {};
        
        // Check for LambdaTest specific test name
        if (caps['lt:options'] && caps['lt:options'].name) {
          return caps['lt:options'].name;
        }
        
        // Check for general test name
        if (caps.name) {
          return caps.name;
        }
        
        // Check for build name as fallback
        if (caps['lt:options'] && caps['lt:options'].build) {
          return `${caps['lt:options'].build}_test`;
        }
      }
      
      // Fallback to timestamp-based name
      return `wdio_test_${Date.now()}`;
    } catch (error) {
      logger.error(`Error getting WebDriverIO test name: ${error}`);
      return `wdio_test_${Date.now()}`;
    }
  }

  /**
   * WebDriverIO-specific method to set current test context
   */
  public setCurrentTest(testTitle: string) {
    (global as any).currentTestTitle = testTitle;
    logger.navigation(`Test context set: ${testTitle}`);
  }

  /**
   * Enhanced element detection for WebDriverIO
   */
  public async recordWebDriverIOAction(elementSelector: string, actionType: string = 'click') {
    try {
      // Extract element ID from selector if possible
      let elementId = elementSelector;
      
      // Handle WebDriverIO selector formats
      if (elementSelector.startsWith('~')) {
        // Accessibility ID selector
        elementId = elementSelector.substring(1);
      } else if (elementSelector.startsWith('#')) {
        // ID selector
        elementId = elementSelector.substring(1);
      } else if (elementSelector.includes('=')) {
        // Extract value from various WebDriverIO selectors
        const parts = elementSelector.split('=');
        if (parts.length > 1) {
          elementId = parts[1];
        }
      }
      
      await this.recordUserAction(elementId);
      logger.navigation(`WebDriverIO action recorded: ${actionType} on ${elementId}`);
    } catch (error) {
      logger.error(`Error recording WebDriverIO action: ${error}`);
    }
  }

  /**
   * Convenience method for WebDriverIO click tracking
   */
  public async clickAndTrack(selector: string, elementName?: string) {
    const element = await this.webdriverBrowser.$(selector);
    const actionName = elementName || selector;
    
    await this.recordWebDriverIOAction(selector, 'click');
    await this.beforeClick(actionName);
    await element.click();
    await this.afterClick();
    
    logger.navigation(`Clicked and tracked: ${actionName}`);
  }

  /**
   * Convenience method for WebDriverIO text input tracking
   */
  public async setValueAndTrack(selector: string, value: string, elementName?: string) {
    const element = await this.webdriverBrowser.$(selector);
    const actionName = elementName || selector;
    
    await this.recordWebDriverIOAction(selector, 'input');
    await element.setValue(value);
    
    logger.navigation(`Set value and tracked: ${actionName} = ${value}`);
  }

  /**
   * Enhanced URL detection for WebDriverIO
   */
  public async getWebDriverIOUrl(): Promise<string | undefined> {
    try {
      const browser = this.webdriverBrowser;
      
      // Try WebDriverIO's getUrl method first
      if (typeof browser.getUrl === 'function') {
        return await browser.getUrl();
      }
      
      // Fallback to standard getCurrentUrl if available
      if (typeof browser.getCurrentUrl === 'function') {
        return await browser.getCurrentUrl();
      }
      
      return undefined;
    } catch (error) {
      logger.debug(`Error getting WebDriverIO URL: ${error}`, true);
      return undefined;
    }
  }

  /**
   * WebDriverIO-specific session information
   */
  public getWebDriverIOSessionInfo() {
    const browser = this.webdriverBrowser;
    const capabilities = browser.capabilities || browser.requestedCapabilities || {};
    
    return {
      sessionId: browser.sessionId,
      platformName: capabilities.platformName || capabilities['appium:platformName'],
      deviceName: capabilities.deviceName || capabilities['appium:deviceName'],
      automationName: capabilities.automationName || capabilities['appium:automationName'],
      buildName: capabilities['lt:options'] && capabilities['lt:options'].build,
      testName: capabilities['lt:options'] && capabilities['lt:options'].name
    };
  }
}

/**
 * Factory function to create WebDriverIO-compatible NavigationTracker
 */
export function createWebDriverIOTracker(browser: any, options: NavigationTrackerOptions = {}): WebDriverIONavigationTracker {
  return new WebDriverIONavigationTracker(browser, options);
}

export { NavigationTrackerOptions }; 