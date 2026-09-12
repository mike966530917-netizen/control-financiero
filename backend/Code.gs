/**
 * ==============================================================================
 * BACKEND GOOGLE APPS SCRIPT: CONTROL FINANCIERO Y CICLOS DE TARJETAS
 * ==============================================================================
 * 
 * Este script actúa como API REST Serverless conectada a Google Sheets.
 * Gestiona el registro de transacciones, cálculo de ciclos de corte y vencimiento,
 * y la consolidación de flujo libre y amortizaciones por prepago.
 */

// Nombres de las hojas en Google Sheets
const SHEETS = {
  TRANSACCIONES: 'TRANSACCIONES',       // Histórico general consolidado (preservado intacto)
  INGRESOS: 'INGRESOS',                 // Pestaña exclusiva de Ingresos
  GASTOS_EFECTIVO: 'GASTOS_EFECTIVO',   // Pestaña exclusiva de Gastos en efectivo, débito, yape, transferencias
  GASTOS_TC: 'GASTOS_TC',               // Pestaña exclusiva de Consumos, Prepagos y Pagos de Tarjetas de Crédito
  TARJETAS: 'TARJETAS_CONFIG',
  CONSOLIDADO: 'CONSOLIDADO_MENSUAL',
  PRESUPUESTOS: 'PRESUPUESTOS',
  RECURRENTES: 'RECURRENTES'
};

/**
 * Menú personalizado automático en Google Sheets
 */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('💰 Control Financiero')
      .addItem('📂 Organizar Transacciones en 3 Pestañas (Ingresos / Efectivo / TC)', 'migrarTransaccionesATresHojas')
      .addItem('📊 Consolidar Meses Pasados en este Sheet', 'consolidarMesesPasados')
      .addItem('⚙️ Inicializar / Reparar Pestañas', 'setupSheets')
      .addToUi();
  } catch (e) {
    // Si se ejecuta sin interfaz interactiva
  }
}

/**
 * Función de Inicialización Automática.
 * Ejecuta esta función una sola vez en el Editor de Apps Script para crear
 * y formatear todas las hojas y columnas necesarias.
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Pestaña TRANSACCIONES (NO destructivo: preserva todos los registros existentes)
  let sheetTx = ss.getSheetByName(SHEETS.TRANSACCIONES);
  const txHeaders = [
    'ID', 'Fecha', 'Hora', 'Tipo', 'Metodo_Pago', 
    'Tarjeta_Afectada', 'Categoria', 'Monto', 'Moneda', 
    'Mes_Impacto_Efectivo', 'Mes_Impacto_TC', 'Notas'
  ];
  if (!sheetTx) {
    sheetTx = ss.insertSheet(SHEETS.TRANSACCIONES);
    sheetTx.appendRow(txHeaders);
    formatHeaderRow(sheetTx, '#1e293b', '#ffffff');
    sheetTx.setFrozenRows(1);
    sheetTx.getRange(2, 8, 500, 1).setNumberFormat('#,##0.00');
  } else if (sheetTx.getLastRow() === 0) {
    sheetTx.appendRow(txHeaders);
    formatHeaderRow(sheetTx, '#1e293b', '#ffffff');
    sheetTx.setFrozenRows(1);
  }

  // 2. Las 3 Pestañas Especializadas de Transacciones
  const sheetIngresos = getOrCreateSheet_(ss, SHEETS.INGRESOS, [
    'ID', 'Fecha', 'Hora', 'Tipo', 'Metodo_Pago', 'Categoria', 'Monto', 'Moneda', 'Mes_Impacto_Efectivo', 'Notas'
  ], '#059669', 7);

  const sheetGastosEf = getOrCreateSheet_(ss, SHEETS.GASTOS_EFECTIVO, [
    'ID', 'Fecha', 'Hora', 'Tipo', 'Metodo_Pago', 'Categoria', 'Monto', 'Moneda', 'Mes_Impacto_Efectivo', 'Notas'
  ], '#dc2626', 7);

  const sheetGastosTC = getOrCreateSheet_(ss, SHEETS.GASTOS_TC, [
    'ID', 'Fecha', 'Hora', 'Tipo', 'Tarjeta_Afectada', 'Metodo_Pago', 'Categoria', 'Monto', 'Moneda', 'Mes_Impacto_TC', 'Mes_Impacto_Efectivo', 'Notas'
  ], '#2563eb', 8);

  // 3. Pestaña TARJETAS_CONFIG (Preserva tarjetas personalizadas del usuario)
  let sheetCards = ss.getSheetByName(SHEETS.TARJETAS);
  if (!sheetCards) {
    sheetCards = ss.insertSheet(SHEETS.TARJETAS);
    const cardHeaders = [
      'ID_Tarjeta', 'Nombre_Tarjeta', 'Dia_Corte', 
      'Dia_Vencimiento', 'Moneda', 'Limite_Credito', 'Color_Hex'
    ];
    sheetCards.appendRow(cardHeaders);
    formatHeaderRow(sheetCards, '#0f766e', '#ffffff');
    sheetCards.setFrozenRows(1);
    sheetCards.appendRow(['TC_BCP', 'BCP Visa Signature', 20, 10, 'PEN', 10000, '#0033a0']);
    sheetCards.appendRow(['TC_BBVA', 'BBVA Mastercard Black', 5, 25, 'PEN', 8000, '#004481']);
    sheetCards.appendRow(['TC_INTERBANK', 'Interbank American Express', 15, 5, 'PEN', 6000, '#009933']);
  } else if (sheetCards.getLastRow() === 0) {
    const cardHeaders = [
      'ID_Tarjeta', 'Nombre_Tarjeta', 'Dia_Corte', 
      'Dia_Vencimiento', 'Moneda', 'Limite_Credito', 'Color_Hex'
    ];
    sheetCards.appendRow(cardHeaders);
    formatHeaderRow(sheetCards, '#0f766e', '#ffffff');
    sheetCards.setFrozenRows(1);
  }

  // 4. Pestaña CONSOLIDADO_MENSUAL (Historial oficial de cierres y ahorro mensual)
  let sheetCons = ss.getSheetByName(SHEETS.CONSOLIDADO);
  const consHeaders = [
    'Mes (YYYY-MM)', 'Ingresos_Totales', 'Gastos_Directos', 
    'Prepagos_TC', 'Pagos_TC', 'Flujo_Libre_Neto', 
    'Ahorro_Neto', 'Tasa_Ahorro_%', 'Estado_Cierre', 
    'Fecha_Cierre', 'Notas'
  ];
  if (!sheetCons) {
    sheetCons = ss.insertSheet(SHEETS.CONSOLIDADO);
    sheetCons.appendRow(consHeaders);
    formatHeaderRow(sheetCons, '#4338ca', '#ffffff');
    sheetCons.setFrozenRows(1);
    sheetCons.getRange(2, 2, 100, 6).setNumberFormat('#,##0.00');
  } else if (sheetCons.getLastRow() === 0) {
    sheetCons.appendRow(consHeaders);
    formatHeaderRow(sheetCons, '#4338ca', '#ffffff');
    sheetCons.setFrozenRows(1);
    sheetCons.getRange(2, 2, 100, 6).setNumberFormat('#,##0.00');
  }

  // 5. Pestaña PRESUPUESTOS (Preserva presupuestos creados por el usuario)
  let sheetBudgets = ss.getSheetByName(SHEETS.PRESUPUESTOS);
  if (!sheetBudgets) {
    sheetBudgets = ss.insertSheet(SHEETS.PRESUPUESTOS);
    const budgetHeaders = ['Categoria', 'Presupuesto_Mensual', 'Moneda'];
    sheetBudgets.appendRow(budgetHeaders);
    formatHeaderRow(sheetBudgets, '#0284c7', '#ffffff');
    sheetBudgets.setFrozenRows(1);
    sheetBudgets.getRange(2, 2, 100, 1).setNumberFormat('#,##0.00');

    const defaultBudgets = [
      ['Hogar', 1400, 'PEN'],
      ['Servicios', 350, 'PEN'],
      ['Supermercado', 800, 'PEN'],
      ['Alimentación', 400, 'PEN'],
      ['Restaurantes', 300, 'PEN'],
      ['Transporte', 250, 'PEN'],
      ['Suscripciones', 100, 'PEN'],
      ['Salud', 200, 'PEN'],
      ['Educación', 200, 'PEN'],
      ['Compras', 300, 'PEN'],
      ['Tecnología', 200, 'PEN'],
      ['Entretenimiento', 200, 'PEN'],
      ['Otros Gastos', 200, 'PEN']
    ];
    defaultBudgets.forEach(b => sheetBudgets.appendRow(b));
  } else if (sheetBudgets.getLastRow() === 0) {
    const budgetHeaders = ['Categoria', 'Presupuesto_Mensual', 'Moneda'];
    sheetBudgets.appendRow(budgetHeaders);
    formatHeaderRow(sheetBudgets, '#0284c7', '#ffffff');
    sheetBudgets.setFrozenRows(1);
  }

  // 6. Pestaña RECURRENTES (Movimientos fijos organizados por mes)
  let sheetRec = ss.getSheetByName(SHEETS.RECURRENTES);
  const recHeaders = ['Mes', 'ID', 'Nombre', 'Tipo', 'Monto', 'Categoria', 'Metodo_Pago', 'Dia_Mes', 'Activo', 'Notas'];
  if (!sheetRec) {
    sheetRec = ss.insertSheet(SHEETS.RECURRENTES);
    sheetRec.appendRow(recHeaders);
    formatHeaderRow(sheetRec, '#6366f1', '#ffffff');
    sheetRec.setFrozenRows(1);
    sheetRec.getRange(2, 5, 100, 1).setNumberFormat('#,##0.00');
  } else if (sheetRec.getLastRow() === 0) {
    sheetRec.appendRow(recHeaders);
    formatHeaderRow(sheetRec, '#6366f1', '#ffffff');
    sheetRec.setFrozenRows(1);
  }

  // Si la pestaña TRANSACCIONES tiene datos y las 3 pestañas especializadas están vacías, migrar y ordenar
  if (sheetTx && sheetTx.getLastRow() > 1 && 
      (!sheetIngresos || sheetIngresos.getLastRow() <= 1) &&
      (!sheetGastosEf || sheetGastosEf.getLastRow() <= 1) &&
      (!sheetGastosTC || sheetGastosTC.getLastRow() <= 1)) {
    migrarTransaccionesATresHojas(false);
  }

  // Auto-consolidar meses pasados si la hoja está vacía
  if (sheetCons && sheetCons.getLastRow() <= 1) {
    consolidarMesesPasados(false);
  }

  // Autoajuste de columnas
  [sheetTx, sheetIngresos, sheetGastosEf, sheetGastosTC, sheetCards, sheetCons, sheetBudgets, sheetRec].forEach(s => {
    if (s) {
      for (let c = 1; c <= s.getLastColumn(); c++) {
        s.autoResizeColumn(c);
      }
    }
  });

  SpreadsheetApp.flush();
  Logger.log('✅ Hojas y estructuras verificadas exitosamente (datos existentes preservados intactos).');
}

/**
 * Estiliza la fila de encabezados
 */
