/**
 * Utilidades compartidas del sistema VX200 Controller
 */

/**
 * Delay/pausa universal
 * @param {number} ms - Milisegundos a esperar
 * @returns {Promise}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

module.exports = {
    delay,
    sanitizeTextForTTS,
    validateVolume,
    throttle
};