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
        
        // Base de datos de posiciones recibidas (callsign -> array de posiciones históricas)
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
     * Inicializar conexión KISS TNC con TCP directo (temporal debug)
     */
    async initializeKISSConnection() {
        try {
            const net = require('net');
            
            // Crear conexión TCP directa al puerto KISS
            this.kissSocket = new net.Socket();
            this.kissSocket.setTimeout(0); // Sin timeout
            
            this.kissSocket.on('connect', () => {
                this.logger.info('🔗 Conectado a Direwolf KISS TNC (TCP directo)');
                this.tncConnection = true;
                this.emit('tnc_connected');
            });
            
            this.kissSocket.on('close', () => {
                this.logger.warn('❌ Desconectado de Direwolf KISS TNC');
                this.tncConnection = false;
                this.emit('tnc_disconnected');
            });
            
            this.kissSocket.on('data', (data) => {
                // DEBUG: Log cuando recibimos datos KISS
                this.logger.info('📡 Datos KISS recibidos:', data.length, 'bytes, hex:', data.toString('hex').substring(0, 100));
                
                // Si recibimos datos, significa que estamos conectados
                if (!this.tncConnection) {
                    this.logger.info('Conexión TNC detectada por recepción de datos');
                    this.tncConnection = true;
                    this.emit('tnc_connected');
                }
                
                // Procesar frame KISS (remover header KISS y procesar AX.25)
                this.handleKISSFrame(data);
            });
            
            this.kissSocket.on('error', (error) => {
                this.logger.error('Error en conexión KISS TCP:', error.message);
                this.tncConnection = false;
                this.emit('tnc_disconnected');
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
     * Procesar frame KISS (temporal debug)
     */
    handleKISSFrame(kissData) {
        try {
            // Frame KISS formato: FEND CMD DATA FEND
            // CMD: 0x00 = data frame canal 0
            const FEND = 0xC0;
            
            // DEBUG: Mostrar datos KISS raw
            this.logger.info('🔍 Frame KISS raw:', kissData.toString('hex'));
            
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
                this.logger.warn('⚠️ Frame KISS malformado o incompleto');
            }
            
        } catch (error) {
            this.logger.error('Error procesando frame KISS:', error.message);
        }
    }

    /**
     * Limpiar y mejorar comentario APRS
     */
    cleanComment(rawInfo) {
        if (!rawInfo) return 'APRS Station';
        
        // Remover caracteres de control y no imprimibles, preservando espacios
        let cleaned = rawInfo.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
        
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
            '/#': '🔄 DIGI (centro blanco)',
            '/$': '☎️ Teléfono',
            '/%': '📡 DX Cluster',
            '/&': '⚡ Gateway HF',
            '/\'': '🛩️ Avión pequeño',
            '/(': '📡 Estación satelital móvil',
            '/)': '♿ Silla de ruedas',
            '/*': '🛷 Moto de nieve',
            '/+': '❤️ Cruz Roja',
            '/,': '👦 Boy Scouts',
            '/-': '🏠 Casa QTH (VHF)',
            '/.': '❌ X',
            '//': '🔴 Punto rojo',
            '/0': '⭕ Círculo',
            '/1': '1️⃣ Uno',
            '/2': '2️⃣ Dos', 
            '/3': '3️⃣ Tres',
            '/4': '4️⃣ Cuatro',
            '/5': '5️⃣ Cinco',
            '/6': '6️⃣ Seis',
            '/7': '7️⃣ Siete',
            '/8': '8️⃣ Ocho',
            '/9': '9️⃣ Nueve',
            '/:': '🔥 Fuego',
            '/;': '⛺ Campamento',
            '/<': '🏍️ Motocicleta',
            '/=': '🚂 Tren',
            '/>': '🚗 Auto',
            '/?': '📡 Servidor',
            '/@': '🚁 Helicóptero',
            '/A': '📦 Caja',
            '/B': '💨 BBS',
            '/C': '⛵ Canoa',
            '/D': '🔧 Herramienta',
            '/E': '👁️ Ojo (eventos)',
            '/F': '🚒 Camión de bomberos',
            '/G': '🛩️ Planeador',
            '/H': '🏥 Hospital',
            '/I': '🌐 TCP-IP',
            '/J': '📡 Node',
            '/K': '🏫 Escuela',
            '/L': '💡 Laptop/PC',
            '/M': '📍 Mic-E Repetidor',
            '/N': '📡 NTS Station',
            '/O': '🎈 Globo',
            '/P': '👮 Policía',
            '/Q': '🔺 TBD',
            '/R': '🚁 RV',
            '/S': '🚢 Barco',
            '/T': '📞 Camión',
            '/U': '🚌 Bus',
            '/V': '🚐 Van',
            '/W': '🌐 Estación de agua',
            '/X': '🚁 Helicóptero',
            '/Y': '⛵ Velero',
            '/Z': '📱 Casa móvil',
            '/[': '👤 Humano/Persona',
            '/\\': '🔺 Triángulo DF',
            '/]': '📮 Oficina de correos',
            '/^': '✈️ Avión',
            '/_': '🌡️ Estación meteorológica',
            '/`': '🚁 Plato satelital',
            '/a': '🚑 Ambulancia',
            '/b': '🚲 Bicicleta',
            '/c': '🏠 Incidente command post',
            '/d': '🔥 Departamento de bomberos',
            '/e': '🏠 Casa (HF)',
            '/f': '🚒 Camión de bomberos',
            '/g': '🛩️ Planeador',
            '/h': '🏥 Hospital',
            '/i': 'ℹ️ Información',
            '/j': '🚙 Jeep',
            '/k': '🚗 Camión',
            '/l': '💻 Laptop',
            '/m': '📍 Mic-E Repetidor',
            '/n': '🏭 Estación NTS',
            '/o': '🚗 EOC',
            '/p': '👤 Perro',
            '/q': '🏠 Grid Square',
            '/r': '📻 Repetidor',
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
            '/`': '📡 Mic-E (Kenwood, Yaesu, etc.)',

            // Tabla alternativa (\)
            '\\!': '🚨 Emergencia',
            '\\"': '📋 Reservado',
            '\\#': '🔄 DIGI (overlaid)',
            '\\$': '💰 Banco',
            '\\%': '📡 DX Cluster',
            '\\&': '💎 Diamante',
            '\\\'': '🚁 Avión (pequeño)',
            '\\(': '☁️ Nube',
            '\\)': '♿ Accesible',
            '\\*': '❄️ Nieve',
            '\\+': '⛪ Iglesia',
            '\\,': '👦 Scout',
            '\\-': '🏛️ Casa (HF)',
            '\\.': '🔴 Punto',
            '\\/': '🔺 Triángulo',
            '\\0': '⭕ Círculo (alt)',
            '\\1': '1️⃣ Uno (alt)',
            '\\2': '2️⃣ Dos (alt)',
            '\\3': '3️⃣ Tres (alt)',
            '\\4': '4️⃣ Cuatro (alt)',
            '\\5': '5️⃣ Cinco (alt)',
            '\\6': '6️⃣ Seis (alt)',
            '\\7': '7️⃣ Siete (alt)',
            '\\8': '8️⃣ Ocho (alt)',
            '\\9': '9️⃣ Nueve (alt)',
            '\\:': '🔥 Fuego (alt)',
            '\\;': '⛺ Campamento (alt)',
            '\\<': '🏍️ Motocicleta (alt)',
            '\\=': '🚂 Tren (alt)',
            '\\>': '🚗 Auto (alt)',
            '\\?': '📡 Servidor (alt)',
            '\\@': '🌀 Huracán',
            '\\A': '📦 Caja (alt)',
            '\\B': '📡 Blizzard',
            '\\C': '☁️ Costa Guard',
            '\\D': '🌪️ Tornado',
            '\\E': '🚨 Humo',
            '\\F': '🌫️ Niebla',
            '\\G': '❄️ Nieve',
            '\\H': '🌩️ Tormenta',
            '\\I': '⛈️ Lluvia',
            '\\J': '⚡ Rayos',
            '\\K': '🌨️ Granizo',
            '\\L': '🌟 Sol',
            '\\M': '📍 MARS',
            '\\N': '📻 Red',
            '\\O': '🌊 Tsunami',
            '\\P': '📞 Teléfono',
            '\\Q': '❓ Pregunta',
            '\\R': '📻 Repetidor (alt)',
            '\\S': '⛰️ Skyline',
            '\\T': '📞 Teléfono (alt)',
            '\\U': '🚌 Bus (alt)',
            '\\V': '🚐 Van (alt)',
            '\\W': '🌊 Inundación',
            '\\X': '⚠️ Peligroso',
            '\\Y': '⛵ Velero (alt)',
            '\\Z': '🏠 Shelter',
            '\\[': '📦 Caja humana',
            '\\\\': '🔺 DF Triángulo',
            '\\]': '📮 Correo (alt)',
            '\\^': '✈️ Jet',
            '\\_': '🌡️ WX Station',
            '\\`': '📡 Antena'
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
            '^': '✈️ Avión',
            '[': '👤 Persona',
            'b': '🚲 Bici',
            'f': '🚒 Bomberos',
            'a': '🚑 Ambulancia',
            'r': '📻 Radio'
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
     * Parser básico AX.25 mejorado para comentarios y símbolos
     */
    parseBasicAX25(frame) {
        try {
            // Formato AX.25: DEST(7) + SOURCE(7) + PATH(0-56) + CONTROL(1) + PID(1) + INFO
            if (frame.length < 16) return null; // Muy corto
            
            // Extraer callsign source (bytes 7-12, shifted left 1 bit)
            let callsign = '';
            for (let i = 7; i < 13; i++) {
                const c = String.fromCharCode(frame[i] >> 1);
                if (c !== ' ') callsign += c;
            }
            
            // Buscar info field (después de 0x03 0xF0)
            let infoStart = -1;
            for (let i = 14; i < frame.length - 1; i++) {
                if (frame[i] === 0x03 && frame[i + 1] === 0xF0) {
                    infoStart = i + 2;
                    break;
                }
            }
            
            if (infoStart === -1) return null;
            
            // Extraer información completa del packet
            const infoBuffer = frame.slice(infoStart);
            const info = infoBuffer.toString('ascii', 0, Math.min(100, infoBuffer.length));
            
            // Extraer comentario limpio
            const cleanedComment = this.cleanComment(info);
            
            // Determinar símbolo APRS (por defecto casa móvil)
            let symbolCode = '/>'; // Vehículo por defecto para móviles
            
            // Buscar símbolo en el packet APRS (generalmente después de coordenadas)
            const symbolMatch = info.match(/[\/\\](.)/);
            if (symbolMatch) {
                symbolCode = symbolMatch[0];
            }
            
            this.logger.info('📊 Callsign:', callsign, 'Comentario limpio:', cleanedComment, 'Símbolo:', symbolCode);
            
            // Crear estructura APRS mejorada
            return {
                source: callsign,
                aprs: {
                    position: {
                        lat: -32.908, // Coordenada fija para testing
                        lon: -68.817
                    },
                    comment: cleanedComment,
                    symbol: this.getAPRSSymbol(symbolCode),
                    rawSymbol: symbolCode
                }
            };
            
        } catch (error) {
            this.logger.error('Error parsing AX.25:', error.message);
            return null;
        }
    }

    /**
     * Manejar frame APRS recibido
     */
    async handleReceivedFrame(frame) {
        try {
            // DEBUG: Log el frame recibido
            this.logger.info('🔍 Procesando frame APRS...');
            
            // Parser AX.25 básico manual para debugging
            const parsed = this.parseBasicAX25(frame);
            
            // DEBUG: Log resultado del parsing
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

                // Verificar si es una nueva ubicación (diferencia > 100 metros)
                const isNewLocation = existingPositions.length === 0 || 
                    !existingPositions.some(pos => {
                        const locDistance = this.calculateDistance(
                            pos.lat, pos.lon,
                            parsed.aprs.position.lat, parsed.aprs.position.lon
                        );
                        return locDistance < 0.1; // 100 metros
                    });

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
                    raw: frame
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
                this.stats.positionsReceived++;
                this.stats.lastPosition = position;
                
                // Log diferenciado para estaciones nuevas vs ubicaciones nuevas
                if (isNewStation) {
                    this.logger.info(`🆕 Nueva estación APRS: ${position.callsign} @ ${position.lat.toFixed(4)}, ${position.lon.toFixed(4)} - ${position.distance}km - ${position.comment}`);
                } else if (isNewLocation) {
                    this.logger.info(`📍 Nueva ubicación APRS: ${position.callsign} @ ${position.lat.toFixed(4)}, ${position.lon.toFixed(4)} - ${position.distance}km (ubicación #${existingPositions.length})`);
                } else {
                    this.logger.info(`🔄 Actualización APRS: ${position.callsign} @ ${position.lat.toFixed(4)}, ${position.lon.toFixed(4)} - ${position.distance}km`);
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
                
                // Agrupar posiciones por callsign para mantener historial
                const positionsByCallsign = new Map();
                positions.forEach(pos => {
                    // Convertir timestamp string de vuelta a Date
                    if (pos.timestamp) pos.timestamp = new Date(pos.timestamp);
                    if (pos.lastHeard) pos.lastHeard = new Date(pos.lastHeard);
                    
                    // Inicializar contador si no existe
                    if (!pos.count) pos.count = 1;
                    
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
            // Desconectar TNC (TCP directo)
            if (this.kissSocket && !this.kissSocket.destroyed) {
                this.kissSocket.end();
                this.kissSocket.destroy();
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