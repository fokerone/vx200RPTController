const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { MODULE_STATES, VALIDATION, ERROR_MESSAGES } = require('../constants');
const { delay, createLogger, validateRecordingDuration, sanitizeTextForTTS, generateSessionId } = require('../utils');

class AIChat {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.logger = createLogger('[AIChat]');
        this.state = MODULE_STATES.IDLE;
        
        this.config = {
            enabled: false, // Deshabilitado por defecto hasta configurar API
            provider: 'openai',
            model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
            maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 150,
            temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
            recordingDuration: VALIDATION.MIN_RECORDING_DURATION + 5,
            apiKey: process.env.OPENAI_API_KEY || null,
            basePrompt: process.env.OPENAI_BASE_PROMPT || 'Eres un asistente de radio amateur. Responde de forma breve y clara en español latino.'
        };
        
        this.currentSession = null;
        this.sessionId = null;
        
        // Validar configuración al inicializar
        this.validateConfiguration();
        
        this.logger.info(`Módulo AI Chat inicializado (${this.config.enabled ? 'HABILITADO' : 'DESHABILITADO'})`);
    }

    /**
     * Validar configuración del módulo
     */
    validateConfiguration() {
        if (!this.config.apiKey) {
            this.logger.warn('API Key no configurada - módulo deshabilitado');
            this.config.enabled = false;
            return false;
        }

        const durationValidation = validateRecordingDuration(this.config.recordingDuration);
        if (!durationValidation.valid) {
            this.logger.warn(`Duración de grabación inválida: ${durationValidation.message}`);
            this.config.recordingDuration = VALIDATION.MIN_RECORDING_DURATION + 5;
        }

        return true;
    }

    /**
     * Ejecutar cuando se recibe comando DTMF *2
     */
    async execute(command) {
        this.logger.info(`Ejecutado por comando: ${command}`);
        
        if (!this.config.enabled) {
            this.logger.warn('Módulo deshabilitado');
            await this.audioManager.speak(sanitizeTextForTTS('Módulo de inteligencia artificial deshabilitado'));
            return;
        }

        if (this.state !== MODULE_STATES.IDLE) {
            this.logger.warn(`Módulo ocupado en estado: ${this.state}`);
            await this.audioManager.speak(sanitizeTextForTTS('Sistema de inteligencia artificial ocupado'));
            return;
        }

        try {
            this.state = MODULE_STATES.ACTIVE;
            await this.startAISession();
        } catch (error) {
            this.logger.error('Error ejecutando AI Chat:', error.message);
            await this.audioManager.speak(sanitizeTextForTTS(ERROR_MESSAGES.TRANSMISSION_ERROR));
            this.state = MODULE_STATES.ERROR;
        } finally {
            this.state = MODULE_STATES.IDLE;
        }
    }

    /**
     * Iniciar sesión de IA
     */
    async startAISession() {
        this.sessionId = generateSessionId();
        this.currentSession = {
            id: this.sessionId,
            timestamp: new Date(),
            question: null,
            response: null
        };

        this.logger.info(`Iniciando sesión AI [${this.sessionId}]`);
        
        // Instrucciones iniciales
        const instructions = sanitizeTextForTTS('Modo inteligencia artificial activado. Haga su consulta ahora.');
        await this.audioManager.speak(instructions);
        
        await delay(1000);
        
        // Grabar pregunta
        const audioFile = await this.recordQuestion();
        
        if (!audioFile) {
            await this.audioManager.speak(sanitizeTextForTTS(ERROR_MESSAGES.RECORDING_ERROR));
            return;
        }
        
        // Convertir a texto
        const question = await this.speechToText(audioFile);
        
        if (!question) {
            await this.audioManager.speak(sanitizeTextForTTS('No se pudo procesar la consulta'));
            return;
        }
        
        this.currentSession.question = question;
        this.logger.info(`Pregunta: ${question}`);
        
        // Obtener respuesta de IA
        await this.audioManager.speak(sanitizeTextForTTS('Procesando consulta, por favor espere'));
        
        const response = await this.getAIResponse(question);
        
        if (!response) {
            await this.audioManager.speak(sanitizeTextForTTS('Error obteniendo respuesta de la inteligencia artificial'));
            return;
        }
        
        this.currentSession.response = response;
        this.logger.info(`Respuesta generada: ${response.substring(0, 100)}...`);
        
        // Reproducir respuesta
        const responseText = sanitizeTextForTTS(`Respuesta: ${response}`);
        await this.audioManager.speak(responseText);
        
        this.logger.info('Sesión AI completada exitosamente');
    }
    /**
     * Grabar pregunta del usuario
     */
    async recordQuestion() {
        this.logger.info(`Iniciando grabación por ${this.config.recordingDuration} segundos`);
        
        // Pausar grabación principal
        const wasPaused = this.audioManager.pauseRecording();
        
        try {
            // Esperar un momento para que se libere el dispositivo
            await delay(500);
            
            // Grabar usando el método temporal del AudioManager
            const filepath = await this.audioManager.recordTemporary(
                this.config.recordingDuration, 
                16000
            );
            
            this.logger.info('Grabación completada');
            return filepath;
            
        } catch (error) {
            this.logger.error('Error durante grabación:', error.message);
            return null;
        } finally {
            // Reanudar grabación principal
            if (wasPaused) {
                await delay(500);
                this.audioManager.resumeRecording();
            }
        }
    }

    /**
     * Convertir audio a texto (placeholder - necesita implementación real)
     */
    async speechToText(audioFile) {
        this.logger.info('Convirtiendo audio a texto...');
        
        try {
            // TODO: Implementar con Whisper API cuando esté disponible
            // Por ahora, simulación para testing
            await delay(2000); // Simular tiempo de procesamiento
            
            const simulatedQuestions = [
                "¿Cómo está el clima en Mendoza?",
                "¿Cuál es la frecuencia de repetidora?",
                "¿Qué hora es?",
                "¿Cómo funciona la radio?",
                "Cuéntame sobre radioafición",
                "¿Cuál es tu indicativo?",
                "¿Qué banda recomiendas para principiantes?"
            ];
            
            const randomQuestion = simulatedQuestions[Math.floor(Math.random() * simulatedQuestions.length)];
            this.logger.info(`[SIMULACIÓN] Texto detectado: ${randomQuestion}`);
            
            return sanitizeTextForTTS(randomQuestion);
            
        } catch (error) {
            this.logger.error('Error en speech-to-text:', error.message);
            return null;
        } finally {
            // Limpiar archivo temporal
            this.cleanupTempFile(audioFile);
        }
    }
    
    /**
     * Limpiar archivo temporal de manera segura
     */
    cleanupTempFile(audioFile) {
        if (!audioFile) return;
        
        try {
            if (fs.existsSync(audioFile)) {
                fs.unlinkSync(audioFile);
                this.logger.debug('Archivo temporal eliminado');
            }
        } catch (error) {
            this.logger.warn('No se pudo eliminar archivo temporal:', error.message);
        }
    }

    /**
     * Obtener respuesta de IA
     */
    async getAIResponse(question) {
        try {
            this.logger.info('Consultando IA...');
            
            // TODO: Implementar API real de OpenAI cuando esté configurada
            // Por ahora simulación para testing
            await delay(3000); // Simular tiempo de procesamiento de IA
            
            const responses = {
                "¿Cómo está el clima en Mendoza?": "El clima en Mendoza está soleado con 22 grados centígrados",
                "¿Cuál es la frecuencia de repetidora?": "Esta repetidora opera en frecuencia simplex según configuración del sistema",
                "¿Qué hora es?": `Son las ${new Date().toLocaleTimeString('es-AR', {hour12: false})}`,
                "¿Cómo funciona la radio?": "La radio transmite ondas electromagnéticas moduladas para comunicación a distancia",
                "Cuéntame sobre radioafición": "La radioafición es un servicio de comunicaciones por radio sin fines comerciales, usado para experimentación técnica y comunicación personal",
                "¿Cuál es tu indicativo?": "Este sistema pertenece al indicativo LU5MCD",
                "¿Qué banda recomiendas para principiantes?": "Para principiantes recomiendo la banda de 2 metros, 144 a 148 megahertz"
            };
            
            const response = responses[question] || "Consulta interesante. El sistema de inteligencia artificial está procesando su pregunta y generará una respuesta personalizada.";
            
            this.logger.info('Respuesta de IA generada exitosamente');
            return sanitizeTextForTTS(response);
            
        } catch (error) {
            this.logger.error('Error consultando IA:', error.message);
            return null;
        }
    }

    /**
     * Configurar módulo
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.validateConfiguration();
        this.logger.info('Configuración actualizada');
    }

    /**
     * Obtener estado del módulo
     */
    getStatus() {
        return {
            enabled: this.config.enabled,
            state: this.state,
            provider: this.config.provider,
            model: this.config.model,
            hasApiKey: !!this.config.apiKey,
            recordingDuration: this.config.recordingDuration,
            currentSession: this.currentSession ? {
                id: this.currentSession.id,
                timestamp: this.currentSession.timestamp,
                hasQuestion: !!this.currentSession.question,
                hasResponse: !!this.currentSession.response
            } : null
        };
    }

    /**
     * Destructor
     */
    destroy() {
        this.state = MODULE_STATES.DISABLED;
        this.currentSession = null;
        this.sessionId = null;
        this.logger.info('Módulo AI Chat destruido');
    }
}

module.exports = AIChat;