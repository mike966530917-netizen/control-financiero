/**
 * FinancialEngine.js
 * Motor de Cálculo Financiero y Lógica de Negocio
 * Gestión de Flujo de Caja, Ciclos de Tarjetas de Crédito y Prepagos Anticipados.
 */

(function (global) {
  'use strict';

  const TIPOS_TRANSACCION = {
    INGRESO: 'Ingreso',
    GASTO_DIRECTO: 'Gasto_Directo',
    CONSUMO_TC: 'Consumo_TC',
    PREPAGO_TC: 'Prepago_TC',
    PAGO_TC_VENCIDA: 'Pago_TC_Vencida'
  };

  /**
   * Catálogo Maestro Unificado de Categorías
   * Usado idénticamente en Gastos Directos, Tarjetas de Crédito, Fijos y Presupuestos
   */
  const CATEGORIAS_GASTO = [
    'Hogar',
    'Servicios',
    'Supermercado',
    'Alimentación',
    'Restaurantes',
    'Transporte',
    'Suscripciones',
    'Salud',
    'Educación',
    'Compras',
    'Tecnología',
    'Entretenimiento',
    'Otros Gastos'
  ];

  const CATEGORIAS_INGRESO = [
    'Sueldo',
    'Freelance / Negocio',
    'Inversiones / Rentas',
    'Otros Ingresos'
  ];

  function normalizarCategoria(cat, tipo) {
    if (!cat || typeof cat !== 'string') {
      return tipo === TIPOS_TRANSACCION.INGRESO ? 'Otros Ingresos' : 'Otros Gastos';
    }
    const c = cat.trim();
    const aliasMap = {
      'Vivienda': 'Hogar',
      'Casa': 'Hogar',
      'Ocio': 'Entretenimiento',
      'Diversión': 'Entretenimiento',
      'Varios': 'Otros Gastos',
      'General': 'Otros Gastos',
      'Compras Tarjeta': 'Compras',
      'Gastos Varios': 'Otros Gastos',
      'Freelance': 'Freelance / Negocio',
      'Inversión': 'Inversiones / Rentas',
      'Inversiones': 'Inversiones / Rentas',
      'Rentas': 'Inversiones / Rentas',
      'Ingreso_Extra': 'Freelance / Negocio',
      'Otros_Ingresos': 'Otros Ingresos'
    };
    return aliasMap[c] || c;
  }

  /**
   * Determina el ciclo de facturación y fecha de vencimiento de pago
   * para una tarjeta según su fecha de consumo, día de corte y día de vencimiento.
   * 
   * @param {string|Date} fechaTransaccion - Fecha en formato 'YYYY-MM-DD' o Date
   * @param {number} diaCorte - Día del mes en que corta la tarjeta (1-31)
   * @param {number} diaVencimiento - Día del mes en que vence el pago de la tarjeta (1-31)
   * @returns {Object} { fechaCorte, fechaVencimiento, mesImpactoTC, periodoCorte }
   */
  function calcularCicloTarjeta(fechaTransaccion, diaCorte, diaVencimiento) {
    const d = typeof fechaTransaccion === 'string' 
      ? new Date(fechaTransaccion + 'T00:00:00') 
      : new Date(fechaTransaccion);

    const anio = d.getFullYear();
    const mes = d.getMonth(); // 0-indexed: 0 = Enero, 11 = Diciembre
    const dia = d.getDate();

    let anioCorte = anio;
    let mesCorte = mes;

    // Si la transacción se realizó después del día de corte,
    // pasa al ciclo de facturación del mes siguiente.
    if (dia > diaCorte) {
      mesCorte = mes + 1;
      if (mesCorte > 11) {
        mesCorte = 0;
        anioCorte += 1;
      }
    }

    // Fecha exacta de corte (ajustando a último día de mes si el mes tiene menos días)
    const maxDiasMesCorte = new Date(anioCorte, mesCorte + 1, 0).getDate();
    const diaCorteAjustado = Math.min(diaCorte, maxDiasMesCorte);
    const fechaCorte = new Date(anioCorte, mesCorte, diaCorteAjustado);

    // Determinación del mes de vencimiento:
    // Generalmente, si el día de vencimiento es menor o igual al de corte,
    // el pago vence en el mes siguiente al mes de corte.
    // Si el día de vencimiento es mayor al día de corte (ej. corta el 5 y vence el 25),
    // vence en el mismo mes del corte.
    let anioVenc = anioCorte;
    let mesVenc = mesCorte;

    if (diaVencimiento <= diaCorte) {
      mesVenc += 1;
      if (mesVenc > 11) {
        mesVenc = 0;
        anioVenc += 1;
      }
    }

    const maxDiasMesVenc = new Date(anioVenc, mesVenc + 1, 0).getDate();
    const diaVencAjustado = Math.min(diaVencimiento, maxDiasMesVenc);
    const fechaVencimiento = new Date(anioVenc, mesVenc, diaVencAjustado);

    const pad = (n) => String(n).padStart(2, '0');
    const mesImpactoTC = `${anioVenc}-${pad(mesVenc + 1)}`;
    const fechaCorteStr = `${anioCorte}-${pad(mesCorte + 1)}-${pad(diaCorteAjustado)}`;
    const fechaVencStr = `${anioVenc}-${pad(mesVenc + 1)}-${pad(diaVencAjustado)}`;

    return {
      fechaCorte: fechaCorteStr,
      fechaVencimiento: fechaVencStr,
      mesImpactoTC: mesImpactoTC,
      periodoCorte: `${anioCorte}-${pad(mesCorte + 1)}`
    };
  }

  /**
   * Normaliza cualquier formato de fecha o mes a 'YYYY-MM' de forma infalible.
   * Maneja cadenas YYYY-MM, YYYY-MM-DD y cadenas de fecha completa de Google Sheets:
   * "Thu Oct 01 2026 00:00:00 GMT-0500 (hora estándar de Perú)"
   */
  function normalizarMes(val) {
    if (!val) return '';
    if (typeof val !== 'string') val = String(val);
    val = val.trim();
    if (!val) return '';

    // Si ya es YYYY-MM
    if (/^\d{4}-\d{2}$/.test(val)) return val;

    // Si empieza con YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 7);

    // Si es un string de fecha largo de Google Sheets o Date estándar
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }

    return val.slice(0, 7);
  }

  /**
   * Obtiene el mes en formato YYYY-MM a partir de una fecha string o Date
   */
  function obtenerMesImpacto(fechaStr) {
    return normalizarMes(fechaStr);
  }

  /**
   * Suma meses a un formato YYYY-MM
   */
  function sumarMeses(mesYYYYMM, n) {
    const norm = normalizarMes(mesYYYYMM);
    const [anio, mes] = norm.split('-').map(Number);
    const d = new Date(anio, mes - 1 + n, 1);
    const pad = (num) => String(num).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }

  /**
   * Suma meses a una fecha 'YYYY-MM-DD' ajustando días máximos del mes de destino.
   */
  function sumarMesesAFecha(fechaStr, n) {
    if (!fechaStr) return '';
    const norm = String(fechaStr).slice(0, 10);
    const [anio, mes, dia] = norm.split('-').map(Number);
    const target = new Date(anio, mes - 1 + n, 1);
    const y = target.getFullYear();
    const m = target.getMonth() + 1;
    const maxDias = new Date(y, m, 0).getDate();
    const d = Math.min(dia, maxDias);
    const pad = (num) => String(num).padStart(2, '0');
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  /**
   * Divide un consumo con tarjeta de crédito en cuotas sin intereses.
   * Ajusta los céntimos residuales en la primera cuota y asigna cada cuota a su respectivo ciclo.
   */
  function dividirEnCuotas(tx, tarjetasConfig = []) {
    const numCuotas = parseInt(tx.cuotas, 10) || 1;
    if (numCuotas <= 1 || tx.tipo !== TIPOS_TRANSACCION.CONSUMO_TC) {
      return [prepararTransaccion(tx, tarjetasConfig)];
    }

    const montoTotal = Math.round((parseFloat(tx.monto) || 0) * 100) / 100;
    const montoCuotaBase = Math.floor((montoTotal / numCuotas) * 100) / 100;
    const residuo = Math.round((montoTotal - (montoCuotaBase * numCuotas)) * 100) / 100;

    const tarjeta = tarjetasConfig.find(t => {
      const tId = String(t.id || '').toLowerCase();
      const tNom = String(t.nombre || '').toLowerCase();
      const af = String(tx.tarjetaAfectada || '').toLowerCase();
      return tId === af || tNom === af || tId.replace(/^tc[_-]/, '') === af.replace(/^tc[_-]/, '');
    });

    const fechaOriginal = tx.fecha || new Date().toISOString().slice(0, 10);
    const notasBase = (tx.notas || '').trim();
    const cuotasList = [];

    for (let i = 1; i <= numCuotas; i++) {
      const montoCuota = (i === 1) ? Number((montoCuotaBase + residuo).toFixed(2)) : Number(montoCuotaBase.toFixed(2));
      const fechaCuota = sumarMesesAFecha(fechaOriginal, i - 1);
      
      let mesImpactoTC = '';
      let fechaVencimientoTC = '';

      if (tarjeta) {
        const ciclo = calcularCicloTarjeta(fechaCuota, tarjeta.diaCorte, tarjeta.diaVencimiento);
        mesImpactoTC = ciclo.mesImpactoTC;
        fechaVencimientoTC = ciclo.fechaVencimiento;
      } else {
        const mesEfectivo = obtenerMesImpacto(fechaCuota);
        mesImpactoTC = sumarMeses(mesEfectivo, 1);
      }

      const notaCuota = notasBase 
        ? `${notasBase} (Cuota ${i}/${numCuotas})`
        : `Cuota ${i}/${numCuotas} sin intereses`;

      cuotasList.push({
        ...tx,
        id: `${tx.id || ('TX-' + Date.now())}_C${i}`,
        idCompraPadre: tx.id || '',
        fecha: fechaCuota,
        fechaCompraOriginal: fechaOriginal,
        tipo: TIPOS_TRANSACCION.CONSUMO_TC,
        monto: montoCuota,
        montoTotalCompra: montoTotal,
        cuotaActual: i,
        totalCuotas: numCuotas,
        esSinIntereses: true,
        mesImpactoEfectivo: '',
        mesImpactoTC: mesImpactoTC,
        fechaVencimientoTC: fechaVencimientoTC,
        notas: notaCuota
      });
    }

    return cuotasList;
  }

  /**
   * Procesa una transacción antes de guardarla para imputar correctamente
   * los impactos contables según el modelo financiero.
   */
  function prepararTransaccion(tx, tarjetasConfig = []) {
    const copia = { ...tx };
    copia.monto = parseFloat(copia.monto) || 0;
    if (copia.cuotas) copia.cuotas = parseInt(copia.cuotas, 10) || 1;
    if (copia.cuotaActual) copia.cuotaActual = parseInt(copia.cuotaActual, 10);
    if (copia.totalCuotas) copia.totalCuotas = parseInt(copia.totalCuotas, 10);
    const mesEfectivo = obtenerMesImpacto(copia.fecha);

    switch (copia.tipo) {
      case TIPOS_TRANSACCION.INGRESO:
        copia.mesImpactoEfectivo = mesEfectivo;
        copia.mesImpactoTC = '';
        copia.tarjetaAfectada = '';
        break;

      case TIPOS_TRANSACCION.GASTO_DIRECTO:
        copia.mesImpactoEfectivo = mesEfectivo;
        copia.mesImpactoTC = '';
        copia.tarjetaAfectada = '';
        break;

      case TIPOS_TRANSACCION.CONSUMO_TC: {
        const tarjeta = tarjetasConfig.find(t => {
          const tId = String(t.id || '').toLowerCase();
          const tNom = String(t.nombre || '').toLowerCase();
          const af = String(copia.tarjetaAfectada || '').toLowerCase();
          return tId === af || tNom === af || tId.replace(/^tc[_-]/, '') === af.replace(/^tc[_-]/, '');
        });

        if (tarjeta) {
          const ciclo = calcularCicloTarjeta(copia.fecha, tarjeta.diaCorte, tarjeta.diaVencimiento);
          copia.mesImpactoEfectivo = '';
          copia.mesImpactoTC = ciclo.mesImpactoTC;
          copia.fechaVencimientoTC = ciclo.fechaVencimiento;
        } else {
          // Si no se encuentra, calcular ciclo por defecto mes siguiente
          copia.mesImpactoEfectivo = '';
          copia.mesImpactoTC = sumarMeses(mesEfectivo, 1);
        }
        break;
      }

      case TIPOS_TRANSACCION.PREPAGO_TC: {
        const tarjeta = tarjetasConfig.find(t => {
          const tId = String(t.id || '').toLowerCase();
          const tNom = String(t.nombre || '').toLowerCase();
          const af = String(copia.tarjetaAfectada || '').toLowerCase();
          return tId === af || tNom === af || tId.replace(/^tc[_-]/, '') === af.replace(/^tc[_-]/, '');
        });

        copia.mesImpactoEfectivo = mesEfectivo;
        if (!copia.mesImpactoTC) {
          if (tarjeta) {
            const ciclo = calcularCicloTarjeta(copia.fecha, tarjeta.diaCorte, tarjeta.diaVencimiento);
            copia.mesImpactoTC = ciclo.mesImpactoTC;
          } else {
            copia.mesImpactoTC = sumarMeses(mesEfectivo, 1);
          }
        }
        break;
      }

      case TIPOS_TRANSACCION.PAGO_TC_VENCIDA: {
        copia.mesImpactoEfectivo = mesEfectivo;
        if (!copia.mesImpactoTC) {
          copia.mesImpactoTC = mesEfectivo;
        }
        break;
      }

      default:
        copia.mesImpactoEfectivo = mesEfectivo;
        copia.mesImpactoTC = '';
    }

    return copia;
  }

  /**
   * Calcula el estado de los presupuestos por categoría
   */
  function calcularEstadoPresupuestos(gastosPorCategoria = {}, presupuestosConfig = []) {
    const configMap = {};
    presupuestosConfig.forEach(p => {
      const val = p.monto != null ? p.monto : (p.limite != null ? p.limite : p.presupuesto);
      configMap[p.categoria] = {
        monto: parseFloat(val) || 0,
        moneda: p.moneda || 'PEN'
      };
    });

    const todasCategorias = new Set([
      ...Object.keys(configMap),
      ...Object.keys(gastosPorCategoria)
    ]);

    const lista = [];
    todasCategorias.forEach(cat => {
      if (cat === 'Prepago TC' || cat === 'Pago Factura TC') return;

      const conf = configMap[cat] || { monto: 0, moneda: 'PEN' };
      const presupuesto = conf.monto;
      const gastado = parseFloat((gastosPorCategoria[cat] || 0).toFixed(2));
      const porcentaje = presupuesto > 0 ? Math.round((gastado / presupuesto) * 100) : (gastado > 0 ? 100 : 0);
      const restante = Math.max(0, Number((presupuesto - gastado).toFixed(2)));
      const excedido = Math.max(0, Number((gastado - presupuesto).toFixed(2)));

      let estado = 'ok'; // < 70%
      if (presupuesto === 0 && gastado > 0) estado = 'exceeded';
      else if (porcentaje >= 100) estado = 'exceeded';
      else if (porcentaje >= 90) estado = 'danger';
      else if (porcentaje >= 70) estado = 'warning';

      lista.push({
        categoria: cat,
        presupuesto: presupuesto,
        gastado: gastado,
        porcentaje: porcentaje,
        restante: restante,
        excedido: excedido,
        estado: estado,
        moneda: conf.moneda
      });
    });

    return lista.sort((a, b) => b.porcentaje - a.porcentaje || b.gastado - a.gastado);
  }

  /**
   * Calcula el historial de ahorro mensual para todos los meses registrados
   * Permite considerar cierres oficiales de mes (closedMonthsList) y facturación de tarjetas
   * 
   * @param {Array} transacciones - Lista de transacciones consolidadas
   * @param {string} mesActualStr - Mes actual de referencia 'YYYY-MM'
   * @param {Array} closedMonthsList - Lista de meses cerrados oficialmente
   * @returns {Object} Historial completo y métricas de meses cerrados
   */
  function calcularHistoricoAhorro(transacciones = [], mesActualStr = null, closedMonthsList = []) {
    if (!mesActualStr) {
      mesActualStr = normalizarMes(new Date());
    } else {
      mesActualStr = normalizarMes(mesActualStr);
    }

    // Mapa de cierres oficiales registrados (desde Google Sheets o almacenamiento local)
    const cierresMap = {};
    (closedMonthsList || []).forEach(cm => {
      if (cm && cm.mes) {
        cierresMap[normalizarMes(cm.mes)] = cm;
      }
    });

    const mesesSet = new Set();
    if (mesActualStr) mesesSet.add(mesActualStr);
    Object.keys(cierresMap).forEach(m => mesesSet.add(m));

    // Mapear meses presentes en transacciones
    transacciones.forEach(tx => {
      const mEf = normalizarMes(tx.mesImpactoEfectivo);
      const mTC = normalizarMes(tx.mesImpactoTC);
      const mFe = normalizarMes(tx.fecha);
      if (mEf) mesesSet.add(mEf);
      if (mTC) mesesSet.add(mTC);
      if (mFe) mesesSet.add(mFe);
    });

    const listaMeses = Array.from(mesesSet).sort().reverse().map(mesKey => {
      const cierreOficial = cierresMap[mesKey];
      const esCerrado = !!cierreOficial || mesKey < mesActualStr;

      let ingresos = 0;
      let gastosDirectos = 0;
      let prepagos = 0;
      let pagosTC = 0;
      let consumosTCFacturados = 0;
      let prepagosTCFacturados = 0;

      transacciones.forEach(tx => {
        const monto = parseFloat(tx.monto) || 0;
        const txMesEf = normalizarMes(tx.mesImpactoEfectivo);
        const txMesTC = normalizarMes(tx.mesImpactoTC);

        if (txMesEf === mesKey) {
          if (tx.tipo === TIPOS_TRANSACCION.INGRESO) ingresos += monto;
          else if (tx.tipo === TIPOS_TRANSACCION.GASTO_DIRECTO) gastosDirectos += monto;
          else if (tx.tipo === TIPOS_TRANSACCION.PREPAGO_TC) prepagos += monto;
          else if (tx.tipo === TIPOS_TRANSACCION.PAGO_TC_VENCIDA) pagosTC += monto;
        }

        if (txMesTC === mesKey) {
          if (tx.tipo === TIPOS_TRANSACCION.CONSUMO_TC) consumosTCFacturados += monto;
          else if (tx.tipo === TIPOS_TRANSACCION.PREPAGO_TC) prepagosTCFacturados += monto;
        }
      });

      const deudaFacturadaMes = Math.max(0, consumosTCFacturados - prepagosTCFacturados);
      const salidaTCMes = Math.max(deudaFacturadaMes, pagosTC);
      const totalSalidasCalculadas = gastosDirectos + prepagos + salidaTCMes;

      // Si existe cierre oficial con datos congelados, se respetan sus valores
      const finalIngresos = (cierreOficial && (cierreOficial.ingresosTotales !== undefined || cierreOficial.ingresos !== undefined))
        ? Number(cierreOficial.ingresosTotales !== undefined ? cierreOficial.ingresosTotales : cierreOficial.ingresos)
        : Number(ingresos.toFixed(2));

      const finalSalidas = (cierreOficial && (cierreOficial.totalSalidas !== undefined || cierreOficial.salidas !== undefined))
        ? Number(cierreOficial.totalSalidas !== undefined ? cierreOficial.totalSalidas : cierreOficial.salidas)
        : Number(totalSalidasCalculadas.toFixed(2));

      const ahorroNeto = Number((finalIngresos - finalSalidas).toFixed(2));
      const tasaAhorro = finalIngresos > 0 ? Math.round((ahorroNeto / finalIngresos) * 100) : 0;

      return {
        mes: mesKey,
        ingresos: finalIngresos,
        salidas: finalSalidas,
        ahorroNeto: ahorroNeto,
        tasaAhorro: tasaAhorro,
        esCerrado: esCerrado,
        esCierreOficial: !!cierreOficial,
        cierreOficial: cierreOficial || null,
        estadoTexto: cierreOficial ? '🔒 Mes Cerrado' : (mesKey === mesActualStr ? '🟢 Mes en Curso' : 'Mes Pasado')
      };
    });

    const mesesCerrados = listaMeses.filter(m => m.esCerrado);
    const mesEnCurso = listaMeses.find(m => m.mes === mesActualStr) || null;
    const totalAhorroCerrado = mesesCerrados.reduce((acc, m) => acc + m.ahorroNeto, 0);

    return {
      todos: listaMeses,
      mesesCerrados: mesesCerrados,
      mesEnCurso: mesEnCurso,
      totalAhorroCerrado: Number(totalAhorroCerrado.toFixed(2))
    };
  }

  /**
   * Genera el resumen anual de ahorro y métricas financieras para un año determinado
   * 
   * @param {Object} historicoAhorro - Resultado de calcularHistoricoAhorro
   * @param {string|number} anio - Año a consultar (ej. '2026')
   * @returns {Object} Resumen anual con KPIs acumulados y lista de meses del año
   */
  function calcularResumenAnual(historicoAhorro, anio = null) {
    if (!anio) {
      anio = new Date().getFullYear().toString();
    } else {
      anio = String(anio).trim();
    }

    const todosMeses = (historicoAhorro && historicoAhorro.todos) || [];
    const mesesAnio = todosMeses.filter(m => m.mes && m.mes.startsWith(anio));

    let totalIngresos = 0;
    let totalSalidas = 0;
    let totalAhorro = 0;
    let mesesCerradosCount = 0;

    mesesAnio.forEach(m => {
      totalIngresos += m.ingresos;
      totalSalidas += m.salidas;
      totalAhorro += m.ahorroNeto;
      if (m.esCerrado) mesesCerradosCount++;
    });

    const tasaAhorroPromedio = totalIngresos > 0 ? Math.round((totalAhorro / totalIngresos) * 100) : 0;

    return {
      anio: anio,
      totalIngresos: Number(totalIngresos.toFixed(2)),
      totalSalidas: Number(totalSalidas.toFixed(2)),
      totalAhorro: Number(totalAhorro.toFixed(2)),
      tasaAhorroPromedio: tasaAhorroPromedio,
      mesesCerradosCount: mesesCerradosCount,
      mesesRegistradosCount: mesesAnio.length,
      meses: mesesAnio
    };
  }

  /**
   * Combina transacciones efectivas asentadas con los movimientos recurrentes fijos.
   * Si un recurrente ya tiene una transacción registrada/confirmada en ese mes,
   * se respeta la transacción asentada (con su monto confirmado real).
   * Si no ha sido registrado aún, se proyecta con su monto base habitual.
   */
  function combinarTransaccionesConRecurrentes(transacciones = [], recurrentesConfig = [], mesActualStr = null, tarjetasConfig = []) {
    if (!mesActualStr) {
      mesActualStr = obtenerMesImpacto(new Date());
    } else {
      mesActualStr = normalizarMes(mesActualStr);
    }

    const [anio, mesNum] = mesActualStr.split('-').map(Number);
    const maxDiasMes = new Date(anio, mesNum, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');

    const txsCombinadas = [...transacciones];
    const recurrentesEstadoMes = [];

    // Mapear transacciones del mes
    const txsMes = transacciones.filter(t => {
      const mEf = normalizarMes(t.mesImpactoEfectivo);
      const mFecha = normalizarMes(t.fecha);
      const mTC = normalizarMes(t.mesImpactoTC);
      return mEf === mesActualStr || mFecha === mesActualStr || mTC === mesActualStr;
    });

    (recurrentesConfig || []).forEach(rec => {
      if (!rec || !rec.id) return;
      const esActivo = (rec.activo !== false && String(rec.activo) !== 'false' && String(rec.activo) !== 'NO');
      if (!esActivo) {
        recurrentesEstadoMes.push({
          ...rec,
          estadoMes: 'inactivo',
          montoMes: rec.monto || 0
        });
        return;
      }

      const recId = String(rec.id).trim();
      const recNom = String(rec.nombre || '').trim();

      // Buscar si ya existe una transacción confirmada/asentada para este fijo en el mes
      const txExistente = txsMes.find(t => {
        if (t.recurrenteId && String(t.recurrenteId).trim() === recId) return true;
        const notas = String(t.notas || '');
        if (notas.includes(`[Fijo: ${recId}]`) || notas.includes(`[Fijo: ${recNom}]`)) return true;
        if (notas === `[Fijo] ${recNom}` || notas.startsWith(`[Fijo] ${recNom}`)) return true;
        return false;
      });

      if (txExistente) {
        recurrentesEstadoMes.push({
          ...rec,
          estadoMes: 'confirmado',
          montoMes: parseFloat(txExistente.monto) || 0,
          txId: txExistente.id,
          fechaConfirmada: txExistente.fecha
        });
      } else {
        const diaAjustado = Math.min(parseInt(rec.diaMes, 10) || 1, maxDiasMes);
        const fechaProyectada = `${mesActualStr}-${pad(diaAjustado)}`;
        const montoBase = parseFloat(rec.monto) || 0;

        const metodoLower = String(rec.metodoPago || '').toLowerCase().trim();
        const targetCard = String(rec.tarjetaAfectada || '').toLowerCase().trim();
        const tarjetaCoincidente = tarjetasConfig.find(t => {
          const tId = String(t.id || '').toLowerCase().trim();
          const tNom = String(t.nombre || '').toLowerCase().trim();
          if (targetCard && (tId === targetCard || tNom === targetCard)) return true;
          if (metodoLower && (metodoLower === tId || metodoLower === tNom)) return true;
          if (tId && metodoLower.includes(tId)) return true;
          if (tNom && (metodoLower === tNom || (tNom.length > 3 && metodoLower.includes(tNom)))) return true;
          return false;
        });

        const esTC = (rec.tipo === 'Gasto_Fijo' && tarjetaCoincidente);

        let virtualTx;
        if (rec.tipo === 'Ingreso_Fijo') {
          virtualTx = {
            id: `VIRT-REC-${recId}-${mesActualStr}`,
            recurrenteId: recId,
            fecha: fechaProyectada,
            tipo: TIPOS_TRANSACCION.INGRESO,
            categoria: normalizarCategoria(rec.categoria, TIPOS_TRANSACCION.INGRESO),
            monto: montoBase,
            moneda: 'PEN',
            metodoPago: rec.metodoPago || 'Transferencia',
            mesImpactoEfectivo: mesActualStr,
            mesImpactoTC: '',
            notas: `[Fijo Proyectado: ${recId}] ${recNom}`,
            esFijoProyectado: true
          };
        } else if (esTC) {
          const ciclo = calcularCicloTarjeta(fechaProyectada, tarjetaCoincidente.diaCorte, tarjetaCoincidente.diaVencimiento);
          virtualTx = {
            id: `VIRT-REC-${recId}-${mesActualStr}`,
            recurrenteId: recId,
            fecha: fechaProyectada,
            tipo: TIPOS_TRANSACCION.CONSUMO_TC,
            tarjetaAfectada: tarjetaCoincidente.id,
            categoria: normalizarCategoria(rec.categoria, TIPOS_TRANSACCION.CONSUMO_TC),
            monto: montoBase,
            moneda: 'PEN',
            mesImpactoEfectivo: '',
            mesImpactoTC: ciclo.mesImpactoTC,
            fechaVencimientoTC: ciclo.fechaVencimiento,
            notas: `[Fijo Proyectado TC: ${recId}] ${recNom}`,
            esFijoProyectado: true
          };
        } else {
          virtualTx = {
            id: `VIRT-REC-${recId}-${mesActualStr}`,
            recurrenteId: recId,
            fecha: fechaProyectada,
            tipo: TIPOS_TRANSACCION.GASTO_DIRECTO,
            categoria: normalizarCategoria(rec.categoria, TIPOS_TRANSACCION.GASTO_DIRECTO),
            monto: montoBase,
            moneda: 'PEN',
            metodoPago: rec.metodoPago || 'Efectivo',
            mesImpactoEfectivo: mesActualStr,
            mesImpactoTC: '',
            notas: `[Fijo Proyectado: ${recId}] ${recNom}`,
            esFijoProyectado: true
          };
        }

        txsCombinadas.push(virtualTx);
        recurrentesEstadoMes.push({
          ...rec,
          estadoMes: 'proyectado',
          montoMes: montoBase
        });
      }
    });

    return {
      transaccionesConsolidadas: txsCombinadas,
      recurrentesEstadoMes: recurrentesEstadoMes
    };
  }

  /**
   * Consolida métricas financieras para un mes específico y proyecta el mes siguiente
   * Integrando transacciones efectivas asentadas y movimientos fijos recurrentes
   * 
   * @param {Array} transacciones - Lista de todas las transacciones
   * @param {Array} tarjetasConfig - Configuración de tarjetas de crédito
   * @param {string} mesActualStr - Mes a evaluar 'YYYY-MM' (por defecto mes actual)
   * @param {Array} presupuestosConfig - Configuración de presupuestos por categoría
   * @param {Array} recurrentesConfig - Configuración de ingresos y gastos fijos
   * @returns {Object} Resumen financiero completo
   */
  function calcularConsolidadoFinanciero(transacciones = [], tarjetasConfig = [], mesActualStr = null, presupuestosConfig = [], recurrentesConfig = [], closedMonths = []) {
    if (!mesActualStr) {
      const hoy = new Date();
      mesActualStr = obtenerMesImpacto(hoy);
    } else {
      mesActualStr = normalizarMes(mesActualStr);
    }
    const mesSiguienteStr = sumarMeses(mesActualStr, 1);

    // Combinar transacciones con movimientos fijos recurrentes (evita duplicados)
    const { transaccionesConsolidadas, recurrentesEstadoMes } = combinarTransaccionesConRecurrentes(
      transacciones, recurrentesConfig, mesActualStr, tarjetasConfig
    );

    // 1. Métricas de Facturación de Tarjetas que VENCEN en este mes (Impacto TC === mesActualStr)
    // Se calcula tarjeta por tarjeta de forma individual y los totales consolidados son la suma de todas
    const [anioAct, mesAct] = mesActualStr.split('-').map(Number);
    const maxDiasMesAct = new Date(anioAct, mesAct, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');

    const facturacionTarjetasMesActual = tarjetasConfig.map(tarjeta => {
      const cardId = String(tarjeta.id || '').trim().toLowerCase();
      const cardName = String(tarjeta.nombre || '').trim().toLowerCase();
      let consumos = 0;
      let prepagos = 0;
      let pagos = 0;

      transaccionesConsolidadas.forEach(tx => {
        const txCard = String(tx.tarjetaAfectada || '').trim().toLowerCase();
        const coincideTarjeta = txCard !== '' && (
          txCard === cardId ||
          txCard === cardName ||
          txCard.replace(/^tc[_-]/, '') === cardId.replace(/^tc[_-]/, '') ||
          cardName.includes(txCard.replace(/^tc[_-]/, '')) ||
          txCard.includes(cardName.replace(/\s+/g, '')) ||
          cardName.replace(/\s+/g, '').includes(txCard)
        );

        if (coincideTarjeta) {
          const monto = parseFloat(tx.monto) || 0;
          const txMesTC = normalizarMes(tx.mesImpactoTC);
          const txMesEf = normalizarMes(tx.mesImpactoEfectivo);

          if (tx.tipo === TIPOS_TRANSACCION.CONSUMO_TC && txMesTC === mesActualStr) {
            consumos += monto;
          }
          if (tx.tipo === TIPOS_TRANSACCION.PREPAGO_TC && txMesTC === mesActualStr) {
            prepagos += monto;
          }
          if (tx.tipo === TIPOS_TRANSACCION.PAGO_TC_VENCIDA && (txMesTC === mesActualStr || txMesEf === mesActualStr)) {
            pagos += monto;
          }
        }
      });

      const deudaBruta = consumos;
      const deudaNeta = Math.max(0, deudaBruta - prepagos);
      const pendiente = Math.max(0, deudaNeta - pagos);
      const salidaEfectivaTarjeta = Math.max(deudaNeta, pagos);
      const diaVencAct = Math.min(tarjeta.diaVencimiento || 1, maxDiasMesAct);
      const fechaVenc = `${anioAct}-${pad(mesAct)}-${pad(diaVencAct)}`;

      return {
        id: tarjeta.id,
        nombre: tarjeta.nombre,
        colorHex: tarjeta.colorHex || '#3b82f6',
        diaCorte: tarjeta.diaCorte,
        diaVencimiento: tarjeta.diaVencimiento,
        deudaFacturada: Number(deudaNeta.toFixed(2)),
        pagado: Number(pagos.toFixed(2)),
        pendiente: Number(pendiente.toFixed(2)),
        salidaEfectiva: Number(salidaEfectivaTarjeta.toFixed(2)),
        fechaVencimiento: fechaVenc,
        estado: pendiente <= 0 && deudaNeta > 0 ? 'PAGADO' : (pagos > 0 ? 'PARCIAL' : (deudaNeta > 0 ? 'PENDIENTE' : 'SIN_DEUDA'))
      };
    });

    // Detectar pagos registrados sin tarjeta asociada (ej. registros genéricos o legados)
    let pagosSinTarjeta = 0;
    transaccionesConsolidadas.forEach(tx => {
      if (tx.tipo === TIPOS_TRANSACCION.PAGO_TC_VENCIDA) {
        const txCard = String(tx.tarjetaAfectada || '').trim().toLowerCase();
        const txMesTC = normalizarMes(tx.mesImpactoTC);
        const txMesEf = normalizarMes(tx.mesImpactoEfectivo);
        if (txMesTC === mesActualStr || txMesEf === mesActualStr) {
          const matched = tarjetasConfig.some(t => {
            const cId = String(t.id || '').trim().toLowerCase();
            const cNom = String(t.nombre || '').trim().toLowerCase();
            return txCard !== '' && (txCard === cId || txCard === cNom || txCard.replace(/^tc[_-]/, '') === cId.replace(/^tc[_-]/, ''));
          });
          if (!matched) {
            pagosSinTarjeta += (parseFloat(tx.monto) || 0);
          }
        }
      }
    });

    // Totales consolidados del mes: suma exacta de todas las tarjetas individuales
    const deudaFacturadaNetaMes = facturacionTarjetasMesActual.reduce((acc, t) => acc + t.deudaFacturada, 0);
    const globalPagosTCVencidasMes = facturacionTarjetasMesActual.reduce((acc, t) => acc + t.pagado, 0) + pagosSinTarjeta;
    const salidaEfectivaTCDelMes = facturacionTarjetasMesActual.reduce((acc, t) => acc + t.salidaEfectiva, 0) + pagosSinTarjeta;
    const pendientePagoTCDelMes = facturacionTarjetasMesActual.reduce((acc, t) => acc + t.pendiente, 0);

    // 2. Métricas de Flujo de Efectivo del Mes en Curso (Impacto Efectivo === mesActualStr)
    let totalIngresos = 0;
    let totalIngresosFijos = 0;
    let totalIngresosVariables = 0;

    let totalGastosDirectos = 0;
    let totalGastosFijos = 0;
    let totalGastosVariables = 0;

    let totalPrepagosRealizados = 0;

    // Desglose por categorías para visualización
    const gastosPorCategoria = {};
    const ingresosPorCategoria = {};

    transaccionesConsolidadas.forEach(tx => {
      const monto = parseFloat(tx.monto) || 0;
      const txMesEfectivo = normalizarMes(tx.mesImpactoEfectivo);
      const txMesFecha = normalizarMes(tx.fecha);
      const esFijo = tx.esFijoProyectado || tx.recurrenteId || (tx.notas && String(tx.notas).includes('[Fijo'));

      if (txMesEfectivo === mesActualStr) {
        if (tx.tipo === TIPOS_TRANSACCION.INGRESO) {
          totalIngresos += monto;
          if (esFijo) totalIngresosFijos += monto;
          else totalIngresosVariables += monto;

          const cat = normalizarCategoria(tx.categoria, TIPOS_TRANSACCION.INGRESO);
          ingresosPorCategoria[cat] = (ingresosPorCategoria[cat] || 0) + monto;
        } else if (tx.tipo === TIPOS_TRANSACCION.GASTO_DIRECTO) {
          totalGastosDirectos += monto;
          if (esFijo) totalGastosFijos += monto;
          else totalGastosVariables += monto;

          const cat = normalizarCategoria(tx.categoria, TIPOS_TRANSACCION.GASTO_DIRECTO);
          gastosPorCategoria[cat] = (gastosPorCategoria[cat] || 0) + monto;
        } else if (tx.tipo === TIPOS_TRANSACCION.PREPAGO_TC) {
          totalPrepagosRealizados += monto;
          gastosPorCategoria['Prepago TC'] = (gastosPorCategoria['Prepago TC'] || 0) + monto;
        }
      }

      // En la gráfica de gastos por categoría, incluir también los consumos con tarjeta realizados en este mes
      if (tx.tipo === TIPOS_TRANSACCION.CONSUMO_TC && txMesFecha === mesActualStr) {
        const cat = normalizarCategoria(tx.categoria, TIPOS_TRANSACCION.CONSUMO_TC);
        gastosPorCategoria[cat] = (gastosPorCategoria[cat] || 0) + monto;
      }
    });

    if (globalPagosTCVencidasMes > 0) {
      gastosPorCategoria['Pago Factura TC'] = Number(globalPagosTCVencidasMes.toFixed(2));
    }
    if (pendientePagoTCDelMes > 0) {
      gastosPorCategoria['Factura TC (Por Pagar)'] = Number(pendientePagoTCDelMes.toFixed(2));
    }

    // Total salidas considera gastos directos, prepagos realizados en efectivo y la obligación facturada de TC
    const totalSalidasEfectivo = totalGastosDirectos + totalPrepagosRealizados + salidaEfectivaTCDelMes;
    const balanceLibreNeto = totalIngresos - totalSalidasEfectivo;

    // 3. Proyección de Deuda de Tarjetas para el Mes Siguiente (mesSiguienteStr)
    const estadoTarjetas = tarjetasConfig.map(tarjeta => {
      let consumosCiclo = 0;
      let prepagosCiclo = 0;
      let pagosVencidosRegistrados = 0;

      const cardId = String(tarjeta.id || '').trim().toLowerCase();
      const cardName = String(tarjeta.nombre || '').trim().toLowerCase();

      transaccionesConsolidadas.forEach(tx => {
        const txCard = String(tx.tarjetaAfectada || '').trim().toLowerCase();

        const coincideTarjeta = txCard !== '' && (
          txCard === cardId ||
          txCard === cardName ||
          txCard.replace(/^tc[_-]/, '') === cardId.replace(/^tc[_-]/, '') ||
          cardName.includes(txCard.replace(/^tc[_-]/, '')) ||
          txCard.includes(cardName.replace(/\s+/g, '')) ||
          cardName.replace(/\s+/g, '').includes(txCard)
        );

        if (coincideTarjeta) {
          const monto = parseFloat(tx.monto) || 0;
          const txMesTC = normalizarMes(tx.mesImpactoTC);

          if (tx.tipo === TIPOS_TRANSACCION.CONSUMO_TC && txMesTC === mesSiguienteStr) {
            consumosCiclo += monto;
          }
          if (tx.tipo === TIPOS_TRANSACCION.PREPAGO_TC && txMesTC === mesSiguienteStr) {
            prepagosCiclo += monto;
          }
          if (tx.tipo === TIPOS_TRANSACCION.PAGO_TC_VENCIDA && txMesTC === mesSiguienteStr) {
            pagosVencidosRegistrados += monto;
          }
        }
      });

      const deudaBruta = consumosCiclo;
      const deudaNeta = Math.max(0, deudaBruta - prepagosCiclo - pagosVencidosRegistrados);

      const [anioSig, mesSig] = mesSiguienteStr.split('-').map(Number);
      const maxDiasMes = new Date(anioSig, mesSig, 0).getDate();
      const diaVencAjustado = Math.min(tarjeta.diaVencimiento || 1, maxDiasMes);
      const fechaVencimientoProxima = `${anioSig}-${pad(mesSig)}-${pad(diaVencAjustado)}`;

      const facturaMesActual = facturacionTarjetasMesActual.find(f => f.id === tarjeta.id) || {
        id: tarjeta.id,
        nombre: tarjeta.nombre,
        colorHex: tarjeta.colorHex || '#3b82f6',
        deudaFacturada: 0,
        pagado: 0,
        pendiente: 0,
        salidaEfectiva: 0,
        fechaVencimiento: '',
        estado: 'SIN_DEUDA'
      };

      return {
        id: tarjeta.id,
        nombre: tarjeta.nombre,
        colorHex: tarjeta.colorHex || '#3b82f6',
        limiteCredito: tarjeta.limiteCredito || 0,
        diaCorte: tarjeta.diaCorte,
        diaVencimiento: tarjeta.diaVencimiento,
        fechaVencimientoProxima: fechaVencimientoProxima,
        consumosCiclo: Number(consumosCiclo.toFixed(2)),
        prepagosCiclo: Number(prepagosCiclo.toFixed(2)),
        deudaNetaProyectada: Number(deudaNeta.toFixed(2)),
        porcentajeAmortizado: deudaBruta > 0 ? Math.min(100, Math.round((prepagosCiclo / deudaBruta) * 100)) : 0,
        facturaMesActual: facturaMesActual
      };
    });

    const totalNuevosConsumosTC = estadoTarjetas.reduce((acc, t) => acc + t.consumosCiclo, 0);
    const totalPrepagosFuturos = estadoTarjetas.reduce((acc, t) => acc + t.prepagosCiclo, 0);
    const totalDeudaProyectadaProximoMes = estadoTarjetas.reduce((acc, t) => acc + t.deudaNetaProyectada, 0);

    return {
      mesActual: mesActualStr,
      mesSiguiente: mesSiguienteStr,
      flujoEfectivo: {
        ingresos: Number(totalIngresos.toFixed(2)),
        ingresosFijos: Number(totalIngresosFijos.toFixed(2)),
        ingresosVariables: Number(totalIngresosVariables.toFixed(2)),
        gastosDirectos: Number(totalGastosDirectos.toFixed(2)),
        gastosFijos: Number(totalGastosFijos.toFixed(2)),
        gastosVariables: Number(totalGastosVariables.toFixed(2)),
        prepagosRealizados: Number(totalPrepagosRealizados.toFixed(2)),
        pagosTCVencidas: Number(globalPagosTCVencidasMes.toFixed(2)),
        facturacionTC: {
          totalFacturado: Number(deudaFacturadaNetaMes.toFixed(2)),
          pagado: Number(globalPagosTCVencidasMes.toFixed(2)),
          pendiente: Number(pendientePagoTCDelMes.toFixed(2)),
          salidaEfectiva: Number(salidaEfectivaTCDelMes.toFixed(2)),
          desglosePorTarjeta: facturacionTarjetasMesActual
        },
        totalSalidas: Number(totalSalidasEfectivo.toFixed(2)),
        balanceLibreNeto: Number(balanceLibreNeto.toFixed(2))
      },
      tarjetasCredito: {
        facturacionMesActual: {
          totalFacturado: Number(deudaFacturadaNetaMes.toFixed(2)),
          totalPagado: Number(globalPagosTCVencidasMes.toFixed(2)),
          totalPendiente: Number(pendientePagoTCDelMes.toFixed(2)),
          desgloseTarjetas: facturacionTarjetasMesActual
        },
        nuevosConsumosCiclo: Number(totalNuevosConsumosTC.toFixed(2)),
        totalPrepagosAplicados: Number(totalPrepagosFuturos.toFixed(2)),
        deudaTotalProyectada: Number(totalDeudaProyectadaProximoMes.toFixed(2)),
        desgloseTarjetas: estadoTarjetas
      },
      categorias: {
        gastos: gastosPorCategoria,
        ingresos: ingresosPorCategoria
      },
      presupuestos: calcularEstadoPresupuestos(gastosPorCategoria, presupuestosConfig),
      recurrentesEstadoMes: recurrentesEstadoMes,
      historicoAhorro: calcularHistoricoAhorro(transaccionesConsolidadas, mesActualStr, closedMonths)
    };
  }

  /**
   * Genera alertas financieras automáticas inteligentes
   * 
   * @param {Object} consolidado - Resultado de calcularConsolidadoFinanciero
   * @param {string|Date} fechaReferencia - Fecha actual para calcular días restantes
   * @returns {Array} Lista de alertas ordenadas por prioridad
   */
  function generarAlertasFinancieras(consolidado, fechaReferencia = new Date()) {
    const refDate = typeof fechaReferencia === 'string' 
      ? new Date(fechaReferencia + 'T00:00:00') 
      : new Date(fechaReferencia);

    const alertas = [];
    const { flujoEfectivo, tarjetasCredito, mesSiguiente } = consolidado;
    const diaActual = refDate.getDate();

    // 1. Alertas de Control de Gasto Progresivo (50% de ingresos y +10% en cada aumento)
    if (flujoEfectivo.ingresos > 0) {
      const porcentajeGastado = (flujoEfectivo.totalSalidas / flujoEfectivo.ingresos) * 100;
      if (porcentajeGastado >= 50) {
        const escalon = Math.floor(porcentajeGastado / 10) * 10;
        let tipoAlerta = 'warning';
        let iconoAlerta = '⚠️';
        if (escalon >= 90) {
          tipoAlerta = 'danger';
          iconoAlerta = '🚨';
        } else if (escalon === 50) {
          tipoAlerta = 'warning';
          iconoAlerta = '🔔';
        }

        alertas.push({
          id: `alerta-gasto-${escalon}`,
          tipo: tipoAlerta,
          titulo: `Gasto al ${escalon}% de tus Ingresos (${Math.round(porcentajeGastado)}% real)`,
          mensaje: `Tus salidas efectivas suman S/ ${flujoEfectivo.totalSalidas.toFixed(2)} de S/ ${flujoEfectivo.ingresos.toFixed(2)} ingresados. Te quedan S/ ${flujoEfectivo.balanceLibreNeto.toFixed(2)} disponibles este mes.`,
          icono: iconoAlerta,
          prioridad: escalon >= 80 ? 1 : 2
        });
      }
    } else if (flujoEfectivo.balanceLibreNeto < 0) {
      alertas.push({
        id: 'alerta-deficit-sin-ingreso',
        tipo: 'danger',
        titulo: '⚠️ Déficit de Flujo',
        mensaje: `Registras salidas por S/ ${flujoEfectivo.totalSalidas.toFixed(2)} sin ingresos registrados en este periodo.`,
        icono: '🚨',
        prioridad: 1
      });
    }

    // 2. Alertas por Tarjeta de Crédito
    tarjetasCredito.desgloseTarjetas.forEach(tarjeta => {
      // Cálculo de días para el próximo vencimiento
      const fechaVenc = new Date(tarjeta.fechaVencimientoProxima + 'T00:00:00');
      const diffTiempo = fechaVenc.getTime() - refDate.getTime();
      const diasParaVenc = Math.ceil(diffTiempo / (1000 * 60 * 60 * 24));

      // Días para el próximo corte
      let diasParaCorte = tarjeta.diaCorte - diaActual;
      if (diasParaCorte < 0) diasParaCorte += 30; // Aproximación ciclo mensual

      // Alerta de Vencimiento Próximo con saldo pendiente
      if (tarjeta.deudaNetaProyectada > 0 && diasParaVenc >= 0 && diasParaVenc <= 5) {
        alertas.push({
          id: `venc-${tarjeta.id}`,
          tipo: 'danger',
          titulo: `Vence ${tarjeta.nombre} en ${diasParaVenc === 0 ? 'HOY' : diasParaVenc + ' días'}`,
          mensaje: `Saldo pendiente a liquidar: S/ ${tarjeta.deudaNetaProyectada.toFixed(2)}. Fecha límite: ${tarjeta.fechaVencimientoProxima}.`,
          icono: '⏰',
          prioridad: 1,
          accion: { tipo: 'Prepago_TC', tarjetaId: tarjeta.id }
        });
      }

      // Alerta de Corte Inminente (Oportunidad para diferir gastos)
      if (diasParaCorte <= 3 && diasParaCorte >= 0) {
        alertas.push({
          id: `corte-${tarjeta.id}`,
          tipo: 'info',
          titulo: `Corte de ${tarjeta.nombre} ${diasParaCorte === 0 ? 'HOY' : 'en ' + diasParaCorte + ' días'}`,
          mensaje: `Día de corte: ${tarjeta.diaCorte}. Las compras a partir de pasado el corte se pagarán recién en 2 meses.`,
          icono: '✂️',
          prioridad: 3
        });
      }

      // Alerta de Alto Uso de Línea
      if (tarjeta.limiteCredito > 0) {
        const usoPorcentaje = Math.round((tarjeta.consumosCiclo / tarjeta.limiteCredito) * 100);
        if (usoPorcentaje >= 70) {
          alertas.push({
            id: `limite-${tarjeta.id}`,
            tipo: 'warning',
            titulo: `Uso Alto de Línea (${usoPorcentaje}%) en ${tarjeta.nombre}`,
            mensaje: `Has consumido S/ ${tarjeta.consumosCiclo.toFixed(2)} de tu límite de S/ ${tarjeta.limiteCredito.toFixed(2)}. Un uso menor al 30% protege tu score crediticio.`,
            icono: '📊',
            prioridad: 2
          });
        }
      }
    });

    // 3. Alertas de Presupuesto por Categoría (Llegando al 90% y Excedido >= 100%)
    if (consolidado.presupuestos && Array.isArray(consolidado.presupuestos)) {
      consolidado.presupuestos.forEach(p => {
        if (p.presupuesto > 0) {
          if (p.porcentaje >= 100) {
            alertas.push({
              id: `alerta-presupuesto-exceso-${p.categoria}`,
              tipo: 'danger',
              titulo: `🚨 Presupuesto Excedido: ${p.categoria}`,
              mensaje: `Has consumido el ${p.porcentaje}% de tu presupuesto (S/ ${p.gastado.toFixed(2)} de S/ ${p.presupuesto.toFixed(2)}). Exceso de S/ ${p.excedido.toFixed(2)}.`,
              icono: '🚨',
              prioridad: 1
            });
          } else if (p.porcentaje >= 90) {
            alertas.push({
              id: `alerta-presupuesto-90-${p.categoria}`,
              tipo: 'warning',
              titulo: `⚠️ Presupuesto al ${p.porcentaje}%: ${p.categoria}`,
              mensaje: `Has consumido el ${p.porcentaje}% de tu presupuesto (S/ ${p.gastado.toFixed(2)} de S/ ${p.presupuesto.toFixed(2)}). Te quedan S/ ${p.restante.toFixed(2)} disponibles.`,
              icono: '⚠️',
              prioridad: 2
            });
          }
        }
      });
    }

    // 4. Recomendación de Prepago Inteligente
    if (flujoEfectivo.balanceLibreNeto > 200 && tarjetasCredito.deudaTotalProyectada > 0) {
      // Buscar tarjeta con mayor deuda
      const tarjetaMasDeudora = [...tarjetasCredito.desgloseTarjetas].sort((a, b) => b.deudaNetaProyectada - a.deudaNetaProyectada)[0];
      if (tarjetaMasDeudora && tarjetaMasDeudora.deudaNetaProyectada > 0) {
        const sugerenciaPrepago = Math.min(
          Math.floor(flujoEfectivo.balanceLibreNeto * 0.5),
          tarjetaMasDeudora.deudaNetaProyectada
        );

        if (sugerenciaPrepago >= 50) {
          alertas.push({
            id: 'sugerencia-prepago',
            tipo: 'tip',
            titulo: `⚡ Oportunidad de Prepago Recomendado`,
            mensaje: `Tienes S/ ${flujoEfectivo.balanceLibreNeto.toFixed(2)} libres. Si prepagas S/ ${sugerenciaPrepago.toFixed(2)} a ${tarjetaMasDeudora.nombre}, tu cuota de ${mesSiguiente} bajará a S/ ${(tarjetaMasDeudora.deudaNetaProyectada - sugerenciaPrepago).toFixed(2)}.`,
            icono: '💡',
            prioridad: 3,
            accion: { tipo: 'Prepago_TC', tarjetaId: tarjetaMasDeudora.id, montoSugerido: sugerenciaPrepago }
          });
        }
      }
    }

    return alertas.sort((a, b) => a.prioridad - b.prioridad);
  }

  // Exportar para Node.js y Navegador
  const FinancialEngine = {
    TIPOS_TRANSACCION,
    CATEGORIAS_GASTO,
    CATEGORIAS_INGRESO,
    normalizarCategoria,
    combinarTransaccionesConRecurrentes,
    calcularCicloTarjeta,
    normalizarMes,
    obtenerMesImpacto,
    sumarMeses,
    sumarMesesAFecha,
    dividirEnCuotas,
    prepararTransaccion,
    calcularConsolidadoFinanciero,
    calcularEstadoPresupuestos,
    calcularHistoricoAhorro,
    calcularResumenAnual,
    generarAlertasFinancieras
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FinancialEngine;
  } else {
    global.FinancialEngine = FinancialEngine;
  }
})(typeof window !== 'undefined' ? window : this);
