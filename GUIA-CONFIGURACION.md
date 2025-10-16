# Guía de Configuración Post-Instalación

## 1. Primera conexión SSH

Una vez que la Raspberry Pi arranque (espera 2-3 minutos):

```bash
# Opción 1: Por hostname (si funciona mDNS)
ssh pi@vx200-controller.local

# Opción 2: Por IP (búscala en tu router o con nmap)
ssh pi@192.168.1.X

# Contraseña: cegarcomp
```

## 2. Ejecutar instalación de VX200

```bash
cd ~
./install-vx200.sh
```

Este script instalará:
- Node.js 18.x
- Todas las dependencias del sistema (espeak, sox, alsa, etc.)
- Direwolf TNC compilado desde fuente
- VX200 Controller clonado y configurado
- Servicio systemd configurado

**Duración:** 15-20 minutos en Raspberry Pi 3B

## 3. Configurar archivo .env

Después de la instalación, edita el archivo de configuración:

```bash
cd ~/vx200RPTController
nano .env
```

### Variables CRÍTICAS que debes configurar:

```bash
# ═══════════════════════════════════════════════════════════
# AUDIO - Verificar primero con: aplay -l
# ═══════════════════════════════════════════════════════════
AUDIO_DEVICE=plughw:0,0              # Dispositivo de audio
AUDIO_SAMPLE_RATE=48000              # 48000 para calidad, 16000 para Pi 3B

# ═══════════════════════════════════════════════════════════
# APRS - OBLIGATORIO configurar tu indicativo
# ═══════════════════════════════════════════════════════════
APRS_CALLSIGN=LU1ABC                 # TU CALLSIGN AQUÍ
APRS_SSID=1                          # SSID (1-15)
APRS_PASSCODE=12345                  # Tu passcode APRS
APRS_LATITUDE=-32.8895               # Tu latitud
APRS_LONGITUDE=-68.8458              # Tu longitud
APRS_ALTITUDE=750                    # Tu altitud en metros
APRS_COMMENT=VX200 Repeater Mendoza  # Comentario
APRS_SYMBOL=/r                       # /r = repetidora
APRS_BEACON_INTERVAL=1800000         # 30 minutos en ms

# ═══════════════════════════════════════════════════════════
# TTS (Text-to-Speech)
# ═══════════════════════════════════════════════════════════
TTS_ENGINE=hybrid                    # hybrid = Google+espeak fallback
TTS_VOICE=es-la                      # Español latinoamericano
TTS_SPEED=1.0                        # Velocidad (0.5-2.0)
TTS_PITCH=50                         # Tono (0-99)

# ═══════════════════════════════════════════════════════════
# ROGER BEEP
# ═══════════════════════════════════════════════════════════
ROGER_BEEP_ENABLED=true              # Beep al soltar PTT
ROGER_BEEP_FREQUENCY=1000            # Hz
ROGER_BEEP_DURATION=100              # ms

# ═══════════════════════════════════════════════════════════
# CLIMA SMN (Servicio Meteorológico Nacional Argentina)
# ═══════════════════════════════════════════════════════════
SMN_ENABLED=true                     # Alertas meteorológicas
SMN_CHECK_INTERVAL=300000            # Revisar cada 5 minutos

# ═══════════════════════════════════════════════════════════
# INPRES (Sismos)
# ═══════════════════════════════════════════════════════════
INPRES_ENABLED=true                  # Monitoreo de sismos
INPRES_MIN_MAGNITUDE=4.0             # Magnitud mínima a reportar
INPRES_CHECK_INTERVAL=300000         # Revisar cada 5 minutos

# ═══════════════════════════════════════════════════════════
# OPENWEATHER (Opcional - requiere API key gratuita)
# ═══════════════════════════════════════════════════════════
OPENWEATHER_API_KEY=                 # https://openweathermap.org/api

# ═══════════════════════════════════════════════════════════
# DEBUG
# ═══════════════════════════════════════════════════════════
DEBUG=false
LOG_LEVEL=info                       # error, warn, info, debug
```

### Cómo obtener tu APRS Passcode

Tu passcode se genera desde tu callsign. Opciones:

1. **Online:** https://apps.magicbug.co.uk/passcode/
2. **Calcular manualmente** (si conoces el algoritmo)

## 4. Verificar dispositivo de audio

Antes de iniciar el servicio, verifica que tu dispositivo de audio está correctamente detectado:

```bash
# Listar dispositivos de audio
aplay -l

# Ejemplo de salida:
# card 0: Device [USB Audio Device], device 0: USB Audio [USB Audio]
#   Subdevices: 1/1
#   Subdevice #0: subdevice #0

# Si tu tarjeta es la 0, usa: plughw:0,0
# Si es otra, usa: plughw:N,0 donde N es el número de card
```

Edita `.env` con el dispositivo correcto:
```bash
AUDIO_DEVICE=plughw:0,0
```

## 5. Prueba de audio

```bash
# Prueba de espeak
espeak-ng -v es-la "Hola, esto es una prueba" --stdout | aplay

# Prueba directa de aplay
speaker-test -t wav -c 2
```

## 6. Iniciar servicio VX200

