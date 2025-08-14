const EventEmitter = require('events');
const net = require('net');
const { MODULE_STATES, DELAYS } = require('../constants');
const { delay, createLogger } = require('../utils');

class MumbleBridge extends EventEmitter {
    constructor(audioManager) {
        super();
        this.audioManager = audioManager;
        this.logger = createLogger('[MumbleBridge]');
        this.state = MODULE_STATES.IDLE;
        
        this.config = {
            enabled: process.env.MUMBLE_BRIDGE_ENABLED === 'true' || false, // Por defecto deshabilitado
            server: {
                host: process.env.MUMBLE_SERVER_HOST || 'localhost',
                port: parseInt(process.env.MUMBLE_SERVER_PORT) || 64738,
                password: process.env.MUMBLE_SERVER_PASSWORD || 'VX200_Radio_2025'
            },
            user: {
                username: process.env.MUMBLE_USERNAME || 'VX200_Bridge',
                password: null // Sin password de usuario
            },
            channel: {
                name: process.env.MUMBLE_CHANNEL || 'VX200_Repetidora',
                password: process.env.MUMBLE_CHANNEL_PASSWORD || 'radio2025'
            },
            audio: {
                inputDevice: 'vhf_to_mumble.monitor',
                outputDevice: 'mumble_to_vhf',
                voxThreshold: 0.05,
                gainInput: 1.0,
                gainOutput: 1.0
            },
            reconnect: {
                enabled: true,
                maxAttempts: 5,
                delayMs: 5000
            }
        };
        
        // Estado de conexión
        this.mumbleClient = null;
        this.targetChannel = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.connectionAttempts = 0;
        this.reconnectTimer = null;
        
        // Estado de audio
        this.audioStreaming = false;
        this.inputStream = null;
        this.outputStream = null;
        
        // Estadísticas
        this.stats = {
            connectTime: null,
            lastMessage: null,
            bytesReceived: 0,
            bytesSent: 0,
            usersInChannel: 0,
            connectionAttempts: 0
        };
        
        this.validateConfiguration();
        this.logger.info('Módulo MumbleBridge inicializado');
    }

    /**
     * Validar configuración del módulo
     */
    validateConfiguration() {
        if (!this.audioManager) {
            this.logger.error('AudioManager no disponible');
            this.state = MODULE_STATES.ERROR;
            return false;
        }

        // Validar configuración del servidor
        if (!this.config.server.host || !this.config.server.port) {
            this.logger.error('Configuración de servidor Mumble inválida');
            this.state = MODULE_STATES.ERROR;
            return false;
        }

        // Validar puerto
        if (this.config.server.port < 1 || this.config.server.port > 65535) {
            this.logger.warn(`Puerto fuera de rango: ${this.config.server.port}, usando 64738`);
            this.config.server.port = 64738;
        }

        // Validar configuración de audio
        if (this.config.audio.voxThreshold < 0.01 || this.config.audio.voxThreshold > 1.0) {
            this.logger.warn(`VOX threshold fuera de rango: ${this.config.audio.voxThreshold}, usando 0.05`);
            this.config.audio.voxThreshold = 0.05;
        }

        this.logger.debug('Configuración validada exitosamente');
        return true;
    }

    /**
     * Configurar parámetros del bridge
     */
    configure(newConfig) {
        if (!newConfig || typeof newConfig !== 'object') {
            this.logger.warn('Configuración inválida recibida');
            return false;
        }

        const oldEnabled = this.config.enabled;
        this.config = { ...this.config, ...newConfig };
        
        // Permitir habilitar el módulo dinámicamente
        if (newConfig.enabled !== undefined) {
            this.config.enabled = newConfig.enabled;
        }
        
        // Validar nueva configuración
        if (!this.validateConfiguration()) {
            this.logger.error('Nueva configuración es inválida');
            return false;
        }
        
        this.logger.info(`MumbleBridge reconfigurado: ${this.config.server.host}:${this.config.server.port}`);
        
        // Reiniciar si está corriendo y se habilitó/deshabilitó
        if (oldEnabled !== this.config.enabled) {
            if (this.config.enabled && !this.isConnected) {
                this.start();
            } else if (!this.config.enabled && this.isConnected) {
                this.stop();
            }
        }
        
        return true;
    }

