const fs = require('fs');
const path = require('path');
const { ROGER_BEEP, MODULE_STATES, DELAYS } = require('../constants');
const { delay, validateVolume } = require('../utils');
const { createLogger } = require('../logging/Logger');

class RogerBeep {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.logger = createLogger('[RogerBeep]');
        this.state = MODULE_STATES.IDLE;
        this.enabled = true;
        
        // Configuración usando constantes del sistema
        this.config = {
            type: 'kenwood',
            volume: ROGER_BEEP.DEFAULT_VOLUME,
            duration: ROGER_BEEP.DEFAULT_DURATION,
            delay: ROGER_BEEP.DEFAULT_DELAY,
            frequencies: [...ROGER_BEEP.KENWOOD_FREQUENCIES] // Copia del array
        };
        
        this.isPlaying = false;
        this.validateConfiguration();
        
        this.logger.info(`Roger Beep inicializado (Tipo: Kenwood, Estado: ${this.enabled ? 'ACTIVO' : 'INACTIVO'})`);
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

        // Validar volumen
        this.config.volume = validateVolume(this.config.volume);
        
        // Validar duración
        if (this.config.duration < ROGER_BEEP.MIN_DURATION || this.config.duration > ROGER_BEEP.MAX_DURATION) {
            this.logger.warn(`Duración fuera de rango, usando valor por defecto: ${ROGER_BEEP.DEFAULT_DURATION}ms`);
            this.config.duration = ROGER_BEEP.DEFAULT_DURATION;
        }

