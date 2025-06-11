const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const { logger } = require('../lib/logger');

// Import the enhanced HTML reporter
const { EnhancedHtmlReporter } = require('./html-reporter-enhanced');

/**
 * @typedef {Object} HtmlReporterOptions
 * @property {string} [outputDir]
 * @property {string} [reportName]
 * @property {string} [title]
 * @property {boolean} [enableKeyboardShortcut]
 * @property {boolean} [autoOpen]
 * @property {'dark'|'light'} [theme]
 */

/**
 * @typedef {Object} NavigationItem
 * @property {string} from
 * @property {string} to
 * @property {string} timestamp
 * @property {string} type
 * @property {string} [test_name]
 * @property {string} [spec_file]
 * @property {string} [previous_url]
 * @property {string} [current_url]
 * @property {string} [previous_screen]
 * @property {string} [current_screen]
 * @property {string} [navigation_type]
 */

/**
 * @typedef {Object} SessionData
 * @property {string} session_id
 * @property {string} spec_file
 * @property {string} test_name
 * @property {string} timestamp
 * @property {number} navigation_count
 * @property {NavigationItem[]} navigations
 * @property {string} framework
 * @property {Object} [metadata]
 * @property {string} [save_timestamp]
 */

/**
 * @typedef {Object} ReportSummary
 * @property {number} totalSessions
 * @property {number} totalNavigations
 * @property {string[]} frameworks
 * @property {string[]} testFiles
 * @property {string} timestamp
 */

/**
 * @typedef {Object} ReportData
 * @property {string} framework
 * @property {SessionData[]} sessions
 * @property {ReportSummary} summary
 */

/**
 * @typedef {Object} ColorTheme
 * @property {string} bg
 * @property {string} surface
 * @property {string} surfaceHover
 * @property {string} text
 * @property {string} textMuted
 * @property {string} primary
 * @property {string} primaryHover
 * @property {string} accent
 * @property {string} border
 * @property {string} success
 * @property {string} warning
 * @property {string} error
 */

/**
 * Main HTML Reporter class that provides both legacy and enhanced reporting
 * This class serves as the main entry point and can switch between report styles
 */
class HtmlReporter {
    constructor(options = {}) {
        this.options = {
            outputDir: options.outputDir || 'test-results',
            reportName: options.reportName || 'url-tracking-report.html',
            title: options.title || 'LambdaTest URL Tracking Report',
            enableKeyboardShortcut: options.enableKeyboardShortcut !== false,
            autoOpen: options.autoOpen || false,
            theme: options.theme || 'dark', // Default to dark theme
            enhanced: options.enhanced !== false, // Use enhanced version by default
            showTimeline: options.showTimeline !== false,
            showMetrics: options.showMetrics !== false,
            enableSearch: options.enableSearch !== false,
            enableFilters: options.enableFilters !== false
        };
        
        // Use enhanced reporter if requested (default)
        if (this.options.enhanced) {
            this.reporter = new EnhancedHtmlReporter(this.options);
        } else {
            // Keep legacy implementation for backward compatibility
            this.reporter = this;
            this.reportPath = null;
            this.isListening = false;
            this.keyPressHandler = null;
        }
    }

    /**
     * Generate HTML report from tracking results
     * This is the main public API method
     */
    generateReport(trackingData, framework = 'unknown') {
        if (this.options.enhanced && this.reporter !== this) {
            return this.reporter.generateReport(trackingData, framework);
        }
        
        // Legacy implementation for backward compatibility
        return this.generateLegacyReport(trackingData, framework);
    }

