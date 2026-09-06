/**
 * Pruebas Unitarias del Motor Financiero
 * Validación de Reglas de Negocio, Flujo de Efectivo, Ciclos de TC y Prepagos Anticipados.
 */

const FinancialEngine = require('../frontend/js/financial-engine.js');
const { 
  TIPOS_TRANSACCION, 
  calcularCicloTarjeta, 
  prepararTransaccion, 
  calcularConsolidadoFinanciero 
} = FinancialEngine;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALLÓ: ${message}`);
    throw new Error(message);
  } else {
    console.log(`✅ PASÓ: ${message}`);
  }
}

function assertEquals(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    console.error(`❌ FALLÓ: ${message}\n  Esperado: ${expectedStr}\n  Obtenido: ${actualStr}`);
    throw new Error(`${message}: esperado ${expectedStr}, obtenido ${actualStr}`);
  } else {
    console.log(`✅ PASÓ: ${message} (${actualStr})`);
  }
}

console.log('====================================================');
console.log('🧪 INICIANDO BATERÍA DE PRUEBAS DEL MOTOR FINANCIERO');
console.log('====================================================\n');

// 1. Configuración de prueba de tarjetas
const tarjetasConfig = [
  {
    id: 'TC_BCP',
    nombre: 'BCP Visa Signature',
    diaCorte: 20,
    diaVencimiento: 10, // Si corta el 20, vence el 10 del mes siguiente
    moneda: 'PEN',
    limiteCredito: 10000,
    colorHex: '#0033a0'
  },
  {
    id: 'TC_BBVA',
    nombre: 'BBVA Mastercard Black',
    diaCorte: 5,
    diaVencimiento: 25, // Si corta el 5 y vence el 25, vence en el mismo mes del corte
    moneda: 'PEN',
    limiteCredito: 8000,
    colorHex: '#004481'
  }
];

// TEST 1: Ciclos de facturación y fechas de corte
console.log('--- TEST 1: Ciclos de Facturación de Tarjetas ---');
// Consumo antes o en el día de corte (día 15 <= 20)
const cicloAntesCorte = calcularCicloTarjeta('2026-09-15', 20, 10);
assertEquals(cicloAntesCorte.fechaCorte, '2026-09-20', 'Fecha de corte correcta antes de corte');
assertEquals(cicloAntesCorte.fechaVencimiento, '2026-10-10', 'Fecha de vencimiento en M+1');
assertEquals(cicloAntesCorte.mesImpactoTC, '2026-10', 'Mes de impacto TC es mes de vencimiento');

// Consumo después del día de corte (día 22 > 20)
const cicloDespuesCorte = calcularCicloTarjeta('2026-09-22', 20, 10);
assertEquals(cicloDespuesCorte.fechaCorte, '2026-10-20', 'Fecha de corte pasa al mes siguiente');
assertEquals(cicloDespuesCorte.fechaVencimiento, '2026-11-10', 'Fecha de vencimiento pasa a M+2');
assertEquals(cicloDespuesCorte.mesImpactoTC, '2026-11', 'Mes de impacto TC pasa a M+2');


// TEST 2: CASO BASE SOLICITADO
console.log('\n--- TEST 2: CASO BASE (Usuario) ---');
/*
  Requerimiento:
  - Ingreso: S/ 2000
  - Gasto Efectivo: S/ 100
  - TC Mes Anterior vencida hoy: S/ 500
  -> Balance libre este mes: S/ 1400
*/
const txsCasoBase = [
  prepararTransaccion({
    id: '1',
    fecha: '2026-09-01',
    tipo: TIPOS_TRANSACCION.INGRESO,
    monto: 2000,
    categoria: 'Sueldo'
  }, tarjetasConfig),

  prepararTransaccion({
    id: '2',
    fecha: '2026-09-02',
    tipo: TIPOS_TRANSACCION.GASTO_DIRECTO,
    monto: 100,
    categoria: 'Alimentación'
  }, tarjetasConfig),

  prepararTransaccion({
    id: '3',
    fecha: '2026-09-05',
    tipo: TIPOS_TRANSACCION.PAGO_TC_VENCIDA,
    monto: 500,
    tarjetaAfectada: 'TC_BCP',
    categoria: 'Pago TC Vencida'
  }, tarjetasConfig)
];

const resumenCasoBase = calcularConsolidadoFinanciero(txsCasoBase, tarjetasConfig, '2026-09');
assertEquals(resumenCasoBase.flujoEfectivo.ingresos, 2000, 'Ingresos Caso Base');
assertEquals(resumenCasoBase.flujoEfectivo.gastosDirectos, 100, 'Gastos Directos Caso Base');
assertEquals(resumenCasoBase.flujoEfectivo.pagosTCVencidas, 500, 'Pago TC Vencida Caso Base');
assertEquals(resumenCasoBase.flujoEfectivo.totalSalidas, 600, 'Total Salidas Caso Base');
assertEquals(resumenCasoBase.flujoEfectivo.balanceLibreNeto, 1400, 'Balance Libre Neto = S/ 1400');


// TEST 3: CASO CON PREPAGO SOLICITADO
console.log('\n--- TEST 3: CASO CON PREPAGO Y CONSUMO NUEVO (Usuario) ---');
/*
  Requerimiento:
  - Durante este mes (2026-09), el usuario hace un consumo nuevo en TC de S/ 600 (para pagar el próximo mes 2026-10).
  - Pero decide hacer un Prepago de S/ 100 a esa tarjeta usando dinero de este mes.
  - Impacto en Mes Actual (2026-09):
    * Flujo saliente aumenta en S/ 100 (Efectivo 100 + TC vencida 500 + Prepago 100 = S/ 700).
    * Saldo libre = S/ 1300 (2000 - 700).
  - Impacto en Mes Siguiente (2026-10):
    * La deuda pendiente de pago para esa tarjeta baja de S/ 600 a S/ 500.
*/
const txsCasoPrepago = [
  ...txsCasoBase,

  // Consumo nuevo en TC (fecha 10 de sep, antes del corte 20 -> vence en 2026-10)
  prepararTransaccion({
    id: '4',
    fecha: '2026-09-10',
    tipo: TIPOS_TRANSACCION.CONSUMO_TC,
    tarjetaAfectada: 'TC_BCP',
    monto: 600,
    categoria: 'Compras'
  }, tarjetasConfig),

  // Prepago de S/ 100 a la tarjeta TC_BCP en septiembre
  prepararTransaccion({
    id: '5',
    fecha: '2026-09-15',
    tipo: TIPOS_TRANSACCION.PREPAGO_TC,
    tarjetaAfectada: 'TC_BCP',
    monto: 100,
    categoria: 'Prepago Voluntario TC'
  }, tarjetasConfig)
];

const resumenCasoPrepago = calcularConsolidadoFinanciero(txsCasoPrepago, tarjetasConfig, '2026-09');

// Verificaciones Mes Actual (2026-09)
assertEquals(resumenCasoPrepago.flujoEfectivo.ingresos, 2000, 'Ingresos Mes Actual');
assertEquals(resumenCasoPrepago.flujoEfectivo.gastosDirectos, 100, 'Gastos Directos Mes Actual');
assertEquals(resumenCasoPrepago.flujoEfectivo.pagosTCVencidas, 500, 'TC Vencida Mes Actual');
assertEquals(resumenCasoPrepago.flujoEfectivo.prepagosRealizados, 100, 'Prepagos Realizados Mes Actual (Salida efectivo)');
assertEquals(resumenCasoPrepago.flujoEfectivo.totalSalidas, 700, 'Total Salidas de Efectivo Mes Actual = S/ 700');
assertEquals(resumenCasoPrepago.flujoEfectivo.balanceLibreNeto, 1300, 'Saldo Libre Mes Actual = S/ 1300');

// Verificaciones Mes Siguiente (2026-10)
assertEquals(resumenCasoPrepago.tarjetasCredito.nuevosConsumosCiclo, 600, 'Consumos Brutos de TC para Octubre');
assertEquals(resumenCasoPrepago.tarjetasCredito.totalPrepagosAplicados, 100, 'Prepagos aplicados a la deuda de Octubre');
assertEquals(resumenCasoPrepago.tarjetasCredito.deudaTotalProyectada, 500, 'Deuda Neta Proyectada Octubre = S/ 500');

// Verificación individual de la tarjeta TC_BCP
const estadoBcp = resumenCasoPrepago.tarjetasCredito.desgloseTarjetas.find(t => t.id === 'TC_BCP');
assert(estadoBcp !== undefined, 'Tarjeta BCP encontrada en consolidado');
assertEquals(estadoBcp.consumosCiclo, 600, 'Consumos ciclo TC BCP = S/ 600');
assertEquals(estadoBcp.prepagosCiclo, 100, 'Prepagos aplicados TC BCP = S/ 100');
assertEquals(estadoBcp.deudaNetaProyectada, 500, 'Deuda final a pagar de TC BCP baja a S/ 500');

// TEST 4: ALERTAS FINANCIERAS (UMBRAL 50%, +10% INCREMENTAL Y VENCIMIENTO <= 5 DÍAS)
console.log('\n--- TEST 4: Validación de Umbrales de Gasto (50%, +10%) y Vencimiento <= 5 Días ---');

// 4.1: Caso por debajo del 50% (Salidas 700 / 2000 = 35% -> NO debe generar alerta de umbral de gasto)
const alertasSub50 = FinancialEngine.generarAlertasFinancieras(resumenCasoPrepago, '2026-09-06');
const tieneAlertaGastoSub50 = alertasSub50.some(a => a.id.startsWith('alerta-gasto-'));
assert(!tieneAlertaGastoSub50, 'Gasto al 35% (<50%) NO dispara alerta de umbral');

// 4.2: Caso superando el 50% (Salidas 1100 / 2000 = 55% -> Dispara alerta del 50%)
const txsGasto55 = [
  ...txsCasoPrepago,
  prepararTransaccion({ id: '6', fecha: '2026-09-18', tipo: TIPOS_TRANSACCION.GASTO_DIRECTO, monto: 400, categoria: 'Compras' }, tarjetasConfig)
];
const resumenGasto55 = calcularConsolidadoFinanciero(txsGasto55, tarjetasConfig, '2026-09');
const alertasGasto55 = FinancialEngine.generarAlertasFinancieras(resumenGasto55, '2026-09-18');
const alerta50 = alertasGasto55.find(a => a.id === 'alerta-gasto-50');
assert(alerta50 !== undefined, 'Gasto al 55% dispara alerta de escalón 50%');

// 4.3: Caso superando el 60% (Salidas 1300 / 2000 = 65% -> Dispara alerta del 60%)
const txsGasto65 = [
  ...txsGasto55,
  prepararTransaccion({ id: '7', fecha: '2026-09-20', tipo: TIPOS_TRANSACCION.GASTO_DIRECTO, monto: 200, categoria: 'Servicios' }, tarjetasConfig)
];
const resumenGasto65 = calcularConsolidadoFinanciero(txsGasto65, tarjetasConfig, '2026-09');
const alertasGasto65 = FinancialEngine.generarAlertasFinancieras(resumenGasto65, '2026-09-20');
const alerta60 = alertasGasto65.find(a => a.id === 'alerta-gasto-60');
assert(alerta60 !== undefined, 'Gasto al 65% dispara alerta de escalón 60% (+10% aumento)');

// 4.4: Alerta de Vencimiento de Tarjeta cuando faltan <= 5 días
// Tarjeta BCP vence el 2026-10-10. Si evaluamos el 2026-10-06 (faltan 4 días <= 5 días):
const resumenOctubre = calcularConsolidadoFinanciero(txsCasoPrepago, tarjetasConfig, '2026-10');
const alertasVenc = FinancialEngine.generarAlertasFinancieras(resumenOctubre, '2026-10-06');
const alertaVencBcp = alertasVenc.find(a => a.id === 'venc-TC_BCP');
assert(alertaVencBcp !== undefined, 'Faltan 4 días para vencimiento TC BCP: se genera alerta de vencimiento <= 5 días');

console.log('\n====================================================');
console.log('🎉 TODAS LAS PRUEBAS FINANCIERAS HAN PASADO CON ÉXITO');
console.log('====================================================\n');
