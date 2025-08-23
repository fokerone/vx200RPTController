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
 * - Monitoreo automático cada 20min de sismos INPRES
 * - Detección de sismos > 4.0 magnitud en región Mendoza
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
            
            // URL de INPRES
            inpresUrl: 'https://www.inpres.gob.ar/desktop/',
            
            // Monitoreo cada 20 minutos para respuesta rápida
            checkInterval: 20 * 60 * 1000, // 20 minutos
            
            // Criterios de detección
            magnitudeThreshold: 4.0, // > 4.0 (no igual)
            
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
            
            // Cache
            cacheDuration: 10 * 60 * 1000, // 10 minutos
            
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
     * Iniciar monitoreo automático de sismos
     */
    async start() {
        if (this.state === MODULE_STATES.ACTIVE) {
            this.logger.warn('Módulo INPRES ya está activo');
            return;
        }
        
        try {
            this.state = MODULE_STATES.ACTIVE;
            
            // Verificación inicial
            this.logger.info('Verificando sismos INPRES...');
            await this.checkSeisms();
            
            // Configurar monitoreo automático cada 20 minutos
            this.checkTimer = setInterval(() => {
                this.checkSeisms().catch(error => {
                    this.logger.error('Error en verificación automática:', error.message);
                });
            }, this.config.checkInterval);
            
            this.logger.info(`Monitoreo INPRES iniciado - cada ${this.config.checkInterval / 60000} minutos`);
            this.emit('started', { checkInterval: this.config.checkInterval });
            
        } catch (error) {
            this.state = MODULE_STATES.ERROR;
            this.logger.error('Error iniciando módulo INPRES:', error.message);
            this.emit('error', error);
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
     * Verificar sismos desde INPRES
     */
    async checkSeisms() {
        try {
            this.logger.debug('Verificando sismos desde INPRES...');
            
            // Verificar cache
            const now = Date.now();
            if (this.cache.data && (now - this.cache.timestamp) < this.config.cacheDuration) {
                this.logger.debug('Usando datos desde cache');
                return this.cache.data;
            }
            
            // Hacer request a INPRES
            const response = await axios.get(this.config.inpresUrl, {
                headers: {
                    'User-Agent': this.config.userAgent
                },
                timeout: 15000
            });
            
            // Parsear HTML
            const seisms = this.parseSeismsFromHTML(response.data);
            
            // Actualizar cache
            this.cache = {
                data: seisms,
                timestamp: now
            };
            
            // Procesar sismos nuevos
            await this.processNewSeisms(seisms);
            
            this.lastCheck = new Date();
            this.logger.debug(`${seisms.length} sismos encontrados, ${this.todaySeisms.length} de hoy`);
            
            return seisms;
            
        } catch (error) {
            this.logger.error('Error verificando sismos INPRES:', error.message);
            throw error;
        }
    }
    
    /**
     * Parsear sismos desde HTML de INPRES
     */
    parseSeismsFromHTML(html) {
        const $ = cheerio.load(html);
        const seisms = [];
        
        try {
            // Buscar tabla de sismos (estructura puede variar)
            // Intentar diferentes selectores comunes
            const tableSelectors = [
                'table tr',
                '.seismic-event',
                '[class*="sismo"]',
                'tr:contains("Magnitud")',
                'tr:contains("Profundidad")'
            ];
            
            let rows = null;
            for (const selector of tableSelectors) {
                const found = $(selector);
                if (found.length > 0) {
                    rows = found;
                    this.logger.debug(`Usando selector: ${selector} (${found.length} elementos)`);
                    break;
                }
            }
            
            if (!rows || rows.length === 0) {
                this.logger.warn('No se encontraron filas de sismos en el HTML');
                return seisms;
            }
            
            // Parsear cada fila
            rows.each((index, element) => {
                try {
                    const row = $(element);
                    const text = row.text().trim();
                    
                    // Buscar patrones de datos sísmicos
                    // Formato típico: fecha, hora, profundidad, magnitud, lat, lon, ubicación
                    const seismData = this.extractSeismicData(row, text);
                    
                    if (seismData && this.isValidSeism(seismData)) {
                        seisms.push(seismData);
                    }
                    
                } catch (error) {
                    this.logger.debug(`Error parseando fila ${index}:`, error.message);
                }
            });
            
            this.logger.debug(`Parseados ${seisms.length} sismos válidos`);
            return seisms;
            
        } catch (error) {
            this.logger.error('Error parseando HTML de INPRES:', error.message);
            return seisms;
        }
    }
    
    /**
     * Extraer datos sísmicos de una fila
     */
    extractSeismicData(row, text) {
        try {
            // Obtener color/estado del sismo
            const color = this.getSeismColor(row);
            
            // Buscar patrones de datos con regex
            const patterns = {
                // Fecha: DD/MM/YYYY o YYYY-MM-DD
                date: /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/,
                // Hora: HH:MM:SS
                time: /(\d{1,2}:\d{2}:\d{2})/,
                // Magnitud: número con decimales
                magnitude: /(?:Mag|Magnitud|M)\s*[:=]?\s*(\d+\.?\d*)/i,
                // Profundidad: número + km
                depth: /(?:Prof|Profundidad|Depth)\s*[:=]?\s*(\d+\.?\d*)\s*km/i,
                // Coordenadas
                latitude: /(?:Lat|Latitud)\s*[:=]?\s*(-?\d+\.?\d*)/i,
                longitude: /(?:Lon|Longitud)\s*[:=]?\s*(-?\d+\.?\d*)/i
            };
            
            const extracted = {};
            
            // Extraer cada campo
            for (const [field, pattern] of Object.entries(patterns)) {
                const match = text.match(pattern);
                if (match) {
                    extracted[field] = match[1];
                }
            }
            
            // Buscar ubicación/provincia
            const locationMatch = text.match(/(?:Mendoza|San Juan|La Rioja|San Luis|Neuquén|Buenos Aires)/i);
            if (locationMatch) {
                extracted.province = locationMatch[0];
            }
            
            // Validar datos mínimos
            if (!extracted.magnitude || !extracted.date) {
                return null;
            }
            
            // Crear ID único
            const id = `${extracted.date}_${extracted.time}_${extracted.magnitude}`.replace(/[^\w]/g, '_');
            
            return {
                id,
                date: extracted.date,
                time: extracted.time || '00:00:00',
                magnitude: parseFloat(extracted.magnitude),
                depth: extracted.depth ? parseFloat(extracted.depth) : null,
                latitude: extracted.latitude ? parseFloat(extracted.latitude) : null,
                longitude: extracted.longitude ? parseFloat(extracted.longitude) : null,
                province: extracted.province || 'Desconocida',
                location: this.determineZone(extracted.latitude, extracted.longitude),
                color: color,
                state: this.getSeismState(color),
                rawText: text.substring(0, 200), // Para debugging
                timestamp: new Date()
            };
            
        } catch (error) {
            this.logger.debug('Error extrayendo datos sísmicos:', error.message);
            return null;
        }
    }
    
    /**
     * Obtener color/estado del sismo desde el HTML
     */
    getSeismColor(row) {
        try {
            // Buscar indicadores de color
            const html = row.html();
            
            if (html.includes('color: blue') || html.includes('blue') || row.hasClass('preliminary')) {
                return 'azul';
            } else if (html.includes('color: red') || html.includes('red') || row.hasClass('felt')) {
                return 'rojo';
            } else if (html.includes('color: black') || html.includes('black') || row.hasClass('reviewed')) {
                return 'negro';
            }
            
            // Por defecto, asumir preliminar
            return 'azul';
            
        } catch (error) {
            return 'azul';
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
        if (!lat || !lon) return 'Mendoza';
        
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
     */
    isValidSeism(seism) {
        // Verificar magnitud > 4.0
        if (!seism.magnitude || seism.magnitude <= this.config.magnitudeThreshold) {
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
            // Si no hay coordenadas, verificar por provincia
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
     * Anunciar sismo por TTS
     */
    async announceSeism(seism) {
        try {
            this.logger.info(`Anunciando sismo: Mag ${seism.magnitude} en ${seism.location}`);
            
            // Construir mensaje TTS
            const magnitude = seism.magnitude.toFixed(1);
            const depth = seism.depth ? `${seism.depth} kilómetros` : 'profundidad desconocida';
            const time = seism.time || 'hora desconocida';
            const date = seism.date || 'fecha desconocida';
            
            const message = `Nuevo sismo detectado. ` +
                          `Fecha ${date}, hora ${time}. ` +
                          `Profundidad ${depth}. ` +
                          `Magnitud ${magnitude}. ` +
                          `Zona ${seism.location}.`;
            
            const sanitizedMessage = sanitizeTextForTTS(message);
            
            // Usar Google TTS si está disponible
            if (this.audioManager) {
                await this.audioManager.speak(sanitizedMessage);
            } else {
                // Fallback a TTS del sistema
                await this.audioManager.speak(sanitizedMessage);
            }
            
            this.logger.info(`Sismo anunciado: ${magnitude} en ${seism.location}`);
            this.emit('seism_announced', seism);
            
        } catch (error) {
            this.logger.error('Error anunciando sismo:', error.message);
        }
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
                const message = 'No se han detectado sismos mayores a magnitud 4 en Mendoza el día de hoy.';
                await this.speak(message);
                return;
            }
            
            // Construir lista de sismos del día
            let message = `Se han detectado ${this.todaySeisms.length} sismos mayores a magnitud 4 en Mendoza hoy. `;
            
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
     * Obtener estado del módulo
     */
    getStatus() {
        return {
            enabled: this.config.enabled,
            state: this.state,
            running: this.state === MODULE_STATES.ACTIVE,
            checkInterval: this.config.checkInterval,
            lastCheck: this.lastCheck,
            detectedSeisms: this.detectedSeisms.size,
            todaySeisms: this.todaySeisms.length,
            announcedSeisms: this.announcedSeisms.size,
            magnitudeThreshold: this.config.magnitudeThreshold,
            nextCheck: this.checkTimer ? 
                new Date(Date.now() + this.config.checkInterval).toLocaleTimeString() : 
                'No programado',
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