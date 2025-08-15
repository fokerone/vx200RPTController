const EventEmitter = require('events');
const moment = require('moment');
const { MODULE_STATES, DELAYS, VALIDATION } = require('../constants');
const { delay, validateVolume, sanitizeTextForTTS } = require('../utils');
const { createLogger } = require('../logging/Logger');

class Baliza extends EventEmitter {
    constructor(audioManager) {
        super();
        this.audioManager = audioManager;
        this.logger = createLogger('[Baliza]');
        this.state = MODULE_STATES.IDLE;
        
        this.config = {
            enabled: true,
            interval: 60, // minutos (1 hora)
            tone: {
                frequency: 1000, // Hz
                duration: 500,   // ms
                volume: 0.7
            },
            message: process.env.BALIZA_MESSAGE || "",
            autoStart: true,
            waitForFreeChannel: true
        };
        
        this.timer = null;
        this.isRunning = false;
        this.lastTransmission = null;
        this.transmissionCount = 0;
        
        this.validateConfiguration();
    }

    /**
     * Validar configuración del módulo
     */
    validateConfiguration() {
        if (!this.audioManager) {
            this.logger.error('AudioManager no disponible');
            this.state = MODULE_STATES.ERROR;
            return false;
        }

        // Validar intervalo (mínimo 1 minuto, máximo 120 minutos)
        if (this.config.interval < 1 || this.config.interval > 120) {
            this.logger.warn(`Intervalo fuera de rango: ${this.config.interval} min, usando 60 min`);
            this.config.interval = 60;
        }

        // Validar configuración de tono
        this.config.tone.volume = validateVolume(this.config.tone.volume);
        
        if (this.config.tone.frequency < 200 || this.config.tone.frequency > 3000) {
            this.logger.warn(`Frecuencia de tono fuera de rango: ${this.config.tone.frequency}Hz, usando 1000Hz`);
            this.config.tone.frequency = 1000;
        }

        if (this.config.tone.duration < 100 || this.config.tone.duration > 2000) {
            this.logger.warn(`Duración de tono fuera de rango: ${this.config.tone.duration}ms, usando 500ms`);
            this.config.tone.duration = 500;
        }

        // Baliza configurada para SOLO TONO - sin mensaje de voz

        return true;
    }

    /**
     * Configurar parámetros de la baliza
     */
    configure(newConfig) {
        if (!newConfig || typeof newConfig !== 'object') {
            this.logger.warn('Configuración inválida recibida');
            return;
        }

        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...newConfig };
        
        // Validar nueva configuración
        this.validateConfiguration();
        
        this.logger.info(`Baliza reconfigurada: ${this.config.interval} min, tono ${this.config.tone.frequency}Hz`);
        
