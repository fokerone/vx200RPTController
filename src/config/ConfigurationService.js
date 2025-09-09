/**
 * ConfigurationService - Sistema de Configuración Centralizado
 * 
 * OBJETIVO: Centralizar TODAS las fuentes de configuración en un solo lugar
 * y proporcionar una API única y consistente para todo el sistema.
 * 
 * FUENTES DE CONFIGURACIÓN (en orden de prioridad):
 * 1. Variables de entorno (.env)
 * 2. Configuración por defecto
 * 3. Archivos de configuración externos (futuro)
 */

const { createLogger } = require('../logging/Logger');

class ConfigurationService {
    constructor() {
        this.logger = createLogger('[ConfigService]');
        this.config = new Map(); // Cache de configuración
        this.listeners = new Map(); // Listeners para cambios
        
        this.loadAllConfiguration();
        this.logger.info('ConfigurationService inicializado');
    }

    /**
     * Cargar toda la configuración desde todas las fuentes
     */
    loadAllConfiguration() {
        try {
            // PASO 1: Configuración por defecto
            this.loadDefaults();
            
            // PASO 2: Variables de entorno (.env ya está cargado por dotenv)
            this.loadEnvironmentVariables();
            
            // PASO 3: Validaciones
            this.validateConfiguration();
            
            this.logger.info(`Configuración cargada: ${this.config.size} parámetros`);
            
        } catch (error) {
            this.logger.error('Error cargando configuración:', error.message);
            throw error;
        }
    }

    /**
     * Configuración por defecto del sistema
     */
    loadDefaults() {
        const defaults = {
            // ===== AUDIO =====
            'audio.device': 'default',
            'audio.sampleRate': 48000,
            'audio.channels': 1,
            'audio.bitDepth': 16,
            'audio.channelThreshold': 0.01,
            'audio.sustainTime': 2000,
            
            // ===== ROGER BEEP =====
            'rogerBeep.enabled': true,
            'rogerBeep.type': 'kenwood',
            'rogerBeep.volume': 0.7,
            'rogerBeep.duration': 250,
            'rogerBeep.delay': 100,
            
            // ===== BALIZA =====
            'baliza.enabled': true,
            'baliza.interval': 60, // minutos
            'baliza.tone.frequency': 1000,
            'baliza.tone.shortDuration': 100,
            'baliza.tone.longDuration': 500,
            'baliza.tone.volume': 0.7,
            
            // ===== DTMF =====
            'dtmf.enabled': true,
            'dtmf.sensitivity': 'medium',
            'dtmf.timeout': 2000,
            'dtmf.antiVoice': true,
            
            // ===== TTS =====
            'tts.engine': 'google',
            'tts.voice': 'es',
            'tts.speed': 1.0,
            'tts.amplitude': 50,
            
            // ===== WEATHER =====
            'weather.enabled': true,
            'weather.apiKey': '',
            'weather.location': 'Mendoza,AR',
            'weather.updateInterval': 600000, // 10 min
            
            // ===== APRS =====
            'aprs.enabled': true,
            'aprs.callsign': 'NOCALL',
            'aprs.beacon.interval': 15, // minutos
            'aprs.direwolf.kissPort': 8001,
            'aprs.direwolf.agwPort': 8000,
            
            // ===== SISTEMA =====
            'system.logLevel': 'info',
            'system.port': 3000,
            'system.maxLogFiles': 10,
            'system.maxLogSize': 10485760 // 10MB
        };

        for (const [key, value] of Object.entries(defaults)) {
            this.config.set(key, value);
        }
    }

