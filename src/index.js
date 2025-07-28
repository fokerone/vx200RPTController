const AudioManager = require('./audio/audioManager');
const Baliza = require('./modules/baliza');
const DateTime = require('./modules/datetime');
const AIChat = require('./modules/aiChat');
const SMS = require('./modules/sms');
const WebServer = require('./web/server');
const config = require('../config/config.json');

class VX200Controller {
    constructor() {
        console.log('🚀 Iniciando VX200 Controller...');
        this.audio = new AudioManager();
        this.modules = {};
        this.webServer = new WebServer(this);
        
        this.initializeModules();
        this.setupEventHandlers();
    }

    initializeModules() {
        this.modules.baliza = new Baliza(this.audio);
        this.modules.datetime = new DateTime(this.audio);
        this.modules.aiChat = new AIChat(this.audio);
        this.modules.sms = new SMS(this.audio);
        
        console.log('✅ Módulos inicializados');
    }

    setupEventHandlers() {
        // Escuchar DTMF
        this.audio.on('dtmf', async (sequence) => {
            await this.handleDTMF(sequence);
        });

        // Escuchar audio entrante
        this.audio.on('audio', (audioData) => {
            this.handleAudio(audioData);
        });

         // Escuchar actividad del canal
    this.audio.on('channel_active', (data) => {
        console.log('📻 Canal ocupado');
        this.webServer.broadcastChannelActivity(true, data.level);
    });

    this.audio.on('channel_inactive', (data) => {
        console.log('📻 Canal libre');
        this.webServer.broadcastChannelActivity(false, 0);
    });

    this.audio.on('signal_level', (data) => {
        // Enviar nivel de señal al panel web (throttled)
        this.webServer.broadcastSignalLevel(data);
    });

    // Configurar eventos para el panel web
    this.setupWebEvents();

    }

    setupWebEvents() {
        // Cuando se detecta DTMF, enviarlo al panel web
        this.audio.on('dtmf', (sequence) => {
            this.webServer.broadcastDTMF(sequence);
        });

        // Cuando baliza transmite
        this.modules.baliza.on('transmitted', () => {
            this.webServer.broadcastBalizaTransmitted();
        });

        // Interceptar console.log para enviar logs importantes al panel web
        const originalConsoleLog = console.log;
        console.log = (...args) => {
            originalConsoleLog.apply(console, args);
            
            // Enviar ciertos logs al panel web
            const message = args.join(' ');
            if (message.includes('DTMF') || message.includes('Baliza') || 
                message.includes('SMS') || message.includes('IA') || 
                message.includes('DateTime')) {
                this.webServer.broadcastLog('info', message);
            }
        };

        // Interceptar console.error para logs de error
        const originalConsoleError = console.error;
        console.error = (...args) => {
            originalConsoleError.apply(console, args);
            const message = args.join(' ');
            this.webServer.broadcastLog('error', message);
        };
    }

    async handleDTMF(sequence) {
        console.log(`📞 Comando recibido: ${sequence}`);
        
        // Si SMS está activo, manejar su flujo especial
        if (this.modules.sms.sessionState !== 'idle') {
            // Para captura de número: solo procesar si termina en * o #
            if (this.modules.sms.sessionState === 'getting_number') {
                if (sequence.endsWith('*') || sequence.endsWith('#')) {
                    const processed = await this.modules.sms.processDTMF(sequence);
                    if (processed) return;
                } else {
                    console.log(`📞 Ignorando dígito individual durante captura: ${sequence}`);
                    return;
                }
            }
            
            // Para confirmación: solo procesar 1 o 2
            if (this.modules.sms.sessionState === 'confirming') {
                if (sequence === '1' || sequence === '2') {
                    const processed = await this.modules.sms.processDTMF(sequence);
                    if (processed) return;
                } else {
                    console.log(`📞 Ignorando durante confirmación: ${sequence}`);
                    return;
                }
            }
            
            // Para otros estados SMS, ignorar
            console.log(`📞 SMS en estado ${this.modules.sms.sessionState}, ignorando DTMF`);
            return;
        }
        
        // Comandos normales cuando SMS está idle
        const commands = {
            '*1': this.modules.datetime,  // Fecha y hora
            '*2': this.modules.aiChat,    // IA Chat
            '*3': this.modules.sms,       // SMS
            '*9': this.modules.baliza     // Baliza manual
        };

        if (commands[sequence]) {
            console.log(`🎯 Ejecutando comando: ${sequence}`);
            await commands[sequence].execute(sequence);
        } else {
            console.log(`❓ Comando desconocido: ${sequence}`);
            // Solo reproducir tono de error si SMS está idle
            if (this.modules.sms.sessionState === 'idle') {
                try {
                    this.audio.playTone(400, 200, 0.5);
                } catch (err) {
                    console.log('⚠️  No se pudo reproducir tono de error');
                }
            }
        }
    }

