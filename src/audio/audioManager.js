const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process'); 
const recorder = require('node-record-lpcm16');
const EventEmitter = require('events');
const RogerBeep = require('./rogerBeep');

class AudioManager extends EventEmitter {
    constructor() {
        super();
        
        // Configuración de audio
        this.sampleRate = 48000;
        this.channels = 1;
        this.bitDepth = 16;
        
        // Componentes principales
        this.dtmfDecoder = new (require('./dtmfDecoder'))(this.sampleRate);
        this.rogerBeep = new RogerBeep(this);
        
        // Estado de grabación
        this.isRecording = false;
        this.recordingStream = null;
        this.dtmfBuffer = '';
        this.dtmfTimeout = null;
        
        // Cola de audio
        this.audioQueue = [];
        this.isProcessingAudio = false;
        this.currentAudioProcess = null;
        
        // Estado del canal
        this.channelActivity = {
            isActive: false,
            level: 0,
            threshold: 0.02,
            sustainTime: 1000,
            lastActivityTime: 0,
            activityTimer: null
        };
        
        // Configuración
        this.debug = process.env.NODE_ENV === 'development';
        this.soundsDir = path.join(__dirname, '../../sounds');
        this.ensureSoundsDirectory();
        
        console.log('🎤 AudioManager inicializado');
    }

    // ===== INICIALIZACIÓN =====

    ensureSoundsDirectory() {
        if (!fs.existsSync(this.soundsDir)) {
            fs.mkdirSync(this.soundsDir, { recursive: true });
        }
    }

    start() {
        this.startRecording();
        console.log('🔊 Sistema de audio iniciado');
    }

    startRecording() {
        try {
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
                    console.error('❌ Error de grabación:', err.message);
                    this.handleRecordingError();
                });

