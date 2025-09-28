FROM ubuntu:22.04

# Evitar prompts interactivos durante instalación
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=America/Argentina/Mendoza

# Configurar usuario y grupos de audio desde el inicio
RUN groupadd -g 1000 vx200user && \
    useradd -u 1000 -g 1000 -G audio -m -s /bin/bash vx200user

# Instalar dependencias del sistema en una sola capa
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    gnupg2 \
    software-properties-common \
    alsa-utils \
    alsa-tools \
    pulseaudio \
    pulseaudio-utils \
    direwolf \
    ffmpeg \
    espeak \
    espeak-data \
    git \
    nano \
    htop \
    build-essential \
    python3 \
    python3-pip \
    sox \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Instalar Node.js 18.x (LTS)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs

# Configurar PulseAudio para funcionamiento en contenedor
RUN echo "autospawn = no" >> /etc/pulse/client.conf && \
    echo "default-server = unix:/tmp/pulse-socket" >> /etc/pulse/client.conf && \
    echo "enable-shm = false" >> /etc/pulse/client.conf

# Configurar ALSA para contenedor
RUN echo "pcm.!default pulse" > /etc/asound.conf && \
    echo "ctl.!default pulse" >> /etc/asound.conf

# Crear estructura de directorios
WORKDIR /app
RUN mkdir -p temp sounds logs config data && \
    chown -R vx200user:vx200user /app

# Copiar archivos de configuración primero (para cache de Docker)
COPY package*.json ./
COPY .env.example ./

# Instalar dependencias de Node.js
RUN npm ci --only=production && \
    npm cache clean --force

# Copiar código fuente
COPY --chown=vx200user:vx200user . .

# Configurar Direwolf
COPY config/direwolf.conf /etc/direwolf.conf
RUN chown vx200user:vx200user /etc/direwolf.conf

# Crear archivo .env por defecto si no existe
RUN if [ ! -f .env ]; then cp .env.example .env; fi && \
    chown vx200user:vx200user .env

# Script de entrada personalizado
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Exponer puerto del mapa APRS
EXPOSE 3000

# Cambiar a usuario no-root por seguridad
USER vx200user

# Variables de entorno para audio
ENV PULSE_SERVER=unix:/tmp/pulse-socket
ENV AUDIO_DEVICE=default

# Healthcheck para verificar que el servicio está funcionando
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/repeater || exit 1

# Punto de entrada
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "start"]