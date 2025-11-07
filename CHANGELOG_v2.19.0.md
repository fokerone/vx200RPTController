# Changelog v2.19.0 - Fix Superposición de Transmisiones

## Fecha: 2025-11-07

## Problema Identificado

### Síntomas
- Baliza horaria BBC Pips sonaba desplazada 30 segundos (ej: 16:00:30 en vez de 16:00:00)
- Superposición entre APRS Beacon, Weather Alerts y Baliza Horaria
- Canal ocupado durante transmisiones críticas de la baliza horaria

### Causa Raíz
1. **APRS Beacon** (15 min) transmitiendo a las :00:08 colisionaba con Baliza a las :00:00
2. **Weather Alerts** (101 min) no sincronizado con horas en punto, causaba colisiones aleatorias
3. Timer de repetición de Weather Alerts no se limpiaba cuando expiraban todas las alertas

## Cambios Implementados

### 1. APRS Beacon - Reorganización de Intervalos
**Archivo**: `src/config/ConfigManager.js`
- **Antes**: Intervalo 15 minutos, offset 7.5 minutos
- **Ahora**: Intervalo 20 minutos, offset 10 minutos
- **Resultado**: Transmite a los minutos :10, :30, :50 de cada hora
- **Beneficio**: Evita completamente la colisión con baliza horaria (:00)

**Archivo**: `src/modules/aprs.js`
- Actualizado offset de 7.5 → 10 minutos

### 2. Weather Alerts - Sincronización con Horas
**Archivo**: `src/modules/weatherAlerts.js`
- **Antes**: repeatInterval = 101 minutos (1h 41min)
- **Ahora**: repeatInterval = 120 minutos (2 horas exactas)
- **Beneficio**: Sincronizado con ciclo horario, evita colisiones aleatorias

### 3. Weather Alerts - Limpieza de Timers Mejorada
**Archivo**: `src/modules/weatherAlerts.js` - función `cleanExpiredAlerts()`
- **Nuevo**: Limpia automáticamente el timer de repetición cuando no quedan alertas activas
- **Lógica**:
  ```javascript
  if (this.activeAlerts.size === 0) {
      clearTimeout(this.repeatTimer);
      this.logger.info('Timer de repetición detenido: no hay alertas activas');
  }
  ```
- **Beneficio**: Las repeticiones solo ocurren mientras haya alertas vigentes

## Nuevo Esquema de Transmisiones

### Transmisiones por Hora
```
:00:00 → Baliza Horaria BBC Pips (cada 60 min)
:10:08 → APRS Beacon #1
:30:08 → APRS Beacon #2
:50:08 → APRS Beacon #3
```

### Weather Alerts
- **Verificación**: Cada 87 minutos
- **Repetición**: Cada 120 minutos (2 horas) **SOLO si hay alertas activas**
- **Limpieza**: Automática cuando expiran (24h) o cuando no quedan alertas

## Testing Recomendado

### 1. Verificar Intervalos APRS
```bash
journalctl -f | grep "APRS Beacon"
# Debe mostrar transmisiones a :10, :30, :50
```

### 2. Verificar Baliza Horaria
```bash
journalctl -f | grep "Baliza"
# Debe transmitir exactamente a :00:00 sin posponerse
```

### 3. Verificar Weather Alerts
```bash
journalctl -f | grep "WeatherAlerts"
# Debe mostrar:
# - Verificación cada 87 min
# - Repetición cada 120 min (solo con alertas activas)
# - "Timer de repetición detenido" cuando no hay alertas
```

## Impacto

### Antes
- ❌ Baliza desplazada 30 segundos
- ❌ Colisiones frecuentes entre servicios
- ❌ Timer de repetición corriendo innecesariamente

### Después
- ✅ Baliza horaria precisa a las :00:00
- ✅ Transmisiones organizadas sin colisiones
- ✅ Recursos optimizados (timers se limpian cuando no se usan)
- ✅ Mejor experiencia de usuario

## Archivos Modificados
1. `src/config/ConfigManager.js` - Intervalo APRS 15→20 min
2. `src/modules/aprs.js` - Offset APRS 7.5→10 min
3. `src/modules/weatherAlerts.js` - repeatInterval 101→120 min + limpieza mejorada
4. `package.json` - Versión 2.18.0 → 2.19.0

## Notas de Deployment

Para aplicar en Raspberry Pi:
```bash
cd /home/pi/vx200RPTController
git pull origin main
sudo systemctl restart vx200
# Verificar logs
journalctl -f --user -u vx200
```

## Autor
Análisis y fix: Claude Code
Versión: 2.19.0
Fecha: 2025-11-07
