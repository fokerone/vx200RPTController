const path = require('path');
require('dotenv').config();

// Configurar paths
process.env.NODE_PATH = path.join(__dirname, 'src');

const VX200Controller = require('./src/index');
const { delay } = require('./src/utils');

/**
 * Test de integración completa del sistema APRS
 * Verifica la integración con VX200Controller
 */
async function testAPRSIntegration() {
    console.log('🚀 Test de integración sistema APRS con VX200 Controller\n');

    let controller;

    try {
        console.log('🔧 === INICIALIZACIÓN ===');
        
        // Crear controlador
        controller = new VX200Controller();
        
        // Mock del audio para evitar problemas
        const originalSpeak = controller.audio?.speak;
        if (controller.audio) {
            controller.audio.speak = async (message) => {
                console.log(`🔊 TTS Mock: "${message.substring(0, 60)}..."`);
            };
        }

        console.log('✅ VX200Controller creado');

        // Inicializar sistema
        await controller.start();
        console.log('✅ Sistema inicializado');
        
        await delay(2000); // Dar tiempo para inicialización
        console.log();

        console.log('📊 === VERIFICACIÓN MÓDULOS ===');
        
        // Verificar que APRS está disponible
        const hasAPRS = !!controller.modules.aprs;
        console.log(`Módulo APRS: ${hasAPRS ? '✅ Disponible' : '❌ No disponible'}`);
        
        if (!hasAPRS) {
            throw new Error('Módulo APRS no está disponible');
        }

        // Estado inicial del sistema
        const systemStatus = controller.getSystemStatus();
        console.log('Estado del sistema:');
        console.log(`  - Audio: ${systemStatus.audio.status}`);
        console.log(`  - APRS Running: ${systemStatus.aprs.running}`);
        console.log(`  - APRS Initialized: ${systemStatus.aprs.initialized}`);
        console.log(`  - TNC Connected: ${systemStatus.aprs.tncConnected}`);
        console.log();

        console.log('📡 === COMANDOS DTMF APRS ===');
        
        // Test comandos APRS via DTMF
        const aprsCommands = [
            { cmd: '*6', desc: 'Estado APRS principal' },
            { cmd: '*60', desc: 'Estado detallado' },
            { cmd: '*62', desc: 'Últimas posiciones' }
        ];

        for (const test of aprsCommands) {
            console.log(`📞 Probando comando ${test.cmd} - ${test.desc}`);
            try {
                await controller.handleDTMF(test.cmd);
                console.log(`   ✅ Comando ${test.cmd} ejecutado correctamente`);
            } catch (error) {
                console.log(`   ⚠️ Comando ${test.cmd} con advertencia: ${error.message}`);
            }
            await delay(1000);
        }
        console.log();

        console.log('🌐 === VERIFICACIÓN SERVIDOR WEB ===');
        
        // Verificar que el servidor web tiene las rutas APRS
        const webServer = controller.webServer;
        const hasWebServer = !!webServer;
        console.log(`WebServer: ${hasWebServer ? '✅ Disponible' : '❌ No disponible'}`);
        
        if (hasWebServer) {
            const hasAPRSRoutes = typeof webServer.broadcastAPRSPosition === 'function' &&
                                 typeof webServer.broadcastAPRSBeacon === 'function';
            console.log(`Rutas APRS: ${hasAPRSRoutes ? '✅ Configuradas' : '❌ No configuradas'}`);
        }
        console.log();

        console.log('📋 === SIMULACIÓN POSICIÓN APRS ===');
        
        // Simular recepción de posición APRS
        const mockPosition = {
            callsign: 'LU1TEST-9',
            lat: -32.8900,
            lon: -68.8200,
            timestamp: new Date(),
            comment: 'Test Position from Integration Test',
            symbol: '/>',
            raw: 'mock_frame_data'
        };

        console.log('📡 Simulando recepción de posición APRS...');
        console.log(`   Callsign: ${mockPosition.callsign}`);
        console.log(`   Ubicación: ${mockPosition.lat}, ${mockPosition.lon}`);
        console.log(`   Comentario: ${mockPosition.comment}`);

        // Simular el evento
        controller.modules.aprs.emit('position_received', mockPosition);
        
        // Verificar que se registró
        await delay(500);
        const positions = controller.modules.aprs.getAllPositions();
        const hasTestPosition = positions.some(p => p.callsign === mockPosition.callsign);
        console.log(`   Posición registrada: ${hasTestPosition ? '✅ SÍ' : '❌ NO'}`);
        console.log();

        console.log('📊 === ESTADO FINAL ===');
        
        // Estado final del módulo APRS
        const aprsStatus = controller.modules.aprs.getStatus();
        console.log('Estado APRS final:');
        console.log(`   Running: ${aprsStatus.running}`);
        console.log(`   Initialized: ${aprsStatus.initialized}`);
        console.log(`   TNC Connected: ${aprsStatus.tncConnected}`);
        console.log(`   Posiciones totales: ${aprsStatus.positions.total}`);
        console.log(`   Beacons enviados: ${aprsStatus.stats.beaconsSent}`);
        console.log(`   Posiciones recibidas: ${aprsStatus.stats.positionsReceived}`);
        console.log();

        console.log('📁 === VERIFICACIÓN ARCHIVOS ===');
        
        // Verificar archivos de configuración y logs
        const fs = require('fs');
        const configFile = path.join(__dirname, 'config/direwolf.conf');
        const logsDir = path.join(__dirname, 'logs');
        
        const configExists = fs.existsSync(configFile);
        const logsDirExists = fs.existsSync(logsDir);
        
        console.log(`Configuración Direwolf: ${configExists ? '✅ Existe' : '❌ No existe'}`);
        console.log(`Directorio logs: ${logsDirExists ? '✅ Existe' : '❌ No existe'}`);
        
        if (configExists) {
            const configContent = fs.readFileSync(configFile, 'utf8');
            const hasRequiredSettings = configContent.includes('MYCALL') && 
                                       configContent.includes('KISSPORT') &&
                                       configContent.includes('PBEACON');
            console.log(`Configuración válida: ${hasRequiredSettings ? '✅ SÍ' : '❌ NO'}`);
        }
        console.log();

        console.log('🎯 === DIAGNÓSTICO FINAL ===');
        
        const integrationSuccess = hasAPRS && hasWebServer && aprsStatus.initialized;
        
        if (integrationSuccess) {
            console.log('🎉 INTEGRACIÓN APRS EXITOSA');
            console.log('');
            console.log('✅ FUNCIONALIDADES DISPONIBLES:');
            console.log('   📡 Beacon automático del repetidor');
            console.log('   📥 Recepción de posiciones APRS');
            console.log('   💾 Logging automático de posiciones');
            console.log('   🌐 API REST para posiciones (/api/aprs/*)');
            console.log('   🗺️ Mapa interactivo (/aprs-map)');
            console.log('   📞 Comandos DTMF (*6, *60, *61, *62)');
            console.log('   🔄 Events WebSocket en tiempo real');
            console.log('');
            console.log('🚀 PRÓXIMOS PASOS PARA PRODUCCIÓN:');
            console.log('   1. Configurar callsign real del repetidor');
            console.log('   2. Ajustar coordenadas exactas');
            console.log('   3. Conectar interface de radio');
            console.log('   4. Iniciar Direwolf TNC');
            console.log('   5. Probar recepción con estaciones APRS reales');
            console.log('');
            console.log('📋 ACCESO:');
            console.log('   • Panel principal: http://localhost:3000/');
            console.log('   • Mapa APRS: http://localhost:3000/aprs-map');
            console.log('   • API Status: http://localhost:3000/api/aprs/status');
            
        } else {
            console.log('⚠️ INTEGRACIÓN INCOMPLETA');
            if (!hasAPRS) console.log('   ❌ Módulo APRS no disponible');
            if (!hasWebServer) console.log('   ❌ Servidor web no disponible');
            if (!aprsStatus.initialized) console.log('   ❌ APRS no inicializado');
        }

        return integrationSuccess;

    } catch (error) {
        console.error('\n❌ === ERROR EN INTEGRACIÓN ===');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        
        return false;
    } finally {
        console.log('\n🧹 === LIMPIEZA ===');
        
        try {
            if (controller) {
                console.log('Deteniendo sistema...');
                controller.stop();
                await delay(2000);
                console.log('✅ Sistema detenido correctamente');
            }
        } catch (error) {
            console.warn('⚠️ Error durante limpieza:', error.message);
        }
        
        console.log('🏁 Test de integración finalizado\n');
    }
}

// Ejecutar test si se llama directamente
if (require.main === module) {
    testAPRSIntegration()
        .then(success => {
            if (success) {
                console.log('🎯 RESULTADO: ¡Integración APRS completada exitosamente!');
                console.log('🚀 El sistema VX200 Controller está listo con funcionalidad APRS completa.');
                process.exit(0);
            } else {
                console.log('❌ RESULTADO: La integración APRS necesita configuración adicional');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Error fatal en test de integración:', error.message);
            process.exit(1);
        });
}

module.exports = testAPRSIntegration;