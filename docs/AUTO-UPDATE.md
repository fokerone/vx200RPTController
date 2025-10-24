# 🔄 Sistema de Auto-Actualización VX200

## Descripción

El sistema de auto-actualización permite que el VX200 RPT Controller se mantenga actualizado automáticamente descargando e instalando nuevas versiones desde GitHub releases.

## Características

### 🔒 Seguridad
- ✅ Verificación SHA256 de archivos descargados
- ✅ Validación de integridad antes de instalar
- ✅ Backup automático antes de cada actualización
- ✅ Rollback automático en caso de fallo
- ✅ Validación post-instalación

### 📊 Monitoreo
- ✅ Verificación periódica de nuevas releases
- ✅ Notificaciones en display OLED
- ✅ Logs detallados de todo el proceso
- ✅ Eventos para integración externa

### 🎯 A Prueba de Fallos
- ✅ Sistema de backup/restore completo
- ✅ Rollback automático si falla instalación
- ✅ Validación de versión post-update
- ✅ Reinicio automático del servicio

## Configuración

### Variables de Entorno (.env)

```bash
# Habilitar auto-update
AUTO_UPDATE_ENABLED=true

# Auto-instalar sin confirmación (usar con precaución)
AUTO_UPDATE_AUTO_INSTALL=false

# Intervalo de verificación en milisegundos (6 horas por defecto)
AUTO_UPDATE_INTERVAL=21600000

# Canal de releases: stable, beta, all
AUTO_UPDATE_CHANNEL=stable
```

### Configuración Recomendada

#### Desarrollo
```bash
AUTO_UPDATE_ENABLED=false
AUTO_UPDATE_AUTO_INSTALL=false
AUTO_UPDATE_CHANNEL=beta
```

#### Producción (Operación Desatendida)
```bash
AUTO_UPDATE_ENABLED=true
AUTO_UPDATE_AUTO_INSTALL=true
AUTO_UPDATE_INTERVAL=21600000  # 6 horas
AUTO_UPDATE_CHANNEL=stable
```

#### Producción (Manual)
```bash
AUTO_UPDATE_ENABLED=true
AUTO_UPDATE_AUTO_INSTALL=false  # Solo notifica, no instala
AUTO_UPDATE_INTERVAL=43200000   # 12 horas
AUTO_UPDATE_CHANNEL=stable
```

## Uso

### Verificación Manual

```javascript
const vx200 = require('./src/index');
const controller = new vx200();

// Forzar verificación de actualizaciones
await controller.modules.autoUpdater.forceCheck();

// Obtener estado
const status = controller.modules.autoUpdater.getStatus();
console.log(status);
```

### Instalación Manual

```javascript
// Si hay una actualización disponible, instalarla
if (controller.modules.autoUpdater.updateStatus.available) {
    await controller.modules.autoUpdater.forceInstall();
}
```

### DTMF Command (Futuro)

Se planea agregar comando DTMF para verificar/instalar updates:
- `*9` - Verificar actualizaciones
- `*91` - Instalar actualización disponible

## Proceso de Actualización

### 1. Verificación
```
[AutoUpdater] Verificando actualizaciones en GitHub...
[AutoUpdater] Nueva versión disponible: v2.12.0 (actual: v2.11.0)
[OLED] Mostrando: "Update: v2.12.0"
```

### 2. Descarga
```
[AutoUpdater] Descargando vx200-v2.12.0.tar.gz (2.5 MB)...
[AutoUpdater] Descarga: 10%... 20%... 100%
[AutoUpdater] Descarga completada
[OLED] Mostrando: "Descargando v2.12.0..."
```

### 3. Verificación de Integridad
```
[AutoUpdater] Verificando integridad del archivo...
[AutoUpdater] SHA256 esperado: a1b2c3d4...
[AutoUpdater] SHA256 obtenido: a1b2c3d4...
[AutoUpdater] ✓ Verificación de integridad exitosa
```

### 4. Backup
```
[AutoUpdater] Creando backup del sistema actual...
[AutoUpdater] Backup creado: /tmp/vx200_backup_2025-10-24.tar.gz
```

### 5. Instalación
```
[AutoUpdater] Instalando actualización...
[AutoUpdater] Extrayendo archivos...
[AutoUpdater] Instalando dependencias...
[OLED] Mostrando: "Instalando update..."
```

### 6. Validación
```
[AutoUpdater] Validando instalación...
[AutoUpdater] Versión actual: v2.12.0
[AutoUpdater] ✓ Validación exitosa
[OLED] Mostrando: "Update OK: v2.12.0"
```

### 7. Reinicio
```
[AutoUpdater] Reiniciando servicio en 10 segundos...
[AutoUpdater] Servicio reiniciado
```

## Rollback en Caso de Fallo

Si algo falla durante la instalación:

```
[AutoUpdater] Error en actualización: Validación falló
[AutoUpdater] Iniciando rollback...
[AutoUpdater] Restaurando desde: /tmp/vx200_backup_2025-10-24.tar.gz
[AutoUpdater] Rollback completado
[OLED] Mostrando: "Rollback OK"
```

