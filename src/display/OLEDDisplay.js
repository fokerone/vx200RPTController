const i2c = require('i2c-bus');
const oled = require('oled-i2c-bus');
const font = require('oled-font-5x7');
const { createLogger } = require('../logging/Logger');
const os = require('os');
const fs = require('fs');

/**
 * Gestor del display OLED del MMDVM HAT
 * Muestra información rotativa del sistema VX200
 */
class OLEDDisplay {
    constructor() {
        this.logger = createLogger('[OLED]');
        this.display = null;
        this.currentScreen = 0;
        this.screenTimer = null;
        this.screenDuration = 5000; // 5 segundos por pantalla
        this.enabled = false;

        // Datos para mostrar
        this.systemData = {
            callsign: 'FOKER', // Callsign del operador del repetidor
            ip: this.getLocalIP(),
            uptime: 0,
            temperature: 0,
            memoryUsage: 0,
            cpuUsage: 0
        };

        this.aprsData = {
            lastBeacon: null,
            beaconCount: 0,
            lastPacket: null,
            packetsReceived: 0
        };

        this.weatherData = {
            lastAlert: null,
            alertCount: 0
        };

        this.seismicData = {
            lastSeism: null,
            magnitude: 0,
            location: null,
            depth: 0
        };

        this.audioData = {
            isTransmitting: false,
            lastActivity: null,
            captureAvailable: false,
            transmissionType: null // Tipo de transmisión actual
        };

        this.repeaterData = {
            frequency: process.env.REPEATER_FREQUENCY || '149.650',
            band: process.env.REPEATER_BAND || 'VHF'
        };

        // Control de animación TX
        this.txAnimationTimer = null;
        this.txAnimationFrame = 0;
    }

    /**
     * Inicializar el display OLED
     */
    async initialize() {
        try {
            this.logger.info('Inicializando display OLED...');

            // Configuración para SSD1306 128x64
            const opts = {
                width: 128,
                height: 64,
                address: 0x3C,
                bus: 1 // I2C bus 1
            };

            const i2cBus = i2c.openSync(opts.bus);
            this.display = new oled(i2cBus, opts);

            // Inicializar display
            this.display.clearDisplay();
            this.display.turnOnDisplay();

            this.enabled = true;
            this.logger.info('Display OLED inicializado correctamente (128x64 @ 0x3C)');

            // Mostrar splash screen con animación
            await this.showSplashScreen();

            // Iniciar rotación de pantallas después de la animación (6 segundos)
            setTimeout(() => {
                this.startScreenRotation();
            }, 6000);

            return true;

        } catch (error) {
            this.logger.error('Error inicializando display OLED:', error.message);
            this.enabled = false;
            return false;
        }
    }

    /**
     * Pantalla de bienvenida estática
     * Muestra VX200 RPT BY LU5MCD centrado y grande
     */
    async showSplashScreen() {
        if (!this.enabled) return;

        try {
            this.display.clearDisplay();

            // Línea 1: "VX200" - Grande (tamaño 2)
            const line1 = 'VX200';
            const line1Width = line1.length * 12; // Tamaño 2 = 12px por char
            const line1X = Math.floor((128 - line1Width) / 2);
            this.display.setCursor(line1X, 5);
            this.display.writeString(font, 2, line1, 1, true, 0);

            // Línea 2: "RPT" - Grande (tamaño 2)
            const line2 = 'RPT';
            const line2Width = line2.length * 12;
            const line2X = Math.floor((128 - line2Width) / 2);
            this.display.setCursor(line2X, 25);
            this.display.writeString(font, 2, line2, 1, true, 0);

            // Línea 3: "BY LU5MCD" - Normal (tamaño 1)
            const line3 = 'BY LU5MCD';
            const line3Width = line3.length * 6; // Tamaño 1 = 6px por char
            const line3X = Math.floor((128 - line3Width) / 2);
            this.display.setCursor(line3X, 48);
            this.display.writeString(font, 1, line3, 1, true, 0);

            // Mantener la pantalla por 5 segundos
            await new Promise(resolve => setTimeout(resolve, 5000));

        } catch (error) {
            this.logger.warn('Error mostrando splash screen:', error.message);
        }
    }

