const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Google TTS Manager para VX200 Controller
 * Sistema optimizado usando descarga directa de Google Translate
 */
class GoogleTTSManager {
    constructor(options = {}) {
        this.tempDir = options.tempDir || path.join(__dirname, 'temp');
        this.defaultLang = options.language || 'es';
        this.maxTextLength = options.maxLength || 200; // Google TTS tiene límites
        this.userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
        
        // Estadísticas
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalBytes: 0
        };
        
        this.ensureTemp();
        console.log('🌐 Google TTS Manager inicializado');
    }

    ensureTemp() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Generar audio usando Google Translate TTS
     * @param {string} text - Texto a convertir (máximo 200 caracteres)
     * @param {object} options - Opciones adicionales
     * @returns {Promise<string|null>} - Ruta del archivo generado o null
     */
    async generateSpeech(text, options = {}) {
        if (!text || text.trim().length === 0) {
            throw new Error('Texto vacío');
        }

        // Truncar texto si es muy largo
        if (text.length > this.maxTextLength) {
            console.warn(`⚠️ Texto truncado de ${text.length} a ${this.maxTextLength} caracteres`);
            text = text.substring(0, this.maxTextLength);
        }

        this.stats.totalRequests++;
        
        const lang = options.language || this.defaultLang;
        const timestamp = Date.now();
        const filename = `google_tts_${timestamp}.mp3`;
        const outputFile = path.join(this.tempDir, filename);

        try {
            console.log(`🎙️ Generando Google TTS: "${text.substring(0, 50)}..."`);
            
            // Construir URL de Google TTS
            const encodedText = encodeURIComponent(text);
            const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodedText}`;
            
            const success = await this.downloadAudio(url, outputFile);
            
            if (success) {
                const fileSize = fs.statSync(outputFile).size;
                this.stats.successfulRequests++;
                this.stats.totalBytes += fileSize;
                
                console.log(`✅ Audio generado: ${filename} (${fileSize} bytes)`);
                return outputFile;
            } else {
                this.stats.failedRequests++;
                return null;
            }
            
        } catch (error) {
            this.stats.failedRequests++;
            console.error(`❌ Error generando TTS: ${error.message}`);
            return null;
        }
    }

    /**
     * Descargar audio de Google usando curl
     * @param {string} url - URL de Google TTS
     * @param {string} outputFile - Archivo de salida
     * @returns {Promise<boolean>} - Éxito de la descarga
     */
    downloadAudio(url, outputFile) {
        return new Promise((resolve) => {
            const curl = spawn('curl', [
                '-A', this.userAgent,
                '-s', // Silent mode
                '-L', // Follow redirects
                '-o', outputFile,
                '--max-time', '10', // Timeout de 10 segundos
                '--retry', '2', // 2 reintentos
                url
            ]);

            let stderr = '';
            curl.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            curl.on('close', (code) => {
                if (code === 0 && fs.existsSync(outputFile)) {
                    const fileSize = fs.statSync(outputFile).size;
                    
                    // Verificar que el archivo no esté vacío (mínimo 1KB)
                    if (fileSize > 1000) {
                        resolve(true);
                    } else {
                        console.error('❌ Archivo de audio muy pequeño o vacío');
                        this.cleanupFile(outputFile);
                        resolve(false);
                    }
                } else {
                    console.error('❌ Error en curl:', stderr || `Código de salida: ${code}`);
                    resolve(false);
                }
            });

            curl.on('error', (error) => {
                console.error('❌ Error ejecutando curl:', error.message);
                resolve(false);
            });
        });
    }

    /**
     * Método optimizado para textos largos (divide en fragmentos)
     * @param {string} text - Texto largo
     * @param {object} options - Opciones
     * @returns {Promise<string|null>} - Archivo combinado o null
     */
    async generateLongSpeech(text, options = {}) {
        if (text.length <= this.maxTextLength) {
            return this.generateSpeech(text, options);
        }

        console.log(`📚 Texto largo detectado (${text.length} chars), dividiendo en fragmentos...`);
        
        // Dividir texto en oraciones o por puntos
        const fragments = this.splitText(text);
        const audioFiles = [];
        
        try {
            // Generar audio para cada fragmento
            for (let i = 0; i < fragments.length; i++) {
                console.log(`🎙️ Fragmento ${i + 1}/${fragments.length}: "${fragments[i].substring(0, 30)}..."`);
                
                const audioFile = await this.generateSpeech(fragments[i], options);
                if (audioFile) {
                    audioFiles.push(audioFile);
                } else {
                    console.warn(`⚠️ Falló fragmento ${i + 1}`);
                }
                
                // Pequeña pausa entre requests para no sobrecargar Google
                await this.delay(500);
            }
            
            if (audioFiles.length === 0) {
                throw new Error('No se generó ningún fragmento de audio');
            }
            
            // Combinar archivos de audio si hay múltiples
            if (audioFiles.length > 1) {
                return this.combineAudioFiles(audioFiles);
            } else {
                return audioFiles[0];
            }
            
        } catch (error) {
            // Limpiar archivos parciales
            audioFiles.forEach(file => this.cleanupFile(file));
            throw error;
        }
    }

    /**
     * Dividir texto largo en fragmentos
     * @param {string} text - Texto a dividir
     * @returns {Array<string>} - Array de fragmentos
     */
    splitText(text) {
        // Dividir por oraciones primero
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const fragments = [];
        let currentFragment = '';
        
        for (const sentence of sentences) {
            const trimmed = sentence.trim();
            if (trimmed.length === 0) continue;
            
            // Si agregar esta oración excede el límite, guardar fragmento actual
            if (currentFragment.length + trimmed.length + 2 > this.maxTextLength) {
                if (currentFragment) {
                    fragments.push(currentFragment.trim());
                    currentFragment = trimmed;
                } else {
                    // Oración individual muy larga, truncar
                    fragments.push(trimmed.substring(0, this.maxTextLength));
                }
            } else {
                currentFragment += (currentFragment ? '. ' : '') + trimmed;
            }
        }
        
        // Agregar último fragmento
        if (currentFragment.trim()) {
            fragments.push(currentFragment.trim());
        }
        
        return fragments;
    }

    /**
     * Combinar múltiples archivos de audio usando ffmpeg (soporte MP3)
     * @param {Array<string>} audioFiles - Array de archivos de audio
     * @returns {Promise<string>} - Archivo combinado
     */
    combineAudioFiles(audioFiles) {
        return new Promise((resolve, reject) => {
            const timestamp = Date.now();
            const combinedFile = path.join(this.tempDir, `combined_${timestamp}.mp3`);
            
            // Verificar si ffmpeg está disponible
            if (!this.checkCommand('ffmpeg')) {
                console.warn('⚠️ ffmpeg no disponible, usando primer fragmento solamente');
                resolve(audioFiles[0]);
                return;
            }
            
            console.log(`🔗 Combinando ${audioFiles.length} fragmentos de audio con ffmpeg...`);
            
            // Crear archivo de lista temporal para ffmpeg
            const listFile = path.join(this.tempDir, `filelist_${timestamp}.txt`);
            const fileList = audioFiles.map(file => `file '${file}'`).join('\n');
            
            try {
                fs.writeFileSync(listFile, fileList);
                
                // Usar ffmpeg para concatenar archivos MP3
                const ffmpegArgs = [
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', listFile,
                    '-c', 'copy',
                    combinedFile
                ];
                
                const ffmpeg = spawn('ffmpeg', ffmpegArgs);
                
                ffmpeg.on('close', (code) => {
                    // Limpiar archivo de lista temporal
                    if (fs.existsSync(listFile)) {
                        fs.unlinkSync(listFile);
                    }
                    
                    if (code === 0 && fs.existsSync(combinedFile)) {
                        console.log(`✅ Audio combinado con ffmpeg: ${combinedFile}`);
                        
                        // Limpiar archivos individuales
                        audioFiles.forEach(file => this.cleanupFile(file));
                        
                        resolve(combinedFile);
                    } else {
                        console.error('❌ Error combinando audio con ffmpeg');
                        resolve(audioFiles[0]); // Usar primer fragmento como fallback
                    }
                });
                
                ffmpeg.on('error', (error) => {
                    console.error('❌ Error ejecutando ffmpeg:', error.message);
                    // Limpiar archivo de lista temporal
                    if (fs.existsSync(listFile)) {
                        fs.unlinkSync(listFile);
                    }
                    resolve(audioFiles[0]); // Usar primer fragmento como fallback
                });
                
            } catch (writeError) {
                console.error('❌ Error creando lista de archivos:', writeError.message);
                resolve(audioFiles[0]); // Usar primer fragmento como fallback
            }
        });
    }

    /**
     * Reproducir archivo de audio
     * @param {string} audioFile - Ruta del archivo
     * @returns {Promise<boolean>} - Éxito de la reproducción
     */
    playAudio(audioFile) {
        return new Promise((resolve) => {
            if (!fs.existsSync(audioFile)) {
                console.error('❌ Archivo de audio no existe');
                resolve(false);
                return;
            }
            
            console.log('🔊 Reproduciendo audio...');
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
     * Verificar si un comando está disponible
     * @param {string} command - Comando a verificar
     * @returns {boolean} - Disponibilidad
     */
    checkCommand(command) {
        try {
            require('child_process').execSync(`which ${command}`, { stdio: 'ignore' });
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Limpiar archivo
     * @param {string} filePath - Archivo a eliminar
     */
    cleanupFile(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (error) {
            console.warn(`⚠️ No se pudo eliminar: ${filePath}`);
        }
    }

    /**
     * Limpiar archivos antiguos
     * @param {number} maxAge - Edad máxima en milisegundos
     */
    cleanup(maxAge = 10 * 60 * 1000) {
        try {
            const files = fs.readdirSync(this.tempDir);
            const now = Date.now();
            let cleaned = 0;
            
            files.forEach(file => {
                const filePath = path.join(this.tempDir, file);
                const stats = fs.statSync(filePath);
                
                if (now - stats.mtimeMs > maxAge) {
                    fs.unlinkSync(filePath);
                    cleaned++;
                }
            });
            
            if (cleaned > 0) {
                console.log(`🗑️ ${cleaned} archivos antiguos eliminados`);
            }
        } catch (error) {
            console.error('Error en cleanup:', error.message);
        }
    }

    /**
     * Delay helper
     * @param {number} ms - Milisegundos de espera
     * @returns {Promise} - Promise que se resuelve después del delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Obtener estadísticas
     * @returns {object} - Estadísticas de uso
     */
    getStats() {
        const successRate = this.stats.totalRequests > 0 
            ? (this.stats.successfulRequests / this.stats.totalRequests * 100).toFixed(1)
            : 0;
            
        return {
            ...this.stats,
            successRate: `${successRate}%`,
            averageFileSize: this.stats.successfulRequests > 0 
                ? Math.round(this.stats.totalBytes / this.stats.successfulRequests)
                : 0
        };
    }

    /**
     * Test rápido del sistema
     * @returns {Promise<object>} - Resultado del test
     */
    async test() {
        const testText = 'Prueba del sistema Google TTS para VX200 Controller';
        
        try {
            const audioFile = await this.generateSpeech(testText);
            
            return {
                success: !!audioFile,
                audioFile,
                stats: this.getStats(),
                message: audioFile ? 'Test exitoso' : 'Test falló'
            };
        } catch (error) {
            return {
                success: false,
                audioFile: null,
                stats: this.getStats(),
                message: error.message
            };
        }
    }
}

module.exports = GoogleTTSManager;