    /**
     * Cargar variables de entorno y mapearlas a configuración
     */
    loadEnvironmentVariables() {
        const envMapping = {
            // AUDIO
            'AUDIO_DEVICE': 'audio.device',
            'AUDIO_SAMPLE_RATE': { key: 'audio.sampleRate', type: 'number' },
            'AUDIO_CHANNELS': { key: 'audio.channels', type: 'number' },
            'AUDIO_BIT_DEPTH': { key: 'audio.bitDepth', type: 'number' },
            
            // ROGER BEEP
            'ROGER_BEEP_ENABLED': { key: 'rogerBeep.enabled', type: 'boolean' },
            'ROGER_BEEP_TYPE': 'rogerBeep.type',
            'ROGER_BEEP_VOLUME': { key: 'rogerBeep.volume', type: 'number' },
            'ROGER_BEEP_DURATION': { key: 'rogerBeep.duration', type: 'number' },
            
            // BALIZA
            'BALIZA_ENABLED': { key: 'baliza.enabled', type: 'boolean' },
            'BALIZA_INTERVAL': { key: 'baliza.interval', type: 'number' },
            'BALIZA_MESSAGE': 'baliza.message',
            
            // TTS
            'TTS_ENGINE': 'tts.engine',
            'TTS_VOICE': 'tts.voice',
            'TTS_SPEED': { key: 'tts.speed', type: 'number' },
            'TTS_AMPLITUDE': { key: 'tts.amplitude', type: 'number' },
            'GOOGLE_TTS_API_KEY': 'tts.googleApiKey',
            
            // WEATHER
            'WEATHER_API_KEY': 'weather.apiKey',
            'WEATHER_LOCATION': 'weather.location',
            'WEATHER_UPDATE_INTERVAL': { key: 'weather.updateInterval', type: 'number' },
            
            // APRS
            'APRS_ENABLED': { key: 'aprs.enabled', type: 'boolean' },
            'APRS_CALLSIGN': 'aprs.callsign',
            'APRS_BEACON_INTERVAL': { key: 'aprs.beacon.interval', type: 'number' },
            
            // SISTEMA
            'LOG_LEVEL': 'system.logLevel',
            'PORT': { key: 'system.port', type: 'number' }
        };

        for (const [envVar, mapping] of Object.entries(envMapping)) {
            const envValue = process.env[envVar];
            if (envValue !== undefined) {
                const configKey = typeof mapping === 'string' ? mapping : mapping.key;
                const type = typeof mapping === 'object' ? mapping.type : 'string';
                
                let value = envValue;
                
                // Convertir tipos
                switch (type) {
                    case 'boolean':
                        value = envValue.toLowerCase() === 'true';
                        break;
                    case 'number':
                        value = parseFloat(envValue);
                        if (isNaN(value)) {
                            this.logger.warn(`Variable ${envVar} no es un número válido: ${envValue}`);
                            continue;
                        }
                        break;
                }
                
                this.config.set(configKey, value);
                this.logger.debug(`Configuración desde env: ${configKey} = ${value}`);
            }
        }
    }

    /**
     * Validar configuración crítica
     */
    validateConfiguration() {
        // Validar rangos de volumen
        const volumeKeys = ['rogerBeep.volume', 'baliza.tone.volume'];
        volumeKeys.forEach(key => {
            const value = this.config.get(key);
            if (value < 0.1 || value > 1.0) {
                this.logger.warn(`Volumen fuera de rango [0.1-1.0]: ${key} = ${value}, ajustando a 0.7`);
                this.config.set(key, 0.7);
            }
        });

        // Validar sample rate
        const sampleRate = this.config.get('audio.sampleRate');
        const validRates = [8000, 16000, 22050, 44100, 48000];
        if (!validRates.includes(sampleRate)) {
            this.logger.warn(`Sample rate no válido: ${sampleRate}, usando 48000`);
            this.config.set('audio.sampleRate', 48000);
        }
    }

    /**
     * Obtener valor de configuración
     */
    get(key, defaultValue = undefined) {
        const value = this.config.get(key);
        if (value === undefined && defaultValue !== undefined) {
            return defaultValue;
        }
        return value;
    }

    /**
     * Obtener sección completa de configuración
     */
    getSection(prefix) {
        const section = {};
        for (const [key, value] of this.config.entries()) {
            if (key.startsWith(prefix + '.')) {
                const subKey = key.substring(prefix.length + 1);
                this.setNestedValue(section, subKey, value);
            }
        }
        return section;
    }

    /**
     * Establecer valor anidado en objeto
     */
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        let current = obj;
        
        for (let i = 0; i < keys.length - 1; i++) {
            if (!(keys[i] in current)) {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }
        
        current[keys[keys.length - 1]] = value;
    }

    /**
     * Establecer valor de configuración
     */
    set(key, value) {
        const oldValue = this.config.get(key);
        this.config.set(key, value);
        
        // Notificar listeners
        if (this.listeners.has(key)) {
            this.listeners.get(key).forEach(callback => {
                try {
                    callback(value, oldValue);
                } catch (error) {
                    this.logger.error(`Error en listener de ${key}:`, error.message);
                }
            });
        }
        
        this.logger.debug(`Configuración actualizada: ${key} = ${value}`);
    }

    /**
     * Escuchar cambios en configuración
     */
    onChange(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key).push(callback);
    }

    /**
     * Obtener toda la configuración como objeto plano
     */
    getAll() {
        const result = {};
        for (const [key, value] of this.config.entries()) {
            this.setNestedValue(result, key, value);
        }
        return result;
    }

    /**
     * Recargar configuración
     */
    reload() {
        this.logger.info('Recargando configuración...');
        this.config.clear();
        this.loadAllConfiguration();
    }

    /**
     * Obtener estadísticas de configuración
     */
    getStats() {
        return {
            totalKeys: this.config.size,
            listeners: Array.from(this.listeners.entries()).map(([key, callbacks]) => ({
                key,
                callbackCount: callbacks.length
            }))
        };
    }
}

// Singleton
let instance = null;

function getConfigurationService() {
    if (!instance) {
        instance = new ConfigurationService();
    }
    return instance;
}

module.exports = {
    ConfigurationService,
    getConfigurationService
};