    /**
     * Iniciar rotación automática de pantallas
     */
    startScreenRotation() {
        if (!this.enabled) return;

        this.logger.info('Iniciando rotación de pantallas');

        // Mostrar primera pantalla
        this.showCurrentScreen();

        // Configurar timer para rotar
        this.screenTimer = setInterval(() => {
            this.currentScreen = (this.currentScreen + 1) % 8; // 8 pantallas
            this.showCurrentScreen();
        }, this.screenDuration);
    }

    /**
     * Mostrar la pantalla actual
     */
    showCurrentScreen() {
        if (!this.enabled) return;

        try {
            // Actualizar datos del sistema
            this.updateSystemData();

            switch (this.currentScreen) {
                case 0:
                    this.showFrequencyScreen();
                    break;
                case 1:
                    this.showDateTimeScreen();
                    break;
                case 2:
                    this.showSystemScreen();
                    break;
                case 3:
                    this.showAPRSScreen();
                    break;
                case 4:
                    this.showWeatherScreen();
                    break;
                case 5:
                    this.showSeismicScreen();
                    break;
                case 6:
                    this.showAudioScreen();
                    break;
                case 7:
                    this.showStatsScreen();
                    break;
            }
        } catch (error) {
            this.logger.warn('Error mostrando pantalla:', error.message);
        }
    }

    /**
     * Pantalla 0: Frecuencia del repetidor
     */
    showFrequencyScreen() {
        this.display.clearDisplay();

        // Callsign centrado arriba
        const callsignX = Math.max(1, Math.floor((128 - this.systemData.callsign.length * 6) / 2));
        this.display.setCursor(callsignX, 1);
        this.display.writeString(font, 1, this.systemData.callsign, 1, true, 0);

        // Frecuencia grande en el centro
        const freqLen = this.repeaterData.frequency.length * 12; // tamaño 2
        const freqX = Math.max(1, Math.floor((128 - freqLen) / 2));
        this.display.setCursor(freqX, 20);
        this.display.writeString(font, 2, this.repeaterData.frequency, 1, true, 0);

        // MHz centrado debajo
        const mhzX = Math.floor((128 - 3 * 6) / 2);
        this.display.setCursor(mhzX, 38);
        this.display.writeString(font, 1, 'MHz', 1, true, 0);

        // Banda centrada abajo
        const bandX = Math.floor((128 - this.repeaterData.band.length * 6) / 2);
        this.display.setCursor(bandX, 52);
        this.display.writeString(font, 1, this.repeaterData.band, 1, true, 0);
    }

    /**
     * Pantalla 1: Fecha y Hora
     */
    showDateTimeScreen() {
        this.display.clearDisplay();

        // Título centrado con símbolo
        const title = '< RELOJ >';
        const titleX = Math.floor((128 - title.length * 6) / 2);
        this.display.setCursor(titleX, 1);
        this.display.writeString(font, 1, title, 1, true, 0);

        // Obtener fecha y hora actual
        const now = new Date();

        // Hora completa grande en el centro (HH:MM)
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const timeStr = `${hours}:${minutes}`;
        const timeWidth = timeStr.length * 12; // tamaño 2
        const timeX = Math.max(1, Math.floor((128 - timeWidth) / 2));
        this.display.setCursor(timeX, 22);
        this.display.writeString(font, 2, timeStr, 1, true, 0);

        // Fecha completa abajo (DD/MM/YYYY)
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const dateStr = `${day}/${month}/${year}`;
        const dateX = Math.floor((128 - dateStr.length * 6) / 2);
        this.display.setCursor(dateX, 48);
        this.display.writeString(font, 1, dateStr, 1, true, 0);
    }

    /**
     * Pantalla 2: Información del sistema
     */
    showSystemScreen() {
        this.display.clearDisplay();

        // Título centrado con símbolo
        const title = '* SISTEMA *';
        const titleX = Math.floor((128 - title.length * 6) / 2);
        this.display.setCursor(titleX, 1);
        this.display.writeString(font, 1, title, 1, true, 0);

        // IP centrado (más grande en el centro)
        const ip = this.systemData.ip;
        const ipX = Math.floor((128 - ip.length * 6) / 2);
        this.display.setCursor(ipX, 24);
        this.display.writeString(font, 1, ip, 1, true, 0);

        // Uptime centrado debajo
        const uptime = this.formatUptime(this.systemData.uptime);
        const uptimeStr = `Uptime: ${uptime}`;
        const uptimeX = Math.floor((128 - uptimeStr.length * 6) / 2);
        this.display.setCursor(uptimeX, 42);
        this.display.writeString(font, 1, uptimeStr, 1, true, 0);
    }

    /**
     * Pantalla 3: Estado APRS
     */
    showAPRSScreen() {
        this.display.clearDisplay();

        // Título centrado con símbolo
        const title = '@ APRS @';
        const titleX = Math.floor((128 - title.length * 6) / 2);
        this.display.setCursor(titleX, 1);
        this.display.writeString(font, 1, title, 1, true, 0);

        // Beacons transmitidos centrado
        const beacons = `Beacons: ${this.aprsData.beaconCount}`;
        const beaconsX = Math.floor((128 - beacons.length * 6) / 2);
        this.display.setCursor(beaconsX, 15);
        this.display.writeString(font, 1, beacons, 1, true, 0);

        // Último beacon centrado
        if (this.aprsData.lastBeacon) {
            const last = `Last: ${this.aprsData.lastBeacon}`;
            const lastX = Math.floor((128 - last.length * 6) / 2);
            this.display.setCursor(lastX, 27);
            this.display.writeString(font, 1, last, 1, true, 0);
        }

        // Paquetes recibidos centrado
        const rx = `RX: ${this.aprsData.packetsReceived}`;
        const rxX = Math.floor((128 - rx.length * 6) / 2);
        this.display.setCursor(rxX, 39);
        this.display.writeString(font, 1, rx, 1, true, 0);

        // Estado centrado
        const status = this.aprsData.beaconCount > 0 ? 'ACTIVO' : 'ESPERANDO';
        const statusStr = `[${status}]`;
        const statusX = Math.floor((128 - statusStr.length * 6) / 2);
        this.display.setCursor(statusX, 51);
        this.display.writeString(font, 1, statusStr, 1, true, 0);
    }

    /**
     * Pantalla 3: Alertas meteorológicas
     */
    showWeatherScreen() {
        this.display.clearDisplay();

        // Título centrado con símbolo
        const title = '# CLIMA #';
        const titleX = Math.floor((128 - title.length * 6) / 2);
        this.display.setCursor(titleX, 1);
        this.display.writeString(font, 1, title, 1, true, 0);

        // Alertas centrado
        const alertas = `Alertas: ${this.weatherData.alertCount}`;
        const alertasX = Math.floor((128 - alertas.length * 6) / 2);
        this.display.setCursor(alertasX, 15);
        this.display.writeString(font, 1, alertas, 1, true, 0);

        if (this.weatherData.lastAlert) {
            // Última alerta (truncada y centrada)
            const alert = this.weatherData.lastAlert.substring(0, 18);
            const alertX = Math.floor((128 - alert.length * 6) / 2);
            this.display.setCursor(alertX, 30);
            this.display.writeString(font, 1, alert, 1, true, 0);

            const label = 'Ultima alerta';
            const labelX = Math.floor((128 - label.length * 6) / 2);
            this.display.setCursor(labelX, 50);
            this.display.writeString(font, 1, label, 1, true, 0);
        } else {
            const sin = 'Sin alertas';
            const sinX = Math.floor((128 - sin.length * 6) / 2);
            this.display.setCursor(sinX, 32);
            this.display.writeString(font, 1, sin, 1, true, 0);

            const activas = 'activas';
            const activasX = Math.floor((128 - activas.length * 6) / 2);
            this.display.setCursor(activasX, 44);
            this.display.writeString(font, 1, activas, 1, true, 0);
        }
    }