    handleAudio(audioData) {
        // Procesar audio entrante si es necesario
        // Por ahora solo se usa para detección DTMF
    }

    transmitAudio(audioBuffer) {
        console.log('📻 Transmitiendo audio...');
        this.audio.play(audioBuffer);
    }

    async transmitText(text) {
    await this.safeTransmit(async () => {
        console.log(`🗣️ Transmitiendo texto: ${text}`);
        await this.audio.speak(text);
    });
    }

    start() {
        // Iniciar componentes del sistema
        this.audio.start();
        this.webServer.start();
        
        // Configurar baliza desde config.json
        if (config.baliza) {
            this.modules.baliza.configure(config.baliza);
            if (config.baliza.enabled) {
                this.modules.baliza.start();
            }
        }
        
        console.log('🎉 VX200 Controller iniciado correctamente');
        console.log('='.repeat(60));
        console.log(`🌐 Panel web disponible en: http://localhost:3000`);
        console.log('📞 Comandos DTMF disponibles:');
        console.log('   *1 = Fecha y hora actual');
        console.log('   *2 = Consulta a IA (simulado)');
        console.log('   *3 = Enviar SMS (número + mensaje)');
        console.log('   *9 = Baliza manual');
        console.log('📡 Baliza automática: ' + (config.baliza?.enabled ? 
            `Cada ${config.baliza.interval} minutos` : 'Deshabilitada'));
        console.log('='.repeat(60));
    }

    stop() {
        console.log('🛑 Deteniendo VX200 Controller...');
        
        // Detener audio
        if (this.audio) {
            this.audio.stop();
        }
        
        // Detener servidor web
        if (this.webServer) {
            this.webServer.stop();
        }
        
        // Detener baliza
        if (this.modules.baliza) {
            this.modules.baliza.stop();
        }
        
        // Destruir módulos
        Object.values(this.modules).forEach(module => {
            if (module.destroy) {
                module.destroy();
            }
        });
        
        console.log('✅ Sistema detenido correctamente');
    }

    // Métodos para uso desde el panel web
    getSystemStatus() {
        return {
            timestamp: new Date().toISOString(),
            audio: {
                status: this.audio.isRecording ? 'active' : 'inactive',
                sampleRate: this.audio.sampleRate
            },
            baliza: this.modules.baliza.getStatus(),
            datetime: this.modules.datetime.getStatus(),
            aiChat: this.modules.aiChat.getStatus(),
            sms: this.modules.sms.getStatus(),
            dtmf: {
                lastSequence: 'N/A',
                activeSession: this.modules.sms.sessionState
            }
        };
    }

    // Ejecutar comando desde panel web
    async executeWebCommand(command) {
        console.log(`🌐 Comando desde panel web: ${command}`);
        
        switch (command) {
            case 'baliza_manual':
                await this.modules.baliza.execute('*9');
                break;
            case 'datetime':
                await this.modules.datetime.execute('*1');
                break;
            case 'ai_chat':
                await this.modules.aiChat.execute('*2');
                break;
            case 'sms':
                await this.modules.sms.execute('*3');
                break;
            default:
                throw new Error(`Comando desconocido: ${command}`);
        }
    }

