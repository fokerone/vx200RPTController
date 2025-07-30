const axios = require('axios');
const { delay, sanitizeTextForTTS } = require('../utils');
const { createLogger } = require('../logging/Logger');
const { MODULE_STATES } = require('../constants');

class WeatherOpenMeteo {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.logger = createLogger('[Weather-OpenMeteo]');
        this.state = MODULE_STATES.IDLE;
        
        this.config = {
            enabled: true,
            apiUrl: 'https://api.open-meteo.com/v1/forecast',
            geocodingUrl: 'https://geocoding-api.open-meteo.com/v1/search',
            defaultLocation: {
                name: 'Mendoza, Argentina',
                latitude: -32.89,
                longitude: -68.84
            },
            cacheDuration: 600000, // 10 minutos
            timeout: 10000
        };

        // Cache para evitar llamadas excesivas
        this.cache = {
            current: { data: null, timestamp: 0 },
            forecast: { data: null, timestamp: 0 }
        };

        this.logger.info('Módulo Weather (Open-Meteo) inicializado - Sin API key requerida');
    }

    /**
     * Ejecutar cuando se recibe comando DTMF
     */
    async execute(command) {
        this.logger.info(`Ejecutado por comando: ${command}`);
        
        if (!this.config.enabled) {
            this.logger.warn('Módulo deshabilitado');
            return;
        }

        if (this.state !== MODULE_STATES.IDLE) {
            this.logger.warn('Módulo ocupado');
            return;
        }

        try {
            this.state = MODULE_STATES.ACTIVE;
            
            switch (command) {
                case '*41':
                    await this.speakCurrentWeather();
                    break;
                case '*42':
                    await this.speakForecast24h();
                    break;
                case '*4':
                default:
                    await this.speakCurrentWeather();
                    break;
            }
        } catch (error) {
            this.logger.error('Error ejecutando Weather:', error.message);
            this.state = MODULE_STATES.ERROR;
            await this.speakError('Error obteniendo información del clima');
        } finally {
            this.state = MODULE_STATES.IDLE;
        }
    }

    /**
     * Obtener clima actual
     */
    async getCurrentWeather() {
        const cacheKey = 'current';
        
        if (this.isCacheValid(cacheKey)) {
            this.logger.debug('Usando clima actual desde cache');
            return this.cache[cacheKey].data;
        }

        const { latitude, longitude } = this.config.defaultLocation;
        
        const params = {
            latitude,
            longitude,
            current: [
                'temperature_2m',
                'relative_humidity_2m', 
                'apparent_temperature',
                'weather_code',
                'wind_speed_10m',
                'wind_direction_10m'
            ].join(','),
            timezone: 'America/Argentina/Buenos_Aires'
        };

        try {
            this.logger.debug('Consultando clima actual desde Open-Meteo');
            const response = await axios.get(this.config.apiUrl, { 
                params, 
                timeout: this.config.timeout 
            });
            
            // Procesar y guardar en cache
            const processedData = this.processCurrentWeather(response.data);
            this.cache[cacheKey] = {
                data: processedData,
                timestamp: Date.now()
            };
            
            return processedData;
        } catch (error) {
            this.logger.error('Error consultando Open-Meteo API:', error.message);
            throw new Error('No se pudo obtener información del clima');
        }
    }

    /**
     * Obtener pronóstico 24h
     */
    async getForecast24h() {
        const cacheKey = 'forecast';
        
        if (this.isCacheValid(cacheKey)) {
            this.logger.debug('Usando pronóstico desde cache');
            return this.cache[cacheKey].data;
        }

        const { latitude, longitude } = this.config.defaultLocation;
        
        const params = {
            latitude,
            longitude,
            hourly: [
                'temperature_2m',
                'relative_humidity_2m',
                'weather_code',
                'precipitation_probability',
                'wind_speed_10m'
            ].join(','),
            forecast_days: 2,
            timezone: 'America/Argentina/Buenos_Aires'
        };

        try {
            this.logger.debug('Consultando pronóstico 24h desde Open-Meteo');
            const response = await axios.get(this.config.apiUrl, { 
                params, 
                timeout: this.config.timeout 
            });
            
            const processedData = this.processForecast24h(response.data);
            this.cache[cacheKey] = {
                data: processedData,
                timestamp: Date.now()
            };
            
            return processedData;
        } catch (error) {
            this.logger.error('Error consultando pronóstico Open-Meteo:', error.message);
            throw new Error('No se pudo obtener el pronóstico del clima');
        }
    }

    /**
     * Procesar datos de clima actual de Open-Meteo
     */
    processCurrentWeather(data) {
        const current = data.current;
        
        return {
            location: this.config.defaultLocation.name,
            temperature: Math.round(current.temperature_2m),
            feels_like: Math.round(current.apparent_temperature),
            humidity: current.relative_humidity_2m,
            wind_speed: Math.round(current.wind_speed_10m * 3.6), // km/h
            wind_direction: current.wind_direction_10m,
            weather_description: this.getWeatherDescription(current.weather_code),
            timestamp: current.time
        };
    }

    /**
     * Procesar pronóstico 24h de Open-Meteo
     */
    processForecast24h(data) {
        const hourly = data.hourly;
        const next24Hours = hourly.temperature_2m.slice(0, 24);
        
        // Calcular temperaturas máxima y mínima
        const maxTemp = Math.round(Math.max(...next24Hours));
        const minTemp = Math.round(Math.min(...next24Hours));
        
        // Calcular probabilidad máxima de lluvia
        const maxRainProb = Math.max(...hourly.precipitation_probability.slice(0, 24));
        
        // Descripción del clima predominante (primera hora)
        const weatherCode = hourly.weather_code[0];
        
        return {
            location: this.config.defaultLocation.name,
            max_temperature: maxTemp,
            min_temperature: minTemp,
            rain_probability: Math.round(maxRainProb),
            weather_description: this.getWeatherDescription(weatherCode),
            period: '24 horas'
        };
    }

    /**
     * Convertir código de clima a descripción en español
     */
    getWeatherDescription(code) {
        const descriptions = {
            0: 'cielo despejado',
            1: 'mayormente despejado',
            2: 'parcialmente nublado', 
            3: 'nublado',
            45: 'con niebla',
            48: 'niebla con escarcha',
            51: 'llovizna ligera',
            53: 'llovizna moderada',
            55: 'llovizna intensa',
            56: 'llovizna helada ligera',
            57: 'llovizna helada intensa',
            61: 'lluvia ligera',
            63: 'lluvia moderada',
            65: 'lluvia intensa',
            66: 'lluvia helada ligera',
            67: 'lluvia helada intensa',
            71: 'nieve ligera',
            73: 'nieve moderada',
            75: 'nieve intensa',
            77: 'granizo',
            80: 'aguaceros ligeros',
            81: 'aguaceros moderados',
            82: 'aguaceros intensos',
            85: 'nevadas ligeras',
            86: 'nevadas intensas',
            95: 'tormenta',
            96: 'tormenta con granizo ligero',
            99: 'tormenta con granizo intenso'
        };
        
        return descriptions[code] || 'condiciones variables';
    }

    /**
     * Hablar clima actual
     */
    async speakCurrentWeather() {
        const weatherData = await this.getCurrentWeather();
        
        // Tono de confirmación
        await this.audioManager.playTone(800, 200, 0.6);
        await delay(300);

        // Construir mensaje
        let mensaje = `Clima actual en ${weatherData.location}. `;
        mensaje += `Temperatura ${weatherData.temperature} grados. `;
        mensaje += `Sensación térmica ${weatherData.feels_like} grados. `;
        mensaje += `${weatherData.weather_description}. `;
        mensaje += `Humedad ${weatherData.humidity} por ciento. `;
        mensaje += `Viento a ${weatherData.wind_speed} kilómetros por hora.`;

        const mensajeLimpio = sanitizeTextForTTS(mensaje);
        await this.audioManager.speak(mensajeLimpio, { voice: 'es' });
    }

    /**
     * Hablar pronóstico 24h
     */
    async speakForecast24h() {
        const forecastData = await this.getForecast24h();
        
        // Tono de confirmación
        await this.audioManager.playTone(1000, 200, 0.6);
        await delay(300);

        // Construir mensaje
        let mensaje = `Pronóstico para ${forecastData.location} próximas ${forecastData.period}. `;
        mensaje += `Temperatura máxima ${forecastData.max_temperature} grados, `;
        mensaje += `mínima ${forecastData.min_temperature} grados. `;
        mensaje += `${forecastData.weather_description}. `;
        
        if (forecastData.rain_probability > 20) {
            mensaje += `Probabilidad de lluvia ${forecastData.rain_probability} por ciento.`;
        } else {
            mensaje += `Sin precipitaciones esperadas.`;
        }

        const mensajeLimpio = sanitizeTextForTTS(mensaje);
        await this.audioManager.speak(mensajeLimpio, { voice: 'es' });
    }

    /**
     * Hablar mensaje de error
     */
    async speakError(mensaje) {
        await this.audioManager.playTone(400, 500, 0.8);
        await delay(300);
        const mensajeLimpio = sanitizeTextForTTS(mensaje);
        await this.audioManager.speak(mensajeLimpio, { voice: 'es' });
    }

    /**
     * Verificar si el cache es válido
     */
    isCacheValid(cacheKey) {
        const cached = this.cache[cacheKey];
        if (!cached.data || !cached.timestamp) return false;
        
        const age = Date.now() - cached.timestamp;
        return age < this.config.cacheDuration;
    }

    /**
     * Limpiar cache
     */
    clearCache() {
        this.cache.current = { data: null, timestamp: 0 };
        this.cache.forecast = { data: null, timestamp: 0 };
        this.logger.info('Cache de clima limpiado');
    }

    /**
     * Configurar módulo
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.logger.info('Configuración de Weather actualizada');
    }

    /**
     * Obtener estado del módulo
     */
    getStatus() {
        return {
            enabled: this.config.enabled,
            state: this.state,
            apiConfigured: true, // Open-Meteo no requiere API key
            provider: 'Open-Meteo',
            defaultLocation: this.config.defaultLocation.name,
            cacheStatus: {
                current: this.isCacheValid('current'),
                forecast: this.isCacheValid('forecast')
            }
        };
    }

    /**
     * Destructor
     */
    destroy() {
        this.clearCache();
        this.state = MODULE_STATES.DISABLED;
        this.logger.info('Módulo Weather (Open-Meteo) destruido');
    }
}

module.exports = WeatherOpenMeteo;