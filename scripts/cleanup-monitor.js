#!/usr/bin/env node

/**
 * Herramienta de monitoreo y limpieza de archivos temporales VX200
 * Para funcionamiento 24/7 sin interrupciones
 * 
 * Uso:
 *   node scripts/cleanup-monitor.js [comando]
 *   
 * Comandos:
 *   status  - Mostrar estado de archivos temporales
 *   clean   - Ejecutar limpieza manual
 *   watch   - Monitorear continuamente
 *   help    - Mostrar ayuda
 */

const fs = require('fs');
const path = require('path');

class CleanupMonitor {
    constructor() {
        this.baseDir = path.join(__dirname, '..');
        this.tempDir = path.join(this.baseDir, 'temp');
        this.soundsTempDir = path.join(this.baseDir, 'sounds', 'temp');
        
        this.config = {
            maxFileAge: 2 * 60 * 60 * 1000,     // 2 horas
            criticalAge: 24 * 60 * 60 * 1000,   // 24 horas  
            maxTotalSize: 100 * 1024 * 1024,    // 100MB
            criticalSize: 500 * 1024 * 1024     // 500MB
        };
    }

    /**
     * Ejecutar comando principal
     */
    async run() {
        const command = process.argv[2] || 'status';
        
        console.log('🧹 VX200 Cleanup Monitor - Sistema 24/7');
        console.log('=========================================\n');
        
        try {
            switch (command) {
                case 'status':
                    await this.showStatus();
                    break;
                case 'clean':
                    await this.performCleanup();
                    break;
                case 'watch':
                    await this.startWatching();
                    break;
                case 'help':
                    this.showHelp();
                    break;
                default:
                    console.log(`❌ Comando desconocido: ${command}`);
                    this.showHelp();
                    process.exit(1);
            }
        } catch (error) {
            console.error('❌ Error:', error.message);
            process.exit(1);
        }
    }

    /**
     * Mostrar estado actual de archivos temporales
     */
    async showStatus() {
        const stats = await this.getComprehensiveStats();
        
        console.log('📊 ESTADO DE ARCHIVOS TEMPORALES');
        console.log('─'.repeat(50));
        
        // Estadísticas por directorio
        Object.entries(stats.directories).forEach(([dirName, dirStats]) => {
            const status = this.getDirectoryStatus(dirStats);
            console.log(`${status.icon} ${dirName}:`);
            console.log(`   Archivos: ${dirStats.files}`);
            console.log(`   Tamaño: ${dirStats.sizeMB}MB`);
            
            if (dirStats.oldestFile) {
                const ageHours = Math.round(dirStats.oldestFile.age / (60 * 60 * 1000));
                console.log(`   Más antiguo: ${dirStats.oldestFile.name} (${ageHours}h)`);
            }
            
            if (status.alerts.length > 0) {
                status.alerts.forEach(alert => {
                    console.log(`   ⚠️  ${alert}`);
                });
            }
            console.log();
        });

        // Resumen total
        const totalStatus = this.getTotalStatus(stats.total);
        console.log(`${totalStatus.icon} TOTAL: ${stats.total.files} archivos (${stats.total.sizeMB}MB)`);
        
        if (totalStatus.alerts.length > 0) {
            console.log('\n🚨 ALERTAS:');
            totalStatus.alerts.forEach(alert => {
                console.log(`   • ${alert}`);
            });
        }

        // Recomendaciones
        this.showRecommendations(stats);
    }

    /**
     * Ejecutar limpieza manual
     */
    async performCleanup() {
        console.log('🧹 Ejecutando limpieza de archivos temporales...\n');
        
        const statsBefore = await this.getComprehensiveStats();
        let totalCleaned = 0;
        let totalFreed = 0;

        // Limpiar cada directorio
        for (const [dirName, dirPath] of Object.entries({
            'temp': this.tempDir,
            'sounds/temp': this.soundsTempDir
        })) {
            if (!fs.existsSync(dirPath)) {
                console.log(`⏭️  ${dirName}: directorio no existe`);
                continue;
            }

            const cleaned = await this.cleanupDirectory(dirPath, dirName);
            totalCleaned += cleaned.count;
            totalFreed += cleaned.size;
        }

        const statsAfter = await this.getComprehensiveStats();
        const freedMB = (totalFreed / (1024 * 1024)).toFixed(2);
        
        console.log('\n✅ LIMPIEZA COMPLETADA');
        console.log('─'.repeat(30));
        console.log(`Archivos eliminados: ${totalCleaned}`);
        console.log(`Espacio liberado: ${freedMB}MB`);
        console.log(`Archivos restantes: ${statsAfter.total.files}`);
        console.log(`Espacio usado: ${statsAfter.total.sizeMB}MB`);
        
        if (totalCleaned === 0) {
            console.log('\n💡 No había archivos para limpiar.');
        }
    }

