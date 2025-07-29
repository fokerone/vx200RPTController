const fs = require('fs');
const path = require('path');
const { SMS_STATES, VALIDATION, ERROR_MESSAGES } = require('../constants');
const { delay, createLogger, validatePhoneNumber, generateSessionId, sanitizeTextForTTS } = require('../utils');

class SMS {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.logger = createLogger('[SMS]');
        
        this.config = {
            enabled: true,
            provider: 'twilio',
            recordingDuration: VALIDATION.MAX_RECORDING_DURATION,
            maxMessageLength: VALIDATION.MAX_SMS_LENGTH,
            // Configuración segura desde variables de entorno
            accountSid: process.env.TWILIO_ACCOUNT_SID || null,
            authToken: process.env.TWILIO_AUTH_TOKEN || null,
            fromNumber: process.env.TWILIO_FROM_NUMBER || null
        };
        
        this.currentSession = null;
        this.sessionState = SMS_STATES.IDLE;
        this.lastProcessedSequence = '';
        this.processing = false;
        this.sessionId = null;
        
        this.logger.info('Módulo SMS inicializado');
    }

    /**
     * Ejecutar cuando se recibe comando DTMF *3
     */
    async execute(command) {
        this.logger.info(`Ejecutado por comando: ${command}`);
        
        if (!this.config.enabled) {
            this.logger.warn('Módulo deshabilitado');
            await this.audioManager.speak(sanitizeTextForTTS('Módulo de mensajería deshabilitado'));
            return;
        }

        if (this.sessionState !== SMS_STATES.IDLE) {
            this.logger.warn(`Sesión ya activa en estado: ${this.sessionState}`);
            await this.audioManager.speak(sanitizeTextForTTS('Sesión de mensajería ya activa'));
            return;
        }

        try {
            await this.startSMSSession();
        } catch (error) {
            this.logger.error('Error ejecutando SMS:', error.message);
            await this.audioManager.speak(sanitizeTextForTTS(ERROR_MESSAGES.TRANSMISSION_ERROR));
            this.resetSession();
        }
    }

    /**
     * Iniciar sesión de SMS
     */
    async startSMSSession() {
        this.sessionId = generateSessionId();
        this.currentSession = {
            id: this.sessionId,
            phoneNumber: '',
            message: '',
            audioFile: null,
            timestamp: new Date(),
            attempts: 0
        };
        
        this.logger.info(`Iniciando sesión SMS [${this.sessionId}]`);
        
        // Instrucciones iniciales
        const instructions = sanitizeTextForTTS(
            'Sistema de mensajería activado. Ingrese el número de teléfono terminando con asterisco.'
        );
        await this.audioManager.speak(instructions);
        
        this.sessionState = SMS_STATES.GETTING_NUMBER;
        this.lastProcessedSequence = '';
        
        this.logger.info('Esperando número de teléfono...');
    }

    /**
     * Procesar DTMF durante sesión SMS
     */
    async processDTMF(sequence) {
        // Evitar procesar la misma secuencia dos veces
        if (sequence === this.lastProcessedSequence) {
            this.logger.debug('Secuencia ya procesada, ignorando');
            return true;
        }
        
        this.logger.info(`Nueva secuencia: ${sequence} (estado: ${this.sessionState})`);
        this.lastProcessedSequence = sequence;
        
        switch (this.sessionState) {
            case SMS_STATES.GETTING_NUMBER:
                return await this.processNumberSequence(sequence);
            
            case SMS_STATES.CONFIRMING:
                return await this.processConfirmationSequence(sequence);
                
            case SMS_STATES.RECORDING_MESSAGE:
                this.logger.debug('Grabando mensaje, DTMF ignorado');
                return true;
            
            default:
                this.logger.warn(`Estado inválido para procesar DTMF: ${this.sessionState}`);
                return false;
        }
    }

    /**
     * Procesar secuencia para número de teléfono
     */
    async processNumberSequence(sequence) {
        if (this.processing) {
            this.logger.debug('Ya procesando, ignorando');
            return true;
        }
        
        this.processing = true;
        
        try {
            if (sequence.endsWith('*')) {
                const number = sequence.slice(0, -1);
                this.logger.info(`Evaluando número: "${number}" (longitud: ${number.length})`);
                
                const validation = validatePhoneNumber(number);
                
                if (validation.valid) {
                    this.currentSession.phoneNumber = validation.number;
                    this.logger.info(`Número aceptado: ${this.currentSession.phoneNumber}`);
                    
                    const confirmMessage = sanitizeTextForTTS(
                        `Número ${this.currentSession.phoneNumber} confirmado. Grabe su mensaje después del tono.`
                    );
                    await this.audioManager.speak(confirmMessage);
                    
                    await delay(1000);
                    await this.recordMessage();
                    
                } else {
                    this.logger.warn(`Número inválido: ${validation.message}`);
                    await this.audioManager.speak(sanitizeTextForTTS(ERROR_MESSAGES.INVALID_PHONE_NUMBER));
                    this.processing = false;
                }
                
            } else if (sequence === '#') {
                this.logger.info('Operación cancelada por usuario (#)');
                await this.audioManager.speak(sanitizeTextForTTS('Operación cancelada'));
                this.resetSession();
                
            } else if (/^[0-9]+$/.test(sequence)) {
                this.logger.debug(`Número parcial: ${sequence} - Esperando asterisco`);
                this.processing = false;
                
            } else {
                this.logger.warn(`Secuencia inválida: ${sequence}`);
                await this.audioManager.speak(sanitizeTextForTTS('Secuencia inválida. Use solo números y asterisco.'));
                this.processing = false;
            }
            
        } catch (error) {
            this.logger.error('Error procesando número:', error.message);
            this.processing = false;
        }
        
        return true;
    }

    /**
     * Procesar confirmación
     */
    async processConfirmationSequence(sequence) {
        console.log(`📞 Procesando confirmación: ${sequence}`);
        
        if (sequence === '1') {
            console.log('✅ Confirmación para enviar SMS');
            await this.sendSMS();
        } else if (sequence === '2') {
            console.log('🚫 SMS cancelado por usuario');
            await this.audioManager.speak('Mensaje cancelado');
            this.resetSession();
        } else {
            console.log(`⚠️  Confirmación inválida: ${sequence} - Se esperaba 1 o 2`);
            await this.audioManager.speak('Presione 1 para enviar o 2 para cancelar');
        }
        
        return true;
    }

    /**
     * Grabar mensaje de voz
     */
    async recordMessage() {
        this.sessionState = SMS_STATES.RECORDING_MESSAGE;
        this.processing = false;
        
        this.logger.info(`Simulando grabación por ${this.config.recordingDuration} segundos...`);
        
        try {
            // Simular tiempo de grabación (reducido para testing)
            await delay(3000);
            
            // Simular transcripción con mensajes variados
            const simulatedMessages = [
                "Hola, soy LU5MCD. Te envío saludos desde la repetidora.",
                "Mensaje de prueba desde el sistema de radio.",
                "Confirmando recepción de tu señal.",
                "Saludos cordiales desde Mendoza.",
                "Mensaje automático del sistema de radio amateur."
            ];
            
            this.currentSession.message = sanitizeTextForTTS(
                simulatedMessages[Math.floor(Math.random() * simulatedMessages.length)]
            );
            
            this.logger.info(`Mensaje grabado: ${this.currentSession.message}`);
            
            await this.confirmMessage();
            
        } catch (error) {
            this.logger.error('Error en grabación:', error.message);
            await this.audioManager.speak(sanitizeTextForTTS(ERROR_MESSAGES.RECORDING_ERROR));
            this.resetSession();
        }
    }

    /**
     * Confirmar mensaje antes de enviar
     */
    async confirmMessage() {
        this.sessionState = SMS_STATES.CONFIRMING;
        this.lastProcessedSequence = '';
        
        const mensaje = sanitizeTextForTTS(
            `Mensaje grabado: ${this.currentSession.message}. Destino: ${this.currentSession.phoneNumber}. Presione 1 para enviar, 2 para cancelar.`
        );
        
        this.logger.info('Solicitando confirmación...');
        await this.audioManager.speak(mensaje);
        
        this.logger.info('Esperando confirmación (1=enviar, 2=cancelar)...');
    }

    /**
     * Enviar SMS
     */
    async sendSMS() {
        console.log('📤 Iniciando envío de SMS...');
        await this.audioManager.speak('Enviando mensaje, por favor espere');
        
        try {
            // Simular envío con delay
            await this.delay(2000);
            
            // Log del "envío"
            console.log('📨 === SMS ENVIADO ===');
            console.log(`📱 Destino: ${this.currentSession.phoneNumber}`);
            console.log(`📝 Mensaje: ${this.currentSession.message}`);
            console.log(`🕐 Hora: ${this.currentSession.timestamp.toLocaleString()}`);
            console.log('===================');
            
            await this.audioManager.speak('Mensaje enviado exitosamente');
            
        } catch (error) {
            console.error('❌ Error enviando SMS:', error);
            await this.audioManager.speak('Error enviando mensaje');
        } finally {
            this.resetSession();
        }
    }

    /**
     * Configurar módulo
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('⚙️  SMS configurado:', newConfig);
    }

    /**
     * Obtener estado actual
     */
    getStatus() {
        return {
            enabled: this.config.enabled,
            sessionState: this.sessionState,
            currentSession: this.currentSession ? {
                phoneNumber: this.currentSession.phoneNumber,
                hasMessage: !!this.currentSession.message,
                timestamp: this.currentSession.timestamp
            } : null,
            hasCredentials: !!(this.config.accountSid && this.config.authToken),
            lastProcessedSequence: this.lastProcessedSequence
        };
    }

    /**
     * Reset completo de la sesión
     */
    resetSession() {
        const sessionId = this.sessionId || 'unknown';
        this.logger.info(`Reseteando sesión SMS [${sessionId}]`);
        
        this.currentSession = null;
        this.sessionState = SMS_STATES.IDLE;
        this.lastProcessedSequence = '';
        this.processing = false;
        this.sessionId = null;
        
        this.logger.info('Sesión SMS reiniciada');
    }

    /**
     * Destructor
     */
    destroy() {
        this.resetSession();
        this.logger.info('Módulo SMS destruido');
    }
}

module.exports = SMS;