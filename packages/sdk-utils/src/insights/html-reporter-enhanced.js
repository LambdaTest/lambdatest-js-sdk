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
     * Normalize session data
     */
    normalizeSession(session, framework) {
        const normalized = {
            session_id: session.session_id || session.metadata?.session_id || `session_${Date.now()}`,
            spec_file: session.spec_file || session.metadata?.spec_file || 'unknown.spec.js',
            test_name: session.test_name || session.metadata?.name || 'Unknown Test',
            timestamp: session.timestamp || new Date().toISOString(),
            framework: framework,
            navigations: [],
            metadata: session.metadata || {},
            duration: 0,
            status: 'completed'
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
        }
        
        .session-meta {
            display: flex;
            gap: 16px;
            font-size: 14px;
            color: var(--color-fg-muted);
        }
        
        .navigation-item {
            display: flex;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid var(--color-border-muted);
        }
        
        .nav-type-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
            margin-right: 12px;
            min-width: 80px;
            text-align: center;
        }
        
        .nav-type-navigation { background: var(--color-success-subtle); color: var(--color-success-fg); }
        .nav-type-goto { background: var(--color-accent-subtle); color: var(--color-accent-fg); }
        .nav-type-back { background: var(--color-attention-subtle); color: var(--color-attention-fg); }
        .nav-type-forward { background: var(--color-done-subtle); color: var(--color-done-fg); }
        .nav-type-refresh { background: var(--color-severe-subtle); color: var(--color-severe-fg); }
        
        .nav-urls {
            flex: 1;
            display: flex;
            align-items: center;
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
            font-size: 13px;
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
            max-height: 1000px;
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
            
            .nav-urls {
                flex-direction: column;
                align-items: flex-start;
                gap: 4px;
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
                        </div>
                    </div>
                    <div>
                        <span class="Label Label--secondary">${framework}</span>
                        <button class="btn btn-sm btn-invisible" type="button">
                            <svg class="octicon session-chevron" width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                                <path d="M6 8.825c-.2 0-.4-.1-.5-.2L1.275 4.4c-.3-.3-.3-.8 0-1.1s.8-.3 1.1 0L6 6.925 9.625 3.3c.3-.3.8-.3 1.1 0s.3.8 0 1.1L6.5 8.625c-.1.1-.3.2-.5.2z"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="collapsible-content" id="session-${session.session_id}">
                    ${this.generateNavigationsList(session.navigations)}
                </div>
            </div>
        `).join('');
    }

    /**
     * Generate navigations list for a session
     */
    generateNavigationsList(navigations) {
        if (!navigations || navigations.length === 0) {
            return '<p class="text-muted p-3">No navigation data available</p>';
        }

        return `
        <div class="pt-3">
            ${navigations.map((nav, index) => `
                <div class="navigation-item">
                    <span class="nav-type-badge nav-type-${nav.navigation_type.replace(/[^a-z]/gi, '')}">${nav.navigation_type}</span>
                    <div class="nav-urls">
                        <div class="url-box" title="${nav.previous_url}">${this.truncateUrl(nav.previous_url)}</div>
                        <span class="url-arrow">→</span>
                        <div class="url-box" title="${nav.current_url}">${this.truncateUrl(nav.current_url)}</div>
                    </div>
                    <div class="nav-timestamp">${this.formatTimestamp(nav.timestamp)}</div>
                </div>
            `).join('')}
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