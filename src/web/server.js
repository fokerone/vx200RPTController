const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const { WEB_SERVER, MODULE_STATES } = require('../constants');
const { createLogger } = require('../logging/Logger');

class WebServer {
    constructor(controller) {
        this.controller = controller;
        this.logger = createLogger('[WebServer]');
        this.state = MODULE_STATES.IDLE;
        
        this.config = {
            port: parseInt(process.env.WEB_PORT) || 3000,
            host: process.env.WEB_HOST || '0.0.0.0',
            allowedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
            maxConnections: 10
        };
        
        this.connectedClients = new Set();
        this.startTime = Date.now();
        this.dtmfHistory = [];
        this.systemEvents = [];
        
        this.initializeServer();
        this.logger.info(`Servidor web configurado para puerto ${this.config.port}`);
    }

    initializeServer() {
        try {
            this.app = express();
            this.server = http.createServer(this.app);
            this.io = socketIo(this.server, {
                cors: {
                    origin: this.config.allowedOrigins,
                    methods: ["GET", "POST"],
                    credentials: true
                }
            });
            
            this.setupMiddleware();
            this.setupRoutes();
            this.setupSocketHandlers();
            
            this.state = MODULE_STATES.IDLE;
            
        } catch (error) {
            this.logger.error('Error inicializando servidor:', error.message);
            this.state = MODULE_STATES.ERROR;
        }
    }

    setupMiddleware() {
        this.app.use(cors({
            origin: this.config.allowedOrigins,
            credentials: true
        }));
        
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.static(path.join(__dirname, '../../public')));
        