function formatHeaderRow(sheet, bgColor, fontColor) {
  const range = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  range.setBackground(bgColor);
  range.setFontColor(fontColor);
  range.setFontWeight('bold');
  range.setHorizontalAlignment('center');
  range.setVerticalAlignment('middle');
  sheet.setRowHeight(1, 35);
}

// ==============================================================================
// CONTROLADORES HTTP: doGet & doPost (API REST WEBHOOK)
// ==============================================================================

/**
 * Endpoint GET: Lectura de tarjetas, transacciones y consolidado
 */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'getAll';
    let responseData = {};

    if (action === 'ping') {
      responseData = { success: true, message: 'PWA Financial API en línea', timestamp: new Date() };
    } else if (action === 'getAll') {
      const cards = getCardsConfig_();
      const transactions = getTransactions_();
      const budgets = getBudgetsConfig_();
      const recurrentes = getRecurrentesConfig_();
      const closedMonths = getClosedMonths_();
      responseData = {
        success: true,
        cards: cards,
        transactions: transactions,
        budgets: budgets,
        recurrentes: recurrentes,
        closedMonths: closedMonths
      };
    } else if (action === 'getBudgets') {
      responseData = {
        success: true,
        budgets: getBudgetsConfig_()
      };
    } else if (action === 'getRecurrentes') {
      responseData = {
        success: true,
        recurrentes: getRecurrentesConfig_()
      };
    } else if (action === 'getClosedMonths') {
      responseData = {
        success: true,
        closedMonths: getClosedMonths_()
      };
    } else {
      responseData = { success: false, error: 'Acción no reconocida' };
    }

    return buildJsonResponse_(responseData);
  } catch (err) {
    return buildJsonResponse_({ success: false, error: err.toString() });
  }
}

/**
 * Endpoint POST: Creación de transacciones y configuración de tarjetas
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return buildJsonResponse_({ success: false, error: 'Payload vacío' });
    }

    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || 'addTransaction';
    let result = {};

    if (action === 'addTransaction') {
      result = addTransaction_(payload.data);
    } else if (action === 'batchSync') {
      result = batchSyncTransactions_(payload.data);
    } else if (action === 'deleteTransaction') {
      result = deleteTransaction_(payload.id);
    } else if (action === 'saveCard') {
      result = saveCard_(payload.card);
    } else if (action === 'saveBudgets') {
      result = saveBudgets_(payload.budgets);
    } else if (action === 'saveRecurrente') {
      result = saveRecurrente_(payload.recurrente);
    } else if (action === 'saveAllRecurrentes') {
      result = saveAllRecurrentes_(payload.recurrentes);
    } else if (action === 'deleteRecurrente') {
      result = deleteRecurrente_(payload.id, payload.mes);
    } else if (action === 'saveClosedMonth') {
      result = saveClosedMonth_(payload.monthData);
    } else if (action === 'reopenMonth') {
      result = reopenMonth_(payload.mes);
    } else if (action === 'consolidatePastMonths') {
      result = consolidarMesesPasados(false);
    } else if (action === 'migrarTransaccionesATresHojas') {
      result = migrarTransaccionesATresHojas(false);
    } else {
      result = { success: false, error: 'Acción POST no reconocida' };
    }

    return buildJsonResponse_(result);
  } catch (err) {
    return buildJsonResponse_({ success: false, error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

// ==============================================================================
// LÓGICA DE NEGOCIO Y PERSISTENCIA INTERNA
// ==============================================================================

function getCardsConfig_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.TARJETAS);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const cards = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0]) {
      cards.push({
        id: String(row[0]).trim(),
        nombre: String(row[1]).trim(),
        diaCorte: parseInt(row[2], 10) || 20,
        diaVencimiento: parseInt(row[3], 10) || 10,
        moneda: String(row[4] || 'PEN').trim(),
        limiteCredito: parseFloat(row[5]) || 0,
        colorHex: String(row[6] || '#3b82f6').trim()
      });
    }
  }
  return cards;
}

function getBudgetsConfig_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.PRESUPUESTOS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.PRESUPUESTOS);
    sheet.appendRow(['Categoria', 'Presupuesto_Mensual', 'Moneda']);
    formatHeaderRow(sheet, '#0284c7', '#ffffff');
    sheet.setFrozenRows(1);
    sheet.getRange(2, 2, 100, 1).setNumberFormat('#,##0.00');

    const defaultBudgets = [
      ['Hogar', 1400, 'PEN'],
      ['Servicios', 350, 'PEN'],
      ['Supermercado', 800, 'PEN'],
      ['Alimentación', 400, 'PEN'],
      ['Restaurantes', 300, 'PEN'],
      ['Transporte', 250, 'PEN'],
      ['Suscripciones', 100, 'PEN'],
      ['Salud', 200, 'PEN'],
      ['Educación', 200, 'PEN'],
      ['Compras', 300, 'PEN'],
      ['Tecnología', 200, 'PEN'],
      ['Entretenimiento', 200, 'PEN'],
      ['Otros Gastos', 200, 'PEN']
    ];
    defaultBudgets.forEach(b => sheet.appendRow(b));
    SpreadsheetApp.flush();
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const budgets = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0]) {
      budgets.push({
        categoria: String(row[0]).trim(),
        monto: parseFloat(row[1]) || 0,
        moneda: String(row[2] || 'PEN').trim()
      });
    }
  }
  return budgets;
}

function saveBudgets_(budgetsList) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.PRESUPUESTOS);
  if (!sheet) {
    getBudgetsConfig_();
    sheet = ss.getSheetByName(SHEETS.PRESUPUESTOS);
  }

  if (!Array.isArray(budgetsList) || budgetsList.length === 0) {
    return { success: false, error: 'Lista de presupuestos inválida o vacía' };
  }

  sheet.clear();
  sheet.appendRow(['Categoria', 'Presupuesto_Mensual', 'Moneda']);
  formatHeaderRow(sheet, '#0284c7', '#ffffff');
  sheet.setFrozenRows(1);

  budgetsList.forEach(b => {
    sheet.appendRow([
      String(b.categoria).trim(),
      parseFloat(b.monto) || 0,
      String(b.moneda || 'PEN').trim()
    ]);
  });

  sheet.getRange(2, 2, budgetsList.length, 1).setNumberFormat('#,##0.00');
  SpreadsheetApp.flush();

  return { success: true, count: budgetsList.length };
}

function getRecurrentesConfig_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.RECURRENTES);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.RECURRENTES);
    const headers = ['Mes', 'ID', 'Nombre', 'Tipo', 'Monto', 'Categoria', 'Metodo_Pago', 'Dia_Mes', 'Activo', 'Notas'];
    sheet.appendRow(headers);
    formatHeaderRow(sheet, '#6366f1', '#ffffff');
    sheet.setFrozenRows(1);
    sheet.getRange(2, 5, 100, 1).setNumberFormat('#,##0.00');
    SpreadsheetApp.flush();
    return [];
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  // Detección dinámica de columnas según encabezados
  const headerRow = data[0].map(h => String(h || '').trim().toLowerCase());
  const colMes = headerRow.findIndex(h => h === 'mes' || h.includes('periodo'));
  const colId = headerRow.findIndex(h => h === 'id');
  const colNombre = headerRow.findIndex(h => h.includes('nombre') || h.includes('concepto'));
  const colTipo = headerRow.findIndex(h => h.includes('tipo'));
  const colMonto = headerRow.findIndex(h => h.includes('monto') || h.includes('importe'));
  const colCat = headerRow.findIndex(h => h.includes('cat'));
  const colMetodo = headerRow.findIndex(h => h.includes('metodo') || h.includes('pago'));
  const colDia = headerRow.findIndex(h => h.includes('dia'));
  const colActivo = headerRow.findIndex(h => h.includes('activo') || h.includes('estado'));
  const colNotas = headerRow.findIndex(h => h.includes('nota'));

  const items = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    // Si tiene columna Mes explícita
    let mesVal = '';
    if (colMes >= 0 && row[colMes]) {
      const rawM = row[colMes];
      if (rawM instanceof Date) {
        mesVal = Utilities.formatDate(rawM, Session.getScriptTimeZone(), 'yyyy-MM');
      } else {
        mesVal = String(rawM).trim().replace(/^'+/, '');
        const matchM = mesVal.match(/^(\d{4})[-/](\d{1,2})/);
        if (matchM) mesVal = `${matchM[1]}-${matchM[2].padStart(2, '0')}`;
      }
    }

    const idStr = String((colId >= 0 ? row[colId] : (colMes === 0 ? row[1] : row[0])) || '').trim();
    const nomStr = String((colNombre >= 0 ? row[colNombre] : (colMes === 0 ? row[2] : row[1])) || '').trim();

    if (idStr || nomStr) {
      const rawActivo = colActivo >= 0 ? row[colActivo] : (colMes === 0 ? row[8] : row[7]);
      const activoVal = String(rawActivo !== undefined ? rawActivo : '').trim().toUpperCase();
      const esActivo = (activoVal === 'SI' || activoVal === 'TRUE' || activoVal === '1' || activoVal === '');
      
      const rawMonto = colMonto >= 0 ? row[colMonto] : (colMes === 0 ? row[4] : row[3]);
      const parsedMonto = typeof rawMonto === 'number'
        ? rawMonto
        : parseFloat(String(rawMonto || '').replace(/[^0-9.-]/g, '')) || 0;

      const tipoVal = String((colTipo >= 0 ? row[colTipo] : (colMes === 0 ? row[3] : row[2])) || 'Gasto_Fijo').trim();
      const catVal = String((colCat >= 0 ? row[colCat] : (colMes === 0 ? row[5] : row[4])) || 'Varios').trim();
      const metodoVal = String((colMetodo >= 0 ? row[colMetodo] : (colMes === 0 ? row[6] : row[5])) || 'Efectivo').trim();
      const diaVal = parseInt(colDia >= 0 ? row[colDia] : (colMes === 0 ? row[7] : row[6]), 10) || 1;
      const notasVal = String((colNotas >= 0 ? row[colNotas] : (colMes === 0 ? row[9] : row[8])) || '').trim();

      items.push({
        mes: mesVal, // 'YYYY-MM' o '' si es general/legacy
        id: idStr || ('REC-' + i),
        nombre: nomStr || ('Recurrente ' + i),
        tipo: tipoVal,
        monto: parsedMonto,
        categoria: catVal,
        metodoPago: metodoVal,
        diaMes: diaVal,
        activo: esActivo,
        notas: notasVal
      });
    }
  }
  return items;
}

// ==============================================================================
// GESTIÓN DE MESES CERRADOS (HISTORIAL DE AHORRO Y CONSOLIDADO)
// ==============================================================================

function getClosedMonths_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.CONSOLIDADO);
  if (!sheet) return [];

  let data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    consolidarMesesPasados(false);
    data = sheet.getDataRange().getValues();
  }
  if (data.length <= 1) return [];

  const list = [];
  const parseNum_ = (val) => {
    if (typeof val === 'number') return val;
    if (val === null || val === undefined || val === '') return 0;
    let s = String(val).trim().replace(/[^0-9.,-]/g, '');
    if (s.includes(',') && s.includes('.')) {
      if (s.indexOf('.') < s.indexOf(',')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    return parseFloat(s) || 0;
  };

  // Detección dinámica e inteligente de columnas según encabezados reales
  const headerRow = data[0].map(h => String(h || '').trim().toLowerCase());
  const colMes = headerRow.findIndex(h => h.includes('mes') || h.includes('fecha'));
  const colIngresos = headerRow.findIndex(h => h.includes('ingreso'));
  const colGastos = headerRow.findIndex(h => h.includes('gasto'));
  const colPrepagos = headerRow.findIndex(h => h.includes('prepago'));
  const colPagosTC = headerRow.findIndex(h => h.includes('pago') || h.includes('tc_vencida'));
  const colFlujo = headerRow.findIndex(h => h.includes('flujo'));
  const colAhorro = headerRow.findIndex(h => h.includes('ahorro'));
  const colTasa = headerRow.findIndex(h => h.includes('tasa'));
  const colEstado = headerRow.findIndex(h => h.includes('estado'));
  const colFecha = headerRow.findIndex(h => h.includes('fecha_cierre') || h.includes('cierre'));

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rawMes = colMes >= 0 ? row[colMes] : row[0];
    let mesStr = String(rawMes || '').trim().replace(/^'+/, '');
    if (rawMes instanceof Date) {
      mesStr = Utilities.formatDate(rawMes, Session.getScriptTimeZone(), 'yyyy-MM');
    }
    const matchM = mesStr.match(/^(\d{4})[-/](\d{1,2})$/);
    if (matchM) {
      mesStr = `${matchM[1]}-${matchM[2].padStart(2, '0')}`;
    }
    if (!mesStr) continue;

    const ingresos = colIngresos >= 0 ? parseNum_(row[colIngresos]) : parseNum_(row[1]);
    const gastosDirectos = colGastos >= 0 ? parseNum_(row[colGastos]) : parseNum_(row[2]);
    const prepagos = colPrepagos >= 0 ? parseNum_(row[colPrepagos]) : parseNum_(row[3]);
    const pagosTC = colPagosTC >= 0 ? parseNum_(row[colPagosTC]) : parseNum_(row[4]);
    const salidas = gastosDirectos + prepagos + pagosTC;

    // Obtener ahorro neto desde columna de Ahorro, Flujo Libre o cálculo
    const rawAhorro = colAhorro >= 0 ? parseNum_(row[colAhorro]) : null;
    const rawFlujo = colFlujo >= 0 ? parseNum_(row[colFlujo]) : null;

    let ahorroNeto = 0;
    if (rawAhorro !== null && rawAhorro !== 0) {
      ahorroNeto = rawAhorro;
    } else if (rawFlujo !== null && rawFlujo !== 0) {
      ahorroNeto = rawFlujo;
    } else if (ingresos !== 0 || salidas !== 0) {
      ahorroNeto = ingresos - salidas;
    } else {
      ahorroNeto = rawAhorro !== null ? rawAhorro : (rawFlujo !== null ? rawFlujo : 0);
    }

    let tasaAhorro = colTasa >= 0 ? parseNum_(row[colTasa]) : 0;
    if (tasaAhorro === 0 && ingresos > 0) {
      tasaAhorro = Math.round((ahorroNeto / ingresos) * 100);
    }

    const estadoCierre = colEstado >= 0 ? String(row[colEstado] || '').trim() : 'Cerrado';
    const fechaCierre = colFecha >= 0 ? String(row[colFecha] || '').trim() : '';

    list.push({
      mes: mesStr,
      ingresosTotales: ingresos,
      gastosDirectos: gastosDirectos,
      prepagosTC: prepagos,
      pagosTC: pagosTC,
      totalSalidas: salidas,
      flujoLibreNeto: ahorroNeto,
      ahorroNeto: ahorroNeto,
      tasaAhorro: tasaAhorro,
      esCerrado: estadoCierre !== 'Abierto',
      fechaCierre: fechaCierre,
      cerradoPorUsuario: true
    });
  }
  return list;
}

function saveClosedMonth_(monthData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.CONSOLIDADO);
  if (!sheet) {
    setupSheets();
    sheet = ss.getSheetByName(SHEETS.CONSOLIDADO);
  }

  const mesKey = String(monthData.mes || '').trim().replace(/^'+/, '');
  if (!mesKey) throw new Error('Mes inválido');

  const data = sheet.getDataRange().getValues();
  let foundRow = -1;

  for (let i = 1; i < data.length; i++) {
    let rowMes = String(data[i][0] || '').trim().replace(/^'+/, '');
    if (data[i][0] instanceof Date) {
      rowMes = Utilities.formatDate(data[i][0], Session.getScriptTimeZone(), 'yyyy-MM');
    }
    const matchM = rowMes.match(/^(\d{4})[-/](\d{1,2})$/);
    if (matchM) rowMes = `${matchM[1]}-${matchM[2].padStart(2, '0')}`;

    if (rowMes === mesKey) {
      foundRow = i + 1;
      break;
    }
  }

  const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  const rowValues = [
    "'" + mesKey,
    parseFloat(monthData.ingresosTotales || monthData.ingresos) || 0,
    parseFloat(monthData.gastosDirectos) || 0,
    parseFloat(monthData.prepagosTC || monthData.prepagos) || 0,
    parseFloat(monthData.pagosTC || monthData.facturacionTC) || 0,
    parseFloat(monthData.flujoLibreNeto || monthData.balanceLibreNeto || monthData.ahorroNeto) || 0,
    parseFloat(monthData.ahorroNeto || monthData.flujoLibreNeto) || 0,
    parseFloat(monthData.tasaAhorro) || 0,
    'Cerrado',
    monthData.fechaCierre || nowStr,
    monthData.notas || ''
  ];

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
  SpreadsheetApp.flush();
  return { success: true, mes: mesKey };
}

function reopenMonth_(mesKey) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.CONSOLIDADO);
  if (!sheet) return { success: true };

  const targetMes = String(mesKey || '').trim().replace(/^'+/, '');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    let rowMes = String(data[i][0] || '').trim().replace(/^'+/, '');
    if (data[i][0] instanceof Date) {
      rowMes = Utilities.formatDate(data[i][0], Session.getScriptTimeZone(), 'yyyy-MM');
    }
    const matchM = rowMes.match(/^(\d{4})[-/](\d{1,2})$/);
    if (matchM) rowMes = `${matchM[1]}-${matchM[2].padStart(2, '0')}`;

    if (rowMes === targetMes) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  SpreadsheetApp.flush();
  return { success: true, mes: targetMes };
}

/**
 * Consolida automáticamente todos los meses pasados en la pestaña CONSOLIDADO_MENSUAL.
 * Si ya hay un cierre oficial guardado por el usuario, lo respeta.
 * Si el mes no está cerrado en el Sheet, calcula los totales desde TRANSACCIONES y RECURRENTES.
 */
