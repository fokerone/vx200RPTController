# VX200 Controller

## 📡 Sistema de Control para Repetidora Simplex

Sistema completo de control inteligente para repetidora simplex desarrollado en Node.js. Incluye decodificación DTMF avanzada, múltiples servicios automatizados, panel web de control y transmisión inteligente con detección de canal ocupado.

---

## ✨ Características Principales

### 🎵 **Decodificador DTMF Personalizado**
- Decodificación precisa de tonos DTMF
- Filtrado de ruido y validación de secuencias
- Soporte para comandos complejos y parámetros

### 🔊 **Sistema de Baliza Inteligente**
- **Automática**: Transmisión programable cada X minutos
- **Manual**: Activación instantánea por comando DTMF
- Mensajes personalizables y configurables

### 📅 **Módulo DateTime**
- Anuncio de fecha y hora actual
- Activación por comando DTMF `*1`
- Formato en español con voz natural

### 🤖 **Módulo IA (Simulado)**
- Sistema de consultas por DTMF `*2`
- Preparado para integración con OpenAI
- Respuestas contextuales por voz

### 📱 **Módulo SMS (Simulado)**
- Sistema completo de mensajería por DTMF `*3`
- Preparado para integración con Twilio
- Envío y recepción de mensajes

### 🌐 **Panel Web de Control**
- Interfaz moderna y responsiva
- Monitor en tiempo real de actividad DTMF
- Control remoto de todos los módulos
- Logs del sistema en vivo
- Indicador visual de estado del canal

### 🧠 **Transmisión Inteligente**
- Detección automática de canal ocupado
- Cola de transmisiones pendientes
- Espera inteligente para evitar interferencias

---

## 🚀 Instalación

### Prerrequisitos
- Node.js 16.x o superior
- NPM o Yarn
- Sistema operativo compatible (Linux/Windows/macOS)

### Instalación Rápida

```bash
# Clonar el repositorio
git clone https://github.com/usuario/vx200-controller.git
cd vx200-controller

# Instalar dependencias
npm install

# Ejecutar el sistema
npm start
```

El sistema estará disponible en: **http://localhost:3000**

---

## 📁 Estructura del Proyecto

```
vx200-controller/
├── src/
│   ├── index.js                 # Controlador principal
│   ├── audio/
│   │   ├── audioManager.js      # Gestor de audio
│   │   └── dtmfDecoder.js       # Decodificador DTMF
│   ├── modules/
│   │   ├── baliza.js            # Módulo de baliza
│   │   ├── datetime.js          # Módulo fecha/hora
│   │   ├── aiChat.js            # Módulo IA (simulado)
│   │   └── sms.js               # Módulo SMS (simulado)
│   └── web/
│       └── server.js            # Servidor web
├── views/
│   └── dashboard.ejs            # Panel de control
├── public/
│   ├── css/
│   │   └── style.css            # Estilos del panel
│   └── js/
│       └── dashboard.js         # JavaScript frontend
├── config/
│   └── config.json              # Configuración del sistema
├── package.json
└── README.md
```

---

## 🎛️ Comandos DTMF

| Comando | Función | Descripción |
|---------|---------|-------------|
| `*1` | DateTime | Anuncia fecha y hora actual |
| `*2` | IA Chat | Sistema de consultas (simulado) |
| `*3` | SMS | Sistema de mensajes (simulado) |
| `*9` | Baliza | Activa baliza manual |

---

## ⚙️ Configuración

### Archivo `config/config.json`

```json
{
  "system": {
    "name": "VX200 Controller",
    "version": "1.0.0",
    "webPort": 3000
  },
  "audio": {
    "sampleRate": 44100,
    "channels": 2,
    "dtmfThreshold": 0.3
  },
  "baliza": {
    "enabled": true,
    "interval": 900000,
    "message": "Repetidora VX200 - Sistema activo"
  },
  "modules": {
    "datetime": { "enabled": true },
    "aiChat": { "enabled": false },
    "sms": { "enabled": false }
  }
}
```

### Parámetros Configurables

- **Puerto web**: Cambiar puerto del panel de control
- **Intervalo de baliza**: Tiempo entre transmisiones automáticas
- **Mensaje de baliza**: Texto personalizable
- **Umbral DTMF**: Sensibilidad del decodificador
- **Módulos**: Habilitar/deshabilitar servicios

---

## 🖥️ Panel Web

Accede al panel de control en **http://localhost:3000**

### Funcionalidades del Panel:
- 📊 **Monitor DTMF**: Visualización en tiempo real de comandos
- 🔴 **Indicador de Canal**: Estado de ocupación/libre
- 📝 **Logs del Sistema**: Registro de actividad completo
- 🎛️ **Controles**: Activar/desactivar módulos remotamente
- 📈 **Estadísticas**: Uso y rendimiento del sistema

---

## 🔧 Desarrollo

### Comandos de Desarrollo

```bash
# Modo desarrollo con auto-reinicio
npm run dev

# Ejecutar tests
npm test

# Linting de código
npm run lint

# Build para producción
npm run build
```

### Estructura de Módulos

Cada módulo sigue el patrón:

```javascript
class ModuleName {
    constructor(config) {
        this.config = config;
        this.enabled = false;
    }
    
    async initialize() {
        // Inicialización del módulo
    }
    
    async handleDTMF(command, params) {
        // Procesamiento de comandos DTMF
    }
    
    async transmit(message) {
        // Lógica de transmisión
    }
}
```

---

## 📋 Próximas Características

### En Desarrollo
- [ ] **API OpenAI**: Integración real para módulo IA
- [ ] **Twilio SMS**: API real para mensajería
- [ ] **Speech-to-Text**: Whisper API para transcripción
- [ ] **TTS Avanzado**: Azure/Google para voz natural
- [ ] **Base de Datos**: Persistencia de logs y configuración

### Planificado
- [ ] **App Móvil**: Control desde smartphone
- [ ] **Multi-repetidora**: Soporte para múltiples equipos
- [ ] **Métricas Avanzadas**: Analytics y reportes
- [ ] **Backup Automático**: Respaldo de configuración
- [ ] **API REST**: Integración con sistemas externos

---

## 🛠️ Troubleshooting

### Problemas Comunes

**El sistema no inicia:**
```bash
# Verificar dependencias
npm install

# Comprobar puerto disponible
netstat -tulpn | grep :3000
```

**DTMF no se decodifica:**
- Verificar configuración de audio
- Ajustar umbral de detección
- Comprobar niveles de señal

**Panel web no carga:**
- Verificar que el puerto 3000 esté libre
- Comprobar firewall/antivirus
- Revisar logs del sistema

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver archivo `LICENSE` para más detalles.

---

## 👨‍💻 Autor. LU5MCD

**Desarrollado para radioaficionados y entusiastas de las comunicaciones**

- 🔧 **Sistema modular** y extensible
- 🎯 **Fácil configuración** y uso
- 🚀 **Alto rendimiento** y confiabilidad

---

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas! 

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-caracteristica`)
3. Commit tus cambios (`git commit -am 'Agrega nueva característica'`)
4. Push a la rama (`git push origin feature/nueva-caracteristica`)
5. Abre un Pull Request

---

## 📞 Soporte

¿Necesitas ayuda? 

- 📧 **Email**:  fokerone@gmail.com
- **QRZ**: https://www.qrz.com/db/LU5MCD
---

**¡Disfruta controlando tu repetidora Simplex! 📡🎉**