    /**
     * Iniciar bridge Mumble
     */
    async start() {
        if (this.isConnected || this.isConnecting) {
            this.logger.warn('MumbleBridge ya está conectado o conectando');
            return false;
        }

        if (!this.config.enabled) {
            this.logger.warn('MumbleBridge está deshabilitado');
            return false;
        }

        if (this.state === MODULE_STATES.ERROR) {
            this.logger.error('MumbleBridge en estado de error, no se puede iniciar');
            return false;
        }

        this.logger.info('Iniciando MumbleBridge...');
        this.isConnecting = true;
        this.state = MODULE_STATES.ACTIVE;
        
        try {
            await this.connectToMumble();
            this.emit('started', { 
                server: `${this.config.server.host}:${this.config.server.port}`,
                channel: this.config.channel.name 
            });
            return true;
        } catch (error) {
            this.logger.error('Error iniciando MumbleBridge:', error.message);
            this.isConnecting = false;
            this.state = MODULE_STATES.ERROR;
            this.scheduleReconnect();
            return false;
        }
    }

    /**
     * Detener bridge Mumble
     */
    stop() {
        this.logger.info('Deteniendo MumbleBridge...');
        
        // Cancelar reconexión
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        // Detener streaming de audio
        this.stopAudioStreaming();
        
        // Desconectar cliente
        if (this.mumbleClient) {
            try {
                if (typeof this.mumbleClient.disconnect === 'function') {
                    this.mumbleClient.disconnect();
                } else if (typeof this.mumbleClient.destroy === 'function') {
                    this.mumbleClient.destroy();
                }
            } catch (error) {
                this.logger.debug('Error desconectando cliente:', error.message);
            }
            this.mumbleClient = null;
        }
        
        // Resetear estado
        this.isConnected = false;
        this.isConnecting = false;
        this.targetChannel = null;
        this.connectionAttempts = 0;
        this.state = MODULE_STATES.IDLE;
        
        this.logger.info('MumbleBridge detenido');
        this.emit('stopped', { 
            uptime: this.stats.connectTime ? Date.now() - this.stats.connectTime : 0
        });
        
        return true;
    }

    /**
     * Conectar al servidor Mumble
     */
    async connectToMumble() {
        return new Promise((resolve, reject) => {
            this.connectionAttempts++;
            this.stats.connectionAttempts++;
            
            this.logger.info(`Conectando a Mumble ${this.config.server.host}:${this.config.server.port} (intento ${this.connectionAttempts})`);
            
            const connectTimeout = setTimeout(() => {
                reject(new Error('Timeout conectando a Mumble'));
            }, 10000);
            
            try {
                // Crear cliente Mumble
                this.mumbleClient = new MumbleClient({
                    host: this.config.server.host,
                    port: this.config.server.port,
                    username: this.config.user.username,
                    password: this.config.server.password,
                    rejectUnauthorized: false
                });
                
                this.setupMumbleEvents(this.mumbleClient);
                
                // Conectar
                this.mumbleClient.connect().then(() => {
                    clearTimeout(connectTimeout);
                    
                    this.isConnected = true;
                    this.isConnecting = false;
                    this.connectionAttempts = 0;
                    this.stats.connectTime = Date.now();
                    
                    this.logger.info(`Conectado exitosamente a Mumble - Canal: ${this.config.channel.name}`);
                    
                    // Iniciar streaming de audio
                    this.startAudioStreaming();
                    
                    resolve();
                }).catch(error => {
                    clearTimeout(connectTimeout);
                    this.logger.error('Error conectando a Mumble:', error.message);
                    reject(error);
                });
                
            } catch (error) {
                clearTimeout(connectTimeout);
                this.logger.error('Error creando cliente Mumble:', error.message);
                reject(error);
            }
        });
    }

