class VX200Panel {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.currentTab = 'status';
        this.systemData = {};
        this.dtmfHistory = [];
        
        // Cache de elementos DOM para mejor rendimiento
        this.domCache = {};
        
        
        this.init();
    }

    init() {
        this.cacheElements();
        this.setupSocketConnection();
        this.setupEventListeners();
        this.setupTabs();
        this.loadInitialData();
        
        
        setInterval(() => {
            if (this.isConnected) {
                this.refreshSystemStatus();
            }
        }, 15000); // Cambiado de 5s a 15s para reducir carga
    }

    cacheElements() {
        // Cachear elementos que se usan frecuentemente
        this.domCache = {
            connectionStatus: document.getElementById('connectionStatus'),
            systemUptime: document.getElementById('systemUptime'),
            systemStatus: document.getElementById('systemStatus'),
            audioStatus: document.getElementById('audioStatus'),
            lastUpdate: document.getElementById('lastUpdate'),
            dtmfDigits: document.getElementById('dtmfDigits'),
            dtmfTargetModule: document.getElementById('dtmfTargetModule'),
            dtmfRecentList: document.getElementById('dtmfRecentList')
        };
    }

    setupSocketConnection() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            this.isConnected = true;
            this.updateConnectionStatus(true);
            console.log('Conectado al servidor');
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            this.updateConnectionStatus(false);
            console.log('Desconectado del servidor');
        });

        this.socket.on('system_status', (data) => {
            this.systemData = data.data;
            this.updateSystemDisplay();
        });

        this.socket.on('dtmf_detected', (data) => {
            this.handleDTMFDetected(data);
        });


        this.socket.on('signal_level', (data) => {
            this.updateSignalLevel(data.level);
        });

        this.socket.on('module_status_change', (data) => {
            this.updateModuleStatus(data.module, data.status);
        });

        this.socket.on('log_entry', (data) => {
            console.log(`[${data.level.toUpperCase()}] ${data.message}`);
        });

        this.socket.on('command_result', (result) => {
            this.showNotification(result.message, result.success ? 'success' : 'error');
        });

        this.socket.on('aprs_position', (data) => {
            this.handleAPRSPosition(data);
        });

        this.socket.on('aprs_beacon', (data) => {
            this.handleAPRSBeacon(data);
        });

        // Weather Alerts events
        this.socket.on('weather_alert_new', (data) => {
            this.handleNewWeatherAlert(data);
        });

        this.socket.on('weather_alerts_status', (data) => {
            this.updateWeatherAlertsStatus(data);
        });

        this.socket.on('weather_alert_expired', (data) => {
            this.handleExpiredWeatherAlert(data);
        });
    }


    setupEventListeners() {
        document.getElementById('balizaToggle')?.addEventListener('click', () => {
            this.toggleModule('baliza');
        });

        document.getElementById('rogerBeepToggle')?.addEventListener('click', () => {
            this.toggleModule('rogerBeep');
        });

        const volumeRange = document.getElementById('rogerBeepVolume');
        const volumeValue = document.getElementById('rogerBeepVolumeValue');
        if (volumeRange && volumeValue) {
            volumeRange.addEventListener('input', (e) => {
                volumeValue.textContent = e.target.value;
            });
        }
    }

    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.dataset.tab;
                
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                tabContents.forEach(content => {
                    if (content.id === `${tabName}Tab`) {
                        content.classList.remove('hidden');
                    } else {
                        content.classList.add('hidden');
                    }
                });
                
                this.currentTab = tabName;
                
                if (tabName === 'config') {
                    this.loadConfiguration();
                } else if (tabName === 'dtmf') {
                    this.refreshDTMFStats();
                } else if (tabName === 'aprs') {
                    this.refreshAPRSStats();
                    this.loadAPRSStations();
                }
            });
        });
    }

    async loadInitialData() {
        try {
            const statusResponse = await fetch('/api/status');
            const statusData = await statusResponse.json();
            
            if (statusData.success) {
                this.systemData = statusData.data;
                this.updateSystemDisplay();
            }

            const dtmfResponse = await fetch('/api/dtmf/history');
            const dtmfData = await dtmfResponse.json();
            
            if (dtmfData.success) {
                this.dtmfHistory = dtmfData.data;
                this.updateDTMFRecentList();
            }

            // Cargar estado inicial de alertas meteorológicas
            await this.loadWeatherAlertsStatus();

        } catch (error) {
            console.error('Error cargando datos iniciales:', error);
            this.showNotification('Error cargando datos del sistema', 'error');
        }
    }

    async loadWeatherAlertsStatus() {
        try {
            const response = await fetch('/api/weather-alerts/status');
            const result = await response.json();
            
            if (result.success) {
                this.updateWeatherAlertsStatus(result.data);
            }
        } catch (error) {
            console.error('Error cargando estado de alertas meteorológicas:', error);
        }
    }

    async refreshSystemStatus() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            
            if (data.success) {
                this.systemData = data.data;
                this.updateSystemDisplay();
            }
        } catch (error) {
            console.error('Error actualizando estado:', error);
        }
    }

    updateConnectionStatus(connected) {
        const statusElement = this.domCache.connectionStatus;
        if (!statusElement) return;
        
        const dot = statusElement.querySelector('.status-dot');
        const text = statusElement.querySelector('.status-text');
        
        if (connected) {
            dot.className = 'status-dot connected';
            text.textContent = 'Conectado';
        } else {
            dot.className = 'status-dot disconnected';
            text.textContent = 'Desconectado';
        }
    }

    updateSystemDisplay() {
        if (!this.systemData) return;

        const uptime = this.formatUptime(this.systemData.uptime);
        if (this.domCache.systemUptime) {
            this.domCache.systemUptime.textContent = `Uptime: ${uptime}`;
        }

        const systemState = this.systemData.server?.state === 'active' ? 'Activo' : 'Inactivo';
        const audioState = this.systemData.audio?.status === 'active' ? 'Activo' : 'Inactivo';
        
        if (this.domCache.systemStatus) {
            this.domCache.systemStatus.textContent = systemState;
        }
        if (this.domCache.audioStatus) {
            this.domCache.audioStatus.textContent = audioState;
        }


        if (this.systemData.modules) {
            Object.entries(this.systemData.modules).forEach(([name, module]) => {
                this.updateModuleUI(name, module);
            });
        }

        if (this.domCache.lastUpdate) {
            this.domCache.lastUpdate.textContent = 
                `Última actualización: ${new Date().toLocaleTimeString()}`;
        }

        // Actualizar estadísticas rápidas
        this.updateQuickStats();
    }

    updateModuleUI(moduleName, moduleData) {
        const statusElement = document.getElementById(`${moduleName}Status`);
        const toggleButton = document.getElementById(`${moduleName}Toggle`);
        const moduleItem = document.querySelector(`[data-module="${moduleName}"]`);
        
        if (statusElement) {
            // Manejo especial para APRS
            if (moduleName === 'aprs') {
                const status = moduleData.running ? 'ACTIVO' : 
                             moduleData.initialized ? 'LISTO' : 'INACTIVO';
                statusElement.textContent = status;
                statusElement.className = `module-status ${moduleData.running ? 'enabled' : 
                                         moduleData.initialized ? 'ready' : 'disabled'}`;
            } else {
                statusElement.textContent = moduleData.enabled ? 'ENABLED' : 'DISABLED';
                statusElement.className = `module-status ${moduleData.enabled ? 'enabled' : 'disabled'}`;
            }
        }

        if (moduleItem) {
            if (moduleName === 'aprs') {
                moduleItem.setAttribute('data-enabled', moduleData.running || moduleData.initialized);
            } else {
                moduleItem.setAttribute('data-enabled', moduleData.enabled);
            }
        }

        if (toggleButton) {
            toggleButton.textContent = moduleData.enabled ? 'Desactivar' : 'Activar';
            toggleButton.disabled = false;
        }
    }


    updateSignalLevel(level) {
        // Actualizar indicador visual de nivel de señal
        // Por ahora solo registrar en consola, podríamos agregar un indicador visual más tarde
        console.debug(`Nivel de señal: ${level}`);
        
        // Si hay algún elemento para mostrar el nivel de señal, actualizarlo aquí
        const signalLevelElement = document.getElementById('signalLevel');
        if (signalLevelElement) {
            signalLevelElement.textContent = `${Math.round(level * 100)}%`;
        }
    }

    updateModuleStatus(moduleName, status) {
        const statusElement = document.getElementById(`${moduleName}Status`);
        if (statusElement) {
            statusElement.textContent = status.toUpperCase();
            statusElement.className = `module-status ${status === 'enabled' ? 'enabled' : 'disabled'}`;
        }

        const moduleItem = document.querySelector(`[data-module="${moduleName}"]`);
        if (moduleItem) {
            moduleItem.setAttribute('data-enabled', status === 'enabled');
        }

        const toggleButton = document.getElementById(`${moduleName}Toggle`);
        if (toggleButton) {
            toggleButton.textContent = status === 'enabled' ? 'Desactivar' : 'Activar';
        }
    }

    handleDTMFDetected(data) {
        this.displayDTMFSequence(data.sequence);
        
        if (this.domCache.dtmfTargetModule) {
            this.domCache.dtmfTargetModule.textContent = data.targetModule;
        }
        
        this.dtmfHistory.unshift(data);
        if (this.dtmfHistory.length > 15) {
            this.dtmfHistory.pop();
        }
        
        this.updateDTMFRecentList();
        
        this.showNotification(`DTMF detectado: ${data.sequence} → ${data.targetModule}`, 'info');
    }

    displayDTMFSequence(sequence) {
        if (!this.domCache.dtmfDigits) return;

        this.domCache.dtmfDigits.innerHTML = '';
        for (let i = 0; i < sequence.length; i++) {
            const digitElement = document.createElement('span');
            digitElement.className = 'dtmf-digit';
            digitElement.textContent = sequence[i];
            this.domCache.dtmfDigits.appendChild(digitElement);
        }
    }

    updateDTMFRecentList() {
        if (!this.domCache.dtmfRecentList) return;

        this.domCache.dtmfRecentList.innerHTML = '';
        
        this.dtmfHistory.forEach(entry => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'dtmf-recent-item';
            
            itemDiv.innerHTML = `
                <div class="dtmf-recent-sequence">${entry.sequence}</div>
                <div class="dtmf-recent-module">${entry.targetModule}</div>
                <div class="dtmf-recent-time">${new Date(entry.timestamp).toLocaleTimeString()}</div>
            `;
            
            this.domCache.dtmfRecentList.appendChild(itemDiv);
        });
    }

    async toggleModule(moduleName) {
        try {
            const response = await fetch(`/api/module/${moduleName}/toggle`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showNotification(result.message, 'success');
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (error) {
            console.error('Error toggling module:', error);
            this.showNotification(`Error controlando ${moduleName}`, 'error');
        }
    }

    async systemAction(action) {
        if (!confirm(`¿Estás seguro de que quieres ${action === 'restart' ? 'reiniciar' : 'apagar'} el sistema?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/system/${action}`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showNotification(result.message, 'warning');
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (error) {
            console.error('Error en acción del sistema:', error);
            this.showNotification('Error ejecutando acción del sistema', 'error');
        }
    }

    async loadConfiguration() {
        try {
            const response = await fetch('/api/config');
            const result = await response.json();
            
            if (result.success) {
                this.populateConfigurationForm(result.data);
            }
        } catch (error) {
            console.error('Error cargando configuración:', error);
            this.showNotification('Error cargando configuración', 'error');
        }
    }

    populateConfigurationForm(config) {
        const fieldMap = {
            'callsign': 'system.callsign',
            'webPort': 'web.port',
            'audioDevice': 'audio.device',
            'channelThreshold': 'audio.channelThreshold',
            'balizaEnabled': 'baliza.enabled',
            'balizaInterval': 'baliza.interval',
            'balizaFrequency': 'baliza.tone.frequency',
            'balizaMessage': 'baliza.message',
            'rogerBeepEnabled': 'rogerBeep.enabled',
            'rogerBeepType': 'rogerBeep.type',
            'rogerBeepVolume': 'rogerBeep.volume',
            'ttsVoice': 'tts.voice',
            'ttsSpeed': 'tts.speed',
            'aiChatApiKey': 'aiChat.apiKey',
            'twilioAccountSid': 'twilio.accountSid',
            'twilioAuthToken': 'twilio.authToken'
        };

        Object.entries(fieldMap).forEach(([fieldId, configPath]) => {
            const element = document.getElementById(fieldId);
            if (element) {
                const value = this.getNestedValue(config, configPath);
                if (value !== undefined) {
                    if (element.type === 'checkbox') {
                        element.checked = Boolean(value);
                    } else {
                        element.value = value;
                    }
                }
            }
        });

        const volumeRange = document.getElementById('rogerBeepVolume');
        const volumeValue = document.getElementById('rogerBeepVolumeValue');
        if (volumeRange && volumeValue) {
            volumeValue.textContent = volumeRange.value;
        }
    }

    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '1rem 1.5rem',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '600',
            zIndex: '9999',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease',
            maxWidth: '300px',
            wordWrap: 'break-word'
        });
        
        const colors = {
            success: '#27ae60',
            error: '#e74c3c',
            warning: '#f39c12',
            info: '#3498db'
        };
        
        notification.style.backgroundColor = colors[type] || colors.info;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 4000);
    }

    formatUptime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else {
            return `${minutes}m ${seconds % 60}s`;
        }
    }

    updateQuickStats() {
        // Actualizar estadísticas rápidas en el panel principal
        const dtmfCountEl = document.getElementById('dtmfCount');
        if (dtmfCountEl) {
            dtmfCountEl.textContent = this.dtmfHistory.length;
        }

        const lastDtmfEl = document.getElementById('lastDtmf');
        if (lastDtmfEl && this.dtmfHistory.length > 0) {
            lastDtmfEl.textContent = this.dtmfHistory[0].sequence;
        }

        // Obtener estadísticas APRS de forma asíncrona
        this.getAPRSQuickStats();
    }

    async getAPRSQuickStats() {
        try {
            const response = await fetch('/api/aprs/stats');
            const result = await response.json();
            
            if (result.success) {
                const aprsCountEl = document.getElementById('aprsCount');
                const beaconCountEl = document.getElementById('beaconCount');
                
                if (aprsCountEl) {
                    aprsCountEl.textContent = result.data.active || 0;
                }
                if (beaconCountEl) {
                    beaconCountEl.textContent = result.data.beacons.sent || 0;
                }
            }
        } catch (error) {
            console.error('Error obteniendo estadísticas APRS:', error);
        }
    }

    async refreshDTMFStats() {
        try {
            const response = await fetch('/api/dtmf/stats');
            const result = await response.json();
            
            if (result.success) {
                const stats = result.data;
                
                document.getElementById('dtmfStatsEnabled').textContent = 
                    stats.enabled ? 'HABILITADO' : 'DESHABILITADO';
                document.getElementById('dtmfStatsVoiceFrames').textContent = 
                    stats.consecutiveVoiceFrames || 0;
                document.getElementById('dtmfStatsSuppressed').textContent = 
                    stats.voiceSuppressed ? 'SÍ' : 'NO';
                document.getElementById('dtmfStatsLast').textContent = 
                    stats.lastDetection || '--';
                
                // Aplicar colores según el estado
                const enabledEl = document.getElementById('dtmfStatsEnabled');
                if (enabledEl) {
                    enabledEl.style.color = stats.enabled ? '#10b981' : '#ef4444';
                }
                
                const suppressedEl = document.getElementById('dtmfStatsSuppressed');
                if (suppressedEl) {
                    suppressedEl.style.color = stats.voiceSuppressed ? '#f59e0b' : '#10b981';
                }
            }
        } catch (error) {
            console.error('Error obteniendo estadísticas DTMF:', error);
            this.showNotification('Error obteniendo estadísticas DTMF', 'error');
        }
    }

    async refreshAPRSStats() {
        try {
            const response = await fetch('/api/aprs/stats');
            const result = await response.json();
            
            if (result.success) {
                const stats = result.data;
                
                document.getElementById('aprsStatsSent').textContent = 
                    stats.beacons.sent || 0;
                document.getElementById('aprsStatsReceived').textContent = 
                    stats.beacons.received || 0;
                document.getElementById('aprsStatsActive').textContent = 
                    stats.active || 0;
                
                const lastBeacon = stats.beacons.lastSent;
                document.getElementById('aprsStatsLastBeacon').textContent = 
                    lastBeacon ? new Date(lastBeacon).toLocaleTimeString() : '--';
            }

            // También obtener estado APRS
            const statusResponse = await fetch('/api/aprs/status');
            const statusResult = await statusResponse.json();
            
            if (statusResult.success) {
                const status = statusResult.data;
                
                document.getElementById('aprsTNCStatus').textContent = 
                    status.tncConnected ? 'CONECTADO' : 'DESCONECTADO';
                document.getElementById('aprsBeaconStatus').textContent = 
                    status.config.beaconEnabled ? 'HABILITADO' : 'DESHABILITADO';
                document.getElementById('aprsCallsignStatus').textContent = 
                    status.config.callsign || '--';
                
                const location = status.config.location;
                document.getElementById('aprsLocationStatus').textContent = 
                    location ? `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}` : '--';
                
                // Aplicar colores
                const tncEl = document.getElementById('aprsTNCStatus');
                if (tncEl) {
                    tncEl.style.color = status.tncConnected ? '#10b981' : '#ef4444';
                }
            }
        } catch (error) {
            console.error('Error obteniendo estadísticas APRS:', error);
            this.showNotification('Error obteniendo estadísticas APRS', 'error');
        }
    }

    async loadAPRSStations() {
        try {
            const response = await fetch('/api/aprs/positions');
            const result = await response.json();
            
            if (result.success) {
                this.displayAPRSStations(result.data);
            }
        } catch (error) {
            console.error('Error cargando estaciones APRS:', error);
        }
    }

    displayAPRSStations(stations) {
        const listElement = document.getElementById('aprsStationsList');
        if (!listElement) return;

        listElement.innerHTML = '';

        if (stations.length === 0) {
            listElement.innerHTML = '<p style="color: #666; text-align: center;">No hay estaciones APRS recibidas</p>';
            return;
        }

        stations.slice(0, 10).forEach(station => {
            const stationDiv = document.createElement('div');
            stationDiv.className = 'aprs-station-item';
            
            const lastHeard = station.lastHeard || station.timestamp;
            const timeAgo = this.formatTimeAgo(new Date(lastHeard));
            
            stationDiv.innerHTML = `
                <div class="station-callsign">${station.callsign}</div>
                <div class="station-location">${station.lat.toFixed(4)}, ${station.lon.toFixed(4)}</div>
                <div class="station-time">${timeAgo}</div>
                <div class="station-count">${station.count || 1} beacons</div>
                ${station.comment ? `<div class="station-comment">${station.comment}</div>` : ''}
            `;
            
            listElement.appendChild(stationDiv);
        });
    }

    formatTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'Hace menos de 1 min';
        if (diffMins < 60) return `Hace ${diffMins} min`;
        
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `Hace ${diffHours}h`;
        
        const diffDays = Math.floor(diffHours / 24);
        return `Hace ${diffDays}d`;
    }

    handleAPRSPosition(data) {
        this.showNotification(`Nueva posición APRS: ${data.data.callsign}`, 'info');
        // Actualizar estadísticas si estamos en la pestaña APRS
        if (this.currentTab === 'aprs') {
            this.refreshAPRSStats();
            this.loadAPRSStations();
        }
    }

    handleAPRSBeacon(data) {
        this.showNotification(`Beacon APRS enviado: ${data.data.callsign}`, 'success');
        // Actualizar estadísticas
        this.updateQuickStats();
        if (this.currentTab === 'aprs') {
            this.refreshAPRSStats();
        }
    }

    // Weather Alerts methods
    handleNewWeatherAlert(data) {
        console.log('Nueva alerta meteorológica:', data);
        this.showNotification(`🌦️ Nueva alerta: ${data.data.title}`, 'warning');
        this.updateWeatherAlertsDisplay();
    }

    handleExpiredWeatherAlert(data) {
        console.log('Alerta meteorológica expirada:', data);
        this.updateWeatherAlertsDisplay();
    }

    updateWeatherAlertsStatus(data) {
        // Update weather alerts module status
        this.updateModuleStatus('weatherAlerts', data.enabled ? 'enabled' : 'disabled');
        
        // Update alerts count
        const alertCountElement = document.getElementById('alertCount');
        if (alertCountElement && data.activeAlerts !== undefined) {
            alertCountElement.textContent = `${data.activeAlerts} alertas activas`;
        }
        
        // Update last check time
        const lastCheckElement = document.getElementById('lastCheck');
        if (lastCheckElement && data.lastCheck) {
            const lastCheckDate = new Date(data.lastCheck);
            lastCheckElement.textContent = `Última verificación: ${lastCheckDate.toLocaleTimeString('es-AR')}`;
        }
        
        // Update system status
        const alertSystemStatusElement = document.getElementById('alertSystemStatus');
        if (alertSystemStatusElement) {
            alertSystemStatusElement.textContent = data.state || 'DESCONOCIDO';
            alertSystemStatusElement.className = `status-text ${data.state === 'ACTIVE' ? 'enabled' : 'disabled'}`;
        }
        
        // Update next check time
        const nextCheckElement = document.getElementById('nextCheck');
        if (nextCheckElement && data.nextCheck) {
            const nextCheckDate = new Date(data.nextCheck);
            nextCheckElement.textContent = `Próxima verificación: ${nextCheckDate.toLocaleTimeString('es-AR')}`;
        }
        
        // Update alerts badge
        const alertBadgeElement = document.getElementById('alertBadge');
        if (alertBadgeElement) {
            const count = data.activeAlerts || 0;
            alertBadgeElement.textContent = `${count} activas`;
            alertBadgeElement.className = `alert-badge ${count > 0 ? 'has-alerts' : ''}`;
        }
    }

    async updateWeatherAlertsDisplay() {
        try {
            const response = await fetch('/api/weather-alerts/active');
            const result = await response.json();
            
            if (result.success) {
                this.displayActiveAlerts(result.data);
            }
        } catch (error) {
            console.error('Error fetching active alerts:', error);
        }
    }

    displayActiveAlerts(alerts) {
        const alertsList = document.getElementById('alertsList');
        const noAlertsMessage = document.getElementById('noAlertsMessage');
        
        if (!alertsList || !noAlertsMessage) return;
        
        if (alerts.length === 0) {
            noAlertsMessage.style.display = 'block';
            alertsList.innerHTML = '';
            return;
        }
        
        noAlertsMessage.style.display = 'none';
        
        alertsList.innerHTML = alerts.map(alert => `
            <div class="alert-item ${alert.severity || 'medium'}">
                <div class="alert-header">
                    <span class="alert-title">${alert.title}</span>
                    <span class="alert-time">${new Date(alert.firstSeen || alert.timestamp).toLocaleTimeString('es-AR')}</span>
                </div>
                <div class="alert-description">${alert.description}</div>
                ${alert.instructions ? `<div class="alert-instructions">${alert.instructions}</div>` : ''}
            </div>
        `).join('');
    }

}

