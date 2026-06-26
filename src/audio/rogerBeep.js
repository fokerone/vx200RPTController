const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { ROGER_BEEP, MODULE_STATES, DELAYS } = require('../constants');
const { delay, validateVolume } = require('../utils');
const { createLogger } = require('../logging/Logger');

/**
 * CRC-CCITT (0x1021) calculation for MDC-1200
 */
function crcCCITT(data) {
    let crc = 0x0000;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i] << 8;
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
            crc &= 0xFFFF;
        }
    }
    return crc;
}

/**
 * Derive a 16-bit unit ID from a callsign string
 */
function callsignToUnitID(callsign) {
    if (!callsign || typeof callsign !== 'string') return 0x0001;
    let hash = 0;
    for (let i = 0; i < callsign.length; i++) {
        hash = ((hash << 5) - hash + callsign.charCodeAt(i)) & 0xFFFF;
    }
    return hash || 0x0001; // Avoid zero
}

class RogerBeep {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.logger = createLogger('[RogerBeep]');
        this.state = MODULE_STATES.IDLE;
        this.enabled = true;

        // Configuracion usando constantes del sistema
        this.config = {
            type: 'mdc1200',
            volume: ROGER_BEEP.DEFAULT_VOLUME,
            duration: ROGER_BEEP.DEFAULT_DURATION,
            delay: ROGER_BEEP.DEFAULT_DELAY
        };

        this.unitID = 0x0001;
        this.isPlaying = false;
        this.validateConfiguration();

