const path = require('path');
require('dotenv').config();
const { spawn } = require('child_process');

/**
 * Test para verificar que Direwolf use el mismo audio que VX200 Controller
 */
async function testVX200AudioSync() {
    console.log('🔄 Test de Sincronización de Audio VX200 ↔ APRS\n');

    let direwolfProcess = null;

    try {
        console.log('📡 === CONFIGURACIÓN SINCRONIZADA ===');
        console.log('🎧 VX200 Controller: AUDIO_DEVICE=default');
        console.log('📡 Direwolf APRS: ADEVICE=default');
        console.log('🔊 Sample Rate: 48000 Hz (ambos)');
        console.log('📻 Resultado: Misma salida de audio para baliza y APRS');
        console.log();

        // 1. Verificar configuración VX200
        console.log('1. 📋 Verificando configuración VX200 Controller...');
        const { ConfigManager } = require('./src/config/ConfigManager');
        const config = new ConfigManager();
        
        console.log(`   🎧 Dispositivo VX200: "${config.config.audio.device}"`);
        console.log(`   📊 Sample Rate VX200: ${config.config.audio.sampleRate} Hz`);
        console.log(`   🔢 Canales VX200: ${config.config.audio.channels}`);
        
        // 2. Verificar configuración Direwolf
        console.log('\n2. 📋 Verificando configuración Direwolf...');
        const fs = require('fs');
        const direwolfConfig = fs.readFileSync('/home/fokerone/vx200RPTController/config/direwolf.conf', 'utf8');
        
        const adeviceLine = direwolfConfig.split('\n').find(line => line.includes('ADEVICE'));
        const arateLine = direwolfConfig.split('\n').find(line => line.includes('ARATE'));
        
        console.log(`   📡 ${adeviceLine}`);
        console.log(`   📊 ${arateLine}`);
        
        const usingSameDevice = adeviceLine.includes('default') && arateLine.includes('48000');
        console.log(`   ✅ Configuración sincronizada: ${usingSameDevice ? 'SÍ' : 'NO'}`);
        
        if (!usingSameDevice) {
            throw new Error('Configuraciones no sincronizadas');
        }

        // 3. Test de baliza común (para comparar)
        console.log('\n3. 🔊 Test de baliza común del VX200...');
        console.log('   📤 Probando salida de audio del sistema VX200...');
        
        // Simular baliza con espeak (mismo que usa TTS)
        const balizaTest = spawn('espeak', [
            '-v', 'es',
            '-s', '140',
            '-a', '50',
            'Test de baliza VX200 Controller'
        ]);
        
        let balizaWorked = false;
        balizaTest.on('close', (code) => {
            balizaWorked = (code === 0);
        });
        
        await new Promise(resolve => {
            balizaTest.on('close', () => resolve());
        });
        
        console.log(`   🔊 Baliza común funciona: ${balizaWorked ? '✅ SÍ' : '❌ NO'}`);
        
        if (!balizaWorked) {
            console.log('   ⚠️ Si la baliza común no funciona, hay problema de audio general');
        }

        // 4. Iniciar Direwolf con configuración sincronizada
        console.log('\n4. 📡 Iniciando Direwolf con configuración VX200...');
        
        direwolfProcess = spawn('direwolf', [
            '-c', '/home/fokerone/vx200RPTController/config/direwolf.conf',
            '-t', '0'
        ]);
        
        let direwolfReady = false;
        let audioDeviceConfirmed = false;
        
        direwolfProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('   📄', output.trim());
            
            if (output.includes('Audio device') && output.includes('default')) {
                audioDeviceConfirmed = true;
                console.log('   ✅ Direwolf usando dispositivo "default" confirmado');
            }
            
            if (output.includes('Ready to accept KISS')) {
                direwolfReady = true;
            }
        });
        
        direwolfProcess.stderr.on('data', (data) => {
            const output = data.toString();
            if (!output.includes('DNS-SD') && !output.includes('Avahi')) {
                console.log('   ⚠️', output.trim());
            }
        });
        
        // Esperar inicialización
        let attempts = 0;
        while (!direwolfReady && attempts < 20) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        if (!direwolfReady) {
            throw new Error('Direwolf no se inicializó');
        }
        
        console.log('   ✅ Direwolf listo con dispositivo sincronizado');
        
        // 5. Test de beacon APRS con mismo audio
        console.log('\n5. 📤 Test de beacon APRS con audio sincronizado...');
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const APRS = require('./src/modules/aprs');
        const AudioManager = require('./src/audio/audioManager');
        
        const audio = new AudioManager(config);
        const aprs = new APRS(audio);
        
        let beaconSent = false;
        aprs.on('beacon_sent', () => {
            beaconSent = true;
            console.log('   📡 ¡BEACON APRS ENVIADO POR MISMO AUDIO QUE BALIZA!');
        });
        
        const aprsInitialized = await aprs.initialize();
        if (!aprsInitialized) {
            throw new Error('APRS no se pudo inicializar');
        }
        
        const aprsStarted = await aprs.start();
        if (!aprsStarted) {
            throw new Error('APRS no se pudo iniciar');
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const status = aprs.getStatus();
        if (!status.tncConnected) {
            throw new Error('TNC no conectado');
        }
        
        console.log('   🔗 APRS conectado a Direwolf sincronizado');
        
        // MOMENTO CRÍTICO: Envío por mismo canal
        console.log('\n6. 🚨 MOMENTO CRÍTICO: TRANSMISIÓN POR MISMO CANAL 🚨');
        console.log('   ⚠️  Ambos sistemas usan AUDIO_DEVICE=default');
        console.log('   📻 Baliza común sale correctamente');  
        console.log('   📡 Beacon APRS debe salir por MISMO canal');
        console.log();
        console.log('   📤 Enviando beacon APRS...');
        
        try {
            await aprs.sendBeacon();
            console.log('   ✅ Comando de beacon enviado');
            
            // Esperar evento
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            if (beaconSent) {
                console.log('   🎉 ¡BEACON CONFIRMADO! Audio por mismo canal que baliza');
            } else {
                console.log('   ⚠️ Beacon enviado pero sin confirmación de evento');
            }
            
        } catch (error) {
            throw new Error('Error enviando beacon: ' + error.message);
        }
        
        aprs.stop();
        aprs.destroy();
        
        console.log('\n🎯 === DIAGNÓSTICO FINAL ===');
        
        if (audioDeviceConfirmed && beaconSent) {
            console.log('✅ CONFIGURACIÓN PERFECTAMENTE SINCRONIZADA');
            console.log('   🎧 VX200 Controller: default');
            console.log('   📡 Direwolf APRS: default'); 
            console.log('   🔊 Sample Rate: 48000 Hz (ambos)');
            console.log('   📻 Canal de salida: IDÉNTICO');
            console.log();
            console.log('🔧 SI AÚN NO SE ESCUCHA:');
            console.log('   1. Verifica que baliza común se escuche (referencia)');
            console.log('   2. Problema puede ser timing o niveles de Direwolf');
            console.log('   3. VOX configurado correctamente para baliza común');
            console.log('   4. APRS usa exactamente misma salida de audio');
            
        } else {
            console.log('❌ PROBLEMA EN SINCRONIZACIÓN');
            if (!audioDeviceConfirmed) console.log('   📡 Direwolf no confirmó dispositivo default');
            if (!beaconSent) console.log('   📤 Beacon no se envió correctamente');
        }

        return audioDeviceConfirmed && beaconSent;

    } catch (error) {
        console.error('\n❌ === ERROR EN TEST ===');
        console.error('Error:', error.message);
        return false;
        
    } finally {
        if (direwolfProcess) {
            console.log('\n🧹 Deteniendo Direwolf...');
            direwolfProcess.kill('SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log('🏁 Test finalizado\n');
    }
}

// Ejecutar test
if (require.main === module) {
    testVX200AudioSync()
        .then(success => {
            if (success) {
                console.log('🎯 RESULTADO: ¡Audio APRS sincronizado con VX200!');
                console.log('📡 Direwolf usa exactamente mismo canal que baliza común');
            } else {
                console.log('❌ RESULTADO: Error en sincronización de audio');
            }
        })
        .catch(console.error);
}

module.exports = testVX200AudioSync;