```bash
# Iniciar servicio
sudo systemctl start vx200-controller.service

# Ver estado
sudo systemctl status vx200-controller.service

# Ver logs en tiempo real
sudo journalctl -u vx200-controller.service -f

# Detener servicio
sudo systemctl stop vx200-controller.service

# Reiniciar servicio
sudo systemctl restart vx200-controller.service
```

## 7. Comandos DTMF disponibles

Una vez que el sistema esté funcionando, puedes enviar estos comandos por radio:

### Comandos básicos:
- `*1` - Estado del sistema
- `*2` - Hora actual
- `*3` - Temperatura y clima
- `*4` - Última posición APRS
- `*5` - Estadísticas de operación
- `*9` - Información del controlador

### Comandos APRS:
- `#1` - Enviar beacon manual
- `#2` - Estado de conexión APRS-IS
- `#3` - Última posición transmitida

### Comandos de monitoreo:
- `**1` - Último sismo reportado (INPRES)
- `**2` - Alertas meteorológicas activas
- `**3` - Estado de módulos de monitoreo

### Comandos administrativos:
- `***1` - Reiniciar controlador
- `***2` - Recargar configuración
- `***9` - Apagar sistema (requiere confirmación)

## 8. Optimizaciones para Raspberry Pi 3B

Tu Pi 3B tiene 1GB de RAM, por lo que estas optimizaciones son importantes:

### Limitar uso de memoria:
```bash
# Ya configurado en el servicio systemd:
MemoryLimit=512M
CPUQuota=80%
```

### Reducir sample rate si tienes problemas:
En `.env`:
```bash
AUDIO_SAMPLE_RATE=16000  # En lugar de 48000
```

### Deshabilitar módulos opcionales si no los necesitas:
En `.env`:
```bash
SMN_ENABLED=false          # Si no necesitas alertas clima
INPRES_ENABLED=false       # Si no necesitas sismos
OPENWEATHER_API_KEY=       # Déjalo vacío si no lo usas
```

## 9. Monitoreo del sistema

```bash
# Uso de memoria
free -h

# Uso de CPU
htop

# Temperatura de CPU
vcgencmd measure_temp

# Espacio en disco
df -h

# Logs del sistema
sudo journalctl -xe
```

## 10. Troubleshooting

### Problema: No se conecta WiFi
```bash
# Verificar estado
sudo systemctl status wpa_supplicant

# Ver configuración WiFi
cat /etc/wpa_supplicant/wpa_supplicant.conf

# Reconfigurar WiFi
sudo raspi-config
# Opción: System Options > Wireless LAN
```

### Problema: Audio no funciona
```bash
# Verificar dispositivos
aplay -l

# Verificar grupos del usuario
groups
# Debe incluir: audio

# Agregar a grupo audio si falta
sudo usermod -a -G audio pi

# Verificar permisos
ls -l /dev/snd/
```

### Problema: Servicio no inicia
```bash
# Ver logs detallados
sudo journalctl -u vx200-controller.service -n 100

# Verificar errores en el código
cd ~/vx200RPTController
npm start  # Ejecutar manualmente para ver errores
```

### Problema: Direwolf no funciona
```bash
# Verificar instalación
which direwolf
direwolf -v

# Verificar puerto serie (si usas radio por serial)
ls -l /dev/ttyUSB*
ls -l /dev/ttyAMA*

# Agregar usuario a grupo dialout
sudo usermod -a -G dialout pi
```

## 11. Actualización del software

```bash
cd ~/vx200RPTController

# Detener servicio
sudo systemctl stop vx200-controller.service

# Actualizar código
git pull origin main

# Reinstalar dependencias (si es necesario)
npm install

# Reiniciar servicio
sudo systemctl start vx200-controller.service
```

## 12. Backup de configuración

```bash
# Backup del .env
cp ~/vx200RPTController/.env ~/vx200-backup-$(date +%Y%m%d).env

# Backup completo
tar -czf ~/vx200-backup-$(date +%Y%m%d).tar.gz ~/vx200RPTController/.env ~/vx200RPTController/logs/
```

## 13. Acceso remoto seguro

### Cambiar contraseña por defecto:
```bash
passwd
# Nueva contraseña más segura
```

### Configurar SSH con clave pública (recomendado):
```bash
# En tu PC local:
ssh-copy-id pi@vx200-controller.local

# Luego desactivar login por contraseña en:
sudo nano /etc/ssh/sshd_config
# PasswordAuthentication no
sudo systemctl restart ssh
```

## 14. MMDVM Hardware (uso futuro)

Tu MMDVM puede usarse para:

1. **Hotspot DMR/YSF/P25** con MMDVMHost standalone
2. **DAPNET pager** para mensajes de texto por radio
3. **AllStarLink** para interconexión de repetidoras
4. **POCSAG decoder** para decodificar pagers

Estos proyectos son compatibles y pueden coexistir con VX200 usando el mismo hardware MMDVM en diferentes modos.

---

## 📞 Soporte

Si tienes problemas, revisa:
1. Los logs: `sudo journalctl -u vx200-controller.service -f`
2. Estado del servicio: `sudo systemctl status vx200-controller.service`
3. Ejecución manual: `cd ~/vx200RPTController && npm start`

---

**¡Listo! Tu VX200 Controller debería estar funcionando.**
