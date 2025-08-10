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
        
        // Configuración APRS
        this.config = {
            callsign: 'BASE1',
            location: {
                lat: -32.885,
                lon: -68.739,
                name: 'Guaymallén, Mendoza, Argentina'
            },
            beacon: {
                enabled: true,
                interval: 15 * 60 * 1000, // 15 minutos en ms
                offset: 7.5 * 60 * 1000, // 7.5 minutos de offset para evitar choque con baliza
                comment: 'VX200 RPT Controller - Guaymallen, Mendoza'
            },
            direwolf: {
                configPath: path.join(__dirname, '../../config/direwolf.conf'),
                kissPort: 8001,
                agwPort: 8000
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
                const position = {
                    callsign: parsed.source,
                    lat: parsed.aprs.position.lat,
                    lon: parsed.aprs.position.lon,
                    timestamp: new Date(),
                    comment: parsed.aprs.comment || '',
                    symbol: parsed.aprs.symbol || '/',
                    raw: frame
                };
                
                // Guardar posición
                this.receivedPositions.set(parsed.source, position);
                this.stats.positionsReceived++;
                this.stats.lastPosition = position;
                
                // Log
                this.logger.info(`Posición recibida: ${position.callsign} @ ${position.lat}, ${position.lon}`);
                
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
     * Cargar posiciones guardadas
     */
    async loadSavedPositions() {
        try {
            if (fs.existsSync(this.logFile)) {
                const data = fs.readFileSync(this.logFile, 'utf8');
                const positions = JSON.parse(data);
                
                positions.forEach(pos => {
                    // Convertir timestamp string de vuelta a Date
                    pos.timestamp = new Date(pos.timestamp);
                    this.receivedPositions.set(pos.callsign, pos);
                });
                
                this.logger.info(`Cargadas ${positions.length} posiciones desde archivo`);
            }
        } catch (error) {
            this.logger.warn('Error cargando posiciones guardadas:', error.message);
        }
    }

    /**
     * Guardar posición a archivo de log
     */
    async savePositionToLog(position) {
        try {
            const positions = Array.from(this.receivedPositions.values());
            fs.writeFileSync(this.logFile, JSON.stringify(positions, null, 2));
        } catch (error) {
            this.logger.error('Error guardando posición:', error.message);
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
        
        // Convertir a formato APRS
        const latDeg = Math.abs(lat);
        const latDir = lat >= 0 ? 'N' : 'S';
        const lonDeg = Math.abs(lon);
        const lonDir = lon >= 0 ? 'E' : 'W';
        
        // Formato DDMM.MM
        const latStr = String(Math.floor(latDeg)).padStart(2, '0') + 
                      ((latDeg % 1) * 60).toFixed(2).padStart(5, '0') + latDir;
        const lonStr = String(Math.floor(lonDeg)).padStart(3, '0') + 
                      ((lonDeg % 1) * 60).toFixed(2).padStart(5, '0') + lonDir;
        
        return `=${latStr}/R${lonStr}&${this.config.beacon.comment || 'VX200 RPT'}`;
    }

    /**
     * Crear packet AX.25 básico
     */
    createAX25Packet(info) {
        // Simplificado: crear packet AX.25 básico manualmente
        // En una implementación completa usaríamos una librería AX.25
        
        const callsign = this.config.callsign.padEnd(6, ' ');
        const dest = 'APRS  '; // Destination
        
        // Header AX.25 simplificado
        const header = Buffer.concat([
            Buffer.from(dest), Buffer.from([0x60]), // Dest
            Buffer.from(callsign), Buffer.from([0x61]), // Source  
            Buffer.from([0x03, 0xF0]) // Control + PID
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
     * Obtener todas las posiciones para el mapa
     */
    getAllPositions() {
        return Array.from(this.receivedPositions.values());
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
     * Limpiar posiciones antiguas (más de 24 horas)
     */
    cleanupOldPositions() {
        const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 horas
        let removed = 0;
        
        for (const [callsign, position] of this.receivedPositions.entries()) {
            if (position.timestamp.getTime() < cutoff) {
                this.receivedPositions.delete(callsign);
                removed++;
            }
        }
        
        if (removed > 0) {
            this.logger.info(`Limpiadas ${removed} posiciones antiguas`);
            this.savePositionToLog(null); // Guardar cambios
        }
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