    /**
     * Limpiar un directorio específico
     */
    async cleanupDirectory(directory, name) {
        let cleaned = 0;
        let freedSize = 0;

        try {
            const files = fs.readdirSync(directory);
            const now = Date.now();

            for (const file of files) {
                const filePath = path.join(directory, file);
                
                try {
                    const stats = fs.statSync(filePath);
                    const age = now - stats.mtimeMs;
                    
                    if (this.shouldCleanFile(file, age)) {
                        const fileSize = stats.size;
                        fs.unlinkSync(filePath);
                        cleaned++;
                        freedSize += fileSize;
                        
                        const ageMins = Math.round(age / (60 * 1000));
                        const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
                        console.log(`🗑️  ${name}/${file} (${sizeMB}MB, ${ageMins}min)`);
                    }
                } catch (fileError) {
                    console.log(`⚠️  Error procesando ${file}: ${fileError.message}`);
                }
            }
            
        } catch (error) {
            console.log(`❌ Error limpiando ${name}: ${error.message}`);
        }

        return { count: cleaned, size: freedSize };
    }

    /**
     * Determinar si un archivo debe ser limpiado
     */
    shouldCleanFile(filename, age) {
        // Patrones de archivos temporales conocidos
        const tempPatterns = [
            /^combined_\d+\.mp3$/,
            /^temp_\d+\.(wav|mp3)$/,
            /^tts_\d+\.(wav|mp3)$/,
            /^tone_\d+\.wav$/,
            /^record_\d+\.wav$/,
            /^speech_\d+\.wav$/,
            /^google_tts_\d+\.mp3$/,
            /^espeak_\d+\.wav$/
        ];

        const isTemporary = tempPatterns.some(pattern => pattern.test(filename));
        
        if (isTemporary) {
            // Archivos temporales > 2 horas
            return age > this.config.maxFileAge;
        }
        
        // Cualquier archivo > 24 horas
        return age > this.config.criticalAge;
    }

    /**
     * Obtener estadísticas completas
     */
    async getComprehensiveStats() {
        const stats = {
            directories: {},
            total: { files: 0, size: 0, sizeMB: '0.00' }
        };

        const dirsToCheck = [
            { path: this.tempDir, name: 'temp' },
            { path: this.soundsTempDir, name: 'sounds/temp' }
        ];

        for (const { path: dirPath, name } of dirsToCheck) {
            stats.directories[name] = await this.getDirectoryStats(dirPath);
            stats.total.files += stats.directories[name].files;
            stats.total.size += stats.directories[name].size;
        }

        stats.total.sizeMB = (stats.total.size / (1024 * 1024)).toFixed(2);
        return stats;
    }

    /**
     * Obtener estadísticas de un directorio
     */
    async getDirectoryStats(directory) {
        const stats = {
            files: 0,
            size: 0,
            sizeMB: '0.00',
            oldestFile: null
        };

        if (!fs.existsSync(directory)) {
            return stats;
        }

        try {
            const files = fs.readdirSync(directory);
            const now = Date.now();
            let oldestAge = 0;

            for (const file of files) {
                try {
                    const filePath = path.join(directory, file);
                    const fileStats = fs.statSync(filePath);
                    
                    if (fileStats.isFile()) {
                        stats.files++;
                        stats.size += fileStats.size;
                        
                        const age = now - fileStats.mtimeMs;
                        if (age > oldestAge) {
                            oldestAge = age;
                            stats.oldestFile = {
                                name: file,
                                age: age,
                                size: fileStats.size
                            };
                        }
                    }
                } catch (error) {
                    // Ignorar errores de archivos individuales
                }
            }

            stats.sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        } catch (error) {
            stats.error = error.message;
        }

        return stats;
    }

