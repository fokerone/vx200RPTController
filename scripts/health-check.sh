#!/bin/bash

# Health check script para VX200
# Se puede usar con monitoreo externo o cron

set -e

# Configuración
VX200_HOST="localhost"
VX200_PORT="8080"
TIMEOUT="10"
LOG_FILE="/home/fokerone/vx200RPTController/logs/health-check.log"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Función de logging
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
    echo -e "$1"
}

# Verificar si el servicio systemd está activo
check_service() {
    if systemctl is-active --quiet vx200; then
        log "${GREEN}✅ Servicio systemd: ACTIVO${NC}"
        return 0
    else
        log "${RED}❌ Servicio systemd: INACTIVO${NC}"
        return 1
    fi
}

# Verificar puerto del dashboard
check_dashboard() {
    if timeout "$TIMEOUT" bash -c "</dev/tcp/$VX200_HOST/$VX200_PORT" 2>/dev/null; then
        log "${GREEN}✅ Dashboard: DISPONIBLE (puerto $VX200_PORT)${NC}"
        return 0
    else
        log "${RED}❌ Dashboard: NO DISPONIBLE (puerto $VX200_PORT)${NC}"
        return 1
    fi
}

# Verificar API health endpoint
check_api() {
    local response
    response=$(curl -s --max-time "$TIMEOUT" "http://$VX200_HOST:$VX200_PORT/api/health" 2>/dev/null || echo "ERROR")
    
    if [[ "$response" == "ERROR" ]]; then
        log "${RED}❌ API Health: NO RESPONDE${NC}"
        return 1
    elif echo "$response" | grep -q '"status":"ok"'; then
        log "${GREEN}✅ API Health: OK${NC}"
        return 0
    else
        log "${YELLOW}⚠️ API Health: RESPUESTA INVÁLIDA${NC}"
        return 1
    fi
}

# Verificar uso de memoria
check_memory() {
    local pid
    pid=$(pgrep -f "src/index.js" || echo "")
    
    if [[ -z "$pid" ]]; then
        log "${RED}❌ Proceso VX200: NO ENCONTRADO${NC}"
        return 1
    fi
    
    local mem_mb
    mem_mb=$(ps -p "$pid" -o rss= | awk '{print int($1/1024)}')
    
    if [[ "$mem_mb" -gt 1024 ]]; then
        log "${YELLOW}⚠️ Memoria: ${mem_mb}MB (ALTO)${NC}"
        return 1
    elif [[ "$mem_mb" -gt 512 ]]; then
        log "${YELLOW}⚠️ Memoria: ${mem_mb}MB (MODERADO)${NC}"
        return 0
    else
        log "${GREEN}✅ Memoria: ${mem_mb}MB (OK)${NC}"
        return 0
    fi
}

# Verificar archivos temporales
check_temp_files() {
    local temp_dir="/home/fokerone/vx200RPTController/temp"
    local file_count
    local size_mb
    
    if [[ ! -d "$temp_dir" ]]; then
        log "${YELLOW}⚠️ Directorio temp: NO EXISTE${NC}"
        return 0
    fi
    
    file_count=$(find "$temp_dir" -type f | wc -l)
    size_mb=$(du -sm "$temp_dir" 2>/dev/null | cut -f1 || echo "0")
    
    if [[ "$file_count" -gt 100 ]] || [[ "$size_mb" -gt 100 ]]; then
        log "${YELLOW}⚠️ Archivos temp: ${file_count} archivos, ${size_mb}MB (LIMPIAR)${NC}"
        return 1
    else
        log "${GREEN}✅ Archivos temp: ${file_count} archivos, ${size_mb}MB${NC}"
        return 0
    fi
}

# Verificar logs
check_logs() {
    local log_dir="/home/fokerone/vx200RPTController/logs"
    local recent_errors
    
    if [[ ! -d "$log_dir" ]]; then
        log "${YELLOW}⚠️ Directorio logs: NO EXISTE${NC}"
        return 0
    fi
    
    # Buscar errores en los últimos 5 minutos
    recent_errors=$(find "$log_dir" -name "*.log" -mmin -5 -exec grep -l "ERROR\|Error\|error" {} \; 2>/dev/null | wc -l)
    
    if [[ "$recent_errors" -gt 0 ]]; then
        log "${YELLOW}⚠️ Logs: ${recent_errors} archivos con errores recientes${NC}"
        return 1
    else
        log "${GREEN}✅ Logs: Sin errores recientes${NC}"
        return 0
    fi
}

# Función principal
main() {
    local overall_status=0
    
    log "=== VX200 Health Check ==="
    
    # Ejecutar todas las verificaciones
    check_service || overall_status=1
    check_dashboard || overall_status=1
    check_api || overall_status=1
    check_memory || overall_status=1
    check_temp_files || overall_status=1
    check_logs || overall_status=1
    
    # Resultado final
    if [[ "$overall_status" -eq 0 ]]; then
        log "${GREEN}✅ ESTADO GENERAL: SALUDABLE${NC}"
        exit 0
    else
        log "${YELLOW}⚠️ ESTADO GENERAL: REQUIERE ATENCIÓN${NC}"
        exit 1
    fi
}

# Crear directorio de logs si no existe
mkdir -p "$(dirname "$LOG_FILE")"

# Ejecutar solo si se llama directamente (no source)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi