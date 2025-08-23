const https = require('https');
const { createLogger } = require('../logging/Logger');

class DDNSManager {
    constructor(controller) {
        this.controller = controller;
        this.logger = createLogger('[DDNS]');
        
        // Configuración DuckDNS
        this.domain = process.env.DUCKDNS_DOMAIN || null;
        this.token = process.env.DUCKDNS_TOKEN || null;
        this.updateInterval = 5 * 60 * 1000; // 5 minutos
        this.lastIP = null;
        this.updateTimer = null;
        this.isRunning = false;
        
        // URLs para obtener IP pública
        this.ipServices = [
            'https://ifconfig.me/ip',
            'https://api.ipify.org',
            'https://ipinfo.io/ip',
            'https://checkip.amazonaws.com'
        ];
    }
    
    async initialize() {
        try {
            if (!this.domain || !this.token) {
                this.logger.info('DDNS deshabilitado - Configurar DUCKDNS_DOMAIN y DUCKDNS_TOKEN en .env');
                return false;
            }
            
            this.logger.info(`DDNS inicializado para dominio: ${this.domain}.duckdns.org`);
            
            // Primera actualización inmediata
            await this.updateIP();
            
            // Programar actualizaciones automáticas
            this.startAutoUpdate();
            
            this.isRunning = true;
            return true;
            
        } catch (error) {
            this.logger.error('Error inicializando DDNS:', error.message);
            return false;
        }
    }
    
    startAutoUpdate() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }
        
        this.updateTimer = setInterval(async () => {
            try {
                await this.updateIP();
            } catch (error) {
                this.logger.error('Error en actualización automática DDNS:', error.message);
            }
        }, this.updateInterval);
        
        this.logger.info(`Actualización automática DDNS programada cada ${this.updateInterval / 60000} minutos`);
    }
    
    async getCurrentPublicIP() {
        for (const service of this.ipServices) {
            try {
                const ip = await this.httpGet(service, 5000);
                const cleanIP = ip.trim();
                
                // Validar formato IPv4
                if (/^(\d{1,3}\.){3}\d{1,3}$/.test(cleanIP)) {
                    return cleanIP;
                }
            } catch (error) {
                this.logger.debug(`Servicio IP falló: ${service} - ${error.message}`);
                continue;
            }
        }
        
        throw new Error('No se pudo obtener IP pública desde ningún servicio');
    }
    
    async updateIP(forceUpdate = false) {
        try {
            const currentIP = await this.getCurrentPublicIP();
            
            if (!forceUpdate && this.lastIP === currentIP) {
                this.logger.debug(`IP sin cambios: ${currentIP}`);
                return { success: true, ip: currentIP, changed: false };
            }
            
            const updateUrl = `https://www.duckdns.org/update?domains=${this.domain}&token=${this.token}&ip=${currentIP}`;
            const response = await this.httpGet(updateUrl, 10000);
            
            if (response.trim() === 'OK') {
                const wasChanged = this.lastIP !== currentIP;
                this.lastIP = currentIP;
                
                if (wasChanged) {
                    this.logger.info(`DDNS actualizado: ${this.domain}.duckdns.org → ${currentIP}`);
                    
                    // Emitir evento para otros módulos
                    if (this.controller.emit) {
                        this.controller.emit('ddns:updated', {
                            domain: `${this.domain}.duckdns.org`,
                            ip: currentIP,
                            timestamp: new Date()
                        });
                    }
                } else {
                    this.logger.debug(`DDNS confirmado: ${currentIP}`);
                }
                
                return { success: true, ip: currentIP, changed: wasChanged };
            } else {
                throw new Error(`Respuesta inesperada de DuckDNS: ${response}`);
            }
            
        } catch (error) {
            this.logger.error('Error actualizando DDNS:', error.message);
            return { success: false, error: error.message };
        }
    }
    
    async httpGet(url, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const request = https.get(url, { timeout }, (response) => {
                let data = '';
                
                response.on('data', (chunk) => {
                    data += chunk;
                });
                
                response.on('end', () => {
                    if (response.statusCode === 200) {
                        resolve(data);
                    } else {
                        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                    }
                });
            });
            
            request.on('error', reject);
            request.on('timeout', () => {
                request.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }
    
    stop() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
        
        this.isRunning = false;
        this.logger.info('DDNS manager detenido');
    }
    
    getStatus() {
        return {
            running: this.isRunning,
            domain: this.domain ? `${this.domain}.duckdns.org` : null,
            lastIP: this.lastIP,
            updateInterval: this.updateInterval / 60000,
            configured: !!(this.domain && this.token)
        };
    }
    
    // Método manual para forzar actualización
    async forceUpdate() {
        this.logger.info('Forzando actualización DDNS...');
        return await this.updateIP(true);
    }
}

module.exports = DDNSManager;