/**
 * Utilidades compartidas del sistema VX200 Controller
 */
const { VALIDATION, ERROR_MESSAGES } = require('./constants');

/**
 * Delay/pausa universal
 * @param {number} ms - Milisegundos a esperar
 * @returns {Promise}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validar número de teléfono
 * @param {string} phoneNumber - Número a validar
 * @returns {Object} Resultado de validación
 */
function validatePhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
        return {
            valid: false,
            message: 'Número requerido'
        };
    }

    // Remover espacios y caracteres especiales excepto números
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (cleanNumber.length < VALIDATION.MIN_PHONE_LENGTH) {
        return {
            valid: false,
            message: `Número debe tener al menos ${VALIDATION.MIN_PHONE_LENGTH} dígitos`
        };
    }

    if (!/^[0-9]+$/.test(cleanNumber)) {
        return {
            valid: false,
            message: 'Solo se permiten números'
        };
    }

    return {
        valid: true,
        number: cleanNumber,
        message: 'Número válido'
    };
}

/**
 * Validar duración de grabación
 * @param {number} duration - Duración en segundos
 * @returns {Object} Resultado de validación
 */
function validateRecordingDuration(duration) {
    if (typeof duration !== 'number' || duration < VALIDATION.MIN_RECORDING_DURATION || duration > VALIDATION.MAX_RECORDING_DURATION) {
        return {
            valid: false,
            message: `Duración debe estar entre ${VALIDATION.MIN_RECORDING_DURATION} y ${VALIDATION.MAX_RECORDING_DURATION} segundos`
        };
    }

    return {
        valid: true,
        duration: duration,
        message: 'Duración válida'
    };
}

/**
 * Formatear timestamp para logs
 * @param {Date} date - Fecha a formatear
 * @returns {string} Timestamp formateado
 */
function formatTimestamp(date = new Date()) {
    return date.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Limpiar texto para TTS (remover caracteres especiales)
 * @param {string} text - Texto a limpiar
 * @returns {string} Texto limpio
 */
function sanitizeTextForTTS(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    return text
        .replace(/[<>]/g, '') // Remover caracteres HTML
        .replace(/[{}]/g, '') // Remover llaves
        .replace(/\s+/g, ' ') // Normalizar espacios
        .trim()
        .substring(0, 500); // Limitar longitud
}

/**
 * Validar volumen de audio
 * @param {number} volume - Volumen (0.0 - 1.0)
 * @returns {number} Volumen válido
 */
function validateVolume(volume) {
    if (typeof volume !== 'number') {
        return 0.7; // Valor por defecto
    }
    return Math.max(0.0, Math.min(1.0, volume));
}

/**
 * Generar ID único para sesiones
 * @returns {string} ID único
 */
function generateSessionId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Validar configuración de módulo
 * @param {Object} config - Configuración a validar
 * @param {Array} requiredFields - Campos requeridos
 * @returns {Object} Resultado de validación
 */
function validateModuleConfig(config, requiredFields = []) {
    const errors = [];

    if (!config || typeof config !== 'object') {
        return {
            valid: false,
            errors: ['Configuración requerida']
        };
    }

    for (const field of requiredFields) {
        if (!(field in config)) {
            errors.push(`Campo requerido: ${field}`);
        }
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

/**
 * Safe JSON parse
 * @param {string} jsonString - String JSON a parsear
 * @param {*} defaultValue - Valor por defecto si falla
 * @returns {*} Objeto parseado o valor por defecto
 */
function safeJSONParse(jsonString, defaultValue = null) {
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.warn('Error parsing JSON:', error.message);
        return defaultValue;
    }
}

/**
 * Throttle function calls
 * @param {Function} func - Función a throttle
 * @param {number} limit - Límite en ms
 * @returns {Function} Función throttled
 */
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Crear logger con prefijo - MIGRATED TO NEW LOGGING SYSTEM
 * @param {string} prefix - Prefijo para logs
 * @returns {Object} Logger con métodos
 */
function createLogger(prefix) {
    const { createLogger: newLoggerFactory } = require('./logging/Logger');
    return newLoggerFactory(prefix);
}

module.exports = {
    delay,
    validatePhoneNumber,
    validateRecordingDuration,
    formatTimestamp,
    sanitizeTextForTTS,
    validateVolume,
    generateSessionId,
    validateModuleConfig,
    safeJSONParse,
    throttle,
    createLogger
};