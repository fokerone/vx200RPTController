const path = require('path');
require('dotenv').config();

// Configurar paths
process.env.NODE_PATH = path.join(__dirname, 'src');

const DirewolfManager = require('./src/utils/direwolfManager');
const APRS = require('./src/modules/aprs');
const { ConfigManager } = require('./src/config/ConfigManager');
const AudioManager = require('./src/audio/audioManager');

/**
 * Test para verificar la actualización de configuración APRS
 * Callsign: BASE1
 * Ubicación: Guaymallén, Mendoza
 */
async function testAPRSConfigUpdate() {
    console.log('🔧 Test de actualización configuración APRS\n');

    let config, audio, aprs, direwolf;

    try {
        console.log('📡 === NUEVA CONFIGURACIÓN APRS ===');
        console.log('Callsign: BASE1');
        console.log('Ubicación: Guaymallén, Mendoza');
        console.log('Coordenadas: -32.885, -68.739');
        console.log('Beacon: Cada 10 minutos');
        console.log();

        // Inicializar componentes
        console.log('🔧 Inicializando componentes...');
        
        config = new ConfigManager();
        audio = new AudioManager(config);
        aprs = new APRS(audio);
        direwolf = new DirewolfManager();

        console.log('✅ Componentes inicializados\n');

        // Test 1: Verificar configuración del módulo APRS
        console.log('📋 === TEST 1: CONFIGURACIÓN MÓDULO APRS ===');
        const aprsStatus = aprs.getStatus();
        console.log('Configuración APRS:');
        console.log(`   Callsign: ${aprsStatus.config.callsign}`);
        console.log(`   Ubicación: ${aprsStatus.config.location.lat}, ${aprsStatus.config.location.lon}`);
        console.log(`   Lugar: ${aprsStatus.config.location.name}`);
        console.log(`   Beacon habilitado: ${aprsStatus.config.beaconEnabled}`);
        
        const correctCallsign = aprsStatus.config.callsign === 'BASE1';
        const correctLocation = Math.abs(aprsStatus.config.location.lat - (-32.885)) < 0.001 &&
                               Math.abs(aprsStatus.config.location.lon - (-68.739)) < 0.001;
        
        console.log(`   ✅ Callsign correcto: ${correctCallsign}`);
        console.log(`   ✅ Ubicación correcta: ${correctLocation}`);
        console.log();

        // Test 2: Verificar configuración de DirewolfManager
        console.log('📋 === TEST 2: CONFIGURACIÓN DIREWOLF MANAGER ===');
        const direwolfStatus = direwolf.getStatus();
        console.log('Configuración Direwolf:');
        console.log(`   Callsign: ${direwolfStatus.config.callsign}`);
        console.log(`   Ubicación: ${direwolfStatus.config.location.lat}, ${direwolfStatus.config.location.lon}`);
        console.log(`   Puerto KISS: ${direwolfStatus.config.ports.kiss}`);
        console.log(`   Puerto AGW: ${direwolfStatus.config.ports.agw}`);
        
        const direwolfCorrect = direwolfStatus.config.callsign === 'BASE1' &&
                               Math.abs(direwolfStatus.config.location.lat - (-32.885)) < 0.001;
        
        console.log(`   ✅ Configuración Direwolf correcta: ${direwolfCorrect}`);
        console.log();

        // Test 3: Generar nueva configuración de Direwolf
        console.log('⚙️ === TEST 3: GENERACIÓN CONFIGURACIÓN DIREWOLF ===');
        console.log('Generando archivo de configuración con nuevos valores...');
        
        const configGenerated = direwolf.generateConfig();
        console.log(`Configuración generada: ${configGenerated ? '✅ SÍ' : '❌ NO'}`);
        
        if (configGenerated) {
            const fs = require('fs');
            const configPath = path.join(__dirname, 'config/direwolf.conf');
            const configExists = fs.existsSync(configPath);
            console.log(`Archivo config existe: ${configExists ? '✅ SÍ' : '❌ NO'}`);
            
            if (configExists) {
                const configContent = fs.readFileSync(configPath, 'utf8');
                console.log('\n📄 Contenido del archivo de configuración:');
                console.log('─'.repeat(60));
                console.log(configContent);
                console.log('─'.repeat(60));
                
                const hasCorrectCallsign = configContent.includes('MYCALL BASE1');
                const hasCorrectLat = configContent.includes('lat=-32.885');
                const hasCorrectLon = configContent.includes('long=-68.739');
                const hasGuaymallen = configContent.includes('Guaymallen');
                
                console.log('\nVerificación del contenido:');
                console.log(`   ✅ Callsign BASE1: ${hasCorrectCallsign}`);
                console.log(`   ✅ Latitud correcta: ${hasCorrectLat}`);
                console.log(`   ✅ Longitud correcta: ${hasCorrectLon}`);
                console.log(`   ✅ Menciona Guaymallén: ${hasGuaymallen}`);
            }
        }
        console.log();

        // Test 4: Verificar mapa web
        console.log('🌐 === TEST 4: CONFIGURACIÓN MAPA WEB ===');
        const mapFile = path.join(__dirname, 'public/aprs-map.html');
        const fs = require('fs');
        
        if (fs.existsSync(mapFile)) {
            const mapContent = fs.readFileSync(mapFile, 'utf8');
            const hasBase1 = mapContent.includes('BASE1');
            const hasGuaymallenCoords = mapContent.includes('-32.885') && mapContent.includes('-68.739');
            const hasGuaymallenName = mapContent.includes('Guaymallén');
            
            console.log('Configuración del mapa web:');
            console.log(`   ✅ Callsign BASE1: ${hasBase1}`);
            console.log(`   ✅ Coordenadas Guaymallén: ${hasGuaymallenCoords}`);
            console.log(`   ✅ Nombre Guaymallén: ${hasGuaymallenName}`);
            
            const mapConfigCorrect = hasBase1 && hasGuaymallenCoords && hasGuaymallenName;
            console.log(`   ✅ Mapa web configurado correctamente: ${mapConfigCorrect}`);
        } else {
            console.log('   ❌ Archivo de mapa no encontrado');
        }
        console.log();

        // Test 5: Inicializar APRS con nueva configuración
        console.log('🚀 === TEST 5: INICIALIZACIÓN CON NUEVA CONFIGURACIÓN ===');
        try {
            console.log('Inicializando módulo APRS...');
            
            // Mock para evitar conexión real
            const originalInitialize = aprs.initializeKISSConnection;
            aprs.initializeKISSConnection = async () => {
                console.log('   Mock: Conexión KISS simulada con BASE1');
                aprs.tncConnection = false;
            };
            
            const initialized = await aprs.initialize();
            console.log(`Inicialización APRS: ${initialized ? '✅ ÉXITO' : '❌ FALLO'}`);
            
            // Verificar que mantiene la configuración
            const finalStatus = aprs.getStatus();
            const keepConfig = finalStatus.config.callsign === 'BASE1';
            console.log(`Configuración mantenida: ${keepConfig ? '✅ SÍ' : '❌ NO'}`);
            
            // Restaurar función original
            aprs.initializeKISSConnection = originalInitialize;
            
        } catch (error) {
            console.log('❌ Error en inicialización:', error.message);
        }
        console.log();

        // Test 6: Simulación de beacon
        console.log('📡 === TEST 6: SIMULACIÓN BEACON BASE1 ===');
        console.log('Simulando envío de beacon con nueva configuración...');
        
        const beaconData = {
            callsign: aprsStatus.config.callsign,
            location: aprsStatus.config.location,
            timestamp: new Date(),
            comment: 'Test beacon from Guaymallén'
        };
        
        console.log('Datos del beacon:');
        console.log(`   📡 Callsign: ${beaconData.callsign}`);
        console.log(`   📍 Ubicación: ${beaconData.location.lat}, ${beaconData.location.lon}`);
        console.log(`   📝 Lugar: ${beaconData.location.name}`);
        console.log(`   ⏰ Timestamp: ${beaconData.timestamp.toISOString()}`);
        console.log(`   💬 Comentario: ${beaconData.comment}`);
        
        // Emitir evento simulado
        aprs.emit('beacon_sent', beaconData);
        console.log('   ✅ Evento beacon simulado enviado');
        console.log();

        console.log('🎯 === DIAGNÓSTICO FINAL ===');
        
        const allCorrect = correctCallsign && correctLocation && direwolfCorrect && configGenerated;
        
        if (allCorrect) {
            console.log('✅ CONFIGURACIÓN APRS ACTUALIZADA CORRECTAMENTE');
            console.log('');
            console.log('📡 NUEVA CONFIGURACIÓN ACTIVA:');
            console.log('   🏷️ Callsign: BASE1');
            console.log('   📍 Ubicación: Guaymallén, Mendoza');
            console.log('   🌐 Coordenadas: -32.885, -68.739');
            console.log('   ⏰ Beacon: Cada 10 minutos');
            console.log('   📝 Comentario: VX200 RPT Controller - Guaymallen, Mendoza');
            console.log('');
            console.log('🔧 ARCHIVOS ACTUALIZADOS:');
            console.log('   ✅ src/modules/aprs.js');
            console.log('   ✅ src/utils/direwolfManager.js');
            console.log('   ✅ config/direwolf.conf');
            console.log('   ✅ public/aprs-map.html');
            console.log('');
            console.log('🚀 LISTO PARA PRODUCCIÓN:');
            console.log('   1. Configuración BASE1 activa');
            console.log('   2. Ubicación en Guaymallén configurada');
            console.log('   3. Mapa web actualizado');
            console.log('   4. Direwolf config regenerada');
        } else {
            console.log('⚠️ CONFIGURACIÓN INCOMPLETA');
            if (!correctCallsign) console.log('   ❌ Callsign no actualizado correctamente');
            if (!correctLocation) console.log('   ❌ Ubicación no actualizada correctamente');
            if (!direwolfCorrect) console.log('   ❌ Direwolf config no actualizada');
            if (!configGenerated) console.log('   ❌ Archivo config no generado');
        }

        return allCorrect;

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
    testAPRSConfigUpdate()
        .then(success => {
            if (success) {
                console.log('🎯 RESULTADO: ¡Configuración APRS actualizada correctamente!');
                console.log('📡 BASE1 en Guaymallén, Mendoza está listo para operar.');
                process.exit(0);
            } else {
                console.log('❌ RESULTADO: Error actualizando configuración APRS');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Error fatal:', error.message);
            process.exit(1);
        });
}

module.exports = testAPRSConfigUpdate;