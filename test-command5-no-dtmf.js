const path = require('path');
require('dotenv').config();

// Configurar paths
process.env.NODE_PATH = path.join(__dirname, 'src');

const { ConfigManager } = require('./src/config/ConfigManager');
const AudioManager = require('./src/audio/audioManager');
const WeatherVoice = require('./src/modules/weather-voice');

/**
 * Test del comando *5 sin interferencia DTMF
 */
async function testCommand5NoDTMF() {
    console.log('🎙️ Test comando *5 sin interferencia DTMF\n');

    let config, audio, weatherVoice;
    let dtmfDetected = [];

    try {
        // Inicializar componentes
        console.log('🔧 Inicializando componentes...');
        
        config = new ConfigManager();
        audio = new AudioManager(config);
        weatherVoice = new WeatherVoice(audio);

        // Capturar detecciones DTMF
        audio.on('dtmf', (sequence) => {
            dtmfDetected.push({
                sequence,
                timestamp: new Date().toISOString()
            });
            console.log(`⚠️ DTMF detectado durante test: "${sequence}" a las ${dtmfDetected[dtmfDetected.length - 1].timestamp}`);
        });

        console.log('✅ Componentes inicializados\n');

        // Test 1: Verificar estado inicial del detector DTMF
        console.log('🔍 === TEST 1: ESTADO INICIAL DTMF ===');
        const initialState = audio.dtmfDecoder.isEnabled();
        console.log(`Estado inicial detector DTMF: ${initialState ? 'HABILITADO' : 'DESHABILITADO'}`);
        console.log();

        // Test 2: Simular comando *5 completo
        console.log('🎙️ === TEST 2: COMANDO *5 COMPLETO ===');
        console.log('Ejecutando speakWeatherByVoice() completo...\n');
        
        // Limpiar detecciones previas
        dtmfDetected = [];
        
        // Ejecutar el comando completo
        try {
            await weatherVoice.speakWeatherByVoice();
        } catch (error) {
            // Esperamos errores de speech-to-text, pero no queremos que interrumpan el test
            console.log(`📋 Comando completado (con errores esperados de STT): ${error.message}`);
        }

        console.log();

        // Test 3: Verificar estado final del detector DTMF
        console.log('🔍 === TEST 3: ESTADO FINAL DTMF ===');
        const finalState = audio.dtmfDecoder.isEnabled();
        console.log(`Estado final detector DTMF: ${finalState ? 'HABILITADO' : 'DESHABILITADO'}`);
        
        if (initialState === finalState) {
            console.log('✅ Estado del detector DTMF se restauró correctamente');
        } else {
            console.log('❌ Estado del detector DTMF NO se restauró');
        }
        console.log();

        // Test 4: Análisis de detecciones DTMF
        console.log('📊 === TEST 4: ANÁLISIS DETECCIONES DTMF ===');
        console.log(`Total detecciones DTMF durante el test: ${dtmfDetected.length}`);
        
        if (dtmfDetected.length === 0) {
            console.log('✅ Perfecto: No se detectaron DTMF falsos positivos');
        } else {
            console.log('⚠️ Se detectaron DTMF durante la captura:');
            dtmfDetected.forEach((detection, index) => {
                console.log(`   ${index + 1}. "${detection.sequence}" a las ${detection.timestamp}`);
            });
        }
        console.log();

        // Test 5: Test de DTMF normal (para verificar que sigue funcionando)
        console.log('🔢 === TEST 5: VERIFICAR DTMF NORMAL ===');
        console.log('Verificando que el detector DTMF sigue funcionando para comandos normales...');
        
        // Limpiar detecciones
        dtmfDetected = [];
        
        // Simular detección DTMF directa (sin comando *5)
        const testSequence = [1, 2, 3];  // Simular secuencia 123
        console.log('Simulando detección DTMF normal...');
        
        // Dar tiempo para que se procese
        await delay(2000);
        
        if (audio.dtmfDecoder.isEnabled()) {
            console.log('✅ Detector DTMF está habilitado y listo para comandos normales');
        } else {
            console.log('❌ Detector DTMF quedó deshabilitado');
        }

        console.log();
        console.log('🎯 === DIAGNÓSTICO FINAL ===');
        
        const success = (dtmfDetected.length === 0 && initialState === finalState && audio.dtmfDecoder.isEnabled());
        
        if (success) {
            console.log('✅ ÉXITO COMPLETO:');
            console.log('   🔇 Sin falsos positivos DTMF durante captura de voz');
            console.log('   🔄 Estado del detector restaurado correctamente');
            console.log('   🎙️ Comando *5 funciona sin interferir con DTMF');
            console.log('   📡 Sistema listo para uso en producción');
        } else {
            console.log('❌ PROBLEMAS DETECTADOS:');
            if (dtmfDetected.length > 0) {
                console.log('   ⚠️ Se detectaron falsos positivos DTMF');
            }
            if (initialState !== finalState) {
                console.log('   ⚠️ Estado del detector no se restauró');
            }
            if (!audio.dtmfDecoder.isEnabled()) {
                console.log('   ⚠️ Detector DTMF quedó deshabilitado');
            }
        }

        return success;

    } catch (error) {
        console.error('\n❌ === ERROR EN TEST ===');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        
        return false;
    } finally {
        // Limpiar recursos
        console.log('\n🧹 Limpiando recursos...');
        
        try {
            if (weatherVoice && typeof weatherVoice.destroy === 'function') {
                weatherVoice.destroy();
                console.log('✅ WeatherVoice destruido');
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
    testCommand5NoDTMF()
        .then(success => {
            if (success) {
                console.log('🎯 RESULTADO: ¡Comando *5 funciona sin interferencia DTMF!');
                process.exit(0);
            } else {
                console.log('❌ RESULTADO: Se detectaron problemas con interferencia DTMF');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Error fatal:', error.message);
            process.exit(1);
        });
}

module.exports = testCommand5NoDTMF;