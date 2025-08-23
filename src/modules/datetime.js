const moment = require('moment');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { delay, sanitizeTextForTTS } = require('../utils');
const { createLogger } = require('../logging/Logger');
const { MODULE_STATES } = require('../constants');
const HybridVoiceManager = require('../audio/HybridVoiceManager');

class DateTime {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.logger = createLogger('[DateTime]');
        this.state = MODULE_STATES.IDLE;
        
        this.config = {
            enabled: true,
            format: {
                date: 'DD [de] MMMM [de] YYYY',
                time: 'HH:mm'
            },
            locale: 'es',
            // Configuración de horarios solares (aproximados para Argentina)
            sunrise: { hour: 7, minute: 0 },    // 7:00 AM
            sunset: { hour: 19, minute: 0 }     // 7:00 PM
        };

        // Configurar moment en español
        moment.locale('es');
        
        // Inicializar sistema híbrido de voz
        this.voiceManager = new HybridVoiceManager(this.audioManager);
    }

    /**
     * Ejecutar cuando se recibe comando DTMF
     */
    async execute(command) {
        this.logger.info(`Ejecutado por comando: ${command}`);
        
        if (!this.config.enabled) {
            this.logger.warn('Módulo deshabilitado');
            return;
        }

        if (this.state !== MODULE_STATES.IDLE) {
            this.logger.warn('Módulo ocupado');
            return;
        }

        try {
            this.state = MODULE_STATES.ACTIVE;
            await this.speakDateTime();
        } catch (error) {
            this.logger.error('Error ejecutando DateTime:', error.message);
            this.state = MODULE_STATES.ERROR;
        } finally {
            this.state = MODULE_STATES.IDLE;
        }
    }

    /**
     * Hablar fecha y hora actual
     */
    async speakDateTime() {
        const now = moment();
        
        // Formatear fecha de manera natural
        const dia = now.date();
        const mes = now.format('MMMM');
        const año = now.year();
        const fecha = `${this.numberToText(dia, 'day')} de ${mes} de ${año}`;
        
        // Formatear hora de manera natural
        const hora = now.hour();
        const minuto = now.minute();
        
        // Construir mensaje de hora natural
        let horaTexto = `son las ${this.numberToText(hora, 'hour')} horas`;
        if (minuto > 0) {
            horaTexto += ` con ${this.numberToText(minuto, 'minute')} minuto${minuto !== 1 ? 's' : ''}`;
        }
        
        // Calcular información solar
        const solarInfo = this.getSolarInfo(now);
        
        // Tono de confirmación
        await this.audioManager.playTone(1200, 200, 0.6);
        await delay(300);

        // Mensaje completo - sanitizar para TTS
        const mensaje = sanitizeTextForTTS(`${fecha}, ${horaTexto}. ${solarInfo}`);
        await this.speakWithHybridVoice(mensaje);
    }

    /**
     * Convertir número a texto en español
     * @param {number} num - Número a convertir
     * @param {string} type - Tipo de contexto: 'hour', 'minute', 'day'
     * @returns {string} - Número en texto
     */
    numberToText(num, type = 'general') {
        // Números base
        const numeros = {
            0: 'cero', 1: 'uno', 2: 'dos', 3: 'tres', 4: 'cuatro', 5: 'cinco',
            6: 'seis', 7: 'siete', 8: 'ocho', 9: 'nueve', 10: 'diez',
            11: 'once', 12: 'doce', 13: 'trece', 14: 'catorce', 15: 'quince',
            16: 'dieciséis', 17: 'diecisiete', 18: 'dieciocho', 19: 'diecinueve',
            20: 'veinte', 21: 'veintiuno', 22: 'veintidós', 23: 'veintitrés',
            24: 'veinticuatro', 25: 'veinticinco', 26: 'veintiséis', 27: 'veintisiete',
            28: 'veintiocho', 29: 'veintinueve', 30: 'treinta', 31: 'treinta y uno'
        };
        
        // Casos especiales para horas (usar femenino)
        if (type === 'hour') {
            const horasEspeciales = {
                1: 'una', 21: 'veintiuna', 31: 'treinta y una'
            };
            if (horasEspeciales[num]) {
                return horasEspeciales[num];
            }
        }
        
        // Casos especiales para minutos (usar masculino/femenino según contexto)
        if (type === 'minute') {
            const minutosEspeciales = {
                1: 'un', 21: 'veintiún', 31: 'treinta y un'
            };
            if (minutosEspeciales[num]) {
                return minutosEspeciales[num];
            }
        }
        
        // Números del 40-59 (para minutos principalmente)
        if (num >= 40 && num < 50) {
            const remainder = num - 40;
            return remainder === 0 ? 'cuarenta' : `cuarenta y ${this.numberToText(remainder, type)}`;
        }
        
        if (num >= 50 && num < 60) {
            const remainder = num - 50;
            return remainder === 0 ? 'cincuenta' : `cincuenta y ${this.numberToText(remainder, type)}`;
        }
        
        // Para números del 32-39
        if (num >= 32 && num <= 39) {
            const remainder = num - 30;
            return `treinta y ${this.numberToText(remainder, type)}`;
        }
        
        return numeros[num] || num.toString();
    }

    /**
     * Obtener información solar (día/noche y tiempo hasta próximo evento)
     * @param {moment} now - Momento actual
     * @returns {string} - Información solar
     */
    getSolarInfo(now) {
        const currentHour = now.hour();
        const currentMinute = now.minute();
        const currentTotalMinutes = currentHour * 60 + currentMinute;
        
        const sunriseTotalMinutes = this.config.sunrise.hour * 60 + this.config.sunrise.minute;
        const sunsetTotalMinutes = this.config.sunset.hour * 60 + this.config.sunset.minute;
        
        // Determinar si es de día o de noche
        const isDaytime = currentTotalMinutes >= sunriseTotalMinutes && currentTotalMinutes < sunsetTotalMinutes;
        
        if (isDaytime) {
            // Es de día, calcular tiempo hasta atardecer
            const minutesUntilSunset = sunsetTotalMinutes - currentTotalMinutes;
            const hoursUntil = Math.floor(minutesUntilSunset / 60);
            const minutesUntil = minutesUntilSunset % 60;
            
            if (hoursUntil === 0 && minutesUntil === 0) {
                return 'Es hora del atardecer';
            } else if (hoursUntil === 0) {
                return `Faltan ${this.numberToText(minutesUntil, 'minute')} minuto${minutesUntil !== 1 ? 's' : ''} para el atardecer`;
            } else if (minutesUntil === 0) {
                return `Faltan ${this.numberToText(hoursUntil, 'hour')} hora${hoursUntil !== 1 ? 's' : ''} para el atardecer`;
            } else {
                return `Faltan ${this.numberToText(hoursUntil, 'hour')} hora${hoursUntil !== 1 ? 's' : ''} y ${this.numberToText(minutesUntil, 'minute')} minuto${minutesUntil !== 1 ? 's' : ''} para el atardecer`;
            }
        } else {
            // Es de noche, calcular tiempo hasta amanecer
            let minutesUntilSunrise;
            
            if (currentTotalMinutes < sunriseTotalMinutes) {
                // Misma día, temprano en la mañana
                minutesUntilSunrise = sunriseTotalMinutes - currentTotalMinutes;
            } else {
                // Noche, calcular hasta el amanecer del día siguiente
                minutesUntilSunrise = (24 * 60) - currentTotalMinutes + sunriseTotalMinutes;
            }
            
            const hoursUntil = Math.floor(minutesUntilSunrise / 60);
            const minutesUntil = minutesUntilSunrise % 60;
            
            if (hoursUntil === 0 && minutesUntil === 0) {
                return 'Es hora del amanecer';
            } else if (hoursUntil === 0) {
                return `Faltan ${this.numberToText(minutesUntil, 'minute')} minuto${minutesUntil !== 1 ? 's' : ''} para el amanecer`;
            } else if (minutesUntil === 0) {
                return `Faltan ${this.numberToText(hoursUntil, 'hour')} hora${hoursUntil !== 1 ? 's' : ''} para el amanecer`;
            } else {
                return `Faltan ${this.numberToText(hoursUntil, 'hour')} hora${hoursUntil !== 1 ? 's' : ''} y ${this.numberToText(minutesUntil, 'minute')} minuto${minutesUntil !== 1 ? 's' : ''} para el amanecer`;
            }
        }
    }

    /**
     * Generar y reproducir voz usando sistema híbrido
     * @param {string} text - Texto a reproducir
     * @param {object} options - Opciones de voz
     */
    async speakWithHybridVoice(text, options = {}) {
        try {
            // Generar y reproducir audio usando el HybridVoiceManager (que ya integra con AudioManager)
            const audioFile = await this.voiceManager.generateSpeech(text, options);
            
            // Reproducir usando el HybridVoiceManager (que usa AudioManager correctamente)
            await this.voiceManager.playAudio(audioFile);
            
            // Ejecutar roger beep después de la reproducción
            if (this.audioManager.rogerBeep && this.audioManager.rogerBeep.enabled) {
                await this.audioManager.rogerBeep.executeAfterTransmission();
            }
            
            // Limpiar archivo temporal después de un tiempo
            setTimeout(() => {
                try {
                    if (fs.existsSync(audioFile)) {
                        fs.unlinkSync(audioFile);
                    }
                } catch (error) {
                    this.logger.warn('Error eliminando archivo temporal:', error.message);
                }
            }, 30000); // 30 segundos
            
        } catch (error) {
            this.logger.error('Error en speakWithHybridVoice:', error.message);
            // Fallback de emergencia usando audioManager original
            await this.audioManager.speak(text, options);
        }
    }

    /**
     * Reproducir archivo de audio usando paplay
     * @param {string} audioFile - Ruta del archivo de audio
     * @returns {Promise<void>}
     */
    async playAudioFile(audioFile) {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(audioFile)) {
                reject(new Error('Archivo de audio no existe'));
                return;
            }

            this.logger.debug(`Reproduciendo archivo: ${path.basename(audioFile)}`);
            
            const paplay = spawn('paplay', [audioFile]);
            
            let stderr = '';
            paplay.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            paplay.on('close', (code) => {
                if (code === 0) {
                    this.logger.debug('Reproducción completada exitosamente');
                    resolve();
                } else {
                    this.logger.warn(`paplay falló con código ${code}: ${stderr}`);
                    reject(new Error(`Error reproduciendo audio: ${stderr}`));
                }
            });

            paplay.on('error', (error) => {
                this.logger.error('Error ejecutando paplay:', error.message);
                reject(error);
            });
        });
    }

    /**
     * Obtener fecha y hora como texto
     */
    getDateTimeText() {
        const now = moment();
        return {
            date: now.format(this.config.format.date),
            time: now.format(this.config.format.time),
            timestamp: now.format('YYYY-MM-DD HH:mm:ss')
        };
    }

    /**
     * Configurar formato de fecha/hora
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.logger.info('Configuración actualizada');
    }

    /**
     * Obtener estado del módulo
     */
    getStatus() {
        return {
            enabled: this.config.enabled,
            state: this.state,
            locale: this.config.locale,
            format: this.config.format,
            currentDateTime: this.getDateTimeText()
        };
    }

    /**
     * Destructor
     */
    destroy() {
        // Destruir voice manager
        if (this.voiceManager && typeof this.voiceManager.destroy === 'function') {
            this.voiceManager.destroy();
        }
        
        this.state = MODULE_STATES.DISABLED;
        this.logger.info('Módulo DateTime destruido');
    }
}

module.exports = DateTime;