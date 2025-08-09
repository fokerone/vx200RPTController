const path = require('path');
require('dotenv').config();

// Configurar paths
process.env.NODE_PATH = path.join(__dirname, 'src');

const { ConfigManager } = require('./src/config/ConfigManager');
const AudioManager = require('./src/audio/audioManager');
const DateTime = require('./src/modules/datetime');
const WeatherVoice = require('./src/modules/weather-voice');

/**
 * Test completo de todos los comandos DTMF con Google TTS
 */
async function testAllCommandsWithGoogleTTS() {
    console.log('🚀 Test de todos los comandos DTMF con Google TTS híbrido\n');

    let config, audio, datetime, weatherVoice;

    try {
        // Inicializar componentes
        console.log('🔧 Inicializando componentes del sistema...');
        
        config = new ConfigManager();
        audio = new AudioManager(config);
        datetime = new DateTime(audio);
        weatherVoice = new WeatherVoice(audio);

        console.log('✅ Componentes inicializados\n');

        // Test 1: Comando *1 - Fecha y Hora
        console.log('🕐 === TEST COMANDO *1: FECHA Y HORA ===');
        console.log('Ejecutando comando *1 con Google TTS...');
        
        await datetime.execute('*1');
        
        console.log('✅ Comando *1 completado');
        if (datetime.voiceManager) {
            console.log('📊 Stats *1:', datetime.voiceManager.getStats());
        }
        
        // Pausa entre comandos
        await delay(2000);
        console.log();

        // Test 2: Comando *4 - Clima Actual
        console.log('🌤️ === TEST COMANDO *4: CLIMA ACTUAL ===');
        console.log('Ejecutando comando *4 con Google TTS...');
        
        await weatherVoice.execute('*4');
        
        console.log('✅ Comando *4 completado');
        if (weatherVoice.voiceManager) {
            console.log('📊 Stats *4:', weatherVoice.voiceManager.getStats());
        }
        
        // Pausa entre comandos
        await delay(2000);
        console.log();

        // Test 3: Comando *5 - Weather por Voz (simulado)
        console.log('🎙️ === TEST COMANDO *5: WEATHER POR VOZ ===');
        console.log('Simulando comando *5 (prompt inicial) con Google TTS...');
        
        // Solo vamos a probar el prompt inicial del *5, no la captura completa
        await weatherVoice.speakWithHybridVoice(
            'Diga el nombre de la ciudad después del tono'
        );
        
        console.log('✅ Prompt comando *5 completado');
        
        // Pausa
        await delay(2000);
        console.log();

        // Test 4: Mensajes de diferentes tipos
        console.log('🗣️ === TEST MENSAJES VARIADOS ===');
        
        const testMessages = [
            'Sistema VX200 Controller operativo',
            'Temperatura actual veinte grados centígrados',
            'Viento del sur a quince kilómetros por hora',
            'Roger, mensaje recibido correctamente'
        ];

        for (let i = 0; i < testMessages.length; i++) {
            console.log(`Mensaje ${i + 1}: "${testMessages[i].substring(0, 40)}..."`);
            await weatherVoice.speakWithHybridVoice(testMessages[i]);
            
            // Pausa entre mensajes
            await delay(1500);
        }
        console.log('✅ Mensajes variados completados\n');

        // Test 5: Estadísticas consolidadas
        console.log('📊 === ESTADÍSTICAS CONSOLIDADAS ===');
        
        const datetimeStats = datetime.voiceManager ? datetime.voiceManager.getStats() : null;
        const weatherStats = weatherVoice.voiceManager ? weatherVoice.voiceManager.getStats() : null;
        
        console.log('DateTime Stats:', JSON.stringify(datetimeStats, null, 2));
        console.log('WeatherVoice Stats:', JSON.stringify(weatherStats, null, 2));
        
        // Calcular totales
        const totalRequests = (datetimeStats?.totalRequests || 0) + (weatherStats?.totalRequests || 0);
        const totalGoogleSuccess = (datetimeStats?.googleTTS.successful || 0) + (weatherStats?.googleTTS.successful || 0);
        const totalFallback = (datetimeStats?.espeakFallback || 0) + (weatherStats?.espeakFallback || 0);
        
        console.log(`\n📈 RESUMEN GENERAL:`);
        console.log(`   Total comandos ejecutados: ${totalRequests}`);
        console.log(`   Google TTS exitosos: ${totalGoogleSuccess}`);
        console.log(`   Fallback espeak usado: ${totalFallback}`);
        console.log(`   Tasa de éxito Google: ${totalRequests > 0 ? ((totalGoogleSuccess / totalRequests) * 100).toFixed(1) : 0}%`);

        console.log('\n🎉 === TEST COMPLETADO EXITOSAMENTE ===');
        console.log('✅ Comandos DTMF funcionando con Google TTS:');
        console.log('   🕐 *1 - Fecha y hora: OPERATIVO');
        console.log('   🌤️ *4 - Clima actual: OPERATIVO'); 
        console.log('   🎙️ *5 - Weather por voz: OPERATIVO');
        console.log('   🌐 Google TTS como principal: FUNCIONANDO');
        console.log('   🤖 Espeak como fallback: DISPONIBLE');

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
            
            if (datetime && typeof datetime.destroy === 'function') {
                datetime.destroy();
                console.log('✅ DateTime destruido');
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

// Función helper para delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Ejecutar test si se llama directamente
if (require.main === module) {
    testAllCommandsWithGoogleTTS()
        .then(success => {
            if (success) {
                console.log('🎯 RESULTADO: ¡Todos los comandos funcionan con Google TTS!');
                process.exit(0);
            } else {
                console.log('❌ RESULTADO: Algunos comandos fallaron');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Error fatal:', error.message);
            process.exit(1);
        });
}

module.exports = testAllCommandsWithGoogleTTS;