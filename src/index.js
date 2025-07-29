const AudioManager = require('./audio/audioManager');
const Baliza = require('./modules/baliza');
const DateTime = require('./modules/datetime');
const AIChat = require('./modules/aiChat');
const SMS = require('./modules/sms');
const WebServer = require('./web/server');
const { MODULE_STATES, DELAYS, ERROR_MESSAGES, WEB_SERVER } = require('./constants');
const { delay, createLogger, sanitizeTextForTTS } = require('./utils');
const fs = require('fs');
const path = require('path');

class VX200Controller {
    constructor() {
        this.logger = createLogger('[Controller]');
        this.state = MODULE_STATES.IDLE;
        
        this.logger.info('Iniciando VX200 Controller...');
        
        // Configuración del sistema
        this.config = this.loadConfiguration();
        
        // Componentes principales
        this.audio = null;
        this.modules = {};
        this.webServer = null;
        
        // Estado del sistema
        this.isRunning = false;
        this.startTime = Date.now();
        this.initializationErrors = [];
        
        // Contadores y métricas
        this.stats = {
            dtmfCount: 0,
            commandsExecuted: 0,
            errors: 0,
            uptime: 0
        };
        
        // La inicialización se hace de forma asíncrona en el método start()
        this.logger.debug('Constructor completado, inicialización pendiente...');
    }
    
