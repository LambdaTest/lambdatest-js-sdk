const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

/**
 * Enhanced HTML Reporter for URL Tracking with Playwright-style UI and GitHub Primer design
 * Supports Appium, Playwright, and WebDriverIO frameworks
 */
class EnhancedHtmlReporter {
    constructor(options = {}) {
        this.options = {
            outputDir: options.outputDir || 'test-results',
            reportName: options.reportName || 'url-tracking-report.html',
            title: options.title || 'LambdaTest URL Tracking Report',
            enableKeyboardShortcut: options.enableKeyboardShortcut !== false,
            autoOpen: options.autoOpen || false,
            theme: options.theme || 'dark', // Default to dark theme
            showTimeline: options.showTimeline !== false,
            showMetrics: options.showMetrics !== false,
            enableSearch: options.enableSearch !== false,
            enableFilters: options.enableFilters !== false
        };
        
        this.reportPath = null;
        this.isListening = false;
        this.keyPressHandler = null;
    }

    /**
     * Generate enhanced HTML report from tracking results
     */
    generateReport(trackingData, framework = 'unknown') {
        try {
            console.log(`🎯 Generating enhanced ${framework} tracking report...`);
            
            // Ensure output directory exists
            const outputDir = path.resolve(process.cwd(), this.options.outputDir);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // Parse and normalize tracking data
            const reportData = this.parseTrackingData(trackingData, framework);
            
            // Generate HTML content with Playwright-style UI
            const htmlContent = this.generatePlaywrightStyleHtml(reportData, framework);
            
            // Write HTML file
            const outputPath = path.join(outputDir, this.options.reportName);
            fs.writeFileSync(outputPath, htmlContent, 'utf8');
            
            console.log(`✅ Enhanced report generated: ${outputPath}`);
            
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
            console.error(`❌ Error generating enhanced HTML report: ${errorMsg}`);
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
                totalDuration: 0,
                frameworks: [],
                testFiles: [],
                timestamp: new Date().toISOString(),
                uniqueUrls: new Set(),
                navigationTypes: new Map()
            }
        };

        try {
            if (Array.isArray(data)) {
                // Multiple sessions format
                data.forEach((session) => {
                    if (session.navigations || (session.metadata && session.navigations)) {
                        const normalizedSession = this.normalizeSession(session, framework);
                        normalized.sessions.push(normalizedSession);
                        this.updateSummaryMetrics(normalized.summary, normalizedSession);
                    }
                });
            } else if (data.navigations && Array.isArray(data.navigations)) {
                // Single session format
                const session = this.normalizeSession(data, framework);
                normalized.sessions.push(session);
                this.updateSummaryMetrics(normalized.summary, session);
            }

            // Finalize summary
            normalized.summary.totalSessions = normalized.sessions.length;
            normalized.summary.testFiles = [...new Set(normalized.sessions.map(s => s.spec_file).filter(Boolean))];
            normalized.summary.frameworks = [framework];
            normalized.summary.uniqueUrls = Array.from(normalized.summary.uniqueUrls);
            normalized.summary.navigationTypes = Object.fromEntries(normalized.summary.navigationTypes);
            
        } catch (error) {
            console.error(`Error parsing tracking data: ${error.message}`);
        }