    /**
     * Evaluar estado de un directorio
     */
    getDirectoryStatus(dirStats) {
        const alerts = [];
        let icon = '✅';

        if (dirStats.files > 50) {
            alerts.push(`Muchos archivos (${dirStats.files})`);
            icon = '⚠️';
        }

        if (parseFloat(dirStats.sizeMB) > 50) {
            alerts.push(`Alto uso de espacio (${dirStats.sizeMB}MB)`);
            icon = '⚠️';
        }

        if (dirStats.oldestFile && dirStats.oldestFile.age > (12 * 60 * 60 * 1000)) {
            const ageHours = Math.round(dirStats.oldestFile.age / (60 * 60 * 1000));
            alerts.push(`Archivos antiguos (${ageHours}h)`);
            icon = '⚠️';
        }

        if (dirStats.error) {
            alerts.push(`Error: ${dirStats.error}`);
            icon = '❌';
        }

        return { icon, alerts };
    }

    /**
     * Evaluar estado total
     */
    getTotalStatus(totalStats) {
        const alerts = [];
        let icon = '✅';

        if (totalStats.files > 100) {
            alerts.push(`Demasiados archivos temporales (${totalStats.files})`);
            icon = '🚨';
        } else if (totalStats.files > 50) {
            alerts.push(`Muchos archivos temporales (${totalStats.files})`);
            icon = '⚠️';
        }

        if (parseFloat(totalStats.sizeMB) > 200) {
            alerts.push(`Uso crítico de espacio (${totalStats.sizeMB}MB)`);
            icon = '🚨';
        } else if (parseFloat(totalStats.sizeMB) > 100) {
            alerts.push(`Alto uso de espacio (${totalStats.sizeMB}MB)`);
            icon = '⚠️';
        }

        return { icon, alerts };
    }

    /**
     * Mostrar recomendaciones
     */
    showRecommendations(stats) {
        const recommendations = [];

        if (stats.total.files > 100) {
            recommendations.push('Ejecutar limpieza: node scripts/cleanup-monitor.js clean');
        }

        if (parseFloat(stats.total.sizeMB) > 100) {
            recommendations.push('Revisar configuración de cleanup automático');
        }

        if (recommendations.length > 0) {
            console.log('\n💡 RECOMENDACIONES:');
            recommendations.forEach(rec => {
                console.log(`   • ${rec}`);
            });
        }
    }

    /**
     * Monitoreo continuo
     */
    async startWatching() {
        console.log('👁️  Iniciando monitoreo continuo (Ctrl+C para detener)...\n');
        
        const showStatus = async () => {
            const now = new Date().toLocaleString('es-AR');
            console.clear();
            console.log(`🧹 VX200 Cleanup Monitor - ${now}`);
            console.log('═'.repeat(60));
            await this.showStatus();
            console.log('\n⏰ Próxima actualización en 30 segundos...');
        };

        await showStatus();
        const interval = setInterval(showStatus, 30000);

        process.on('SIGINT', () => {
            clearInterval(interval);
            console.log('\n\n👋 Monitoreo detenido.');
            process.exit(0);
        });
    }

    /**
     * Mostrar ayuda
     */
    showHelp() {
        console.log(`
📖 AYUDA - VX200 Cleanup Monitor

COMANDOS:
  status    Mostrar estado actual de archivos temporales
  clean     Ejecutar limpieza manual de archivos antiguos  
  watch     Monitoreo continuo cada 30 segundos
  help      Mostrar esta ayuda

EJEMPLOS:
  node scripts/cleanup-monitor.js status
  node scripts/cleanup-monitor.js clean
  node scripts/cleanup-monitor.js watch

CONFIGURACIÓN:
  • Archivos temporales eliminados después de 2 horas
  • Cualquier archivo eliminado después de 24 horas  
  • Alertas si más de 50 archivos o 100MB de uso
  • Sistema optimizado para funcionamiento 24/7

Para más información, revisar logs del sistema principal.
`);
    }
}

// Ejecutar monitor si es llamado directamente
if (require.main === module) {
    const monitor = new CleanupMonitor();
    monitor.run().catch(error => {
        console.error('❌ Error fatal:', error.message);
        process.exit(1);
    });
}

module.exports = CleanupMonitor;