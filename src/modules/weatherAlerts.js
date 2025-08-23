const EventEmitter = require('events');
const axios = require('axios');
const xml2js = require('xml2js');
const { delay, sanitizeTextForTTS } = require('../utils');
const { createLogger } = require('../logging/Logger');
const { MODULE_STATES } = require('../constants');
const HybridVoiceManager = require('../audio/HybridVoiceManager');

/**
 * Módulo de Alertas Meteorológicas SMN Argentina
 * Funcionalidades:
 * - Monitoreo automático cada 1.5h de alertas SMN
 * - Filtrado por región de Mendoza
 * - Anuncios automáticos con Google TTS
 * - Integración con APRS comment dinámico
 * - Comando DTMF *7 para consulta manual
 */
class WeatherAlerts extends EventEmitter {
    constructor(audioManager, aprsModule = null, weatherModule = null) {
        super();
        this.audioManager = audioManager;
        this.aprsModule = aprsModule;
        this.weatherModule = weatherModule;
        this.logger = createLogger('[WeatherAlerts]');
        this.state = MODULE_STATES.IDLE;
        
        this.config = {
            enabled: true,
            // Feeds SMN Argentina
            mainFeedUrl: 'https://ssl.smn.gob.ar/CAP/AR.php',
            shortTermFeedUrl: 'https://ssl.smn.gob.ar/feeds/avisocorto_GeoRSS.xml',
            
            // Coordenadas de Mendoza para filtrado geográfico - Cobertura completa provincial
            mendozaRegion: {
                // Límites completos de la provincia de Mendoza:
                // Latitud: 32°00' a 37°35' Sur
                // Longitud: 66°30' a 70°35' Oeste
                bounds: {
                    north: -32.0,    // 32° Sur (límite norte)
                    south: -37.6,    // 37°35' Sur (límite sur) 
                    west: -70.6,     // 70°35' Oeste (límite oeste)
                    east: -66.5      // 66°30' Oeste (límite este)
                },
                // Centro geográfico aproximado de la provincia
                center: { lat: -34.8, lon: -68.5 },
                // Radio de seguridad (no usado con bounds, pero mantenido para compatibilidad)
                radius: 200 // km de radio de cobertura total
            },
            
            // Timers
            checkInterval: 87 * 60 * 1000,      // 1h 27min (evita múltiples colisiones)  
            repeatInterval: 101 * 60 * 1000,    // 1h 41min (evita colisión con baliza)
            weatherUpdateInterval: 17 * 60 * 1000, // 17 minutos (evita solapamiento exacto con APRS)
            
            // TTS
            useGoogleTTS: true,
            fallbackTTS: 'espeak',
            
            // Cache
            cacheDuration: 15 * 60 * 1000, // 15 minutos
        };
        
        // Estado de alertas
        this.activeAlerts = new Map();
        this.lastAnnouncedAlerts = new Set();
        this.lastCheck = null;
        this.checkTimer = null;
        this.repeatTimer = null;
        this.weatherUpdateTimer = null;
        
        // Cache
        this.feedCache = {
            data: null,
            timestamp: 0
        };
        
        // XML Parser
        this.xmlParser = new xml2js.Parser({
            explicitArray: false,
            mergeAttrs: true
        });
        
        // Voice Manager para Google TTS
        this.voiceManager = null;
        if (this.config.useGoogleTTS) {
            try {
                this.voiceManager = new HybridVoiceManager(this.audioManager);
                this.logger.info('Google TTS habilitado para alertas');
            } catch (error) {
                this.logger.warn('Google TTS no disponible, usando fallback:', error.message);
            }
        }
    }
    
    /**
     * Iniciar monitoreo automático de alertas
     */
    async start() {
        if (this.state === MODULE_STATES.ACTIVE) {
            this.logger.warn('Monitoreo ya está activo');
            return;
        }
        
        this.state = MODULE_STATES.ACTIVE;
        
        // Primera verificación inmediata
        await this.checkForAlerts();
        
        // Primera actualización de clima APRS inmediata
        await this.updateAPRSComment();
        
        // Configurar timers automáticos
        this.scheduleNextCheck();
        this.scheduleWeatherUpdates();
        
        this.logger.info(`Monitoreo de alertas iniciado - cada ${this.config.checkInterval / 60000} minutos`);
        this.logger.info(`Actualización clima APRS - cada ${this.config.weatherUpdateInterval / 60000} minutos`);
        this.emit('started');
    }
    
