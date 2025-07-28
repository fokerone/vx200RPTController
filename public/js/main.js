// VX200 Controller - Frontend JavaScript
class VX200Panel {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.lastDTMF = '';
        this.logEntries = [];
        this.maxLogEntries = 100;
        
        this.init();
    }

    init() {
        console.log('🌐 Inicializando panel VX200...');
        
        // Conectar WebSocket
        this.connectSocket();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Inicializar componentes
        this.initializeComponents();
        
        console.log('✅ Panel VX200 inicializado');
    }

    connectSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('🔌 Conectado al servidor');
            this.isConnected = true;
            this.updateConnectionStatus(true);
            this.addLog('success', 'Conectado al servidor VX200');
        });

        this.socket.on('disconnect', () => {
            console.log('🔌 Desconectado del servidor');
            this.isConnected = false;
            this.updateConnectionStatus(false);
            this.addLog('error', 'Desconectado del servidor');
        });

        this.socket.on('system_status', (status) => {
            this.updateSystemStatus(status);
        });

        this.socket.on('dtmf_detected', (data) => {
            this.handleDTMFDetected(data);
        });

        this.socket.on('baliza_transmitted', (data) => {
            this.handleBalizaTransmitted(data);
        });

        this.socket.on('log_entry', (data) => {
            this.addLog(data.level, data.message, data.timestamp);
        });

        this.socket.on('command_result', (result) => {
            this.showNotification(
                result.success ? 'success' : 'error',
                result.message
            );
        });

        this.socket.on('channel_activity', (data) => {
         this.handleChannelActivity(data);
        });

        this.socket.on('signal_level', (data) => {
         this.updateSignalLevel(data);
        });
    }

    setupEventListeners() {
        // Formulario de configuración de baliza
        document.getElementById('baliza-config-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateBalizaConfig();
        });

        // Refresh automático del estado
        setInterval(() => {
            if (this.isConnected) {
                this.refreshSystemStatus();
            }
        }, 5000); // Cada 5 segundos
    }

    initializeComponents() {
        // Inicializar tooltips de Bootstrap
        var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });

        // Agregar logs iniciales
        this.addLog('info', 'Panel web inicializado');
        this.addLog('info', 'Conectando al controlador VX200...');
    }

    // Actualizar estado de conexión
    updateConnectionStatus(connected) {
        const indicator = document.getElementById('status-indicator');
        const text = document.getElementById('status-text');

        if (connected) {
            indicator.className = 'bi bi-circle-fill text-success indicator-online';
            text.textContent = 'Conectado';
        } else {
            indicator.className = 'bi bi-circle-fill text-danger indicator-offline';
            text.textContent = 'Desconectado';
        }
    }

    // Actualizar estado del sistema
    updateSystemStatus(status) {
        console.log('📊 Actualizando estado del sistema:', status);

        // Audio status
        document.getElementById('audio-status').textContent = status.audio.status === 'active' ? 'Activo' : 'Inactivo';
        document.getElementById('audio-status').className = `badge ${status.audio.status === 'active' ? 'bg-success' : 'bg-danger'}`;

        // Baliza status
        const balizaRunning = status.baliza.running;
        document.getElementById('baliza-status').textContent = balizaRunning ? 'Ejecutándose' : 'Detenida';
        document.getElementById('baliza-status').className = `badge ${balizaRunning ? 'bg-info' : 'bg-secondary'}`;

        // SMS status
        const smsState = status.sms.sessionState;
        let smsText = 'Inactivo';
        let smsClass = 'bg-secondary';
        
        if (smsState !== 'idle') {
            smsText = smsState.replace('_', ' ').toUpperCase();
            smsClass = 'bg-warning';
        }
        
        document.getElementById('sms-status').textContent = smsText;
        document.getElementById('sms-status').className = `badge ${smsClass}`;

        // DTMF last
        const lastDTMF = status.dtmf.lastSequence || 'Esperando';
        document.getElementById('dtmf-last').textContent = lastDTMF;

          this.updateServiceButtons(status);
    }

    // Manejar DTMF detectado
    handleDTMFDetected(data) {
        console.log('📞 DTMF detectado:', data.sequence);
        
        this.lastDTMF = data.sequence;
        
        // Actualizar display
        const display = document.getElementById('dtmf-display');
        display.textContent = `DTMF: ${data.sequence}`;
        display.classList.add('active');
        
        // Quitar clase active después de 2 segundos
        setTimeout(() => {
            display.classList.remove('active');
            display.textContent = 'Esperando DTMF...';
        }, 2000);

        // Agregar a log
        this.addLog('info', `DTMF detectado: ${data.sequence}`);

        // Actualizar badge
        document.getElementById('dtmf-last').textContent = data.sequence;
    }

    // Manejar baliza transmitida
    handleBalizaTransmitted(data) {
        console.log('📡 Baliza transmitida');
        
        this.addLog('success', 'Baliza transmitida automáticamente');
        
        // Efecto visual
        const balizaStatus = document.getElementById('baliza-status');
        balizaStatus.classList.add('pulse');
        setTimeout(() => {
            balizaStatus.classList.remove('pulse');
        }, 1000);
    }

    // NUEVOS MÉTODOS: Manejar actividad del canal
