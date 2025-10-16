#!/bin/bash
################################################################################
# Script de instalación automatizada de VX200 Controller en Raspberry Pi 3B
# Desde Arch Linux usando herramientas de línea de comandos
################################################################################

set -e  # Detener en cualquier error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuración
SD_DEVICE="/dev/sdc"
TEMP_DIR="/tmp/raspi-setup"
MOUNT_BOOT="$TEMP_DIR/boot"
MOUNT_ROOT="$TEMP_DIR/root"
WIFI_SSID="YOSHUA"
WIFI_PASS="over2+Kein+"
PI_PASSWORD="cegarcomp"

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  VX200 Controller - Instalación Automatizada en Raspberry Pi${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"

# Función de ayuda
function print_step() {
    echo -e "\n${GREEN}[PASO $1]${NC} $2"
}

function print_warning() {
    echo -e "${YELLOW}⚠ ADVERTENCIA:${NC} $1"
}

function print_error() {
    echo -e "${RED}✗ ERROR:${NC} $1"
}

function print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Verificar que se ejecuta como root o con sudo
if [ "$EUID" -ne 0 ]; then
    print_error "Este script debe ejecutarse con sudo"
    exit 1
fi

# Verificar que el dispositivo SD existe
if [ ! -b "$SD_DEVICE" ]; then
    print_error "El dispositivo $SD_DEVICE no existe"
    exit 1
fi

# Mostrar información de la SD
print_warning "Se va a FORMATEAR COMPLETAMENTE el dispositivo $SD_DEVICE"
lsblk -p $SD_DEVICE
echo ""
read -p "¿Estás seguro que quieres continuar? (escribe 'SI' para confirmar): " CONFIRM

if [ "$CONFIRM" != "SI" ]; then
    echo "Operación cancelada."
    exit 0
fi

################################################################################
# PASO 1: Descargar Raspberry Pi OS Lite
################################################################################
print_step "1" "Descargando Raspberry Pi OS Lite (64-bit)"

mkdir -p "$TEMP_DIR"
cd "$TEMP_DIR"

# URL de la imagen más reciente (Bookworm)
IMAGE_URL="https://downloads.raspberrypi.com/raspios_lite_arm64/images/raspios_lite_arm64-2024-11-19/2024-11-19-raspios-bookworm-arm64-lite.img.xz"
IMAGE_FILE="raspios-lite.img.xz"
IMAGE_EXTRACTED="raspios-lite.img"

if [ ! -f "$IMAGE_FILE" ]; then
    print_warning "Descargando imagen (~500MB), esto puede tomar varios minutos..."
    curl -L -o "$IMAGE_FILE" "$IMAGE_URL" || wget -O "$IMAGE_FILE" "$IMAGE_URL"
    print_success "Imagen descargada"
else
    print_success "Imagen ya descargada previamente"
fi

################################################################################
# PASO 2: Descomprimir imagen
################################################################################
print_step "2" "Descomprimiendo imagen"

if [ ! -f "$IMAGE_EXTRACTED" ]; then
    xz -d -k "$IMAGE_FILE"
    # Renombrar al nombre esperado
    mv *.img "$IMAGE_EXTRACTED" 2>/dev/null || true
    print_success "Imagen descomprimida"
else
    print_success "Imagen ya descomprimida"
fi

################################################################################
# PASO 3: Desmontar particiones de la SD si están montadas
################################################################################
print_step "3" "Desmontando particiones existentes"

umount ${SD_DEVICE}* 2>/dev/null || true
print_success "Particiones desmontadas"

################################################################################
# PASO 4: Escribir imagen a la SD
################################################################################
print_step "4" "Escribiendo imagen a la SD card (esto tomará varios minutos)"

print_warning "NO REMOVER LA SD DURANTE ESTE PROCESO"
dd if="$IMAGE_EXTRACTED" of="$SD_DEVICE" bs=4M status=progress conv=fsync
sync
print_success "Imagen escrita exitosamente"

# Recargar tabla de particiones
partprobe "$SD_DEVICE" 2>/dev/null || true
sleep 2

################################################################################
# PASO 5: Montar particiones para configuración
################################################################################
print_step "5" "Montando particiones para configuración headless"

mkdir -p "$MOUNT_BOOT" "$MOUNT_ROOT"

# Detectar las particiones (pueden ser sdc1 y sdc2)
BOOT_PARTITION="${SD_DEVICE}1"
ROOT_PARTITION="${SD_DEVICE}2"

mount "$BOOT_PARTITION" "$MOUNT_BOOT"
mount "$ROOT_PARTITION" "$MOUNT_ROOT"
print_success "Particiones montadas"

################################################################################
# PASO 6: Habilitar SSH
################################################################################
print_step "6" "Habilitando SSH"

touch "$MOUNT_BOOT/ssh"
print_success "SSH habilitado"

################################################################################
# PASO 7: Configurar WiFi
################################################################################
print_step "7" "Configurando WiFi para SSID: $WIFI_SSID"

cat > "$MOUNT_BOOT/wpa_supplicant.conf" <<EOF
country=AR
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1

network={
    ssid="$WIFI_SSID"
    psk="$WIFI_PASS"
    key_mgmt=WPA-PSK
}
EOF

print_success "WiFi configurado"

################################################################################
# PASO 8: Configurar usuario pi con contraseña
################################################################################
print_step "8" "Configurando usuario pi con contraseña: $PI_PASSWORD"

# Generar hash de contraseña
PASSWORD_HASH=$(echo "$PI_PASSWORD" | openssl passwd -6 -stdin)

# Crear archivo userconf en boot (nuevo método desde Bullseye)
echo "pi:$PASSWORD_HASH" > "$MOUNT_BOOT/userconf.txt"
print_success "Usuario pi configurado"

################################################################################
# PASO 9: Configurar hostname
################################################################################
print_step "9" "Configurando hostname: vx200-controller"

echo "vx200-controller" > "$MOUNT_ROOT/etc/hostname"

# Actualizar /etc/hosts
sed -i 's/raspberrypi/vx200-controller/g' "$MOUNT_ROOT/etc/hosts"
print_success "Hostname configurado"

################################################################################
# PASO 10: Crear script de instalación de VX200 en la Raspberry Pi
################################################################################
print_step "10" "Creando script de instalación de VX200"

cat > "$MOUNT_ROOT/home/pi/install-vx200.sh" <<'EOFSCRIPT'
#!/bin/bash
################################################################################
# Script de instalación de VX200 Controller
# Se ejecutará en la Raspberry Pi después del primer arranque
################################################################################

set -e

echo "═══════════════════════════════════════════════════════════"
echo "  Instalando VX200 Controller en Raspberry Pi 3B"
echo "═══════════════════════════════════════════════════════════"

# 1. Actualizar sistema
echo "[1/7] Actualizando sistema..."
sudo apt-get update
sudo apt-get upgrade -y

# 2. Instalar Node.js 18.x
echo "[2/7] Instalando Node.js 18.x..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Instalar dependencias del sistema
echo "[3/7] Instalando dependencias del sistema..."
sudo apt-get install -y \
    git \
    build-essential \
    cmake \
    libasound2-dev \
    espeak \
    sox \
    libsox-fmt-all \
    alsa-utils \
    pulseaudio \
    ffmpeg \
    wget \
    curl

# 4. Compilar e instalar Direwolf
echo "[4/7] Compilando e instalando Direwolf..."
cd ~
if [ ! -d "direwolf" ]; then
    git clone https://github.com/wb2osz/direwolf.git
fi
cd direwolf
git checkout 1.7
mkdir -p build && cd build
cmake ..
make -j4
sudo make install
make install-conf
cd ~

# 5. Clonar repositorio VX200
echo "[5/7] Clonando VX200 Controller..."
cd ~
if [ ! -d "vx200RPTController" ]; then
    git clone https://github.com/tu-usuario/vx200RPTController.git
fi
cd vx200RPTController

# 6. Instalar dependencias de Node.js
echo "[6/7] Instalando dependencias de Node.js..."
npm install --production

# 7. Configurar archivo .env
echo "[7/7] Configurando archivo .env..."
if [ ! -f ".env" ]; then
    cat > .env <<'ENVEOF'
# Configuración de Audio
AUDIO_DEVICE=plughw:0,0
AUDIO_SAMPLE_RATE=48000

# Configuración de TTS
TTS_ENGINE=hybrid
TTS_VOICE=es-la
TTS_SPEED=1.0
TTS_PITCH=50

# Roger Beep
ROGER_BEEP_ENABLED=true
ROGER_BEEP_FREQUENCY=1000
ROGER_BEEP_DURATION=100

# APRS
APRS_CALLSIGN=TU-CALL
APRS_SSID=1
APRS_PASSCODE=12345
APRS_LATITUDE=-32.8895
APRS_LONGITUDE=-68.8458
APRS_ALTITUDE=750
APRS_COMMENT=VX200 Repeater Controller
APRS_SYMBOL=/r
APRS_BEACON_INTERVAL=1800000

# APIs (opcional)
OPENWEATHER_API_KEY=
SMN_ENABLED=true

# INPRES (Sismos)
INPRES_ENABLED=true
INPRES_MIN_MAGNITUDE=4.0
INPRES_CHECK_INTERVAL=300000

# Debug
DEBUG=false
LOG_LEVEL=info
ENVEOF
    echo "IMPORTANTE: Edita el archivo .env con tus datos (callsign, ubicación, etc.)"
fi

# 8. Crear servicio systemd
echo "Creando servicio systemd..."
sudo tee /etc/systemd/system/vx200-controller.service > /dev/null <<'SERVICEEOF'
[Unit]
Description=VX200 RPT Controller
Documentation=https://github.com/tu-usuario/vx200RPTController
After=network-online.target sound.target
Wants=network-online.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=/home/pi/vx200RPTController
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=vx200-controller

# Límites de recursos para Pi 3B
MemoryLimit=512M
CPUQuota=80%

[Install]
WantedBy=multi-user.target
SERVICEEOF

# 9. Habilitar servicio (pero no iniciarlo aún)
echo "Habilitando servicio (NO se iniciará automáticamente hasta que configures .env)..."
sudo systemctl daemon-reload
sudo systemctl enable vx200-controller.service

# 10. Configurar audio
echo "Configurando audio..."
# Asegurar que ALSA está habilitado
sudo usermod -a -G audio pi

# Crear configuración básica de ALSA
cat > ~/.asoundrc <<'ASOUNDEOF'
pcm.!default {
    type plug
    slave.pcm "hw:0,0"
}

ctl.!default {
    type hw
    card 0
}
ASOUNDEOF

echo "═══════════════════════════════════════════════════════════"
echo "  ✓ Instalación completada exitosamente"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "PRÓXIMOS PASOS:"
echo "1. Edita el archivo .env con tus datos:"
echo "   nano ~/vx200RPTController/.env"
echo ""
echo "2. Verifica tu dispositivo de audio:"
echo "   aplay -l"
echo ""
echo "3. Inicia el servicio:"
echo "   sudo systemctl start vx200-controller.service"
echo ""
echo "4. Verifica el estado:"
echo "   sudo systemctl status vx200-controller.service"
echo ""
echo "5. Ve los logs en tiempo real:"
echo "   sudo journalctl -u vx200-controller.service -f"
echo ""
echo "La Raspberry Pi se reiniciará en 10 segundos..."
sleep 10
sudo reboot
EOFSCRIPT

chmod +x "$MOUNT_ROOT/home/pi/install-vx200.sh"
chown 1000:1000 "$MOUNT_ROOT/home/pi/install-vx200.sh"
print_success "Script de instalación creado"

################################################################################
# PASO 11: Desmontar particiones
################################################################################
print_step "11" "Desmontando particiones"

sync
umount "$MOUNT_BOOT"
umount "$MOUNT_ROOT"
print_success "Particiones desmontadas"

################################################################################
# FINALIZACIÓN
################################################################################
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ SD Card preparada exitosamente${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}PRÓXIMOS PASOS:${NC}"
echo ""
echo "1. Retira la SD card de forma segura:"
echo "   eject $SD_DEVICE"
echo ""
echo "2. Inserta la SD card en tu Raspberry Pi 3B"
echo ""
echo "3. Conecta alimentación y espera ~2 minutos al primer arranque"
echo ""
echo "4. Encuentra la IP de tu Raspberry Pi:"
echo "   - Revisa tu router en http://192.168.1.1"
echo "   - O usa: sudo nmap -sn 192.168.1.0/24 | grep vx200"
echo "   - O prueba: ping vx200-controller.local"
echo ""
echo "5. Conéctate por SSH:"
echo "   ssh pi@vx200-controller.local"
echo "   Contraseña: $PI_PASSWORD"
echo ""
echo "6. Una vez conectado, ejecuta el script de instalación:"
echo "   cd ~"
echo "   ./install-vx200.sh"
echo ""
echo "7. El script instalará todo automáticamente y reiniciará"
echo ""
echo -e "${YELLOW}IMPORTANTE:${NC}"
echo "- La primera conexión WiFi puede tardar 1-2 minutos"
echo "- Si no encuentras la Raspberry Pi, revisa las luces LED"
echo "- LED rojo fijo = alimentación OK"
echo "- LED verde parpadeando = actividad de SD"
echo ""

# Limpiar
rm -rf "$TEMP_DIR"

echo -e "${GREEN}¡Listo para usar!${NC}"
