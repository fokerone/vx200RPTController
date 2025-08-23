const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { delay, sanitizeTextForTTS } = require('../utils');
const { createLogger } = require('../logging/Logger');
const { MODULE_STATES } = require('../constants');
const ClaudeSpeechToText = require('../utils/claudeSpeechToText');
const { getMendozaCityMatcher } = require('../utils/mendozaCityMatcher');
const HybridVoiceManager = require('../audio/HybridVoiceManager');

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
            // Lista de 5 ciudades principales para selección DTMF
            cityMenu: {
                '1': { name: 'Mendoza', lat: -32.8833, lon: -68.8167, department: 'Capital' },
                '2': { name: 'Las Heras', lat: -32.8500, lon: -68.8333, department: 'Las Heras' },
                '3': { name: 'Aconcagua', lat: -32.6500, lon: -70.0000, department: 'Las Heras' }, // Zona Aconcagua
                '4': { name: 'Malargüe', lat: -35.4719, lon: -69.5844, department: 'Malargüe' },
                '5': { name: 'Tunuyán', lat: -33.5833, lon: -69.0167, department: 'Tunuyán' }
            }
        };

        // Cache para evitar llamadas excesivas
        this.cache = new Map();
        
        // Inicializar servicios
        this.speechToText = new ClaudeSpeechToText();
        this.cityMatcher = getMendozaCityMatcher();
        
        // Inicializar sistema híbrido de voz
        this.voiceManager = new HybridVoiceManager(this.audioManager);
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
                case '*5':
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
     * Comando *5: Selección de ciudad por DTMF
     */
    async speakWeatherByVoice() {
        try {
            this.logger.info('Iniciando selección de ciudad por DTMF');
            
            // Asegurar que el AudioManager esté iniciado
            if (!this.audioManager.isRecording) {
                this.logger.info('AudioManager no está grabando, iniciando...');
                const started = this.audioManager.start();
                if (!started) {
                    await this.speakError('Error iniciando sistema de audio');
                    return;
                }
                // Dar tiempo para que se estabilice
                await delay(1000);
            }
            
            // Asegurar que el detector DTMF esté habilitado
            if (!this.audioManager.dtmfDecoder.isEnabled()) {
                this.audioManager.dtmfDecoder.enable();
                this.logger.info('Detector DTMF habilitado para selección de ciudad');
            }
            
            // 1. Tono de confirmación
            await this.audioManager.playTone(800, 300, 0.7);
            await delay(200);

            // 2. Anunciar menú de ciudades
            await this.announceWeatherMenu();
            
            // 3. Esperar selección DTMF del usuario
            this.logger.info('Sistema listo para recibir selección DTMF');
            this.logger.info(`AudioManager grabando: ${this.audioManager.isRecording}`);
            this.logger.info(`Detector DTMF habilitado: ${this.audioManager.dtmfDecoder.isEnabled()}`);
            
            const selectedCity = await this.waitForCitySelection();
            
            if (!selectedCity) {
                await this.speakError('No se recibió selección válida');
                return;
            }

            // 4. Confirmar selección y obtener clima
            this.logger.info(`Usuario seleccionó: ${selectedCity.name}`);
            
            const weatherData = await this.getCurrentWeatherForCity(selectedCity);
            await this.speakCityWeather(weatherData, selectedCity);

        } catch (error) {
            this.logger.error('Error en selección de ciudad:', error.message);
            await this.speakError('Error en selección de ciudad');
        }
    }

    /**
     * Anunciar menú de selección de ciudades
     */
    async announceWeatherMenu() {
        const menuText = [
            'Seleccione ciudad para consultar clima:',
            'Uno: Mendoza',
            'Dos: Las Heras', 
            'Tres: Aconcagua',
            'Cuatro: Malargüe',
            'Cinco: Tunuyán',
            'Presione el número correspondiente'
        ].join('. ');
        
        await this.speakWithHybridVoice(menuText);
    }

    /**
     * Esperar selección DTMF del usuario
     * @returns {Promise<object|null>} - Ciudad seleccionada o null
     */
    async waitForCitySelection() {
        return new Promise((resolve) => {
            let timeout;
            
            const dtmfHandler = (dtmfSequence) => {
                this.logger.info(`DTMF recibido durante selección: "${dtmfSequence}"`);
                
                // Verificar si es una selección válida (1-5)
                // Aceptar tanto dígitos individuales como el último dígito de una secuencia
                const lastDigit = dtmfSequence.slice(-1);
                
                if (/^[1-5]$/.test(lastDigit)) {
                    const selectedCity = this.config.cityMenu[lastDigit];
                    
                    if (selectedCity) {
                        this.logger.info(`Ciudad seleccionada: ${lastDigit} - ${selectedCity.name}`);
                        
                        // Limpiar listeners y timeout
                        clearTimeout(timeout);
                        this.audioManager.removeListener('dtmf', dtmfHandler);
                        
                        resolve(selectedCity);
                        return;
                    }
                }
                
                // Si no es válida, informar y seguir esperando
                this.logger.debug(`Selección no válida: "${dtmfSequence}" (esperando 1-5)`);
            };
            
            // Configurar timeout de 20 segundos (más tiempo para el operador)
            timeout = setTimeout(() => {
                this.logger.warn('Timeout esperando selección de ciudad');
                this.audioManager.removeListener('dtmf', dtmfHandler);
                resolve(null);
            }, 20000);
            
            // Escuchar eventos DTMF
            this.audioManager.on('dtmf', dtmfHandler);
            
            this.logger.info('Esperando selección DTMF (1-5)...');
            this.logger.debug(`Detector DTMF habilitado: ${this.audioManager.dtmfDecoder.isEnabled()}`);
        });
    }

    /**
     * Capturar audio del usuario usando arecord directamente
     * @returns {Promise<Buffer|null>}
     */
    async captureUserVoice() {
        return new Promise((resolve, reject) => {
            try {
                const tempFile = path.join(__dirname, '../../temp', `voice_capture_${Date.now()}.wav`);
                const duration = Math.floor(this.config.voiceCapture.duration / 1000); // Convertir a segundos
                
                this.logger.info(`Capturando voz del usuario por ${duration} segundos...`);
                
                // Usar arecord para capturar audio directamente
                const arecord = spawn('arecord', [
                    '-f', 'S16_LE',           // Formato PCM 16-bit little endian
                    '-r', '16000',            // Sample rate 16kHz (optimizado para Whisper)
                    '-c', '1',                // Mono
                    '-t', 'wav',              // Formato WAV
                    '-d', duration.toString(), // Duración en segundos
                    tempFile                  // Archivo de salida
                ]);

                let stderr = '';
                arecord.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                arecord.on('close', (code) => {
                    if (code === 0 && fs.existsSync(tempFile)) {
                        try {
                            const audioBuffer = fs.readFileSync(tempFile);
                            this.logger.debug(`Audio capturado exitosamente: ${audioBuffer.length} bytes`);
                            
                            // Limpiar archivo temporal después de un tiempo
                            setTimeout(() => {
                                try {
                                    if (fs.existsSync(tempFile)) {
                                        fs.unlinkSync(tempFile);
                                    }
                                } catch (error) {
                                    this.logger.warn('Error eliminando archivo temporal:', error.message);
                                }
                            }, 60000); // 60 segundos
                            
                            resolve(audioBuffer);
                        } catch (error) {
                            this.logger.error('Error leyendo archivo de audio:', error.message);
                            resolve(null);
                        }
                    } else {
                        this.logger.warn(`arecord falló con código ${code}: ${stderr}`);
                        resolve(null);
                    }
                });

                arecord.on('error', (error) => {
                    this.logger.error('Error ejecutando arecord:', error.message);
                    resolve(null);
                });

                // Timeout de seguridad
                setTimeout(() => {
                    if (!arecord.killed) {
                        arecord.kill('SIGTERM');
                        this.logger.warn('Timeout capturando audio, proceso terminado');
                        resolve(null);
                    }
                }, this.config.voiceCapture.timeout);

            } catch (error) {
                this.logger.error('Error configurando captura de voz:', error.message);
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
            timezone: 'America/Argentina/Mendoza'
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
        await this.speakWithHybridVoice(mensajeLimpio);
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
            timezone: 'America/Argentina/Mendoza'
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
            await this.speakWithHybridVoice(mensajeLimpio);

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
        await this.speakWithHybridVoice(mensajeLimpio);
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
     * Generar y reproducir voz usando sistema híbrido
     * @param {string} text - Texto a reproducir
     * @param {object} options - Opciones de voz
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
     * @param {string} audioFile - Ruta del archivo de audio
     * @returns {Promise<void>}
     */
    async playAudioFile(audioFile) {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(audioFile)) {
                reject(new Error('Archivo de audio no existe'));
                return;
            }

            this.logger.debug(`Reproduciendo archivo: ${path.basename(audioFile)}`);
            
            const paplay = spawn('paplay', [audioFile]);
            
            let stderr = '';
            paplay.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            paplay.on('close', (code) => {
                if (code === 0) {
                    this.logger.debug('Reproducción completada exitosamente');
                    resolve();
                } else {
                    this.logger.warn(`paplay falló con código ${code}: ${stderr}`);
                    reject(new Error(`Error reproduciendo audio: ${stderr}`));
                }
            });

            paplay.on('error', (error) => {
                this.logger.error('Error ejecutando paplay:', error.message);
                reject(error);
            });
        });
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
        
        // Destruir voice manager
        if (this.voiceManager && typeof this.voiceManager.destroy === 'function') {
            this.voiceManager.destroy();
        }
        
        this.state = MODULE_STATES.DISABLED;
        this.logger.info('Módulo WeatherVoice destruido');
    }
}

module.exports = WeatherVoice;