const FFT = require('fft-js').fft;
const FFTUtil = require('fft-js').util;

class DTMFDecoder {
    constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.windowSize = 1024;
    
    // Frecuencias DTMF estándar
    this.frequencies = {
        low: [697, 770, 852, 941],
        high: [1209, 1336, 1477, 1633]
    };
    
    // Matriz DTMF
    this.dtmfMatrix = [
        ['1', '2', '3', 'A'],
        ['4', '5', '6', 'B'], 
        ['7', '8', '9', 'C'],
        ['*', '0', '#', 'D']
    ];
    
    // PARÁMETROS BALANCEADOS
    this.threshold = 0.05;          // Entre 0.01 y 0.1
    this.lastDetection = '';
    this.detectionCount = 0;
    this.requiredCount = 3;         // Volvemos a 3
    this.minSignalLevel = 0.02;     // Más permisivo
    this.maxNoiseLevel = 0.1;       // Más permisivo
    this.cleanupTimeout = null;
    this.cleanupInterval = 3000;    // 3 segundos más rápido
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

    /**
     * Detectar DTMF en buffer de audio
     */
    detectDTMF(audioBuffer) {
    if (audioBuffer.length < this.windowSize) {
        return null;
    }
    
    // Validación simplificada
    const avgLevel = audioBuffer.reduce((sum, sample) => 
        sum + Math.abs(sample), 0) / audioBuffer.length;
    
    if (avgLevel < this.minSignalLevel) {
        return null;
    }

    // Aplicar FFT
    const complexBuffer = audioBuffer.slice(0, this.windowSize).map(x => [x, 0]);
    const fftResult = FFT(complexBuffer);
    const magnitudes = FFTUtil.fftMag(fftResult);
    
    // Buscar picos en frecuencias DTMF
    const lowFreq = this.findPeakFrequency(magnitudes, this.frequencies.low);
    const highFreq = this.findPeakFrequency(magnitudes, this.frequencies.high);
    
    if (lowFreq !== -1 && highFreq !== -1) {
        const dtmf = this.getDTMFChar(lowFreq, highFreq);
        return this.confirmDetection(dtmf);
    }
    
    return null;
}
    /**
     * Encontrar pico de frecuencia más cercano
     */
    findPeakFrequency(magnitudes, targetFreqs) {
        let bestFreqIndex = -1;
        let maxMagnitude = 0;
        
        for (let i = 0; i < targetFreqs.length; i++) {
            const freq = targetFreqs[i];
            const binIndex = Math.round(freq * this.windowSize / this.sampleRate);
            
            if (binIndex < magnitudes.length && magnitudes[binIndex] > this.threshold) {
                if (magnitudes[binIndex] > maxMagnitude) {
                    maxMagnitude = magnitudes[binIndex];
                    bestFreqIndex = i;
                }
            }
        }
        
        return bestFreqIndex;
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

    /**
     * Confirmar detección con múltiples muestras
     */
    confirmDetection(dtmf) {
    // Limpiar timeout anterior
    if (this.cleanupTimeout) {
        clearTimeout(this.cleanupTimeout);
    }
    
    if (dtmf === this.lastDetection) {
        this.detectionCount++;
        if (this.detectionCount >= this.requiredCount) {
            this.detectionCount = 0;
            this.lastDetection = '';
            return dtmf; // ¡Detección confirmada!
        }
    } else {
        this.lastDetection = dtmf;
        this.detectionCount = 1;
    }
    
    // Auto-limpiar si no hay más detecciones
    this.cleanupTimeout = setTimeout(() => {
        this.lastDetection = '';
        this.detectionCount = 0;
    }, this.cleanupInterval);
    
    return null;
}

    /**
     * Detectar secuencia DTMF completa (ej: *123#)
     */
    detectSequence(audioBuffer, callback) {
        const dtmf = this.detectDTMF(audioBuffer);
        if (dtmf) {
            console.log(`🎵 DTMF detectado: ${dtmf}`);
            callback(dtmf);
        }
    }
}

module.exports = DTMFDecoder;