function consolidarMesesPasados(mostrarAlerta = true) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetCons = ss.getSheetByName(SHEETS.CONSOLIDADO);
  if (!sheetCons) {
    setupSheets();
    sheetCons = ss.getSheetByName(SHEETS.CONSOLIDADO);
  }

  // 1. Obtener cierres ya existentes en la hoja
  const existingData = sheetCons.getDataRange().getValues();
  const closedSet = new Set();
  for (let i = 1; i < existingData.length; i++) {
    let m = String(existingData[i][0] || '').trim().replace(/^'+/, '');
    if (existingData[i][0] instanceof Date) {
      m = Utilities.formatDate(existingData[i][0], Session.getScriptTimeZone(), 'yyyy-MM');
    }
    const matchM = m.match(/^(\d{4})[-/](\d{1,2})$/);
    if (matchM) m = `${matchM[1]}-${matchM[2].padStart(2, '0')}`;
    if (m) closedSet.add(m);
  }

  // 2. Mes actual de referencia
  const hoy = new Date();
  const mesActualStr = Utilities.formatDate(hoy, Session.getScriptTimeZone(), 'yyyy-MM');
  const anioActual = hoy.getFullYear().toString();

  // 3. Obtener transacciones y fijos
  const transacciones = getTransactions_();
  const recurrentes = getRecurrentesConfig_();

  const parseNum_ = (val) => {
    if (typeof val === 'number') return val;
    return parseFloat(String(val || '').replace(/[^0-9.-]/g, '')) || 0;
  };

  const sumaIngresosFijos = recurrentes
    .filter(r => r.tipo === 'Ingreso_Fijo' && r.activo !== false)
    .reduce((acc, r) => acc + parseNum_(r.monto), 0);

  const sumaGastosFijos = recurrentes
    .filter(r => r.tipo !== 'Ingreso_Fijo' && r.activo !== false)
    .reduce((acc, r) => acc + parseNum_(r.monto), 0);

  // 4. Identificar todos los meses transcurridos en lo que va del año (ej. 2026-01 hasta el mes anterior al actual)
  const mesesPasadosSet = new Set();
  const mesActualNum = hoy.getMonth() + 1;
  for (let m = 1; m < mesActualNum; m++) {
    const mesPad = String(m).padStart(2, '0');
    mesesPasadosSet.add(`${anioActual}-${mesPad}`);
  }

  // Incluir además cualquier mes pasado que tenga transacciones registradas
  transacciones.forEach(tx => {
    const mEf = tx.mesImpactoEfectivo ? String(tx.mesImpactoEfectivo).slice(0, 7) : '';
    const mTC = tx.mesImpactoTC ? String(tx.mesImpactoTC).slice(0, 7) : '';
    const mFe = tx.fecha ? String(tx.fecha).slice(0, 7) : '';
    if (mEf && mEf < mesActualStr) mesesPasadosSet.add(mEf);
    if (mTC && mTC < mesActualStr) mesesPasadosSet.add(mTC);
    if (mFe && mFe < mesActualStr) mesesPasadosSet.add(mFe);
  });

  const mesesPasados = Array.from(mesesPasadosSet).sort();
  let consolidadosCount = 0;

  mesesPasados.forEach(mesKey => {
    // Si ya existe un registro en CONSOLIDADO_MENSUAL, se respeta sin sobreescribir
    if (closedSet.has(mesKey)) return;

    let ingresos = 0;
    let gastosDirectos = 0;
    let prepagos = 0;
    let pagosTC = 0;
    let consumosTC = 0;
    let prepagosTC = 0;

    let hasIngresoTx = false;
    let hasGastoTx = false;

    transacciones.forEach(tx => {
      const m = parseNum_(tx.monto);
      const txMesEf = tx.mesImpactoEfectivo ? String(tx.mesImpactoEfectivo).slice(0, 7) : '';
      const txMesTC = tx.mesImpactoTC ? String(tx.mesImpactoTC).slice(0, 7) : '';

      if (txMesEf === mesKey) {
        if (tx.tipo === 'Ingreso') { ingresos += m; hasIngresoTx = true; }
        else if (tx.tipo === 'Gasto_Directo') { gastosDirectos += m; hasGastoTx = true; }
        else if (tx.tipo === 'Prepago_TC') prepagos += m;
        else if (tx.tipo === 'Pago_TC_Vencida') pagosTC += m;
      }

      if (txMesTC === mesKey) {
        if (tx.tipo === 'Consumo_TC') consumosTC += m;
        else if (tx.tipo === 'Prepago_TC') prepagosTC += m;
      }
    });

    // Si no hubo transacciones explícitas cargadas para ingresos o gastos, aplicar los fijos recurrentes
    if (!hasIngresoTx && sumaIngresosFijos > 0) ingresos += sumaIngresosFijos;
    if (!hasGastoTx && sumaGastosFijos > 0) gastosDirectos += sumaGastosFijos;

    const deudaFacturadaMes = Math.max(0, consumosTC - prepagosTC);
    const salidaTCMes = Math.max(deudaFacturadaMes, pagosTC);
    const totalSalidas = gastosDirectos + prepagos + salidaTCMes;
    const ahorroNeto = Number((ingresos - totalSalidas).toFixed(2));
    const tasaAhorro = ingresos > 0 ? Math.round((ahorroNeto / ingresos) * 100) : 0;

    const [anio, mesNum] = mesKey.split('-').map(Number);
    const ultimoDia = new Date(anio, mesNum, 0).getDate();
    const fechaCierre = `${mesKey}-${String(ultimoDia).padStart(2, '0')}T23:59:59`;

    saveClosedMonth_({
      mes: mesKey,
      ingresosTotales: Number(ingresos.toFixed(2)),
      gastosDirectos: Number(gastosDirectos.toFixed(2)),
      prepagosTC: Number(prepagos.toFixed(2)),
      pagosTC: Number(salidaTCMes.toFixed(2)),
      flujoLibreNeto: ahorroNeto,
      ahorroNeto: ahorroNeto,
      tasaAhorro: tasaAhorro,
      fechaCierre: fechaCierre,
      notas: 'Cierre consolidado automático'
    });
    consolidadosCount++;
  });

  SpreadsheetApp.flush();

  if (mostrarAlerta) {
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('Consolidación Exitosa', `Se han consolidado ${consolidadosCount} meses anteriores en la pestaña CONSOLIDADO_MENSUAL.`, ui.ButtonSet.OK);
    } catch (e) {}
  }

  return { success: true, count: consolidadosCount };
}