    /**
     * Detener monitoreo
     */
    stop() {
        this.state = MODULE_STATES.DISABLED;
        
        if (this.checkTimer) {
            clearTimeout(this.checkTimer);
            this.checkTimer = null;
        }
        
        if (this.repeatTimer) {
            clearTimeout(this.repeatTimer);
            this.repeatTimer = null;
        }
        
        if (this.weatherUpdateTimer) {
            clearTimeout(this.weatherUpdateTimer);
            this.weatherUpdateTimer = null;
        }
        
        this.logger.info('Monitoreo de alertas detenido');
        this.emit('stopped');
    }
    
    /**
     * Verificar alertas meteorológicas
     */
    async checkForAlerts() {
        if (!this.config.enabled) {
            return;
        }
        
        try {
            this.logger.info('Verificando alertas SMN Argentina...');
            
            const feedData = await this.fetchAlertsFeed();
            if (!feedData || !feedData.rss || !feedData.rss.channel) {
                this.logger.warn('Feed RSS vacío o inválido');
                return;
            }
            
            const alerts = this.parseAlerts(feedData.rss.channel);
            const mendozaAlerts = await this.filterMendozaAlerts(alerts);
            
            this.logger.info(`Alertas encontradas: ${alerts.length}, para Mendoza: ${mendozaAlerts.length}`);
      
            // Procesar nuevas alertas
            const newAlerts = this.processNewAlerts(mendozaAlerts);
            
            if (newAlerts.length > 0) {
                this.logger.info(`${newAlerts.length} nueva(s) alerta(s) para Mendoza`);
                await this.announceNewAlerts(newAlerts);
                await this.updateAPRSComment();
                this.scheduleRepeatAnnouncements();
            }
            
            // Limpiar alertas expiradas
            this.cleanExpiredAlerts();
            this.lastCheck = Date.now();
            
            this.logger.info('Verificación de alertas completada exitosamente');
            
        } catch (error) {
            this.logger.error('Error verificando alertas:', error.message);
            this.state = MODULE_STATES.ERROR;
        } finally {
            this.scheduleNextCheck();
        }
    }
    
    /**
     * Obtener feed RSS de SMN
     */
    async fetchAlertsFeed() {
        // Verificar cache
        if (this.isCacheValid()) {
            this.logger.debug('Usando feed desde cache');
            return this.feedCache.data;
        }
        
        try {
            const response = await axios.get(this.config.mainFeedUrl, {
                timeout: 30000, // Aumentar timeout a 30 segundos
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; U; Android 4.0.3; ko-kr; LG-L160L Build/IML74K) AppleWebkit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30'
                }
            });
            
            const xmlData = await this.xmlParser.parseStringPromise(response.data);
            
            // Guardar en cache
            this.feedCache = {
                data: xmlData,
                timestamp: Date.now()
            };
            
