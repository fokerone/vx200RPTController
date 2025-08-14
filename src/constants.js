/**
 * Constantes del sistema VX200 Controller
 */

const DTMF = {
    TIMEOUT: 2000  // Timeout para secuencias DTMF (2s para capturar secuencias de 3 dígitos)
};

// Audio Constants - DEPRECATED: Use Config.audio instead
// Mantenidas por compatibilidad hasta completar la migración
const AUDIO = {
    SAMPLE_RATE: 48000,
    CHANNELS: 1,
    BIT_DEPTH: 16,
    DEVICE: 'default',
    CHANNEL_THRESHOLD: 0.02,
    SUSTAIN_TIME: 1000,
    TRANSMISSION_DELAY: 500,
    MAX_WAIT_TIME: 30000
};

// Roger Beep Constants
const ROGER_BEEP = {
    KENWOOD_FREQUENCIES: [1500, 1200, 1000],
    DEFAULT_VOLUME: 0.7,
    DEFAULT_DURATION: 250,
    DEFAULT_DELAY: 100,
    MIN_VOLUME: 0.1,
    MAX_VOLUME: 1.0,
    MIN_DURATION: 50,
    MAX_DURATION: 1000
};

// Module States
const MODULE_STATES = {
    IDLE: 'idle',
    ACTIVE: 'active',
    ERROR: 'error',
    DISABLED: 'disabled'
};

// Time Constants
const DELAYS = {
    SHORT: 100,
    MEDIUM: 500,
    LONG: 1000,
    VERY_LONG: 3000
};

// Web Server Constants
const WEB_SERVER = {
    DEFAULT_PORT: 3000,
    DEFAULT_HOST: '0.0.0.0',
    DEFAULT_ORIGINS: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    MAX_CONNECTIONS: 100,
    MAX_BUFFER_SIZE: 1024 * 100, // 100KB
    MAX_JSON_SIZE: '10mb',
    PING_TIMEOUT: 60000,
    PING_INTERVAL: 25000,
    SIGNAL_THROTTLE_MS: 100,
    REQUEST_TIMEOUT: 30000,
    RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutos
    RATE_LIMIT_MAX: 100 // 100 requests por ventana
};

// Validation Constants
const VALIDATION = {
    MIN_PHONE_LENGTH: 8,
    MAX_RECORDING_DURATION: 30,
    MIN_RECORDING_DURATION: 5
};

module.exports = {
    DTMF,
    AUDIO,
    ROGER_BEEP,
    MODULE_STATES,
    DELAYS,
    WEB_SERVER,
    VALIDATION
};