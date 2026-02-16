const EventEmitter = require('events');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { delay, sanitizeTextForTTS } = require('../utils');
const { createLogger } = require('../logging/Logger');
const { MODULE_STATES } = require('../constants');
const HybridVoiceManager = require('../audio/HybridVoiceManager');

/**
 * Módulo INPRES - Instituto Nacional de Prevención Sísmica
 * Funcionalidades:
 * - Monitoreo automático cada 20min de sismos INPRES (via XML)
 * - Detección de sismos > 4.0 magnitud en región Mendoza
 * - Detección de sismos >= 6.0 en Chile (registrados por INPRES)
 * - Filtrado por estado (azul: preliminar, negro: revisado, rojo: sentido)
 * - Anuncios automáticos con Google TTS
 * - Comando DTMF *3 para consulta manual de sismos del día
 * - Una sola notificación por sismo para evitar spam
 */
class InpresSismic extends EventEmitter {
    constructor(audioManager) {
        super();
        this.audioManager = audioManager;
        this.logger = createLogger('[INPRES]');
        this.state = MODULE_STATES.IDLE;
        
        this.config = {
            enabled: true,
            
            // URL de INPRES (XML es la fuente real de datos, el HTML usa JS para cargarlos)
            inpresXmlUrl: 'https://www.inpres.gob.ar/mapa/sismos.xml',

            // Monitoreo cada 20 minutos para respuesta rápida
            checkInterval: 20 * 60 * 1000, // 20 minutos

            // Criterios de detección
            magnitudeThreshold: 4.0, // > 4.0 para Mendoza
            chileMagnitudeThreshold: 6.0, // >= 6.0 para sismos de Chile
            
            // Coordenadas de Mendoza (reutilizando de weatherAlerts)
            mendozaRegion: {
                bounds: {
                    north: -32.0,    // 32° Sur (límite norte)
                    south: -37.6,    // 37°35' Sur (límite sur) 
                    west: -70.6,     // 70°35' Oeste (límite oeste)
                    east: -66.5      // 66°30' Oeste (límite este)
                },
                center: { lat: -34.8, lon: -68.5 }
            },
            
            // Estados de sismos INPRES
            seismicStates: {
                PRELIMINARY: 'azul',     // Determinado automáticamente (puede estar errado)
                REVIEWED: 'negro',       // Revisado por sismólogo (no sentido)
                FELT: 'rojo'            // Sentido y revisado por sismólogo
            },
            
            // Solo anunciar sismos revisados o sentidos (negro/rojo)
            // Los azules pueden estar errados según INPRES
            announceStates: ['negro', 'rojo'],
            
            // TTS con Google TTS
            useGoogleTTS: true,
            fallbackTTS: 'espeak',
            
            // Cache optimizado
            cacheDuration: 15 * 60 * 1000, // 15 minutos
            cacheMaxAge: 60 * 60 * 1000, // 1 hora máximo para cache expirado
            
            // User Agent para web scraping
            userAgent: 'Mozilla/5.0 (compatible; VX200Controller/2.5.0; +radioaficionado)'
        };
        
        // Estado de sismos
        this.detectedSeisms = new Map(); // ID sismo -> datos completos
        this.announcedSeisms = new Set(); // IDs ya anunciados
        this.todaySeisms = []; // Sismos del día actual
        this.lastCheck = null;
        this.checkTimer = null;
        
        // Cache
        this.cache = {
            data: null,
            timestamp: 0
        };
        
        // Voice Manager para Google TTS
        // Inicializar sistema híbrido de voz
        this.voiceManager = new HybridVoiceManager(this.audioManager);
        if (this.config.useGoogleTTS) {
            try {
                // TTS habilitado via audioManager
                this.logger.info('Google TTS habilitado para alertas sísmicas');
            } catch (error) {
                this.logger.warn('Google TTS no disponible, usando fallback:', error.message);
            }
        }
        
        // Mapeo de zonas por coordenadas aproximadas
        this.mendozaZones = [
            { name: 'Capital - Gran Mendoza', lat: -32.89, lon: -68.84, radius: 0.3 },
            { name: 'Valle de Uco', lat: -33.7, lon: -69.1, radius: 0.4 },
            { name: 'San Rafael', lat: -34.6, lon: -68.3, radius: 0.3 },
            { name: 'General Alvear', lat: -34.9, lon: -67.6, radius: 0.3 },
            { name: 'Malargüe', lat: -35.5, lon: -69.6, radius: 0.4 },
            { name: 'Tunuyán', lat: -33.6, lon: -69.0, radius: 0.2 },
            { name: 'San Martín', lat: -33.1, lon: -68.5, radius: 0.2 },
            { name: 'Rivadavia', lat: -33.2, lon: -68.4, radius: 0.2 },
            { name: 'Las Heras', lat: -32.8, lon: -68.8, radius: 0.2 }
        ];
    }
    
