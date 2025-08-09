/**
 * Config Module - Acceso centralizado a la configuración
 * 
 * Este módulo proporciona acceso simplificado a toda la configuración del sistema
 * mediante el ConfigManager singleton.
 */

const { getConfigManager } = require('./ConfigManager');

// Instancia singleton del ConfigManager
const configManager = getConfigManager();

/**
 * Obtener toda la configuración
 */
function getConfig() {
    return configManager.getConfig();
}

/**
 * Obtener configuración de una sección
 */
function getSection(section) {
    return configManager.get(section);
}

/**
 * Obtener valor específico con notación de punto
 */
function getValue(path, defaultValue = null) {
    return configManager.getValue(path, defaultValue);
}

/**
 * Helpers específicos para cada sección
 */
const Config = {
    // Sistema
    get system() { return getSection('system'); },
    get callsign() { return getValue('system.callsign'); },
    get version() { return getValue('system.version'); },
    get environment() { return getValue('system.environment'); },

    // Web Server
    get web() { return getSection('web'); },
    get webPort() { return getValue('web.port'); },
    get webHost() { return getValue('web.host'); },
    get allowedOrigins() { return getValue('web.allowedOrigins'); },

    // Audio
    get audio() { return getSection('audio'); },
    get audioDevice() { return getValue('audio.device'); },
    get sampleRate() { return getValue('audio.sampleRate'); },
    get channelThreshold() { return getValue('audio.channelThreshold'); },

    // TTS
    get tts() { return getSection('tts'); },
    get ttsVoice() { return getValue('tts.voice'); },
    get ttsSpeed() { return getValue('tts.speed'); },

    // Roger Beep
    get rogerBeep() { return getSection('rogerBeep'); },
    get rogerBeepEnabled() { return getValue('rogerBeep.enabled'); },
    get rogerBeepType() { return getValue('rogerBeep.type'); },
    get rogerBeepVolume() { return getValue('rogerBeep.volume'); },

    // Baliza
    get baliza() { return getSection('baliza'); },
    get balizaEnabled() { return getValue('baliza.enabled'); },
    get balizaInterval() { return getValue('baliza.interval'); },
    get balizaMessage() { return getValue('baliza.message'); },

    // AI Chat
    get aiChat() { return getSection('aiChat'); },
    get aiChatEnabled() { return getValue('aiChat.enabled'); },
    get aiChatModel() { return getValue('aiChat.model'); },

    // SMS
    get sms() { return getSection('sms'); },
    get smsEnabled() { return getValue('sms.enabled'); },


    // DTMF
    get dtmf() { return getSection('dtmf'); },
    get dtmfCommands() { return getValue('dtmf.commands'); },

    // Delays
    get delays() { return getSection('delays'); },

    // Logging
    get logging() { return getSection('logging'); },
    get logLevel() { return getValue('logging.level'); },

    // Métodos de utilidad
    reload() { return configManager.reload(); },
    getSummary() { return configManager.getSummary(); },
    getAll() { return getConfig(); }
};

module.exports = {
    Config,
    getConfig,
    getSection,
    getValue,
    configManager
};