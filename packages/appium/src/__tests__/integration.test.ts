/**
 * Integration tests for NavigationTracker with logger and API uploader
 */

import { NavigationTracker, logger, ApiUploader } from '../index';

describe('NavigationTracker Integration', () => {
  let mockDriver: any;
  let tracker: NavigationTracker;

  beforeEach(() => {
    // Mock Appium driver
    mockDriver = {
      sessionId: 'test-session-123',
      capabilities: {
        platformName: 'Android',
        automationName: 'UiAutomator2'
      },
      getPageSource: jest.fn().mockResolvedValue(
        '<android.widget.LinearLayout id="main">' +
        '<android.widget.Button id="color">Color</android.widget.Button>' +
        '</android.widget.LinearLayout>'
      ),
      getCurrentUrl: jest.fn().mockResolvedValue('https://example.com')
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should initialize NavigationTracker without API upload', () => {
    tracker = new NavigationTracker(mockDriver);
    expect(tracker).toBeInstanceOf(NavigationTracker);
  });

  test('should initialize NavigationTracker with API upload enabled', () => {
    tracker = new NavigationTracker(mockDriver, {
      enableApiUpload: true,
      apiUploadOptions: {
        username: 'test-user',
        accessKey: 'test-key',
        timeout: 5000
      }
    });
    expect(tracker).toBeInstanceOf(NavigationTracker);
  });

  test('should track user actions', async () => {
    tracker = new NavigationTracker(mockDriver);
    
    await expect(tracker.recordUserAction('color')).resolves.not.toThrow();
    await expect(tracker.trackNavigation()).resolves.not.toThrow();
  });

  test('should handle click hooks', async () => {
    tracker = new NavigationTracker(mockDriver);
    
    await expect(tracker.beforeClick('submitButton')).resolves.not.toThrow();
    await expect(tracker.afterClick()).resolves.not.toThrow();
  });

  test('logger should work correctly', () => {
    expect(() => {
      logger.info('Test info message');
      logger.success('Test success message');
      logger.warn('Test warning message');
      logger.error('Test error message');
      logger.navigation('Test navigation message');
      logger.apiUpload('Test API upload message');
    }).not.toThrow();
  });

  test('ApiUploader should validate tracking data', () => {
    const validData = {
      navigations: [
        {
          spec_file: 'test.spec.ts',
          test_name: 'test case',
          previous_screen: 'Home',
          current_screen: 'Profile',
          timestamp: new Date().toISOString(),
          navigation_type: 'user_interaction'
        }
      ]
    };

    const invalidData = {
      navigations: []
    };

    expect(ApiUploader.validateTrackingData(validData)).toBe(true);
    expect(ApiUploader.validateTrackingData(invalidData)).toBe(false);
    expect(ApiUploader.validateTrackingData(null as any)).toBe(false);
  });

  test('ApiUploader should extract test ID correctly', () => {
    const metadata = {
      session_id: 'session-123'
    };

    const options = {
      testName: 'my-test'
    };

    const testId = ApiUploader.extractTestId(metadata, options);
    expect(testId).toBe('session-123');

    const testIdFallback = ApiUploader.extractTestId(null, options);
    expect(testIdFallback).toContain('my-test_');
  });

  test('should save results without throwing', async () => {
    tracker = new NavigationTracker(mockDriver);
    
    // Add some mock navigation data
    await tracker.recordUserAction('color');
    await tracker.trackNavigation();
    
    await expect(tracker.saveResults()).resolves.not.toThrow();
  });
}); 