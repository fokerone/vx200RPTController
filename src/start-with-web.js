#!/usr/bin/env node

const VX200Controller = require('./index');
const config = require('../config/config.json');

// Banner de inicio
console.log('┌' + '─'.repeat(58) + '┐');
console.log('│' + ' '.repeat(18) + 'VX200 CONTROLLER' + ' '.repeat(18) + '│');
console.log('│' + ' '.repeat(15) + 'Sistema de Repetidora' + ' '.repeat(15) + '│');
console.log('├' + '─'.repeat(58) + '┤');
console.log('│ 🌐 Panel Web: http://localhost:3000                    │');
console.log('│  Indicativo: ' + (config.callsign || 'VX200').padEnd(35) + '│');
console.log('│  Roger Beep: ' + (config.rogerBeep?.enabled ? 'Habilitado' : 'Deshabilitado').padEnd(34) + '│');
console.log('│  Baliza: ' + (config.baliza?.enabled ? `Cada ${config.baliza.interval} min` : 'Deshabilitada').padEnd(39) + '│');
console.log('└' + '─'.repeat(58) + '┘');
console.log('');
console.log('🚀 Iniciando sistema...');

// Manejo de errores de inicio
process.on('uncaughtException', (error) => {
    console.error('❌ Error crítico durante el inicio:', error.message);
    console.error('💡 Verifica la configuración y las dependencias');
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Error de promesa durante el inicio:', reason);
    process.exit(1);
});

// Mensaje de ayuda
function showHelp() {
    console.log('');
    console.log('📞 Comandos DTMF disponibles:');
    console.log('   *1 = Fecha y hora actual');
    console.log('   *2 = IA Chat (simulado)');
    console.log('   *3 = Sistema SMS');
    console.log('   *9 = Baliza manual');
    console.log('');
    console.log('🌐 Panel Web:');
    console.log('   • Control de servicios en tiempo real');
    console.log('   • Toggle Roger Beep (solo desde web)');
    console.log('   • Configuración de baliza');
    console.log('   • Monitoreo del sistema');
    console.log('');
    console.log('⌨️  Presiona Ctrl+C para detener el sistema');
    console.log('');
}

// Inicializar controlador
async function main() {
    try {
        const controller = new VX200Controller();
        
        // Iniciar el sistema
        await controller.start();
        
        // Mostrar ayuda después del inicio
        setTimeout(() => {
            if (controller.isRunning) {
                showHelp();
            }
        }, 2000);
        
        // Manejo limpio de cierre
        process.on('SIGINT', () => {
            console.log('\n');
            console.log('🛑 Deteniendo VX200 Controller...');
            console.log('👋 ¡Hasta luego!');
            controller.stop();
            process.exit(0);
        });
        
    } catch (error) {
        console.error('❌ Error fatal iniciando VX200 Controller:', error.message);
        console.error('💡 Revisa la configuración en config/config.json');
        process.exit(1);
    }
}

// Ejecutar función principal
main();