handleChannelActivity(data) {
    const { isActive, level, timestamp } = data;
    
    console.log(`📻 Canal ${isActive ? 'OCUPADO' : 'LIBRE'} - Nivel: ${(level * 100).toFixed(1)}%`);
    
    // Actualizar indicadores
    const channelIcon = document.getElementById('channel-icon');
    const channelStatus = document.getElementById('channel-status');
    
    if (isActive) {
        channelIcon.className = 'bi bi-radio text-danger';
        channelStatus.textContent = 'OCUPADO';
        channelStatus.className = 'badge bg-danger';
        
        // Agregar efecto pulsante
        channelIcon.classList.add('pulse');
        
        this.addLog('warning', `Canal ocupado - Nivel: ${(level * 100).toFixed(1)}%`);
    } else {
        channelIcon.className = 'bi bi-radio text-success';
        channelStatus.textContent = 'Libre';
        channelStatus.className = 'badge bg-success';
        
        // Quitar efecto pulsante
        channelIcon.classList.remove('pulse');
        
        this.addLog('info', 'Canal libre');
    }
}

updateSignalLevel(data) {
    const { level, active } = data;
    const percentage = Math.min(100, level * 100 * 10); // Amplificar para visualización
    
    // Actualizar barra de progreso
    const progressBar = document.getElementById('signal-level-bar');
    const levelText = document.getElementById('signal-level-text');
    
    if (progressBar && levelText) {
        progressBar.style.width = `${percentage}%`;
        levelText.textContent = `${percentage.toFixed(0)}%`;
        
        // Cambiar color según nivel
        if (percentage > 50) {
            progressBar.className = 'progress-bar bg-danger';
        } else if (percentage > 20) {
            progressBar.className = 'progress-bar bg-warning';
        } else {
            progressBar.className = 'progress-bar bg-success';
        }
    }
}

    // Agregar entrada al log
    addLog(level, message, timestamp = null) {
        const logContainer = document.getElementById('log-container');
        const time = timestamp ? new Date(timestamp) : new Date();
        const timeStr = time.toLocaleTimeString();

        const logEntry = document.createElement('div');
        logEntry.className = `log-entry fade-in`;
        logEntry.innerHTML = `
            <span class="log-timestamp">[${timeStr}]</span>
            <span class="log-level-${level}">[${level.toUpperCase()}]</span>
            ${message}
        `;

        logContainer.appendChild(logEntry);

        // Mantener solo las últimas entradas
        this.logEntries.push({ level, message, timestamp: time });
        if (this.logEntries.length > this.maxLogEntries) {
            this.logEntries.shift();
            logContainer.removeChild(logContainer.firstChild);
        }

        // Scroll al final
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    // Ejecutar comando manual
    executeCommand(command) {
        console.log(`🎯 Ejecutando comando: ${command}`);
        
        if (!this.isConnected) {
            this.showNotification('error', 'No hay conexión con el servidor');
            return;
        }

        this.socket.emit('execute_command', { command });
        this.addLog('info', `Comando ejecutado: ${command}`);
    }

    // Actualizar configuración de baliza
    updateBalizaConfig() {
        const interval = document.getElementById('baliza-interval').value;
        const frequency = document.getElementById('baliza-frequency').value;
        const duration = document.getElementById('baliza-duration').value;
        const message = document.getElementById('baliza-message').value;

        const config = {
            interval: parseInt(interval),
            frequency: parseInt(frequency),
            duration: parseInt(duration),
            volume: 0.7,
            message: message
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
            this.showNotification('success', 'Configuración de baliza actualizada');
            this.addLog('info', 'Configuración de baliza actualizada');
        })
        .catch(error => {
            console.error('Error:', error);
            this.showNotification('error', 'Error actualizando configuración');
        });
    }

    // Refrescar estado del sistema
    refreshSystemStatus() {
        fetch('/api/status')
            .then(response => response.json())
            .then(status => {
                this.updateSystemStatus(status);
            })
            .catch(error => {
                console.error('Error refrescando estado:', error);
            });
    }

    // Mostrar notificación toast
    showNotification(type, message) {
        // Crear toast dinámicamente
        const toastContainer = document.createElement('div');
        toastContainer.style.position = 'fixed';
        toastContainer.style.top = '20px';
        toastContainer.style.right = '20px';
        toastContainer.style.zIndex = '9999';

        const iconMap = {
            success: 'check-circle-fill',
            error: 'exclamation-triangle-fill',
            warning: 'exclamation-circle-fill',
            info: 'info-circle-fill'
        };

        const colorMap = {
            success: 'success',
            error: 'danger',
            warning: 'warning',
            info: 'info'
        };

        toastContainer.innerHTML = `
            <div class="toast show" role="alert">
                <div class="toast-header bg-${colorMap[type]} text-white">
                    <i class="bi bi-${iconMap[type]} me-2"></i>
                    <strong class="me-auto">VX200 Controller</strong>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
                </div>
                <div class="toast-body">
                    ${message}
                </div>
            </div>
        `;

        document.body.appendChild(toastContainer);

        // Auto-remover después de 5 segundos
        setTimeout(() => {
            toastContainer.remove();
        }, 5000);

        // Manejar click del botón cerrar
        toastContainer.querySelector('.btn-close').addEventListener('click', () => {
            toastContainer.remove();
        });
    }

    // Agregar después del método showNotification():

