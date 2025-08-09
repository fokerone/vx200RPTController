const { createLogger } = require('../logging/Logger');

class CityMatcher {
    constructor() {
        this.logger = createLogger('[CityMatcher]');
        
        // Base de datos de ciudades argentinas principales
        this.cities = {
            // Grandes ciudades
            'buenos aires': { 
                lat: -34.6118, lon: -58.3960, 
                name: 'Buenos Aires', 
                province: 'Ciudad Autónoma de Buenos Aires',
                aliases: ['baires', 'capital', 'caba', 'ciudad autonoma']
            },
            'cordoba': { 
                lat: -31.4201, lon: -64.1888, 
                name: 'Córdoba', 
                province: 'Córdoba',
                aliases: ['cordoba capital']
            },
            'rosario': { 
                lat: -32.9442, lon: -60.6505, 
                name: 'Rosario', 
                province: 'Santa Fe',
                aliases: ['rosario santa fe']
            },
            'mendoza': { 
                lat: -32.8908, lon: -68.8272, 
                name: 'Mendoza', 
                province: 'Mendoza',
                aliases: ['mendoza capital', 'ciudad de mendoza']
            },
            'la plata': { 
                lat: -34.9214, lon: -57.9544, 
                name: 'La Plata', 
                province: 'Buenos Aires',
                aliases: ['plata']
            },
            'mar del plata': { 
                lat: -38.0055, lon: -57.5426, 
                name: 'Mar del Plata', 
                province: 'Buenos Aires',
                aliases: ['mardel', 'mar de plata', 'mardelplata']
            },
            'malargue': {
                lat: -35.4719, lon: -69.5844,
                name: 'Malargüe',
                province: 'Mendoza',
                aliases: ['malargue', 'malarguë', 'malarge']
            },
            'salta': { 
                lat: -24.7821, lon: -65.4232, 
                name: 'Salta', 
                province: 'Salta',
                aliases: ['salta capital']
            },
            'santa fe': { 
                lat: -31.6333, lon: -60.7000, 
                name: 'Santa Fe', 
                province: 'Santa Fe',
                aliases: ['santa fe capital']
            },
            'san juan': { 
                lat: -31.5375, lon: -68.5364, 
                name: 'San Juan', 
                province: 'San Juan',
                aliases: ['san juan capital']
            },
            'resistencia': { 
                lat: -27.4511, lon: -58.9831, 
                name: 'Resistencia', 
                province: 'Chaco',
                aliases: []
            },
            'neuquen': { 
                lat: -38.9516, lon: -68.0591, 
                name: 'Neuquén', 
                province: 'Neuquén',
                aliases: ['neuquen capital']
            },
            'corrientes': { 
                lat: -27.4692, lon: -58.8306, 
                name: 'Corrientes', 
                province: 'Corrientes',
                aliases: ['corrientes capital']
            },
            'posadas': { 
                lat: -27.3621, lon: -55.8981, 
                name: 'Posadas', 
                province: 'Misiones',
                aliases: []
            },
            'san luis': { 
                lat: -33.2957, lon: -66.3378, 
                name: 'San Luis', 
                province: 'San Luis',
                aliases: ['san luis capital']
            },
            'catamarca': { 
                lat: -28.4696, lon: -65.7795, 
                name: 'Catamarca', 
                province: 'Catamarca',
                aliases: ['san fernando del valle de catamarca']
            },
            'la rioja': { 
                lat: -29.4130, lon: -66.8506, 
                name: 'La Rioja', 
                province: 'La Rioja',
                aliases: ['rioja']
            },
            'jujuy': { 
                lat: -24.1858, lon: -65.2995, 
                name: 'San Salvador de Jujuy', 
                province: 'Jujuy',
                aliases: ['san salvador de jujuy', 'san salvador']
            },
            'tucuman': { 
                lat: -26.8083, lon: -65.2176, 
                name: 'San Miguel de Tucumán', 
                province: 'Tucumán',
                aliases: ['san miguel de tucuman', 'tucuman capital']
            },
            'santiago del estero': { 
                lat: -27.7951, lon: -64.2615, 
                name: 'Santiago del Estero', 
                province: 'Santiago del Estero',
                aliases: ['santiago']
            },
            'formosa': { 
                lat: -26.1775, lon: -58.1781, 
                name: 'Formosa', 
                province: 'Formosa',
                aliases: ['formosa capital']
            },
            'rawson': { 
                lat: -43.3002, lon: -65.1023, 
                name: 'Rawson', 
                province: 'Chubut',
                aliases: []
            },
            'viedma': { 
                lat: -40.8135, lon: -62.9967, 
                name: 'Viedma', 
                province: 'Río Negro',
                aliases: []
            },
            'rio gallegos': { 
                lat: -51.6226, lon: -69.2181, 
                name: 'Río Gallegos', 
                province: 'Santa Cruz',
                aliases: ['gallegos']
            },
            'ushuaia': { 
                lat: -54.8019, lon: -68.3030, 
                name: 'Ushuaia', 
                province: 'Tierra del Fuego',
                aliases: []
            },

            // Ciudades importantes adicionales
            'bahia blanca': { 
                lat: -38.7183, lon: -62.2659, 
                name: 'Bahía Blanca', 
                province: 'Buenos Aires',
                aliases: ['bahia', 'blanca']
            },
            'san carlos de bariloche': { 
                lat: -41.1335, lon: -71.3103, 
                name: 'San Carlos de Bariloche', 
                province: 'Río Negro',
                aliases: ['bariloche', 'san carlos']
            },
            'tandil': { 
                lat: -37.3217, lon: -59.1332, 
                name: 'Tandil', 
                province: 'Buenos Aires',
                aliases: []
            },
            'olavarria': { 
                lat: -36.8927, lon: -60.3222, 
                name: 'Olavarría', 
                province: 'Buenos Aires',
                aliases: []
            },
            'pergamino': { 
                lat: -33.8894, lon: -60.5739, 
                name: 'Pergamino', 
                province: 'Buenos Aires',
                aliases: []
            },
            'san rafael': { 
                lat: -34.6177, lon: -68.3301, 
                name: 'San Rafael', 
                province: 'Mendoza',
                aliases: []
            },
            'villa maria': { 
                lat: -32.4111, lon: -63.2408, 
                name: 'Villa María', 
                province: 'Córdoba',
                aliases: ['villa maria']
            },
            'rio cuarto': { 
                lat: -33.1307, lon: -64.3499, 
                name: 'Río Cuarto', 
                province: 'Córdoba',
                aliases: ['cuarto']
            }
        };

        this.logger.info(`CityMatcher inicializado con ${Object.keys(this.cities).length} ciudades`);
    }

