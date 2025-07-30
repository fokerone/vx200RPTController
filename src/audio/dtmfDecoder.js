const FFT = require('fft-js').fft;
const FFTUtil = require('fft-js').util;
const { DTMF } = require('../constants');
const { createLogger } = require('../utils');

class DTMFDecoder {
    constructor(sampleRate = 48000) {
        this.sampleRate = sampleRate;
        this.windowSize = DTMF.WINDOW_SIZE;
        this.logger = createLogger('[DTMF]');
        
        // Usar constantes del sistema
        this.frequencies = {
            low: DTMF.FREQUENCIES.LOW,
            high: DTMF.FREQUENCIES.HIGH
        };
        
        this.dtmfMatrix = DTMF.MATRIX;
        
        // Parámetros de detección
        this.threshold = DTMF.THRESHOLD;
        this.lastDetection = '';
        this.detectionCount = 0;
        this.requiredCount = DTMF.REQUIRED_COUNT;
        this.minSignalLevel = DTMF.MIN_SIGNAL_LEVEL;
        this.maxNoiseLevel = DTMF.MAX_NOISE_LEVEL;
        this.cleanupTimeout = null;
        this.cleanupInterval = DTMF.CLEANUP_INTERVAL;
        
        this.logger.info('DTMF Decoder inicializado');
    }

    /**
     * Validar que la señal es suficientemente fuerte (versión simplificada)
     */
    validateSignalQuality(audioBuffer) {
        // Solo verificar nivel mínimo de señal
        const avgLevel = audioBuffer.reduce((sum, sample) => 
            sum + Math.abs(sample), 0) / audioBuffer.length;
        
        // Señal debe ser mayor al mínimo
        return avgLevel > this.minSignalLevel;
    }

    detectDTMF(audioBuffer) {
        if (audioBuffer.length < this.windowSize) {
            return null;
        }
        
        const rmsLevel = Math.sqrt(
            audioBuffer.reduce((sum, sample) => sum + sample * sample, 0) / audioBuffer.length
        );
        
        // Debug: mostrar nivel de señal cada 100 muestras
        if (Math.random() < 0.01) { // 1% de las veces
            this.logger.debug(`Nivel RMS: ${rmsLevel.toFixed(4)} (min: ${this.minSignalLevel})`);
        }
        
        if (rmsLevel < this.minSignalLevel) {
            this.resetDetectionState();
            return null;
        }

        const windowedBuffer = audioBuffer.slice(0, this.windowSize).map((sample, index) => {
            const window = 0.54 - 0.46 * Math.cos(2 * Math.PI * index / (this.windowSize - 1));
            return sample * window;
        });
        
        const complexBuffer = windowedBuffer.map(x => [x, 0]);
        const fftResult = FFT(complexBuffer);
        const magnitudes = FFTUtil.fftMag(fftResult);
        
        const lowFreq = this.findPeakFrequency(magnitudes, this.frequencies.low);
        const highFreq = this.findPeakFrequency(magnitudes, this.frequencies.high);
        
        // Debug: mostrar frecuencias detectadas cuando hay señal fuerte
        if (rmsLevel > this.minSignalLevel * 2) {
            this.logger.debug(`Frecuencias: Low=${lowFreq} (${lowFreq >= 0 ? this.frequencies.low[lowFreq] : 'none'}Hz), High=${highFreq} (${highFreq >= 0 ? this.frequencies.high[highFreq] : 'none'}Hz)`);
        }
        
        if (lowFreq !== -1 && highFreq !== -1) {
            const dtmf = this.getDTMFChar(lowFreq, highFreq);
            if (dtmf && this.validateDualTone(magnitudes, lowFreq, highFreq)) {
                this.logger.debug(`DTMF candidato: ${dtmf}`);
                return this.confirmDetection(dtmf);
            }
        }
        
        return null;
    }
    findPeakFrequency(magnitudes, targetFreqs) {
        let bestFreqIndex = -1;
        let maxMagnitude = 0;
        const minThreshold = this.threshold * 1.5;
        
        for (let i = 0; i < targetFreqs.length; i++) {
            const freq = targetFreqs[i];
            const binIndex = Math.round(freq * this.windowSize / this.sampleRate);
            
            for (let offset = -1; offset <= 1; offset++) {
                const checkIndex = binIndex + offset;
                if (checkIndex >= 0 && checkIndex < magnitudes.length) {
                    if (magnitudes[checkIndex] > minThreshold && magnitudes[checkIndex] > maxMagnitude) {
                        const isLocalPeak = this.isLocalPeak(magnitudes, checkIndex);
                        if (isLocalPeak) {
                            maxMagnitude = magnitudes[checkIndex];
                            bestFreqIndex = i;
                        }
                    }
                }
            }
        }
        
        return bestFreqIndex;
    }

