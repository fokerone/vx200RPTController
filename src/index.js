const AudioManager = require('./audio/audioManager');
const Baliza = require('./modules/baliza');
const DateTime = require('./modules/datetime');
const AIChat = require('./modules/aiChat');
const SMS = require('./modules/sms');
const WebServer = require('./web/server');
const { Config } = require('./config');
const { createLogger } = require('./logging/Logger');
const { getSystemOutput } = require('./logging/SystemOutput');
const { MODULE_STATES, DELAYS, ERROR_MESSAGES, WEB_SERVER } = require('./constants');
const { delay, sanitizeTextForTTS } = require('./utils');
const fs = require('fs');
const path = require('path');

class VX200Controller {
    constructor() {
        this.logger = createLogger('[Controller]');
        this.systemOutput = getSystemOutput();
        this.state = MODULE_STATES.IDLE;
        
        this.config = Config.getAll();
        this.audio = null;
        this.modules = {};
        this.webServer = null;
        
        this.isRunning = false;
        this.startTime = Date.now();
        this.initializationErrors = [];
        this.stats = {
            dtmfCount: 0,
            commandsExecuted: 0,
            errors: 0,
            uptime: 0
        };
        
        this.logger.debug('Constructor completado, inicialización pendiente...');
    }
    
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

    async initializeModules() {
        this.modules.baliza = new Baliza(this.audio);
        this.modules.datetime = new DateTime(this.audio);
        this.modules.aiChat = new AIChat(this.audio);
        this.modules.sms = new SMS(this.audio);
        
        this.logger.info('Módulos inicializados');
    }

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
        if (Config.rogerBeepEnabled) {
            this.audio.configureRogerBeep(Config.rogerBeep);
        }
        
