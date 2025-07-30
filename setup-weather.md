# Configuración del Módulo Weather - VX200 Controller

## 🌤️ Obtener API Key de OpenWeatherMap

1. **Registrarse en OpenWeatherMap**:
   - Visita: https://openweathermap.org/api
   - Crea una cuenta gratuita
   - Confirma tu email

2. **Obtener tu API Key**:
   - Ve a tu perfil → My API Keys
   - Copia tu API Key (algo como: `abc123def456...`)

3. **Configurar en el sistema**:
   ```bash
   # Editar el archivo .env
   nano .env
   
   # Agregar tu API key:
   OPENWEATHER_API_KEY=tu-api-key-aqui
   ```

## 📡 Comandos DTMF Disponibles

- `*4` o `*41` → Clima actual en Mendoza
- `*42` → Pronóstico 24 horas para Mendoza

## 🎛️ Panel Web

El módulo Weather aparece en el panel web con dos botones:
- **Actual**: Clima actual
- **24h**: Pronóstico de 24 horas

## 🔧 Personalización

Puedes cambiar la ciudad por defecto editando `.env`:
```bash
WEATHER_DEFAULT_CITY=Buenos Aires,AR
# o
WEATHER_DEFAULT_CITY=Córdoba,AR
```

## 🚀 Plan Gratuito OpenWeatherMap

- ✅ 60 llamadas por minuto
- ✅ 1,000 llamadas por día  
- ✅ Datos meteorológicos actuales
- ✅ Pronósticos de 5 días/3 horas
- ✅ Completamente gratis

## 📝 Ejemplo de Uso

1. Usuario marca `*41` en radio
2. Sistema responde: 
   > *"Clima actual en Mendoza. Temperatura 28 grados. Sensación térmica 30 grados. Cielo despejado. Humedad 45 por ciento. Viento del oeste a 12 kilómetros por hora."*

3. Usuario marca `*42` para pronóstico:
   > *"Pronóstico para Mendoza próximas veinticuatro horas. Temperatura máxima 32 grados, mínima 18 grados. Cielo parcialmente nublado. Sin precipitaciones esperadas."*

## 🐛 Troubleshooting

**Error: "Servicio de clima no configurado"**
- Verifica que tengas la API key en `.env`
- Reinicia el sistema después de agregar la API key

**Error: "No se pudo obtener información del clima"**
- Verifica tu conexión a internet
- Confirma que la API key es válida
- Revisa los logs del sistema para más detalles