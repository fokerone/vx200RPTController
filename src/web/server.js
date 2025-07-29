const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const { WEB_SERVER, MODULE_STATES, DELAYS, ERROR_MESSAGES } = require('../constants');
const { delay, createLogger, validateVolume, sanitizeTextForTTS } = require('../utils');

class WebServer {
    constructor(controller) {
        this.controller = controller;
        this.logger = createLogger('[WebServer]');
        this.state = MODULE_STATES.IDLE;
        
        // Configuración del servidor
        this.config = {
            port: parseInt(process.env.WEB_PORT) || WEB_SERVER.DEFAULT_PORT,
            host: process.env.WEB_HOST || WEB_SERVER.DEFAULT_HOST,
            allowedOrigins: process.env.ALLOWED_ORIGINS ? 
                process.env.ALLOWED_ORIGINS.split(',') : 
                WEB_SERVER.DEFAULT_ORIGINS,
            signalThrottle: WEB_SERVER.SIGNAL_THROTTLE_MS,
            maxConnections: WEB_SERVER.MAX_CONNECTIONS
        };
        
        // Estado del servidor
        this.connectedClients = new Set();
        this.lastSignalBroadcast = 0;
        this.requestCount = 0;
        this.startTime = Date.now();
        
        this.initializeServer();
        this.logger.info(`Servidor web configurado para puerto ${this.config.port} (no está escuchando aún)`);
    }

    /**
     * Inicializar componentes del servidor
     */
    initializeServer() {
        try {
            this.app = express();
            this.server = http.createServer(this.app);
            this.io = socketIo(this.server, {
                cors: {
                    origin: this.config.allowedOrigins,
                    methods: ["GET", "POST"],
                    credentials: true
                },
                maxHttpBufferSize: WEB_SERVER.MAX_BUFFER_SIZE,
                pingTimeout: WEB_SERVER.PING_TIMEOUT,
                pingInterval: WEB_SERVER.PING_INTERVAL
            });
            
            this.setupMiddleware();
            this.setupRoutes();
            this.setupSocketHandlers();
            this.setupErrorHandlers();
            
            this.state = MODULE_STATES.IDLE;
            
        } catch (error) {
            this.logger.error('Error inicializando servidor:', error.message);
            this.state = MODULE_STATES.ERROR;
        }
    }

    setupMiddleware() {
        try {
            // Middleware de logging de requests
            this.app.use((req, res, next) => {
                this.requestCount++;
                this.logger.debug(`${req.method} ${req.path} - Cliente: ${req.ip}`);
                next();
            });
            
            // CORS con configuración segura
            this.app.use(cors({
                origin: this.config.allowedOrigins,
                credentials: true,
                methods: ['GET', 'POST'],
                allowedHeaders: ['Content-Type', 'Authorization']
            }));
            
            // Parseo de JSON con límites
            this.app.use(express.json({ 
                limit: WEB_SERVER.MAX_JSON_SIZE,
                strict: true
            }));
            
            this.app.use(express.urlencoded({ 
                extended: true, 
                limit: WEB_SERVER.MAX_JSON_SIZE 
            }));
            
            // Headers de seguridad
            this.app.use((req, res, next) => {
                res.setHeader('X-Content-Type-Options', 'nosniff');
                res.setHeader('X-Frame-Options', 'DENY');
                res.setHeader('X-XSS-Protection', '1; mode=block');
                next();
            });
            
            // Archivos estáticos con cache
            const staticPath = path.join(__dirname, '../../public');
            this.app.use(express.static(staticPath, {
                maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
                etag: true,
                lastModified: true
            }));
            
            // Motor de plantillas
            this.app.set('view engine', 'ejs');
            this.app.set('views', path.join(__dirname, '../../views'));
            
            this.logger.debug('Middleware configurado exitosamente');
            
        } catch (error) {
            this.logger.error('Error configurando middleware:', error.message);
            this.state = MODULE_STATES.ERROR;
        }
    }

