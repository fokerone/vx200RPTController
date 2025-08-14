const express = require('express');
const fs = require('fs');
const http = require('http');
const path = require('path');
const cors = require('cors');
const socketIo = require('socket.io');
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

        this.app.get('/aprs-map', (req, res) => {
            res.sendFile(path.join(__dirname, '../../public/aprs-map.html'));
        });

        this.app.get('/api/status', (req, res) => {
            try {
                const status = this.getSystemStatus();
                res.json({ success: true, data: status });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.post('/api/module/:name/toggle', async (req, res) => {
            try {
                const { name } = req.params;
                const result = await this.toggleModule(name);
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

        // API para debug de audio
        this.app.post('/api/debug/save-audio', async (req, res) => {
            try {
                const audioPath = await this.controller.audio.saveDebugAudio();
                if (audioPath) {
                    res.json({
                        success: true,
                        message: 'Audio de debug guardado',
                        path: audioPath,
                        filename: path.basename(audioPath)
                    });
                } else {
                    res.json({
                        success: false,
                        message: 'No hay audio para guardar'
                    });
                }
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Servir archivos de audio debug
        this.app.get('/debug-audio/:filename', (req, res) => {
            try {
                const filename = req.params.filename;
                const audioPath = path.join(__dirname, '../../temp', filename);
                
                if (fs.existsSync(audioPath)) {
                    res.setHeader('Content-Type', 'audio/wav');
                    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                    fs.createReadStream(audioPath).pipe(res);
                } else {
                    res.status(404).json({
                        success: false,
                        error: 'Archivo no encontrado'
                    });
                }
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Rutas APRS

        this.app.get('/api/aprs/status', (req, res) => {
            try {
                if (this.controller.modules.aprs) {
                    const status = this.controller.modules.aprs.getStatus();
                    res.json({ success: true, data: status });
                } else {
                    res.json({ success: false, message: 'Módulo APRS no disponible' });
                }
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.post('/api/aprs/beacon', async (req, res) => {
            try {
                if (this.controller.modules.aprs && this.controller.modules.aprs.isRunning) {
                    await this.controller.modules.aprs.sendBeacon();
                    res.json({ success: true, message: 'Beacon enviado' });
                } else {
                    res.json({ success: false, message: 'Módulo APRS no está activo' });
                }
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.post('/api/aprs/config', async (req, res) => {
            try {
                const { enabled, interval, callsign, comment } = req.body;
                
                if (this.controller.modules.aprs) {
                    // Actualizar configuración
                    await this.controller.modules.aprs.updateBeaconConfig({
                        enabled: enabled !== undefined ? enabled : true,
                        interval: interval || 15,
                        callsign: callsign || 'YOSHUA',
                        comment: comment || 'VX200 RPT'
                    });
                    
                    res.json({ success: true, message: 'Configuración APRS actualizada' });
                } else {
                    res.json({ success: false, message: 'Módulo APRS no disponible' });
                }
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        // APRS Estadísticas detalladas
        this.app.get('/api/aprs/stats', (req, res) => {
            try {
                if (this.controller.modules.aprs) {
                    const stats = this.controller.modules.aprs.getDetailedStats();
                    res.json({ success: true, data: stats });
                } else {
                    res.json({ success: false, message: 'Módulo APRS no disponible' });
                }
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        // APRS Posiciones activas
        this.app.get('/api/aprs/positions', (req, res) => {
            try {
                if (this.controller.modules.aprs) {
                    const positions = this.controller.modules.aprs.getAllPositions();
                    res.json({ success: true, data: positions, total: positions.length });
                } else {
                    res.json({ success: false, message: 'Módulo APRS no disponible' });
                }
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        // DTMF Estado y estadísticas
        this.app.get('/api/dtmf/stats', (req, res) => {
            try {
                if (this.controller.audio && this.controller.audio.dtmfDecoder) {
                    const stats = this.controller.audio.dtmfDecoder.getStats();
                    res.json({ success: true, data: stats });
                } else {
                    res.json({ success: false, message: 'Detector DTMF no disponible' });
                }
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        // DTMF Configurar sensibilidad
        this.app.post('/api/dtmf/sensitivity', (req, res) => {
            try {
                const { level } = req.body;
                
                if (!['low', 'medium', 'high'].includes(level)) {
                    return res.status(400).json({ success: false, message: 'Nivel debe ser: low, medium, high' });
                }
                
                if (this.controller.audio && this.controller.audio.dtmfDecoder) {
                    this.controller.audio.dtmfDecoder.setSensitivity(level);
                    res.json({ success: true, message: `Sensibilidad DTMF configurada: ${level}` });
                } else {
                    res.json({ success: false, message: 'Detector DTMF no disponible' });
                }
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        // DTMF Debug mode
        this.app.post('/api/dtmf/debug', (req, res) => {
            try {
                const { enabled } = req.body;
                
                if (this.controller.audio && this.controller.audio.dtmfDecoder) {
                    this.controller.audio.dtmfDecoder.setDebugMode(enabled === true);
                    res.json({ success: true, message: `Modo debug DTMF: ${enabled ? 'activado' : 'desactivado'}` });
                } else {
                    res.json({ success: false, message: 'Detector DTMF no disponible' });
                }
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        // Weather Alerts API routes
        this.app.get('/api/weather-alerts/status', (req, res) => {
            try {
                if (this.controller.modules.weatherAlerts) {
                    const status = this.controller.modules.weatherAlerts.getStatus();
                    res.json({ success: true, data: status });
                } else {
                    res.json({ success: false, message: 'Módulo Weather Alerts no disponible' });
                }
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.get('/api/weather-alerts/active', (req, res) => {
            try {
                if (this.controller.modules.weatherAlerts) {
                    const alerts = this.controller.modules.weatherAlerts.getActiveAlerts();
                    res.json({ success: true, data: alerts });
                } else {
                    res.json({ success: false, message: 'Módulo Weather Alerts no disponible' });
                }
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.post('/api/weather-alerts/check', async (req, res) => {
            try {
                if (this.controller.modules.weatherAlerts) {
                    await this.controller.modules.weatherAlerts.checkForAlerts();
                    res.json({ success: true, message: 'Verificación de alertas iniciada' });
                } else {
                    res.json({ success: false, message: 'Módulo Weather Alerts no disponible' });
                }
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.post('/api/weather-alerts/toggle', (req, res) => {
            try {
                if (this.controller.modules.weatherAlerts) {
                    const currentState = this.controller.modules.weatherAlerts.state;
                    if (currentState === 'ACTIVE') {
                        this.controller.modules.weatherAlerts.stop();
                        res.json({ success: true, message: 'Sistema de alertas detenido', enabled: false });
                    } else {
                        this.controller.modules.weatherAlerts.start();
                        res.json({ success: true, message: 'Sistema de alertas iniciado', enabled: true });
                    }
                } else {
                    res.json({ success: false, message: 'Módulo Weather Alerts no disponible' });
                }
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        // === RUTAS SISTEMA DE CLEANUP ===
        
        this.app.get('/api/system/health', (req, res) => {
            try {
                const health = this.controller.getSystemHealth();
                res.json({ success: true, data: health });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.get('/api/system/temp-stats', (req, res) => {
            try {
                if (this.controller.audio && typeof this.controller.audio.getTempSpaceStats === 'function') {
                    const stats = this.controller.audio.getTempSpaceStats();
                    res.json({ success: true, data: stats });
                } else {
                    res.json({ success: false, message: 'Función de estadísticas temporales no disponible' });
                }
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.post('/api/system/cleanup', async (req, res) => {
            try {
                const result = await this.controller.forceCleanup();
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.get('/api/system/cleanup-config', (req, res) => {
            try {
                if (this.controller.audio && this.controller.audio.cleanupConfig) {
                    const config = this.controller.audio.cleanupConfig;
                    res.json({ 
                        success: true, 
                        data: {
                            intervalHours: config.interval / (60 * 60 * 1000),
                            maxFileAgeHours: config.maxFileAge / (60 * 60 * 1000),
                            maxTempSizeMB: config.maxTempSize / (1024 * 1024)
                        }
                    });
                } else {
                    res.json({ success: false, message: 'Configuración de cleanup no disponible' });
                }
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
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
                weather: {
                    enabled: this.getModuleStatus('weather') === 'enabled',
                    status: this.getModuleStatus('weather')
                },
                weatherAlerts: {
                    enabled: this.getModuleStatus('weatherAlerts') === 'enabled',
                    status: this.getModuleStatus('weatherAlerts'),
                    activeAlerts: this.controller.modules?.weatherAlerts?.getStatus()?.activeAlerts || 0
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


            if (moduleName === 'weather') {
                return process.env.OPENWEATHER_API_KEY ? 'enabled' : 'disabled';
            }

            if (moduleName === 'weatherAlerts') {
                const module = this.controller.modules?.weatherAlerts;
                return module && module.config?.enabled ? 'enabled' : 'disabled';
            }

            return 'ready';
        } catch (error) {
            return 'error';
        }
    }

    async toggleModule(moduleName) {
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

                case 'weatherAlerts':
                    if (this.controller.modules.weatherAlerts) {
                        const currentState = this.controller.modules.weatherAlerts.state;
                        if (currentState === 'ACTIVE') {
                            this.controller.modules.weatherAlerts.stop();
                            return { success: true, message: 'Sistema de alertas detenido', enabled: false };
                        } else {
                            this.controller.modules.weatherAlerts.start();
                            return { success: true, message: 'Sistema de alertas iniciado', enabled: true };
                        }
                    }
                    return { success: false, message: 'Módulo Weather Alerts no disponible' };

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
            const { Config, configManager } = require('../config');
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
            // Obtener información completa del estado del canal
            const audioStatus = this.controller?.audio?.getStatus();
            
            const channelInfo = {
                isActive,
                level,
                transmitting: audioStatus?.channel?.transmitting || false,
                inputActivity: audioStatus?.channel?.inputActivity || false
            };
            
            this.io.emit('channel_activity', channelInfo);
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

    // Eventos Sistema de Salud 24/7
    broadcastCleanupCompleted(data) {
        if (this.connectedClients.size > 0) {
            this.io.emit('cleanup_completed', {
                filesDeleted: data.filesDeleted || 0,
                sizeFreedMB: data.sizeFreedMB || 0,
                timestamp: new Date().toISOString(),
                ...data
            });
        }
    }

    broadcastSystemHealthUpdate(healthData) {
        if (this.connectedClients.size > 0) {
            this.io.emit('system_health_update', {
                ...healthData,
                timestamp: new Date().toISOString()
            });
        }
    }

    // Eventos APRS
    broadcastAPRSPosition(position) {
        if (this.connectedClients.size > 0) {
            const positionEvent = {
                callsign: position.callsign,
                lat: position.lat,
                lon: position.lon,
                timestamp: position.timestamp,
                comment: position.comment,
                symbol: position.symbol
            };
            this.io.emit('aprs_position', { data: positionEvent });
            this.logger.debug(`Posición APRS transmitida: ${position.callsign}`);
        }
    }

    broadcastAPRSBeacon(beacon) {
        if (this.connectedClients.size > 0) {
            const beaconEvent = {
                callsign: beacon.callsign,
                location: beacon.location,
                timestamp: beacon.timestamp
            };
            this.io.emit('aprs_beacon', { data: beaconEvent });
            this.logger.debug(`Beacon APRS transmitido: ${beacon.callsign}`);
        }
    }

    broadcastAPRSStatus(status) {
        if (this.connectedClients.size > 0) {
            this.io.emit('aprs_status', { data: status });
        }
    }

    // Weather Alerts broadcast methods
    broadcastWeatherAlert(alert) {
        if (this.connectedClients.size > 0) {
            const alertEvent = {
                id: alert.id,
                title: alert.title,
                description: alert.description,
                severity: alert.severity,
                timestamp: alert.firstSeen || Date.now()
            };
            this.io.emit('weather_alert_new', { data: alertEvent });
            this.logger.info(`Nueva alerta meteorológica transmitida: ${alert.title}`);
        }
    }

    broadcastWeatherAlertStatus(status) {
        if (this.connectedClients.size > 0) {
            this.io.emit('weather_alerts_status', { data: status });
        }
    }

    broadcastWeatherAlertExpired(alertId) {
        if (this.connectedClients.size > 0) {
            this.io.emit('weather_alert_expired', { data: { id: alertId } });
        }
    }



    getDTMFTargetModule(sequence) {
        const commands = {
            '*1': 'DateTime',
            '*4': 'Clima',
            '*5': 'Clima Voz',
            '*7': 'Alertas Meteo',
            '*0': 'Test Alertas',
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