        this.logger.info(`Roger Beep inicializado (Tipo: MDC-1200, Estado: ${this.enabled ? 'ACTIVO' : 'INACTIVO'})`);
    }

    /**
     * Set the unit ID from the system callsign
     */
    setCallsign(callsign) {
        this.unitID = callsignToUnitID(callsign);
        this.logger.info(`Unit ID derivado de callsign "${callsign}": 0x${this.unitID.toString(16).toUpperCase().padStart(4, '0')}`);
    }

    /**
     * Validar configuracion del modulo
     */
    validateConfiguration() {
        if (!this.audioManager) {
            this.logger.error('AudioManager no disponible');
            this.state = MODULE_STATES.ERROR;
            return false;
        }

        // Validar volumen
        this.config.volume = validateVolume(this.config.volume);

        // Validar duracion
        if (this.config.duration < ROGER_BEEP.MIN_DURATION || this.config.duration > ROGER_BEEP.MAX_DURATION) {
            this.logger.warn(`Duracion fuera de rango, usando valor por defecto: ${ROGER_BEEP.DEFAULT_DURATION}ms`);
            this.config.duration = ROGER_BEEP.DEFAULT_DURATION;
        }

        return true;
    }

    /**
     * Verificar si el roger beep esta habilitado
     */
    isEnabled() {
        return this.enabled && this.state !== MODULE_STATES.ERROR;
    }

    /**
     * Generate MDC-1200 AFSK samples as Int16 PCM buffer
     */
    generateMDC1200Samples() {
        const sampleRate = ROGER_BEEP.SAMPLE_RATE;
        const baudRate = ROGER_BEEP.BAUD_RATE;
        const samplesPerBit = Math.round(sampleRate / baudRate);
        const markFreq = ROGER_BEEP.MARK_FREQ;
        const spaceFreq = ROGER_BEEP.SPACE_FREQ;

        // Build packet: preamble + sync + data + CRC
        const preamble = Array(ROGER_BEEP.PREAMBLE_COUNT).fill(ROGER_BEEP.PREAMBLE_BYTE);
        const sync = [...ROGER_BEEP.SYNC_WORD];

        // Data: op(0x01) + arg(0x80) + unitID_hi + unitID_lo
        const dataBytes = [
            0x01, // PTT ID op code
            0x80, // Post-access arg
            (this.unitID >> 8) & 0xFF,
            this.unitID & 0xFF
        ];

        // CRC over data bytes
        const crc = crcCCITT(dataBytes);
        const crcBytes = [(crc >> 8) & 0xFF, crc & 0xFF];

        const packet = [...preamble, ...sync, ...dataBytes, ...crcBytes];

        // Convert bytes to bit array (MSB first)
        const bits = [];
        for (let i = 0; i < packet.length; i++) {
            for (let b = 7; b >= 0; b--) {
                bits.push((packet[i] >> b) & 1);
            }
        }

        // Generate AFSK samples with continuous phase
        const totalSamples = bits.length * samplesPerBit;
        const samples = Buffer.alloc(totalSamples * 2); // 16-bit = 2 bytes per sample
        let phase = 0;
        const amplitude = 0.9; // Leave headroom

        let sampleIndex = 0;
        for (let i = 0; i < bits.length; i++) {
            const freq = bits[i] === 1 ? markFreq : spaceFreq;
            const phaseIncrement = (2 * Math.PI * freq) / sampleRate;

            for (let s = 0; s < samplesPerBit; s++) {
                const value = Math.round(amplitude * Math.sin(phase) * 32767);
                samples.writeInt16LE(value, sampleIndex * 2);
                phase += phaseIncrement;
                sampleIndex++;
            }
        }

        // Keep phase in [0, 2*PI) to avoid floating point drift
        phase = phase % (2 * Math.PI);

        return samples;
    }

    /**
     * Create a WAV file buffer from Int16 PCM samples
     */
    createWavBuffer(samples) {
        const sampleRate = ROGER_BEEP.SAMPLE_RATE;
        const numChannels = 1;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        const blockAlign = numChannels * (bitsPerSample / 8);
        const dataSize = samples.length;
        const headerSize = 44;

        const buffer = Buffer.alloc(headerSize + dataSize);
        let offset = 0;

        // RIFF header
        buffer.write('RIFF', offset); offset += 4;
        buffer.writeUInt32LE(36 + dataSize, offset); offset += 4;
        buffer.write('WAVE', offset); offset += 4;

        // fmt chunk
        buffer.write('fmt ', offset); offset += 4;
        buffer.writeUInt32LE(16, offset); offset += 4;       // chunk size
        buffer.writeUInt16LE(1, offset); offset += 2;        // PCM format
        buffer.writeUInt16LE(numChannels, offset); offset += 2;
        buffer.writeUInt32LE(sampleRate, offset); offset += 4;
        buffer.writeUInt32LE(byteRate, offset); offset += 4;
        buffer.writeUInt16LE(blockAlign, offset); offset += 2;
        buffer.writeUInt16LE(bitsPerSample, offset); offset += 2;

        // data chunk
        buffer.write('data', offset); offset += 4;
        buffer.writeUInt32LE(dataSize, offset); offset += 4;

        // Copy PCM data
        samples.copy(buffer, headerSize);

        return buffer;
    }

    /**
     * Play MDC-1200 burst via temp WAV file
     */
    async playMDC1200Beep() {
        const tempDir = path.join(__dirname, '..', '..', 'temp');
        const tempFile = path.join(tempDir, `mdc1200_${Date.now()}.wav`);

        try {
            // Ensure temp directory exists
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // Generate and write WAV
            const samples = this.generateMDC1200Samples();
            const wavBuffer = this.createWavBuffer(samples);
            fs.writeFileSync(tempFile, wavBuffer);

            // Play using paplay (PulseAudio) or aplay (ALSA fallback)
            await this.playWavFile(tempFile);

        } finally {
            // Clean up temp file
            try {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
            } catch (cleanupError) {
                this.logger.warn(`Error limpiando archivo temporal: ${cleanupError.message}`);
            }
        }
    }

    /**
     * Play a WAV file using paplay or aplay
     */
    playWavFile(filePath) {
        return new Promise((resolve, reject) => {
            // Try paplay first (PulseAudio), fallback to aplay (ALSA)
            const player = spawn('paplay', [filePath], {
                stdio: ['ignore', 'ignore', 'pipe']
            });

            let stderr = '';

            player.stderr.on('data', data => {
                stderr += data.toString();
            });

            player.on('error', () => {
                // paplay not available, try aplay
                this.logger.debug('paplay no disponible, usando aplay');
                const aplayProcess = spawn('aplay', [filePath], {
                    stdio: ['ignore', 'ignore', 'pipe']
                });

                let aplayStderr = '';
                aplayProcess.stderr.on('data', data => {
                    aplayStderr += data.toString();
                });

                aplayProcess.on('error', err => {
                    reject(new Error(`No se pudo reproducir audio: ${err.message}`));
                });

                aplayProcess.on('close', code => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`aplay fallo con codigo ${code}: ${aplayStderr}`));
                    }
                });
            });

            player.on('close', code => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`paplay fallo con codigo ${code}: ${stderr}`));
                }
            });
        });
    }

    /**
     * Reproducir roger beep MDC-1200
     * Se ejecuta automaticamente al final de cada transmision
     */
    async play() {
        if (!this.isEnabled()) {
            this.logger.debug('Roger Beep deshabilitado, omitiendo');
            return;
        }

        if (this.isPlaying) {
            this.logger.warn('Roger Beep ya reproduciendose, omitiendo');
            return;
        }

        this.isPlaying = true;
        this.state = MODULE_STATES.ACTIVE;
        this.logger.info('Ejecutando Roger Beep (MDC-1200)');

        try {
            // Delay antes del beep
            if (this.config.delay > 0) {
                await delay(this.config.delay);
            }

            await this.playMDC1200Beep();
            this.logger.debug('Roger Beep completado exitosamente');

        } catch (error) {
            this.logger.error('Error ejecutando Roger Beep:', error.message);
            this.state = MODULE_STATES.ERROR;
        } finally {
            this.isPlaying = false;
            this.state = MODULE_STATES.IDLE;
        }
    }

    /**
     * Habilitar/deshabilitar roger beep desde configuracion
     */
    setEnabled(enabled) {
        const previousState = this.enabled;
        this.enabled = Boolean(enabled);

        if (previousState !== this.enabled) {
            this.logger.info(`Roger Beep ${this.enabled ? 'HABILITADO' : 'DESHABILITADO'} desde configuracion`);
        }
    }

    /**
     * Toggle del estado del roger beep (solo desde panel web)
     */
    toggle() {
        this.setEnabled(!this.enabled);
        return this.enabled;
    }

    /**
     * Configurar volumen (validado)
     */
    setVolume(volume) {
        const previousVolume = this.config.volume;
        this.config.volume = validateVolume(volume);

        if (previousVolume !== this.config.volume) {
            this.logger.info(`Volumen Roger Beep actualizado: ${Math.round(this.config.volume * 100)}%`);
        }
    }

    /**
     * Obtener configuracion actual
     */
    getConfig() {
        return {
            enabled: this.enabled,
            state: this.state,
            type: this.config.type,
            volume: this.config.volume,
            duration: this.config.duration,
            delay: this.config.delay,
            unitID: '0x' + this.unitID.toString(16).toUpperCase().padStart(4, '0'),
            isPlaying: this.isPlaying
        };
    }

    /**
     * Probar roger beep (solo desde panel web)
     */
    async test() {
        this.logger.info('Iniciando test Roger Beep MDC-1200...');
        const wasEnabled = this.enabled;
        const originalState = this.state;

        // Forzar habilitado para el test
        this.enabled = true;

        try {
            await this.play();
            this.logger.info('Test Roger Beep completado exitosamente');
            return { success: true, message: 'Test ejecutado correctamente' };
        } catch (error) {
            this.logger.error('Error en test Roger Beep:', error.message);
            return { success: false, message: `Error en test: ${error.message}` };
        } finally {
            // Restaurar estado original
            this.enabled = wasEnabled;
            this.state = originalState;
        }
    }

    /**
     * Obtener informacion del roger beep
     */
    getInfo() {
        return {
            type: 'MDC-1200',
            description: 'Burst AFSK MDC-1200 (1200/1800 Hz)',
            enabled: this.enabled,
            volume: Math.round(this.config.volume * 100),
            duration: this.config.duration,
            delay: this.config.delay,
            unitID: '0x' + this.unitID.toString(16).toUpperCase().padStart(4, '0'),
            status: this.enabled ? 'ACTIVO' : 'INACTIVO'
        };
    }

    /**
     * Obtener estado simple para el panel web
     */
    getStatus() {
        return {
            enabled: this.enabled,
            type: 'mdc1200',
            volume: this.config.volume,
            duration: this.config.duration
        };
    }

    /**
     * Ejecutar automaticamente al final de transmisiones
     * Esta funcion debe ser llamada desde el audioManager al finalizar cualquier transmision
     */
    async executeAfterTransmission() {
        if (!this.isEnabled()) {
            this.logger.debug('Roger Beep deshabilitado para post-transmision');
            return;
        }

        this.logger.info('Ejecutando Roger Beep post-transmision');

        try {
            // Pequena pausa antes del roger beep
            await delay(DELAYS.SHORT / 2); // 50ms
            await this.play();
        } catch (error) {
            this.logger.error('Error ejecutando Roger Beep post-transmision:', error.message);
        }
    }

    /**
     * Cargar configuracion desde archivo
     */
    loadConfig(config) {
        if (!config || typeof config !== 'object') {
            this.logger.warn('Configuracion invalida recibida');
            return;
        }

        const changes = [];

        if (typeof config.enabled === 'boolean' && config.enabled !== this.enabled) {
            this.setEnabled(config.enabled);
            changes.push(`enabled: ${config.enabled}`);
        }

        if (typeof config.volume === 'number' && config.volume !== this.config.volume) {
            this.setVolume(config.volume);
            changes.push(`volume: ${Math.round(config.volume * 100)}%`);
        }

        if (typeof config.duration === 'number' && config.duration !== this.config.duration) {
            this.config.duration = Math.max(ROGER_BEEP.MIN_DURATION,
                Math.min(ROGER_BEEP.MAX_DURATION, config.duration));
            changes.push(`duration: ${this.config.duration}ms`);
        }

        if (typeof config.callsign === 'string') {
            this.setCallsign(config.callsign);
            changes.push(`callsign: ${config.callsign}`);
        }

        if (changes.length > 0) {
            this.logger.info(`Configuracion cargada: ${changes.join(', ')}`);
        }
    }

    /**
     * Validar configuracion completa
     */
    validateConfig() {
        const issues = [];

        if (!this.audioManager) {
            issues.push('AudioManager no esta disponible');
        }

        if (this.config.volume < ROGER_BEEP.MIN_VOLUME || this.config.volume > ROGER_BEEP.MAX_VOLUME) {
            issues.push(`Volumen fuera de rango: ${this.config.volume} (${ROGER_BEEP.MIN_VOLUME}-${ROGER_BEEP.MAX_VOLUME})`);
        }

        if (this.config.duration < ROGER_BEEP.MIN_DURATION || this.config.duration > ROGER_BEEP.MAX_DURATION) {
            issues.push(`Duracion fuera de rango: ${this.config.duration}ms (${ROGER_BEEP.MIN_DURATION}-${ROGER_BEEP.MAX_DURATION})`);
        }

        return {
            valid: issues.length === 0,
            issues: issues
        };
    }

    /**
     * Reset a configuracion por defecto
     */
    reset() {
        this.config = {
            type: 'mdc1200',
            volume: ROGER_BEEP.DEFAULT_VOLUME,
            duration: ROGER_BEEP.DEFAULT_DURATION,
            delay: ROGER_BEEP.DEFAULT_DELAY
        };
        this.enabled = true;
        this.state = MODULE_STATES.IDLE;
        this.isPlaying = false;

        this.logger.info('Roger Beep reseteado a configuracion MDC-1200 por defecto');
    }

    /**
     * Destructor - limpiar recursos
     */
    destroy() {
        this.state = MODULE_STATES.DISABLED;
        this.enabled = false;
        this.isPlaying = false;
        this.logger.info('Roger Beep destruido');
    }
}

module.exports = RogerBeep;
