const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());

// Estado simulado del VX200 (en producción se conectaría al sistema real)
let mockSystemStatus = {
  timestamp: new Date().toISOString(),
  uptime: 0,
  audio: {
    status: 'active',
    isRecording: true,
    device: 'hw:1,0',
    volume: 85,
  },
  channel: {
    isActive: false,
    signalLevel: 0,
    lastActivity: new Date().toISOString(),
  },
  baliza: {
    enabled: true,
    running: true,
    interval: 15,
    lastTransmission: new Date(Date.now() - 300000).toISOString(),
    nextTransmission: new Date(Date.now() + 600000).toISOString(),
  },
  datetime: {
    enabled: true,
    timezone: 'America/Argentina/Mendoza',
  },
  weather: {
    enabled: true,
    apiKey: true,
    lastUpdate: new Date(Date.now() - 180000).toISOString(),
  },
  weatherAlerts: {
    enabled: true,
    state: 'active',
    activeAlerts: 3,
    lastCheck: new Date(Date.now() - 120000).toISOString(),
    nextCheck: new Date(Date.now() + 5100000).toISOString(),
  },
  inpres: {
    enabled: true,
    state: 'active',
    lastCheck: new Date(Date.now() - 240000).toISOString(),
    seismsToday: 2,
  },
  aprs: {
    enabled: true,
    connected: true,
    callsign: 'LU1ABC-7',
    lastBeacon: new Date(Date.now() - 180000).toISOString(),
    positionsReceived: 47,
  },
  rogerBeep: {
    enabled: true,
    type: 'CHIRP',
    volume: 70,
  },
  dtmf: {
    lastSequence: 'Esperando...',
  },
};

let mockLogs = [
  {
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'VX200 Repetidora iniciada correctamente',
    module: 'Controller',
  },
  {
    timestamp: new Date(Date.now() - 30000).toISOString(),
    level: 'info',
    message: 'Alertas meteorológicas: 3 alertas detectadas para Mendoza',
    module: 'WeatherAlerts',
  },
  {
    timestamp: new Date(Date.now() - 60000).toISOString(),
    level: 'success',
    message: 'APRS TNC conectado exitosamente',
    module: 'APRS',
  },
  {
    timestamp: new Date(Date.now() - 120000).toISOString(),
    level: 'info',
    message: 'Baliza automática transmitida',
    module: 'Baliza',
  },
];

// Simular uptime incremental
setInterval(() => {
  mockSystemStatus.uptime += 1000;
  mockSystemStatus.timestamp = new Date().toISOString();
}, 1000);

// Simular actividad del canal aleatoria
setInterval(() => {
  const wasActive = mockSystemStatus.channel.isActive;
  mockSystemStatus.channel.isActive = Math.random() < 0.1; // 10% chance de estar activo
  
  if (mockSystemStatus.channel.isActive !== wasActive) {
    mockSystemStatus.channel.lastActivity = new Date().toISOString();
    mockSystemStatus.channel.signalLevel = mockSystemStatus.channel.isActive 
      ? Math.floor(Math.random() * 40) + 60 // 60-100% cuando activo
      : 0;
    
    io.emit('channel_activity', mockSystemStatus.channel.isActive);
  }
}, 3000);

// Simular DTMF ocasional
const dtmfSequences = ['*1', '*4', '*7', '*9', '*3', '*0'];
setInterval(() => {
  if (Math.random() < 0.05) { // 5% chance cada 10 segundos
    const sequence = dtmfSequences[Math.floor(Math.random() * dtmfSequences.length)];
    mockSystemStatus.dtmf.lastSequence = sequence;
    
    // Agregar log de DTMF
    const dtmfLog = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `DTMF detectado: ${sequence}`,
      module: 'DTMF',
    };
    mockLogs.unshift(dtmfLog);
    mockLogs = mockLogs.slice(0, 100); // Mantener últimos 100 logs
    
    io.emit('dtmf', sequence);
    io.emit('log', dtmfLog);
  }
}, 10000);

// Socket.IO eventos
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  
  // Enviar estado inicial
  socket.emit('system_status', mockSystemStatus);
  
  // Enviar logs iniciales
  mockLogs.forEach(log => socket.emit('log', log));
  
  // Manejar comandos del cliente
  socket.on('command', (command) => {
    console.log('Comando recibido:', command);
    
    const commandLog = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Comando ejecutado: ${command}`,
      module: 'WebInterface',
    };
    mockLogs.unshift(commandLog);
    mockLogs = mockLogs.slice(0, 100);
    
    io.emit('log', commandLog);
    
    // Simular respuesta a comandos DTMF
    if (command.startsWith('dtmf:')) {
      const sequence = command.replace('dtmf:', '');
      mockSystemStatus.dtmf.lastSequence = sequence;
      
      setTimeout(() => {
        const responseLog = {
          timestamp: new Date().toISOString(),
          level: 'success',
          message: `Comando ${sequence} ejecutado correctamente`,
          module: 'DTMF',
        };
        mockLogs.unshift(responseLog);
        io.emit('log', responseLog);
      }, 1000);
    }
  });
  
  // Manejar toggle de servicios
  socket.on('toggle_service', (service) => {
    console.log('Toggle service:', service);
    
    switch (service) {
      case 'audio':
        mockSystemStatus.audio.isRecording = !mockSystemStatus.audio.isRecording;
        mockSystemStatus.audio.status = mockSystemStatus.audio.isRecording ? 'active' : 'inactive';
        break;
      case 'baliza':
        mockSystemStatus.baliza.running = !mockSystemStatus.baliza.running;
        break;
    }
    
    const toggleLog = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Servicio ${service} ${mockSystemStatus[service]?.running || mockSystemStatus[service]?.isRecording ? 'iniciado' : 'detenido'}`,
      module: 'WebInterface',
    };
    mockLogs.unshift(toggleLog);
    mockLogs = mockLogs.slice(0, 100);
    
    io.emit('log', toggleLog);
    io.emit('system_status', mockSystemStatus);
  });
  
  // Solicitar estado actual
  socket.on('request_status', () => {
    socket.emit('system_status', mockSystemStatus);
  });
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Enviar estado del sistema periódicamente
setInterval(() => {
  io.emit('system_status', mockSystemStatus);
}, 5000);

// API REST endpoints
app.get('/api/status', (req, res) => {
  res.json(mockSystemStatus);
});

app.get('/api/logs', (req, res) => {
  res.json(mockLogs);
});

app.post('/api/command', (req, res) => {
  const { command } = req.body;
  console.log('API Command:', command);
  
  // Simular ejecución de comando
  res.json({ 
    success: true, 
    message: `Comando ${command} enviado`,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 VX200 Dashboard Server ejecutándose en puerto ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:3000`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`🌐 API: http://localhost:${PORT}/api`);
});