    // Configurar baliza desde panel web
    configureBalizaFromWeb(newConfig) {
        console.log('🌐 Configurando baliza desde panel web:', newConfig);
        this.modules.baliza.configure(newConfig);
        
        // Actualizar config.json si es necesario
        if (config.baliza) {
            Object.assign(config.baliza, newConfig);
        }
    }

    // NUEVO: Verificar si es seguro transmitir
async safeTransmit(callback) {
    if (!this.audio.isSafeToTransmit()) {
        console.log('⚠️  Canal ocupado - Transmisión diferida');
        this.webServer.broadcastLog('warning', 'Canal ocupado - Esperando...');
        
        // Esperar hasta que el canal esté libre
        const waitForChannel = () => {
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (this.audio.isSafeToTransmit()) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 500);
                
                // Timeout después de 30 segundos
                setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve();
                }, 30000);
            });
        };
        
        await waitForChannel();
        
        if (!this.audio.isSafeToTransmit()) {
            console.log('⚠️  Timeout esperando canal libre');
            this.webServer.broadcastLog('warning', 'Timeout - Transmitiendo de todas formas');
        }
    }
    
    console.log('✅ Canal libre - Transmitiendo');
    await callback();
}

    // Agregar después del método configureBalizaFromWeb():

// Métodos de control del sistema
shutdown() {
    console.log('🔴 Iniciando apagado del sistema...');
    this.webServer.broadcastLog('warning', 'Sistema apagándose...');
    
    this.stop();
    
    setTimeout(() => {
        console.log('👋 Sistema apagado. ¡Hasta luego!');
        process.exit(0);
    }, 2000);
}

restart() {
    console.log('🔄 Iniciando reinicio del sistema...');
    this.webServer.broadcastLog('warning', 'Sistema reiniciándose...');
    
    this.stop();
    
    setTimeout(() => {
        console.log('🔄 Reiniciando...');
        // En un entorno real, aquí se reiniciaría el proceso
        // Por ahora solo simularemos
        this.start();
        this.webServer.broadcastLog('success', 'Sistema reiniciado correctamente');
    }, 3000);
}

stopServices() {
    console.log('⏸️  Deteniendo servicios...');
    
    if (this.audio.isRecording) {
        this.audio.stop();
    }
    
    if (this.modules.baliza.isRunning) {
        this.modules.baliza.stop();
    }
    
    this.webServer.broadcastLog('info', 'Servicios detenidos');
}

startServices() {
    console.log('▶️  Iniciando servicios...');
    
    if (!this.audio.isRecording) {
        this.audio.start();
    }
    
    if (config.baliza?.enabled && !this.modules.baliza.isRunning) {
        this.modules.baliza.start();
    }
    
    this.webServer.broadcastLog('info', 'Servicios iniciados');
}

// Obtener estado detallado del sistema
getDetailedStatus() {
    return {
        ...this.getSystemStatus(),
        system: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            pid: process.pid
        },
        services: {
            audio: this.audio.isRecording,
            baliza: this.modules.baliza.isRunning,
            webServer: true // Si estamos respondiendo, está activo
        }
    };
}
}

// Manejo de señales del sistema para cierre limpio
process.on('SIGINT', () => {
    console.log('\n🛑 Señal de interrupción recibida (Ctrl+C)...');
    if (global.vx200Controller) {
        global.vx200Controller.stop();
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Señal de terminación recibida...');
    if (global.vx200Controller) {
        global.vx200Controller.stop();
    }
    process.exit(0);
});

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
    console.error('❌ Error no capturado:', error);
    if (global.vx200Controller) {
        global.vx200Controller.stop();
    }
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesa rechazada no manejada:', reason);
    if (global.vx200Controller) {
        global.vx200Controller.stop();
    }
    process.exit(1);
});

// Iniciar el controlador
const controller = new VX200Controller();
global.vx200Controller = controller; // Para acceso global en señales
controller.start();

module.exports = VX200Controller;