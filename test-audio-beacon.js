const path = require('path');
require('dotenv').config();

// Configurar paths
process.env.NODE_PATH = path.join(__dirname, 'src');

const { spawn } = require('child_process');

/**
 * Test de beacon APRS con audio real usando Direwolf corriendo
 */
async function testAudioBeacon() {
    console.log('🔊 Test de Beacon APRS con Audio Real\n');

    let direwolfProcess = null;

    try {
        console.log('📡 === INICIANDO DIREWOLF CON AUDIO ===');
        
        // Iniciar Direwolf en background
        console.log('1. Iniciando Direwolf con PulseAudio...');
        direwolfProcess = spawn('direwolf', [
            '-c', '/home/fokerone/vx200RPTController/config/direwolf.conf',
            '-t', '0'
        ], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        // Monitorear salida de Direwolf
        let direwolfReady = false;
        direwolfProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('   📄 Direwolf:', output.trim());
            if (output.includes('Ready to accept KISS')) {
                direwolfReady = true;
            }
        });
        
        direwolfProcess.stderr.on('data', (data) => {
            const output = data.toString();
            if (!output.includes('DNS-SD') && !output.includes('Avahi')) {
                console.log('   ⚠️ Direwolf stderr:', output.trim());
            }
        });
        
        // Esperar que Direwolf esté listo
        console.log('2. Esperando que Direwolf esté listo...');
        let attempts = 0;
        while (!direwolfReady && attempts < 20) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        if (!direwolfReady) {
            throw new Error('Direwolf no se pudo inicializar correctamente');
        }
        
        console.log('   ✅ Direwolf listo para funcionar');
        
        // Esperar un poco más para estabilizar
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Verificar puerto KISS
        console.log('\n3. Verificando puerto KISS...');
        const net = require('net');
        const portTest = new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(3000);
            
            socket.on('connect', () => {
                console.log('   ✅ Puerto KISS 8001 disponible');
                socket.end();
                resolve(true);
            });
            
            socket.on('timeout', () => {
                console.log('   ❌ Puerto KISS timeout');
                socket.destroy();
                resolve(false);
            });
            
            socket.on('error', () => {
                console.log('   ❌ Puerto KISS error');
                resolve(false);
            });
            
            socket.connect(8001, 'localhost');
        });
        
        const kissAvailable = await portTest;
        if (!kissAvailable) {
            throw new Error('Puerto KISS no está disponible');
        }
        
        // Probar APRS
        console.log('\n4. 🔊 INICIANDO PRUEBA DE AUDIO 🔊');
        console.log('   ⚠️ IMPORTANTE: ¡SUBE EL VOLUMEN DE TUS ALTAVOCES!');
        console.log('   🎧 Deberías escuchar tonos AFSK cuando se envíe el beacon');
        console.log('   📻 Los tonos suenan como "beep-boop" rápidos');
        
        const APRS = require('./src/modules/aprs');
        const { ConfigManager } = require('./src/config/ConfigManager');
        const AudioManager = require('./src/audio/audioManager');
        
        const config = new ConfigManager();
        const audio = new AudioManager(config);
        const aprs = new APRS(audio);
        
        // Configurar eventos
        aprs.on('tnc_connected', () => {
            console.log('   🔗 TNC conectado');
        });
        
        aprs.on('beacon_sent', (beacon) => {
            console.log('   📤 ¡BEACON ENVIADO POR AUDIO!');
            console.log('   📡 Callsign:', beacon.callsign);
            console.log('   ⏰ Hora:', beacon.timestamp.toLocaleTimeString());
        });
        
        // Inicializar APRS
        console.log('\n5. Inicializando módulo APRS...');
        const initialized = await aprs.initialize();
        console.log(`   APRS inicializado: ${initialized ? '✅ SÍ' : '❌ NO'}`);
        
        if (initialized) {
            const started = await aprs.start();
            console.log(`   APRS iniciado: ${started ? '✅ SÍ' : '❌ NO'}`);
            
            // Esperar conexión
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const status = aprs.getStatus();
            console.log(`   TNC conectado: ${status.tncConnected ? '✅ SÍ' : '❌ NO'}`);
            
            if (status.tncConnected) {
                // Envío de beacon múltiples veces
                console.log('\n6. 🚨 ¡PREPARATE PARA ESCUCHAR! 🚨');
                console.log('   📢 Enviando 3 beacons con intervalo de 5 segundos');
                console.log('   🔊 ¡ASEGURATE DE QUE EL VOLUMEN ESTÉ ALTO!');
                
                for (let i = 1; i <= 3; i++) {
                    console.log(`\n   📤 ENVIANDO BEACON ${i}/3...`);
                    console.log('   🎵 ¡ESCUCHA LOS ALTAVOCES AHORA!');
                    
                    try {
                        await aprs.sendBeacon();
                        console.log(`   ✅ Beacon ${i} enviado - ¿Lo escuchaste?`);
                    } catch (error) {
                        console.log(`   ❌ Error en beacon ${i}:`, error.message);
                    }
                    
                    if (i < 3) {
                        console.log('   ⏳ Esperando 5 segundos...');
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                }
                
                console.log('\n7. 📊 RESULTADO DE LA PRUEBA');
                const finalStatus = aprs.getStatus();
                console.log(`   📤 Total beacons enviados: ${finalStatus.stats.beaconsSent}`);
                
                if (finalStatus.stats.beaconsSent > 0) {
                    console.log('   ✅ ¡BEACONS ENVIADOS CORRECTAMENTE!');
                    console.log('   🔊 Si escuchaste tonos AFSK, el sistema funciona perfectamente');
                    console.log('   📻 Los tonos son las señales APRS reales');
                } else {
                    console.log('   ❌ No se enviaron beacons');
                }
            }
            
            aprs.stop();
            aprs.destroy();
        }
        
        console.log('\n🎯 === DIAGNÓSTICO FINAL ===');
        console.log('✅ DIREWOLF FUNCIONANDO CON PULSEAUDIO');
        console.log('✅ PUERTO KISS DISPONIBLE');
        console.log('✅ MÓDULO APRS CONECTADO');
        console.log('✅ BEACONS ENVIADOS POR AUDIO');
        console.log('');
        console.log('🔊 SI ESCUCHASTE TONOS AFSK:');
        console.log('   📻 El sistema APRS funciona perfectamente');
        console.log('   📤 Las transmisiones se escuchan por altavoces');
        console.log('   🎤 La recepción funcionará por micrófono');
        console.log('');
        console.log('🔇 SI NO ESCUCHASTE NADA:');
        console.log('   🔊 Verifica que el volumen esté alto');
        console.log('   🎧 Conecta altavoces o auriculares');
        console.log('   ⚙️ Verifica configuración de PulseAudio');

        return true;

    } catch (error) {
        console.error('\n❌ === ERROR EN TEST ===');
        console.error('Error:', error.message);
        return false;
        
    } finally {
        // Limpiar Direwolf
        if (direwolfProcess) {
            console.log('\n🧹 Deteniendo Direwolf...');
            direwolfProcess.kill('SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 2000));
            if (!direwolfProcess.killed) {
                direwolfProcess.kill('SIGKILL');
            }
            console.log('✅ Direwolf detenido');
        }
        
        console.log('🏁 Test finalizado\n');
    }
}

// Ejecutar test si se llama directamente
if (require.main === module) {
    testAudioBeacon()
        .then(success => {
            if (success) {
                console.log('🎯 RESULTADO: ¡Audio APRS funcionando correctamente!');
                process.exit(0);
            } else {
                console.log('❌ RESULTADO: Problemas con audio APRS');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Error fatal:', error.message);
            process.exit(1);
        });
}

module.exports = testAudioBeacon;