const { spawn } = require('child_process');
const { createLogger } = require('../logging/Logger');

/**
 * Detecta dispositivos de audio de captura disponibles
 */
class AudioDeviceDetector {
    constructor() {
        this.logger = createLogger('[AudioDeviceDetector]');
    }

    /**
     * Verifica si hay dispositivos de captura de audio disponibles
     * @returns {Promise<boolean>} true si hay dispositivos disponibles
     */
    async hasCaptureDevices() {
        try {
            const devices = await this.listCaptureDevices();
            return devices.length > 0;
        } catch (error) {
            this.logger.warn('Error detectando dispositivos de captura:', error.message);
            return false;
        }
    }

    /**
     * Lista todos los dispositivos de captura disponibles
     * @returns {Promise<Array>} Array de dispositivos
     */
    async listCaptureDevices() {
        return new Promise((resolve, reject) => {
            const arecord = spawn('arecord', ['-l']);
            let stdout = '';
            let stderr = '';

            arecord.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            arecord.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            arecord.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`arecord -l failed with code ${code}: ${stderr}`));
                    return;
                }

                // Parsear salida de arecord -l
                const devices = this.parseArecordOutput(stdout);
                resolve(devices);
            });

            arecord.on('error', (err) => {
                reject(err);
            });

            // Timeout de seguridad
            setTimeout(() => {
                if (!arecord.killed) {
                    arecord.kill('SIGTERM');
                    reject(new Error('arecord -l timeout'));
                }
            }, 5000);
        });
    }

    /**
     * Parsea la salida de arecord -l
     * @param {string} output - Salida de arecord -l
     * @returns {Array} Array de dispositivos
     */
    parseArecordOutput(output) {
        const devices = [];
        const lines = output.split('\n');

        for (const line of lines) {
            // Buscar líneas como: "card 0: Intel [HDA Intel], device 0: CX20561 Analog [CX20561 Analog]"
            const match = line.match(/card\s+(\d+):\s+([^,]+),\s+device\s+(\d+):\s+(.+)\[(.+)\]/);
            if (match) {
                devices.push({
                    card: parseInt(match[1]),
                    cardName: match[2].trim(),
                    device: parseInt(match[3]),
                    deviceName: match[4].trim(),
                    fullName: match[5].trim(),
                    hw: `hw:${match[1]},${match[3]}`,
                    plughw: `plughw:${match[1]},${match[3]}`
                });
            }
        }

        return devices;
    }

    /**
     * Obtiene información detallada de dispositivos
     * @returns {Promise<Object>} Información de dispositivos de captura y reproducción
     */
    async getDeviceInfo() {
        const info = {
            capture: {
                available: false,
                count: 0,
                devices: []
            },
            playback: {
                available: false,
                count: 0,
                devices: []
            }
        };

        try {
            // Dispositivos de captura
            const captureDevices = await this.listCaptureDevices();
            info.capture.devices = captureDevices;
            info.capture.count = captureDevices.length;
            info.capture.available = captureDevices.length > 0;

            // Dispositivos de reproducción
            const playbackDevices = await this.listPlaybackDevices();
            info.playback.devices = playbackDevices;
            info.playback.count = playbackDevices.length;
            info.playback.available = playbackDevices.length > 0;

        } catch (error) {
            this.logger.warn('Error obteniendo información de dispositivos:', error.message);
        }

        return info;
    }

    /**
     * Lista dispositivos de reproducción
     * @returns {Promise<Array>} Array de dispositivos
     */
    async listPlaybackDevices() {
        return new Promise((resolve, reject) => {
            const aplay = spawn('aplay', ['-l']);
            let stdout = '';
            let stderr = '';

            aplay.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            aplay.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            aplay.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`aplay -l failed with code ${code}: ${stderr}`));
                    return;
                }

                // Parsear salida (mismo formato que arecord)
                const devices = this.parseArecordOutput(stdout);
                resolve(devices);
            });

            aplay.on('error', (err) => {
                reject(err);
            });

            // Timeout de seguridad
            setTimeout(() => {
                if (!aplay.killed) {
                    aplay.kill('SIGTERM');
                    reject(new Error('aplay -l timeout'));
                }
            }, 5000);
        });
    }

    /**
     * Imprime información de dispositivos en formato legible
     * @param {Object} info - Información de dispositivos
     */
    logDeviceInfo(info) {
        this.logger.info('=== Dispositivos de Audio ===');

        this.logger.info(`Captura: ${info.capture.available ? 'DISPONIBLE' : 'NO DISPONIBLE'} (${info.capture.count} dispositivos)`);
        if (info.capture.devices.length > 0) {
            info.capture.devices.forEach(dev => {
                this.logger.info(`  - ${dev.plughw}: ${dev.fullName}`);
            });
        }

        this.logger.info(`Reproducción: ${info.playback.available ? 'DISPONIBLE' : 'NO DISPONIBLE'} (${info.playback.count} dispositivos)`);
        if (info.playback.devices.length > 0) {
            info.playback.devices.forEach(dev => {
                this.logger.info(`  - ${dev.plughw}: ${dev.fullName}`);
            });
        }

        this.logger.info('============================');
    }
}

module.exports = AudioDeviceDetector;