    /**
     * Pantalla 4: Actividad sísmica INPRES
     */
    showSeismicScreen() {
        this.display.clearDisplay();

        // Título centrado con símbolo
        const title = '~ SISMOS ~';
        const titleX = Math.floor((128 - title.length * 6) / 2);
        this.display.setCursor(titleX, 1);
        this.display.writeString(font, 1, title, 1, true, 0);

        if (this.seismicData.lastSeism && this.seismicData.magnitude > 0) {
            // Magnitud centrada
            const mag = `Mag: ${this.seismicData.magnitude.toFixed(1)}`;
            const magX = Math.floor((128 - mag.length * 6) / 2);
            this.display.setCursor(magX, 15);
            this.display.writeString(font, 1, mag, 1, true, 0);

            // Profundidad centrada
            if (this.seismicData.depth > 0) {
                const prof = `Prof: ${this.seismicData.depth}km`;
                const profX = Math.floor((128 - prof.length * 6) / 2);
                this.display.setCursor(profX, 27);
                this.display.writeString(font, 1, prof, 1, true, 0);
            }

            // Ubicación (truncada y centrada)
            if (this.seismicData.location) {
                const location = this.seismicData.location.substring(0, 20);
                const locX = Math.floor((128 - location.length * 6) / 2);
                this.display.setCursor(locX, 39);
                this.display.writeString(font, 1, location, 1, true, 0);
            }

            // Hora del último sismo centrada
            if (this.seismicData.lastSeism) {
                const time = `${this.seismicData.lastSeism}`;
                const timeX = Math.floor((128 - time.length * 6) / 2);
                this.display.setCursor(timeX, 51);
                this.display.writeString(font, 1, time, 1, true, 0);
            }
        } else {
            // Sin sismos recientes centrado
            const sin = 'Sin sismos';
            const sinX = Math.floor((128 - sin.length * 6) / 2);
            this.display.setCursor(sinX, 28);
            this.display.writeString(font, 1, sin, 1, true, 0);

            const sig = 'significativos';
            const sigX = Math.floor((128 - sig.length * 6) / 2);
            this.display.setCursor(sigX, 40);
            this.display.writeString(font, 1, sig, 1, true, 0);
        }
    }

    /**
     * Pantalla 5: Estado de audio
     */
    showAudioScreen() {
        this.display.clearDisplay();

        // Título centrado con símbolo
        const title = '+ AUDIO +';
        const titleX = Math.floor((128 - title.length * 6) / 2);
        this.display.setCursor(titleX, 1);
        this.display.writeString(font, 1, title, 1, true, 0);

        // Modo centrado
        const mode = this.audioData.captureAvailable ? 'DUPLEX' : 'OUTPUT-ONLY';
        const modeStr = `Modo: ${mode}`;
        const modeX = Math.floor((128 - modeStr.length * 6) / 2);
        this.display.setCursor(modeX, 15);
        this.display.writeString(font, 1, modeStr, 1, true, 0);

        // Estado actual centrado
        const estado = this.audioData.isTransmitting ? '>>> TX <<<' : 'Standby';
        const estadoX = Math.floor((128 - estado.length * 6) / 2);
        this.display.setCursor(estadoX, 29);
        this.display.writeString(font, 1, estado, 1, true, 0);

        // Última actividad centrada
        if (this.audioData.lastActivity) {
            const last = `Last: ${this.audioData.lastActivity}`;
            const lastX = Math.floor((128 - last.length * 6) / 2);
            this.display.setCursor(lastX, 41);
            this.display.writeString(font, 1, last, 1, true, 0);
        }

        // DTMF centrado
        const dtmf = this.audioData.captureAvailable ? 'ENABLED' : 'DISABLED';
        const dtmfStr = `DTMF: ${dtmf}`;
        const dtmfX = Math.floor((128 - dtmfStr.length * 6) / 2);
        this.display.setCursor(dtmfX, 53);
        this.display.writeString(font, 1, dtmfStr, 1, true, 0);
    }

