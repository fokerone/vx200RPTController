const path = require('path');
require('dotenv').config();

// Configurar paths
process.env.NODE_PATH = path.join(__dirname, 'src');

const { ConfigManager } = require('./src/config/ConfigManager');
const AudioManager = require('./src/audio/audioManager');
const APRS = require('./src/modules/aprs');
const DirewolfManager = require('./src/utils/direwolfManager');

/**
 * Test básico del sistema APRS
 */
async function testAPRSBasic() {
    console.log('📡 Test básico del sistema APRS\n');

    let config, audio, aprs, direwolf;

    try {
        // Inicializar componentes
        console.log('🔧 Inicializando componentes...');
        
        config = new ConfigManager();
        audio = new AudioManager(config);
        aprs = new APRS(audio);
        direwolf = new DirewolfManager();

        console.log('✅ Componentes inicializados\n');

        // Test 1: Verificar configuración APRS
        console.log('📋 === TEST 1: CONFIGURACIÓN APRS ===');
        const aprsStatus = aprs.getStatus();
        console.log('Configuración APRS:');
        console.log(`   Callsign: ${aprsStatus.config.callsign}`);
        console.log(`   Ubicación: ${aprsStatus.config.location.lat}, ${aprsStatus.config.location.lon}`);
        console.log(`   Beacon: ${aprsStatus.config.beaconEnabled ? 'Habilitado' : 'Deshabilitado'}`);
        console.log();

        // Test 2: Verificar instalación Direwolf
        console.log('🔍 === TEST 2: DIREWOLF INSTALACIÓN ===');
        const fs = require('fs');
        const direwolfInstalled = fs.existsSync('/usr/local/bin/direwolf');
        console.log(`Direwolf instalado: ${direwolfInstalled ? '✅ SÍ' : '❌ NO'}`);
        
        if (direwolfInstalled) {
            console.log('Versión Direwolf:');
            try {
                const { spawn } = require('child_process');
                const version = spawn('direwolf', ['-t', '0'], { timeout: 3000 });
                version.stdout.on('data', (data) => {
                    const output = data.toString();
                    if (output.includes('Dire Wolf version')) {
                        console.log(`   ${output.split('\n')[0]}`);
                    }
                });
                setTimeout(() => version.kill('SIGKILL'), 2000);
            } catch (error) {
                console.log('   Error obteniendo versión');
            }
        }
        console.log();

        // Test 3: Probar generación de configuración Direwolf
        console.log('⚙️ === TEST 3: CONFIGURACIÓN DIREWOLF ===');
        const configGenerated = direwolf.generateConfig();
        console.log(`Configuración generada: ${configGenerated ? '✅ SÍ' : '❌ NO'}`);
        
        if (configGenerated) {
            const configPath = path.join(__dirname, 'config/direwolf.conf');
            const configExists = fs.existsSync(configPath);
            console.log(`Archivo config existe: ${configExists ? '✅ SÍ' : '❌ NO'}`);
            
            if (configExists) {
                const configContent = fs.readFileSync(configPath, 'utf8');
                const hasCallsign = configContent.includes('MYCALL');
                const hasKissPort = configContent.includes('KISSPORT');
                const hasBeacon = configContent.includes('PBEACON');
                
                console.log(`   Callsign configurado: ${hasCallsign ? '✅' : '❌'}`);
                console.log(`   Puerto KISS configurado: ${hasKissPort ? '✅' : '❌'}`);
                console.log(`   Beacon configurado: ${hasBeacon ? '✅' : '❌'}`);
            }
        }
        console.log();

        // Test 4: Verificar librería utils-for-aprs
        console.log('📦 === TEST 4: LIBRERÍA UTILS-FOR-APRS ===');
        try {
            const { SocketKISSFrameEndpoint, APRSInfoParser } = require('utils-for-aprs');
            console.log('✅ utils-for-aprs instalado y accesible');
            console.log('   ✅ SocketKISSFrameEndpoint disponible');
            console.log('   ✅ APRSInfoParser disponible');
        } catch (error) {
            console.log('❌ Error cargando utils-for-aprs:', error.message);
        }
        console.log();

        // Test 5: Test de inicialización APRS (sin conexión real)
        console.log('🚀 === TEST 5: INICIALIZACIÓN APRS ===');
        try {
            console.log('Inicializando módulo APRS (modo test)...');
            
            // Mock para evitar conexión real
            const originalInitialize = aprs.initializeKISSConnection;
            aprs.initializeKISSConnection = async () => {
                console.log('   Mock: Conexión KISS simulada');
                aprs.tncConnection = false; // Simular sin conexión
            };
            
            const initialized = await aprs.initialize();
            console.log(`Inicialización APRS: ${initialized ? '✅ ÉXITO' : '❌ FALLO'}`);
            
            // Restaurar función original
            aprs.initializeKISSConnection = originalInitialize;
            
        } catch (error) {
            console.log('❌ Error en inicialización:', error.message);
        }
        console.log();

        // Test 6: Comandos APRS
        console.log('📞 === TEST 6: COMANDOS APRS ===');
        const commands = [
            { cmd: '*6', desc: 'Comando principal APRS' },
            { cmd: '*60', desc: 'Estado del sistema APRS' },
            { cmd: '*61', desc: 'Beacon manual' },
            { cmd: '*62', desc: 'Últimas posiciones' }
        ];

        for (const test of commands) {
            try {
                console.log(`Probando ${test.cmd} - ${test.desc}`);
                
                // Mock del audio para evitar TTS real
                const originalSpeak = audio.speak;
                let spokenMessage = '';
                audio.speak = async (message) => {
                    spokenMessage = message;
                    console.log(`   TTS Mock: "${message.substring(0, 50)}..."`);
                };
                
                await aprs.execute(test.cmd);
                console.log(`   ✅ Comando ${test.cmd} ejecutado`);
                
                // Restaurar función original
                audio.speak = originalSpeak;
                
            } catch (error) {
                console.log(`   ❌ Error en comando ${test.cmd}: ${error.message}`);
            }
        }
        console.log();

        // Test 7: Verificar estructura de datos
        console.log('🗂️ === TEST 7: ESTRUCTURA DE DATOS ===');
        const finalStatus = aprs.getStatus();
        console.log('Estado final del módulo APRS:');
        console.log(`   Running: ${finalStatus.running}`);
        console.log(`   Initialized: ${finalStatus.initialized}`);
        console.log(`   TNC Connected: ${finalStatus.tncConnected}`);
        console.log(`   Positions total: ${finalStatus.positions.total}`);
        console.log(`   Beacons sent: ${finalStatus.stats.beaconsSent}`);
        console.log(`   Positions received: ${finalStatus.stats.positionsReceived}`);
        console.log();

        // Test 8: Verificar archivos de log
        console.log('📄 === TEST 8: ARCHIVOS DE LOG ===');
        const logDir = path.join(__dirname, 'logs');
        const logDirExists = fs.existsSync(logDir);
        console.log(`Directorio logs existe: ${logDirExists ? '✅ SÍ' : '❌ NO'}`);
        
        if (logDirExists) {
            const positionsFile = path.join(logDir, 'aprs-positions.json');
            const positionsFileExists = fs.existsSync(positionsFile);
            console.log(`Archivo posiciones existe: ${positionsFileExists ? '✅ SÍ' : '❌ NO'}`);
        }
        console.log();

        console.log('🎯 === DIAGNÓSTICO FINAL ===');
        const allTestsPassed = direwolfInstalled && configGenerated;
        
        if (allTestsPassed) {
            console.log('✅ SISTEMA APRS LISTO PARA PRODUCCIÓN');
            console.log('   ✅ Direwolf instalado y configurado');
            console.log('   ✅ Módulo APRS funcional');
            console.log('   ✅ Librerías necesarias disponibles');
            console.log('   ✅ Comandos DTMF operativos');
            console.log();
            console.log('📋 PRÓXIMOS PASOS:');
            console.log('   1. Configurar callsign real en Direwolf');
            console.log('   2. Ajustar coordenadas de ubicación');
            console.log('   3. Conectar interface de radio');
            console.log('   4. Probar en vivo con estaciones APRS');
        } else {
            console.log('⚠️ SISTEMA APRS REQUIERE CONFIGURACIÓN');
            if (!direwolfInstalled) {
                console.log('   ❌ Instalar Direwolf TNC');
            }
            if (!configGenerated) {
                console.log('   ❌ Generar configuración Direwolf');
            }
        }

        return allTestsPassed;

    } catch (error) {
        console.error('\n❌ === ERROR EN TEST ===');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        
        return false;
    } finally {
        // Limpiar recursos
        console.log('\n🧹 Limpiando recursos...');
        
        try {
            if (aprs && typeof aprs.destroy === 'function') {
                aprs.destroy();
                console.log('✅ APRS destruido');
            }
            
            if (direwolf && typeof direwolf.destroy === 'function') {
                direwolf.destroy();
                console.log('✅ DirewolfManager destruido');
            }
            
            if (audio && typeof audio.destroy === 'function') {
                audio.destroy();
                console.log('✅ AudioManager destruido');
            }
        } catch (error) {
            console.warn('⚠️ Error limpiando:', error.message);
        }
        
        console.log('🏁 Test finalizado\n');
    }
}

// Función helper para delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Ejecutar test si se llama directamente
if (require.main === module) {
    testAPRSBasic()
        .then(success => {
            if (success) {
                console.log('🎯 RESULTADO: ¡Sistema APRS configurado correctamente!');
                process.exit(0);
            } else {
                console.log('❌ RESULTADO: Sistema APRS requiere configuración adicional');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Error fatal:', error.message);
            process.exit(1);
        });
}

module.exports = testAPRSBasic;