    /**
     * Iniciar monitoreo automático de sismos con manejo de errores mejorado
     */
    async start() {
        if (this.state === MODULE_STATES.ACTIVE) {
            this.logger.warn('Módulo INPRES ya está activo');
            return;
        }
        
        try {
            this.logger.info('🚀 Iniciando módulo INPRES...');
            this.state = MODULE_STATES.ACTIVE;
            
            // Verificación inicial con manejo graceful de errores
            this.logger.info('🔍 Verificación inicial de sismos INPRES...');
            try {
                await this.checkSeisms();
                this.logger.info('✅ Verificación inicial exitosa');
            } catch (error) {
                this.logger.warn('⚠️ Verificación inicial falló, continuando con monitoreo:', error.message);
                // No fallar el inicio por un error inicial, el timer se encargará de reintentar
            }
            
            // Configurar monitoreo automático cada 20 minutos
            this.checkTimer = setInterval(async () => {
                try {
                    await this.checkSeisms();
                } catch (error) {
                    this.logger.error('❌ Error en verificación automática:', error.message);
                    // El estado ya se maneja dentro de checkSeisms()
                }
            }, this.config.checkInterval);
            
            const intervalMinutes = Math.round(this.config.checkInterval / 60000);
            this.logger.info(`✅ Monitoreo INPRES iniciado - verificando cada ${intervalMinutes} minutos`);
            this.logger.info(`🎯 Filtros: Mendoza >${this.config.magnitudeThreshold}, Chile >=${this.config.chileMagnitudeThreshold}, Estados: ${this.config.announceStates.join(', ')}`);
            
            this.emit('started', { 
                checkInterval: this.config.checkInterval,
                magnitudeThreshold: this.config.magnitudeThreshold,
                announceStates: this.config.announceStates
            });
            
        } catch (error) {
            this.state = MODULE_STATES.ERROR;
            this.logger.error('🔥 Error crítico iniciando módulo INPRES:', error.message);
            this.emit('error', error);
            throw error; // Re-lanzar para que el controlador principal lo maneje
        }
    }
    
    /**
     * Detener monitoreo automático
     */
    stop() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
        
        const wasActive = this.state === MODULE_STATES.ACTIVE;
        this.state = MODULE_STATES.IDLE;
        
