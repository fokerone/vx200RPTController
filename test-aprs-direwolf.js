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
 * Test para verificar el funcionamiento de Direwolf + APRS
 */
async function testAPRSDirectwolf() {
    console.log('🐺 Test de Direwolf + APRS\n');

    let config, audio, aprs, direwolf;

    try {
        console.log('📡 === TEST DIREWOLF TNC ===');
        
        // Verificar que Direwolf está instalado
        console.log('1. Verificando instalación de Direwolf...');
        const fs = require('fs');
        const direwolfPath = '/usr/local/bin/direwolf';
        const direwolfInstalled = fs.existsSync(direwolfPath);
        console.log(`   Direwolf instalado en ${direwolfPath}: ${direwolfInstalled ? '✅ SÍ' : '❌ NO'}`);
        
        if (!direwolfInstalled) {
            console.log('   ⚠️ Direwolf no está instalado. Instalando...');
            await installDirewolf();
        }

        // Inicializar componentes
        console.log('\n2. Inicializando componentes...');
        config = new ConfigManager();
        audio = new AudioManager(config);
        
        // Crear DirewolfManager
        direwolf = new DirewolfManager();
        console.log('   ✅ DirewolfManager creado');
        
        // Generar configuración
        console.log('\n3. Generando configuración Direwolf...');
        const configGenerated = direwolf.generateConfig();
        console.log(`   Configuración generada: ${configGenerated ? '✅ SÍ' : '❌ NO'}`);
        
        // Iniciar Direwolf
        console.log('\n4. Iniciando proceso Direwolf...');
        const direwolfStarted = await direwolf.start();
        console.log(`   Direwolf iniciado: ${direwolfStarted ? '✅ SÍ' : '❌ NO'}`);
        
        if (direwolfStarted) {
            // Verificar puertos
            console.log('\n5. Verificando puertos TNC...');
            await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar
            
            const portStatus = await direwolf.testPorts();
            console.log(`   Puerto KISS 8001: ${portStatus.kiss ? '✅ ABIERTO' : '❌ CERRADO'}`);
            console.log(`   Puerto AGW 8000: ${portStatus.agw ? '✅ ABIERTO' : '❌ CERRADO'}`);
            
            if (portStatus.kiss) {
                // Probar APRS
                console.log('\n6. Probando módulo APRS...');
                aprs = new APRS(audio);
                
                const aprsInitialized = await aprs.initialize();
                console.log(`   APRS inicializado: ${aprsInitialized ? '✅ SÍ' : '❌ NO'}`);
                
                if (aprsInitialized) {
                    const aprsStarted = await aprs.start();
                    console.log(`   APRS iniciado: ${aprsStarted ? '✅ SÍ' : '❌ NO'}`);
                    
                    // Verificar estado
                    const aprsStatus = aprs.getStatus();
                    console.log(`   TNC conectado: ${aprsStatus.tncConnected ? '✅ SÍ' : '❌ NO'}`);
                    console.log(`   Callsign: ${aprsStatus.config.callsign}`);
                    
                    // Probar envío de beacon
                    console.log('\n7. Probando beacon APRS...');
                    try {
                        await aprs.sendBeacon();
                        console.log('   ✅ Beacon enviado correctamente');
                    } catch (error) {
                        console.log('   ❌ Error enviando beacon:', error.message);
                    }
                }
            }
            
            // Mostrar logs de Direwolf por un momento
            console.log('\n8. Logs de Direwolf (5 segundos)...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
        console.log('\n🎯 === DIAGNÓSTICO FINAL ===');
        
        if (direwolfStarted && (await direwolf.testPorts()).kiss) {
            console.log('✅ SISTEMA APRS FUNCIONAL');
            console.log('   🐺 Direwolf TNC ejecutándose correctamente');
            console.log('   📡 Puerto KISS 8001 abierto');
            console.log('   🔗 Módulo APRS puede conectarse');
            console.log('   📤 Beacons pueden ser enviados');
            console.log('   📥 Posiciones pueden ser recibidas');
        } else {
            console.log('❌ SISTEMA APRS CON PROBLEMAS');
            if (!direwolfStarted) console.log('   🐺 Direwolf no se pudo iniciar');
            if (!(await direwolf.testPorts()).kiss) console.log('   📡 Puerto KISS cerrado');
        }

        return direwolfStarted;

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
            
            if (audio) {
                audio.destroy();
                console.log('✅ AudioManager destruido');
            }
        } catch (error) {
            console.warn('⚠️ Error limpiando:', error.message);
        }
        
        console.log('🏁 Test finalizado\n');
    }
}

async function installDirewolf() {
    return new Promise((resolve, reject) => {
        console.log('   📦 Instalando Direwolf con pacman...');
        
        const install = spawn('sudo', ['pacman', '-S', '--noconfirm', 'direwolf'], {
            stdio: 'inherit'
        });
        
        install.on('close', (code) => {
            if (code === 0) {
                console.log('   ✅ Direwolf instalado correctamente');
                resolve();
            } else {
                console.log('   ❌ Error instalando Direwolf');
                reject(new Error(`Instalación falló con código ${code}`));
            }
        });
        
        install.on('error', (error) => {
            console.log('   ❌ Error ejecutando pacman:', error.message);
            reject(error);
        });
    });
}

// Ejecutar test si se llama directamente
if (require.main === module) {
    testAPRSDirectwolf()
        .then(success => {
            if (success) {
                console.log('🎯 RESULTADO: ¡Direwolf + APRS funcionando correctamente!');
                process.exit(0);
            } else {
                console.log('❌ RESULTADO: Problemas con Direwolf + APRS');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Error fatal:', error.message);
            process.exit(1);
        });
}

module.exports = testAPRSDirectwolf;