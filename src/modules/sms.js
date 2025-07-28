const fs = require('fs');
const path = require('path');

class SMS {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.config = {
            enabled: true,
            provider: 'twilio', // 'twilio', 'aws', 'local'
            recordingDuration: 15, // segundos para grabar mensaje
            maxMessageLength: 160,
            // Configuración Twilio (ejemplo)
            accountSid: process.env.TWILIO_ACCOUNT_SID,
            authToken: process.env.TWILIO_AUTH_TOKEN,
            fromNumber: process.env.TWILIO_FROM_NUMBER
        };
        
        this.currentSession = null;
        this.sessionState = 'idle'; // 'idle', 'getting_number', 'recording_message', 'confirming'
        this.lastProcessedSequence = '';
        this.processing = false;
        
        console.log('📱 Módulo SMS inicializado');
    }

    /**
     * Ejecutar cuando se recibe comando DTMF *3
     */
    async execute(command) {
        console.log(`📞 SMS ejecutado por comando: ${command}`);
        
        if (!this.config.enabled) {
            await this.audioManager.speak('Módulo de mensajería deshabilitado');
            return;
        }

        if (this.sessionState !== 'idle') {
            await this.audioManager.speak('Sesión de mensajería ya activa');
            return;
        }

        try {
            await this.startSMSSession();
        } catch (error) {
            console.error('❌ Error en SMS:', error);
            await this.audioManager.speak('Error en el sistema de mensajería');
            this.resetSession();
        }
    }

    /**
     * Iniciar sesión de SMS
     */
    async startSMSSession() {
        this.currentSession = {
            phoneNumber: '',
            message: '',
            audioFile: null,
            timestamp: new Date()
        };
        
        console.log('📱 Iniciando sesión SMS');
        
        // Instrucciones iniciales
        await this.audioManager.speak(
            'Sistema de mensajería activado.terminando con asterisco.'
        );
        
        this.sessionState = 'getting_number';
        this.lastProcessedSequence = ''; // Reset
        
        console.log('📞 Esperando número de teléfono...');
    }

    /**
     * Procesar DTMF durante sesión SMS
     */
    async processDTMF(sequence) {
        // Evitar procesar la misma secuencia dos veces
        if (sequence === this.lastProcessedSequence) {
            console.log('⚠️  Secuencia ya procesada, ignorando');
            return true;
        }
        
        console.log(`📞 Nueva secuencia SMS: ${sequence} (estado: ${this.sessionState})`);
        this.lastProcessedSequence = sequence;
        
        switch (this.sessionState) {
            case 'getting_number':
                return await this.processNumberSequence(sequence);
            
            case 'confirming':
                return await this.processConfirmationSequence(sequence);
                
            case 'recording_message':
                // Durante grabación, ignorar DTMF
                console.log('🎙️  Grabando mensaje, DTMF ignorado');
                return true;
            
            default:
                return false;
        }
    }

    /**
     * Procesar secuencia para número de teléfono
     */
    async processNumberSequence(sequence) {
        if (this.processing) {
            console.log('⚠️  Ya procesando, ignorando');
            return true;
        }
        
        this.processing = true;
        
        try {
            if (sequence.endsWith('*')) {
                // Secuencia completa del número
                const number = sequence.slice(0, -1); // Quitar el asterisco
                
                console.log(`📱 Evaluando número: "${number}" (longitud: ${number.length})`);
                
                if (number.length >= 8 && /^[0-9]+$/.test(number)) {
                    this.currentSession.phoneNumber = number;
                    console.log(`✅ Número aceptado: ${this.currentSession.phoneNumber}`);
                    
                    await this.audioManager.speak(
                        `Número ${this.currentSession.phoneNumber} confirmado. Grabe su mensaje después del tono.`
                    );
                    
                    await this.delay(1000);
                    await this.recordMessage();
                    
                } else {
                    console.log(`❌ Número inválido: muy corto o contiene caracteres no numéricos`);
                    await this.audioManager.speak('Número inválido. Debe tener al menos 8 dígitos. Reintente.');
                    this.processing = false;
                }
                
            } else if (sequence === '#') {
                // Cancelar operación
                console.log('🚫 Operación cancelada por #');
                await this.audioManager.speak('Operación cancelada');
                this.resetSession();
                
            } else if (/^[0-9]+$/.test(sequence)) {
                // Secuencia solo numérica, esperando más dígitos o asterisco
                console.log(`📞 Número parcial: ${sequence} - Esperando asterisco para finalizar`);
                this.processing = false;
                
            } else {
                // Secuencia inválida
                console.log(`❌ Secuencia inválida para número: ${sequence}`);
                await this.audioManager.speak('Secuencia inválida. Use solo números y asterisco.');
                this.processing = false;
            }
            
        } catch (error) {
            console.error('❌ Error procesando número:', error);
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
        this.sessionState = 'recording_message';
        this.processing = false; // Permitir DTMF durante grabación si es necesario
        
        console.log(`🎙️  Simulando grabación de mensaje por ${this.config.recordingDuration} segundos...`);
        
        try {
            // Simular tiempo de grabación
            await this.delay(3000); // 3 segundos para prueba
            
            // Simular transcripción
            const simulatedMessages = [
                "Hola, soy LU5MCD. Te envío saludos desde la repetidora.",
                "Mensaje de prueba desde el sistema de radio.",
                "Confirmando recepción de tu señal.",
                "Saludos cordiales desde Mendoza.",
                "Mensaje automático del sistema de radio amateur."
            ];
            
            this.currentSession.message = simulatedMessages[
                Math.floor(Math.random() * simulatedMessages.length)
            ];
            
            console.log(`📝 Mensaje simulado: ${this.currentSession.message}`);
            
            await this.confirmMessage();
            
        } catch (error) {
            console.error('❌ Error en grabación:', error);
            await this.audioManager.speak('Error grabando mensaje');
            this.resetSession();
        }
    }

    /**
     * Confirmar mensaje antes de enviar
     */
    async confirmMessage() {
        this.sessionState = 'confirming';
        this.lastProcessedSequence = ''; // Reset para nueva confirmación
        
        const mensaje = `Mensaje grabado: ${this.currentSession.message}. Destino: ${this.currentSession.phoneNumber}. Presione 1 para enviar, 2 para cancelar.`;
        
        console.log('📱 Solicitando confirmación...');
        await this.audioManager.speak(mensaje);
        
        console.log('⏳ Esperando confirmación (1=enviar, 2=cancelar)...');
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
        console.log('🔄 Reseteando sesión SMS...');
        
        this.currentSession = null;
        this.sessionState = 'idle';
        this.lastProcessedSequence = '';
        this.processing = false;
        
        console.log('✅ Sesión SMS reiniciada');
    }

    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Destructor
     */
    destroy() {
        this.resetSession();
        console.log('🗑️  Módulo SMS destruido');
    }
}

module.exports = SMS;