const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { delay, sanitizeTextForTTS } = require('../utils');
const { createLogger } = require('../logging/Logger');
const { MODULE_STATES } = require('../constants');
const { getSpeechToText } = require('../utils/speechToText');
const { getCityMatcher } = require('../utils/cityMatcher');

class WeatherVoice {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.logger = createLogger('[WeatherVoice]');
        this.state = MODULE_STATES.IDLE;
        
        this.config = {
            enabled: true,
            apiUrl: 'https://api.open-meteo.com/v1/forecast',
            defaultLocation: {
                name: 'Mendoza, Argentina',
                latitude: -32.89,
                longitude: -68.84
            },
            cacheDuration: 600000, // 10 minutos
            timeout: 10000,
            voiceCapture: {
                duration: 8000, // 8 segundos de grabación
                format: 'wav',
                sampleRate: 16000, // Whisper prefiere 16kHz
                timeout: 15000 // Timeout total del proceso
            }
        };

        // Cache para evitar llamadas excesivas
        this.cache = new Map();
        
        // Inicializar servicios
        this.speechToText = getSpeechToText();
        this.cityMatcher = getCityMatcher();

        this.logger.info('Módulo WeatherVoice inicializado con speech-to-text');
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
                case '*43':
                    await this.speakWeatherByVoice();
                    break;
                case '*4':
                default:
                    await this.speakCurrentWeather();
                    break;
            }
        } catch (error) {
            this.logger.error('Error ejecutando WeatherVoice:', error.message);
            this.state = MODULE_STATES.ERROR;
            await this.speakError('Error obteniendo información del clima');
        } finally {
            this.state = MODULE_STATES.IDLE;
        }
    }

    /**
     * Comando *43: Clima por voz
     */
    async speakWeatherByVoice() {
        try {
            // 1. Verificar que STT esté disponible
            if (!this.speechToText.isAvailable()) {
                await this.speakError('Servicio de reconocimiento de voz no disponible');
                return;
            }

            // 2. Prompt para el usuario
            await this.audioManager.playTone(800, 300, 0.7);
            await delay(200);
            await this.audioManager.speak(
                'Diga el nombre de la ciudad después del tono', 
                { voice: 'es' }
            );
            await delay(500);

            // 3. Tono de inicio de grabación
            await this.audioManager.playTone(1200, 500, 0.8);
            await delay(200);

            // 4. Capturar audio del usuario
            this.logger.info('Iniciando captura de voz del usuario...');
            const audioData = await this.captureUserVoice();

            if (!audioData) {
                await this.speakError('No se pudo capturar audio del usuario');
                return;
            }

            // 5. Convertir voz a texto
            this.logger.info('Procesando audio con speech-to-text...');
            const transcription = await this.speechToText.transcribeBuffer(
                audioData, 
                this.config.voiceCapture.format
            );

            if (!transcription) {
                await this.speakError('No se pudo reconocer lo que dijo');
                return;
            }

            this.logger.info(`Usuario dijo: "${transcription}"`);

            // 6. Buscar ciudad
            const city = this.cityMatcher.findCity(transcription);
            
            if (!city) {
                await this.speakError(`No se encontró la ciudad "${transcription}"`);
                await delay(500);
                await this.audioManager.speak(
                    'Ciudades disponibles incluyen Buenos Aires, Córdoba, Rosario, Mendoza, Salta', 
                    { voice: 'es' }
                );
                return;
            }

            // 7. Obtener clima de la ciudad encontrada
            this.logger.info(`Obteniendo clima para: ${city.name}`);
            const weatherData = await this.getCurrentWeatherForCity(city);

            // 8. Responder con el clima
            await this.speakCityWeather(weatherData, city);

        } catch (error) {
            this.logger.error('Error en comando de voz:', error.message);
            await this.speakError('Error procesando comando de voz');
        }
    }

    /**
     * Capturar audio del usuario
     * @returns {Promise<Buffer|null>}
     */
    async captureUserVoice() {
        return new Promise((resolve, reject) => {
            try {
                const chunks = [];
                let isRecording = false;
                let recordingTimeout;

                // Configurar timeout general
                const generalTimeout = setTimeout(() => {
                    this.logger.warn('Timeout capturando voz del usuario');
                    resolve(null);
                }, this.config.voiceCapture.timeout);

                // Listener temporal para capturar audio
                const audioListener = (audioBuffer) => {
                    if (isRecording) {
                        chunks.push(audioBuffer);
                    }
                };

                // Iniciar captura
                isRecording = true;
                this.audioManager.on('audio_data', audioListener);

                // Timeout de grabación
                recordingTimeout = setTimeout(() => {
                    isRecording = false;
                    this.audioManager.removeListener('audio_data', audioListener);
                    clearTimeout(generalTimeout);

                    if (chunks.length > 0) {
                        const audioBuffer = Buffer.concat(chunks);
                        this.logger.debug(`Audio capturado: ${audioBuffer.length} bytes`);
                        resolve(audioBuffer);
                    } else {
                        this.logger.warn('No se capturó audio del usuario');
                        resolve(null);
                    }
                }, this.config.voiceCapture.duration);

            } catch (error) {
                this.logger.error('Error capturando voz:', error.message);
                resolve(null);
            }
        });
    }

    /**
     * Obtener clima actual para ciudad específica
     * @param {object} city - Información de la ciudad
     * @returns {Promise<object>}
     */
    async getCurrentWeatherForCity(city) {
        const cacheKey = `current_${city.lat}_${city.lon}`;
        
        // Verificar cache
        if (this.isCacheValid(cacheKey)) {
            this.logger.debug(`Usando clima desde cache para ${city.name}`);
            return this.cache.get(cacheKey).data;
        }

        const params = {
            latitude: city.lat,
            longitude: city.lon,
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
            this.logger.debug(`Consultando clima para ${city.name} (${city.lat}, ${city.lon})`);
            const response = await axios.get(this.config.apiUrl, { 
                params, 
                timeout: this.config.timeout 
            });
            
            const processedData = this.processCurrentWeather(response.data, city);
            
            // Guardar en cache
            this.cache.set(cacheKey, {
                data: processedData,
                timestamp: Date.now()
            });
            
            return processedData;
        } catch (error) {
            this.logger.error(`Error consultando clima para ${city.name}:`, error.message);
            throw new Error(`No se pudo obtener el clima de ${city.name}`);
        }
    }

    /**
     * Procesar datos de clima actual
     * @param {object} data - Datos de Open-Meteo
     * @param {object} city - Información de la ciudad
     * @returns {object}
     */
    processCurrentWeather(data, city) {
        const current = data.current;
        
        return {
            location: city.name,
            province: city.province,
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
     * Hablar clima de ciudad específica
     * @param {object} weatherData 
     * @param {object} city 
     */
    async speakCityWeather(weatherData, city) {
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
     * Clima actual (Mendoza por defecto)
     */
    async speakCurrentWeather() {
        const defaultCity = {
            name: this.config.defaultLocation.name,
            lat: this.config.defaultLocation.latitude,
            lon: this.config.defaultLocation.longitude,
            province: 'Mendoza'
        };

        const weatherData = await this.getCurrentWeatherForCity(defaultCity);
        await this.speakCityWeather(weatherData, defaultCity);
    }

    /**
     * Pronóstico 24h (Mendoza por defecto)
     */
    async speakForecast24h() {
        // Implementación similar al módulo original
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
            const response = await axios.get(this.config.apiUrl, { params, timeout: this.config.timeout });
            const forecastData = this.processForecast24h(response.data);
            
            // Tono de confirmación
            await this.audioManager.playTone(1000, 200, 0.6);
            await delay(300);

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

        } catch (error) {
            this.logger.error('Error obteniendo pronóstico:', error.message);
            throw error;
        }
    }

    /**
     * Procesar pronóstico 24h
     */
    processForecast24h(data) {
        const hourly = data.hourly;
        const next24Hours = hourly.temperature_2m.slice(0, 24);
        
        const maxTemp = Math.round(Math.max(...next24Hours));
        const minTemp = Math.round(Math.min(...next24Hours));
        const maxRainProb = Math.max(...hourly.precipitation_probability.slice(0, 24));
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
     * Convertir código de clima
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
            61: 'lluvia ligera',
            63: 'lluvia moderada',
            65: 'lluvia intensa',
            71: 'nieve ligera',
            73: 'nieve moderada',
            75: 'nieve intensa',
            80: 'aguaceros ligeros',
            81: 'aguaceros moderados',
            82: 'aguaceros intensos',
            95: 'tormenta'
        };
        
        return descriptions[code] || 'condiciones variables';
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
        if (!this.cache.has(cacheKey)) return false;
        
        const cached = this.cache.get(cacheKey);
        const age = Date.now() - cached.timestamp;
        return age < this.config.cacheDuration;
    }

    /**
     * Limpiar cache
     */
    clearCache() {
        this.cache.clear();
        this.logger.info('Cache de clima limpiado');
    }

    /**
     * Configurar módulo
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.logger.info('Configuración de WeatherVoice actualizada');
    }

    /**
     * Obtener estado del módulo
     */
    getStatus() {
        return {
            enabled: this.config.enabled,
            state: this.state,
            apiConfigured: true,
            provider: 'Open-Meteo + Voice',
            speechToText: this.speechToText.getServiceInfo(),
            cityMatcher: this.cityMatcher.getStats(),
            defaultLocation: this.config.defaultLocation.name,
            cacheSize: this.cache.size
        };
    }

    /**
     * Destructor
     */
    destroy() {
        this.clearCache();
        this.state = MODULE_STATES.DISABLED;
        this.logger.info('Módulo WeatherVoice destruido');
    }
}

module.exports = WeatherVoice;