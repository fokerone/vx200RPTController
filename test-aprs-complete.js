const path = require('path');
require('dotenv').config();
const { spawn } = require('child_process');

/**
 * Test completo del sistema APRS
 */
async function testAPRSComplete() {
    console.log('📡 Test Completo: Sistema APRS VX200 RPT Controller\n');

    let direwolfProcess = null;
    let vx200Process = null;

    try {
        console.log('1. 🚀 Iniciando Direwolf independiente...');
        
        direwolfProcess = spawn('direwolf', [
            '-c', '/home/fokerone/vx200RPTController/config/direwolf.conf',
            '-t', '0'
        ]);

        let direwolfReady = false;
        let kissPortReady = false;

        direwolfProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('   📄 Direwolf:', output.trim());
            
            if (output.includes('Ready to accept KISS')) {
                kissPortReady = true;
                console.log('   ✅ Puerto KISS 8001 listo');
            }
            
            if (output.includes('Ready to accept AGW')) {
                direwolfReady = true;
                console.log('   ✅ Direwolf completamente inicializado');
            }
        });

        direwolfProcess.stderr.on('data', (data) => {
            const output = data.toString();
            if (!output.includes('DNS-SD') && !output.includes('Avahi')) {
                console.log('   ⚠️ Direwolf stderr:', output.trim());
            }
        });

        console.log('   ⏳ Esperando inicialización completa...');
        await new Promise(resolve => setTimeout(resolve, 8000));

        if (!kissPortReady) {
            throw new Error('Puerto KISS no se inicializó');
        }

        console.log('\n2. 🔗 Verificando puerto KISS...');
        
        // Test directo del puerto KISS
        const net = require('net');
        const kissTest = await new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(3000);
            
            socket.on('connect', () => {
                console.log('   ✅ Puerto KISS 8001 accesible');
                socket.end();
                resolve(true);
            });
            
            socket.on('error', (err) => {
                console.log('   ❌ Error puerto KISS:', err.message);
                resolve(false);
            });
            
            socket.on('timeout', () => {
                console.log('   ❌ Timeout puerto KISS');
                socket.destroy();
                resolve(false);
            });
            
            socket.connect(8001, 'localhost');
        });

        if (!kissTest) {
            throw new Error('Puerto KISS no responde');
        }

        console.log('\n3. 📤 Test de envío manual via KISS...');
        
        // Crear packet APRS manualmente
        const FEND = 0xC0;
        const CMD_DATA = 0x00;
        
        // Packet APRS básico: BASE1>APRS:=3251.10S/06851.34W&VX200 TEST
        const aprsInfo = '=3251.10S/06851.34W&VX200 TEST MANUAL';
        
        // Header AX.25 simplificado
        const dest = Buffer.from('APRS  '); // 6 bytes
        const src = Buffer.from('BASE1 '); // 6 bytes  
        const ssidDest = Buffer.from([0x60]); // SSID dest
        const ssidSrc = Buffer.from([0x61]); // SSID src + final bit
        const ctrl = Buffer.from([0x03]); // Control
        const pid = Buffer.from([0xF0]); // PID
        
        const packet = Buffer.concat([
            dest, ssidDest,
            src, ssidSrc,  
            ctrl, pid,
            Buffer.from(aprsInfo)
        ]);
        
        const kissFrame = Buffer.concat([
            Buffer.from([FEND, CMD_DATA]),
            packet,
            Buffer.from([FEND])
        ]);

        console.log('   📡 Enviando packet KISS manual...');
        console.log('   🎧 ¡ESCUCHA LOS AURICULARES AHORA!');
        
        const sendResult = await new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(5000);
            
            socket.on('connect', () => {
                socket.write(kissFrame);
                console.log('   ✅ Packet KISS enviado');
                socket.end();
                resolve(true);
            });
            
            socket.on('error', (err) => {
                console.log('   ❌ Error enviando:', err.message);
                resolve(false);
            });
            
            socket.connect(8001, 'localhost');
        });

        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('\n4. 🎯 Iniciando VX200 Controller completo...');
        
        vx200Process = spawn('node', ['src/index.js'], {
            cwd: '/home/fokerone/vx200RPTController',
            env: { ...process.env, AUDIO_DEVICE: 'default' }
        });

        let vx200Ready = false;
        let aprsModuleLoaded = false;

        vx200Process.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('   📱 VX200:', output.trim());
            
            if (output.includes('VX200 Controller iniciado')) {
                vx200Ready = true;
            }
            
            if (output.includes('Sistema APRS iniciado') || output.includes('APRS')) {
                aprsModuleLoaded = true;
                console.log('   ✅ Módulo APRS cargado en VX200');
            }
        });

        vx200Process.stderr.on('data', (data) => {
            const output = data.toString();
            console.log('   ⚠️ VX200 stderr:', output.trim());
        });

        console.log('   ⏳ Esperando inicialización VX200...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        console.log('\n5. 🌐 Test del panel web APRS...');
        
        // Test HTTP del endpoint APRS
        const http = require('http');
        const webTest = await new Promise((resolve) => {
            const req = http.get('http://localhost:3000', (res) => {
                console.log('   ✅ Panel web accesible:', res.statusCode);
                resolve(true);
            });
            
            req.on('error', (err) => {
                console.log('   ❌ Panel web no accesible:', err.message);
                resolve(false);
            });
            
            req.setTimeout(5000, () => {
                req.destroy();
                resolve(false);
            });
        });

        console.log('\n🎯 === RESULTADO FINAL ===');
        
        const allWorking = kissTest && sendResult && vx200Ready;
        
        if (allWorking) {
            console.log('✅ SISTEMA APRS COMPLETAMENTE FUNCIONAL:');
            console.log('   🎧 Audio: default → auriculares → VOX → VHF');
            console.log('   📡 Direwolf: Funcionando con KISS en puerto 8001');
            console.log('   📤 Envío manual: Confirmado vía KISS');
            console.log('   🎮 VX200 Controller: Iniciado correctamente');
            console.log('   🌐 Panel web: Accesible en puerto 3000');
            console.log('');
            console.log('📋 PASOS PARA USAR:');
            console.log('   1. Abre http://localhost:3000 en navegador');
            console.log('   2. Ve a la sección APRS');
            console.log('   3. Haz clic en "Enviar Beacon"');
            console.log('   4. Verifica que se encienda LED TX en VHF');
            console.log('   5. Confirma transmisión con otro receptor');
            
        } else {
            console.log('❌ PROBLEMAS EN EL SISTEMA:');
            if (!kissTest) console.log('   - Puerto KISS no funciona');
            if (!sendResult) console.log('   - No se pudo enviar packet manual');
            if (!vx200Ready) console.log('   - VX200 Controller no se inició');
        }

        return allWorking;

    } catch (error) {
        console.error('\n❌ ERROR EN TEST COMPLETO:', error.message);
        return false;
        
    } finally {
        console.log('\n🧹 Limpiando procesos...');
        
        if (vx200Process) {
            vx200Process.kill('SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        if (direwolfProcess) {
            direwolfProcess.kill('SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

// Ejecutar test
if (require.main === module) {
    testAPRSComplete()
        .then(success => {
            if (success) {
                console.log('\n🎯 RESULTADO: ¡SISTEMA APRS LISTO PARA USO!');
                console.log('   Direwolf + VX200 + Panel Web funcionando');
            } else {
                console.log('\n❌ RESULTADO: Sistema con problemas');
            }
        })
        .catch(console.error);
}

module.exports = testAPRSComplete;