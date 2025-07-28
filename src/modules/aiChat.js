const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class AIChat {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.config = {
            enabled: true,
            provider: 'openai', // 'openai' o 'gemini'
            model: 'gpt-3.5-turbo',
            maxTokens: 150,
            temperature: 0.7,
            recordingDuration: 10, // segundos para grabar pregunta
            apiKey: 'algo',
            basePrompt: 'Eres un asistente de radio amateur. Responde de forma breve y clara en español latino.'
        };
        
        this.isRecording = false;
        this.recordingFile = null;
        
        console.log('🤖 Módulo AI Chat inicializado');
    }

    /**
     * Ejecutar cuando se recibe comando DTMF *2
     */
    async execute(command) {
        console.log(`📞 AI Chat ejecutado por comando: ${command}`);
        
        if (!this.config.enabled) {
            await this.audioManager.speak('Módulo de inteligencia artificial deshabilitado');
            return;
        }

        if (!this.config.apiKey) {
            console.log('❌ API Key no configurada');
            await this.audioManager.speak('Error: clave de API no configurada');
            return;
        }

        try {
            await this.startAISession();
        } catch (error) {
            console.error('❌ Error en AI Chat:', error);
            await this.audioManager.speak('Error en el sistema de inteligencia artificial');
        }
    }

    /**
     * Iniciar sesión de IA
     */
    /**
 * Iniciar sesión de IA
 */
async startAISession() {
    // Solo voz, sin tonos para evitar conflictos
    await this.audioManager.speak(
        'Modo inteligencia artificial activado. Haga su consulta ahora.'
    );
    
    await this.delay(1000);
    
    // Grabar pregunta
    const audioFile = await this.recordQuestion();
    
    if (!audioFile) {
        await this.audioManager.speak('Error grabando la consulta');
        return;
    }
    
    // Convertir a texto
    const question = await this.speechToText(audioFile);
    
    if (!question) {
        await this.audioManager.speak('No se pudo procesar la consulta');
        return;
    }
    
    console.log(`❓ Pregunta: ${question}`);
    
    // Obtener respuesta de IA
    await this.audioManager.speak('Procesando consulta, por favor espere');
    
    const response = await this.getAIResponse(question);
    
    if (!response) {
        await this.audioManager.speak('Error obteniendo respuesta de la inteligencia artificial');
        return;
    }
    
    console.log(`🤖 Respuesta: ${response}`);
    
    // Reproducir respuesta
    await this.audioManager.speak(`Respuesta: ${response}`);
    
    console.log('✅ Sesión IA completada');
}
    /**
     * Grabar pregunta del usuario
     */
    /**
 * Grabar pregunta del usuario
 */
async recordQuestion() {
    // Pausar grabación principal
    const wasPaused = this.audioManager.pauseRecording();
    
    // Esperar un momento para que se libere el dispositivo
    await this.delay(500);
    
    try {
        // Grabar usando el método temporal del AudioManager
        const filepath = await this.audioManager.recordTemporary(
            this.config.recordingDuration, 
            16000
        );
        
        return filepath;
        
    } finally {
        // Reanudar grabación principal
        if (wasPaused) {
            await this.delay(500);
            this.audioManager.resumeRecording();
        }
    }
}

    /**
     * Convertir audio a texto (placeholder - necesita implementación real)
     */
    async speechToText(audioFile) {
        // TODO: Implementar con Whisper API o similar
        console.log('🎯 Convirtiendo audio a texto...');
        
        // Por ahora, simulación
        await this.delay(1000);
        
        // Simular algunas preguntas comunes
        const simulatedQuestions = [
            "¿Cómo está el clima en Mendoza?",
            "¿Cuál es la frecuencia de repetidora?",
            "¿Qué hora es?",
            "¿Cómo funciona la radio?",
            "Cuéntame sobre radioafición"
        ];
        
        const randomQuestion = simulatedQuestions[Math.floor(Math.random() * simulatedQuestions.length)];
        
        console.log(`🗣️  [SIMULADO] Texto detectado: ${randomQuestion}`);
        
        // Limpiar archivo temporal
        try {
            fs.unlinkSync(audioFile);
        } catch (err) {
            console.log('⚠️  No se pudo eliminar archivo temporal');
        }
        
        return randomQuestion;
    }

    /**
     * Obtener respuesta de IA
     */
    async getAIResponse(question) {
        try {
            console.log('🤖 Consultando IA...');
            
            // Por ahora simulación, después implementaremos API real
            await this.delay(2000);
            
            const responses = {
                "¿Cómo está el clima en Mendoza?": "El clima en Mendoza está soleado con 22 grados centígrados",
                "¿Cuál es la frecuencia de repetidora?": "Esta repetidora opera en frecuencia simplex según configuración",
                "¿Qué hora es?": `Son las ${new Date().toLocaleTimeString('es-AR')}`,
                "¿Cómo funciona la radio?": "La radio transmite ondas electromagnéticas para comunicación a distancia",
                "Cuéntame sobre radioafición": "La radioafición es un hobby técnico de comunicaciones por radio"
            };
            
            const response = responses[question] || "Consulta interesante. La inteligencia artificial está procesando su pregunta.";
            
            console.log(`🎯 Respuesta generada: ${response}`);
            return response;
            
        } catch (error) {
            console.error('❌ Error consultando IA:', error);
            return null;
        }
    }

    /**
     * Configurar módulo
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('⚙️  AI Chat configurado');
    }

    /**
     * Obtener estado
     */
    getStatus() {
        return {
            enabled: this.config.enabled,
            provider: this.config.provider,
            model: this.config.model,
            hasApiKey: !!this.config.apiKey,
            recordingDuration: this.config.recordingDuration
        };
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
        console.log('🗑️  Módulo AI Chat destruido');
    }
}

module.exports = AIChat;