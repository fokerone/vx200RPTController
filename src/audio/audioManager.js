const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const recorder = require('node-record-lpcm16');
const RogerBeep = require('./rogerBeep');
const AudioDeviceDetector = require('./audioDeviceDetector');
const { Config, getValue } = require('../config');
const { AUDIO, MODULE_STATES, DELAYS, DTMF } = require('../constants');
const { delay, validateVolume, throttle } = require('../utils');
const { createLogger } = require('../logging/Logger');

class AudioManager extends EventEmitter {
    constructor() {
        super();
        this.logger = createLogger('[AudioManager]');
        this.state = MODULE_STATES.IDLE;

        // Configuración de audio desde ConfigManager centralizado
        this.sampleRate = getValue('audio.sampleRate');
        this.channels = getValue('audio.channels');
        this.bitDepth = getValue('audio.bitDepth');
        this.device = getValue('audio.device');

        // Detector de dispositivos de audio
        this.deviceDetector = new AudioDeviceDetector();
        this.captureAvailable = false; // Se detectará al iniciar

        // Componentes principales
        this.dtmfDecoder = new (require('./dtmfDecoder'))(this.sampleRate, this);
        this.rogerBeep = new RogerBeep(this);
        
        // Configurar DTMF con parámetros del ConfigManager
        this.configureDTMF();
        
        // Estado de grabación
        this.isRecording = false;
        this.recordingStream = null;
        this.dtmfBuffer = '';
        this.dtmfTimeout = null;
        this.recordingRetries = 0;
        this.maxRetries = 3;
        
        // Cola de audio con prioridades
        this.audioQueue = [];
        this.isProcessingAudio = false;
        this.currentAudioProcess = null;
        this.queueProcessingPaused = false;
        
        // Estado del canal usando configuración centralizada
        this.channelActivity = {
            isActive: false,
            level: 0,
            threshold: getValue('audio.channelThreshold'),
            sustainTime: getValue('audio.sustainTime'),
            lastActivityTime: 0,
            activityTimer: null
        };
        
        // Configuración y utilidades
        this.debug = process.env.NODE_ENV === 'development';
        this.soundsDir = path.join(__dirname, '../../sounds');
        this.tempDir = path.join(__dirname, '../../temp');
        
        // Debug: grabación continua para análisis
        this.debugRecording = null;
        this.debugBuffer = [];
        
        // Throttled broadcast para rendimiento
        this.broadcastSignalLevel = throttle((data) => {
            this.emit('signal_level', data);
        }, 100); // 100ms throttle
        
        // Sistema de cleanup automático para funcionamiento 24/7
        this.cleanupTimer = null;
        this.cleanupConfig = {
            interval: 6 * 60 * 60 * 1000,  // 6 horas
            maxFileAge: 2 * 60 * 60 * 1000, // 2 horas
            maxTempSize: 100 * 1024 * 1024  // 100MB máximo en temp
        };
        
        this.initializeDirectories();
        this.startCleanupTimer();
        this.logger.info('AudioManager inicializado con cleanup automático 24/7');
    }

    /**
     * Configurar detector DTMF con parámetros del ConfigManager
     */
    configureDTMF() {
        try {
            const dtmfConfig = getValue('dtmf');
            
            if (!dtmfConfig) {
                this.logger.warn('Configuración DTMF no encontrada, usando valores por defecto');
                return;
            }
            
            // Aplicar sensibilidad configurada
            if (dtmfConfig.sensitivity) {
                this.dtmfDecoder.setSensitivity(dtmfConfig.sensitivity);
            }
            
            // Configurar parámetros específicos si están definidos
            if (dtmfConfig.voiceDetection && dtmfConfig.validation) {
                this.dtmfDecoder.voiceActivityThreshold = dtmfConfig.voiceDetection.threshold;
                this.dtmfDecoder.maxVoiceFramesBeforeDisable = dtmfConfig.voiceDetection.maxFramesDisable;
                this.dtmfDecoder.minDetectionCount = dtmfConfig.validation.minDetections;
                this.dtmfDecoder.maxDetectionWindow = dtmfConfig.validation.windowMs;
                this.dtmfDecoder.detectionDelay = dtmfConfig.validation.delayMs;
            }
            
            this.logger.info(`DTMF configurado: sensibilidad=${dtmfConfig.sensitivity}, anti-voz=${dtmfConfig.voiceDetection?.enabled}`);
            
        } catch (error) {
            this.logger.error('Error configurando DTMF:', error.message);
        }
    }

    // ===== INICIALIZACIÓN =====

