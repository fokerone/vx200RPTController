class VX200Panel {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.currentTab = 'status';
        this.systemData = {};
        this.dtmfHistory = [];
        
        this.init();
    }

    init() {
        this.setupSocketConnection();
        this.setupEventListeners();
        this.setupTabs();
        this.loadInitialData();
        
        setInterval(() => {
            if (this.isConnected) {
                this.refreshSystemStatus();
            }
        }, 5000);
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
            this.updateChannelStatus(data.isActive, data.level);
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
        const statusElement = document.getElementById('connectionStatus');
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
        document.getElementById('systemUptime').textContent = `Uptime: ${uptime}`;

        const systemState = this.systemData.server?.state === 'active' ? 'Activo' : 'Inactivo';
        const audioState = this.systemData.audio?.status === 'active' ? 'Activo' : 'Inactivo';
        
        document.getElementById('systemStatus').textContent = systemState;
        document.getElementById('audioStatus').textContent = audioState;

        const channelState = this.systemData.channel?.isActive ? 'OCUPADO' : 'LIBRE';
        document.getElementById('channelStatus').textContent = channelState;
        document.getElementById('channelStatus').style.color = 
            this.systemData.channel?.isActive ? '#ef4444' : '#10b981';

        if (this.systemData.modules) {
            Object.entries(this.systemData.modules).forEach(([name, module]) => {
                this.updateModuleUI(name, module);
            });
        }

        document.getElementById('lastUpdate').textContent = 
            `Última actualización: ${new Date().toLocaleTimeString()}`;
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

    handleDTMFDetected(data) {
        this.displayDTMFSequence(data.sequence);
        
        document.getElementById('dtmfTargetModule').textContent = data.targetModule;
        this.dtmfHistory.unshift(data);
        if (this.dtmfHistory.length > 15) {
            this.dtmfHistory.pop();
        }
        
        this.updateDTMFRecentList();
        
        this.showNotification(`DTMF detectado: ${data.sequence} → ${data.targetModule}`, 'info');
    }

    displayDTMFSequence(sequence) {
        const digitsContainer = document.getElementById('dtmfDigits');
        if (!digitsContainer) return;

        digitsContainer.innerHTML = '';
        for (let i = 0; i < sequence.length; i++) {
            const digitElement = document.createElement('span');
            digitElement.className = 'dtmf-digit';
            digitElement.textContent = sequence[i];
            digitsContainer.appendChild(digitElement);
        }
    }

    updateDTMFRecentList() {
        const recentContainer = document.getElementById('dtmfRecentList');
        if (!recentContainer) return;

        recentContainer.innerHTML = '';
        
        this.dtmfHistory.forEach(entry => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'dtmf-recent-item';
            
            itemDiv.innerHTML = `
                <div class="dtmf-recent-sequence">${entry.sequence}</div>
                <div class="dtmf-recent-module">${entry.targetModule}</div>
                <div class="dtmf-recent-time">${new Date(entry.timestamp).toLocaleTimeString()}</div>
            `;
            
            recentContainer.appendChild(itemDiv);
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