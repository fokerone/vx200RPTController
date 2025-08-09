const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Importar Google TTS Manager
const GoogleTTSManager = require('../google-tts-capture/GoogleTTSManager');

const app = express();
const PORT = 3001;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Directorio para archivos de audio temporales
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Función para limpiar archivos antiguos
function cleanupOldFiles() {
    const maxAge = 10 * 60 * 1000; // 10 minutos
    const now = Date.now();
    
    fs.readdirSync(TEMP_DIR).forEach(file => {
        const filePath = path.join(TEMP_DIR, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtimeMs > maxAge) {
            fs.unlinkSync(filePath);
            console.log(`🗑️  Archivo eliminado: ${file}`);
        }
    });
}

// Limpiar archivos cada 5 minutos
setInterval(cleanupOldFiles, 5 * 60 * 1000);

// Inicializar Google TTS Manager
const googleTTS = new GoogleTTSManager({
    tempDir: TEMP_DIR,
    language: 'es'
});

// Endpoint para generar speech
app.post('/generate-speech', async (req, res) => {
    try {
        const { text, config, engine } = req.body;
        
        if (!text || !config) {
            return res.status(400).json({ 
                success: false, 
                error: 'Texto y configuración son requeridos' 
            });
        }

        // Seleccionar motor TTS
        if (engine === 'google') {
            // Usar Google TTS
            const audioFile = await googleTTS.generateSpeech(text);
            
            if (audioFile) {
                const filename = path.basename(audioFile);
                res.json({ 
                    success: true, 
                    filename: filename,
                    path: `/temp/${filename}`,
                    command: `Google TTS: "${text.substring(0, 50)}..."`
                });
            } else {
                res.status(500).json({ 
                    success: false, 
                    error: 'Error generando audio con Google TTS' 
                });
            }
            return;
        }

        // Motor espeak (por defecto)
        const timestamp = Date.now();
        const filename = `tts_${timestamp}.wav`;
        const outputPath = path.join(TEMP_DIR, filename);

        // Construir comando espeak
        const args = [
            '-v', config.voice || 'es',
            '-s', (config.speed || 160).toString(),
            '-a', (config.amplitude || 85).toString(),
            '-p', (config.pitch || 50).toString(),
            '-g', (config.gaps || 4).toString(),
            '-k', (config.emphasis || 10).toString(),
            '-w', outputPath,
            text
        ];

        console.log(`🎙️  Generando audio: espeak ${args.join(' ')}`);

        const espeak = spawn('espeak', args);
        
        let stderr = '';
        espeak.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        espeak.on('close', (code) => {
            if (code === 0 && fs.existsSync(outputPath)) {
                // Aplicar post-procesamiento con sox si está disponible
                applyPostProcessing(outputPath)
                    .then(() => {
                        res.json({ 
                            success: true, 
                            filename: filename,
                            path: `/temp/${filename}`,
                            command: `espeak ${args.join(' ')}`
                        });
                    })
                    .catch((error) => {
                        console.warn('Post-procesamiento falló:', error.message);
                        res.json({ 
                            success: true, 
                            filename: filename,
                            path: `/temp/${filename}`,
                            command: `espeak ${args.join(' ')}`
                        });
                    });
            } else {
                console.error('❌ Error espeak:', stderr);
                res.status(500).json({ 
                    success: false, 
                    error: `Error en espeak: ${stderr || 'Código de salida ' + code}` 
                });
            }
        });

        espeak.on('error', (error) => {
            console.error('❌ Error ejecutando espeak:', error.message);
            res.status(500).json({ 
                success: false, 
                error: `Error ejecutando espeak: ${error.message}` 
            });
        });

    } catch (error) {
        console.error('❌ Error interno:', error.message);
        res.status(500).json({ 
            success: false, 
            error: `Error interno: ${error.message}` 
        });
    }
});