    /**
     * Cargar configuración del sistema
     */
    loadConfiguration() {
        try {
            const configPath = path.join(__dirname, '../config/config.json');
            
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(configData);
                this.logger.info('Configuración cargada desde config.json');
                return config;
            } else {
                this.logger.warn('config.json no encontrado, usando configuración por defecto');
                return this.getDefaultConfig();
            }
        } catch (error) {
            this.logger.error('Error cargando configuración:', error.message);
            return this.getDefaultConfig();
        }
    }
    
    /**
     * Configuración por defecto
     */
    getDefaultConfig() {
        return {
            callsign: 'LU5MCD',
            version: '2.0',
            rogerBeep: {
                enabled: true,
                type: 'kenwood',
                volume: 0.7,
                duration: 250
            },
            baliza: {
                enabled: true,
                interval: 15,
                message: 'LU5MCD Repetidora Simplex',
                tone: {
                    frequency: 1000,
                    duration: 500,
                    volume: 0.7
                }
            }
        };
    }
    
    /**
     * Inicializar todos los componentes del sistema
     */
    async initializeSystem() {
        try {
            this.state = MODULE_STATES.ACTIVE;
            
            this.logger.debug('Inicializando AudioManager...');
            await this.initializeAudio();
            
            this.logger.debug('Inicializando Módulos...');
            await this.initializeModules();
            
            this.logger.debug('Inicializando WebServer...');
            await this.initializeWebServer();
            
            this.logger.debug('Configurando event handlers...');
            this.setupEventHandlers();
            
            this.logger.debug('Configurando desde archivo...');
            this.configureFromFile();
            
            if (this.initializationErrors.length > 0) {
                this.logger.warn(`Sistema inicializado con ${this.initializationErrors.length} errores: ${this.initializationErrors.join(', ')}`);
                this.state = MODULE_STATES.ERROR;
            } else {
                this.logger.info('Sistema inicializado correctamente');
            }
            
        } catch (error) {
            this.logger.error('Error crítico durante inicialización:', error.message);
            this.logger.error('Stack trace:', error.stack);
            this.state = MODULE_STATES.ERROR;
        }
    }

    // ===== INICIALIZACIÓN DE COMPONENTES =====
    
    /**
     * Inicializar AudioManager
     */
    async initializeAudio() {
        try {
            this.audio = new AudioManager();
            
            if (this.audio.start()) {
                this.logger.info('AudioManager inicializado correctamente');
            } else {
                throw new Error('AudioManager no pudo iniciarse');
            }
        } catch (error) {
            this.logger.error('Error inicializando AudioManager:', error.message);
            this.initializationErrors.push('AudioManager');
        }
    }

    /**
     * Inicializar módulos del sistema
     */
    async initializeModules() {
        this.modules.baliza = new Baliza(this.audio);
        this.modules.datetime = new DateTime(this.audio);
        this.modules.aiChat = new AIChat(this.audio);
        this.modules.sms = new SMS(this.audio);
        
        console.log('✅ Módulos inicializados');
    }

    /**
     * Inicializar WebServer
     */
    async initializeWebServer() {
        try {
            this.logger.debug('Intentando inicializar WebServer...');
            this.webServer = new WebServer(this);
            this.logger.info('WebServer inicializado correctamente');
        } catch (error) {
            this.logger.error('Error inicializando WebServer:', error.message);
            this.logger.error('Stack trace:', error.stack);
            this.initializationErrors.push('WebServer');
            this.webServer = null;
        }
    }

    configureFromFile() {
        // Configurar Roger Beep desde config.json
        if (this.config.rogerBeep) {
            this.audio.configureRogerBeep(this.config.rogerBeep);
        }
        
        // Configurar baliza desde config.json
        if (this.config.baliza) {
            this.modules.baliza.configure(this.config.baliza);
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
        if (this.config.baliza) {
            Object.assign(this.config.baliza, newConfig);
        }
    }

    // ===== CONTROL DEL SISTEMA =====

    async start() {
        if (this.isRunning) {
            this.logger.warn('Sistema ya está ejecutándose');
            return;
        }
        
        try {
            this.logger.info('Iniciando sistema...');
            
            // Primero inicializar todos los componentes
            await this.initializeSystem();
            
            // Iniciar AudioManager si no está ya iniciado
            if (this.audio && !this.audio.isRecording) {
                const audioStarted = this.audio.start();
                if (!audioStarted) {
                    throw new Error('No se pudo iniciar AudioManager');
                }
            }
            
            // Iniciar WebServer
            if (this.webServer) {
                try {
                    await this.webServer.start();
                    this.logger.info('WebServer iniciado exitosamente');
                } catch (error) {
                    this.logger.error('Error iniciando WebServer:', error.message);
                    throw error;
                }
            } else {
                this.logger.error('WebServer no está inicializado');
                throw new Error('WebServer no está inicializado');
            }
            
            // Iniciar baliza si está habilitada
            if (this.config.baliza?.enabled && this.modules.baliza) {
                const balizaStarted = this.modules.baliza.start();
                if (balizaStarted) {
                    this.logger.info('Baliza automática iniciada');
                } else {
                    this.logger.warn('No se pudo iniciar baliza automática');
                }
            }
            
            this.isRunning = true;
            this.state = MODULE_STATES.ACTIVE;
            
            this.printStartupInfo();
            
        } catch (error) {
            this.logger.error('Error iniciando sistema:', error.message);
            this.state = MODULE_STATES.ERROR;
            throw error;
        }
    }

    printStartupInfo() {
        console.log('🎉 Sistema iniciado correctamente');
        console.log('='.repeat(50));
        console.log(`🌐 Panel web: http://localhost:3000`);
        console.log(`📡 Indicativo: ${this.config.callsign || 'VX200'}`);
        console.log('📞 Comandos DTMF:');
        console.log('   *1 = Fecha y hora');
        console.log('   *2 = IA Chat (simulado)');
        console.log('   *3 = SMS');
        console.log('   *9 = Baliza manual');
        console.log(`📡 Baliza: ${this.config.baliza?.enabled ? 
            `Cada ${this.config.baliza.interval} min` : 'Deshabilitada'}`);
        console.log(`🔊 Roger Beep: ${this.config.rogerBeep?.enabled ? 'ON' : 'OFF'} (Kenwood)`);
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
                callsign: this.config.callsign || 'VX200',
                version: this.config.version || '2.0'
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

async function main() {
    try {
        setupSignalHandlers();
        
        controller = new VX200Controller();
        global.vx200Controller = controller; // Para acceso global
        
        await controller.start();
        
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
