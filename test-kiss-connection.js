const net = require('net');

// Test directo de conexión KISS
async function testKISSConnection() {
    console.log('🔌 Test de Conexión KISS Directa\n');
    
    return new Promise((resolve) => {
        console.log('1. Intentando conectar a localhost:8001...');
        
        const socket = new net.Socket();
        socket.setTimeout(5000);
        
        socket.on('connect', () => {
            console.log('✅ Conexión TCP establecida con éxito');
            console.log('📡 Puerto KISS 8001 está activo y respondiendo');
            socket.end();
            resolve(true);
        });
        
        socket.on('timeout', () => {
            console.log('⏰ Timeout - Puerto no responde');
            socket.destroy();
            resolve(false);
        });
        
        socket.on('error', (error) => {
            console.log('❌ Error de conexión:', error.message);
            socket.destroy();
            resolve(false);
        });
        
        socket.on('close', () => {
            console.log('🔐 Conexión cerrada');
        });
        
        socket.connect(8001, 'localhost');
    });
}

// Test con utils-for-aprs
async function testUtilsForAPRS() {
    console.log('\n📡 Test de utils-for-aprs\n');
    
    try {
        const { SocketKISSFrameEndpoint } = require('utils-for-aprs');
        console.log('✅ Librería utils-for-aprs cargada correctamente');
        
        console.log('2. Creando SocketKISSFrameEndpoint...');
        const endpoint = new SocketKISSFrameEndpoint({
            host: 'localhost',
            port: 8001
        });
        
        console.log('✅ Endpoint creado');
        
        // Configurar eventos
        endpoint.on('open', () => {
            console.log('✅ Evento OPEN: Conectado al TNC KISS');
        });
        
        endpoint.on('close', () => {
            console.log('🔐 Evento CLOSE: Desconectado del TNC KISS');
        });
        
        endpoint.on('error', (error) => {
            console.log('❌ Evento ERROR:', error.message);
        });
        
        endpoint.on('data', (data) => {
            console.log('📥 Evento DATA: Frame recibido, longitud:', data.length);
        });
        
        console.log('3. Eventos configurados, esperando conexión...');
        
        // Esperar eventos por 10 segundos
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        console.log('4. Finalizando test');
        if (endpoint && typeof endpoint.close === 'function') {
            endpoint.close();
        }
        
        return true;
        
    } catch (error) {
        console.log('❌ Error con utils-for-aprs:', error.message);
        return false;
    }
}

async function runTests() {
    console.log('🧪 Test de Conectividad KISS\n');
    
    // Test 1: Conexión TCP directa
    const tcpWorks = await testKISSConnection();
    
    if (tcpWorks) {
        // Test 2: utils-for-aprs
        const utilsWorks = await testUtilsForAPRS();
        
        console.log('\n🎯 === RESULTADOS ===');
        console.log(`TCP directo: ${tcpWorks ? '✅ FUNCIONA' : '❌ FALLA'}`);
        console.log(`utils-for-aprs: ${utilsWorks ? '✅ FUNCIONA' : '❌ FALLA'}`);
        
        if (tcpWorks && utilsWorks) {
            console.log('\n✅ CONEXIÓN KISS COMPLETAMENTE FUNCIONAL');
        } else if (tcpWorks && !utilsWorks) {
            console.log('\n⚠️ TCP funciona pero utils-for-aprs tiene problemas');
        }
    } else {
        console.log('\n❌ Puerto KISS 8001 no está disponible');
        console.log('   Asegúrate de que Direwolf esté ejecutándose');
    }
}

runTests().catch(console.error);