const DTMFDetectionStream = require('dtmf-detection-stream');
const { Readable, Transform } = require('stream');
const { createLogger } = require('../utils');

class DTMFDecoder {
    constructor(sampleRate = 48000) {
        this.sampleRate = sampleRate;
        this.logger = createLogger('[DTMF]');
        
        // Buffer para acumular datos de audio
        this.audioBuffer = [];
        this.bufferSize = 2048; // Buffer más grande para mejor análisis
        
        // Estado de detección
        this.lastDetection = '';
        this.detectionTimeout = null;
        this.detectionDelay = 300; // Aumentado a 300ms para reducir falsos positivos
        
        // Estado de habilitación
        this.enabled = true;
        
        // Validación anti-falsos positivos
        this.detectionHistory = new Map(); // Historial de detecciones por tono
        this.minDetectionCount = 1; // Empezar con 1 para probar
        this.maxDetectionWindow = 600; // Ventana más corta
        this.voiceActivityThreshold = 0.25; // Umbral más alto para reducir falsos positivos de voz
        this.consecutiveVoiceFrames = 0;
        this.maxVoiceFramesBeforeDisable = 20; // Más tolerante - 20 frames antes de deshabilitar
        
        // Crear stream de detección DTMF
        this.setupDTMFStream();
        
        this.logger.info('DTMF Decoder inicializado con filtros anti-voz');
    }
    
    setupDTMFStream() {
        // Configurar el stream de detección
        this.dtmfStream = new DTMFDetectionStream({
            format: {
                sampleRate: this.sampleRate,
                bitDepth: 16,
                channels: 1
            }
        });
        
        // Escuchar eventos de detección
        this.dtmfStream.on('dtmf', (data) => {
            this.logger.info(`🎵 DTMF detectado por stream: ${data.digit} (${data.timestamp}s)`);
            this.handleDetection(data.digit);
        });
        
        this.dtmfStream.on('error', (error) => {
            this.logger.error('Error en DTMF stream:', error.message);
        });
    }
    
    handleDetection(tone) {
        // Si el detector está deshabilitado, ignorar detecciones
        if (!this.enabled) {
            return;
        }
        
        const now = Date.now();
        
        // Verificar si hay demasiada actividad de voz
        if (this.consecutiveVoiceFrames > this.maxVoiceFramesBeforeDisable) {
            this.logger.info(`🔇 DTMF ignorado por actividad de voz: ${tone} (frames: ${this.consecutiveVoiceFrames})`);
            return;
        }
        
        // Evitar detecciones duplicadas muy rápidas
        if (this.detectionTimeout) {
            clearTimeout(this.detectionTimeout);
        }
        
        // Si es el mismo tono muy seguido, ignorar
        if (this.lastDetection === tone && 
            this.lastDetectionTime && 
            (now - this.lastDetectionTime) < this.detectionDelay) {
            return;
        }
        
        // Validación con historial de detecciones
        if (!this.validateDetection(tone, now)) {
            return;
        }
        
        this.lastDetection = tone;
        this.lastDetectionTime = now;
        
        // Emitir la detección confirmada
        this.logger.info(`DTMF confirmado tras validación: ${tone}`);
        if (this.onDetection) {
            this.onDetection(tone);
        }
        
        // Configurar timeout para limpiar estado
        this.detectionTimeout = setTimeout(() => {
            this.lastDetection = '';
            this.lastDetectionTime = null;
        }, 1000);
    }

    /**
     * Validar detección usando historial para evitar falsos positivos
     */
    validateDetection(tone, timestamp) {
        // Obtener historial de este tono
        let history = this.detectionHistory.get(tone);
        if (!history) {
            history = [];
            this.detectionHistory.set(tone, history);
        }
        
        // Agregar detección actual
        history.push(timestamp);
        
        // Limpiar detecciones fuera de la ventana de tiempo
        const cutoff = timestamp - this.maxDetectionWindow;
        while (history.length > 0 && history[0] < cutoff) {
            history.shift();
        }
        
        // Verificar si tenemos suficientes detecciones en la ventana
        if (history.length >= this.minDetectionCount) {
            // Limpiar historial para evitar acumulación
            this.detectionHistory.set(tone, [timestamp]);
            return true;
        }
        
        this.logger.info(`⏳ DTMF pendiente validación: ${tone} (${history.length}/${this.minDetectionCount})`);
        return false;
    }
    
    detectSequence(audioBuffer, callback) {
        if (!audioBuffer || audioBuffer.length === 0) {
            return;
        }
        
        // Guardar el callback para usar en handleDetection
        this.onDetection = callback;
        
        // Detectar actividad de voz antes de procesar DTMF
        const voiceActivity = this.detectVoiceActivity(audioBuffer);
        
        // Acumular datos de audio
        this.audioBuffer.push(...audioBuffer);
        
        // Procesar cuando tengamos suficientes datos
        while (this.audioBuffer.length >= this.bufferSize) {
            const chunk = this.audioBuffer.splice(0, this.bufferSize);
            
            // Convertir float32 array a Buffer Int16
            const int16Buffer = Buffer.alloc(chunk.length * 2);
            for (let i = 0; i < chunk.length; i++) {
                const sample = Math.max(-1, Math.min(1, chunk[i]));
                const int16Sample = Math.round(sample * 32767);
                int16Buffer.writeInt16LE(int16Sample, i * 2);
            }
            
            // Enviar al stream de detección solo si no hay mucha voz
            if (this.consecutiveVoiceFrames <= this.maxVoiceFramesBeforeDisable) {
                this.dtmfStream.write(int16Buffer);
            }
        }
    }