        if (Config.balizaEnabled) {
            this.modules.baliza.configure(Config.baliza);
        }
    }

    setupEventHandlers() {
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

        this.setupWebEvents();
    }

    setupWebEvents() {
        this.audio.on('dtmf', (sequence) => {
            this.webServer.broadcastDTMF(sequence);
        });

        this.modules.baliza.on('transmitted', () => {
            this.webServer.broadcastBalizaTransmitted();
        });

        this.interceptLogs();
    }

    interceptLogs() {
        const originalLog = console.log;
        const originalError = console.error;
        
        console.log = (...args) => {
            originalLog.apply(console, args);
            
            const message = args.join(' ');
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

    async handleDTMF(sequence) {
        if (this.modules.sms.sessionState !== 'idle') {
            await this.handleSMSFlow(sequence);
            return;
        }
        const commands = {
            '*1': { module: 'datetime', handler: () => this.modules.datetime.execute(sequence) },
            '*2': { module: 'aiChat', handler: () => this.modules.aiChat.execute(sequence) },
            '*3': { module: 'sms', handler: () => this.modules.sms.execute(sequence) },
            '*9': { module: 'baliza', handler: () => this.modules.baliza.execute(sequence) }
        };

        if (commands[sequence]) {
            const { module, handler } = commands[sequence];
            this.systemOutput.printDTMFDetected(sequence, module);
            await this.safeExecute(handler);
        } else {
            await this.handleUnknownCommand(sequence);
        }
    }

    async handleSMSFlow(sequence) {
        const smsState = this.modules.sms.sessionState;
        
        if (smsState === 'getting_number') {
            if (sequence.endsWith('*') || sequence.endsWith('#')) {
                await this.modules.sms.processDTMF(sequence);
            }
            return;
        }
        
        if (smsState === 'confirming') {
            if (sequence === '1' || sequence === '2') {
                await this.modules.sms.processDTMF(sequence);
            }
            return;
        }
    }

    async handleUnknownCommand(sequence) {
        if (this.modules.sms.sessionState === 'idle') {
            try {
                await this.audio.playTone(400, 200, 0.5);
            } catch (error) {
                
            }
        }
    }

    async safeExecute(callback) {
        try {
            await this.safeTransmit(callback);
        } catch (error) {
            this.logger.error('Error ejecutando comando:', error.message);
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

    async executeWebCommand(command) {
        this.logger.info(`Comando web: ${command}`);
        
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
            this.logger.error('Error comando web:', error.message);
            throw error;
        }
    }

    toggleRogerBeep() {
        const wasEnabled = this.audio.getRogerBeepStatus().enabled;
        const isEnabled = this.audio.toggleRogerBeep();
        
        this.logger.info(`Roger Beep: ${isEnabled ? 'ON' : 'OFF'}`);
        this.webServer.broadcastLog('info', `Roger Beep ${isEnabled ? 'activado' : 'desactivado'}`);
        
        return {
            success: true,
            enabled: isEnabled,
            message: `Roger Beep ${isEnabled ? 'activado' : 'desactivado'}`,
            status: this.audio.getRogerBeepStatus()
        };
    }

    async testRogerBeep() {
        this.logger.info('Test Roger Beep');
        
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

    configureBalizaFromWeb(newConfig) {
        this.logger.info('Configurando baliza desde web');
        this.modules.baliza.configure(newConfig);
        
        this.logger.info('Configuración de baliza actualizada desde panel web');
    }

    async start() {
        if (this.isRunning) {
            this.logger.warn('Sistema ya está ejecutándose');
            return;
        }
        
        try {
            this.logger.info('Iniciando sistema...');
            
            await this.initializeSystem();
            
            if (this.audio && !this.audio.isRecording) {
                const audioStarted = this.audio.start();
                if (!audioStarted) {
                    throw new Error('No se pudo iniciar AudioManager');
                }
            }
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
            
            if (Config.balizaEnabled && this.modules.baliza) {
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
        const moduleStatus = {
            audio: { 
                enabled: this.audio && this.audio.state === MODULE_STATES.ACTIVE,
                details: this.audio ? `Device: ${this.audio.device}` : 'Not initialized'
            },
            baliza: { 
                enabled: Config.balizaEnabled,
                details: Config.balizaEnabled ? `Every ${Config.balizaInterval} min` : null
            },
            rogerBeep: { 
                enabled: Config.rogerBeepEnabled,
                details: Config.rogerBeepEnabled ? Config.rogerBeepType : null
            },
            aiChat: { 
                enabled: Config.aiChatEnabled,
                details: Config.aiChatEnabled ? `Model: ${Config.aiChatModel}` : 'No API key'
            },
            sms: { 
                enabled: Config.smsEnabled,
                details: Config.smsEnabled ? 'Twilio configured' : 'No credentials'
            },
            webServer: { 
                enabled: true,
                details: `Port: ${Config.webPort}`
            }
        };

        this.systemOutput.printModuleStatus(moduleStatus);
        this.systemOutput.printSystemReady();
    }

    stop() {
        this.systemOutput.printShutdown();
        
        this.isRunning = false;
        
        if (this.audio) {
            this.audio.stop();
        }
        
        if (this.webServer) {
            this.webServer.stop();
        }
        
        if (this.modules.baliza?.isRunning) {
            this.modules.baliza.stop();
        }
        
        this.systemOutput.printStopped();
    }

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
            
            this.logger.info(`${service}: ${result.enabled ? 'ON' : 'OFF'}`);
            this.webServer.broadcastLog('info', result.message);
            
        } catch (error) {
            result = { success: false, message: `Error: ${error.message}` };
            this.logger.error(`Error toggle ${service}:`, error.message);
        }
        
        return result;
    }

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
                callsign: Config.callsign,
                version: Config.version
            },
            services: {
                audio: this.audio.getStatus().audio.isRecording,
                baliza: this.modules.baliza.isRunning,
                webServer: this.isRunning,
                rogerBeep: this.audio.getRogerBeepStatus().enabled
            }
        };
    }

    async shutdown() {
        this.logger.warn('Apagando sistema...');
        this.webServer.broadcastLog('warning', 'Sistema apagándose...');
        
        try {
            await this.audio.speakNoRoger('Sistema apagándose');
        } catch (error) {
            
        }
        
        this.stop();
        
        setTimeout(() => {
            console.log('Hasta luego!');
            process.exit(0);
        }, 2000);
    }

    async restart() {
        this.logger.warn('Reiniciando sistema...');
        this.webServer.broadcastLog('warning', 'Reiniciando...');
        
        try {
            await this.audio.speakNoRoger('Sistema reiniciándose');
        } catch (error) {
            
        }
        
        this.stop();
        
        setTimeout(() => {
            console.log('Reiniciando...');
            this.start();
            this.webServer.broadcastLog('success', 'Sistema reiniciado');
        }, 3000);
    }

    async transmitText(text) {
        await this.safeTransmit(async () => {
            this.logger.debug(`TTS: ${text.substring(0, 50)}...`);
            await this.audio.speak(text);
        });
    }

    async healthCheck() {
        this.logger.info('Health Check del sistema:');
        
        const status = this.getSystemStatus();
        
        this.logger.info(`  Audio: ${status.audio.status === 'active' ? 'ACTIVE' : 'INACTIVE'}`);
        this.logger.info(`  Canal: ${status.channel.isActive ? 'OCUPADO' : 'LIBRE'}`);
        this.logger.info(`  Baliza: ${status.baliza.running ? 'RUNNING' : 'STOPPED'}`);
        this.logger.info(`  Roger Beep: ${status.rogerBeep.enabled ? 'ENABLED' : 'DISABLED'}`);
        this.logger.info(`  Web Server: ${this.isRunning ? 'RUNNING' : 'STOPPED'}`);
        
        if (status.audio.status === 'active') {
            try {
                await this.audio.healthCheck();
            } catch (error) {
                this.logger.error('  Test de audio falló');
            }
        }
        
        return status;
    }
}

let controller = null;

function setupSignalHandlers() {
    process.on('SIGINT', () => {
        console.log('\nCtrl+C detectado...');
        if (controller) {
            controller.stop();
        }
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('\nSeñal de terminación...');
        if (controller) {
            controller.stop();
        }
        process.exit(0);
    });

    process.on('uncaughtException', (error) => {
        console.error('Error crítico:', error.message);
        if (controller) {
            controller.stop();
        }
        process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
        console.error('Promesa rechazada:', reason);
        if (controller) {
            controller.stop();
        }
        process.exit(1);
    });
}

async function main() {
    try {
        setupSignalHandlers();
        
        controller = new VX200Controller();
        global.vx200Controller = controller;
        
        await controller.start();
        
    } catch (error) {
        console.error('Error crítico al iniciar:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = VX200Controller;