    /**
     * Pantalla 6: Estadísticas del sistema
     */
    showStatsScreen() {
        this.display.clearDisplay();

        // Título centrado con símbolo
        const title = '% STATS %';
        const titleX = Math.floor((128 - title.length * 6) / 2);
        this.display.setCursor(titleX, 1);
        this.display.writeString(font, 1, title, 1, true, 0);

        // CPU centrado
        const cpu = `CPU: ${this.systemData.cpuUsage}%`;
        const cpuX = Math.floor((128 - cpu.length * 6) / 2);
        this.display.setCursor(cpuX, 17);
        this.display.writeString(font, 1, cpu, 1, true, 0);

        // Memoria centrada
        const ram = `RAM: ${this.systemData.memoryUsage}%`;
        const ramX = Math.floor((128 - ram.length * 6) / 2);
        this.display.setCursor(ramX, 31);
        this.display.writeString(font, 1, ram, 1, true, 0);

        // Temperatura centrada
        const temp = `Temp: ${this.systemData.temperature}C`;
        const tempX = Math.floor((128 - temp.length * 6) / 2);
        this.display.setCursor(tempX, 45);
        this.display.writeString(font, 1, temp, 1, true, 0);

        // Status centrado
        const status = 'VX200 Running';
        const statusX = Math.floor((128 - status.length * 6) / 2);
        this.display.setCursor(statusX, 56);
        this.display.writeString(font, 1, status, 1, true, 0);
    }

    /**
     * Pantalla especial: Transmitiendo (con animación)
     */
    showTransmissionScreen() {
        if (!this.enabled) return;

        try {
            // Iniciar animación si no está corriendo
            if (!this.txAnimationTimer) {
                this.txAnimationFrame = 0;
                this.startTXAnimation();
            }

            // Renderizar frame actual
            this.renderTXFrame();
        } catch (error) {
            this.logger.warn('Error mostrando pantalla TX:', error.message);
        }
    }

    /**
     * Iniciar animación de transmisión
     */
    startTXAnimation() {
        if (this.txAnimationTimer) return;

        this.txAnimationTimer = setInterval(() => {
            this.txAnimationFrame = (this.txAnimationFrame + 1) % 8; // 8 frames de animación
            this.renderTXFrame();
        }, 200); // Actualizar cada 200ms
    }

    /**
     * Detener animación de transmisión
     */
    stopTXAnimation() {
        if (this.txAnimationTimer) {
            clearInterval(this.txAnimationTimer);
            this.txAnimationTimer = null;
            this.txAnimationFrame = 0;
        }
    }

    /**
     * Renderizar frame de animación TX
     */
    renderTXFrame() {
        if (!this.enabled) return;

        try {
            this.display.clearDisplay();

            // Barras laterales animadas (efecto de nivel de audio)
            const barHeight = [3, 5, 4, 6, 5, 3, 4, 6][this.txAnimationFrame];

            // Barra izquierda
            for (let i = 0; i < barHeight; i++) {
                const y = 32 - (i * 5);
                this.display.fillRect(2, y, 3, 4, 1);
            }

            // Barra derecha
            for (let i = 0; i < barHeight; i++) {
                const y = 32 - (i * 5);
                this.display.fillRect(123, y, 3, 4, 1);
            }

            // Texto TX parpadeante centrado (mostrar/ocultar cada 4 frames)
            if (this.txAnimationFrame < 6) {
                this.display.setCursor(25, 12);
                this.display.writeString(font, 2, '>> TX <<', 1, true, 0);
            }

            // Tipo de transmisión centrado en el medio
            const txType = this.audioData.transmissionType || 'TRANSMITIENDO';
            const txTypeX = Math.floor((128 - txType.length * 6) / 2);
            this.display.setCursor(txTypeX, 45);
            this.display.writeString(font, 1, txType, 1, true, 0);

        } catch (error) {
            this.logger.warn('Error renderizando frame TX:', error.message);
        }
    }

    /**
     * Actualizar datos del sistema
     */
    updateSystemData() {
        // Uptime
        this.systemData.uptime = process.uptime();

        // IP (actualizar periódicamente)
        if (Math.random() < 0.1) { // 10% de las veces
            this.systemData.ip = this.getLocalIP();
        }

        // Temperatura de la CPU
        try {
            const temp = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
            this.systemData.temperature = Math.round(parseInt(temp) / 1000);
        } catch (error) {
            this.systemData.temperature = 0;
        }

        // Uso de memoria
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        this.systemData.memoryUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);

        // CPU usage (aproximado)
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;

        cpus.forEach(cpu => {
            for (let type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });

        this.systemData.cpuUsage = Math.round(100 - (totalIdle / totalTick * 100));
    }

    /**
     * Obtener IP local
     */
    getLocalIP() {
        const interfaces = os.networkInterfaces();
        for (const name in interfaces) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return '0.0.0.0';
    }

