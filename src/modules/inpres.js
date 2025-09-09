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
            this.logger.info(`🎯 Filtros: Magnitud >${this.config.magnitudeThreshold}, Estados: ${this.config.announceStates.join(', ')}`);
            
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
     * Verificar sismos desde INPRES con manejo de errores mejorado
     */
    async checkSeisms() {
        const maxRetries = 3;
        const retryDelay = 2000; // 2 segundos
        let lastError = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this.logger.debug(`Verificando sismos desde INPRES... (intento ${attempt}/${maxRetries})`);
                
                // Verificar cache
                const now = Date.now();
                if (this.cache.data && (now - this.cache.timestamp) < this.config.cacheDuration) {
                    this.logger.debug('Usando datos desde cache');
                    return this.cache.data;
                }
                
                // Hacer request a INPRES con timeout y headers mejorados
                const response = await axios.get(this.config.inpresUrl, {
                    headers: {
                        'User-Agent': this.config.userAgent,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'es-AR,es;q=0.8,en;q=0.5',
                        'Accept-Encoding': 'gzip, deflate',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1'
                    },
                    timeout: 20000, // Aumentado a 20 segundos
                    maxRedirects: 3,
                    validateStatus: (status) => status >= 200 && status < 500
                });
                
                // Verificar respuesta válida
                if (!response.data || typeof response.data !== 'string') {
                    throw new Error(`Respuesta inválida del servidor INPRES (${typeof response.data})`);
                }
                
                if (response.status !== 200) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                // Verificar que contiene datos sísmicos
                if (!response.data.includes('sismos') && !response.data.includes('Magnitud')) {
                    throw new Error('La respuesta no contiene tabla de sismos esperada');
                }
                
                // Parsear HTML
                const seisms = this.parseSeismsFromHTML(response.data);
                
                // Actualizar cache solo si se obtuvieron datos válidos
                this.cache = {
                    data: seisms,
                    timestamp: now
                };
                
                // Procesar sismos nuevos
                await this.processNewSeisms(seisms);
                
                this.lastCheck = new Date();
                this.logger.info(`✅ Sismos verificados: ${seisms.length} encontrados, ${this.todaySeisms.length} de hoy`);
                
                // Si llegamos aquí, el intento fue exitoso
                if (this.state === MODULE_STATES.ERROR) {
                    this.state = MODULE_STATES.ACTIVE;
                    this.logger.info('Módulo INPRES recuperado de estado de error');
                }
                
                return seisms;
                
            } catch (error) {
                lastError = error;
                const errorType = error.code || error.name || 'Unknown';
                this.logger.warn(`❌ Intento ${attempt}/${maxRetries} fallido [${errorType}]: ${error.message}`);
                
                // Si es el último intento, cambiar estado a ERROR
                if (attempt === maxRetries) {
                    this.state = MODULE_STATES.ERROR;
                    this.logger.error(`🔥 Error crítico en INPRES después de ${maxRetries} intentos`);
                }
                
                // Esperar antes del siguiente intento (excepto el último)
                if (attempt < maxRetries) {
                    await this.delay(retryDelay * attempt); // Backoff exponencial
                }
            }
        }
        
        // Si llegamos aquí, todos los intentos fallaron
        // Intentar usar cache expirado si está disponible y no muy antiguo
        if (this.cache.data) {
            const age = Date.now() - this.cache.timestamp;
            const ageMinutes = Math.round(age / 60000);
            
            // Solo usar cache si no es demasiado antiguo (máximo 1 hora)
            if (age < this.config.cacheMaxAge) {
                this.logger.warn(`⚠️ Usando cache expirado (${ageMinutes} minutos de antigüedad)`);
                return this.cache.data;
            } else {
                this.logger.error(`🚫 Cache demasiado antiguo (${ageMinutes} minutos), descartando`);
            }
        }
        
        // Sin cache disponible, lanzar error
        throw new Error(`INPRES no disponible después de ${maxRetries} intentos: ${lastError.message}`);
    }
    
    /**
     * Función auxiliar para delay
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Parsear sismos desde HTML de INPRES con detección mejorada
     */
    parseSeismsFromHTML(html) {
        const $ = cheerio.load(html);
        const seisms = [];
        
        try {
            this.logger.debug('Iniciando parsing de HTML de INPRES...');
            
            // Buscar la tabla específica de sismos con ID "sismos"
            let seismicTable = $('#sismos');
            
            if (seismicTable.length === 0) {
                // Fallback: buscar tabla que contenga headers de sismos
                seismicTable = $('table:contains("Magnitud"), table:contains("Profundidad"), table:contains("Fecha")').first();
            }
            
            if (seismicTable.length === 0) {
                // Último fallback: buscar cualquier tabla con datos numéricos que parezcan sísmicos
                seismicTable = $('table').filter((_, table) => {
                    const text = $(table).text();
                    return text.includes('Magnitud') || 
                           text.includes('Profundidad') || 
                           (text.match(/\d+\.\d+/g) && text.match(/\d{2}\/\d{2}\/\d{4}/));
                }).first();
            }
            
            if (seismicTable.length === 0) {
                this.logger.warn('❌ No se encontró tabla de sismos en INPRES');
                return seisms;
            }
            
            this.logger.debug(`✅ Tabla de sismos encontrada`);
            
            // Buscar filas con datos sísmicos (excluyendo header)
            const rows = seismicTable.find('tr').filter((index, row) => {
                const rowText = $(row).text().trim();
                // Filtrar filas que contienen datos numéricos (no headers)
                return rowText.match(/\d+\.\d+/) && 
                       !rowText.toLowerCase().includes('magnitud') && 
                       !rowText.toLowerCase().includes('profundidad') &&
                       rowText.length > 20; // Evitar filas vacías
            });
            
            this.logger.debug(`Procesando ${rows.length} filas de datos sísmicos`);
            
            // Parsear cada fila de datos
            rows.each((index, element) => {
                try {
                    const row = $(element);
                    const seismData = this.extractSeismicDataImproved(row);
                    
                    if (seismData && this.isValidSeism(seismData)) {
                        seisms.push(seismData);
                        this.logger.debug(`✅ Sismo válido: Mag ${seismData.magnitude} - ${seismData.location}`);
                    } else if (seismData) {
                        this.logger.debug(`❌ Sismo filtrado: Mag ${seismData.magnitude || 'N/A'} - ${seismData.location || 'N/A'}`);
                    }
                    
                } catch (error) {
                    this.logger.debug(`⚠️ Error parseando fila ${index}:`, error.message);
                }
            });
            
            this.logger.info(`📊 Parsing completado: ${seisms.length} sismos válidos de ${rows.length} filas procesadas`);
            return seisms;
            
        } catch (error) {
            this.logger.error('🔥 Error crítico parseando HTML de INPRES:', error.message);
            return seisms;
        }
    }
    
    /**
     * Extraer datos sísmicos mejorado para estructura INPRES actual
     * Formato esperado: N°, Fecha, Hora, Profundidad, Magnitud, Latitud, Longitud, Provincia
     */
    extractSeismicDataImproved(row) {
        try {
            const cells = row.find('td');
            if (cells.length < 7) {
                return null; // No suficientes columnas
            }
            
            // Extraer datos de cada celda
            const cellData = [];
            cells.each((_, cell) => {
                const text = $(cell).text().trim();
                cellData.push(text);
            });
            
            // Mapear según estructura esperada de INPRES
            // [N°, Fecha, Hora, Profundidad, Magnitud, Latitud, Longitud, Provincia]
            const [
                numero,
                fecha,
                hora, 
                profundidad,
                magnitud,
                latitud,
                longitud,
                provincia
            ] = cellData;
            
            // Validar campos críticos
            const mag = parseFloat(magnitud);
            const depth = parseFloat(profundidad);
            const lat = parseFloat(latitud);
            const lon = parseFloat(longitud);
            
            if (isNaN(mag) || !fecha || !provincia) {
                return null;
            }
            
            // Determinar color/estado del sismo
            const color = this.getSeismColorFromRow(row);
            
            // Crear ID único más robusto
            const dateStr = fecha.replace(/[^\d]/g, '');
            const timeStr = (hora || '000000').replace(/[^\d]/g, '');
            const id = `${dateStr}_${timeStr}_${mag.toString().replace('.', '')}`;
            
            // Determinar zona dentro de Mendoza
            const zone = this.determineZone(lat, lon);
            
            const seismData = {
                id,
                date: fecha,
                time: hora || '00:00:00',
                magnitude: mag,
                depth: isNaN(depth) ? null : depth,
                latitude: isNaN(lat) ? null : lat,
                longitude: isNaN(lon) ? null : lon,
                province: provincia || 'Desconocida',
                location: zone,
                color: color,
                state: this.getSeismState(color),
                rawData: cellData.join(' | '), // Para debugging
                timestamp: new Date(),
                numero: numero || null
            };
            
            return seismData;
            
        } catch (error) {
            this.logger.debug('Error extrayendo datos sísmicos mejorado:', error.message);
            return null;
        }
    }
    
    /**
     * Obtener color del sismo desde la fila HTML (mejorado)
     */
    getSeismColorFromRow(row) {
        try {
            const rowHtml = row.html().toLowerCase();
            const rowText = row.text().toLowerCase();
            
            // Buscar indicadores de color en HTML y texto
            if (rowHtml.includes('color:blue') || rowHtml.includes('color: blue') ||
                rowHtml.includes('#0000ff') || rowHtml.includes('blue') ||
                rowText.includes('azul')) {
                return 'azul';
            }
            
            if (rowHtml.includes('color:red') || rowHtml.includes('color: red') ||
                rowHtml.includes('#ff0000') || rowHtml.includes('red') ||
                rowText.includes('rojo')) {
                return 'rojo';
            }
            
            if (rowHtml.includes('color:black') || rowHtml.includes('color: black') ||
                rowHtml.includes('#000000') || rowHtml.includes('black') ||
                rowText.includes('negro')) {
                return 'negro';
            }
            
            // Buscar por clases CSS específicas
            if (row.hasClass('preliminary') || row.hasClass('blue')) {
                return 'azul';
            }
            if (row.hasClass('reviewed') || row.hasClass('black')) {
                return 'negro';
            }
            if (row.hasClass('felt') || row.hasClass('red')) {
                return 'rojo';
            }
            
            // Por defecto, asumir preliminar (azul)
            return 'azul';
            
        } catch (error) {
            this.logger.debug('Error detectando color del sismo:', error.message);
            return 'azul';
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
            let message = 'Atención. Nuevo sismo detectado por INPRES. ';
            message += `Estado: ${state}. `;
            message += `Magnitud ${magnitude}. `;
            message += `Profundidad ${depth}. `;
            message += `Ubicación ${seism.location}. `;
            
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