const EventEmitter = require('events');
const { createLogger } = require('../logging/Logger');
const { delay } = require('../utils');
const fs = require('fs');
const path = require('path');

/**
 * Módulo APRS para VX200 RPT Controller
 * Funcionalidades:
 * - Beacon del repetidor con ubicación fija
 * - Recepción y logging de beacons APRS
 * - Interface web para visualización en mapa
 */
class APRS extends EventEmitter {
    constructor(audioManager) {
        super();
        this.logger = createLogger('[APRS]');
        this.audio = audioManager;
        
        // Estado del módulo
        this.isRunning = false;
        this.isInitialized = false;
        
        // Configuración APRS desde ConfigManager
        const { Config } = require('../config');
        this.config = {
            callsign: Config.aprs.callsign,
            location: Config.aprs.location,
            beacon: {
                enabled: Config.aprs.beacon.enabled,
                interval: Config.aprs.beacon.interval * 60 * 1000, // convertir a ms
                offset: 7.5 * 60 * 1000, // 7.5 minutos de offset para evitar choque con baliza
                comment: Config.aprs.beacon.comment,
                symbol: Config.aprs.beacon.symbol
            },
            direwolf: {
                configPath: path.join(__dirname, '../../config/direwolf.conf'),
                kissPort: Config.aprs.direwolf.kissPort,
                agwPort: Config.aprs.direwolf.agwPort
            }
        };
        
        // Base de datos de posiciones recibidas
        this.receivedPositions = new Map();
        this.logFile = path.join(__dirname, '../../logs/aprs-positions.json');
        
        // Conexión TNC
        this.tncConnection = null;
        this.kissEndpoint = null;
        
        // Timers
        this.beaconTimer = null;
        
        // Estadísticas
        this.stats = {
            beaconsSent: 0,
            positionsReceived: 0,
            lastBeacon: null,
            lastPosition: null,
            startTime: null
        };
        
        this.logger.info('Módulo APRS inicializado');
    }

