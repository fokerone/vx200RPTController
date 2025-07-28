const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process'); 
const recorder = require('node-record-lpcm16');
const Speaker = require('speaker');
const DTMFDecoder = require('./dtmfDecoder');
const EventEmitter = require('events');
const say = require('say');

// Importar RogerBeep
const RogerBeep = require('./rogerBeep');

class AudioManager extends EventEmitter {
    constructor() {
        super();
        this.sampleRate = 48000;
        this.channels = 1;
        this.bitDepth = 16;
        
        this.dtmfDecoder = new DTMFDecoder(this.sampleRate);
        this.isRecording = false;
        this.recordingStream = null;
        this.dtmfBuffer = '';
        this.dtmfTimeout = null;

        // ===== GESTIÓN MEJORADA DE SPEAKER =====
        this.currentSpeaker = null;
        this.speakerQueue = [];
        this.isPlayingAudio = false;

        // Inicializar Roger Beep
        this.rogerBeep = new RogerBeep(this);

        this.channelActivity = {
            isActive: false,
            level: 0,
            threshold: 0.02,
            sustainTime: 1000,
            lastActivityTime: 0,
            activityTimer: null
        };
        
        console.log('🎤 AudioManager inicializado con Roger Beep y Speaker mejorado');
    }

    start() {
        this.startRecording();
        console.log('🔊 Audio iniciado - Escuchando DTMF...');
    }

    startRecording() {
        const recordingOptions = {
            sampleRate: this.sampleRate,
            channels: this.channels,
            bitDepth: this.bitDepth,
            audioType: 'raw',
            silence: '5.0',
            device: 'hw:0,0'
        };

        this.recordingStream = recorder.record(recordingOptions);
        
        this.recordingStream.stream()
            .on('data', (audioData) => {
                this.processAudioData(audioData);
            })
            .on('error', (err) => {
                console.error('❌ Error de audio:', err);
            });

        this.isRecording = true;
    }

    processAudioData(audioData) {
        const audioArray = [];
        for (let i = 0; i < audioData.length; i += 2) {
            const sample = audioData.readInt16LE(i) / 32768.0;
            audioArray.push(sample);
        }

        this.detectChannelActivity(audioArray);
        this.dtmfDecoder.detectSequence(audioArray, (dtmf) => {
            this.handleDTMF(dtmf);
        });

        this.emit('audio', audioArray);
    }

    handleDTMF(dtmf) {
        this.dtmfBuffer += dtmf;
        
        if (this.dtmfTimeout) {
            clearTimeout(this.dtmfTimeout);
        }
        
        this.dtmfTimeout = setTimeout(() => {
            if (this.dtmfBuffer.length > 0) {
                console.log(`📞 Secuencia DTMF completa: ${this.dtmfBuffer}`);
                this.emit('dtmf', this.dtmfBuffer);
                this.dtmfBuffer = '';
            }
        }, 2000);
    }

    detectChannelActivity(audioArray) {
        const rmsLevel = Math.sqrt(
            audioArray.reduce((sum, sample) => sum + sample * sample, 0) / audioArray.length
        );
        
        this.channelActivity.level = rmsLevel;
        
        const now = Date.now();
        
        if (rmsLevel > this.channelActivity.threshold) {
            this.channelActivity.lastActivityTime = now;
            
            if (!this.channelActivity.isActive) {
                this.channelActivity.isActive = true;
                console.log('📻 Canal ACTIVO - Detectada transmisión');
                this.emit('channel_active', {
                    level: rmsLevel,
                    timestamp: now
                });
            }
            
            if (this.channelActivity.activityTimer) {
                clearTimeout(this.channelActivity.activityTimer);
                this.channelActivity.activityTimer = null;
            }
            
            this.channelActivity.activityTimer = setTimeout(() => {
                if (this.channelActivity.isActive) {
                    this.channelActivity.isActive = false;
                    console.log('📻 Canal LIBRE - Fin de transmisión');
                    this.emit('channel_inactive', {
                        duration: now - this.channelActivity.lastActivityTime,
                        timestamp: now
                    });
                }
            }, this.channelActivity.sustainTime);
        }
        
        this.emit('signal_level', {
            level: rmsLevel,
            active: this.channelActivity.isActive,
            timestamp: now
        });
    }

