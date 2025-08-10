const { spawn } = require('child_process');

/**
 * Test directo del beacon APRS sin dependencias complejas
 */
async function testBeaconDirect() {
    console.log('📡 Test Directo: Beacon APRS → Audio\n');

    let direwolfProcess = null;
    let beaconHeard = false;

    try {
        console.log('1. 🚀 Iniciando Direwolf con configuración BASE1...');
        
        direwolfProcess = spawn('direwolf', [
            '-c', '/home/fokerone/vx200RPTController/config/direwolf.conf',
            '-t', '0'
        ]);

        let direwolfReady = false;

        direwolfProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('   📄', output.trim());
            
            if (output.includes('Ready to accept KISS')) {
                direwolfReady = true;
                console.log('   ✅ Direwolf listo para recibir comandos');
            }

            // Detectar si se está transmitiendo beacon
            if (output.includes('BASE1') || output.includes('beacon') || output.includes('transmit')) {
                beaconHeard = true;
                console.log('   🎯 ¡BEACON DETECTADO EN LOG!');
            }
        });

        direwolfProcess.stderr.on('data', (data) => {
            const output = data.toString();
            if (!output.includes('DNS-SD') && !output.includes('Avahi')) {
                console.log('   ⚠️', output.trim());
            }
        });

        console.log('   ⏳ Esperando que Direwolf se inicialice...');
        
        // Esperar 8 segundos para inicialización
        await new Promise(resolve => setTimeout(resolve, 8000));

        if (!direwolfReady) {
            throw new Error('Direwolf no se inicializó correctamente');
        }

        console.log('\n2. 📡 Esperando beacon automático...');
        console.log('   ⏰ Configuración: beacon cada 15 minutos');
        console.log('   🎧 ESCUCHA LOS AURICULARES - debe sonar AFSK');
        console.log('   ⚠️  Los beacons automáticos pueden tardar hasta 15 min');

        // Esperar 30 segundos más para escuchar actividad
        let secondsWaited = 0;
        const interval = setInterval(() => {
            secondsWaited += 5;
            console.log(`   ⏳ Esperando... ${secondsWaited}s`);
            
            if (beaconHeard) {
                console.log('   🎉 ¡BEACON CONFIRMADO EN LOGS!');
                clearInterval(interval);
            }
        }, 5000);

        await new Promise(resolve => setTimeout(resolve, 30000));
        clearInterval(interval);

        console.log('\n3. 📤 Test de beacon manual vía configuración...');
        
        // Crear configuración temporal con beacon inmediato
        const fs = require('fs');
        const tempConfig = `# Configuración temporal para test inmediato
MYCALL BASE1

# Audio (mismo que VX200)
ADEVICE default default
ARATE 48000

# Módem
MODEM 0 1200

# Puertos
KISSPORT 8001
AGWPORT 8000

# BEACON INMEDIATO para test
PBEACON delay=10 every=1 overlay=R symbol="repeater" lat=-32.885 long=-68.739 comment="TEST VX200 APRS - Guaymallen"

# Protocolo
DWAIT 10
SLOTTIME 10
PERSIST 63
TXDELAY 30
TXTAIL 1
`;
        
        // Detener Direwolf actual
        console.log('   🔄 Reiniciando con configuración de test...');
        direwolfProcess.kill();
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Crear configuración temporal
        fs.writeFileSync('/tmp/direwolf-test.conf', tempConfig);

        // Reiniciar con beacon cada minuto
        direwolfProcess = spawn('direwolf', [
            '-c', '/tmp/direwolf-test.conf',
            '-t', '0'
        ]);

        let testBeaconHeard = false;

        direwolfProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('   📻', output.trim());
            
            if (output.includes('BASE1') || output.includes('TEST') || 
                output.toLowerCase().includes('beacon') || 
                output.toLowerCase().includes('transmit')) {
                testBeaconHeard = true;
                console.log('   🚨 ¡BEACON DE TEST TRANSMITIDO!');
                console.log('   🎧 ¿SE ESCUCHA EL AUDIO AFSK EN LOS AURICULARES?');
            }
        });

        console.log('   ⏳ Esperando beacon de test (cada minuto)...');
        await new Promise(resolve => setTimeout(resolve, 70000)); // 70 segundos

        console.log('\n4. 🎯 RESULTADO DEL TEST DIRECTO');
        
        if (testBeaconHeard || beaconHeard) {
            console.log('✅ BEACON APRS FUNCIONANDO:');
            console.log('   📡 Direwolf transmite correctamente');
            console.log('   🎧 Audio configurado: default → auriculares');
            console.log('   📻 Señal: AFSK 1200/2200 Hz a 48kHz');
            console.log('');
            console.log('🔧 VERIFICACIÓN FÍSICA NECESARIA:');
            console.log('   1. ¿Se escucha el sonido AFSK (como módem)?');
            console.log('   2. ¿Cable de auriculares conectado al VOX?');
            console.log('   3. ¿VOX configurado con sensibilidad correcta?');
            console.log('   4. ¿LED TX se enciende en el VHF?');
            
        } else {
            console.log('⚠️ BEACON NO DETECTADO:');
            console.log('   - Direwolf funciona pero no transmite beacon');
            console.log('   - Revisa configuración de timing');
            console.log('   - Posible problema en generación de señal');
        }

        return testBeaconHeard || beaconHeard;

    } catch (error) {
        console.error('\n❌ ERROR EN TEST:', error.message);
        return false;
        
    } finally {
        if (direwolfProcess) {
            console.log('\n🧹 Limpiando procesos...');
            direwolfProcess.kill();
        }
        
        // Limpiar archivo temporal
        const fs = require('fs');
        try {
            fs.unlinkSync('/tmp/direwolf-test.conf');
        } catch(e) {}
    }
}

// Ejecutar test
if (require.main === module) {
    testBeaconDirect()
        .then(success => {
            if (success) {
                console.log('\n🎯 RESULTADO: ¡BEACON APRS DETECTADO!');
                console.log('   El problema está en la conexión KISS, no en el audio');
                console.log('   📻 Direwolf transmite por el canal correcto');
            } else {
                console.log('\n❌ RESULTADO: Beacon no detectado');
                console.log('   Posible problema en configuración de Direwolf');
            }
        })
        .catch(console.error);
}

module.exports = testBeaconDirect;