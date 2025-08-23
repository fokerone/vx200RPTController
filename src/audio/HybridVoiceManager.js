const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createLogger } = require('../logging/Logger');
const GoogleTTSManager = require('../../google-tts-capture/GoogleTTSManager');

/**
 * Sistema híbrido de voz con Google TTS como principal y espeak como fallback
 * Prioridad: Google TTS -> Espeak robótico
 */
class HybridVoiceManager {
    constructor(audioManager = null) {
        this.logger = createLogger('[HybridVoiceManager]');
        this.audioManager = audioManager;
        
        this.config = {
            googleTTS: {
                enabled: true,
                priority: 1,
                maxTextLength: 200,
                timeout: 15000, // 15s timeout para Google
                language: 'es'
            },
            espeakTTS: {
                enabled: true,
                priority: 2, // Fallback
                voice: 'es',
                speed: '160',
                amplitude: 85,
                pitch: 50,
                gaps: 4,
                timeout: 30000
            },
            tempDir: path.join(__dirname, '../../temp'),
            maxRetries: 2
        };

        // Estadísticas de uso
        this.stats = {
            googleSuccess: 0,
            googleFailures: 0,
            espeakUsed: 0,
            totalRequests: 0
        };

        // Asegurar directorio temporal
        if (!fs.existsSync(this.config.tempDir)) {
            fs.mkdirSync(this.config.tempDir, { recursive: true });
        }

        // Inicializar Google TTS Manager
        this.googleTTS = new GoogleTTSManager({
            tempDir: this.config.tempDir,
            language: this.config.googleTTS.language,
            maxLength: this.config.googleTTS.maxTextLength
        });

        this.logger.info('Sistema TTS híbrido iniciado');
    }

    /**
     * Generar audio de texto usando el mejor método disponible
     * @param {string} text - Texto a convertir a voz
     * @param {object} options - Opciones de voz
     * @returns {Promise<string>} - Ruta del archivo de audio generado
     */
    async generateSpeech(text, options = {}) {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            throw new Error('Texto vacío o inválido');
        }

        this.stats.totalRequests++;
        
        // Limpiar y preparar texto
        const cleanText = this.sanitizeText(text);
        
        this.logger.info(`Generando voz para: "${cleanText.substring(0, 40)}${cleanText.length > 40 ? '...' : ''}"`);

        // Intentar Google TTS primero
        if (this.config.googleTTS.enabled) {
            try {
                const audioFile = await this.generateGoogleSpeech(cleanText, options);
                if (audioFile) {
                    this.stats.googleSuccess++;
                    this.logger.info('Voz generada exitosamente con Google TTS');
                    return audioFile;
                }
            } catch (error) {
                this.logger.warn('Google TTS falló:', error.message);
                this.stats.googleFailures++;
            }
        }

        // Fallback a TTS espeak
        if (this.config.espeakTTS.enabled) {
            try {
                const audioFile = await this.generateEspeakSpeech(cleanText, options);
                this.stats.espeakUsed++;
                this.logger.info('Fallback a espeak exitoso');
                return audioFile;
            } catch (error) {
                this.logger.error('Espeak también falló:', error.message);
                throw new Error('Todos los sistemas de TTS fallaron');
            }
        }

