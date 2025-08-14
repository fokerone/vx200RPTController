const { createLogger } = require('../logging/Logger');

class MendozaCityMatcher {
    constructor() {
        this.logger = createLogger('[MendozaCityMatcher]');
        
        // Lista de ciudades fuera de Mendoza que NO deben hacer match
        this.excludedCities = [
            'buenos aires', 'rosario', 'cordoba capital', 'tucuman', 'tucumán', 
            'salta', 'santa fe', 'la plata', 'neuquen', 'mar del plata',
            'san miguel de tucuman', 'resistencia', 'corrientes', 'formosa'
        ];
        
        // Ciudades principales de Mendoza con variantes de pronunciación
        this.cities = {
            'mendoza': {
                lat: -32.8833, lon: -68.8167,
                name: 'Mendoza',
                department: 'Capital',
                aliases: ['mendoza capital', 'capital', 'ciudad de mendoza'],
                variations: ['mendosa', 'mendoza', 'mendoosa']
            },
            'malargue': {
                lat: -35.4719, lon: -69.5844,
                name: 'Malargüe',
                department: 'Malargüe',
                aliases: ['malargue', 'malarguë', 'malarge'],
                variations: ['malarge', 'malarque', 'malargue', 'malargüe', 'cordoba', 'córdoba'] // Incluir confusiones comunes
            },
            'san rafael': {
                lat: -34.6177, lon: -68.3301,
                name: 'San Rafael',
                department: 'San Rafael',
                aliases: ['rafael', 'san rafael'],
                variations: ['san rafael', 'sanrafael', 'rafael']
            },
            'godoy cruz': {
                lat: -32.9269, lon: -68.8431,
                name: 'Godoy Cruz',
                department: 'Godoy Cruz',
                aliases: ['godoy', 'cruz'],
                variations: ['godoy cruz', 'godoycruz']
            },
            'lujan de cuyo': {
                lat: -33.0322, lon: -68.8767,
                name: 'Luján de Cuyo',
                department: 'Luján de Cuyo',
                aliases: ['lujan', 'cuyo', 'lujan de cuyo'],
                variations: ['lujan', 'luján', 'lujan de cuyo']
            },
            'maipu': {
                lat: -32.9833, lon: -68.7833,
                name: 'Maipú',
                department: 'Maipú',
                aliases: ['maipu', 'maipú'],
                variations: ['maipu', 'maipú', 'maipú']
            },
            'las heras': {
                lat: -32.8500, lon: -68.8333,
                name: 'Las Heras',
                department: 'Las Heras',
                aliases: ['heras'],
                variations: ['las heras', 'lasheras', 'heras']
            },
            'tunuyan': {
                lat: -33.5833, lon: -69.0167,
                name: 'Tunuyán',
                department: 'Tunuyán',
                aliases: ['tunuyan', 'tunuyán'],
                variations: ['tunuyan', 'tunuyán', 'tunuñan']
            },
            'tupungato': {
                lat: -33.3667, lon: -69.1500,
                name: 'Tupungato',
                department: 'Tupungato',
                aliases: [],
                variations: ['tupungato', 'tupun', 'tupungado']
            },
            'rivadavia': {
                lat: -33.2000, lon: -68.4500,
                name: 'Rivadavia',
                department: 'Rivadavia',
                aliases: [],
                variations: ['rivadavia', 'ribadavia']
            },
            'guaymallen': {
                lat: -32.9000, lon: -68.8167,
                name: 'Guaymallén',
                department: 'Guaymallén',
                aliases: ['guaymallen', 'guaymallén'],
                variations: ['guaymallen', 'guaymallén', 'guaimallen']
            },
            'lavalle': {
                lat: -32.8333, lon: -67.9167,
                name: 'Lavalle',
                department: 'Lavalle',
                aliases: [],
                variations: ['lavalle', 'laballe']
            }
        };
    }