    getChannelStatus() {
        return {
            isActive: this.channelActivity.isActive,
            level: this.channelActivity.level,
            threshold: this.channelActivity.threshold,
            lastActivity: this.channelActivity.lastActivityTime
        };
    }

    setChannelThreshold(threshold) {
        this.channelActivity.threshold = Math.max(0.001, Math.min(0.1, threshold));
        console.log(`🎚️  Umbral de canal ajustado a: ${this.channelActivity.threshold}`);
    }

    isSafeToTransmit() {
        return !this.channelActivity.isActive;
    }

    /**
     * Función speak principal - CON ROGER BEEP AUTOMÁTICO
     */
    speak(text, options = {}) {
        const voice = options.voice || 'es';
        const speed = options.speed || '150';
        
        console.log(`🗣️ Hablando: "${text}"`);
        
        return new Promise((resolve, reject) => {
            const { spawn } = require('child_process');
            
            const espeak = spawn('espeak', [
                '-v', voice,
                '-s', speed,
                '-a', '100',
                text
            ]);
            
            espeak.on('close', async (code) => {
                if (code === 0) {
                    console.log('✅ TTS completado');
                    
                    // REPRODUCIR ROGER BEEP después del TTS
                    if (options.rogerBeep !== false) {
                        try {
                            await this.rogerBeep.play(options.rogerBeepType);
                        } catch (error) {
                            console.log('⚠️  Error en roger beep:', error.message);
                        }
                    }
                    
                    resolve();
                } else {
                    console.error(`❌ Error TTS, código: ${code}`);
                    reject(new Error(`espeak failed with code ${code}`));
                }
            });
            
            espeak.on('error', (err) => {
                console.error('❌ Error ejecutando espeak:', err);
                reject(err);
            });
        });
    }

    /**
     * Hablar SIN roger beep
     */
    speakNoBeep(text, options = {}) {
        return this.speak(text, { ...options, rogerBeep: false });
    }

    /**
     * Configurar Roger Beep
     */
    configureRogerBeep(config) {
        if (config.type) this.rogerBeep.setType(config.type);
        if (config.volume !== undefined) this.rogerBeep.setVolume(config.volume);
        if (config.duration !== undefined) this.rogerBeep.setDuration(config.duration);
        if (config.delay !== undefined) this.rogerBeep.setDelay(config.delay);
        if (config.enabled !== undefined) this.rogerBeep.setEnabled(config.enabled);
        
        console.log('🔧 Roger Beep configurado');
    }

    getRogerBeep() {
        return this.rogerBeep;
    }

    async testRogerBeep(type = null) {
        await this.rogerBeep.play(type);
    }

    // ===== GESTIÓN MEJORADA DE TONOS =====

    /**
     * Reproducir tono con gestión mejorada de Speaker
     */
    playTone(frequency, duration, volume = 0.5) {
        console.log(`🎵 Tono en cola: ${frequency}Hz por ${duration}ms`);
        
        return new Promise((resolve) => {
            // Agregar a la cola
            this.speakerQueue.push({
                type: 'tone',
                frequency,
                duration,
                volume,
                resolve
            });
            
            // Procesar cola si no está ocupada
            this.processSpeakerQueue();
        });
    }

    /**
     * Reproducir buffer con gestión mejorada
     */
    playBuffer(buffer) {
        console.log(`🎵 Buffer en cola: ${buffer.length} bytes`);
        
        return new Promise((resolve) => {
            this.speakerQueue.push({
                type: 'buffer',
                buffer,
                resolve
            });
            
            this.processSpeakerQueue();
        });
    }