    /**
     * Inicializar conexión con Direwolf TNC
     */
    async initialize() {
        if (this.isInitialized) {
            this.logger.warn('APRS ya está inicializado');
            return true;
        }

        try {
            this.logger.info('Inicializando módulo APRS...');
            
            // Verificar que existe el archivo de configuración de Direwolf
            if (!fs.existsSync(this.config.direwolf.configPath)) {
                throw new Error(`No se encuentra configuración de Direwolf: ${this.config.direwolf.configPath}`);
            }
            
            // Crear directorio de logs si no existe
            const logsDir = path.dirname(this.logFile);
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }
            
            // Cargar posiciones guardadas
            await this.loadSavedPositions();
            
            // Inicializar conexión KISS TNC
            await this.initializeKISSConnection();
            
            this.isInitialized = true;
            this.stats.startTime = new Date();
            
            this.logger.info('Módulo APRS inicializado correctamente');
            return true;
            
        } catch (error) {
            this.logger.error('Error inicializando APRS:', error.message);
            return false;
        }
    }

    /**
     * Inicializar conexión KISS TNC con utils-for-aprs
     */
    async initializeKISSConnection() {
        try {
            const { SocketKISSFrameEndpoint } = require('utils-for-aprs');
            
            // Crear endpoint KISS TCP
            this.kissEndpoint = new SocketKISSFrameEndpoint({
                host: 'localhost',
                port: this.config.direwolf.kissPort
            });
            
            // Configurar eventos
            this.kissEndpoint.on('open', () => {
                this.logger.info('Conectado a Direwolf KISS TNC');
                this.tncConnection = true;
                this.emit('tnc_connected');
            });
            
            this.kissEndpoint.on('close', () => {
                this.logger.warn('Desconectado de Direwolf KISS TNC');
                this.tncConnection = false;
                this.emit('tnc_disconnected');
            });
            
            this.kissEndpoint.on('data', (frame) => {
                // Si recibimos datos, significa que estamos conectados
                if (!this.tncConnection) {
                    this.logger.info('Conexión TNC detectada por recepción de datos');
                    this.tncConnection = true;
                    this.emit('tnc_connected');
                }
                this.handleReceivedFrame(frame);
            });
            
            this.kissEndpoint.on('error', (error) => {
                this.logger.error('Error en conexión KISS:', error.message);
                this.tncConnection = false;
                this.emit('tnc_disconnected');
            });
            
            // Probar conexión inmediata
            setTimeout(() => {
                this.testTNCConnection();
            }, 2000);
            
            this.logger.info('Endpoint KISS configurado');
            
        } catch (error) {
            this.logger.error('Error configurando conexión KISS:', error.message);
            throw error;
        }
    }

    /**
     * Manejar frame APRS recibido
     */
    async handleReceivedFrame(frame) {
        try {
            const { APRSInfoParser } = require('utils-for-aprs');
            
            // Parsear frame APRS
            const parsed = APRSInfoParser(frame);
            
            if (parsed && parsed.aprs && parsed.aprs.position) {
                const existingPos = this.receivedPositions.get(parsed.source);
                const isNewStation = !existingPos;
                
                const position = {
                    callsign: parsed.source,
                    lat: parsed.aprs.position.lat,
                    lon: parsed.aprs.position.lon,
                    timestamp: new Date(),
                    comment: parsed.aprs.comment || '',
                    symbol: parsed.aprs.symbol || '/',
                    lastHeard: new Date(),
                    count: isNewStation ? 1 : (existingPos.count || 1) + 1,
                    firstHeard: isNewStation ? new Date() : (existingPos.firstHeard || existingPos.timestamp),
                    raw: frame
                };
                
                // Guardar posición (actualizar o crear nueva)
                this.receivedPositions.set(parsed.source, position);
                this.stats.positionsReceived++;
                this.stats.lastPosition = position;
                
                // Log diferenciado para estaciones nuevas vs conocidas
                if (isNewStation) {
                    this.logger.info(`🆕 Nueva estación APRS: ${position.callsign} @ ${position.lat.toFixed(4)}, ${position.lon.toFixed(4)} - ${position.comment}`);
                } else {
                    this.logger.info(`📍 Actualización APRS: ${position.callsign} @ ${position.lat.toFixed(4)}, ${position.lon.toFixed(4)} (#${position.count})`);
                }
                
                // Guardar a archivo
                await this.savePositionToLog(position);
                
                // Emitir evento para panel web
                this.emit('position_received', position);
                
                // Anunciar por voz si está configurado
                if (this.config.announcePositions) {
                    await this.announceNewPosition(position);
                }
            }
            
        } catch (error) {
            this.logger.error('Error procesando frame APRS:', error.message);
        }
    }

    /**
     * Cargar posiciones guardadas (compatible con formato anterior y nuevo)
     */
    async loadSavedPositions() {
        try {
            if (fs.existsSync(this.logFile)) {
                const data = fs.readFileSync(this.logFile, 'utf8');
                const fileContent = JSON.parse(data);
                
                let positions = [];
                
                // Detectar formato (nuevo con metadata o viejo array directo)
                if (fileContent.metadata && fileContent.stations) {
                    // Formato nuevo con metadata
                    positions = fileContent.stations;
                    this.logger.info(`Archivo APRS v${fileContent.metadata.version} - ${fileContent.metadata.totalStations} estaciones`);
                } else if (Array.isArray(fileContent)) {
                    // Formato viejo (array directo)
                    positions = fileContent;
                    this.logger.info('Migrando formato anterior de posiciones APRS');
                } else {
                    this.logger.warn('Formato de archivo APRS desconocido');
                    return;
                }
                
                positions.forEach(pos => {
                    // Convertir timestamp string de vuelta a Date
                    if (pos.timestamp) pos.timestamp = new Date(pos.timestamp);
                    if (pos.lastHeard) pos.lastHeard = new Date(pos.lastHeard);
                    
                    // Inicializar contador si no existe
                    if (!pos.count) pos.count = 1;
                    
                    this.receivedPositions.set(pos.callsign, pos);
                });
                
                this.logger.info(`Cargadas ${positions.length} posiciones APRS desde archivo`);
                
                // Si era formato viejo, guardar en formato nuevo
                if (Array.isArray(fileContent)) {
                    await this.savePositionToLog(null);
                }
            }
        } catch (error) {
            this.logger.warn('Error cargando posiciones guardadas:', error.message);
            this.logger.warn('Se continuará sin posiciones previas');
        }
    }

    /**
     * Guardar posición a archivo de log (con respaldo rotativo)
     */
    async savePositionToLog(position) {
        try {
            // Crear respaldo cada 100 posiciones
            if (this.receivedPositions.size > 0 && this.receivedPositions.size % 100 === 0) {
                await this.createBackup();
            }

            const positions = Array.from(this.receivedPositions.values()).map(pos => ({
                callsign: pos.callsign,
                lat: pos.lat,
                lon: pos.lon,
                timestamp: pos.timestamp,
                comment: pos.comment || '',
                symbol: pos.symbol || '/',
                lastHeard: pos.timestamp,
                count: pos.count || 1 // Contador de beacons recibidos
            }));

            // Guardar de forma asíncrona para no bloquear
            fs.writeFileSync(this.logFile, JSON.stringify({
                metadata: {
                    version: '1.0',
                    generated: new Date(),
                    totalStations: positions.length,
                    repeater: {
                        callsign: this.config.callsign,
                        location: this.config.location
                    }
                },
                stations: positions
            }, null, 2));

        } catch (error) {
            this.logger.error('Error guardando posición:', error.message);
        }
    }

    /**
     * Crear respaldo de posiciones
     */
    async createBackup() {
        try {
            const backupFile = this.logFile.replace('.json', `-backup-${Date.now()}.json`);
            const currentData = fs.readFileSync(this.logFile, 'utf8');
            fs.writeFileSync(backupFile, currentData);
            
            // Mantener solo los últimos 5 respaldos
            const backupsDir = path.dirname(this.logFile);
            const backupFiles = fs.readdirSync(backupsDir)
                .filter(f => f.includes('aprs-positions-backup'))
                .sort()
                .reverse();
            
            if (backupFiles.length > 5) {
                backupFiles.slice(5).forEach(file => {
                    fs.unlinkSync(path.join(backupsDir, file));
                });
            }
            
            this.logger.info('Respaldo de posiciones APRS creado');
        } catch (error) {
            this.logger.warn('Error creando respaldo:', error.message);
        }
    }

    /**
     * Anunciar nueva posición por voz
     */
    async announceNewPosition(position) {
        try {
            const message = `Nueva posición APRS recibida de ${position.callsign}`;
            await this.audio.speak(message);
        } catch (error) {
            this.logger.error('Error anunciando posición:', error.message);
        }
    }



    /**
     * Enviar beacon APRS
     */
    async sendBeacon() {
        if (!this.tncConnection) {
            throw new Error('No hay conexión con TNC');
        }
        
        try {
            // Crear packet APRS manual para envío inmediato
            const beaconInfo = this.createPositionPacket();
            
            // Enviar vía KISS TNC usando socket TCP directo
            const net = require('net');
            const socket = new net.Socket();
            
            await new Promise((resolve, reject) => {
                socket.setTimeout(5000, () => {
                    socket.destroy();
                    reject(new Error('Timeout conectando a KISS TNC'));
                });
                
                socket.connect(this.config.direwolf.kissPort, 'localhost', () => {
                    // Crear frame KISS básico
                    // Formato: <FEND><CMD><DATA><FEND>
                    const FEND = 0xC0;
                    const CMD_DATA = 0x00; // Canal 0, comando Data
                    
                    // Crear packet AX.25 básico
                    const packet = this.createAX25Packet(beaconInfo);
                    
                    const kissFrame = Buffer.concat([
                        Buffer.from([FEND, CMD_DATA]),
                        packet,
                        Buffer.from([FEND])
                    ]);
                    
                    socket.write(kissFrame);
                    socket.end();
                    resolve();
                });
                
                socket.on('error', (err) => {
                    socket.destroy();
                    reject(err);
                });
            });
            
            this.stats.beaconsSent++;
            this.stats.lastBeacon = new Date();
            
            this.logger.info('Beacon APRS enviado vía KISS TNC');
            this.emit('beacon_sent', {
                timestamp: this.stats.lastBeacon,
                callsign: this.config.callsign,
                location: this.config.location
            });
            
        } catch (error) {
            this.logger.error('Error enviando beacon:', error.message);
            throw error;
        }
    }

    /**
     * Crear información de posición para beacon
     */
    createPositionPacket() {
        const lat = this.config.location.lat;
        const lon = this.config.location.lon;
        
        // Convertir coordenadas decimales a formato APRS DDMM.MM
        const latDeg = Math.abs(lat);
        const latDir = lat >= 0 ? 'N' : 'S';
        const lonDeg = Math.abs(lon);
        const lonDir = lon >= 0 ? 'E' : 'W';
        
        // Calcular grados y minutos
        const latDegrees = Math.floor(latDeg);
        const latMinutes = (latDeg - latDegrees) * 60;
        const lonDegrees = Math.floor(lonDeg);
        const lonMinutes = (lonDeg - lonDegrees) * 60;
        
        // Formato APRS: DDMM.hhN/DDDMM.hhW
        // Latitud: DD MM . hh N (8 caracteres)
        const latStr = String(latDegrees).padStart(2, '0') + 
                      String(latMinutes.toFixed(2)).padStart(5, '0') + latDir;
        
        // Longitud: DDD MM . hh W (9 caracteres)  
        const lonStr = String(lonDegrees).padStart(3, '0') + 
                      String(lonMinutes.toFixed(2)).padStart(5, '0') + lonDir;
        
        // Símbolo APRS: tabla/símbolo (ej: /h para casa)
        const symbolTable = this.config.beacon.symbol ? this.config.beacon.symbol[0] : '/';
        const symbolCode = this.config.beacon.symbol ? this.config.beacon.symbol[1] : 'h';
        
        // Formato APRS estándar: =DDMM.hhN/DDDMM.hhWsCommentario
        return `=${latStr}${symbolTable}${lonStr}${symbolCode}${this.config.beacon.comment || 'VX200 RPT'}`;
    }

    /**
     * Crear packet AX.25 básico
     */
    createAX25Packet(info) {
        // Los callsigns en AX.25 deben ser shifted 1 bit a la izquierda
        function shiftCallsign(call) {
            const padded = call.padEnd(6, ' ');
            const shifted = Buffer.alloc(6);
            for (let i = 0; i < 6; i++) {
                shifted[i] = padded.charCodeAt(i) << 1;
            }
            return shifted;
        }
        
        // Destination (APRS) y Source callsign
        const dest = shiftCallsign('APRS');
        const source = shiftCallsign(this.config.callsign);
        
        // SSID bytes (último bit indica end-of-address)
        const destSSID = 0x60; // SSID 0, command bit, not repeated
        const sourceSSID = 0x61; // SSID 0, command bit, last address (bit 0 = 1)
        
        // Header AX.25 completo
        const header = Buffer.concat([
            dest, Buffer.from([destSSID]),
            source, Buffer.from([sourceSSID]),
            Buffer.from([0x03, 0xF0]) // Control (UI frame) + PID (no layer 3)
        ]);
        
        return Buffer.concat([header, Buffer.from(info)]);
    }

    /**
     * Obtener tiempo desde último beacon en minutos
     */
    getTimeSinceLastBeacon() {
        if (!this.stats.lastBeacon) return 'nunca';
        return Math.floor((Date.now() - this.stats.lastBeacon.getTime()) / 1000 / 60);
    }

    /**
     * Iniciar timer de beacon automático
     */
    async startBeaconTimer() {
        if (this.beaconTimer) {
            clearInterval(this.beaconTimer);
        }

        const interval = this.config.beacon.interval; // ya está en ms
        const offset = this.config.beacon.offset || 0; // offset para evitar colisiones

        // Enviar primer beacon después del offset
        setTimeout(async () => {
            await this.sendBeaconSafe();
            
            // Luego enviar cada intervalo
            this.beaconTimer = setInterval(async () => {
                await this.sendBeaconSafe();
            }, interval);
            
        }, offset);

        this.logger.info(`Beacon automático configurado: cada ${Math.floor(interval/60000)} minutos`);
    }

    /**
     * Enviar beacon de forma segura con manejo de errores
     */
    async sendBeaconSafe() {
        try {
            if (this.tncConnection) {
                await this.sendBeacon();
            } else {
                this.logger.warn('Beacon omitido: sin conexión TNC');
            }
        } catch (error) {
            this.logger.error('Error enviando beacon automático:', error.message);
        }
    }

    /**
     * Iniciar sistema APRS
     */
    async start() {
        if (this.isRunning) {
            this.logger.warn('APRS ya está ejecutándose');
            return false;
        }
        
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }
            
            // El endpoint KISS se conecta automáticamente
            this.isRunning = true;
            
            // Iniciar beacon automático si está habilitado
            if (this.config.beacon.enabled) {
                await this.startBeaconTimer();
            }
            
            // Iniciar limpieza automática de posiciones
            this.scheduleCleanup();
            
            this.logger.info('Sistema APRS iniciado');
            return true;
            
        } catch (error) {
            this.logger.error('Error iniciando APRS:', error.message);
            return false;
        }
    }

    /**
     * Detener sistema APRS
     */
    stop() {
        if (!this.isRunning) {
            return;
        }
        
        try {
            // Desconectar TNC
            if (this.kissEndpoint && typeof this.kissEndpoint.close === 'function') {
                this.kissEndpoint.close();
            }
            
            // Limpiar timers
            if (this.beaconTimer) {
                clearInterval(this.beaconTimer);
                this.beaconTimer = null;
            }
            
            if (this.cleanupTimer) {
                clearInterval(this.cleanupTimer);
                this.cleanupTimer = null;
            }
            
            this.isRunning = false;
            this.tncConnection = false;
            
            this.logger.info('Sistema APRS detenido');
            
        } catch (error) {
            this.logger.error('Error deteniendo APRS:', error.message);
        }
    }

    /**
     * Obtener estado del módulo
     */
    getStatus() {
        return {
            running: this.isRunning,
            initialized: this.isInitialized,
            tncConnected: this.tncConnection,
            stats: { ...this.stats },
            config: {
                callsign: this.config.callsign,
                location: this.config.location,
                beaconEnabled: this.config.beacon.enabled
            },
            positions: {
                total: this.receivedPositions.size,
                recent: Array.from(this.receivedPositions.values())
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .slice(0, 10)
            }
        };
    }

    /**
     * Obtener todas las posiciones para el mapa (solo activas)
     */
    getAllPositions() {
        return Array.from(this.receivedPositions.values())
            .filter(pos => !pos.archived)
            .sort((a, b) => (b.lastHeard || b.timestamp) - (a.lastHeard || a.timestamp));
    }

    /**
     * Obtener estadísticas detalladas
     */
    getDetailedStats() {
        const positions = Array.from(this.receivedPositions.values());
        const active = positions.filter(pos => !pos.archived);
        const archived = positions.filter(pos => pos.archived);
        
        return {
            total: positions.length,
            active: active.length,
            archived: archived.length,
            beacons: {
                sent: this.stats.beaconsSent,
                received: this.stats.positionsReceived,
                lastSent: this.stats.lastBeacon,
                lastReceived: this.stats.lastPosition?.timestamp
            },
            uptime: this.stats.startTime ? Math.floor((Date.now() - this.stats.startTime.getTime()) / 1000 / 60) : 0,
            mostActive: active
                .sort((a, b) => (b.count || 0) - (a.count || 0))
                .slice(0, 5)
                .map(pos => ({ callsign: pos.callsign, count: pos.count || 0 }))
        };
    }

    /**
     * Probar conexión TNC
     */
    async testTNCConnection() {
        if (!this.kissEndpoint) return;
        
        try {
            const net = require('net');
            const socket = new net.Socket();
            socket.setTimeout(3000);
            
            const testPromise = new Promise((resolve) => {
                socket.on('connect', () => {
                    this.logger.info('Test de conexión TNC: ÉXITO');
                    if (!this.tncConnection) {
                        this.tncConnection = true;
                        this.emit('tnc_connected');
                    }
                    socket.end();
                    resolve(true);
                });
                
                socket.on('timeout', () => {
                    this.logger.warn('Test de conexión TNC: TIMEOUT');
                    socket.destroy();
                    resolve(false);
                });
                
                socket.on('error', () => {
                    this.logger.warn('Test de conexión TNC: ERROR');
                    resolve(false);
                });
                
                socket.connect(this.config.direwolf.kissPort, 'localhost');
            });
            
            await testPromise;
            
        } catch (error) {
            this.logger.error('Error probando conexión TNC:', error.message);
        }
    }

    /**
     * Actualizar configuración de beacon APRS
     */
    async updateBeaconConfig(newConfig) {
        try {
            // Actualizar configuración local
            if (newConfig.enabled !== undefined) {
                this.config.beacon.enabled = newConfig.enabled;
            }
            if (newConfig.interval) {
                this.config.beacon.interval = newConfig.interval * 60 * 1000; // convertir a ms
            }
            if (newConfig.callsign) {
                this.config.callsign = newConfig.callsign;
            }
            if (newConfig.comment) {
                this.config.beacon.comment = newConfig.comment;
            }

            // Actualizar DirewolfManager si está disponible
            const DirewolfManager = require('../utils/direwolfManager');
            const direwolf = new DirewolfManager();
            
            await direwolf.updateConfig({
                callsign: this.config.callsign,
                beacon: {
                    interval: Math.floor(newConfig.interval || 15),
                    comment: this.config.beacon.comment
                }
            });

            this.logger.info('Configuración APRS actualizada:', newConfig);
            return true;
            
        } catch (error) {
            this.logger.error('Error actualizando configuración APRS:', error.message);
            throw error;
        }
    }

    /**
     * Limpiar posiciones antiguas (configurables por edad)
     */
    cleanupOldPositions() {
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 días por defecto
        const cutoff = Date.now() - maxAge;
        let removed = 0;
        let archived = 0;
        
        for (const [callsign, position] of this.receivedPositions.entries()) {
            const lastHeard = position.lastHeard || position.timestamp;
            
            if (lastHeard.getTime() < cutoff) {
                // Archivar posiciones muy antiguas pero importantes
                if (position.count >= 5) { // Estaciones frecuentes
                    position.archived = true;
                    archived++;
                } else {
                    // Eliminar estaciones poco frecuentes
                    this.receivedPositions.delete(callsign);
                    removed++;
                }
            }
        }
        
        if (removed > 0 || archived > 0) {
            this.logger.info(`Limpieza APRS: ${removed} eliminadas, ${archived} archivadas`);
            this.savePositionToLog(null); // Guardar cambios
        }
    }

    /**
     * Programar limpieza automática
     */
    scheduleCleanup() {
        // Limpiar cada 6 horas
        this.cleanupTimer = setInterval(() => {
            this.cleanupOldPositions();
        }, 6 * 60 * 60 * 1000);
    }

    /**
     * Destruir módulo
     */
    destroy() {
        this.stop();
        this.removeAllListeners();
        this.logger.info('Módulo APRS destruido');
    }
}

module.exports = APRS;