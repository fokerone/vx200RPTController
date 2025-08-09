const path = require('path');
require('dotenv').config();

// Configurar paths
process.env.NODE_PATH = path.join(__dirname, 'src');

const { ConfigManager } = require('./src/config/ConfigManager');
const AudioManager = require('./src/audio/audioManager');

/**
 * Test para verificar entrada de audio y detección DTMF
 */
async function testAudioInput() {
    console.log('🎧 Test de entrada de audio y detección DTMF\n');

    let config, audio;

    try {
        // Inicializar componentes
        console.log('🔧 Inicializando componentes...');
        
        config = new ConfigManager();
        audio = new AudioManager(config);

        console.log('✅ Componentes inicializados\n');

        // Verificar configuración de audio
        console.log('📊 === CONFIGURACIÓN AUDIO ===');
        console.log(`Dispositivo: ${audio.device}`);
        console.log(`Sample Rate: ${audio.sampleRate}`);
        console.log(`Canales: ${audio.channels}`);
        console.log(`Bit Depth: ${audio.bitDepth}`);
        console.log();

        // Verificar estado inicial
        console.log('🔍 === ESTADO INICIAL ===');
        console.log(`AudioManager grabando: ${audio.isRecording}`);
        console.log(`Detector DTMF habilitado: ${audio.dtmfDecoder.isEnabled()}`);
        console.log(`Estado AudioManager: ${audio.state}`);
        console.log();

        // Monitorear eventos de audio y DTMF
        let audioDataReceived = 0;
        let dtmfReceived = [];

        audio.on('audio', (audioArray) => {
            audioDataReceived++;
            if (audioDataReceived <= 5) { // Solo loguear las primeras 5
                console.log(`📡 Datos de audio recibidos: ${audioArray.length} samples`);
            } else if (audioDataReceived === 6) {
                console.log('📡 ... (más datos de audio llegando)');
            }
        });

        audio.on('dtmf', (sequence) => {
            dtmfReceived.push({
                sequence,
                timestamp: new Date().toISOString()
            });
            console.log(`📞 ¡DTMF DETECTADO!: "${sequence}" a las ${dtmfReceived[dtmfReceived.length - 1].timestamp}`);
        });

        audio.on('channel_active', (data) => {
            console.log(`📢 Canal activo detectado: nivel ${data.level.toFixed(3)}`);
        });

        audio.on('channel_inactive', (data) => {
            console.log(`🔇 Canal inactivo: duración ${data.duration}ms`);
        });

        audio.on('recording_failed', (data) => {
            console.log(`❌ Grabación falló: reintentos ${data.retries}/${data.maxRetries}`);
        });

        // Iniciar AudioManager
        console.log('🚀 === INICIANDO AUDIOMANAGER ===');
        const started = audio.start();
        
        if (started) {
            console.log('✅ AudioManager iniciado exitosamente');
        } else {
            console.log('❌ Error iniciando AudioManager');
            return false;
        }

        // Dar tiempo para estabilizar
        await delay(2000);

        console.log('\n📊 === ESTADO DESPUÉS DE INICIAR ===');
        console.log(`AudioManager grabando: ${audio.isRecording}`);
        console.log(`Detector DTMF habilitado: ${audio.dtmfDecoder.isEnabled()}`);
        console.log(`Estado AudioManager: ${audio.state}`);
        console.log();

        // Monitorear por 20 segundos
        console.log('⏱️ === MONITOREANDO DURANTE 20 SEGUNDOS ===');
        console.log('Genera cualquier sonido o toca DTMF en tu micrófono...');
        
        await delay(20000);

        console.log('\n📊 === REPORTE FINAL ===');
        console.log(`Datos de audio recibidos: ${audioDataReceived} eventos`);
        console.log(`DTMF detectados: ${dtmfReceived.length}`);

        if (audioDataReceived > 0) {
            console.log('✅ Sistema de audio funcionando - recibiendo datos');
        } else {
            console.log('❌ Sistema de audio NO recibiendo datos');
        }

        if (dtmfReceived.length > 0) {
            console.log('✅ Detector DTMF funcionando');
            dtmfReceived.forEach((detection, index) => {
                console.log(`   ${index + 1}. "${detection.sequence}" a las ${detection.timestamp}`);
            });
        } else {
            console.log('⚠️ No se detectaron tonos DTMF');
        }

        console.log('\n🎯 === DIAGNÓSTICO ===');
        
        if (audioDataReceived === 0) {
            console.log('❌ PROBLEMA: No hay entrada de audio');
            console.log('💡 Posibles soluciones:');
            console.log('   1. Verificar que el micrófono esté conectado y funcione');
            console.log('   2. Verificar permisos de audio del sistema');
            console.log('   3. Comprobar configuración de ALSA/PulseAudio');
            console.log('   4. Probar con: arecord -f S16_LE -r 48000 -c 1 -t wav test.wav');
        } else if (dtmfReceived.length === 0) {
            console.log('⚠️ Audio funciona pero no se detectan tonos DTMF');
            console.log('💡 Esto es normal si no tienes generador DTMF disponible');
        } else {
            console.log('✅ Sistema completamente funcional');
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
    testAudioInput()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Error fatal:', error.message);
            process.exit(1);
        });
}

module.exports = testAudioInput;