    /**
     * Buscar ciudad por nombre con fuzzy matching
     * @param {string} input - Texto de entrada del usuario
     * @returns {object|null} - Información de la ciudad o null
     */
    findCity(input) {
        if (!input || typeof input !== 'string') {
            return null;
        }

        const cleanInput = this.normalizeText(input);
        this.logger.debug(`Buscando ciudad: "${cleanInput}"`);

        // 1. Búsqueda exacta
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

        // 3. Búsqueda parcial (contiene)
        for (const [key, city] of Object.entries(this.cities)) {
            if (key.includes(cleanInput) || cleanInput.includes(key)) {
                this.logger.info(`Ciudad encontrada (parcial): ${city.name}`);
                return city;
            }
        }

        // 4. Búsqueda fuzzy básica
        const fuzzyMatch = this.fuzzySearch(cleanInput);
        if (fuzzyMatch) {
            this.logger.info(`Ciudad encontrada (fuzzy): ${fuzzyMatch.name}`);
            return fuzzyMatch;
        }

        this.logger.warn(`Ciudad no encontrada: "${cleanInput}"`);
        return null;
    }

    /**
     * Búsqueda fuzzy simple
     * @param {string} input - Texto de entrada
     * @returns {object|null} - Ciudad encontrada o null
     */
    fuzzySearch(input) {
        let bestMatch = null;
        let bestScore = 0;

        for (const [key, city] of Object.entries(this.cities)) {
            const score = this.calculateSimilarity(input, key);
            
            // También probar con aliases
            const aliasScores = city.aliases ? city.aliases.map(alias => 
                this.calculateSimilarity(input, this.normalizeText(alias))
            ) : [];
            
            const maxAliasScore = aliasScores.length > 0 ? Math.max(...aliasScores) : 0;
            const finalScore = Math.max(score, maxAliasScore);

            if (finalScore > bestScore && finalScore > 0.6) { // Umbral de similitud
                bestScore = finalScore;
                bestMatch = city;
            }
        }

        return bestMatch;
    }

    /**
     * Calcular similitud entre dos strings (algoritmo simple)
     * @param {string} str1 
     * @param {string} str2 
     * @returns {number} - Similitud entre 0 y 1
     */
    calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const distance = this.levenshteinDistance(longer, shorter);
        return (longer.length - distance) / longer.length;
    }

    /**
     * Calcular distancia de Levenshtein
     * @param {string} str1 
     * @param {string} str2 
     * @returns {number}
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
     * Normalizar texto para comparación
     * @param {string} text 
     * @returns {string}
     */
    normalizeText(text) {
        return text
            .toLowerCase()
            .normalize('NFD') // Descomponer caracteres acentuados
            .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
            .replace(/[^\w\s]/g, '') // Quitar puntuación
            .replace(/\s+/g, ' ') // Múltiples espacios → uno
            .trim();
    }

    /**
     * Obtener lista de ciudades disponibles
     * @returns {Array} - Array de nombres de ciudades
     */
    getAvailableCities() {
        return Object.values(this.cities).map(city => city.name);
    }

    /**
     * Obtener estadísticas del matcher
     * @returns {object}
     */
    getStats() {
        return {
            totalCities: Object.keys(this.cities).length,
            provinces: [...new Set(Object.values(this.cities).map(c => c.province))].length,
            totalAliases: Object.values(this.cities).reduce((sum, city) => 
                sum + (city.aliases ? city.aliases.length : 0), 0
            )
        };
    }

    /**
     * Test del sistema de matching
     * @returns {Array} - Resultados de test
     */
    runTests() {
        const testCases = [
            'buenos aires',
            'baires',
            'cordoba',
            'mendoza',
            'rosario',
            'salta',
            'bariloche',
            'mar del plata',
            'mardel',
            'tucuman',
            'ciudad inexistente'
        ];

        const results = testCases.map(testCase => ({
            input: testCase,
            result: this.findCity(testCase),
            found: !!this.findCity(testCase)
        }));

        this.logger.info(`Test completado: ${results.filter(r => r.found).length}/${testCases.length} encontradas`);
        return results;
    }
}

// Singleton
let cityMatcherInstance = null;

function getCityMatcher() {
    if (!cityMatcherInstance) {
        cityMatcherInstance = new CityMatcher();
    }
    return cityMatcherInstance;
}

module.exports = {
    CityMatcher,
    getCityMatcher
};