/**
 * Logger utility for URL Tracker with teal color and logo prefix
 */

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    teal: '\x1b[36m',
    brightTeal: '\x1b[96m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    gray: '\x1b[90m'
};

// Logo using Unicode characters to represent the LambdaTest logo
const LOGO = '🔗'; // Chain link emoji as a simple representation

class UrlTrackerLogger {
    constructor() {
        this.prefix = `${colors.teal}${LOGO} URL Tracker${colors.reset}`;
        this.isColorSupported = this.checkColorSupport();
    }

    /**
     * Check if the terminal supports colors
     */
    checkColorSupport() {
        // Check if we're in a terminal that supports colors
        if (typeof process !== 'undefined' && process.stdout && process.stdout.isTTY) {
            return true;
        }
        
        // Check for common CI environments that support colors
        if (typeof process !== 'undefined' && process.env) {
            const { FORCE_COLOR, NO_COLOR, TERM, CI } = process.env;
            
            if (NO_COLOR) return false;
            if (FORCE_COLOR) return true;
            if (TERM && TERM !== 'dumb') return true;
            if (CI && (CI === 'true' || CI === '1')) return true;
        }
        
        return false;
    }

    /**
     * Format message with color and prefix
     */
    formatMessage(level, message, color = colors.teal) {
        const timestamp = new Date().toISOString().substring(11, 23); // HH:mm:ss.SSS
        const timeColor = colors.gray;
        
        if (this.isColorSupported) {
            return `${this.prefix} ${timeColor}[${timestamp}]${colors.reset} ${color}${message}${colors.reset}`;
        } else {
            return `🔗 URL Tracker [${timestamp}] ${message}`;
        }
    }

    /**
     * Log info message in teal
     */
    info(message) {
        console.log(this.formatMessage('info', message, colors.teal));
    }

    /**
     * Log success message in bright teal
     */
    success(message) {
        console.log(this.formatMessage('success', message, colors.brightTeal));
    }

    /**
     * Log warning message in yellow
     */
    warn(message) {
        console.warn(this.formatMessage('warn', message, colors.yellow));
    }

    /**
     * Log error message in red
     */
    error(message) {
        console.error(this.formatMessage('error', message, colors.red));
    }

    /**
     * Log debug message in gray (only if debug is enabled)
     */
    debug(message, debugEnabled = false) {
        if (debugEnabled || process.env.DEBUG_URL_TRACKER) {
            console.log(this.formatMessage('debug', message, colors.gray));
        }
    }

    /**
     * Log API upload related messages with special formatting
     */
    apiUpload(message) {
        const apiPrefix = `${colors.brightTeal}API Upload:${colors.reset}`;
        console.log(this.formatMessage('api', `${apiPrefix} ${message}`, colors.teal));
    }

    /**
     * Log navigation related messages
     */
    navigation(message) {
        const navPrefix = `${colors.brightTeal}Navigation:${colors.reset}`;
        console.log(this.formatMessage('nav', `${navPrefix} ${message}`, colors.teal));
    }

    /**
     * Log initialization messages
     */
    init(message) {
        const initPrefix = `${colors.brightTeal}Init:${colors.reset}`;
        console.log(this.formatMessage('init', `${initPrefix} ${message}`, colors.teal));
    }

    /**
     * Log cleanup messages
     */
    cleanup(message) {
        const cleanupPrefix = `${colors.brightTeal}Cleanup:${colors.reset}`;
        console.log(this.formatMessage('cleanup', `${cleanupPrefix} ${message}`, colors.teal));
    }

    /**
     * Log export messages
     */
    export(message) {
        const exportPrefix = `${colors.brightTeal}Export:${colors.reset}`;
        console.log(this.formatMessage('export', `${exportPrefix} ${message}`, colors.teal));
    }

    /**
     * Log metadata messages
     */
    metadata(message) {
        const metadataPrefix = `${colors.brightTeal}Metadata:${colors.reset}`;
        console.log(this.formatMessage('metadata', `${metadataPrefix} ${message}`, colors.teal));
    }

    /**
     * Create a child logger with a specific context
     */
    child(context) {
        return new ContextLogger(this, context);
    }
}

/**
 * Context logger for specific components
 */
class ContextLogger {
    constructor(parentLogger, context) {
        this.parent = parentLogger;
        this.context = context;
    }

    _formatWithContext(message) {
        return `[${this.context}] ${message}`;
    }

    info(message) {
        this.parent.info(this._formatWithContext(message));
    }

    success(message) {
        this.parent.success(this._formatWithContext(message));
    }

    warn(message) {
        this.parent.warn(this._formatWithContext(message));
    }

    error(message) {
        this.parent.error(this._formatWithContext(message));
    }

    debug(message, debugEnabled = false) {
        this.parent.debug(this._formatWithContext(message), debugEnabled);
    }

    apiUpload(message) {
        this.parent.apiUpload(this._formatWithContext(message));
    }

    navigation(message) {
        this.parent.navigation(this._formatWithContext(message));
    }

    init(message) {
        this.parent.init(this._formatWithContext(message));
    }

    cleanup(message) {
        this.parent.cleanup(this._formatWithContext(message));
    }

    export(message) {
        this.parent.export(this._formatWithContext(message));
    }

    metadata(message) {
        this.parent.metadata(this._formatWithContext(message));
    }
}

// Create and export a singleton instance
const logger = new UrlTrackerLogger();

module.exports = {
    UrlTrackerLogger,
    logger,
    colors
}; 