        return normalized;
    }

    /**
     * Update summary metrics from session data
     */
    updateSummaryMetrics(summary, session) {
        if (session.navigations) {
            summary.totalNavigations += session.navigations.length;
            
            // Track unique URLs and navigation types
            session.navigations.forEach(nav => {
                if (nav.current_url && nav.current_url !== 'null') {
                    summary.uniqueUrls.add(nav.current_url);
                }
                if (nav.previous_url && nav.previous_url !== 'null') {
                    summary.uniqueUrls.add(nav.previous_url);
                }
                
                const navType = nav.navigation_type || nav.type || 'unknown';
                summary.navigationTypes.set(navType, (summary.navigationTypes.get(navType) || 0) + 1);
            });
            
            // Calculate duration if possible
            if (session.navigations.length > 1) {
                const first = new Date(session.navigations[0].timestamp);
                const last = new Date(session.navigations[session.navigations.length - 1].timestamp);
                session.duration = last - first;
                summary.totalDuration += session.duration;
            }
        }
    }

    /**
     * Normalize session data - Enhanced to handle nested metadata structure
     */
    normalizeSession(session, framework) {
        // Extract data from nested metadata structure
        const metadataData = session.metadata?.data || {};
        
        const normalized = {
            session_id: session.session_id || metadataData.session_id || metadataData.test_id || `session_${Date.now()}`,
            spec_file: session.spec_file || metadataData.spec_file || 'unknown.spec.js',
            test_name: session.test_name || metadataData.name || session.metadata?.name || 'Unknown Test',
            timestamp: session.timestamp || metadataData.create_timestamp || new Date().toISOString(),
            framework: framework,
            navigations: [],
            metadata: session.metadata || {},
            metadataData: metadataData, // Store the nested data for display
            duration: 0,
            status: metadataData.status_ind || metadataData.test_execution_status || 'completed',
            // Extract additional metadata for display
            build_id: metadataData.build_id,
            build_name: metadataData.build_name,
            username: metadataData.username,
            test_type: metadataData.test_type,
            platform: metadataData.platform,
            browser: metadataData.browser,
            browser_version: metadataData.browser_version,
            resolution: metadataData.resolution,
            geoInfo: metadataData.geoInfo,
            // URLs for various resources
            console_logs_url: metadataData.console_logs_url,
            network_logs_url: metadataData.network_logs_url,
            command_logs_url: metadataData.command_logs_url,
            video_url: metadataData.video_url,
            screenshot_url: metadataData.screenshot_url,
            public_url: metadataData.public_url,
            start_timestamp: metadataData.start_timestamp,
            remark: metadataData.remark
        };

        // Normalize navigations
        if (session.navigations && Array.isArray(session.navigations)) {
            normalized.navigations = session.navigations.map(nav => this.normalizeNavigation(nav, framework));
        }

        return normalized;
    }

    /**
     * Normalize navigation data
     */
    normalizeNavigation(navigation, framework) {
        return {
            previous_url: navigation.previous_url || navigation.from || navigation.previous_screen || 'null',
            current_url: navigation.current_url || navigation.to || navigation.current_screen || 'null',
            timestamp: navigation.timestamp || new Date().toISOString(),
            navigation_type: navigation.navigation_type || navigation.type || 'navigation',
            test_name: navigation.test_name || 'Unknown Test',
            spec_file: navigation.spec_file || 'unknown.spec.js',
            duration: navigation.duration || 0,
            error: navigation.error || null
        };
    }

    /**
     * Generate Playwright-style HTML with GitHub Primer UI
     */
    generatePlaywrightStyleHtml(reportData, framework) {
        const isDark = this.options.theme === 'dark';
        
return `<!DOCTYPE html>
<html lang="en" data-color-mode="${isDark ? 'dark' : 'light'}" data-light-theme="light" data-dark-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.options.title}</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTE2IDJMMjggMTZMMTYgMzBMNDU5MyAzMVoiIGZpbGw9IiM0Q0FGNTAIOS0=">
    ${this.getGitHubPrimerStyles()}
    ${this.getCustomStyles()}
</head>
<body>
    <div class="application-main">
        <!-- Header -->
        <header class="Header">
            <div class="Header-item">
                <div class="Header-link">
                    <svg class="octicon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L22 12L12 22L2 12L12 2Z"/>
                    </svg>
                    <span class="Header-title">${this.options.title}</span>
                </div>
            </div>
            <div class="Header-item Header-item--full">
                ${this.options.enableSearch ? this.generateSearchBox() : ''}
            </div>
            <div class="Header-item">
                <div class="Header-stats">
                    <span class="Counter Counter--primary">${reportData.summary.totalSessions}</span>
                    <span class="text-small text-muted ml-1">sessions</span>
                </div>
            </div>
            <div class="Header-item">
                <button class="btn btn-sm" id="theme-toggle" type="button">
                    <svg class="octicon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 12a4 4 0 100-8 4 4 0 000 8zM8 0a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0V.75A.75.75 0 018 0zm0 13a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 018 13zM2.343 2.343a.75.75 0 011.061 0l1.06 1.061a.75.75 0 01-1.06 1.06l-1.061-1.06a.75.75 0 010-1.061zm9.193 9.193a.75.75 0 011.06 0l1.061 1.06a.75.75 0 01-1.06 1.061l-1.061-1.06a.75.75 0 010-1.061zM16 8a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0116 8zM3 8a.75.75 0 01-.75.75H.75a.75.75 0 010-1.5h1.5A.75.75 0 013 8zm10.657-5.657a.75.75 0 010 1.061l-1.061 1.06a.75.75 0 11-1.06-1.06l1.06-1.061a.75.75 0 011.061 0zm-9.193 9.193a.75.75 0 010 1.06l-1.06 1.061a.75.75 0 11-1.061-1.06l1.06-1.061a.75.75 0 011.061 0z"/>
                    </svg>
                </button>
            </div>
        </header>

        <!-- Main Content -->
        <main class="main-content">
            <!-- Summary Panel -->
            ${this.generateSummaryPanel(reportData)}
            
            <!-- Filters and Controls -->
            ${this.options.enableFilters ? this.generateFiltersPanel() : ''}
            
            <!-- Sessions List -->
            <div class="Box">
                <div class="Box-header">
                    <h3 class="Box-title">Test Sessions</h3>
                </div>
                <div class="Box-body">
                    ${this.generateSessionsList(reportData.sessions, framework)}
                </div>
            </div>
        </main>
    </div>

    ${this.getEnhancedJavaScript()}
</body>
</html>`;
    }

    /**
     * Get GitHub Primer CSS framework
     */
    getGitHubPrimerStyles() {
        return `
    <link href="https://unpkg.com/@primer/css@^20.2.4/dist/primer.css" rel="stylesheet" />
        `;
    }

    /**
     * Get custom styles for enhanced functionality
     */
    getCustomStyles() {
        return `
    <style>
        .application-main {
            min-height: 100vh;
            background-color: var(--color-canvas-default);
        }
        
        .Header {
            background-color: var(--color-canvas-subtle);
            border-bottom: 1px solid var(--color-border-default);
            padding: 16px;
            display: flex;
            align-items: center;
            gap: 16px;
        }
        
        .Header-title {
            font-size: 20px;
            font-weight: 600;
            margin-left: 8px;
        }
        
        .Header-stats {
            display: flex;
            align-items: center;
        }
        
        .main-content {
            padding: 24px;
            max-width: 1280px;
            margin: 0 auto;
        }
        
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }
        
        .metric-card {
            background: var(--color-canvas-default);
            border: 1px solid var(--color-border-default);
            border-radius: 6px;
            padding: 16px;
            text-align: center;
        }
        
        .metric-value {
            font-size: 24px;
            font-weight: 600;
            color: var(--color-fg-default);
            margin-bottom: 4px;
        }
        
        .metric-label {
            font-size: 14px;
            color: var(--color-fg-muted);
        }
        
        .session-item {
            padding: 16px;
            border-bottom: 1px solid var(--color-border-muted);
            cursor: pointer;
            transition: background-color 0.15s ease;
        }
        
        .session-item:hover {
            background-color: var(--color-canvas-subtle);
        }
        
        .session-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
        }
        
        .session-title {
            font-weight: 600;
            color: var(--color-fg-default);
            font-size: 16px;
        }
        
        .session-meta {
            display: flex;
            gap: 16px;
            font-size: 14px;
            color: var(--color-fg-muted);
            flex-wrap: wrap;
            margin-top: 4px;
        }
        
        .session-details {
            padding: 16px 0;
        }
        
        .metadata-section {
            margin-bottom: 24px;
            background: var(--color-canvas-subtle);
            border: 1px solid var(--color-border-default);
            border-radius: 6px;
            padding: 16px;
        }
        
        .section-title {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 0 0 12px 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--color-fg-default);
        }
        
        .metadata-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 12px;
        }
        
        .metadata-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: var(--color-canvas-default);
            border: 1px solid var(--color-border-default);
            border-radius: 4px;
        }
        
        .metadata-label {
            font-weight: 500;
            color: var(--color-fg-muted);
            font-size: 13px;
        }
        
        .metadata-value {
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
            font-size: 13px;
            color: var(--color-fg-default);
            font-weight: 500;
        }
        
        .session-id {
            background: var(--color-accent-subtle);
            color: var(--color-accent-emphasis);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 12px;
        }
        
        .platform-badge {
            background: var(--color-success-subtle);
            color: var(--color-success-emphasis);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 12px;
            text-transform: uppercase;
        }
        
        .browser-badge {
            background: var(--color-accent-subtle);
            color: var(--color-accent-emphasis);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 12px;
        }
        
        .resource-links {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
        }
        
        .resource-link {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            background: var(--color-canvas-default);
            border: 1px solid var(--color-border-default);
            border-radius: 6px;
            text-decoration: none;
            color: var(--color-fg-default);
            font-size: 14px;
            font-weight: 500;
            transition: all 0.15s ease;
        }
        
        .resource-link:hover {
            background: var(--color-canvas-subtle);
            border-color: var(--color-border-muted);
            text-decoration: none;
            color: var(--color-fg-default);
        }
        
        .resource-link.primary {
            background: var(--color-accent-emphasis);
            color: var(--color-fg-on-emphasis);
            border-color: var(--color-accent-emphasis);
        }
        
        .resource-link.primary:hover {
            background: var(--color-accent-muted);
            border-color: var(--color-accent-muted);
            color: var(--color-fg-on-emphasis);
        }
        
        .navigation-timeline {
            background: var(--color-canvas-default);
            border-radius: 4px;
            padding: 8px;
        }
        
        .navigation-item {
            display: flex;
            align-items: flex-start;
            padding: 12px 0;
            border-bottom: 1px solid var(--color-border-muted);
            gap: 12px;
        }
        
        .navigation-item:last-child {
            border-bottom: none;
        }
        
        .nav-sequence {
            background: var(--color-accent-emphasis);
            color: var(--color-fg-on-emphasis);
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 600;
            flex-shrink: 0;
        }
        
        .nav-type-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            flex-shrink: 0;
        }
        
        .nav-type-navigation { background: var(--color-success-subtle); color: var(--color-success-fg); }
        .nav-type-goto { background: var(--color-accent-subtle); color: var(--color-accent-fg); }
        .nav-type-back { background: var(--color-attention-subtle); color: var(--color-attention-fg); }
        .nav-type-forward { background: var(--color-done-subtle); color: var(--color-done-fg); }
        .nav-type-refresh { background: var(--color-severe-subtle); color: var(--color-severe-fg); }
        
        .nav-urls {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .url-section {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .url-label {
            font-size: 11px;
            font-weight: 600;
            color: var(--color-fg-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            min-width: 40px;
        }
        
        .url-link {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            background: var(--color-canvas-subtle);
            border: 1px solid var(--color-border-default);
            border-radius: 4px;
            text-decoration: none;
            color: var(--color-fg-default);
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
            font-size: 12px;
            max-width: 400px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            transition: all 0.15s ease;
        }
        
        .url-link:hover {
            background: var(--color-accent-subtle);
            border-color: var(--color-accent-emphasis);
            color: var(--color-accent-emphasis);
            text-decoration: none;
        }
        
        .url-link.primary {
            background: var(--color-accent-subtle);
            border-color: var(--color-accent-emphasis);
            color: var(--color-accent-emphasis);
            font-weight: 500;
        }
        
        .url-link.primary:hover {
            background: var(--color-accent-emphasis);
            color: var(--color-fg-on-emphasis);
        }
        
        .external-link {
            opacity: 0.6;
            flex-shrink: 0;
        }
        
        .url-box {
            background: var(--color-neutral-subtle);
            border: 1px solid var(--color-border-default);
            border-radius: 4px;
            padding: 4px 8px;
            max-width: 300px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .url-arrow {
            margin: 0 12px;
            color: var(--color-fg-muted);
        }
        
        .nav-timestamp {
            margin-left: auto;
            font-size: 12px;
            color: var(--color-fg-muted);
            white-space: nowrap;
        }
        
        .search-box {
            width: 100%;
            max-width: 400px;
        }
        
        .filters-panel {
            background: var(--color-canvas-subtle);
            border: 1px solid var(--color-border-default);
            border-radius: 6px;
            padding: 16px;
            margin-bottom: 24px;
        }
        
        .filters-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
        }
        
        .timeline-view {
            background: var(--color-canvas-default);
            border: 1px solid var(--color-border-default);
            border-radius: 6px;
            padding: 16px;
            margin-bottom: 24px;
        }
        
        .timeline-item {
            display: flex;
            align-items: center;
            padding: 8px 0;
            position: relative;
        }
        
        .timeline-item::before {
            content: '';
            position: absolute;
            left: 12px;
            top: 0;
            bottom: 0;
            width: 2px;
            background: var(--color-border-muted);
        }
        
        .timeline-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--color-accent-emphasis);
            margin-right: 16px;
            z-index: 1;
            position: relative;
        }
        
        .collapsible-content {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease;
        }
        
        .collapsible-content.expanded {
            max-height: 2000px;
        }
        
        .error-item {
            background: var(--color-danger-subtle);
            border-left: 3px solid var(--color-danger-emphasis);
            padding: 8px 12px;
            margin: 8px 0;
            border-radius: 4px;
        }
        
        @media (max-width: 768px) {
            .Header {
                flex-direction: column;
                gap: 12px;
            }
            
            .main-content {
                padding: 16px;
            }
            
            .summary-grid {
                grid-template-columns: 1fr;
            }
            
            .metadata-grid {
                grid-template-columns: 1fr;
            }
            
            .resource-links {
                flex-direction: column;
            }
            
            .session-meta {
                flex-direction: column;
                gap: 8px;
            }
            
            .navigation-item {
                flex-direction: column;
                gap: 8px;
            }
            
            .nav-sequence {
                align-self: flex-start;
            }
            
            .nav-urls {
                width: 100%;
            }
            
            .url-section {
                flex-direction: column;
                align-items: flex-start;
                gap: 4px;
            }
            
            .url-link {
                width: 100%;
                max-width: none;
            }
            
            .url-arrow {
                display: none;
            }
        }
    </style>
        `;
    }

    /**
     * Generate search box component
     */
    generateSearchBox() {
        return `
        <div class="search-box">
            <input class="form-control" type="search" placeholder="Search sessions, URLs, or navigation types..." id="search-input">
        </div>
        `;
    }

    /**
     * Generate summary panel with metrics
     */
    generateSummaryPanel(reportData) {
        const { summary } = reportData;
        const avgNavigationsPerSession = summary.totalSessions > 0 ? 
            Math.round(summary.totalNavigations / summary.totalSessions) : 0;
        const avgDuration = summary.totalDuration > 0 ? 
            Math.round(summary.totalDuration / summary.totalSessions / 1000) : 0;

        return `
        <div class="summary-grid">
            <div class="metric-card">
                <div class="metric-value">${summary.totalSessions}</div>
                <div class="metric-label">Test Sessions</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${summary.totalNavigations}</div>
                <div class="metric-label">Total Navigations</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${summary.uniqueUrls.length}</div>
                <div class="metric-label">Unique URLs</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${avgNavigationsPerSession}</div>
                <div class="metric-label">Avg Nav/Session</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${avgDuration}s</div>
                <div class="metric-label">Avg Duration</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${summary.testFiles.length}</div>
                <div class="metric-label">Test Files</div>
            </div>
        </div>
        `;
    }

    /**
     * Generate filters panel
     */
    generateFiltersPanel() {
        return `
        <div class="filters-panel">
            <h4 class="mb-3">Filters</h4>
            <div class="filters-grid">
                <div>
                    <label class="form-label">Framework</label>
                    <select class="form-select" id="framework-filter">
                        <option value="">All Frameworks</option>
                    </select>
                </div>
                <div>
                    <label class="form-label">Navigation Type</label>
                    <select class="form-select" id="nav-type-filter">
                        <option value="">All Types</option>
                    </select>
                </div>
                <div>
                    <label class="form-label">Test File</label>
                    <select class="form-select" id="test-file-filter">
                        <option value="">All Files</option>
                    </select>
                </div>
                <div>
                    <label class="form-label">Date Range</label>
                    <input type="date" class="form-control" id="date-filter">
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Generate sessions list with enhanced formatting
     */
    generateSessionsList(sessions, framework) {
        if (!sessions || sessions.length === 0) {
            return `
            <div class="blankslate">
                <h3 class="blankslate-heading">No tracking data found</h3>
                <p class="blankslate-description">No navigation tracking data is available for this report.</p>
            </div>
            `;
        }

        return sessions.map((session, index) => `
            <div class="session-item" data-session-id="${session.session_id}">
                <div class="session-header" onclick="toggleSession('${session.session_id}')">
                    <div>
                        <div class="session-title">${session.test_name}</div>
                        <div class="session-meta">
                            <span>📁 ${session.spec_file}</span>
                            <span>🔗 ${session.navigations.length} navigations</span>
                            <span>⏱️ ${new Date(session.timestamp).toLocaleString()}</span>
                            ${session.duration ? `<span>🕐 ${Math.round(session.duration/1000)}s</span>` : ''}
                            ${session.username ? `<span>👤 ${session.username}</span>` : ''}
                            ${session.build_name ? `<span>🏗️ ${session.build_name}</span>` : ''}
                        </div>
                    </div>
                    <div>
                        <span class="Label Label--secondary">${framework}</span>
                        ${this.generateStatusBadge(session.status)}
                        <button class="btn btn-sm btn-invisible" type="button">
                            <svg class="octicon session-chevron" width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                                <path d="M6 8.825c-.2 0-.4-.1-.5-.2L1.275 4.4c-.3-.3-.3-.8 0-1.1s.8-.3 1.1 0L6 6.925 9.625 3.3c.3-.3.8-.3 1.1 0s.3.8 0 1.1L6.5 8.625c-.1.1-.3.2-.5.2z"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="collapsible-content" id="session-${session.session_id}">
                    ${this.generateSessionDetails(session)}
                </div>
            </div>
        `).join('');
    }

    /**
     * Generate detailed session information including metadata
     */
    generateSessionDetails(session) {
        return `
        <div class="session-details">
            ${this.generateTestMetadata(session)}
            ${this.generateEnvironmentInfo(session)}
            ${this.generateResourceLinks(session)}
            ${this.generateNavigationsList(session.navigations)}
        </div>
        `;
    }

    /**
     * Generate test metadata section
     */
    generateTestMetadata(session) {
        const metadata = session.metadataData || {};
        
        return `
        <div class="metadata-section">
            <h4 class="section-title">
                <svg class="octicon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 10.5v-8zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z"/>
                </svg>
                Test Information
            </h4>
            <div class="metadata-grid">
                ${session.session_id ? `
                <div class="metadata-item">
                    <span class="metadata-label">Session ID</span>
                    <span class="metadata-value session-id">${session.session_id}</span>
                </div>
                ` : ''}
                ${session.build_id ? `
                <div class="metadata-item">
                    <span class="metadata-label">Build ID</span>
                    <span class="metadata-value">${session.build_id}</span>
                </div>
                ` : ''}
                ${session.test_type ? `
                <div class="metadata-item">
                    <span class="metadata-label">Test Type</span>
                    <span class="metadata-value">${session.test_type.toUpperCase()}</span>
                </div>
                ` : ''}
                ${session.start_timestamp ? `
                <div class="metadata-item">
                    <span class="metadata-label">Started At</span>
                    <span class="metadata-value">${new Date(session.start_timestamp).toLocaleString()}</span>
                </div>
                ` : ''}
                ${session.remark ? `
                <div class="metadata-item">
                    <span class="metadata-label">Status</span>
                    <span class="metadata-value">${session.remark}</span>
                </div>
                ` : ''}
            </div>
        </div>
        `;
    }

    /**
     * Generate environment information section
     */
    generateEnvironmentInfo(session) {
        const hasEnvInfo = session.platform || session.browser || session.resolution || session.geoInfo;
        if (!hasEnvInfo) return '';

        return `
        <div class="metadata-section">
            <h4 class="section-title">
                <svg class="octicon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M6.906.664a1.749 1.749 0 012.187 0l5.25 4.2c.415.332.657.835.657 1.367v7.019A1.75 1.75 0 0113.25 15h-2.5a.75.75 0 010-1.5h2.5a.25.25 0 00.25-.25V6.23a.25.25 0 00-.094-.196L8.157 1.867a.25.25 0 00-.314 0L2.594 6.034a.25.25 0 00-.094.196v8.02a.25.25 0 00.25.25h4.5a.75.75 0 010 1.5h-4.5A1.75 1.75 0 011 13.25V6.231c0-.532.242-1.035.657-1.367l5.25-4.2z"/>
                    <path d="M8.25 10.25a.75.75 0 00-1.5 0v2.5h2V12a2 2 0 012-2h2a2 2 0 012 2v.75h.25a.75.75 0 000 1.5H8.75v-1.5h.5a.5.5 0 01.5.5v.25h2.5V12a.5.5 0 00-.5-.5h-2a.5.5 0 00-.5.5v.75z"/>
                </svg>
                Environment
            </h4>
            <div class="metadata-grid">
                ${session.platform ? `
                <div class="metadata-item">
                    <span class="metadata-label">Platform</span>
                    <span class="metadata-value platform-badge">${session.platform.toUpperCase()}</span>
                </div>
                ` : ''}
                ${session.browser ? `
                <div class="metadata-item">
                    <span class="metadata-label">Browser</span>
                    <span class="metadata-value browser-badge">${session.browser} ${session.browser_version || ''}</span>
                </div>
                ` : ''}
                ${session.resolution ? `
                <div class="metadata-item">
                    <span class="metadata-label">Resolution</span>
                    <span class="metadata-value">${session.resolution}</span>
                </div>
                ` : ''}
                ${session.geoInfo ? `
                <div class="metadata-item">
                    <span class="metadata-label">Location</span>
                    <span class="metadata-value">${session.geoInfo.regionName}, ${session.geoInfo.country} (${session.geoInfo.provider})</span>
                </div>
                ` : ''}
            </div>
        </div>
        `;
    }

    /**
     * Generate resource links section
     */
    generateResourceLinks(session) {
        const hasLinks = session.video_url || session.screenshot_url || session.console_logs_url || 
                         session.network_logs_url || session.command_logs_url || session.public_url;
        if (!hasLinks) return '';

        return `
        <div class="metadata-section">
            <h4 class="section-title">
                <svg class="octicon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z"/>
                </svg>
                Resources & Logs
            </h4>
            <div class="resource-links">
                ${session.public_url ? `
                <a href="${session.public_url}" target="_blank" class="resource-link primary">
                    <svg class="octicon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z"/>
                    </svg>
                    View Public Test Report
                </a>
                ` : ''}
                ${session.video_url ? `
                <a href="${session.video_url}" target="_blank" class="resource-link">
                    <svg class="octicon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/>
                    </svg>
                    Video Recording
                </a>
                ` : ''}
                ${session.screenshot_url ? `
                <a href="${session.screenshot_url}" target="_blank" class="resource-link">
                    <svg class="octicon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 2a5.53 5.53 0 0 0-3.594 1.342c-.766.66-1.321 1.52-1.464 2.383C1.266 6.095 0 7.555 0 9.318 0 11.366 1.708 13 3.781 13h8.906C14.502 13 16 11.57 16 9.773c0-1.636-1.242-2.969-2.834-3.194C12.923 3.999 10.69 2 8 2zm2.354 6.854-2 2a.5.5 0 0 1-.708 0l-2-2a.5.5 0 1 1 .708-.708L7.5 9.293V5.5a.5.5 0 0 1 1 0v3.793l1.146-1.147a.5.5 0 0 1 .708.708z"/>
                    </svg>
                    Screenshots
                </a>
                ` : ''}
                ${session.console_logs_url ? `
                <a href="${session.console_logs_url}" target="_blank" class="resource-link">
                    <svg class="octicon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75zm1.75-.25a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25H1.75zM7.25 8a.75.75 0 0 1-.22.53l-2.25 2.25a.75.75 0 0 1-1.06-1.06L5.44 8 3.72 6.28a.75.75 0 0 1 1.06-1.06l2.25 2.25c.141.14.22.331.22.53zm1.5 1.5a.75.75 0 0 1 0-1.5h3a.75.75 0 0 1 0 1.5h-3z"/>
                    </svg>
                    Console Logs
                </a>
                ` : ''}
                ${session.network_logs_url ? `
                <a href="${session.network_logs_url}" target="_blank" class="resource-link">
                    <svg class="octicon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M2.5 3.5c0-.825.675-1.5 1.5-1.5h1c.825 0 1.5.675 1.5 1.5V5h1V3.5c0-.825.675-1.5 1.5-1.5h1c.825 0 1.5.675 1.5 1.5V12c0 1.38-1.12 2.5-2.5 2.5h-9C1.12 14.5 0 13.38 0 12V3.5c0-.825.675-1.5 1.5-1.5h1zM1.5 12c0 .55.45 1 1 1h9c.55 0 1-.45 1-1V6.5H1.5V12z"/>
                    </svg>
                    Network Logs
                </a>
                ` : ''}
                ${session.command_logs_url ? `
                <a href="${session.command_logs_url}" target="_blank" class="resource-link">
                    <svg class="octicon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M7.25 2.75a.75.75 0 0 0-1.5 0v8.5a.75.75 0 0 0 1.5 0v-3.5h3.25a.75.75 0 0 0 0-1.5H7.25v-3.5z"/>
                    </svg>
                    Command Logs
                </a>
                ` : ''}
            </div>
        </div>
        `;
    }

    /**
     * Generate status badge for session
     */
    generateStatusBadge(status) {
        const statusMap = {
            'completed': { class: 'success', icon: '✓' },
            'running': { class: 'attention', icon: '⟳' },
            'failed': { class: 'danger', icon: '✗' },
            'timeout': { class: 'severe', icon: '⏱' }
        };
        
        const statusInfo = statusMap[status] || { class: 'secondary', icon: '?' };
        return `<span class="Label Label--${statusInfo.class}">${statusInfo.icon} ${status}</span>`;
    }

    /**
     * Generate navigations list for a session
     */
    generateNavigationsList(navigations) {
        if (!navigations || navigations.length === 0) {
            return '<p class="text-muted p-3">No navigation data available</p>';
        }

        return `
        <div class="metadata-section">
            <h4 class="section-title">
                <svg class="octicon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z"/>
                </svg>
                Navigation History (${navigations.length} entries)
            </h4>
            <div class="navigation-timeline">
                ${navigations.map((nav, index) => `
                    <div class="navigation-item">
                        <div class="nav-sequence">${index + 1}</div>
                        <span class="nav-type-badge nav-type-${nav.navigation_type.replace(/[^a-z]/gi, '')}">${nav.navigation_type}</span>
                        <div class="nav-urls">
                            ${nav.previous_url !== 'null' ? `
                                <div class="url-section">
                                    <span class="url-label">From:</span>
                                    <a href="${nav.previous_url}" target="_blank" class="url-link" title="${nav.previous_url}">
                                        ${this.truncateUrl(nav.previous_url)}
                                        <svg class="octicon external-link" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                            <path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z"/>
                                        </svg>
                                    </a>
                                </div>
                            ` : ''}
                            <div class="url-section">
                                <span class="url-label">To:</span>
                                <a href="${nav.current_url}" target="_blank" class="url-link primary" title="${nav.current_url}">
                                    ${this.truncateUrl(nav.current_url)}
                                    <svg class="octicon external-link" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z"/>
                                    </svg>
                                </a>
                            </div>
                        </div>
                        <div class="nav-timestamp">${this.formatTimestamp(nav.timestamp)}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        `;
    }

    /**
     * Truncate URL for display
     */
    truncateUrl(url) {
        if (!url || url === 'null') return 'null';
        if (url.length <= 40) return url;
        return url.substring(0, 37) + '...';
    }

    /**
     * Format timestamp for display
     */
    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    }

    /**
     * Generate enhanced JavaScript for interactivity
     */
    getEnhancedJavaScript() {
        return `
    <script>
        // Global state
        let allSessions = [];
        let filteredSessions = [];
        let currentFilters = {
            search: '',
            framework: '',
            navType: '',
            testFile: '',
            date: ''
        };

        // Initialize when DOM is loaded
        document.addEventListener('DOMContentLoaded', function() {
            initializeReport();
            setupEventListeners();
            populateFilters();
        });

        function initializeReport() {
            // Store original sessions data
            allSessions = Array.from(document.querySelectorAll('.session-item')).map(item => ({
                element: item,
                id: item.dataset.sessionId,
                title: item.querySelector('.session-title').textContent,
                specFile: item.querySelector('.session-meta span').textContent,
                navigations: Array.from(item.querySelectorAll('.navigation-item'))
            }));
            
            filteredSessions = [...allSessions];
            console.log('Report initialized with', allSessions.length, 'sessions');
        }

        function setupEventListeners() {
            // Search functionality
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.addEventListener('input', handleSearch);
            }

            // Filter functionality
            const filterElements = ['framework-filter', 'nav-type-filter', 'test-file-filter', 'date-filter'];
            filterElements.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.addEventListener('change', handleFilterChange);
                }
            });

            // Theme toggle
            const themeToggle = document.getElementById('theme-toggle');
            if (themeToggle) {
                themeToggle.addEventListener('click', toggleTheme);
            }

            // Keyboard shortcuts
            document.addEventListener('keydown', handleKeyboardShortcuts);
        }

        function toggleSession(sessionId) {
            const content = document.getElementById('session-' + sessionId);
            const chevron = document.querySelector('[data-session-id="' + sessionId + '"] .session-chevron');
            
            if (content.classList.contains('expanded')) {
                content.classList.remove('expanded');
                chevron.style.transform = 'rotate(0deg)';
            } else {
                content.classList.add('expanded');
                chevron.style.transform = 'rotate(180deg)';
            }
        }

        function handleSearch(event) {
            currentFilters.search = event.target.value.toLowerCase();
            applyFilters();
        }

        function handleFilterChange(event) {
            const filterId = event.target.id.replace('-filter', '');
            currentFilters[filterId.replace('-', '')] = event.target.value;
            applyFilters();
        }

        function applyFilters() {
            filteredSessions = allSessions.filter(session => {
                // Search filter
                if (currentFilters.search) {
                    const searchText = (session.title + ' ' + session.specFile).toLowerCase();
                    if (!searchText.includes(currentFilters.search)) {
                        return false;
                    }
                }

                // Other filters can be implemented here
                return true;
            });

            // Update display
            allSessions.forEach(session => {
                const isVisible = filteredSessions.includes(session);
                session.element.style.display = isVisible ? 'block' : 'none';
            });

            // Update results count
            updateResultsCount();
        }

        function updateResultsCount() {
            const countElement = document.querySelector('.Counter--primary');
            if (countElement) {
                countElement.textContent = filteredSessions.length;
            }
        }

        function populateFilters() {
            // This would populate filter dropdowns with available options
            // Implementation depends on the specific data structure
        }

        function toggleTheme() {
            const html = document.documentElement;
            const currentTheme = html.getAttribute('data-color-mode');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-color-mode', newTheme);
            localStorage.setItem('theme', newTheme);
        }

        function handleKeyboardShortcuts(event) {
            // Ctrl/Cmd + K for search focus
            if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
                event.preventDefault();
                const searchInput = document.getElementById('search-input');
                if (searchInput) {
                    searchInput.focus();
                }
            }

            // Escape to clear search
            if (event.key === 'Escape') {
                const searchInput = document.getElementById('search-input');
                if (searchInput && searchInput === document.activeElement) {
                    searchInput.value = '';
                    handleSearch({ target: searchInput });
                }
            }
        }

        // Export functions for external use
        window.toggleSession = toggleSession;
    </script>
        `;
    }

    /**
     * Setup keyboard shortcut listener
     */
    setupKeyboardShortcut() {
        if (this.isListening) return;
        
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.setEncoding('utf8');
            
            this.keyPressHandler = (key) => {
                if (key === '\u0003') process.exit();
                if (key.toLowerCase() === 'o') this.openReport();
            };
            
            process.stdin.on('data', this.keyPressHandler);
            this.isListening = true;
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
            console.log(`Opened enhanced report: ${this.reportPath}`);
        } catch (error) {
            console.error(`Failed to open report: ${error.message}`);
        }
    }

    /**
     * Static method to generate report from files
     */
    static generateFromFiles(options = {}) {
        const reporter = new EnhancedHtmlReporter(options);
        const trackingFiles = reporter.findTrackingFiles();
        
        if (trackingFiles.length === 0) {
            console.log('⚠️  No tracking files found');
            return null;
        }
        
        let combinedData = [];
        let detectedFramework = 'unknown';
        
        trackingFiles.forEach((filePath) => {
            try {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const data = JSON.parse(fileContent);
                
                // Detect framework
                if (filePath.includes('navigation-tracking')) {
                    detectedFramework = 'appium';
                } else if (filePath.includes('url-tracking')) {
                    detectedFramework = data.some?.(session => session.metadata) ? 'playwright' : 'webdriverio';
                }
                
                if (Array.isArray(data)) {
                    combinedData = combinedData.concat(data);
                } else {
                    combinedData.push(data);
                }
            } catch (error) {
                console.error(`Error reading ${filePath}: ${error.message}`);
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
            'test-results/url-tracking-results.json'
        ];
        
        return possibleFiles.filter(filePath => {
            return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
        });
    }
}

module.exports = { EnhancedHtmlReporter }; 