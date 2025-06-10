const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

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

class HtmlReporter {
    /**
     * @param {HtmlReporterOptions} options
     */
    constructor(options = {}) {
        this.options = {
            outputDir: options.outputDir || 'test-results',
            reportName: options.reportName || 'tracking-report.html',
            title: options.title || 'LambdaTest Tracking Report',
            enableKeyboardShortcut: options.enableKeyboardShortcut !== false,
            autoOpen: options.autoOpen || false,
            theme: options.theme || 'dark',
            ...options
        };
        
        this.reportPath = path.join(this.options.outputDir, this.options.reportName);
        this.isListening = false;
    }

    /**
     * Generate HTML report from tracking results
     * @param {any} trackingData
     * @param {string} framework
     * @returns {string}
     */
    generateReport(trackingData, framework = 'unknown') {
        try {
            console.log(`🎯 Generating ${framework} tracking report...`);
            
            // Ensure output directory exists
            if (!fs.existsSync(this.options.outputDir)) {
                fs.mkdirSync(this.options.outputDir, { recursive: true });
            }

            // Parse and normalize tracking data
            const reportData = this.parseTrackingData(trackingData, framework);
            
            // Generate HTML content
            const htmlContent = this.generateHtmlContent(reportData, framework);
            
            // Write HTML file
            fs.writeFileSync(this.reportPath, htmlContent, 'utf8');
            
            console.log(`✅ Report generated: ${this.reportPath}`);
            
            // Setup keyboard shortcut listener if enabled
            if (this.options.enableKeyboardShortcut) {
                this.setupKeyboardShortcut();
            }
            
            // Auto-open if enabled
            if (this.options.autoOpen) {
                this.openReport();
            }
            
            return this.reportPath;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`❌ Error generating HTML report: ${errorMsg}`);
            throw error;
        }
    }

    /**
     * Parse and normalize tracking data from different frameworks
     * @param {any} data
     * @param {string} framework
     * @returns {ReportData}
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
     * @param {any} session
     * @param {string} framework
     * @returns {SessionData}
     */
    normalizeSession(session, framework) {
        const navigations = session.navigations || [];
        
        return {
            session_id: session.session_id || session.metadata?.session_id || `session_${Date.now()}`,
            spec_file: session.spec_file || session.metadata?.spec_file || 'unknown',
            test_name: session.test_name || session.metadata?.name || 'unknown',
            timestamp: session.timestamp || session.save_timestamp || new Date().toISOString(),
            navigation_count: navigations.length,
            navigations: navigations.map((nav) => this.normalizeNavigation(nav, framework)),
            framework
        };
    }

    /**
     * Normalize navigation data format
     * @param {any} navigation
     * @param {string} framework
     * @returns {NavigationItem}
     */
    normalizeNavigation(navigation, framework) {
        // Handle different navigation formats
        if (framework === 'appium') {
            return {
                from: navigation.previous_screen || '',
                to: navigation.current_screen || '',
                timestamp: navigation.timestamp,
                type: navigation.navigation_type || 'navigation',
                test_name: navigation.test_name,
                spec_file: navigation.spec_file
            };
        } else {
            // Playwright/WebDriverIO URL tracking format
            return {
                from: navigation.previous_url || '',
                to: navigation.current_url || '',
                timestamp: navigation.timestamp,
                type: navigation.navigation_type || 'navigation',
                test_name: navigation.test_name,
                spec_file: navigation.spec_file
            };
        }
    }

    /**
     * Generate HTML content for the report
     * @param {ReportData} reportData
     * @param {string} framework
     * @returns {string}
     */
    generateHtmlContent(reportData, framework) {
        const isDark = this.options.theme === 'dark';
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.options.title}</title>
    <style>
        ${this.getStyles(isDark)}
    </style>
</head>
<body class="${isDark ? 'dark' : 'light'}">
    <div class="container">
        ${this.generateHeader(reportData)}
        ${this.generateSummary(reportData)}
        ${this.generateSessions(reportData)}
        ${this.generateFooter()}
    </div>
    
    <script>
        ${this.getJavaScript()}
    </script>
