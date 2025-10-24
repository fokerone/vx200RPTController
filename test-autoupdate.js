#!/usr/bin/env node

/**
 * Script de prueba para el sistema de Auto-Actualización
 */

const AutoUpdater = require('./src/modules/autoUpdater');

async function testAutoUpdate() {
    console.log('🔄 Probando Sistema de Auto-Actualización\n');

    // Crear instancia sin OLED para testing
    const autoUpdater = new AutoUpdater(null);

    console.log('📊 Estado actual:');
    console.log(`  Versión actual: ${autoUpdater.updateStatus.currentVersion}`);
    console.log(`  Configuración:`);
    console.log(`    - Enabled: ${autoUpdater.config.enabled}`);
    console.log(`    - Auto-install: ${autoUpdater.config.autoInstall}`);
    console.log(`    - Channel: ${autoUpdater.config.channel}`);
    console.log(`    - Intervalo: ${Math.round(autoUpdater.config.checkInterval / 1000 / 60)} min\n`);

    console.log('🔍 Verificando actualizaciones en GitHub...\n');

    try {
        const release = await autoUpdater.checkForUpdates();

        if (release) {
            console.log('✅ Nueva actualización disponible!\n');
            console.log(`📦 Release: ${release.tag_name}`);
            console.log(`📅 Fecha: ${release.published_at}`);
            console.log(`📝 Nombre: ${release.name}`);
            console.log(`🔗 URL: ${release.html_url}\n`);

            console.log('📁 Assets disponibles:');
            release.assets.forEach(asset => {
                const sizeMB = (asset.size / 1024 / 1024).toFixed(2);
                console.log(`  - ${asset.name} (${sizeMB} MB)`);
                console.log(`    Download: ${asset.browser_download_url}`);
            });

            console.log('\n⚠️  Para instalar la actualización:');
            console.log('   1. Habilitar auto-install en .env:');
            console.log('      AUTO_UPDATE_AUTO_INSTALL=true');
            console.log('   2. O ejecutar manualmente:');
            console.log('      await autoUpdater.forceInstall();');

        } else {
            if (autoUpdater.updateStatus.available === false) {
                console.log('✅ Sistema actualizado!\n');
                console.log(`   Versión actual: ${autoUpdater.updateStatus.currentVersion}`);
                console.log(`   No hay actualizaciones disponibles.`);
            } else {
                console.log('ℹ️  No se encontraron releases en el repositorio.');
            }
        }

    } catch (error) {
        console.error('❌ Error verificando actualizaciones:', error.message);
        console.error('\n🔧 Troubleshooting:');
        console.error('   - Verificar conectividad a GitHub');
        console.error('   - Verificar que exista el repositorio');
        console.error('   - Verificar que haya releases publicados');
    }

    console.log('\n📊 Estado final:');
    const status = autoUpdater.getStatus();
    console.log(JSON.stringify(status, null, 2));
}

// Ejecutar test
testAutoUpdate()
    .then(() => {
        console.log('\n✅ Test completado');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Test falló:', error);
        process.exit(1);
    });
