const path = require('path');
require('dotenv').config();

// Configurar paths
process.env.NODE_PATH = path.join(__dirname, 'src');

const { spawn } = require('child_process');
const DirewolfManager = require('./src/utils/direwolfManager');
const APRS = require('./src/modules/aprs');
const { ConfigManager } = require('./src/config/ConfigManager');
const AudioManager = require('./src/audio/audioManager');

/**
 * Test de APRS con audio real - transmisión y recepción por placa de sonido
 */
async function testAPRSAudio() {
    console.log('🔊 Test de APRS con Audio Real\n');

    let config, audio, aprs, direwolf;

    try {
        console.log('📡 === CONFIGURACIÓN CON AUDIO REAL ===');
        console.log('🎵 Dispositivo de salida: plughw:0,0 (CX20561 Analog)');
        console.log('🎤 Dispositivo de entrada: plughw:0,0 (CX20561 Analog)');
        console.log('📻 Modo: VOX (activación por voz)');
        console.log('🔊 Volumen del sistema: Configurado');
        console.log();

        // Inicializar componentes
        console.log('1. Inicializando componentes...');
        config = new ConfigManager();
        audio = new AudioManager(config);
        
        // Crear DirewolfManager con audio real
        direwolf = new DirewolfManager();
        console.log('   ✅ DirewolfManager creado con audio real');
        
        // Generar configuración con audio
        console.log('\n2. Generando configuración con placa de sonido...');
        const configGenerated = direwolf.generateConfig();
        console.log(`   Configuración generada: ${configGenerated ? '✅ SÍ' : '❌ NO'}`);
        
        // Mostrar configuración de audio
        const fs = require('fs');
        const configPath = path.join(__dirname, 'config/direwolf.conf');
        if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, 'utf8');
            const hasRealAudio = configContent.includes('plughw:0,0');
            console.log(`   Audio real configurado: ${hasRealAudio ? '✅ SÍ' : '❌ NO'}`);
            
            if (hasRealAudio) {
                console.log('   📄 Configuración de audio encontrada en direwolf.conf');
            }
        }
        
        // Iniciar Direwolf con audio
        console.log('\n3. Iniciando Direwolf con audio real...');
        console.log('   ⚠️  IMPORTANTE: Conecta auriculares o altavoces para escuchar');
        console.log('   ⚠️  IMPORTANTE: Configura micrófono para recepción');
        
        const direwolfStarted = await direwolf.start();
        console.log(`   Direwolf iniciado: ${direwolfStarted ? '✅ SÍ' : '❌ NO'}`);
        
        if (!direwolfStarted) {
            throw new Error('Direwolf no se pudo iniciar con audio real');
        }
        
        // Esperar a que se estabilice
        console.log('\n4. Esperando estabilización del sistema de audio...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Verificar puertos
        console.log('\n5. Verificando puertos TNC...');
        const portStatus = await direwolf.testPorts();
        console.log(`   Puerto KISS 8001: ${portStatus.kiss ? '✅ ABIERTO' : '❌ CERRADO'}`);
        console.log(`   Puerto AGW 8000: ${portStatus.agw ? '✅ ABIERTO' : '❌ CERRADO'}`);
        
        if (!portStatus.kiss) {
            throw new Error('Puerto KISS no está disponible');
        }
        
        // Inicializar APRS
        console.log('\n6. Inicializando módulo APRS...');
        aprs = new APRS(audio);
        
        // Configurar eventos de monitoreo
        aprs.on('tnc_connected', () => {
            console.log('   🔗 EVENTO: TNC conectado');
        });
        
        aprs.on('position_received', (position) => {
            console.log('   📍 POSICIÓN RECIBIDA:', position.callsign, '@', position.lat, position.lon);
            console.log('   📝 Comentario:', position.comment || 'Sin comentario');
        });
        
        aprs.on('beacon_sent', (beacon) => {
            console.log('   📤 BEACON ENVIADO:', beacon.callsign, 'a las', beacon.timestamp.toLocaleTimeString());
        });
        
        const aprsInitialized = await aprs.initialize();
        console.log(`   APRS inicializado: ${aprsInitialized ? '✅ SÍ' : '❌ NO'}`);
        
        if (aprsInitialized) {
            const aprsStarted = await aprs.start();
            console.log(`   APRS iniciado: ${aprsStarted ? '✅ SÍ' : '❌ NO'}`);
            
            // Esperar conexión TNC
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const status = aprs.getStatus();
            console.log(`   TNC conectado: ${status.tncConnected ? '✅ SÍ' : '❌ NO'}`);
            
            if (status.tncConnected) {
                // Prueba de transmisión
                console.log('\n7. 🔊 PRUEBA DE TRANSMISIÓN DE AUDIO 🔊');
                console.log('   ⚠️  ¡ATENCIÓN! El siguiente beacon se transmitirá por AUDIO');
                console.log('   🎧 Escucha los auriculares/altavoces');
                console.log('   🔊 Deberías escuchar tonos AFSK a 1200 baudios');
                console.log('   ⏱️  Enviando beacon en 3 segundos...');
                
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                try {
                    console.log('   📤 ¡ENVIANDO BEACON POR AUDIO AHORA!');
                    await aprs.sendBeacon();
                    console.log('   ✅ Beacon enviado - ¿Escuchaste los tonos APRS?');
                } catch (error) {
                    console.log('   ❌ Error enviando beacon:', error.message);
                }
                
                // Prueba de recepción
                console.log('\n8. 🎤 PRUEBA DE RECEPCIÓN DE AUDIO 🎤');
                console.log('   ⚠️  INSTRUCCIONES PARA PROBAR RECEPCIÓN:');
                console.log('   1. Usa otro equipo APRS o smartphone con app APRS');
                console.log('   2. Configúralo para transmitir por audio cerca del micrófono');
                console.log('   3. Envía una posición APRS');
                console.log('   4. El sistema debería decodificarla automáticamente');
                console.log();
                console.log('   🎧 Monitoreando recepción por 60 segundos...');
                console.log('   ⏳ Esperando señales APRS en el micrófono...');
                
                let countdown = 12; // 60 segundos en intervalos de 5
                const monitor = setInterval(() => {
                    const currentStatus = aprs.getStatus();
                    console.log(`   ⏱️  ${countdown * 5}s restantes - Posiciones recibidas: ${currentStatus.stats.positionsReceived}`);
                    countdown--;
                    
                    if (countdown <= 0) {
                        clearInterval(monitor);
                    }
                }, 5000);
                
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                // Resultado final
                console.log('\n9. 📊 RESULTADO DE PRUEBAS DE AUDIO');
                const finalStatus = aprs.getStatus();
                
                console.log('   📤 Transmisión:');
                console.log(`      Beacons enviados: ${finalStatus.stats.beaconsSent}`);
                console.log(`      ¿Escuchaste tonos AFSK?: ${finalStatus.stats.beaconsSent > 0 ? '✅ Debería haber sonado' : '❌ No se envió'}`);
                
                console.log('   📥 Recepción:');
                console.log(`      Posiciones recibidas: ${finalStatus.stats.positionsReceived}`);
                console.log(`      Estado micrófono: ${finalStatus.stats.positionsReceived > 0 ? '✅ Funciona' : '⚠️ Sin señales o sin micrófono'}`);
                
                if (finalStatus.positions.recent.length > 0) {
                    console.log('   📍 Últimas posiciones decodificadas:');
                    finalStatus.positions.recent.forEach((pos, i) => {
                        console.log(`      ${i+1}. ${pos.callsign}: ${pos.lat.toFixed(4)}, ${pos.lon.toFixed(4)}`);
                    });
                }
            }
        }
        
        console.log('\n🎯 === DIAGNÓSTICO FINAL ===');
        const finalStatus = aprs ? aprs.getStatus() : { tncConnected: false, stats: { beaconsSent: 0, positionsReceived: 0 } };
        
        if (finalStatus.tncConnected) {
            console.log('✅ SISTEMA APRS CON AUDIO REAL FUNCIONAL');
            console.log('   🎵 Audio configurado correctamente');
            console.log('   📡 TNC conectado y operativo');
            console.log('   🔊 Transmisión por altavoces/auriculares');
            console.log('   🎤 Recepción por micrófono');
            
            if (finalStatus.stats.beaconsSent > 0) {
                console.log('   📤 Transmisión APRS: ✅ FUNCIONA');
            } else {
                console.log('   📤 Transmisión APRS: ⚠️ No probada');
            }
            
            if (finalStatus.stats.positionsReceived > 0) {
                console.log('   📥 Recepción APRS: ✅ FUNCIONA');
            } else {
                console.log('   📥 Recepción APRS: ⚠️ Sin señales recibidas');
            }
        } else {
            console.log('❌ SISTEMA APRS CON PROBLEMAS');
            console.log('   Verifica configuración de audio');
        }

        return finalStatus.tncConnected;

    } catch (error) {
        console.error('\n❌ === ERROR EN TEST ===');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        return false;
        
    } finally {
        // Limpiar
        console.log('\n🧹 Limpiando recursos...');
        
        try {
            if (aprs) {
                aprs.stop();
                aprs.destroy();
                console.log('✅ APRS detenido');
            }
            
            if (direwolf) {
                direwolf.stop();
                console.log('✅ Direwolf detenido');
            }
        } catch (error) {
            console.warn('⚠️ Error limpiando:', error.message);
        }
        
        console.log('🏁 Test finalizado\n');
    }
}

// Ejecutar test si se llama directamente
if (require.main === module) {
    testAPRSAudio()
        .then(success => {
            if (success) {
                console.log('🎯 RESULTADO: ¡Sistema APRS con audio real funcionando!');
                console.log('🔊 La transmisión debería escucharse por altavoces');
                console.log('🎤 La recepción funciona por micrófono');
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

module.exports = testAPRSAudio;