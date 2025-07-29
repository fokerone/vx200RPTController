const fs = require('fs');
const path = require('path');

class RogerBeep {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.enabled = true; // Por defecto activo
        
        // Configuración simplificada - solo tipo Kenwood
        this.config = {
            type: 'kenwood',
            volume: 0.7,
            duration: 250,
            delay: 100,
            frequencies: [1500, 1200, 1000] // Tres tonos descendentes tipo Kenwood
        };
        
        console.log('🔊 Roger Beep inicializado (Tipo: Kenwood, Estado: ACTIVO)');
    }

    /**
     * Verificar si el roger beep está habilitado
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * Reproducir roger beep Kenwood
     * Se ejecuta automáticamente al final de cada transmisión
     */
    async play() {
        if (!this.enabled) {
            return;
        }

        console.log('📻 Ejecutando Roger Beep (Kenwood)');

        try {
            // Delay antes del beep
            if (this.config.delay > 0) {
                await this.delay(this.config.delay);
            }

            await this.playKenwoodBeep();

        } catch (error) {
            console.log(`⚠️  Error Roger Beep: ${error.message}`);
        }
    }

    /**
     * Roger beep estilo Kenwood (tres tonos descendentes)
     */
    async playKenwoodBeep() {
        const [freq1, freq2, freq3] = this.config.frequencies;
        const duration = this.config.duration / 3;
        
        try {
            // Primer tono (agudo)
            await this.playTone(freq1, duration, this.config.volume);
            await this.delay(10);
            
            // Segundo tono (medio)
            await this.playTone(freq2, duration, this.config.volume * 0.9);
            await this.delay(10);
            
            // Tercer tono (grave)
            await this.playTone(freq3, duration, this.config.volume * 0.8);
            
        } catch (error) {
            console.log('⚠️  Error en Kenwood beep:', error.message);
        }
    }

    /**
     * Reproducir tono simple
     */
    async playTone(frequency, duration, volume = 0.5) {
        try {
            if (!this.audioManager || typeof this.audioManager.playTone !== 'function') {
                console.log('⚠️  AudioManager no disponible para reproducir tono');
                return;
            }

            await this.audioManager.playTone(frequency, duration, volume);
        } catch (error) {
            console.log('⚠️  Error playTone en RogerBeep:', error.message);
        }
    }

    /**
     * Delay/pausa
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Habilitar/deshabilitar roger beep desde configuración
     */
    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        console.log(`${this.enabled ? '✅' : '❌'} Roger Beep ${this.enabled ? 'HABILITADO' : 'DESHABILITADO'} desde configuración`);
    }

    /**
     * Toggle del estado del roger beep (solo desde panel web)
     */
    toggle() {
        this.setEnabled(!this.enabled);
        return this.enabled;
    }

    /**
     * Configurar volumen (solo desde configuración)
     */
    setVolume(volume) {
        this.config.volume = Math.max(0.1, Math.min(1.0, volume));
        console.log(`🔊 Volumen Roger Beep: ${Math.round(this.config.volume * 100)}%`);
    }

    /**
     * Obtener configuración actual
     */
    getConfig() {
        return {
            enabled: this.enabled,
            type: this.config.type,
            volume: this.config.volume,
            duration: this.config.duration,
            delay: this.config.delay,
            frequencies: this.config.frequencies
        };
    }

    /**
     * Probar roger beep (solo desde panel web)
     */
    async test() {
        console.log('🧪 Test Roger Beep Kenwood...');
        const wasEnabled = this.enabled;
        
        // Forzar habilitado para el test
        this.enabled = true;
        
        try {
            await this.play();
            console.log('✅ Test Roger Beep completado');
        } catch (error) {
            console.log('❌ Error en test Roger Beep:', error.message);
        } finally {
            // Restaurar estado original
            this.enabled = wasEnabled;
        }
    }

    /**
     * Obtener información del roger beep
     */
    getInfo() {
        return {
            type: 'Kenwood',
            description: 'Triple tono descendente (1500Hz → 1200Hz → 1000Hz)',
            enabled: this.enabled,
            volume: Math.round(this.config.volume * 100),
            duration: this.config.duration,
            delay: this.config.delay,
            status: this.enabled ? 'ACTIVO' : 'INACTIVO'
        };
    }

    /**
     * Obtener estado simple para el panel web
     */
    getStatus() {
        return {
            enabled: this.enabled,
            type: 'kenwood',
            volume: this.config.volume,
            duration: this.config.duration
        };
    }

    /**
     * Ejecutar automáticamente al final de transmisiones
     * Esta función debe ser llamada desde el audioManager al finalizar cualquier transmisión
     */
    async executeAfterTransmission() {
        if (!this.enabled) {
            return;
        }

        console.log('🎯 Ejecutando Roger Beep post-transmisión');
        
        // Pequeña pausa antes del roger beep
        await this.delay(50);
        
        try {
            await this.play();
        } catch (error) {
            console.log('⚠️  Error ejecutando Roger Beep post-transmisión:', error.message);
        }
    }

    /**
     * Cargar configuración desde archivo o base de datos
     */
    loadConfig(config) {
        if (typeof config.enabled === 'boolean') {
            this.setEnabled(config.enabled);
        }
        
        if (typeof config.volume === 'number') {
            this.setVolume(config.volume);
        }
        
        console.log('📁 Configuración Roger Beep cargada desde archivo');
    }

    /**
     * Validar configuración
     */
    validateConfig() {
        const issues = [];

        if (!this.audioManager) {
            issues.push('AudioManager no está disponible');
        }

        if (this.config.volume < 0.1 || this.config.volume > 1.0) {
            issues.push(`Volumen fuera de rango: ${this.config.volume}`);
        }

        if (this.config.duration < 50 || this.config.duration > 1000) {
            issues.push(`Duración fuera de rango: ${this.config.duration}ms`);
        }

        return {
            valid: issues.length === 0,
            issues: issues
        };
    }

    /**
     * Reset a configuración por defecto
     */
    reset() {
        this.config = {
            type: 'kenwood',
            volume: 0.7,
            duration: 250,
            delay: 100,
            frequencies: [1500, 1200, 1000]
        };
        this.enabled = true;
        console.log('🔄 Roger Beep reseteado a configuración Kenwood por defecto');
    }
}

module.exports = RogerBeep;

/*

🎯 USO:
1. Crear instancia: const rogerBeep = new RogerBeep(audioManager);
2. Al final de cada transmisión llamar: await rogerBeep.executeAfterTransmission();
3. Control solo desde panel web: rogerBeep.toggle(), rogerBeep.test()
4. Configuración desde archivo: rogerBeep.loadConfig(config)

*/