</body>
</html>`;
    }

    /**
     * Generate CSS styles with GitHub Primer UI design system
     * @param {boolean} isDark
     * @returns {string}
     */
    getStyles(isDark) {
        const colors = isDark ? {
            bg: '#0d1117',
            surface: '#161b22',
            surfaceHover: '#21262d',
            text: '#f0f6fc',
            textMuted: '#8b949e',
            primary: '#238636',
            primaryHover: '#2ea043',
            accent: '#1f6feb',
            border: '#30363d',
            success: '#238636',
            warning: '#d29922',
            error: '#da3633'
        } : {
            bg: '#ffffff',
            surface: '#f6f8fa',
            surfaceHover: '#eaeef2',
            text: '#24292f',
            textMuted: '#656d76',
            primary: '#1f883d',
            primaryHover: '#1a7f37',
            accent: '#0969da',
            border: '#d0d7de',
            success: '#1a7f37',
            warning: '#9a6700',
            error: '#cf222e'
        };

        return `
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
                font-size: 14px;
                line-height: 1.5;
                background: ${colors.bg};
                color: ${colors.text};
                min-height: 100vh;
            }
            
            .container {
                max-width: 1280px;
                margin: 0 auto;
                padding: 32px;
            }
            
            .header {
                margin-bottom: 32px;
                padding: 24px 0;
                border-bottom: 1px solid ${colors.border};
            }
            
            .header-content {
                display: flex;
                align-items: center;
                gap: 16px;
            }
            
            .logo {
                font-size: 32px;
                width: 48px;
                height: 48px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: ${colors.surface};
                border: 1px solid ${colors.border};
                border-radius: 12px;
            }
            
            .header-text {
                flex: 1;
            }
            
            .title {
                font-size: 24px;
                font-weight: 600;
                color: ${colors.text};
                margin: 0 0 4px 0;
                line-height: 1.25;
            }
            
            .subtitle {
                color: ${colors.textMuted};
                font-size: 14px;
                margin: 0;
            }
            
            .github-badge {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 6px 12px;
                background: ${colors.surface};
                border: 1px solid ${colors.border};
                border-radius: 6px;
                font-size: 12px;
                font-weight: 500;
                color: ${colors.textMuted};
                text-decoration: none;
                transition: background-color 0.2s;
            }
            
            .github-badge:hover {
                background: ${colors.surfaceHover};
                color: ${colors.text};
            }
            
            .summary {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                gap: 16px;
                margin-bottom: 32px;
            }
            
            .summary-card {
                background: ${colors.surface};
                border: 1px solid ${colors.border};
                border-radius: 6px;
                padding: 16px;
                position: relative;
                transition: border-color 0.2s ease;
            }
            
            .summary-card:hover {
                border-color: ${colors.textMuted};
            }
            
            .summary-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 8px;
            }
            
            .summary-icon {
                width: 16px;
                height: 16px;
                color: ${colors.textMuted};
            }
            
            .summary-number {
                font-size: 32px;
                font-weight: 600;
                color: ${colors.text};
                line-height: 1;
                margin-bottom: 4px;
            }
            
            .summary-label {
                color: ${colors.textMuted};
                font-size: 14px;
                font-weight: 500;
                margin: 0;
            }
            
            .summary-change {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 12px;
                font-weight: 500;
                color: ${colors.success};
            }
            
            .sessions {
                margin-bottom: 32px;
            }
            
            .section-title {
                font-size: 20px;
                font-weight: 600;
                margin-bottom: 16px;
                color: ${colors.text};
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .section-subtitle {
                color: ${colors.textMuted};
                font-size: 14px;
                margin-bottom: 16px;
            }
            
            .session-card {
                background: ${colors.surface};
                border: 1px solid ${colors.border};
                border-radius: 6px;
                margin-bottom: 16px;
                overflow: hidden;
            }
            
            .session-header {
                padding: 16px;
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: ${colors.surface};
                transition: background-color 0.2s ease;
                border-bottom: 1px solid ${colors.border};
            }
            
            .session-header:hover {
                background: ${colors.surfaceHover};
            }
            
            .session-header.expanded {
                border-bottom: 1px solid ${colors.border};
            }
            
            .session-info {
                flex: 1;
                min-width: 0;
            }
            
            .session-title {
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 4px;
                color: ${colors.text};
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .session-title-icon {
                width: 16px;
                height: 16px;
                color: ${colors.textMuted};
            }
            
            .session-meta {
                display: flex;
                align-items: center;
                gap: 16px;
                flex-wrap: wrap;
                margin-top: 4px;
            }
            
            .session-meta-item {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                color: ${colors.textMuted};
                font-size: 12px;
            }
            
            .toggle-icon {
                width: 16px;
                height: 16px;
                color: ${colors.textMuted};
                transition: transform 0.2s ease;
                transform: rotate(0deg);
            }
            
            .toggle-icon.expanded {
                transform: rotate(90deg);
            }
            
            .session-content {
                overflow: hidden;
                border-top: 1px solid ${colors.border};
                background: ${colors.bg};
            }
            
            .session-content.expanded {
                display: block;
            }
            
            .session-content:not(.expanded) {
                display: none;
            }
            
            .navigation-list {
                padding: 16px;
            }
            
            .navigation-item {
                display: flex;
                align-items: flex-start;
                padding: 12px;
                margin-bottom: 1px;
                background: ${colors.surface};
                border-left: 3px solid transparent;
                transition: all 0.2s ease;
                position: relative;
            }
            
            .navigation-item:hover {
                background: ${colors.surfaceHover};
                border-left-color: ${colors.accent};
            }
            
            .navigation-item:first-child {
                border-top-left-radius: 6px;
                border-top-right-radius: 6px;
            }
            
            .navigation-item:last-child {
                border-bottom-left-radius: 6px;
                border-bottom-right-radius: 6px;
            }
            
            .nav-icon {
                width: 16px;
                height: 16px;
                margin-right: 12px;
                margin-top: 2px;
                color: ${colors.textMuted};
                flex-shrink: 0;
            }
            
            .nav-content {
                flex: 1;
                min-width: 0;
            }
            
            .nav-path {
                font-size: 14px;
                font-weight: 500;
                margin-bottom: 4px;
                color: ${colors.text};
                line-height: 1.25;
                word-break: break-word;
            }
            
            .nav-path-segment {
                font-family: ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
                background: ${isDark ? '#30363d' : '#f6f8fa'};
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 12px;
                margin: 0 4px;
            }
            
            .nav-meta {
                display: flex;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
            }
            
            .nav-meta-item {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 12px;
                color: ${colors.textMuted};
            }
            
            .badge {
                display: inline-flex;
                align-items: center;
                padding: 2px 7px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 500;
                line-height: 1;
                white-space: nowrap;
            }
            
            .badge-primary {
                background: ${colors.accent};
                color: #ffffff;
            }
            
            .badge-success {
                background: ${colors.success};
                color: #ffffff;
            }
            
            .badge-warning {
                background: ${colors.warning};
                color: #ffffff;
            }
            
            .badge-secondary {
                background: ${colors.surface};
                color: ${colors.textMuted};
                border: 1px solid ${colors.border};
            }
            
            .badge-outline {
                background: transparent;
                border: 1px solid ${colors.border};
                color: ${colors.textMuted};
            }
            
            .footer {
                margin-top: 48px;
                padding: 24px 0;
                border-top: 1px solid ${colors.border};
                text-align: center;
            }
            
            .footer-content {
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 16px;
                flex-wrap: wrap;
            }
            
            .footer-text {
                color: ${colors.textMuted};
                font-size: 12px;
                margin: 0;
            }
            
            .footer-link {
                color: ${colors.accent};
                text-decoration: none;
                font-size: 12px;
                font-weight: 500;
            }
            
            .footer-link:hover {
                text-decoration: underline;
            }
            
            .keyboard-shortcut {
                position: fixed;
                bottom: 24px;
                right: 24px;
                background: ${colors.surface};
                border: 1px solid ${colors.border};
                color: ${colors.text};
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 500;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
                z-index: 1000;
                opacity: 0.9;
                transition: opacity 0.2s ease;
            }
            
            .keyboard-shortcut:hover {
                opacity: 1;
            }
            
            .shortcut-key {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 20px;
                height: 20px;
                padding: 0 4px;
                background: ${colors.bg};
                border: 1px solid ${colors.border};
                border-radius: 3px;
                font-size: 10px;
                font-weight: 600;
                margin: 0 2px;
            }
            
            .empty-state {
                text-align: center;
                padding: 60px 20px;
                color: ${colors.textMuted};
            }
            
            .empty-icon {
                font-size: 4rem;
                margin-bottom: 20px;
                opacity: 0.5;
            }
            
            @media (max-width: 768px) {
                .container {
                    padding: 10px;
                }
                
                .session-meta {
                    flex-direction: column;
                    gap: 8px;
                }
                
                .keyboard-shortcut {
                    bottom: 10px;
                    right: 10px;
                    padding: 8px 15px;
                    font-size: 0.8rem;
                }
            }
        `;
    }

    /**
     * Generate header HTML with GitHub Primer UI design
     * @param {ReportData} reportData
     * @returns {string}
     */
    generateHeader(reportData) {
        return `
            <div class="header">
                <div class="header-content">
                    <div class="logo">🔍</div>
                    <div class="header-text">
                        <h1 class="title">${this.options.title}</h1>
                        <p class="subtitle">Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
                    </div>
                    <a href="https://github.com/LambdaTest" class="github-badge" target="_blank">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                        </svg>
                        LambdaTest
                    </a>
                </div>
            </div>
        `;
    }

    /**
     * Generate summary HTML with GitHub-style metrics cards
     * @param {ReportData} reportData
     * @returns {string}
     */
    generateSummary(reportData) {
        return `
            <div class="summary">
                <div class="summary-card">
                    <div class="summary-header">
                        <svg class="summary-icon" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.75.75 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/>
                        </svg>
                    </div>
                    <div class="summary-number">${reportData.summary.totalSessions}</div>
                    <div class="summary-label">Test Sessions</div>
                </div>
                <div class="summary-card">
                    <div class="summary-header">
                        <svg class="summary-icon" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M1.75 2.5h12.5a.25.25 0 0 1 .25.25v8.5a.25.25 0 0 1-.25.25H1.75a.25.25 0 0 1-.25-.25v-8.5a.25.25 0 0 1 .25-.25Z"/>
                        </svg>
                    </div>
                    <div class="summary-number">${reportData.summary.totalNavigations}</div>
                    <div class="summary-label">Total Navigations</div>
                    <div class="summary-change">↗ All tracked</div>
                </div>
                <div class="summary-card">
                    <div class="summary-header">
                        <svg class="summary-icon" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z"/>
                        </svg>
                    </div>
                    <div class="summary-number">${reportData.summary.testFiles.length}</div>
                    <div class="summary-label">Test Files</div>
                </div>
                <div class="summary-card">
                    <div class="summary-header">
                        <svg class="summary-icon" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                        </svg>
                    </div>
                    <div class="summary-number">${reportData.framework}</div>
                    <div class="summary-label">Framework</div>
                </div>
            </div>
        `;
    }

    /**
     * Generate sessions HTML
     * @param {ReportData} reportData
     * @returns {string}
     */
    generateSessions(reportData) {
        if (!reportData.sessions || reportData.sessions.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">📊</div>
                    <h3>No tracking data found</h3>
                    <p>Run your tests to see navigation tracking results here.</p>
                </div>
            `;
        }

        const sessionsHtml = reportData.sessions.map((session, index) => `
            <div class="session-card">
                <div class="session-header" onclick="toggleSession(${index})">
                    <div class="session-info">
                        <div class="session-title">
                            <svg class="session-title-icon" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.75.75 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/>
                            </svg>
                            ${session.test_name}
                        </div>
                        <div class="session-meta">
                            <div class="session-meta-item">
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Z"/>
                                </svg>
                                ${session.spec_file}
                            </div>
                            <div class="session-meta-item">
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M4.75 2a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h6.5a.75.75 0 0 0 .75-.75v-8.5a.75.75 0 0 0-.75-.75Z"/>
                                </svg>
                                ${session.navigation_count} navigations
                            </div>
                            <div class="session-meta-item">
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.75.75 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/>
                                </svg>
                                ${new Date(session.timestamp).toLocaleString()}
                            </div>
                            <span class="badge badge-secondary">${session.framework}</span>
                        </div>
                    </div>
                    <svg class="toggle-icon" id="toggle-${index}" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/>
                    </svg>
                </div>
                <div class="session-content" id="session-${index}">
                    <div class="navigation-list">
                        ${this.generateNavigations(session.navigations, reportData.framework)}
                    </div>
                </div>
            </div>
        `).join('');

        return `
            <div class="sessions">
                <h2 class="section-title">📊 Test Sessions</h2>
                ${sessionsHtml}
            </div>
        `;
    }

    /**
     * Generate navigations HTML
     * @param {NavigationItem[]} navigations
     * @param {string} framework
     * @returns {string}
     */
    generateNavigations(navigations, framework) {
        if (!navigations || navigations.length === 0) {
            return '<div class="empty-state"><p>No navigations recorded</p></div>';
        }

        return navigations.map((nav, index) => {
            const isAppium = framework === 'appium';
            const fromPath = nav.from || 'null';
            const toPath = nav.to || 'null';
            
            const typeColor = nav.type === 'user_interaction' ? 'badge-success' : 
                             nav.type === 'test_start' ? 'badge-primary' : 
                             nav.type === 'back_navigation' ? 'badge-warning' : 'badge-secondary';
            
            return `
                <div class="navigation-item">
                    <svg class="nav-icon" viewBox="0 0 16 16" fill="currentColor">
                        ${isAppium ? 
                            '<path d="M1.75 2.5h12.5a.25.25 0 0 1 .25.25v8.5a.25.25 0 0 1-.25.25H1.75a.25.25 0 0 1-.25-.25v-8.5a.25.25 0 0 1 .25-.25Zm0-1.5A1.75 1.75 0 0 0 0 2.75v8.5C0 12.216.784 13 1.75 13h12.5a1.75 1.75 0 0 0 1.75-1.75v-8.5A1.75 1.75 0 0 0 14.25 1H1.75Z"/>' :
                            '<path d="M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z"/>'
                        }
                    </svg>
                    <div class="nav-content">
                        <div class="nav-path">
                            <span class="nav-path-segment">${fromPath}</span>
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="vertical-align: middle; margin: 0 4px;">
                                <path d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h8.44L9.28 4.03a.75.75 0 0 1 0-1.06Z"/>
                            </svg>
                            <span class="nav-path-segment">${toPath}</span>
                        </div>
                        <div class="nav-meta">
                            <div class="nav-meta-item">
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.75.75 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/>
                                </svg>
                                ${new Date(nav.timestamp).toLocaleTimeString()}
                            </div>
                            <span class="badge ${typeColor}">${nav.type.replace('_', ' ')}</span>
                            ${nav.test_name ? `<div class="nav-meta-item">Test: ${nav.test_name}</div>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Generate footer HTML with GitHub-style layout
     * @returns {string}
     */
    generateFooter() {
        return `
            <div class="footer">
                <div class="footer-content">
                    <p class="footer-text">
                        Generated by 
                        <a href="https://www.lambdatest.com" class="footer-link" target="_blank">LambdaTest</a> 
                        Navigation Tracker
                    </p>
                    <a href="https://github.com/LambdaTest" class="footer-link" target="_blank">View on GitHub</a>
                    <a href="https://www.lambdatest.com/support/docs/" class="footer-link" target="_blank">Documentation</a>
                </div>
                ${this.options.enableKeyboardShortcut ? `
                    <div class="keyboard-shortcut">
                        Press <span class="shortcut-key">Ctrl</span> + <span class="shortcut-key">Shift</span> + <span class="shortcut-key">R</span> to refresh
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Generate JavaScript for interactivity
     * @returns {string}
     */
    getJavaScript() {
        return `
            function toggleSession(index) {
                const content = document.getElementById('session-' + index);
                const icon = document.getElementById('toggle-' + index);
                const header = content.previousElementSibling;
                
                if (content.classList.contains('expanded')) {
                    content.classList.remove('expanded');
                    icon.classList.remove('expanded');
                    header.classList.remove('expanded');
                } else {
                    content.classList.add('expanded');
                    icon.classList.add('expanded');
                    header.classList.add('expanded');
                }
            }
            
            // Keyboard shortcuts
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.shiftKey && e.key === 'R') {
                    e.preventDefault();
                    location.reload();
                }
                
                if (e.ctrlKey && e.shiftKey && e.key === 'O') {
                    e.preventDefault();
                    // This would need to be implemented by the framework
                    console.log('Open report keyboard shortcut pressed');
                }
            });
            
            // Auto-refresh functionality
            let autoRefreshInterval;
            function startAutoRefresh(intervalMs = 5000) {
                autoRefreshInterval = setInterval(() => {
                    location.reload();
                }, intervalMs);
            }
            
            function stopAutoRefresh() {
                if (autoRefreshInterval) {
                    clearInterval(autoRefreshInterval);
                }
            }
            
            // Initialize with collapsed sessions (expand first one by default)
            document.addEventListener('DOMContentLoaded', function() {
                const firstSession = document.getElementById('session-0');
                if (firstSession) {
                    toggleSession(0);
                }
            });
        `;
    }

    /**
     * Setup keyboard shortcut listener for opening report
     */
    setupKeyboardShortcut() {
        if (this.isListening) return;
        
        try {
            // Setup process-level keyboard listener
            if (process.stdin.setRawMode) {
                process.stdin.setRawMode(true);
                process.stdin.resume();
                process.stdin.setEncoding('utf8');
                
                process.stdin.on('data', (key) => {
                    // Ctrl+Shift+O to open report
                    if (key === '\x0F') { // Ctrl+O
                        this.openReport();
                    }
                    
                    // Ctrl+C to exit
                    if (key === '\x03') {
                        process.exit();
                    }
                });
                
                this.isListening = true;
                console.log('🎹 Keyboard shortcuts enabled:');
                console.log('   • Ctrl+Shift+O: Open report in browser');
                console.log('   • Ctrl+C: Exit');
            }
        } catch (error) {
            console.log('⚠️  Keyboard shortcuts not available in this environment');
        }
    }

    /**
     * Open report in default browser
     */
    openReport() {
        try {
            const reportFullPath = path.resolve(this.reportPath);
            console.log(`🌐 Opening report: ${reportFullPath}`);
            
            // Cross-platform browser opening
            const command = process.platform === 'win32' ? 'start' :
                           process.platform === 'darwin' ? 'open' : 'xdg-open';
                           
            exec(`${command} "${reportFullPath}"`, (error) => {
                if (error) {
                    console.error(`Error opening report: ${error.message}`);
                } else {
                    console.log('✅ Report opened in browser');
                }
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`Error opening report: ${errorMsg}`);
        }
    }

    /**
     * Generate report from tracking results files
     * @param {HtmlReporterOptions} options
     * @returns {string|null}
     */
    static generateFromFiles(options = {}) {
        const reporter = new HtmlReporter(options);
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
     * @returns {string[]}
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

module.exports = { HtmlReporter }; 