    /**
     * Procesar cola de reproducción de audio
     */
    async processSpeakerQueue() {
        // Si ya está reproduciendo, esperar
        if (this.isPlayingAudio) {
            return;
        }

        // Si no hay nada en cola, salir
        if (this.speakerQueue.length === 0) {
            return;
        }

        this.isPlayingAudio = true;
        const audioItem = this.speakerQueue.shift();

        try {
            if (audioItem.type === 'tone') {
                await this.playToneInternal(audioItem.frequency, audioItem.duration, audioItem.volume);
            } else if (audioItem.type === 'buffer') {
                await this.playBufferInternal(audioItem.buffer);
            }
            
            audioItem.resolve();
            
        } catch (error) {
            console.log(`⚠️  Error reproduciendo audio: ${error.message}`);
            audioItem.resolve(); // Resolver de todas formas para continuar
        }

        this.isPlayingAudio = false;

        // Procesar siguiente item en cola
        if (this.speakerQueue.length > 0) {
            // Pequeña pausa entre reproducciones
            setTimeout(() => {
                this.processSpeakerQueue();
            }, 50);
        }
    }

    /**
     * Reproducir tono interno (sin cola)
     */
    async playToneInternal(frequency, duration, volume = 0.5) {
        return new Promise((resolve, reject) => {
            try {
                // Cerrar speaker anterior si existe
                if (this.currentSpeaker) {
                    try {
                        this.currentSpeaker.end();
                        this.currentSpeaker = null;
                    } catch (err) {
                        console.log('⚠️  Error cerrando speaker anterior:', err.message);
                    }
                }

                // Generar tono
                const sampleCount = Math.floor(this.sampleRate * duration / 1000);
                const buffer = Buffer.alloc(sampleCount * 2);
                
                for (let i = 0; i < sampleCount; i++) {
                    const sample = Math.sin(2 * Math.PI * frequency * i / this.sampleRate) * volume;
                    const value = Math.round(sample * 32767);
                    buffer.writeInt16LE(value, i * 2);
                }

                // Crear nuevo speaker
                this.currentSpeaker = new Speaker({
                    channels: this.channels,
                    bitDepth: this.bitDepth,
                    sampleRate: this.sampleRate,
                    device: 'default'
                });

                // Configurar eventos
                this.currentSpeaker.on('error', (err) => {
                    console.log(`⚠️  Error speaker: ${err.message}`);
                    this.currentSpeaker = null;
                    resolve(); // No rechazar, continuar
                });

                this.currentSpeaker.on('close', () => {
                    this.currentSpeaker = null;
                    resolve();
                });

                // Timeout de seguridad
                const timeout = setTimeout(() => {
                    if (this.currentSpeaker) {
                        try {
                            this.currentSpeaker.end();
                        } catch (err) {
                            // Ignorar errores al cerrar
                        }
                        this.currentSpeaker = null;
                    }
                    resolve();
                }, duration + 1000);

                // Escribir y cerrar
                this.currentSpeaker.write(buffer);
                this.currentSpeaker.end();

                // Limpiar timeout si se resuelve antes
                this.currentSpeaker.on('close', () => {
                    clearTimeout(timeout);
                });

            } catch (error) {
                console.log(`⚠️  Error creando speaker: ${error.message}`);
                this.currentSpeaker = null;
                resolve(); // Continuar sin el audio
            }
        });
    }

