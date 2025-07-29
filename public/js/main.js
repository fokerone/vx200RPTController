// VX200 Controller - Terminal Interface JavaScript
class VX200TerminalPanel {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.lastDTMF = '';
        this.logEntries = [];
        this.maxLogEntries = 100;
        this.systemStatus = {};
        
        this.init();
    }

    init() {
        console.log('🖥️ Inicializando Terminal VX200...');
        
        // Conectar WebSocket
        this.connectSocket();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Inicializar componentes
        this.initializeComponents();
        
        // Efectos visuales
        this.initializeVisualEffects();
        
        console.log('✅ Terminal VX200 inicializado');
    }

    connectSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('🔌 Terminal conectado al servidor');
            this.isConnected = true;
            this.updateConnectionStatus(true);
            this.addLog('success', 'CONNECTED TO VX200 CONTROLLER');
            this.refreshSystemStatus();
        });

        this.socket.on('disconnect', () => {
            console.log('🔌 Terminal desconectado del servidor');
            this.isConnected = false;
            this.updateConnectionStatus(false);
            this.addLog('error', 'DISCONNECTED FROM SERVER');
        });

        this.socket.on('system_status', (status) => {
            this.systemStatus = status;
            this.updateSystemStatus(status);
        });

        this.socket.on('dtmf_detected', (data) => {
            this.handleDTMFDetected(data);
        });

        this.socket.on('baliza_transmitted', (data) => {
            this.handleBalizaTransmitted(data);
        });

        this.socket.on('log_entry', (data) => {
            this.addLog(data.level, data.message.toUpperCase(), data.timestamp);
        });

        this.socket.on('command_result', (result) => {
            this.showNotification(
                result.success ? 'success' : 'error',
                result.message.toUpperCase()
            );
        });

        this.socket.on('channel_activity', (data) => {
            this.handleChannelActivity(data);
        });

        this.socket.on('signal_level', (data) => {
            this.updateSignalLevel(data);
        });

        this.socket.on('roger_beep_config_changed', (data) => {
            this.handleRogerBeepConfigChanged(data);
        });

        this.socket.on('roger_beep_test', (data) => {
            this.handleRogerBeepTest(data);
        });

        this.socket.on('service_toggled', (data) => {
            this.handleServiceToggled(data);
        });
    }

    setupEventListeners() {
        // Formulario de configuración de baliza
        const balizaForm = document.getElementById('baliza-config-form');
        if (balizaForm) {
            balizaForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.updateBalizaConfig();
            });
        }

        // Refresh automático del estado
        setInterval(() => {
            if (this.isConnected) {
                this.refreshSystemStatus();
            }
        }, 5000);

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey) {
                switch(e.key) {
                    case '1':
                        e.preventDefault();
                        this.executeCommand('datetime');
                        break;
                    case '2':
                        e.preventDefault();
                        this.executeCommand('ai_chat');
                        break;
                    case '3':
                        e.preventDefault();
                        this.executeCommand('sms');
                        break;
                    case '9':
                        e.preventDefault();
                        this.executeCommand('baliza_manual');
                        break;
                }
            }
        });
    }

    initializeComponents() {
        // Agregar logs iniciales con efecto terminal
        this.addLog('info', 'VX200 TERMINAL INTERFACE INITIALIZED');
        this.addLog('info', 'ESTABLISHING CONNECTION...');
        
        // Inicializar estado de botones
        setTimeout(() => {
            this.refreshSystemStatus();
        }, 1000);
    }

    initializeVisualEffects() {
        // Efecto de parpadeo en el cursor del DTMF
        const dtmfDisplay = document.getElementById('dtmf-display');
        if (dtmfDisplay && !dtmfDisplay.textContent.includes('_')) {
            setInterval(() => {
                if (dtmfDisplay.textContent === 'WAITING FOR DTMF...') {
                    dtmfDisplay.textContent = 'WAITING FOR DTMF..._';
                } else if (dtmfDisplay.textContent === 'WAITING FOR DTMF..._') {
                    dtmfDisplay.textContent = 'WAITING FOR DTMF...';
                }
            }, 1000);
        }

        // Efecto de scan lines
        this.createScanLines();
        
        // Audio effect para clicks
        this.setupAudioFeedback();
    }

    createScanLines() {
        const scanLine = document.createElement('div');
        scanLine.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 2px;
            background: linear-gradient(90deg, transparent, #00ffff, transparent);
            z-index: 9999;
            pointer-events: none;
            animation: scanLine 3s linear infinite;
        `;
        
        // Agregar keyframes para la animación
        if (!document.querySelector('#scanline-style')) {
            const style = document.createElement('style');
            style.id = 'scanline-style';
            style.textContent = `
                @keyframes scanLine {
                    0% { top: 0; opacity: 1; }
                    100% { top: 100vh; opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(scanLine);
        
        // Remover después de la animación
        setTimeout(() => {
            if (scanLine.parentNode) {
                scanLine.parentNode.removeChild(scanLine);
            }
        }, 3000);
        
        // Repetir cada 10 segundos
        setTimeout(() => this.createScanLines(), 10000);
    }

    setupAudioFeedback() {
        // Crear contexto de audio para efectos de sonido
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Audio context not available');
        }
    }

    playClickSound() {
        if (!this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, this.audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.1);
    }

    // Actualizar estado de conexión
    updateConnectionStatus(connected) {
        const indicator = document.getElementById('status-indicator');
        const text = document.getElementById('status-text');

        if (connected) {
            indicator.className = 'status-dot online';
            text.textContent = 'CONNECTED';
            text.style.color = '#00ff00';
        } else {
            indicator.className = 'status-dot offline';
            text.textContent = 'DISCONNECTED';
            text.style.color = '#ff0000';
        }
    }

    // Actualizar estado del sistema
    updateSystemStatus(status) {
        console.log('📊 Actualizando estado del sistema:', status);

        // Sistema general
        this.updateStatusModule('system', 'ONLINE', 'online');

        // Audio status
        const audioActive = status.audio?.status === 'active';
        this.updateStatusModule('audio', audioActive ? 'ACTIVE' : 'INACTIVE', audioActive ? 'online' : 'offline');

        // Canal status
        const channelFree = !status.channel?.busy;
        this.updateStatusModule('channel', channelFree ? 'FREE' : 'BUSY', channelFree ? 'online' : 'offline');

        // Baliza status
        const balizaRunning = status.baliza?.running;
        this.updateStatusModule('beacon', balizaRunning ? 'RUNNING' : 'STOPPED', balizaRunning ? 'running' : 'stopped');

        // DTMF status
        const lastDTMF = status.dtmf?.lastSequence || 'WAITING';
        this.updateStatusModule('dtmf', lastDTMF, 'waiting');

        // SMS status
        const smsState = status.sms?.sessionState || 'idle';
        this.updateStatusModule('sms', smsState.toUpperCase(), 'idle');

        // Actualizar botones de servicio
        this.updateServiceButtons(status);
        
        // Roger Beep status
        if (status.rogerBeep) {
            this.updateRogerBeepStatus(status.rogerBeep);
        }
    }

    updateStatusModule(module, statusText, statusClass) {
        const statusElement = document.getElementById(`${module === 'beacon' ? 'baliza' : module}-status`);
        if (statusElement) {
            statusElement.textContent = statusText;
            statusElement.className = `badge-${statusClass}`;
        }
    }

    // Manejar DTMF detectado
    handleDTMFDetected(data) {
        console.log('📞 DTMF detectado:', data.sequence);
        
        this.lastDTMF = data.sequence;
        
        // Actualizar display con efecto
        const display = document.getElementById('dtmf-display');
        if (display) {
            display.textContent = `DTMF: ${data.sequence}`;
            display.classList.add('active');
            display.classList.add('glow-animation');
            
            // Efecto de parpadeo
            let blinkCount = 0;
            const blinkInterval = setInterval(() => {
                display.style.opacity = display.style.opacity === '0.5' ? '1' : '0.5';
                blinkCount++;
                if (blinkCount >= 6) {
                    clearInterval(blinkInterval);
                    display.style.opacity = '1';
                }
            }, 200);
            
            // Quitar efectos después de 3 segundos
            setTimeout(() => {
                display.classList.remove('active', 'glow-animation');
                display.textContent = 'WAITING FOR DTMF...';
            }, 3000);
        }

        // Agregar a log con timestamp
        this.addLog('info', `DTMF SEQUENCE DETECTED: ${data.sequence}`);

        // Actualizar badge
        document.getElementById('dtmf-last').textContent = data.sequence;
        
        // Sonido de confirmación
        this.playClickSound();
    }

    // Manejar baliza transmitida
    handleBalizaTransmitted(data) {
        console.log('📡 Baliza transmitida');
        
        this.addLog('success', 'BEACON TRANSMITTED SUCCESSFULLY');
        
        // Efecto visual en el icono
        const balizaIcon = document.getElementById('beacon-icon');
        if (balizaIcon) {
            balizaIcon.classList.add('glow-animation');
            setTimeout(() => {
                balizaIcon.classList.remove('glow-animation');
            }, 2000);
        }
    }

    // Manejar actividad del canal
    handleChannelActivity(data) {
        const { isActive, level, timestamp } = data;
        
        console.log(`📻 Canal ${isActive ? 'OCUPADO' : 'LIBRE'} - Nivel: ${(level * 100).toFixed(1)}%`);
        
        // Actualizar indicadores
        const channelIcon = document.getElementById('channel-icon');
        const channelStatus = document.getElementById('channel-status');
        
        if (isActive) {
            if (channelIcon) {
                channelIcon.className = 'bi bi-radio';
                channelIcon.style.color = '#ff0000';
                channelIcon.classList.add('pulse');
            }
            if (channelStatus) {
                channelStatus.textContent = 'BUSY';
                channelStatus.className = 'badge-offline';
            }
            
            this.addLog('warning', `CHANNEL BUSY - SIGNAL: ${(level * 100).toFixed(1)}%`);
        } else {
            if (channelIcon) {
                channelIcon.className = 'bi bi-radio';
                channelIcon.style.color = '#00ff00';
                channelIcon.classList.remove('pulse');
            }
            if (channelStatus) {
                channelStatus.textContent = 'FREE';
                channelStatus.className = 'badge-online';
            }
            
            this.addLog('info', 'CHANNEL IS NOW FREE');
        }
    }

    updateSignalLevel(data) {
        const { level, active } = data;
        const percentage = Math.min(100, level * 100 * 10);
        
        // Actualizar barra de progreso
        const progressBar = document.getElementById('signal-level-bar');
        const levelText = document.getElementById('signal-level-text');
        
        if (progressBar && levelText) {
            progressBar.style.width = `${percentage}%`;
            levelText.textContent = `${percentage.toFixed(0)}%`;
            
            // Cambiar color según nivel
            if (percentage > 70) {
                progressBar.style.background = '#ff0000';
                progressBar.style.boxShadow = '0 0 10px #ff0000';
            } else if (percentage > 30) {
                progressBar.style.background = '#ffff00';
                progressBar.style.boxShadow = '0 0 10px #ffff00';
            } else {
                progressBar.style.background = '#00ff00';
                progressBar.style.boxShadow = '0 0 10px #00ff00';
            }
        }
    }

    // Agregar entrada al log con formato terminal
    addLog(level, message, timestamp = null) {
        const logContainer = document.getElementById('log-container');
        if (!logContainer) return;
        
        const time = timestamp ? new Date(timestamp) : new Date();
        const timeStr = time.toLocaleTimeString('en-US', { hour12: false });

        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        const levelColors = {
            info: '#00ffff',
            success: '#00ff00',
            warning: '#ffff00',
            error: '#ff0000'
        };
        
        logEntry.innerHTML = `
            <span class="log-timestamp">[${timeStr}]</span>
            <span class="log-level-${level}" style="color: ${levelColors[level]}">[${level.toUpperCase()}]</span>
            <span style="margin-left: 8px;">${message}</span>
        `;

        logContainer.appendChild(logEntry);

        // Mantener solo las últimas entradas
        this.logEntries.push({ level, message, timestamp: time });
        if (this.logEntries.length > this.maxLogEntries) {
            this.logEntries.shift();
            if (logContainer.firstChild) {
                logContainer.removeChild(logContainer.firstChild);
            }
        }

        // Scroll al final con animación
        logContainer.scrollTo({
            top: logContainer.scrollHeight,
            behavior: 'smooth'
        });
    }

    // Ejecutar comando manual
    executeCommand(command) {
        console.log(`🎯 Ejecutando comando: ${command}`);
        
        if (!this.isConnected) {
            this.showNotification('error', 'NO CONNECTION TO SERVER');
            return;
        }

        // Efecto visual en botones
        const buttons = document.querySelectorAll(`[onclick*="${command}"]`);
        buttons.forEach(btn => {
            btn.classList.add('loading');
            setTimeout(() => btn.classList.remove('loading'), 1000);
        });

        this.socket.emit('execute_command', { command });
        this.addLog('info', `EXECUTING COMMAND: ${command.toUpperCase()}`);
        
        // Sonido de confirmación
        this.playClickSound();
    }

    // Toggle de servicios con actualización de estado
    toggleService(service) {
        console.log(`🔄 Toggle service: ${service}`);
        
        if (!this.isConnected) {
            this.showNotification('error', 'NO CONNECTION TO SERVER');
            return;
        }

        // Actualizar botón inmediatamente para feedback visual
        const btn = document.getElementById(`${service}-toggle-btn`);
        if (btn) {
            btn.classList.add('loading');
        }

        this.socket.emit('execute_command', { command: `${service}_toggle` });
        this.addLog('info', `TOGGLING SERVICE: ${service.toUpperCase()}`);
        
        this.playClickSound();
    }

    // Manejar resultado de toggle de servicio
    handleServiceToggled(data) {
        const { service, enabled, success } = data;
        
        if (success) {
            this.addLog('success', `SERVICE ${service.toUpperCase()} ${enabled ? 'ENABLED' : 'DISABLED'}`);
            
            // Actualizar botón
            const btn = document.getElementById(`${service}-toggle-btn`);
            if (btn) {
                btn.classList.remove('loading');
                this.updateServiceButton(service, enabled);
            }
            
            // Refresh status
            setTimeout(() => this.refreshSystemStatus(), 500);
        } else {
            this.addLog('error', `FAILED TO TOGGLE ${service.toUpperCase()}`);
        }
    }

    // Actualizar botón de servicio individual
    updateServiceButton(service, enabled) {
        const btn = document.getElementById(`${service}-toggle-btn`);
        if (!btn) return;

        const serviceConfig = {
            audio: {
                icon: enabled ? 'volume-up' : 'volume-mute',
                text: 'AUDIO'
            },
            baliza: {
                icon: enabled ? 'broadcast' : 'broadcast-pin',
                text: 'BEACON'
            }
        };

        const config = serviceConfig[service];
        if (config) {
            btn.className = `terminal-btn service-btn ${enabled ? 'active' : 'inactive'}`;
            btn.innerHTML = `
                <i class="bi bi-${config.icon}"></i>
                <span>${config.text}</span>
                <div class="service-status">${enabled ? 'ON' : 'OFF'}</div>
            `;
        }
    }

    // Actualizar todos los botones de servicio
    updateServiceButtons(status) {
        // Audio
        if (status.audio) {
            this.updateServiceButton('audio', status.audio.status === 'active');
        }

        // Baliza
        if (status.baliza) {
            this.updateServiceButton('baliza', status.baliza.running);
        }
    }

    // Confirmar acciones críticas
    confirmAction(action) {
        const messages = {
            shutdown: 'CONFIRM SYSTEM SHUTDOWN?',
            restart: 'CONFIRM SYSTEM RESTART?'
        };

        const icons = {
            shutdown: 'power',
            restart: 'arrow-clockwise'
        };

        // Crear modal de confirmación personalizado
        this.showTerminalConfirm(messages[action], (confirmed) => {
            if (confirmed) {
                console.log(`🚨 Acción confirmada: ${action}`);
                
                if (!this.isConnected) {
                    this.showNotification('error', 'NO CONNECTION TO SERVER');
                    return;
                }

                this.socket.emit('execute_command', { command: `system_${action}` });
                this.addLog('warning', `EXECUTING SYSTEM ${action.toUpperCase()}`);
                
                // Deshabilitar botón
                const btn = document.getElementById(`${action}-btn`);
                if (btn) {
                    btn.disabled = true;
                    btn.classList.add('loading');
                    btn.innerHTML = `<i class="bi bi-${icons[action]}"></i> <span>${action.toUpperCase()}...</span>`;
                }
                
                this.playClickSound();
            }
        });
    }

    // Modal de confirmación estilo terminal
    showTerminalConfirm(message, callback) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: var(--terminal-bg);
            border: 2px solid var(--terminal-error);
            border-radius: 8px;
            padding: 30px;
            text-align: center;
            color: var(--terminal-text);
            font-family: 'JetBrains Mono', monospace;
            box-shadow: 0 0 20px var(--terminal-error);
            animation: fadeIn 0.3s ease-out;
        `;

        modal.innerHTML = `
            <div style="margin-bottom: 20px; color: var(--terminal-error); font-size: 1.2rem; font-weight: bold;">
                <i class="bi bi-exclamation-triangle" style="font-size: 2rem; display: block; margin-bottom: 10px;"></i>
                ${message}
            </div>
            <div style="display: flex; gap: 15px; justify-content: center;">
                <button id="confirm-yes" class="terminal-btn-sm" style="background: rgba(255, 0, 0, 0.2); border-color: var(--terminal-error); color: var(--terminal-error);">
                    <i class="bi bi-check"></i> YES
                </button>
                <button id="confirm-no" class="terminal-btn-sm" style="background: rgba(0, 255, 0, 0.2); border-color: var(--terminal-success); color: var(--terminal-success);">
                    <i class="bi bi-x"></i> NO
                </button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Event listeners
        modal.querySelector('#confirm-yes').onclick = () => {
            document.body.removeChild(overlay);
            callback(true);
        };

        modal.querySelector('#confirm-no').onclick = () => {
            document.body.removeChild(overlay);
            callback(false);
        };

        // Cerrar con Escape
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(overlay);
                callback(false);
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    // Roger Beep methods
    updateRogerBeepStatus(rogerBeepConfig) {
        if (!rogerBeepConfig) return;

        // Actualizar tipo
        const typeElement = document.getElementById('roger-beep-type');
        if (typeElement) {
            typeElement.textContent = (rogerBeepConfig.type || 'CLASSIC').toUpperCase();
        }

        // Actualizar estado
        const statusElement = document.getElementById('roger-beep-status');
        if (statusElement) {
            statusElement.textContent = rogerBeepConfig.enabled ? 'ENABLED' : 'DISABLED';
            statusElement.className = rogerBeepConfig.enabled ? 'badge-online' : 'badge-offline';
        }

        // Actualizar volumen
        const volumeElement = document.getElementById('roger-beep-volume');
        if (volumeElement) {
            volumeElement.textContent = `${Math.round((rogerBeepConfig.volume || 0.7) * 100)}%`;
        }

        // Actualizar duración
        const durationElement = document.getElementById('roger-beep-duration');
        if (durationElement) {
            durationElement.textContent = `${rogerBeepConfig.duration || 250}MS`;
        }

        // Actualizar botón toggle
        const toggleBtn = document.getElementById('roger-beep-toggle-btn');
        if (toggleBtn) {
            const isEnabled = rogerBeepConfig.enabled;
            toggleBtn.className = `terminal-btn-sm ${isEnabled ? 'active' : 'inactive'}`;
            toggleBtn.innerHTML = `<i class="bi bi-power"></i> ${isEnabled ? 'ON' : 'OFF'}`;
        }
    }

    handleRogerBeepConfigChanged(data) {
        console.log('🔊 Configuración roger beep actualizada:', data.config);
        this.updateRogerBeepStatus(data.config);
        this.addLog('info', `ROGER BEEP: ${data.config.type.toUpperCase()} (${data.config.enabled ? 'ON' : 'OFF'})`);
    }

    handleRogerBeepTest(data) {
        console.log('🧪 Test roger beep:', data.type);
        this.addLog('info', `ROGER BEEP TEST: ${(data.type || 'CURRENT').toUpperCase()}`);
        
        // Efecto visual
        const testButtons = document.querySelectorAll('.test-btn');
        testButtons.forEach(btn => {
            btn.classList.add('glow-animation');
            setTimeout(() => btn.classList.remove('glow-animation'), 1000);
        });
    }

    // Actualizar configuración de baliza
    updateBalizaConfig() {
        const interval = document.getElementById('baliza-interval')?.value;
        const frequency = document.getElementById('baliza-frequency')?.value;
        const duration = document.getElementById('baliza-duration')?.value;
        const message = document.getElementById('baliza-message')?.value;

        const config = {
            interval: parseInt(interval) || 15,
            frequency: parseInt(frequency) || 1000,
            duration: parseInt(duration) || 500,
            volume: 0.7,
            message: message || 'LU Repetidora Simplex'
        };

        console.log('⚙️ Actualizando configuración baliza:', config);

        fetch('/api/baliza/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        })
        .then(response => response.json())
        .then(data => {
            this.showNotification('success', 'BEACON CONFIG UPDATED');
            this.addLog('info', 'BEACON CONFIGURATION UPDATED');
        })
        .catch(error => {
            console.error('Error:', error);
            this.showNotification('error', 'CONFIG UPDATE FAILED');
        });
    }

    // Refrescar estado del sistema
    refreshSystemStatus() {
        if (!this.isConnected) return;
        
        fetch('/api/status')
            .then(response => response.json())
            .then(status => {
                this.updateSystemStatus(status);
            })
            .catch(error => {
                console.error('Error refrescando estado:', error);
                this.addLog('error', 'FAILED TO REFRESH SYSTEM STATUS');
            });
    }

    // Mostrar notificación toast estilo terminal
    showNotification(type, message) {
        const toast = document.getElementById('notification-toast');
        if (!toast) return;

        const toastBody = toast.querySelector('.toast-body');
        const toastHeader = toast.querySelector('.toast-header strong');
        const toastIcon = toast.querySelector('.toast-header i');

        const typeConfig = {
            success: { icon: 'check-circle-fill', color: '#00ff00', title: 'SUCCESS' },
            error: { icon: 'x-circle-fill', color: '#ff0000', title: 'ERROR' },
            warning: { icon: 'exclamation-triangle-fill', color: '#ffff00', title: 'WARNING' },
            info: { icon: 'info-circle-fill', color: '#00ffff', title: 'INFO' }
        };

        const config = typeConfig[type] || typeConfig.info;
        
        toastIcon.className = `bi bi-${config.icon} me-2`;
        toastIcon.style.color = config.color;
        toastHeader.textContent = config.title;
        toastBody.textContent = message;
        
        toast.style.borderColor = config.color;
        toast.style.boxShadow = `0 0 10px ${config.color}`;

        // Mostrar toast
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
    }

    // Limpiar log
    clearLog() {
        const logContainer = document.getElementById('log-container');
        if (logContainer) {
            logContainer.innerHTML = '';
            this.logEntries = [];
            this.addLog('info', 'LOG CLEARED');
        }
    }
}

// Funciones globales para los botones
function executeCommand(command) {
    if (window.vx200Terminal) {
        window.vx200Terminal.executeCommand(command);
    }
}

function toggleService(service) {
    if (window.vx200Terminal) {
        window.vx200Terminal.toggleService(service);
    }
}

function confirmAction(action) {
    if (window.vx200Terminal) {
        window.vx200Terminal.confirmAction(action);
    }
}

function clearLog() {
    if (window.vx200Terminal) {
        window.vx200Terminal.clearLog();
    }
}

// Inicializar cuando se carga la página
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Iniciando VX200 Terminal Interface...');
    window.vx200Terminal = new VX200TerminalPanel();
    
    // Efecto de boot terminal
    setTimeout(() => {
        const bootMessages = [
            'SYSTEM BOOT COMPLETE',
            'INITIALIZING VX200 CONTROLLER',
            'LOADING MODULES...',
            'DTMF DECODER: READY',
            'AUDIO MANAGER: READY',
            'BEACON SYSTEM: READY',
            'ROGER BEEP: READY',
            'TERMINAL READY FOR INPUT'
        ];
        
        bootMessages.forEach((msg, index) => {
            setTimeout(() => {
                window.vx200Terminal.addLog('info', msg);
            }, index * 200);
        });
    }, 1000);
});