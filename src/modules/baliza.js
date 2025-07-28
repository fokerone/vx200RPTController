const EventEmitter = require('events');
const moment = require('moment');

class Baliza extends EventEmitter {
    constructor(audioManager) {
        super();
        this.audioManager = audioManager;
        this.config = {
            enabled: true,
            interval: 15, // minutos
            tone: {
                frequency: 1000, // Hz
                duration: 500,   // ms
                volume: 0.7
            },
            message: "Repetidora Simplex"
        };
        
        this.timer = null;
        this.isRunning = false;
        
        console.log('📡 Módulo Baliza inicializado');
    }

    /**
     * Configurar parámetros de la baliza
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log(`⚙️  Baliza configurada: ${this.config.interval} min, ${this.config.tone.frequency}Hz`);
        
        // Reiniciar si está corriendo
        if (this.isRunning) {
            this.stop();
            this.start();
        }
    }

    /**
     * Iniciar baliza automática
     */
    start() {
        if (this.isRunning) {
            console.log('⚠️  Baliza ya está ejecutándose');
            return;
        }

        if (!this.config.enabled) {
            console.log('⚠️  Baliza está deshabilitada');
            return;
        }

        this.isRunning = true;
        this.scheduleNext();
        
        console.log(`🟢 Baliza iniciada - Cada ${this.config.interval} minutos`);
        this.emit('started');
    }

    /**
     * Detener baliza automática
     */
    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        
        this.isRunning = false;
        console.log('🔴 Baliza detenida');
        this.emit('stopped');
    }

    /**
     * Programar próxima transmisión
     */
    scheduleNext() {
        if (!this.isRunning) return;

        const intervalMs = this.config.interval * 60 * 1000; // minutos a ms
        
        this.timer = setTimeout(() => {
            this.transmit();
        }, intervalMs);

        const nextTime = moment().add(this.config.interval, 'minutes').format('HH:mm:ss');
        console.log(`⏰ Próxima baliza programada para: ${nextTime}`);
    }

    /**
     * Transmitir baliza inmediatamente
     */
    async transmit() {
        if (!this.config.enabled) return;

        const timestamp = moment().format('DD/MM/YYYY HH:mm:ss');
        console.log(`📡 Transmitiendo baliza - ${timestamp}`);

        try {
            // Secuencia de baliza
            await this.playBalizaSequence();
            
            console.log('✅ Baliza transmitida exitosamente');
            this.emit('transmitted', timestamp);

        } catch (error) {
            console.error('❌ Error transmitiendo baliza:', error);
            this.emit('error', error);
        }

        // Programar siguiente baliza
        this.scheduleNext();
    }

    /**
     * Reproducir secuencia completa de baliza
     */
    async playBalizaSequence() {
        const { frequency, duration, volume } = this.config.tone;

        // Tono de identificación característico
        console.log(`🎵 Reproduciendo tono: ${frequency}Hz por ${duration}ms`);
        this.audioManager.playTone(frequency, duration, volume);

        // Esperar que termine el tono
        await this.delay(duration + 100);

        // Mensaje de voz (opcional)
        if (this.config.message) {
            const hora = moment().format('HH:mm');
            const mensaje = `${this.config.message}. Hora local: ${hora}`;
            
            console.log(`🗣️  Mensaje: ${mensaje}`);
            await this.audioManager.speak(mensaje, { voice: 'es' });
        }
    }

    /**
     * Ejecutar baliza manual (por comando DTMF)
     */
    async execute(command) {
        console.log(`📞 Baliza ejecutada por comando: ${command}`);
        await this.transmit();
    }

    /**
     * Obtener estado actual
     */
    getStatus() {
        return {
            enabled: this.config.enabled,
            running: this.isRunning,
            interval: this.config.interval,
            nextTransmission: this.timer ? 
                moment().add(this.config.interval, 'minutes').format('HH:mm:ss') : 
                null,
            tone: this.config.tone
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
        this.stop();
        this.removeAllListeners();
        console.log('🗑️  Módulo Baliza destruido');
    }
}

module.exports = Baliza;