            this.isRecording = true;
            
        } catch (error) {
            console.error('❌ Error iniciando grabación:', error.message);
            this.isRecording = false;
        }
    }

    handleRecordingError() {
        this.isRecording = false;
        
        // Reintentar después de 2 segundos
        setTimeout(() => {
            if (!this.isRecording) {
                console.log('🔄 Reintentando grabación...');
                this.startRecording();
            }
        }, 2000);
    }

    // ===== PROCESAMIENTO DE AUDIO =====

    processAudioData(audioData) {
        try {
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
            
        } catch (error) {
            if (this.debug) {
                console.error('❌ Error procesando audio:', error.message);
            }
        }
    }

    handleDTMF(dtmf) {
        this.dtmfBuffer += dtmf;
        
        if (this.dtmfTimeout) {
            clearTimeout(this.dtmfTimeout);
        }
        
        this.dtmfTimeout = setTimeout(() => {
            if (this.dtmfBuffer.length > 0) {
                console.log(`📞 DTMF: ${this.dtmfBuffer}`);
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

    // ===== TEXTO A VOZ =====

    async speak(text, options = {}) {
        try {
            await this.speakWithEspeak(text, options);
            
            // Roger Beep automático al finalizar transmisión
            await this.rogerBeep.executeAfterTransmission();
            
        } catch (error) {
            console.error('❌ Error en TTS:', error.message);
        }
    }

    async speakNoRoger(text, options = {}) {
        try {
            await this.speakWithEspeak(text, options);
        } catch (error) {
            console.error('❌ Error en TTS sin Roger:', error.message);
        }
    }

    async speakWithEspeak(text, options = {}) {
        return new Promise((resolve, reject) => {
            const voice = options.voice || 'es';
            const speed = options.speed || '150';
            
            const espeak = spawn('espeak', [
                '-v', voice,
                '-s', speed,
                '-a', '100',
                text
            ]);

            let stderr = '';

            espeak.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            espeak.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`espeak failed: ${stderr}`));
                }
            });
            
            espeak.on('error', (err) => {
                reject(err);
            });

            // Timeout de seguridad (30 segundos)
            setTimeout(() => {
                if (!espeak.killed) {
                    espeak.kill('SIGTERM');
                    reject(new Error('TTS timeout'));
                }
            }, 30000);
        });
    }

    // ===== REPRODUCCIÓN DE AUDIO =====

    async playTone(frequency, duration, volume = 0.5) {
        return new Promise((resolve) => {
            this.audioQueue.push({
                type: 'tone',
                frequency,
                duration,
                volume,
                resolve,
                timestamp: Date.now()
            });
            
            this.processAudioQueue();
        });
    }

    async playBuffer(buffer) {
        return new Promise((resolve) => {
            this.audioQueue.push({
                type: 'buffer',
                buffer,
                resolve,
                timestamp: Date.now()
            });
            
            this.processAudioQueue();
        });
    }

    async processAudioQueue() {
        if (this.isProcessingAudio || this.audioQueue.length === 0) {
            return;
        }

        this.isProcessingAudio = true;
        
        while (this.audioQueue.length > 0) {
            const audioItem = this.audioQueue.shift();
            
            try {
                if (audioItem.type === 'tone') {
                    await this.generateAndPlayTone(audioItem.frequency, audioItem.duration, audioItem.volume);
                } else if (audioItem.type === 'buffer') {
                    await this.playBufferWithAplay(audioItem.buffer);
                }
                
                audioItem.resolve();
                
            } catch (error) {
                if (this.debug) {
                    console.log(`⚠️  Error reproduciendo audio: ${error.message}`);
                }
                audioItem.resolve(); 
            }

            await this.delay(25); // Pequeña pausa entre elementos
        }

        this.isProcessingAudio = false;
    }

    async generateAndPlayTone(frequency, duration, volume = 0.5) {
        return new Promise((resolve, reject) => {
            const tempFile = path.join(this.soundsDir, `tone_${Date.now()}.wav`);
            
            // Generar tono WAV usando sox
            const sox = spawn('sox', [
                '-n', tempFile,
                'synth', (duration / 1000).toString(),
                'sine', frequency.toString(),
                'vol', volume.toString()
            ]);

            sox.on('close', (code) => {
                if (code === 0) {
                    // Reproducir con aplay
                    const aplay = spawn('aplay', ['-q', tempFile]);
                    
                    aplay.on('close', (playCode) => {
                        // Limpiar archivo temporal
                        this.cleanupTempFile(tempFile);
                        
                        if (playCode === 0) {
                            resolve();
                        } else {
                            reject(new Error(`aplay failed with code ${playCode}`));
                        }
                    });

                    aplay.on('error', (err) => {
                        this.cleanupTempFile(tempFile);
                        resolve(); // No fallar completamente
                    });

                    // Timeout para aplay
                    setTimeout(() => {
                        if (!aplay.killed) {
                            aplay.kill();
                            this.cleanupTempFile(tempFile);
                            resolve();
                        }
                    }, duration + 2000);

                } else {
                    // Fallback: usar beep del sistema
                    this.playToneWithBeep(frequency, duration).then(resolve).catch(() => resolve());
                }
            });

            sox.on('error', (err) => {
                // Fallback: usar beep del sistema
                this.playToneWithBeep(frequency, duration).then(resolve).catch(() => resolve());
            });

            // Timeout para sox
            setTimeout(() => {
                if (!sox.killed) {
                    sox.kill();
                    resolve();
                }
            }, 5000);
        });
    }

    async playToneWithBeep(frequency, duration) {
        return new Promise((resolve) => {
            try {
                const beep = spawn('beep', ['-f', frequency.toString(), '-l', duration.toString()]);
                
                beep.on('close', () => resolve());
                beep.on('error', () => resolve());

                setTimeout(() => {
                    if (!beep.killed) {
                        beep.kill();
                    }
                    resolve();
                }, duration + 1000);

            } catch (error) {
                resolve(); // Fallar silenciosamente
            }
        });
    }

    async playBufferWithAplay(buffer) {
        return new Promise((resolve, reject) => {
            const tempFile = path.join(this.soundsDir, `buffer_${Date.now()}.raw`);
            
            try {
                // Escribir buffer a archivo temporal
                fs.writeFileSync(tempFile, buffer);
                
                // Reproducir con aplay
                const aplay = spawn('aplay', [
                    '-q',
                    '-f', 'S16_LE',
                    '-c', this.channels.toString(),
                    '-r', this.sampleRate.toString(),
                    tempFile
                ]);

                aplay.on('close', (code) => {
                    this.cleanupTempFile(tempFile);
                    
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`aplay failed with code ${code}`));
                    }
                });

                aplay.on('error', (err) => {
                    this.cleanupTempFile(tempFile);
                    resolve(); // No fallar completamente
                });

                // Timeout de seguridad
                setTimeout(() => {
                    if (!aplay.killed) {
                        aplay.kill();
                        this.cleanupTempFile(tempFile);
                        resolve();
                    }
                }, 10000);

            } catch (error) {
                this.cleanupTempFile(tempFile);
                resolve();
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
            console.log('⚠️  Roger Beep no disponible');
            return false;
        }

        try {
            this.rogerBeep.loadConfig(config);
            return true;
        } catch (error) {
            console.error('❌ Error configurando Roger Beep:', error.message);
            return false;
        }
    }

    async testRogerBeep() {
        if (!this.rogerBeep) {
            console.log('⚠️  Roger Beep no disponible');
            return false;
        }

        try {
            await this.rogerBeep.test();
            return true;
        } catch (error) {
            console.error('❌ Error en test Roger Beep:', error.message);
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
        this.channelActivity.threshold = Math.max(0.001, Math.min(0.1, threshold));
        console.log(`🎚️  Umbral de canal: ${this.channelActivity.threshold}`);
    }

    isSafeToTransmit() {
        return !this.channelActivity.isActive;
    }

    // ===== GRABACIÓN TEMPORAL =====

    async recordTemporary(duration, sampleRate = 16000) {
        return new Promise((resolve) => {
            const timestamp = Date.now();
            const filename = `temp_${timestamp}.wav`;
            const filepath = path.join(this.soundsDir, filename);
            
            console.log(`🎙️  Grabación temporal: ${duration}s`);
            
            try {
                const recordingOptions = {
                    sampleRate: sampleRate,
                    channels: 1,
                    bitDepth: 16,
                    audioType: 'wav',
                    silence: '1.0'
                };

                const tempRecorder = recorder.record(recordingOptions);
                const fileStream = fs.createWriteStream(filepath);
                
                tempRecorder.stream().pipe(fileStream);
                
                setTimeout(() => {
                    try {
                        tempRecorder.stop();
                        fileStream.end();
                    } catch (error) {
                        // Ignorar errores al detener
                    }
                    
                    setTimeout(() => {
                        if (fs.existsSync(filepath)) {
                            resolve(filepath);
                        } else {
                            resolve(null);
                        }
                    }, 500);
                    
                }, duration * 1000);
                
            } catch (error) {
                console.error('❌ Error en grabación temporal:', error.message);
                resolve(null);
            }
        });
    }

    // ===== CONTROL DE GRABACIÓN =====

    pauseRecording() {
        if (this.recordingStream && this.isRecording) {
            try {
                this.recordingStream.stop();
                this.isRecording = false;
                return true;
            } catch (error) {
                console.log('⚠️  Error pausando grabación:', error.message);
                return false;
            }
        }
        return false;
    }

    resumeRecording() {
        if (!this.isRecording) {
            this.startRecording();
            return true;
        }
        return false;
    }

    // ===== UTILIDADES =====

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    clearAudioQueue() {
        // Resolver todas las promesas pendientes
        this.audioQueue.forEach(item => {
            if (item.resolve) {
                item.resolve();
            }
        });
        
        this.audioQueue = [];
        
        // Terminar proceso actual
        if (this.currentAudioProcess && !this.currentAudioProcess.killed) {
            this.currentAudioProcess.kill();
            this.currentAudioProcess = null;
        }
        
        this.isProcessingAudio = false;
    }

    // ===== ESTADO Y DIAGNÓSTICO =====

    getStatus() {
        return {
            audio: {
                isRecording: this.isRecording,
                isProcessingAudio: this.isProcessingAudio,
                audioQueueLength: this.audioQueue.length,
                status: this.isRecording ? 'active' : 'inactive'
            },
            channel: {
                isActive: this.channelActivity.isActive,
                level: this.channelActivity.level,
                threshold: this.channelActivity.threshold,
                busy: this.channelActivity.isActive
            },
            rogerBeep: this.rogerBeep ? this.rogerBeep.getStatus() : { enabled: false }
        };
    }

    async healthCheck() {
        const status = this.getStatus();
        
        console.log('🔍 AudioManager Health Check:');
        console.log(`  📹 Recording: ${status.audio.isRecording ? '✅' : '❌'}`);
        console.log(`  🎵 Audio Queue: ${status.audio.audioQueueLength} items`);
        console.log(`  📻 Channel: ${status.channel.isActive ? 'BUSY' : 'FREE'}`);
        console.log(`  🔊 Roger Beep: ${status.rogerBeep.enabled ? 'ON' : 'OFF'}`);
        
        // Test Roger Beep si está disponible
        if (this.rogerBeep && status.rogerBeep.enabled) {
            try {
                await this.testRogerBeep();
                console.log('  ✅ Roger Beep Test: OK');
            } catch (error) {
                console.log('  ❌ Roger Beep Test: FAILED');
            }
        }
        
        return status;
    }

    // ===== CIERRE =====

    stop() {
        console.log('🛑 Deteniendo AudioManager...');
        
        // Detener grabación
        if (this.recordingStream) {
            try {
                this.recordingStream.stop();
            } catch (error) {
                // Ignorar errores al cerrar
            }
            this.isRecording = false;
        }
        
        // Limpiar timeouts
        if (this.dtmfTimeout) {
            clearTimeout(this.dtmfTimeout);
            this.dtmfTimeout = null;
        }
        
        if (this.channelActivity.activityTimer) {
            clearTimeout(this.channelActivity.activityTimer);
            this.channelActivity.activityTimer = null;
        }
        
        // Limpiar cola de audio
        this.clearAudioQueue();
        
        console.log('✅ AudioManager detenido');
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