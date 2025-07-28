const AudioManager = require('./audio/audioManager');
const Baliza = require('./modules/baliza');

console.log('🧪 Probando módulo Baliza...');

const audio = new AudioManager();
const baliza = new Baliza(audio);

// Configurar baliza para prueba (cada 30 segundos)
baliza.configure({
    interval: 0.5, // 30 segundos para prueba
    tone: {
        frequency: 800,  // Tono más grave
        duration: 1000,  // Más largo
        volume: 0.8
    },
    message: "Baliza de prueba"
});

// Escuchar eventos de baliza
baliza.on('started', () => {
    console.log('🟢 Baliza iniciada');
});

baliza.on('transmitted', (timestamp) => {
    console.log(`✅ Baliza transmitida: ${timestamp}`);
});

baliza.on('error', (error) => {
    console.error('❌ Error en baliza:', error);
});

// Escuchar DTMF para baliza manual
audio.on('dtmf', (sequence) => {
    if (sequence === '*9') {
        console.log('📞 Baliza manual activada por *9');
        baliza.execute(sequence);
    }
});

// Iniciar sistema
audio.start();
baliza.start();

console.log('🎧 Sistema listo');
console.log('📡 Baliza cada 30 segundos (para prueba)');
console.log('📞 Presiona *9 para baliza manual');
console.log('🛑 Ctrl+C para salir');

// Cierre limpio
process.on('SIGINT', () => {
    console.log('\n🛑 Deteniendo...');
    baliza.stop();
    audio.stop();
    process.exit(0);
});