    setupRoutes() {
        try {
            // ===== PÁGINAS WEB =====
            
            this.app.get('/', (req, res) => {
                try {
                    res.render('index', {
                        title: 'VX200 Controller - LU5MCD',
                        status: this.getSystemStatus(),
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    this.logger.error('Error renderizando página principal:', error.message);
                    res.status(500).send('Error interno del servidor');
                }
            });

            // ===== API ENDPOINTS =====
            
            // Status general del sistema
            this.app.get('/api/status', (req, res) => {
                try {
                    const status = this.getSystemStatus();
                    res.json({
                        success: true,
                        data: status,
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    this.logger.error('Error obteniendo status:', error.message);
                    res.status(500).json({
                        success: false,
                        message: 'Error obteniendo estado del sistema'
                    });
                }
            });

            // ===== MÓDULO BALIZA =====
            
            this.app.post('/api/baliza/manual', (req, res) => {
                try {
                    if (!this.controller.modules.baliza) {
                        return res.status(404).json({
                            success: false,
                            message: 'Módulo Baliza no disponible'
                        });
                    }
                    
                    this.controller.modules.baliza.execute('*9');
                    this.logger.info('Baliza manual ejecutada desde panel web');
                    
                    res.json({ 
                        success: true, 
                        message: 'Baliza manual ejecutada',
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    this.logger.error('Error ejecutando baliza manual:', error.message);
                    res.status(500).json({
                        success: false,
                        message: 'Error ejecutando baliza manual'
                    });
                }
            });

            this.app.post('/api/baliza/config', (req, res) => {
                try {
                    const { interval, frequency, duration, volume, message } = req.body;
                    
                    // Validar parámetros
                    if (!interval || !frequency || !duration || volume === undefined || !message) {
                        return res.status(400).json({
                            success: false,
                            message: 'Parámetros incompletos'
                        });
                    }
                    
                    const config = {
                        interval: Math.max(1, Math.min(60, parseInt(interval))),
                        tone: {
                            frequency: Math.max(200, Math.min(3000, parseInt(frequency))),
                            duration: Math.max(100, Math.min(2000, parseInt(duration))),
                            volume: validateVolume(parseFloat(volume))
                        },
                        message: sanitizeTextForTTS(message)
                    };
                    
                    this.controller.modules.baliza.configure(config);
                    this.logger.info('Configuración de Baliza actualizada desde panel web');
                    
                    res.json({ 
                        success: true, 
                        message: 'Configuración de baliza actualizada',
                        config: config
                    });
                } catch (error) {
                    this.logger.error('Error configurando baliza:', error.message);
                    res.status(500).json({
                        success: false,
                        message: 'Error actualizando configuración'
                    });
                }
            });

            // ===== MÓDULO DATETIME =====
            
            this.app.post('/api/datetime/execute', (req, res) => {
                try {
                    if (!this.controller.modules.datetime) {
                        return res.status(404).json({
                            success: false,
                            message: 'Módulo DateTime no disponible'
                        });
                    }
                    
                    this.controller.modules.datetime.execute('*1');
                    this.logger.info('DateTime ejecutado desde panel web');
                    
                    res.json({ 
                        success: true, 
                        message: 'Fecha y hora anunciada',
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    this.logger.error('Error ejecutando datetime:', error.message);
                    res.status(500).json({
                        success: false,
                        message: 'Error ejecutando anuncio de fecha y hora'
                    });
                }
            });

            // ===== MÓDULO AI CHAT =====
            
            this.app.post('/api/ai/execute', (req, res) => {
                try {
                    if (!this.controller.modules.aiChat) {
                        return res.status(404).json({
                            success: false,
                            message: 'Módulo AI Chat no disponible'
                        });
                    }
                    
                    this.controller.modules.aiChat.execute('*2');
                    this.logger.info('AI Chat ejecutado desde panel web');
                    
                    res.json({ 
                        success: true, 
                        message: 'Sesión de IA iniciada',
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    this.logger.error('Error ejecutando AI Chat:', error.message);
                    res.status(500).json({
                        success: false,
                        message: 'Error iniciando sesión de IA'
                    });
                }
            });

            // ===== MÓDULO SMS =====
            
            this.app.post('/api/sms/execute', (req, res) => {
                try {
                    if (!this.controller.modules.sms) {
                        return res.status(404).json({
                            success: false,
                            message: 'Módulo SMS no disponible'
                        });
                    }
                    
                    this.controller.modules.sms.execute('*3');
                    this.logger.info('SMS ejecutado desde panel web');
                    
                    res.json({ 
                        success: true, 
                        message: 'Sesión SMS iniciada',
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    this.logger.error('Error ejecutando SMS:', error.message);
                    res.status(500).json({
                        success: false,
                        message: 'Error iniciando sesión SMS'
                    });
                }
            });

            // ===== LOGS DEL SISTEMA =====
            
            this.app.get('/api/logs', (req, res) => {
                try {
                    const limit = parseInt(req.query.limit) || 50;
                    const level = req.query.level || 'all';
                    
                    // TODO: Implementar sistema de logs real con winston
                    // Por ahora, logs simulados
                    const simulatedLogs = [
                        { 
                            timestamp: new Date().toISOString(), 
                            level: 'info', 
                            message: 'Sistema operativo', 
                            module: 'System' 
                        },
                        { 
                            timestamp: new Date(Date.now() - 60000).toISOString(), 
                            level: 'info', 
                            message: 'Baliza transmitida', 
                            module: 'Baliza' 
                        },
                        { 
                            timestamp: new Date(Date.now() - 120000).toISOString(), 
                            level: 'debug', 
                            message: 'DTMF detectado: *1', 
                            module: 'DTMF' 
                        },
                        { 
                            timestamp: new Date(Date.now() - 180000).toISOString(), 
                            level: 'info', 
                            message: 'AudioManager iniciado', 
                            module: 'Audio' 
                        }
                    ];
                    
                    let filteredLogs = simulatedLogs;
                    if (level !== 'all') {
                        filteredLogs = simulatedLogs.filter(log => log.level === level);
                    }
                    
                    res.json({
                        success: true,
                        data: filteredLogs.slice(0, limit),
                        total: filteredLogs.length,
                        filters: { limit, level }
                    });
                    
                } catch (error) {
                    this.logger.error('Error obteniendo logs:', error.message);
                    res.status(500).json({
                        success: false,
                        message: 'Error obteniendo logs del sistema'
                    });
                }
            });

            // ===== ROGER BEEP API =====
            
            this.app.get('/api/roger-beep/status', (req, res) => {
                try {
                    if (!this.controller.audio || !this.controller.audio.getRogerBeep) {
                        return res.status(404).json({ 
                            success: false, 
                            message: 'Roger Beep no disponible' 
                        });
                    }

                    const status = this.controller.audio.getRogerBeep().getConfig();
                    res.json({ 
                        success: true, 
                        data: status,
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    this.logger.error('Error obteniendo status Roger Beep:', error.message);
                    res.status(500).json({ 
                        success: false, 
                        message: 'Error obteniendo estado de Roger Beep' 
                    });
                }
            });

            this.app.post('/api/roger-beep/config', (req, res) => {
                try {
                    const { type, volume, duration, delay, enabled } = req.body;
                    
                    if (!this.controller.audio || !this.controller.audio.configureRogerBeep) {
                        return res.status(404).json({ 
                            success: false, 
                            message: 'Roger Beep no disponible' 
                        });
                    }

                    const config = {};
                    
                    // Validar y limpiar parámetros
                    if (type && ['kenwood'].includes(type)) {
                        config.type = type;
                    }
                    
                    if (volume !== undefined) {
                        config.volume = validateVolume(parseFloat(volume));
                    }
                    
                    if (duration !== undefined) {
                        const dur = parseInt(duration);
                        config.duration = Math.max(50, Math.min(1000, dur));
                    }
                    
                    if (delay !== undefined) {
                        const del = parseInt(delay);
                        config.delay = Math.max(0, Math.min(1000, del));
                    }
                    
                    if (enabled !== undefined) {
                        config.enabled = Boolean(enabled);
                    }

                    const result = this.controller.audio.configureRogerBeep(config);
                    
                    if (result) {
                        this.logger.info('Roger Beep configurado desde panel web');
                        res.json({ 
                            success: true, 
                            message: 'Roger Beep configurado correctamente',
                            config: config,
                            timestamp: new Date().toISOString()
                        });
                    } else {
                        res.status(400).json({ 
                            success: false, 
                            message: 'Error aplicando configuración' 
                        });
                    }
                } catch (error) {
                    this.logger.error('Error configurando Roger Beep:', error.message);
                    res.status(500).json({ 
                        success: false, 
                        message: 'Error configurando Roger Beep' 
                    });
                }
            });

            this.app.post('/api/roger-beep/test', (req, res) => {
                try {
                    if (!this.controller.audio || !this.controller.audio.testRogerBeep) {
                        return res.status(404).json({ 
                            success: false, 
                            message: 'Roger Beep no disponible para test' 
                        });
                    }

                    this.controller.audio.testRogerBeep();
                    this.logger.info('Test Roger Beep ejecutado desde panel web');
                    
                    res.json({ 
                        success: true, 
                        message: 'Test Roger Beep ejecutado',
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    this.logger.error('Error en test Roger Beep:', error.message);
                    res.status(500).json({ 
                        success: false, 
                        message: 'Error ejecutando test Roger Beep' 
                    });
                }
            });

            this.app.post('/api/roger-beep/toggle', (req, res) => {
                try {
                    if (!this.controller.audio || !this.controller.audio.getRogerBeep) {
                        return res.status(404).json({ 
                            success: false, 
                            message: 'Roger Beep no disponible' 
                        });
                    }

                    const rogerBeep = this.controller.audio.getRogerBeep();
                    const newState = rogerBeep.toggle();
                    
                    this.logger.info(`Roger Beep ${newState ? 'habilitado' : 'deshabilitado'} desde panel web`);
                    
                    res.json({ 
                        success: true, 
                        message: `Roger Beep ${newState ? 'habilitado' : 'deshabilitado'}`,
                        enabled: newState,
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    this.logger.error('Error toggle Roger Beep:', error.message);
                    res.status(500).json({ 
                        success: false, 
                        message: 'Error cambiando estado Roger Beep' 
                    });
                }
            });

            // ===== SISTEMA Y CONTROL =====
            
            this.app.post('/api/system/shutdown', (req, res) => {
                try {
                    this.logger.warn('Solicitud de apagado desde panel web');
                    res.json({ 
                        success: true, 
                        message: 'Sistema apagándose...',
                        timestamp: new Date().toISOString()
                    });
                    
                    // Apagar después de enviar respuesta
                    setTimeout(() => {
                        this.controller.shutdown();
                    }, 1000);
                } catch (error) {
                    this.logger.error('Error procesando shutdown:', error.message);
                    res.status(500).json({
                        success: false,
                        message: 'Error procesando solicitud de apagado'
                    });
                }
            });

            this.setupErrorHandlers();
            this.logger.debug('Rutas configuradas exitosamente');
            
        } catch (error) {
            this.logger.error('Error configurando rutas:', error.message);
            this.state = MODULE_STATES.ERROR;
        }
    }

    /**
     * Configurar manejadores de errores
     */
    setupErrorHandlers() {
        // 404 - Ruta no encontrada
        this.app.use((req, res) => {
            this.logger.warn(`Ruta no encontrada: ${req.method} ${req.path}`);
            res.status(404).json({
                success: false,
                message: 'Endpoint no encontrado',
                path: req.path,
                method: req.method
            });
        });

        // Manejo global de errores
        this.app.use((err, req, res, next) => {
            this.logger.error('Error no manejado:', err.message);
            res.status(500).json({
                success: false,
                message: process.env.NODE_ENV === 'development' ? err.message : 'Error interno del servidor',
                ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
            });
        });
    }

    setupSocketHandlers() {
        try {
            // Middleware de autenticación/logging para sockets
            this.io.use((socket, next) => {
                socket.clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                socket.connectedAt = new Date();
                next();
            });

            this.io.on('connection', (socket) => {
                // Verificar límite de conexiones
                if (this.connectedClients.size >= this.config.maxConnections) {
                    this.logger.warn(`Límite de conexiones alcanzado: ${this.connectedClients.size}`);
                    socket.emit('connection_rejected', { 
                        reason: 'Máximo de conexiones alcanzado' 
                    });
                    socket.disconnect(true);
                    return;
                }

                this.connectedClients.add(socket.clientId);
                this.logger.info(`Cliente web conectado: ${socket.clientId} (${this.connectedClients.size} activos)`);

                // Enviar estado inicial
                try {
                    socket.emit('system_status', {
                        success: true,
                        data: this.getSystemStatus(),
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    this.logger.error('Error enviando estado inicial:', error.message);
                }

                // Manejar desconexión
                socket.on('disconnect', (reason) => {
                    this.connectedClients.delete(socket.clientId);
                    this.logger.info(`Cliente web desconectado: ${socket.clientId} (Razón: ${reason})`);
                });

                // Manejar comandos desde el panel
                socket.on('execute_command', async (data) => {
                    if (!data || !data.command) {
                        socket.emit('command_result', { 
                            success: false, 
                            message: 'Comando inválido' 
                        });
                        return;
                    }

                    try {
                        const result = await this.handleSocketCommand(data.command, data.params || {});
                        socket.emit('command_result', {
                            success: true,
                            message: result.message || `Comando ${data.command} ejecutado`,
                            data: result.data || null,
                            timestamp: new Date().toISOString()
                        });
                    } catch (error) {
                        this.logger.error(`Error ejecutando comando ${data.command}:`, error.message);
                        socket.emit('command_result', { 
                            success: false, 
                            message: error.message || 'Error ejecutando comando',
                            timestamp: new Date().toISOString()
                        });
                    }
                });

                // Manejo de errores en socket
                socket.on('error', (error) => {
                    this.logger.error(`Error en socket ${socket.clientId}:`, error.message);
                });
            });

            this.logger.debug('Manejadores de Socket.IO configurados');
            
        } catch (error) {
            this.logger.error('Error configurando Socket.IO:', error.message);
            this.state = MODULE_STATES.ERROR;
        }
    }

    /**
     * Manejar comandos de socket de manera centralizada
     */
    async handleSocketCommand(command, params = {}) {
        switch (command) {
            case 'baliza_manual':
                await this.controller.modules.baliza?.execute('*9');
                return { message: 'Baliza manual ejecutada' };
                
            case 'roger_beep_toggle':
                const rogerBeep = this.controller.audio?.getRogerBeep();
                if (rogerBeep) {
                    const newState = rogerBeep.toggle();
                    return { 
                        message: `Roger beep ${newState ? 'habilitado' : 'deshabilitado'}`,
                        data: { enabled: newState }
                    };
                }
                throw new Error('Roger Beep no disponible');
                
            case 'system_shutdown':
                setTimeout(() => this.controller.shutdown(), 1000);
                return { message: 'Sistema apagándose...' };
                
            default:
                throw new Error(`Comando no reconocido: ${command}`);
        }
    }

    /**
     * Obtener estado completo del sistema
     */
    getSystemStatus() {
        try {
            const status = {
                timestamp: new Date().toISOString(),
                server: {
                    state: this.state,
                    uptime: Date.now() - this.startTime,
                    connectedClients: this.connectedClients.size,
                    requestCount: this.requestCount
                },
                audio: this.controller.audio?.getStatus() || { status: 'unavailable' },
                modules: {}
            };

            // Obtener estado de módulos de manera segura
            if (this.controller.modules) {
                const moduleNames = ['baliza', 'datetime', 'aiChat', 'sms'];
                moduleNames.forEach(name => {
                    try {
                        if (this.controller.modules[name] && typeof this.controller.modules[name].getStatus === 'function') {
                            status.modules[name] = this.controller.modules[name].getStatus();
                        } else {
                            status.modules[name] = { state: 'unavailable' };
                        }
                    } catch (error) {
                        this.logger.warn(`Error obteniendo estado del módulo ${name}:`, error.message);
                        status.modules[name] = { state: 'error', message: error.message };
                    }
                });
            }

            // Roger Beep status
            try {
                if (this.controller.audio && this.controller.audio.getRogerBeep) {
                    status.rogerBeep = this.controller.audio.getRogerBeep().getConfig();
                } else {
                    status.rogerBeep = { enabled: false, state: 'unavailable' };
                }
            } catch (error) {
                status.rogerBeep = { enabled: false, state: 'error' };
            }

            return status;
            
        } catch (error) {
            this.logger.error('Error obteniendo estado del sistema:', error.message);
            return {
                timestamp: new Date().toISOString(),
                error: 'Error obteniendo estado del sistema',
                server: { state: 'error' }
            };
        }
    }

    // ===== MÉTODOS DE BROADCAST =====

    /**
     * Broadcast seguro de eventos
     */
    safeBroadcast(event, data) {
        try {
            if (this.io && this.connectedClients.size > 0) {
                this.io.emit(event, {
                    ...data,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            this.logger.error(`Error en broadcast de ${event}:`, error.message);
        }
    }

    broadcastDTMF(sequence) {
        this.safeBroadcast('dtmf_detected', { sequence });
    }

    broadcastBalizaTransmitted(data = {}) {
        this.safeBroadcast('baliza_transmitted', data);
    }

    broadcastLog(level, message, module = 'System') {
        this.safeBroadcast('log_entry', { level, message, module });
    }

    broadcastChannelActivity(isActive, level) {
        this.safeBroadcast('channel_activity', { isActive, level });
    }

    broadcastSignalLevel(data) {
        // Throttle para evitar spam
        const now = Date.now();
        if (now - this.lastSignalBroadcast > this.config.signalThrottle) {
            this.safeBroadcast('signal_level', data);
            this.lastSignalBroadcast = now;
        }
    }

    broadcastRogerBeepConfigChanged(config) {
        this.safeBroadcast('roger_beep_config_changed', { config });
    }

    broadcastSystemStatus() {
        this.safeBroadcast('system_status', { data: this.getSystemStatus() });
    }

    // ===== CONTROL DEL SERVIDOR =====

    /**
     * Iniciar el servidor web
     */
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
                    this.logger.info(`Orígenes permitidos: ${this.config.allowedOrigins.join(', ')}`);
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

    /**
     * Detener el servidor web
     */
    stop() {
        return new Promise((resolve) => {
            this.logger.info('Deteniendo servidor web...');
            this.state = MODULE_STATES.DISABLED;

            // Desconectar todos los clientes socket
            if (this.io) {
                this.io.emit('server_shutdown', {
                    message: 'Servidor cerrando conexión',
                    timestamp: new Date().toISOString()
                });
                
                this.io.close(() => {
                    this.logger.debug('Socket.IO cerrado');
                });
            }

            // Cerrar servidor HTTP
            if (this.server) {
                this.server.close((error) => {
                    if (error) {
                        this.logger.error('Error cerrando servidor:', error.message);
                    } else {
                        this.logger.info('Servidor web detenido completamente');
                    }
                    resolve();
                });
            } else {
                resolve();
            }

            // Force close después de timeout
            setTimeout(() => {
                if (this.server && this.server.listening) {
                    this.server.close();
                }
                resolve();
            }, 5000);
        });
    }

    /**
     * Obtener estadísticas del servidor
     */
    getServerStats() {
        return {
            state: this.state,
            uptime: Date.now() - this.startTime,
            connectedClients: this.connectedClients.size,
            requestCount: this.requestCount,
            config: {
                port: this.config.port,
                host: this.config.host,
                maxConnections: this.config.maxConnections
            }
        };
    }
}

module.exports = WebServer;