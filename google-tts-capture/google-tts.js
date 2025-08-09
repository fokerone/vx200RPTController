const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Sistema de captura de Google Translate TTS
 * Automatiza Google Translate para generar voz natural
 */
class GoogleTTSCapture {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isReady = false;
        this.tempDir = path.join(__dirname, 'temp');
        
        // Asegurar directorio temporal
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
        
        console.log('🌐 Google TTS Capture inicializado');
    }

    /**
     * Inicializar navegador headless
     */
    async initialize() {
        try {
            console.log('🚀 Iniciando navegador...');
            
            this.browser = await puppeteer.launch({
                headless: true, // Cambiar a false para debug
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--autoplay-policy=no-user-gesture-required',
                    '--allow-running-insecure-content',
                    '--disable-web-security',
                    '--disable-features=TranslateUI',
                    '--disable-features=VizDisplayCompositor'
                ]
            });

            this.page = await this.browser.newPage();
            
            // Configurar página
            await this.page.setViewport({ width: 1280, height: 720 });
            await this.page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36');
            
            // Ir a Google Translate
            console.log('🔗 Navegando a Google Translate...');
            await this.page.goto('https://translate.google.com/?sl=es&tl=es&text=&op=translate', {
                waitUntil: 'networkidle2'
            });
            
            // Esperar a que cargue completamente
            await this.page.waitForSelector('textarea[aria-label*="texto"]', { timeout: 10000 });
            
            this.isReady = true;
            console.log('✅ Google TTS listo para usar');
            
        } catch (error) {
            console.error('❌ Error inicializando Google TTS:', error.message);
            throw error;
        }
    }

    /**
     * Generar audio usando Google Translate TTS
     * @param {string} text - Texto a convertir
     * @param {string} outputFile - Archivo de salida
     * @returns {Promise<boolean>} - Éxito de la operación
     */
    async generateSpeech(text, outputFile) {
        if (!this.isReady) {
            await this.initialize();
        }

        try {
            console.log(`🎙️ Generando audio Google TTS: "${text.substring(0, 50)}..."`);
            
            // Limpiar y escribir texto
            await this.page.evaluate(() => {
                const textarea = document.querySelector('textarea[aria-label*="texto"]');
                if (textarea) {
                    textarea.value = '';
                    textarea.focus();
                }
            });
            
            await this.page.type('textarea[aria-label*="texto"]', text, { delay: 50 });
            
            // Esperar un poco para que procese
            await this.page.waitForTimeout(1000);
            
            // Buscar y hacer click en el botón de audio
            const audioButton = await this.page.$('[data-language-code="es"] button[aria-label*="Escuchar"]');
            if (!audioButton) {
                throw new Error('Botón de audio no encontrado');
            }
            
            // Preparar grabación de audio del sistema
            const recordingPromise = this.recordSystemAudio(outputFile, 5000); // 5 segundos
            
            // Hacer click en reproducir
            await audioButton.click();
            console.log('🔊 Reproduciendo en Google TTS...');
            
            // Esperar a que termine la grabación
            const success = await recordingPromise;
            
            if (success) {
                console.log(`✅ Audio capturado: ${outputFile}`);
                return true;
            } else {
                throw new Error('Falló la captura de audio');
            }
            
        } catch (error) {
            console.error('❌ Error generando speech:', error.message);
            return false;
        }
    }

    /**
     * Grabar audio del sistema usando PulseAudio
     * @param {string} outputFile - Archivo de salida
     * @param {number} duration - Duración en ms
     * @returns {Promise<boolean>} - Éxito de la grabación
     */
    recordSystemAudio(outputFile, duration = 5000) {
        return new Promise((resolve) => {
            console.log(`🎤 Iniciando grabación de audio del sistema...`);
            
            // Usar parec para capturar audio del sistema
            const parec = spawn('parec', [
                '--format=s16le',
                '--rate=22050',
                '--channels=1',
                outputFile
            ]);
            
            let stderr = '';
            parec.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            // Detener grabación después del tiempo especificado
            setTimeout(() => {
                parec.kill('SIGTERM');
                
                // Convertir raw a WAV si es necesario
                this.convertToWav(outputFile)
                    .then((success) => {
                        if (success) {
                            console.log('✅ Grabación y conversión completada');
                        }
                        resolve(success);
                    })
                    .catch(() => resolve(false));
                    
            }, duration);
            
            parec.on('error', (error) => {
                console.error('❌ Error en parec:', error.message);
                resolve(false);
            });
        });
    }

    /**
     * Convertir audio raw a WAV
     * @param {string} rawFile - Archivo raw
     * @returns {Promise<boolean>} - Éxito de la conversión
     */
    convertToWav(rawFile) {
        return new Promise((resolve) => {
            const wavFile = rawFile.replace(/\.raw$/, '.wav');
            
            const sox = spawn('sox', [
                '-t', 'raw',
                '-r', '22050',
                '-e', 'signed-integer',
                '-b', '16',
                '-c', '1',
                rawFile,
                wavFile,
                'norm', '-1'
            ]);
            
            sox.on('close', (code) => {
                if (code === 0 && fs.existsSync(wavFile)) {
                    // Eliminar archivo raw
                    try {
                        fs.unlinkSync(rawFile);
                    } catch (e) {}
                    
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
            
            sox.on('error', () => resolve(false));
        });
    }

    /**
     * Método alternativo: descargar audio directamente
     * @param {string} text - Texto a convertir
     * @param {string} outputFile - Archivo de salida
     * @returns {Promise<boolean>} - Éxito de la operación
     */
    async downloadSpeech(text, outputFile) {
        if (!this.isReady) {
            await this.initialize();
        }

        try {
            console.log(`📥 Descargando audio Google TTS: "${text.substring(0, 50)}..."`);
            
            // Escribir texto
            await this.page.evaluate((text) => {
                const textarea = document.querySelector('textarea[aria-label*="texto"]');
                if (textarea) {
                    textarea.value = text;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }, text);
            
            // Esperar procesamiento
            await this.page.waitForTimeout(2000);
            
            // Interceptar requests de audio
            const client = await this.page.target().createCDPSession();
            await client.send('Network.enable');
            
            return new Promise((resolve) => {
                const timeout = setTimeout(() => resolve(false), 10000);
                
                client.on('Network.responseReceived', async (event) => {
                    const url = event.response.url;
                    
                    // Buscar URL de audio de Google TTS
                    if (url.includes('translate_tts') && url.includes('&tl=es')) {
                        clearTimeout(timeout);
                        
                        try {
                            const response = await this.page.goto(url);
                            const buffer = await response.buffer();
                            fs.writeFileSync(outputFile, buffer);
                            
                            console.log(`✅ Audio descargado: ${outputFile}`);
                            resolve(true);
                        } catch (error) {
                            console.error('❌ Error descargando:', error.message);
                            resolve(false);
                        }
                    }
                });
                
                // Trigger audio
                this.page.$eval('[data-language-code="es"] button[aria-label*="Escuchar"]', btn => btn.click())
                    .catch(() => resolve(false));
            });
            
        } catch (error) {
            console.error('❌ Error en downloadSpeech:', error.message);
            return false;
        }
    }

    /**
     * Test del sistema
     * @returns {Promise<object>} - Resultado del test
     */
    async test() {
        const testText = 'Hola, esta es una prueba del sistema de voz Google TTS. La temperatura actual es de veinte grados centígrados.';
        const outputFile = path.join(this.tempDir, 'test_google_tts.wav');
        
        try {
            const success = await this.generateSpeech(testText, outputFile);
            
            return {
                success,
                outputFile: success ? outputFile : null,
                message: success ? 'Test exitoso' : 'Test falló'
            };
            
        } catch (error) {
            return {
                success: false,
                outputFile: null,
                message: error.message
            };
        }
    }

    /**
     * Cerrar navegador
     */
    async destroy() {
        try {
            if (this.browser) {
                await this.browser.close();
                console.log('🔴 Navegador cerrado');
            }
        } catch (error) {
            console.error('Error cerrando navegador:', error.message);
        }
    }
}

// Función para usar desde línea de comandos
async function main() {
    if (process.argv.length < 3) {
        console.log('Uso: node google-tts.js "texto a convertir"');
        process.exit(1);
    }
    
    const text = process.argv[2];
    const outputFile = path.join(__dirname, 'temp', 'google_tts_output.wav');
    
    const googleTTS = new GoogleTTSCapture();
    
    try {
        const success = await googleTTS.generateSpeech(text, outputFile);
        
        if (success) {
            console.log(`🎉 Audio generado exitosamente: ${outputFile}`);
            
            // Reproducir audio
            console.log('🔊 Reproduciendo...');
            const paplay = spawn('paplay', [outputFile]);
            paplay.on('close', () => {
                console.log('✅ Reproducción completada');
                googleTTS.destroy();
            });
        } else {
            console.log('❌ Error generando audio');
            googleTTS.destroy();
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        googleTTS.destroy();
    }
}

// Si se ejecuta directamente
if (require.main === module) {
    main().catch(console.error);
}

module.exports = GoogleTTSCapture;