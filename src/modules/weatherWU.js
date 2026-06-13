const axios = require('axios');
const fs = require('fs');
const { delay, sanitizeTextForTTS } = require('../utils');
const { createLogger } = require('../logging/Logger');
const { MODULE_STATES } = require('../constants');
const HybridVoiceManager = require('../audio/HybridVoiceManager');

class WeatherWU {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.logger = createLogger('[WeatherWU]');
        this.state = MODULE_STATES.IDLE;

        this.config = {
            enabled: true,
            stationId: 'ILASHE13',
            apiKey: '6532d6454b8aa370768e63d6ba5a832e',
            cacheDuration: 600000, // 10 minutos en ms
            apiUrl: 'https://api.weather.com/v2/pws/observations/current'
        };

        // Inicializar sistema hibrido de voz
        this.voiceManager = new HybridVoiceManager(this.audioManager);

        // Cache para evitar llamadas excesivas a la API
        this.cache = {
            data: null,
            timestamp: 0
        };
    }

    /**
     * Ejecutar cuando se recibe comando DTMF
     */
    async execute(command) {
        this.logger.info(`Ejecutado por comando: ${command}`);

        if (!this.config.enabled) {
            this.logger.warn('Modulo deshabilitado');
            return;
        }

        if (this.state !== MODULE_STATES.IDLE) {
            this.logger.warn('Modulo ocupado');
            return;
        }

        try {
            this.state = MODULE_STATES.ACTIVE;
            await this.speakCurrentWeather();
        } catch (error) {
            this.logger.error('Error ejecutando WeatherWU:', error.message);
            this.state = MODULE_STATES.ERROR;
            await this.speakError('Error obteniendo datos de la estacion meteorologica');
        } finally {
            this.state = MODULE_STATES.IDLE;
        }
    }

    /**
     * Obtener datos actuales de la estacion Weather Underground
     */
    async getCurrentWeather() {
        // Verificar cache
        if (this.isCacheValid()) {
            this.logger.debug('Usando datos desde cache');
            return this.cache.data;
        }

        const params = {
            stationId: this.config.stationId,
            format: 'json',
            units: 'm',
            apiKey: this.config.apiKey
        };

        try {
            this.logger.debug(`Consultando estacion ${this.config.stationId}...`);
            const response = await axios.get(this.config.apiUrl, { params, timeout: 10000 });

            const observation = response.data?.observations?.[0];
            if (!observation) {
                throw new Error('Sin datos de observacion disponibles');
            }

            // Guardar en cache
            this.cache = {
                data: observation,
                timestamp: Date.now()
            };

            return observation;
        } catch (error) {
            this.logger.error('Error consultando API Weather Underground:', error.message);
            throw new Error('No se pudo obtener datos de la estacion meteorologica');
        }
    }

    /**
     * Hablar clima actual de la estacion
     */
    async speakCurrentWeather() {
        const data = await this.getCurrentWeather();
        const metric = data.metric;

        const temperatura = Math.round(metric.temp);
        const sensacion = Math.round(
            metric.heatIndex !== null ? metric.heatIndex : metric.windChill !== null ? metric.windChill : metric.temp
        );
        const humedad = data.humidity;
        const viento = Math.round(metric.windSpeed);
        const rafagas = Math.round(metric.windGust);
        const direccionViento = this.getWindDirection(data.winddir);
        const precipRate = metric.precipRate;
        const precipTotal = metric.precipTotal;

        // Tono de confirmacion
        await this.audioManager.playTone(800, 200, 0.6);
        await delay(300);

        // Construir mensaje
        let mensaje = 'Clima actual. ';
        mensaje += `Temperatura ${temperatura} grados, sensacion termica ${sensacion} grados. `;
        mensaje += `Humedad ${humedad} por ciento. `;

        mensaje += `Viento ${direccionViento} a ${viento} kilometros por hora`;
        if (rafagas > viento) {
            mensaje += `, rafagas de ${rafagas} kilometros por hora`;
        }
        mensaje += '. ';

        if (precipRate > 0 || precipTotal > 0) {
            mensaje += `Precipitacion: tasa ${precipRate} milimetros por hora, acumulada ${precipTotal} milimetros. `;
        } else {
            mensaje += 'Sin precipitaciones. ';
        }

        mensaje += 'Fuente: Estacion Meteorologica victor 6.';

        const mensajeLimpio = sanitizeTextForTTS(mensaje);
        await this.speakWithHybridVoice(mensajeLimpio);
    }

    /**
     * Hablar mensaje de error
     */
    async speakError(mensaje) {
        await this.audioManager.playTone(400, 500, 0.8);
        await delay(300);
        const mensajeLimpio = sanitizeTextForTTS(mensaje);
        await this.speakWithHybridVoice(mensajeLimpio);
    }

    /**
     * Generar y reproducir voz usando sistema hibrido
     */
    async speakWithHybridVoice(text, options = {}) {
        try {
            const audioFile = await this.voiceManager.generateSpeech(text, options);
            await this.voiceManager.playAudio(audioFile);

            if (this.audioManager.rogerBeep && this.audioManager.rogerBeep.enabled) {
                await this.audioManager.rogerBeep.executeAfterTransmission();
            }

            setTimeout(() => {
                try {
                    if (fs.existsSync(audioFile)) {
                        fs.unlinkSync(audioFile);
                    }
                } catch (error) {
                    this.logger.warn('Error eliminando archivo temporal:', error.message);
                }
            }, 30000);
        } catch (error) {
            this.logger.error('Error en speakWithHybridVoice:', error.message);
            await this.audioManager.speak(text, options);
        }
    }

    /**
     * Convertir grados de viento a direccion cardinal
     */
    getWindDirection(degrees) {
        if (!degrees && degrees !== 0) {
            return '';
        }

        const directions = [
            'del norte',
            'del noreste',
            'del este',
            'del sureste',
            'del sur',
            'del suroeste',
            'del oeste',
            'del noroeste'
        ];

        const index = Math.round(degrees / 45) % 8;
        return directions[index];
    }

    /**
     * Verificar si el cache es valido
     */
    isCacheValid() {
        if (!this.cache.data || !this.cache.timestamp) {
            return false;
        }

        const age = Date.now() - this.cache.timestamp;
        return age < this.config.cacheDuration;
    }

    /**
     * Limpiar cache
     */
    clearCache() {
        this.cache = { data: null, timestamp: 0 };
        this.logger.info('Cache de WeatherWU limpiado');
    }

    /**
     * Obtener estado del modulo
     */
    getStatus() {
        return {
            enabled: this.config.enabled,
            state: this.state,
            stationId: this.config.stationId,
            cacheValid: this.isCacheValid()
        };
    }

    /**
     * Destructor
     */
    destroy() {
        this.clearCache();
        if (this.voiceManager && typeof this.voiceManager.destroy === 'function') {
            this.voiceManager.destroy();
        }
        this.state = MODULE_STATES.DISABLED;
        this.logger.info('Modulo WeatherWU destruido');
    }
}

module.exports = WeatherWU;