    /**
     * Detectar actividad de voz para filtrar falsos positivos DTMF
     */
    detectVoiceActivity(audioBuffer) {
        if (!audioBuffer || audioBuffer.length === 0) {
            return false;
        }
        
        // Calcular energía RMS del audio
        let sumSquares = 0;
        for (let i = 0; i < audioBuffer.length; i++) {
            sumSquares += audioBuffer[i] * audioBuffer[i];
        }
        const rms = Math.sqrt(sumSquares / audioBuffer.length);
        
        // Calcular varianza espectral simple (indicador de habla)
        let variance = 0;
        for (let i = 1; i < audioBuffer.length; i++) {
            const diff = audioBuffer[i] - audioBuffer[i - 1];
            variance += diff * diff;
        }
        const spectralVariance = variance / (audioBuffer.length - 1);
        
        // Detectar actividad de voz basada en energía y varianza
        const hasVoiceActivity = rms > this.voiceActivityThreshold && spectralVariance > 0.001;
        
        // Actualizar contador de frames consecutivos con voz
        if (hasVoiceActivity) {
            this.consecutiveVoiceFrames++;
            if (this.consecutiveVoiceFrames === this.maxVoiceFramesBeforeDisable + 1) {
                this.logger.debug('DTMF temporalmente deshabilitado por actividad de voz continua');
            }
        } else {
            if (this.consecutiveVoiceFrames > 0) {
                this.consecutiveVoiceFrames = Math.max(0, this.consecutiveVoiceFrames - 2); // Decaer más rápido
                if (this.consecutiveVoiceFrames <= this.maxVoiceFramesBeforeDisable && this.consecutiveVoiceFrames + 2 > this.maxVoiceFramesBeforeDisable) {
                    this.logger.debug('DTMF rehabilitado tras fin de actividad de voz');
                }
            }
        }
        
        return hasVoiceActivity;
    }
    
    detectDTMF(audioBuffer) {
        // Método legacy para compatibilidad
        this.detectSequence(audioBuffer, () => {});
        return null; // La detección se maneja por eventos
    }
    
    /**
     * Habilitar detector DTMF
     */
    enable() {
        this.enabled = true;
        this.logger.debug('Detector DTMF habilitado');
    }
    
    /**
     * Deshabilitar detector DTMF
     */
    disable() {
        this.enabled = false;
        this.logger.debug('Detector DTMF deshabilitado');
    }
    
    /**
     * Verificar si el detector está habilitado
     * @returns {boolean}
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * Configurar sensibilidad del detector DTMF
     */
    setSensitivity(level) {
        switch (level) {
            case 'low': // Muy conservador - para canales con mucha voz
                this.minDetectionCount = 2;
                this.maxDetectionWindow = 1000;
                this.voiceActivityThreshold = 0.30;
                this.maxVoiceFramesBeforeDisable = 25;
                this.detectionDelay = 350;
                break;
            case 'medium': // Balanceado - configuración por defecto
                this.minDetectionCount = 1;
                this.maxDetectionWindow = 600;
                this.voiceActivityThreshold = 0.25;
                this.maxVoiceFramesBeforeDisable = 20;
                this.detectionDelay = 250;
                break;
            case 'high': // Más sensible - para canales limpios
                this.minDetectionCount = 1;
                this.maxDetectionWindow = 400;
                this.voiceActivityThreshold = 0.35;
                this.maxVoiceFramesBeforeDisable = 8;
                this.detectionDelay = 150;
                break;
        }
        this.logger.info(`Sensibilidad DTMF configurada: ${level}`);
    }

    /**
     * Obtener estadísticas del detector
     */
    getStats() {
        return {
            enabled: this.enabled,
            consecutiveVoiceFrames: this.consecutiveVoiceFrames,
            voiceSuppressed: this.consecutiveVoiceFrames > this.maxVoiceFramesBeforeDisable,
            pendingValidations: this.detectionHistory.size,
            lastDetection: this.lastDetection,
            config: {
                minDetectionCount: this.minDetectionCount,
                maxDetectionWindow: this.maxDetectionWindow,
                voiceActivityThreshold: this.voiceActivityThreshold,
                maxVoiceFramesBeforeDisable: this.maxVoiceFramesBeforeDisable,
                detectionDelay: this.detectionDelay
            }
        };
    }

    /**
     * Modo debug - deshabilitar temporalmente todas las validaciones
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
        if (enabled) {
            this.logger.warn('🐛 DTMF en modo DEBUG - validaciones deshabilitadas');
            this.minDetectionCount = 1;
            this.maxVoiceFramesBeforeDisable = 1000; // Muy alto
            this.detectionDelay = 100; // Muy bajo
        } else {
            this.logger.info('🔧 DTMF saliendo de modo DEBUG');
            this.setSensitivity('medium'); // Restaurar configuración
        }
    }
    
    forceReset() {
        this.audioBuffer = [];
        this.lastDetection = '';
        this.lastDetectionTime = null;
        this.consecutiveVoiceFrames = 0;
        this.detectionHistory.clear();
        
        if (this.detectionTimeout) {
            clearTimeout(this.detectionTimeout);
            this.detectionTimeout = null;
        }
        
        this.logger.debug('Estado DTMF reiniciado completamente');
    }
    
    destroy() {
        this.forceReset();
        
        if (this.dtmfStream) {
            this.dtmfStream.removeAllListeners();
            this.dtmfStream.destroy();
        }
        
        this.logger.info('DTMF Decoder destruido');
    }
}

module.exports = DTMFDecoder;