let panel;
document.addEventListener('DOMContentLoaded', () => {
    panel = new VX200Panel();
});
function executeModule(moduleName, code) {
    if (panel && panel.socket) {
        panel.socket.emit('execute_command', {
            command: 'execute_module',
            params: { module: moduleName, code: code }
        });
    }
}

function testRogerBeep() {
    if (panel && panel.socket) {
        panel.socket.emit('execute_command', {
            command: 'test_roger_beep'
        });
    }
}


function systemAction(action) {
    if (panel) {
        panel.systemAction(action);
    }
}

function clearDTMFHistory() {
    if (panel) {
        panel.dtmfHistory = [];
        
        const digitsContainer = document.getElementById('dtmfDigits');
        if (digitsContainer) {
            digitsContainer.innerHTML = '<span class="dtmf-placeholder">Esperando DTMF...</span>';
        }
        
        const targetModule = document.getElementById('dtmfTargetModule');
        if (targetModule) {
            targetModule.textContent = '--';
        }
        
        panel.updateDTMFRecentList();
        panel.showNotification('Monitor DTMF limpiado', 'info');
    }
}

async function saveDebugAudio() {
    if (!panel) return;
    
    try {
        const response = await fetch('/api/debug/save-audio', {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            panel.showNotification(`Audio guardado: ${result.filename}`, 'success');
            
            // Crear enlace de descarga
            const downloadLink = document.createElement('a');
            downloadLink.href = `/debug-audio/${result.filename}`;
            downloadLink.download = result.filename;
            downloadLink.textContent = 'Descargar audio de debug';
            downloadLink.style.display = 'block';
            downloadLink.style.marginTop = '10px';
            downloadLink.style.color = '#3498db';
            
            // Mostrar enlace en el panel
            const debugArea = document.getElementById('debugArea') || createDebugArea();
            debugArea.appendChild(downloadLink);
            
        } else {
            panel.showNotification(result.message, 'warning');
        }
    } catch (error) {
        console.error('Error guardando audio debug:', error);
        panel.showNotification('Error guardando audio de debug', 'error');
    }
}

function createDebugArea() {
    const debugArea = document.createElement('div');
    debugArea.id = 'debugArea';
    debugArea.style.padding = '10px';
    debugArea.style.border = '1px solid #ddd';
    debugArea.style.marginTop = '10px';
    debugArea.style.borderRadius = '5px';
    debugArea.innerHTML = '<h4>Debug Audio:</h4>';
    
    const statusTab = document.getElementById('statusTab');
    if (statusTab) {
        statusTab.appendChild(debugArea);
    }
    
    return debugArea;
}

async function updateDTMFSensitivity() {
    if (!panel) return;

    const sensitivity = document.getElementById('dtmfSensitivity').value;
    
    try {
        const response = await fetch('/api/dtmf/sensitivity', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ level: sensitivity })
        });

        const result = await response.json();

        if (result.success) {
            panel.showNotification(result.message, 'success');
        } else {
            panel.showNotification(result.message, 'error');
        }
    } catch (error) {
        console.error('Error actualizando sensibilidad DTMF:', error);
        panel.showNotification('Error actualizando sensibilidad DTMF', 'error');
    }
}