        // Reiniciar si está corriendo y hay cambios significativos
        if (this.isRunning && (
            oldConfig.interval !== this.config.interval ||
            oldConfig.enabled !== this.config.enabled
        )) {
            this.logger.info('Reiniciando baliza por cambios de configuración');
            this.stop();
            if (this.config.enabled) {
                this.start();
            }
        }
    }

    /**
     * Iniciar baliza automática
     */
    start() {
        if (this.isRunning) {
            this.logger.warn('Baliza ya está ejecutándose');
            return false;
        }

        if (!this.config.enabled) {
            this.logger.warn('Baliza está deshabilitada');
            return false;
        }

        if (this.state === MODULE_STATES.ERROR) {
            this.logger.error('Baliza en estado de error, no se puede iniciar');
            return false;
        }

        this.isRunning = true;
        this.state = MODULE_STATES.ACTIVE;
        this.transmissionCount = 0;
        
        // COORDINACIÓN INICIAL: Delay de 5 minutos al arranque para evitar colisión inmediata
        // Esto permite que APRS se establezca primero (7.5min) antes de la baliza
        const initialDelay = 5 * 60 * 1000; // 5 minutos
        
        setTimeout(() => {
            if (this.isRunning) {
                this.scheduleNext();
            }
        }, initialDelay);
        
        this.logger.info(`Baliza iniciada - Cada ${this.config.interval} minutos (inicio en 5min para coordinación)`);
        this.emit('started', { interval: this.config.interval });
        return true;
    }

    /**
     * Detener baliza automática
     */
    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        
        const wasRunning = this.isRunning;
        this.isRunning = false;
        this.state = MODULE_STATES.IDLE;
        
        if (wasRunning) {
            this.logger.info('Baliza detenida');
            this.emit('stopped', { 
                transmissionCount: this.transmissionCount,
                lastTransmission: this.lastTransmission 
            });
        }
        
        return true;
    }

    /**
     * Programar próxima transmisión
     */
    scheduleNext() {
        if (!this.isRunning) return;

        const intervalMs = this.config.interval * 60 * 1000; // minutos a ms
        
        // OFFSET DE COORDINACIÓN: 2.5 minutos para evitar colisiones con APRS
        // APRS transmite en X:07:30, X:22:30, X:37:30, X:52:30
        // Baliza transmitirá en X:02:30 (evita colisión total)
        const coordinationOffset = 2.5 * 60 * 1000; // 2.5 minutos
        
        this.timer = setTimeout(() => {
            if (this.isRunning) { // Verificar que siga activa
                this.transmit();
                this.scheduleNext(); // Programar la siguiente
            }
        }, intervalMs + coordinationOffset);

        const nextTime = moment().add(this.config.interval + 2.5, 'minutes').format('HH:mm:ss');
        this.logger.debug(`Próxima baliza programada para: ${nextTime} (coord. +2.5min)`);
    }

    /**
     * Transmitir baliza inmediatamente
     */
    async transmit() {
        if (!this.config.enabled) {
            this.logger.debug('Baliza deshabilitada, omitiendo transmisión');
            return;
        }

        const timestamp = moment().format('DD/MM/YYYY HH:mm:ss');
        this.logger.info(`Transmitiendo baliza - ${timestamp}`);

        try {
            // Verificar si el canal está libre si está configurado
            if (this.config.waitForFreeChannel && this.audioManager.isSafeToTransmit && !this.audioManager.isSafeToTransmit()) {
                this.logger.warn('Canal ocupado, posponiendo baliza');
                // Reprogramar en 30 segundos
                setTimeout(() => {
                    if (this.isRunning) {
                        this.transmit();
                    }
                }, 30000);
                return;
            }

            // Secuencia de baliza
            await this.playBalizaSequence();
            
            this.transmissionCount++;
            this.lastTransmission = new Date();
            
            this.emit('transmitted', { 
                timestamp,
                count: this.transmissionCount,
                tone: this.config.tone 
            });
            
            this.logger.info(`Baliza transmitida exitosamente (#${this.transmissionCount})`);

        } catch (error) {
            this.logger.error('Error transmitiendo baliza:', error.message);
            this.state = MODULE_STATES.ERROR;
            this.emit('error', error);
        }
    }

    /**
     * Reproducir secuencia completa de baliza - SOLO TONO
     */
    async playBalizaSequence() {
        try {
            const { frequency, duration, volume } = this.config.tone;

            // Tono de identificación característico ÚNICAMENTE
            this.logger.debug(`Reproduciendo tono de baliza: ${frequency}Hz por ${duration}ms`);
            await this.audioManager.playTone(frequency, duration, volume);

        } catch (error) {
            this.logger.error('Error en secuencia de baliza:', error.message);
            throw error; // Re-lanzar para manejo en transmit()
        }
    }

    /**
     * Ejecutar baliza manual (por comando DTMF)
     */
    async execute(command) {
        this.logger.info(`Baliza manual ejecutada por comando: ${command}`);
        
        if (!this.config.enabled) {
            this.logger.warn('Baliza deshabilitada, ignorando comando manual');
            return;
        }

        try {
            await this.transmit();
        } catch (error) {
            this.logger.error('Error en baliza manual:', error.message);
        }
    }

    /**
     * Obtener estado actual
     */
    getStatus() {
        return {
            enabled: this.config.enabled,
            state: this.state,
            running: this.isRunning,
            interval: this.config.interval,
            transmissionCount: this.transmissionCount,
            lastTransmission: this.lastTransmission,
            nextTransmission: this.timer ? 
                moment().add(this.config.interval, 'minutes').format('HH:mm:ss') : 
                'No programada',
            type: 'tone-only',
            tone: { ...this.config.tone }, // Copia del objeto
            config: {
                autoStart: this.config.autoStart,
                waitForFreeChannel: this.config.waitForFreeChannel
            }
        };
    }

    /**
     * Obtener estadísticas de transmisión
     */
    getStats() {
        const now = Date.now();
        const startTime = (this.lastTransmission && typeof this.lastTransmission.getTime === 'function') ? 
            this.lastTransmission.getTime() : now;
        
        return {
            totalTransmissions: this.transmissionCount,
            lastTransmission: this.lastTransmission,
            uptime: this.isRunning ? now - startTime : 0,
            averageInterval: this.config.interval * 60 * 1000, // en ms
            isActive: this.isRunning && this.config.enabled,
            nextTransmissionIn: this.timer ? this.config.interval * 60 * 1000 : null
        };
    }

    /**
     * Destructor - limpiar recursos
     */
    destroy() {
        this.stop();
        this.state = MODULE_STATES.DISABLED;
        this.removeAllListeners(); // Limpiar event listeners
        this.logger.info('Módulo Baliza destruido');
    }
}

module.exports = Baliza;