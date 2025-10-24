const EventEmitter = require('events');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { createLogger } = require('../logging/Logger');
const { MODULE_STATES } = require('../constants');

/**
 * Sistema de Auto-Actualización para VX200 RPT Controller
 *
 * Funcionalidades:
 * - Verificación periódica de nuevas releases en GitHub
 * - Descarga segura con verificación SHA256
 * - Backup automático antes de actualizar
 * - Rollback en caso de fallo
 * - Integración con OLED para mostrar progreso
 * - Sistema a prueba de fallos
 */
class AutoUpdater extends EventEmitter {
    constructor(displayOLED = null) {
        super();
        this.logger = createLogger('[AutoUpdater]');
        this.display = displayOLED;
        this.state = MODULE_STATES.IDLE;

        this.config = {
            enabled: process.env.AUTO_UPDATE_ENABLED === 'true' || false,
            checkInterval: parseInt(process.env.AUTO_UPDATE_INTERVAL) || 6 * 60 * 60 * 1000, // 6 horas
            autoInstall: process.env.AUTO_UPDATE_AUTO_INSTALL === 'true' || false,
            channel: process.env.AUTO_UPDATE_CHANNEL || 'stable', // stable, beta, all

            github: {
                owner: 'fokerone', // Cambiar por tu usuario
                repo: 'vx200RPTController',
                apiUrl: 'https://api.github.com'
            },

            paths: {
                root: path.join(__dirname, '../..'),
                backup: '/tmp/vx200_backup',
                download: '/tmp/vx200_update',
                package: path.join(__dirname, '../../package.json')
            }
        };

        // Estado del update
        this.updateStatus = {
            checking: false,
            downloading: false,
            installing: false,
            available: false,
            currentVersion: this.getCurrentVersion(),
            latestVersion: null,
            latestRelease: null,
            downloadProgress: 0,
            lastCheck: null,
            lastUpdate: null
        };

        // Timers
        this.checkTimer = null;

        this.logger.info(`Auto-updater inicializado - Versión actual: ${this.updateStatus.currentVersion}`);
        if (!this.config.enabled) {
            this.logger.info('Auto-update DESHABILITADO (configurar AUTO_UPDATE_ENABLED=true para habilitar)');
        } else {
            this.logger.info(`Auto-update HABILITADO - Verificará cada ${Math.round(this.config.checkInterval / 60000)} minutos`);
            this.logger.info(`Canal: ${this.config.channel} | Auto-install: ${this.config.autoInstall ? 'SÍ' : 'NO'}`);
        }
    }

    /**
     * Obtener versión actual del package.json
     */
    getCurrentVersion() {
        try {
            const packageJson = JSON.parse(fs.readFileSync(this.config.paths.package, 'utf8'));
            return packageJson.version || '0.0.0';
        } catch (error) {
            this.logger.error('Error leyendo versión actual:', error.message);
            return '0.0.0';
        }
    }

    /**
     * Iniciar sistema de auto-update
     */
    start() {
        if (!this.config.enabled) {
            this.logger.info('Auto-update deshabilitado, no se iniciará verificación periódica');
            return false;
        }

        if (this.state === MODULE_STATES.ACTIVE) {
            this.logger.warn('Auto-updater ya está activo');
            return false;
        }

        this.state = MODULE_STATES.ACTIVE;
        this.logger.info(`Auto-updater iniciado - Verificación cada ${Math.round(this.config.checkInterval / 1000 / 60)} minutos`);
        this.logger.info(`Repositorio: ${this.config.github.owner}/${this.config.github.repo}`);

        // Primera verificación inmediata
        setTimeout(() => this.checkForUpdates(), 30000); // 30 segundos después del arranque

        // Programar verificaciones periódicas
        this.checkTimer = setInterval(() => {
            this.checkForUpdates();
        }, this.config.checkInterval);

        return true;
    }

