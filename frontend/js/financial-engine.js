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
      configMap[p.categoria] = {
        monto: parseFloat(p.monto) || 0,
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
   * Calcula el historial de ahorro mensual para todos los meses registrados (meses cerrados y en curso)
   */
  function calcularHistoricoAhorro(transacciones = [], mesActualStr = null) {
    if (!mesActualStr) {
      mesActualStr = normalizarMes(new Date());
    } else {
      mesActualStr = normalizarMes(mesActualStr);
    }

    const mesesMap = {};

    transacciones.forEach(tx => {
      const monto = parseFloat(tx.monto) || 0;
      const tipo = tx.tipo;
      const mesEf = normalizarMes(tx.mesImpactoEfectivo);
      if (!mesEf) return;

      if (!mesesMap[mesEf]) {
        mesesMap[mesEf] = {
          mes: mesEf,
          ingresos: 0,
          gastosDirectos: 0,
          prepagos: 0,
          pagosTC: 0,
          totalSalidas: 0
        };
      }

      if (tipo === TIPOS_TRANSACCION.INGRESO) {
        mesesMap[mesEf].ingresos += monto;
      } else if (tipo === TIPOS_TRANSACCION.GASTO_DIRECTO) {
        mesesMap[mesEf].gastosDirectos += monto;
        mesesMap[mesEf].totalSalidas += monto;
      } else if (tipo === TIPOS_TRANSACCION.PREPAGO_TC) {
        mesesMap[mesEf].prepagos += monto;
        mesesMap[mesEf].totalSalidas += monto;
      } else if (tipo === TIPOS_TRANSACCION.PAGO_TC_VENCIDA) {
        mesesMap[mesEf].pagosTC += monto;
        mesesMap[mesEf].totalSalidas += monto;
      }
    });

    const listaMeses = Object.keys(mesesMap).sort().reverse().map(mesKey => {
      const m = mesesMap[mesKey];
      const ingresos = Number(m.ingresos.toFixed(2));
      const salidas = Number(m.totalSalidas.toFixed(2));
      const ahorroNeto = Number((ingresos - salidas).toFixed(2));
      const tasaAhorro = ingresos > 0 ? Math.round((ahorroNeto / ingresos) * 100) : 0;
      const esCerrado = mesKey < mesActualStr;

      return {
        mes: mesKey,
        ingresos: ingresos,
        salidas: salidas,
        ahorroNeto: ahorroNeto,
        tasaAhorro: tasaAhorro,
        esCerrado: esCerrado,
        estadoTexto: esCerrado ? 'Mes Cerrado' : 'Mes en Curso'
      };
    });

    const mesesCerrados = listaMeses.filter(m => m.esCerrado);
    const mesEnCurso = listaMeses.find(m => !m.esCerrado) || null;
    const totalAhorroHistorico = mesesCerrados.reduce((acc, m) => acc + m.ahorroNeto, 0);

    return {
      todos: listaMeses,
      mesesCerrados: mesesCerrados,
      mesEnCurso: mesEnCurso,
      totalAhorroCerrado: Number(totalAhorroHistorico.toFixed(2))
    };
  }

  /**
   * Consolida métricas financieras para un mes específico y proyecta el mes siguiente
   * 
   * @param {Array} transacciones - Lista de todas las transacciones
   * @param {Array} tarjetasConfig - Configuración de tarjetas de crédito
   * @param {string} mesActualStr - Mes a evaluar 'YYYY-MM' (por defecto mes actual)
   * @returns {Object} Resumen financiero completo
   */
  function calcularConsolidadoFinanciero(transacciones, tarjetasConfig = [], mesActualStr = null, presupuestosConfig = []) {
    if (!mesActualStr) {
      const hoy = new Date();
      mesActualStr = obtenerMesImpacto(hoy);
    } else {
      mesActualStr = normalizarMes(mesActualStr);
    }
    const mesSiguienteStr = sumarMeses(mesActualStr, 1);

    // 1. Métricas de Flujo de Efectivo del Mes en Curso (Impacto Efectivo === mesActualStr)
    let totalIngresos = 0;
    let totalGastosDirectos = 0;
    let totalPrepagosRealizados = 0;
    let totalPagosTCVencidas = 0;

    // Desglose por categorías para visualización (gastos directos + consumos de TC de este mes)
    const gastosPorCategoria = {};
    const ingresosPorCategoria = {};

    transacciones.forEach(tx => {
      const monto = parseFloat(tx.monto) || 0;
      const txMesEfectivo = normalizarMes(tx.mesImpactoEfectivo);
      const txMesFecha = normalizarMes(tx.fecha);

      if (txMesEfectivo === mesActualStr) {
        if (tx.tipo === TIPOS_TRANSACCION.INGRESO) {
          totalIngresos += monto;
          const cat = tx.categoria || 'Otros Ingresos';
          ingresosPorCategoria[cat] = (ingresosPorCategoria[cat] || 0) + monto;
        } else if (tx.tipo === TIPOS_TRANSACCION.GASTO_DIRECTO) {
          totalGastosDirectos += monto;
          const cat = tx.categoria || 'Gastos Varios';
          gastosPorCategoria[cat] = (gastosPorCategoria[cat] || 0) + monto;
        } else if (tx.tipo === TIPOS_TRANSACCION.PREPAGO_TC) {
          totalPrepagosRealizados += monto;
          gastosPorCategoria['Prepago TC'] = (gastosPorCategoria['Prepago TC'] || 0) + monto;
        } else if (tx.tipo === TIPOS_TRANSACCION.PAGO_TC_VENCIDA) {
          totalPagosTCVencidas += monto;
          gastosPorCategoria['Pago Factura TC'] = (gastosPorCategoria['Pago Factura TC'] || 0) + monto;
        }
      }

      // En la gráfica de gastos por categoría, incluir también los consumos con tarjeta realizados en este mes
      if (tx.tipo === TIPOS_TRANSACCION.CONSUMO_TC && txMesFecha === mesActualStr) {
        const cat = tx.categoria || 'Compras Tarjeta';
        gastosPorCategoria[cat] = (gastosPorCategoria[cat] || 0) + monto;
      }
    });

    const totalSalidasEfectivo = totalGastosDirectos + totalPrepagosRealizados + totalPagosTCVencidas;
    const balanceLibreNeto = totalIngresos - totalSalidasEfectivo;

    // 2. Proyección de Deuda de Tarjetas para el Mes Siguiente (mesSiguienteStr)
    // También computamos el estado por cada tarjeta
    const estadoTarjetas = tarjetasConfig.map(tarjeta => {
      let consumosCiclo = 0;
      let prepagosCiclo = 0;
      let pagosVencidosRegistrados = 0;

      const cardId = String(tarjeta.id || '').trim().toLowerCase();
      const cardName = String(tarjeta.nombre || '').trim().toLowerCase();

      transacciones.forEach(tx => {
        const txCard = String(tx.tarjetaAfectada || '').trim().toLowerCase();

        // Coincidencia flexible de tarjeta (TC_IO vs IO BCP, etc.)
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

          // Consumos cuyo vencimiento cae en el mes siguiente
          if (tx.tipo === TIPOS_TRANSACCION.CONSUMO_TC && txMesTC === mesSiguienteStr) {
            consumosCiclo += monto;
          }
          // Prepagos aplicados a la deuda que vence en el mes siguiente
          if (tx.tipo === TIPOS_TRANSACCION.PREPAGO_TC && txMesTC === mesSiguienteStr) {
            prepagosCiclo += monto;
          }
          // Si hubo algún pago formal
          if (tx.tipo === TIPOS_TRANSACCION.PAGO_TC_VENCIDA && txMesTC === mesSiguienteStr) {
            pagosVencidosRegistrados += monto;
          }
        }
      });

      const deudaBruta = consumosCiclo;
      // La deuda neta proyectada descuenta prepagos y pagos
      const deudaNeta = Math.max(0, deudaBruta - prepagosCiclo - pagosVencidosRegistrados);

      // Calcular fecha exacta de vencimiento para el próximo mes
      const [anioSig, mesSig] = mesSiguienteStr.split('-').map(Number);
      const maxDiasMes = new Date(anioSig, mesSig, 0).getDate();
      const diaVencAjustado = Math.min(tarjeta.diaVencimiento, maxDiasMes);
      const pad = (n) => String(n).padStart(2, '0');
      const fechaVencimientoProxima = `${anioSig}-${pad(mesSig)}-${pad(diaVencAjustado)}`;

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
        porcentajeAmortizado: deudaBruta > 0 ? Math.min(100, Math.round((prepagosCiclo / deudaBruta) * 100)) : 0
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
        gastosDirectos: Number(totalGastosDirectos.toFixed(2)),
        prepagosRealizados: Number(totalPrepagosRealizados.toFixed(2)),
        pagosTCVencidas: Number(totalPagosTCVencidas.toFixed(2)),
        totalSalidas: Number(totalSalidasEfectivo.toFixed(2)),
        balanceLibreNeto: Number(balanceLibreNeto.toFixed(2))
      },
      tarjetasCredito: {
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
      historicoAhorro: calcularHistoricoAhorro(transacciones, mesActualStr)
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
    generarAlertasFinancieras
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FinancialEngine;
  } else {
    global.FinancialEngine = FinancialEngine;
  }
})(typeof window !== 'undefined' ? window : this);
