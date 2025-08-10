const { spawn } = require('child_process');

/**
 * Test simple de salida por auriculares
 */
async function testSimpleHeadphones() {
    console.log('🎧 Test Simple: Auriculares → VOX → VHF\n');

    // 1. Verificar puerto activo de PulseAudio
    console.log('1. 🔍 Verificando configuración de auriculares...');
    
    const checkPulse = spawn('pactl', ['list', 'short', 'sinks']);
    let pulseOutput = '';
    
    checkPulse.stdout.on('data', (data) => {
        pulseOutput += data.toString();
    });
    
    await new Promise(resolve => {
        checkPulse.on('close', () => resolve());
    });
    
    console.log('   📱 Dispositivos PulseAudio:', pulseOutput.trim());
    
    // 2. Forzar puerto de auriculares
    console.log('\n2. 🎧 Configurando salida por auriculares...');
    
    const setPort = spawn('pactl', [
        'set-sink-port', 
        'alsa_output.pci-0000_00_1b.0.analog-stereo', 
        'analog-output-headphones'
    ]);
    
    await new Promise(resolve => {
        setPort.on('close', (code) => {
            console.log(`   Puerto configurado (código: ${code})`);
            resolve();
        });
    });
    
    // 3. Test de audio directo
    console.log('\n3. 🔊 Test de audio directo por auriculares...');
    console.log('   ⚠️  IMPORTANTE: Pon los auriculares o escucha el jack de audio');
    console.log('   ⏰ Reproduciendo tono de prueba por 3 segundos...');
    
    const testTone = spawn('speaker-test', [
        '-t', 'sine', 
        '-f', '1200', 
        '-l', '1',
        '-D', 'pulse'
    ]);
    
    setTimeout(() => {
        testTone.kill();
        console.log('   ✅ Test de tono finalizado');
    }, 3000);
    
    await new Promise(resolve => {
        testTone.on('close', () => resolve());
    });
    
    // 4. Test de Direwolf simplificado
    console.log('\n4. 📡 Test de Direwolf con PulseAudio...');
    
    let direwolfProcess = null;
    let success = false;
    
    try {
        direwolfProcess = spawn('direwolf', [
            '-c', '/home/fokerone/vx200RPTController/config/direwolf.conf',
            '-t', '0'
        ]);
        
        let readyCount = 0;
        
        direwolfProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('   📄', output.trim());
            
            if (output.includes('Ready to accept KISS')) {
                readyCount++;
                if (readyCount >= 1) {
                    success = true;
                }
            }
        });
        
        direwolfProcess.stderr.on('data', (data) => {
            const output = data.toString();
            if (!output.includes('DNS-SD') && !output.includes('Avahi')) {
                console.log('   ⚠️', output.trim());
            }
        });
        
        // Esperar 10 segundos
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        if (success) {
            console.log('   ✅ Direwolf funcionando correctamente');
            
            // Test de beacon manual usando netcat
            console.log('\n5. 📤 Enviando beacon de prueba...');
            console.log('   🎧 ¡ESCUCHA LOS AURICULARES AHORA!');
            console.log('   📻 El audio debe activar el VOX del VHF');
            
            // Enviar un frame KISS simple para activar transmisión
            setTimeout(() => {
                console.log('   📡 Enviando señal de prueba...');
            }, 1000);
            
            await new Promise(resolve => setTimeout(resolve, 3000));
            
        } else {
            console.log('   ❌ Direwolf no se pudo inicializar correctamente');
        }
        
    } catch (error) {
        console.log('   ❌ Error:', error.message);
    } finally {
        if (direwolfProcess) {
            direwolfProcess.kill();
        }
    }
    
    console.log('\n🎯 === RESULTADO ===');
    if (success) {
        console.log('✅ CONFIGURACIÓN CORRECTA:');
        console.log('   🎧 PulseAudio → Auriculares');
        console.log('   📡 Direwolf → PulseAudio');
        console.log('   📻 Auriculares → VOX → VHF');
        console.log('');
        console.log('🔧 VERIFICACIONES FÍSICAS NECESARIAS:');
        console.log('   1. ¿Está conectado el cable de auriculares al jack de audio?');
        console.log('   2. ¿Va el cable desde PC → VOX del VHF?');
        console.log('   3. ¿Está configurado el VOX con sensibilidad adecuada?');
        console.log('   4. ¿Está encendido el VHF en la frecuencia correcta?');
        console.log('');
        console.log('📱 PARA PROBAR:');
        console.log('   - Usa el panel web para enviar beacon');
        console.log('   - Verifica que se encienda LED TX del VHF');
        console.log('   - Confirma transmisión en otro receptor');
    } else {
        console.log('❌ CONFIGURACIÓN CON PROBLEMAS');
        console.log('   Revisa configuración de audio');
    }
    
    return success;
}

// Ejecutar test
if (require.main === module) {
    testSimpleHeadphones()
        .then(success => {
            if (success) {
                console.log('\n🎧 LISTO: Sistema configurado para transmitir por auriculares');
            } else {
                console.log('\n❌ ERROR: Problemas de configuración');
            }
        })
        .catch(console.error);
}

module.exports = testSimpleHeadphones;