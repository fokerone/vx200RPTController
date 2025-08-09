const path = require('path');
require('dotenv').config();

// Configurar paths
process.env.NODE_PATH = path.join(__dirname, 'src');

const { ConfigManager } = require('./src/config/ConfigManager');
const AudioManager = require('./src/audio/audioManager');
const WeatherVoice = require('./src/modules/weather-voice');

/**
 * Test simple del comando *5 con DTMF manual
 */
async function testCommand5Simple() {
    console.log('🔢 Test simple comando *5 - DTMF manual\n');

    let config, audio, weatherVoice;

    try {
        // Inicializar componentes
        console.log('🔧 Inicializando componentes...');
        
        config = new ConfigManager();
        audio = new AudioManager(config);
        weatherVoice = new WeatherVoice(audio);

        console.log('✅ Componentes inicializados\n');

        // Mostrar menú disponible
        console.log('📋 === MENÚ DE CIUDADES ===');
        const cityMenu = weatherVoice.config.cityMenu;
        Object.entries(cityMenu).forEach(([key, city]) => {
            console.log(`   ${key}. ${city.name} (${city.department})`);
        });
        console.log();

        // Verificar estado del detector DTMF
        console.log('🔍 === ESTADO DETECTOR DTMF ===');
        console.log(`Detector DTMF habilitado: ${audio.dtmfDecoder.isEnabled()}`);
        console.log();

        // Monitorear eventos DTMF
        let dtmfReceived = [];
        audio.on('dtmf', (sequence) => {
            dtmfReceived.push({
                sequence,
                timestamp: new Date().toISOString()
            });
            console.log(`📞 DTMF detectado: "${sequence}" a las ${dtmfReceived[dtmfReceived.length - 1].timestamp}`);
        });

        console.log('🚀 === EJECUTANDO COMANDO *5 ===');
        console.log('Se ejecutará el comando *5 y mostrará el menú...');
        console.log('Después del anuncio, el sistema esperará tu selección DTMF (1-5)');
        console.log();

        // Ejecutar comando *5
        weatherVoice.execute('*5').catch(error => {
            console.log(`⚠️ Comando terminado: ${error.message}`);
        });

        // Esperar un tiempo razonable para ver si funciona
        await delay(30000); // 30 segundos

        console.log('\n📊 === REPORTE FINAL ===');
        console.log(`DTMF recibidos durante el test: ${dtmfReceived.length}`);
        
        if (dtmfReceived.length > 0) {
            console.log('Secuencias DTMF detectadas:');
            dtmfReceived.forEach((detection, index) => {
                console.log(`   ${index + 1}. "${detection.sequence}" a las ${detection.timestamp}`);
            });
        } else {
            console.log('⚠️ No se detectaron secuencias DTMF');
        }

        console.log('\n🎯 === DIAGNÓSTICO ===');
        if (dtmfReceived.length > 0) {
            console.log('✅ Sistema DTMF funcionando');
            console.log('✅ Comando *5 puede recibir selecciones');
        } else {
            console.log('❌ Sistema DTMF no está recibiendo entradas');
            console.log('💡 Posibles causas:');
            console.log('   - No hay entrada de audio configurada');
            console.log('   - No se generaron tonos DTMF durante el test');
            console.log('   - Detector DTMF no está procesando audio');
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
    console.log('🎙️ INSTRUCCIONES:');
    console.log('1. El sistema anunciará el menú de ciudades');
    console.log('2. Después del anuncio, marca un dígito 1-5 en tu teclado DTMF');
    console.log('3. El sistema debería detectar tu selección y dar el clima');
    console.log('4. Si no tienes teclado DTMF, el test mostrará el estado del sistema\n');

    testCommand5Simple()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Error fatal:', error.message);
            process.exit(1);
        });
}

module.exports = testCommand5Simple;