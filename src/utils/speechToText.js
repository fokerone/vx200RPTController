const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('../logging/Logger');

class SpeechToText {
    constructor() {
        this.logger = createLogger('[SpeechToText]');
        this.openai = null;
        this.apiKey = process.env.OPENAI_API_KEY || null;
        
        // Configuración
        this.config = {
            model: 'whisper-1',
            language: 'es', // Español
            response_format: 'text',
            temperature: 0.0, // Más determinístico
            timeout: 30000 // 30 segundos timeout
        };

        this.initializeOpenAI();
    }

    /**
     * Inicializar cliente OpenAI
     */
    initializeOpenAI() {
        if (this.apiKey) {
            try {
                this.openai = new OpenAI({
                    apiKey: this.apiKey,
                    timeout: this.config.timeout
                });
                this.logger.info('Cliente OpenAI Whisper inicializado');
            } catch (error) {
                this.logger.error('Error inicializando OpenAI:', error.message);
                this.openai = null;
            }
        } else {
            this.logger.warn('API key de OpenAI no configurada - STT deshabilitado');
        }
    }

    /**
     * Transcribir archivo de audio a texto
     * @param {string} audioFilePath - Ruta al archivo de audio
     * @returns {Promise<string>} - Texto transcrito
     */
    async transcribeFile(audioFilePath) {
        if (!this.openai) {
            throw new Error('Cliente OpenAI no configurado - Verifique API key');
        }

        if (!fs.existsSync(audioFilePath)) {
            throw new Error(`Archivo de audio no encontrado: ${audioFilePath}`);
        }

        try {
            this.logger.debug(`Transcribiendo archivo: ${audioFilePath}`);
            
            // Verificar tamaño del archivo (máximo 25MB)
            const stats = fs.statSync(audioFilePath);
            const fileSizeMB = stats.size / (1024 * 1024);
            
            if (fileSizeMB > 25) {
                throw new Error(`Archivo muy grande: ${fileSizeMB.toFixed(1)}MB (máximo 25MB)`);
            }

            // Crear stream del archivo
            const audioStream = fs.createReadStream(audioFilePath);

            // Llamar a la API de Whisper
            const transcription = await this.openai.audio.transcriptions.create({
                file: audioStream,
                model: this.config.model,
                language: this.config.language,
                response_format: this.config.response_format,
                temperature: this.config.temperature
            });

            // Limpiar y normalizar el texto
            const text = this.cleanTranscription(transcription);
            
            this.logger.info(`Transcripción exitosa: "${text}"`);
            return text;

        } catch (error) {
            this.logger.error('Error en transcripción:', error.message);
            
            // Manejar errores específicos de OpenAI
            if (error.status === 401) {
                throw new Error('API key inválida o expirada');
            } else if (error.status === 429) {
                throw new Error('Límite de velocidad excedido - Intente más tarde');
            } else if (error.status === 413) {
                throw new Error('Archivo muy grande - Máximo 25MB');
            } else {
                throw new Error(`Error de transcripción: ${error.message}`);
            }
        }
    }

    /**
     * Transcribir buffer de audio
     * @param {Buffer} audioBuffer - Buffer de audio
     * @param {string} format - Formato del audio (wav, mp3, etc.)
     * @returns {Promise<string>} - Texto transcrito
     */
    async transcribeBuffer(audioBuffer, format = 'wav') {
        if (!this.openai) {
            throw new Error('Cliente OpenAI no configurado');
        }

        try {
            // Crear archivo temporal
            const tempDir = path.join(__dirname, '../../temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const tempFileName = `voice_${Date.now()}.${format}`;
            const tempFilePath = path.join(tempDir, tempFileName);

            // Escribir buffer a archivo temporal
            fs.writeFileSync(tempFilePath, audioBuffer);

            try {
                // Transcribir archivo temporal
                const result = await this.transcribeFile(tempFilePath);
                return result;
            } finally {
                // Limpiar archivo temporal
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
            }

        } catch (error) {
            this.logger.error('Error transcribiendo buffer:', error.message);
            throw error;
        }
    }

    /**
     * Limpiar y normalizar transcripción
     * @param {string} text - Texto crudo de Whisper
     * @returns {string} - Texto limpio
     */
    cleanTranscription(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }

        return text
            .trim() // Quitar espacios al inicio/final
            .toLowerCase() // Convertir a minúsculas
            .replace(/[^\w\sáéíóúñü]/g, '') // Quitar puntuación, mantener acentos
            .replace(/\s+/g, ' ') // Múltiples espacios → uno solo
            .trim();
    }

    /**
     * Verificar si STT está disponible
     * @returns {boolean}
     */
    isAvailable() {
        return !!this.openai;
    }

    /**
     * Obtener información del servicio
     * @returns {object}
     */
    getServiceInfo() {
        return {
            provider: 'OpenAI Whisper',
            model: this.config.model,
            language: this.config.language,
            available: this.isAvailable(),
            maxFileSize: '25MB',
            supportedFormats: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm']
        };
    }

    /**
     * Test básico del servicio
     * @returns {Promise<boolean>}
     */
    async testService() {
        if (!this.isAvailable()) {
            this.logger.warn('Servicio STT no disponible para test');
            return false;
        }

        try {
            // Crear un archivo de audio de test muy pequeño (silencio)
            const testBuffer = Buffer.alloc(1024); // Buffer vacío
            await this.transcribeBuffer(testBuffer, 'wav');
            return true;
        } catch (error) {
            this.logger.error('Test de STT falló:', error.message);
            return false;
        }
    }
}

// Singleton
let speechToTextInstance = null;

function getSpeechToText() {
    if (!speechToTextInstance) {
        speechToTextInstance = new SpeechToText();
    }
    return speechToTextInstance;
}

module.exports = {
    SpeechToText,
    getSpeechToText
};