#!/bin/bash

# Script para instalar VX200 como servicio systemd

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(dirname "$0")/.."
SERVICE_FILE="vx200.service"
SYSTEMD_DIR="/etc/systemd/system"

echo -e "${BLUE}🚀 Instalando VX200 como servicio systemd...${NC}"

# Verificar que se ejecuta como root o con sudo
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Este script debe ejecutarse como root o con sudo${NC}"
    echo "Uso: sudo ./scripts/install-service.sh"
    exit 1
fi

# Verificar que el archivo de servicio existe
if [ ! -f "$PROJECT_ROOT/systemd/$SERVICE_FILE" ]; then
    echo -e "${RED}❌ Archivo de servicio no encontrado: $PROJECT_ROOT/systemd/$SERVICE_FILE${NC}"
    exit 1
fi

# Detener servicio si está ejecutándose
if systemctl is-active --quiet vx200; then
    echo -e "${YELLOW}⏹️ Deteniendo servicio VX200 existente...${NC}"
    systemctl stop vx200
fi

# Copiar archivo de servicio
echo -e "${BLUE}📄 Instalando archivo de servicio...${NC}"
cp "$PROJECT_ROOT/systemd/$SERVICE_FILE" "$SYSTEMD_DIR/"

# Recargar systemd
echo -e "${BLUE}🔄 Recargando systemd daemon...${NC}"
systemctl daemon-reload

# Habilitar el servicio
echo -e "${BLUE}✅ Habilitando servicio VX200...${NC}"
systemctl enable vx200

# Verificar usuario y permisos
USER_HOME="/home/fokerone"
if [ ! -d "$USER_HOME" ]; then
    echo -e "${RED}❌ Usuario 'fokerone' no encontrado${NC}"
    exit 1
fi

# Agregar usuario al grupo audio si no está
if ! groups fokerone | grep -q audio; then
    echo -e "${YELLOW}🔊 Agregando usuario fokerone al grupo audio...${NC}"
    usermod -a -G audio fokerone
fi

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js no está instalado${NC}"
    exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}✅ Node.js detectado: ${NODE_VERSION}${NC}"

# Build del dashboard
echo -e "${BLUE}🏗️ Construyendo dashboard...${NC}"
cd "$PROJECT_ROOT"
sudo -u fokerone bash -c "npm run build:dashboard"

echo -e "${GREEN}✅ Servicio VX200 instalado correctamente!${NC}"
echo ""
echo -e "${BLUE}📋 Comandos útiles:${NC}"
echo "  sudo systemctl start vx200     # Iniciar servicio"
echo "  sudo systemctl stop vx200      # Detener servicio"
echo "  sudo systemctl restart vx200   # Reiniciar servicio"
echo "  sudo systemctl status vx200    # Ver estado"
echo "  sudo journalctl -u vx200 -f    # Ver logs en tiempo real"
echo "  sudo systemctl disable vx200   # Deshabilitar auto-inicio"
echo ""
echo -e "${GREEN}🌐 Dashboard estará disponible en: http://localhost:8080${NC}"
echo -e "${YELLOW}⚠️ Para iniciar automáticamente al arrancar, ejecute: sudo systemctl start vx200${NC}"

exit 0