        this.app.use((req, res, next) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            next();
        });
    }

    setupRoutes() {
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../../public/index.html'));
        });

        this.app.get('/api/status', (req, res) => {
            try {
                const status = this.getSystemStatus();
                res.json({ success: true, data: status });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.post('/api/module/:name/toggle', (req, res) => {
            try {
                const { name } = req.params;
                const result = this.toggleModule(name);
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.post('/api/system/:action', (req, res) => {
            try {
                const { action } = req.params;
                const result = this.systemAction(action);
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.get('/api/config', (req, res) => {
            try {
                const { Config } = require('../config');
                res.json({ success: true, data: Config.getAll() });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.post('/api/config', (req, res) => {
            try {
                const result = this.updateConfiguration(req.body);
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.get('/api/dtmf/history', (req, res) => {
            res.json({ 
                success: true, 
                data: this.dtmfHistory.slice(-20)
            });
        });
        this.app.use((req, res) => {
            res.status(404).json({ success: false, message: 'Endpoint not found' });
        });
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            this.connectedClients.add(clientId);
            
            this.logger.info(`Cliente conectado: ${clientId} (${this.connectedClients.size} activos)`);
            socket.emit('system_status', { data: this.getSystemStatus() });
            socket.emit('dtmf_history', { data: this.dtmfHistory.slice(-10) });

            socket.on('disconnect', () => {
                this.connectedClients.delete(clientId);
                this.logger.info(`Cliente desconectado: ${clientId}`);
            });
            socket.on('execute_command', async (data) => {
                try {
                    const result = await this.handleCommand(data);
                    socket.emit('command_result', result);
                } catch (error) {
                    socket.emit('command_result', { 
                        success: false, 
                        message: error.message 
                    });
                }
            });
        });
    }

    getSystemStatus() {
        const audioStatus = this.controller.audio?.getStatus() || { 
            audio: { status: 'unavailable' },
            channel: { isActive: false, level: 0 }
        };

        return {
            timestamp: new Date().toISOString(),
            uptime: Date.now() - this.startTime,
            server: {
                connectedClients: this.connectedClients.size,
                state: this.state
            },
            audio: audioStatus.audio,
            channel: audioStatus.channel,
            modules: {
                baliza: {
                    enabled: this.controller.modules?.baliza?.isRunning || false,
                    status: this.getModuleStatus('baliza')
                },
                datetime: {
                    enabled: true,
                    status: 'ready'
                },
                aiChat: {
                    enabled: this.getModuleStatus('aiChat') === 'enabled',
                    status: this.getModuleStatus('aiChat')
                },
                sms: {
                    enabled: this.getModuleStatus('sms') === 'enabled',
                    status: this.getModuleStatus('sms')
                },
                rogerBeep: {
                    enabled: this.controller.audio?.getRogerBeepStatus()?.enabled || false,
                    status: 'ready'
                }
            }
        };
    }

    getModuleStatus(moduleName) {
        try {
            if (!this.controller.modules?.[moduleName]) {
                return 'unavailable';
            }

            const module = this.controller.modules[moduleName];
            
            if (typeof module.getStatus === 'function') {
                const status = module.getStatus();
                return status.enabled ? 'enabled' : 'disabled';
            }

            if (moduleName === 'aiChat') {
                const { Config } = require('../config');
                return Config.aiChatEnabled ? 'enabled' : 'disabled';
            }

            if (moduleName === 'sms') {
                const { Config } = require('../config');
                return Config.smsEnabled ? 'enabled' : 'disabled';
            }

            return 'ready';
        } catch (error) {
            return 'error';
        }
    }

    toggleModule(moduleName) {
        try {
            switch (moduleName) {
                case 'baliza':
                    if (this.controller.modules.baliza.isRunning) {
                        this.controller.modules.baliza.stop();
                        return { success: true, message: 'Baliza detenida', enabled: false };
                    } else {
                        this.controller.modules.baliza.start();
                        return { success: true, message: 'Baliza iniciada', enabled: true };
                    }

                case 'rogerBeep':
                    const newState = this.controller.audio.toggleRogerBeep();
                    return { 
                        success: true, 
                        message: `Roger Beep ${newState ? 'habilitado' : 'deshabilitado'}`,
                        enabled: newState 
                    };

                default:
                    throw new Error(`Módulo ${moduleName} no soporta toggle`);
            }
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    systemAction(action) {
        try {
            switch (action) {
                case 'restart':
                    this.logger.warn('Reinicio solicitado desde panel web');
                    setTimeout(() => this.controller.restart(), 1000);
                    return { success: true, message: 'Sistema reiniciándose...' };

                case 'shutdown':
                    this.logger.warn('Apagado solicitado desde panel web');
                    setTimeout(() => this.controller.shutdown(), 1000);
                    return { success: true, message: 'Sistema apagándose...' };

                default:
                    throw new Error(`Acción ${action} no reconocida`);
            }
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    updateConfiguration(newConfig) {
        try {
            const { Config, ConfigManager } = require('../config');
            
            const configManager = ConfigManager.getInstance();
            const configUpdates = {};
            if (newConfig.callsign) {
                configUpdates['system.callsign'] = newConfig.callsign;
            }
            if (newConfig.webPort) {
                configUpdates['web.port'] = parseInt(newConfig.webPort);
            }
            
            if (newConfig.audioDevice) {
                configUpdates['audio.device'] = newConfig.audioDevice;
            }
            if (newConfig.channelThreshold) {
                configUpdates['audio.channelThreshold'] = parseFloat(newConfig.channelThreshold);
            }
            
            if (newConfig.balizaEnabled !== undefined) {
                configUpdates['baliza.enabled'] = Boolean(newConfig.balizaEnabled);
            }
            if (newConfig.balizaInterval) {
                configUpdates['baliza.interval'] = parseInt(newConfig.balizaInterval);
            }
            if (newConfig.balizaFrequency) {
                configUpdates['baliza.tone.frequency'] = parseInt(newConfig.balizaFrequency);
            }
            if (newConfig.balizaMessage) {
                configUpdates['baliza.message'] = newConfig.balizaMessage;
            }
            
            if (newConfig.rogerBeepEnabled !== undefined) {
                configUpdates['rogerBeep.enabled'] = Boolean(newConfig.rogerBeepEnabled);
            }
            if (newConfig.rogerBeepType) {
                configUpdates['rogerBeep.type'] = newConfig.rogerBeepType;
            }
            if (newConfig.rogerBeepVolume) {
                configUpdates['rogerBeep.volume'] = parseFloat(newConfig.rogerBeepVolume);
            }
            
            if (newConfig.ttsVoice) {
                configUpdates['tts.voice'] = newConfig.ttsVoice;
            }
            if (newConfig.ttsSpeed) {
                configUpdates['tts.speed'] = parseInt(newConfig.ttsSpeed);
            }
            
            if (newConfig.aiChatApiKey) {
                configUpdates['aiChat.apiKey'] = newConfig.aiChatApiKey;
            }
            if (newConfig.twilioAccountSid) {
                configUpdates['twilio.accountSid'] = newConfig.twilioAccountSid;
            }
            if (newConfig.twilioAuthToken) {
                configUpdates['twilio.authToken'] = newConfig.twilioAuthToken;
            }
            
            Object.entries(configUpdates).forEach(([path, value]) => {
                configManager.setValue(path, value);
            });
            
            configManager.saveToFile();
            this.broadcastConfigurationUpdate(configUpdates);
            
            this.logger.info('Configuración actualizada desde panel web');
            return { 
                success: true, 
                message: 'Configuración actualizada y guardada',
                applied: Object.keys(configUpdates).length
            };
        } catch (error) {
            this.logger.error('Error actualizando configuración:', error.message);
            return { success: false, message: error.message };
        }
    }

    async handleCommand(data) {
        const { command, params = {} } = data;

        switch (command) {
            case 'execute_module':
                const moduleName = params.module;
                if (this.controller.modules[moduleName]) {
                    await this.controller.modules[moduleName].execute(`*${params.code || '1'}`);
                    return { success: true, message: `${moduleName} ejecutado` };
                }
                throw new Error(`Módulo ${moduleName} no disponible`);

            case 'test_roger_beep':
                if (this.controller.audio?.testRogerBeep) {
                    await this.controller.audio.testRogerBeep();
                    return { success: true, message: 'Test Roger Beep ejecutado' };
                }
                throw new Error('Roger Beep no disponible');

            default:
                throw new Error(`Comando ${command} no reconocido`);
        }
    }

    broadcastSystemStatus() {
        if (this.connectedClients.size > 0) {
            this.io.emit('system_status', { data: this.getSystemStatus() });
        }
    }

    broadcastDTMF(sequence) {
        const dtmfEvent = {
            sequence,
            timestamp: new Date().toISOString(),
            targetModule: this.getDTMFTargetModule(sequence)
        };

        this.dtmfHistory.push(dtmfEvent);
        if (this.dtmfHistory.length > 50) {
            this.dtmfHistory.shift();
        }

        if (this.connectedClients.size > 0) {
            this.io.emit('dtmf_detected', dtmfEvent);
        }
    }

    broadcastChannelActivity(isActive, level) {
        if (this.connectedClients.size > 0) {
            this.io.emit('channel_activity', { isActive, level });
        }
    }

    broadcastBalizaTransmitted(data = {}) {
        const balizaEvent = {
            timestamp: new Date().toISOString(),
            count: data.count || 0,
            message: data.message || '',
            ...data
        };
        
        if (this.connectedClients.size > 0) {
            this.io.emit('baliza_transmitted', balizaEvent);
        }
    }

    broadcastSignalLevel(data) {
        if (this.connectedClients.size > 0) {
            this.io.emit('signal_level', data);
        }
    }

    broadcastModuleStatusChange(moduleName, status) {
        if (this.connectedClients.size > 0) {
            this.io.emit('module_status_change', { module: moduleName, status });
        }
    }

    broadcastLog(level, message) {
        const logEvent = {
            level,
            message,
            timestamp: new Date().toISOString()
        };

        this.systemEvents.push(logEvent);
        if (this.systemEvents.length > 100) {
            this.systemEvents.shift();
        }

        if (this.connectedClients.size > 0) {
            this.io.emit('log_entry', logEvent);
        }
    }

    broadcastConfigurationUpdate(updates) {
        if (this.connectedClients.size > 0) {
            this.io.emit('configuration_updated', { updates });
        }
    }

    getDTMFTargetModule(sequence) {
        const commands = {
            '*1': 'DateTime',
            '*2': 'AI Chat',
            '*3': 'SMS',
            '*9': 'Baliza'
        };
        return commands[sequence] || 'Unknown';
    }

    start() {
        return new Promise((resolve, reject) => {
            if (this.state === MODULE_STATES.ERROR) {
                reject(new Error('WebServer en estado de error'));
                return;
            }

            try {
                this.server.listen(this.config.port, this.config.host, () => {
                    this.state = MODULE_STATES.ACTIVE;
                    this.logger.info(`Panel web disponible en: http://${this.config.host}:${this.config.port}`);
                    resolve();
                });

                this.server.on('error', (error) => {
                    this.state = MODULE_STATES.ERROR;
                    this.logger.error('Error del servidor HTTP:', error.message);
                    reject(error);
                });

            } catch (error) {
                this.state = MODULE_STATES.ERROR;
                this.logger.error('Error iniciando servidor web:', error.message);
                reject(error);
            }
        });
    }

    stop() {
        return new Promise((resolve) => {
            this.logger.info('Deteniendo servidor web...');
            this.state = MODULE_STATES.DISABLED;

            if (this.io) {
                this.io.emit('server_shutdown', { message: 'Servidor cerrando' });
                this.io.close();
            }

            if (this.server) {
                this.server.close(() => {
                    this.logger.info('Servidor web detenido');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = WebServer;