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
  TRANSACCIONES: 'TRANSACCIONES',
  TARJETAS: 'TARJETAS_CONFIG',
  CONSOLIDADO: 'CONSOLIDADO_MENSUAL',
  PRESUPUESTOS: 'PRESUPUESTOS',
  RECURRENTES: 'RECURRENTES'
};

/**
 * Función de Inicialización Automática.
 * Ejecuta esta función una sola vez en el Editor de Apps Script para crear
 * y formatear todas las hojas y columnas necesarias.
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Pestaña TRANSACCIONES (NO destructivo: preserva todos los registros existentes)
  let sheetTx = ss.getSheetByName(SHEETS.TRANSACCIONES);
  if (!sheetTx) {
    sheetTx = ss.insertSheet(SHEETS.TRANSACCIONES);
    const txHeaders = [
      'ID', 'Fecha', 'Hora', 'Tipo', 'Metodo_Pago', 
      'Tarjeta_Afectada', 'Categoria', 'Monto', 'Moneda', 
      'Mes_Impacto_Efectivo', 'Mes_Impacto_TC', 'Notas'
    ];
    sheetTx.appendRow(txHeaders);
    formatHeaderRow(sheetTx, '#1e293b', '#ffffff');
    sheetTx.setFrozenRows(1);
    sheetTx.getRange(2, 8, 500, 1).setNumberFormat('#,##0.00');
  } else if (sheetTx.getLastRow() === 0) {
    const txHeaders = [
      'ID', 'Fecha', 'Hora', 'Tipo', 'Metodo_Pago', 
      'Tarjeta_Afectada', 'Categoria', 'Monto', 'Moneda', 
      'Mes_Impacto_Efectivo', 'Mes_Impacto_TC', 'Notas'
    ];
    sheetTx.appendRow(txHeaders);
    formatHeaderRow(sheetTx, '#1e293b', '#ffffff');
    sheetTx.setFrozenRows(1);
  }

  // 2. Pestaña TARJETAS_CONFIG (Preserva tarjetas personalizadas del usuario)
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

  // 3. Pestaña CONSOLIDADO_MENSUAL
  let sheetCons = ss.getSheetByName(SHEETS.CONSOLIDADO);
  if (!sheetCons) {
    sheetCons = ss.insertSheet(SHEETS.CONSOLIDADO);
    const consHeaders = [
      'Mes (YYYY-MM)', 'Ingresos_Totales', 'Gastos_Directos', 
      'Prepagos_TC', 'TC_Vencidas_Pagadas', 'Flujo_Libre_Neto', 
      'Nuevos_Consumos_TC', 'Deuda_Proyectada_Mes_Siguiente'
    ];
    sheetCons.appendRow(consHeaders);
    formatHeaderRow(sheetCons, '#4338ca', '#ffffff');
    sheetCons.setFrozenRows(1);
    sheetCons.getRange(2, 2, 100, 7).setNumberFormat('#,##0.00');
  } else if (sheetCons.getLastRow() === 0) {
    const consHeaders = [
      'Mes (YYYY-MM)', 'Ingresos_Totales', 'Gastos_Directos', 
      'Prepagos_TC', 'TC_Vencidas_Pagadas', 'Flujo_Libre_Neto', 
      'Nuevos_Consumos_TC', 'Deuda_Proyectada_Mes_Siguiente'
    ];
    sheetCons.appendRow(consHeaders);
    formatHeaderRow(sheetCons, '#4338ca', '#ffffff');
    sheetCons.setFrozenRows(1);
  }

  // 4. Pestaña PRESUPUESTOS (Preserva presupuestos creados por el usuario)
  let sheetBudgets = ss.getSheetByName(SHEETS.PRESUPUESTOS);
  if (!sheetBudgets) {
    sheetBudgets = ss.insertSheet(SHEETS.PRESUPUESTOS);
    const budgetHeaders = ['Categoria', 'Presupuesto_Mensual', 'Moneda'];
    sheetBudgets.appendRow(budgetHeaders);
    formatHeaderRow(sheetBudgets, '#0284c7', '#ffffff');
    sheetBudgets.setFrozenRows(1);
    sheetBudgets.getRange(2, 2, 100, 1).setNumberFormat('#,##0.00');

    const defaultBudgets = [
      ['Supermercado', 800, 'PEN'],
      ['Alimentación', 500, 'PEN'],
      ['Transporte', 250, 'PEN'],
      ['Servicios', 350, 'PEN'],
      ['Suscripciones', 100, 'PEN'],
      ['Restaurantes', 300, 'PEN'],
      ['Compras', 400, 'PEN'],
      ['Salud', 200, 'PEN'],
      ['Entretenimiento', 200, 'PEN'],
      ['Varios', 200, 'PEN']
    ];
    defaultBudgets.forEach(b => sheetBudgets.appendRow(b));
  } else if (sheetBudgets.getLastRow() === 0) {
    const budgetHeaders = ['Categoria', 'Presupuesto_Mensual', 'Moneda'];
    sheetBudgets.appendRow(budgetHeaders);
    formatHeaderRow(sheetBudgets, '#0284c7', '#ffffff');
    sheetBudgets.setFrozenRows(1);
  }

  // 5. Pestaña RECURRENTES (Preserva movimientos fijos creados por el usuario)
  let sheetRec = ss.getSheetByName(SHEETS.RECURRENTES);
  if (!sheetRec) {
    sheetRec = ss.insertSheet(SHEETS.RECURRENTES);
    const recHeaders = ['ID', 'Nombre', 'Tipo', 'Monto', 'Categoria', 'Metodo_Pago', 'Dia_Mes', 'Activo', 'Notas'];
    sheetRec.appendRow(recHeaders);
    formatHeaderRow(sheetRec, '#6366f1', '#ffffff');
    sheetRec.setFrozenRows(1);
    sheetRec.getRange(2, 4, 100, 1).setNumberFormat('#,##0.00');

    const defaultRecurrentes = [
      ['REC-1', 'Sueldo Principal', 'Ingreso_Fijo', 3500, 'Sueldo', 'Transferencia', 28, 'SI', 'Planilla mensual'],
      ['REC-2', 'Alquiler de Vivienda', 'Gasto_Fijo', 1200, 'Hogar', 'Transferencia', 1, 'SI', 'Alquiler mensual'],
      ['REC-3', 'Servicios Luz y Agua', 'Gasto_Fijo', 180, 'Servicios', 'Débito BCP', 15, 'SI', 'Recibos básicos'],
      ['REC-4', 'Internet Hogar', 'Gasto_Fijo', 120, 'Servicios', 'Débito BCP', 18, 'SI', 'Fibra óptica'],
      ['REC-5', 'Suscripciones Digitales', 'Gasto_Fijo', 70, 'Ocio', 'Tarjeta', 20, 'SI', 'Streaming']
    ];
    defaultRecurrentes.forEach(r => sheetRec.appendRow(r));
  } else if (sheetRec.getLastRow() === 0) {
    const recHeaders = ['ID', 'Nombre', 'Tipo', 'Monto', 'Categoria', 'Metodo_Pago', 'Dia_Mes', 'Activo', 'Notas'];
    sheetRec.appendRow(recHeaders);
    formatHeaderRow(sheetRec, '#6366f1', '#ffffff');
    sheetRec.setFrozenRows(1);
  }

  // Autoajuste de columnas
  [sheetTx, sheetCards, sheetCons, sheetBudgets, sheetRec].forEach(s => {
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
      responseData = {
        success: true,
        cards: cards,
        transactions: transactions,
        budgets: budgets,
        recurrentes: recurrentes
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
      result = deleteRecurrente_(payload.id);
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
      ['Supermercado', 800, 'PEN'],
      ['Alimentación', 500, 'PEN'],
      ['Transporte', 250, 'PEN'],
      ['Servicios', 350, 'PEN'],
      ['Suscripciones', 100, 'PEN'],
      ['Restaurantes', 300, 'PEN'],
      ['Compras', 400, 'PEN'],
      ['Salud', 200, 'PEN'],
      ['Entretenimiento', 200, 'PEN'],
      ['Varios', 200, 'PEN']
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
    const headers = ['ID', 'Nombre', 'Tipo', 'Monto', 'Categoria', 'Metodo_Pago', 'Dia_Mes', 'Activo', 'Notas'];
    sheet.appendRow(headers);
    formatHeaderRow(sheet, '#6366f1', '#ffffff');
    sheet.setFrozenRows(1);
    sheet.getRange(2, 4, 100, 1).setNumberFormat('#,##0.00');

    const defaults = [
      ['REC-1', 'Sueldo Principal', 'Ingreso_Fijo', 3500, 'Sueldo', 'Transferencia', 28, 'SI', 'Planilla mensual'],
      ['REC-2', 'Alquiler de Vivienda', 'Gasto_Fijo', 1200, 'Hogar', 'Transferencia', 1, 'SI', 'Alquiler mensual'],
      ['REC-3', 'Servicios Luz y Agua', 'Gasto_Fijo', 180, 'Servicios', 'Débito BCP', 15, 'SI', 'Recibos básicos'],
      ['REC-4', 'Internet Hogar', 'Gasto_Fijo', 120, 'Servicios', 'Débito BCP', 18, 'SI', 'Fibra óptica'],
      ['REC-5', 'Suscripciones Digitales', 'Gasto_Fijo', 70, 'Ocio', 'Tarjeta', 20, 'SI', 'Streaming']
    ];
    defaults.forEach(r => sheet.appendRow(r));
    SpreadsheetApp.flush();
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const items = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0] && row[1]) {
      const activoVal = String(row[7] || '').trim().toUpperCase();
      const esActivo = (activoVal === 'SI' || activoVal === 'TRUE' || activoVal === '1' || activoVal === '');
      items.push({
        id: String(row[0]).trim(),
        nombre: String(row[1]).trim(),
        tipo: String(row[2] || 'Gasto_Fijo').trim(),
        monto: parseFloat(row[3]) || 0,
        categoria: String(row[4] || 'Varios').trim(),
        metodoPago: String(row[5] || 'Efectivo').trim(),
        diaMes: parseInt(row[6], 10) || 1,
        activo: esActivo,
        notas: String(row[8] || '').trim()
      });
    }
  }
  return items;
}

function saveRecurrente_(item) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.RECURRENTES);
  if (!sheet) {
    getRecurrentesConfig_();
    sheet = ss.getSheetByName(SHEETS.RECURRENTES);
  }

  const data = sheet.getDataRange().getValues();
  let foundRow = -1;
  const id = item.id || ('REC-' + new Date().getTime());

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      foundRow = i + 1;
      break;
    }
  }

  const activoStr = (item.activo === false || String(item.activo) === 'false') ? 'NO' : 'SI';
  const rowData = [
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

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, 9).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  SpreadsheetApp.flush();
  return { success: true, recurrente: { ...item, id: id, activo: activoStr === 'SI' } };
}

function saveAllRecurrentes_(lista) {
  if (!Array.isArray(lista)) return { success: false, error: 'Array esperado' };
  lista.forEach(item => saveRecurrente_(item));
  return { success: true, count: lista.length };
}

function deleteRecurrente_(id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.RECURRENTES);
  if (!sheet) return { success: false, error: 'Hoja RECURRENTES no encontrada' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      sheet.deleteRow(i + 1);
      SpreadsheetApp.flush();
      return { success: true, deletedId: id };
    }
  }
  return { success: false, error: 'Item recurrente no encontrado' };
}

function getTransactions_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.TRANSACCIONES);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const txs = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0]) {
      // Normalizar fechas a ISO string 'YYYY-MM-DD'
      let fechaStr = row[1];
      if (row[1] instanceof Date) {
        fechaStr = Utilities.formatDate(row[1], Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }

      // Normalizar mesImpactoEfectivo y mesImpactoTC para evitar que objetos Date o textos largos lleguen al cliente
      let mesEfStr = row[9];
      if (mesEfStr instanceof Date) {
        mesEfStr = Utilities.formatDate(mesEfStr, Session.getScriptTimeZone(), 'yyyy-MM');
      } else if (typeof mesEfStr === 'string' && mesEfStr.trim() !== '') {
        mesEfStr = mesEfStr.trim();
        if (mesEfStr.indexOf('GMT') !== -1 || mesEfStr.indexOf('00:00:00') !== -1 || !/^\d{4}-\d{2}$/.test(mesEfStr)) {
          const d = new Date(mesEfStr);
          if (!isNaN(d.getTime())) {
            mesEfStr = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM');
          }
        }
      }

      let mesTcStr = row[10];
      if (mesTcStr instanceof Date) {
        mesTcStr = Utilities.formatDate(mesTcStr, Session.getScriptTimeZone(), 'yyyy-MM');
      } else if (typeof mesTcStr === 'string' && mesTcStr.trim() !== '') {
        mesTcStr = mesTcStr.trim();
        if (mesTcStr.indexOf('GMT') !== -1 || mesTcStr.indexOf('00:00:00') !== -1 || !/^\d{4}-\d{2}$/.test(mesTcStr)) {
          const d = new Date(mesTcStr);
          if (!isNaN(d.getTime())) {
            mesTcStr = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM');
          }
        }
      }

      txs.push({
        id: String(row[0]),
        fecha: fechaStr,
        hora: String(row[2] || ''),
        tipo: String(row[3]),
        metodoPago: String(row[4] || ''),
        tarjetaAfectada: String(row[5] || ''),
        categoria: String(row[6] || ''),
        monto: parseFloat(row[7]) || 0,
        moneda: String(row[8] || 'PEN'),
        mesImpactoEfectivo: String(mesEfStr || ''),
        mesImpactoTC: String(mesTcStr || ''),
        notas: String(row[11] || '')
      });
    }
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
 * Añade una transacción calculando de forma estricta los impactos contables
 */
