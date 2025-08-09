const path = require('path');
require('dotenv').config();

// Configurar paths
process.env.NODE_PATH = path.join(__dirname, 'src');

const { ConfigManager } = require('./src/config/ConfigManager');
const AudioManager = require('./src/audio/audioManager');
const WeatherVoice = require('./src/modules/weather-voice');

/**
 * Test específico para captura de voz en comando *5
 */
async function testVoiceCapture() {
    console.log('🎙️ Test de captura de voz para comando *5\n');

    let config, audio, weatherVoice;

    try {
        // Inicializar componentes
        console.log('🔧 Inicializando componentes...');
        
        config = new ConfigManager();
        audio = new AudioManager(config);
        weatherVoice = new WeatherVoice(audio);

        console.log('✅ Componentes inicializados\n');

        // Test 1: Verificar disponibilidad de arecord
        console.log('🔍 === TEST 1: VERIFICAR ARECORD ===');
        
        const { spawn } = require('child_process');
        const arecordTest = spawn('which', ['arecord']);
        
        await new Promise((resolve) => {
            arecordTest.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ arecord disponible en el sistema');
                } else {
                    console.log('❌ arecord NO disponible - instalando...');
                }
                resolve();
            });
        });

        console.log();

        // Test 2: Verificar dispositivos de audio
        console.log('🔊 === TEST 2: DISPOSITIVOS DE AUDIO ===');
        
        const pactl = spawn('pactl', ['list', 'sources', 'short']);
        let sources = '';
        
        pactl.stdout.on('data', (data) => {
            sources += data.toString();
        });

        await new Promise((resolve) => {
            pactl.on('close', (code) => {
                if (code === 0 && sources.trim()) {
                    console.log('🎤 Fuentes de audio disponibles:');
                    sources.split('\n').filter(line => line.trim()).forEach(line => {
                        console.log(`   ${line}`);
                    });
                } else {
                    console.log('⚠️ No se pudieron listar las fuentes de audio');
                }
                resolve();
            });
        });

        console.log();

        // Test 3: Test corto de captura (2 segundos)
        console.log('⏱️ === TEST 3: CAPTURA CORTA (2 SEGUNDOS) ===');
        console.log('📢 Habla algo durante los próximos 2 segundos...');
        
        // Configurar duración corta para test
        const originalDuration = weatherVoice.config.voiceCapture.duration;
        weatherVoice.config.voiceCapture.duration = 2000; // 2 segundos
        
        await delay(1000); // Dar tiempo para leer
        
        const audioBuffer = await weatherVoice.captureUserVoice();
        
        if (audioBuffer) {
            console.log(`✅ Captura exitosa: ${audioBuffer.length} bytes`);
            console.log(`📊 Duración aproximada: ${(audioBuffer.length / (16000 * 2)).toFixed(2)} segundos`);
        } else {
            console.log('❌ No se pudo capturar audio');
        }

        // Restaurar configuración original
        weatherVoice.config.voiceCapture.duration = originalDuration;

        console.log();

        // Test 4: Test de Speech-to-Text (si la captura fue exitosa)
        if (audioBuffer && weatherVoice.speechToText.isAvailable()) {
            console.log('🧠 === TEST 4: SPEECH-TO-TEXT ===');
            console.log('🔄 Procesando audio con Whisper...');
            
            try {
                const transcription = await weatherVoice.speechToText.transcribeBuffer(audioBuffer, 'wav');
                
                if (transcription) {
                    console.log(`✅ Transcripción: "${transcription}"`);
                    
                    // Test de búsqueda de ciudad
                    const city = weatherVoice.cityMatcher.findCity(transcription);
                    if (city) {
                        console.log(`🏙️ Ciudad encontrada: ${city.name} (${city.province})`);
                    } else {
                        console.log('🔍 No se encontró ciudad en la transcripción');
                    }
                } else {
                    console.log('❌ No se pudo transcribir el audio');
                }
            } catch (error) {
                console.log(`❌ Error en speech-to-text: ${error.message}`);
            }
        } else {
            console.log('⏭️ === TEST 4: SALTADO ===');
            console.log('🔇 No hay audio capturado o Speech-to-Text no disponible');
        }

        console.log();
        console.log('🎯 === DIAGNÓSTICO ===');
        
        if (audioBuffer) {
            console.log('✅ Captura de audio: FUNCIONANDO');
            console.log('✅ Sistema arecord: OPERATIVO');
            console.log('📋 El comando *5 debería funcionar correctamente');
        } else {
            console.log('❌ Captura de audio: FALLANDO');
            console.log('🔧 Posibles soluciones:');
            console.log('   1. Verificar permisos de micrófono');
            console.log('   2. Instalar alsa-utils: sudo pacman -S alsa-utils');
            console.log('   3. Verificar configuración PulseAudio');
        }

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

// Función helper para delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Ejecutar test si se llama directamente
if (require.main === module) {
    testVoiceCapture()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Error fatal:', error.message);
            process.exit(1);
        });
}

module.exports = testVoiceCapture;