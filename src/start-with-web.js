#!/usr/bin/env node

const VX200Controller = require('./index');
const { getSystemOutput } = require('./logging/SystemOutput');

// Sistema de output limpio
const systemOutput = getSystemOutput();
systemOutput.printStartupBanner();

// Manejo de errores de inicio
process.on('uncaughtException', (error) => {
    systemOutput.printError('Critical error during startup', error.message);
    systemOutput.print('Check configuration and dependencies');
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    systemOutput.printError('Promise rejection during startup', reason);
    process.exit(1);
});

// Inicializar controlador
async function main() {
    try {
        const controller = new VX200Controller();
        
        // Iniciar el sistema
        await controller.start();
        
        // Manejo limpio de cierre
        process.on('SIGINT', () => {
            console.log('\n');
            controller.stop();
            process.exit(0);
        });
        
    } catch (error) {
        systemOutput.printError('Fatal error starting VX200 Controller', error.message);
        systemOutput.print('Check configuration in config/config.json');
        process.exit(1);
    }
}

// Ejecutar función principal
main();
