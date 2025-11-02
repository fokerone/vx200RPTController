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
                frequency: 1000, // Hz estándar para señales horarias (BBC pips)
                shortDuration: 100,   // ms - duración tonos cortos
                longDuration: 500,    // ms - duración tono largo final
                volume: 0.7
            },
            pattern: 'bbc-pips', // Patrón: 5 tonos cortos + 1 tono largo
            message: process.env.BALIZA_MESSAGE || '',
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

        // Validar duraciones de tonos para BBC pips
        if (this.config.tone.shortDuration < 50 || this.config.tone.shortDuration > 200) {
            this.logger.warn(`Duración tono corto fuera de rango: ${this.config.tone.shortDuration}ms, usando 100ms`);
            this.config.tone.shortDuration = 100;
        }

        if (this.config.tone.longDuration < 300 || this.config.tone.longDuration > 1000) {
            this.logger.warn(`Duración tono largo fuera de rango: ${this.config.tone.longDuration}ms, usando 500ms`);
            this.config.tone.longDuration = 500;
        }

        // Baliza configurada con patrón BBC PIPS (5 cortos + 1 largo) - sin mensaje de voz

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
        
        this.logger.info(`Baliza reconfigurada: ${this.config.interval} min, patrón ${this.config.pattern}, ${this.config.tone.frequency}Hz`);
        
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
        
        // SINCRONIZACIÓN CON HORA DE RELOJ
        // Calcular tiempo hasta la próxima hora en punto
        const now = moment();
        const nextHour = moment().add(1, 'hour').startOf('hour');
        const timeToNextHour = nextHour.diff(now);
        
        this.logger.info('Baliza iniciada - Sincronizando con horas de reloj');
        this.logger.info(`Próxima baliza: ${nextHour.format('HH:mm:ss')} (en ${Math.round(timeToNextHour/1000/60)} minutos)`);
        
        // Programar primera baliza en la próxima hora en punto
        setTimeout(() => {
            if (this.isRunning) {
                this.transmit();
                this.scheduleNext();
            }
        }, timeToNextHour);
        
        this.emit('started', { 
            interval: this.config.interval,
            nextTransmission: nextHour.format('HH:mm:ss'),
            syncMode: 'clock-hour'
        });
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
     * Programar próxima transmisión sincronizada con horas de reloj
     */
    scheduleNext() {
        if (!this.isRunning) {return;}

        // SINCRONIZACIÓN CON HORAS DE RELOJ
        // Calcular tiempo hasta la próxima hora en punto
        const now = moment();
        const nextHour = moment().add(1, 'hour').startOf('hour');
        const timeToNextHour = nextHour.diff(now);
        
        this.timer = setTimeout(async () => {
            if (this.isRunning) { // Verificar que siga activa
                await this.transmit().catch(err => {
                    this.logger.error('Error en transmisión programada:', err.message);
                });
                this.scheduleNext(); // Programar la siguiente
            }
        }, timeToNextHour);

        this.logger.debug(`Próxima baliza programada para: ${nextHour.format('HH:mm:ss')} (en ${Math.round(timeToNextHour/1000/60)} min)`);
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
            // No emitir evento 'error' sin listeners - causa crash por unhandled rejection
            // this.emit('error', error);
        }
    }

    /**
     * Reproducir secuencia completa de baliza - PATRÓN BBC PIPS (5 cortos + 1 largo)
     * OPTIMIZADO: Genera un solo archivo de audio con toda la secuencia
     * para evitar que el VOX corte el PTT entre beeps
     */
    async playBalizaSequence() {
        try {
            const { volume } = this.config.tone;
            const frequency = 1000; // 1kHz estándar para señales horarias

            this.logger.debug('Reproduciendo secuencia BBC pips (5 cortos + 1 largo) - continua');

            // SOLUCIÓN: Generar archivo WAV completo con toda la secuencia
            // Esto mantiene el PTT activo durante toda la transmisión

            // Patrón BBC: 5 beeps de 100ms con silencios de 900ms + beep largo de 500ms
            // Total: 5*(100+900) + 500 = 5500ms

            const sampleRate = 48000;
            const silenceDuration = 900; // ms de silencio entre beeps

            // Generar buffers para cada segmento
            const beepShort = this.generateToneBuffer(frequency, 100, sampleRate, volume);
            const silence = this.generateSilenceBuffer(silenceDuration, sampleRate);
            const beepLong = this.generateToneBuffer(frequency, 500, sampleRate, volume);

            // Concatenar: beep-silencio-beep-silencio-beep-silencio-beep-silencio-beep-silencio-beep_largo
            const sequence = Buffer.concat([
                beepShort, silence,
                beepShort, silence,
                beepShort, silence,
                beepShort, silence,
                beepShort, silence,
                beepLong
            ]);

            // Guardar como archivo temporal
            const fs = require('fs');
            const tempFile = `/tmp/baliza_${Date.now()}.wav`;
            this.writeWavFile(tempFile, sequence, sampleRate);

            // Calcular duración total de la secuencia
            const totalDuration = 5500; // ms: 5*(100+900) + 500

            // Reproducir archivo completo (mantiene PTT activo)
            await this.audioManager.playWithAplay(tempFile, totalDuration);

            // Limpiar archivo temporal
            try {
                fs.unlinkSync(tempFile);
            } catch (error) {
                // Ignorar error si el archivo ya no existe
            }

            this.logger.debug('Secuencia BBC pips completada exitosamente');

        } catch (error) {
            this.logger.error('Error en secuencia de baliza BBC pips:', error.message);
            throw error; // Re-lanzar para manejo en transmit()
        }
    }

    /**
     * Generar buffer de tono senoidal
     */
    generateToneBuffer(frequency, durationMs, sampleRate, volume) {
        const numSamples = Math.floor(sampleRate * durationMs / 1000);
        const buffer = Buffer.alloc(numSamples * 2); // 16-bit samples

        for (let i = 0; i < numSamples; i++) {
            const t = i / sampleRate;
            const sample = Math.sin(2 * Math.PI * frequency * t) * volume * 32767;
            buffer.writeInt16LE(Math.round(sample), i * 2);
        }

        return buffer;
    }

    /**
     * Generar buffer de silencio
     */
    generateSilenceBuffer(durationMs, sampleRate) {
        const numSamples = Math.floor(sampleRate * durationMs / 1000);
        return Buffer.alloc(numSamples * 2); // Todos ceros
    }

    /**
     * Escribir archivo WAV
     */
    writeWavFile(filename, audioBuffer, sampleRate) {
        const fs = require('fs');

        // WAV header
        const numChannels = 1;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * bitsPerSample / 8;
        const blockAlign = numChannels * bitsPerSample / 8;
        const dataSize = audioBuffer.length;

        const header = Buffer.alloc(44);

        // RIFF chunk
        header.write('RIFF', 0);
        header.writeUInt32LE(36 + dataSize, 4);
        header.write('WAVE', 8);

        // fmt chunk
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16); // fmt chunk size
        header.writeUInt16LE(1, 20);  // PCM format
        header.writeUInt16LE(numChannels, 22);
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(byteRate, 28);
        header.writeUInt16LE(blockAlign, 32);
        header.writeUInt16LE(bitsPerSample, 34);

        // data chunk
        header.write('data', 36);
        header.writeUInt32LE(dataSize, 40);

        fs.writeFileSync(filename, Buffer.concat([header, audioBuffer]));
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
                moment().add(1, 'hour').startOf('hour').format('HH:mm:ss') : 
                'No programada',
            type: 'bbc-pips-sequence',
            pattern: this.config.pattern,
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