    /**
     * Legacy report generation (existing implementation)
     */
    generateLegacyReport(trackingData, framework = 'unknown') {
        try {
            console.log(`🎯 Generating ${framework} tracking report...`);
            
            // Ensure output directory exists
            const outputDir = path.resolve(process.cwd(), this.options.outputDir);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // Parse and normalize tracking data
            const reportData = this.parseTrackingData(trackingData, framework);
            
            // Generate HTML content
            const htmlContent = this.generateHtmlContent(reportData, framework);
            
            // Write HTML file
            const outputPath = path.join(outputDir, this.options.reportName);
            fs.writeFileSync(outputPath, htmlContent, 'utf8');
            
            console.log(`✅ Report generated: ${outputPath}`);
            
            // Store the report path
            this.reportPath = outputPath;
            
            // Setup keyboard shortcut if enabled
            if (this.options.enableKeyboardShortcut && !this.isListening) {
                this.setupKeyboardShortcut();
            }
            
            // Auto-open if enabled
            if (this.options.autoOpen) {
                this.openReport();
            }
            
            return outputPath;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`❌ Error generating HTML report: ${errorMsg}`);
            throw error;
        }
    }

    /**
     * Parse and normalize tracking data from different frameworks
     */
    parseTrackingData(data, framework) {
        let normalized = {
            framework,
            sessions: [],
            summary: {
                totalSessions: 0,
                totalNavigations: 0,
                frameworks: [],
                testFiles: [],
                timestamp: new Date().toISOString()
            }
        };

        try {
            if (Array.isArray(data)) {
                // Multiple sessions (Playwright/WebDriverIO format)
                data.forEach((session) => {
                    if (session.navigations && Array.isArray(session.navigations)) {
                        normalized.sessions.push(this.normalizeSession(session, framework));
                    } else if (session.metadata && session.navigations) {
                        // Playwright format with metadata
                        normalized.sessions.push(this.normalizeSession(session, framework));
                    }
                });
            } else if (data.navigations && Array.isArray(data.navigations)) {
                // Single session (Appium format)
                normalized.sessions.push(this.normalizeSession(data, framework));
            }

            // Calculate summary
            normalized.summary.totalSessions = normalized.sessions.length;
            normalized.summary.totalNavigations = normalized.sessions.reduce((total, session) => {
                return total + (session.navigations ? session.navigations.length : 0);
            }, 0);
            
            normalized.summary.testFiles = [...new Set(normalized.sessions.map((s) => s.spec_file).filter(Boolean))];
            normalized.summary.frameworks = [framework];
            
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`Error parsing tracking data: ${errorMsg}`);
        }

        return normalized;
    }

    /**
     * Normalize session data format
     */
    normalizeSession(session, framework) {
        return {
            session_id: session.session_id || session.metadata?.session_id || `session_${Date.now()}`,
            spec_file: session.spec_file || session.metadata?.spec_file || 'unknown.spec.js',
            test_name: session.test_name || session.metadata?.name || 'Unknown Test',
            timestamp: session.timestamp || new Date().toISOString(),
            framework: framework,
            navigations: session.navigations ? session.navigations.map(nav => this.normalizeNavigation(nav, framework)) : [],
            metadata: session.metadata || {}
        };
    }

    /**
     * Normalize navigation data
     */
    normalizeNavigation(navigation, framework) {
        // Handle different navigation formats from different frameworks
        const normalized = {
            previous_url: navigation.previous_url || navigation.from || navigation.previous_screen || 'null',
            current_url: navigation.current_url || navigation.to || navigation.current_screen || 'null',
            timestamp: navigation.timestamp || new Date().toISOString(),
            navigation_type: navigation.navigation_type || navigation.type || 'navigation',
            test_name: navigation.test_name || 'Unknown Test',
            spec_file: navigation.spec_file || 'unknown.spec.js'
        };

        return normalized;
    }

    /**
     * Generate legacy HTML content
     */
    generateHtmlContent(reportData, framework) {
        const isDark = this.options.theme === 'dark';
        
        return `
<!DOCTYPE html>
<html>
<head>
    <title>${this.options.title}</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        ${this.getStyles(isDark)}
    </style>
</head>
<body class="${isDark ? 'dark' : 'light'}">
    <div class="container">
        <header>
            <h1>${this.options.title}</h1>
            <div class="framework-badge">${framework}</div>
        </header>
        
        <div class="content">
            ${this.generateSessions(reportData.sessions)}
        </div>
        
        <footer>
            <p>Generated by LambdaTest URL Tracker</p>
        </footer>
    </div>
    
    <script>
        ${this.getJavaScript()}
    </script>
</body>
</html>`;
    }

    /**
     * Generate CSS styles
     */
    getStyles(isDark) {
        const colors = isDark ? {
            bg: '#1a1a1a',
            surface: '#2d2d2d',
            surfaceHover: '#3d3d3d',
            text: '#ffffff',
            textMuted: '#888888',
            primary: '#4CAF50',
            primaryHover: '#45a049',
            accent: '#2196F3',
            border: '#404040'
        } : {
            bg: '#f5f5f5',
            surface: '#ffffff',
            surfaceHover: '#f0f0f0',
            text: '#333333',
            textMuted: '#666666',
            primary: '#4CAF50',
            primaryHover: '#45a049',
            accent: '#2196F3',
            border: '#e0e0e0'
        };

        return `
            body {
                margin: 0;
                padding: 20px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                background: ${colors.bg};
                color: ${colors.text};
            }
            
            .container {
                max-width: 1200px;
                margin: 0 auto;
            }
            
            header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 30px;
                padding-bottom: 20px;
                border-bottom: 1px solid ${colors.border};
            }
            
            h1 {
                margin: 0;
                font-size: 24px;
                color: ${colors.text};
            }
            
            .framework-badge {
                padding: 8px 16px;
                background: ${colors.accent};
                color: white;
                border-radius: 20px;
                font-size: 14px;
                text-transform: uppercase;
            }
            
            .session {
                background: ${colors.surface};
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 30px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            
            .metadata {
                color: ${colors.textMuted};
                font-size: 14px;
                margin-bottom: 20px;
            }
            
            .navigation-item {
                display: flex;
                align-items: center;
                padding: 15px;
                border-bottom: 1px solid ${colors.border};
                transition: background-color 0.2s;
            }
            
            .navigation-item:hover {
                background: ${colors.surfaceHover};
            }
            
            .nav-type {
                padding: 4px 8px;
                background: ${colors.primary};
                color: white;
                border-radius: 4px;
                font-size: 12px;
                margin-right: 15px;
                min-width: 80px;
                text-align: center;
            }
            
            .nav-urls {
                flex: 1;
                display: flex;
                align-items: center;
                font-family: monospace;
                font-size: 14px;
                overflow: hidden;
            }
            
            .url {
                padding: 4px 8px;
                background: ${colors.surfaceHover};
                border-radius: 4px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            
            .arrow {
                margin: 0 10px;
                color: ${colors.textMuted};
            }
            
            .nav-time {
                margin-left: 15px;
                color: ${colors.textMuted};
                font-size: 12px;
                white-space: nowrap;
            }
            
            footer {
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid ${colors.border};
                text-align: center;
                color: ${colors.textMuted};
                font-size: 14px;
            }
            
            .no-data {
                padding: 20px;
                text-align: center;
                color: ${colors.textMuted};
                font-style: italic;
            }
        `;
    }

    /**
     * Generate sessions HTML
     */
    generateSessions(sessions) {
        if (!Array.isArray(sessions) || sessions.length === 0) {
            return '<p class="no-data">No tracking data available</p>';
        }

        return sessions.map(session => `
            <div class="session">
                <h2>Test Session: ${session.test_name || 'Unknown Test'}</h2>
                <div class="metadata">
                    <p>Spec File: ${session.spec_file || 'Unknown'}</p>
                    <p>Session ID: ${session.session_id || 'Unknown'}</p>
                </div>
                ${this.generateNavigations(session.navigations || [])}
            </div>
        `).join('\n');
    }

    /**
     * Generate navigations HTML
     */
    generateNavigations(navigations) {
        if (!Array.isArray(navigations) || navigations.length === 0) {
            return '<p class="no-data">No navigation data available</p>';
        }

        return `
        <div class="navigations">
            <h3>Navigation History</h3>
            <div class="navigation-list">
                ${navigations.map(nav => `
                    <div class="navigation-item">
                        <div class="nav-type">${this.formatNavigationType(nav.navigation_type)}</div>
                        <div class="nav-urls">
                            <div class="url from">${nav.previous_url || 'null'}</div>
                            <div class="arrow">→</div>
                            <div class="url to">${nav.current_url || 'null'}</div>
                        </div>
                        <div class="nav-time">${new Date(nav.timestamp).toLocaleString()}</div>
                    </div>
                `).join('\n')}
            </div>
        </div>`;
    }

    /**
     * Format navigation type for display
     */
    formatNavigationType(type) {
        const typeMap = {
            'user_interaction': 'User Interaction',
            'test_start': 'Test Start',
            'back_navigation': 'Back Navigation',
            'navigation': 'Navigation',
            'goto': 'Page Load',
            'page_load': 'Page Load',
            'hash_change': 'Hash Change',
            'spa_route': 'SPA Route',
            'link_click': 'Link Click',
            'form_submit': 'Form Submit',
            'manual_record': 'Manual'
        };
        
        return typeMap[type] || type || 'Unknown';
    }

    /**
     * Generate JavaScript for interactivity
     */
    getJavaScript() {
        return `
            document.addEventListener('DOMContentLoaded', () => {
                // Add click handlers for navigation items
                document.querySelectorAll('.navigation-item').forEach(item => {
                    item.addEventListener('click', () => {
                        item.classList.toggle('expanded');
                    });
                });
            });
        `;
    }

    /**
     * Setup keyboard shortcut listener
     */
    setupKeyboardShortcut() {
        if (this.isListening) {
            // Remove existing listener if any
            if (this.keyPressHandler) {
                process.stdin.removeListener('data', this.keyPressHandler);
            }
            this.isListening = false;
        }
        
        // Only setup if we're in a terminal environment
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.setEncoding('utf8');
            
            // Create the handler
            this.keyPressHandler = (key) => {
                // ctrl-c ( end of text )
                if (key === '\u0003') {
                    process.exit();
                }
                // 'o' key to open report
                if (key.toLowerCase() === 'o') {
                    this.openReport();
                }
            };
            
            // Add the listener
            process.stdin.on('data', this.keyPressHandler);
            this.isListening = true;
            
            // Cleanup on exit
            process.on('exit', () => {
                if (process.stdin.setRawMode) {
                    process.stdin.setRawMode(false);
                }
                process.stdin.pause();
                if (this.keyPressHandler) {
                    process.stdin.removeListener('data', this.keyPressHandler);
                }
            });
        }
    }

    /**
     * Open report in default browser
     */
    async openReport() {
        if (!this.reportPath) {
            console.error('No report file available to open');
            return;
        }
        
        try {
            const open = require('open');
            await open(this.reportPath);
            console.log(`Opened report: ${this.reportPath}`);
        } catch (error) {
            console.error(`Failed to open report: ${error.message}`);
        }
    }

    /**
     * Generate report from tracking results files
     */
    static generateFromFiles(options = {}) {
        const reporter = new HtmlReporter(options);
        
        // Use enhanced reporter if available
        if (options.enhanced !== false) {
            return EnhancedHtmlReporter.generateFromFiles(options);
        }
        
        // Legacy implementation
        const trackingFiles = reporter.findTrackingFiles();
        
        if (trackingFiles.length === 0) {
            console.log('⚠️  No tracking files found');
            return null;
        }
        
        // Combine data from all tracking files
        let combinedData = [];
        let detectedFramework = 'unknown';
        
        trackingFiles.forEach((filePath) => {
            try {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const data = JSON.parse(fileContent);
                
                // Detect framework from file structure
                if (filePath.includes('navigation-tracking')) {
                    detectedFramework = 'appium';
                } else if (filePath.includes('url-tracking')) {
                    detectedFramework = data.some((session) => session.metadata) ? 'playwright' : 'webdriverio';
                }
                
                if (Array.isArray(data)) {
                    combinedData = combinedData.concat(data);
                } else {
                    combinedData.push(data);
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error(`Error reading ${filePath}: ${errorMsg}`);
            }
        });
        
        if (combinedData.length === 0) {
            console.log('⚠️  No valid tracking data found');
            return null;
        }
        
        return reporter.generateReport(combinedData, detectedFramework);
    }

    /**
     * Find tracking files in common locations
     */
    findTrackingFiles() {
        const possibleFiles = [
            'test-results/navigation-tracking.json',
            'test-results/url-tracking.json',
            'test-results/url-tracking-results.json',
            'tests-results/navigation-tracking.json',
            'tests-results/url-tracking.json',
            'tests-results/url-tracking-results.json'
        ];
        
        return possibleFiles.filter((filePath) => {
            return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
        });
    }
}

// Export both the main HtmlReporter and the EnhancedHtmlReporter
module.exports = { HtmlReporter, EnhancedHtmlReporter }; 