function saveRecurrente_(item) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.RECURRENTES);
  if (!sheet) {
    getRecurrentesConfig_();
    sheet = ss.getSheetByName(SHEETS.RECURRENTES);
  }

  const data = sheet.getDataRange().getValues();
  const headerRow = data[0].map(h => String(h || '').trim().toLowerCase());
  const colMes = headerRow.findIndex(h => h === 'mes' || h.includes('periodo'));
  const hasMesCol = (colMes >= 0);

  const id = String(item.id || ('REC-' + new Date().getTime())).trim();
  const itemMes = String(item.mes || '').trim().replace(/^'+/, '');
  
  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    const rowId = String(hasMesCol && colMes === 0 ? data[i][1] : data[i][0]).trim();
    const rowMes = hasMesCol ? String(data[i][colMes] || '').trim().replace(/^'+/, '') : '';
    
    // Si ambos tienen mes, deben coincidir en mes e id. Si no, solo id.
    if (hasMesCol && itemMes) {
      if (rowId === id && rowMes === itemMes) {
        foundRow = i + 1;
        break;
      }
    } else {
      if (rowId === id) {
        foundRow = i + 1;
        break;
      }
    }
  }

  const activoStr = (item.activo === false || String(item.activo) === 'false') ? 'NO' : 'SI';
  
  let rowData;
  if (hasMesCol) {
    rowData = [
      itemMes ? "'" + itemMes : '',
      id,
      String(item.nombre || '').trim(),
      String(item.tipo || 'Gasto_Fijo').trim(),
      parseFloat(item.monto) || 0,
      String(item.categoria || 'Varios').trim(),
      String(item.metodoPago || 'Efectivo').trim(),
      parseInt(item.diaMes, 10) || 1,
      activoStr,
      String(item.notas || '').trim()
    ];
  } else {
    // Legacy 9 columnas
    rowData = [
      id,
      String(item.nombre || '').trim(),
      String(item.tipo || 'Gasto_Fijo').trim(),
      parseFloat(item.monto) || 0,
      String(item.categoria || 'Varios').trim(),
      String(item.metodoPago || 'Efectivo').trim(),
      parseInt(item.diaMes, 10) || 1,
      activoStr,
      String(item.notas || '').trim()
    ];
  }

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  SpreadsheetApp.flush();
  return { success: true, recurrente: { ...item, id: id, mes: itemMes, activo: activoStr === 'SI' } };
}

function saveAllRecurrentes_(lista) {
  if (!Array.isArray(lista)) return { success: false, error: 'Array esperado' };
  lista.forEach(item => saveRecurrente_(item));
  return { success: true, count: lista.length };
}