## Estructura de Releases en GitHub

### Nombre del Release
```
v2.12.0
```

### Assets Requeridos

1. **Archivo Principal** (requerido)
   - `vx200-v2.12.0.tar.gz` o `vx200-v2.12.0.zip`
   - Contiene todos los archivos del proyecto

2. **Checksum** (opcional pero recomendado)
   - `vx200-v2.12.0.tar.gz.sha256`
   - Contiene el hash SHA256 del archivo principal

### Ejemplo de Release Notes

```markdown
## VX200 RPT Controller v2.12.0

### Nuevas Funcionalidades
- Sistema de auto-actualización
- Mejoras en OLED display

### Correcciones
- Fix en stats APRS
- Optimización Direwolf

### Checksum
SHA256: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

## Eventos del AutoUpdater

El módulo emite los siguientes eventos:

```javascript
autoUpdater.on('check_started', () => {
    console.log('Verificación iniciada');
});

autoUpdater.on('update_available', (data) => {
    console.log(`Nueva versión: ${data.latest}`);
});

autoUpdater.on('up_to_date', (data) => {
    console.log(`Ya estás actualizado: ${data.version}`);
});

autoUpdater.on('download_started', (release) => {
    console.log(`Descargando ${release.tag_name}`);
});

autoUpdater.on('download_progress', (progress) => {
    console.log(`Progreso: ${progress}%`);
});

autoUpdater.on('update_completed', (data) => {
    console.log(`Actualización exitosa: ${data.version}`);
});

autoUpdater.on('update_error', (error) => {
    console.error(`Error: ${error.message}`);
});

autoUpdater.on('check_error', (error) => {
    console.error(`Error verificando: ${error.message}`);
});
```

## Estado del AutoUpdater

```javascript
const status = autoUpdater.getStatus();

console.log(status);
/*
{
    checking: false,
    downloading: false,
    installing: false,
    available: true,
    currentVersion: 'v2.11.0',
    latestVersion: 'v2.12.0',
    latestRelease: {...},
    downloadProgress: 0,
    lastCheck: 2025-10-24T14:30:00.000Z,
    lastUpdate: null,
    config: {
        enabled: true,
        autoInstall: false,
        channel: 'stable',
        checkInterval: 21600000
    }
}
*/
```

## Logs

Todos los logs del auto-updater se registran con el prefijo `[AutoUpdater]`:

```bash
# Ver logs del auto-updater
journalctl -u vx200-controller | grep AutoUpdater

# Ver solo verificaciones
journalctl -u vx200-controller | grep "Verificando actualizaciones"

# Ver solo instalaciones
journalctl -u vx200-controller | grep "Instalando actualización"
```

## Seguridad

### Backups
Los backups se crean en `/tmp/vx200_backup_<timestamp>.tar.gz` y excluyen:
- `node_modules/`
- `logs/`
- `temp/`
- `.git/`

### Permisos
El servicio debe tener permisos para:
- Descargar archivos a `/tmp/`
- Crear backups en `/tmp/`
- Sobrescribir archivos en el directorio del proyecto
- Reiniciar el servicio systemd (requiere configuración en `/etc/sudoers`)

### Configuración de sudoers

Para permitir reinicio automático sin contraseña:

```bash
# Editar sudoers
sudo visudo

# Agregar línea:
pi ALL=(ALL) NOPASSWD: /bin/systemctl restart vx200-controller
```

## Troubleshooting

### Update No Detectado

**Problema**: No detecta nuevas versiones
**Solución**:
1. Verificar que `AUTO_UPDATE_ENABLED=true`
2. Verificar conectividad a GitHub
3. Verificar formato del release tag (debe ser `v2.12.0`)
4. Revisar logs: `journalctl -u vx200-controller | grep AutoUpdater`

### Error de Verificación SHA256

**Problema**: Falla verificación de integridad
**Solución**:
1. Verificar que el archivo `.sha256` esté en el release
2. Verificar que el hash coincida con el archivo
3. Revisar que no haya corrupción en la descarga

### Rollback Falló

**Problema**: Rollback no funciona
**Solución**:
1. Verificar que existe backup en `/tmp/`
2. Restaurar manualmente: `tar -xzf /tmp/vx200_backup_*.tar.gz -C /path/to/vx200`
3. Reiniciar servicio: `sudo systemctl restart vx200-controller`

### Servicio No Reinicia

**Problema**: Servicio no se reinicia automáticamente
**Solución**:
1. Configurar sudoers (ver sección Seguridad)
2. Reiniciar manualmente: `sudo systemctl restart vx200-controller`

## Mejoras Futuras

- [ ] Soporte para múltiples canales (alpha, beta, stable)
- [ ] Firma digital de releases
- [ ] Programación de ventanas de mantenimiento
- [ ] Notificaciones por Telegram/Email
- [ ] Dashboard web para gestión de updates
- [ ] Comando DTMF para updates
- [ ] Retención configurable de backups

## Licencia

MIT License - Ver LICENSE file para detalles
