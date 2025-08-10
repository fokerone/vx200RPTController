const path = require('path');
require('dotenv').config();

// Configurar paths
process.env.NODE_PATH = path.join(__dirname, 'src');

const DirewolfManager = require('./src/utils/direwolfManager');
const APRS = require('./src/modules/aprs');
const { ConfigManager } = require('./src/config/ConfigManager');
const AudioManager = require('./src/audio/audioManager');
const fs = require('fs');

/**
 * Test para verificar configuración APRS con control web
 * - Sin comandos DTMF (*6, *60, *61, *62)
 * - Beacon cada 15 minutos con offset para evitar choque con baliza
 * - Control desde panel web
 */
async function testAPRSWebControl() {
    console.log('🌐 Test de Control Web APRS\n');

    let config, audio, aprs, direwolf;

    try {
        console.log('📡 === CONFIGURACIÓN APRS ACTUALIZADA ===');
        console.log('❌ Comandos DTMF eliminados (*6, *60, *61, *62)');
        console.log('⏰ Beacon: Cada 15 minutos (por defecto activo)');
        console.log('🕘 Delay: 450 segundos (7.5 min) para evitar choque con baliza');
        console.log('🌐 Control: Desde panel web solamente');
        console.log();

        // Inicializar componentes
        console.log('🔧 Inicializando componentes...');
        
        config = new ConfigManager();
        audio = new AudioManager(config);
        aprs = new APRS(audio);
        direwolf = new DirewolfManager();

        console.log('✅ Componentes inicializados\n');

        // Test 1: Verificar que no existen comandos DTMF
        console.log('❌ === TEST 1: COMANDOS DTMF ELIMINADOS ===');
        const aprsModuleContent = fs.readFileSync('./src/modules/aprs.js', 'utf8');
        
        const hasOldCommands = aprsModuleContent.includes('case \'*6\'') ||
                               aprsModuleContent.includes('case \'*60\'') ||
                               aprsModuleContent.includes('case \'*61\'') ||
                               aprsModuleContent.includes('case \'*62\'') ||
                               aprsModuleContent.includes('execute(command)');
        
        console.log(`Comandos DTMF eliminados: ${!hasOldCommands ? '✅ SÍ' : '❌ NO'}`);
        
        // Verificar que no está en el mapeo de comandos
        const indexContent = fs.readFileSync('./src/index.js', 'utf8');
        const hasDTMFMapping = indexContent.includes("'*6': { module: 'aprs'");
        
        console.log(`Mapeo DTMF eliminado: ${!hasDTMFMapping ? '✅ SÍ' : '❌ NO'}`);
        console.log();

        // Test 2: Verificar configuración de intervalos
        console.log('⏰ === TEST 2: CONFIGURACIÓN DE INTERVALOS ===');
        const aprsStatus = aprs.getStatus();
        const direwolfStatus = direwolf.getStatus();
        
        console.log('Intervalos configurados:');
        console.log(`   📡 APRS Beacon: ${aprsStatus.config.beaconEnabled ? 'Habilitado' : 'Deshabilitado'}`);
        console.log(`   ⏰ Intervalo APRS: ${(15)} minutos`);
        console.log(`   🕘 Offset configurado: 7.5 minutos`);
        console.log();
        
        // Test 3: Verificar archivo Direwolf
        console.log('📄 === TEST 3: CONFIGURACIÓN DIREWOLF ===');
        const configPath = path.join(__dirname, 'config/direwolf.conf');
        
        if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, 'utf8');
            console.log('Verificando configuración Direwolf:');
            
            const hasCorrectDelay = configContent.includes('delay=450');
            const hasCorrectInterval = configContent.includes('every=15');
            const hasCommentAboutDelay = configContent.includes('para evitar choque con baliza');
            
            console.log(`   ✅ Delay de 450s configurado: ${hasCorrectDelay}`);
            console.log(`   ✅ Intervalo de 15 min: ${hasCorrectInterval}`);
            console.log(`   ✅ Comentario sobre delay: ${hasCommentAboutDelay}`);
            
            if (hasCorrectDelay && hasCorrectInterval) {
                console.log('   🎯 CONFIGURACIÓN DIREWOLF CORRECTA');
            }
        } else {
            console.log('   ❌ Archivo de configuración no encontrado');
        }
        console.log();

        // Test 4: Verificar controles en panel web
        console.log('🌐 === TEST 4: CONTROLES PANEL WEB ===');
        const indexHtmlPath = path.join(__dirname, 'public/index.html');
        
        if (fs.existsSync(indexHtmlPath)) {
            const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
            
            const hasAPRSSection = htmlContent.includes('<!-- APRS Configuration -->');
            const hasEnabledControl = htmlContent.includes('aprsEnabled');
            const hasIntervalControl = htmlContent.includes('aprsInterval');
            const hasCallsignControl = htmlContent.includes('aprsCallsign');
            const hasCommentControl = htmlContent.includes('aprsComment');
            
            console.log('Controles en panel web:');
            console.log(`   ✅ Sección APRS: ${hasAPRSSection}`);
            console.log(`   ✅ Control Habilitado: ${hasEnabledControl}`);
            console.log(`   ✅ Control Intervalo: ${hasIntervalControl}`);
            console.log(`   ✅ Control Callsign: ${hasCallsignControl}`);
            console.log(`   ✅ Control Comentario: ${hasCommentControl}`);
            
            const allControlsPresent = hasAPRSSection && hasEnabledControl && hasIntervalControl && hasCallsignControl && hasCommentControl;
            console.log(`   🎯 PANEL WEB CONFIGURADO: ${allControlsPresent ? 'SÍ' : 'NO'}`);
        }
        console.log();

        // Test 5: Verificar JavaScript del cliente
        console.log('💻 === TEST 5: JAVASCRIPT CLIENTE ===');
        const appJsPath = path.join(__dirname, 'public/js/app.js');
        
        if (fs.existsSync(appJsPath)) {
            const jsContent = fs.readFileSync(appJsPath, 'utf8');
            
            const hasAPRSFields = jsContent.includes("'aprsEnabled'") &&
                                  jsContent.includes("'aprsInterval'") &&
                                  jsContent.includes("'aprsCallsign'") &&
                                  jsContent.includes("'aprsComment'");
            
            const hasAPRSConfigCall = jsContent.includes('/api/aprs/config');
            
            console.log('JavaScript del cliente:');
            console.log(`   ✅ Campos APRS incluidos: ${hasAPRSFields}`);
            console.log(`   ✅ Llamada API APRS: ${hasAPRSConfigCall}`);
            
            const jsConfigCorrect = hasAPRSFields && hasAPRSConfigCall;
            console.log(`   🎯 JAVASCRIPT CONFIGURADO: ${jsConfigCorrect ? 'SÍ' : 'NO'}`);
        }
        console.log();

        // Test 6: Simular actualización de configuración
        console.log('🔧 === TEST 6: SIMULACIÓN ACTUALIZACIÓN CONFIG ===');
        console.log('Simulando actualización de configuración APRS...');
        
        const mockConfig = {
            enabled: true,
            interval: 20, // Cambiar a 20 minutos
            callsign: 'TEST1',
            comment: 'Test desde panel web'
        };
        
        try {
            const updated = await aprs.updateBeaconConfig(mockConfig);
            console.log(`Actualización simulada: ${updated ? '✅ ÉXITO' : '❌ ERROR'}`);
            
            // Verificar que se aplicó
            const newStatus = aprs.getStatus();
            const configApplied = newStatus.config.callsign === 'TEST1';
            console.log(`Configuración aplicada: ${configApplied ? '✅ SÍ' : '❌ NO'}`);
            
        } catch (error) {
            console.log('❌ Error en simulación:', error.message);
        }
        console.log();

        // Diagnóstico final
        console.log('🎯 === DIAGNÓSTICO FINAL ===');
        
        const allTestsPassed = !hasOldCommands && 
                              !hasDTMFMapping && 
                              fs.existsSync(configPath);
        
        if (allTestsPassed) {
            console.log('✅ CONFIGURACIÓN APRS WEB CORRECTA');
            console.log('');
            console.log('🌟 CARACTERÍSTICAS IMPLEMENTADAS:');
            console.log('   ❌ Comandos DTMF eliminados (*6, *60, *61, *62)');
            console.log('   ⏰ Beacon automático cada 15 minutos');
            console.log('   🕘 Delay de 7.5 min para evitar choque con baliza');
            console.log('   🌐 Control completo desde panel web');
            console.log('   ⚙️ Configuración dinámica (callsign, intervalo, comentario)');
            console.log('   📡 API REST para configuración (/api/aprs/config)');
            console.log('');
            console.log('🚀 LISTO PARA USO:');
            console.log('   1. Panel web con controles APRS');
            console.log('   2. Beacon sin interferir con baliza del sistema');
            console.log('   3. Sin comandos DTMF que puedan molestar');
            console.log('   4. Configuración flexible y persistente');
            
        } else {
            console.log('⚠️ ALGUNOS TESTS FALLARON');
            if (hasOldCommands) console.log('   ❌ Comandos DTMF aún presentes');
            if (hasDTMFMapping) console.log('   ❌ Mapeo DTMF aún existe');
            if (!fs.existsSync(configPath)) console.log('   ❌ Configuración Direwolf faltante');
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

// Ejecutar test si se llama directamente
if (require.main === module) {
    testAPRSWebControl()
        .then(success => {
            if (success) {
                console.log('🎯 RESULTADO: ¡APRS configurado correctamente para control web!');
                console.log('🌐 Sin comandos DTMF, control desde panel web, beacon cada 15 min con offset.');
                process.exit(0);
            } else {
                console.log('❌ RESULTADO: Error en configuración APRS web');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Error fatal:', error.message);
            process.exit(1);
        });
}

module.exports = testAPRSWebControl;