function addTransaction_(tx) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.TRANSACCIONES);
  if (!sheet) throw new Error('Hoja TRANSACCIONES no encontrada.');

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
    if (!card) throw new Error('Tarjeta no encontrada: ' + tarjetaAfectada);
    const montoTotal = Math.round((parseFloat(tx.monto) || 0) * 100) / 100;
    const montoCuotaBase = Math.floor((montoTotal / numCuotas) * 100) / 100;
    const residuo = Math.round((montoTotal - (montoCuotaBase * numCuotas)) * 100) / 100;

    for (let c = 1; c <= numCuotas; c++) {
      const cuotaMonto = (c === 1) ? (montoCuotaBase + residuo) : montoCuotaBase;
      const cuotaFecha = sumarMesesAFechaTC_(fecha, c - 1);
      const cicloCuota = calcularCicloTC_(cuotaFecha, card.diaCorte, card.diaVencimiento);
      const cuotaId = `${id}_C${c}`;
      const cuotaNotas = notas ? `${notas} (Cuota ${c}/${numCuotas})` : `Cuota ${c}/${numCuotas} sin intereses`;

      sheet.appendRow([
        cuotaId, cuotaFecha, hora, tipo, metodoPago,
        tarjetaAfectada, categoria, cuotaMonto, moneda,
        '', "'" + cicloCuota.mesImpactoTC, cuotaNotas
      ]);
    }
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
    mesImpactoEfectivo = ''; // NO resta efectivo al consumir con tarjeta
    mesImpactoTC = tx.mesImpactoTC || ciclo.mesImpactoTC;
  } else if (tipo === 'Prepago_TC') {
    const card = cards.find(c => c.id === tarjetaAfectada);
    if (!card) throw new Error('Tarjeta no encontrada para Prepago: ' + tarjetaAfectada);
    // Doble impacto:
    // 1) Sale efectivo este mes
    mesImpactoEfectivo = mesTransaccion;
    // 2) Amortiza la deuda de la tarjeta para el ciclo futuro
    const ciclo = calcularCicloTC_(fecha, card.diaCorte, card.diaVencimiento);
    mesImpactoTC = tx.mesImpactoTC || ciclo.mesImpactoTC;
  } else if (tipo === 'Pago_TC_Vencida') {
    mesImpactoEfectivo = mesTransaccion;
    mesImpactoTC = tx.mesImpactoTC || mesTransaccion;
  }

  // Se antepone apóstrofe "'" para que Google Sheets almacene el valor como texto estricto
  // y no intente parsear "2026-10" como una fecha nativa con hora y zona horaria.
  const newRow = [
    id, fecha, hora, tipo, metodoPago, tarjetaAfectada,
    categoria, monto, moneda, 
    mesImpactoEfectivo ? "'" + mesImpactoEfectivo : '', 
    mesImpactoTC ? "'" + mesImpactoTC : '', 
    notas
  ];

  sheet.appendRow(newRow);

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
 * Elimina una transacción por ID
 */
function deleteTransaction_(txId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.TRANSACCIONES);
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(txId)) {
      sheet.deleteRow(i + 1);
      return { success: true, deletedId: txId };
    }
  }
  return { success: false, error: 'Transacción no encontrada' };
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
