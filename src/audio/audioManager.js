const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process'); 
const recorder = require('node-record-lpcm16');
const EventEmitter = require('events');
const say = require('say');

// Importar RogerBeep
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

        // ===== GESTIÓN COMPLETAMENTE NUEVA DE AUDIO =====
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
        
        // Configuración de debugging
        this.debug = process.env.NODE_ENV === 'development';
        
        console.log('🎤 AudioManager inicializado (versión mejorada)');
    }

    // ===== MÉTODOS DE INICIALIZACIÓN =====

    start() {
        this.startRecording();
        console.log('🔊 Audio iniciado - Escuchando DTMF...');
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
                    console.error('❌ Error de grabación:', err);
                    this.handleRecordingError(err);
                });

            this.isRecording = true;
            
        } catch (error) {
            console.error('❌ Error iniciando grabación:', error);
            this.isRecording = false;
        }
    }

    handleRecordingError(error) {
        console.log('🔄 Intentando reiniciar grabación...');
        this.isRecording = false;
        
        // Reintentar después de 2 segundos
        setTimeout(() => {
            if (!this.isRecording) {
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
                console.error('❌ Error procesando audio:', error);
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

    // ===== MÉTODOS DE TEXTO A VOZ =====

    async speak(text, options = {}) {
        console.log(`🗣️ Hablando: "${text}"`);
        
        try {
            // Reproducir TTS usando espeak
            await this.speakWithEspeak(text, options);
            
            // Reproducir roger beep si está habilitado
            if (options.rogerBeep !== false && this.rogerBeep.isEnabled()) {
                await this.rogerBeep.play(options.rogerBeepType);
            }
            
        } catch (error) {
            console.error('❌ Error en TTS:', error);
            throw error;
        }
    }

    async speakNoBeep(text, options = {}) {
        return this.speak(text, { ...options, rogerBeep: false });
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
                    console.log('✅ TTS completado');
                    resolve();
                } else {
                    console.error(`❌ Error espeak: ${stderr}`);
                    reject(new Error(`espeak failed with code ${code}: ${stderr}`));
                }
            });
            
            espeak.on('error', (err) => {
                console.error('❌ Error ejecutando espeak:', err);
                reject(err);
            });

            // Timeout de seguridad
            setTimeout(() => {
                if (!espeak.killed) {
                    espeak.kill('SIGTERM');
                    reject(new Error('TTS timeout'));
                }
            }, 30000); // 30 segundos máximo
        });
    }

    // ===== GESTIÓN MEJORADA DE AUDIO SIN SPEAKER =====

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
                    await this.playToneWithAplay(audioItem.frequency, audioItem.duration, audioItem.volume);
                } else if (audioItem.type === 'buffer') {
                    await this.playBufferWithAplay(audioItem.buffer);
                }
                
                audioItem.resolve();
                
            } catch (error) {
                console.log(`⚠️  Error reproduciendo audio: ${error.message}`);
                audioItem.resolve(); // Resolver para continuar
            }

            // Pequeña pausa entre reproducciones
            await this.delay(50);
        }

        this.isProcessingAudio = false;
    }

    async playToneWithAplay(frequency, duration, volume = 0.5) {
        return new Promise((resolve, reject) => {
            try {
                const tempDir = path.join(__dirname, '../../sounds');
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }

                const tempFile = path.join(tempDir, `tone_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.wav`);
                
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
                            setTimeout(() => {
                                if (fs.existsSync(tempFile)) {
                                    fs.unlinkSync(tempFile);
                                }
                            }, 1000);
                            
                            if (playCode === 0) {
                                resolve();
                            } else {
                                reject(new Error(`aplay failed with code ${playCode}`));
                            }
                        });

                        aplay.on('error', (err) => {
                            console.log(`⚠️  Error aplay: ${err.message}`);
                            resolve(); // No fallar por error de audio
                        });

                        // Timeout para aplay
                        setTimeout(() => {
                            if (!aplay.killed) {
                                aplay.kill();
                                resolve();
                            }
                        }, duration + 2000);

                    } else {
                        // Fallback: reproducir usando un método alternativo
                        console.log('⚠️  Sox no disponible, usando fallback');
                        this.playToneAlternative(frequency, duration, volume).then(resolve).catch(() => resolve());
                    }
                });

                sox.on('error', (err) => {
                    console.log(`⚠️  Error sox: ${err.message}`);
                    // Fallback
                    this.playToneAlternative(frequency, duration, volume).then(resolve).catch(() => resolve());
                });

                // Timeout para sox
                setTimeout(() => {
                    if (!sox.killed) {
                        sox.kill();
                        resolve();
                    }
                }, 5000);

            } catch (error) {
                console.log(`⚠️  Error general playTone: ${error.message}`);
                resolve(); // No fallar
            }
        });
    }

    async playToneAlternative(frequency, duration, volume = 0.5) {
        return new Promise((resolve) => {
            try {
                // Usar beep del sistema como último recurso
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
                console.log(`⚠️  Beep alternativo falló: ${error.message}`);
                resolve();
            }
        });
    }

    async playBufferWithAplay(buffer) {
        return new Promise((resolve, reject) => {
            try {
                const tempDir = path.join(__dirname, '../../sounds');
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }

                const tempFile = path.join(tempDir, `buffer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.raw`);
                
                // Escribir buffer a archivo temporal
                fs.writeFileSync(tempFile, buffer);
                
                // Reproducir con aplay especificando formato
                const aplay = spawn('aplay', [
                    '-q',
                    '-f', 'S16_LE',
                    '-c', this.channels.toString(),
                    '-r', this.sampleRate.toString(),
                    tempFile
                ]);

                aplay.on('close', (code) => {
                    // Limpiar archivo temporal
                    setTimeout(() => {
                        if (fs.existsSync(tempFile)) {
                            fs.unlinkSync(tempFile);
                        }
                    }, 1000);
                    
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`aplay failed with code ${code}`));
                    }
                });

                aplay.on('error', (err) => {
                    console.log(`⚠️  Error aplay buffer: ${err.message}`);
                    resolve(); // No fallar
                });

                // Timeout de seguridad
                setTimeout(() => {
                    if (!aplay.killed) {
                        aplay.kill();
                        resolve();
                    }
                }, 10000);

            } catch (error) {
                console.log(`⚠️  Error playBuffer: ${error.message}`);
                resolve();
            }
        });
    }

    // ===== MÉTODOS DE UTILIDAD =====

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    clearAudioQueue() {
        console.log('🧹 Limpiando cola de audio...');
        
        // Resolver todas las promesas pendientes
        this.audioQueue.forEach(item => {
            if (item.resolve) {
                item.resolve();
            }
        });
        
        this.audioQueue = [];
        
        // Terminar proceso de audio actual
        if (this.currentAudioProcess && !this.currentAudioProcess.killed) {
            this.currentAudioProcess.kill();
            this.currentAudioProcess = null;
        }
        
        this.isProcessingAudio = false;
        console.log('✅ Cola de audio limpiada');
    }

    // ===== GESTIÓN DEL ROGER BEEP =====

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
        try {
            await this.rogerBeep.play(type);
        } catch (error) {
            console.error('❌ Error en test roger beep:', error);
        }
    }

    // ===== ESTADO DEL CANAL =====

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

    // ===== GRABACIÓN =====

    pauseRecording() {
        if (this.recordingStream && this.isRecording) {
            console.log('⏸️  Pausando grabación principal...');
            try {
                this.recordingStream.stop();
            } catch (error) {
                console.log('⚠️  Error pausando grabación:', error.message);
            }
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
                
                const timeout = setTimeout(() => {
                    try {
                        tempRecorder.stop();
                        fileStream.end();
                    } catch (error) {
                        console.log('⚠️  Error deteniendo grabación temporal:', error.message);
                    }
                    
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

    // ===== CIERRE Y LIMPIEZA =====

    stop() {
        console.log('🛑 Deteniendo AudioManager...');
        
        // Detener grabación
        if (this.recordingStream) {
            try {
                this.recordingStream.stop();
            } catch (error) {
                console.log('⚠️  Error deteniendo grabación:', error.message);
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
        
        console.log('✅ AudioManager detenido correctamente');
    }

    // ===== MÉTODOS DE DEBUGGING =====

    getStatus() {
        return {
            isRecording: this.isRecording,
            isProcessingAudio: this.isProcessingAudio,
            audioQueueLength: this.audioQueue.length,
            channelActive: this.channelActivity.isActive,
            channelLevel: this.channelActivity.level,
            rogerBeepEnabled: this.rogerBeep.isEnabled(),
            rogerBeepType: this.rogerBeep.getConfig().type
        };
    }

    async healthCheck() {
        console.log('🔍 AudioManager Health Check:');
        console.log(`  📹 Recording: ${this.isRecording ? '✅' : '❌'}`);
        console.log(`  🎵 Audio Queue: ${this.audioQueue.length} items`);
        console.log(`  📻 Channel: ${this.channelActivity.isActive ? 'BUSY' : 'FREE'}`);
        console.log(`  🔊 Roger Beep: ${this.rogerBeep.isEnabled() ? 'ON' : 'OFF'} (${this.rogerBeep.getConfig().type})`);
        
        // Test básico
        try {
            await this.testRogerBeep();
            console.log('  ✅ Roger Beep test: OK');
        } catch (error) {
            console.log('  ❌ Roger Beep test: FAILED');
        }
    }
}

module.exports = AudioManager;