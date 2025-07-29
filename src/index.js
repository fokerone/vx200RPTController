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
        
        // Componentes principales
        this.audio = new AudioManager();
        this.modules = {};
        this.webServer = new WebServer(this);
        
        // Estado del sistema
        this.isRunning = false;
        this.startTime = Date.now();
        
        this.initializeModules();
        this.setupEventHandlers();
        this.configureFromFile();
    }

    // ===== INICIALIZACIÓN =====

    initializeModules() {
        this.modules.baliza = new Baliza(this.audio);
        this.modules.datetime = new DateTime(this.audio);
        this.modules.aiChat = new AIChat(this.audio);
        this.modules.sms = new SMS(this.audio);
        
        console.log('✅ Módulos inicializados');
    }

    configureFromFile() {
        // Configurar Roger Beep desde config.json
        if (config.rogerBeep) {
            this.audio.configureRogerBeep(config.rogerBeep);
        }
        
        // Configurar baliza desde config.json
        if (config.baliza) {
            this.modules.baliza.configure(config.baliza);
        }
    }

    setupEventHandlers() {
        // Eventos de audio
        this.audio.on('dtmf', async (sequence) => {
            await this.handleDTMF(sequence);
        });

        this.audio.on('channel_active', (data) => {
            this.webServer.broadcastChannelActivity(true, data.level);
        });

        this.audio.on('channel_inactive', (data) => {
            this.webServer.broadcastChannelActivity(false, 0);
        });

        this.audio.on('signal_level', (data) => {
            this.webServer.broadcastSignalLevel(data);
        });

        // Eventos para panel web
        this.setupWebEvents();
    }

    setupWebEvents() {
        // DTMF al panel web
        this.audio.on('dtmf', (sequence) => {
            this.webServer.broadcastDTMF(sequence);
        });

        // Baliza transmitida
        this.modules.baliza.on('transmitted', () => {
            this.webServer.broadcastBalizaTransmitted();
        });

        // Interceptar logs relevantes
        this.interceptLogs();
    }

    interceptLogs() {
        const originalLog = console.log;
        const originalError = console.error;
        
        console.log = (...args) => {
            originalLog.apply(console, args);
            
            const message = args.join(' ');
            // Solo enviar logs importantes al panel web
            if (message.includes('📞 DTMF:') || 
                message.includes('🎯 Ejecutando') ||
                message.includes('Roger Beep') ||
                message.includes('Baliza') ||
                message.includes('Canal')) {
                this.webServer.broadcastLog('info', message);
            }
        };

        console.error = (...args) => {
            originalError.apply(console, args);
            const message = args.join(' ');
            this.webServer.broadcastLog('error', message);
        };
    }

    // ===== MANEJO DE COMANDOS DTMF =====

    async handleDTMF(sequence) {
        console.log(`📞 DTMF: ${sequence}`);
        
        // Manejo especial para SMS activo
        if (this.modules.sms.sessionState !== 'idle') {
            await this.handleSMSFlow(sequence);
            return;
        }
        
        // Comandos normales
        const commands = {
            '*1': () => this.modules.datetime.execute(sequence),
            '*2': () => this.modules.aiChat.execute(sequence),
            '*3': () => this.modules.sms.execute(sequence),
            '*9': () => this.modules.baliza.execute(sequence)
        };

        if (commands[sequence]) {
            console.log(`🎯 Ejecutando: ${sequence}`);
            await this.safeExecute(commands[sequence]);
        } else {
            await this.handleUnknownCommand(sequence);
        }
    }

    async handleSMSFlow(sequence) {
        const smsState = this.modules.sms.sessionState;
        
        // Captura de número: debe terminar en * o #
        if (smsState === 'getting_number') {
            if (sequence.endsWith('*') || sequence.endsWith('#')) {
                await this.modules.sms.processDTMF(sequence);
            }
            return;
        }
        
        // Confirmación: solo 1 o 2
        if (smsState === 'confirming') {
            if (sequence === '1' || sequence === '2') {
                await this.modules.sms.processDTMF(sequence);
            }
            return;
        }
    }

    async handleUnknownCommand(sequence) {
        // Solo reproducir error si SMS está idle
        if (this.modules.sms.sessionState === 'idle') {
            try {
                await this.audio.playTone(400, 200, 0.5);
            } catch (error) {
                // Ignorar errores de audio
            }
        }
    }

    // ===== TRANSMISIÓN SEGURA =====

    async safeExecute(callback) {
        try {
            await this.safeTransmit(callback);
        } catch (error) {
            console.error('❌ Error ejecutando comando:', error.message);
        }
    }

    async safeTransmit(callback) {
        if (!this.audio.isSafeToTransmit()) {
            this.webServer.broadcastLog('warning', 'Canal ocupado - Esperando...');
            await this.waitForFreeChannel();
        }
        
        await callback();
    }

    async waitForFreeChannel(timeout = 30000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            const checkInterval = setInterval(() => {
                if (this.audio.isSafeToTransmit() || (Date.now() - startTime) > timeout) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 500);
        });
    }

    // ===== COMANDOS DESDE PANEL WEB =====

    async executeWebCommand(command) {
        console.log(`🌐 Comando web: ${command}`);
        
        try {
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
        } catch (error) {
            console.error('❌ Error comando web:', error.message);
            throw error;
        }
    }

    // ===== ROGER BEEP (PANEL WEB ÚNICAMENTE) =====

    toggleRogerBeep() {
        const wasEnabled = this.audio.getRogerBeepStatus().enabled;
        const isEnabled = this.audio.toggleRogerBeep();
        
        console.log(`🔊 Roger Beep: ${isEnabled ? 'ON' : 'OFF'}`);
        this.webServer.broadcastLog('info', `Roger Beep ${isEnabled ? 'activado' : 'desactivado'}`);
        
        return {
            success: true,
            enabled: isEnabled,
            message: `Roger Beep ${isEnabled ? 'activado' : 'desactivado'}`,
            status: this.audio.getRogerBeepStatus()
        };
    }

    async testRogerBeep() {
        console.log('🧪 Test Roger Beep');
        
        try {
            const success = await this.audio.testRogerBeep();
            return {
                success: success,
                message: success ? 'Test ejecutado correctamente' : 'Error en test'
            };
        } catch (error) {
            return {
                success: false,
                message: 'Error ejecutando test'
            };
        }
    }

    // ===== CONFIGURACIÓN =====

    configureBalizaFromWeb(newConfig) {
        console.log('⚙️ Configurando baliza desde web');
        this.modules.baliza.configure(newConfig);
        
        // Actualizar config en memoria
        if (config.baliza) {
            Object.assign(config.baliza, newConfig);
        }
    }

    // ===== CONTROL DEL SISTEMA =====

    start() {
        this.audio.start();
        this.webServer.start();
        
        // Iniciar baliza si está habilitada
        if (config.baliza?.enabled) {
            this.modules.baliza.start();
        }
        
        this.isRunning = true;
        
        this.printStartupInfo();
    }

    printStartupInfo() {
        console.log('🎉 Sistema iniciado correctamente');
        console.log('='.repeat(50));
        console.log(`🌐 Panel web: http://localhost:3000`);
        console.log(`📡 Indicativo: ${config.callsign || 'VX200'}`);
        console.log('📞 Comandos DTMF:');
        console.log('   *1 = Fecha y hora');
        console.log('   *2 = IA Chat (simulado)');
        console.log('   *3 = SMS');
        console.log('   *9 = Baliza manual');
        console.log(`📡 Baliza: ${config.baliza?.enabled ? 
            `Cada ${config.baliza.interval} min` : 'Deshabilitada'}`);
        console.log(`🔊 Roger Beep: ${config.rogerBeep?.enabled ? 'ON' : 'OFF'} (Kenwood)`);
        console.log('='.repeat(50));
    }

    stop() {
        console.log('🛑 Deteniendo sistema...');
        
        this.isRunning = false;
        
        // Detener componentes
        if (this.audio) {
            this.audio.stop();
        }
        
        if (this.webServer) {
            this.webServer.stop();
        }
        
        if (this.modules.baliza?.isRunning) {
            this.modules.baliza.stop();
        }
        
        console.log('✅ Sistema detenido');
    }

    // ===== CONTROL DE SERVICIOS =====

    toggleService(service) {
        let result = { success: false, message: '', enabled: false };
        
        try {
            switch (service) {
                case 'audio':
                    if (this.audio.isRecording) {
                        this.audio.pauseRecording();
                        result = { success: true, message: 'Audio desactivado', enabled: false };
                    } else {
                        this.audio.resumeRecording();
                        result = { success: true, message: 'Audio activado', enabled: true };
                    }
                    break;
                    
                case 'baliza':
                    if (this.modules.baliza.isRunning) {
                        this.modules.baliza.stop();
                        result = { success: true, message: 'Baliza detenida', enabled: false };
                    } else {
                        this.modules.baliza.start();
                        result = { success: true, message: 'Baliza iniciada', enabled: true };
                    }
                    break;
                    
                default:
                    result = { success: false, message: 'Servicio desconocido' };
            }
            
            console.log(`🔄 ${service}: ${result.enabled ? 'ON' : 'OFF'}`);
            this.webServer.broadcastLog('info', result.message);
            
        } catch (error) {
            result = { success: false, message: `Error: ${error.message}` };
            console.error(`❌ Error toggle ${service}:`, error.message);
        }
        
        return result;
    }

    // ===== ESTADO DEL SISTEMA =====

    getSystemStatus() {
        const audioStatus = this.audio.getStatus();
        
        return {
            timestamp: new Date().toISOString(),
            uptime: Date.now() - this.startTime,
            audio: audioStatus.audio,
            channel: audioStatus.channel,
            baliza: this.modules.baliza.getStatus(),
            datetime: this.modules.datetime.getStatus(),
            aiChat: this.modules.aiChat.getStatus(),
            sms: this.modules.sms.getStatus(),
            rogerBeep: audioStatus.rogerBeep,
            dtmf: {
                lastSequence: 'Esperando...',
                activeSession: this.modules.sms.sessionState
            }
        };
    }

    getDetailedStatus() {
        return {
            ...this.getSystemStatus(),
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                pid: process.pid,
                callsign: config.callsign || 'VX200',
                version: config.version || '2.0'
            },
            services: {
                audio: this.audio.getStatus().audio.isRecording,
                baliza: this.modules.baliza.isRunning,
                webServer: this.isRunning,
                rogerBeep: this.audio.getRogerBeepStatus().enabled
            }
        };
    }

    // ===== COMANDOS CRÍTICOS =====

    async shutdown() {
        console.log('🔴 Apagando sistema...');
        this.webServer.broadcastLog('warning', 'Sistema apagándose...');
        
        // Anuncio de apagado
        try {
            await this.audio.speakNoRoger('Sistema apagándose');
        } catch (error) {
            // Ignorar errores de TTS
        }
        
        this.stop();
        
        setTimeout(() => {
            console.log('👋 Hasta luego!');
            process.exit(0);
        }, 2000);
    }

    async restart() {
        console.log('🔄 Reiniciando sistema...');
        this.webServer.broadcastLog('warning', 'Reiniciando...');
        
        // Anuncio de reinicio
        try {
            await this.audio.speakNoRoger('Sistema reiniciándose');
        } catch (error) {
            // Ignorar errores de TTS
        }
        
        this.stop();
        
        setTimeout(() => {
            console.log('🔄 Reiniciando...');
            this.start();
            this.webServer.broadcastLog('success', 'Sistema reiniciado');
        }, 3000);
    }

    // ===== UTILIDADES =====

    async transmitText(text) {
        await this.safeTransmit(async () => {
            console.log(`🗣️ TTS: ${text.substring(0, 50)}...`);
            await this.audio.speak(text);
        });
    }

    async healthCheck() {
        console.log('🔍 Health Check del sistema:');
        
        const status = this.getSystemStatus();
        
        console.log(`  📹 Audio: ${status.audio.status === 'active' ? '✅' : '❌'}`);
        console.log(`  📻 Canal: ${status.channel.isActive ? 'OCUPADO' : 'LIBRE'}`);
        console.log(`  📡 Baliza: ${status.baliza.running ? '✅' : '❌'}`);
        console.log(`  🔊 Roger Beep: ${status.rogerBeep.enabled ? '✅' : '❌'}`);
        console.log(`  🌐 Web Server: ${this.isRunning ? '✅' : '❌'}`);
        
        // Test de audio si es posible
        if (status.audio.status === 'active') {
            try {
                await this.audio.healthCheck();
            } catch (error) {
                console.log('  ❌ Test de audio falló');
            }
        }
        
        return status;
    }
}

// ===== MANEJO DE SEÑALES DEL SISTEMA =====

let controller = null;

function setupSignalHandlers() {
    process.on('SIGINT', () => {
        console.log('\n🛑 Ctrl+C detectado...');
        if (controller) {
            controller.stop();
        }
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('\n🛑 Señal de terminación...');
        if (controller) {
            controller.stop();
        }
        process.exit(0);
    });

    process.on('uncaughtException', (error) => {
        console.error('❌ Error crítico:', error.message);
        if (controller) {
            controller.stop();
        }
        process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
        console.error('❌ Promesa rechazada:', reason);
        if (controller) {
            controller.stop();
        }
        process.exit(1);
    });
}

// ===== INICIO DEL SISTEMA =====

function main() {
    try {
        setupSignalHandlers();
        
        controller = new VX200Controller();
        global.vx200Controller = controller; // Para acceso global
        
        controller.start();
        
    } catch (error) {
        console.error('❌ Error crítico al iniciar:', error);
        process.exit(1);
    }
}

// Iniciar solo si es el archivo principal
if (require.main === module) {
    main();
}

module.exports = VX200Controller;