        return true;
    }

    /**
     * Verificar si el roger beep está habilitado
     */
    isEnabled() {
        return this.enabled && this.state !== MODULE_STATES.ERROR;
    }

    /**
     * Reproducir roger beep Kenwood
     * Se ejecuta automáticamente al final de cada transmisión
     */
    async play() {
        if (!this.isEnabled()) {
            this.logger.debug('Roger Beep deshabilitado, omitiendo');
            return;
        }

        if (this.isPlaying) {
            this.logger.warn('Roger Beep ya reproduciéndose, omitiendo');
            return;
        }

        this.isPlaying = true;
        this.state = MODULE_STATES.ACTIVE;
        this.logger.info('Ejecutando Roger Beep (Kenwood)');

        try {
            // Delay antes del beep
            if (this.config.delay > 0) {
                await delay(this.config.delay);
            }

            await this.playKenwoodBeep();
            this.logger.debug('Roger Beep completado exitosamente');

        } catch (error) {
            this.logger.error('Error ejecutando Roger Beep:', error.message);
            this.state = MODULE_STATES.ERROR;
        } finally {
            this.isPlaying = false;
            this.state = MODULE_STATES.IDLE;
        }
    }

    /**
     * Roger beep estilo Kenwood (tres tonos descendentes)
     */
    async playKenwoodBeep() {
        const [freq1, freq2, freq3] = this.config.frequencies;
        const toneDuration = Math.floor(this.config.duration / 3);
        const pauseDuration = DELAYS.SHORT / 10; // 10ms entre tonos
        
        try {
            // Primer tono (agudo) - 100% volumen
            await this.playTone(freq1, toneDuration, this.config.volume);
            await delay(pauseDuration);
            
            // Segundo tono (medio) - 90% volumen
            await this.playTone(freq2, toneDuration, this.config.volume * 0.9);
            await delay(pauseDuration);
            
            // Tercer tono (grave) - 80% volumen para efecto descendente
            await this.playTone(freq3, toneDuration, this.config.volume * 0.8);
            
        } catch (error) {
            this.logger.error('Error en secuencia Kenwood:', error.message);
            throw error; // Re-lanzar para manejo en play()
        }
    }

    /**
     * Reproducir tono simple
     */
    async playTone(frequency, duration, volume = ROGER_BEEP.DEFAULT_VOLUME) {
        if (!this.audioManager || typeof this.audioManager.playTone !== 'function') {
            throw new Error('AudioManager no disponible para reproducir tono');
        }

        const validatedVolume = validateVolume(volume);
        this.logger.debug(`Reproduciendo tono: ${frequency}Hz, ${duration}ms, vol: ${Math.round(validatedVolume * 100)}%`);
        
        await this.audioManager.playTone(frequency, duration, validatedVolume);
    }

    /**
     * Habilitar/deshabilitar roger beep desde configuración
     */
    setEnabled(enabled) {
        const previousState = this.enabled;
        this.enabled = Boolean(enabled);
        
        if (previousState !== this.enabled) {
            this.logger.info(`Roger Beep ${this.enabled ? 'HABILITADO' : 'DESHABILITADO'} desde configuración`);
        }
    }

    /**
     * Toggle del estado del roger beep (solo desde panel web)
     */
    toggle() {
        this.setEnabled(!this.enabled);
        return this.enabled;
    }

    /**
     * Configurar volumen (validado)
     */
    setVolume(volume) {
        const previousVolume = this.config.volume;
        this.config.volume = validateVolume(volume);
        
        if (previousVolume !== this.config.volume) {
            this.logger.info(`Volumen Roger Beep actualizado: ${Math.round(this.config.volume * 100)}%`);
        }
    }

    /**
     * Obtener configuración actual
     */
    getConfig() {
        return {
            enabled: this.enabled,
            state: this.state,
            type: this.config.type,
            volume: this.config.volume,
            duration: this.config.duration,
            delay: this.config.delay,
            frequencies: [...this.config.frequencies], // Copia del array
            isPlaying: this.isPlaying
        };
    }

    /**
     * Probar roger beep (solo desde panel web)
     */
    async test() {
        this.logger.info('Iniciando test Roger Beep Kenwood...');
        const wasEnabled = this.enabled;
        const originalState = this.state;
        
        // Forzar habilitado para el test
        this.enabled = true;
        
        try {
            await this.play();
            this.logger.info('Test Roger Beep completado exitosamente');
            return { success: true, message: 'Test ejecutado correctamente' };
        } catch (error) {
            this.logger.error('Error en test Roger Beep:', error.message);
            return { success: false, message: `Error en test: ${error.message}` };
        } finally {
            // Restaurar estado original
            this.enabled = wasEnabled;
            this.state = originalState;
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
        if (!this.isEnabled()) {
            this.logger.debug('Roger Beep deshabilitado para post-transmisión');
            return;
        }

        this.logger.info('Ejecutando Roger Beep post-transmisión');
        
        try {
            // Pequeña pausa antes del roger beep
            await delay(DELAYS.SHORT / 2); // 50ms
            await this.play();
        } catch (error) {
            this.logger.error('Error ejecutando Roger Beep post-transmisión:', error.message);
        }
    }

    /**
     * Cargar configuración desde archivo
     */
    loadConfig(config) {
        if (!config || typeof config !== 'object') {
            this.logger.warn('Configuración inválida recibida');
            return;
        }

        const changes = [];

        if (typeof config.enabled === 'boolean' && config.enabled !== this.enabled) {
            this.setEnabled(config.enabled);
            changes.push(`enabled: ${config.enabled}`);
        }
        
        if (typeof config.volume === 'number' && config.volume !== this.config.volume) {
            this.setVolume(config.volume);
            changes.push(`volume: ${Math.round(config.volume * 100)}%`);
        }

        if (typeof config.duration === 'number' && config.duration !== this.config.duration) {
            this.config.duration = Math.max(ROGER_BEEP.MIN_DURATION, 
                Math.min(ROGER_BEEP.MAX_DURATION, config.duration));
            changes.push(`duration: ${this.config.duration}ms`);
        }
        
        if (changes.length > 0) {
            this.logger.info(`Configuración cargada: ${changes.join(', ')}`);
        }
    }

    /**
     * Validar configuración completa
     */
    validateConfig() {
        const issues = [];

        if (!this.audioManager) {
            issues.push('AudioManager no está disponible');
        }

        if (this.config.volume < ROGER_BEEP.MIN_VOLUME || this.config.volume > ROGER_BEEP.MAX_VOLUME) {
            issues.push(`Volumen fuera de rango: ${this.config.volume} (${ROGER_BEEP.MIN_VOLUME}-${ROGER_BEEP.MAX_VOLUME})`);
        }

        if (this.config.duration < ROGER_BEEP.MIN_DURATION || this.config.duration > ROGER_BEEP.MAX_DURATION) {
            issues.push(`Duración fuera de rango: ${this.config.duration}ms (${ROGER_BEEP.MIN_DURATION}-${ROGER_BEEP.MAX_DURATION})`);
        }

        if (!Array.isArray(this.config.frequencies) || this.config.frequencies.length !== 3) {
            issues.push('Frecuencias Kenwood inválidas (se requieren 3 frecuencias)');
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
            volume: ROGER_BEEP.DEFAULT_VOLUME,
            duration: ROGER_BEEP.DEFAULT_DURATION,
            delay: ROGER_BEEP.DEFAULT_DELAY,
            frequencies: [...ROGER_BEEP.KENWOOD_FREQUENCIES]
        };
        this.enabled = true;
        this.state = MODULE_STATES.IDLE;
        this.isPlaying = false;
        
        this.logger.info('Roger Beep reseteado a configuración Kenwood por defecto');
    }
    
    /**
     * Destructor - limpiar recursos
     */
    destroy() {
        this.state = MODULE_STATES.DISABLED;
        this.enabled = false;
        this.isPlaying = false;
        this.logger.info('Roger Beep destruido');
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