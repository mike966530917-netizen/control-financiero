/**
 * Ejecutor CLI de Pruebas Unitarias
 */
try {
  require('./financial_engine.test.js');
} catch (err) {
  console.error('Error durante la ejecución de pruebas:', err);
  process.exit(1);
}
