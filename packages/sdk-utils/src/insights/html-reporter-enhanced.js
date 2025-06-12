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
            theme: options.theme || 'light', // Default to light theme for better GitHub authenticity
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
     * Generate GitHub Primer UI compliant HTML
     */
    generatePlaywrightStyleHtml(reportData, framework) {
        const isDark = false; // Force light theme for better compatibility
        
return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.options.title}</title>
    ${this.getGitHubPrimerStyles()}
    ${this.getCustomStyles()}
</head>
<body>
        <!-- Header -->
    <div style="background-color: var(--color-canvas-subtle); border-bottom: 1px solid var(--color-border-default); padding: 16px 0;">
        <div style="max-width: 1280px; margin: 0 auto; padding: 0 16px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; font-size: 18px; font-weight: 600; color: var(--color-fg-default);">
                <svg style="margin-right: 8px;" width="24" height="24" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
                    </svg>
                LambdaTest / ${this.options.title}
                </div>
            <div style="display: flex; align-items: center; gap: 16px;">
                <span style="background-color: var(--color-accent-emphasis); color: var(--color-fg-on-emphasis); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">${reportData.summary.totalSessions}</span>
                <span style="font-size: 12px; color: var(--color-fg-muted);">sessions</span>
                <button id="theme-toggle" style="background: var(--color-btn-bg); border: 1px solid var(--color-btn-border); border-radius: 6px; padding: 6px 8px; color: var(--color-fg-default); cursor: pointer; display: flex; align-items: center;" title="Toggle theme">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="theme-icon-light">
                        <path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM8 0a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V.75A.75.75 0 0 1 8 0Zm0 13a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 13ZM2.343 2.343a.75.75 0 0 1 1.061 0l1.06 1.061a.75.75 0 0 1-1.06 1.06L2.343 3.404a.75.75 0 0 1 0-1.061Zm9.193 9.193a.75.75 0 0 1 1.061 0l1.06 1.061a.75.75 0 0 1-1.06 1.06l-1.061-1.06a.75.75 0 0 1 0-1.061ZM16 8a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 16 8ZM3 8a.75.75 0 0 1-.75.75H.75a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 3 8Zm10.657-5.657a.75.75 0 0 1 0 1.061l-1.061 1.06a.75.75 0 1 1-1.06-1.06l1.06-1.061a.75.75 0 0 1 1.061 0Zm-9.193 9.193a.75.75 0 0 1 0 1.061l-1.061 1.06a.75.75 0 1 1-1.06-1.06l1.06-1.061a.75.75 0 0 1 1.061 0Z"/>
                    </svg>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="theme-icon-dark" style="display: none;">
                        <path d="M9.598 1.591a.749.749 0 0 1 .785-.175 7.001 7.001 0 1 1-8.967 8.967.75.75 0 0 1 .961-.96 5.5 5.5 0 0 0 7.046-7.046.75.75 0 0 1 .175-.786Zm1.616 1.945a7 7 0 0 1-7.678 7.678 5.499 5.499 0 1 0 7.678-7.678Z"/>
                    </svg>
                </button>
            </div>
            </div>
                </div>

    <!-- Sub Navigation -->
    <div style="background-color: var(--color-canvas-default); border-bottom: 1px solid var(--color-border-default); padding: 8px 0;">
        <div style="max-width: 1280px; margin: 0 auto; padding: 0 16px;">
            <a href="#" style="display: inline-flex; align-items: center; padding: 8px 16px; color: var(--color-fg-default); text-decoration: none; border-bottom: 2px solid var(--color-accent-emphasis);">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 8px;">
                    <path d="M6 2c.306 0 .582.187.696.471L10 10.731l1.304-3.26A.751.751 0 0 1 12 7h3.25a.75.75 0 0 1 0 1.5H12.58l-1.855 4.64A.751.751 0 0 1 10 13a.751.751 0 0 1-.725-.529L6 3.269 4.696 6.531A.751.751 0 0 1 4 7H.75a.75.75 0 0 1 0-1.5H3.42l1.855-4.64A.751.751 0 0 1 6 2Z"/>
                    </svg>
                Insights
            </a>
            </div>
    </div>

        <!-- Main Content -->
    <div style="max-width: 1280px; margin: 0 auto; padding: 24px 16px;">
        <!-- Summary Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
            <div style="background: var(--color-canvas-subtle); border: 1px solid var(--color-border-default); border-radius: 6px; padding: 16px; text-align: center;">
                <div style="font-size: 24px; font-weight: 600; color: var(--color-fg-default); margin-bottom: 4px;">${reportData.summary.totalSessions}</div>
                <div style="font-size: 12px; color: var(--color-fg-muted); text-transform: uppercase; letter-spacing: 0.5px;">Test Sessions</div>
            </div>
            <div style="background: var(--color-canvas-subtle); border: 1px solid var(--color-border-default); border-radius: 6px; padding: 16px; text-align: center;">
                <div style="font-size: 24px; font-weight: 600; color: var(--color-fg-default); margin-bottom: 4px;">${reportData.summary.totalNavigations}</div>
                <div style="font-size: 12px; color: var(--color-fg-muted); text-transform: uppercase; letter-spacing: 0.5px;">Total Navigations</div>
            </div>
            <div style="background: var(--color-canvas-subtle); border: 1px solid var(--color-border-default); border-radius: 6px; padding: 16px; text-align: center;">
                <div style="font-size: 24px; font-weight: 600; color: var(--color-fg-default); margin-bottom: 4px;">${reportData.summary.uniqueUrls.length}</div>
                <div style="font-size: 12px; color: var(--color-fg-muted); text-transform: uppercase; letter-spacing: 0.5px;">Unique URLs</div>
            </div>
            <div style="background: var(--color-canvas-subtle); border: 1px solid var(--color-border-default); border-radius: 6px; padding: 16px; text-align: center;">
                <div style="font-size: 24px; font-weight: 600; color: var(--color-fg-default); margin-bottom: 4px;">${reportData.summary.totalSessions > 0 ? Math.round(reportData.summary.totalNavigations / reportData.summary.totalSessions) : 0}</div>
                <div style="font-size: 12px; color: var(--color-fg-muted); text-transform: uppercase; letter-spacing: 0.5px;">Avg Nav/Session</div>
            </div>
            <div style="background: var(--color-canvas-subtle); border: 1px solid var(--color-border-default); border-radius: 6px; padding: 16px; text-align: center;">
                <div style="font-size: 24px; font-weight: 600; color: var(--color-fg-default); margin-bottom: 4px;">${reportData.summary.totalDuration > 0 ? Math.round(reportData.summary.totalDuration / reportData.summary.totalSessions / 1000) : 0}s</div>
                <div style="font-size: 12px; color: var(--color-fg-muted); text-transform: uppercase; letter-spacing: 0.5px;">Avg Duration</div>
            </div>
            <div style="background: var(--color-canvas-subtle); border: 1px solid var(--color-border-default); border-radius: 6px; padding: 16px; text-align: center;">
                <div style="font-size: 24px; font-weight: 600; color: var(--color-fg-default); margin-bottom: 4px;">${reportData.summary.testFiles.length}</div>
                <div style="font-size: 12px; color: var(--color-fg-muted); text-transform: uppercase; letter-spacing: 0.5px;">Test Files</div>
            </div>
        </div>

        <!-- Test Sessions -->
        <div style="background: var(--color-canvas-default); border: 1px solid var(--color-border-default); border-radius: 6px; margin-bottom: 24px;">
            <div style="background: var(--color-canvas-subtle); border-bottom: 1px solid var(--color-border-default); padding: 16px; display: flex; align-items: center; justify-content: space-between;">
                <div style="font-size: 16px; font-weight: 600; display: flex; align-items: center; color: var(--color-fg-default);">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 8px;">
                        <path d="M6 2c.306 0 .582.187.696.471L10 10.731l1.304-3.26A.751.751 0 0 1 12 7h3.25a.75.75 0 0 1 0 1.5H12.58l-1.855 4.64A.751.751 0 0 1 10 13a.751.751 0 0 1-.725-.529L6 3.269 4.696 6.531A.751.751 0 0 1 4 7H.75a.75.75 0 0 1 0-1.5H3.42l1.855-4.64A.751.751 0 0 1 6 2Z"/>
                    </svg>
                    Test Sessions
                </div>
                <span style="background: var(--color-neutral-muted); border: 1px solid var(--color-border-default); border-radius: 12px; padding: 2px 8px; font-size: 12px; font-weight: 500; color: var(--color-fg-muted);">${framework}</span>
                </div>
            <div>
                ${this.generateInlineSessionsList(reportData.sessions, framework)}
            </div>
        </div>
    </div>

    ${this.getSimpleJavaScript()}