    initializeDirectories() {
        try {
            // Crear directorios necesarios
            [this.soundsDir, this.tempDir].forEach(dir => {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                    this.logger.debug(`Directorio creado: ${dir}`);
                }
            });
        } catch (error) {
            this.logger.error('Error creando directorios:', error.message);
            this.state = MODULE_STATES.ERROR;
        }
    }

    async start() {
        if (this.state === MODULE_STATES.ERROR) {
            this.logger.error('AudioManager en estado de error, no se puede iniciar');
            return false;
        }

        try {
            // Detectar dispositivos de captura disponibles
            this.logger.info('Detectando dispositivos de audio...');
            const deviceInfo = await this.deviceDetector.getDeviceInfo();

            // Log de información de dispositivos
            this.deviceDetector.logDeviceInfo(deviceInfo);

            this.captureAvailable = deviceInfo.capture.available;

            if (this.captureAvailable) {
                this.logger.info('Dispositivos de captura detectados - Iniciando grabación');
                this.startRecording();
            } else {
                this.logger.warn('⚠️  No se detectaron dispositivos de captura de audio');
                this.logger.warn('⚠️  Funciones deshabilitadas: DTMF, detección de actividad');
                this.logger.info('✓  Funciones disponibles: TTS, beacons, alertas (solo salida)');
            }

            this.state = MODULE_STATES.ACTIVE;
            this.logger.info('Sistema de audio iniciado');
            return true;
        } catch (error) {
            this.logger.error('Error iniciando sistema de audio:', error.message);
            this.state = MODULE_STATES.ERROR;
            return false;
        }
    }

    startRecording() {
        if (this.isRecording) {
            this.logger.debug('Grabación ya activa');
            return;
        }

        try {
            const recordingOptions = {
                sampleRate: this.sampleRate,
                channels: this.channels,
                bitDepth: this.bitDepth,
                audioType: 'raw',
                silence: '5.0',
                device: this.device
            };

            // Removido log verboso
            this.recordingStream = recorder.record(recordingOptions);
            
            this.recordingStream.stream()
                .on('data', (audioData) => {
                    this.processAudioData(audioData);
                })
                .on('error', (err) => {
                    this.logger.error('Error de grabación:', err.message);
                    this.handleRecordingError();
                });

            this.isRecording = true;
            this.recordingRetries = 0; // Reset contador de reintentos
            this.logger.debug('Grabación de audio iniciada');
            
        } catch (error) {
            this.logger.error('Error iniciando grabación:', error.message);
            this.isRecording = false;
            this.handleRecordingError();
        }
    }

    handleRecordingError() {
        this.isRecording = false;
        this.recordingRetries++;
        
        if (this.recordingRetries >= this.maxRetries) {
            this.logger.error(`Máximo de reintentos alcanzado (${this.maxRetries}), marcando como error`);
            this.state = MODULE_STATES.ERROR;
            this.emit('recording_failed', { 
                retries: this.recordingRetries,
                maxRetries: this.maxRetries 
            });
            return;
        }
        
        const retryDelay = DELAYS.VERY_LONG * this.recordingRetries; // Backoff exponencial
        this.logger.warn(`Reintentando grabación en ${retryDelay}ms (intento ${this.recordingRetries}/${this.maxRetries})`);
        
        setTimeout(() => {
            if (!this.isRecording && this.state !== MODULE_STATES.ERROR) {
                this.startRecording();
            }
        }, retryDelay);
    }

    // ===== PROCESAMIENTO DE AUDIO =====

    processAudioData(audioData) {
        if (!audioData || audioData.length === 0) {
            return;
        }
        
        // SIMPLEX: Si la grabación está pausada, no procesar audio
        if (!this.isRecording) {
            return;
        }

        try {
            // Convertir buffer a array de muestras normalizadas
            const audioArray = [];
            for (let i = 0; i < audioData.length; i += 2) {
                if (i + 1 < audioData.length) {
                    const sample = audioData.readInt16LE(i) / 32768.0;
                    audioArray.push(sample);
                }
            }

            if (audioArray.length === 0) {
                return;
            }

            // Detectar actividad del canal
            this.detectChannelActivity(audioArray);
            
            // Procesar DTMF solo si no estamos transmitiendo (lógica simplex)
            if (!this.isTransmitting()) {
                this.dtmfDecoder.detectSequence(audioArray, (dtmf) => {
                    this.handleDTMF(dtmf);
                });
            }

            // Debug: Guardar audio para análisis si hay actividad
            if (this.channelActivity.isActive && this.debugBuffer.length < 88200) { // ~2 segundos a 44100Hz
                this.debugBuffer.push(...audioArray);
            }
            
            // Emitir datos de audio (throttled si es necesario)
            this.emit('audio', audioArray);
            
        } catch (error) {
            if (this.debug) {
                this.logger.error('Error procesando audio:', error.message);
            }
        }
    }

    handleDTMF(dtmf) {
        if (!dtmf || typeof dtmf !== 'string') {
            return;
        }

        this.dtmfBuffer += dtmf;
        
        // Limpiar timeout anterior
        if (this.dtmfTimeout) {
            clearTimeout(this.dtmfTimeout);
        }
        
        // Configurar nuevo timeout usando constantes
        this.dtmfTimeout = setTimeout(() => {
            if (this.dtmfBuffer.length > 0) {
                this.logger.info(`DTMF recibido: ${this.dtmfBuffer}`);
                this.emit('dtmf', this.dtmfBuffer);
                this.dtmfBuffer = '';
            }
        }, DTMF.TIMEOUT);
    }

    detectChannelActivity(audioArray) {
        // Calcular nivel RMS de la señal
        const rmsLevel = Math.sqrt(
            audioArray.reduce((sum, sample) => sum + sample * sample, 0) / audioArray.length
        );
        
        this.channelActivity.level = rmsLevel;
        const now = Date.now();
        
        // Detectar si hay actividad basada en el umbral
        if (rmsLevel > this.channelActivity.threshold) {
            this.channelActivity.lastActivityTime = now;
            
            // Cambio de estado: inactivo -> activo
            if (!this.channelActivity.isActive) {
                this.channelActivity.isActive = true;
                this.logger.debug(`Canal activo - Nivel: ${rmsLevel.toFixed(4)}`);
                this.emit('channel_active', {
                    level: rmsLevel,
                    timestamp: now
                });
            }
            
            // Cancelar timer de inactividad anterior
            if (this.channelActivity.activityTimer) {
                clearTimeout(this.channelActivity.activityTimer);
                this.channelActivity.activityTimer = null;
            }
            
            // Programar detección de inactividad
            this.channelActivity.activityTimer = setTimeout(() => {
                if (this.channelActivity.isActive) {
                    this.channelActivity.isActive = false;
                    const duration = now - this.channelActivity.lastActivityTime;
                    this.logger.debug(`Canal inactivo - Duración: ${duration}ms`);
                    this.emit('channel_inactive', {
                        duration: duration,
                        timestamp: now
                    });
                }
            }, this.channelActivity.sustainTime);
        }
        
        // Broadcast throttleado de nivel de señal
        this.broadcastSignalLevel({
            level: rmsLevel,
            active: this.channelActivity.isActive,
            timestamp: now
        });
    }

    // ===== TEXTO A VOZ =====

    async speak(text, options = {}) {
        if (!text || typeof text !== 'string') {
            this.logger.warn('Texto inválido para TTS');
            return;
        }

        try {
            this.logger.debug(`TTS: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
            await this.speakWithEspeak(text, options);
            
            // Roger Beep automático al finalizar transmisión
            if (this.rogerBeep && this.rogerBeep.isEnabled()) {
                await this.rogerBeep.executeAfterTransmission();
            }
            
        } catch (error) {
            this.logger.error('Error en TTS con Roger Beep:', error.message);
            throw error; // Re-lanzar para manejo upstream
        }
    }

    async speakNoRoger(text, options = {}) {
        if (!text || typeof text !== 'string') {
            this.logger.warn('Texto inválido para TTS sin Roger');
            return;
        }

        try {
            this.logger.debug(`TTS sin Roger: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
            await this.speakWithEspeak(text, options);
        } catch (error) {
            this.logger.error('Error en TTS sin Roger:', error.message);
            throw error;
        }
    }

    async speakWithEspeak(text, options = {}) {
        return new Promise((resolve, reject) => {
            // LÓGICA SIMPLEX: Pausar escucha durante TTS
            const wasRecording = this.isRecording;
            if (wasRecording) {
                this.pauseRecording();
                this.logger.debug('SIMPLEX: Escucha pausada para TTS');
            }
            
            // Emitir evento de transmisión iniciada
            this.emit('transmission_started', {
                type: 'tts',
                text: text.substring(0, 50),
                timestamp: Date.now()
            });
            
            // Configuración con defaults desde variables de entorno
            const voice = options.voice || getValue('tts.voice');
            const speed = options.speed || getValue('tts.speed');
            const amplitude = options.amplitude || process.env.TTS_AMPLITUDE || '100';
            
            // Sanitizar texto para evitar problemas de shell
            const sanitizedText = text.replace(/["`$\\]/g, '').substring(0, 500);
            
            const args = [
                '-v', voice,
                '-s', speed,
                '-a', amplitude,
                sanitizedText
            ];
            
            this.logger.debug(`Ejecutando espeak: ${sanitizedText.substring(0, 30)}...`);
            const espeak = spawn('espeak', args);

            let stderr = '';
            let timeout = null;

            espeak.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            espeak.on('close', (code) => {
                if (timeout) {clearTimeout(timeout);}
                
                // Emitir evento de transmisión terminada
                this.emit('transmission_ended', {
                    type: 'tts',
                    timestamp: Date.now()
                });
                
                // LÓGICA SIMPLEX: Reanudar escucha después de TTS
                if (wasRecording && !this.isRecording) {
                    setTimeout(() => {
                        this.resumeRecording();
                        this.logger.debug('SIMPLEX: Escucha reanudada post-TTS');
                    }, 100); // 100ms delay
                }
                
                if (code === 0) {
                    this.logger.debug('TTS completado exitosamente');
                    resolve();
                } else {
                    const error = new Error(`espeak falló con código ${code}: ${stderr}`);
                    this.logger.error('Error en espeak:', error.message);
                    reject(error);
                }
            });
            
            espeak.on('error', (err) => {
                if (timeout) {clearTimeout(timeout);}
                
                // Emitir evento de transmisión terminada (con error)
                this.emit('transmission_ended', {
                    type: 'tts',
                    error: true,
                    timestamp: Date.now()
                });
                
                // LÓGICA SIMPLEX: Reanudar escucha en caso de error
                if (wasRecording && !this.isRecording) {
                    setTimeout(() => {
                        this.resumeRecording();
                        this.logger.debug('SIMPLEX: Escucha reanudada post-error TTS');
                    }, 100);
                }
                
                this.logger.error('Error iniciando espeak:', err.message);
                reject(err);
            });

            // Timeout de seguridad mejorado
            timeout = setTimeout(() => {
                if (!espeak.killed) {
                    espeak.kill('SIGTERM');
                    
                    // Emitir evento de transmisión terminada (timeout)
                    this.emit('transmission_ended', {
                        type: 'tts',
                        timeout: true,
                        timestamp: Date.now()
                    });
                    
                    // LÓGICA SIMPLEX: Reanudar escucha en caso de timeout
                    if (wasRecording && !this.isRecording) {
                        setTimeout(() => {
                            this.resumeRecording();
                            this.logger.debug('SIMPLEX: Escucha reanudada post-timeout TTS');
                        }, 100);
                    }
                    
                    reject(new Error('TTS timeout - proceso terminado forzosamente'));
                }
            }, 30000);
        });
    }

    // ===== REPRODUCCIÓN DE AUDIO =====

    async playTone(frequency, duration, volume = 0.5) {
        // Validar parámetros
        if (typeof frequency !== 'number' || frequency < 20 || frequency > 20000) {
            throw new Error(`Frecuencia inválida: ${frequency}Hz (debe estar entre 20-20000Hz)`);
        }
        
        if (typeof duration !== 'number' || duration < 10 || duration > 10000) {
            throw new Error(`Duración inválida: ${duration}ms (debe estar entre 10-10000ms)`);
        }

        const validatedVolume = validateVolume(volume);
        
        return new Promise((resolve, reject) => {
            const audioTask = {
                type: 'tone',
                frequency,
                duration,
                volume: validatedVolume,
                resolve,
                reject,
                timestamp: Date.now(),
                priority: 'normal'
            };
            
            this.audioQueue.push(audioTask);
            this.logger.debug(`Tono encolado: ${frequency}Hz, ${duration}ms, vol: ${Math.round(validatedVolume * 100)}%`);
            
            this.processAudioQueue();
        });
    }

    async playBuffer(buffer, options = {}) {
        if (!buffer || buffer.length === 0) {
            throw new Error('Buffer de audio inválido o vacío');
        }

        return new Promise((resolve, reject) => {
            const audioTask = {
                type: 'buffer',
                buffer,
                options,
                resolve,
                reject,
                timestamp: Date.now(),
                priority: options.priority || 'normal'
            };
            
            this.audioQueue.push(audioTask);
            this.logger.debug(`Buffer encolado: ${buffer.length} bytes`);
            
            this.processAudioQueue();
        });
    }

    async processAudioQueue() {
        if (this.isProcessingAudio || this.audioQueue.length === 0 || this.queueProcessingPaused) {
            return;
        }

        this.isProcessingAudio = true;
        this.logger.debug(`Procesando cola de audio: ${this.audioQueue.length} elementos`);
        
        // LÓGICA SIMPLEX: Pausar escucha durante transmisión
        if (this.isRecording) {
            this.pauseRecording();
            this.logger.debug('SIMPLEX: Escucha pausada para transmisión');
        }
        
        // Emitir evento de que empezamos a transmitir
        this.emit('transmission_started', {
            queueLength: this.audioQueue.length,
            timestamp: Date.now()
        });
        
        while (this.audioQueue.length > 0 && !this.queueProcessingPaused) {
            // Ordenar por prioridad (high > normal > low)
            this.audioQueue.sort((a, b) => {
                const priorities = { high: 3, normal: 2, low: 1 };
                return (priorities[b.priority] || 2) - (priorities[a.priority] || 2);
            });
            
            const audioItem = this.audioQueue.shift();
            
            try {
                if (audioItem.type === 'tone') {
                    await this.generateAndPlayTone(
                        audioItem.frequency, 
                        audioItem.duration, 
                        audioItem.volume
                    );
                } else if (audioItem.type === 'buffer') {
                    await this.playBufferWithAplay(audioItem.buffer, audioItem.options);
                }
                
                audioItem.resolve();
                
            } catch (error) {
                this.logger.warn(`Error reproduciendo audio: ${error.message}`);
                if (audioItem.reject) {
                    audioItem.reject(error);
                } else {
                    audioItem.resolve(); // Fallback para compatibilidad
                }
            }

            // Pausa entre elementos usando constante
            await delay(DELAYS.SHORT / 4); // 25ms
        }

        this.isProcessingAudio = false;
        this.logger.debug('Cola de audio procesada completamente');
        
        // Emitir evento de que terminamos de transmitir
        this.emit('transmission_ended', {
            timestamp: Date.now()
        });
        
        // LÓGICA SIMPLEX: Reanudar escucha después de transmisión
        if (!this.isRecording) {
            // Pequeño delay para evitar capturar el final de nuestra propia transmisión
            setTimeout(() => {
                this.resumeRecording();
                this.logger.debug('SIMPLEX: Escucha reanudada post-transmisión');
            }, 100); // 100ms delay
        }
    }

    async generateAndPlayTone(frequency, duration, volume = 0.5) {
        return new Promise((resolve, reject) => {
            const tempFile = path.join(this.tempDir, `tone_${Date.now()}_${frequency}.wav`);
            const durationSeconds = (duration / 1000).toFixed(3);
            
            this.logger.debug(`Generando tono: ${frequency}Hz, ${duration}ms, vol: ${volume}`);
            
            // Generar tono WAV usando sox
            const sox = spawn('sox', [
                '-n',
                '-r', this.sampleRate.toString(),
                '-c', this.channels.toString(),
                tempFile,
                'synth', durationSeconds,
                'sine', frequency.toString(),
                'vol', volume.toString()
            ]);

            let soxTimeout = null;
            
            // Timeout para sox
            soxTimeout = setTimeout(() => {
                if (!sox.killed) {
                    sox.kill('SIGTERM');
                    this.cleanupTempFile(tempFile);
                    reject(new Error('Sox timeout - generación de tono cancelada'));
                }
            }, 5000);

            sox.on('close', (code) => {
                if (soxTimeout) {clearTimeout(soxTimeout);}
                
                if (code === 0) {
                    // Primero intentar con PulseAudio para evitar conflictos de dispositivo
                    this.playWithPaplay(tempFile).then(() => {
                        this.cleanupTempFile(tempFile);
                        resolve();
                    }).catch(async (paError) => {
                        this.logger.debug(`Paplay falló: ${paError.message}, intentando aplay`);
                        
                        // Fallback 1: Intentar con aplay
                        try {
                            await this.playWithAplay(tempFile, duration);
                            this.cleanupTempFile(tempFile);
                            resolve();
                            return;
                        } catch (aplayError) {
                            this.cleanupTempFile(tempFile);
                            this.logger.debug(`Aplay también falló: ${aplayError.message}`);
                        }
                        
                        // Fallback 2: Usar método sin archivo
                        this.playToneWithoutFile(frequency, duration).then(resolve).catch(() => resolve());
                    });
                } else {
                    this.logger.warn(`Sox falló con código ${code}, usando fallback beep`);
                    this.playToneWithBeep(frequency, duration).then(resolve).catch(() => resolve());
                }
            });

            sox.on('error', (err) => {
                if (soxTimeout) {clearTimeout(soxTimeout);}
                this.logger.warn(`Error en sox: ${err.message}, usando fallback directo`);
                this.playToneWithoutFile(frequency, duration).then(resolve).catch(() => resolve());
            });
        });
    }

    async playWithAplay(filePath, expectedDuration) {
        return new Promise((resolve, reject) => {
            // Detectar formato de archivo
            const isMP3 = filePath.toLowerCase().endsWith('.mp3');

            let player, playerArgs;

            if (isMP3) {
                // Para MP3, usar mpg123 con salida ALSA
                player = 'mpg123';
                playerArgs = [
                    '-q',      // quiet mode
                    '-f', '65536'  // scale factor (volumen), 65536 = 200% (amplificado)
                ];

                // Especificar dispositivo ALSA si está configurado
                if (this.device && this.device !== 'default') {
                    playerArgs.push('-a', this.device);
                }
                playerArgs.push(filePath);
            } else {
                // Para WAV, usar aplay
                player = 'aplay';
                playerArgs = ['-q'];

                if (this.device && this.device !== 'default') {
                    playerArgs.push('-D', this.device);
                }
                playerArgs.push(filePath);
            }

            this.logger.debug(`Reproduciendo con ${player}: ${path.basename(filePath)}`);
            const audioPlayer = spawn(player, playerArgs);
            let playerTimeout = null;
            let stderr = '';

            // Capturar stderr para diagnóstico
            audioPlayer.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            // Timeout de seguridad con margen generoso (50% extra + 5s mínimo)
            const timeoutMs = Math.max(expectedDuration * 1.5 + 5000, 10000);
            playerTimeout = setTimeout(() => {
                if (!audioPlayer.killed) {
                    audioPlayer.kill('SIGTERM');
                    reject(new Error(`${player} timeout (${timeoutMs}ms)`));
                }
            }, timeoutMs);

            audioPlayer.on('close', (code) => {
                if (playerTimeout) {clearTimeout(playerTimeout);}

                if (code === 0) {
                    this.logger.debug(`${player} completado exitosamente`);
                    resolve();
                } else {
                    let errorMsg = `${player} falló con código ${code}`;
                    if (stderr.trim()) {
                        errorMsg += `: ${stderr.trim()}`;
                    }
                    reject(new Error(errorMsg));
                }
            });

            audioPlayer.on('error', (err) => {
                if (playerTimeout) {clearTimeout(playerTimeout);}
                reject(err);
            });
        });
    }

    async playWithPaplay(filePath) {
        return new Promise((resolve, reject) => {
            // Intentar con paplay sin especificar dispositivo para usar el default
            const paplay = spawn('paplay', ['--volume=65536', filePath]);
            let paplayTimeout = null;
            let stderr = '';
            
            // Capturar stderr para diagnóstico
            paplay.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            // Timeout de seguridad más generoso
            paplayTimeout = setTimeout(() => {
                if (!paplay.killed) {
                    paplay.kill('SIGTERM');
                    reject(new Error('paplay timeout'));
                }
            }, 8000);
            
            paplay.on('close', (code) => {
                if (paplayTimeout) {clearTimeout(paplayTimeout);}
                
                if (code === 0) {
                    this.logger.debug('paplay completado exitosamente');
                    resolve();
                } else {
                    let errorMsg = `paplay falló con código ${code}`;
                    if (stderr.trim()) {
                        errorMsg += `: ${stderr.trim()}`;
                    }
                    reject(new Error(errorMsg));
                }
            });
            
            paplay.on('error', (err) => {
                if (paplayTimeout) {clearTimeout(paplayTimeout);}
                reject(err);
            });
        });
    }

    /**
     * Reproducir archivo de audio con paplay específicamente para alertas meteorológicas
     * con timeout extendido para permitir mensajes largos
     */
    async playWeatherAlertWithPaplay(audioInput) {
        // Detectar si es un playlist de múltiples fragmentos
        if (audioInput && typeof audioInput === 'object' && audioInput.__isPlaylist) {
            this.logger.info(`Reproduciendo playlist secuencial: ${audioInput.totalFragments} fragmentos`);
            return this.playSequentialPlaylist(audioInput.files);
        }
        
        // Reproducción normal de un solo archivo
        const filePath = audioInput;
        return new Promise((resolve, reject) => {
            // LÓGICA SIMPLEX: Pausar escucha durante transmisión de alerta
            const wasRecording = this.isRecording;
            if (wasRecording) {
                this.pauseRecording();
                this.logger.debug('SIMPLEX: Escucha pausada para alerta meteorológica');
            }
            
            // Emitir evento de transmisión iniciada
            this.emit('transmission_started', {
                type: 'weather_alert',
                file: path.basename(filePath),
                timestamp: Date.now()
            });
            
            // Intentar con paplay sin especificar dispositivo para usar el default
            const paplay = spawn('paplay', ['--volume=65536', filePath]);
            let paplayTimeout = null;
            let stderr = '';
            
            // Capturar stderr para diagnóstico
            paplay.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            // Timeout dinámico para alertas meteorológicas (basado en tamaño del archivo)
            let timeoutDuration = 120000; // 2 minutos por defecto
            
            try {
                const stats = fs.statSync(filePath);
                const fileSizeMB = stats.size / (1024 * 1024);
                // Calcular timeout: 30s por cada MB + 90s base (máximo 5 minutos)
                timeoutDuration = Math.min(90000 + (fileSizeMB * 30000), 300000);
                this.logger.debug(`Timeout calculado: ${timeoutDuration}ms para archivo de ${fileSizeMB.toFixed(2)}MB`);
            } catch (error) {
                this.logger.debug('No se pudo calcular tamaño de archivo, usando timeout por defecto');
            }
            
            paplayTimeout = setTimeout(() => {
                if (!paplay.killed) {
                    this.logger.warn(`Timeout de ${timeoutDuration}ms alcanzado para alerta meteorológica`);
                    paplay.kill('SIGTERM');
                    
                    // SIMPLEX: Reanudar escucha después de timeout
                    if (wasRecording && !this.isRecording) {
                        setTimeout(() => {
                            this.resumeRecording();
                            this.logger.debug('SIMPLEX: Escucha reanudada post-timeout alerta');
                        }, 100);
                    }
                    
                    reject(new Error(`paplay timeout (${timeoutDuration}ms) para alerta meteorológica`));
                }
            }, timeoutDuration);
            
            paplay.on('close', async (code) => {
                if (paplayTimeout) {clearTimeout(paplayTimeout);}

                if (code === 0) {
                    // SIMPLEX: Reanudar escucha después de transmisión
                    if (wasRecording && !this.isRecording) {
                        setTimeout(() => {
                            this.resumeRecording();
                            this.logger.debug('SIMPLEX: Escucha reanudada post-alerta meteorológica');
                        }, 100); // 100ms delay
                    }

                    // Emitir evento de transmisión terminada
                    this.emit('transmission_ended', {
                        type: 'weather_alert',
                        file: path.basename(filePath),
                        timestamp: Date.now()
                    });

                    this.logger.debug(`paplay para alerta meteorológica completado exitosamente (timeout era ${timeoutDuration}ms)`);
                    resolve();
                } else {
                    // paplay falló, intentar con aplay como fallback
                    let errorMsg = `paplay para alerta meteorológica falló con código ${code}`;
                    if (stderr.trim()) {
                        errorMsg += `: ${stderr.trim()}`;
                    }
                    this.logger.warn(errorMsg);
                    this.logger.info('Intentando reproducir con aplay (fallback)...');

                    try {
                        // Calcular duración estimada del archivo para timeout de aplay
                        // Para MP3: ~1KB por segundo de audio aproximadamente
                        // Para WAV: depende del bitrate, asumimos 128kbps = 16KB/s
                        const stats = fs.statSync(filePath);
                        const fileSizeKB = stats.size / 1024;
                        const isMP3 = filePath.endsWith('.mp3');
                        const estimatedSeconds = isMP3 ? fileSizeKB : (fileSizeKB / 16);
                        const estimatedDuration = Math.max(5000, estimatedSeconds * 1000);

                        this.logger.debug(`Estimando duración de ${fileSizeKB.toFixed(1)}KB: ~${estimatedSeconds.toFixed(1)}s`);

                        await this.playWithAplay(filePath, estimatedDuration);

                        // SIMPLEX: Reanudar escucha después de transmisión
                        if (wasRecording && !this.isRecording) {
                            setTimeout(() => {
                                this.resumeRecording();
                                this.logger.debug('SIMPLEX: Escucha reanudada post-alerta meteorológica (aplay)');
                            }, 100);
                        }

                        // Emitir evento de transmisión terminada
                        this.emit('transmission_ended', {
                            type: 'weather_alert',
                            file: path.basename(filePath),
                            timestamp: Date.now()
                        });

                        this.logger.info('Alerta meteorológica reproducida exitosamente con aplay');
                        resolve();
                    } catch (aplayError) {
                        // SIMPLEX: Reanudar escucha después de error
                        if (wasRecording && !this.isRecording) {
                            setTimeout(() => {
                                this.resumeRecording();
                                this.logger.debug('SIMPLEX: Escucha reanudada post-error alerta');
                            }, 100);
                        }

                        this.logger.error(`Aplay también falló: ${aplayError.message}`);
                        reject(new Error(`Falló paplay y aplay: ${errorMsg}`));
                    }
                }
            });
            
            paplay.on('error', (err) => {
                if (paplayTimeout) {clearTimeout(paplayTimeout);}
                
                // SIMPLEX: Reanudar escucha después de error
                if (wasRecording && !this.isRecording) {
                    setTimeout(() => {
                        this.resumeRecording();
                        this.logger.debug('SIMPLEX: Escucha reanudada post-error alerta');
                    }, 100);
                }
                
                reject(err);
            });
        });
    }

    /**
     * Reproducir lista de archivos de audio secuencialmente
     */
    async playSequentialPlaylist(audioFiles) {
        for (let i = 0; i < audioFiles.length; i++) {
            const file = audioFiles[i];
            this.logger.debug(`Reproduciendo fragmento ${i + 1}/${audioFiles.length}: ${file}`);
            
            try {
                await this.playSingleAudioFile(file);
                // Pequeña pausa entre fragmentos para mejor fluidez
                if (i < audioFiles.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            } catch (error) {
                this.logger.warn(`Error reproduciendo fragmento ${i + 1}: ${error.message}`);
                // Continuar con el siguiente fragmento en caso de error
            }
        }
        this.logger.info('Playlist secuencial completado');
    }

    /**
     * Reproducir un solo archivo de audio sin verificar playlists
     */
    async playSingleAudioFile(filePath) {
        return new Promise((resolve, reject) => {
            const paplay = spawn('paplay', ['--volume=65536', filePath]);
            let paplayTimeout = null;
            let stderr = '';
            
            paplay.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            paplayTimeout = setTimeout(() => {
                if (!paplay.killed) {
                    paplay.kill('SIGTERM');
                    reject(new Error('paplay timeout para fragmento de audio'));
                }
            }, 15000); // 15 segundos por fragmento
            
            paplay.on('close', (code) => {
                if (paplayTimeout) {clearTimeout(paplayTimeout);}
                
                if (code === 0) {
                    this.logger.debug('Fragmento de audio completado exitosamente');
                    resolve();
                } else {
                    let errorMsg = `paplay para fragmento falló con código ${code}`;
                    if (stderr.trim()) {
                        errorMsg += `: ${stderr.trim()}`;
                    }
                    reject(new Error(errorMsg));
                }
            });
            
            paplay.on('error', (err) => {
                if (paplayTimeout) {clearTimeout(paplayTimeout);}
                reject(err);
            });
        });
    }

    async playToneWithBeep(frequency, duration) {
        return new Promise(async (resolve) => {
            try {
                this.logger.debug(`Fallback beep: ${frequency}Hz por ${duration}ms`);
                
                // Intentar con beep primero
                try {
                    const beep = spawn('beep', ['-f', frequency.toString(), '-l', duration.toString()]);
                    let beepCompleted = false;
                    
                    beep.on('close', (code) => {
                        if (!beepCompleted) {
                            beepCompleted = true;
                            if (code === 0) {
                                this.logger.debug('Beep completado exitosamente');
                            } else {
                                this.logger.debug(`Beep falló con código ${code}`);
                            }
                            resolve();
                        }
                    });
                    
                    beep.on('error', () => {
                        if (!beepCompleted) {
                            beepCompleted = true;
                            this.logger.debug('Beep falló, intentando speaker-test');
                            this.playWithSpeakerTest(frequency, duration).then(resolve).catch(() => resolve());
                        }
                    });

                    // Timeout de seguridad
                    setTimeout(() => {
                        if (!beepCompleted && !beep.killed) {
                            beepCompleted = true;
                            beep.kill('SIGTERM');
                            this.logger.debug('Beep timeout, intentando speaker-test');
                            this.playWithSpeakerTest(frequency, duration).then(resolve).catch(() => resolve());
                        }
                    }, duration + 1000);

                } catch (error) {
                    this.logger.debug('Error iniciando beep, intentando speaker-test');
                    await this.playWithSpeakerTest(frequency, duration);
                    resolve();
                }

            } catch (error) {
                this.logger.debug('Error en todos los fallbacks, resolviendo silenciosamente');
                resolve(); // Fallar silenciosamente
            }
        });
    }

    async playToneWithoutFile(frequency, duration) {
        return new Promise((resolve) => {
            try {
                this.logger.debug(`Generando tono directo: ${frequency}Hz por ${duration}ms`);
                const durationSeconds = (duration / 1000).toFixed(3);
                
                // Usar sox para generar directamente a paplay/aplay via pipe
                const sox = spawn('sox', [
                    '-n', '-t', 'wav', '-',
                    'synth', durationSeconds,
                    'sine', frequency.toString(),
                    'vol', '0.3'
                ]);
                
                // Intentar reproducir con paplay primero
                const paplay = spawn('paplay', ['--format=s16le', '--rate=44100', '--channels=1', '-']);
                let completed = false;
                
                // Conectar sox output a paplay input
                sox.stdout.pipe(paplay.stdin);
                
                const cleanup = () => {
                    if (!completed) {
                        completed = true;
                        try {
                            if (!sox.killed) {sox.kill('SIGTERM');}
                            if (!paplay.killed) {paplay.kill('SIGTERM');}
                        } catch (e) { /* ignore */ }
                    }
                };
                
                paplay.on('close', (code) => {
                    cleanup();
                    if (code === 0) {
                        this.logger.debug('Tono directo completado exitosamente');
                    } else {
                        this.logger.debug(`Tono directo terminó con código ${code}`);
                    }
                    resolve();
                });
                
                paplay.on('error', () => {
                    cleanup();
                    this.logger.debug('Error en tono directo, intentando beep');
                    this.playToneWithBeep(frequency, duration).then(resolve).catch(() => resolve());
                });
                
                sox.on('error', () => {
                    cleanup();
                    this.logger.debug('Error en sox directo, intentando beep');
                    this.playToneWithBeep(frequency, duration).then(resolve).catch(() => resolve());
                });
                
                // Timeout de seguridad
                setTimeout(() => {
                    if (!completed) {
                        cleanup();
                        this.logger.debug('Timeout en tono directo');
                        resolve();
                    }
                }, duration + 2000);
                
            } catch (error) {
                this.logger.debug('Error configurando tono directo, usando beep');
                this.playToneWithBeep(frequency, duration).then(resolve).catch(() => resolve());
            }
        });
    }

    async playWithSpeakerTest(frequency, duration) {
        return new Promise((resolve) => {
            try {
                this.logger.debug(`Fallback speaker-test: tono por ${duration}ms`);
                
                // speaker-test genera ruido rosa por defecto, mejor que nada
                const speakerTest = spawn('speaker-test', ['-t', 'sine', '-f', frequency.toString(), '-l', '1']);
                let completed = false;
                
                // Detener después de la duración especificada
                setTimeout(() => {
                    if (!completed && !speakerTest.killed) {
                        completed = true;
                        speakerTest.kill('SIGTERM');
                        this.logger.debug('speaker-test completado por timeout');
                        resolve();
                    }
                }, duration);
                
                speakerTest.on('close', () => {
                    if (!completed) {
                        completed = true;
                        this.logger.debug('speaker-test terminado');
                        resolve();
                    }
                });
                
                speakerTest.on('error', () => {
                    if (!completed) {
                        completed = true;
                        this.logger.debug('speaker-test falló, simulando con delay');
                        setTimeout(resolve, duration); // Simular duración con delay
                    }
                });
                
            } catch (error) {
                this.logger.debug('Error en speaker-test, simulando con delay');
                setTimeout(resolve, duration); // Simular duración con delay
            }
        });
    }

    async playBufferWithAplay(buffer, options = {}) {
        return new Promise((resolve, reject) => {
            if (!buffer || buffer.length === 0) {
                reject(new Error('Buffer de audio vacío o inválido'));
                return;
            }

            const tempFile = path.join(this.tempDir, `buffer_${Date.now()}.raw`);
            let aplayTimeout = null;
            
            try {
                // Escribir buffer a archivo temporal
                fs.writeFileSync(tempFile, buffer);
                this.logger.debug(`Buffer guardado temporalmente: ${tempFile} (${buffer.length} bytes)`);
                
                // Configurar parámetros de aplay
                const format = options.format || 'S16_LE';
                const channels = options.channels || this.channels;
                const sampleRate = options.sampleRate || this.sampleRate;
                
                const aplay = spawn('aplay', [
                    '-q', // Modo silencioso
                    '-f', format,
                    '-c', channels.toString(),
                    '-r', sampleRate.toString(),
                    tempFile
                ]);

                // Timeout de seguridad basado en tamaño del buffer
                const estimatedDuration = (buffer.length / (sampleRate * channels * 2)) * 1000;
                const timeoutDuration = Math.max(5000, estimatedDuration + 2000);
                
                aplayTimeout = setTimeout(() => {
                    if (!aplay.killed) {
                        this.logger.warn('aplay timeout, terminando proceso');
                        aplay.kill('SIGTERM');
                        this.cleanupTempFile(tempFile);
                        resolve(); // No fallar por timeout
                    }
                }, timeoutDuration);

                aplay.on('close', (code) => {
                    if (aplayTimeout) {clearTimeout(aplayTimeout);}
                    this.cleanupTempFile(tempFile);
                    
                    if (code === 0) {
                        this.logger.debug('Reproducción de buffer completada exitosamente');
                        resolve();
                    } else {
                        this.logger.warn(`aplay falló con código ${code}, pero continuando`);
                        resolve(); // No fallar por códigos de error de aplay
                    }
                });

                aplay.on('error', (err) => {
                    if (aplayTimeout) {clearTimeout(aplayTimeout);}
                    this.cleanupTempFile(tempFile);
                    this.logger.warn('Error en aplay:', err.message);
                    resolve(); // Fallar silenciosamente para mantener estabilidad
                });

            } catch (error) {
                if (aplayTimeout) {clearTimeout(aplayTimeout);}
                this.cleanupTempFile(tempFile);
                this.logger.error('Error preparando reproducción de buffer:', error.message);
                resolve(); // Fallar silenciosamente
            }
        });
    }

    cleanupTempFile(filepath) {
        setTimeout(() => {
            try {
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                }
            } catch (error) {
                // Ignorar errores de limpieza
            }
        }, 1000);
    }

    // ===== ROGER BEEP =====

    getRogerBeep() {
        return this.rogerBeep;
    }

    configureRogerBeep(config) {
        if (!this.rogerBeep) {
            this.logger.warn('Roger Beep no disponible');
            return false;
        }

        try {
            this.rogerBeep.loadConfig(config);
            this.logger.info('Roger Beep configurado exitosamente');
            return true;
        } catch (error) {
            this.logger.error('Error configurando Roger Beep:', error.message);
            return false;
        }
    }

    async testRogerBeep() {
        if (!this.rogerBeep) {
            this.logger.warn('Roger Beep no disponible para test');
            return false;
        }

        try {
            const result = await this.rogerBeep.test();
            this.logger.info('Test Roger Beep completado');
            return result.success;
        } catch (error) {
            this.logger.error('Error en test Roger Beep:', error.message);
            return false;
        }
    }

    toggleRogerBeep() {
        if (!this.rogerBeep) {
            return false;
        }

        return this.rogerBeep.toggle();
    }

    getRogerBeepStatus() {
        if (!this.rogerBeep) {
            return { enabled: false, type: 'none', volume: 0, duration: 0 };
        }

        return this.rogerBeep.getStatus();
    }

    // ===== GESTIÓN DEL CANAL =====

    getChannelStatus() {
        return {
            isActive: this.channelActivity.isActive,
            level: this.channelActivity.level,
            threshold: this.channelActivity.threshold,
            lastActivity: this.channelActivity.lastActivityTime
        };
    }

    setChannelThreshold(threshold) {
        const newThreshold = Math.max(0.001, Math.min(0.1, threshold));
        this.channelActivity.threshold = newThreshold;
        this.logger.info(`Umbral de canal actualizado: ${newThreshold.toFixed(4)}`);
        return newThreshold;
    }

    isSafeToTransmit() {
        // Seguro transmitir solo si no hay actividad de entrada ni transmisión en curso
        return !this.channelActivity.isActive && 
               !this.isProcessingAudio && 
               this.audioQueue.length === 0;
    }

    isTransmitting() {
        // Verificar si está transmitiendo (procesando audio o hay elementos en cola)
        return this.isProcessingAudio || this.audioQueue.length > 0;
    }

    // ===== DEBUG AUDIO =====
    
    async saveDebugAudio() {
        if (this.debugBuffer.length === 0) {
            this.logger.warn('No hay audio de debug para guardar');
            return null;
        }
        
        const timestamp = Date.now();
        const filename = `debug_audio_${timestamp}.wav`;
        const filepath = path.join(this.tempDir, filename);
        
        try {
            // Convertir float32 array a buffer de 16-bit PCM
            const int16Buffer = Buffer.alloc(this.debugBuffer.length * 2);
            for (let i = 0; i < this.debugBuffer.length; i++) {
                const sample = Math.max(-1, Math.min(1, this.debugBuffer[i]));
                const int16Sample = Math.round(sample * 32767);
                int16Buffer.writeInt16LE(int16Sample, i * 2);
            }
            
            // Crear header WAV simple
            const wavHeader = Buffer.alloc(44);
            wavHeader.write('RIFF', 0);
            wavHeader.writeUInt32LE(36 + int16Buffer.length, 4);
            wavHeader.write('WAVE', 8);
            wavHeader.write('fmt ', 12);
            wavHeader.writeUInt32LE(16, 16); // PCM format size
            wavHeader.writeUInt16LE(1, 20);  // PCM format
            wavHeader.writeUInt16LE(1, 22);  // Mono
            wavHeader.writeUInt32LE(this.sampleRate, 24); // Sample rate
            wavHeader.writeUInt32LE(this.sampleRate * 2, 28); // Byte rate
            wavHeader.writeUInt16LE(2, 32);  // Block align
            wavHeader.writeUInt16LE(16, 34); // Bits per sample
            wavHeader.write('data', 36);
            wavHeader.writeUInt32LE(int16Buffer.length, 40);
            
            const wavFile = Buffer.concat([wavHeader, int16Buffer]);
            fs.writeFileSync(filepath, wavFile);
            
            this.logger.info(`Audio de debug guardado: ${filepath} (${this.debugBuffer.length} muestras, ${(this.debugBuffer.length / this.sampleRate).toFixed(2)}s)`);
            
            // Limpiar buffer
            this.debugBuffer = [];
            
            return filepath;
            
        } catch (error) {
            this.logger.error('Error guardando audio de debug:', error.message);
            return null;
        }
    }

    // ===== GRABACIÓN TEMPORAL =====

    async recordTemporary(duration, sampleRate = 16000) {
        return new Promise((resolve) => {
            if (!duration || duration < 1 || duration > 60) {
                this.logger.error(`Duración de grabación inválida: ${duration}s (debe estar entre 1-60s)`);
                resolve(null);
                return;
            }

            const timestamp = Date.now();
            const filename = `temp_${timestamp}.wav`;
            const filepath = path.join(this.tempDir, filename);
            
            this.logger.info(`Iniciando grabación temporal: ${duration}s a ${sampleRate}Hz`);
            
            try {
                const recordingOptions = {
                    sampleRate: sampleRate,
                    channels: 1,
                    bitDepth: 16,
                    audioType: 'wav',
                    silence: '1.0',
                    device: this.device
                };

                const tempRecorder = recorder.record(recordingOptions);
                const fileStream = fs.createWriteStream(filepath);
                
                tempRecorder.stream().pipe(fileStream);
                
                // Timeout para detener grabación
                const recordingTimeout = setTimeout(() => {
                    try {
                        tempRecorder.stop();
                        fileStream.end();
                        this.logger.debug('Grabación temporal detenida');
                    } catch (error) {
                        this.logger.warn('Error deteniendo grabación temporal:', error.message);
                    }
                    
                    // Verificar que el archivo se creó correctamente
                    setTimeout(() => {
                        if (fs.existsSync(filepath)) {
                            const stats = fs.statSync(filepath);
                            this.logger.info(`Grabación temporal completada: ${filepath} (${stats.size} bytes)`);
                            resolve(filepath);
                        } else {
                            this.logger.error('Archivo de grabación temporal no encontrado');
                            resolve(null);
                        }
                    }, 500);
                    
                }, duration * 1000);
                
                // Error handler para el tempRecorder
                tempRecorder.stream().on('error', (error) => {
                    clearTimeout(recordingTimeout);
                    this.logger.error('Error en grabación temporal:', error.message);
                    this.cleanupTempFile(filepath);
                    resolve(null);
                });
                
            } catch (error) {
                this.logger.error('Error iniciando grabación temporal:', error.message);
                resolve(null);
            }
        });
    }

    // ===== CONTROL DE GRABACIÓN =====

    pauseRecording() {
        if (!this.captureAvailable) {
            return false; // No hacer nada si no hay captura
        }

        if (this.recordingStream && this.isRecording) {
            try {
                this.recordingStream.stop();
                this.isRecording = false;
                this.logger.debug('Grabación principal pausada');
                return true;
            } catch (error) {
                this.logger.warn('Error pausando grabación:', error.message);
                return false;
            }
        }
        this.logger.debug('No hay grabación activa para pausar');
        return false;
    }

    resumeRecording() {
        if (!this.captureAvailable) {
            return false; // No hacer nada si no hay captura
        }

        if (!this.isRecording) {
            this.logger.debug('Reanudando grabación principal');
            this.startRecording();
            return true;
        }
        this.logger.debug('Grabación ya activa, no se puede reanudar');
        return false;
    }

    // ===== UTILIDADES =====

    pauseQueueProcessing() {
        this.queueProcessingPaused = true;
        this.logger.info('Procesamiento de cola de audio pausado');
    }

    resumeQueueProcessing() {
        this.queueProcessingPaused = false;
        this.logger.info('Procesamiento de cola de audio reanudado');
        this.processAudioQueue(); // Reiniciar procesamiento
    }

    clearAudioQueue() {
        const queueLength = this.audioQueue.length;
        
        // Resolver todas las promesas pendientes
        this.audioQueue.forEach(item => {
            if (item.resolve) {
                item.resolve();
            }
        });
        
        this.audioQueue = [];
        
        // Terminar proceso actual
        if (this.currentAudioProcess && !this.currentAudioProcess.killed) {
            this.currentAudioProcess.kill('SIGTERM');
            this.currentAudioProcess = null;
        }
        
        this.isProcessingAudio = false;
        
        if (queueLength > 0) {
            this.logger.info(`Cola de audio limpiada: ${queueLength} elementos descartados`);
        }
    }

    // ===== ESTADO Y DIAGNÓSTICO =====

    getStatus() {
        // Determinar si el canal está ocupado (entrada O transmisión)
        const isChannelBusy = this.channelActivity.isActive ||
                             this.isProcessingAudio ||
                             this.audioQueue.length > 0;

        return {
            audio: {
                captureAvailable: this.captureAvailable,
                isRecording: this.isRecording,
                isProcessingAudio: this.isProcessingAudio,
                audioQueueLength: this.audioQueue.length,
                status: this.isRecording ? 'active' : (this.captureAvailable ? 'ready' : 'output-only')
            },
            channel: {
                isActive: isChannelBusy,
                level: this.channelActivity.level,
                threshold: this.channelActivity.threshold,
                busy: isChannelBusy,
                inputActivity: this.channelActivity.isActive,
                transmitting: this.isProcessingAudio || this.audioQueue.length > 0,
                dtmfEnabled: this.captureAvailable
            },
            rogerBeep: this.rogerBeep ? this.rogerBeep.getStatus() : { enabled: false }
        };
    }

    async healthCheck() {
        const status = this.getStatus();
        
        this.logger.info('=== AudioManager Health Check ===');
        
        // Estado de grabación
        if (status.audio.isRecording) {
            this.logger.info('Grabación: ACTIVA');
        } else {
            this.logger.warn('Grabación: INACTIVA');
        }
        
        // Cola de audio
        this.logger.info(`Cola de audio: ${status.audio.audioQueueLength} elementos`);
        
        // Estado del canal
        if (status.channel.isActive) {
            this.logger.info('Canal: OCUPADO');
        } else {
            this.logger.info('Canal: LIBRE');
        }
        
        // Roger Beep
        if (status.rogerBeep.enabled) {
            this.logger.info('Roger Beep: HABILITADO');
            // Test Roger Beep si está disponible
            if (this.rogerBeep) {
                try {
                    const testResult = await this.testRogerBeep();
                    if (testResult) {
                        this.logger.info('Roger Beep Test: EXITOSO');
                    } else {
                        this.logger.warn('Roger Beep Test: FALLIDO');
                    }
                } catch (error) {
                    this.logger.error('Roger Beep Test: ERROR -', error.message);
                }
            }
        } else {
            this.logger.info('Roger Beep: DESHABILITADO');
        }
        
        // Estado general del módulo
        this.logger.info(`Estado general: ${this.state}`);
        this.logger.info('=== Fin Health Check ===');
        
        return status;
    }

    // ===== CLEANUP AUTOMÁTICO 24/7 =====
    
    /**
     * Iniciar timer de cleanup automático
     */
    startCleanupTimer() {
        this.cleanupTimer = setInterval(() => {
            this.performCleanup().catch(error => {
                this.logger.warn('Error en cleanup automático:', error.message);
            });
        }, this.cleanupConfig.interval);
        
        // Cleanup inicial después de 30 segundos del arranque
        setTimeout(() => {
            this.performCleanup().catch(error => {
                this.logger.debug('Error en cleanup inicial:', error.message);
            });
        }, 30000);
        
        this.logger.info(`Cleanup automático programado cada ${this.cleanupConfig.interval / (60 * 60 * 1000)} horas`);
    }
    
    /**
     * Ejecutar limpieza completa de archivos temporales
     */
    async performCleanup() {
        try {
            const startTime = Date.now();
            let totalCleaned = 0;
            let totalSize = 0;
            
            this.logger.info('Iniciando cleanup automático de archivos temporales...');
            
            // 1. Limpiar directorio temp principal
            const tempCleaned = await this.cleanupDirectory(this.tempDir, 'temp');
            totalCleaned += tempCleaned.count;
            totalSize += tempCleaned.size;
            
            // 2. Limpiar directorio de sounds/temp si existe
            const soundsTempDir = path.join(this.soundsDir, 'temp');
            if (fs.existsSync(soundsTempDir)) {
                const soundsCleaned = await this.cleanupDirectory(soundsTempDir, 'sounds/temp');
                totalCleaned += soundsCleaned.count;
                totalSize += soundsCleaned.size;
            }
            
            // 3. Limpiar archivos .tmp del sistema
            const tmpCleaned = await this.cleanupSystemTmpFiles();
            totalCleaned += tmpCleaned.count;
            totalSize += tmpCleaned.size;
            
            const duration = Date.now() - startTime;
            const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
            
            if (totalCleaned > 0) {
                this.logger.info(`Cleanup completado: ${totalCleaned} archivos eliminados (${sizeMB}MB) en ${duration}ms`);
            } else {
                this.logger.debug(`Cleanup completado: directorio temp limpio en ${duration}ms`);
            }
            
        } catch (error) {
            this.logger.error('Error en cleanup automático:', error.message);
        }
    }
    
    /**
     * Limpiar un directorio específico
     */
    async cleanupDirectory(directory, name) {
        let cleaned = 0;
        let freedSize = 0;
        
        if (!fs.existsSync(directory)) {
            return { count: cleaned, size: freedSize };
        }
        
        try {
            const files = fs.readdirSync(directory);
            const now = Date.now();
            
            for (const file of files) {
                const filePath = path.join(directory, file);
                
                try {
                    const stats = fs.statSync(filePath);
                    const age = now - stats.mtimeMs;
                    
                    // Eliminar archivos temporales antiguos
                    if (this.shouldCleanFile(file, age, stats.size)) {
                        const fileSize = stats.size;
                        fs.unlinkSync(filePath);
                        cleaned++;
                        freedSize += fileSize;
                        
                        this.logger.debug(`${name}: ${file} (${(fileSize / 1024).toFixed(1)}KB, ${Math.round(age / (60 * 1000))} min)`);
                    }
                } catch (fileError) {
                    this.logger.debug(`Error procesando ${filePath}:`, fileError.message);
                }
            }
            
        } catch (error) {
            this.logger.warn(`Error limpiando directorio ${name}:`, error.message);
        }
        
        return { count: cleaned, size: freedSize };
    }
    
    /**
     * Determinar si un archivo debe ser limpiado
     */
    shouldCleanFile(filename, age, size) {
        // Archivos temporales de audio
        const tempAudioPatterns = [
            /^combined_\d+\.mp3$/,      // combined_timestamp.mp3
            /^temp_\d+\.(wav|mp3)$/,    // temp_timestamp.wav/mp3
            /^tts_\d+\.(wav|mp3)$/,     // tts_timestamp.wav/mp3
            /^tone_\d+\.wav$/,          // tone_timestamp.wav
            /^record_\d+\.wav$/,        // record_timestamp.wav
            /^speech_\d+\.wav$/,        // speech_timestamp.wav
            /^google_tts_\d+\.mp3$/,    // google_tts_timestamp.mp3
            /^espeak_\d+\.wav$/         // espeak_timestamp.wav
        ];
        
        const isTemporaryFile = tempAudioPatterns.some(pattern => pattern.test(filename));
        
        if (isTemporaryFile) {
            // Eliminar archivos temporales de audio > 2 horas
            return age > this.cleanupConfig.maxFileAge;
        }
        
        // Archivos .tmp del sistema
        if (filename.endsWith('.tmp')) {
            // Eliminar archivos .tmp > 30 minutos
            return age > (30 * 60 * 1000);
        }
        
        // Archivos muy antiguos (> 24 horas) sin importar el tipo
        if (age > (24 * 60 * 60 * 1000)) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Limpiar archivos .tmp del sistema operativo
     */
    async cleanupSystemTmpFiles() {
        let cleaned = 0;
        let freedSize = 0;
        
        const systemTmpDirs = ['/tmp', '/var/tmp'].filter(dir => {
            try {
                return fs.existsSync(dir) && fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK) === undefined;
            } catch {
                return false;
            }
        });
        
        for (const tmpDir of systemTmpDirs) {
            try {
                const files = fs.readdirSync(tmpDir);
                const now = Date.now();
                
                for (const file of files) {
                    // Solo procesar archivos relacionados con nuestro proceso
                    if (file.includes('vx200') || file.includes('nodejs') || file.includes('espeak') || file.includes('sox')) {
                        const filePath = path.join(tmpDir, file);
                        
                        try {
                            const stats = fs.statSync(filePath);
                            const age = now - stats.mtimeMs;
                            
                            // Limpiar archivos temporales del sistema > 1 hora
                            if (age > (60 * 60 * 1000) && stats.isFile()) {
                                const fileSize = stats.size;
                                fs.unlinkSync(filePath);
                                cleaned++;
                                freedSize += fileSize;
                                
                                this.logger.debug(`sistema: ${file} (${(fileSize / 1024).toFixed(1)}KB)`);
                            }
                        } catch (fileError) {
                            // Ignorar errores de permisos
                        }
                    }
                }
            } catch (error) {
                // Ignorar errores de acceso a directorios del sistema
            }
        }
        
        return { count: cleaned, size: freedSize };
    }
    
    /**
     * Obtener estadísticas de uso de espacio temporal
     */
    getTempSpaceStats() {
        const stats = {
            directories: {},
            total: { files: 0, size: 0 }
        };
        
        const dirsToCheck = [
            { path: this.tempDir, name: 'temp' },
            { path: path.join(this.soundsDir, 'temp'), name: 'sounds/temp' }
        ];
        
        dirsToCheck.forEach(({ path: dirPath, name }) => {
            if (fs.existsSync(dirPath)) {
                try {
                    const files = fs.readdirSync(dirPath);
                    let dirSize = 0;
                    let fileCount = 0;
                    
                    files.forEach(file => {
                        try {
                            const filePath = path.join(dirPath, file);
                            const fileStats = fs.statSync(filePath);
                            if (fileStats.isFile()) {
                                dirSize += fileStats.size;
                                fileCount++;
                            }
                        } catch (error) {
                            // Ignorar errores de archivos individuales
                        }
                    });
                    
                    stats.directories[name] = {
                        files: fileCount,
                        size: dirSize,
                        sizeMB: (dirSize / (1024 * 1024)).toFixed(2)
                    };
                    
                    stats.total.files += fileCount;
                    stats.total.size += dirSize;
                } catch (error) {
                    stats.directories[name] = { files: 0, size: 0, sizeMB: '0.00', error: error.message };
                }
            }
        });
        
        stats.total.sizeMB = (stats.total.size / (1024 * 1024)).toFixed(2);
        return stats;
    }

    // ===== CIERRE =====

    stop() {
        this.logger.info('Deteniendo AudioManager...');
        
        // Cambiar estado
        this.state = MODULE_STATES.DISABLED;
        
        // Detener grabación
        if (this.recordingStream) {
            try {
                this.recordingStream.stop();
                this.logger.debug('Stream de grabación detenido');
            } catch (error) {
                this.logger.warn('Error deteniendo grabación:', error.message);
            }
            this.isRecording = false;
        }
        
        // Limpiar timeouts y timers
        if (this.dtmfTimeout) {
            clearTimeout(this.dtmfTimeout);
            this.dtmfTimeout = null;
            this.logger.debug('Timeout DTMF limpiado');
        }
        
        if (this.channelActivity.activityTimer) {
            clearTimeout(this.channelActivity.activityTimer);
            this.channelActivity.activityTimer = null;
            this.logger.debug('Timer de actividad de canal limpiado');
        }
        
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
            this.logger.debug('Timer de cleanup automático limpiado');
        }
        
        // Limpiar cola de audio
        this.clearAudioQueue();
        
        // Limpiar referencias
        this.dtmfBuffer = '';
        this.channelActivity.isActive = false;
        
        // Remover listeners
        this.removeAllListeners();
        
        this.logger.info('AudioManager detenido completamente');
    }
}

module.exports = AudioManager;

/*
🔧 MÉTODOS PRINCIPALES:
- speak(text) - TTS + Roger Beep automático
- speakNoRoger(text) - TTS sin Roger Beep
- toggleRogerBeep() - Control desde panel web
- testRogerBeep() - Prueba desde panel web
- getRogerBeepStatus() - Estado actual

📡 USO:
const audioManager = new AudioManager();
audioManager.start();
await audioManager.speak("Mensaje"); // Con Roger Beep automático
await audioManager.speakNoRoger("Mensaje"); // Sin Roger Beep
*/