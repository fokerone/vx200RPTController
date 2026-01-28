const http = require('http');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('../logging/Logger');

class APRSMapServer {
    constructor(vx200Controller) {
        this.controller = vx200Controller;
        this.logger = createLogger('[APRS-Map]');
        this.server = null;
        this.port = process.env.APRS_MAP_PORT || 3000;
        this.isRunning = false;
        
        // Rate limiting básico: máximo 100 requests por IP por minuto
        this.rateLimiter = new Map();
        this.rateLimitWindow = 60000; // 1 minuto
        this.rateLimitMax = 100;

        // Timer para limpiar rate limiter (guardar referencia para cleanup)
        this.rateLimiterCleanupTimer = null;
    }

    /**
     * Iniciar timer de limpieza del rate limiter
     * Se llama en start() para evitar timers huérfanos
     */
    startRateLimiterCleanup() {
        // Limpiar timer existente si hay uno
        if (this.rateLimiterCleanupTimer) {
            clearInterval(this.rateLimiterCleanupTimer);
        }

        // Limpiar rate limiter cada 5 minutos
        this.rateLimiterCleanupTimer = setInterval(() => {
            this.rateLimiter.clear();
        }, 5 * 60000);
    }

    start() {
        return new Promise((resolve) => {
            this.server = http.createServer((req, res) => {
                // Verificar rate limiting antes de procesar
                if (!this.checkRateLimit(req, res)) {
                    return;
                }
                
                // Agregar headers de seguridad
                this.setSecurityHeaders(res);
                
                this.handleRequest(req, res);
            });

            this.server.listen(this.port, '0.0.0.0', () => {
                this.logger.info(`APRS Map server running on http://localhost:${this.port}`);
                this.isRunning = true;

                // Iniciar timer de limpieza del rate limiter
                this.startRateLimiterCleanup();

                resolve();
            });
        });
    }

    stop() {
        // Limpiar timer del rate limiter PRIMERO
        if (this.rateLimiterCleanupTimer) {
            clearInterval(this.rateLimiterCleanupTimer);
            this.rateLimiterCleanupTimer = null;
        }

        // Limpiar el Map del rate limiter
        this.rateLimiter.clear();

        if (this.server) {
            this.server.close();
            this.isRunning = false;
            this.logger.info('APRS Map server stopped');
        }
    }

    handleRequest(req, res) {
        const url = req.url;

        if (url === '/' || url === '/index.html') {
            this.serveFile(res, 'map.html', 'text/html');
        } else if (url === '/api/positions') {
            this.serveAPRSData(res);
        } else if (url === '/api/repeater') {
            this.serveRepeaterData(res);
        } else if (url.startsWith('/static/')) {
            const filePath = url.substring(8); // Remove /static/
            const ext = path.extname(filePath);
            const contentType = this.getContentType(ext);
            this.serveFile(res, filePath, contentType);
        } else if (url === '/favicon.ico') {
            // Simple favicon response to avoid 404s
            res.writeHead(204);
            res.end();
        } else {
            this.serve404(res);
        }
    }

    serveFile(res, filename, contentType) {
        const filePath = path.join(__dirname, filename);
        
        fs.readFile(filePath, (err, data) => {
            if (err) {
                this.serve404(res);
                return;
            }
            
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'no-cache'
            });
            res.end(data);
        });
    }

    async serveAPRSData(res) {
        try {
            // Obtener datos del módulo APRS
            const aprsModule = this.controller.modules.aprs;
            let data = { stations: [], metadata: {} };

            if (aprsModule && aprsModule.isInitialized) {
                // Intentar leer el archivo JSON directamente
                const logFile = path.join(__dirname, '../../logs/aprs-positions.json');
                if (fs.existsSync(logFile)) {
                    const rawData = fs.readFileSync(logFile, 'utf8');
                    data = JSON.parse(rawData);
                    
                    // Enriquecer estaciones con datos del log de Direwolf
                    if (data.stations && data.stations.length > 0) {
                        for (let i = 0; i < data.stations.length; i++) {
                            const station = data.stations[i];
                            const enrichedData = await aprsModule.getEnrichedDataFromLog(station.callsign);
                            
                            if (enrichedData) {
                                data.stations[i] = {
                                    ...station,
                                    speed: enrichedData.speed,
                                    course: enrichedData.course,
                                    altitude: enrichedData.altitude,
                                    audioLevel: enrichedData.audioLevel,
                                    errorRate: enrichedData.errorRate
                                };
                            }
                        }
                    }
                } else {
                    // Fallback: obtener datos del módulo
                    const positions = aprsModule.getAllPositions();
                    data = {
                        stations: positions,
                        metadata: {
                            totalStations: positions.length,
                            generated: new Date().toISOString(),
                            repeater: {
                                callsign: aprsModule.config.callsign,
                                location: aprsModule.config.location
                            }
                        }
                    };
                }
            }

            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify(data));
        } catch (error) {
            this.logger.error('Error serving APRS data:', error.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    }

    serveRepeaterData(res) {
        try {
            const aprsModule = this.controller.modules.aprs;
            const repeaterData = {
                callsign: aprsModule?.config?.callsign || 'UNKNOWN',
                location: aprsModule?.config?.location || { lat: 0, lon: 0 },
                status: aprsModule?.getStatus() || {}
            };

            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify(repeaterData));
        } catch (error) {
            this.logger.error('Error serving repeater data:', error.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    }

    serve404(res) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
    }

    getContentType(ext) {
        const types = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.gif': 'image/gif',
            '.ico': 'image/x-icon'
        };
        return types[ext] || 'text/plain';
    }

    getStatus() {
        return {
            running: this.isRunning,
            port: this.port,
            url: `http://localhost:${this.port}`
        };
    }
    
    // Verificar rate limiting por IP
    checkRateLimit(req, res) {
        const clientIP = req.connection.remoteAddress || 
                        req.socket.remoteAddress || 
                        (req.connection.socket ? req.connection.socket.remoteAddress : '');
        
        const now = Date.now();
        const clientKey = clientIP;
        
        if (!this.rateLimiter.has(clientKey)) {
            this.rateLimiter.set(clientKey, { count: 1, resetTime: now + this.rateLimitWindow });
            return true;
        }
        
        const clientData = this.rateLimiter.get(clientKey);
        
        // Reset si ha pasado la ventana de tiempo
        if (now > clientData.resetTime) {
            this.rateLimiter.set(clientKey, { count: 1, resetTime: now + this.rateLimitWindow });
            return true;
        }
        
        // Verificar si excede el límite
        if (clientData.count >= this.rateLimitMax) {
            this.logger.warn(`Rate limit exceeded for IP: ${clientIP}`);
            res.writeHead(429, { 
                'Content-Type': 'application/json',
                'Retry-After': Math.ceil((clientData.resetTime - now) / 1000)
            });
            res.end(JSON.stringify({ 
                error: 'Too Many Requests',
                message: 'Rate limit exceeded. Try again later.'
            }));
            return false;
        }
        
        // Incrementar contador
        clientData.count++;
        return true;
    }
    
    // Agregar headers de seguridad básicos
    setSecurityHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Content-Security-Policy', 
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; " +
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; " +
            "style-src-elem 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; " +
            "font-src 'self' https://cdn.jsdelivr.net data:; " +
            "img-src 'self' data: https: http:; " +
            "connect-src 'self';"
        );
    }
}

module.exports = APRSMapServer;