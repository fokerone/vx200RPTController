const moment = require('moment');

class DateTime {
    constructor(audioManager) {
        this.audioManager = audioManager;
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
        
        console.log('🕐 Módulo DateTime inicializado');
    }

    /**
     * Ejecutar cuando se recibe comando DTMF
     */
    async execute(command) {
        console.log(`📞 DateTime ejecutado por comando: ${command}`);
        
        if (!this.config.enabled) {
            console.log('⚠️  Módulo DateTime deshabilitado');
            return;
        }

        try {
            await this.speakDateTime();
        } catch (error) {
            console.error('❌ Error en DateTime:', error);
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
        
        console.log(`📅 Fecha: ${fecha}`);
        console.log(`🕐 Hora: ${hora}`);

        // Tono de confirmación
        this.audioManager.playTone(1200, 200, 0.6);
        await this.delay(300);

        // Mensaje completo
        const mensaje = `Fecha y hora actual. ${fecha}. ${hora}`;
        
        console.log(`🗣️  Anunciando: ${mensaje}`);
        await this.audioManager.speak(mensaje, { voice: 'es' });

        console.log('✅ DateTime completado');
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
        console.log('⚙️  DateTime configurado');
    }

    /**
     * Obtener estado del módulo
     */
    getStatus() {
        return {
            enabled: this.config.enabled,
            locale: this.config.locale,
            format: this.config.format,
            currentDateTime: this.getDateTimeText()
        };
    }

    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Destructor
     */
    destroy() {
        console.log('🗑️  Módulo DateTime destruido');
    }
}

module.exports = DateTime;