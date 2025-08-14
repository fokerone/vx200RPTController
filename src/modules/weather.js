const axios = require('axios');
const { delay, sanitizeTextForTTS } = require('../utils');
const { createLogger } = require('../logging/Logger');
const { MODULE_STATES } = require('../constants');

class Weather {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.logger = createLogger('[Weather]');
        this.state = MODULE_STATES.IDLE;
        
        this.config = {
            enabled: true,
            apiKey: process.env.OPENWEATHER_API_KEY || null,
            defaultCity: 'Mendoza,AR',
            units: 'metric',
            language: 'es',
            cacheDuration: 600000, // 10 minutos en ms
            apiUrl: 'https://api.openweathermap.org/data/2.5'
        };

        // Cache para evitar llamadas excesivas a la API
        this.cache = {
            current: { data: null, timestamp: 0 },
            forecast: { data: null, timestamp: 0 }
        };
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

        if (!this.config.apiKey) {
            this.logger.error('API Key no configurada');
            await this.speakError('Servicio de clima no configurado');
            return;
        }

        if (this.state !== MODULE_STATES.IDLE) {
            this.logger.warn('Módulo ocupado');
            return;
        }

        try {
            this.state = MODULE_STATES.ACTIVE;
            
            // Determinar tipo de consulta según el comando
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
     * Obtener clima actual de la API
     */
    async getCurrentWeather(city = null) {
        const targetCity = city || this.config.defaultCity;
        const cacheKey = 'current';
        
        // Verificar cache
        if (this.isCacheValid(cacheKey)) {
            this.logger.debug('Usando clima actual desde cache');
            return this.cache[cacheKey].data;
        }

        const url = `${this.config.apiUrl}/weather`;
        const params = {
            q: targetCity,
            appid: this.config.apiKey,
            units: this.config.units,
            lang: this.config.language
        };

        try {
            this.logger.debug(`Consultando clima actual para: ${targetCity}`);
            const response = await axios.get(url, { params, timeout: 10000 });
            
            // Guardar en cache
            this.cache[cacheKey] = {
                data: response.data,
                timestamp: Date.now()
            };
            
            return response.data;
        } catch (error) {
            this.logger.error('Error consultando API del clima:', error.message);
            throw new Error('No se pudo obtener información del clima');
        }
    }

    /**
     * Obtener pronóstico de 24h
     */
    async getForecast24h(city = null) {
        const targetCity = city || this.config.defaultCity;
        const cacheKey = 'forecast';
        
        // Verificar cache
        if (this.isCacheValid(cacheKey)) {
            this.logger.debug('Usando pronóstico desde cache');
            return this.cache[cacheKey].data;
        }

        const url = `${this.config.apiUrl}/forecast`;
        const params = {
            q: targetCity,
            appid: this.config.apiKey,
            units: this.config.units,
            lang: this.config.language,
            cnt: 8 // 8 intervalos de 3h = 24h
        };

        try {
            this.logger.debug(`Consultando pronóstico 24h para: ${targetCity}`);
            const response = await axios.get(url, { params, timeout: 10000 });
            
            // Guardar en cache
            this.cache[cacheKey] = {
                data: response.data,
                timestamp: Date.now()
            };
            
            return response.data;
        } catch (error) {
            this.logger.error('Error consultando pronóstico:', error.message);
            throw new Error('No se pudo obtener el pronóstico del clima');
        }
    }

    /**
     * Hablar clima actual
     */
    async speakCurrentWeather() {
        const weatherData = await this.getCurrentWeather();
        
        const ciudad = weatherData.name;
        const temperatura = Math.round(weatherData.main.temp);
        const sensacion = Math.round(weatherData.main.feels_like);
        const descripcion = weatherData.weather[0].description;
        const humedad = weatherData.main.humidity;
        const viento = Math.round(weatherData.wind?.speed * 3.6) || 0; // m/s a km/h
        const direccionViento = this.getWindDirection(weatherData.wind?.deg);

        // Tono de confirmación
        await this.audioManager.playTone(800, 200, 0.6);
        await delay(300);

        // Construir mensaje
        let mensaje = `Clima actual en ${ciudad}. `;
        mensaje += `Temperatura ${temperatura} grados. `;
        mensaje += `Sensación térmica ${sensacion} grados. `;
        mensaje += `${descripcion}. `;
        mensaje += `Humedad ${humedad} por ciento. `;
        
        if (viento > 0) {
            mensaje += `Viento ${direccionViento} a ${viento} kilómetros por hora.`;
        }

        const mensajeLimpio = sanitizeTextForTTS(mensaje);
        await this.audioManager.speak(mensajeLimpio, { voice: 'es' });
    }

    /**
     * Hablar pronóstico de 24 horas
     */
    async speakForecast24h() {
        const forecastData = await this.getForecast24h();
        
        const ciudad = forecastData.city.name;
        const proximas24h = forecastData.list.slice(0, 4); // Próximos 12h (4 intervalos de 3h)
        
        // Obtener temperaturas máxima y mínima
        const temperaturas = proximas24h.map(item => item.main.temp);
        const tempMax = Math.round(Math.max(...temperaturas));
        const tempMin = Math.round(Math.min(...temperaturas));
        
        // Buscar si hay probabilidad de lluvia significativa
        const lluviaProb = Math.max(...proximas24h.map(item => (item.pop || 0) * 100));
        const descripcionGeneral = proximas24h[0].weather[0].description;

        // Tono de confirmación
        await this.audioManager.playTone(1000, 200, 0.6);
        await delay(300);

        // Construir mensaje
        let mensaje = `Pronóstico para ${ciudad} próximas veinticuatro horas. `;
        mensaje += `Temperatura máxima ${tempMax} grados, mínima ${tempMin} grados. `;
        mensaje += `${descripcionGeneral}. `;
        
        if (lluviaProb > 20) {
            mensaje += `Probabilidad de lluvia ${Math.round(lluviaProb)} por ciento.`;
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
     * Convertir grados de viento a dirección cardinal
     */
    getWindDirection(degrees) {
        if (!degrees && degrees !== 0) return '';
        
        const directions = [
            'del norte', 'del noreste', 'del este', 'del sureste',
            'del sur', 'del suroeste', 'del oeste', 'del noroeste'
        ];
        
        const index = Math.round(degrees / 45) % 8;
        return directions[index];
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
            apiConfigured: !!this.config.apiKey,
            defaultCity: this.config.defaultCity,
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
        this.logger.info('Módulo Weather destruido');
    }
}

module.exports = Weather;