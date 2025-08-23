# 🌐 Configuración DNS Dinámico (DDNS) - DuckDNS

El sistema VX200 incluye soporte completo para DNS dinámico usando **DuckDNS**, un servicio gratuito que permite acceder al mapa APRS con un nombre de dominio fijo incluso si la IP pública cambia.

## 📋 ¿Por qué usar DDNS?

**Problema**: Las IPs públicas domésticas pueden cambiar, rompiendo el acceso externo al mapa APRS.

**Solución**: DDNS actualiza automáticamente un dominio (ej: `vx200-yoshua.duckdns.org`) para que siempre apunte a tu IP actual.

## 🚀 Configuración Paso a Paso

### 1. Crear Cuenta en DuckDNS

1. **Ir a**: https://www.duckdns.org
2. **Login con**:
   - Google
   - GitHub  
   - Twitter
3. **Es completamente gratuito**

### 2. Crear Dominio

1. En el dashboard, verás un campo **"Sub Domain"**
2. Escoge un nombre (ej: `vx200-yoshua`)
3. Haz clic en **"Add Domain"**
4. Tu dominio será: `vx200-yoshua.duckdns.org`

### 3. Obtener Token

1. En la parte superior derecha verás tu **token personal**
2. Es una cadena como: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
3. **¡Guárdalo de forma segura!**

### 4. Configurar VX200

Edita el archivo `.env`:

```bash
# DuckDNS settings
DUCKDNS_DOMAIN=vx200-yoshua
DUCKDNS_TOKEN=a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### 5. Reiniciar Sistema

```bash
# Reiniciar VX200
npm start
```

Deberías ver en los logs:
```
[INFO] [DDNS] DDNS inicializado para dominio: vx200-yoshua.duckdns.org
[INFO] [DDNS] 🌐 DDNS actualizado: vx200-yoshua.duckdns.org → 186.122.0.125
[INFO] [DDNS] Actualización automática DDNS programada cada 5 minutos
```

## 🛡️ Características de Seguridad

### ✅ **Múltiples Servicios IP**
El sistema usa 4 servicios diferentes para obtener la IP pública:
- `https://ifconfig.me/ip`
- `https://api.ipify.org`
- `https://ipinfo.io/ip` 
- `https://checkip.amazonaws.com`

### ✅ **Rate Limiting Inteligente**
- Solo actualiza cuando la IP cambia realmente
- Actualización cada 5 minutos (configurable)
- Logs detallados de todos los cambios

### ✅ **Manejo de Errores Robusto**
- Reintentos automáticos con diferentes servicios
- Logging detallado de problemas
- No bloquea el sistema si DDNS falla

## 🔧 Configuración Avanzada

### Cambiar Intervalo de Actualización

En `src/modules/ddns.js`, línea 13:
```javascript
this.updateInterval = 5 * 60 * 1000; // 5 minutos
```

### Usar Otro Servicio DDNS

El módulo está diseñado para DuckDNS, pero puede adaptarse fácilmente a:
- No-IP
- Dynu
- FreeDNS
- Otros servicios con API HTTP

## 🌍 Acceso desde Internet

Una vez configurado DDNS:

1. **URL Local**: `http://192.168.100.34:3000`
2. **URL Internet**: `http://vx200-yoshua.duckdns.org:3000`

### Port Forwarding Requerido

En tu router, configura:
- **Puerto externo**: 3000
- **IP interna**: 192.168.100.34  
- **Puerto interno**: 3000
- **Protocolo**: TCP

## 📊 Monitoreo

### Logs de DDNS
```bash
# Ver logs en tiempo real
tail -f logs/$(date +%Y-%m-%d).log | grep DDNS

# Ejemplos de logs:
[INFO] [DDNS] 🌐 DDNS actualizado: vx200-yoshua.duckdns.org → 186.122.0.125
[INFO] [DDNS] IP sin cambios: 186.122.0.125
[ERROR] [DDNS] Error actualizando DDNS: Request timeout
```

### Estado del Módulo
El módulo DDNS reporta su estado en:
```javascript
// Estado incluye:
{
  running: true,
  domain: "vx200-yoshua.duckdns.org",
  lastIP: "186.122.0.125", 
  updateInterval: 5,
  configured: true
}
```

## 🐛 Troubleshooting

### ❌ "DDNS deshabilitado"
**Causa**: Falta configuración en `.env`
**Solución**: Configurar `DUCKDNS_DOMAIN` y `DUCKDNS_TOKEN`

### ❌ "Respuesta inesperada de DuckDNS: KO"
**Causa**: Token inválido o dominio inexistente
**Solución**: Verificar token y dominio en DuckDNS.org

### ❌ "No se pudo obtener IP pública"
**Causa**: Problemas de conectividad internet
**Solución**: Verificar conexión a internet

### ❌ "Request timeout"
**Causa**: Problemas temporales de red
**Solución**: El sistema reintentará automáticamente

## 🎯 Beneficios

### ✅ **Acceso Confiable**
- El mapa APRS siempre accesible desde internet
- No importa si cambia la IP pública
- URLs amigables y fáciles de recordar

### ✅ **Configuración Simple**
- Solo 2 variables de entorno
- Configuración de una sola vez
- Funcionamiento completamente automático

### ✅ **Costo Cero**
- DuckDNS es 100% gratuito
- Sin límites de actualizaciones
- Sin vencimiento de dominios

### ✅ **Integración Nativa**
- Integrado completamente en VX200
- Logs unificados con el resto del sistema
- Arranque y parada automática

## 🔗 Enlaces Útiles

- **DuckDNS**: https://www.duckdns.org
- **Documentación DuckDNS**: https://www.duckdns.org/spec.jsp
- **Comunidad DuckDNS**: https://groups.google.com/forum/#!forum/duckdns

---

**💡 El sistema VX200 ahora es accesible desde cualquier lugar del mundo con una URL fija!**