        throw new Error('No hay sistemas de TTS habilitados');
    }

    /**
     * Generar voz usando Google TTS
     * @param {string} text 
     * @param {object} options 
     * @returns {Promise<string|null>}
     */
    async generateGoogleSpeech(text, options = {}) {
        try {
            this.logger.debug('Intentando Google TTS...');
            
            // Usar Google TTS Manager
            const audioFile = await this.googleTTS.generateSpeech(text, {
                language: options.language || this.config.googleTTS.language
            });
            
            if (audioFile && fs.existsSync(audioFile) && fs.statSync(audioFile).size > 1000) {
                this.logger.debug(`Google TTS generó: ${audioFile}`);
                return audioFile;
            }
            
            return null;
        } catch (error) {
            this.logger.error('Error en Google TTS:', error.message);
            return null;
        }
    }

    /**
     * Generar voz usando espeak (fallback)
     * @param {string} text 
     * @param {object} options 
     * @returns {Promise<string>}
     */
    async generateEspeakSpeech(text, options = {}) {
        return new Promise((resolve, reject) => {
            const timestamp = Date.now();
            const outputFile = path.join(this.config.tempDir, `espeak_fallback_${timestamp}.wav`);
            
            const voice = options.voice || this.config.espeakTTS.voice;
            const speed = options.speed || this.config.espeakTTS.speed;
            const amplitude = options.amplitude || this.config.espeakTTS.amplitude;
            const pitch = options.pitch || this.config.espeakTTS.pitch;
            const gaps = options.gaps || this.config.espeakTTS.gaps;

            const args = [
                '-v', voice,
                '-s', speed,
                '-a', amplitude.toString(),
                '-p', pitch.toString(),
                '-g', gaps.toString(),
                '-w', outputFile,
                text
            ];

            const espeak = spawn('espeak', args);

            let stderr = '';
            espeak.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            espeak.on('close', (code) => {
                if (code === 0 && fs.existsSync(outputFile)) {
                    resolve(outputFile);
                } else {
                    reject(new Error(`espeak falló: ${stderr}`));
                }
            });

            espeak.on('error', (error) => {
                reject(new Error(`Error ejecutando espeak: ${error.message}`));
            });
        });
    }

    /**
     * Método optimizado para textos largos
     * @param {string} text - Texto largo
     * @param {object} options - Opciones
     * @returns {Promise<string>} - Archivo de audio
     */
    async generateLongSpeech(text, options = {}) {
        if (text.length <= this.config.googleTTS.maxTextLength) {
            return this.generateSpeech(text, options);
        }

        this.logger.info(`Texto largo detectado (${text.length} chars), usando Google TTS con fragmentos...`);
        
        // Intentar con Google TTS para textos largos
        if (this.config.googleTTS.enabled) {
            try {
                const audioFile = await this.googleTTS.generateLongSpeech(text, options);
                if (audioFile) {
                    this.stats.googleSuccess++;
                    this.logger.info('Texto largo procesado con Google TTS');
                    return audioFile;
                }
            } catch (error) {
                this.logger.warn('Google TTS falló para texto largo:', error.message);
                this.stats.googleFailures++;
            }
        }

        // Fallback: usar espeak con texto truncado
        const truncatedText = text.substring(0, 500); // Límite espeak
        this.logger.warn(`Usando fallback espeak con texto truncado: ${truncatedText.length} chars`);
        
        return this.generateEspeakSpeech(truncatedText, options);
    }

    /**
     * Limpiar y sanitizar texto para TTS
     * @param {string} text 
     * @returns {string}
     */
    sanitizeText(text) {
        return text
            .replace(/[^\w\sáéíóúñüÁÉÍÓÚÑÜ.,!?¡¿]/g, '') // Quitar caracteres especiales
            .replace(/\s+/g, ' ') // Múltiples espacios a uno
            .trim()
            .substring(0, 1000); // Limitar longitud total
    }

    /**
     * Reproducir archivo de audio
     * @param {string} audioFile - Ruta del archivo
     * @returns {Promise<boolean>} - Éxito de la reproducción
     */
    async playAudio(audioFile) {
        if (!fs.existsSync(audioFile)) {
            this.logger.error('Archivo de audio no existe');
            return false;
        }

        // Si tenemos AudioManager, usar su sistema de reproducción (lógica simplex)
        if (this.audioManager) {
            try {
                await this.audioManager.playWeatherAlertWithPaplay(audioFile);
                return true;
            } catch (error) {
                this.logger.error('Error reproduciendo con AudioManager:', error.message);
                return false;
            }
        }

        // Fallback al método directo si no hay AudioManager
        return new Promise((resolve) => {
            this.logger.debug('Reproduciendo audio directamente...');
            const paplay = spawn('paplay', [audioFile]);
            
            paplay.on('close', (code) => {
                resolve(code === 0);
            });
            
            paplay.on('error', () => {
                resolve(false);
            });
        });
    }

    /**
     * Obtener estadísticas de uso
     * @returns {object}
     */
    getStats() {
        const totalAttempts = this.stats.googleSuccess + this.stats.googleFailures;
        const googleSuccessRate = totalAttempts > 0 ? (this.stats.googleSuccess / totalAttempts * 100).toFixed(1) : 0;
        
        return {
            totalRequests: this.stats.totalRequests,
            googleTTS: {
                successful: this.stats.googleSuccess,
                failures: this.stats.googleFailures,
                successRate: `${googleSuccessRate}%`
            },
            espeakFallback: this.stats.espeakUsed,
            currentMode: this.config.googleTTS.enabled ? 'hybrid' : 'espeak-only',
            preferredEngine: 'Google TTS'
        };
    }

    /**
     * Configurar sistema de voz
     * @param {object} newConfig 
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.logger.info('Configuración de HybridVoiceManager actualizada');
    }

    /**
     * Limpiar archivos temporales antiguos
     */
    cleanupTempFiles() {
        try {
            const files = fs.readdirSync(this.config.tempDir);
            const now = Date.now();
            let cleaned = 0;

            files.forEach(file => {
                const filePath = path.join(this.config.tempDir, file);
                const stats = fs.statSync(filePath);
                
                // Eliminar archivos de más de 1 hora
                if (now - stats.mtimeMs > 3600000) {
                    fs.unlinkSync(filePath);
                    cleaned++;
                }
            });

            if (cleaned > 0) {
                this.logger.info(`Archivos temporales limpiados: ${cleaned}`);
            }
        } catch (error) {
            this.logger.error('Error limpiando archivos temporales:', error.message);
        }
    }

    /**
     * Test del sistema híbrido
     * @returns {Promise<object>}
     */
    async testSystem() {
        const testText = 'Prueba del sistema híbrido de voz con Google TTS y fallback espeak';
        const results = {
            googleTTS: false,
            espeakTTS: false,
            overallSuccess: false
        };

        try {
            // Test Google TTS
            if (this.config.googleTTS.enabled) {
                try {
                    const googleFile = await this.generateGoogleSpeech(testText);
                    results.googleTTS = !!googleFile;
                    if (googleFile && fs.existsSync(googleFile)) {
                        fs.unlinkSync(googleFile); // Limpiar test
                    }
                } catch (error) {
                    this.logger.warn('Test Google TTS falló:', error.message);
                }
            }

            // Test espeak fallback
            try {
                const espeakFile = await this.generateEspeakSpeech(testText);
                results.espeakTTS = !!espeakFile;
                if (espeakFile && fs.existsSync(espeakFile)) {
                    fs.unlinkSync(espeakFile); // Limpiar test
                }
            } catch (error) {
                this.logger.warn('Test espeak falló:', error.message);
            }

            results.overallSuccess = results.googleTTS || results.espeakTTS;
            
            this.logger.info(`Test completado - Google: ${results.googleTTS ? 'OK' : 'FAIL'}, Espeak: ${results.espeakTTS ? 'OK' : 'FAIL'}`);
            
            return results;
        } catch (error) {
            this.logger.error('Error en test del sistema:', error.message);
            return results;
        }
    }

    /**
     * Destructor
     */
    destroy() {
        this.cleanupTempFiles();
        if (this.googleTTS && typeof this.googleTTS.cleanup === 'function') {
            this.googleTTS.cleanup();
        }
        this.logger.info('HybridVoiceManager destruido');
    }
}

module.exports = HybridVoiceManager;