</body>
</html>`;
    }

    /**
     * Get GitHub Primer CSS framework
     */
    getGitHubPrimerStyles() {
        return `
        <!-- No external CSS - using inline styles for better compatibility -->
        `;
    }

    /**
     * Get custom styles for enhanced functionality
     */
    getCustomStyles() {
        return `
    <style>
        /* CSS Custom Properties for Light and Dark Themes */
        :root[data-theme="light"] {
            --color-canvas-default: #ffffff;
            --color-canvas-subtle: #f6f8fa;
            --color-canvas-inset: #f6f8fa;
            --color-fg-default: #24292f;
            --color-fg-muted: #656d76;
            --color-fg-subtle: #6e7781;
            --color-fg-on-emphasis: #ffffff;
            --color-border-default: #d0d7de;
            --color-border-muted: #d8dee4;
            --color-neutral-muted: #afb8c1;
            --color-accent-emphasis: #0969da;
            --color-accent-fg: #0969da;
            --color-accent-subtle: #dbeafe;
            --color-success-emphasis: #1a7f37;
            --color-success-fg: #1a7f37;
            --color-success-subtle: #dafbe1;
            --color-attention-emphasis: #9a6700;
            --color-attention-fg: #9a6700;
            --color-attention-subtle: #fff8c5;
            --color-danger-emphasis: #cf222e;
            --color-danger-fg: #cf222e;
            --color-danger-subtle: #ffebe9;
            --color-btn-bg: #f6f8fa;
            --color-btn-border: #d0d7de;
            --color-btn-hover-bg: #f3f4f6;
            --color-btn-hover-border: #d0d7de;
        }

        :root[data-theme="dark"] {
            --color-canvas-default: #0d1117;
            --color-canvas-subtle: #161b22;
            --color-canvas-inset: #010409;
            --color-fg-default: #e6edf3;
            --color-fg-muted: #7d8590;
            --color-fg-subtle: #6e7681;
            --color-fg-on-emphasis: #ffffff;
            --color-border-default: #30363d;
            --color-border-muted: #21262d;
            --color-neutral-muted: #6e7681;
            --color-accent-emphasis: #1f6feb;
            --color-accent-fg: #58a6ff;
            --color-accent-subtle: #0d419d;
            --color-success-emphasis: #238636;
            --color-success-fg: #3fb950;
            --color-success-subtle: #0f5132;
            --color-attention-emphasis: #9e6a03;
            --color-attention-fg: #d29922;
            --color-attention-subtle: #4d2d00;
            --color-danger-emphasis: #da3633;
            --color-danger-fg: #f85149;
            --color-danger-subtle: #67060c;
            --color-btn-bg: #21262d;
            --color-btn-border: #30363d;
            --color-btn-hover-bg: #30363d;
            --color-btn-hover-border: #8b949e;
        }

        /* Basic reset and font family */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
            background-color: var(--color-canvas-default);
            color: var(--color-fg-default);
            line-height: 1.5;
            transition: background-color 0.2s ease, color 0.2s ease;
        }

        /* Theme toggle button styles */
        #theme-toggle {
            transition: all 0.2s ease;
        }

        #theme-toggle:hover {
            background: var(--color-btn-hover-bg) !important;
            border-color: var(--color-btn-hover-border) !important;
        }

        /* Theme icon visibility */
        [data-theme="light"] .theme-icon-dark {
            display: none !important;
        }

        [data-theme="light"] .theme-icon-light {
            display: block !important;
        }

        [data-theme="dark"] .theme-icon-light {
            display: none !important;
        }

        [data-theme="dark"] .theme-icon-dark {
            display: block !important;
        }

        /* Smooth transitions for theme changes */
        * {
            transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
        }

        /* Responsive design */
        @media (max-width: 768px) {
            div[style*="grid-template-columns"] {
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)) !important;
            }
            
            div[style*="flex-direction: column"] {
                flex-direction: column !important;
                gap: 8px !important;
            }
        }

        @media (max-width: 544px) {
            div[style*="max-width: 1280px"] {
                padding-left: 16px !important;
                padding-right: 16px !important;
            }
        }

        /* Print styles */
        @media print {
            #theme-toggle {
                display: none !important;
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
        <div class="position-relative">
            <input class="form-control input-contrast input-lg" type="search" placeholder="Search sessions, URLs, or navigation types..." id="search-input" aria-label="Search">
            <div class="position-absolute" style="top: 9px; right: 8px;">
                <svg class="octicon octicon-search color-fg-subtle" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M10.68 11.74a6 6 0 01-7.922-8.982 6 6 0 018.982 7.922l3.04 3.04a.75.75 0 11-1.06 1.06l-3.04-3.04zM11.5 7a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"/>
                </svg>
            </div>
        </div>
        `;
    }

    /**
     * Generate modern search box for AppHeader
     */
    generateModernSearchBox() {
        return `
        <div class="AppHeader-search">
            <div class="AppHeader-search-form">
                <div class="form-control">
                    <input class="AppHeader-search-input" type="search" placeholder="Search sessions, URLs, or tests..." id="search-input" aria-label="Search">
                    <div class="AppHeader-search-action">
                        <svg class="octicon octicon-search" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M10.68 11.74a6 6 0 01-7.922-8.982 6 6 0 018.982 7.922l3.04 3.04a.75.75 0 11-1.06 1.06l-3.04-3.04zM11.5 7a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"/>
                        </svg>
                    </div>
                </div>
            </div>
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
        <div class="d-flex flex-wrap gap-3 mb-4">
            <div class="Box flex-auto" style="min-width: 200px;">
                <div class="Box-body text-center">
                    <div class="f1 lh-condensed color-fg-default text-bold">${summary.totalSessions}</div>
                    <div class="f6 color-fg-muted">Test Sessions</div>
            </div>
            </div>
            <div class="Box flex-auto" style="min-width: 200px;">
                <div class="Box-body text-center">
                    <div class="f1 lh-condensed color-fg-default text-bold">${summary.totalNavigations}</div>
                    <div class="f6 color-fg-muted">Total Navigations</div>
            </div>
            </div>
            <div class="Box flex-auto" style="min-width: 200px;">
                <div class="Box-body text-center">
                    <div class="f1 lh-condensed color-fg-default text-bold">${summary.uniqueUrls.length}</div>
                    <div class="f6 color-fg-muted">Unique URLs</div>
            </div>
            </div>
            <div class="Box flex-auto" style="min-width: 200px;">
                <div class="Box-body text-center">
                    <div class="f1 lh-condensed color-fg-default text-bold">${avgNavigationsPerSession}</div>
                    <div class="f6 color-fg-muted">Avg Nav/Session</div>
                </div>
            </div>
            <div class="Box flex-auto" style="min-width: 200px;">
                <div class="Box-body text-center">
                    <div class="f1 lh-condensed color-fg-default text-bold">${avgDuration}s</div>
                    <div class="f6 color-fg-muted">Avg Duration</div>
                </div>
            </div>
            <div class="Box flex-auto" style="min-width: 200px;">
                <div class="Box-body text-center">
                    <div class="f1 lh-condensed color-fg-default text-bold">${summary.testFiles.length}</div>
                    <div class="f6 color-fg-muted">Test Files</div>
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Generate modern summary panel with better cards
     */
    generateModernSummaryPanel(reportData) {
        const { summary } = reportData;
        const avgNavigationsPerSession = summary.totalSessions > 0 ? 
            Math.round(summary.totalNavigations / summary.totalSessions) : 0;
        const avgDuration = summary.totalDuration > 0 ? 
            Math.round(summary.totalDuration / summary.totalSessions / 1000) : 0;

        return `
        <div class="BorderGrid BorderGrid--spacious mb-4">
            <div class="BorderGrid-row">
                <div class="BorderGrid-cell">
                    <div class="Box Box--condensed">
                        <div class="Box-body p-3 text-center">
                            <div class="f1 lh-condensed color-fg-default text-bold mb-1">${summary.totalSessions}</div>
                            <div class="f6 color-fg-muted text-normal">Test Sessions</div>
                        </div>
                    </div>
                </div>
                <div class="BorderGrid-cell">
                    <div class="Box Box--condensed">
                        <div class="Box-body p-3 text-center">
                            <div class="f1 lh-condensed color-fg-default text-bold mb-1">${summary.totalNavigations}</div>
                            <div class="f6 color-fg-muted text-normal">Total Navigations</div>
                        </div>
                    </div>
                </div>
                <div class="BorderGrid-cell">
                    <div class="Box Box--condensed">
                        <div class="Box-body p-3 text-center">
                            <div class="f1 lh-condensed color-fg-default text-bold mb-1">${summary.uniqueUrls.length}</div>
                            <div class="f6 color-fg-muted text-normal">Unique URLs</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="BorderGrid-row">
                <div class="BorderGrid-cell">
                    <div class="Box Box--condensed">
                        <div class="Box-body p-3 text-center">
                            <div class="f1 lh-condensed color-fg-default text-bold mb-1">${avgNavigationsPerSession}</div>
                            <div class="f6 color-fg-muted text-normal">Avg Nav/Session</div>
                        </div>
                    </div>
                </div>
                <div class="BorderGrid-cell">
                    <div class="Box Box--condensed">
                        <div class="Box-body p-3 text-center">
                            <div class="f1 lh-condensed color-fg-default text-bold mb-1">${avgDuration}s</div>
                            <div class="f6 color-fg-muted text-normal">Avg Duration</div>
                        </div>
                    </div>
                </div>
                <div class="BorderGrid-cell">
                    <div class="Box Box--condensed">
                        <div class="Box-body p-3 text-center">
                            <div class="f1 lh-condensed color-fg-default text-bold mb-1">${summary.testFiles.length}</div>
                            <div class="f6 color-fg-muted text-normal">Test Files</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Generate filters panel
     */
    generateFiltersPanel() {
        return `
        <div class="Box mb-4">
            <div class="Box-header">
                <h3 class="Box-title">
                    <svg class="octicon octicon-filter mr-2" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M.75 3h14.5a.75.75 0 010 1.5H.75a.75.75 0 010-1.5zM3 7.75a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5h-8.5a.75.75 0 01-.75-.75zm5.75 4a.75.75 0 000 1.5h2.5a.75.75 0 000-1.5h-2.5z"/>
                    </svg>
                    Filters
                </h3>
            </div>
            <div class="Box-body">
                <div class="d-flex flex-wrap gap-3">
                    <div class="FormControl">
                        <label class="FormControl-label" for="framework-filter">Framework</label>
                        <select class="FormControl-select" id="framework-filter">
                        <option value="">All Frameworks</option>
                    </select>
                </div>
                    <div class="FormControl">
                        <label class="FormControl-label" for="nav-type-filter">Navigation Type</label>
                        <select class="FormControl-select" id="nav-type-filter">
                        <option value="">All Types</option>
                    </select>
                </div>
                    <div class="FormControl">
                        <label class="FormControl-label" for="test-file-filter">Test File</label>
                        <select class="FormControl-select" id="test-file-filter">
                        <option value="">All Files</option>
                    </select>
                </div>
                    <div class="FormControl">
                        <label class="FormControl-label" for="date-filter">Date Range</label>
                        <input type="date" class="FormControl-input" id="date-filter">
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Generate modern filters panel
     */
    generateModernFiltersPanel() {
        return `
        <div class="Box mb-4">
            <div class="Box-header">
                <h3 class="Box-title">
                    <svg class="octicon octicon-filter mr-2" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M.75 3h14.5a.75.75 0 010 1.5H.75a.75.75 0 010-1.5zM3 7.75a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5h-8.5a.75.75 0 01-.75-.75zm5.75 4a.75.75 0 000 1.5h2.5a.75.75 0 000-1.5h-2.5z"/>
                    </svg>
                    Filters
                </h3>
            </div>
            <div class="Box-body">
                <div class="d-flex flex-wrap gap-3">
                    <div class="FormControl">
                        <label class="FormControl-label sr-only" for="framework-filter">Framework</label>
                        <select class="FormControl-select FormControl-small" id="framework-filter">
                            <option value="">All Frameworks</option>
                        </select>
                    </div>
                    <div class="FormControl">
                        <label class="FormControl-label sr-only" for="nav-type-filter">Navigation Type</label>
                        <select class="FormControl-select FormControl-small" id="nav-type-filter">
                            <option value="">All Types</option>
                        </select>
                    </div>
                    <div class="FormControl">
                        <label class="FormControl-label sr-only" for="test-file-filter">Test File</label>
                        <select class="FormControl-select FormControl-small" id="test-file-filter">
                            <option value="">All Files</option>
                        </select>
                    </div>
                    <div class="FormControl">
                        <label class="FormControl-label sr-only" for="date-filter">Date Range</label>
                        <input type="date" class="FormControl-input FormControl-small" id="date-filter" placeholder="Date Range">
                    </div>
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
            <div class="Box-body">
            <div class="blankslate">
                    <svg class="octicon octicon-pulse blankslate-icon" width="32" height="32" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M6 2c.306 0 .582.187.696.471L10 10.731l1.304-3.26A.751.751 0 0 1 12 7h3.25a.75.75 0 0 1 0 1.5H12.58l-1.855 4.64A.751.751 0 0 1 10 13a.751.751 0 0 1-.725-.529L6 3.269 4.696 6.531A.751.751 0 0 1 4 7H.75a.75.75 0 0 1 0-1.5H3.42l1.855-4.64A.751.751 0 0 1 6 2Z"/>
                    </svg>
                <h3 class="blankslate-heading">No tracking data found</h3>
                <p class="blankslate-description">No navigation tracking data is available for this report.</p>
                </div>
            </div>
            `;
        }

        return `
        <div class="Box-body p-0">
            ${sessions.map((session, index) => `
                <div class="Box-row d-flex flex-items-center position-relative" data-session-id="${session.session_id}">
                    <div class="flex-auto">
                        <div class="d-flex flex-items-start">
                            <div class="flex-auto">
                                <a href="#" class="Link--primary text-bold f4 lh-condensed" onclick="toggleSession('${session.session_id}'); return false;">
                                    ${session.test_name}
                                </a>
                                <div class="text-small color-fg-muted mt-1">
                                    <div class="d-flex flex-wrap">
                                        <span class="mr-3">
                                            <svg class="octicon octicon-file-code mr-1" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                                <path d="M4 1.75C4 .784 4.784 0 5.75 0h5.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 14.25 16h-8.5A1.75 1.75 0 0 1 4 14.25V1.75Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 10 4.25V1.5H5.75Zm6.75.062V4.25c0 .138.112.25.25.25h2.688a.252.252 0 0 0-.011-.013l-2.914-2.914a.246.246 0 0 0-.013-.011Z"/>
                                            </svg>
                                            ${session.spec_file}
                                        </span>
                                        <span class="mr-3">
                                            <svg class="octicon octicon-link mr-1" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                                <path d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z"/>
                                            </svg>
                                            ${session.navigations.length} navigations
                                        </span>
                                        <span class="mr-3">
                                            <svg class="octicon octicon-clock mr-1" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                                <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/>
                                            </svg>
                                            ${new Date(session.timestamp).toLocaleString()}
                                        </span>
                                        ${session.duration ? `
                                        <span class="mr-3">
                                            <svg class="octicon octicon-stopwatch mr-1" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                                <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/>
                                            </svg>
                                            ${Math.round(session.duration/1000)}s
                                        </span>
                                        ` : ''}
                                        ${session.username ? `
                                        <span class="mr-3">
                                            <svg class="octicon octicon-person mr-1" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                                <path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>
                                            </svg>
                                            ${session.username}
                                        </span>
                                        ` : ''}
                                        ${session.build_name ? `
                                        <span class="mr-3">
                                            <svg class="octicon octicon-tools mr-1" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                                <path d="M5.433 2.304A4.494 4.494 0 0 0 3.5 6c0 .828.22 1.626.614 2.307l-2.235 2.234a1.5 1.5 0 0 0 2.122 2.122l2.234-2.235c.681.394 1.479.614 2.307.614a4.495 4.495 0 0 0 3.696-1.933l-1.05-1.05a2.999 2.999 0 0 1-2.646 1.233 2.999 2.999 0 0 1-2.122-.878A2.999 2.999 0 0 1 5.5 6c0-.944.393-1.843 1.09-2.5l.757.757a1.5 1.5 0 0 0 2.122 0l2.121-2.122a1.5 1.5 0 0 0 0-2.121L10.88.303a1.5 1.5 0 0 0-2.121 0L7.05 2.012 5.433 2.304Z"/>
                                            </svg>
                                            ${session.build_name}
                                        </span>
                                        ` : ''}
                        </div>
                    </div>
                            </div>
                            <div class="flex-shrink-0 ml-2">
                                <div class="d-flex flex-items-center">
                                    <span class="Label Label--secondary mr-2">${framework}</span>
                        ${this.generateStatusBadge(session.status)}
                                    <button class="btn-octicon ml-2 session-chevron" type="button" onclick="toggleSession('${session.session_id}')">
                                        <svg class="octicon octicon-chevron-down" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                            <path d="M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.749.749 0 1 1 1.06-1.06L8 8.939l3.72-3.719a.749.749 0 0 1 1.06 0Z"/>
                            </svg>
                        </button>
                    </div>
                </div>
                        </div>
                    </div>
                </div>
                <div class="Details-content--hidden p-3 border-top color-border-muted" id="session-${session.session_id}">
                    ${this.generateSessionDetails(session)}
                </div>
            `).join('')}
            </div>
        `;
    }

    /**
     * Generate detailed session information with modern modular architecture
     */
    generateSessionDetails(session) {
        return `
        <div class="session-details">
            <!-- Overview Cards Grid -->
            <div class="d-flex flex-wrap gap-3 mb-4">
                ${this.generateTestOverviewCard(session)}
                ${this.generateEnvironmentCard(session)}
                ${this.generateTimingCard(session)}
            </div>
            
            <!-- Resource Actions Bar -->
            ${this.generateResourceActionsBar(session)}
            
            <!-- Navigation Timeline -->
            ${this.generateModernNavigationTimeline(session.navigations)}
        </div>
        `;
    }

    /**
     * Generate modern test overview card with key information
     */
    generateTestOverviewCard(session) {
        const metadata = session.metadataData || {};
        
        return `
        <div class="Box flex-auto" style="min-width: 320px;">
            <div class="Box-header d-flex flex-items-center">
                <div class="Box-title d-flex flex-items-center">
                    <svg class="octicon octicon-beaker mr-2 color-fg-muted" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M14.38 14.59 9.505 6.613V3.997c-.005-.318-.004-.536-.004-.997C9.501 1.342 8.158 0 6.5 0S3.499 1.342 3.499 3c0 .461.001.679-.004.997v2.616L-1.38 14.59A1.002 1.002 0 0 0 .62 16h12.76c.9 0 1.381-1.06.62-1.41ZM5.001 3c0-.546.453-.999 1-.999s1 .453 1 .999c0 .546-.453 1-1 1s-1-.454-1-1ZM2.38 14.59 6.505 7.401 10.62 14.59H2.38Z"/>
                </svg>
                    Test Overview
                </div>
                ${this.generateStatusBadge(session.status)}
            </div>
            <div class="Box-body">
                <div class="d-flex flex-column gap-3">
                ${session.session_id ? `
                    <div class="d-flex flex-items-center justify-content-between">
                        <span class="text-small color-fg-muted text-semibold">Session ID</span>
                        <span class="Label Label--accent text-mono f6">${session.session_id}</span>
                </div>
                ` : ''}
                    ${session.build_name ? `
                    <div class="d-flex flex-items-center justify-content-between">
                        <span class="text-small color-fg-muted text-semibold">Build</span>
                        <div class="d-flex flex-items-center">
                            <svg class="octicon octicon-package mr-1" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8.878.392a1.75 1.75 0 0 0-1.756 0l-5.25 3.045A1.75 1.75 0 0 0 1 4.951v6.098c0 .624.332 1.2.872 1.514l5.25 3.045a1.75 1.75 0 0 0 1.756 0l5.25-3.045c.54-.313.872-.89.872-1.514V4.951c0-.624-.332-1.2-.872-1.514L8.878.392ZM7.875 1.69a.25.25 0 0 1 .25 0l4.63 2.685L8 7.133 3.245 4.375l4.63-2.685ZM2.5 5.677v5.372c0 .09.047.171.125.216l4.625 2.683V8.432L2.5 5.677Zm6.25 8.271 4.625-2.683a.25.25 0 0 0 .125-.216V5.677L8.75 8.432v5.516Z"/>
                            </svg>
                            <span class="text-small text-semibold">${session.build_name}</span>
                        </div>
                </div>
                ` : ''}
                ${session.test_type ? `
                    <div class="d-flex flex-items-center justify-content-between">
                        <span class="text-small color-fg-muted text-semibold">Test Type</span>
                        <span class="Label Label--secondary">${session.test_type.toUpperCase()}</span>
                </div>
                ` : ''}
                    ${session.username ? `
                    <div class="d-flex flex-items-center justify-content-between">
                        <span class="text-small color-fg-muted text-semibold">Executed by</span>
                        <div class="d-flex flex-items-center">
                            <svg class="octicon octicon-person mr-1" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>
                            </svg>
                            <span class="text-small text-semibold">${session.username}</span>
                </div>
                </div>
                ` : ''}
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Generate modern environment card with platform details
     */
    generateEnvironmentCard(session) {
        const hasEnvInfo = session.platform || session.browser || session.resolution || session.geoInfo;
        if (!hasEnvInfo) return '';

        return `
        <div class="Box flex-auto" style="min-width: 320px;">
            <div class="Box-header">
                <div class="Box-title d-flex flex-items-center">
                    <svg class="octicon octicon-server mr-2 color-fg-muted" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M1.75 1h12.5c.966 0 1.75.784 1.75 1.75v4c0 .372-.116.717-.314 1 .198.283.314.628.314 1v4a1.75 1.75 0 0 1-1.75 1.75H1.75A1.75 1.75 0 0 1 0 12.75v-4c0-.372.116-.717.314-1A1.739 1.739 0 0 1 0 6.75v-4C0 1.784.784 1 1.75 1ZM1.5 2.75v4c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-4a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25Zm0 6.5v4c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-4a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM5 11.25a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm6.25-6.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm0 6.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"/>
                </svg>
                Environment
                </div>
            </div>
            <div class="Box-body">
                <div class="d-flex flex-column gap-3">
                ${session.platform ? `
                    <div class="d-flex flex-items-center justify-content-between">
                        <span class="text-small color-fg-muted text-semibold">Platform</span>
                        <div class="d-flex flex-items-center">
                            <svg class="octicon octicon-device-desktop mr-1" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M14.25 1c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 14.25 12h-3.727c.099 1.041.52 1.872 1.292 2.757A.75.75 0 0 1 11.25 16h-6.5a.75.75 0 0 1-.565-1.243c.772-.885 1.193-1.716 1.292-2.757H1.75A1.75 1.75 0 0 1 0 10.25v-7.5C0 1.784.784 1 1.75 1ZM1.75 2.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>
                            </svg>
                            <span class="Label Label--success">${session.platform.toUpperCase()}</span>
                        </div>
                </div>
                ` : ''}
                ${session.browser ? `
                    <div class="d-flex flex-items-center justify-content-between">
                        <span class="text-small color-fg-muted text-semibold">Browser</span>
                        <div class="d-flex flex-items-center">
                            <svg class="octicon octicon-globe mr-1" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM5.78 8.75a9.64 9.64 0 0 0 1.363 4.177c.255.426.542.832.857 1.215.245-.296.551-.705.857-1.215A9.64 9.64 0 0 0 10.22 8.75Zm4.44-1.5a9.64 9.64 0 0 0-1.363-4.177c-.307-.51-.612-.919-.857-1.215a9.927 9.927 0 0 0-.857 1.215A9.64 9.64 0 0 0 5.78 7.25Zm-5.944 1.5H1.543a6.507 6.507 0 0 0 4.666 5.5c-.123-.181-.24-.365-.352-.552-.715-1.192-1.437-2.874-1.581-4.948Zm-2.733-1.5h2.733c.144-2.074.866-3.756 1.58-4.948.12-.197.237-.381.353-.552a6.507 6.507 0 0 0-4.666 5.5Zm10.181 1.5c-.144 2.074-.866 3.756-1.58 4.948-.12.197-.237.381-.353.552a6.507 6.507 0 0 0 4.666-5.5Zm2.733-1.5a6.507 6.507 0 0 0-4.666-5.5c.123.181.24.365.353.552.714 1.192 1.436 2.874 1.58 4.948Z"/>
                            </svg>
                            <span class="Label Label--accent">${session.browser}${session.browser_version ? ` ${session.browser_version}` : ''}</span>
                        </div>
                </div>
                ` : ''}
                ${session.resolution ? `
                    <div class="d-flex flex-items-center justify-content-between">
                        <span class="text-small color-fg-muted text-semibold">Resolution</span>
                        <div class="d-flex flex-items-center">
                            <svg class="octicon octicon-device-desktop mr-1" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M1.75 2.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>
                            </svg>
                            <span class="text-mono text-small text-semibold">${session.resolution}</span>
                        </div>
                </div>
                ` : ''}
                ${session.geoInfo ? `
                    <div class="d-flex flex-items-center justify-content-between">
                        <span class="text-small color-fg-muted text-semibold">Location</span>
                        <div class="d-flex flex-items-center">
                            <svg class="octicon octicon-location mr-1" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                <path d="m12.596 11.596-3.535 3.536a1.5 1.5 0 0 1-2.122 0l-3.535-3.536a6.5 6.5 0 1 1 9.192-9.193 6.5 6.5 0 0 1 0 9.193Zm-1.06-8.132v-.001a5 5 0 1 0-7.072 7.072L8 14.07l3.536-3.534a5 5 0 0 0 0-7.072ZM8 9a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 9Z"/>
                            </svg>
                            <span class="text-small text-semibold">${session.geoInfo.regionName}, ${session.geoInfo.country}</span>
                        </div>
                </div>
                ` : ''}
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Generate timing and duration card
     */
    generateTimingCard(session) {
        return `
        <div class="Box flex-auto" style="min-width: 280px;">
            <div class="Box-header">
                <div class="Box-title d-flex flex-items-center">
                    <svg class="octicon octicon-clock mr-2 color-fg-muted" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/>
                    </svg>
                    Timing & Performance
                </div>
            </div>
            <div class="Box-body">
                <div class="d-flex flex-column gap-3">
                    ${session.start_timestamp ? `
                    <div class="d-flex flex-items-center justify-content-between">
                        <span class="text-small color-fg-muted text-semibold">Started</span>
                        <div class="d-flex flex-items-center">
                            <svg class="octicon octicon-calendar mr-1" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v11.5A1.75 1.75 0 0 1 13.25 17H2.75A1.75 1.75 0 0 1 1 15.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0Zm0 3.5h8.5a.25.25 0 0 1 .25.25V6h-11V3.75a.25.25 0 0 1 .25-.25H2.5v.75a.75.75 0 0 0 1.5 0V3.5Zm-2 4.25h11v7.5a.25.25 0 0 1-.25.25H2.75a.25.25 0 0 1-.25-.25v-7.5Z"/>
                            </svg>
                            <span class="text-mono text-small">${new Date(session.start_timestamp).toLocaleString()}</span>
                        </div>
                    </div>
                    ` : ''}
                    ${session.duration ? `
                    <div class="d-flex flex-items-center justify-content-between">
                        <span class="text-small color-fg-muted text-semibold">Duration</span>
                        <div class="d-flex flex-items-center">
                            <svg class="octicon octicon-stopwatch mr-1" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/>
                            </svg>
                            <span class="Label Label--attention">${Math.round(session.duration/1000)}s</span>
                        </div>
                    </div>
                    ` : ''}
                    <div class="d-flex flex-items-center justify-content-between">
                        <span class="text-small color-fg-muted text-semibold">Navigation Count</span>
                        <div class="d-flex flex-items-center">
                            <svg class="octicon octicon-iterations mr-1" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M1.5 1.75V13.5h13.75a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75V1.75a.75.75 0 0 1 1.5 0Zm14.28 2.53-5.25 5.25a.75.75 0 0 1-1.06 0L7 7.06 4.28 9.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.25-3.25a.75.75 0 0 1 1.06 0L10 7.94l4.72-4.72a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"/>
                            </svg>
                            <span class="Label Label--primary">${session.navigations.length}</span>
                        </div>
                    </div>
                    ${session.navigations.length > 0 ? `
                    <div class="d-flex flex-items-center justify-content-between">
                        <span class="text-small color-fg-muted text-semibold">Avg per Navigation</span>
                        <span class="text-mono text-small">${session.duration ? Math.round((session.duration/1000)/session.navigations.length) + 's' : 'N/A'}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Generate modern resource actions bar
     */
    generateResourceActionsBar(session) {
        const hasLinks = session.video_url || session.screenshot_url || session.console_logs_url || 
                         session.network_logs_url || session.command_logs_url || session.public_url;
        if (!hasLinks) return '';

        return `
        <div class="Box mb-4">
            <div class="Box-header d-flex flex-items-center">
                <div class="Box-title d-flex flex-items-center">
                    <svg class="octicon octicon-link mr-2 color-fg-muted" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z"/>
                </svg>
                    Resources & Actions
                </div>
                <span class="Label Label--secondary ml-2">${this.countResourceLinks(session)} resources</span>
            </div>
            <div class="Box-body">
                <div class="d-flex flex-wrap gap-2">
                ${session.public_url ? `
                    <a href="${session.public_url}" target="_blank" class="btn btn-primary">
                        <svg class="octicon mr-1" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
                    </svg>
                        View Public Report
                </a>
                ` : ''}
                    
                    <!-- Media Resources -->
                    <div class="d-flex gap-2">
                ${session.video_url ? `
                        <a href="${session.video_url}" target="_blank" class="btn btn-outline">
                            <svg class="octicon mr-1" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/>
                    </svg>
                    Video Recording
                </a>
                ` : ''}
                ${session.screenshot_url ? `
                        <a href="${session.screenshot_url}" target="_blank" class="btn btn-outline">
                            <svg class="octicon mr-1" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M0 10.5A1.5 1.5 0 0 0 1.5 12h13a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 14.5 2h-13A1.5 1.5 0 0 0 0 3.5v7ZM1.5 3.5a.5.5 0 0 1 .5-.5h12a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-12a.5.5 0 0 1-.5-.5v-7ZM13 5.25a.25.25 0 1 1-.5 0 .25.25 0 0 1 .5 0ZM4.5 7a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm4.5 4.5L6 8l-1.5 2H12l-3-2.5Z"/>
                    </svg>
                    Screenshots
                </a>
                ` : ''}
                    </div>
                    
                    <!-- Log Resources -->
                    <div class="d-flex gap-2">
                ${session.console_logs_url ? `
                        <a href="${session.console_logs_url}" target="_blank" class="btn btn-outline">
                            <svg class="octicon mr-1" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75zm1.75-.25a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25H1.75zM7.25 8a.75.75 0 0 1-.22.53l-2.25 2.25a.75.75 0 0 1-1.06-1.06L5.44 8 3.72 6.28a.75.75 0 0 1 1.06-1.06l2.25 2.25c.141.14.22.331.22.53zm1.5 1.5a.75.75 0 0 1 0-1.5h3a.75.75 0 0 1 0 1.5h-3z"/>
                    </svg>
                            Console
                </a>
                ` : ''}
                ${session.network_logs_url ? `
                        <a href="${session.network_logs_url}" target="_blank" class="btn btn-outline">
                            <svg class="octicon mr-1" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M2.5 3.5c0-.825.675-1.5 1.5-1.5h1c.825 0 1.5.675 1.5 1.5V5h1V3.5c0-.825.675-1.5 1.5-1.5h1c.825 0 1.5.675 1.5 1.5V12c0 1.38-1.12 2.5-2.5 2.5h-9C1.12 14.5 0 13.38 0 12V3.5c0-.825.675-1.5 1.5-1.5h1zM1.5 12c0 .55.45 1 1 1h9c.55 0 1-.45 1-1V6.5H1.5V12z"/>
                    </svg>
                            Network
                </a>
                ` : ''}
                ${session.command_logs_url ? `
                        <a href="${session.command_logs_url}" target="_blank" class="btn btn-outline">
                            <svg class="octicon mr-1" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M7.25 2.75a.75.75 0 0 0-1.5 0v8.5a.75.75 0 0 0 1.5 0v-3.5h3.25a.75.75 0 0 0 0-1.5H7.25v-3.5z"/>
                    </svg>
                            Commands
                </a>
                ` : ''}
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Count available resource links for a session
     */
    countResourceLinks(session) {
        let count = 0;
        if (session.public_url) count++;
        if (session.video_url) count++;
        if (session.screenshot_url) count++;
        if (session.console_logs_url) count++;
        if (session.network_logs_url) count++;
        if (session.command_logs_url) count++;
        return count;
    }

    /**
     * Generate modern navigation timeline with enhanced UX
     */
    generateModernNavigationTimeline(navigations) {
        if (!navigations || navigations.length === 0) {
            return `
            <div class="Box">
                <div class="Box-header">
                    <div class="Box-title d-flex flex-items-center">
                        <svg class="octicon octicon-git-branch mr-2 color-fg-muted" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/>
                        </svg>
                        Navigation Timeline
                    </div>
                </div>
                <div class="Box-body">
                    <div class="blankslate">
                        <svg class="octicon octicon-git-branch blankslate-icon" width="32" height="32" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/>
                        </svg>
                        <h3 class="blankslate-heading">No navigation data</h3>
                        <p class="blankslate-description">No navigation events were recorded for this test session.</p>
                    </div>
                </div>
            </div>
            `;
        }

        return `
        <div class="Box">
            <div class="Box-header d-flex flex-items-center justify-content-between">
                <div class="Box-title d-flex flex-items-center">
                    <svg class="octicon octicon-git-branch mr-2 color-fg-muted" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/>
                </svg>
                    Navigation Timeline
                </div>
                <div class="d-flex flex-items-center gap-2">
                    <span class="Label Label--primary">${navigations.length} steps</span>
                    <span class="text-small color-fg-muted">${this.calculateNavigationDuration(navigations)}</span>
                </div>
            </div>
            <div class="Box-body p-0">
                <div class="timeline-container">
                ${navigations.map((nav, index) => `
                        <div class="TimelineItem${index === navigations.length - 1 ? ' TimelineItem--last' : ''}">
                            <div class="TimelineItem-badge">
                                <div class="Timeline-Badge ${this.getNavigationBadgeClass(nav.navigation_type)}">
                                    ${index + 1}
                                </div>
                            </div>
                            <div class="TimelineItem-body">
                                <div class="TimelineItem-header">
                                    <div class="d-flex flex-items-center gap-2 flex-wrap">
                                        <span class="Label ${this.getNavigationTypeClass(nav.navigation_type)}">${nav.navigation_type}</span>
                                        <span class="text-small color-fg-muted">${this.formatTimestamp(nav.timestamp)}</span>
                                        ${nav.duration ? `<span class="Label Label--attention text-mono">${nav.duration}ms</span>` : ''}
                                    </div>
                                </div>
                                <div class="TimelineItem-content mt-2">
                                    ${this.generateNavigationFlow(nav, index)}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Generate navigation flow visualization
     */
    generateNavigationFlow(nav, index) {
        return `
        <div class="nav-flow">
                            ${nav.previous_url !== 'null' ? `
            <div class="nav-step">
                <div class="nav-step-label">
                    <svg class="octicon octicon-arrow-left mr-1" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z"/>
                    </svg>
                    From
                </div>
                <div class="nav-url-card">
                    <a href="${nav.previous_url}" target="_blank" class="nav-url-link" title="${nav.previous_url}">
                        <svg class="octicon octicon-link-external mr-1" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                            <path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z"/>
                                        </svg>
                        ${this.formatUrl(nav.previous_url)}
                    </a>
                </div>
            </div>
            <div class="nav-arrow">
                <svg class="octicon octicon-arrow-right" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L11.19 9H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.03a.75.75 0 0 1 0-1.06Z"/>
                </svg>
                                </div>
                            ` : ''}
            <div class="nav-step">
                <div class="nav-step-label">
                    <svg class="octicon octicon-arrow-right mr-1" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L11.19 9H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.03a.75.75 0 0 1 0-1.06Z"/>
                    </svg>
                    To
                </div>
                <div class="nav-url-card primary">
                    <a href="${nav.current_url}" target="_blank" class="nav-url-link" title="${nav.current_url}">
                        <svg class="octicon octicon-link-external mr-1" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z"/>
                                    </svg>
                        ${this.formatUrl(nav.current_url)}
                                </a>
                            </div>
            </div>
        </div>
        `;
    }

    /**
     * Get navigation badge class based on type
     */
    getNavigationBadgeClass(type) {
        const classMap = {
            'navigation': 'Timeline-Badge--success',
            'goto': 'Timeline-Badge--primary',
            'back': 'Timeline-Badge--attention',
            'forward': 'Timeline-Badge--done',
            'refresh': 'Timeline-Badge--severe'
        };
        return classMap[type] || 'Timeline-Badge--secondary';
    }

    /**
     * Get navigation type label class
     */
    getNavigationTypeClass(type) {
        const classMap = {
            'navigation': 'Label--success',
            'goto': 'Label--primary',
            'back': 'Label--attention',
            'forward': 'Label--done',
            'refresh': 'Label--severe'
        };
        return classMap[type] || 'Label--secondary';
    }

    /**
     * Format URL for display with smart truncation
     */
    formatUrl(url) {
        if (!url || url === 'null') return 'null';
        if (url.length <= 50) return url;
        
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;
            let path = urlObj.pathname + urlObj.search;
            
            if (path.length > 30) {
                path = path.substring(0, 27) + '...';
            }
            
            return domain + path;
        } catch {
            // If URL parsing fails, use simple truncation
            return url.substring(0, 47) + '...';
        }
    }

    /**
     * Calculate total navigation duration
     */
    calculateNavigationDuration(navigations) {
        if (!navigations || navigations.length < 2) return '';
        
        const first = new Date(navigations[0].timestamp);
        const last = new Date(navigations[navigations.length - 1].timestamp);
        const duration = last - first;
        
        if (duration < 1000) return `${duration}ms`;
        if (duration < 60000) return `${Math.round(duration/1000)}s`;
        return `${Math.round(duration/60000)}m ${Math.round((duration%60000)/1000)}s`;
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
            
            if (content.classList.contains('Details-content--hidden')) {
                content.classList.remove('Details-content--hidden');
                content.classList.add('Details-content--visible');
                chevron.classList.add('expanded');
            } else {
                content.classList.add('Details-content--hidden');
                content.classList.remove('Details-content--visible');
                chevron.classList.remove('expanded');
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

    /**
     * Generate inline sessions list with inline styles
     */
    generateInlineSessionsList(sessions, framework) {
        if (!sessions || sessions.length === 0) {
            return `
            <div style="padding: 32px; text-align: center; color: #656d76;">
                <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" style="margin-bottom: 16px;">
                    <path d="M6 2c.306 0 .582.187.696.471L10 10.731l1.304-3.26A.751.751 0 0 1 12 7h3.25a.75.75 0 0 1 0 1.5H12.58l-1.855 4.64A.751.751 0 0 1 10 13a.751.751 0 0 1-.725-.529L6 3.269 4.696 6.531A.751.751 0 0 1 4 7H.75a.75.75 0 0 1 0-1.5H3.42l1.855-4.64A.751.751 0 0 1 6 2Z"/>
                </svg>
                <h3 style="margin-bottom: 8px;">No tracking data found</h3>
                <p>No navigation tracking data is available for this report.</p>
            </div>
            `;
        }

        return sessions.map((session, index) => `
            <div style="border-bottom: 1px solid var(--color-border-default); padding: 16px;" data-session-id="${session.session_id}">
                <div style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;" onclick="toggleSession('${session.session_id}')">
                    <div style="flex: 1;">
                        <div style="font-size: 16px; font-weight: 600; color: var(--color-accent-fg); margin-bottom: 8px;">
                            ${session.test_name}
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 16px; font-size: 12px; color: var(--color-fg-muted);">
                            <span style="display: flex; align-items: center;">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 4px;">
                                    <path d="M4 1.75C4 .784 4.784 0 5.75 0h5.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 14.25 16h-8.5A1.75 1.75 0 0 1 4 14.25V1.75Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 10 4.25V1.5H5.75Zm6.75.062V4.25c0 .138.112.25.25.25h2.688a.252.252 0 0 0-.011-.013l-2.914-2.914a.246.246 0 0 0-.013-.011Z"/>
                                </svg>
                                ${session.spec_file}
                            </span>
                            <span style="display: flex; align-items: center;">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 4px;">
                                    <path d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z"/>
                                </svg>
                                ${session.navigations.length} navigations
                            </span>
                            <span style="display: flex; align-items: center;">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 4px;">
                                    <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/>
                                </svg>
                                ${new Date(session.timestamp).toLocaleString()}
                            </span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="background: var(--color-success-subtle); border: 1px solid var(--color-success-emphasis); border-radius: 12px; padding: 2px 8px; font-size: 12px; font-weight: 500; color: var(--color-success-emphasis);">✓ ${session.status || 'completed'}</span>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="transition: transform 0.2s ease;" class="chevron-${session.session_id}">
                            <path d="M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.749.749 0 1 1 1.06-1.06L8 8.939l3.72-3.719a.749.749 0 0 1 1.06 0Z"/>
                        </svg>
                    </div>
                </div>
                <div id="session-${session.session_id}" style="display: none; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--color-border-default);">
                    ${this.generateInlineSessionDetails(session)}
                </div>
            </div>
        `).join('');
    }

    /**
     * Generate inline session details with inline styles
     */
    generateInlineSessionDetails(session) {
        return `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 24px;">
            <!-- Test Overview -->
            <div style="background: var(--color-canvas-subtle); border: 1px solid var(--color-border-default); border-radius: 6px; padding: 16px;">
                <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; color: var(--color-fg-default);">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 8px;">
                        <path d="M14.38 14.59 9.505 6.613V3.997c-.005-.318-.004-.536-.004-.997C9.501 1.342 8.158 0 6.5 0S3.499 1.342 3.499 3c0 .461.001.679-.004.997v2.616L-1.38 14.59A1.002 1.002 0 0 0 .62 16h12.76c.9 0 1.381-1.06.62-1.41ZM5.001 3c0-.546.453-.999 1-.999s1 .453 1 .999c0 .546-.453 1-1 1s-1-.454-1-1ZM2.38 14.59 6.505 7.401 10.62 14.59H2.38Z"/>
                    </svg>
                    Test Overview
                </h4>
                ${session.session_id ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px;">
                    <span style="color: var(--color-fg-muted); font-weight: 500;">Session ID</span>
                    <span style="color: var(--color-fg-default); font-weight: 600; font-family: monospace;">${session.session_id}</span>
                </div>
                ` : ''}
                ${session.build_name ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px;">
                    <span style="color: var(--color-fg-muted); font-weight: 500;">Build</span>
                    <span style="color: var(--color-fg-default); font-weight: 600;">${session.build_name}</span>
                </div>
                ` : ''}
                ${session.username ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px;">
                    <span style="color: var(--color-fg-muted); font-weight: 500;">Executed by</span>
                    <span style="color: var(--color-fg-default); font-weight: 600;">${session.username}</span>
                </div>
                ` : ''}
            </div>

            <!-- Environment -->
            ${session.platform || session.browser ? `
            <div style="background: var(--color-canvas-subtle); border: 1px solid var(--color-border-default); border-radius: 6px; padding: 16px;">
                <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; color: var(--color-fg-default);">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 8px;">
                        <path d="M1.75 1h12.5c.966 0 1.75.784 1.75 1.75v4c0 .372-.116.717-.314 1 .198.283.314.628.314 1v4a1.75 1.75 0 0 1-1.75 1.75H1.75A1.75 1.75 0 0 1 0 12.75v-4c0-.372.116-.717.314-1A1.739 1.739 0 0 1 0 6.75v-4C0 1.784.784 1 1.75 1ZM1.5 2.75v4c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-4a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25Zm0 6.5v4c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-4a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM5 11.25a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm6.25-6.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm0 6.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"/>
                    </svg>
                    Environment
                </h4>
                ${session.platform ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px;">
                    <span style="color: var(--color-fg-muted); font-weight: 500;">Platform</span>
                    <span style="color: var(--color-fg-default); font-weight: 600;">${session.platform}</span>
                </div>
                ` : ''}
                ${session.browser ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px;">
                    <span style="color: var(--color-fg-muted); font-weight: 500;">Browser</span>
                    <span style="color: var(--color-fg-default); font-weight: 600;">${session.browser}${session.browser_version ? ` ${session.browser_version}` : ''}</span>
                </div>
                ` : ''}
                ${session.resolution ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px;">
                    <span style="color: var(--color-fg-muted); font-weight: 500;">Resolution</span>
                    <span style="color: var(--color-fg-default); font-weight: 600; font-family: monospace;">${session.resolution}</span>
                </div>
                ` : ''}
            </div>
            ` : ''}

            <!-- Timing -->
            <div style="background: var(--color-canvas-subtle); border: 1px solid var(--color-border-default); border-radius: 6px; padding: 16px;">
                <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; color: var(--color-fg-default);">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 8px;">
                        <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/>
                    </svg>
                    Timing & Performance
                </h4>
                ${session.start_timestamp ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px;">
                    <span style="color: var(--color-fg-muted); font-weight: 500;">Started</span>
                    <span style="color: var(--color-fg-default); font-weight: 600; font-family: monospace;">${new Date(session.start_timestamp).toLocaleString()}</span>
                </div>
                ` : ''}
                ${session.duration ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px;">
                    <span style="color: var(--color-fg-muted); font-weight: 500;">Duration</span>
                    <span style="color: var(--color-fg-default); font-weight: 600;">${Math.round(session.duration/1000)}s</span>
                </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px;">
                    <span style="color: var(--color-fg-muted); font-weight: 500;">Navigation Count</span>
                    <span style="color: var(--color-fg-default); font-weight: 600;">${session.navigations.length}</span>
                </div>
            </div>
        </div>

        <!-- Resources -->
        ${this.generateInlineResources(session)}

        <!-- Navigation Timeline -->
        ${this.generateInlineTimeline(session.navigations)}
        `;
    }

    /**
     * Generate inline resources section
     */
    generateInlineResources(session) {
        const hasLinks = session.video_url || session.screenshot_url || session.console_logs_url || 
                         session.network_logs_url || session.command_logs_url || session.public_url;
        if (!hasLinks) return '';

        return `
        <div style="margin-bottom: 16px;">
            <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; color: var(--color-fg-default);">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 8px;">
                    <path d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z"/>
                </svg>
                Resources & Actions
            </h4>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                ${session.public_url ? `
                <a href="${session.public_url}" target="_blank" style="background: var(--color-success-emphasis); border: 1px solid var(--color-success-emphasis); border-radius: 6px; padding: 6px 12px; font-size: 12px; color: var(--color-fg-on-emphasis); text-decoration: none; display: inline-flex; align-items: center;">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 4px;">
                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
                    </svg>
                    View Public Report
                </a>
                ` : ''}
                ${session.video_url ? `
                <a href="${session.video_url}" target="_blank" style="background: var(--color-btn-bg); border: 1px solid var(--color-btn-border); border-radius: 6px; padding: 6px 12px; font-size: 12px; color: var(--color-fg-default); text-decoration: none; display: inline-flex; align-items: center;">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 4px;">
                        <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/>
                    </svg>
                    Video Recording
                </a>
                ` : ''}
                ${session.console_logs_url ? `
                <a href="${session.console_logs_url}" target="_blank" style="background: var(--color-btn-bg); border: 1px solid var(--color-btn-border); border-radius: 6px; padding: 6px 12px; font-size: 12px; color: var(--color-fg-default); text-decoration: none; display: inline-flex; align-items: center;">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 4px;">
                        <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75zm1.75-.25a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25H1.75zM7.25 8a.75.75 0 0 1-.22.53l-2.25 2.25a.75.75 0 0 1-1.06-1.06L5.44 8 3.72 6.28a.75.75 0 0 1 1.06-1.06l2.25 2.25c.141.14.22.331.22.53zm1.5 1.5a.75.75 0 0 1 0-1.5h3a.75.75 0 0 1 0 1.5h-3z"/>
                    </svg>
                    Console Logs
                </a>
                ` : ''}
            </div>
        </div>
        `;
    }

    /**
     * Generate inline timeline
     */
    generateInlineTimeline(navigations) {
        if (!navigations || navigations.length === 0) {
            return `
            <div style="background: #ffffff; border: 1px solid #d0d7de; border-radius: 6px; padding: 16px;">
                <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center;">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 8px;">
                        <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/>
                    </svg>
                    Navigation Timeline
                </h4>
                <div style="text-align: center; color: #656d76; padding: 16px;">
                    <p>No navigation events were recorded for this test session.</p>
                </div>
            </div>
            `;
        }

        return `
        <div style="background: var(--color-canvas-default); border: 1px solid var(--color-border-default); border-radius: 6px; padding: 16px;">
            <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; color: var(--color-fg-default);">
                <span style="display: flex; align-items: center;">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 8px;">
                        <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/>
                    </svg>
                    Navigation Timeline
                </span>
                <span style="background: var(--color-accent-emphasis); color: var(--color-fg-on-emphasis); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">${navigations.length} steps</span>
            </h4>
            ${navigations.map((nav, index) => `
                <div style="display: flex; margin-bottom: 16px; position: relative;">
                    ${index < navigations.length - 1 ? `
                    <div style="position: absolute; left: 15px; top: 32px; bottom: -16px; width: 2px; background: var(--color-border-default);"></div>
                    ` : ''}
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--color-accent-emphasis); color: var(--color-fg-on-emphasis); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; margin-right: 16px; flex-shrink: 0; border: 3px solid var(--color-canvas-default); position: relative; z-index: 1;">
                        ${index + 1}
                    </div>
                    <div style="flex: 1;">
                        <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">
                            <span style="background: var(--color-success-subtle); border: 1px solid var(--color-success-emphasis); border-radius: 12px; padding: 2px 8px; font-size: 12px; font-weight: 500; color: var(--color-success-emphasis); margin-right: 8px;">${nav.navigation_type}</span>
                            <span style="font-size: 12px; color: var(--color-fg-muted);">${this.formatTimestamp(nav.timestamp)}</span>
                        </div>
                        <div style="margin-top: 8px;">
                            ${nav.previous_url !== 'null' ? `
                            <div style="margin-bottom: 8px;">
                                <div style="font-size: 10px; color: var(--color-fg-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; font-weight: 600;">FROM</div>
                                <div style="background: var(--color-canvas-subtle); border: 1px solid var(--color-border-default); border-radius: 6px; padding: 12px;">
                                    <a href="${nav.previous_url}" target="_blank" style="color: var(--color-fg-default); text-decoration: none; font-family: monospace; font-size: 12px; word-break: break-all;">
                                        ${this.formatUrl(nav.previous_url)}
                                    </a>
                                </div>
                            </div>
                            ` : ''}
                            <div>
                                <div style="font-size: 10px; color: var(--color-fg-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; font-weight: 600;">TO</div>
                                <div style="background: var(--color-accent-subtle); border: 1px solid var(--color-accent-emphasis); border-radius: 6px; padding: 12px;">
                                    <a href="${nav.current_url}" target="_blank" style="color: var(--color-fg-default); text-decoration: none; font-family: monospace; font-size: 12px; word-break: break-all;">
                                        ${this.formatUrl(nav.current_url)}
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
        `;
    }

    /**
     * Get simple JavaScript for basic functionality
     */
    getSimpleJavaScript() {
        return `
    <script>
        // Initialize theme from localStorage or default to light
        document.addEventListener('DOMContentLoaded', function() {
            const savedTheme = localStorage.getItem('theme') || 'light';
            setTheme(savedTheme);
            
            // Setup theme toggle button
            const themeToggle = document.getElementById('theme-toggle');
            if (themeToggle) {
                themeToggle.addEventListener('click', toggleTheme);
            }
        });

        function toggleSession(sessionId) {
            const content = document.getElementById('session-' + sessionId);
            const chevron = document.querySelector('.chevron-' + sessionId);
            
            if (content.style.display === 'none') {
                content.style.display = 'block';
                chevron.style.transform = 'rotate(180deg)';
            } else {
                content.style.display = 'none';
                chevron.style.transform = 'rotate(0deg)';
            }
        }

        function toggleTheme() {
            const html = document.documentElement;
            const currentTheme = html.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            setTheme(newTheme);
        }

        function setTheme(theme) {
            const html = document.documentElement;
            html.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
            
            // Update theme toggle icons
            const lightIcon = document.querySelector('.theme-icon-light');
            const darkIcon = document.querySelector('.theme-icon-dark');
            
            if (theme === 'dark') {
                if (lightIcon) lightIcon.style.display = 'none';
                if (darkIcon) darkIcon.style.display = 'block';
            } else {
                if (lightIcon) lightIcon.style.display = 'block';
                if (darkIcon) darkIcon.style.display = 'none';
            }
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', function(event) {
            // Ctrl/Cmd + Shift + T for theme toggle
            if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'T') {
                event.preventDefault();
                toggleTheme();
            }
        });
    </script>
        `;
    }
}

module.exports = { EnhancedHtmlReporter }; 