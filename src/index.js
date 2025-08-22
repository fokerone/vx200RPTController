const AudioManager = require('./audio/audioManager');
const Baliza = require('./modules/baliza');
const DateTime = require('./modules/datetime');
const Weather = require('./modules/weather-voice');
const WeatherAlerts = require('./modules/weatherAlerts');
const InpresSismic = require('./modules/inpres');
const APRS = require('./modules/aprs');
const DirewolfManager = require('./utils/direwolfManager');
const APRSMapServer = require('./aprs-map/server');
const { Config } = require('./config');
const { createLogger } = require('./logging/Logger');
const { getSystemOutput } = require('./logging/SystemOutput');
const { MODULE_STATES } = require('./constants');

class VX200Controller {
    constructor() {
        this.logger = createLogger('[Controller]');
        this.systemOutput = getSystemOutput();
        this.state = MODULE_STATES.IDLE;
        
        this.config = Config.getAll();
        this.audio = null;
        this.modules = {};
        this.direwolf = null;
        this.aprsMapServer = null;
        
        this.isRunning = false;
        this.startTime = Date.now();
        this.initializationErrors = [];
        
        this.logger.debug('Constructor completado, inicialización pendiente...');
    }
    
    async initializeSystem() {
        try {
            this.state = MODULE_STATES.ACTIVE;
            
            this.logger.debug('Inicializando AudioManager...');
            await this.initializeAudio();
            
            this.logger.debug('Inicializando Módulos...');
            await this.initializeModules();
            
            
            this.logger.debug('Configurando event handlers...');
            this.setupEventHandlers();
            
            this.logger.debug('Inicializando servidor mapa APRS...');
            await this.initializeAPRSMapServer();
            
            this.logger.debug('Configurando desde archivo...');
            this.configureFromFile();
            
            this.logger.debug('Ejecutando cleanup inicial...');
            this.performInitialCleanup();
            
            if (this.initializationErrors.length > 0) {
                this.logger.warn(`Sistema inicializado con ${this.initializationErrors.length} errores: ${this.initializationErrors.join(', ')}`);
                this.state = MODULE_STATES.ERROR;
            } else {
                this.logger.info('🔥 VX200 REPETIDORA OPERATIVA - Audio: LISTO, APRS: ACTIVO');
                if (this.aprsMapServer && this.aprsMapServer.isRunning) {
                    const mapPort = process.env.APRS_MAP_PORT || 8080;
                    this.logger.info(`🗺️ Mapa APRS: http://localhost:${mapPort}`);
                }
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
                // AudioManager inicializado
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
        this.modules.weather = new Weather(this.audio);
        
        // Inicializar WeatherAlerts después del módulo APRS
        this.modules.weatherAlerts = null; // Se inicializa después de APRS
        
        // Inicializar Direwolf primero
        try {
            this.direwolf = new DirewolfManager();
            this.logger.info('Iniciando Direwolf TNC...');
            const direwolfStarted = await this.direwolf.start();
            if (direwolfStarted) {
                // Direwolf TNC iniciado
                // Esperar un momento para que se establezca la conexión
                await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
                this.logger.warn('Error iniciando Direwolf TNC');
                this.initializationErrors.push('Direwolf');
            }
        } catch (error) {
            this.logger.error('Error inicializando Direwolf:', error.message);
            this.initializationErrors.push('Direwolf');
        }
        
        // Inicializar APRS después de Direwolf (solo inicializar, no iniciar)
        this.modules.aprs = new APRS(this.audio);
        try {
            const aprsInitialized = await this.modules.aprs.initialize();
            if (aprsInitialized) {
                // APRS inicializado
            } else {
                this.logger.warn('Error inicializando módulo APRS');
                this.initializationErrors.push('APRS');
            }
        } catch (error) {
            this.logger.error('Error inicializando APRS:', error.message);
            this.initializationErrors.push('APRS');
        }
        
        // Inicializar WeatherAlerts con referencia a APRS y Weather
        try {
            this.modules.weatherAlerts = new WeatherAlerts(this.audio, this.modules.aprs, this.modules.weather);
            // WeatherAlerts inicializado
        } catch (error) {
            this.logger.error('Error inicializando WeatherAlerts:', error.message);
            this.initializationErrors.push('WeatherAlerts');
        }
        
        // Inicializar INPRES - Monitoreo Sísmico
        try {
            this.modules.inpres = new InpresSismic(this.audio);
            // INPRES inicializado
        } catch (error) {
            this.logger.error('Error inicializando INPRES:', error.message);
            this.initializationErrors.push('INPRES');
        }
        
        // Todos los módulos procesados
    }

    async initializeAPRSMapServer() {
        try {
            this.aprsMapServer = new APRSMapServer(this);
            this.logger.info('Servidor mapa APRS inicializado correctamente');
        } catch (error) {
            this.logger.error('Error inicializando servidor mapa APRS:', error.message);
            this.initializationErrors.push('APRS Map Server');
            this.aprsMapServer = null;
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

    /**
     * Ejecutar cleanup inicial al arranque para sistemas 24/7
     */
    performInitialCleanup() {
        // Ejecutar cleanup en background para no bloquear el arranque
        setTimeout(async () => {
            try {
                if (this.audio && typeof this.audio.performCleanup === 'function') {
                    await this.audio.performCleanup();
                    this.logger.info('✅ Cleanup inicial completado');
                }
            } catch (error) {
                this.logger.warn('Error en cleanup inicial:', error.message);
            }
        }, 5000); // Esperar 5 segundos después del arranque completo
    }

    setupEventHandlers() {
        this.audio.on('dtmf', async (sequence) => {
            await this.handleDTMF(sequence);
        });

        this.audio.on('channel_active', (data) => {
            // Channel activity logged
        });

        this.audio.on('channel_inactive', (data) => {
            // Channel inactive logged
        });

        this.audio.on('signal_level', (data) => {
            // Signal level logged
        });

        this.audio.on('transmission_started', (data) => {
            this.logger.debug('Transmisión iniciada:', data);
        });

        this.audio.on('transmission_ended', (data) => {
            this.logger.debug('Transmisión terminada:', data);
        });

        this.setupEvents();
    }

    setupEvents() {
        this.modules.baliza.on('transmitted', (data) => {
            this.logger.debug('Baliza transmitida:', data);
        });

        this.modules.aprs.on('position_received', (position) => {
            this.logger.info(`APRS Position: ${position.callsign} at ${position.lat},${position.lon}`);
        });

        this.modules.aprs.on('beacon_sent', (beacon) => {
            this.logger.info('APRS Beacon sent:', beacon);
        });

        this.modules.aprs.on('tnc_connected', () => {
            this.logger.info('APRS TNC connected');
        });

        this.modules.aprs.on('tnc_disconnected', () => {
            this.logger.warn('APRS TNC disconnected');
        });

        this.modules.aprs.on('positions_updated', (data) => {
            this.logger.info(`APRS: ${data.newPositions} nuevas posiciones desde ${data.fromFile}`);
        });
        
        this.modules.inpres.on('seism_detected', (seism) => {
            this.logger.info(`Sismo detectado: ${seism.magnitude} - ${seism.location}`);
        });
        
        this.modules.inpres.on('seism_announced', (seism) => {
            this.logger.info(`Sismo anunciado: ${seism.magnitude} - ${seism.location}`);
        });
    }


    async handleDTMF(sequence) {
        const commands = {
            '*1': { module: 'datetime', handler: () => this.modules.datetime.execute(sequence) },
            '*3': { module: 'inpres', handler: () => this.modules.inpres?.execute(sequence) },
            '*4': { module: 'weather', handler: () => this.modules.weather.execute(sequence) },
            '*5': { module: 'weather', handler: () => this.modules.weather.execute(sequence) },
            '*7': { module: 'weatherAlerts', handler: () => this.modules.weatherAlerts?.execute(sequence) },
            '*0': { module: 'weatherAlerts', handler: () => this.modules.weatherAlerts?.execute(sequence) },
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

    async handleUnknownCommand(sequence) {
        try {
            // Tono de confirmación deshabilitado para evitar retroalimentación
            // que causa falsos positivos DTMF cuando operadores hablan
            // await this.audio.playTone(400, 200, 0.5);
        } catch (error) {
            
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
            this.logger.warn('Canal ocupado - Esperando...');
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


    toggleRogerBeep() {
        const wasEnabled = this.audio.getRogerBeepStatus().enabled;
        const isEnabled = this.audio.toggleRogerBeep();
        
        this.logger.info(`Roger Beep: ${isEnabled ? 'ON' : 'OFF'}`);
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
            
            if (Config.balizaEnabled && this.modules.baliza) {
                const balizaStarted = this.modules.baliza.start();
                if (balizaStarted) {
                    // Baliza automática activa
                } else {
                    this.logger.warn('No se pudo iniciar baliza automática');
                }
            }
            
            // Inicializar APRS si está habilitado
            if (this.modules.aprs) {
                try {
                    const aprsStarted = await this.modules.aprs.start();
                    if (aprsStarted) {
                        this.logger.info('APRS operativo');
                    } else {
                        this.logger.warn('No se pudo iniciar sistema APRS');
                    }
                } catch (error) {
                    this.logger.warn('Error iniciando APRS:', error.message);
                }
            }
            
            // Iniciar servidor mapa APRS
            if (this.aprsMapServer) {
                try {
                    await this.aprsMapServer.start();
                    const status = this.aprsMapServer.getStatus();
                    this.logger.info(`🗺️ Mapa APRS disponible en: ${status.url}`);
                } catch (error) {
                    this.logger.warn('Error iniciando servidor mapa APRS:', error.message);
                }
            }
            
            // Inicializar monitoreo de alertas meteorológicas
            if (this.modules.weatherAlerts) {
                try {
                    await this.modules.weatherAlerts.start();
                    this.logger.info('Alertas meteorológicas activas');
                } catch (error) {
                    this.logger.warn('Error iniciando alertas meteorológicas:', error.message);
                }
            }
            
            // Iniciar módulo INPRES - Monitoreo Sísmico
            if (this.modules.inpres) {
                try {
                    await this.modules.inpres.start();
                    this.logger.info('Monitoreo sísmico INPRES activo');
                } catch (error) {
                    this.logger.warn('Error iniciando monitoreo INPRES:', error.message);
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
                enabled: this.modules.baliza && this.modules.baliza.config.enabled,
                details: this.modules.baliza && this.modules.baliza.config.enabled ? 
                    `Every ${this.modules.baliza.config.interval} min` : null
            },
            rogerBeep: { 
                enabled: Config.rogerBeepEnabled,
                details: Config.rogerBeepEnabled ? Config.rogerBeepType : null
            },
            weather: {
                enabled: !!process.env.OPENWEATHER_API_KEY,
                details: process.env.OPENWEATHER_API_KEY ? 'OpenWeather configured' : 'No API key'
            },
            aprs: {
                enabled: this.modules.aprs && this.modules.aprs.isRunning,
                details: this.modules.aprs && this.modules.aprs.isRunning ? 
                    `Callsign: ${this.modules.aprs.config.callsign}` : 
                    'TNC not connected'
            },
            inpres: {
                enabled: this.modules.inpres && this.modules.inpres.state === MODULE_STATES.ACTIVE,
                details: this.modules.inpres && this.modules.inpres.state === MODULE_STATES.ACTIVE ? 
                    'Seismic monitoring active' : 'Monitoring stopped'
            },
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
        
        
        
        if (this.modules.baliza?.isRunning) {
            this.modules.baliza.stop();
        }
        
        if (this.modules.aprs?.isRunning) {
            this.modules.aprs.stop();
        }
        
        if (this.aprsMapServer) {
            this.aprsMapServer.stop();
        }
        
        if (this.modules.weatherAlerts) {
            this.modules.weatherAlerts.stop();
        }
        
        if (this.modules.inpres) {
            this.modules.inpres.stop();
        }
        
        if (this.direwolf) {
            this.direwolf.stop();
        }
        
        this.systemOutput.printStopped();
    }

    async toggleService(service) {
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
            this.logger.info(result.message);
            
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
            weather: this.modules.weather.getStatus(),
            weatherAlerts: this.modules.weatherAlerts?.getStatus() || { enabled: false, state: 'not_initialized' },
            inpres: this.modules.inpres?.getStatus() || { enabled: false, state: 'not_initialized' },
            aprs: this.modules.aprs.getStatus(),
            rogerBeep: audioStatus.rogerBeep,
            dtmf: {
                lastSequence: 'Esperando...'
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
                rogerBeep: this.audio.getRogerBeepStatus().enabled
            }
        };
    }



    async shutdown() {
        this.logger.warn('Apagando sistema...');
        this.logger.warn('Sistema apagándose...');
        
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
        this.logger.warn('Reiniciando...');
        
        try {
            await this.audio.speakNoRoger('Sistema reiniciándose');
        } catch (error) {
            
        }
        
        this.stop();
        
        setTimeout(() => {
            console.log('Reiniciando...');
            this.start();
            this.logger.info('Sistema reiniciado');
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
        this.logger.info(`  Sistema: ${this.isRunning ? 'RUNNING' : 'STOPPED'}`);
        
        // Verificar estado de archivos temporales
        if (this.audio && typeof this.audio.getTempSpaceStats === 'function') {
            const tempStats = this.audio.getTempSpaceStats();
            this.logger.info(`  Archivos temp: ${tempStats.total.files} archivos (${tempStats.total.sizeMB}MB)`);
            
            // Alertar si hay demasiados archivos temporales
            if (tempStats.total.files > 50) {
                this.logger.warn(`  ⚠️  Muchos archivos temporales: ${tempStats.total.files}`);
            }
            if (parseFloat(tempStats.total.sizeMB) > 50) {
                this.logger.warn(`  ⚠️  Uso alto de espacio temp: ${tempStats.total.sizeMB}MB`);
            }
        }
        
        if (status.audio.status === 'active') {
            try {
                await this.audio.healthCheck();
            } catch (error) {
                this.logger.error('  Test de audio falló');
            }
        }
        
        return status;
    }

    /**
     * Obtener estadísticas detalladas del sistema para funcionamiento 24/7
     */
    getSystemHealth() {
        const baseStatus = this.getSystemStatus();
        const detailedStatus = this.getDetailedStatus();
        
        // Agregar estadísticas de archivos temporales
        let tempStats = { total: { files: 0, size: 0, sizeMB: '0.00' }, directories: {} };
        if (this.audio && typeof this.audio.getTempSpaceStats === 'function') {
            tempStats = this.audio.getTempSpaceStats();
        }
        
        return {
            ...baseStatus,
            system: detailedStatus.system,
            tempFiles: tempStats,
            alerts: this.generateSystemAlerts(tempStats, detailedStatus)
        };
    }

    /**
     * Generar alertas del sistema para monitoreo 24/7
     */
    generateSystemAlerts(tempStats, systemStatus) {
        const alerts = [];
        
        // Alertas de archivos temporales
        if (tempStats.total.files > 100) {
            alerts.push({
                level: 'warning',
                type: 'temp_files',
                message: `Muchos archivos temporales: ${tempStats.total.files}`,
                value: tempStats.total.files,
                threshold: 100
            });
        }
        
        if (parseFloat(tempStats.total.sizeMB) > 100) {
            alerts.push({
                level: 'warning', 
                type: 'temp_size',
                message: `Alto uso de espacio temporal: ${tempStats.total.sizeMB}MB`,
                value: parseFloat(tempStats.total.sizeMB),
                threshold: 100
            });
        }
        
        // Alertas de memoria
        if (systemStatus.system.memory.heapUsed > 200 * 1024 * 1024) { // > 200MB
            alerts.push({
                level: 'warning',
                type: 'memory',
                message: `Alto uso de memoria: ${Math.round(systemStatus.system.memory.heapUsed / (1024 * 1024))}MB`,
                value: systemStatus.system.memory.heapUsed,
                threshold: 200 * 1024 * 1024
            });
        }
        
        // Alertas de uptime (verificar reinicio reciente)
        if (systemStatus.system.uptime < 300) { // < 5 minutos
            alerts.push({
                level: 'info',
                type: 'recent_restart',
                message: `Sistema reiniciado recientemente: ${Math.round(systemStatus.system.uptime / 60)} min`,
                value: systemStatus.system.uptime,
                threshold: 300
            });
        }
        
        return alerts;
    }

    /**
     * Forzar cleanup manual de archivos temporales
     */
    async forceCleanup() {
        this.logger.info('Ejecutando cleanup manual de archivos temporales...');
        
        if (this.audio && typeof this.audio.performCleanup === 'function') {
            try {
                await this.audio.performCleanup();
                return { success: true, message: 'Cleanup ejecutado exitosamente' };
            } catch (error) {
                this.logger.error('Error en cleanup manual:', error.message);
                return { success: false, message: `Error: ${error.message}` };
            }
        } else {
            return { success: false, message: 'Función de cleanup no disponible' };
        }
    }
}

let controller = null;

function setupSignalHandlers() {
    const gracefulShutdown = async (signal) => {
        console.log(`\n${signal} detectado - cerrando aplicación...`);
        if (controller) {
            try {
                controller.stop();
                // Wait a bit to ensure cleanup completes
                await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (error) {
                console.error('Error durante shutdown:', error.message);
            }
        }
        process.exit(0);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT (Ctrl+C)'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    process.on('uncaughtException', async (error) => {
        console.error('Error crítico:', error.message);
        if (controller) {
            try {
                controller.stop();
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (cleanupError) {
                console.error('Error durante cleanup de emergencia:', cleanupError.message);
            }
        }
        process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
        console.error('Promesa rechazada:', reason);
        if (controller) {
            try {
                controller.stop();
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (cleanupError) {
                console.error('Error durante cleanup de emergencia:', cleanupError.message);
            }
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