    /**
     * Configurar eventos del cliente Mumble
     */
    setupMumbleEvents(client) {
        client.on('ready', () => {
            this.logger.info('Cliente Mumble listo');
        });
        
        client.on('disconnect', (reason) => {
            this.logger.warn('Desconectado de Mumble:', reason);
            this.handleDisconnection();
        });
        
        client.on('error', (error) => {
            this.logger.error('Error del cliente Mumble:', error.message);
            this.handleDisconnection();
        });
        
        client.on('voice', (data) => {
            // Audio recibido de Mumble → enviar a VHF
            this.handleIncomingVoice(data);
        });
        
        client.on('user-connect', (user) => {
            this.logger.info(`Usuario conectado: ${user.name}`);
            this.updateChannelStats();
        });
        
        client.on('user-disconnect', (user) => {
            this.logger.info(`Usuario desconectado: ${user.name}`);
            this.updateChannelStats();
        });
        
        client.on('message', (message) => {
            this.logger.info(`Mensaje de ${message.actor.name}: ${message.message}`);
            this.stats.lastMessage = Date.now();
        });
    }

    /**
     * Unirse al canal objetivo
     */
    async joinTargetChannel() {
        return new Promise((resolve, reject) => {
            if (!this.mumbleClient) {
                reject(new Error('Cliente Mumble no disponible'));
                return;
            }
            
            // Buscar canal por nombre
            const channel = this.mumbleClient.channelByName(this.config.channel.name);
            
            if (channel) {
                this.targetChannel = channel;
                this.mumbleClient.user.moveToChannel(channel, this.config.channel.password);
                this.logger.info(`Unido al canal: ${this.config.channel.name}`);
                this.updateChannelStats();
                resolve();
            } else {
                // Si el canal no existe, crear uno nuevo
                this.createTargetChannel().then(resolve).catch(reject);
            }
        });
    }

    /**
     * Crear canal objetivo si no existe
     */
    async createTargetChannel() {
        return new Promise((resolve, reject) => {
            this.logger.info(`Creando canal: ${this.config.channel.name}`);
            
            try {
                const newChannel = this.mumbleClient.channelCreate(
                    this.config.channel.name,
                    this.mumbleClient.rootChannel,
                    this.config.channel.password
                );
                
                this.targetChannel = newChannel;
                this.mumbleClient.user.moveToChannel(newChannel);
                this.logger.info(`Canal creado y unido: ${this.config.channel.name}`);
                resolve();
            } catch (error) {
                this.logger.error('Error creando canal:', error.message);
                reject(error);
            }
        });
    }

    /**
     * Iniciar streaming de audio bidireccional
     */
    startAudioStreaming() {
        if (this.audioStreaming) {
            this.logger.debug('Audio streaming ya activo');
            return;
        }
        
        this.logger.info('Iniciando streaming de audio bidireccional');
        this.audioStreaming = true;
        
        // TODO: Implementar captura de audio VHF → Mumble
        // TODO: Implementar reproducción Mumble → VHF
        
        this.emit('audio_started');
    }

    /**
     * Detener streaming de audio
     */
    stopAudioStreaming() {
        if (!this.audioStreaming) {
            return;
        }
        
        this.logger.info('Deteniendo streaming de audio');
        this.audioStreaming = false;
        
        if (this.inputStream) {
            this.inputStream.end();
            this.inputStream = null;
        }
        
        if (this.outputStream) {
            this.outputStream.end();
            this.outputStream = null;
        }
        
        this.emit('audio_stopped');
    }

    /**
     * Manejar audio entrante de Mumble
     */
    handleIncomingVoice(voiceData) {
        if (!this.audioStreaming) return;
        
        this.stats.bytesReceived += voiceData.length;
        
        // TODO: Enviar audio a dispositivo de salida VHF
        // Esto se integrará con el AudioManager para enviar a auriculares/VOX
    }

    /**
     * Manejar desconexión
     */
    handleDisconnection() {
        if (!this.isConnected) return;
        
        this.isConnected = false;
        this.isConnecting = false;
        this.stopAudioStreaming();
        
        this.emit('disconnected', {
            reason: 'connection_lost',
            uptime: this.stats.connectTime ? Date.now() - this.stats.connectTime : 0
        });
        
        // Programar reconexión si está habilitada
        if (this.config.enabled && this.config.reconnect.enabled) {
            this.scheduleReconnect();
        }
    }

