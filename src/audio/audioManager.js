const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process'); 
const recorder = require('node-record-lpcm16');
const Speaker = require('speaker');
const DTMFDecoder = require('./dtmfDecoder');
const EventEmitter = require('events');
const say = require('say');


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

        this.channelActivity = {
        isActive: false,
        level: 0,
        threshold: 0.02,        // Umbral de actividad
        sustainTime: 1000,      // ms para mantener "activo"
        lastActivityTime: 0,
        activityTimer: null
    };
        
        console.log('🎤 AudioManager inicializado');
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
            device: 'hw:0,0' // Tu dispositivo de audio
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
        // Convertir buffer a array de números
        const audioArray = [];
        for (let i = 0; i < audioData.length; i += 2) {
            // 16-bit little endian
            const sample = audioData.readInt16LE(i) / 32768.0;
            audioArray.push(sample);
        }

        // Detectar actividad del canal
        this.detectChannelActivity(audioArray);

        // Detectar DTMF
        this.dtmfDecoder.detectSequence(audioArray, (dtmf) => {
            this.handleDTMF(dtmf);
        });

        // Emitir audio para otros módulos si es necesario
        this.emit('audio', audioArray);
    }

    handleDTMF(dtmf) {
        this.dtmfBuffer += dtmf;
        
        // Reset del timeout
        if (this.dtmfTimeout) {
            clearTimeout(this.dtmfTimeout);
        }
        
        // Timeout para detectar final de secuencia
        this.dtmfTimeout = setTimeout(() => {
            if (this.dtmfBuffer.length > 0) {
                console.log(`📞 Secuencia DTMF completa: ${this.dtmfBuffer}`);
                this.emit('dtmf', this.dtmfBuffer);
                this.dtmfBuffer = '';
            }
        }, 2000); // 2 segundos sin DTMF = fin de secuencia
    }

    // Detectar actividad del canal
detectChannelActivity(audioArray) {
    // Calcular nivel promedio de la señal
    const avgLevel = audioArray.reduce((sum, sample) => 
        sum + Math.abs(sample), 0) / audioArray.length;
    
    // Calcular nivel RMS para mejor detección
    const rmsLevel = Math.sqrt(
        audioArray.reduce((sum, sample) => sum + sample * sample, 0) / audioArray.length
    );
    
    this.channelActivity.level = rmsLevel;
    
    const now = Date.now();
    const wasActive = this.channelActivity.isActive;
    
    // Detectar si hay actividad
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
        
        // Cancelar timer de inactividad
        if (this.channelActivity.activityTimer) {
            clearTimeout(this.channelActivity.activityTimer);
            this.channelActivity.activityTimer = null;
        }
        
        // Programar inactividad
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
    
    // Emitir nivel de señal periódicamente
    this.emit('signal_level', {
        level: rmsLevel,
        active: this.channelActivity.isActive,
        timestamp: now
    });
}

// Obtener estado del canal
getChannelStatus() {
    return {
        isActive: this.channelActivity.isActive,
        level: this.channelActivity.level,
        threshold: this.channelActivity.threshold,
        lastActivity: this.channelActivity.lastActivityTime
    };
}

//  Configurar sensibilidad
setChannelThreshold(threshold) {
    this.channelActivity.threshold = Math.max(0.001, Math.min(0.1, threshold));
    console.log(`🎚️  Umbral de canal ajustado a: ${this.channelActivity.threshold}`);
}

// Verificar si es seguro transmitir
isSafeToTransmit() {
    return !this.channelActivity.isActive;
}

    speak(text, options = {}) {
    const voice = options.voice || 'es';
    const speed = options.speed || '150'; // palabras por minuto
    
    console.log(`🗣️ Hablando: "${text}"`);
    
    return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        
        const espeak = spawn('espeak', [
            '-v', voice,
            '-s', speed,
            '-a', '100', // amplitud
            text
        ]);
        
        espeak.on('close', (code) => {
            if (code === 0) {
                console.log('✅ TTS completado');
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

   playTone(frequency, duration, volume = 0.5) {
    console.log(`🎵 Reproduciendo tono: ${frequency}Hz por ${duration}ms`);
    
    try {
        // Generar tono sintético
        const sampleCount = Math.floor(this.sampleRate * duration / 1000);
        const buffer = Buffer.alloc(sampleCount * 2); // 16-bit
        
        for (let i = 0; i < sampleCount; i++) {
            const sample = Math.sin(2 * Math.PI * frequency * i / this.sampleRate) * volume;
            const value = Math.round(sample * 32767);
            buffer.writeInt16LE(value, i * 2);
        }
        
        this.playBuffer(buffer);
    } catch (error) {
        console.log(`⚠️  No se pudo reproducir tono: ${error.message}`);
        // Continuar sin el tono
    }
}

playBuffer(buffer) {
    try {
        // Intentar crear speaker con configuración más permisiva
        const speaker = new Speaker({
            channels: this.channels,
            bitDepth: this.bitDepth,
            sampleRate: this.sampleRate,
            device: 'default' // Usar dispositivo por defecto
        });
        
        speaker.on('error', (err) => {
            console.log(`⚠️  Error de audio: ${err.message}`);
        });
        
        speaker.write(buffer);
        speaker.end();
        
    } catch (error) {
        console.log(`⚠️  No se pudo reproducir audio: ${error.message}`);
        // Continuar sin audio
    }
}
/**
 * Pausar grabación principal para permitir grabación temporal
 */
pauseRecording() {
    if (this.recordingStream && this.isRecording) {
        console.log('⏸️  Pausando grabación principal...');
        this.recordingStream.stop();
        this.isRecording = false;
        return true;
    }
    return false;
}

/**
 * Reanudar grabación principal
 */
resumeRecording() {
    if (!this.isRecording) {
        console.log('▶️  Reanudando grabación principal...');
        this.startRecording();
        return true;
    }
    return false;
}

/**
 * Grabar audio temporal usando node-record-lpcm16
 */
async recordTemporary(duration, sampleRate = 16000) {
    return new Promise((resolve) => {
        const timestamp = Date.now();
        const filename = `temp_${timestamp}.wav`;
        const filepath = path.join(__dirname, '../../sounds', filename);
        
        console.log(`🎙️  Grabación temporal por ${duration} segundos...`);
        
        // Crear directorio si no existe
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        try {
            // Usar node-record-lpcm16 en lugar de arecord
            const recordingOptions = {
                sampleRate: sampleRate,
                channels: 1,
                bitDepth: 16,
                audioType: 'wav',
                silence: '1.0',
                device: null // usar dispositivo por defecto
            };

            const tempRecorder = recorder.record(recordingOptions);
            const fileStream = fs.createWriteStream(filepath);
            
            // Conectar streams
            tempRecorder.stream().pipe(fileStream);
            
            // Detener después del tiempo especificado
            setTimeout(() => {
                tempRecorder.stop();
                fileStream.end();
                
                // Verificar que el archivo se creó
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