        if (wasActive) {
            this.logger.info('Monitoreo INPRES detenido');
            this.emit('stopped');
        }
    }
    
    /**
     * Verificar sismos desde INPRES XML con manejo de errores mejorado
     */
    async checkSeisms() {
        const maxRetries = 3;
        const retryDelay = 2000;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this.logger.debug(`Verificando sismos desde INPRES XML... (intento ${attempt}/${maxRetries})`);

                const now = Date.now();
                if (this.cache.data && (now - this.cache.timestamp) < this.config.cacheDuration) {
                    this.logger.debug('Usando datos desde cache');
                    return this.cache.data;
                }

                const response = await axios.get(this.config.inpresXmlUrl, {
                    headers: {
                        'User-Agent': this.config.userAgent,
                        'Accept': 'application/xml, text/xml, */*',
                        'Accept-Language': 'es-AR,es;q=0.8,en;q=0.5'
                    },
                    timeout: 20000,
                    maxRedirects: 3,
                    validateStatus: (status) => status >= 200 && status < 500
                });

                if (!response.data || typeof response.data !== 'string') {
                    throw new Error(`Respuesta inválida del servidor INPRES (${typeof response.data})`);
                }

                if (response.status !== 200) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                if (!response.data.includes('<lista>')) {
                    throw new Error('La respuesta XML no contiene datos de sismos');
                }

                const seisms = this.parseSeismsFromXML(response.data);

                this.cache = {
                    data: seisms,
                    timestamp: now
                };

                await this.processNewSeisms(seisms);

                this.lastCheck = new Date();
                this.logger.info(`✅ Sismos verificados: ${seisms.length} encontrados, ${this.todaySeisms.length} de hoy`);

                if (this.state === MODULE_STATES.ERROR) {
                    this.state = MODULE_STATES.ACTIVE;
                    this.logger.info('Módulo INPRES recuperado de estado de error');
                }

                return seisms;

            } catch (error) {
                lastError = error;
                const errorType = error.code || error.name || 'Unknown';
                this.logger.warn(`❌ Intento ${attempt}/${maxRetries} fallido [${errorType}]: ${error.message}`);

                if (attempt === maxRetries) {
                    this.state = MODULE_STATES.ERROR;
                    this.logger.error(`🔥 Error crítico en INPRES después de ${maxRetries} intentos`);
                }

                if (attempt < maxRetries) {
                    await this.delay(retryDelay * attempt);
                }
            }
        }

        if (this.cache.data) {
            const age = Date.now() - this.cache.timestamp;
            const ageMinutes = Math.round(age / 60000);

            if (age < this.config.cacheMaxAge) {
                this.logger.warn(`⚠️ Usando cache expirado (${ageMinutes} minutos de antigüedad)`);
                return this.cache.data;
            } else {
                this.logger.error(`🚫 Cache demasiado antiguo (${ageMinutes} minutos), descartando`);
            }
        }

        throw new Error(`INPRES no disponible después de ${maxRetries} intentos: ${lastError.message}`);
    }
    
    /**
     * Función auxiliar para delay
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Parsear sismos desde XML de INPRES
     * Estructura XML: <lista><item><idSismo>, <fecha>, <hora>, <latitud>, <longitud>, <prof>, <mg>, <prov>, <color_link>
     */
    parseSeismsFromXML(xml) {
        const $ = cheerio.load(xml, { xmlMode: true });
        const seisms = [];

        try {
            const items = $('item');
            this.logger.debug(`Procesando ${items.length} sismos desde XML...`);

            items.each((index, element) => {
                try {
                    const item = $(element);
                    const id = item.find('idSismo').text().trim();
                    const fecha = item.find('fecha').text().trim();
                    const hora = item.find('hora').text().trim();
                    const lat = parseFloat(item.find('latitud').text().trim());
                    const lon = parseFloat(item.find('longitud').text().trim());
                    const depth = parseFloat(item.find('prof').text().trim());
                    const mag = parseFloat(item.find('mg').text().trim());
                    const prov = item.find('prov').text().trim();
                    const colorCode = item.find('color_link').text().trim();

                    if (isNaN(mag) || !id) return;

                    // Mapear color_link hex a colores del sistema
                    let color = 'azul';
                    if (colorCode === '000' || colorCode === '#000' || colorCode === '000000') {
                        color = 'negro';
                    } else if (colorCode === 'f00' || colorCode === '#f00' || colorCode === 'ff0000' || colorCode === 'F00') {
                        color = 'rojo';
                    }

                    const zone = this.determineZone(lat, lon);

                    const seismData = {
                        id,
                        date: fecha,
                        time: hora,
                        magnitude: mag,
                        depth: isNaN(depth) ? null : depth,
                        latitude: isNaN(lat) ? null : lat,
                        longitude: isNaN(lon) ? null : lon,
                        province: prov || 'Desconocida',
                        location: zone,
                        color: color,
                        state: this.getSeismState(color),
                        rawData: `${id} | ${fecha} ${hora} | Mag ${mag} | ${prov}`,
                        timestamp: new Date(),
                        numero: null
                    };

                    if (this.isValidSeism(seismData)) {
                        seisms.push(seismData);
                        this.logger.debug(`✅ Sismo válido: Mag ${mag} - ${prov} (${color})`);
                    } else {
                        this.logger.debug(`Sismo filtrado: Mag ${mag} - ${prov}`);
                    }

                } catch (error) {
                    this.logger.debug(`⚠️ Error parseando item ${index}:`, error.message);
                }
            });

            this.logger.info(`📊 Parsing XML completado: ${seisms.length} sismos válidos de ${items.length} procesados`);
            return seisms;

        } catch (error) {
            this.logger.error('🔥 Error crítico parseando XML de INPRES:', error.message);
            return seisms;
        }
    }
    
    /**
     * Determinar estado del sismo según color
     */
    getSeismState(color) {
        switch (color) {
            case 'azul': return 'Preliminar';
            case 'negro': return 'Revisado';
            case 'rojo': return 'Sentido';
            default: return 'Desconocido';
        }
    }
    
    /**
     * Determinar zona de Mendoza por coordenadas
     */
    determineZone(lat, lon) {
        if (!lat || !lon) {return 'Mendoza';}
        
        // Buscar zona más cercana
        let closestZone = 'Mendoza';
        let minDistance = Infinity;
        
        for (const zone of this.mendozaZones) {
            const distance = Math.sqrt(
                Math.pow(lat - zone.lat, 2) + Math.pow(lon - zone.lon, 2)
            );
            
            if (distance < zone.radius && distance < minDistance) {
                minDistance = distance;
                closestZone = zone.name;
            }
        }
        
        return closestZone;
    }
    
    /**
     * Validar si un sismo cumple criterios
     * - Mendoza: magnitud > 4.0, dentro de bounds geográficos
     * - Chile: magnitud >= 6.0 (sismos grandes que se sienten en Mendoza)
     */
    isValidSeism(seism) {
        if (!seism.magnitude) {
            return false;
        }

        // Sismos de Chile: aceptar con magnitud >= 6
        const isChile = seism.province && seism.province.toLowerCase().includes('chile');
        if (isChile) {
            return seism.magnitude >= this.config.chileMagnitudeThreshold;
        }

        // Para el resto: verificar magnitud > 4.0
        if (seism.magnitude <= this.config.magnitudeThreshold) {
            return false;
        }

        // Verificar región Mendoza (si hay coordenadas)
        if (seism.latitude && seism.longitude) {
            const bounds = this.config.mendozaRegion.bounds;
            if (seism.latitude < bounds.south || seism.latitude > bounds.north ||
                seism.longitude < bounds.west || seism.longitude > bounds.east) {
                return false;
            }
        } else if (seism.province && !seism.province.toLowerCase().includes('mendoza')) {
            return false;
        }

        return true;
    }
    
    /**
     * Procesar sismos nuevos y determinar si anunciar
     */
    async processNewSeisms(seisms) {
        const today = new Date().toDateString();
        this.todaySeisms = seisms.filter(s => {
            const seismDate = new Date(s.date).toDateString();
            return seismDate === today;
        });
        
        for (const seism of seisms) {
            if (!this.detectedSeisms.has(seism.id)) {
                this.detectedSeisms.set(seism.id, seism);
                
                // Solo anunciar sismos revisados (negro/rojo) para evitar falsos positivos
                if (this.config.announceStates.includes(seism.color) && 
                    !this.announcedSeisms.has(seism.id)) {
                    
                    await this.announceSeism(seism);
                    this.announcedSeisms.add(seism.id);
                }
                
                this.emit('seism_detected', seism);
            }
        }
    }
    
    /**
     * Anunciar sismo por TTS mejorado
     */
    async announceSeism(seism) {
        try {
            this.logger.info(`📢 Anunciando sismo: Mag ${seism.magnitude} en ${seism.location}`);
            
            // Esperar canal libre antes de transmitir
            await this.waitForFreeChannel();
            
            // Tono de alerta sísmica
            await this.audioManager.playTone(600, 300, 0.8);
            await this.delay(200);
            await this.audioManager.playTone(800, 300, 0.8);
            await this.delay(500);
            
            // Construir mensaje TTS mejorado
            const magnitude = seism.magnitude.toFixed(1);
            const depth = seism.depth ? `${seism.depth.toFixed(0)} kilómetros` : 'profundidad no determinada';
            const time = seism.time || 'hora no determinada';
            const date = seism.date || 'fecha no determinada';
            const state = seism.state || 'estado desconocido';
            
            // Mensaje estructurado y claro
            const isChileSeism = seism.province && seism.province.toLowerCase().includes('chile');
            let message = isChileSeism
                ? 'Atención. Sismo detectado en Chile, registrado por INPRES. '
                : 'Atención. Nuevo sismo detectado por INPRES. ';
            message += `Estado: ${state}. `;
            message += `Magnitud ${magnitude}. `;
            message += `Profundidad ${depth}. `;
            message += isChileSeism
                ? `Origen: ${seism.province}. `
                : `Ubicación ${seism.location}. `;
            
            // Agregar información temporal
            const currentTime = new Date().toLocaleTimeString('es-AR', { 
                timeZone: 'America/Argentina/Mendoza',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            message += `Detección INPRES fecha ${date} hora ${time}. `;
            message += `Información emitida a las ${currentTime}, fuente Instituto Nacional de Prevención Sísmica.`;
            
            const sanitizedMessage = sanitizeTextForTTS(message);
            
            this.logger.debug(`💬 Mensaje TTS (${sanitizedMessage.length} chars): ${sanitizedMessage.substring(0, 100)}...`);
            
            // Usar sistema TTS híbrido
            await this.speak(sanitizedMessage);
            
            this.logger.info(`✅ Sismo anunciado exitosamente: Mag ${magnitude} en ${seism.location}`);
            this.emit('seism_announced', seism);
            
        } catch (error) {
            this.logger.error('❌ Error anunciando sismo:', error.message);
            this.emit('seism_announce_failed', { seism, error: error.message });
        }
    }
    
    /**
     * Esperar canal libre para transmisión
     */
    async waitForFreeChannel(timeout = 30000) {
        if (!this.audioManager || typeof this.audioManager.isSafeToTransmit !== 'function') {
            this.logger.debug('isSafeToTransmit no disponible, usando delay simple');
            await this.delay(1000);
            return;
        }
        
        const startTime = Date.now();
        
        return new Promise((resolve) => {
            // Verificar inmediatamente
            if (this.audioManager.isSafeToTransmit()) {
                resolve();
                return;
            }
            
            this.logger.debug('📻 Canal ocupado, esperando...');
            
            const checkInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                
                if (this.audioManager.isSafeToTransmit()) {
                    clearInterval(checkInterval);
                    this.logger.debug(`📻 Canal libre después de ${elapsed}ms`);
                    resolve();
                } else if (elapsed > timeout) {
                    clearInterval(checkInterval);
                    this.logger.warn(`⚠️ Timeout esperando canal libre (${timeout}ms)`);
                    resolve(); // Continuar incluso si timeout
                }
            }, 500); // Verificar cada 500ms
        });
    }
    
    /**
     * Comando DTMF *3 - Listar sismos del día
     */
    async execute(command) {
        this.logger.info(`Comando DTMF ejecutado: ${command}`);
        
        try {
            // Tono de confirmación
            await this.audioManager.playTone(800, 200, 0.6);
            await delay(300);
            
            if (this.todaySeisms.length === 0) {
                const message = 'No se han detectado sismos significativos en Mendoza ni Chile el día de hoy.';
                await this.speak(message);
                return;
            }

            // Construir lista de sismos del día
            let message = `Se han detectado ${this.todaySeisms.length} sismos significativos en la región hoy. `;
            
            for (let i = 0; i < Math.min(this.todaySeisms.length, 5); i++) { // Máximo 5 sismos
                const seism = this.todaySeisms[i];
                const magnitude = seism.magnitude.toFixed(1);
                
                message += `Sismo ${i + 1}: Magnitud ${magnitude}, `;
                message += `hora ${seism.time}, `;
                message += `zona ${seism.location}. `;
            }
            
            if (this.todaySeisms.length > 5) {
                message += `Y ${this.todaySeisms.length - 5} sismos adicionales.`;
            }
            
            const sanitizedMessage = sanitizeTextForTTS(message);
            await this.speak(sanitizedMessage);
            
        } catch (error) {
            this.logger.error('Error ejecutando comando *3:', error.message);
            await this.speak('Error consultando sismos del día.');
        }
    }
    
    /**
     * TTS usando sistema híbrido (Google TTS + espeak fallback)
     */
    async speakWithHybridVoice(text, options = {}) {
        try {
            // Generar audio con sistema híbrido (Google TTS -> espeak fallback)
            const audioFile = await this.voiceManager.generateSpeech(text, options);
            
            // Reproducir usando HybridVoiceManager (con lógica simplex)
            await this.voiceManager.playAudio(audioFile);
            
            // Ejecutar roger beep después de la reproducción
            if (this.audioManager.rogerBeep && this.audioManager.rogerBeep.enabled) {
                await this.audioManager.rogerBeep.executeAfterTransmission();
            }
            
            // Limpiar archivo temporal después de un tiempo
            setTimeout(() => {
                try {
                    if (fs.existsSync(audioFile)) {
                        fs.unlinkSync(audioFile);
                    }
                } catch (error) {
                    this.logger.warn('Error eliminando archivo temporal:', error.message);
                }
            }, 30000); // 30 segundos
            
        } catch (error) {
            this.logger.error('Error en speakWithHybridVoice:', error.message);
            // Fallback de emergencia usando audioManager original
            await this.audioManager.speak(text, options);
        }
    }

    /**
     * Reproducir archivo de audio usando paplay
     */
    async playAudioFile(audioFile) {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(audioFile)) {
                reject(new Error('Archivo de audio no existe'));
                return;
            }

            this.logger.debug(`Reproduciendo archivo: ${path.basename(audioFile)}`);
            
            const paplay = spawn('paplay', [audioFile]);
            
            paplay.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`paplay falló con código: ${code}`));
                }
            });
            
            paplay.on('error', (error) => {
                reject(new Error(`Error ejecutando paplay: ${error.message}`));
            });
        });
    }

    /**
     * Función auxiliar para TTS
     */
    async speak(message) {
        const mensajeLimpio = sanitizeTextForTTS(message);
        await this.speakWithHybridVoice(mensajeLimpio);
    }
    
    /**
     * Obtener sismos del día actual
     */
    getTodaySeisms() {
        return this.todaySeisms.map(seism => ({
            ...seism,
            zone: this.getZoneName(seism.latitude, seism.longitude)
        }));
    }

    /**
     * Obtener estado del módulo con información detallada
     */
    getStatus() {
        const now = new Date();
        const cacheAge = this.cache.timestamp ? 
            Math.round((now.getTime() - this.cache.timestamp) / 60000) : null;
        
        return {
            enabled: this.config.enabled,
            state: this.state,
            running: this.state === MODULE_STATES.ACTIVE,
            checkInterval: this.config.checkInterval,
            checkIntervalMinutes: Math.round(this.config.checkInterval / 60000),
            lastCheck: this.lastCheck ? this.lastCheck.toLocaleString('es-AR') : 'Nunca',
            lastCheckTimestamp: this.lastCheck,
            detectedSeisms: this.detectedSeisms.size,
            todaySeisms: this.todaySeisms.length,
            announcedSeisms: this.announcedSeisms.size,
            magnitudeThreshold: this.config.magnitudeThreshold,
            announceStates: this.config.announceStates,
            nextCheck: this.checkTimer && this.lastCheck ? 
                new Date(this.lastCheck.getTime() + this.config.checkInterval).toLocaleTimeString('es-AR') : 
                'Calculando...',
            cache: {
                valid: cacheAge !== null && cacheAge < (this.config.cacheDuration / 60000),
                ageMinutes: cacheAge,
                maxAgeMinutes: Math.round(this.config.cacheMaxAge / 60000)
            },
            connection: {
                status: this.state === MODULE_STATES.ACTIVE ? 'Conectado' : 
                       this.state === MODULE_STATES.ERROR ? 'Error' : 'Desconectado',
                userAgent: this.config.userAgent,
                timeout: 20000
            },
            seismsList: this.getTodaySeisms()
        };
    }
    
    /**
     * Destructor
     */
    destroy() {
        this.stop();
        this.state = MODULE_STATES.DISABLED;
        this.removeAllListeners();
        this.logger.info('Módulo INPRES destruido');
    }
}

module.exports = InpresSismic;