    /**
     * Programar reconexión automática
     */
    scheduleReconnect() {
        if (this.connectionAttempts >= this.config.reconnect.maxAttempts) {
            this.logger.error(`Máximo de intentos de reconexión alcanzado (${this.config.reconnect.maxAttempts})`);
            this.state = MODULE_STATES.ERROR;
            return;
        }
        
        const delay = this.config.reconnect.delayMs * this.connectionAttempts;
        this.logger.info(`Reconectando en ${delay}ms (intento ${this.connectionAttempts + 1}/${this.config.reconnect.maxAttempts})`);
        
        this.reconnectTimer = setTimeout(async () => {
            if (this.config.enabled && !this.isConnected) {
                try {
                    await this.connectToMumble();
                } catch (error) {
                    this.logger.error('Error en reconexión:', error.message);
                    this.scheduleReconnect();
                }
            }
        }, delay);
    }

    /**
     * Actualizar estadísticas del canal
     */
    updateChannelStats() {
        if (this.targetChannel) {
            this.stats.usersInChannel = this.targetChannel.users.length;
        }
    }

    /**
     * Obtener estado actual
     */
    getStatus() {
        return {
            enabled: this.config.enabled,
            state: this.state,
            connected: this.isConnected,
            connecting: this.isConnecting,
            server: `${this.config.server.host}:${this.config.server.port}`,
            channel: this.config.channel.name,
            username: this.config.user.username,
            audioStreaming: this.audioStreaming,
            connectionAttempts: this.connectionAttempts,
            maxReconnectAttempts: this.config.reconnect.maxAttempts,
            usersInChannel: this.stats.usersInChannel,
            uptime: this.stats.connectTime ? Date.now() - this.stats.connectTime : 0,
            lastMessage: this.stats.lastMessage
        };
    }

    /**
     * Obtener estadísticas detalladas
     */
    getStats() {
        return {
            ...this.stats,
            config: {
                server: this.config.server.host + ':' + this.config.server.port,
                channel: this.config.channel.name,
                reconnectEnabled: this.config.reconnect.enabled,
                maxAttempts: this.config.reconnect.maxAttempts
            },
            connection: {
                isConnected: this.isConnected,
                isConnecting: this.isConnecting,
                attempts: this.connectionAttempts,
                uptime: this.stats.connectTime ? Date.now() - this.stats.connectTime : 0
            },
            audio: {
                streaming: this.audioStreaming,
                bytesReceived: this.stats.bytesReceived,
                bytesSent: this.stats.bytesSent,
                inputDevice: this.config.audio.inputDevice,
                outputDevice: this.config.audio.outputDevice
            }
        };
    }

    /**
     * Enviar mensaje de texto al canal
     */
    sendMessage(message) {
        if (!this.isConnected || !this.targetChannel) {
            this.logger.warn('No conectado, no se puede enviar mensaje');
            return false;
        }
        
        try {
            this.targetChannel.sendMessage(message);
            this.logger.info(`Mensaje enviado: ${message}`);
            return true;
        } catch (error) {
            this.logger.error('Error enviando mensaje:', error.message);
            return false;
        }
    }

    /**
     * Test de conectividad
     */
    async testConnection() {
        this.logger.info('Ejecutando test de conectividad...');
        
        if (this.isConnected) {
            return {
                success: true,
                message: 'Ya conectado al servidor Mumble',
                server: `${this.config.server.host}:${this.config.server.port}`,
                channel: this.config.channel.name,
                users: this.stats.usersInChannel
            };
        }
        
        try {
            await this.connectToMumble();
            await delay(2000); // Esperar estabilización
            
            const result = {
                success: true,
                message: 'Conexión exitosa',
                server: `${this.config.server.host}:${this.config.server.port}`,
                channel: this.config.channel.name,
                users: this.stats.usersInChannel
            };
            
            this.stop(); // Desconectar después del test
            return result;
            
        } catch (error) {
            return {
                success: false,
                message: `Error de conexión: ${error.message}`,
                server: `${this.config.server.host}:${this.config.server.port}`,
                error: error.message
            };
        }
    }

    /**
     * Destructor - limpiar recursos
     */
    destroy() {
        this.stop();
        this.state = MODULE_STATES.DISABLED;
        this.removeAllListeners();
        this.logger.info('Módulo MumbleBridge destruido');
    }
}

module.exports = MumbleBridge;