# VX200 Repetidora Dashboard

Dashboard moderno desarrollado con Next.js 14 y Material UI para control y monitoreo de la repetidora VX200.

## 🚀 Características

- **Dashboard en tiempo real** con WebSocket
- **Material UI v7** con tema dark personalizado
- **Completamente responsive** (mobile-first)
- **Control de módulos** (Audio, Baliza, APRS, etc.)
- **Monitoreo de alertas** meteorológicas y sísmicas
- **Logs del sistema** con filtrado avanzado
- **Comandos DTMF** desde la interfaz web
- **TypeScript** para mayor robustez

## 🛠️ Stack Tecnológico

- **Frontend**: Next.js 14, React 18, TypeScript
- **UI**: Material UI v7, Emotion
- **Tiempo Real**: Socket.IO
- **Backend**: Express.js + Socket.IO Server
- **Charts**: Recharts, MUI X-Charts
- **Responsive**: Mobile-first design

## 📦 Instalación

```bash
# Instalar dependencias
npm install

# Ejecutar servidor backend + frontend en desarrollo
npm run dev:full

# O ejecutar por separado:
npm run server  # Backend en puerto 3001
npm run dev     # Frontend en puerto 3000
```

## 🔧 Estructura del Proyecto

```
dashboard/
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── layout.tsx       # Layout principal
│   │   └── page.tsx         # Página principal
│   ├── components/          # Componentes React
│   │   ├── layout/          # AppBar, Sidebar
│   │   ├── dashboard/       # SystemOverview
│   │   ├── controls/        # QuickControls
│   │   └── logs/           # LogViewer
│   ├── hooks/              # React Hooks
│   │   └── useSocket.ts    # Hook para WebSocket
│   ├── providers/          # Context Providers
│   │   └── ThemeProvider.tsx
│   ├── theme/              # Material UI Theme
│   │   └── theme.ts
│   └── types/              # TypeScript Types
│       └── repeater.ts
├── server.js               # Servidor Backend
└── package.json
```

## 📱 Funcionalidades Principales

### Dashboard Principal
- **Estado del sistema** en tiempo real
- **Indicadores visuales** de módulos activos
- **Uptime y estadísticas** del sistema
- **Estado de conexión** WebSocket

### Controles
- **Comandos DTMF**: *1, *4, *7, *9, *3, *0
- **Toggle de servicios**: Audio, Baliza automática
- **Controles del sistema**: Reiniciar, Apagar

### Monitoreo
- **Logs en tiempo real** con filtros por nivel/módulo
- **Alertas meteorológicas** activas
- **Estado del canal** (ocupado/libre)
- **Posiciones APRS** recibidas

### Responsive Design
- **Sidebar colapsable** en móviles
- **Layout adaptativo** según tamaño de pantalla
- **Touch-friendly** para tablets

## 🌐 API WebSocket

### Eventos del Cliente → Servidor:
- `command`: Enviar comando al VX200
- `toggle_service`: Activar/desactivar servicio
- `request_status`: Solicitar estado actual

### Eventos del Servidor → Cliente:
- `system_status`: Estado completo del sistema
- `log`: Nuevo log del sistema
- `channel_activity`: Actividad del canal
- `dtmf`: Secuencia DTMF detectada
- `weather_alert`: Nueva alerta meteorológica
- `seism_detected`: Sismo detectado
- `aprs_position`: Nueva posición APRS

## 🎨 Tema y Estilo

- **Dark theme** optimizado para operación nocturna
- **Colores semánticos** para estados (success, warning, error)
- **Tipografía**: Inter font family
- **Iconografía**: Material Icons
- **Cards con glassmorphism** effect

## 🔌 Integración con VX200

El dashboard está diseñado para conectarse al sistema VX200 real a través de:

1. **WebSocket server** en puerto 3001
2. **REST API** endpoints para comandos
3. **Event-driven architecture** para tiempo real

Para integración real:
- Reemplazar `server.js` con conexión real al VX200
- Implementar middleware de autenticación
- Agregar persistencia de configuración

## 📋 TODO - Próximas Funcionalidades

- [ ] **Mapa APRS** interactivo (próximo prompt)
- [ ] **Panel de configuración** avanzado
- [ ] **Gráficos de estadísticas** históricas
- [ ] **Alertas push** del navegador
- [ ] **Modo offline** con cache local
- [ ] **Autenticación** de usuarios
- [ ] **Backup/Restore** de configuración

## 🚦 Estados de Desarrollo

- ✅ **Layout y navegación**
- ✅ **Sistema de estado global**
- ✅ **Componentes principales**
- ✅ **WebSocket tiempo real**
- ✅ **Controles básicos**
- ⏳ **Mapa APRS** (siguiente)
- ⏳ **Panels especializados**
- ⏳ **Configuración avanzada**

## 📝 Notas de Desarrollo

- Proyecto creado con `create-next-app@14`
- Configurado con TypeScript strict mode
- Optimizado para producción con Next.js
- Compatible con deployment en Vercel/Netlify
- PWA-ready (se puede agregar service worker)

## 🤝 Contribución

Dashboard desarrollado para la comunidad de radioaficionados. Optimizado para operación 24/7 de repetidoras automáticas.

---

**VX200 Dashboard v1.0** - Made with ❤️ for Hams