async function toggleDTMFDebug() {
    if (!panel) return;

    const enabled = document.getElementById('dtmfDebugMode').checked;
    
    try {
        const response = await fetch('/api/dtmf/debug', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ enabled })
        });

        const result = await response.json();

        if (result.success) {
            panel.showNotification(result.message, enabled ? 'warning' : 'success');
        } else {
            panel.showNotification(result.message, 'error');
        }
    } catch (error) {
        console.error('Error cambiando modo debug DTMF:', error);
        panel.showNotification('Error cambiando modo debug DTMF', 'error');
    }
}

function refreshDTMFStats() {
    if (panel) {
        panel.refreshDTMFStats();
    }
}

function refreshAPRSStats() {
    if (panel) {
        panel.refreshAPRSStats();
        panel.loadAPRSStations();
    }
}

async function sendAPRSBeacon() {
    if (!panel) return;

    try {
        const response = await fetch('/api/aprs/beacon', {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
            panel.showNotification(result.message, 'success');
        } else {
            panel.showNotification(result.message, 'error');
        }
    } catch (error) {
        console.error('Error enviando beacon APRS:', error);
        panel.showNotification('Error enviando beacon APRS', 'error');
    }
}

async function saveConfiguration() {
    if (!panel) return;

    try {
        const formData = {};
        
        const fields = [
            'callsign', 'webPort', 'audioDevice', 'channelThreshold',
            'balizaEnabled', 'balizaInterval', 'balizaFrequency', 'balizaMessage',
            'rogerBeepEnabled', 'rogerBeepType', 'rogerBeepVolume',
            'aprsEnabled', 'aprsInterval', 'aprsCallsign', 'aprsComment',
            'ttsVoice', 'ttsSpeed', 'aiChatApiKey', 'twilioAccountSid', 'twilioAuthToken',
            'dtmfSensitivityConfig', 'dtmfVoiceDetection', 'dtmfTimeout'
        ];
        
        fields.forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if (element) {
                if (element.type === 'checkbox') {
                    formData[fieldId] = element.checked;
                } else if (element.type === 'number') {
                    formData[fieldId] = parseFloat(element.value) || 0;
                } else {
                    formData[fieldId] = element.value;
                }
            }
        });

        const response = await fetch('/api/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (result.success) {
            // Guardar configuración APRS específica
            if (formData.aprsEnabled !== undefined || formData.aprsInterval || formData.aprsCallsign || formData.aprsComment) {
                const aprsConfig = {
                    enabled: formData.aprsEnabled,
                    interval: formData.aprsInterval,
                    callsign: formData.aprsCallsign,
                    comment: formData.aprsComment
                };
                
                try {
                    const aprsResponse = await fetch('/api/aprs/config', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(aprsConfig)
                    });
                    
                    const aprsResult = await aprsResponse.json();
                    if (!aprsResult.success) {
                        console.warn('Error actualizando configuración APRS:', aprsResult.message);
                    }
                } catch (error) {
                    console.warn('Error enviando configuración APRS:', error);
                }
            }
            
            panel.showNotification(
                `Configuración guardada (${result.applied} cambios aplicados)`, 
                'success'
            );
        } else {
            panel.showNotification(result.message, 'error');
        }

    } catch (error) {
        console.error('Error guardando configuración:', error);
        panel.showNotification('Error guardando configuración', 'error');
    }
}