    /**
     * Buscar ciudad de Mendoza con matching inteligente
     * @param {string} input - Texto de entrada del usuario
     * @returns {object|null} - Información de la ciudad o null
     */
    findCity(input) {
        if (!input || typeof input !== 'string') {
            return null;
        }

        const cleanInput = this.normalizeText(input);
        this.logger.debug(`Buscando ciudad de Mendoza: "${cleanInput}"`);

        // Verificar si está en la lista de exclusiones (ciudades fuera de Mendoza)
        if (this.excludedCities.includes(cleanInput)) {
            this.logger.debug(`Input "${cleanInput}" está en lista de exclusiones`);
            return null;
        }

        // 1. Búsqueda exacta en keys
        if (this.cities[cleanInput]) {
            this.logger.info(`Ciudad encontrada (exacta): ${this.cities[cleanInput].name}`);
            return this.cities[cleanInput];
        }

        // 2. Búsqueda por aliases
        for (const [key, city] of Object.entries(this.cities)) {
            if (city.aliases && city.aliases.some(alias => 
                this.normalizeText(alias) === cleanInput
            )) {
                this.logger.info(`Ciudad encontrada (alias): ${city.name}`);
                return city;
            }
        }

        // 3. Búsqueda por variaciones (incluyendo confusiones comunes de STT)
        for (const [key, city] of Object.entries(this.cities)) {
            if (city.variations && city.variations.some(variation => 
                this.normalizeText(variation) === cleanInput
            )) {
                this.logger.info(`Ciudad encontrada (variación STT): ${city.name} <- "${input}"`);
                return city;
            }
        }

        // 4. Búsqueda parcial (contiene)
        for (const [key, city] of Object.entries(this.cities)) {
            if (key.includes(cleanInput) || cleanInput.includes(key)) {
                this.logger.info(`Ciudad encontrada (parcial): ${city.name}`);
                return city;
            }
        }

        // 5. Búsqueda fuzzy específica para Mendoza
        const fuzzyMatch = this.fuzzySearchMendoza(cleanInput);
        if (fuzzyMatch) {
            this.logger.info(`Ciudad encontrada (fuzzy): ${fuzzyMatch.name}`);
            return fuzzyMatch;
        }

        this.logger.warn(`Ciudad de Mendoza no encontrada: "${cleanInput}"`);
        return null;
    }

    /**
     * Normalizar texto para búsqueda
     * @param {string} text - Texto a normalizar
     * @returns {string} - Texto normalizado
     */
    normalizeText(text) {
        return text.toLowerCase()
            .trim()
            .replace(/[áàäâ]/g, 'a')
            .replace(/[éèëê]/g, 'e')
            .replace(/[íìïî]/g, 'i')
            .replace(/[óòöô]/g, 'o')
            .replace(/[úùüû]/g, 'u')
            .replace(/ñ/g, 'n')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Búsqueda fuzzy específica para ciudades de Mendoza
     * @param {string} input - Texto de entrada
     * @returns {object|null} - Ciudad encontrada o null
     */
    fuzzySearchMendoza(input) {
        let bestMatch = null;
        let bestScore = 0;

        for (const [key, city] of Object.entries(this.cities)) {
            // Puntaje base por similitud de texto
            const keyScore = this.calculateSimilarity(input, key);
            
            // Puntajes por aliases y variaciones
            const aliasScores = city.aliases ? city.aliases.map(alias => 
                this.calculateSimilarity(input, this.normalizeText(alias))
            ) : [];
            
            const variationScores = city.variations ? city.variations.map(variation => 
                this.calculateSimilarity(input, this.normalizeText(variation))
            ) : [];
            
            const maxScore = Math.max(keyScore, ...aliasScores, ...variationScores);
            
            // Umbral ajustado para evitar falsos positivos
            if (maxScore > bestScore && maxScore > 0.6) {
                bestScore = maxScore;
                bestMatch = city;
            }
        }

        if (bestMatch) {
            this.logger.debug(`Mejor coincidencia fuzzy: ${bestMatch.name} (score: ${bestScore.toFixed(2)})`);
        }

        return bestMatch;
    }

    /**
     * Calcular similitud entre dos strings usando Levenshtein
     * @param {string} str1 - Primera string
     * @param {string} str2 - Segunda string
     * @returns {number} - Similitud entre 0 y 1
     */
    calculateSimilarity(str1, str2) {
        if (str1 === str2) return 1;
        if (str1.length === 0) return str2.length === 0 ? 1 : 0;
        if (str2.length === 0) return 0;

        const maxLength = Math.max(str1.length, str2.length);
        const distance = this.levenshteinDistance(str1, str2);
        
        return 1 - (distance / maxLength);
    }

    /**
     * Calcular distancia de Levenshtein
     * @param {string} str1 - Primera string
     * @param {string} str2 - Segunda string
     * @returns {number} - Distancia
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    /**
     * Obtener todas las ciudades
     * @returns {object} - Todas las ciudades
     */
    getAllCities() {
        return this.cities;
    }

    /**
     * Obtener estadísticas
     * @returns {object} - Estadísticas del matcher
     */
    getStats() {
        return {
            totalCities: Object.keys(this.cities).length,
            departments: [...new Set(Object.values(this.cities).map(city => city.department))],
            province: 'Mendoza'
        };
    }

    /**
     * Destructor
     */
    destroy() {
        this.logger.info('MendozaCityMatcher destruido');
    }
}

/**
 * Función factory para obtener instancia singleton
 * @returns {MendozaCityMatcher}
 */
function getMendozaCityMatcher() {
    if (!getMendozaCityMatcher._instance) {
        getMendozaCityMatcher._instance = new MendozaCityMatcher();
    }
    return getMendozaCityMatcher._instance;
}

module.exports = {
    MendozaCityMatcher,
    getMendozaCityMatcher
};