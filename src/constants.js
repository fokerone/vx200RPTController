/**
 * Constantes del sistema VX200 Controller
 */

// DTMF Decoder Constants
const DTMF = {
    WINDOW_SIZE: 1024,
    THRESHOLD: 0.05,
    REQUIRED_COUNT: 3,
    MIN_SIGNAL_LEVEL: 0.02,
    MAX_NOISE_LEVEL: 0.1,
    CLEANUP_INTERVAL: 3000,
    TIMEOUT: 2000,
    
    FREQUENCIES: {
        LOW: [697, 770, 852, 941],
        HIGH: [1209, 1336, 1477, 1633]
    },
    
    MATRIX: [
        ['1', '2', '3', 'A'],
        ['4', '5', '6', 'B'], 
        ['7', '8', '9', 'C'],
        ['*', '0', '#', 'D']
    ]
};

// Audio Constants
const AUDIO = {
    SAMPLE_RATE: 48000,
    CHANNELS: 1,
    BIT_DEPTH: 16,
    DEVICE: 'default', // Use default ALSA device
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

// SMS States
const SMS_STATES = {
    IDLE: 'idle',
    GETTING_NUMBER: 'getting_number',
    RECORDING_MESSAGE: 'recording_message',
    CONFIRMING: 'confirming'
};

// Time Constants
const DELAYS = {
    SHORT: 100,
    MEDIUM: 500,
    LONG: 1000,
    VERY_LONG: 3000
};

// Network Constants
const NETWORK = {
    DEFAULT_PORT: 3000,
    DEFAULT_HOST: '0.0.0.0',
    MAX_LOG_ENTRIES: 100,
    SIGNAL_BROADCAST_THROTTLE: 100
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
    MAX_SMS_LENGTH: 160,
    MAX_RECORDING_DURATION: 30,
    MIN_RECORDING_DURATION: 5
};

// Error Messages
const ERROR_MESSAGES = {
    AUDIO_MANAGER_NOT_AVAILABLE: 'AudioManager no está disponible',
    API_KEY_NOT_CONFIGURED: 'API Key no configurada',
    MODULE_DISABLED: 'Módulo deshabilitado',
    INVALID_PHONE_NUMBER: 'Número de teléfono inválido',
    RECORDING_ERROR: 'Error durante la grabación',
    TRANSMISSION_ERROR: 'Error en la transmisión',
    CHANNEL_BUSY: 'Canal ocupado - Esperando...'
};

module.exports = {
    DTMF,
    AUDIO,
    ROGER_BEEP,
    MODULE_STATES,
    SMS_STATES,
    DELAYS,
    NETWORK,
    WEB_SERVER,
    VALIDATION,
    ERROR_MESSAGES
};