// Weather Alerts functions
async function toggleWeatherAlerts() {
    if (!panel) return;

    try {
        const response = await fetch('/api/weather-alerts/toggle', {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
            panel.showNotification(result.message, 'success');
            // Refresh weather alerts status
            refreshWeatherAlertsStatus();
        } else {
            panel.showNotification(result.message, 'error');
        }
    } catch (error) {
        console.error('Error toggling weather alerts:', error);
        panel.showNotification('Error cambiando estado de alertas meteorológicas', 'error');
    }
}

async function refreshWeatherAlertsStatus() {
    if (!panel) return;

    try {
        const response = await fetch('/api/weather-alerts/status');
        const result = await response.json();

        if (result.success) {
            panel.updateWeatherAlertsStatus(result.data);
        }
    } catch (error) {
        console.error('Error refreshing weather alerts status:', error);
    }
}

async function checkWeatherAlerts() {
    if (!panel) return;

    try {
        const response = await fetch('/api/weather-alerts/check', {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
            panel.showNotification('Verificación de alertas iniciada', 'success');
            // Refresh status after check
            setTimeout(refreshWeatherAlertsStatus, 2000);
        } else {
            panel.showNotification(result.message, 'error');
        }
    } catch (error) {
        console.error('Error checking weather alerts:', error);
        panel.showNotification('Error verificando alertas', 'error');
    }
}