const AudioManager = require('./audio/audioManager');
const Baliza = require('./modules/baliza');
const DateTime = require('./modules/datetime');
const AIChat = require('./modules/aiChat');
const SMS = require('./modules/sms');

console.log('🧪 Probando sistema completo...');

const audio = new AudioManager();
const baliza = new Baliza(audio);
const datetime = new DateTime(audio);
const aiChat = new AIChat(audio);
const sms = new SMS(audio);


// Configurar baliza para prueba rápida
baliza.configure({
    interval: 2, // 2 minutos para prueba
    tone: {
        frequency: 800,
        duration: 600,
        volume: 0.7
    },
    message: "LU5MCD Sistema funcionando"
});

// Comandos DTMF
const commands = {
    '*1': datetime,  // Fecha y hora
    '*2': aiChat,    // IA Chat
    '*3': sms,       // SMS
    '*9': baliza     // Baliza manual
};

// Escuchar DTMF - VERSIÓN CORREGIDA
audio.on('dtmf', async (sequence) => {
    console.log(`📞 Secuencia recibida: ${sequence}`);
    
    // Si SMS está activo, solo procesar secuencias que terminen en * o # o sean 1/2
    if (sms.sessionState !== 'idle') {
        // Para captura de número: solo procesar si termina en * o #
        if (sms.sessionState === 'getting_number') {
            if (sequence.endsWith('*') || sequence.endsWith('#')) {
                const processed = await sms.processDTMF(sequence);
                if (processed) return;
            } else {
                // Ignorar dígitos individuales
                console.log(`📞 Ignorando dígito individual: ${sequence}`);
                return;
            }
        }
        
        // Para confirmación: solo procesar 1 o 2
        if (sms.sessionState === 'confirming') {
            if (sequence === '1' || sequence === '2') {
                const processed = await sms.processDTMF(sequence);
                if (processed) return;
            } else {
                console.log(`📞 Ignorando durante confirmación: ${sequence}`);
                return;
            }
        }
        
        // Para otros estados, ignorar
        return;
    }
    
    // Comandos normales solo si SMS está idle
    if (commands[sequence]) {
        console.log(`🎯 Ejecutando comando: ${sequence}`);
        await commands[sequence].execute(sequence);
    } else {
        console.log(`❓ Comando desconocido: ${sequence}`);
        if (sms.sessionState === 'idle') {
            try {
                audio.playTone(400, 200, 0.5);
            } catch (err) {
                console.log('⚠️  No se pudo reproducir tono de error');
            }
        }
    }
});

// Eventos de baliza
baliza.on('transmitted', (timestamp) => {
    console.log(`📡 Baliza automática: ${timestamp}`);
});

// Iniciar sistema
audio.start();
baliza.start();

console.log('🎧 Sistema completo iniciado');
console.log('📞 Comandos disponibles:');
console.log('   *1 = Fecha y hora');
console.log('   *2 = Consulta IA');
console.log('   *3 = SMS');
console.log('   *9 = Baliza manual');
console.log('📡 Baliza automática cada 2 minutos');
console.log('🛑 Ctrl+C para salir');

// Cierre limpio
process.on('SIGINT', () => {
    console.log('\n🛑 Deteniendo sistema...');
    baliza.stop();
    audio.stop();
    process.exit(0);
});