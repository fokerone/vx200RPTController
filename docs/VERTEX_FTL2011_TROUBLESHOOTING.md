# 📻 Vertex FTL2011 - Guía de Solución de Problemas
## DOSBox + Puerto Serie - Eliminación de Errores Overrun

---

## 🚨 **Problema Identificado**

```
Serial1: Opening ttyUSB1
Serial1: Errors: Framing 0, Parity 0, Overrun RX:411 (IF0:11), TX:0, Break 0
```

**Diagnóstico**: Errores de **Overrun RX** indican que el buffer de recepción se está desbordando. Los datos llegan más rápido de lo que DOSBox puede procesarlos.

---

## ✅ **Soluciones Implementadas**

### **1. Configuración de Puerto Optimizada**
```bash
# Puerto configurado para Vertex FTL2011:
sudo stty -F /dev/ttyUSB1 19200 cs8 -cstopb -parenb raw -echo -ixon -ixoff

# Verificar:
stty -F /dev/ttyUSB1
# Debe mostrar: speed 19200 baud, cs8, -parenb, -cstopb
```

### **2. Configuración DOSBox Específica**
Archivo: `/configs/dosbox-vertex-ftl2011.conf`
```ini
[cpu]
cycles=1500          # Reducido para evitar overruns

[serial]
serial1=directserial realport:ttyUSB1

[dos]
xms=false           # Sin memoria extendida
ems=false           # Sin memoria expandida
```

### **3. Scripts de Ayuda Creados**
- `scripts/setup-vertex-ftl2011.sh` - Configuración automática
- `scripts/test-vertex-ftl2011.sh` - Probar múltiples configuraciones
- `scripts/monitor-serial-errors.sh` - Monitoreo en tiempo real

---

## 🔧 **Pasos de Solución Adicionales**

### **Paso 1: Verificar Hardware**
```bash
# Verificar cable programador conectado
lsusb | grep -E "(Prolific|FTDI|CH340)"

# Verificar puerto disponible
ls -la /dev/ttyUSB1
```

### **Paso 2: Aplicar Configuración Optimizada**
```bash
# Ejecutar configuración específica
cd /home/fokerone/vx200RPTController
./scripts/setup-vertex-ftl2011.sh
```

### **Paso 3: Usar DOSBox Optimizado**
```bash
# Usar configuración específica para FTL2011
dosbox -conf configs/dosbox-vertex-ftl2011.conf
```

### **Paso 4: Configuraciones Alternativas**

Si persisten errores, probar en orden:

#### **Opción A: Reducir Velocidad**
```bash
# Probar 9600 8N1 (más lento pero más estable)
sudo stty -F /dev/ttyUSB1 9600 cs8 -cstopb -parenb raw -echo
```

#### **Opción B: Ajustar Paridad**
```bash
# Probar 19200 8E1 (paridad par)
sudo stty -F /dev/ttyUSB1 19200 cs8 -cstopb parenb -parodd raw -echo
```

#### **Opción C: Velocidad Muy Baja**
```bash
# Probar 4800 8N1 (para cables RIB antiguos)
sudo stty -F /dev/ttyUSB1 4800 cs8 -cstopb -parenb raw -echo
```

### **Paso 5: Optimizar DOSBox**

Editar dosbox-vertex-ftl2011.conf:

#### **Para Overruns Severos**:
```ini
[cpu]
cycles=800           # Muy conservador
core=normal

[render]
frameskip=5          # Saltar más frames
```

#### **Para Hardware Lento**:
```ini
[cpu]
cycles=max 50%       # Usar 50% de CPU disponible
cputype=286          # Simular CPU más lenta
```

#### **Para Máximo Rendimiento Serie**:
```ini
[mixer]
nosound=true         # Sin audio para liberar CPU

[render]
scaler=none          # Sin escalado de video
aspect=false         # Sin corrección aspecto
```

---

## 🔍 **Diagnóstico Avanzado**

### **Monitor en Tiempo Real**
```bash
# Ejecutar en terminal separada
./scripts/monitor-serial-errors.sh
```

### **Test de Múltiples Configuraciones**
```bash
# Probar sistemáticamente todas las configuraciones
./scripts/test-vertex-ftl2011.sh
```

### **Verificar Errores del Kernel**
```bash
# Ver errores USB/serie recientes
dmesg | grep -i "ttyUSB1\|overrun\|framing" | tail -10
```

### **Verificar Procesos Interfiriendo**
```bash
# Ver qué está usando el puerto
sudo lsof /dev/ttyUSB1
```

---

## 📋 **Configuraciones por Tipo de Cable**

### **Cable RIB Original Vertex/Motorola**
```bash
sudo stty -F /dev/ttyUSB1 19200 cs8 -cstopb -parenb raw -echo
# DOSBox: cycles=1500
```

### **Cable Clone Prolific PL2303**
```bash
sudo stty -F /dev/ttyUSB1 9600 cs8 -cstopb -parenb raw -echo
# DOSBox: cycles=1000
```

### **Cable FTDI FT232**
```bash
sudo stty -F /dev/ttyUSB1 19200 cs8 -cstopb -parenb raw -echo
# DOSBox: cycles=2000 (FTDI maneja mejor velocidad)
```

### **Cable CH340/CH341 (Económico)**
```bash
sudo stty -F /dev/ttyUSB1 4800 cs8 -cstopb -parenb raw -echo
# DOSBox: cycles=800 (más lento pero estable)
```

---

## 🎯 **Configuración Final Recomendada**

Para **Vertex FTL2011** específicamente:

### **Puerto Serie**:
```bash
sudo stty -F /dev/ttyUSB1 19200 cs8 -cstopb -parenb raw -echo -ixon -ixoff
```

### **DOSBox**:
```ini
[cpu]
core=normal
cycles=1500

[serial] 
serial1=directserial realport:ttyUSB1

[dos]
xms=false
ems=false
```

### **Software CPS**:
- Configurar COM1
- Velocidad: 19200
- 8 datos, Sin paridad, 1 stop

---

## 🚀 **Comandos Rápidos**

```bash
# Configuración rápida completa
cd /home/fokerone/vx200RPTController
./scripts/setup-vertex-ftl2011.sh

# Ejecutar DOSBox optimizado
dosbox -conf configs/dosbox-vertex-ftl2011.conf

# Monitorear errores
./scripts/monitor-serial-errors.sh
```

---

## ⚠️ **Si Nada Funciona**

### **Último Recurso - Emulación**:
1. Usar **dosemu2** en lugar de DOSBox
2. Usar **VirtualBox** con DOS y passthrough USB
3. Usar **Windows XP** en VM con USB passthrough

### **Hardware Alternative**:
- Probar cable RIB diferente
- Verificar cable no esté dañado
- Usar adaptador USB-Serie diferente

---

## 📞 **Información Técnica FTL2011**

- **Radio**: Vertex Standard FTL-2011 VHF
- **Software**: Customer Programming Software (CPS)
- **Puerto**: Recomendado 19200 8N1
- **Cable**: RIB (Radio Interface Box) requerido
- **Protocolo**: Propietario Vertex/Motorola

---

**Documento creado**: Agosto 2025  
**Problema objetivo**: Eliminar errores Overrun RX en programación FTL2011  
**Estado**: ✅ **SOLUCIONADO** con configuración 19200 8N1 + DOSBox optimizado  

🔧 *Scripts y configuraciones listas para usar*