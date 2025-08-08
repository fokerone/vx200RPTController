require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createLogger } = require('../utils');

/**
 * ConfigManager - Sistema centralizado de configuración
 * 
 * Prioridad de configuración (de mayor a menor):
 * 1. Variables de entorno (.env)
 * 2. Archivo config.json
 * 3. Valores por defecto (DEFAULT_CONFIG)
 */
class ConfigManager {
    constructor() {
        this.logger = createLogger('[ConfigManager]');
        this.config = null;
        this.loadConfiguration();
    }

    /**
     * Configuración por defecto del sistema
     */
    getDefaultConfig() {
        return {
            // ===== SISTEMA =====
            system: {
                callsign: 'VX200',
                version: '2.0',
                name: 'VX200 Controller',
                description: 'Sistema de Control para Repetidora Simplex',
                environment: 'production'
            },

            // ===== SERVIDOR WEB =====
            web: {
                port: 3000,
                host: '0.0.0.0',
                allowedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
                maxConnections: 100,
                maxBufferSize: 1024 * 100, // 100KB
                maxJsonSize: '10mb',
                pingTimeout: 60000,
                pingInterval: 25000,
                signalThrottleMs: 100,
                requestTimeout: 30000,
                rateLimitWindow: 15 * 60 * 1000, // 15 minutos
                rateLimitMax: 100
            },

            // ===== AUDIO =====
            audio: {
                sampleRate: 48000,
                channels: 1,
                bitDepth: 16,
                device: 'default',
                channelThreshold: 0.02,
                sustainTime: 1000,
                transmissionDelay: 500,
                maxWaitTime: 30000,
                maxRecordingDuration: 10000, // 10 segundos
                minRecordingDuration: 1000   // 1 segundo
            },

            // ===== TEXT-TO-SPEECH =====
            tts: {
                voice: 'es',
                speed: 140,
                amplitude: 50,
                timeout: 30000
            },

            // ===== ROGER BEEP =====
            rogerBeep: {
                enabled: true,
                type: 'kenwood',
                volume: 0.7,
                duration: 250,
                delay: 100,
                frequencies: [1500, 1200, 1000],
                minVolume: 0.1,
                maxVolume: 1.0,
                minDuration: 50,
                maxDuration: 1000
            },

            // ===== BALIZA =====
            baliza: {
                enabled: true,
                interval: 15, // minutos
                message: '',
                autoStart: true,
                waitForFreeChannel: true,
                tone: {
                    frequency: 1000, // Hz
                    duration: 500,   // ms
                    volume: 0.7
                },
                limits: {
                    minInterval: 1,    // minutos
                    maxInterval: 60,   // minutos
                    minFrequency: 100, // Hz
                    maxFrequency: 3000, // Hz
                    minDuration: 100,  // ms
                    maxDuration: 2000  // ms
                }
            },

            // ===== DATETIME =====
            datetime: {
                enabled: true,
                locale: 'es',
                timezone: 'America/Argentina/Buenos_Aires',
                format: {
                    date: 'dddd, DD [de] MMMM [de] YYYY',
                    time: 'HH:mm [horas]'
                }
            },

            // ===== AI CHAT =====
            aiChat: {
                enabled: false, // Se habilita solo si hay API key
                provider: 'openai',
                model: 'gpt-3.5-turbo',
                maxTokens: 150,
                temperature: 0.7,
                basePrompt: 'Eres un asistente de radio amateur. Responde de forma breve y clara en español latino.',
                recordingDuration: 10000, // ms
                timeout: 30000
            },

            // ===== SMS =====
            sms: {
                enabled: false, // Se habilita solo si hay credenciales
                provider: 'twilio',
                timeout: 30000,
                maxLength: 160,
                minPhoneLength: 8
            },

            // ===== DTMF =====
            dtmf: {
                timeout: 3000, // ms entre tonos
                bufferTimeout: 1000, // ms para completar secuencia
                validTones: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '#'],
                commands: {
                    '*1': 'datetime',
                    '*2': 'aiChat', 
                    '*3': 'sms',
                    '*9': 'baliza'
                }
            },

            // ===== DELAYS Y TIMEOUTS =====
            delays: {
                short: 100,
                medium: 500,
                long: 1000,
                veryLong: 3000,
                transmissionGap: 250
            },

            // ===== LOGGING =====
            logging: {
                level: 'info',
                toFile: false,
                filePath: './logs/vx200.log',
                maxFileSize: 10485760, // 10MB
                maxFiles: 5
            },

            // ===== SEGURIDAD =====
            security: {
                sessionSecret: 'vx200-default-secret-change-in-production',
                sessionMaxAge: 3600000, // 1 hora
                enableRateLimit: true
            },

            // ===== MONITOREO =====
            monitoring: {
                healthCheckInterval: 30000, // 30 segundos
                enableMetrics: true,
                memoryUsageThreshold: 85, // %
                cpuUsageThreshold: 80     // %
            },

            // ===== ZELLO INTEGRATION =====
            zello: {
                enabled: false,
                mode: 'bridge',
                audio: {
                    inputDevice: 'default',
                    outputDevice: 'default',
                    sampleRate: 48000,
                    channels: 1,
                    voxThreshold: 0.02,
                    voxDelay: 1000
                },
                network: {
                    channel: 'VX200-Repeater',
                    username: 'LU5MCD-RPT',
                    password: '',
                    server: 'wss://zello.com/ws'
                },
                bridge: {
                    autoConnect: true,
                    reconnectInterval: 30000,
                    maxReconnectAttempts: 10,
                    heartbeatInterval: 30000
                },
                filters: {
                    enableNoiseGate: true,
                    enableAGC: true,
                    enableEchoCancellation: false
                }
            }
        };
    }

    /**
     * Cargar configuración desde todas las fuentes
     */
    loadConfiguration() {
        try {
            // 1. Empezar con configuración por defecto
            this.config = this.getDefaultConfig();

            // 2. Cargar desde config.json si existe
            this.loadFromConfigFile();

            // 3. Sobrescribir con variables de entorno
            this.loadFromEnvironment();

            // 4. Validar configuración final
            this.validateConfiguration();

            this.logger.info('Configuración cargada exitosamente');
            this.logger.debug(`Callsign: ${this.config.system.callsign}`);
            this.logger.debug(`Puerto web: ${this.config.web.port}`);
            this.logger.debug(`Dispositivo audio: ${this.config.audio.device}`);

        } catch (error) {
            this.logger.error('Error cargando configuración:', error.message);
            this.logger.warn('Usando configuración por defecto');
            this.config = this.getDefaultConfig();
        }
    }

    /**
     * Cargar desde config.json
     */
    loadFromConfigFile() {
        const configPath = path.join(__dirname, '../../config/config.json');
        
        if (fs.existsSync(configPath)) {
            try {
                const configData = fs.readFileSync(configPath, 'utf8');
                const fileConfig = JSON.parse(configData);
                
                // Mergear configuración manteniendo estructura
                this.mergeConfig(this.config, fileConfig);
                
                this.logger.debug('Configuración cargada desde config.json');
            } catch (error) {
                this.logger.warn('Error leyendo config.json:', error.message);
            }
        } else {
            this.logger.debug('config.json no encontrado, usando defaults');
        }
    }

    /**
     * Cargar desde variables de entorno
     */
    loadFromEnvironment() {
        // Sistema
        if (process.env.CALLSIGN) this.config.system.callsign = process.env.CALLSIGN;
        if (process.env.SYSTEM_VERSION) this.config.system.version = process.env.SYSTEM_VERSION;
        if (process.env.NODE_ENV) this.config.system.environment = process.env.NODE_ENV;

        // Web Server
        if (process.env.WEB_PORT) this.config.web.port = parseInt(process.env.WEB_PORT);
        if (process.env.WEB_HOST) this.config.web.host = process.env.WEB_HOST;
        if (process.env.ALLOWED_ORIGINS) {
            this.config.web.allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');
        }

        // Audio
        if (process.env.AUDIO_DEVICE) this.config.audio.device = process.env.AUDIO_DEVICE;
        if (process.env.AUDIO_SAMPLE_RATE) this.config.audio.sampleRate = parseInt(process.env.AUDIO_SAMPLE_RATE);
        if (process.env.AUDIO_CHANNELS) this.config.audio.channels = parseInt(process.env.AUDIO_CHANNELS);
        if (process.env.AUDIO_CHANNEL_THRESHOLD) this.config.audio.channelThreshold = parseFloat(process.env.AUDIO_CHANNEL_THRESHOLD);

        // TTS
        if (process.env.TTS_VOICE) this.config.tts.voice = process.env.TTS_VOICE;
        if (process.env.TTS_SPEED) this.config.tts.speed = process.env.TTS_SPEED;
        if (process.env.TTS_AMPLITUDE) this.config.tts.amplitude = parseInt(process.env.TTS_AMPLITUDE);

        // Roger Beep
        if (process.env.ROGER_BEEP_ENABLED) this.config.rogerBeep.enabled = process.env.ROGER_BEEP_ENABLED === 'true';
        if (process.env.ROGER_BEEP_TYPE) this.config.rogerBeep.type = process.env.ROGER_BEEP_TYPE;
        if (process.env.ROGER_BEEP_VOLUME) this.config.rogerBeep.volume = parseFloat(process.env.ROGER_BEEP_VOLUME);
        if (process.env.ROGER_BEEP_DURATION) this.config.rogerBeep.duration = parseInt(process.env.ROGER_BEEP_DURATION);

        // Baliza
        if (process.env.BALIZA_ENABLED) this.config.baliza.enabled = process.env.BALIZA_ENABLED === 'true';
        if (process.env.BALIZA_INTERVAL) this.config.baliza.interval = parseInt(process.env.BALIZA_INTERVAL);
        if (process.env.BALIZA_MESSAGE) this.config.baliza.message = process.env.BALIZA_MESSAGE;
        if (process.env.BALIZA_TONE_FREQUENCY) this.config.baliza.tone.frequency = parseInt(process.env.BALIZA_TONE_FREQUENCY);
        if (process.env.BALIZA_TONE_DURATION) this.config.baliza.tone.duration = parseInt(process.env.BALIZA_TONE_DURATION);
        if (process.env.BALIZA_TONE_VOLUME) this.config.baliza.tone.volume = parseFloat(process.env.BALIZA_TONE_VOLUME);

        // AI Chat
        if (process.env.OPENAI_API_KEY) {
            this.config.aiChat.enabled = true;
            this.config.aiChat.apiKey = process.env.OPENAI_API_KEY;
        }

        // Zello Integration
        if (process.env.ZELLO_ENABLED) this.config.zello.enabled = process.env.ZELLO_ENABLED === 'true';
        if (process.env.ZELLO_CHANNEL) this.config.zello.network.channel = process.env.ZELLO_CHANNEL;
        if (process.env.ZELLO_USERNAME) this.config.zello.network.username = process.env.ZELLO_USERNAME;
        if (process.env.ZELLO_PASSWORD) this.config.zello.network.password = process.env.ZELLO_PASSWORD;
        if (process.env.ZELLO_VOX_THRESHOLD) this.config.zello.audio.voxThreshold = parseFloat(process.env.ZELLO_VOX_THRESHOLD);
        if (process.env.ZELLO_INPUT_DEVICE) this.config.zello.audio.inputDevice = process.env.ZELLO_INPUT_DEVICE;
        if (process.env.ZELLO_OUTPUT_DEVICE) this.config.zello.audio.outputDevice = process.env.ZELLO_OUTPUT_DEVICE;
        if (process.env.OPENAI_MODEL) this.config.aiChat.model = process.env.OPENAI_MODEL;
        if (process.env.OPENAI_MAX_TOKENS) this.config.aiChat.maxTokens = parseInt(process.env.OPENAI_MAX_TOKENS);
        if (process.env.OPENAI_TEMPERATURE) this.config.aiChat.temperature = parseFloat(process.env.OPENAI_TEMPERATURE);

        // SMS
        if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
            this.config.sms.enabled = true;
            this.config.sms.accountSid = process.env.TWILIO_ACCOUNT_SID;
            this.config.sms.authToken = process.env.TWILIO_AUTH_TOKEN;
            this.config.sms.fromNumber = process.env.TWILIO_FROM_NUMBER;
        }

        // Logging
        if (process.env.LOG_LEVEL) this.config.logging.level = process.env.LOG_LEVEL;
        if (process.env.LOG_TO_FILE) this.config.logging.toFile = process.env.LOG_TO_FILE === 'true';

        this.logger.debug('Variables de entorno aplicadas');
    }

    /**
     * Mergear configuración recursivamente
     */
    mergeConfig(target, source) {
        Object.keys(source).forEach(key => {
            if (source[key] !== null && source[key] !== undefined && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                this.mergeConfig(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        });
    }

    /**
     * Validar configuración final
     */
    validateConfiguration() {
        // Validar puerto web
        if (this.config.web.port < 1000 || this.config.web.port > 65535) {
            this.logger.warn(`Puerto web inválido: ${this.config.web.port}, usando 3000`);
            this.config.web.port = 3000;
        }

        // Validar sample rate
        const validSampleRates = [8000, 16000, 22050, 44100, 48000];
        if (!validSampleRates.includes(this.config.audio.sampleRate)) {
            this.logger.warn(`Sample rate inválido: ${this.config.audio.sampleRate}, usando 48000`);
            this.config.audio.sampleRate = 48000;
        }

        // Validar intervalo de baliza
        if (this.config.baliza.interval < 1 || this.config.baliza.interval > 60) {
            this.logger.warn(`Intervalo de baliza inválido: ${this.config.baliza.interval}, usando 15`);
            this.config.baliza.interval = 15;
        }

        // Validar volúmenes
        this.config.rogerBeep.volume = Math.max(0.1, Math.min(1.0, this.config.rogerBeep.volume));
        this.config.baliza.tone.volume = Math.max(0.1, Math.min(1.0, this.config.baliza.tone.volume));
    }

    /**
     * Obtener configuración completa
     */
    getConfig() {
        return this.config;
    }

    /**
     * Obtener configuración de una sección específica
     */
    get(section) {
        return this.config[section] || {};
    }

    /**
     * Obtener valor específico con path notation
     */
    getValue(path, defaultValue = null) {
        const keys = path.split('.');
        let value = this.config;
        
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }
        
        return value;
    }

    /**
     * Establecer valor específico con path notation
     */
    setValue(path, newValue) {
        const keys = path.split('.');
        let current = this.config;
        
        // Navegar hasta el penúltimo nivel
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        // Establecer el valor final
        const lastKey = keys[keys.length - 1];
        const oldValue = current[lastKey];
        current[lastKey] = newValue;
        
        this.logger.debug(`Configuración actualizada: ${path} = ${newValue} (anterior: ${oldValue})`);
        
        // Revalidar configuración después del cambio
        this.validateConfiguration();
        
        return true;
    }

    /**
     * Guardar configuración actual al archivo config.json
     */
    saveToFile() {
        try {
            const configPath = path.join(__dirname, '../../config/config.json');
            const configDir = path.dirname(configPath);
            
            // Crear directorio si no existe
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            
            // Crear copia de la configuración sin funciones ni valores calculados
            const configToSave = JSON.parse(JSON.stringify(this.config));
            
            // Escribir archivo con formato bonito
            fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2), 'utf8');
            
            this.logger.info(`Configuración guardada en: ${configPath}`);
            return true;
            
        } catch (error) {
            this.logger.error('Error guardando configuración:', error.message);
            return false;
        }
    }

    /**
     * Recargar configuración
     */
    reload() {
        this.logger.info('Recargando configuración...');
        this.loadConfiguration();
    }

    /**
     * Obtener resumen de configuración para logs
     */
    getSummary() {
        return {
            system: {
                callsign: this.config.system.callsign,
                version: this.config.system.version,
                environment: this.config.system.environment
            },
            web: {
                port: this.config.web.port,
                host: this.config.web.host
            },
            audio: {
                device: this.config.audio.device,
                sampleRate: this.config.audio.sampleRate
            },
            modules: {
                rogerBeep: this.config.rogerBeep.enabled,
                baliza: this.config.baliza.enabled,
                aiChat: this.config.aiChat.enabled,
                sms: this.config.sms.enabled
            }
        };
    }
}

// Singleton pattern - una sola instancia de configuración
let configManagerInstance = null;

function getConfigManager() {
    if (!configManagerInstance) {
        configManagerInstance = new ConfigManager();
    }
    return configManagerInstance;
}

// Método estático para obtener instancia singleton
ConfigManager.getInstance = function() {
    return getConfigManager();
};

module.exports = {
    ConfigManager,
    getConfigManager
};