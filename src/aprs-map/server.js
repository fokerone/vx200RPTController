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
    }

    start() {
        return new Promise((resolve) => {
            this.server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });

            this.server.listen(this.port, '0.0.0.0', () => {
                this.logger.info(`APRS Map server running on http://localhost:${this.port}`);
                this.isRunning = true;
                resolve();
            });
        });
    }

    stop() {
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
}

module.exports = APRSMapServer;