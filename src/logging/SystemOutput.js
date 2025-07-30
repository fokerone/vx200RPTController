// Config será importado dinámicamente para evitar dependencia circular

/**
 * Sistema de Output del Sistema
 * Maneja los mensajes importantes que debe ver el usuario
 * Sin emojis, formato limpio y profesional
 */
class SystemOutput {
    constructor() {
        this.colors = {
            reset: '\x1b[0m',
            bold: '\x1b[1m',
            green: '\x1b[32m',
            blue: '\x1b[34m',
            cyan: '\x1b[36m',
            yellow: '\x1b[33m',
            red: '\x1b[31m'
        };
    }

    // Banner de inicio del sistema
    printStartupBanner() {
        const { Config } = require('../config');
        const line = '='.repeat(60);
        console.log(`\n${this.colors.cyan}${line}${this.colors.reset}`);
        console.log(`${this.colors.bold}${this.colors.cyan}                    VX200 CONTROLLER                    ${this.colors.reset}`);
        console.log(`${this.colors.cyan}              Sistema de Control para Repetidora              ${this.colors.reset}`);
        console.log(`${this.colors.cyan}${line}${this.colors.reset}`);
        console.log(`${this.colors.green}Callsign: ${Config.callsign}${this.colors.reset}`);
        console.log(`${this.colors.green}Version:  ${Config.version}${this.colors.reset}`);
        console.log(`${this.colors.green}Web Panel: http://${Config.webHost}:${Config.webPort}${this.colors.reset}`);
        console.log(`${this.colors.cyan}${line}${this.colors.reset}\n`);
    }

    // Estado de inicialización de módulos
    printModuleStatus(modules) {
        console.log(`${this.colors.bold}MODULE STATUS:${this.colors.reset}`);
        
        Object.entries(modules).forEach(([name, status]) => {
            const statusText = status.enabled ? 'ENABLED' : 'DISABLED';
            const color = status.enabled ? this.colors.green : this.colors.yellow;
            const details = status.details ? ` (${status.details})` : '';
            console.log(`  ${name.padEnd(12)}: ${color}${statusText}${this.colors.reset}${details}`);
        });
        console.log('');
    }

    // Sistema iniciado exitosamente
    printSystemReady() {
        console.log(`${this.colors.bold}${this.colors.green}SYSTEM READY${this.colors.reset}`);
        console.log(`${this.colors.green}All modules initialized successfully${this.colors.reset}`);
        console.log(`${this.colors.green}Listening for DTMF commands...${this.colors.reset}\n`);
        
        // Comandos DTMF disponibles
        console.log(`${this.colors.bold}DTMF COMMANDS:${this.colors.reset}`);
        const { getValue } = require('../config');
        const commands = getValue('dtmf.commands');
        Object.entries(commands).forEach(([dtmf, module]) => {
            console.log(`  ${dtmf} -> ${module}`);
        });
        console.log('');
    }

    // DTMF detectado
    printDTMFDetected(sequence, targetModule) {
        console.log(`${this.colors.blue}DTMF: ${sequence} -> ${targetModule}${this.colors.reset}`);
    }

    // Errores críticos
    printError(message, details = '') {
        console.error(`${this.colors.red}ERROR: ${message}${this.colors.reset}`);
        if (details) {
            console.error(`${this.colors.red}Details: ${details}${this.colors.reset}`);
        }
    }

    // Advertencias importantes
    printWarning(message) {
        console.warn(`${this.colors.yellow}WARNING: ${message}${this.colors.reset}`);
    }

    // Sistema deteniéndose
    printShutdown() {
        console.log(`\n${this.colors.yellow}SYSTEM SHUTDOWN${this.colors.reset}`);
        console.log(`${this.colors.yellow}Stopping all modules...${this.colors.reset}`);
    }

    // Sistema detenido
    printStopped() {
        console.log(`${this.colors.green}System stopped successfully${this.colors.reset}\n`);
    }

    // Separador para logs
    printSeparator() {
        console.log(`${this.colors.cyan}${'─'.repeat(60)}${this.colors.reset}`);
    }

    // Mensaje simple sin formato
    print(message) {
        console.log(message);
    }
}

// Singleton
let systemOutput = null;

function getSystemOutput() {
    if (!systemOutput) {
        systemOutput = new SystemOutput();
    }
    return systemOutput;
}

module.exports = {
    SystemOutput,
    getSystemOutput
};