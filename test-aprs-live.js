const path = require('path');
require('dotenv').config();

// Configurar paths
process.env.NODE_PATH = path.join(__dirname, 'src');

const APRS = require('./src/modules/aprs');
const { ConfigManager } = require('./src/config/ConfigManager');
const AudioManager = require('./src/audio/audioManager');

/**
 * Test en vivo del módulo APRS con Direwolf corriendo
 */
async function testAPRSLive() {
    console.log('🔴 Test APRS en VIVO\n');

    let config, audio, aprs;

    try {
        console.log('📡 === INICIALIZACIÓN APRS ===');
        
        // Inicializar componentes
        console.log('1. Inicializando componentes...');
        config = new ConfigManager();
        audio = new AudioManager(config);
        aprs = new APRS(audio);
        
        console.log('✅ Componentes creados');

        // Configurar eventos para monitoreo
        aprs.on('tnc_connected', () => {
            console.log('🔗 EVENTO: TNC conectado!');
        });
        
        aprs.on('tnc_disconnected', () => {
            console.log('🔌 EVENTO: TNC desconectado!');
        });
        
        aprs.on('position_received', (position) => {
            console.log('📍 EVENTO: Posición recibida:', position.callsign, '@', position.lat, position.lon);
        });
        
        aprs.on('beacon_sent', (beacon) => {
            console.log('📤 EVENTO: Beacon enviado:', beacon.callsign);
        });

        // Inicializar APRS
        console.log('\n2. Inicializando módulo APRS...');
        const initialized = await aprs.initialize();
        console.log(`   Inicializado: ${initialized ? '✅ SÍ' : '❌ NO'}`);
        
        if (!initialized) {
            throw new Error('No se pudo inicializar APRS');
        }

        // Iniciar APRS  
        console.log('\n3. Iniciando módulo APRS...');
        const started = await aprs.start();
        console.log(`   Iniciado: ${started ? '✅ SÍ' : '❌ NO'}`);
        
        // Esperar un momento para que se establezca la conexión
        console.log('\n4. Esperando establecimiento de conexión TNC...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Verificar estado
        console.log('\n5. Verificando estado APRS...');
        const status = aprs.getStatus();
        console.log(`   TNC Conectado: ${status.tncConnected ? '✅ SÍ' : '❌ NO'}`);
        console.log(`   Callsign: ${status.config.callsign}`);
        console.log(`   Beacon habilitado: ${status.config.beaconEnabled}`);
        console.log(`   Posiciones recibidas: ${status.stats.positionsReceived}`);
        console.log(`   Beacons enviados: ${status.stats.beaconsSent}`);
        
        // Probar envío de beacon
        if (status.tncConnected) {
            console.log('\n6. Probando envío de beacon...');
            try {
                await aprs.sendBeacon();
                console.log('   ✅ Beacon enviado correctamente');
            } catch (error) {
                console.log('   ❌ Error enviando beacon:', error.message);
            }
        }
        
        // Monitorear por 30 segundos
        console.log('\n7. Monitoreando actividad APRS por 30 segundos...');
        console.log('   (Emita una posición APRS para probar recepción)');
        
        let countdown = 30;
        const monitor = setInterval(() => {
            console.log(`   ⏳ ${countdown}s restantes...`);
            countdown--;
            
            // Mostrar estado actualizado
            const currentStatus = aprs.getStatus();
            if (currentStatus.stats.positionsReceived > status.stats.positionsReceived) {
                console.log('   📍 ¡Nueva posición recibida!');
            }
            
            if (countdown <= 0) {
                clearInterval(monitor);
            }
        }, 5000);
        
        await new Promise(resolve => setTimeout(resolve, 30000));
        
        // Estado final
        console.log('\n8. Estado final...');
        const finalStatus = aprs.getStatus();
        console.log(`   Posiciones recibidas: ${finalStatus.stats.positionsReceived}`);
        console.log(`   Beacons enviados: ${finalStatus.stats.beaconsSent}`);
        
        if (finalStatus.positions.recent.length > 0) {
            console.log('   📍 Últimas posiciones recibidas:');
            finalStatus.positions.recent.forEach(pos => {
                console.log(`      ${pos.callsign}: ${pos.lat}, ${pos.lon}`);
            });
        }
        
        console.log('\n🎯 === RESULTADO ===');
        if (finalStatus.tncConnected) {
            console.log('✅ SISTEMA APRS FUNCIONANDO CORRECTAMENTE');
            console.log('   🔗 TNC conectado');
            console.log('   📤 Beacons se pueden enviar');
            console.log('   📥 Listo para recibir posiciones');
        } else {
            console.log('⚠️ SISTEMA APRS CON LIMITACIONES');
            console.log('   🔌 TNC no conectado');
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
                console.log('✅ APRS detenido y destruido');
            }
        } catch (error) {
            console.warn('⚠️ Error limpiando:', error.message);
        }
        
        console.log('🏁 Test finalizado\n');
    }
}

// Ejecutar test si se llama directamente
if (require.main === module) {
    testAPRSLive()
        .then(success => {
            if (success) {
                console.log('🎯 RESULTADO: ¡Sistema APRS completamente funcional!');
                process.exit(0);
            } else {
                console.log('❌ RESULTADO: Sistema APRS con problemas');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Error fatal:', error.message);
            process.exit(1);
        });
}

module.exports = testAPRSLive;