            return xmlData;
            
        } catch (error) {
            this.logger.error('Error obteniendo feed SMN:', error.message);
            throw error;
        }
    }
    
    /**
     * Parsear alertas del RSS
     */
    parseAlerts(channel) {
        if (!channel.item) {
            return [];
        }
        
        const items = Array.isArray(channel.item) ? channel.item : [channel.item];
        
        return items.map(item => ({
            title: item.title || 'Alerta Meteorológica',
            description: item.description ? 
                item.description.replace(/<!\[CDATA\[|\]\]>/g, '').trim() : 
                'Sin descripción disponible',
            link: item.link,
            category: item.category || 'Met',
            pubDate: new Date(channel.pubDate || Date.now()),
            id: this.generateAlertId(item)
        }));
    }
    
    /**
     * Filtrar alertas por región de Mendoza
     */
    async filterMendozaAlerts(alerts) {
        const mendozaAlerts = [];
        
        for (const alert of alerts) {
            try {
                // Si hay un link específico, obtener detalles CAP
                if (alert.link && alert.link.includes('.xml')) {
                    const capData = await this.fetchCAPDetails(alert.link);
                    if (capData && this.isAlertForMendoza(capData)) {
                        alert.severity = capData.severity;
                        alert.expires = capData.expires;
                        alert.polygons = capData.polygons;
                        alert.instructions = capData.instructions;
                        mendozaAlerts.push(alert);
                    }
                } else {
                    // Filtro simple por texto si no hay coordenadas específicas
                    if (this.alertMentionsMendoza(alert)) {
                        mendozaAlerts.push(alert);
                    }
                }
            } catch (error) {
                this.logger.debug(`Error procesando alerta ${alert.id}:`, error.message);
            }
        }
        
        return mendozaAlerts;
    }
    
    /**
     * Obtener detalles CAP de una alerta específica
     */
    async fetchCAPDetails(capUrl) {
        try {
            const response = await axios.get(capUrl, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; U; Android 4.0.3; ko-kr; LG-L160L Build/IML74K) AppleWebkit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30'
                }
            });
            
            const capData = await this.xmlParser.parseStringPromise(response.data);
            
            if (capData.alert && capData.alert.info) {
                const info = Array.isArray(capData.alert.info) ? capData.alert.info[0] : capData.alert.info;
                
                // Extraer todos los polígonos de todas las áreas
                let polygons = [];
                if (info.area) {
                    const areas = Array.isArray(info.area) ? info.area : [info.area];
                    polygons = areas.map(area => area.polygon).filter(Boolean);
                }
                
                return {
                    severity: info.severity,
                    expires: info.expires,
                    polygons: polygons, // Array de polígonos en lugar de uno solo
                    instructions: info.instruction
                };
            }
            
        } catch (error) {
            this.logger.debug('Error obteniendo detalles CAP:', error.message);
        }
        
        return null;
    }
    
    /**
     * Verificar si una alerta CAP afecta a Mendoza por coordenadas
     */
    isAlertForMendoza(capData) {
        if (!capData.polygons || capData.polygons.length === 0) {
            return false;
        }
        
        try {
            // Verificar cada polígono - si cualquiera intersecta con Mendoza, la alerta aplica
            for (const polygon of capData.polygons) {
                if (!polygon) continue;
                
                // Parse polygon coordinates
                const coords = polygon.split(' ').map(coord => {
                    const [lat, lon] = coord.split(',').map(parseFloat);
                    return { lat, lon };
                });
                
                // Si este polígono intersecta con Mendoza, la alerta aplica
                if (this.polygonIntersectsMendoza(coords)) {
                    return true;
                }
            }
            
            return false;
            
        } catch (error) {
            this.logger.debug('Error verificando polígonos:', error.message);
            return false;
        }
    }
    
    /**
     * Verificar si un polígono intersecta con los límites de Mendoza
     */
    polygonIntersectsMendoza(coords) {
        const bounds = this.config.mendozaRegion.bounds;
        
        // Verificar si algún punto del polígono está dentro de los límites de Mendoza
        for (const coord of coords) {
            if (coord.lat >= bounds.south && coord.lat <= bounds.north &&
                coord.lon >= bounds.west && coord.lon <= bounds.east) {
                return true;
            }
        }
        
        // Verificar si el polígono contiene alguna esquina de Mendoza
        const mendozaCorners = [
            { lat: bounds.north, lon: bounds.west },
            { lat: bounds.north, lon: bounds.east },
            { lat: bounds.south, lon: bounds.west },
            { lat: bounds.south, lon: bounds.east }
        ];
        
        for (const corner of mendozaCorners) {
            if (this.pointInPolygon(corner, coords)) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Verificar si un punto está dentro de un polígono (algoritmo ray-casting)
     */
    pointInPolygon(point, polygon) {
        const x = point.lon;
        const y = point.lat;
        let inside = false;
        
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            if (((polygon[i].lat > y) !== (polygon[j].lat > y)) &&
                (x < (polygon[j].lon - polygon[i].lon) * (y - polygon[i].lat) / (polygon[j].lat - polygon[i].lat) + polygon[i].lon)) {
                inside = !inside;
            }
        }
        
        return inside;
    }
    
    /**
     * Filtro simple por mención de Mendoza en el texto
     */
    alertMentionsMendoza(alert) {
        const text = `${alert.title} ${alert.description}`.toLowerCase();
        const mendozaKeywords = [
            // Términos específicos de Mendoza
            'mendoza', 'cuyo', 'precordillera', 'cordillera mendocina',
            'alta montaña mendoza', 'valle de uco', 'región cuyo',
            // Términos geográficos generales que afectan Mendoza
            'viento zonda', 'cordillera', 'alta montaña', 'montaña',
            // Departamentos principales de Mendoza
            'godoy cruz', 'las heras', 'luján de cuyo', 'maipú',
            'guaymallén', 'san rafael', 'general alvear', 'malargüe',
            'tunuyán', 'tupungato', 'san martín', 'rivadavia',
            'junín', 'santa rosa', 'la paz', 'lavalle'
        ];
        
        return mendozaKeywords.some(keyword => text.includes(keyword));
    }
    
    /**
     * Procesar nuevas alertas
     */
    processNewAlerts(alerts) {
        const newAlerts = [];
        
        for (const alert of alerts) {
            if (!this.activeAlerts.has(alert.id)) {
                this.activeAlerts.set(alert.id, {
                    ...alert,
                    firstSeen: Date.now(),
                    announced: false
                });
                newAlerts.push(alert);
            }
        }
        
        return newAlerts;
    }
    
    /**
     * Anunciar nuevas alertas por TTS
     */
    async announceNewAlerts(alerts) {
        if (alerts.length === 0) return;
        
        try {
            // Esperar canal libre
            await this.waitForFreeChannel();
            
            // Tono de alerta
            await this.audioManager.playTone(800, 300, 0.8);
            await delay(200);
            await this.audioManager.playTone(1000, 300, 0.8);
            await delay(500);
            
            // Construir mensaje
            const message = this.buildAlertMessage(alerts);
            const cleanMessage = sanitizeTextForTTS(message);
            
            this.logger.info(`Anunciando alertas: ${cleanMessage.substring(0, 50)}...`);
            
            // Usar Google TTS si está disponible (con soporte para textos largos)
            if (this.voiceManager) {
                const audioFile = await this.voiceManager.generateLongSpeech(cleanMessage);
                await this.voiceManager.playAudio(audioFile);
            } else {
                await this.audioManager.speak(cleanMessage, { voice: 'es+f3' });
            }
            
            // Marcar como anunciadas
            alerts.forEach(alert => {
                this.lastAnnouncedAlerts.add(alert.id);
                if (this.activeAlerts.has(alert.id)) {
                    this.activeAlerts.get(alert.id).announced = true;
                }
            });
            
        } catch (error) {
            this.logger.error('Error anunciando alertas:', error.message);
        }
    }
    
    /**
     * Construir mensaje de alerta para TTS
     */
    buildAlertMessage(alerts) {
        if (alerts.length === 1) {
            const alert = alerts[0];
            return `Nueva alerta meteorológica para Mendoza. ${alert.title}. ${alert.description}`;
        } else {
            // Para múltiples alertas, leer cada una con su descripción
            let message = `Nuevas alertas meteorológicas para Mendoza. Se han emitido ${alerts.length} alertas. `;
            
            alerts.forEach((alert, index) => {
                message += `Alerta ${index + 1}: ${alert.title}. ${alert.description}. `;
            });
            
            return message;
        }
    }
    
    /**
     * Actualizar comment de APRS con clima actual y alertas activas
     */
    async updateAPRSComment() {
        if (!this.aprsModule) return;
        
        const alertComment = this.getActiveAlertComment();
        const weatherComment = await this.getCurrentWeatherComment();
        const baseComment = 'VX200 RPT';
        
        // Construir comment: Base + Clima + Alertas (máximo 43 caracteres APRS)
        let fullComment = baseComment;
        
        if (weatherComment) {
            fullComment += ` ${weatherComment}`;
        }
        
        if (alertComment) {
            const spaceLeft = 43 - fullComment.length;
            if (spaceLeft > alertComment.length + 1) {
                fullComment += ` ${alertComment}`;
            } else {
                // Priorizar alertas si no hay espacio suficiente
                fullComment = `${baseComment} ${alertComment}`;
            }
        }
        
        try {
            this.aprsModule.config.beacon.comment = fullComment;
            this.logger.debug(`APRS comment actualizado: "${fullComment}"`);
        } catch (error) {
            this.logger.error('Error actualizando APRS comment:', error.message);
        }
    }
    
    /**
     * Obtener comment de clima actual para APRS
     */
    async getCurrentWeatherComment() {
        if (!this.weatherModule) return null;
        
        try {
            // Obtener clima actual para Mendoza
            const mendozaCity = {
                name: 'Mendoza',
                lat: -32.89,
                lon: -68.84
            };
            
            const weatherData = await this.weatherModule.getCurrentWeatherForCity(mendozaCity);
            
            // Formato compacto para APRS: T:23°C H:65% V:15km/h
            const temp = Math.round(weatherData.temperature);
            const humidity = Math.round(weatherData.humidity);
            const windSpeed = Math.round(weatherData.wind_speed);
            
            return `${temp}C ${humidity}% ${windSpeed}km/h`;
            
        } catch (error) {
            this.logger.debug('Error obteniendo clima para APRS:', error.message);
            return null;
        }
    }
    
    /**
     * Generar comment corto para APRS (máximo 43 caracteres)
     */
    getActiveAlertComment() {
        if (this.activeAlerts.size === 0) return null;
        
        const alerts = Array.from(this.activeAlerts.values());
        const types = [...new Set(alerts.map(a => a.title.toUpperCase()))];
        
        if (types.length === 1) {
            const type = types[0];
            if (type.includes('LLUVIA')) return '[LLUVIA]';
            if (type.includes('VIENTO')) return '[VIENTO]';
            if (type.includes('TORMENTA')) return '[TORMENTA]';
            if (type.includes('GRANIZO')) return '[GRANIZO]';
            return '[ALERTA MET]';
        } else if (types.length === 2) {
            return '[ALERTAS MET]';
        } else {
            return `[${types.length} ALERTAS]`;
        }
    }
    
    /**
     * Programar próxima verificación
     */
    scheduleNextCheck() {
        if (this.checkTimer) {
            clearTimeout(this.checkTimer);
        }
        
        this.checkTimer = setTimeout(() => {
            this.checkForAlerts();
        }, this.config.checkInterval);
        
        // Guardar la fecha exacta del próximo check
        this.nextCheckTime = new Date(Date.now() + this.config.checkInterval);
        this.logger.debug(`Próxima verificación: ${this.nextCheckTime.toLocaleTimeString('es-AR')}`);
    }
    
    /**
     * Programar repeticiones de anuncios
     */
    scheduleRepeatAnnouncements() {
        if (this.repeatTimer) {
            clearTimeout(this.repeatTimer);
        }
        
        this.repeatTimer = setTimeout(async () => {
            const activeAlerts = Array.from(this.activeAlerts.values());
            if (activeAlerts.length > 0) {
                this.logger.info('Repitiendo anuncios de alertas activas');
                await this.announceNewAlerts(activeAlerts);
                this.scheduleRepeatAnnouncements();
            }
        }, this.config.repeatInterval);
    }
    
    /**
     * Programar actualizaciones periódicas del clima en APRS
     */
    scheduleWeatherUpdates() {
        if (this.weatherUpdateTimer) {
            clearTimeout(this.weatherUpdateTimer);
        }
        
        this.weatherUpdateTimer = setTimeout(async () => {
            try {
                await this.updateAPRSComment();
                this.logger.debug('Clima APRS actualizado automáticamente');
                this.scheduleWeatherUpdates(); // Reprogramar
            } catch (error) {
                this.logger.debug('Error actualizando clima APRS:', error.message);
                this.scheduleWeatherUpdates(); // Reprogramar incluso si falla
            }
        }, this.config.weatherUpdateInterval);
    }
    
    /**
     * Limpiar alertas expiradas
     */
    cleanExpiredAlerts() {
        const now = Date.now();
        const expiredAlerts = [];
        
        for (const [id, alert] of this.activeAlerts) {
            // Considerar expirada si tiene más de 24 horas
            const age = now - alert.firstSeen;
            if (age > 24 * 60 * 60 * 1000) {
                expiredAlerts.push(id);
            }
        }
        
        if (expiredAlerts.length > 0) {
            expiredAlerts.forEach(id => {
                this.activeAlerts.delete(id);
                this.lastAnnouncedAlerts.delete(id);
            });
            
            this.logger.info(`Limpiadas ${expiredAlerts.length} alertas expiradas`);
            // Actualizar comment APRS de forma asíncrona
            this.updateAPRSComment().catch(error => 
                this.logger.debug('Error actualizando APRS comment:', error.message)
            );
        }
    }
    
    /**
     * Comando manual *7 - Consultar alertas activas
     */
    async execute(command) {
        this.logger.info(`Consulta manual de alertas: ${command}`);
        
        if (this.state !== MODULE_STATES.IDLE && this.state !== MODULE_STATES.ACTIVE) {
            this.logger.warn('Módulo no disponible');
            return;
        }
        
        try {
            await this.waitForFreeChannel();
            
            // Si el comando es *0, forzar verificación de alertas
            if (command === '*0') {
                this.logger.info('Forzando verificación manual de alertas SMN...');
                await this.checkForAlerts();
                return;
            }
            
            if (this.activeAlerts.size === 0) {
                await this.audioManager.playTone(600, 200, 0.6);
                await delay(200);
                
                const message = "No hay alertas meteorológicas activas para Mendoza";
                const cleanMessage = sanitizeTextForTTS(message);
                
                if (this.voiceManager) {
                    const audioFile = await this.voiceManager.generateLongSpeech(cleanMessage);
                    await this.voiceManager.playAudio(audioFile);
                } else {
                    await this.audioManager.speak(cleanMessage, { voice: 'es+f3' });
                }
            } else {
                const alerts = Array.from(this.activeAlerts.values());
                await this.announceNewAlerts(alerts);
            }
            
        } catch (error) {
            this.logger.error('Error en consulta manual:', error.message);
        }
    }
    
    /**
     * Utilidades
     */
    generateAlertId(item) {
        const content = `${item.title}-${item.description}-${item.link}`;
        return require('crypto').createHash('md5').update(content).digest('hex').substring(0, 8);
    }
    
    isCacheValid() {
        const age = Date.now() - this.feedCache.timestamp;
        return this.feedCache.data && age < this.config.cacheDuration;
    }
    
    async waitForFreeChannel() {
        // Implementar lógica para esperar canal libre
        // Por ahora, delay simple
        await delay(1000);
    }
    
    /**
     * Obtener estado del módulo
     */
    getStatus() {
        return {
            enabled: this.config.enabled,
            state: this.state,
            activeAlerts: this.activeAlerts.size,
            lastCheck: this.lastCheck ? new Date(this.lastCheck).toISOString() : null,
            nextCheck: this.nextCheckTime ? this.nextCheckTime.toISOString() : null,
            googleTTSAvailable: !!this.voiceManager,
            aprsIntegration: !!this.aprsModule
        };
    }
    
    /**
     * Obtener alertas activas
     */
    getActiveAlerts() {
        return Array.from(this.activeAlerts.values());
    }
    
    /**
     * Configurar módulo
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        if (!this.config.enabled && this.state === MODULE_STATES.ACTIVE) {
            this.stop();
        } else if (this.config.enabled && this.state === MODULE_STATES.DISABLED) {
            this.start();
        }
        
        this.logger.info('Configuración de WeatherAlerts actualizada');
    }
    
    /**
     * Destructor
     */
    destroy() {
        this.stop();
        this.activeAlerts.clear();
        this.lastAnnouncedAlerts.clear();
        this.feedCache = { data: null, timestamp: 0 };
        this.state = MODULE_STATES.DISABLED;
        this.logger.info('Módulo WeatherAlerts destruido');
    }
}

module.exports = WeatherAlerts;