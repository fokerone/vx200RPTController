# VX200 Controller - Guía de Configuración

## Índice
- [Configuración Inicial](#configuración-inicial)
- [Variables de Entorno](#variables-de-entorno)
- [Configuración de Audio](#configuración-de-audio)
- [Módulos del Sistema](#módulos-del-sistema)
- [Seguridad](#seguridad)
- [Solución de Problemas](#solución-de-problemas)

## Configuración Inicial

### 1. Variables de Entorno
```bash
# Copiar el template de configuración
cp .env.example .env

# Editar las variables según tu setup
nano .env
```

### 2. Configuración Básica
Las variables mínimas requeridas:
```env
CALLSIGN=TU_INDICATIVO
WEB_PORT=3000
AUDIO_DEVICE=hw:0,0
```

## Variables de Entorno

### Sistema Base
| Variable | Descripción | Valor por Defecto |
|----------|-------------|-------------------|
| `CALLSIGN` | Indicativo de radio | LU5MCD |
| `NODE_ENV` | Entorno de ejecución | production |
| `SYSTEM_VERSION` | Versión del sistema | 2.0 |

### Servidor Web
| Variable | Descripción | Valor por Defecto |
|----------|-------------|-------------------|
| `WEB_PORT` | Puerto del servidor web | 3000 |
| `WEB_HOST` | Host del servidor | 0.0.0.0 |
| `ALLOWED_ORIGINS` | Orígenes CORS permitidos | localhost:3000 |

### Audio
| Variable | Descripción | Valor por Defecto |
|----------|-------------|-------------------|
| `AUDIO_DEVICE` | Dispositivo de audio ALSA | hw:0,0 |
| `AUDIO_SAMPLE_RATE` | Frecuencia de muestreo | 48000 |
| `AUDIO_CHANNEL_THRESHOLD` | Umbral de detección | 0.02 |

## Configuración de Audio

### Dispositivos ALSA
```bash
# Listar dispositivos disponibles
aplay -l

# Probar dispositivo específico
aplay -D hw:0,0 /usr/share/sounds/alsa/Front_Left.wav

# Configurar en .env
AUDIO_DEVICE=hw:0,0
```

### Calibración de Umbral
```bash
# El umbral determina cuándo se considera que hay señal
# Valores típicos:
AUDIO_CHANNEL_THRESHOLD=0.02  # Sensibilidad media
AUDIO_CHANNEL_THRESHOLD=0.01  # Alta sensibilidad
AUDIO_CHANNEL_THRESHOLD=0.05  # Baja sensibilidad
```

## Módulos del Sistema

### Roger Beep
```env
ROGER_BEEP_ENABLED=true
ROGER_BEEP_TYPE=kenwood
ROGER_BEEP_VOLUME=0.7
ROGER_BEEP_DURATION=250
```

### Baliza
```env
BALIZA_ENABLED=true
BALIZA_INTERVAL=15
BALIZA_MESSAGE="TU_INDICATIVO Repetidora"
BALIZA_TONE_FREQUENCY=1000
```

### Text-to-Speech
```env
TTS_VOICE=es
TTS_SPEED=150
TTS_AMPLITUDE=100
```

### AI Chat (Opcional)
```env
# Requiere API Key de OpenAI
OPENAI_API_KEY=tu_api_key_aqui
OPENAI_MODEL=gpt-3.5-turbo
OPENAI_MAX_TOKENS=150
```

### SMS (Opcional)
```env
# Requiere cuenta de Twilio
TWILIO_ACCOUNT_SID=tu_account_sid
TWILIO_AUTH_TOKEN=tu_auth_token
TWILIO_FROM_NUMBER=+1234567890
```

## Seguridad

### CORS
```env
# Producción: especificar dominios exactos
ALLOWED_ORIGINS=https://tu-dominio.com,https://otro-dominio.com

# Desarrollo: permitir localhost
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

### Rate Limiting
```env
RATE_LIMIT_WINDOW_MS=900000    # 15 minutos
RATE_LIMIT_MAX_REQUESTS=100    # 100 requests por ventana
```

### Secrets
```env
SESSION_SECRET=clave_secreta_muy_larga_y_segura
```

## Configuración Avanzada

### Logging
```env
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_FILE_PATH=./logs/vx200.log
```

### Hardware Integration
```env
# GPIO (Raspberry Pi)
GPIO_ENABLED=true
PTT_GPIO_PIN=18
COS_GPIO_PIN=24

# Serial Port
SERIAL_PORT=/dev/ttyUSB0
SERIAL_BAUDRATE=9600
```

### Monitoreo
```env
HEALTH_CHECK_INTERVAL=30000
ENABLE_METRICS=true
MEMORY_USAGE_THRESHOLD=85
```

## Solución de Problemas

### Audio No Funciona
```bash
# Verificar dispositivos
aplay -l
arecord -l

# Permisos de audio
sudo usermod -a -G audio $USER

# Configurar device correcto
AUDIO_DEVICE=hw:1,0  # Probar diferentes números
```

### Problemas de Red
```bash
# Verificar puerto disponible
netstat -tlnp | grep :3000

# Cambiar puerto si está ocupado
WEB_PORT=3001
```

### Errores de Permisos
```bash
# Permisos de archivos
chmod +x src/index.js

# Permisos de directorios
mkdir -p logs temp sounds
chmod 755 logs temp sounds
```

### Debug Mode
```env
NODE_ENV=development
DEBUG_AUDIO=true
DEBUG_DTMF=true
LOG_LEVEL=debug
```

## Ejemplos de Configuración

### Setup Básico (Solo Baliza)
```env
CALLSIGN=LU5MCD
WEB_PORT=3000
AUDIO_DEVICE=hw:0,0
BALIZA_ENABLED=true
BALIZA_INTERVAL=15
ROGER_BEEP_ENABLED=true
```

### Setup Completo (Todos los Módulos)
```env
CALLSIGN=LU5MCD
WEB_PORT=3000
AUDIO_DEVICE=hw:0,0

# Baliza
BALIZA_ENABLED=true
BALIZA_INTERVAL=15

# Roger Beep
ROGER_BEEP_ENABLED=true
ROGER_BEEP_TYPE=kenwood

# AI Chat
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-3.5-turbo

# SMS
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1234567890
```

### Setup de Desarrollo
```env
NODE_ENV=development
WEB_PORT=3000
LOG_LEVEL=debug
DEBUG_AUDIO=true
TEST_MODE=true
SIMULATE_HARDWARE=true
```

## Backup y Versionado

### Backup de Configuración
```bash
# Backup manual
cp .env .env.backup.$(date +%Y%m%d)

# Backup automático (crontab)
0 2 * * * cp /path/to/vx200/.env /path/to/backups/.env.$(date +\%Y\%m\%d)
```

### Control de Versiones
```gitignore
# .gitignore
.env
.env.local
logs/
temp/
*.log
```

## Monitoreo y Mantenimiento

### Health Check
```bash
# Verificar estado via API
curl http://localhost:3000/api/status

# Logs del sistema
tail -f logs/vx200.log
```

### Métricas
```bash
# Via panel web
http://localhost:3000

# Via API
curl http://localhost:3000/api/system/metrics
```

---

Para más información, consulta la documentación completa en el directorio `docs/` o contacta al desarrollador.