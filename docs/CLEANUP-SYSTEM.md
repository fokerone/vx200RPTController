# Sistema de Cleanup Automático VX200

Sistema diseñado para funcionamiento 24/7 sin interrupciones, con limpieza automática de archivos temporales.

## 🔄 Características Principales

### Cleanup Automático
- **Frecuencia**: Cada 6 horas
- **Archivos temporales**: Eliminados después de 2 horas
- **Archivos críticos**: Eliminados después de 24 horas  
- **Límite de espacio**: 100MB máximo en directorio temp

### Tipos de Archivos Limpiados
- `combined_*.mp3` - Audio combinado de TTS
- `temp_*.wav/mp3` - Archivos temporales de audio
- `tts_*.wav/mp3` - Archivos de Text-to-Speech
- `tone_*.wav` - Archivos de tonos generados
- `google_tts_*.mp3` - Audio de Google TTS
- `espeak_*.wav` - Audio de espeak
- `*.tmp` - Archivos temporales del sistema

## 📁 Directorios Monitoreados

```
vx200RPTController/
├── temp/                 # Directorio principal de temporales
├── sounds/temp/          # Temporales de audio (si existe)
├── /tmp/                 # Archivos del sistema (filtrado)
└── /var/tmp/            # Archivos del sistema (filtrado)
```

## ⚙️ Configuración

### En AudioManager
```javascript
this.cleanupConfig = {
    interval: 6 * 60 * 60 * 1000,  // 6 horas
    maxFileAge: 2 * 60 * 60 * 1000, // 2 horas  
    maxTempSize: 100 * 1024 * 1024  // 100MB
};
```

### Modificar Configuración
```javascript
// En src/audio/audioManager.js línea ~70
this.cleanupConfig.interval = 4 * 60 * 60 * 1000; // 4 horas
this.cleanupConfig.maxFileAge = 1 * 60 * 60 * 1000; // 1 hora
```

## 🛠️ Herramientas de Monitoreo

### Script de Monitoreo
```bash
# Ver estado actual
node scripts/cleanup-monitor.js status

# Limpiar manualmente
node scripts/cleanup-monitor.js clean

# Monitoreo continuo  
node scripts/cleanup-monitor.js watch

# Ayuda
node scripts/cleanup-monitor.js help
```

### API del Sistema
```javascript
// Obtener estadísticas
const stats = controller.audio.getTempSpaceStats();

// Forzar cleanup manual
await controller.forceCleanup();

// Estado de salud del sistema
const health = controller.getSystemHealth();
```

## 📊 Alertas y Monitoreo

### Niveles de Alerta
- **🟢 Normal**: < 50 archivos, < 50MB
- **🟡 Advertencia**: > 50 archivos o > 50MB  
- **🔴 Crítico**: > 100 archivos o > 100MB

### Logs del Sistema
```
[AudioManager] 🧹 Iniciando cleanup automático de archivos temporales...
[AudioManager] ✅ Cleanup completado: 15 archivos eliminados (2.3MB) en 45ms
[Controller] ✅ Cleanup inicial completado
```

## 🚨 Solución de Problemas

### Alto Uso de Espacio
```bash
# Verificar estado
node scripts/cleanup-monitor.js status

# Limpieza manual
node scripts/cleanup-monitor.js clean

# Verificar configuración
grep -n "cleanupConfig" src/audio/audioManager.js
```

### Archivos Bloqueados
```bash
# Ver procesos usando archivos
lsof /home/fokerone/vx200RPTController/temp/

# Reiniciar sistema si es necesario
sudo systemctl restart vx200-controller
```

### Desactivar Cleanup (NO RECOMENDADO)
```javascript
// En src/audio/audioManager.js constructor
// Comentar esta línea:
// this.startCleanupTimer();
```

## 📈 Optimizaciones para 24/7

### Funcionamiento Continuo
- Cleanup no bloquea operaciones principales
- Manejo robusto de errores
- Logs informativos pero no verbosos
- Configuración adaptable sin reinicio

### Prevención de Problemas
- Cleanup inicial al arranque
- Monitoreo proactivo de espacio
- Alertas configurables
- Fallbacks ante errores

### Rendimiento
- Operaciones asíncronas
- Timeouts configurables  
- Procesamiento por lotes
- Throttling de operaciones

## 🔧 Mantenimiento

### Verificaciones Regulares
```bash
# Estadísticas diarias
node scripts/cleanup-monitor.js status

# Log del sistema
tail -f logs/app.log | grep -i cleanup

# Uso de disco
df -h /home/fokerone/vx200RPTController/temp/
```

### Configuración Recomendada
- **Producción**: Cleanup cada 6h, archivos >2h
- **Desarrollo**: Cleanup cada 1h, archivos >30min
- **Debug**: Cleanup manual solamente

## 🎯 Beneficios

✅ **Previene acumulación** de archivos temporales  
✅ **Reduce uso de disco** automáticamente  
✅ **Mantiene rendimiento** del sistema  
✅ **Operación sin intervención** manual  
✅ **Monitoreo proactivo** de problemas  
✅ **Configuración flexible** por entorno  

---

**Sistema optimizado para funcionamiento 24/7 en repetidores VX200**