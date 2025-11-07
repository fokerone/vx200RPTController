# Análisis del Portal Web APRS - VX200 Controller

**Fecha:** 2025-11-04
**Versión actual:** 1.0
**URL:** http://192.168.100.3:3000

---

## 📊 Estado Actual del Sistema

### Datos Recolectados
- **Total de posiciones únicas:** 35 ubicaciones
- **Callsigns detectados:** 1 (LU5MCD-7)
- **Período de datos:** 75 días (23/08/2025 - 04/11/2025)
- **Enlace más lejano:** 4.96 km (LU5MCD-7 el 18/09/2025)
- **Posición más reciente:** 0.04 km (mensaje directo ":YOSHUA :hola{05")

### Tecnologías Utilizadas
- **Frontend:** Leaflet.js 1.9.4 + Bootstrap 5
- **Mapas:** OpenStreetMap
- **Backend:** Node.js HTTP Server (puerto 3000)
- **TNC:** Direwolf con KISS TCP (puerto 8001)
- **Almacenamiento:** JSON + CSV logs

### Visualización Actual de Cobertura
**Método:** Círculo único centrado en el repetidor
- **Radio:** Dinámico basado en la estación más lejana detectada (4.96 km)
- **Estilo:** Círculo azul semi-transparente (#3498db, opacity 0.1)
- **Limitación:** No representa la cobertura real ni la dirección de propagación

---

## 🎯 Observaciones y Oportunidades de Mejora

### 1. Visualización de Cobertura

#### Limitaciones del Círculo Actual
El círculo actual asume **cobertura isotrópica** (igual en todas direcciones), pero en la realidad:
- La topografía afecta la propagación (montañas, valles)
- La antena puede tener directividad
- Las obstrucciones urbanas crean "sombras" RF
- Los 4.96 km en una dirección no garantizan 4.96 km en todas

#### Alternativas Propuestas

##### **Opción A: Polígono Convexo (Convex Hull)**
- Dibuja un polígono que envuelve todas las posiciones detectadas
- Representa la **cobertura real probada**
- **Ventajas:**
  - Muestra forma irregular de cobertura real
  - Identifica zonas no cubiertas
  - Visualización honesta de lo alcanzado
- **Implementación:** Algoritmo de Graham Scan o Jarvis March
- **Complejidad:** Media

##### **Opción B: Polígono de Voronoi / Tesselación**
- Divide el área en regiones por estación
- Útil si hay múltiples callsigns
- Muestra "áreas de influencia"
- **Complejidad:** Alta

##### **Opción C: Mapa de Calor (Heatmap)**
- Gradiente de intensidad basado en:
  - Cantidad de recepciones por zona
  - Calidad de señal (audio level)
  - Tasa de errores
- **Ventajas:**
  - Visualización intuitiva de "zonas calientes"
  - Identifica áreas con mejor/peor cobertura
- **Librería:** Leaflet.heat plugin
- **Complejidad:** Baja

##### **Opción D: Híbrido - Polígono + Direcciones**
- Polígono convexo para límites reales
- Líneas radiales por dirección con distancia alcanzada
- Círculo de referencia en gris (cobertura teórica)
- **Ventajas:**
  - Compara teoría vs realidad
  - Muestra direcciones específicas
  - Identifica "agujeros" de cobertura
- **Complejidad:** Media-Alta

---

### 2. Estadísticas de Enlace

#### Datos Actuales
Se calcula `maxDistance` pero **no se visualiza prominentemente**

#### Propuestas de Mejora

##### **Panel de Estadísticas Principal**
Crear un panel destacado con:

```
┌─────────────────────────────────────────────────────┐
│  📡 ESTADÍSTICAS DE COBERTURA                       │
├─────────────────────────────────────────────────────┤
│  🔗 Enlace más lejano:                              │
│     • Distancia: 4.96 km                            │
│     • Callsign: LU5MCD-7                            │
│     • Fecha: 18/09/2025 23:10                       │
│     • Dirección: SE (135°)                          │
│     • Señal: 177(42/20) - Excelente                │
│                                                     │
│  📊 Resumen general:                                │
│     • Estaciones únicas: 1                          │
│     • Posiciones registradas: 35                    │
│     • Cobertura promedio: 1.8 km                    │
│     • Área cubierta: ~19.6 km²                      │
│     • Días de operación: 75                         │
│                                                     │
│  🗺️ Cobertura por dirección:                        │
│     • N  (000°): 2.5 km ██████                      │
│     • NE (045°): 1.2 km ███                         │
│     • E  (090°): 2.1 km █████                       │
│     • SE (135°): 4.96 km ████████████ ⭐ MAX       │
│     • S  (180°): 1.9 km ████                        │
│     • SW (225°): 0.8 km ██                          │
│     • W  (270°): 1.1 km ███                         │
│     • NW (315°): 1.5 km ████                        │
└─────────────────────────────────────────────────────┘
```

##### **Línea Visual al Enlace Máximo**
- Dibujar línea destacada (roja/verde) desde repetidor hasta la posición más lejana
- Agregar marcador especial con ⭐
- Tooltip con todos los datos del enlace
- Animación opcional al cargar el mapa

##### **Tabla de Top 10 Enlaces**
Mostrar ranking de distancias:
```
Pos | Callsign   | Distancia | Fecha       | Señal
----|------------|-----------|-------------|-------
1   | LU5MCD-7   | 4.96 km   | 18/09 23:10 | ⭐⭐⭐⭐⭐
2   | LU5MCD-7   | 2.95 km   | 05/09 00:22 | ⭐⭐⭐⭐
3   | LU5MCD-7   | 2.79 km   | 23/08 16:06 | ⭐⭐⭐⭐
...
```

---

### 3. Agrupación de Estaciones

#### Estado Actual
✅ Ya agrupa por callsign correctamente
✅ Mantiene historial de ubicaciones únicas
✅ Contador de recepciones por ubicación

#### Propuestas de Mejora

##### **Vista por Callsign**
Panel desplegable que muestre:
- Lista de todos los callsigns detectados
- Estadísticas por callsign:
  - Total de posiciones únicas
  - Distancia promedio
  - Distancia máxima
  - Última actividad
  - Radio/equipo utilizado
  - Total de recepciones

##### **Filtros Interactivos**
Permitir filtrar mapa por:
- Callsign específico
- Rango de fechas
- Distancia mínima/máxima
- Calidad de señal
- Radio/equipo utilizado

##### **Agrupación Visual en el Mapa**
- Usar **clusters** de Leaflet.markercluster cuando hay muchas posiciones cercanas
- Mostrar número de posiciones en el cluster
- Al hacer zoom, expandir clusters automáticamente

---

### 4. Análisis Temporal

#### Propuesta: Gráfico de Actividad
Agregar gráfico temporal que muestre:
- Recepciones por día/semana/mes
- Identificar patrones de uso
- Detectar períodos de mayor actividad
- Comparar cobertura en diferentes épocas

**Ejemplo de visualización:**
```
Recepciones por mes:
Agosto:     ████████ 15 posiciones
Septiembre: ████████████ 20 posiciones
Octubre:    (sin datos)
Noviembre:  ██ 3 posiciones
```

---

### 5. Exportación de Datos

#### Propuesta: Funcionalidad de Exportación
Permitir exportar datos en formatos:
- **CSV**: Para análisis en Excel/LibreOffice
- **KML**: Para Google Earth
- **GPX**: Para GPS/navegación
- **JSON**: Para integraciones

**Botones sugeridos:**
- 📥 Exportar todas las posiciones
- 📊 Exportar estadísticas
- 🗺️ Exportar mapa como imagen

---

### 6. Mejoras de UI/UX

#### Propuestas Visuales

##### **Dashboard Moderno**
- Usar cards de Bootstrap 5 para métricas clave
- Iconos Font Awesome para mejor UX
- Colores consistentes con el tema actual (azul #3498db)

##### **Modo Oscuro**
- Toggle para modo oscuro/claro
- Mapas oscuros (CartoDB Dark Matter)
- Mejor para uso nocturno

##### **Responsive Design Mejorado**
- Panel de detalles colapsable en móviles
- Gestos táctiles para navegar el mapa
- Botones más grandes para touch

##### **Notificaciones en Tiempo Real**
- Toast notifications cuando se recibe nueva posición
- Sonido opcional (bip APRS)
- Badge con contador de nuevas estaciones

---

## 🔧 Propuesta de Implementación Priorizada

### Fase 1: Mejoras de Visualización (Alta prioridad)
1. **Reemplazar círculo por polígono convexo + círculo de referencia**
   - Tiempo estimado: 2-3 horas
   - Impacto: Alto - representa cobertura real
   - Archivos a modificar: `map.html` (clase `APRSMap`)

2. **Panel de estadísticas destacado**
   - Tiempo estimado: 1-2 horas
   - Impacto: Alto - información clave visible
   - Agregar sección HTML + estilos CSS

3. **Línea visual al enlace más lejano**
   - Tiempo estimado: 30 minutos
   - Impacto: Medio - destaca récord de distancia
   - Modificar método `initializeMap()`

### Fase 2: Funcionalidades Avanzadas (Media prioridad)
4. **Cobertura por dirección (rosa de vientos)**
   - Tiempo estimado: 3-4 horas
   - Impacto: Alto - análisis direccional
   - Nuevo método de cálculo + visualización

5. **Filtros interactivos**
   - Tiempo estimado: 2-3 horas
   - Impacto: Medio - exploración de datos
   - Agregar controles UI + lógica de filtrado

6. **Mapa de calor (heatmap)**
   - Tiempo estimado: 1-2 horas
   - Impacto: Medio - visualización de intensidad
   - Integrar Leaflet.heat plugin

### Fase 3: Mejoras de UX (Baja prioridad)
7. **Modo oscuro**
   - Tiempo estimado: 2 horas
   - Impacto: Bajo - comodidad visual
   - CSS + toggle switch

8. **Exportación de datos**
   - Tiempo estimado: 3-4 horas
   - Impacto: Bajo - útil para análisis externo
   - Backend endpoints + frontend buttons

9. **Notificaciones en tiempo real**
   - Tiempo estimado: 2 horas
   - Impacto: Bajo - feedback inmediato
   - WebSocket o polling mejorado

---

## 📐 Cálculo de Cobertura Real vs Teórica

### Cobertura Actual Registrada
- **Polígono convexo estimado:** ~8-10 km² (basado en 35 puntos)
- **Círculo actual (4.96 km radio):** 77.4 km²
- **Diferencia:** El círculo **sobrestima ~7-8 veces** la cobertura real probada

### Factores que Afectan Cobertura Real
1. **Topografía:** Mendoza tiene relieve montañoso
2. **Obstrucciones:** Edificios, árboles
3. **Potencia:** PTT limitada en HT vs repetidor
4. **Antena:** Ganancia y patrón de radiación
5. **Frecuencia:** VHF/UHF = línea de vista principalmente

---

## 🎨 Mockup de Mejoras Visuales

### Propuesta: Polígono Convexo + Estadísticas

```
┌──────────────────────────────────────────────────────────────┐
│ 📡 VX200 APRS MAP - Guaymallén, Mendoza                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [Mapa con:]                                                │
│   • Repetidor (📡 rojo) en el centro                        │
│   • Círculo gris translúcido (cobertura teórica 4.96km)     │
│   • Polígono azul (cobertura real probada)                  │
│   • 35 marcadores azules (posiciones LU5MCD-7)              │
│   • Línea roja punteada → Enlace MAX (SE, 4.96km) ⭐       │
│   • Rosa de vientos con 8 sectores coloreados              │
│                                                              │
│  ┌─────────────────────────────────────────┐               │
│  │ 📊 COBERTURA                             │               │
│  │ Enlace MAX: 4.96 km SE                  │               │
│  │ Estaciones: 1 | Posiciones: 35          │               │
│  │ Área real: ~9 km² | Teórica: 77 km²     │               │
│  │ Eficiencia: 12% ████                    │               │
│  └─────────────────────────────────────────┘               │
│                                                              │
│  [Filtros: Callsign ▼ | Fecha ▼ | Señal ▼]                │
└──────────────────────────────────────────────────────────────┘
```

---

## 🚀 Recomendaciones Finales

### Cambios Prioritarios (Implementar primero)
1. ✅ **Polígono convexo** - Representa cobertura real honesta
2. ✅ **Panel de estadísticas** - Información clave visible
3. ✅ **Línea al enlace máximo** - Destaca logro de distancia

### Mantener del Sistema Actual
- ✅ Leaflet + OpenStreetMap (funciona bien)
- ✅ Bootstrap 5 (diseño moderno)
- ✅ Auto-refresh 30 segundos (buena UX)
- ✅ Panel de detalles expandible (funcionalidad completa)
- ✅ Almacenamiento en JSON (simple y efectivo)

### Consideraciones Técnicas
- **Rendimiento:** Con 35 posiciones el sistema es rápido, considerar optimización si pasan de 1000+
- **Escalabilidad:** Si agregan más repetidores/callsigns, considerar clusterización
- **Offline:** Considerar Service Worker para funcionamiento sin internet

---

## 📝 Conclusión

El portal web APRS actual es **funcional y bien estructurado**, pero la visualización circular de cobertura **no representa la realidad**. Las mejoras propuestas permitirán:

1. **Mayor precisión** en la representación de cobertura
2. **Mejor análisis** de propagación direccional
3. **Visualización más honesta** de lo alcanzado vs lo teórico
4. **Herramientas** para optimizar ubicación de antenas

**Próximo paso sugerido:** Implementar Fase 1 (polígono convexo + estadísticas) y evaluar resultados con el usuario.
