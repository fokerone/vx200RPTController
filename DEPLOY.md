# VX200 Production Deployment Guide

## Sistema Integrado de Repetidora con Dashboard

Este sistema combina el controlador VX200 con un dashboard moderno en Next.js 14, optimizado para operación 24/7.

## Instalación Rápida

```bash
# 1. Construir dashboard
npm run build:dashboard

# 2. Instalar como servicio systemd
sudo ./scripts/install-service.sh

# 3. Iniciar servicio
sudo systemctl start vx200

# 4. Ver estado
sudo systemctl status vx200
```

## Acceso al Dashboard

- **URL**: http://localhost:8080
- **Puerto**: 8080 (configurable en .env.production)
- **Autostart**: Se inicia automáticamente con el servicio VX200

## Monitoreo y Mantenimiento

### Health Check Manual
```bash
./scripts/health-check.sh
```

### Logs del Sistema
```bash
# Logs en tiempo real
sudo journalctl -u vx200 -f

# Logs de health check
tail -f logs/health-check.log
```

### Comandos de Servicio
```bash
sudo systemctl start vx200     # Iniciar
sudo systemctl stop vx200      # Detener
sudo systemctl restart vx200   # Reiniciar
sudo systemctl enable vx200    # Auto-inicio
sudo systemctl disable vx200   # Desactivar auto-inicio
```

## Configuración de Producción

### Variables de Entorno (.env.production)
- `DASHBOARD_PORT=8080` - Puerto del dashboard
- `LOG_LEVEL=info` - Nivel de logging
- `MAX_OLD_SPACE_SIZE=512` - Límite de memoria Node.js
- `TEMP_CLEANUP_INTERVAL=3600000` - Limpieza automática (1 hora)

### Límites de Recursos (systemd)
- **Memoria**: 512MB normal, 1GB máximo
- **CPU**: Peso 100 (normal)
- **Archivos**: 65536 descriptores máximo

## Arquitectura del Sistema

```
VX200Controller (main)
├── DashboardServer (puerto 8080)
│   ├── WebSocket API (tiempo real)
│   ├── REST API (/api/*)
│   └── Dashboard estático (Next.js)
├── APRS Module
├── Weather Alerts
├── Audio Controller
└── DTMF Detector
```

## Funcionalidades del Dashboard

- **Estado en tiempo real** del sistema VX200
- **Logs en vivo** con filtros automáticos
- **Panel de alertas** meteorológicas
- **Control de módulos** (inicio/parada)
- **Monitoreo de recursos** (CPU, memoria, temperatura)
- **Interfaz responsive** optimizada para móviles

## Troubleshooting

### Dashboard no carga
```bash
# Verificar servicio
sudo systemctl status vx200

# Verificar puerto
ss -tlnp | grep 8080

# Reconstruir dashboard
npm run build:dashboard
sudo systemctl restart vx200
```

### Problemas de audio
```bash
# Verificar grupo audio
groups fokerone

# Agregar a grupo si falta
sudo usermod -a -G audio fokerone
```

### Memoria alta
```bash
# Ver uso actual
./scripts/health-check.sh

# Configurar límites más bajos en systemd/vx200.service
sudo systemctl edit vx200
```

## Actualizaciones

### Actualizar Dashboard
```bash
# Reconstruir
npm run build:dashboard

# Reiniciar servicio
sudo systemctl restart vx200
```

### Actualizar Sistema Completo
```bash
git pull
npm install
npm run build:dashboard
sudo systemctl restart vx200
```

## Seguridad

El servicio systemd incluye hardening de seguridad:
- `NoNewPrivileges=true`
- `ProtectSystem=strict`
- `ProtectHome=true`
- `PrivateTmp=true`
- Acceso limitado solo a directorios necesarios

## Respaldo

### Archivos importantes a respaldar:
- `logs/` - Logs del sistema
- `temp/` - Archivos temporales (opcional)
- `.env.production` - Configuración
- `systemd/vx200.service` - Configuración del servicio

### Script de respaldo automático:
```bash
#!/bin/bash
tar -czf "vx200-backup-$(date +%Y%m%d).tar.gz" \
  logs/ .env.production systemd/ --exclude='temp/*'
```