    /**
     * Detener sistema de auto-update
     */
    stop() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }

        this.state = MODULE_STATES.IDLE;
        this.logger.info('Auto-updater detenido');
    }

    /**
     * Verificar si hay actualizaciones disponibles
     */
    async checkForUpdates() {
        if (this.updateStatus.checking) {
            this.logger.debug('Ya hay una verificación en curso');
            return null;
        }

        this.updateStatus.checking = true;
        this.updateStatus.lastCheck = new Date();

        try {
            this.logger.info('Verificando actualizaciones en GitHub...');
            this.emit('check_started');

            // Notificar al OLED
            if (this.display) {
                await this.display.showMessage('Verificando actualizaciones...', 3000);
            }

            // Obtener latest release
            const release = await this.getLatestRelease();

            if (!release) {
                this.logger.info('No se encontraron releases disponibles');
                this.updateStatus.checking = false;
                return null;
            }

            const latestVersion = this.parseVersion(release.tag_name);
            const currentVersion = this.parseVersion(this.updateStatus.currentVersion);

            this.updateStatus.latestVersion = release.tag_name;
            this.updateStatus.latestRelease = release;

            // Comparar versiones
            if (this.isNewerVersion(latestVersion, currentVersion)) {
                this.updateStatus.available = true;
                this.logger.info(`Nueva versión disponible: ${release.tag_name} (actual: ${this.updateStatus.currentVersion})`);

                // Notificar al OLED
                if (this.display) {
                    await this.display.showMessage(`Update: ${release.tag_name}`, 5000);
                }

                this.emit('update_available', {
                    current: this.updateStatus.currentVersion,
                    latest: release.tag_name,
                    release: release
                });

                // Auto-instalar si está habilitado
                if (this.config.autoInstall) {
                    this.logger.info('Auto-instalación habilitada, descargando actualización...');
                    setTimeout(() => this.downloadAndInstall(release), 5000);
                }

                return release;
            } else {
                this.updateStatus.available = false;
                this.logger.info(`Sistema actualizado - Versión: ${this.updateStatus.currentVersion}`);
                this.emit('up_to_date', { version: this.updateStatus.currentVersion });
                return null;
            }

        } catch (error) {
            this.logger.error('Error verificando actualizaciones:', error.message);
            this.emit('check_error', error);

            if (this.display) {
                await this.display.showMessage('Error verificando updates', 3000);
            }

            return null;
        } finally {
            this.updateStatus.checking = false;
        }
    }

    /**
     * Obtener último release de GitHub
     */
    async getLatestRelease() {
        const { owner, repo, apiUrl } = this.config.github;
        const url = `${apiUrl}/repos/${owner}/${repo}/releases/latest`;

        try {
            const response = await axios.get(url, {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'VX200-AutoUpdater'
                },
                timeout: 30000
            });

            return response.data;
        } catch (error) {
            if (error.response?.status === 404) {
                this.logger.warn('No se encontraron releases en el repositorio');
                return null;
            }
            throw error;
        }
    }

    /**
     * Parsear string de versión a objeto comparable
     */
    parseVersion(versionString) {
        // Remover 'v' inicial si existe
        const cleaned = versionString.replace(/^v/, '');
        const parts = cleaned.split(/[.-]/).map(p => parseInt(p) || 0);

        return {
            major: parts[0] || 0,
            minor: parts[1] || 0,
            patch: parts[2] || 0,
            build: parts[3] || 0
        };
    }

    /**
     * Comparar si una versión es más nueva que otra
     */
    isNewerVersion(newVer, currentVer) {
        if (newVer.major > currentVer.major) return true;
        if (newVer.major < currentVer.major) return false;

        if (newVer.minor > currentVer.minor) return true;
        if (newVer.minor < currentVer.minor) return false;

        if (newVer.patch > currentVer.patch) return true;
        if (newVer.patch < currentVer.patch) return false;

        if (newVer.build > currentVer.build) return true;

        return false;
    }

    /**
     * Descargar e instalar actualización
     */
    async downloadAndInstall(release) {
        if (this.updateStatus.downloading || this.updateStatus.installing) {
            this.logger.warn('Ya hay una instalación en curso');
            return false;
        }

        try {
            this.logger.info(`Iniciando descarga de ${release.tag_name}...`);
            this.emit('download_started', release);

            // Mostrar en OLED
            if (this.display) {
                await this.display.showMessage(`Descargando ${release.tag_name}...`, 3000);
            }

            // 1. Descargar release
            const downloadedFile = await this.downloadRelease(release);

            // 2. Verificar integridad (SHA256)
            const isValid = await this.verifyDownload(downloadedFile, release);
            if (!isValid) {
                throw new Error('Verificación de integridad falló');
            }

            // 3. Crear backup del sistema actual
            await this.createBackup();

            // 4. Instalar actualización
            await this.installUpdate(downloadedFile, release);

            // 5. Validar instalación
            const isInstalled = await this.validateInstallation(release);
            if (!isInstalled) {
                throw new Error('Validación post-instalación falló');
            }

            this.updateStatus.lastUpdate = new Date();
            this.updateStatus.currentVersion = release.tag_name;
            this.updateStatus.available = false;

            this.logger.info(`Actualización completada exitosamente a ${release.tag_name}`);
            this.emit('update_completed', { version: release.tag_name });

            // Mostrar éxito en OLED
            if (this.display) {
                await this.display.showMessage(`Update OK: ${release.tag_name}`, 5000);
            }

            // Reiniciar servicio
            this.logger.info('Reiniciando servicio en 10 segundos...');
            setTimeout(() => this.restartService(), 10000);

            return true;

        } catch (error) {
            this.logger.error('Error en actualización:', error.message);
            this.emit('update_error', error);

            // Mostrar error en OLED
            if (this.display) {
                await this.display.showMessage('Update FAILED', 5000);
            }

            // Intentar rollback
            try {
                await this.rollback();
            } catch (rollbackError) {
                this.logger.error('Error en rollback:', rollbackError.message);
            }

            return false;
        }
    }

    /**
     * Descargar release desde GitHub
     */
    async downloadRelease(release) {
        // Buscar asset .tar.gz o .zip
        const asset = release.assets.find(a =>
            a.name.endsWith('.tar.gz') || a.name.endsWith('.zip')
        );

        if (!asset) {
            throw new Error('No se encontró archivo de release');
        }

        const downloadPath = path.join(this.config.paths.download, asset.name);

        // Crear directorio de descarga
        if (!fs.existsSync(this.config.paths.download)) {
            fs.mkdirSync(this.config.paths.download, { recursive: true });
        }

        this.updateStatus.downloading = true;
        this.logger.info(`Descargando ${asset.name} (${(asset.size / 1024 / 1024).toFixed(2)} MB)...`);

        try {
            const response = await axios({
                method: 'GET',
                url: asset.browser_download_url,
                responseType: 'stream',
                timeout: 300000, // 5 minutos
                onDownloadProgress: (progressEvent) => {
                    const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    this.updateStatus.downloadProgress = progress;

                    if (progress % 10 === 0) {
                        this.logger.debug(`Descarga: ${progress}%`);
                        this.emit('download_progress', progress);
                    }
                }
            });

            const writer = fs.createWriteStream(downloadPath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            this.logger.info(`Descarga completada: ${downloadPath}`);
            return downloadPath;

        } finally {
            this.updateStatus.downloading = false;
            this.updateStatus.downloadProgress = 0;
        }
    }

    /**
     * Verificar integridad del archivo descargado
     */
    async verifyDownload(filePath, release) {
        this.logger.info('Verificando integridad del archivo...');

        try {
            // Calcular SHA256 del archivo descargado
            const hash = await this.calculateSHA256(filePath);

            // Buscar checksum en release notes o assets
            let expectedHash = null;

            // 1. Buscar en asset con nombre *.sha256
            const checksumAsset = release.assets.find(a => a.name.endsWith('.sha256'));
            if (checksumAsset) {
                const response = await axios.get(checksumAsset.browser_download_url);
                expectedHash = response.data.trim().split(/\s+/)[0];
            }

            // 2. Buscar en el cuerpo del release
            if (!expectedHash && release.body) {
                const match = release.body.match(/sha256[:\s]+([a-f0-9]{64})/i);
                if (match) {
                    expectedHash = match[1];
                }
            }

            if (!expectedHash) {
                this.logger.warn('No se encontró checksum SHA256 en el release, saltando verificación');
                return true; // Continuar sin verificación
            }

            if (hash.toLowerCase() === expectedHash.toLowerCase()) {
                this.logger.info('✓ Verificación de integridad exitosa');
                return true;
            } else {
                this.logger.error('✗ Verificación de integridad FALLÓ');
                this.logger.error(`  Esperado: ${expectedHash}`);
                this.logger.error(`  Obtenido: ${hash}`);
                return false;
            }

        } catch (error) {
            this.logger.error('Error verificando integridad:', error.message);
            return false;
        }
    }

    /**
     * Calcular SHA256 de un archivo
     */
    calculateSHA256(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);

            stream.on('data', data => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    /**
     * Crear backup del sistema actual
     */
    async createBackup() {
        this.logger.info('Creando backup del sistema actual...');

        const backupPath = this.config.paths.backup;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = `${backupPath}_${timestamp}.tar.gz`;

        try {
            // Crear backup con tar
            const cmd = `tar -czf ${backupFile} -C ${this.config.paths.root} --exclude=node_modules --exclude=logs --exclude=temp --exclude=.git .`;
            await execAsync(cmd);

            this.logger.info(`Backup creado: ${backupFile}`);
            return backupFile;

        } catch (error) {
            this.logger.error('Error creando backup:', error.message);
            throw error;
        }
    }

    /**
     * Instalar actualización
     */
    async installUpdate(downloadedFile, release) {
        this.updateStatus.installing = true;
        this.logger.info('Instalando actualización...');

        if (this.display) {
            await this.display.showMessage('Instalando update...', 3000);
        }

        try {
            const rootPath = this.config.paths.root;

            // Extraer archivo descargado
            if (downloadedFile.endsWith('.tar.gz')) {
                // Extraer y mover archivos del subdirectorio vx200RPTController
                const tmpExtract = '/tmp/vx200_extract';
                await execAsync(`rm -rf ${tmpExtract} && mkdir -p ${tmpExtract}`);
                await execAsync(`tar -xzf ${downloadedFile} -C ${tmpExtract}`);
                await execAsync(`cp -rf ${tmpExtract}/vx200RPTController/* ${rootPath}/`);
                await execAsync(`rm -rf ${tmpExtract}`);
            } else if (downloadedFile.endsWith('.zip')) {
                await execAsync(`unzip -o ${downloadedFile} -d ${rootPath}`);
            }

            // Instalar dependencias
            this.logger.info('Instalando dependencias...');
            await execAsync(`cd ${rootPath} && npm install --production`, {
                timeout: 300000 // 5 minutos
            });

            this.logger.info('Instalación completada');

        } finally {
            this.updateStatus.installing = false;
        }
    }

    /**
     * Validar instalación
     */
    async validateInstallation(release) {
        this.logger.info('Validando instalación...');

        try {
            // Verificar que package.json tenga la nueva versión
            const newVersion = this.getCurrentVersion();
            const expectedVersion = release.tag_name.replace(/^v/, '');

            if (newVersion === expectedVersion) {
                this.logger.info('✓ Validación exitosa');
                return true;
            } else {
                this.logger.error(`✗ Validación falló - Versión esperada: ${expectedVersion}, obtenida: ${newVersion}`);
                return false;
            }

        } catch (error) {
            this.logger.error('Error en validación:', error.message);
            return false;
        }
    }

    /**
     * Rollback a versión anterior
     */
    async rollback() {
        this.logger.warn('Iniciando rollback...');

        if (this.display) {
            await this.display.showMessage('Rollback...', 3000);
        }

        try {
            // Buscar último backup
            const backupDir = path.dirname(this.config.paths.backup);
            const backups = fs.readdirSync(backupDir)
                .filter(f => f.startsWith('vx200_backup_') && f.endsWith('.tar.gz'))
                .sort()
                .reverse();

            if (backups.length === 0) {
                throw new Error('No se encontraron backups para rollback');
            }

            const latestBackup = path.join(backupDir, backups[0]);
            this.logger.info(`Restaurando desde: ${latestBackup}`);

            // Restaurar backup
            await execAsync(`tar -xzf ${latestBackup} -C ${this.config.paths.root}`);

            this.logger.info('Rollback completado');

            if (this.display) {
                await this.display.showMessage('Rollback OK', 3000);
            }

        } catch (error) {
            this.logger.error('Error en rollback:', error.message);
            throw error;
        }
    }

    /**
     * Reiniciar servicio systemd
     */
    async restartService() {
        this.logger.info('Reiniciando servicio vx200-controller...');

        try {
            await execAsync('sudo systemctl restart vx200-controller');
        } catch (error) {
            this.logger.error('Error reiniciando servicio:', error.message);
        }
    }

    /**
     * Obtener estado del auto-updater
     */
    getStatus() {
        return {
            ...this.updateStatus,
            config: {
                enabled: this.config.enabled,
                autoInstall: this.config.autoInstall,
                channel: this.config.channel,
                checkInterval: this.config.checkInterval
            }
        };
    }

    /**
     * Forzar verificación manual
     */
    async forceCheck() {
        this.logger.info('Verificación manual forzada');
        return await this.checkForUpdates();
    }

    /**
     * Instalar actualización manualmente
     */
    async forceInstall() {
        if (!this.updateStatus.available || !this.updateStatus.latestRelease) {
            this.logger.warn('No hay actualización disponible');
            return false;
        }

        this.logger.info('Instalación manual forzada');
        return await this.downloadAndInstall(this.updateStatus.latestRelease);
    }
}

module.exports = AutoUpdater;
