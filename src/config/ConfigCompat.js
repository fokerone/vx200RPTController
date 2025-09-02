/**
 * ConfigCompat - Capa de Compatibilidad para Migración Gradual
 * 
 * Este módulo proporciona compatibilidad con el sistema anterior
 * mientras migramos gradualmente al nuevo ConfigurationService.
 */

const { getConfigurationService } = require('./ConfigurationService');

/**
 * Wrapper compatible con el Config anterior
 */
class ConfigCompat {
    constructor() {
        this.configService = getConfigurationService();
    }

    // ===== COMPATIBILIDAD CON Config.js ANTERIOR =====

    // Audio
    get audioDevice() { return this.configService.get('audio.device'); }
    get audioSampleRate() { return this.configService.get('audio.sampleRate'); }
    get audioChannels() { return this.configService.get('audio.channels'); }
    get audioBitDepth() { return this.configService.get('audio.bitDepth'); }
    get audioChannelThreshold() { return this.configService.get('audio.channelThreshold'); }
    get audioSustainTime() { return this.configService.get('audio.sustainTime'); }

    // TTS
    get tts() { return this.configService.getSection('tts'); }
    get ttsEngine() { return this.configService.get('tts.engine'); }
    get ttsVoice() { return this.configService.get('tts.voice'); }
    get ttsSpeed() { return this.configService.get('tts.speed'); }

    // Roger Beep
    get rogerBeep() { return this.configService.getSection('rogerBeep'); }
    get rogerBeepEnabled() { return this.configService.get('rogerBeep.enabled'); }
    get rogerBeepType() { return this.configService.get('rogerBeep.type'); }
    get rogerBeepVolume() { return this.configService.get('rogerBeep.volume'); }

    // Baliza
    get baliza() { return this.configService.getSection('baliza'); }
    get balizaEnabled() { return this.configService.get('baliza.enabled'); }
    get balizaInterval() { return this.configService.get('baliza.interval'); }

    // DTMF
    get dtmf() { return this.configService.getSection('dtmf'); }
    get dtmfCommands() { return this.configService.get('dtmf.commands'); }

    // APRS
    get aprs() { return this.configService.getSection('aprs'); }
    get aprsEnabled() { return this.configService.get('aprs.enabled'); }
    get aprsCallsign() { return this.configService.get('aprs.callsign'); }
    get aprsLocation() { return this.configService.getSection('aprs.location'); }

    // Weather
    get weather() { return this.configService.getSection('weather'); }
    get weatherEnabled() { return this.configService.get('weather.enabled'); }
    get weatherApiKey() { return this.configService.get('weather.apiKey'); }

    // Delays
    get delays() { return this.configService.getSection('delays'); }

    // ===== FUNCIONES DE UTILIDAD =====

    /**
     * Obtener valor por clave directa (nuevo método)
     */
    getValue(key, defaultValue) {
        return this.configService.get(key, defaultValue);
    }

    /**
     * Obtener sección completa (nuevo método)
     */
    getSection(section) {
        return this.configService.getSection(section);
    }

    /**
     * Establecer valor (nuevo método)
     */
    setValue(key, value) {
        return this.configService.set(key, value);
    }

    /**
     * Escuchar cambios (nuevo método)
     */
    onChange(key, callback) {
        return this.configService.onChange(key, callback);
    }

    /**
     * Recargar configuración
     */
    reload() {
        return this.configService.reload();
    }

    /**
     * Obtener estadísticas
     */
    getStats() {
        return this.configService.getStats();
    }
}

// Singleton para compatibilidad
let compatInstance = null;

function getConfig() {
    if (!compatInstance) {
        compatInstance = new ConfigCompat();
    }
    return compatInstance;
}

// Exportar tanto la clase como funciones helper
module.exports = {
    Config: getConfig(),
    getConfig,
    getValue: (key, defaultValue) => getConfig().getValue(key, defaultValue),
    getSection: (section) => getConfig().getSection(section)
};