    /**
     * Reproducir buffer interno (sin cola)
     */
    async playBufferInternal(buffer) {
        return new Promise((resolve, reject) => {
            try {
                // Cerrar speaker anterior si existe
                if (this.currentSpeaker) {
                    try {
                        this.currentSpeaker.end();
                        this.currentSpeaker = null;
                    } catch (err) {
                        console.log('⚠️  Error cerrando speaker anterior:', err.message);
                    }
                }

                // Crear nuevo speaker
                this.currentSpeaker = new Speaker({
                    channels: this.channels,
                    bitDepth: this.bitDepth,
                    sampleRate: this.sampleRate,
                    device: 'default'
                });

                // Configurar eventos
                this.currentSpeaker.on('error', (err) => {
                    console.log(`⚠️  Error speaker: ${err.message}`);
                    this.currentSpeaker = null;
                    resolve();
                });

                this.currentSpeaker.on('close', () => {
                    this.currentSpeaker = null;
                    resolve();
                });

                // Timeout de seguridad
                const timeout = setTimeout(() => {
                    if (this.currentSpeaker) {
                        try {
                            this.currentSpeaker.end();
                        } catch (err) {
                            // Ignorar errores
                        }
                        this.currentSpeaker = null;
                    }
                    resolve();
                }, 5000);

                // Escribir y cerrar
                this.currentSpeaker.write(buffer);
                this.currentSpeaker.end();

                // Limpiar timeout
                this.currentSpeaker.on('close', () => {
                    clearTimeout(timeout);
                });

            } catch (error) {
                console.log(`⚠️  Error creando speaker: ${error.message}`);
                this.currentSpeaker = null;
                resolve();
            }
        });
    }

    /**
     * Limpiar cola de audio (para emergencias)
     */
    clearAudioQueue() {
        console.log('🧹 Limpiando cola de audio...');
        
        // Resolver todas las promesas pendientes
        this.speakerQueue.forEach(item => {
            if (item.resolve) {
                item.resolve();
            }
        });
        
        // Limpiar cola
        this.speakerQueue = [];
        
        // Cerrar speaker actual
        if (this.currentSpeaker) {
            try {
                this.currentSpeaker.end();
            } catch (err) {
                // Ignorar errores
            }
            this.currentSpeaker = null;
        }
        
        this.isPlayingAudio = false;
        
        console.log('✅ Cola de audio limpiada');
    }

    pauseRecording() {
        if (this.recordingStream && this.isRecording) {
            console.log('⏸️  Pausando grabación principal...');
            this.recordingStream.stop();
            this.isRecording = false;
            return true;
        }
        return false;
    }

    resumeRecording() {
        if (!this.isRecording) {
            console.log('▶️  Reanudando grabación principal...');
            this.startRecording();
            return true;
        }
        return false;
    }

    async recordTemporary(duration, sampleRate = 16000) {
        return new Promise((resolve) => {
            const timestamp = Date.now();
            const filename = `temp_${timestamp}.wav`;
            const filepath = path.join(__dirname, '../../sounds', filename);
            
            console.log(`🎙️  Grabación temporal por ${duration} segundos...`);
            
            const dir = path.dirname(filepath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            try {
                const recordingOptions = {
                    sampleRate: sampleRate,
                    channels: 1,
                    bitDepth: 16,
                    audioType: 'wav',
                    silence: '1.0',
                    device: null
                };

                const tempRecorder = recorder.record(recordingOptions);
                const fileStream = fs.createWriteStream(filepath);
                
                tempRecorder.stream().pipe(fileStream);
                
                setTimeout(() => {
                    tempRecorder.stop();
                    fileStream.end();
                    
                    setTimeout(() => {
                        if (fs.existsSync(filepath)) {
                            console.log('✅ Grabación temporal completada');
                            resolve(filepath);
                        } else {
                            console.log('❌ Archivo de grabación no encontrado');
                            resolve(null);
                        }
                    }, 500);
                    
                }, duration * 1000);
                
            } catch (error) {
                console.error('❌ Error en grabación temporal:', error);
                resolve(null);
            }
        });
    }

    stop() {
        console.log('🛑 Deteniendo AudioManager...');
        
        // Detener grabación
        if (this.recordingStream) {
            this.recordingStream.stop();
            this.isRecording = false;
        }
        
        // Limpiar cola de audio
        this.clearAudioQueue();
        
        console.log('🔇 Audio detenido correctamente');
    }
}

module.exports = AudioManager;