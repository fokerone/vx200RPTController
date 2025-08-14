// Config será importado dinámicamente para evitar dependencia circular
const moment = require('moment-timezone');

/**
 * Sistema de Logging Profesional para VX200
 * 
 * Niveles de logging:
 * - ERROR: Solo errores críticos
 * - WARN: Advertencias importantes
 * - INFO: Información del sistema (inicio, DTMF, módulos)
 * - DEBUG: Información detallada (solo en desarrollo)
 * 
 * Sin emojis, formato limpio para consolas Linux
 */
class Logger {
    constructor(module = '') {
        this.module = module;
        this.logLevel = this.getLogLevel();
        this.showTimestamp = true;
        this.colors = {
            reset: '\x1b[0m',
            red: '\x1b[31m',
            yellow: '\x1b[33m',
            green: '\x1b[32m',
            blue: '\x1b[34m',
            cyan: '\x1b[36m',
            gray: '\x1b[90m'
        };
    }

    getLogLevel() {
        // Evitar dependencia circular - usar variable de entorno como fallback
        const configLevel = process.env.LOG_LEVEL || 'info';
        const levels = { error: 0, warn: 1, info: 2, debug: 3 };
        return levels[configLevel.toLowerCase()] || 2;
    }

    formatMessage(level, message, ...args) {
        const timestamp = this.showTimestamp ? 
            `${moment().tz('America/Argentina/Mendoza').format('YYYY-MM-DD HH:mm:ss')} ` : '';
        
        const moduleStr = this.module ? `${this.module} ` : '';
        const levelStr = `[${level.toUpperCase()}]`;
        
        // Formatear argumentos adicionales
        const fullMessage = args.length > 0 ? 
            `${message} ${args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ')}` : message;
        
        return `${timestamp}${levelStr} ${moduleStr}${fullMessage}`;
    }

    formatMessageForPanel(level, message, ...args) {
        // Para el panel web, formato más simple sin timestamp detallado
        const moduleStr = this.module ? `${this.module} ` : '';
        const fullMessage = args.length > 0 ? 
            `${message} ${args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ')}` : message;
        
        return `${moduleStr}${fullMessage}`;
    }

    shouldLog(level) {
        const levels = { error: 0, warn: 1, info: 2, debug: 3 };
        return levels[level] <= this.logLevel;
    }

    error(message, ...args) {
        if (!this.shouldLog('error')) return;
        
        const formatted = this.formatMessage('ERROR', message, ...args);
        console.error(`${this.colors.red}${formatted}${this.colors.reset}`);
        
        // Enviar al panel web si está disponible
        this.sendToPanel('error', this.formatMessageForPanel('ERROR', message, ...args));
    }

    warn(message, ...args) {
        if (!this.shouldLog('warn')) return;
        
        const formatted = this.formatMessage('WARN', message, ...args);
        console.warn(`${this.colors.yellow}${formatted}${this.colors.reset}`);
        
        this.sendToPanel('warning', this.formatMessageForPanel('WARN', message, ...args));
    }

    info(message, ...args) {
        if (!this.shouldLog('info')) return;
        
        const formatted = this.formatMessage('INFO', message, ...args);
        console.log(`${this.colors.green}${formatted}${this.colors.reset}`);
        
        this.sendToPanel('info', this.formatMessageForPanel('INFO', message, ...args));
    }

    debug(message, ...args) {
        if (!this.shouldLog('debug')) return;
        
        const formatted = this.formatMessage('DEBUG', message, ...args);
        console.log(`${this.colors.gray}${formatted}${this.colors.reset}`);
        
        // Debug no se envía al panel por defecto
    }

    // Métodos especiales para eventos importantes
    system(message, ...args) {
        if (!this.shouldLog('info')) return;
        
        const formatted = this.formatMessage('SYSTEM', message, ...args);
        console.log(`${this.colors.cyan}${formatted}${this.colors.reset}`);
        
        this.sendToPanel('system', this.formatMessageForPanel('SYSTEM', message, ...args));
    }

    dtmf(sequence, module) {
        if (!this.shouldLog('info')) return;
        
        const message = `DTMF detected: ${sequence} -> ${module}`;
        const formatted = this.formatMessage('DTMF', message);
        console.log(`${this.colors.blue}${formatted}${this.colors.reset}`);
        
        this.sendToPanel('dtmf', this.formatMessageForPanel('DTMF', message));
    }

    module(moduleName, status, details = '') {
        if (!this.shouldLog('info')) return;
        
        const message = `Module ${moduleName}: ${status}${details ? ' - ' + details : ''}`;
        const formatted = this.formatMessage('MODULE', message);
        console.log(`${this.colors.green}${formatted}${this.colors.reset}`);
        
        this.sendToPanel('module', this.formatMessageForPanel('MODULE', message));
    }

    // Enviar logs al panel web (si está disponible)
    sendToPanel(level, message) {
        if (global.webServer && global.webServer.broadcastLog) {
            global.webServer.broadcastLog(level, message);
        }
    }

    // Método para logs sin formato (para banners, etc.)
    raw(message) {
        console.log(message);
    }
}

/**
 * Factory para crear loggers consistentes
 */
function createLogger(module = '') {
    return new Logger(module);
}

/**
 * Logger principal del sistema
 */
const systemLogger = new Logger('[SYSTEM]');

module.exports = {
    Logger,
    createLogger,
    systemLogger
};