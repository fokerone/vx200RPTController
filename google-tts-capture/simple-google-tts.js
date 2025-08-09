const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Sistema simplificado de Google TTS usando gtts-cli
 * Método más directo y confiable
 */
class SimpleGoogleTTS {
    constructor() {
        this.tempDir = path.join(__dirname, 'temp');
        this.ensureTemp();
        console.log('🌐 Simple Google TTS inicializado');
    }

    ensureTemp() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Instalar gtts-cli si no está disponible
     */
    async installGTTS() {
        return new Promise((resolve) => {
            console.log('📦 Verificando gtts-cli...');
            
            exec('pip3 list | grep gTTS', (error, stdout) => {
                if (!error && stdout.includes('gTTS')) {
                    console.log('✅ gTTS ya instalado');
                    resolve(true);
                    return;
                }
                
                console.log('📦 Instalando gTTS...');
                const pip = spawn('pip3', ['install', 'gTTS']);
                
                pip.on('close', (code) => {
                    if (code === 0) {
                        console.log('✅ gTTS instalado exitosamente');
                        resolve(true);
                    } else {
                        console.log('❌ Error instalando gTTS');
                        resolve(false);
                    }
                });
            });
        });
    }

    /**
     * Generar audio usando gTTS de Python
     * @param {string} text - Texto a convertir
     * @param {string} outputFile - Archivo de salida
     * @param {string} lang - Idioma (default: es)
     * @returns {Promise<boolean>} - Éxito de la operación
     */
    async generateSpeech(text, outputFile, lang = 'es') {
        try {
            console.log(`🎙️ Generando audio Google TTS: "${text.substring(0, 50)}..."`);
            
            // Crear script Python temporal
            const pythonScript = `
import os
import sys
from gtts import gTTS

text = """${text.replace(/"/g, '\\"')}"""
output_file = "${outputFile}"
language = "${lang}"

try:
    tts = gTTS(text=text, lang=language, slow=False)
    tts.save(output_file)
    print("SUCCESS: Audio guardado en", output_file)
except Exception as e:
    print("ERROR:", str(e))
    sys.exit(1)
`;
            
            const scriptFile = path.join(this.tempDir, 'tts_script.py');
            fs.writeFileSync(scriptFile, pythonScript);
            
            return new Promise((resolve) => {
                const python = spawn('python3', [scriptFile]);
                
                let stdout = '';
                let stderr = '';
                
                python.stdout.on('data', (data) => {
                    stdout += data.toString();
                });
                
                python.stderr.on('data', (data) => {
                    stderr += data.toString();
                });
                
                python.on('close', (code) => {
                    // Limpiar script temporal
                    try { fs.unlinkSync(scriptFile); } catch(e) {}
                    
                    if (code === 0 && fs.existsSync(outputFile)) {
                        console.log('✅ Audio generado exitosamente');
                        resolve(true);
                    } else {
                        console.error('❌ Error Python:', stderr || stdout);
                        resolve(false);
                    }
                });
                
                python.on('error', (error) => {
                    console.error('❌ Error ejecutando Python:', error.message);
                    resolve(false);
                });
            });
            
        } catch (error) {
            console.error('❌ Error generando speech:', error.message);
            return false;
        }
    }

