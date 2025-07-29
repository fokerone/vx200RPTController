const moment = require('moment');
const { delay, createLogger, sanitizeTextForTTS } = require('../utils');
const { MODULE_STATES } = require('../constants');

class DateTime {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.logger = createLogger('[DateTime]');
        this.state = MODULE_STATES.IDLE;
        
        this.config = {
            enabled: true,
            format: {
                date: 'dddd, DD [de] MMMM [de] YYYY',
                time: 'HH:mm [horas]'
            },
            locale: 'es'
        };

        // Configurar moment en español
        moment.locale('es');
        
        this.logger.info('Módulo DateTime inicializado');
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
        
        // Formatear fecha y hora
        const fecha = now.format(this.config.format.date);
        const hora = now.format(this.config.format.time);
        
        // Tono de confirmación
        await this.audioManager.playTone(1200, 200, 0.6);
        await delay(300);

        // Mensaje completo - sanitizar para TTS
        const mensaje = sanitizeTextForTTS(`Fecha y hora actual. ${fecha}. ${hora}`);
        await this.audioManager.speak(mensaje, { voice: 'es' });
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
        this.state = MODULE_STATES.DISABLED;
        this.logger.info('Módulo DateTime destruido');
    }
}

module.exports = DateTime;