    /**
     * Formatear uptime
     */
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (days > 0) {
            return `${days}d ${hours}h`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    /**
     * Actualizar datos APRS
     */
    updateAPRSData(data) {
        if (data.beaconCount !== undefined) {
            this.aprsData.beaconCount = data.beaconCount;
        }
        if (data.lastBeacon) {
            this.aprsData.lastBeacon = data.lastBeacon;
        }
        if (data.packetsReceived !== undefined) {
            this.aprsData.packetsReceived = data.packetsReceived;
        }
    }

    /**
     * Actualizar datos de clima
     */
    updateWeatherData(data) {
        if (data.alertCount !== undefined) {
            this.weatherData.alertCount = data.alertCount;
        }
        if (data.lastAlert) {
            this.weatherData.lastAlert = data.lastAlert;
        }
    }

    /**
     * Actualizar datos sísmicos
     */
    updateSeismicData(data) {
        if (data.magnitude !== undefined) {
            this.seismicData.magnitude = data.magnitude;
        }
        if (data.location) {
            this.seismicData.location = data.location;
        }
        if (data.depth !== undefined) {
            this.seismicData.depth = data.depth;
        }
        if (data.time) {
            this.seismicData.lastSeism = data.time;
        }
    }

    /**
     * Actualizar datos de audio
     */
    updateAudioData(data) {
        if (data.isTransmitting !== undefined) {
            const wasTransmitting = this.audioData.isTransmitting;
            this.audioData.isTransmitting = data.isTransmitting;

            // Actualizar tipo de transmisión si se proporciona
            if (data.transmissionType) {
                this.audioData.transmissionType = data.transmissionType;
            }

            // Si comenzó a transmitir, pausar carrusel y mostrar pantalla TX animada
            if (!wasTransmitting && data.isTransmitting) {
                if (this.screenTimer) {
                    clearInterval(this.screenTimer);
                    this.screenTimer = null;
                }
                this.showTransmissionScreen();
            }

            // Si terminó de transmitir, detener animación y volver al carrusel
            if (wasTransmitting && !data.isTransmitting) {
                this.stopTXAnimation();
                this.audioData.transmissionType = null; // Limpiar tipo
                this.showCurrentScreen();
                // Reiniciar el carrusel
                this.startScreenRotation();
            }
        }
        if (data.lastActivity) {
            this.audioData.lastActivity = data.lastActivity;
        }
        if (data.captureAvailable !== undefined) {
            this.audioData.captureAvailable = data.captureAvailable;
        }
    }

    /**
     * Mostrar mensaje temporal
     */
    async showMessage(message, duration = 3000) {
        if (!this.enabled) return;

        try {
            // Pausar rotación
            if (this.screenTimer) {
                clearInterval(this.screenTimer);
            }

            // Mostrar mensaje
            this.display.clearDisplay();
            this.display.setCursor(1, 20);

            // Dividir mensaje en líneas si es necesario
            const words = message.split(' ');
            let line = '';
            let y = 20;

            for (const word of words) {
                if ((line + word).length > 18) {
                    this.display.writeString(font, 1, line, 1, true, 0);
                    y += 12;
                    this.display.setCursor(1, y);
                    line = word + ' ';
                } else {
                    line += word + ' ';
                }
            }

            if (line.length > 0) {
                this.display.writeString(font, 1, line, 1, true, 0);
            }

            // Reanudar rotación después del delay
            setTimeout(() => {
                this.startScreenRotation();
            }, duration);

        } catch (error) {
            this.logger.warn('Error mostrando mensaje:', error.message);
        }
    }

    /**
     * Detener el display
     */
    stop() {
        if (this.screenTimer) {
            clearInterval(this.screenTimer);
            this.screenTimer = null;
        }

        // Detener animación TX si está corriendo
        this.stopTXAnimation();

        if (this.display && this.enabled) {
            try {
                this.display.clearDisplay();
                this.display.turnOffDisplay();
                this.logger.info('Display OLED detenido');
            } catch (error) {
                this.logger.warn('Error deteniendo display:', error.message);
            }
        }

        this.enabled = false;
    }
}

module.exports = OLEDDisplay;