function deleteRecurrente_(id, mes = null) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.RECURRENTES);
  if (!sheet) return { success: false, error: 'Hoja RECURRENTES no encontrada' };

  const data = sheet.getDataRange().getValues();
  const headerRow = data[0].map(h => String(h || '').trim().toLowerCase());
  const colMes = headerRow.findIndex(h => h === 'mes' || h.includes('periodo'));
  const hasMesCol = (colMes >= 0);
  const targetId = String(id || '').trim();
  const targetMes = mes ? String(mes).trim().replace(/^'+/, '') : '';

  for (let i = 1; i < data.length; i++) {
    const rowId = String(hasMesCol && colMes === 0 ? data[i][1] : data[i][0]).trim();
    const rowMes = hasMesCol ? String(data[i][colMes] || '').trim().replace(/^'+/, '') : '';

    let match = (rowId === targetId);
    if (match && targetMes && hasMesCol) {
      match = (rowMes === targetMes);
    }

    if (match) {
      sheet.deleteRow(i + 1);
      SpreadsheetApp.flush();
      return { success: true, deletedId: targetId, deletedMes: targetMes };
    }
  }
  return { success: false, error: 'Item recurrente no encontrado' };
}

function getTransactions_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const sheetIngresos = ss.getSheetByName(SHEETS.INGRESOS);
  const sheetGastosEf = ss.getSheetByName(SHEETS.GASTOS_EFECTIVO);
  const sheetGastosTC = ss.getSheetByName(SHEETS.GASTOS_TC);

  const hasNewSheets = (sheetIngresos && sheetIngresos.getLastRow() > 1) ||
                       (sheetGastosEf && sheetGastosEf.getLastRow() > 1) ||
                       (sheetGastosTC && sheetGastosTC.getLastRow() > 1);

  const parseNum_ = (val) => {
    if (typeof val === 'number') return val;
    if (val === null || val === undefined || val === '') return 0;
    let s = String(val).trim().replace(/[^0-9.,-]/g, '');
    if (s.includes(',') && s.includes('.')) {
      if (s.indexOf('.') < s.indexOf(',')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (s.includes(',')) s = s.replace(',', '.');
    return parseFloat(s) || 0;
  };

  const formatDate_ = (val) => {
    if (!val) return '';
    if (val instanceof Date) return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    let s = String(val || '').trim().replace(/^'+/, '');
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    return s.slice(0, 10);
  };

  const formatMes_ = (val, fechaFallback = '') => {
    let target = val;
    if (!target || target === '') target = fechaFallback;
    if (!target) return '';
    if (target instanceof Date) return Utilities.formatDate(target, Session.getScriptTimeZone(), 'yyyy-MM');
    let s = String(target || '').trim().replace(/^'+/, '');
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
    const ym = s.match(/^(\d{4})[-/](\d{1,2})/);
    if (ym) return `${ym[1]}-${ym[2].padStart(2, '0')}`;
    const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}`;
    if (fechaFallback && target !== fechaFallback) {
      return formatMes_(fechaFallback, '');
    }
    return '';
  };

  if (hasNewSheets) {
    const txs = [];

    // 1. Leer INGRESOS: ['ID', 'Fecha', 'Hora', 'Tipo', 'Metodo_Pago', 'Categoria', 'Monto', 'Moneda', 'Mes_Impacto_Efectivo', 'Notas']
    if (sheetIngresos && sheetIngresos.getLastRow() > 1) {
      const data = sheetIngresos.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row[0] || row[1]) {
          const fStr = formatDate_(row[1]);
          const mEfStr = formatMes_(row[8], fStr);
          txs.push({
            id: String(row[0] || ('TX-ING-' + i)).trim(),
            fecha: fStr,
            hora: String(row[2] || '12:00:00').trim(),
            tipo: 'Ingreso',
            metodoPago: String(row[4] || 'Transferencia').trim(),
            tarjetaAfectada: '',
            categoria: String(row[5] || 'Otros Ingresos').trim(),
            monto: parseNum_(row[6]),
            moneda: String(row[7] || 'PEN').trim(),
            mesImpactoEfectivo: mEfStr,
            mesImpactoTC: '',
            notas: String(row[9] || '').trim()
          });
        }
      }
    }

    // 2. Leer GASTOS_EFECTIVO: ['ID', 'Fecha', 'Hora', 'Tipo', 'Metodo_Pago', 'Categoria', 'Monto', 'Moneda', 'Mes_Impacto_Efectivo', 'Notas']
    if (sheetGastosEf && sheetGastosEf.getLastRow() > 1) {
      const data = sheetGastosEf.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row[0] || row[1]) {
          const fStr = formatDate_(row[1]);
          const mEfStr = formatMes_(row[8], fStr);
          const rawTipo = String(row[3] || '').trim();
          const tipoFinal = (rawTipo.toLowerCase() === 'gasto' || !rawTipo) ? 'Gasto_Directo' : rawTipo;

          txs.push({
            id: String(row[0] || ('TX-EF-' + i)).trim(),
            fecha: fStr,
            hora: String(row[2] || '12:00:00').trim(),
            tipo: tipoFinal,
            metodoPago: String(row[4] || 'Efectivo').trim(),
            tarjetaAfectada: '',
            categoria: String(row[5] || 'Varios').trim(),
            monto: parseNum_(row[6]),
            moneda: String(row[7] || 'PEN').trim(),
            mesImpactoEfectivo: mEfStr,
            mesImpactoTC: '',
            notas: String(row[9] || '').trim()
          });
        }
      }
    }

    // 3. Leer GASTOS_TC: ['ID', 'Fecha', 'Hora', 'Tipo', 'Tarjeta_Afectada', 'Metodo_Pago', 'Categoria', 'Monto', 'Moneda', 'Mes_Impacto_TC', 'Mes_Impacto_Efectivo', 'Notas']
    if (sheetGastosTC && sheetGastosTC.getLastRow() > 1) {
      const data = sheetGastosTC.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row[0] || row[1]) {
          const fStr = formatDate_(row[1]);
          const rawTipo = String(row[3] || '').trim();
          let tipoFinal = rawTipo;
          if (!rawTipo || rawTipo.toLowerCase() === 'consumo' || rawTipo.toLowerCase() === 'gasto' || rawTipo.toLowerCase() === 'tc') {
            tipoFinal = 'Consumo_TC';
          }

          txs.push({
            id: String(row[0] || ('TX-TC-' + i)).trim(),
            fecha: fStr,
            hora: String(row[2] || '12:00:00').trim(),
            tipo: tipoFinal,
            tarjetaAfectada: String(row[4] || '').trim(),
            metodoPago: String(row[5] || 'Tarjeta').trim(),
            categoria: String(row[6] || 'Varios').trim(),
            monto: parseNum_(row[7]),
            moneda: String(row[8] || 'PEN').trim(),
            mesImpactoTC: formatMes_(row[9], fStr),
            mesImpactoEfectivo: formatMes_(row[10], fStr),
            notas: String(row[11] || '').trim()
          });
        }
      }
    }

    // Ordenar todas las transacciones combinadas cronológicamente por Fecha y Hora ascendente
    txs.sort((a, b) => {
      const fa = (a.fecha || '') + ' ' + (a.hora || '');
      const fb = (b.fecha || '') + ' ' + (b.hora || '');
      return fa < fb ? -1 : (fa > fb ? 1 : 0);
    });

    return txs;
  }

  // Fallback: leer de la pestaña TRANSACCIONES original y migrar automáticamente a las 3 hojas
  const sheetTx = ss.getSheetByName(SHEETS.TRANSACCIONES);
  if (!sheetTx) return [];

  const data = sheetTx.getDataRange().getValues();
  if (data.length <= 1) return [];

  const txs = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const hasData = row[0] || (row[1] && row[7] !== '' && row[7] !== null);
    if (hasData) {
      const id = row[0] ? String(row[0]).trim() : ('TX-ROW-' + (i + 1));
      let fechaStr = formatDate_(row[1]);
      let mesEfStr = formatMes_(row[9], fechaStr);
      let mesTcStr = formatMes_(row[10], fechaStr);

      txs.push({
        id: id,
        fecha: fechaStr,
        hora: String(row[2] || '12:00:00').trim(),
        tipo: String(row[3] || 'Gasto_Directo').trim(),
        metodoPago: String(row[4] || '').trim(),
        tarjetaAfectada: String(row[5] || '').trim(),
        categoria: String(row[6] || '').trim(),
        monto: parseNum_(row[7]),
        moneda: String(row[8] || 'PEN').trim(),
        mesImpactoEfectivo: String(mesEfStr || '').trim(),
        mesImpactoTC: String(mesTcStr || '').trim(),
        notas: String(row[11] || '').trim()
      });
    }
  }

  // Si hay transacciones en TRANSACCIONES, migrar a las 3 hojas en segundo plano
  if (txs.length > 0) {
    try {
      migrarTransaccionesATresHojas(false);
    } catch (eMig) {}
  }

  return txs;
}

/**
 * Calcula el impacto del ciclo de la tarjeta según el día de corte y vencimiento
 */
function calcularCicloTC_(fechaStr, diaCorte, diaVencimiento) {
  const partes = fechaStr.split('-').map(Number);
  const anio = partes[0];
  const mes = partes[1] - 1; // 0-indexed
  const dia = partes[2];

  let anioCorte = anio;
  let mesCorte = mes;

  if (dia > diaCorte) {
    mesCorte++;
    if (mesCorte > 11) {
      mesCorte = 0;
      anioCorte++;
    }
  }

  let anioVenc = anioCorte;
  let mesVenc = mesCorte;
  if (diaVencimiento <= diaCorte) {
    mesVenc++;
    if (mesVenc > 11) {
      mesVenc = 0;
      anioVenc++;
    }
  }

  const pad = (n) => ('0' + n).slice(-2);
  return {
    mesImpactoTC: anioVenc + '-' + pad(mesVenc + 1),
    diaVencimiento: diaVencimiento
  };
}

/**
 * Suma meses a una fecha 'YYYY-MM-DD' ajustando días máximos del mes destino
 */
function sumarMesesAFechaTC_(fechaStr, n) {
  const norm = String(fechaStr).slice(0, 10);
  const partes = norm.split('-').map(Number);
  const target = new Date(partes[0], partes[1] - 1 + n, 1);
  const y = target.getFullYear();
  const m = target.getMonth() + 1;
  const maxDias = new Date(y, m, 0).getDate();
  const d = Math.min(partes[2], maxDias);
  const pad = (num) => ('0' + num).slice(-2);
  return y + '-' + pad(m) + '-' + pad(d);
}

/**
 * Suma meses a un string 'YYYY-MM'
 */
function sumarMeses_(mesYYYYMM, n) {
  const norm = String(mesYYYYMM).slice(0, 7);
  const partes = norm.split('-').map(Number);
  const target = new Date(partes[0], partes[1] - 1 + n, 1);
  const y = target.getFullYear();
  const m = target.getMonth() + 1;
  const pad = (num) => ('0' + num).slice(-2);
  return y + '-' + pad(m);
}

/**
 * Añade una transacción calculando de forma estricta los impactos contables
 */
function addTransaction_(tx) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetTx = ss.getSheetByName(SHEETS.TRANSACCIONES);
  if (!sheetTx) {
    setupSheets();
    sheetTx = ss.getSheetByName(SHEETS.TRANSACCIONES);
  }

  const sheetIngresos = getOrCreateSheet_(ss, SHEETS.INGRESOS, [
    'ID', 'Fecha', 'Hora', 'Tipo', 'Metodo_Pago', 'Categoria', 'Monto', 'Moneda', 'Mes_Impacto_Efectivo', 'Notas'
  ], '#059669', 7);

  const sheetGastosEf = getOrCreateSheet_(ss, SHEETS.GASTOS_EFECTIVO, [
    'ID', 'Fecha', 'Hora', 'Tipo', 'Metodo_Pago', 'Categoria', 'Monto', 'Moneda', 'Mes_Impacto_Efectivo', 'Notas'
  ], '#dc2626', 7);

  const sheetGastosTC = getOrCreateSheet_(ss, SHEETS.GASTOS_TC, [
    'ID', 'Fecha', 'Hora', 'Tipo', 'Tarjeta_Afectada', 'Metodo_Pago', 'Categoria', 'Monto', 'Moneda', 'Mes_Impacto_TC', 'Mes_Impacto_Efectivo', 'Notas'
  ], '#2563eb', 8);

  const cards = getCardsConfig_();
  const id = tx.id || ('TX-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000));
  const fecha = tx.fecha; // 'YYYY-MM-DD'
  const hora = tx.hora || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm:ss');
  const tipo = tx.tipo;
  const monto = parseFloat(tx.monto) || 0;
  const moneda = tx.moneda || 'PEN';
  const categoria = tx.categoria || 'Varios';
  const metodoPago = tx.metodoPago || 'Efectivo';
  const tarjetaAfectada = tx.tarjetaAfectada || '';
  const notas = tx.notas || '';

  // Soporte de compras en cuotas sin intereses
  const numCuotas = parseInt(tx.cuotas, 10) || 1;
  if (tipo === 'Consumo_TC' && numCuotas > 1 && !tx.cuotaActual) {
    const card = cards.find(c => c.id === tarjetaAfectada);
    const montoTotal = parseFloat(tx.monto) || 0;
    const cuotaMonto = numCuotas > 0 ? (montoTotal / numCuotas) : montoTotal;

    for (let c = 1; c <= numCuotas; c++) {
      const cuotaFecha = sumarMesesAFechaTC_(fecha, c - 1);
      const cicloCuota = calcularCicloTC_(cuotaFecha, card.diaCorte, card.diaVencimiento);
      const cuotaId = `${id}_C${c}`;
      const cuotaNotas = notas ? `${notas} (Cuota ${c}/${numCuotas})` : `Cuota ${c}/${numCuotas} sin intereses`;

      // 1. Guardar en TRANSACCIONES (maestro)
      sheetTx.appendRow([
        cuotaId, cuotaFecha, hora, tipo, metodoPago,
        tarjetaAfectada, categoria, cuotaMonto, moneda,
        '', "'" + cicloCuota.mesImpactoTC, cuotaNotas
      ]);

      // 2. Guardar en GASTOS_TC
      sheetGastosTC.appendRow([
        cuotaId, cuotaFecha, hora, tipo, tarjetaAfectada,
        metodoPago, categoria, cuotaMonto, moneda,
        "'" + cicloCuota.mesImpactoTC, '', cuotaNotas
      ]);
    }
    sortSheetByDate_(sheetGastosTC, 2, 3);
    SpreadsheetApp.flush();
    try {
      verificarYEnviarAlertasAutomaticas_();
    } catch (e) {
      console.warn('Error al verificar alertas:', e);
    }
    return { success: true, count: numCuotas, id: id };
  }

  const mesTransaccion = fecha.slice(0, 7); // 'YYYY-MM'
  let mesImpactoEfectivo = '';
  let mesImpactoTC = '';

  if (tipo === 'Ingreso' || tipo === 'Gasto_Directo') {
    mesImpactoEfectivo = mesTransaccion;
    mesImpactoTC = '';
  } else if (tipo === 'Consumo_TC') {
    const card = cards.find(c => c.id === tarjetaAfectada);
    if (!card) throw new Error('Tarjeta no encontrada: ' + tarjetaAfectada);
    const ciclo = calcularCicloTC_(fecha, card.diaCorte, card.diaVencimiento);
    mesImpactoEfectivo = '';
    mesImpactoTC = tx.mesImpactoTC || ciclo.mesImpactoTC;
  } else if (tipo === 'Prepago_TC') {
    const card = cards.find(c => c.id === tarjetaAfectada);
    if (!card) throw new Error('Tarjeta no encontrada para Prepago: ' + tarjetaAfectada);
    mesImpactoEfectivo = mesTransaccion;
    mesImpactoTC = tx.mesImpactoTC || sumarMeses_(mesTransaccion, 1);
  } else if (tipo === 'Pago_TC_Vencida') {
    mesImpactoEfectivo = mesTransaccion;
    mesImpactoTC = tx.mesImpactoTC || mesTransaccion;
  }

  // 1. Guardar en TRANSACCIONES (maestro)
  const newRow = [
    id, fecha, hora, tipo, metodoPago, tarjetaAfectada,
    categoria, monto, moneda, 
    mesImpactoEfectivo ? "'" + mesImpactoEfectivo : '', 
    mesImpactoTC ? "'" + mesImpactoTC : '', 
    notas
  ];
  sheetTx.appendRow(newRow);

  // 2. Guardar en la pestaña correspondiente y ordenar por fecha
  if (tipo === 'Ingreso') {
    sheetIngresos.appendRow([
      id, fecha, hora, tipo, metodoPago, categoria, monto, moneda,
      mesImpactoEfectivo ? "'" + mesImpactoEfectivo : '', notas
    ]);
    sortSheetByDate_(sheetIngresos, 2, 3);
  } else if (tipo === 'Consumo_TC' || tipo === 'Prepago_TC' || tipo === 'Pago_TC_Vencida') {
    sheetGastosTC.appendRow([
      id, fecha, hora, tipo, tarjetaAfectada, metodoPago, categoria, monto, moneda,
      mesImpactoTC ? "'" + mesImpactoTC : '',
      mesImpactoEfectivo ? "'" + mesImpactoEfectivo : '',
      notas
    ]);
    sortSheetByDate_(sheetGastosTC, 2, 3);
  } else {
    sheetGastosEf.appendRow([
      id, fecha, hora, tipo, metodoPago, categoria, monto, moneda,
      mesImpactoEfectivo ? "'" + mesImpactoEfectivo : '', notas
    ]);
    sortSheetByDate_(sheetGastosEf, 2, 3);
  }

  SpreadsheetApp.flush();

  // Verificación y envío de alertas automáticas en tiempo real
  try {
    verificarYEnviarAlertasAutomaticas_();
  } catch (errAlert) {
    Logger.log('Aviso al evaluar alertas tras registro: ' + errAlert.toString());
  }

  return {
    success: true,
    data: {
      id: id,
      fecha: fecha,
      hora: hora,
      tipo: tipo,
      metodoPago: metodoPago,
      tarjetaAfectada: tarjetaAfectada,
      categoria: categoria,
      monto: monto,
      moneda: moneda,
      mesImpactoEfectivo: mesImpactoEfectivo,
      mesImpactoTC: mesImpactoTC,
      notas: notas
    }
  };
}

/**
 * Sincronización por lote para transacciones registradas sin conexión (offline)
 */
function batchSyncTransactions_(txArray) {
  if (!Array.isArray(txArray)) return { success: false, error: 'Array esperado' };
  const results = [];
  for (let i = 0; i < txArray.length; i++) {
    results.push(addTransaction_(txArray[i]));
  }
  return { success: true, syncedCount: results.length };
}

/**
 * Elimina una transacción por ID tanto de TRANSACCIONES como de las 3 pestañas especializadas
 */
function deleteTransaction_(txId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetsToCheck = [
    ss.getSheetByName(SHEETS.TRANSACCIONES),
    ss.getSheetByName(SHEETS.INGRESOS),
    ss.getSheetByName(SHEETS.GASTOS_EFECTIVO),
    ss.getSheetByName(SHEETS.GASTOS_TC)
  ];

  let deleted = false;
  sheetsToCheck.forEach(sheet => {
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(txId).trim()) {
        sheet.deleteRow(i + 1);
        deleted = true;
        break;
      }
    }
  });

  SpreadsheetApp.flush();
  if (deleted) return { success: true, deletedId: txId };
  return { success: false, error: 'Transacción no encontrada' };
}

/**
 * ==============================================================================
 * CLASIFICACIÓN Y MIGRACIÓN A 3 PESTAÑAS: INGRESOS, GASTOS_EFECTIVO, GASTOS_TC
 * ==============================================================================
 * Distribuye todas las transacciones de TRANSACCIONES en 3 pestañas especializadas.
 * PRESERVA intacta la pestaña TRANSACCIONES original como respaldo histórico.
 * Ordena cada pestaña cronológicamente por Fecha y Hora ascendente.
 */
function migrarTransaccionesATresHojas(mostrarAlerta = true) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Obtener todas las transacciones existentes desde TRANSACCIONES
  let sheetTx = ss.getSheetByName(SHEETS.TRANSACCIONES);
  if (!sheetTx) {
    setupSheets();
    sheetTx = ss.getSheetByName(SHEETS.TRANSACCIONES);
  }

  const rawData = sheetTx.getDataRange().getValues();
  if (rawData.length <= 1) {
    if (mostrarAlerta) {
      try {
        const ui = SpreadsheetApp.getUi();
        ui.alert('Aviso', 'No hay transacciones en TRANSACCIONES para clasificar.', ui.ButtonSet.OK);
      } catch (e) {}
    }
    return { success: true, count: 0 };
  }

  // 2. Asegurar existencia de las 3 pestañas con formato
  const sheetIngresos = getOrCreateSheet_(ss, SHEETS.INGRESOS, [
    'ID', 'Fecha', 'Hora', 'Tipo', 'Metodo_Pago', 'Categoria', 'Monto', 'Moneda', 'Mes_Impacto_Efectivo', 'Notas'
  ], '#059669', 7);

  const sheetGastosEf = getOrCreateSheet_(ss, SHEETS.GASTOS_EFECTIVO, [
    'ID', 'Fecha', 'Hora', 'Tipo', 'Metodo_Pago', 'Categoria', 'Monto', 'Moneda', 'Mes_Impacto_Efectivo', 'Notas'
  ], '#dc2626', 7);

  const sheetGastosTC = getOrCreateSheet_(ss, SHEETS.GASTOS_TC, [
    'ID', 'Fecha', 'Hora', 'Tipo', 'Tarjeta_Afectada', 'Metodo_Pago', 'Categoria', 'Monto', 'Moneda', 'Mes_Impacto_TC', 'Mes_Impacto_Efectivo', 'Notas'
  ], '#2563eb', 8);

  // Limpiar datos previos de las 3 pestañas (preservando fila 1 de encabezados)
  [sheetIngresos, sheetGastosEf, sheetGastosTC].forEach(s => {
    if (s.getLastRow() > 1) {
      s.getRange(2, 1, s.getLastRow() - 1, s.getLastColumn()).clearContent();
    }
  });

  const listIngresos = [];
  const listGastosEf = [];
  const listGastosTC = [];

  const parseNum_ = (val) => {
    if (typeof val === 'number') return val;
    if (val === null || val === undefined || val === '') return 0;
    let s = String(val).trim().replace(/[^0-9.,-]/g, '');
    if (s.includes(',') && s.includes('.')) {
      if (s.indexOf('.') < s.indexOf(',')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (s.includes(',')) s = s.replace(',', '.');
    return parseFloat(s) || 0;
  };

  const formatDateVal_ = (val) => {
    if (val instanceof Date) return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    return String(val || '').trim().slice(0, 10);
  };

  const formatMesVal_ = (val) => {
    if (val instanceof Date) return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM');
    let s = String(val || '').trim().replace(/^'+/, '');
    const match = s.match(/^(\d{4})[-/](\d{1,2})/);
    if (match) return `${match[1]}-${match[2].padStart(2, '0')}`;
    return s.slice(0, 7);
  };

  // 3. Procesar y clasificar cada fila de TRANSACCIONES
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    const hasData = row[0] || (row[1] && row[7] !== '' && row[7] !== null);
    if (!hasData) continue;

    const id = row[0] ? String(row[0]).trim() : ('TX-ROW-' + (i + 1));
    const fecha = formatDateVal_(row[1]);
    const hora = String(row[2] || '12:00:00').trim();
    const tipo = String(row[3] || 'Gasto_Directo').trim();
    const metodoPago = String(row[4] || '').trim();
    const tarjetaAfectada = String(row[5] || '').trim();
    const categoria = String(row[6] || '').trim();
    const monto = parseNum_(row[7]);
    const moneda = String(row[8] || 'PEN').trim();
    const mesEf = formatMesVal_(row[9]);
    const mesTC = formatMesVal_(row[10]);
    const notas = String(row[11] || '').trim();

    if (tipo === 'Ingreso') {
      listIngresos.push({
        fechaSort: fecha + ' ' + hora,
        rowValues: [
          id, fecha, hora, tipo, metodoPago, categoria, monto, moneda, 
          mesEf ? "'" + mesEf : '', notas
        ]
      });
    } else if (tipo === 'Consumo_TC' || tipo === 'Prepago_TC' || tipo === 'Pago_TC_Vencida') {
      listGastosTC.push({
        fechaSort: fecha + ' ' + hora,
        rowValues: [
          id, fecha, hora, tipo, tarjetaAfectada, metodoPago, categoria, monto, moneda, 
          mesTC ? "'" + mesTC : '', mesEf ? "'" + mesEf : '', notas
        ]
      });
    } else {
      // Gastos directos en efectivo, yape, débito, transferencias, etc.
      listGastosEf.push({
        fechaSort: fecha + ' ' + hora,
        rowValues: [
          id, fecha, hora, tipo, metodoPago, categoria, monto, moneda, 
          mesEf ? "'" + mesEf : '', notas
        ]
      });
    }
  }

  // 4. Ordenar cronológicamente por Fecha y Hora ascendente
  const sortFn = (a, b) => (a.fechaSort < b.fechaSort ? -1 : (a.fechaSort > b.fechaSort ? 1 : 0));
  listIngresos.sort(sortFn);
  listGastosEf.sort(sortFn);
  listGastosTC.sort(sortFn);

  // 5. Escribir en lotes (batch) en cada pestaña
  if (listIngresos.length > 0) {
    sheetIngresos.getRange(2, 1, listIngresos.length, listIngresos[0].rowValues.length)
      .setValues(listIngresos.map(item => item.rowValues));
    sheetIngresos.getRange(2, 7, listIngresos.length, 1).setNumberFormat('#,##0.00');
  }

  if (listGastosEf.length > 0) {
    sheetGastosEf.getRange(2, 1, listGastosEf.length, listGastosEf[0].rowValues.length)
      .setValues(listGastosEf.map(item => item.rowValues));
    sheetGastosEf.getRange(2, 7, listGastosEf.length, 1).setNumberFormat('#,##0.00');
  }

  if (listGastosTC.length > 0) {
    sheetGastosTC.getRange(2, 1, listGastosTC.length, listGastosTC[0].rowValues.length)
      .setValues(listGastosTC.map(item => item.rowValues));
    sheetGastosTC.getRange(2, 8, listGastosTC.length, 1).setNumberFormat('#,##0.00');
  }

  SpreadsheetApp.flush();

  const totalMigrados = listIngresos.length + listGastosEf.length + listGastosTC.length;
  if (mostrarAlerta) {
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('Organización Completada', 
        `Se han clasificado y ordenado por fecha ${totalMigrados} movimientos:\n` +
        `• 💵 INGRESOS: ${listIngresos.length}\n` +
        `• 👛 GASTOS_EFECTIVO: ${listGastosEf.length}\n` +
        `• 💳 GASTOS_TC: ${listGastosTC.length}\n\n` +
        `La pestaña original TRANSACCIONES se mantiene intacta como respaldo histórico.`, 
        ui.ButtonSet.OK
      );
    } catch (e) {}
  }

  return {
    success: true,
    ingresosCount: listIngresos.length,
    gastosEfCount: listGastosEf.length,
    gastosTCCount: listGastosTC.length,
    totalCount: totalMigrados
  };
}

/**
 * Ordena una hoja por fecha (colFecha) y hora (colHora) de forma ascendente
 */
function sortSheetByDate_(sheet, colFecha, colHora) {
  try {
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow > 2) {
      const lastCol = sheet.getLastColumn();
      sheet.getRange(2, 1, lastRow - 1, lastCol).sort([
        { column: colFecha, ascending: true },
        { column: colHora, ascending: true }
      ]);
    }
  } catch (e) {
    Logger.log('Aviso al ordenar hoja ' + (sheet ? sheet.getName() : '') + ': ' + e.toString());
  }
}

/**
 * Obtiene o crea una pestaña con encabezados estilizados y formato
 */
function getOrCreateSheet_(ss, sheetName, headers, headerColor, currencyCol) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    formatHeaderRow(sheet, headerColor, '#ffffff');
    sheet.setFrozenRows(1);
    if (currencyCol) {
      sheet.getRange(2, currencyCol, 500, 1).setNumberFormat('#,##0.00');
    }
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    formatHeaderRow(sheet, headerColor, '#ffffff');
    sheet.setFrozenRows(1);
    if (currencyCol) {
      sheet.getRange(2, currencyCol, 500, 1).setNumberFormat('#,##0.00');
    }
  }
  return sheet;
}

/**
 * Guarda o actualiza una tarjeta
 */
function saveCard_(card) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.TARJETAS);
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };

  const data = sheet.getDataRange().getValues();
  let foundRow = -1;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(card.id).trim()) {
      foundRow = i + 1;
      break;
    }
  }

  const rowValues = [
    card.id,
    card.nombre,
    parseInt(card.diaCorte, 10),
    parseInt(card.diaVencimiento, 10),
    card.moneda || 'PEN',
    parseFloat(card.limiteCredito) || 0,
    card.colorHex || '#3b82f6'
  ];

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, 7).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  return { success: true, card: card };
}

function buildJsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==============================================================================
// MOTOR DE ALERTAS AUTOMÁTICAS: CORREO Y WHATSAPP
// ==============================================================================

/**
 * Parámetros configurables de alertas
 */
const ALERT_CONFIG = {
  EMAIL_ENABLED: true,
  EMAIL_TO: '', // Deja vacío para usar tu correo de Google actual, o escribe ej. 'tu_correo@gmail.com'
  
  WHATSAPP_ENABLED: false, // Cambiar a true al configurar número y apikey de CallMeBot
  WHATSAPP_PHONE: '+51999999999', // Tu número con código internacional (ej. +51 para Perú)
  CALLMEBOT_APIKEY: '', // Tu API key gratuita de CallMeBot
  
  // Reglas del sistema solicitadas:
  UMBRAL_BASE_GASTO: 50, // Primera alerta al superar el 50% de los ingresos
  INCREMENTO_ESCALON: 10, // Alerta cada 10% adicional (60%, 70%, 80%, 90%, 100%+)
  DIAS_AVISO_VENCIMIENTO: 5 // Alerta cuando falten 5 días o menos para el vencimiento de la tarjeta
};

/**
 * Función para programar la revisión diaria automática a las 8:00 AM.
 * Ejecuta esta función una sola vez desde el editor de Apps Script.
 */
function activarDisparadorDiario() {
  desactivarDisparadorDiario(); // Evitar duplicados
  ScriptApp.newTrigger('ejecutarRevisionDiariaAlertas')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
  Logger.log('✅ Disparador diario programado con éxito: Se revisará cada mañana a las 8:00 AM.');
}

/**
 * Elimina disparadores programados si se desea deshabilitar las alertas automáticas
 */
function desactivarDisparadorDiario() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'ejecutarRevisionDiariaAlertas') {
      ScriptApp.deleteTrigger(t);
    }
  });
  Logger.log('Disparadores diarios eliminados.');
}

/**
 * Función disparada automáticamente por el reloj de Google cada mañana a las 8:00 AM
 */
function ejecutarRevisionDiariaAlertas() {
  Logger.log('⏰ Ejecutando revisión diaria automática de alertas...');
  verificarYEnviarAlertasAutomaticas_();
}

/**
 * Motor central de verificación de alertas según las reglas financieras
 */
function verificarYEnviarAlertasAutomaticas_() {
  const userProps = PropertiesService.getUserProperties();
  const hoy = new Date();
  const mesActual = Utilities.formatDate(hoy, Session.getScriptTimeZone(), 'yyyy-MM');
  const diaActual = hoy.getDate();

  const transactions = getTransactions_();
  const cards = getCardsConfig_();

  // 1. EVALUACIÓN DE UMBRALES DE GASTO (50% y +10% en cada aumento)
  let totalIngresos = 0;
  let totalSalidas = 0;

  transactions.forEach(tx => {
    const monto = parseFloat(tx.monto) || 0;
    if (tx.mesImpactoEfectivo === mesActual) {
      if (tx.tipo === 'Ingreso') {
        totalIngresos += monto;
      } else if (tx.tipo === 'Gasto_Directo' || tx.tipo === 'Prepago_TC' || tx.tipo === 'Pago_TC_Vencida') {
        totalSalidas += monto;
      }
    }
  });

  if (totalIngresos > 0) {
    const porcentajeGastado = (totalSalidas / totalIngresos) * 100;
    
    if (porcentajeGastado >= ALERT_CONFIG.UMBRAL_BASE_GASTO) {
      const escalonActual = Math.floor(porcentajeGastado / ALERT_CONFIG.INCREMENTO_ESCALON) * ALERT_CONFIG.INCREMENTO_ESCALON;
      const propKeyGasto = 'ALERTA_GASTO_' + mesActual;
      const ultimoEscalonNotificado = parseInt(userProps.getProperty(propKeyGasto) || '0', 10);

      // Solo alertar si cruzó a un nuevo escalón (50%, 60%, 70%, etc.)
      if (escalonActual > ultimoEscalonNotificado) {
        const balanceLibre = totalIngresos - totalSalidas;
        const asunto = `⚠️ Finanzas Pro: Has alcanzado el ${escalonActual}% de tus ingresos`;
        const mensajeTexto = `*Finanzas Pro - Alerta de Gasto*\n\n` +
          `Tus salidas de este mes han alcanzado el *${escalonActual}%* de tus ingresos (${porcentajeGastado.toFixed(1)}% real).\n` +
          `• Total Gastado: S/ ${totalSalidas.toFixed(2)}\n` +
          `• Ingresos Registrados: S/ ${totalIngresos.toFixed(2)}\n` +
          `• Flujo Libre Restante: S/ ${balanceLibre.toFixed(2)}`;

        const mensajeHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; max-width: 520px; padding: 20px; border-radius: 16px; background-color: #0f172a; color: #f8fafc; border: 1px solid #334155;">
            <h2 style="color: #f59e0b; margin-top: 0;">⚠️ Alerta de Umbral de Gasto</h2>
            <p style="font-size: 15px; line-height: 1.5; color: #cbd5e1;">
              Tus salidas efectivas han superado el <strong>${escalonActual}%</strong> de tus ingresos de este mes (<strong>${porcentajeGastado.toFixed(1)}%</strong> exacto).
            </p>
            <div style="background-color: #1e293b; padding: 15px; border-radius: 12px; margin: 15px 0;">
              <p style="margin: 5px 0; font-size: 14px;"><strong>Total Salidas:</strong> S/ ${totalSalidas.toFixed(2)}</p>
              <p style="margin: 5px 0; font-size: 14px;"><strong>Ingresos:</strong> S/ ${totalIngresos.toFixed(2)}</p>
              <p style="margin: 5px 0; font-size: 14px; color: #34d399;"><strong>Flujo Libre Restante:</strong> S/ ${balanceLibre.toFixed(2)}</p>
            </div>
            <p style="font-size: 12px; color: #94a3b8;">Recomendación: Modera tus gastos directos o posterga compras no esenciales.</p>
          </div>
        `;

        enviarNotificacionDirecta_(asunto, mensajeTexto, mensajeHtml);
        userProps.setProperty(propKeyGasto, String(escalonActual));
      }
    }
  }

  // 2. EVALUACIÓN DE FECHAS DE VENCIMIENTO DE TARJETAS (Faltan <= 5 días)
  const partesMes = mesActual.split('-').map(Number);
  const anioActual = partesMes[0];
  const mesNum = partesMes[1]; // 1-indexed

  cards.forEach(card => {
    // Determinar la fecha de vencimiento que cae en este mes
    const maxDias = new Date(anioActual, mesNum, 0).getDate();
    const diaVencAjustado = Math.min(card.diaVencimiento, maxDias);
    const fechaVencimientoObj = new Date(anioActual, mesNum - 1, diaVencAjustado);
    const fechaVencimientoStr = Utilities.formatDate(fechaVencimientoObj, Session.getScriptTimeZone(), 'yyyy-MM-dd');

    // Calcular días restantes hasta el vencimiento
    const diffMilis = fechaVencimientoObj.getTime() - hoy.getTime();
    const diasRestantes = Math.ceil(diffMilis / (1000 * 60 * 60 * 24));

    // Si faltan 5 días o menos (y aún no ha vencido hace más de 1 día)
    if (diasRestantes <= ALERT_CONFIG.DIAS_AVISO_VENCIMIENTO && diasRestantes >= 0) {
      // Calcular deuda pendiente para esta tarjeta en este mes
      let consumosFacturados = 0;
      let prepagosYPagos = 0;

      transactions.forEach(tx => {
        if (tx.tarjetaAfectada === card.id) {
          const monto = parseFloat(tx.monto) || 0;
          if (tx.tipo === 'Consumo_TC' && tx.mesImpactoTC === mesActual) {
            consumosFacturados += monto;
          }
          if ((tx.tipo === 'Prepago_TC' || tx.tipo === 'Pago_TC_Vencida') && tx.mesImpactoTC === mesActual) {
            prepagosYPagos += monto;
          }
        }
      });

      const deudaPendiente = Math.max(0, consumosFacturados - prepagosYPagos);

      // Si existe deuda por pagar, notificar una vez por cada día dentro de la ventana de 5 días
      if (deudaPendiente > 0) {
        const propKeyVenc = `ALERTA_VENC_${card.id}_${fechaVencimientoStr}_DIA_${diasRestantes}`;
        if (!userProps.getProperty(propKeyVenc)) {
          const tiempoStr = diasRestantes === 0 ? '¡HOY es la fecha límite!' : `en ${diasRestantes} día(s)`;
          const asunto = `⏰ Finanzas Pro: Vence ${card.nombre} ${tiempoStr} (S/ ${deudaPendiente.toFixed(2)})`;
          const mensajeTexto = `*Finanzas Pro - Recordatorio de Vencimiento*\n\n` +
            `Tu tarjeta *${card.nombre}* vence *${tiempoStr}*.\n` +
            `• Saldo Pendiente por Pagar: *S/ ${deudaPendiente.toFixed(2)}*\n` +
            `• Fecha Límite de Pago: *${fechaVencimientoStr}*\n\n` +
            `Recuerda que puedes realizar un prepago o abono para amortizar la deuda.`;

          const mensajeHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; max-width: 520px; padding: 20px; border-radius: 16px; background-color: #0f172a; color: #f8fafc; border: 1px solid #334155;">
              <h2 style="color: #ef4444; margin-top: 0;">⏰ Recordatorio de Pago de Tarjeta</h2>
              <p style="font-size: 15px; line-height: 1.5; color: #cbd5e1;">
                Tu tarjeta <strong>${card.nombre}</strong> vence <strong>${tiempoStr}</strong>.
              </p>
              <div style="background-color: #1e293b; padding: 15px; border-radius: 12px; margin: 15px 0;">
                <p style="margin: 5px 0; font-size: 14px; color: #f87171;"><strong>Saldo Pendiente:</strong> S/ ${deudaPendiente.toFixed(2)}</p>
                <p style="margin: 5px 0; font-size: 14px;"><strong>Fecha Límite:</strong> ${fechaVencimientoStr}</p>
              </div>
              <p style="font-size: 12px; color: #94a3b8;">Evita intereses moratorios abonando antes de la fecha límite.</p>
            </div>
          `;

          enviarNotificacionDirecta_(asunto, mensajeTexto, mensajeHtml);
          userProps.setProperty(propKeyVenc, 'ENVIADO');
        }
      }
    }
  });

  // 3. EVALUACIÓN DE PRESUPUESTOS POR CATEGORÍA (Alcanza o supera el 90%)
  try {
    const budgets = getBudgetsConfig_();
    if (budgets && budgets.length > 0) {
      const gastosPorCat = {};
      transactions.forEach(tx => {
        const monto = parseFloat(tx.monto) || 0;
        const cat = tx.categoria || 'Varios';
        // Gastos directos del mes + Consumos TC del mes
        if ((tx.tipo === 'Gasto_Directo' && tx.mesImpactoEfectivo === mesActual) ||
            (tx.tipo === 'Consumo_TC' && String(tx.fecha).slice(0, 7) === mesActual)) {
          gastosPorCat[cat] = (gastosPorCat[cat] || 0) + monto;
        }
      });

      budgets.forEach(b => {
        const presupuesto = parseFloat(b.monto) || 0;
        const gastado = gastosPorCat[b.categoria] || 0;
        if (presupuesto > 0) {
          const pct = (gastado / presupuesto) * 100;
          if (pct >= 90) {
            const propKeyPresupuesto = 'ALERTA_PRESUPUESTO_' + b.categoria + '_' + mesActual;
            const yaNotificado = userProps.getProperty(propKeyPresupuesto);
            if (!yaNotificado) {
              const asunto = `⚠️ Finanzas Pro: Presupuesto de ${b.categoria} al ${Math.round(pct)}%`;
              const mensajeTexto = `*Finanzas Pro - Alerta de Presupuesto*\n\n` +
                `Has consumido el *${Math.round(pct)}%* del presupuesto asignado a *${b.categoria}*.\n` +
                `• Gastado: S/ ${gastado.toFixed(2)}\n` +
                `• Presupuesto: S/ ${presupuesto.toFixed(2)}\n` +
                `• Saldo Disponible: S/ ${Math.max(0, presupuesto - gastado).toFixed(2)}`;

              const mensajeHtml = `
                <div style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; max-width: 520px; padding: 20px; border-radius: 16px; background-color: #0f172a; color: #f8fafc; border: 1px solid #334155;">
                  <h2 style="color: #f59e0b; margin-top: 0;">⚠️ Alerta de Presupuesto: ${b.categoria}</h2>
                  <p style="font-size: 15px; line-height: 1.5; color: #cbd5e1;">
                    Has alcanzado el <strong>${Math.round(pct)}%</strong> del presupuesto asignado para <strong>${b.categoria}</strong>.
                  </p>
                  <div style="background-color: #1e293b; padding: 15px; border-radius: 12px; margin: 15px 0;">
                    <p style="margin: 5px 0; font-size: 14px;"><strong>Gastado:</strong> S/ ${gastado.toFixed(2)}</p>
                    <p style="margin: 5px 0; font-size: 14px;"><strong>Presupuesto:</strong> S/ ${presupuesto.toFixed(2)}</p>
                    <p style="margin: 5px 0; font-size: 14px; color: ${presupuesto >= gastado ? '#38bdf8' : '#f43f5e'};">
                      <strong>${presupuesto >= gastado ? 'Saldo Restante:' : 'Excedido por:'}</strong> S/ ${Math.abs(presupuesto - gastado).toFixed(2)}
                    </p>
                  </div>
                  <p style="font-size: 12px; color: #94a3b8;">Revisa tus consumos de esta categoría para no sobregirarte este mes.</p>
                </div>
              `;

              enviarNotificacionDirecta_(asunto, mensajeTexto, mensajeHtml);
              userProps.setProperty(propKeyPresupuesto, 'ENVIADO');
            }
          }
        }
      });
    }
  } catch (errPres) {
    Logger.log('Error evaluando alertas de presupuesto: ' + errPres.toString());
  }
}

/**
 * Enrutador de envío multicanal: Correo electrónico y WhatsApp
 */
function enviarNotificacionDirecta_(asunto, textoWhatsApp, htmlEmail) {
  // 1. Envío por Correo (Gmail)
  if (ALERT_CONFIG.EMAIL_ENABLED) {
    try {
      const emailDestino = ALERT_CONFIG.EMAIL_TO || Session.getActiveUser().getEmail();
      if (emailDestino) {
        GmailApp.sendEmail(emailDestino, asunto, textoWhatsApp, {
          htmlBody: htmlHtml_ = htmlEmail,
          name: 'Finanzas Pro'
        });
        Logger.log('📧 Correo de alerta enviado a: ' + emailDestino);
      }
    } catch (eMail) {
      Logger.log('Error al enviar correo: ' + eMail.toString());
    }
  }

  // 2. Envío por WhatsApp (CallMeBot API)
  if (ALERT_CONFIG.WHATSAPP_ENABLED && ALERT_CONFIG.WHATSAPP_PHONE && ALERT_CONFIG.CALLMEBOT_APIKEY) {
    try {
      const phoneClean = ALERT_CONFIG.WHATSAPP_PHONE.replace(/[^0-9+]/g, '');
      const encodedMsg = encodeURIComponent(textoWhatsApp);
      const url = `https://api.callmebot.com/whatsapp.php?phone=${phoneClean}&text=${encodedMsg}&apikey=${ALERT_CONFIG.CALLMEBOT_APIKEY}`;
      
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      Logger.log('💬 WhatsApp enviado con status: ' + response.getResponseCode());
      if (response.getResponseCode() !== 200) {
        Logger.log('Aviso WhatsApp: ' + response.getContentText());
      }
    } catch (eWa) {
      Logger.log('Error al enviar WhatsApp: ' + eWa.toString());
    }
  } else {
    Logger.log('ℹ️ WhatsApp no configurado aún (WHATSAPP_ENABLED está en false o falta apikey).');
  }
}

/**
 * ==============================================================================
 * FUNCIÓN DE PRUEBA INMEDIATA DE NOTIFICACIONES (CORREO & WHATSAPP)
 * ==============================================================================
 * Ejecuta esta función en Apps Script para comprobar que recibes el correo
 * y el WhatsApp de prueba en este mismo instante.
 */
function probarNotificacionesAhora() {
  Logger.log('🧪 Iniciando prueba inmediata de notificaciones...');
  
  const asunto = '✅ Finanzas Pro: Prueba de Enlace Exitosa';
  const textoWhatsApp = '🔔 *Finanzas Pro - Prueba de Enlace*\n\n¡Felicidades! Tu conexión de alertas está activa y funcionando correctamente.\n\nRecibirás notificaciones cuando tus gastos alcancen el 50% de tus ingresos (+10% cada aumento) y 5 días antes del vencimiento de tus tarjetas.';
  
  const htmlEmail = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; max-width: 520px; padding: 22px; border-radius: 16px; background-color: #0f172a; color: #f8fafc; border: 1px solid #334155;">
      <h2 style="color: #10b981; margin-top: 0; display: flex; items-center;">✅ Enlace de Correo Exitoso</h2>
      <p style="font-size: 15px; line-height: 1.5; color: #cbd5e1;">
        Tu correo está correctamente enlazado con <strong>Finanzas Pro</strong> y Google Sheets.
      </p>
      <div style="background-color: #1e293b; padding: 15px; border-radius: 12px; margin: 15px 0;">
        <p style="margin: 6px 0; font-size: 14px; color: #38bdf8;"><strong>• Regla de Gasto:</strong> Alertas al superar el 50% de tus ingresos (+10% cada aumento: 60%, 70%, 80%, etc.).</p>
        <p style="margin: 6px 0; font-size: 14px; color: #fbbf24;"><strong>• Regla de Tarjetas:</strong> Recordatorio automático 5 días antes de cada fecha de vencimiento.</p>
      </div>
      <p style="font-size: 12px; color: #94a3b8;">Sistema de alertas automáticas activo.</p>
    </div>
  `;

  enviarNotificacionDirecta_(asunto, textoWhatsApp, htmlEmail);
  Logger.log('🏁 Proceso finalizado. Si EMAIL_ENABLED estaba activo, revisa tu Gmail (bandeja principal o spam). Si configuraste WhatsApp, revisa tu chat.');
}
