const fs = require('fs');
const path = require('path');

class RogerBeep {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.enabled = true;
        
        // Configuración del roger beep
        this.config = {
            type: 'classic', // 'classic', 'motorola', 'kenwood', 'custom'
            volume: 0.7,
            duration: 250,
            delay: 100,
            frequencies: {
                classic: [1000, 800],
                motorola: [1200, 900],
                kenwood: [1500, 1000],
                custom: [1100, 850]
            }
        };

        console.log(`🔊 Roger Beep inicializado: ${this.config.type}`);
    }

    /**
     * Verificar si el roger beep está habilitado
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * Reproducir roger beep
     */
    async play(type = null) {
        if (!this.enabled) {
            console.log('🔇 Roger beep deshabilitado, omitiendo');
            return;
        }

        const beepType = type || this.config.type;
        console.log(`📻 Roger beep: ${beepType}`);

        try {
            // Delay antes del beep
            if (this.config.delay > 0) {
                await this.delay(this.config.delay);
            }

            switch (beepType) {
                case 'classic':
                    await this.playClassicBeep();
                    break;
                case 'motorola':
                    await this.playMotorolaBeep();
                    break;
                case 'kenwood':
                    await this.playKenwoodBeep();
                    break;
                case 'custom':
                    await this.playCustomBeep();
                    break;
                default:
                    console.log(`⚠️  Tipo de roger beep desconocido: ${beepType}, usando classic`);
                    await this.playClassicBeep();
            }

        } catch (error) {
            console.log(`⚠️  Error roger beep: ${error.message}`);
        }
    }

    /**
     * Roger beep clásico (1000Hz + 800Hz)
     */
    async playClassicBeep() {
        const [freq1, freq2] = this.config.frequencies.classic;
        
        try {
            // Primer tono
            await this.playTone(freq1, this.config.duration * 0.6, this.config.volume);
            
            // Pausa muy corta
            await this.delay(20);
            
            // Segundo tono (más grave)
            await this.playTone(freq2, this.config.duration * 0.4, this.config.volume * 0.8);
        } catch (error) {
            console.log('⚠️  Error en classic beep:', error.message);
        }
    }

    /**
     * Roger beep estilo Motorola (ascendente)
     */
    async playMotorolaBeep() {
        const [freq1, freq2] = this.config.frequencies.motorola;
        
        try {
            // Tono ascendente usando sweep
            await this.playSweepTone(freq1, freq2, this.config.duration, this.config.volume);
        } catch (error) {
            console.log('⚠️  Error en motorola beep:', error.message);
            // Fallback a dos tonos separados
            await this.playTone(freq1, this.config.duration * 0.5, this.config.volume);
            await this.playTone(freq2, this.config.duration * 0.5, this.config.volume);
        }
    }

    /**
     * Roger beep estilo Kenwood (tres tonos)
     */
    async playKenwoodBeep() {
        const [freq1, freq2] = this.config.frequencies.kenwood;
        const duration = this.config.duration / 3;
        
        try {
            // Tres tonos descendentes
            await this.playTone(freq1, duration, this.config.volume);
            await this.delay(10);
            await this.playTone(freq1 * 0.8, duration, this.config.volume * 0.9);
            await this.delay(10);
            await this.playTone(freq2, duration, this.config.volume * 0.7);
        } catch (error) {
            console.log('⚠️  Error en kenwood beep:', error.message);
        }
    }

    /**
     * Roger beep personalizado
     */
    async playCustomBeep() {
        const [freq1, freq2] = this.config.frequencies.custom;
        
        try {
            // Patrón personalizado: corto-largo-corto
            await this.playTone(freq1, 80, this.config.volume);
            await this.delay(30);
            await this.playTone(freq2, 120, this.config.volume * 0.9);
            await this.delay(20);
            await this.playTone(freq1, 50, this.config.volume * 0.7);
        } catch (error) {
            console.log('⚠️  Error en custom beep:', error.message);
        }
    }

    /**
     * Reproducir tono simple - con verificación de audioManager
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
     * Reproducir barrido de frecuencia (sweep) - con verificación
     */
    async playSweepTone(startFreq, endFreq, duration, volume = 0.5) {
        try {
            if (!this.audioManager) {
                console.log('⚠️  AudioManager no disponible para sweep');
                return;
            }

            // Si el audioManager no tiene playBuffer, usar tonos múltiples como fallback
            if (typeof this.audioManager.playBuffer !== 'function') {
                console.log('🔄 PlayBuffer no disponible, usando tonos múltiples');
                const steps = 5;
                const stepDuration = duration / steps;
                const freqStep = (endFreq - startFreq) / steps;
                
                for (let i = 0; i < steps; i++) {
                    const freq = startFreq + (freqStep * i);
                    await this.playTone(freq, stepDuration, volume);
                }
                return;
            }

            // Generar sweep usando el audioManager
            const sampleRate = this.audioManager.sampleRate || 48000;
            const sampleCount = Math.floor(sampleRate * duration / 1000);
            const buffer = Buffer.alloc(sampleCount * 2);
            
            for (let i = 0; i < sampleCount; i++) {
                const progress = i / sampleCount;
                const frequency = startFreq + (endFreq - startFreq) * progress;
                const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * volume;
                const value = Math.round(sample * 32767);
                buffer.writeInt16LE(value, i * 2);
            }
            
            await this.audioManager.playBuffer(buffer);
            
        } catch (error) {
            console.log('⚠️  Error en sweep, usando fallback:', error.message);
            // Fallback: reproducir dos tonos separados
            await this.playTone(startFreq, duration * 0.5, volume);
            await this.playTone(endFreq, duration * 0.5, volume);
        }
    }

    /**
     * Delay/pausa
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Configurar tipo de roger beep
     */
    setType(type) {
        if (this.config.frequencies[type]) {
            this.config.type = type;
            console.log(`🔧 Roger beep tipo: ${type}`);
            return true;
        } else {
            console.log(`⚠️  Tipo de roger beep inválido: ${type}`);
            return false;
        }
    }

    /**
     * Configurar volumen
     */
    setVolume(volume) {
        this.config.volume = Math.max(0.1, Math.min(1.0, volume));
        console.log(`🔊 Volumen roger beep: ${this.config.volume}`);
    }

    /**
     * Configurar duración
     */
    setDuration(duration) {
        this.config.duration = Math.max(50, Math.min(1000, duration));
        console.log(`⏱️  Duración roger beep: ${this.config.duration}ms`);
    }

    /**
     * Configurar delay
     */
    setDelay(delay) {
        this.config.delay = Math.max(0, Math.min(500, delay));
        console.log(`⏳ Delay roger beep: ${this.config.delay}ms`);
    }

    /**
     * Habilitar/deshabilitar roger beep
     */
    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        console.log(`${this.enabled ? '✅' : '❌'} Roger beep ${this.enabled ? 'habilitado' : 'deshabilitado'}`);
    }

    /**
     * Configurar frecuencias personalizadas
     */
    setCustomFrequencies(freq1, freq2) {
        if (typeof freq1 === 'number' && typeof freq2 === 'number') {
            this.config.frequencies.custom = [freq1, freq2];
            console.log(`🎵 Frecuencias custom: ${freq1}Hz, ${freq2}Hz`);
        } else {
            console.log('⚠️  Frecuencias custom inválidas');
        }
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
            frequencies: this.config.frequencies[this.config.type] || [1000, 800]
        };
    }

    /**
     * Probar roger beep actual
     */
    async test() {
        console.log('🧪 Test roger beep...');
        try {
            await this.play();
            console.log('✅ Test roger beep completado');
        } catch (error) {
            console.log('❌ Error en test roger beep:', error.message);
        }
    }

    /**
     * Probar todos los tipos
     */
    async testAll() {
        console.log('🧪 Test todos los roger beeps...');
        
        const types = ['classic', 'motorola', 'kenwood', 'custom'];
        
        for (const type of types) {
            try {
                console.log(`🔊 Test: ${type}`);
                await this.play(type);
                await this.delay(1000); // Pausa entre tests
            } catch (error) {
                console.log(`❌ Error en test ${type}:`, error.message);
            }
        }
        
        console.log('✅ Test completo roger beeps terminado');
    }

    /**
     * Obtener información del roger beep
     */
    getInfo() {
        const typeDescriptions = {
            'classic': 'Dos tonos: 1000Hz + 800Hz',
            'motorola': 'Barrido ascendente',
            'kenwood': 'Triple tono descendente', 
            'custom': 'Patrón personalizado'
        };

        return {
            type: this.config.type,
            description: typeDescriptions[this.config.type] || 'Desconocido',
            enabled: this.enabled,
            volume: Math.round(this.config.volume * 100),
            duration: this.config.duration,
            delay: this.config.delay
        };
    }

    /**
     * Validar configuración
     */
    validateConfig() {
        const issues = [];

        if (!this.audioManager) {
            issues.push('AudioManager no está disponible');
        }

        if (!this.config.frequencies[this.config.type]) {
            issues.push(`Tipo de roger beep inválido: ${this.config.type}`);
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
            type: 'classic',
            volume: 0.7,
            duration: 250,
            delay: 100,
            frequencies: {
                classic: [1000, 800],
                motorola: [1200, 900],
                kenwood: [1500, 1000],
                custom: [1100, 850]
            }
        };
        this.enabled = true;
        console.log('🔄 Roger beep reseteado a configuración por defecto');
    }
}

module.exports = RogerBeep;