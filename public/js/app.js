class VX200Panel {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.currentTab = 'status';
        this.systemData = {};
        this.dtmfHistory = [];
        
        // Cache de elementos DOM para mejor rendimiento
        this.domCache = {};
        
        // Control de actualizaciones del canal
        this.currentChannelState = 'LIBRE';
        this.lastChannelData = null;
        this.updateTimer = null;
        this.stateTimeout = null;
        
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
            channelStatus: document.getElementById('channelStatus'),
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

        this.socket.on('channel_activity', (data) => {
            this.throttledChannelUpdate(data.isActive, data.level, data.transmitting, data.inputActivity);
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

        } catch (error) {
            console.error('Error cargando datos iniciales:', error);
            this.showNotification('Error cargando datos del sistema', 'error');
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

        // Actualizar estado del canal usando la función optimizada
        if (this.systemData.channel) {
            this.updateChannelStatus(
                this.systemData.channel.isActive,
                this.systemData.channel.level,
                this.systemData.channel.transmitting,
                this.systemData.channel.inputActivity
            );
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
    }

    updateModuleUI(moduleName, moduleData) {
        const statusElement = document.getElementById(`${moduleName}Status`);
        const toggleButton = document.getElementById(`${moduleName}Toggle`);
        const moduleItem = document.querySelector(`[data-module="${moduleName}"]`);
        
        if (statusElement) {
            statusElement.textContent = moduleData.enabled ? 'ENABLED' : 'DISABLED';
            statusElement.className = `module-status ${moduleData.enabled ? 'enabled' : 'disabled'}`;
        }

        if (moduleItem) {
            moduleItem.setAttribute('data-enabled', moduleData.enabled);
        }

        if (toggleButton) {
            toggleButton.textContent = moduleData.enabled ? 'Desactivar' : 'Activar';
            toggleButton.disabled = false;
        }
    }

    throttledChannelUpdate(isActive, level, transmitting = false, inputActivity = false) {
        // Guardar los datos más recientes
        this.lastChannelData = { isActive, level, transmitting, inputActivity };
        
        // Determinar el nuevo estado
        let newState = 'LIBRE';
        if (isActive) {
            if (transmitting) {
                newState = 'TX';
            } else if (inputActivity) {
                newState = 'RX';
            } else {
                newState = 'RX';
            }
        }
        
        // Si el estado va a cambiar, aplicar timeout diferenciado
        if (this.currentChannelState !== newState) {
            // Cancelar timeout anterior si existe
            if (this.stateTimeout) {
                clearTimeout(this.stateTimeout);
            }
            
            // Timeout diferenciado por tipo de estado
            let delay = 100; // Default para RX
            if (newState === 'TX') {
                delay = 300; // Más tiempo para TX para evitar parpadeo
            } else if (newState === 'LIBRE') {
                delay = 500; // Más tiempo para LIBRE para confirmar inactividad
            }
            
            this.stateTimeout = setTimeout(() => {
                // Verificar que los datos siguen siendo válidos
                if (this.lastChannelData) {
                    this.updateChannelStatusImmediate(
                        this.lastChannelData.isActive,
                        this.lastChannelData.level,
                        this.lastChannelData.transmitting,
                        this.lastChannelData.inputActivity
                    );
                }
                this.stateTimeout = null;
            }, delay);
        }
    }

    updateChannelStatusImmediate(isActive, level, transmitting = false, inputActivity = false) {
        if (!this.domCache.channelStatus) {
            return;
        }
        
        // Determinar el estado del canal con prioridad TX > RX > LIBRE
        let channelState = 'LIBRE';
        let channelColor = '#10b981';
        
        if (isActive) {
            if (transmitting) {
                channelState = 'TX';
                channelColor = '#f59e0b';
            } else if (inputActivity) {
                channelState = 'RX';
                channelColor = '#ef4444';
            } else {
                channelState = 'RX';
                channelColor = '#ef4444';
            }
        }
        
        // Solo actualizar si el estado realmente cambió
        if (this.currentChannelState !== channelState) {
            this.currentChannelState = channelState;
            this.domCache.channelStatus.textContent = channelState;
            this.domCache.channelStatus.style.color = channelColor;
        }
        
        // También actualizar el nivel de señal si se proporciona
        if (level !== undefined) {
            this.updateSignalLevel(level);
        }
    }
    
    // Función legacy para compatibilidad
    updateChannelStatus(isActive, level, transmitting = false, inputActivity = false) {
        this.throttledChannelUpdate(isActive, level, transmitting, inputActivity);
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

async function saveConfiguration() {
    if (!panel) return;

    try {
        const formData = {};
        
        const fields = [
            'callsign', 'webPort', 'audioDevice', 'channelThreshold',
            'balizaEnabled', 'balizaInterval', 'balizaFrequency', 'balizaMessage',
            'rogerBeepEnabled', 'rogerBeepType', 'rogerBeepVolume',
            'ttsVoice', 'ttsSpeed', 'aiChatApiKey', 'twilioAccountSid', 'twilioAuthToken'
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