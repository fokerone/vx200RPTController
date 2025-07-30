const DTMFDetectionStream = require('dtmf-detection-stream');
const { Readable, Transform } = require('stream');
const { createLogger } = require('../utils');

class DTMFDecoder {
    constructor(sampleRate = 48000) {
        this.sampleRate = sampleRate;
        this.logger = createLogger('[DTMF]');
        
        // Buffer para acumular datos de audio
        this.audioBuffer = [];
        this.bufferSize = 1024; // Tamaño del buffer optimizado
        
        // Estado de detección
        this.lastDetection = '';
        this.detectionTimeout = null;
        this.detectionDelay = 150; // 150ms entre detecciones (más responsive)
        
        // Crear stream de detección DTMF
        this.setupDTMFStream();
        
        this.logger.info('DTMF Decoder inicializado (dtmf-detection-stream)');
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
            this.logger.debug(`DTMF detectado: ${data.digit} (${data.timestamp}s)`);
            this.handleDetection(data.digit);
        });
        
        this.dtmfStream.on('error', (error) => {
            this.logger.error('Error en DTMF stream:', error.message);
        });
    }
    
    handleDetection(tone) {
        const now = Date.now();
        
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
        
        this.lastDetection = tone;
        this.lastDetectionTime = now;
        
        // Emitir la detección inmediatamente
        this.logger.info(`DTMF confirmado: ${tone}`);
        if (this.onDetection) {
            this.onDetection(tone);
        }
        
        // Configurar timeout para limpiar estado
        this.detectionTimeout = setTimeout(() => {
            this.lastDetection = '';
            this.lastDetectionTime = null;
        }, 1000);
    }
    
    detectSequence(audioBuffer, callback) {
        if (!audioBuffer || audioBuffer.length === 0) {
            return;
        }
        
        // Guardar el callback para usar en handleDetection
        this.onDetection = callback;
        
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
            
            // Enviar al stream de detección
            this.dtmfStream.write(int16Buffer);
        }
    }
    
    detectDTMF(audioBuffer) {
        // Método legacy para compatibilidad
        this.detectSequence(audioBuffer, () => {});
        return null; // La detección se maneja por eventos
    }
    
    forceReset() {
        this.audioBuffer = [];
        this.lastDetection = '';
        this.lastDetectionTime = null;
        
        if (this.detectionTimeout) {
            clearTimeout(this.detectionTimeout);
            this.detectionTimeout = null;
        }
        
        this.logger.debug('Estado DTMF reiniciado');
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