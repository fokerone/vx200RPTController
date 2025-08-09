const { getMendozaCityMatcher } = require('./src/utils/mendozaCityMatcher');

/**
 * Test del reconocimiento de ciudades de Mendoza
 */
function testMendozaCities() {
    console.log('🏔️ Test de reconocimiento de ciudades de Mendoza\n');
    
    const cityMatcher = getMendozaCityMatcher();
    
    // Casos de test con transcripciones comunes del speech-to-text
    const testCases = [
        // Casos correctos
        { input: 'Mendoza', expected: 'Mendoza' },
        { input: 'Malargüe', expected: 'Malargüe' },
        { input: 'San Rafael', expected: 'San Rafael' },
        
        // Casos problemáticos comunes del STT
        { input: 'Malargue', expected: 'Malargüe' },
        { input: 'malarge', expected: 'Malargüe' },
        { input: 'Cordoba', expected: 'Malargüe' },  // Confusión común STT
        { input: 'Córdoba', expected: 'Malargüe' },  // Otra confusión común
        { input: 'malarque', expected: 'Malargüe' },
        
        // Otras ciudades de Mendoza
        { input: 'Godoy Cruz', expected: 'Godoy Cruz' },
        { input: 'godoy', expected: 'Godoy Cruz' },
        { input: 'Lujan de Cuyo', expected: 'Luján de Cuyo' },
        { input: 'lujan', expected: 'Luján de Cuyo' },
        { input: 'Maipu', expected: 'Maipú' },
        { input: 'Las Heras', expected: 'Las Heras' },
        { input: 'heras', expected: 'Las Heras' },
        
        // Casos que no deberían encontrarse
        { input: 'Buenos Aires', expected: null },
        { input: 'Rosario', expected: null },
        { input: 'Tucuman', expected: null }
    ];
    
    let correctCount = 0;
    let totalTests = testCases.length;
    
    console.log('🧪 Ejecutando casos de test:\n');
    
    testCases.forEach((testCase, index) => {
        const result = cityMatcher.findCity(testCase.input);
        const resultName = result ? result.name : null;
        const isCorrect = resultName === testCase.expected;
        
        const status = isCorrect ? '✅' : '❌';
        const arrow = testCase.expected ? '→' : '→ (no debe encontrar)';
        
        console.log(`${status} Test ${index + 1}: "${testCase.input}" ${arrow} ${testCase.expected || 'null'}`);
        
        if (!isCorrect) {
            console.log(`     Resultado obtenido: ${resultName || 'null'}`);
        }
        
        if (isCorrect) correctCount++;
    });
    
    console.log('\n📊 === RESULTADOS ===');
    console.log(`Tests correctos: ${correctCount}/${totalTests}`);
    console.log(`Tasa de éxito: ${((correctCount / totalTests) * 100).toFixed(1)}%`);
    
    if (correctCount === totalTests) {
        console.log('🎉 ¡Todos los tests pasaron!');
        console.log('✅ El sistema de reconocimiento de ciudades de Mendoza está funcionando correctamente');
    } else {
        console.log('⚠️ Algunos tests fallaron. Es necesario ajustar el algoritmo de matching.');
    }
    
    // Mostrar estadísticas del matcher
    console.log('\n🏔️ === ESTADÍSTICAS MENDOZA ===');
    const stats = cityMatcher.getStats();
    console.log(`Ciudades disponibles: ${stats.totalCities}`);
    console.log(`Departamentos: ${stats.departments.join(', ')}`);
    console.log(`Provincia: ${stats.province}`);
    
    // Mostrar todas las ciudades disponibles
    console.log('\n📍 === CIUDADES DISPONIBLES ===');
    const cities = cityMatcher.getAllCities();
    Object.values(cities).forEach(city => {
        const aliases = city.aliases.length > 0 ? ` (alias: ${city.aliases.join(', ')})` : '';
        console.log(`   ${city.name} - ${city.department}${aliases}`);
    });
    
    return correctCount === totalTests;
}

// Ejecutar test si se llama directamente
if (require.main === module) {
    const success = testMendozaCities();
    process.exit(success ? 0 : 1);
}

module.exports = testMendozaCities;