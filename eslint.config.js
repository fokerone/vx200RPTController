const js = require('@eslint/js');

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                // Node.js globals
                global: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                exports: 'writable',
                module: 'writable',
                require: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                clearInterval: 'readonly'
            }
        },
        
        rules: {
            // Errores críticos
            'no-unused-vars': 'error',
            'no-undef': 'error',
            'no-unreachable': 'error',
            'no-console': 'warn',  // Permitir console en desarrollo
            
            // Mejores prácticas
            'prefer-const': 'error',
            'no-var': 'error',
            'eqeqeq': 'error',
            'curly': 'error',
            'no-eval': 'error',
            'no-implied-eval': 'error',
            
            // Estilo y consistencia
            'indent': ['error', 4, { SwitchCase: 1 }],
            'quotes': ['error', 'single', { avoidEscape: true }],
            'semi': ['error', 'always'],
            'comma-dangle': ['error', 'never'],
            'max-len': ['warn', { 
                code: 120, 
                ignoreUrls: true,
                ignoreStrings: true,
                ignoreTemplateLiterals: true
            }],
            
            // Seguridad básica
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',
            'no-script-url': 'error'
        },
        
        files: ['src/**/*.js'],
        
        ignores: [
            'node_modules/',
            'logs/',
            'temp/',
            '*.log',
            'coverage/',
            'dist/',
            'iaPrompts/'
        ]
    },
    
    // Configuración específica para archivos de test
    {
        files: ['src/test*.js', 'tests/**/*.js'],
        rules: {
            'no-console': 'off'  // Permitir console en tests
        }
    },
    
    // Configuración para módulos complejos
    {
        files: ['src/modules/**/*.js'],
        rules: {
            'max-lines': ['warn', 800],  // Módulos pueden ser más largos
            'complexity': ['warn', 20]   // Complejidad moderada
        }
    },
    
    // Configuración para archivos críticos complejos
    {
        files: ['src/audio/audioManager.js', 'src/modules/aprs.js'],
        rules: {
            'max-lines': 'off',  // Archivos críticos complejos
            'complexity': 'off'
        }
    }
];