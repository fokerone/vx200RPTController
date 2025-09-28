# 🪟 VX200 Controller - Guía para Windows

## 🚀 Instalación Rápida

### 1️⃣ **Instalación Automática (Recomendada)**

```batch
# Ejecutar como Administrador
install-windows.bat
```

**¡Eso es todo!** El script automáticamente:
- ✅ Verifica e instala Docker Desktop
- ✅ Configura WSL2 si es necesario
- ✅ Construye el contenedor con privilegios de audio
- ✅ Configura todo para funcionar inmediatamente

---

## 🎛️ **Comandos de Control**

### **Operaciones Básicas**
```batch
# Iniciar VX200 Controller
docker-compose up -d

# Ver logs en tiempo real
docker-compose logs -f vx200-controller

# Detener VX200 Controller
docker-compose down

# Reiniciar servicios
docker-compose restart

# Ver estado de servicios
docker-compose ps
```

### **Mantenimiento**
```batch
# Reconstruir imagen tras cambios
docker-compose build --no-cache

# Limpiar contenedores y volúmenes
docker-compose down -v

# Acceder al contenedor (debugging)
docker-compose exec vx200-controller bash

# Ver logs de audio (PulseAudio)
docker-compose logs pulseaudio-server
```

---

## 🔧 **Configuración**

### **Archivo .env**
Edita `.env` antes del primer inicio:

```env
# CAMBIAR INDICATIVO OBLIGATORIO
CALLSIGN=TU_INDICATIVO
APRS_CALLSIGN=TU_INDICATIVO

# Configuración de audio
AUDIO_DEVICE=default
AUDIO_SAMPLE_RATE=48000

# Puerto del mapa APRS
APRS_MAP_PORT=3000
```

### **Audio USB/Bluetooth**
Para dispositivos de audio específicos:

```yaml
# En docker-compose.yml, agregar devices adicionales:
devices:
  - /dev/snd:/dev/snd
  - /dev/bus/usb:/dev/bus/usb  # Para USB Audio
```

---

## 🗺️ **Acceso al Sistema**

| Servicio | URL | Descripción |
|----------|-----|-------------|
| **Mapa APRS** | http://localhost:3000 | Interfaz principal |
| **API Estado** | http://localhost:3000/api/repeater | Estado JSON |
| **API Posiciones** | http://localhost:3000/api/positions | Datos APRS |

---

## 🎵 **Configuración de Audio**

### **Verificar Audio Funcionando**
```batch
# Entrar al contenedor
docker-compose exec vx200-controller bash

# Listar dispositivos de audio
aplay -l

# Test de audio
speaker-test -t sine -f 1000 -l 1
```

### **Problemas de Audio Comunes**

| Problema | Solución |
|----------|----------|
| No detecta audio | Verificar `devices: - /dev/snd:/dev/snd` |
| PulseAudio no inicia | `docker-compose restart pulseaudio-server` |
| Dispositivo USB no detectado | Agregar USB devices al compose |
| Audio cortado | Verificar `AUDIO_CHANNEL_THRESHOLD=0.02` |

---

## 🌐 **Acceso desde Red Local**

Para acceder desde otros dispositivos en tu red:

```yaml
# En docker-compose.yml cambiar:
ports:
  - "0.0.0.0:3000:3000"  # Acceso desde cualquier IP
```

Luego accede con: `http://IP_DE_TU_PC:3000`

---

## 📊 **Monitoreo y Logs**

### **Ubicaciones de Logs**
```
./logs/vx200-YYYY-MM-DD.log    # Logs principales
./logs/error-YYYY-MM-DD.log    # Logs de errores
```

### **Monitoreo en Tiempo Real**
```batch
# Logs de aplicación
docker-compose logs -f vx200-controller

# Logs de sistema
docker-compose logs -f

# Solo errores
docker-compose logs -f vx200-controller | findstr ERROR
```

---

## 🔧 **Troubleshooting**

### **VX200 no inicia**
```batch
# Verificar Docker corriendo
docker ps

# Verificar configuración
docker-compose config

# Logs detallados
docker-compose logs vx200-controller
```

### **Audio no funciona**
```batch
# Verificar dispositivos
docker-compose exec vx200-controller ls -la /dev/snd/

# Test PulseAudio
docker-compose exec vx200-controller pactl info

# Reiniciar audio
docker-compose restart pulseaudio-server
```

### **Mapa APRS no carga**
```batch
# Verificar puerto disponible
netstat -an | findstr 3000

# Verificar firewall Windows
# Windows Defender -> Permitir app -> Docker Desktop
```

---

## 🔄 **Actualizaciones**

### **Actualizar VX200 Controller**
```batch
# Detener servicios
docker-compose down

# Actualizar código (git pull o descargar nueva versión)
git pull origin main

# Reconstruir imagen
docker-compose build --no-cache

# Iniciar con nueva versión
docker-compose up -d
```

---

## 📱 **Uso del Sistema**

### **Comandos DTMF Disponibles**
| Comando | Función | Descripción |
|---------|---------|-------------|
| `*1` | DateTime | Fecha y hora actual |
| `*3` | INPRES | Sismos del día >4.0 |
| `*4` | Weather | Clima actual |
| `*5` | Weather Voice | Clima con voz natural |
| `*7` | Weather Alerts | Alertas meteorológicas |
| `*9` | Baliza | Activar baliza manual |

### **Interfaz Web - Mapa APRS**
- 🗺️ **Mapa interactivo** con posiciones en tiempo real
- 📊 **Panel de información** al click en marcadores
- 📈 **Gráficos de altitud** y estadísticas
- 🔄 **Actualización automática** cada 30 segundos

---

## ⚙️ **Configuración Avanzada**

### **Múltiples Instancias**
Para ejecutar múltiples repetidoras:

```yaml
# docker-compose.override.yml
version: '3.8'
services:
  vx200-controller-2:
    extends:
      service: vx200-controller
    container_name: vx200-controller-2
    ports:
      - "3001:3000"
    environment:
      - CALLSIGN=OTRO_INDICATIVO
```

### **Backup Automático**
```batch
# Script para backup daily
@echo off
set DATE=%date:~10,4%-%date:~4,2%-%date:~7,2%
docker-compose exec vx200-controller tar -czf /app/backup-%DATE%.tar.gz /app/logs /app/config
docker cp vx200-controller:/app/backup-%DATE%.tar.gz ./backups/
```

---

## 🆘 **Soporte**

### **Logs Importantes para Soporte**
```batch
# Generar reporte completo
docker-compose logs > vx200-debug.log
docker-compose exec vx200-controller cat /app/.env > vx200-config.txt
docker --version >> vx200-debug.log
```

### **Contacto**
- 📧 **Email**: fokerone@gmail.com
- 🌐 **GitHub**: https://github.com/fokerone/vx200RPTController
- 📻 **QRZ**: https://www.qrz.com/db/LU5MCD

---

## 📋 **Checklist de Funcionamiento**

- [ ] Docker Desktop instalado y funcionando
- [ ] WSL2 habilitado (Windows 10/11)
- [ ] Archivo `.env` configurado con tu indicativo
- [ ] Dispositivos de audio detectados en contenedor
- [ ] Mapa APRS accesible en http://localhost:3000
- [ ] DTMF responde a comandos de prueba
- [ ] Logs no muestran errores críticos

**¡VX200 Controller funcionando en Windows! 🎉**