// Toggle de servicios
toggleService(service) {
    console.log(`🔄 Toggle service: ${service}`);
    
    if (!this.isConnected) {
        this.showNotification('error', 'No hay conexión con el servidor');
        return;
    }

    this.socket.emit('execute_command', { command: `${service}_toggle` });
    this.addLog('info', `Cambiando estado de ${service}`);
}

// Confirmar acciones críticas
confirmAction(action) {
    const messages = {
        shutdown: '¿Está seguro que desea apagar el sistema?',
        restart: '¿Está seguro que desea reiniciar el sistema?'
    };

    const icons = {
        shutdown: 'power',
        restart: 'arrow-clockwise'
    };

    if (confirm(messages[action])) {
        console.log(`🚨 Acción confirmada: ${action}`);
        
        if (!this.isConnected) {
            this.showNotification('error', 'No hay conexión con el servidor');
            return;
        }

        this.socket.emit('execute_command', { command: `system_${action}` });
        this.addLog('warning', `Ejecutando ${action} del sistema`);
        
        // Mostrar notificación inmediata
        this.showNotification('warning', `${action} del sistema iniciado...`);
        
        // Deshabilitar botones temporalmente
        const btn = document.getElementById(`${action}-btn`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="bi bi-${icons[action]}"></i> ${action === 'shutdown' ? 'Apagando...' : 'Reiniciando...'}`;
        }
    }
}

// Actualizar estado de botones según el sistema
updateServiceButtons(status) {
    // Botón de audio
    const audioBtn = document.getElementById('audio-toggle-btn');
    if (audioBtn) {
        const isActive = status.audio.status === 'active';
        audioBtn.className = `btn ${isActive ? 'btn-success' : 'btn-outline-success'} w-100 mb-2`;
        audioBtn.innerHTML = `<i class="bi bi-volume-${isActive ? 'up' : 'mute'}"></i> Audio ${isActive ? 'ON' : 'OFF'}`;
    }

    // Botón de baliza
    const balizaBtn = document.getElementById('baliza-toggle-btn');
    if (balizaBtn) {
        const isRunning = status.baliza.running;
        balizaBtn.className = `btn ${isRunning ? 'btn-info' : 'btn-outline-info'} w-100 mb-2`;
        balizaBtn.innerHTML = `<i class="bi bi-broadcast${isRunning ? '' : '-pin'}"></i> Baliza ${isRunning ? 'ON' : 'OFF'}`;
    }
}
}

// Funciones globales para los botones
function executeCommand(command) {
    window.vx200Panel.executeCommand(command);
}

// Inicializar cuando se carga la página
document.addEventListener('DOMContentLoaded', function() {
    window.vx200Panel = new VX200Panel();
});

function toggleService(service) {
    window.vx200Panel.toggleService(service);
}

function confirmAction(action) {
    window.vx200Panel.confirmAction(action);
}