    /**
     * Método alternativo usando curl directo a Google TTS
     * @param {string} text - Texto a convertir
     * @param {string} outputFile - Archivo de salida
     * @param {string} lang - Idioma (default: es)
     * @returns {Promise<boolean>} - Éxito de la operación
     */
    async generateSpeechDirect(text, outputFile, lang = 'es') {
        try {
            console.log(`📥 Descargando directo de Google TTS: "${text.substring(0, 50)}..."`);
            
            // URL de Google TTS (puede requerir ajustes)
            const encodedText = encodeURIComponent(text);
            const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodedText}`;
            
            return new Promise((resolve) => {
                const curl = spawn('curl', [
                    '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
                    '-s',
                    '-o', outputFile,
                    url
                ]);
                
                curl.on('close', (code) => {
                    if (code === 0 && fs.existsSync(outputFile) && fs.statSync(outputFile).size > 1000) {
                        console.log('✅ Audio descargado exitosamente');
                        resolve(true);
                    } else {
                        console.error('❌ Error descargando audio');
                        resolve(false);
                    }
                });
                
                curl.on('error', (error) => {
                    console.error('❌ Error con curl:', error.message);
                    resolve(false);
                });
            });
            
        } catch (error) {
            console.error('❌ Error en descarga directa:', error.message);
            return false;
        }
    }

    /**
     * Reproducir audio generado
     * @param {string} audioFile - Archivo de audio
     * @returns {Promise<boolean>} - Éxito de la reproducción
     */
    async playAudio(audioFile) {
        if (!fs.existsSync(audioFile)) {
            console.error('❌ Archivo de audio no existe');
            return false;
        }

        return new Promise((resolve) => {
            console.log('🔊 Reproduciendo audio...');
            
            const paplay = spawn('paplay', [audioFile]);
            
            paplay.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Reproducción completada');
                    resolve(true);
                } else {
                    console.log('❌ Error en reproducción');
                    resolve(false);
                }
            });
            
            paplay.on('error', (error) => {
                console.error('❌ Error paplay:', error.message);
                resolve(false);
            });
        });
    }

    /**
     * Test completo del sistema
     * @returns {Promise<object>} - Resultado del test
     */
    async test() {
        const testText = 'Hola, esta es una prueba del sistema de voz Google TTS. El clima actual en Buenos Aires es soleado con veinte grados centígrados.';
        const outputFile = path.join(this.tempDir, 'test_simple_google.mp3');
        
        console.log('🧪 Iniciando test de Simple Google TTS...');
        
        try {
            // Intentar con gTTS primero
            let success = await this.generateSpeech(testText, outputFile);
            
            if (!success) {
                console.log('🔄 Probando método directo...');
                success = await this.generateSpeechDirect(testText, outputFile);
            }
            
            const result = {
                success,
                outputFile: success ? outputFile : null,
                message: success ? 'Test exitoso - Audio generado' : 'Test falló',
                fileSize: success ? fs.statSync(outputFile).size : 0
            };
            
            if (success) {
                console.log(`🎉 Test exitoso: ${outputFile} (${result.fileSize} bytes)`);
            }
            
            return result;
            
        } catch (error) {
            return {
                success: false,
                outputFile: null,
                message: error.message,
                fileSize: 0
            };
        }
    }

    /**
     * Limpiar archivos temporales antiguos
     */
    cleanup() {
        try {
            const files = fs.readdirSync(this.tempDir);
            const maxAge = 10 * 60 * 1000; // 10 minutos
            const now = Date.now();
            
            files.forEach(file => {
                const filePath = path.join(this.tempDir, file);
                const stats = fs.statSync(filePath);
                
                if (now - stats.mtimeMs > maxAge) {
                    fs.unlinkSync(filePath);
                    console.log(`🗑️ Eliminado: ${file}`);
                }
            });
        } catch (error) {
            console.error('Error en cleanup:', error.message);
        }
    }
}

// Función para usar desde línea de comandos
async function main() {
    if (process.argv.length < 3) {
        console.log('Uso: node simple-google-tts.js "texto a convertir"');
        process.exit(1);
    }
    
    const text = process.argv[2];
    const outputFile = path.join(__dirname, 'temp', 'output.mp3');
    
    const googleTTS = new SimpleGoogleTTS();
    
    try {
        // Instalar dependencias si es necesario
        await googleTTS.installGTTS();
        
        // Generar audio
        const success = await googleTTS.generateSpeech(text, outputFile);
        
        if (success) {
            console.log(`🎉 Audio generado: ${outputFile}`);
            
            // Reproducir
            await googleTTS.playAudio(outputFile);
        } else {
            console.log('❌ Error generando audio');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Si se ejecuta directamente
if (require.main === module) {
    main().catch(console.error);
}

module.exports = SimpleGoogleTTS;