    isLocalPeak(magnitudes, index) {
        const current = magnitudes[index];
        const left = index > 0 ? magnitudes[index - 1] : 0;
        const right = index < magnitudes.length - 1 ? magnitudes[index + 1] : 0;
        return current >= left && current >= right;
    }

    validateDualTone(magnitudes, lowFreqIndex, highFreqIndex) {
        const lowFreq = this.frequencies.low[lowFreqIndex];
        const highFreq = this.frequencies.high[highFreqIndex];
        
        const lowBin = Math.round(lowFreq * this.windowSize / this.sampleRate);
        const highBin = Math.round(highFreq * this.windowSize / this.sampleRate);
        
        const lowMagnitude = magnitudes[lowBin];
        const highMagnitude = magnitudes[highBin];
        
        // Ratio más estricto para DTMF válido
        const ratio = Math.min(lowMagnitude, highMagnitude) / Math.max(lowMagnitude, highMagnitude);
        
        // Verificar que ambas frecuencias sean suficientemente fuertes
        const avgMagnitude = (lowMagnitude + highMagnitude) / 2;
        const strongEnough = avgMagnitude > this.threshold * 2;
        
        // Verificar que no haya demasiada energía en otras frecuencias (reducir falsos positivos)
        const totalEnergy = magnitudes.reduce((sum, mag) => sum + mag, 0);
        const dtmfEnergy = lowMagnitude + highMagnitude;
        const purity = dtmfEnergy / totalEnergy;
        
        this.logger.debug(`Validación dual-tone: ratio=${ratio.toFixed(3)}, strong=${strongEnough}, purity=${purity.toFixed(3)}`);
        
        return ratio > 0.4 && strongEnough && purity > 0.1;
    }

    /**
     * Obtener carácter DTMF de índices de frecuencia
     */
    getDTMFChar(lowIndex, highIndex) {
        if (lowIndex >= 0 && lowIndex < 4 && highIndex >= 0 && highIndex < 4) {
            return this.dtmfMatrix[lowIndex][highIndex];
        }
        return null;
    }

    confirmDetection(dtmf) {
        if (this.cleanupTimeout) {
            clearTimeout(this.cleanupTimeout);
        }
        
        if (dtmf === this.lastDetection) {
            this.detectionCount++;
            if (this.detectionCount >= this.requiredCount) {
                const confirmedDTMF = dtmf;
                this.resetDetectionState();
                
                this.cleanupTimeout = setTimeout(() => {
                    this.resetDetectionState();
                }, 800);
                
                return confirmedDTMF;
            }
        } else {
            this.lastDetection = dtmf;
            this.detectionCount = 1;
        }
        
        this.cleanupTimeout = setTimeout(() => {
            this.resetDetectionState();
        }, this.cleanupInterval);
        
        return null;
    }

    resetDetectionState() {
        this.lastDetection = '';
        this.detectionCount = 0;
        if (this.cleanupTimeout) {
            clearTimeout(this.cleanupTimeout);
            this.cleanupTimeout = null;
        }
    }

    /**
     * Detectar secuencia DTMF completa (ej: *123#)
     */
    detectSequence(audioBuffer, callback) {
        const dtmf = this.detectDTMF(audioBuffer);
        if (dtmf) {
            this.logger.info(`DTMF detectado: ${dtmf}`);
            callback(dtmf);
        }
    }
    
    /**
     * Cleanup resources
     */
    forceReset() {
        this.resetDetectionState();
        this.detectionCount = 0;
        this.lastDetection = '';
    }

    destroy() {
        this.forceReset();
        this.logger.info('DTMF Decoder destruido');
    }
}

module.exports = DTMFDecoder;