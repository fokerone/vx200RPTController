const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

class WebServer {
    constructor(controller) {
        this.controller = controller;
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        this.port = 3000;
        this.lastSignalBroadcast = 0;
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
        
        console.log('🌐 Servidor web inicializado');
    }

    setupMiddleware() {
        // CORS y JSON
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        
        // Archivos estáticos
        this.app.use(express.static(path.join(__dirname, '../../public')));
        
        // Motor de plantillas
        this.app.set('view engine', 'ejs');
        this.app.set('views', path.join(__dirname, '../../views'));
    }

    setupRoutes() {
        // Página principal
        this.app.get('/', (req, res) => {
            res.render('index', {
                title: 'VX200 Controller - LU',
                status: this.getSystemStatus()
            });
        });

        // API Routes existentes
        this.app.get('/api/status', (req, res) => {
            res.json(this.getSystemStatus());
        });

        this.app.post('/api/baliza/manual', (req, res) => {
            this.controller.modules.baliza.execute('*9');
            res.json({ success: true, message: 'Baliza manual ejecutada' });
        });

        this.app.post('/api/baliza/config', (req, res) => {
            const { interval, frequency, duration, volume, message } = req.body;
            
            this.controller.modules.baliza.configure({
                interval: parseInt(interval),
                tone: {
                    frequency: parseInt(frequency),
                    duration: parseInt(duration),
                    volume: parseFloat(volume)
                },
                message: message
            });
            
            res.json({ success: true, message: 'Configuración actualizada' });
        });

        this.app.post('/api/datetime/execute', (req, res) => {
            this.controller.modules.datetime.execute('*1');
            res.json({ success: true, message: 'Fecha/hora ejecutada' });
        });

        this.app.post('/api/ai/execute', (req, res) => {
            this.controller.modules.aiChat.execute('*2');
            res.json({ success: true, message: 'IA Chat ejecutado' });
        });

        this.app.post('/api/sms/execute', (req, res) => {
            this.controller.modules.sms.execute('*3');
            res.json({ success: true, message: 'SMS iniciado' });
        });

        this.app.get('/api/logs', (req, res) => {
            // TODO: Implementar logs reales
            res.json([
                { timestamp: new Date().toISOString(), level: 'info', message: 'Sistema iniciado' },
                { timestamp: new Date(Date.now() - 60000).toISOString(), level: 'info', message: 'Baliza transmitida' },
                { timestamp: new Date(Date.now() - 120000).toISOString(), level: 'info', message: 'DTMF detectado: *1' }
            ]);
        });

        // ===== NUEVAS RUTAS ROGER BEEP =====
        
        this.app.get('/api/roger-beep/status', (req, res) => {
            try {
                const status = this.controller.audio.getRogerBeep().getConfig();
                res.json({ success: true, data: status });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.post('/api/roger-beep/config', (req, res) => {
            try {
                const { type, volume, duration, delay, enabled } = req.body;
                
                const config = {};
                if (type) config.type = type;
                if (volume !== undefined) config.volume = parseFloat(volume);
                if (duration !== undefined) config.duration = parseInt(duration);
                if (delay !== undefined) config.delay = parseInt(delay);
                if (enabled !== undefined) config.enabled = Boolean(enabled);

                this.controller.audio.configureRogerBeep(config);
                
                res.json({ success: true, message: 'Roger Beep configurado correctamente' });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.post('/api/roger-beep/test', (req, res) => {
            try {
                const { type } = req.body;
                this.controller.audio.testRogerBeep(type || null);
                res.json({ success: true, message: `Test roger beep ${type || 'actual'} ejecutado` });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.post('/api/roger-beep/test-all', (req, res) => {
            try {
                this.controller.testAllRogerBeeps();
                res.json({ success: true, message: 'Test completo de roger beeps iniciado' });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.post('/api/roger-beep/volume', (req, res) => {
            try {
                const { volume } = req.body;
                this.controller.setRogerBeepVolume(parseFloat(volume));
                res.json({ success: true, message: `Volumen roger beep ajustado a ${Math.round(volume * 100)}%` });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        // Rutas del sistema existentes
        this.app.post('/api/system/shutdown', (req, res) => {
            console.log('🌐 Solicitud de apagado desde panel web');
            res.json({ success: true, message: 'Sistema apagándose...' });
            
            // Apagar después de enviar respuesta
            setTimeout(() => {
                this.controller.shutdown();
            }, 1000);
        });

        this.app.post('/api/system/restart', (req, res) => {
            console.log('🌐 Solicitud de reinicio desde panel web');
            res.json({ success: true, message: 'Sistema reiniciándose...' });
            
            // Reiniciar después de enviar respuesta
            setTimeout(() => {
                this.controller.restart();
            }, 1000);
        });

        this.app.post('/api/system/status', (req, res) => {
            const { action } = req.body; // 'start' o 'stop'
            
            try {
                if (action === 'stop') {
                    this.controller.stopServices();
                    res.json({ success: true, message: 'Servicios detenidos' });
                } else if (action === 'start') {
                    this.controller.startServices();
                    res.json({ success: true, message: 'Servicios iniciados' });
                } else {
                    res.status(400).json({ success: false, message: 'Acción inválida' });
                }
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.post('/api/audio/toggle', (req, res) => {
            try {
                if (this.controller.audio.isRecording) {
                    this.controller.audio.stop();
                    res.json({ success: true, message: 'Audio detenido' });
                } else {
                    this.controller.audio.start();
                    res.json({ success: true, message: 'Audio iniciado' });
                }
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });

        this.app.post('/api/baliza/toggle', (req, res) => {
            try {
                if (this.controller.modules.baliza.isRunning) {
                    this.controller.modules.baliza.stop();
                    res.json({ success: true, message: 'Baliza detenida' });
                } else {
                    this.controller.modules.baliza.start();
                    res.json({ success: true, message: 'Baliza iniciada' });
                }
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log('🔌 Cliente web conectado');

            // Enviar estado inicial
            socket.emit('system_status', this.getSystemStatus());

            // Manejar desconexión
            socket.on('disconnect', () => {
                console.log('🔌 Cliente web desconectado');
            });

            // Manejar comandos desde el panel
            socket.on('execute_command', async (data) => {
                console.log(`🌐 Comando web: ${data.command}`);
                
                try {
                    switch (data.command) {
                        case 'baliza_manual':
                            await this.controller.modules.baliza.execute('*9');
                            break;
                        case 'datetime':
                            await this.controller.modules.datetime.execute('*1');
                            break;
                        case 'ai_chat':
                            await this.controller.modules.aiChat.execute('*2');
                            break;
                        case 'sms':
                            await this.controller.modules.sms.execute('*3');
                            break;

                        // ===== NUEVOS COMANDOS ROGER BEEP =====
                        case 'roger_beep_toggle':
                            const isEnabled = this.controller.audio.getRogerBeep().getConfig().enabled;
                            this.controller.audio.getRogerBeep().setEnabled(!isEnabled);
                            await this.controller.audio.speakNoBeep(`Roger beep ${!isEnabled ? 'habilitado' : 'deshabilitado'}`);
                            socket.emit('command_result', { 
                                success: true, 
                                message: `Roger beep ${!isEnabled ? 'habilitado' : 'deshabilitado'}` 
                            });
                            return;
                            
                        case 'roger_beep_classic':
                            this.controller.audio.getRogerBeep().setType('classic');
                            await this.controller.audio.speak('Roger beep clásico activado');
                            break;
                            
                        case 'roger_beep_motorola':
                            this.controller.audio.getRogerBeep().setType('motorola');
                            await this.controller.audio.speak('Roger beep Motorola activado');
                            break;
                            
                        case 'roger_beep_kenwood':
                            this.controller.audio.getRogerBeep().setType('kenwood');
                            await this.controller.audio.speak('Roger beep Kenwood activado');
                            break;
                            
                        case 'roger_beep_custom':
                            this.controller.audio.getRogerBeep().setType('custom');
                            await this.controller.audio.speak('Roger beep personalizado activado');
                            break;
                            
                        case 'roger_beep_test':
                            await this.controller.audio.testRogerBeep();
                            socket.emit('command_result', { 
                                success: true, 
                                message: 'Test roger beep ejecutado' 
                            });
                            return;
                            
                        case 'roger_beep_test_all':
                            await this.controller.testAllRogerBeeps();
                            socket.emit('command_result', { 
                                success: true, 
                                message: 'Test completo roger beeps iniciado' 
                            });
                            return;

                        // Comandos del sistema existentes
                        case 'system_shutdown':
                            socket.emit('command_result', { 
                                success: true, 
                                message: 'Sistema apagándose...' 
                            });
                            setTimeout(() => this.controller.shutdown(), 1000);
                            return;
                        case 'system_restart':
                            socket.emit('command_result', { 
                                success: true, 
                                message: 'Sistema reiniciándose...' 
                            });
                            setTimeout(() => this.controller.restart(), 1000);
                            return;
                        case 'audio_toggle':
                            if (this.controller.audio.isRecording) {
                                this.controller.audio.stop();
                                socket.emit('command_result', { success: true, message: 'Audio detenido' });
                            } else {
                                this.controller.audio.start();
                                socket.emit('command_result', { success: true, message: 'Audio iniciado' });
                            }
                            break;
                        case 'baliza_toggle':
                            if (this.controller.modules.baliza.isRunning) {
                                this.controller.modules.baliza.stop();
                                socket.emit('command_result', { success: true, message: 'Baliza detenida' });
                            } else {
                                this.controller.modules.baliza.start();
                                socket.emit('command_result', { success: true, message: 'Baliza iniciada' });
                            }
                            break;
                        default:
                            throw new Error(`Comando desconocido: ${data.command}`);
                    }
                    
                    socket.emit('command_result', { 
                        success: true, 
                        message: `Comando ${data.command} ejecutado` 
                    });
                    
                } catch (error) {
                    socket.emit('command_result', { 
                        success: false, 
                        message: `Error: ${error.message}` 
                    });
                }
            });
        });
    }

    getSystemStatus() {
        return {
            timestamp: new Date().toISOString(),
            audio: {
                status: 'active',
                sampleRate: 48000
            },
            // AGREGAR:
            channel: this.controller.audio.getChannelStatus(),
            baliza: this.controller.modules.baliza.getStatus(),
            datetime: this.controller.modules.datetime.getStatus(),
            aiChat: this.controller.modules.aiChat.getStatus(),
            sms: this.controller.modules.sms.getStatus(),
            rogerBeep: this.controller.audio.getRogerBeep().getConfig(), // NUEVO
            dtmf: {
                lastSequence: 'N/A',
                activeSession: this.controller.modules.sms.sessionState
            }
        };
    }

    // Métodos para emitir eventos en tiempo real
    broadcastDTMF(sequence) {
        this.io.emit('dtmf_detected', { 
            sequence, 
            timestamp: new Date().toISOString() 
        });
    }

    broadcastBalizaTransmitted() {
        this.io.emit('baliza_transmitted', { 
            timestamp: new Date().toISOString() 
        });
    }

    broadcastLog(level, message) {
        this.io.emit('log_entry', {
            timestamp: new Date().toISOString(),
            level,
            message
        });
    }

    // NUEVOS MÉTODOS para actividad del canal
    broadcastChannelActivity(isActive, level) {
        this.io.emit('channel_activity', {
            isActive,
            level,
            timestamp: new Date().toISOString()
        });
    }

    broadcastSignalLevel(data) {
        // Throttle - solo enviar cada 200ms
        if (!this.lastSignalBroadcast || 
            Date.now() - this.lastSignalBroadcast > 200) {
            
            this.io.emit('signal_level', data);
            this.lastSignalBroadcast = Date.now();
        }
    }

    // ===== NUEVOS MÉTODOS ROGER BEEP =====
    
    broadcastRogerBeepConfigChanged(config) {
        this.io.emit('roger_beep_config_changed', {
            config,
            timestamp: new Date().toISOString()
        });
    }

    broadcastRogerBeepTest(type) {
        this.io.emit('roger_beep_test', {
            type,
            timestamp: new Date().toISOString()
        });
    }

    start() {
        this.server.listen(this.port, () => {
            console.log(`🌐 Panel web disponible en: http://localhost:${this.port}`);
        });
    }

    stop() {
        this.server.close();
        console.log('🌐 Servidor web detenido');
    }
}

module.exports = WebServer;