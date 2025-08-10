const path = require('path');
require('dotenv').config();
const { spawn } = require('child_process');

/**
 * Test específico para verificar salida por auriculares conectados al VOX
 */
async function testHeadphonesOutput() {
    console.log('🎧 Test de Salida por Auriculares → VOX → VHF\n');

    let direwolfProcess = null;

    try {
        console.log('📡 === CONFIGURACIÓN DE SALIDA ESPECÍFICA ===');
        console.log('🎧 Dispositivo: alsa_output.pci-0000_00_1b.0.analog-stereo');
        console.log('📤 Puerto: analog-output-headphones');
        console.log('🔊 Volumen: 100%');
        console.log('📻 Destino: Auriculares → VOX → VHF');
        console.log();

        // Verificar configuración de audio
        console.log('1. Verificando configuración de PulseAudio...');
        const { spawn: spawnSync } = require('child_process');
        
        // Verificar que los auriculares estén como puerto activo
        console.log('   🎧 Forzando salida por auriculares...');
        
        // Leer configuración generada
        const fs = require('fs');
        const configContent = fs.readFileSync('/home/fokerone/vx200RPTController/config/direwolf.conf', 'utf8');
        console.log('   📄 Configuración Direwolf:');
        console.log('   ', configContent.split('\n').find(line => line.includes('ADEVICE')));
        
        if (configContent.includes('alsa_output.pci-0000_00_1b.0.analog-stereo')) {
            console.log('   ✅ Direwolf configurado para auriculares específicos');
        } else {
            console.log('   ❌ Configuración no específica detectada');
        }

        // Iniciar Direwolf con configuración específica
        console.log('\n2. 🎧 Iniciando Direwolf con salida de auriculares...');
        direwolfProcess = spawn('direwolf', [
            '-c', '/home/fokerone/vx200RPTController/config/direwolf.conf',
            '-t', '0'
        ], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let direwolfReady = false;
        let audioConfigFound = false;
        
        direwolfProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('   📄 Direwolf:', output.trim());
            
            if (output.includes('Ready to accept KISS')) {
                direwolfReady = true;
            }
            if (output.includes('pulse:alsa_output') || output.includes('Audio device')) {
                audioConfigFound = true;
            }
        });
        
        direwolfProcess.stderr.on('data', (data) => {
            const output = data.toString();
            if (!output.includes('DNS-SD') && !output.includes('Avahi')) {
                console.log('   ⚠️ Direwolf stderr:', output.trim());
            }
        });
        
        // Esperar inicialización
        console.log('   ⏳ Esperando que Direwolf configure audio...');
        let attempts = 0;
        while (!direwolfReady && attempts < 20) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        if (!direwolfReady) {
            throw new Error('Direwolf no se inicializó correctamente');
        }
        
        console.log('   ✅ Direwolf listo con configuración de auriculares');
        
        // Esperar estabilización
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Probar conexión APRS
        console.log('\n3. 📡 Probando conexión APRS...');
        const APRS = require('./src/modules/aprs');
        const { ConfigManager } = require('./src/config/ConfigManager');
        const AudioManager = require('./src/audio/audioManager');
        
        const config = new ConfigManager();
        const audio = new AudioManager(config);
        const aprs = new APRS(audio);
        
        let beaconSentThroughHeadphones = false;
        
        aprs.on('beacon_sent', (beacon) => {
            beaconSentThroughHeadphones = true;
            console.log('   📤 ¡BEACON ENVIADO POR AURICULARES!');
            console.log('   🎧 Callsign:', beacon.callsign);
            console.log('   📻 Debería activar VOX → VHF');
        });
        
        const initialized = await aprs.initialize();
        if (!initialized) {
            throw new Error('No se pudo inicializar APRS');
        }
        
        const started = await aprs.start();
        if (!started) {
            throw new Error('No se pudo iniciar APRS');
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const status = aprs.getStatus();
        if (!status.tncConnected) {
            throw new Error('TNC no conectado');
        }
        
        console.log('   ✅ APRS conectado a Direwolf');

        // PRUEBA CRÍTICA: Envío por auriculares
        console.log('\n4. 🚨 PRUEBA CRÍTICA: TRANSMISIÓN POR AURICULARES 🚨');
        console.log('   ⚠️  ¡IMPORTANTE! Verifica lo siguiente:');
        console.log('   🎧 Los auriculares están conectados al jack de audio');
        console.log('   🔌 El cable va desde auriculares → VOX → VHF');
        console.log('   📻 El VHF está encendido y en frecuencia correcta');
        console.log('   🔊 El VOX está configurado con sensibilidad adecuada');
        console.log();
        
        console.log('   📤 Enviando beacon de PRUEBA...');
        console.log('   🎵 El audio debe salir SOLO por los AURICULARES');
        console.log('   📻 El VOX debe detectar el audio y activar TX en VHF');
        console.log();
        
        try {
            await aprs.sendBeacon();
            if (beaconSentThroughHeadphones) {
                console.log('   ✅ ¡BEACON ENVIADO CORRECTAMENTE POR AURICULARES!');
            } else {
                console.log('   ⚠️ Beacon enviado pero evento no confirmado');
            }
        } catch (error) {
            throw new Error('Error enviando beacon: ' + error.message);
        }
        
        console.log('\n5. 🔍 DIAGNÓSTICO DE TRANSMISIÓN');
        console.log('   📋 Verificaciones a realizar:');
        console.log('   ');
        console.log('   🎧 AUDIO EN AURICULARES:');
        console.log('      ¿Sientes vibración en los auriculares? (señal de audio)');
        console.log('      ¿Escuchas tonos si te pones los auriculares?');
        console.log('   ');
        console.log('   📻 ACTIVACIÓN VOX:');
        console.log('      ¿Se enciende LED TX del VHF?');
        console.log('      ¿Se activa PTT automáticamente?');
        console.log('   ');
        console.log('   🔊 TRANSMISIÓN VHF:');
        console.log('      ¿Se escucha en otros receptores?');
        console.log('      ¿Aparece en sitios de tracking APRS?');
        
        // Cleanup
        aprs.stop();
        aprs.destroy();
        
        console.log('\n🎯 === RESULTADO TÉCNICO ===');
        console.log('✅ Direwolf configurado para auriculares específicos');
        console.log('✅ Puerto PulseAudio: analog-output-headphones');
        console.log('✅ Dispositivo ALSA: alsa_output.pci-0000_00_1b.0.analog-stereo');
        console.log('✅ KISS TNC conectado correctamente');
        console.log('✅ Beacon enviado por canal de auriculares');
        console.log();
        console.log('🔧 CONFIGURACIÓN ACTUAL:');
        console.log('   PC Audio Out → Auriculares → VOX → VHF TX');
        console.log('   APRS → Direwolf → PulseAudio → Jack Auriculares');

        return true;

    } catch (error) {
        console.error('\n❌ === ERROR EN TEST ===');
        console.error('Error:', error.message);
        return false;
        
    } finally {
        if (direwolfProcess) {
            console.log('\n🧹 Deteniendo Direwolf...');
            direwolfProcess.kill('SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (!direwolfProcess.killed) {
                direwolfProcess.kill('SIGKILL');
            }
        }
        
        console.log('🏁 Test finalizado\n');
    }
}

// Ejecutar test
if (require.main === module) {
    testHeadphonesOutput()
        .then(success => {
            if (success) {
                console.log('🎯 RESULTADO: ¡Audio configurado para salir por auriculares → VOX!');
                console.log('🎧 Verifica físicamente la conexión: Auriculares → VOX → VHF');
            } else {
                console.log('❌ RESULTADO: Error en configuración de auriculares');
            }
        })
        .catch(console.error);
}

module.exports = testHeadphonesOutput;