// Función para aplicar post-procesamiento con sox
function applyPostProcessing(audioFile) {
    return new Promise((resolve, reject) => {
        // Verificar si sox está disponible
        const soxPath = '/usr/bin/sox';
        if (!fs.existsSync(soxPath)) {
            resolve(); // Continuar sin post-procesamiento
            return;
        }

        const enhancedFile = audioFile.replace('.wav', '_enhanced.wav');
        
        const soxArgs = [
            audioFile,
            enhancedFile,
            // Procesamiento básico para mejor calidad
            'rate', '22050',           // Sample rate estándar
            'gain', '-n',              // Normalizar ganancia
            'equalizer', '200', '1', '1',    // Realzar graves ligeramente
            'equalizer', '2000', '1', '-0.5', // Suavizar medios
            'norm', '-1'               // Normalización final
        ];

        const sox = spawn('sox', soxArgs);

        sox.on('close', (code) => {
            if (code === 0 && fs.existsSync(enhancedFile)) {
                // Reemplazar archivo original
                fs.renameSync(enhancedFile, audioFile);
                console.log(`✨ Post-procesamiento aplicado: ${path.basename(audioFile)}`);
            }
            resolve();
        });

        sox.on('error', () => {
            resolve(); // Continuar aunque falle
        });

        // Timeout de seguridad
        setTimeout(() => {
            sox.kill();
            resolve();
        }, 10000);
    });
}

// Endpoint para reproducir audio
app.get('/play-audio/:filename', (req, res) => {
    const filename = req.params.filename;
    const audioPath = path.join(TEMP_DIR, filename);
    
    if (!fs.existsSync(audioPath)) {
        return res.status(404).json({ 
            success: false, 
            error: 'Archivo de audio no encontrado' 
        });
    }

    // Intentar reproducir con paplay (PulseAudio)
    const paplay = spawn('paplay', [audioPath]);
    
    paplay.on('close', (code) => {
        if (code === 0) {
            res.json({ success: true, message: 'Audio reproducido' });
        } else {
            res.json({ success: false, error: 'Error reproduciendo audio' });
        }
    });

    paplay.on('error', (error) => {
        // Fallback: intentar con aplay
        const aplay = spawn('aplay', [audioPath]);
        
        aplay.on('close', (code) => {
            if (code === 0) {
                res.json({ success: true, message: 'Audio reproducido con aplay' });
            } else {
                res.json({ success: false, error: 'No se pudo reproducir el audio' });
            }
        });

        aplay.on('error', (error) => {
            res.json({ success: false, error: 'Sistema de audio no disponible' });
        });
    });
});

// Servir archivos de audio
app.use('/temp', express.static(TEMP_DIR));

// Endpoint para obtener información del sistema
app.get('/system-info', (req, res) => {
    const info = {
        espeak: checkCommand('espeak'),
        sox: checkCommand('sox'),
        paplay: checkCommand('paplay'),
        aplay: checkCommand('aplay')
    };
    
    res.json(info);
});

function checkCommand(command) {
    try {
        const result = spawn('which', [command], { stdio: 'pipe' });
        return true;
    } catch (error) {
        return false;
    }
}

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`
🎙️  TTS Configuration Lab iniciado

🌐 URL: http://localhost:${PORT}
📁 Archivos temporales: ${TEMP_DIR}
🧹 Limpieza automática: cada 5 minutos

✨ Herramientas detectadas:
   ${checkCommand('espeak') ? '✅' : '❌'} espeak
   ${checkCommand('sox') ? '✅' : '❌'} sox  
   ${checkCommand('paplay') ? '✅' : '❌'} paplay
   ${checkCommand('aplay') ? '✅' : '❌'} aplay

🚀 ¡Listo para configurar TTS!
    `);
    
    // Limpiar archivos al inicio
    cleanupOldFiles();
});

// Manejo de cierre graceful
process.on('SIGINT', () => {
    console.log('\n🛑 Cerrando TTS Configuration Lab...');
    cleanupOldFiles();
    process.exit(0);
});

module.exports = app;