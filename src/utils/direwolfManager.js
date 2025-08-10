const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createLogger } = require('../logging/Logger');

/**
 * Manager para Direwolf TNC
 * Maneja el proceso de Direwolf de forma independiente
 */
class DirewolfManager {
    constructor() {
        this.logger = createLogger('[DirewolfManager]');
        this.process = null;
        this.isRunning = false;
        this.configPath = path.join(__dirname, '../../config/direwolf.conf');
        this.logPath = path.join(__dirname, '../../logs/direwolf.log');
        
        // Configuración por defecto
        this.config = {
            callsign: 'BASE1',
            location: {
                lat: -32.885,
                lon: -68.739
            },
            beacon: {
                interval: 15, // minutos
                comment: 'VX200 RPT Controller - Guaymallen, Mendoza'
            },
            ports: {
                kiss: 8001,
                agw: 8000
            }
        };
    }

    /**
     * Generar archivo de configuración de Direwolf
     */
    generateConfig() {
        const config = `# Configuración Direwolf para VX200 RPT Controller
# Generado automáticamente

# Callsign del repetidor
MYCALL ${this.config.callsign}

# Configuración de audio (usando mismo dispositivo que VX200 Controller)
ADEVICE default default
ARATE 48000

# Configuración de módem para canal 0
MODEM 0 1200

# Puertos de servicio
KISSPORT ${this.config.ports.kiss}
AGWPORT ${this.config.ports.agw}

# Beacon del repetidor cada ${this.config.beacon.interval} minutos
PBEACON delay=450 every=${this.config.beacon.interval} overlay=R symbol="repeater" lat=${this.config.location.lat} long=${this.config.location.lon} comment="${this.config.beacon.comment}"

# Directorio de logs
LOGDIR ${path.dirname(this.logPath)}

# Configuraciones del protocolo
DWAIT 10
SLOTTIME 10
PERSIST 63
TXDELAY 30
TXTAIL 1

# Sin filtros específicos

# Configuración de red (comentado por defecto)
# IGSERVER noam.aprs2.net
# IGLOGIN ${this.config.callsign} -1
`;

        try {
            // Crear directorio de configuración si no existe
            const configDir = path.dirname(this.configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            
            // Crear directorio de logs si no existe
            const logDir = path.dirname(this.logPath);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            
            fs.writeFileSync(this.configPath, config);
            this.logger.info('Archivo de configuración Direwolf generado');
            return true;
            
        } catch (error) {
            this.logger.error('Error generando configuración:', error.message);
            return false;
        }
    }

    /**
     * Iniciar Direwolf
     */
    async start() {
        if (this.isRunning) {
            this.logger.warn('Direwolf ya está ejecutándose');
            return true;
        }

        try {
            // Generar configuración
            if (!this.generateConfig()) {
                throw new Error('No se pudo generar configuración');
            }

            // Verificar que direwolf esté instalado
            if (!fs.existsSync('/usr/local/bin/direwolf')) {
                throw new Error('Direwolf no está instalado');
            }

            this.logger.info('Iniciando Direwolf TNC...');
            
            // Iniciar proceso
            this.process = spawn('/usr/local/bin/direwolf', [
                '-c', this.configPath,
                '-t', '0' // Sin color en terminal
            ], {
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: false
            });

            // Manejar eventos del proceso
            this.process.stdout.on('data', (data) => {
                const output = data.toString().trim();
                if (output) {
                    this.logger.debug('Direwolf stdout:', output);
                }
            });

            this.process.stderr.on('data', (data) => {
                const output = data.toString().trim();
                if (output && !output.includes('DNS-SD: Avahi')) {
                    this.logger.warn('Direwolf stderr:', output);
                }
            });

            this.process.on('close', (code) => {
                this.logger.info(`Direwolf terminado con código: ${code}`);
                this.isRunning = false;
                this.process = null;
            });

            this.process.on('error', (error) => {
                this.logger.error('Error en proceso Direwolf:', error.message);
                this.isRunning = false;
                this.process = null;
            });

            // Esperar un momento para que se inicie
            await new Promise(resolve => setTimeout(resolve, 3000));

            if (this.process && !this.process.killed) {
                this.isRunning = true;
                this.logger.info('Direwolf TNC iniciado correctamente');
                return true;
            } else {
                throw new Error('Proceso Direwolf terminó inesperadamente');
            }

        } catch (error) {
            this.logger.error('Error iniciando Direwolf:', error.message);
            return false;
        }
    }

    /**
     * Detener Direwolf
     */
    stop() {
        if (!this.isRunning || !this.process) {
            this.logger.info('Direwolf no está ejecutándose');
            return true;
        }

        try {
            this.logger.info('Deteniendo Direwolf TNC...');
            
            // Enviar SIGTERM
            this.process.kill('SIGTERM');
            
            // Esperar un momento
            setTimeout(() => {
                if (this.process && !this.process.killed) {
                    this.logger.warn('Forzando terminación de Direwolf...');
                    this.process.kill('SIGKILL');
                }
            }, 5000);

            this.isRunning = false;
            this.process = null;
            
            this.logger.info('Direwolf TNC detenido');
            return true;

        } catch (error) {
            this.logger.error('Error deteniendo Direwolf:', error.message);
            return false;
        }
    }

    /**
     * Reiniciar Direwolf
     */
    async restart() {
        this.logger.info('Reiniciando Direwolf TNC...');
        
        this.stop();
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return await this.start();
    }

    /**
     * Verificar si Direwolf está ejecutándose
     */
    isAlive() {
        return this.isRunning && this.process && !this.process.killed;
    }

    /**
     * Obtener estado
     */
    getStatus() {
        return {
            running: this.isRunning,
            pid: this.process ? this.process.pid : null,
            config: {
                callsign: this.config.callsign,
                location: this.config.location,
                ports: this.config.ports
            },
            files: {
                config: this.configPath,
                log: this.logPath
            }
        };
    }

    /**
     * Actualizar configuración
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.logger.info('Configuración actualizada');
        
        // Si está ejecutándose, reiniciar para aplicar cambios
        if (this.isRunning) {
            this.logger.info('Reiniciando para aplicar nueva configuración...');
            return this.restart();
        }
        
        return true;
    }

    /**
     * Verificar conectividad de puertos
     */
    async testPorts() {
        const net = require('net');
        
        const testPort = (port) => {
            return new Promise((resolve) => {
                const socket = new net.Socket();
                socket.setTimeout(1000);
                
                socket.on('connect', () => {
                    socket.destroy();
                    resolve(true);
                });
                
                socket.on('timeout', () => {
                    socket.destroy();
                    resolve(false);
                });
                
                socket.on('error', () => {
                    resolve(false);
                });
                
                socket.connect(port, 'localhost');
            });
        };

        const kissPortOpen = await testPort(this.config.ports.kiss);
        const agwPortOpen = await testPort(this.config.ports.agw);

        return {
            kiss: kissPortOpen,
            agw: agwPortOpen,
            allOpen: kissPortOpen && agwPortOpen
        };
    }

    /**
     * Destruir manager
     */
    destroy() {
        this.stop();
        this.logger.info('DirewolfManager destruido');
    }
}

module.exports = DirewolfManager;