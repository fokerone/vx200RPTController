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
     * Reproducir roger beep
     */
    async play(type = null) {
        if (!this.enabled) {
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
                    await this.playClassicBeep();
            }

        } catch (error) {
            console.log('⚠️  Error roger beep:', error.message);
        }
    }

    /**
     * Roger beep clásico (1000Hz + 800Hz)
     */
    async playClassicBeep() {
        const [freq1, freq2] = this.config.frequencies.classic;
        
        // Primer tono
        await this.playTone(freq1, this.config.duration * 0.6, this.config.volume);
        
        // Pausa muy corta
        await this.delay(20);
        
        // Segundo tono (más grave)
        await this.playTone(freq2, this.config.duration * 0.4, this.config.volume * 0.8);
    }

    /**
     * Roger beep estilo Motorola (ascendente)
     */
    async playMotorolaBeep() {
        const [freq1, freq2] = this.config.frequencies.motorola;
        
        // Tono ascendente
        await this.playSweepTone(freq1, freq2, this.config.duration, this.config.volume);
    }

    /**
     * Roger beep estilo Kenwood (tres tonos)
     */
    async playKenwoodBeep() {
        const [freq1, freq2] = this.config.frequencies.kenwood;
        const duration = this.config.duration / 3;
        
        // Tres tonos descendentes
        await this.playTone(freq1, duration, this.config.volume);
        await this.delay(10);
        await this.playTone(freq1 * 0.8, duration, this.config.volume * 0.9);
        await this.delay(10);
        await this.playTone(freq2, duration, this.config.volume * 0.7);
    }

    /**
     * Roger beep personalizado
     */
    async playCustomBeep() {
        const [freq1, freq2] = this.config.frequencies.custom;
        
        // Patrón personalizado: corto-largo-corto
        await this.playTone(freq1, 80, this.config.volume);
        await this.delay(30);
        await this.playTone(freq2, 120, this.config.volume * 0.9);
        await this.delay(20);
        await this.playTone(freq1, 50, this.config.volume * 0.7);
    }

    /**
     * Reproducir tono simple
     */
    async playTone(frequency, duration, volume = 0.5) {
        return new Promise((resolve) => {
            try {
                this.audioManager.playTone(frequency, duration, volume);
                setTimeout(resolve, duration + 10);
            } catch (error) {
                console.log('⚠️  Error playTone:', error.message);
                resolve();
            }
        });
    }

    /**
     * Reproducir barrido de frecuencia (sweep)
     */
    async playSweepTone(startFreq, endFreq, duration, volume = 0.5) {
        return new Promise((resolve) => {
            const sampleRate = this.audioManager.sampleRate;
            const sampleCount = Math.floor(sampleRate * duration / 1000);
            const buffer = Buffer.alloc(sampleCount * 2);
            
            for (let i = 0; i < sampleCount; i++) {
                const progress = i / sampleCount;
                const frequency = startFreq + (endFreq - startFreq) * progress;
                const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * volume;
                const value = Math.round(sample * 32767);
                buffer.writeInt16LE(value, i * 2);
            }
            
            this.audioManager.playBuffer(buffer);
            setTimeout(resolve, duration + 10);
        });
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
            console.log(`🔧 Roger beep: ${type}`);
            return true;
        }
        return false;
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
        this.enabled = enabled;
        console.log(`${enabled ? '✅' : '❌'} Roger beep ${enabled ? 'habilitado' : 'deshabilitado'}`);
    }

    /**
     * Configurar frecuencias personalizadas
     */
    setCustomFrequencies(freq1, freq2) {
        this.config.frequencies.custom = [freq1, freq2];
        console.log(`🎵 Frecuencias custom: ${freq1}Hz, ${freq2}Hz`);
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
            frequencies: this.config.frequencies[this.config.type]
        };
    }

    /**
     * Probar roger beep actual
     */
    async test() {
        console.log('🧪 Test roger beep...');
        await this.play();
    }

    /**
     * Probar todos los tipos
     */
    async testAll() {
        console.log('🧪 Test todos los roger beeps...');
        
        const types = ['classic', 'motorola', 'kenwood', 'custom'];
        
        for (const type of types) {
            console.log(`🔊 Test: ${type}`);
            await this.play(type);
            await this.delay(1000);
        }
        
        console.log('✅ Test completo');
    }
}

module.exports = RogerBeep;