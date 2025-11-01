# Integración MMDVM/YSF con VX200 Controller

## Resumen

El VX200 Controller está integrado con un sistema MMDVM (Multi-Mode Digital Voice Modem) para capacidades YSF (System Fusion) y Wires-X, permitiendo conexión a reflectores digitales de Argentina y el mundo.

## Hardware

### MMDVM
- **Dispositivo**: MMDVM_HS_Hat con chip ADF7021
- **Ubicación**: Raspberry Pi (192.168.100.3)
- **Frecuencia**: 433.000 MHz
- **Offsets calibrados**: RX=8150 Hz, TX=8150 Hz

### Audio
- **Dispositivo USB**: Texas Instruments PCM2902 Audio Codec
- **ID USB**: 08bb:2902
- **ALSA Card**: hw:2,0
- **Configuración**: Automática mediante AUDIO_DEVICE=default

## Configuración MMDVM

### Archivo: `/etc/mmdvm/MMDVM.ini`

```ini
[Modem]
Port=/dev/ttyAMA0
Protocol=uart
RXOffset=8150
TXOffset=8150
```

## Configuración YSFGateway

### Archivo: `/etc/ysfgateway/YSFGateway.ini`

```ini
[General]
Callsign=LU5MCD
Suffix=RPT
Id=7225017
RptAddress=127.0.0.1
RptPort=3200
LocalAddress=127.0.0.1
LocalPort=4200

[Network]
Startup=AR-ARG-NETWORK
InactivityTimeout=10
Reconnect=0
Revert=1
```

### Reflector Argentina
- **Nombre**: AR-ARG-NETWORK
- **ID**: 07223
- **TG**: 7223

## Configuración Audio USB

### ALSA Configuration (`.asoundrc`)

```conf
pcm.!default {
    type asym
    playback.pcm {
        type plug
        slave.pcm "hw:2,0"
    }
    capture.pcm {
        type plug
        slave.pcm "hw:2,0"
    }
}

ctl.!default {
    type hw
    card 2
}
```

### Niveles de Audio
- **Speaker**: 80%
- **Mic Capture**: 69%

## VX200 Controller

### Configuración Automática

El VX200 Controller ya está configurado para usar el dispositivo de audio por defecto:

**`.env`**:
```bash
AUDIO_DEVICE=default
AUDIO_SAMPLE_RATE=48000
AUDIO_CHANNELS=1
AUDIO_BIT_DEPTH=16
```

**`config/config.json`**:
```json
"audio": {
  "sampleRate": 48000,
  "channels": 1,
  "bitDepth": 16,
  "device": "default"
}
```

Al usar `AUDIO_DEVICE=default`, el sistema automáticamente utiliza la placa USB configurada en ALSA sin necesidad de cambios en el código.

## Funcionalidad

### Wires-X
- Activación mediante radio compatible Yaesu
- Conexión automática a reflectores YSF
- Búsqueda y selección de rooms/reflectores

### Reflectores Disponibles
- 1278 reflectores cargados desde `register.ysfreflector.de`
- Incluye reflectores de Argentina, Brasil, y todo el mundo

## Verificación

### Estado YSFGateway
```bash
ssh pi@192.168.100.3
sudo systemctl status ysfgateway
```

### Logs en tiempo real
```bash
sudo journalctl -u ysfgateway -f
```

### Test Audio USB
```bash
# Reproducción
speaker-test -D default -c 1 -t wav

# Grabación
arecord -D default -f S16_LE -r 48000 -c 1 -d 5 test.wav
aplay test.wav
```

## Solución de Problemas

### Error "sendto, err: 22"
- **Causa**: Configuración incorrecta de YSFGateway.ini
- **Solución**: Verificar que RptAddress/RptPort estén en sección [General]

### Audio USB no funciona
- **Verificar detección**: `aplay -l`
- **Verificar config**: `cat ~/.asoundrc`
- **Reconfigurar**: `/home/pi/setup-usb-audio.sh`

### YSFGateway no conecta
- **Verificar reflector**: Debe existir en `/usr/local/etc/YSFHosts.txt`
- **Actualizar lista**:
  ```bash
  cd /usr/local/etc
  sudo wget -O YSFHosts.txt https://register.ysfreflector.de/export_csv.php
  ```

## Referencias

- [MMDVM Project](https://github.com/g4klx/MMDVM)
- [YSFClients](https://github.com/g4klx/YSFClients)
- [YSF Reflector List](https://register.ysfreflector.de)
- [Argentina Network TG 7223](http://www.qslnet.de/member/lu1ebm/)

## Historial

- **2025-11-01**: Configuración inicial MMDVM/YSF + Audio USB
  - Offsets calibrados: 8150 Hz
  - Conexión AR-ARG-NETWORK (TG 7223)
  - Audio USB Texas Instruments PCM2902
  - Wires-X operativo
