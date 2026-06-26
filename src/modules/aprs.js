const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('../logging/Logger');

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
                offset: 10 * 60 * 1000, // 10 minutos de offset para evitar choque con baliza horaria
                comment: Config.aprs.beacon.comment,
                symbol: Config.aprs.beacon.symbol
            },
            direwolf: {
                configPath: path.join(__dirname, '../../config/direwolf.conf'),
                kissPort: Config.aprs.direwolf.kissPort,
                agwPort: Config.aprs.direwolf.agwPort
            }
        };
        
        // Base de datos de posiciones recibidas (callsign -> array de posiciones históricas)
        this.receivedPositions = new Map();
        this.logFile = path.join(__dirname, '../../logs/aprs-positions.json');

        // Límites de memoria para evitar crecimiento indefinido
        this.memoryLimits = {
            maxPositionsPerCallsign: 100,  // Máximo 100 posiciones históricas por estación
            maxTotalStations: 1000,        // Máximo 1000 estaciones en memoria
            cleanupThreshold: 0.9          // Limpiar cuando se alcance 90% del límite
        };
        
        // Conexión TNC
        this.tncConnection = null;
        this.kissEndpoint = null;
        
        // Timers
        this.beaconTimer = null;
        this.logMonitorTimer = null;
        this.initialBeaconTimer = null;

        // Socket KISS (inicializar en null)
        this.kissSocket = null;

        // Reconexión automática
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;

        // Control de archivos de log procesados
        this.processedLogFiles = new Set();
        this.lastLogCheck = Date.now();
        
        // Estadísticas
        this.stats = {
            beaconsSent: 0,
            positionsReceived: 0,
            lastBeacon: null,
            lastPosition: null,
            startTime: null
        };
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
            // Inicializando módulo APRS silenciosamente
            
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
            
            // Cargar posiciones desde log CSV de Direwolf
            await this.loadFromDirewolfLog();
            
            // Inicializar conexión KISS TNC
            await this.initializeKISSConnection();
            
            this.isInitialized = true;
            this.stats.startTime = new Date();
            
            this.logger.info('APRS iniciado - Beacon cada 15min, KISS puerto 8001');
            return true;
            
        } catch (error) {
            this.logger.error('Error inicializando APRS:', error.message);
            return false;
        }
    }

    /**
     * Limpiar socket KISS existente antes de reconexión
     */
    cleanupKISSSocket() {
        if (this.kissSocket) {
            // Remover todos los listeners para evitar duplicados
            this.kissSocket.removeAllListeners();

            // Destruir socket si no está ya destruido
            if (!this.kissSocket.destroyed) {
                this.kissSocket.destroy();
            }

            this.kissSocket = null;
        }
    }

    /**
     * Inicializar conexión KISS TNC con TCP directo
     */
    async initializeKISSConnection() {
        try {
            // Limpiar socket existente si hay uno (evita listeners duplicados)
            this.cleanupKISSSocket();

            const net = require('net');

            // Crear conexión TCP directa al puerto KISS
            this.kissSocket = new net.Socket();
            this.kissSocket.setTimeout(0); // Sin timeout

            this.kissSocket.on('connect', () => {
                this.logger.info('Conectado a Direwolf KISS TNC (TCP directo)');
                this.tncConnection = true;
                this.reconnectAttempts = 0; // Reset contador de reconexiones
                this.emit('tnc_connected');
            });

            this.kissSocket.on('close', () => {
                this.logger.warn('Desconectado de Direwolf KISS TNC');
                this.tncConnection = false;
                this.emit('tnc_disconnected');

                // Intentar reconexión automática si el módulo sigue activo
                if (this.isRunning) {
                    this.scheduleReconnect();
                }
            });

            this.kissSocket.on('data', (data) => {
                this.logger.info('Datos KISS recibidos:', data.length, 'bytes, hex:', data.toString('hex').substring(0, 100));

                // Si recibimos datos, significa que estamos conectados
                if (!this.tncConnection) {
                    this.logger.info('Conexión TNC detectada por recepción de datos');
                    this.tncConnection = true;
                    this.reconnectAttempts = 0;
                    this.emit('tnc_connected');
                }

                // Procesar frame KISS (remover header KISS y procesar AX.25)
                this.handleKISSFrame(data);
            });

            this.kissSocket.on('error', (error) => {
                this.logger.error('Error en conexión KISS TCP:', error.message);
                this.tncConnection = false;
                // No emitir tnc_disconnected aquí, se emite en 'close'
            });

            // Conectar al puerto KISS
            this.kissSocket.connect(this.config.direwolf.kissPort, 'localhost');

            this.logger.info('Socket KISS TCP configurado para puerto', this.config.direwolf.kissPort);

        } catch (error) {
            this.logger.error('Error configurando conexión KISS:', error.message);
            throw error;
        }
    }

    /**
     * Programar reconexión automática con backoff exponencial
     */
    scheduleReconnect() {
        // Limpiar timer de reconexión existente
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.reconnectAttempts++;

        if (this.reconnectAttempts > this.maxReconnectAttempts) {
            this.logger.error(`Máximo de intentos de reconexión alcanzado (${this.maxReconnectAttempts})`);
            return;
        }

        // Backoff exponencial: 1s, 2s, 4s, 8s, 16s, 32s, 60s max
        const baseDelay = 1000;
        const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), 60000);

        this.logger.info(`Reconexión TNC programada en ${delay / 1000}s (intento ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            try {
                await this.initializeKISSConnection();
                this.logger.info('Reconexión TNC exitosa');
            } catch (error) {
                this.logger.error('Reconexión TNC fallida:', error.message);
                // scheduleReconnect se llamará desde el evento 'close' del socket
            }
        }, delay);
    }

    /**
     * Procesar frame KISS (temporal debug)
     */
    handleKISSFrame(kissData) {
        try {
            // Frame KISS formato: FEND CMD DATA FEND
            // CMD: 0x00 = data frame canal 0
            const FEND = 0xC0;
            
            this.logger.info('Frame KISS raw:', kissData.toString('hex'));
            
            // Buscar inicio de frame (FEND)
            let start = -1;
            let end = -1;
            
            for (let i = 0; i < kissData.length; i++) {
                if (kissData[i] === FEND) {
                    if (start === -1) {
                        start = i;
                    } else {
                        end = i;
                        break;
                    }
                }
            }
            
            if (start !== -1 && end !== -1 && end > start + 2) {
                // Extraer datos AX.25 (omitir FEND y CMD)
                const ax25Data = kissData.slice(start + 2, end);
                this.logger.info('📦 Datos AX.25 extraídos:', ax25Data.length, 'bytes');
                
                // Procesar frame AX.25
                this.handleReceivedFrame(ax25Data);
            } else {
                this.logger.warn('Frame KISS malformado o incompleto');
            }
            
        } catch (error) {
            this.logger.error('Error procesando frame KISS:', error.message);
        }
    }

    /**
     * Limpiar y mejorar comentario APRS
     */
    cleanComment(rawInfo) {
        if (!rawInfo) {return 'APRS Station';}
        
        // Remover caracteres de control y no imprimibles, preservando espacios
        const cleaned = rawInfo.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
        
        // Buscar patrones comunes de radio al final del mensaje
        const radioPatterns = [
            { pattern: /Yaesu\s+FT\w*\d*\w*/gi, name: 'Yaesu FTM/FT5D' },
            { pattern: /Kenwood\s+TH?\w*\d*\w*/gi, name: 'Kenwood TH/TM' },
            { pattern: /Icom\s+IC\w*\d*\w*/gi, name: 'Icom IC' },
            { pattern: /Baofeng\s+UV\w*\d*\w*/gi, name: 'Baofeng UV' },
            { pattern: /Motorola\s+\w+/gi, name: 'Motorola' }
        ];
        
        for (const radio of radioPatterns) {
            const matches = cleaned.match(radio.pattern);
            if (matches) {
                // Usar la última coincidencia (usualmente al final)
                return matches[matches.length - 1].trim();
            }
        }
        
        // Si no encontramos radio específica, buscar otros patrones
        // Patrón para texto después de "}"
        const afterBrace = cleaned.split('}').pop();
        if (afterBrace && afterBrace.length > 2) {
            const trimmed = afterBrace.trim();
            if (trimmed.length < 50 && !/[^\w\s\-\.]/g.test(trimmed)) {
                return trimmed;
            }
        }
        
        // Buscar palabras reconocibles al final
        const words = cleaned.split(/\s+/).filter(w => w.length > 2);
        const lastWords = words.slice(-3).join(' ');
        
        if (lastWords && lastWords.length < 30) {
            return lastWords;
        }
        
        return 'APRS Mobile';
    }

    /**
     * Obtener símbolo APRS mejorado con emoji
     */
    getAPRSSymbol(symbolCode) {
        // Mapeo completo de símbolos APRS basado en especificación oficial
        const symbolMap = {
            // Tabla primaria (/)
            '/!': '👮 Policía/Sheriff',
            '/"': '📋 Reservado', 
            '/#': 'DIGI (centro blanco)',
            '/$': 'Teléfono',
            '/%': 'DX Cluster',
            '/&': 'Gateway HF',
            '/\'': 'Avión pequeño',
            '/(': 'Estación satelital móvil',
            '/)': '♿ Silla de ruedas',
            '/*': '🛷 Moto de nieve',
            '/+': 'Cruz Roja',
            '/,': '👦 Boy Scouts',
            '/-': '🏠 Casa QTH (VHF)',
            '/.': 'X',
            '//': '🔴 Punto rojo',
            '/0': '⭕ Círculo',
            '/1': 'Uno',
            '/2': 'Dos', 
            '/3': 'Tres',
            '/4': 'Cuatro',
            '/5': 'Cinco',
            '/6': 'Seis',
            '/7': 'Siete',
            '/8': 'Ocho',
            '/9': 'Nueve',
            '/:': 'Fuego',
            '/;': '⛺ Campamento',
            '/<': 'Motocicleta',
            '/=': '🚂 Tren',
            '/>': '🚗 Auto',
            '/?': 'Servidor',
            '/@': '🚁 Helicóptero',
            '/A': '📦 Caja',
            '/B': '💨 BBS',
            '/C': '⛵ Canoa',
            '/D': '🔧 Herramienta',
            '/E': 'Ojo (eventos)',
            '/F': '🚒 Camión de bomberos',
            '/G': 'Planeador',
            '/H': '🏥 Hospital',
            '/I': 'TCP-IP',
            '/J': 'Node',
            '/K': '🏫 Escuela',
            '/L': '💡 Laptop/PC',
            '/M': '📍 Mic-E Repetidor',
            '/N': 'NTS Station',
            '/O': 'Globo',
            '/P': '👮 Policía',
            '/Q': '🔺 TBD',
            '/R': '🚁 RV',
            '/S': '🚢 Barco',
            '/T': '📞 Camión',
            '/U': '🚌 Bus',
            '/V': '🚐 Van',
            '/W': 'Estación de agua',
            '/X': '🚁 Helicóptero',
            '/Y': '⛵ Velero',
            '/Z': '📱 Casa móvil',
            '/[': '👤 Humano/Persona',
            '/\\': '🔺 Triángulo DF',
            '/]': '📮 Oficina de correos',
            '/^': 'Avión',
            '/_': 'Estación meteorológica',
            '/`': '🚁 Plato satelital',
            '/a': '🚑 Ambulancia',
            '/b': '🚲 Bicicleta',
            '/c': '🏠 Incidente command post',
            '/d': 'Departamento de bomberos',
            '/e': '🏠 Casa (HF)',
            '/f': '🚒 Camión de bomberos',
            '/g': 'Planeador',
            '/h': '🏥 Hospital',
            '/i': 'Información',
            '/j': '🚙 Jeep',
            '/k': '🚗 Camión',
            '/l': '💻 Laptop',
            '/m': '📍 Mic-E Repetidor',
            '/n': '🏭 Estación NTS',
            '/o': '🚗 EOC',
            '/p': '👤 Perro',
            '/q': '🏠 Grid Square',
            '/r': 'Repetidor',
            '/s': '⛵ Barco',
            '/t': '📞 Camión',
            '/u': '🚌 Bus',
            '/v': '🚐 Van',
            '/w': '💧 Estación de agua',
            '/x': '🚁 Helicóptero',
            '/y': '⛵ Velero',
            '/z': '📱 Reservado',
            '/|': '🏠 Estación TNC Stream',
            '/~': '🏠 Estación TNC Stream Switch',
            '/`': 'Mic-E (Kenwood, Yaesu, etc.)',

            // Tabla alternativa (\)
            '\\!': '🚨 Emergencia',
            '\\"': '📋 Reservado',
            '\\#': 'DIGI (overlaid)',
            '\\$': '💰 Banco',
            '\\%': 'DX Cluster',
            '\\&': '💎 Diamante',
            '\\\'': '🚁 Avión (pequeño)',
            '\\(': 'Nube',
            '\\)': '♿ Accesible',
            '\\*': 'Nieve',
            '\\+': '⛪ Iglesia',
            '\\,': '👦 Scout',
            '\\-': '🏛️ Casa (HF)',
            '\\.': '🔴 Punto',
            '\\/': '🔺 Triángulo',
            '\\0': '⭕ Círculo (alt)',
            '\\1': 'Uno (alt)',
            '\\2': 'Dos (alt)',
            '\\3': 'Tres (alt)',
            '\\4': 'Cuatro (alt)',
            '\\5': 'Cinco (alt)',
            '\\6': 'Seis (alt)',
            '\\7': 'Siete (alt)',
            '\\8': 'Ocho (alt)',
            '\\9': 'Nueve (alt)',
            '\\:': 'Fuego (alt)',
            '\\;': '⛺ Campamento (alt)',
            '\\<': 'Motocicleta (alt)',
            '\\=': '🚂 Tren (alt)',
            '\\>': '🚗 Auto (alt)',
            '\\?': 'Servidor (alt)',
            '\\@': '🌀 Huracán',
            '\\A': '📦 Caja (alt)',
            '\\B': 'Blizzard',
            '\\C': 'Costa Guard',
            '\\D': 'Tornado',
            '\\E': '🚨 Humo',
            '\\F': 'Niebla',
            '\\G': 'Nieve',
            '\\H': 'Tormenta',
            '\\I': 'Lluvia',
            '\\J': 'Rayos',
            '\\K': 'Granizo',
            '\\L': '🌟 Sol',
            '\\M': '📍 MARS',
            '\\N': 'Red',
            '\\O': '🌊 Tsunami',
            '\\P': '📞 Teléfono',
            '\\Q': '❓ Pregunta',
            '\\R': 'Repetidor (alt)',
            '\\S': 'Skyline',
            '\\T': '📞 Teléfono (alt)',
            '\\U': '🚌 Bus (alt)',
            '\\V': '🚐 Van (alt)',
            '\\W': '🌊 Inundación',
            '\\X': 'Peligroso',
            '\\Y': '⛵ Velero (alt)',
            '\\Z': '🏠 Shelter',
            '\\[': '📦 Caja humana',
            '\\\\': '🔺 DF Triángulo',
            '\\]': '📮 Correo (alt)',
            '\\^': 'Jet',
            '\\_': 'WX Station',
            '\\`': 'Antena'
        };
        
        // Buscar símbolo exacto primero
        if (symbolMap[symbolCode]) {
            return symbolMap[symbolCode];
        }
        
        // Buscar por segundo carácter (símbolo principal)
        const secondChar = symbolCode ? symbolCode[1] : '';
        for (const [code, description] of Object.entries(symbolMap)) {
            if (code[1] === secondChar) {
                return description;
            }
        }
        
        // Mapeo por caracteres individuales como fallback
        const charMap = {
            'h': '🏠 Casa',
            '-': '🏠 Casa',
            '>': '🚗 Auto',
            'k': '🚗 Auto', 
            'j': '🚙 Jeep',
            's': '⛵ Barco',
            '^': 'Avión',
            '[': '👤 Persona',
            'b': '🚲 Bici',
            'f': '🚒 Bomberos',
            'a': '🚑 Ambulancia',
            'r': 'Radio'
        };
        
        if (charMap[secondChar]) {
            return charMap[secondChar];
        }
        
        return `📍 ${symbolCode || 'Desconocido'}`;
    }

    /**
     * Calcular distancia entre dos coordenadas (fórmula Haversine)
     * @param {number} lat1 - Latitud punto 1
     * @param {number} lon1 - Longitud punto 1  
     * @param {number} lat2 - Latitud punto 2
     * @param {number} lon2 - Longitud punto 2
     * @returns {number} Distancia en kilómetros
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radio de la Tierra en km
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    /**
     * Convertir grados a radianes
     */
    toRadians(degrees) {
        return degrees * (Math.PI/180);
    }

    /**
     * Parser de coordenadas APRS desde el campo info
     * Formato APRS estándar: !DDMM.hhN/DDDMM.hhW o =DDMM.hhN/DDDMM.hhW
     */
    async parseAPRSCoordinates(info) {
        try {
            // Patrón para coordenadas APRS estándar
            // Formato: [!=/]DDMM.hhN/DDDMM.hhW[símbolo]
            const coordPattern = /[!=\/](\d{4}\.\d{2})([NS]).\s*(\d{5}\.\d{2})([EW])/;
            const match = info.match(coordPattern);
            
            if (match) {
                const [, latStr, latDir, lonStr, lonDir] = match;
                
                // Convertir DDMM.hh a decimal
                const latDeg = parseInt(latStr.substring(0, 2));
                const latMin = parseFloat(latStr.substring(2));
                let lat = latDeg + (latMin / 60);
                if (latDir === 'S') {lat = -lat;}
                
                const lonDeg = parseInt(lonStr.substring(0, 3));
                const lonMin = parseFloat(lonStr.substring(3));
                let lon = lonDeg + (lonMin / 60);
                if (lonDir === 'W') {lon = -lon;}
                
                this.logger.info(`📍 Coordenadas parseadas: ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
                return { lat, lon };
            }
            
            // Parser Mic-E - activar para cualquier info que empiece con ` (backtick)
            if (info && info[0] === '`') {
                this.logger.info('Detectado posible MIC-E, iniciando parser específico...');
                const micEResult = await this.parseMicE(info);
                if (micEResult) {
                    this.logger.info(`📍 Coordenadas MIC-E parseadas: ${micEResult.lat.toFixed(6)}, ${micEResult.lon.toFixed(6)}`);
                    return micEResult;
                }
            }
            
            return null;
            
        } catch (error) {
            this.logger.error('Error parseando coordenadas APRS:', error.message);
            return null;
        }
    }

    /**
     * Parser MIC-E - utiliza logs de Direwolf que ya tiene las coordenadas decodificadas
     */
    async parseMicE(info) {
        try {
            // MIC-E siempre requiere leer desde logs de Direwolf
            // porque los datos están en formato binario comprimido
            this.logger.info('Detectado MIC-E, leyendo coordenadas desde logs de Direwolf...');
            return await this.parseFromDirewolfLogs();
            
        } catch (error) {
            this.logger.debug('Error parsing MIC-E:', error.message);
            return null;
        }
    }

    /**
     * Buscar coordenadas en el último log de Direwolf para un timestamp específico
     */
    async parseFromDirewolfLogs(targetCallsign = null, targetTimestamp = null) {
        try {
            const fs = require('fs');
            const path = require('path');
            
            // Si tenemos timestamp específico, buscar en el log correcto
            let logFile;
            if (targetTimestamp) {
                const targetDate = new Date(targetTimestamp * 1000).toISOString().split('T')[0];
                logFile = path.join(__dirname, '../../logs', `${targetDate}.log`);
            } else {
                // Buscar en el log de hoy por defecto
                const today = new Date().toISOString().split('T')[0];
                logFile = path.join(__dirname, '../../logs', `${today}.log`);
            }
            
            if (!fs.existsSync(logFile)) {
                this.logger.debug('Log de Direwolf no existe:', logFile);
                return null;
            }
            
            const content = fs.readFileSync(logFile, 'utf8');
            const lines = content.trim().split('\n');
            
            // Buscar líneas que contengan coordenadas válidas
            // Si tenemos callsign y timestamp específicos, buscar la más cercana
            let bestMatch = null;
            let bestTimeDiff = Infinity;
            
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i];
                
                if (!line || line.includes('latitude,longitude')) {continue;}
                
                const fields = line.split(',');
                if (fields.length >= 11) {
                    const utime = parseInt(fields[1]);
                    const source = fields[3];
                    const lat = parseFloat(fields[10]);  // latitude field (index 10)
                    const lon = parseFloat(fields[11]); // longitude field (index 11)
                    
                    // Verificar que las coordenadas sean válidas
                    if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
                        // Si buscamos callsign específico
                        if (targetCallsign && source !== targetCallsign) {continue;}
                        
                        // Si buscamos timestamp específico, encontrar el más cercano
                        if (targetTimestamp) {
                            const timeDiff = Math.abs(utime - targetTimestamp);
                            if (timeDiff < bestTimeDiff) {
                                bestTimeDiff = timeDiff;
                                bestMatch = { lat, lon };
                            }
                        } else {
                            // Sin timestamp específico, tomar la primera válida (más reciente)
                            this.logger.info(`📍 Coordenadas desde Direwolf log: ${lat.toFixed(6)}, ${lon.toFixed(6)} (${source})`);
                            return { lat, lon };
                        }
                    }
                }
            }
            
            if (bestMatch) {
                this.logger.info(`📍 Coordenadas desde Direwolf log: ${bestMatch.lat.toFixed(6)}, ${bestMatch.lon.toFixed(6)}`);
                return bestMatch;
            }
            
            return null;
            
        } catch (error) {
            this.logger.debug('Error leyendo logs Direwolf:', error.message);
            return null;
        }
    }

    /**
     * Parser básico AX.25 mejorado para comentarios y símbolos
     */
    async parseBasicAX25(frame) {
        try {
            // Formato AX.25: DEST(7) + SOURCE(7) + PATH(0-56) + CONTROL(1) + PID(1) + INFO
            if (frame.length < 16) {return null;}
            
            // Extraer callsign source (bytes 7-12, shifted left 1 bit) + SSID
            let callsign = '';
            for (let i = 7; i < 13; i++) {
                const c = String.fromCharCode(frame[i] >> 1);
                if (c !== ' ') {callsign += c;}
            }
            
            // Extraer SSID desde el byte 13 (bits 7-1, shifted right 1)
            const ssidByte = frame[13];
            const ssid = (ssidByte >> 1) & 0x0F; // Bits 4-1 contienen el SSID
            if (ssid > 0) {
                callsign += `-${ssid}`;
            }
            
            // Buscar info field (después de 0x03 0xF0)
            let infoStart = -1;
            for (let i = 14; i < frame.length - 1; i++) {
                if (frame[i] === 0x03 && frame[i + 1] === 0xF0) {
                    infoStart = i + 2;
                    break;
                }
            }
            
            if (infoStart === -1) {
                this.logger.info('Info field no encontrado - usando datos de Direwolf directamente');
                
                // Fallback: usar directamente los logs de Direwolf que ya tienen las coordenadas
                const coordinates = await this.parseFromDirewolfLogs();
                if (coordinates) {
                    return {
                        source: callsign,
                        aprs: {
                            position: coordinates,
                            symbol: '/-',
                            comment: 'MIC-E (Direwolf)',
                            timestamp: new Date()
                        }
                    };
                }
                return null;
            }
            
            // Extraer información completa del packet
            const infoBuffer = frame.slice(infoStart);
            const info = infoBuffer.toString('ascii', 0, Math.min(100, infoBuffer.length));
            
            // Para cualquier frame APRS, usar coordenadas del log de Direwolf
            const coordinates = await this.parseFromDirewolfLogs(callsign);
            
            // Solo procesar si tenemos coordenadas válidas
            if (!coordinates) {
                this.logger.warn(`No se encontraron coordenadas válidas para ${callsign}, omitiendo`);
                return null;
            }
            
            const cleanedComment = this.cleanComment(info);
            
            // Buscar símbolo en el packet APRS (generalmente después de coordenadas)
            let symbolCode = '/-';
            const symbolMatch = info.match(/[\/\\](.)/);
            if (symbolMatch) {
                symbolCode = symbolMatch[0];
            }
            
            this.logger.info('Callsign:', callsign, 'Comentario limpio:', cleanedComment, 'Símbolo:', symbolCode);
            
            // Crear estructura APRS exitosa
            return {
                source: callsign,
                aprs: {
                    position: coordinates,
                    comment: cleanedComment || 'APRS via Direwolf',
                    symbol: this.getAPRSSymbol(symbolCode),
                    rawSymbol: symbolCode,
                    timestamp: new Date()
                }
            };
            
        } catch (error) {
            this.logger.error('Error parsing AX.25:', error.message);
            return null;
        }
    }

    /**
     * Obtener datos enriquecidos del log más reciente de Direwolf
     */
    async getEnrichedDataFromLog(callsign) {
        try {
            const logsDir = path.join(__dirname, '../../logs');
            const todayLog = path.join(logsDir, `${new Date().toISOString().split('T')[0]}.log`);
            
            if (!fs.existsSync(todayLog)) {
                return null;
            }
            
            const logContent = fs.readFileSync(todayLog, 'utf8');
            const lines = logContent.trim().split('\n');
            
            if (lines.length < 2) {return null;}
            
            const header = lines[0].split(',');
            const sourceIndex = header.indexOf('source');
            const speedIndex = header.indexOf('speed');
            const courseIndex = header.indexOf('course');
            const altitudeIndex = header.indexOf('altitude');
            const levelIndex = header.indexOf('level');
            const errorIndex = header.indexOf('error');
            
            // Buscar la entrada más reciente para este callsign
            for (let i = lines.length - 1; i >= 1; i--) {
                const fields = lines[i].split(',');
                if (fields[sourceIndex] === callsign) {
                    return {
                        speed: speedIndex >= 0 && fields[speedIndex] ? parseFloat(fields[speedIndex]) : null,
                        course: courseIndex >= 0 && fields[courseIndex] ? parseFloat(fields[courseIndex]) : null,
                        altitude: altitudeIndex >= 0 && fields[altitudeIndex] ? parseFloat(fields[altitudeIndex]) : null,
                        audioLevel: levelIndex >= 0 && fields[levelIndex] ? fields[levelIndex] : null,
                        errorRate: errorIndex >= 0 && fields[errorIndex] ? parseInt(fields[errorIndex]) : null
                    };
                }
            }
            
            return null;
        } catch (error) {
            this.logger.debug('Error obteniendo datos enriquecidos:', error.message);
            return null;
        }
    }

    /**
     * Manejar frame APRS recibido
     */
    async handleReceivedFrame(frame) {
        try {
            this.logger.info('Procesando frame APRS...');
            
            // Parser AX.25 básico
            const parsed = await this.parseBasicAX25(frame);
            
            this.logger.info('📝 Frame parseado:', parsed ? 'ÉXITO' : 'FALLO');
            if (parsed) {
                this.logger.info('📋 Source:', parsed.source, 'APRS:', !!parsed.aprs, 'Position:', !!(parsed.aprs && parsed.aprs.position));
            }
            
            if (parsed && parsed.aprs && parsed.aprs.position) {
                const existingPositions = this.receivedPositions.get(parsed.source) || [];
                const isNewStation = existingPositions.length === 0;
                
                // Calcular distancia desde la repetidora
                const distanceKm = this.calculateDistance(
                    this.config.location.lat,
                    this.config.location.lon,
                    parsed.aprs.position.lat,
                    parsed.aprs.position.lon
                );

                // Verificar si es una nueva ubicación (diferencia > 200 metros)
                const isNewLocation = existingPositions.length === 0 || 
                    !existingPositions.some(pos => {
                        const locDistance = this.calculateDistance(
                            pos.lat, pos.lon,
                            parsed.aprs.position.lat, parsed.aprs.position.lon
                        );
                        return locDistance < 0.2; // 200 metros
                    });

                // Obtener datos adicionales del log más reciente de Direwolf
                const enrichedData = await this.getEnrichedDataFromLog(parsed.source);
                
                const position = {
                    callsign: parsed.source,
                    lat: parsed.aprs.position.lat,
                    lon: parsed.aprs.position.lon,
                    timestamp: new Date(),
                    comment: parsed.aprs.comment || '',
                    symbol: parsed.aprs.symbol || '/',
                    lastHeard: new Date(),
                    count: existingPositions.length + 1,
                    firstHeard: isNewStation ? new Date() : existingPositions[0].firstHeard,
                    distance: Math.round(distanceKm * 100) / 100,
                    locationId: Date.now(), // ID único para esta ubicación
                    raw: frame,
                    
                    // Datos adicionales desde log de Direwolf
                    speed: enrichedData?.speed || null,
                    course: enrichedData?.course || null,
                    altitude: enrichedData?.altitude || null,
                    audioLevel: enrichedData?.audioLevel || null,
                    errorRate: enrichedData?.errorRate || null
                };
                
                if (isNewLocation) {
                    // Agregar nueva posición al historial
                    existingPositions.push(position);
                    this.receivedPositions.set(parsed.source, existingPositions);
                } else {
                    // Actualizar la posición existente más cercana
                    let closestIndex = 0;
                    let minDistance = Infinity;
                    existingPositions.forEach((pos, index) => {
                        const locDistance = this.calculateDistance(
                            pos.lat, pos.lon,
                            parsed.aprs.position.lat, parsed.aprs.position.lon
                        );
                        if (locDistance < minDistance) {
                            minDistance = locDistance;
                            closestIndex = index;
                        }
                    });
                    existingPositions[closestIndex] = position;
                    this.receivedPositions.set(parsed.source, existingPositions);
                }
                // Incrementar contador para cada packet APRS recibido (para coincidir con logs de Direwolf)
                this.stats.positionsReceived++;
                this.stats.lastPosition = position;
                
                // Log diferenciado para estaciones nuevas vs ubicaciones nuevas
                if (isNewStation) {
                    this.logger.info(`🆕 Nueva estación APRS: ${position.callsign} @ ${position.lat.toFixed(4)}, ${position.lon.toFixed(4)} - ${position.distance}km - ${position.comment}`);
                } else if (isNewLocation) {
                    this.logger.info(`📍 Nueva ubicación APRS: ${position.callsign} @ ${position.lat.toFixed(4)}, ${position.lon.toFixed(4)} - ${position.distance}km (ubicación #${existingPositions.length})`);
                } else {
                    this.logger.info(`Actualización APRS: ${position.callsign} @ ${position.lat.toFixed(4)}, ${position.lon.toFixed(4)} - ${position.distance}km`);
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
     * Cargar posiciones desde log CSV más reciente de Direwolf
     */
    async loadFromDirewolfLog() {
        try {
            // Buscar TODOS los archivos de log con datos APRS (historial completo)
            const logsDir = path.join(__dirname, '../../logs');
            const logFiles = fs.readdirSync(logsDir)
                .filter(f => f.endsWith('.log'))
                .sort(); // Orden cronológico (más antiguo primero)
            
            let processedFiles = 0;
            for (const logFile of logFiles) {
                const logFilePath = path.join(logsDir, logFile);
                if (fs.existsSync(logFilePath) && fs.statSync(logFilePath).size > 0) {
                    await this.loadPositionsFromFile(logFilePath, logFile);
                    this.processedLogFiles.add(logFile); // Registrar archivo procesado
                    processedFiles++;
                }
            }
            
            if (processedFiles === 0) {
                this.logger.warn('No se encontraron logs de Direwolf con datos');
                return;
            }
            
            // Actualizar estadísticas basadas en todas las posiciones cargadas
            this.updateStatsFromLoadedPositions();
            this.logger.info(`Historial APRS cargado desde ${processedFiles} archivos de log`);
            
        } catch (error) {
            this.logger.error('Error cargando historial de Direwolf:', error.message);
        }
    }

    /**
     * Revisar archivos de log nuevos o modificados
     */
    async checkForNewLogFiles() {
        try {
            const logsDir = path.join(__dirname, '../../logs');
            if (!fs.existsSync(logsDir)) {return;}

            const currentLogFiles = fs.readdirSync(logsDir)
                .filter(f => f.endsWith('.log'))
                .sort();

            // Pruning: eliminar del Set archivos que ya no existen en el filesystem
            const currentFileSet = new Set(currentLogFiles);
            for (const processedFile of this.processedLogFiles) {
                if (!currentFileSet.has(processedFile)) {
                    this.processedLogFiles.delete(processedFile);
                    this.logger.debug(`processedLogFiles pruned: ${processedFile} (ya no existe)`);
                }
            }
            
            let newFilesProcessed = 0;
            let positionsAdded = 0;
            
            for (const logFile of currentLogFiles) {
                const logFilePath = path.join(logsDir, logFile);
                
                // Solo procesar archivos nuevos o que han sido modificados recientemente
                if (!this.processedLogFiles.has(logFile)) {
                    if (fs.existsSync(logFilePath) && fs.statSync(logFilePath).size > 0) {
                        const fileStats = fs.statSync(logFilePath);
                        
                        // Solo procesar si el archivo es nuevo o fue modificado después de la última revisión
                        if (fileStats.mtime > this.lastLogCheck) {
                            this.logger.info(`📂 Detectado archivo nuevo: ${logFile}`);
                            const positions = await this.loadPositionsFromFile(logFilePath, logFile);
                            this.processedLogFiles.add(logFile);
                            newFilesProcessed++;
                            positionsAdded += positions;
                            
                            // Emitir evento para notificar nueva posición
                            if (positions > 0) {
                                this.emit('positions_updated', {
                                    newPositions: positions,
                                    fromFile: logFile
                                });
                            }
                        }
                    }
                } else {
                    // Para archivos ya procesados, verificar si han sido modificados (posiciones nuevas en el mismo día)
                    const fileStats = fs.statSync(logFilePath);
                    if (fileStats.mtime > this.lastLogCheck) {
                        this.logger.debug(`📝 Archivo modificado: ${logFile}, revisando nuevas posiciones`);
                        // Recargar solo las posiciones nuevas (esto podría optimizarse más)
                        const positions = await this.loadPositionsFromFile(logFilePath, logFile);
                        if (positions > 0) {
                            positionsAdded += positions;
                            this.emit('positions_updated', {
                                newPositions: positions,
                                fromFile: logFile
                            });
                        }
                    }
                }
            }
            
            this.lastLogCheck = Date.now();
            
            if (newFilesProcessed > 0 || positionsAdded > 0) {
                this.updateStatsFromLoadedPositions();
                this.logger.info(`Revisión de logs: ${newFilesProcessed} archivos nuevos, ${positionsAdded} posiciones agregadas`);
            }
            
        } catch (error) {
            this.logger.error('Error revisando archivos nuevos:', error.message);
        }
    }

    /**
     * Cargar posiciones desde un archivo específico de log
     */
    async loadPositionsFromFile(filePath, fileName) {
        try {
            const csvData = fs.readFileSync(filePath, 'utf8');
            const lines = csvData.trim().split('\n');
            
            // Primera línea es header CSV
            if (lines.length < 2) {return 0;}
            
            const header = lines[0].split(',');
            const latIndex = header.indexOf('latitude');
            const lonIndex = header.indexOf('longitude');
            const sourceIndex = header.indexOf('source');
            const timeIndex = header.indexOf('isotime');
            const commentIndex = header.indexOf('comment');
            const symbolIndex = header.indexOf('symbol');
            
            // Nuevos índices para datos adicionales
            const speedIndex = header.indexOf('speed');
            const courseIndex = header.indexOf('course');
            const altitudeIndex = header.indexOf('altitude');
            const levelIndex = header.indexOf('level');
            const errorIndex = header.indexOf('error');
            
            let positionsLoaded = 0;
            
            // Procesar cada línea del CSV
            for (let i = 1; i < lines.length; i++) {
                const fields = lines[i].split(',');
                
                // Verificar que tiene coordenadas válidas
                const lat = parseFloat(fields[latIndex]);
                const lon = parseFloat(fields[lonIndex]);
                const callsign = fields[sourceIndex];
                
                if (isNaN(lat) || isNaN(lon) || !callsign) {continue;}
                
                const existingPositions = this.receivedPositions.get(callsign) || [];
                
                // Verificar si es una nueva ubicación (diferencia > 200 metros para capturar posiciones significativas)
                const isNewLocation = existingPositions.length === 0 || 
                    !existingPositions.some(pos => {
                        const locDistance = this.calculateDistance(pos.lat, pos.lon, lat, lon);
                        return locDistance < 0.2; // 200 metros para capturar más variaciones
                    });
                
                if (isNewLocation) {
                    const distanceKm = this.calculateDistance(
                        this.config.location.lat,
                        this.config.location.lon,
                        lat, lon
                    );
                    
                    const position = {
                        callsign: callsign,
                        lat: lat,
                        lon: lon,
                        timestamp: new Date(fields[timeIndex]),
                        comment: fields[commentIndex] || 'APRS',
                        symbol: fields[symbolIndex] || '/>',
                        lastHeard: new Date(fields[timeIndex]),
                        count: existingPositions.length + 1,
                        firstHeard: existingPositions.length === 0 ? new Date(fields[timeIndex]) : existingPositions[0].firstHeard,
                        distance: Math.round(distanceKm * 100) / 100,
                        locationId: Date.now() + i + Math.random() * 1000, // ID único
                        
                        // Nuevos datos adicionales de Direwolf
                        speed: speedIndex >= 0 && fields[speedIndex] ? parseFloat(fields[speedIndex]) : null,
                        course: courseIndex >= 0 && fields[courseIndex] ? parseFloat(fields[courseIndex]) : null,
                        altitude: altitudeIndex >= 0 && fields[altitudeIndex] ? parseFloat(fields[altitudeIndex]) : null,
                        audioLevel: levelIndex >= 0 && fields[levelIndex] ? fields[levelIndex] : null,
                        errorRate: errorIndex >= 0 && fields[errorIndex] ? parseInt(fields[errorIndex]) : null
                    };
                    
                    existingPositions.push(position);
                    this.receivedPositions.set(callsign, existingPositions);
                    positionsLoaded++;
                }
            }
            
            this.logger.debug(`📂 ${fileName}: ${positionsLoaded} posiciones cargadas`);
            return positionsLoaded;
            
        } catch (error) {
            this.logger.error(`Error procesando ${fileName}:`, error.message);
            return 0;
        }
    }

    /**
     * Actualizar estadísticas desde las posiciones cargadas
     */
    updateStatsFromLoadedPositions() {
        // Contar todas las entradas de los logs de Direwolf para coincidir con el contador
        let totalPacketsReceived = 0;
        let latestPosition = null;
        let latestTime = 0;
        
        try {
            // Contar entradas en todos los logs de Direwolf
            const logsDir = path.join(__dirname, '../../logs');
            const logFiles = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
            
            for (const logFile of logFiles) {
                const logPath = path.join(logsDir, logFile);
                if (fs.existsSync(logPath)) {
                    const content = fs.readFileSync(logPath, 'utf8');
                    const lines = content.trim().split('\n');
                    // Contar líneas que no sean el header
                    totalPacketsReceived += lines.filter(line => line && !line.includes('chan,utime')).length;
                }
            }
        } catch (error) {
            this.logger.warn('Error contando packets de logs:', error.message);
            // Fallback: contar posiciones únicas
            for (const [callsign, positionArray] of this.receivedPositions.entries()) {
                totalPacketsReceived += positionArray.filter(pos => !pos.archived).length;
            }
        }
        
        // Encontrar la posición más reciente
        for (const [callsign, positionArray] of this.receivedPositions.entries()) {
            positionArray.forEach(pos => {
                if (pos.timestamp && typeof pos.timestamp.getTime === 'function' && pos.timestamp.getTime() > latestTime) {
                    latestTime = pos.timestamp.getTime();
                    latestPosition = pos;
                }
            });
        }
        
        this.stats.positionsReceived = totalPacketsReceived;
        if (latestPosition) {
            this.stats.lastPosition = latestPosition;
        }
        
        this.logger.info(`Total de packets APRS recibidos: ${totalPacketsReceived}`);
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
                
                // Agrupar posiciones por callsign para mantener historial
                const positionsByCallsign = new Map();
                positions.forEach(pos => {
                    // Convertir timestamp string de vuelta a Date
                    if (pos.timestamp) {pos.timestamp = new Date(pos.timestamp);}
                    if (pos.lastHeard) {pos.lastHeard = new Date(pos.lastHeard);}
                    
                    // Inicializar contador si no existe
                    if (!pos.count) {pos.count = 1;}
                    
                    // Agrupar por callsign
                    if (!positionsByCallsign.has(pos.callsign)) {
                        positionsByCallsign.set(pos.callsign, []);
                    }
                    positionsByCallsign.get(pos.callsign).push(pos);
                });
                
                // Guardar en el formato nuevo (arrays de posiciones por callsign)
                this.receivedPositions = positionsByCallsign;
                
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

            // Aplanar todas las posiciones de todos los callsigns
            const positions = [];
            for (const [callsign, positionArray] of this.receivedPositions.entries()) {
                positionArray.forEach(pos => {
                    positions.push({
                        callsign: pos.callsign,
                        lat: pos.lat,
                        lon: pos.lon,
                        timestamp: pos.timestamp,
                        comment: pos.comment || '',
                        symbol: pos.symbol || '/',
                        lastHeard: pos.lastHeard,
                        distance: pos.distance,
                        count: pos.count || 1,
                        locationId: pos.locationId
                    });
                });
            }

            // Calcular estadísticas de fechas para filtros
            const dates = positions.map(p => p.timestamp).filter(t => t);
            const earliestDate = dates.length > 0 ? new Date(Math.min(...dates.map(d => new Date(d).getTime()))) : null;
            const latestDate = dates.length > 0 ? new Date(Math.max(...dates.map(d => new Date(d).getTime()))) : null;
            const maxDistance = Math.max(...positions.map(p => p.distance || 0));
            const maxDistanceStation = positions.find(p => p.distance === maxDistance);

            // Guardar de forma asíncrona para no bloquear
            fs.writeFileSync(this.logFile, JSON.stringify({
                metadata: {
                    version: '1.0',
                    generated: new Date(),
                    totalStations: positions.length,
                    dateRange: {
                        earliest: earliestDate,
                        latest: latestDate,
                        daysSpan: earliestDate && latestDate ? 
                            Math.ceil((latestDate - earliestDate) / (1000 * 60 * 60 * 24)) + 1 : 1
                    },
                    maxDistance: {
                        distance: maxDistance,
                        station: maxDistanceStation ? {
                            callsign: maxDistanceStation.callsign,
                            timestamp: maxDistanceStation.timestamp
                        } : null
                    },
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
        if (!this.stats.lastBeacon || typeof this.stats.lastBeacon.getTime !== 'function') {return 'nunca';}
        try {
            return Math.floor((Date.now() - this.stats.lastBeacon.getTime()) / 1000 / 60);
        } catch (error) {
            this.logger.warn('Error calculando tiempo desde último beacon:', error.message);
            return 'error';
        }
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
        this.initialBeaconTimer = setTimeout(async () => {
            this.initialBeaconTimer = null;
            try {
                await this.sendBeaconSafe();
            } catch (error) {
                this.logger.error('Error en beacon inicial:', error.message);
            }

            // Luego enviar cada intervalo
            this.beaconTimer = setInterval(async () => {
                try {
                    await this.sendBeaconSafe();
                } catch (error) {
                    this.logger.error('Error en beacon periódico:', error.message);
                }
            }, interval);

        }, offset);

        // Iniciar monitoreo de archivos de log
        this.startLogMonitoring();

        this.logger.info(`Beacon automático configurado: cada ${Math.floor(interval/60000)} minutos`);
    }

    /**
     * Iniciar monitoreo continuo de archivos de log
     */
    startLogMonitoring() {
        // Limpiar timer existente si hay uno
        if (this.logMonitorTimer) {
            clearInterval(this.logMonitorTimer);
        }

        // Revisar archivos cada 2 minutos
        const monitorInterval = 2 * 60 * 1000; // 2 minutos
        
        this.logMonitorTimer = setInterval(async () => {
            try {
                await this.checkForNewLogFiles();
            } catch (error) {
                this.logger.error('Error en monitoreo de logs:', error.message);
            }
        }, monitorInterval);

        this.logger.info('Monitoreo de logs activado: revisión cada 2 minutos');
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
            // Marcar como no running PRIMERO para evitar reconexiones
            this.isRunning = false;

            // Limpiar timer de reconexión
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }

            // Desconectar TNC usando cleanup seguro
            this.cleanupKISSSocket();

            // Limpiar timers
            if (this.initialBeaconTimer) {
                clearTimeout(this.initialBeaconTimer);
                this.initialBeaconTimer = null;
            }

            if (this.beaconTimer) {
                clearInterval(this.beaconTimer);
                this.beaconTimer = null;
            }

            if (this.logMonitorTimer) {
                clearInterval(this.logMonitorTimer);
                this.logMonitorTimer = null;
            }

            if (this.cleanupTimer) {
                clearInterval(this.cleanupTimer);
                this.cleanupTimer = null;
            }

            this.tncConnection = false;
            this.reconnectAttempts = 0;

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
        const allPositions = [];
        // Aplanar todas las posiciones de todos los callsigns
        for (const [callsign, positionArray] of this.receivedPositions.entries()) {
            positionArray.forEach(pos => {
                if (!pos.archived) {
                    allPositions.push(pos);
                }
            });
        }
        return allPositions.sort((a, b) => (b.lastHeard || b.timestamp) - (a.lastHeard || a.timestamp));
    }

    /**
     * Obtener estadísticas detalladas
     */
    getDetailedStats() {
        // Usar el mismo método que getAllPositions para obtener todas las posiciones
        const allPositions = [];
        for (const [callsign, positionArray] of this.receivedPositions.entries()) {
            positionArray.forEach(pos => allPositions.push(pos));
        }
        const active = allPositions.filter(pos => !pos.archived);
        const archived = allPositions.filter(pos => pos.archived);
        
        return {
            total: allPositions.length,
            active: active.length,
            archived: archived.length,
            beacons: {
                sent: this.stats.beaconsSent,
                received: this.stats.positionsReceived,
                lastSent: this.stats.lastBeacon,
                lastReceived: this.stats.lastPosition?.timestamp
            },
            uptime: (this.stats.startTime && typeof this.stats.startTime.getTime === 'function') ? 
                Math.floor((Date.now() - this.stats.startTime.getTime()) / 1000 / 60) : 0,
            mostActive: active
                .sort((a, b) => (b.count || 0) - (a.count || 0))
                .slice(0, 5)
                .map(pos => ({ callsign: pos.callsign, count: pos.count || 0 }))
        };
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
            
            if (lastHeard && typeof lastHeard.getTime === 'function' && lastHeard.getTime() < cutoff) {
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
     * Aplicar límites de memoria para evitar crecimiento indefinido
     * Se llama automáticamente después de agregar nuevas posiciones
     */
    enforceMemoryLimits() {
        const { maxPositionsPerCallsign, maxTotalStations, cleanupThreshold } = this.memoryLimits;
        let totalRemoved = 0;

        // 1. Limitar posiciones por callsign
        for (const [callsign, positions] of this.receivedPositions.entries()) {
            if (Array.isArray(positions) && positions.length > maxPositionsPerCallsign) {
                // Ordenar por timestamp/lastHeard (más recientes primero)
                positions.sort((a, b) => {
                    const timeA = a.lastHeard?.getTime?.() || a.timestamp || 0;
                    const timeB = b.lastHeard?.getTime?.() || b.timestamp || 0;
                    return timeB - timeA;
                });

                // Mantener solo las más recientes
                const removed = positions.length - maxPositionsPerCallsign;
                positions.splice(maxPositionsPerCallsign);
                this.receivedPositions.set(callsign, positions);
                totalRemoved += removed;
            }
        }

        // 2. Limitar número total de estaciones
        if (this.receivedPositions.size > maxTotalStations * cleanupThreshold) {
            // Crear lista de estaciones con su última actividad
            const stationsWithActivity = [];
            for (const [callsign, positions] of this.receivedPositions.entries()) {
                let lastActivity = 0;
                if (Array.isArray(positions) && positions.length > 0) {
                    const lastPos = positions[positions.length - 1];
                    lastActivity = lastPos.lastHeard?.getTime?.() || lastPos.timestamp || 0;
                }
                stationsWithActivity.push({ callsign, lastActivity });
            }

            // Ordenar por última actividad (más antiguas primero)
            stationsWithActivity.sort((a, b) => a.lastActivity - b.lastActivity);

            // Eliminar el 10% más antiguo
            const toRemove = Math.floor(maxTotalStations * 0.1);
            const stationsToRemove = stationsWithActivity.slice(0, toRemove);

            for (const station of stationsToRemove) {
                this.receivedPositions.delete(station.callsign);
                totalRemoved++;
            }

            if (stationsToRemove.length > 0) {
                this.logger.info(`Límites de memoria: eliminadas ${stationsToRemove.length} estaciones antiguas`);
            }
        }

        if (totalRemoved > 0) {
            this.logger.debug(`Memoria APRS: ${totalRemoved} posiciones/estaciones eliminadas para mantener límites`);
        }
    }

    /**
     * Programar limpieza automática
     */
    scheduleCleanup() {
        // Limpiar cada 6 horas
        this.cleanupTimer = setInterval(() => {
            this.cleanupOldPositions();
            this.enforceMemoryLimits();
        }, 6 * 60 * 60 * 1000);
    }

    /**
     * Limpiar TODOS los logs de APRS (direwolf + JSON)
     */
    async clearAllLogs() {
        try {
            this.logger.warn('Iniciando limpieza completa de logs APRS');
            
            // 1. Limpiar datos en memoria
            this.receivedPositions.clear();
            this.processedLogFiles.clear(); // Limpiar registro de archivos procesados
            this.stats.positionsReceived = 0;
            this.stats.lastPosition = null;
            
            // 2. Eliminar archivo JSON de posiciones
            if (fs.existsSync(this.logFile)) {
                fs.unlinkSync(this.logFile);
                this.logger.info('Archivo JSON de posiciones eliminado');
            }
            
            // 3. Eliminar logs de direwolf (.log)
            const logsDir = path.join(__dirname, '../../logs');
            let deletedLogFiles = 0;
            
            if (fs.existsSync(logsDir)) {
                const logFiles = fs.readdirSync(logsDir)
                    .filter(f => f.endsWith('.log'))
                    .map(f => path.join(logsDir, f));
                
                for (const logFile of logFiles) {
                    try {
                        fs.unlinkSync(logFile);
                        deletedLogFiles++;
                        this.logger.info(`Log eliminado: ${path.basename(logFile)}`);
                    } catch (error) {
                        this.logger.warn(`No se pudo eliminar ${path.basename(logFile)}: ${error.message}`);
                    }
                }
            }
            
            // 4. Eliminar archivos de respaldo de posiciones
            const backupFiles = fs.readdirSync(logsDir)
                .filter(f => f.includes('aprs-positions-backup'))
                .map(f => path.join(logsDir, f));
                
            for (const backupFile of backupFiles) {
                try {
                    fs.unlinkSync(backupFile);
                    this.logger.info(`Backup eliminado: ${path.basename(backupFile)}`);
                } catch (error) {
                    this.logger.warn(`No se pudo eliminar backup ${path.basename(backupFile)}: ${error.message}`);
                }
            }
            
            this.logger.info(`Limpieza completa: ${deletedLogFiles} logs de direwolf eliminados`);
            return true;
            
        } catch (error) {
            this.logger.error('Error durante limpieza de logs:', error.message);
            throw error;
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