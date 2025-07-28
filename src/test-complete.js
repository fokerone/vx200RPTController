const AudioManager = require('./audio/audioManager');
const Baliza = require('./modules/baliza');
const DateTime = require('./modules/datetime');
const AIChat = require('./modules/aiChat');
const SMS = require('./modules/sms');

console.log('🧪 Probando sistema completo CON ROGER BEEP...');

const audio = new AudioManager();
const baliza = new Baliza(audio);
const datetime = new DateTime(audio);
const aiChat = new AIChat(audio);
const sms = new SMS(audio);

// ===== CONFIGURAR ROGER BEEP =====
console.log('🔧 Configurando Roger Beep...');

// Configurar roger beep del audio manager
audio.configureRogerBeep({
    type: 'classic',        // Tipo por defecto
    volume: 0.7,           // Volumen
    duration: 250,         // Duración
    delay: 100,            // Delay antes del beep
    enabled: true          // Habilitado
});

// Test de todos los tipos de roger beep
setTimeout(async () => {
    console.log('🧪 === TEST ROGER BEEP ===');
    
    console.log('🔊 Test Classic:');
    await audio.testRogerBeep('classic');
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    console.log('🔊 Test Motorola:');
    await audio.testRogerBeep('motorola');
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    console.log('🔊 Test Kenwood:');
    await audio.testRogerBeep('kenwood');
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    console.log('🔊 Test Custom:');
    await audio.testRogerBeep('custom');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('✅ Test de roger beeps completado');
    console.log('🎯 Ahora todos los TTS tendrán roger beep automático');
    
}, 3000);

// Configurar baliza para prueba rápida
baliza.configure({
    interval: 2, // 2 minutos para prueba
    tone: {
        frequency: 800,
        duration: 600,
        volume: 0.7
    },
    message: "LU Sistema funcionando"
});

// Comandos DTMF
const commands = {
    '*1': datetime,  // Fecha y hora CON ROGER BEEP
    '*2': aiChat,    // IA Chat CON ROGER BEEP
    '*3': sms,       // SMS CON ROGER BEEP
    '*9': baliza     // Baliza manual CON ROGER BEEP
};

// Escuchar DTMF - VERSIÓN CON ROGER BEEP
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
        console.log(`🎯 Ejecutando comando: ${sequence} (CON ROGER BEEP)`);
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
    console.log(`📡 Baliza automática transmitida: ${timestamp} (CON ROGER BEEP)`);
});

// ===== COMANDOS ESPECIALES PARA ROGER BEEP =====

// Simular comandos DTMF para cambiar roger beep
const rogerBeepCommands = {
    '*91': () => {
        audio.getRogerBeep().setType('classic');
        audio.speak('Roger beep clásico activado');
    },
    '*92': () => {
        audio.getRogerBeep().setType('motorola');
        audio.speak('Roger beep Motorola activado');
    },
    '*93': () => {
        audio.getRogerBeep().setType('kenwood');
        audio.speak('Roger beep Kenwood activado');
    },
    '*94': () => {
        audio.getRogerBeep().setType('custom');
        audio.speak('Roger beep personalizado activado');
    },
    '*90': () => {
        const isEnabled = audio.getRogerBeep().getConfig().enabled;
        audio.getRogerBeep().setEnabled(!isEnabled);
        audio.speakNoBeep(`Roger beep ${!isEnabled ? 'habilitado' : 'deshabilitado'}`);
    }
};

// Escuchar comandos especiales de roger beep
const originalDTMFHandler = audio.listeners('dtmf')[0];
audio.removeAllListeners('dtmf');

audio.on('dtmf', async (sequence) => {
    // Comandos especiales de roger beep
    if (rogerBeepCommands[sequence]) {
        console.log(`🔧 Comando roger beep: ${sequence}`);
        await rogerBeepCommands[sequence]();
        return;
    }
    
    // Comandos normales
    await originalDTMFHandler(sequence);
});

// Iniciar sistema
audio.start();
baliza.start();

console.log('🎧 Sistema completo iniciado CON ROGER BEEP');
console.log('📞 Comandos DTMF disponibles:');
console.log('   *1 = Fecha y hora (+ roger beep)');
console.log('   *2 = Consulta IA (+ roger beep)');
console.log('   *3 = SMS (+ roger beep)');
console.log('   *9 = Baliza manual (+ roger beep)');
console.log('');
console.log('🔧 Comandos Roger Beep:');
console.log('   *90 = ON/OFF roger beep');
console.log('   *91 = Roger beep Classic');
console.log('   *92 = Roger beep Motorola');
console.log('   *93 = Roger beep Kenwood');
console.log('   *94 = Roger beep Custom');
console.log('');
console.log('📡 Baliza automática cada 2 minutos (+ roger beep)');
console.log('🛑 Ctrl+C para salir');

// Test automático después de 10 segundos
setTimeout(async () => {
    console.log('\n🧪 === TEST AUTOMÁTICO ===');
    
    console.log('🗣️  Test TTS con roger beep classic:');
    await audio.speak('Test de voz con roger beep clásico');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('🔧 Cambiando a roger beep Motorola...');
    audio.getRogerBeep().setType('motorola');
    await audio.speak('Ahora con roger beep Motorola');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('🔧 Cambiando a roger beep Kenwood...');
    audio.getRogerBeep().setType('kenwood');
    await audio.speak('Ahora con roger beep Kenwood');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('🔧 Test sin roger beep...');
    await audio.speakNoBeep('Este mensaje no tiene roger beep');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('🔧 Volviendo a roger beep classic...');
    audio.getRogerBeep().setType('classic');
    await audio.speak('De vuelta al roger beep clásico');
    
    console.log('✅ Test automático completado');
    
}, 10000);

// Test de datetime con roger beep después de 20 segundos
setTimeout(async () => {
    console.log('\n🧪 === TEST DATETIME CON ROGER BEEP ===');
    await datetime.execute('*1');
}, 20000);

// Cierre limpio
process.on('SIGINT', () => {
    console.log('\n🛑 Deteniendo sistema...');
    console.log('📊 Estadísticas Roger Beep:');
    console.log(`   Tipo actual: ${audio.getRogerBeep().getConfig().type}`);
    console.log(`   Estado: ${audio.getRogerBeep().getConfig().enabled ? 'Habilitado' : 'Deshabilitado'}`);
    console.log(`   Volumen: ${audio.getRogerBeep().getConfig().volume}`);
    console.log(`   Duración: ${audio.getRogerBeep().getConfig().duration}ms`);
    
    baliza.stop();
    audio.stop();
    process.exit(0);
});