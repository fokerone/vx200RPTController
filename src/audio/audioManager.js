const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process'); 
const recorder = require('node-record-lpcm16');
const Speaker = require('speaker');
const DTMFDecoder = require('./dtmfDecoder');
const EventEmitter = require('events');
const textToSpeech = require('@google-cloud/text-to-speech');

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

        // Cliente Google TTS
        this.ttsClient = null;
        this.ttsEnabled = false;

        // Configuración de voz
        this.voiceConfig = {
            languageCode: 'es-AR',
            name: 'es-AR-Standard-A',
            ssmlGender: 'FEMALE'
        };

        this.audioConfig = {
            audioEncoding: 'LINEAR16',
            sampleRateHertz: 24000,
            speakingRate: 1.0,
            pitch: 0.0
        };

        this.channelActivity = {
            isActive: false,
            level: 0,
            threshold: 0.02,
            sustainTime: 1000,
            lastActivityTime: 0,
            activityTimer: null
        };

        this.initializeGoogleTTS();
        console.log('🎤 AudioManager inicializado');
    }

    /**
     * Inicializar Google Cloud TTS
     */
    async initializeGoogleTTS() {
        try {
            // Verificar si hay credenciales configuradas
            if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_CLOUD_PROJECT_ID) {
                console.log('⚠️  Google TTS no configurado, usando espeak como fallback');
                return;
            }

            this.ttsClient = new textToSpeech.TextToSpeechClient();
            this.ttsEnabled = true;
            console.log('✅ Google Cloud TTS inicializado correctamente');

            // Probar conexión
            await this.testGoogleTTS();

        } catch (error) {
            console.warn('⚠️  Google Cloud TTS no disponible:', error.message);
            console.log('📢 Usando espeak como fallback');
            this.ttsEnabled = false;
        }
    }

    /**
     * Probar conexión con Google TTS
     */
    async testGoogleTTS() {
        try {
            const request = {
                input: { text: 'Test' },
                voice: this.voiceConfig,
                audioConfig: { audioEncoding: 'LINEAR16' }
            };

            await this.ttsClient.synthesizeSpeech(request);
            console.log('✅ Conexión con Google TTS verificada');
        } catch (error) {
            console.error('❌ Error en test de Google TTS:', error.message);
            this.ttsEnabled = false;
        }
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

    /**
     * Text-to-Speech Principal - Google TTS o Espeak fallback
     */
    async speak(text, options = {}) {
        console.log(`🗣️ Hablando: "${text}"`);
        
        try {
            if (this.ttsEnabled) {
                return await this.speakGoogle(text, options);
            } else {
                return await this.speakEspeak(text, options);
            }
        } catch (error) {
            console.error('❌ Error en TTS, usando fallback espeak:', error.message);
            return await this.speakEspeak(text, options);
        }
    }

    /**
     * Google Cloud Text-to-Speech
     */
    async speakGoogle(text, options = {}) {
        const request = {
            input: { text: text },
            voice: {
                languageCode: options.languageCode || this.voiceConfig.languageCode,
                name: options.voiceName || this.voiceConfig.name,
                ssmlGender: options.gender || this.voiceConfig.ssmlGender
            },
            audioConfig: {
                audioEncoding: 'LINEAR16',
                sampleRateHertz: 24000,
                speakingRate: options.speed || 1.0,
                pitch: options.pitch || 0.0
            }
        };

        try {
            const [response] = await this.ttsClient.synthesizeSpeech(request);
            
            // Crear directorio temporal
            const soundsDir = path.join(__dirname, '../../sounds');
            if (!fs.existsSync(soundsDir)) {
                fs.mkdirSync(soundsDir, { recursive: true });
            }

            // Guardar audio temporal
            const tempFile = path.join(soundsDir, `google_tts_${Date.now()}.wav`);
            fs.writeFileSync(tempFile, response.audioContent, 'binary');
            
            // Reproducir
            await this.playAudioFile(tempFile);
            
            // Limpiar archivo temporal después de 3 segundos
            setTimeout(() => {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
            }, 3000);

            console.log('✅ Google TTS completado');
            return true;

        } catch (error) {
            console.error('❌ Error en Google TTS:', error.message);
            throw error;
        }
    }

    /**
     * Espeak TTS (Fallback)
     */
    async speakEspeak(text, options = {}) {
        const voice = options.voice || 'es';
        const speed = options.speed ? Math.round(options.speed * 150) : '150';
        
        return new Promise((resolve, reject) => {
            const espeak = spawn('espeak', [
                '-v', voice,
                '-s', speed,
                '-a', '100',
                text
            ]);
            
            espeak.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Espeak TTS completado');
                    resolve();
                } else {
                    console.error(`❌ Error espeak, código: ${code}`);
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
     * Reproducir archivo de audio usando aplay
     */
    async playAudioFile(filePath) {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(filePath)) {
                reject(new Error('Archivo de audio no encontrado'));
                return;
            }

            const aplay = spawn('aplay', ['-q', filePath]);
            
            aplay.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`aplay falló con código ${code}`));
                }
            });

            aplay.on('error', (err) => {
                reject(err);
            });
        });
    }

    /**
     * Cambiar voz de Google TTS
     */
    setGoogleVoice(languageCode, voiceName, gender = 'FEMALE') {
        this.voiceConfig = {
            languageCode,
            name: voiceName,
            ssmlGender: gender
        };
        console.log(`🎙️ Voz configurada: ${voiceName} (${languageCode})`);
    }

    /**
     * Obtener estado del TTS
     */
    getTTSStatus() {
        return {
            enabled: this.ttsEnabled,
            provider: this.ttsEnabled ? 'Google Cloud TTS' : 'Espeak',
            voice: this.voiceConfig,
            fallbackAvailable: true
        };
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

    playTone(frequency, duration, volume = 0.5) {
        console.log(`🎵 Reproduciendo tono: ${frequency}Hz por ${duration}ms`);
        
        try {
            const sampleCount = Math.floor(this.sampleRate * duration / 1000);
            const buffer = Buffer.alloc(sampleCount * 2);
            
            for (let i = 0; i < sampleCount; i++) {
                const sample = Math.sin(2 * Math.PI * frequency * i / this.sampleRate) * volume;
                const value = Math.round(sample * 32767);
                buffer.writeInt16LE(value, i * 2);
            }
            
            this.playBuffer(buffer);
        } catch (error) {
            console.log(`⚠️  No se pudo reproducir tono: ${error.message}`);
        }
    }

    playBuffer(buffer) {
        try {
            const speaker = new Speaker({
                channels: this.channels,
                bitDepth: this.bitDepth,
                sampleRate: this.sampleRate,
                device: 'default'
            });
            
            speaker.on('error', (err) => {
                console.log(`⚠️  Error de audio: ${err.message}`);
            });
            
            speaker.write(buffer);
            speaker.end();
            
        } catch (error) {
            console.log(`⚠️  No se pudo reproducir audio: ${error.message}`);
        }
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
        if (this.recordingStream) {
            this.recordingStream.stop();
            this.isRecording = false;
        }
        console.log('🔇 Audio detenido');
    }
}

module.exports = AudioManager;