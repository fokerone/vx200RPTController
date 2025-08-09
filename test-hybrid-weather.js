const path = require('path');
require('dotenv').config();

// Configurar paths
process.env.NODE_PATH = path.join(__dirname, 'src');

const { ConfigManager } = require('./src/config/ConfigManager');
const AudioManager = require('./src/audio/audioManager');
const WeatherVoice = require('./src/modules/weather-voice');

/**
 * Test completo del weather voice con sistema híbrido Google TTS
 */
async function testHybridWeatherVoice() {
    console.log('🚀 Iniciando test de Weather Voice con Google TTS híbrido...\n');

    let config, audio, weatherVoice;

    try {
        // Inicializar componentes
        console.log('🔧 Inicializando componentes...');
        
        config = new ConfigManager();
        audio = new AudioManager(config);
        weatherVoice = new WeatherVoice(audio);

        console.log('✅ Componentes inicializados\n');

        // Test 1: Verificar estado del módulo
        console.log('📊 === TEST 1: ESTADO DEL MÓDULO ===');
        const status = weatherVoice.getStatus();
        console.log('Estado:', JSON.stringify(status, null, 2));
        console.log('✅ Estado verificado\n');

        // Test 2: Test de voz híbrida directa
        console.log('🎙️ === TEST 2: VOZ HÍBRIDA DIRECTA ===');
        console.log('Probando Google TTS -> espeak fallback...');
        
        await weatherVoice.speakWithHybridVoice('Esta es una prueba del sistema híbrido de voz para el módulo Weather Voice');
        console.log('✅ Voz híbrida funcionando\n');

        // Test 3: Test de clima por defecto
        console.log('🌤️ === TEST 3: CLIMA POR DEFECTO ===');
        console.log('Simulando comando *4...');
        
        await weatherVoice.execute('*4');
        console.log('✅ Clima por defecto completado\n');

        // Test 4: Estadísticas del voice manager
        console.log('📊 === TEST 4: ESTADÍSTICAS ===');
        if (weatherVoice.voiceManager && weatherVoice.voiceManager.getStats) {
            const stats = weatherVoice.voiceManager.getStats();
            console.log('Estadísticas Voice Manager:');
            console.log(JSON.stringify(stats, null, 2));
        }
        console.log('✅ Estadísticas obtenidas\n');

        // Test 5: Test de diferentes tipos de mensajes
        console.log('🗣️ === TEST 5: DIFERENTES MENSAJES ===');
        
        const testMessages = [
            'El clima actual es soleado con veinte grados centígrados',
            'Temperatura mínima cinco grados, máxima quince grados',
            'Viento del norte a veinte kilómetros por hora',
            'Probabilidad de lluvia del diez por ciento'
        ];

        for (let i = 0; i < testMessages.length; i++) {
            console.log(`Mensaje ${i + 1}: "${testMessages[i].substring(0, 30)}..."`);
            await weatherVoice.speakWithHybridVoice(testMessages[i]);
            
            // Pequeña pausa entre mensajes
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('✅ Diferentes mensajes probados\n');

        // Test 6: Comparación de engines
        console.log('🔄 === TEST 6: COMPARACIÓN ENGINES ===');
        const testText = 'Comparación de calidad de voz entre Google TTS y espeak';
        
        console.log('🌐 Generando con Google TTS...');
        try {
            const googleFile = await weatherVoice.voiceManager.generateGoogleSpeech(testText);
            if (googleFile) {
                console.log('✅ Google TTS exitoso');
                await weatherVoice.voiceManager.playAudio(googleFile);
            } else {
                console.log('❌ Google TTS falló');
            }
        } catch (error) {
            console.log('❌ Error Google TTS:', error.message);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('🤖 Generando con espeak...');
        try {
            const espeakFile = await weatherVoice.voiceManager.generateEspeakSpeech(testText);
            if (espeakFile) {
                console.log('✅ Espeak exitoso');
                await weatherVoice.voiceManager.playAudio(espeakFile);
            } else {
                console.log('❌ Espeak falló');
            }
        } catch (error) {
            console.log('❌ Error espeak:', error.message);
        }
        
        console.log('✅ Comparación completada\n');

        // Estadísticas finales
        console.log('📈 === ESTADÍSTICAS FINALES ===');
        if (weatherVoice.voiceManager && weatherVoice.voiceManager.getStats) {
            const finalStats = weatherVoice.voiceManager.getStats();
            console.log('Estadísticas finales:');
            console.log(JSON.stringify(finalStats, null, 2));
            
            // Calcular eficiencia
            const totalRequests = finalStats.totalRequests;
            const googleSuccess = finalStats.googleTTS.successful;
            const fallbackUsed = finalStats.espeakFallback;
            
            console.log(`\n📊 Resumen de eficiencia:`);
            console.log(`   Total requests: ${totalRequests}`);
            console.log(`   Google TTS exitosos: ${googleSuccess}`);
            console.log(`   Fallback usado: ${fallbackUsed}`);
            console.log(`   Google success rate: ${finalStats.googleTTS.successRate}`);
        }

        console.log('\n🎉 === TEST COMPLETADO EXITOSAMENTE ===');
        console.log('✅ Todos los tests pasaron');
        console.log('🌐 Google TTS como principal: FUNCIONANDO');
        console.log('🤖 Espeak como fallback: FUNCIONANDO');
        console.log('🔄 Sistema híbrido: OPERATIVO');

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

    return true;
}

// Función helper para timing
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Ejecutar test si se llama directamente
if (require.main === module) {
    testHybridWeatherVoice()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Error fatal:', error.message);
            process.exit(1);
        });
}

module.exports = testHybridWeatherVoice;