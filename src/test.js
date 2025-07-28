const AudioManager = require('./audio/audioManager');

console.log('🧪 Iniciando prueba del sistema de audio...');

const audio = new AudioManager();

// Escuchar eventos DTMF
audio.on('dtmf', (sequence) => {
    console.log(`🎯 DTMF detectado: "${sequence}"`);
    
    // Responder con voz
    audio.speak(`Has presionado ${sequence}`, { voice: 'es' });
});

// Escuchar audio general
audio.on('audio', (audioData) => {
    // Solo mostrar cuando hay señal significativa
    const avgLevel = audioData.reduce((sum, sample) => sum + Math.abs(sample), 0) / audioData.length;
});

// Iniciar sistema
console.log('▶️  Iniciando audio...');
audio.start();

console.log('🎧 Sistema listo. Habla o presiona DTMF en tu radio...');
console.log('🛑 Presiona Ctrl+C para salir');

// Manejar cierre limpio
process.on('SIGINT', () => {
    console.log('\n🛑 Deteniendo sistema...');
    audio.stop();
    process.exit(0);
});

// Prueba opcional de TTS cada 30 segundos
setInterval(() => {
    console.log('🔔 Enviando mensaje de prueba...');
    audio.speak('LU, sistema funcionando correctamente');
}, 30000);