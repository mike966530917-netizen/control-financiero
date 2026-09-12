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

  /**
   * Normaliza tipos de transacción para aceptar variantes comunes (ej. 'Gasto', 'Consumo', etc.)
   */
  function normalizarTipo(tipoRaw, metodoPago = '', tarjetaAfectada = '') {
    const s = String(tipoRaw || '').trim().toLowerCase();
    const met = String(metodoPago || '').trim().toLowerCase();
    const card = String(tarjetaAfectada || '').trim().toLowerCase();

    if (s.includes('ingreso')) return TIPOS_TRANSACCION.INGRESO;
    if (s.includes('prepago')) return TIPOS_TRANSACCION.PREPAGO_TC;
    if (s.includes('pago') && (s.includes('tc') || s.includes('vencid') || s.includes('factura'))) {
      return TIPOS_TRANSACCION.PAGO_TC_VENCIDA;
    }
    if (s.includes('consumo') || s === 'tc' || s.includes('tarjeta') || card !== '' || met.includes('tc') || met.includes('tarjeta') || met.includes('crédito') || met.includes('credito')) {
      return TIPOS_TRANSACCION.CONSUMO_TC;
    }
    return TIPOS_TRANSACCION.GASTO_DIRECTO;
  }

  function normalizarCategoria(cat, tipo) {
    if (!cat || typeof cat !== 'string') {
      return tipo === TIPOS_TRANSACCION.INGRESO ? 'Otros Ingresos' : 'Otros Gastos';
    }
    const raw = cat.trim();
    if (!raw) {
      return tipo === TIPOS_TRANSACCION.INGRESO ? 'Otros Ingresos' : 'Otros Gastos';
    }

    const clean = raw.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[_\-\s]+/g, ' ')
      .trim();

    if (tipo === TIPOS_TRANSACCION.INGRESO) {
      if (clean.includes('sueldo') || clean.includes('salario') || clean.includes('nomina') || clean.includes('planilla')) return 'Sueldo';
      if (clean.includes('freelance') || clean.includes('negocio') || clean.includes('extra') || clean.includes('honorarios') || clean.includes('recibo')) return 'Freelance / Negocio';
      if (clean.includes('inversion') || clean.includes('renta') || clean.includes('interes') || clean.includes('dividendo') || clean.includes('deposito')) return 'Inversiones / Rentas';
      return 'Otros Ingresos';
    }

    // Mapeo robusto e insensible a tildes/mayúsculas para gastos
    if (clean.includes('super') || clean.includes('mercado') || clean.includes('bodega') || clean.includes('tottus') || clean.includes('metro') || clean.includes('vea') || clean.includes('wong')) return 'Supermercado';
    if (clean.includes('restauran') || clean.includes('comida') || clean.includes('almuerzo') || clean.includes('cena') || clean.includes('cafe') || clean.includes('bar') || clean.includes('delivery')) return 'Restaurantes';
    if (clean.includes('alimentac')) return 'Alimentación';
    if (clean.includes('hogar') || clean.includes('vivienda') || clean.includes('casa') || clean.includes('alquiler') || clean.includes('depa') || clean.includes('mantenimiento')) return 'Hogar';
    if (clean.includes('servicio') || clean.includes('luz') || clean.includes('agua') || clean.includes('gas') || clean.includes('telefono') || clean.includes('recibo')) return 'Servicios';
    if (clean.includes('transporte') || clean.includes('uber') || clean.includes('taxi') || clean.includes('pasaje') || clean.includes('combustible') || clean.includes('gasolina')) return 'Transporte';
    if (clean.includes('suscripci') || clean.includes('netflix') || clean.includes('spotify') || clean.includes('disney') || clean.includes('youtube') || clean.includes('streaming')) return 'Suscripciones';
    if (clean.includes('salud') || clean.includes('farmacia') || clean.includes('medico') || clean.includes('doctor') || clean.includes('clinica') || clean.includes('seguro')) return 'Salud';
    if (clean.includes('educaci') || clean.includes('universidad') || clean.includes('colegio') || clean.includes('curso') || clean.includes('clase') || clean.includes('pension')) return 'Educación';
    if (clean.includes('compra') || clean.includes('ropa') || clean.includes('tienda') || clean.includes('mall') || clean.includes('zapatos')) return 'Compras';
    if (clean.includes('tecnolog') || clean.includes('software') || clean.includes('hardware') || clean.includes('app') || clean.includes('computo')) return 'Tecnología';
    if (clean.includes('entreten') || clean.includes('ocio') || clean.includes('diversi') || clean.includes('cine') || clean.includes('juego') || clean.includes('viaje')) return 'Entretenimiento';
    if (clean.includes('otro') || clean.includes('vario') || clean.includes('general')) return 'Otros Gastos';

    const matchGasto = CATEGORIAS_GASTO.find(cg => {
      const cgClean = cg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      return cgClean === clean || clean.startsWith(cgClean) || cgClean.startsWith(clean);
    });
    if (matchGasto) return matchGasto;

    return raw;
  }

  /**
   * Compara dos nombres de categoría de manera flexible y tolerante a mayúsculas,
   * tildes, plurales y alias.
   */
  function sonCategoriasEquivalentes(catA, catB) {
    if (!catA || !catB) return false;
    if (catA === catB) return true;
    const strA = String(catA).trim();
    const strB = String(catB).trim();
    if (strA.toLowerCase() === strB.toLowerCase()) return true;

    const normA = normalizarCategoria(strA, TIPOS_TRANSACCION.GASTO_DIRECTO);
    const normB = normalizarCategoria(strB, TIPOS_TRANSACCION.GASTO_DIRECTO);
    if (normA && normB && normA.toLowerCase() === normB.toLowerCase()) return true;

    const cleanA = strA.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '');
    const cleanB = strB.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '');
    if (cleanA && cleanB) {
      if (cleanA === cleanB) return true;
      if (cleanA.startsWith(cleanB) || cleanB.startsWith(cleanA)) return true;
    }
    return false;
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
    val = val.replace(/^'+/, '').trim();
    if (!val) return '';

    // Si ya es exactamente YYYY-MM
    if (/^\d{4}-\d{2}$/.test(val)) return val;

    // Si empieza con formato YYYY-MM-DD (con o sin hora)
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 7);

    // Si es YYYY-M o YYYY/M o YYYY/MM
    const simpleMatch = val.match(/^(\d{4})[-/](\d{1,2})/);
    if (simpleMatch) {
      return `${simpleMatch[1]}-${simpleMatch[2].padStart(2, '0')}`;
    }

    // Si tiene formato DD/MM/YYYY o DD-MM-YYYY (con o sin hora o texto posterior)
    const dmyMatch = val.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}`;
    }

    // Si es un string de fecha largo de Google Sheets o Date estándar
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }

    const cleaned = val.replace(/[^0-9-]/g, '');
    if (/^\d{4}-\d{2}$/.test(cleaned)) return cleaned;
    return '';
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
   * Determina de forma estricta y segura si una transacción pertenece a una tarjeta de crédito específica.
   * Evita falsos positivos con cadenas vacías, genéricas ("tc", "tarjeta", "visa") o ambiguas.
   *
   * @param {string} txCardRaw - Identificador o nombre de la tarjeta en la transacción
   * @param {Object} tarjeta - Configuración de la tarjeta { id, nombre }
   * @returns {boolean} true si coincide de forma inequívoca
   */
  function tarjetaCoincide(txCardRaw, tarjeta) {
    if (!txCardRaw || !tarjeta) return false;
    const txCard = String(txCardRaw).trim().toLowerCase();
    if (!txCard) return false;

    const cardId = String(tarjeta.id || '').trim().toLowerCase();
    const cardName = String(tarjeta.nombre || '').trim().toLowerCase();

    // 1. Coincidencia exacta con ID o Nombre completo
    if (txCard === cardId || txCard === cardName) return true;

    // 2. Limpieza de prefijos comunes 'tc_', 'tc-', 'tc '
    const txClean = txCard.replace(/^tc[_\-\s]+/, '').trim();
    const idClean = cardId.replace(/^tc[_\-\s]+/, '').trim();

    // Si txClean queda vacío (ej. era solo "TC", "TC_" o "TC "), NO coincide con ninguna tarjeta específica
    if (!txClean) return false;

    // Coincidencia exacta de IDs limpios (ej: 'bcp' con 'bcp')
    if (idClean && txClean === idClean) return true;

    // 3. Palabras genéricas que NUNCA deben asociar una tarjeta específica
    const terminosGenericos = [
      'tc', 'tarjeta', 'tarjetas', 'credito', 'debito', 
      'visa', 'mastercard', 'signature', 'black', 'classic', 'gold', 'platinum', 'amex'
    ];
    if (terminosGenericos.includes(txClean)) {
      return false;
    }

    // 4. Si el término limpio coincide con alguna palabra clave del nombre del banco/tarjeta
    // (ej: txClean es "bcp" o "bbva" o "interbank")
    const nombrePalabras = cardName.split(/[\s_\-]+/).filter(w => w.length >= 2);
    if (nombrePalabras.includes(txClean)) {
      return true;
    }

    // 5. Coincidencia por inicio inequívoco de nombre (ej: "bcp visa" empieza con "bcp")
    if (cardName.startsWith(txClean + ' ') || cardName.startsWith(txClean + '_')) {
      return true;
    }

    return false;
  }

  /**
   * Divide un consumo con tarjeta de crédito en cuotas sin intereses.
   * La división es totalmente exacta sin redondeos truncados ni asignación artificial de residuos.
   */
  function dividirEnCuotas(tx, tarjetasConfig = []) {
    const numCuotas = parseInt(tx.cuotas, 10) || 1;
    if (numCuotas <= 1 || tx.tipo !== TIPOS_TRANSACCION.CONSUMO_TC) {
      return [prepararTransaccion(tx, tarjetasConfig)];
    }

    const montoTotal = parseFloat(tx.monto) || 0;
    // División totalmente exacta sin truncar decimales
    const montoCuotaExacto = numCuotas > 0 ? (montoTotal / numCuotas) : montoTotal;

    const tarjeta = tarjetasConfig.find(t => tarjetaCoincide(tx.tarjetaAfectada, t));

    const fechaOriginal = tx.fecha || new Date().toISOString().slice(0, 10);
    const notasBase = (tx.notas || '').trim();
    const cuotasList = [];

    for (let i = 1; i <= numCuotas; i++) {
      const montoCuota = montoCuotaExacto;
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
   * Obtiene y agrupa las compras en cuotas que tienen cuotas pendientes
   * en meses futuros para una tarjeta específica.
   */
  function obtenerComprasEnCuotasPendientes(transacciones = [], tarjetaId = null, mesActualStr = null) {
    if (!mesActualStr) {
      mesActualStr = obtenerMesImpacto(new Date());
    } else {
      mesActualStr = normalizarMes(mesActualStr);
    }

    const cardIdNorm = tarjetaId ? String(tarjetaId).trim().toLowerCase() : '';

    const cuotasFuturas = transacciones.filter(tx => {
      if (tx.tipo !== TIPOS_TRANSACCION.CONSUMO_TC) return false;
      if (tx.estado === 'LIQUIDADO' || tx.estado === 'LIQUIDADA' || tx.esLiquidado === true) return false;
      if (tx.esFijoProyectado) return false; // Nunca sumar fijos proyectados

      const txCard = String(tx.tarjetaAfectada || '').trim();
      if (cardIdNorm && !tarjetaCoincide(txCard, { id: cardIdNorm, nombre: cardIdNorm })) {
        return false;
      }

      const mesTC = normalizarMes(tx.mesImpactoTC);
      // Cuotas que vencerán después del mes actual
      return mesTC > mesActualStr;
    });

    const grupos = {};
    cuotasFuturas.forEach(tx => {
      const grupoKey = tx.idCompraPadre || tx.id.replace(/_C\d+$/, '');
      if (!grupos[grupoKey]) {
        grupos[grupoKey] = {
          idCompraPadre: grupoKey,
          descripcion: (tx.notas || 'Compra en cuotas').replace(/\s*\(Cuota \d+\/\d+.*\)/i, '').trim() || 'Compra en cuotas',
          tarjetaAfectada: tx.tarjetaAfectada,
          categoria: tx.categoria || 'Compras',
          montoTotalCompra: parseFloat(tx.montoTotalCompra) || 0,
          totalCuotas: parseInt(tx.totalCuotas, 10) || 1,
          cuotas: []
        };
      }

      grupos[grupoKey].cuotas.push({
        id: tx.id,
        cuotaActual: parseInt(tx.cuotaActual, 10) || 1,
        totalCuotas: parseInt(tx.totalCuotas, 10) || grupos[grupoKey].totalCuotas,
        monto: parseFloat(tx.monto) || 0,
        fecha: tx.fecha,
        mesImpactoTC: normalizarMes(tx.mesImpactoTC),
        fechaVencimientoTC: tx.fechaVencimientoTC || '',
        notas: tx.notas || ''
      });
    });

    const resultado = Object.values(grupos).map(compra => {
      compra.cuotas.sort((a, b) => a.mesImpactoTC.localeCompare(b.mesImpactoTC) || a.cuotaActual - b.cuotaActual);
      compra.montoPendienteTotal = Number(compra.cuotas.reduce((acc, c) => acc + c.monto, 0).toFixed(2));
      compra.cuotasRestantesCount = compra.cuotas.length;
      return compra;
    });

    return resultado.sort((a, b) => b.montoPendienteTotal - a.montoPendienteTotal);
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
        const tarjeta = tarjetasConfig.find(t => tarjetaCoincide(copia.tarjetaAfectada, t));

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
        copia.mesImpactoEfectivo = mesEfectivo;
        if (!copia.mesImpactoTC) {
          // El prepago realizado en el mes M amortiza por defecto la factura del ciclo que vence en M+1
          copia.mesImpactoTC = sumarMeses(mesEfectivo, 1);
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
      const val = p.monto != null ? p.monto : (p.limite != null ? p.limite : (p.presupuesto != null ? p.presupuesto : (p.limiteMensual != null ? p.limiteMensual : (p.presupuestoMensual != null ? p.presupuestoMensual : 0))));
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
        limite: presupuesto, // Alias para compatibilidad con UI y modales
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
   * Calcula el historial de ahorro mensual para todos los meses registrados y proyecta meses futuros
   * Permite considerar cierres oficiales de mes (closedMonthsList), facturación de tarjetas
   * y proyecciones de sueldos futuros, gastos fijos y cuotas de TC programadas.
   * 
   * @param {Array} transacciones - Lista de transacciones consolidadas
   * @param {string} mesActualStr - Mes actual de referencia 'YYYY-MM'
   * @param {Array} closedMonthsList - Lista de meses cerrados oficialmente
   * @param {Array} recurrentesConfig - Configuración de sueldos e ingresos/gastos fijos
   * @returns {Object} Historial completo y métricas de meses cerrados y proyectados
   */
  function calcularHistoricoAhorro(transacciones = [], mesActualStr = null, closedMonthsList = [], recurrentesConfig = []) {
    if (!mesActualStr) {
      mesActualStr = normalizarMes(new Date());
    } else {
      mesActualStr = normalizarMes(mesActualStr);
    }

    const currentYear = mesActualStr.split('-')[0];

    // Mapa de cierres oficiales registrados (desde Google Sheets o almacenamiento local)
    const cierresMap = {};
    (closedMonthsList || []).forEach(cm => {
      if (cm && cm.mes) {
        cierresMap[normalizarMes(cm.mes)] = cm;
      }
    });

    const mesesSet = new Set();
    // Asegurar los 12 meses del año actual
    for (let m = 1; m <= 12; m++) {
      const mesPad = String(m).padStart(2, '0');
      mesesSet.add(`${currentYear}-${mesPad}`);
    }

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

    // Fijos recurrentes: obtener los fijos específicos para cada mes en el recorrido
    const listaMeses = Array.from(mesesSet).sort().reverse().map(mesKey => {
      const cierreOficial = cierresMap[mesKey];
      const esFuturo = mesKey > mesActualStr;
      const esMesEnCurso = mesKey === mesActualStr;
      const esCerrado = !!cierreOficial || (mesKey < mesActualStr && !esFuturo);

      const fijosDelMes = getRecurrentesParaMes(recurrentesConfig, mesKey);
      const sumaIngresosFijosMes = fijosDelMes
        .filter(r => r && (r.activo !== false && String(r.activo) !== 'false' && String(r.activo) !== 'NO') && r.tipo === 'Ingreso_Fijo')
        .reduce((acc, r) => acc + (parseFloat(r.monto) || 0), 0);
      const sumaGastosFijosMes = fijosDelMes
        .filter(r => r && (r.activo !== false && String(r.activo) !== 'false' && String(r.activo) !== 'NO') && r.tipo !== 'Ingreso_Fijo')
        .reduce((acc, r) => acc + (parseFloat(r.monto) || 0), 0);

      let finalIngresos = 0;
      let finalSalidas = 0;
      let ahorroNeto = 0;
      let tasaAhorro = 0;
      let esProyectado = false;
      let estadoTexto = 'Mes Pasado';

      if (cierreOficial) {
        // 1. Cierre oficial congelado con datos históricos
        finalIngresos = (cierreOficial.ingresosTotales !== undefined && cierreOficial.ingresosTotales !== null) 
          ? Number(cierreOficial.ingresosTotales) 
          : (cierreOficial.ingresos !== undefined ? Number(cierreOficial.ingresos) : 0);
        
        finalSalidas = (cierreOficial.totalSalidas !== undefined && cierreOficial.totalSalidas !== null) 
          ? Number(cierreOficial.totalSalidas) 
          : (cierreOficial.salidas !== undefined ? Number(cierreOficial.salidas) : 0);

        // Si el cierre oficial tiene ahorroNeto explícito (de Google Sheets), usarlo directamente
        if (cierreOficial.ahorroNeto !== undefined && cierreOficial.ahorroNeto !== null && !isNaN(Number(cierreOficial.ahorroNeto))) {
          ahorroNeto = Number(Number(cierreOficial.ahorroNeto).toFixed(2));
          // Si el usuario editó el ahorro pero dejó ingresos y salidas en 0, cuadrar ingresos
          if (finalIngresos === 0 && finalSalidas === 0 && ahorroNeto !== 0) {
            if (ahorroNeto > 0) finalIngresos = ahorroNeto;
            else finalSalidas = Math.abs(ahorroNeto);
          }
        } else {
          ahorroNeto = Number((finalIngresos - finalSalidas).toFixed(2));
        }

        if (cierreOficial.tasaAhorro !== undefined && cierreOficial.tasaAhorro !== null && !isNaN(Number(cierreOficial.tasaAhorro)) && Number(cierreOficial.tasaAhorro) > 0) {
          tasaAhorro = Math.round(Number(cierreOficial.tasaAhorro));
        } else {
          tasaAhorro = finalIngresos > 0 ? Math.round((ahorroNeto / finalIngresos) * 100) : 0;
        }

        estadoTexto = '🔒 Mes Cerrado';
      } else if (esFuturo) {
        // 2. Mes futuro proyectado con sueldos recurrentes, gastos fijos y cuotas de TC programadas
        esProyectado = true;
        estadoTexto = '🔮 Proyectado';

        let ingresosFuturos = sumaIngresosFijosMes;
        let gastosDirectosFuturos = sumaGastosFijosMes;
        let cuotasTCFuturas = 0;
        let prepagosTCFuturos = 0;

        transacciones.forEach(tx => {
          if (tx.esFijoProyectado) return; // Evitar duplicar fijos virtuales ya sumados arriba
          const monto = parseFloat(tx.monto) || 0;
          const txMesEf = normalizarMes(tx.mesImpactoEfectivo);
          const txMesTC = normalizarMes(tx.mesImpactoTC);

          // Si hay una transacción real programada en ese mes futuro
          if (txMesEf === mesKey) {
            if (tx.tipo === TIPOS_TRANSACCION.INGRESO) ingresosFuturos += monto;
            else if (tx.tipo === TIPOS_TRANSACCION.GASTO_DIRECTO) gastosDirectosFuturos += monto;
          }

          if (txMesTC === mesKey) {
            if (tx.tipo === TIPOS_TRANSACCION.CONSUMO_TC) cuotasTCFuturas += monto;
            else if (tx.tipo === TIPOS_TRANSACCION.PREPAGO_TC) prepagosTCFuturos += monto;
          }
        });

        const deudaTCFacturada = Math.max(0, cuotasTCFuturas - prepagosTCFuturos);
        finalSalidas = Number((gastosDirectosFuturos + deudaTCFacturada).toFixed(2));
        finalIngresos = Number(ingresosFuturos.toFixed(2));
        ahorroNeto = Number((finalIngresos - finalSalidas).toFixed(2));
        tasaAhorro = finalIngresos > 0 ? Math.round((ahorroNeto / finalIngresos) * 100) : 0;
      } else {
        // 3. Mes abierto / mes en curso
        let ingresos = 0;
        let gastosDirectos = 0;
        let prepagos = 0;
        let pagosTC = 0;
        let consumosTCFacturados = 0;
        let prepagosTCFacturados = 0;

        let hasIngresoTx = false;
        let hasGastoTx = false;

        transacciones.forEach(tx => {
          const monto = parseFloat(tx.monto) || 0;
          const txMesEf = normalizarMes(tx.mesImpactoEfectivo);
          const txMesTC = normalizarMes(tx.mesImpactoTC);

          if (txMesEf === mesKey) {
            if (tx.tipo === TIPOS_TRANSACCION.INGRESO) { ingresos += monto; hasIngresoTx = true; }
            else if (tx.tipo === TIPOS_TRANSACCION.GASTO_DIRECTO) { gastosDirectos += monto; hasGastoTx = true; }
            else if (tx.tipo === TIPOS_TRANSACCION.PREPAGO_TC) prepagos += monto;
            else if (tx.tipo === TIPOS_TRANSACCION.PAGO_TC_VENCIDA) pagosTC += monto;
          }

          if (txMesTC === mesKey) {
            if (tx.tipo === TIPOS_TRANSACCION.CONSUMO_TC) consumosTCFacturados += monto;
            else if (tx.tipo === TIPOS_TRANSACCION.PREPAGO_TC) prepagosTCFacturados += monto;
          }
        });

        // Si no hubo transacciones explícitas cargadas para ingresos o gastos, aplicar los fijos recurrentes de este mes
        if (!hasIngresoTx && sumaIngresosFijosMes > 0) ingresos += sumaIngresosFijosMes;
        if (!hasGastoTx && sumaGastosFijosMes > 0) gastosDirectos += sumaGastosFijosMes;

        const deudaFacturadaMes = Math.max(0, consumosTCFacturados - prepagosTCFacturados);
        const salidaTCMes = Math.max(deudaFacturadaMes, pagosTC);
        finalSalidas = Number((gastosDirectos + prepagos + salidaTCMes).toFixed(2));
        finalIngresos = Number(ingresos.toFixed(2));
        ahorroNeto = Number((finalIngresos - finalSalidas).toFixed(2));
        tasaAhorro = finalIngresos > 0 ? Math.round((ahorroNeto / finalIngresos) * 100) : 0;

        estadoTexto = esMesEnCurso ? '🟢 Mes en Curso' : 'Mes Pasado';
      }

      return {
        mes: mesKey,
        ingresos: finalIngresos,
        salidas: finalSalidas,
        ahorroNeto: ahorroNeto,
        tasaAhorro: tasaAhorro,
        esCerrado: esCerrado && !esFuturo,
        esCierreOficial: !!cierreOficial,
        esProyectado: esProyectado,
        cierreOficial: cierreOficial || null,
        estadoTexto: estadoTexto
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
    let totalAhorroReal = 0;
    let totalAhorroProyectado = 0;
    let mesesCerradosCount = 0;
    let mesesProyectadosCount = 0;

    mesesAnio.forEach(m => {
      totalIngresos += m.ingresos;
      totalSalidas += m.salidas;
      totalAhorro += m.ahorroNeto;
      if (m.esCerrado) {
        mesesCerradosCount++;
        totalAhorroReal += m.ahorroNeto;
      } else if (m.esProyectado) {
        mesesProyectadosCount++;
        totalAhorroProyectado += m.ahorroNeto;
      } else {
        totalAhorroReal += m.ahorroNeto;
      }
    });

    const tasaAhorroPromedio = totalIngresos > 0 ? Math.round((totalAhorro / totalIngresos) * 100) : 0;

    return {
      anio: anio,
      totalIngresos: Number(totalIngresos.toFixed(2)),
      totalSalidas: Number(totalSalidas.toFixed(2)),
      totalAhorro: Number(totalAhorro.toFixed(2)),
      totalAhorroReal: Number(totalAhorroReal.toFixed(2)),
      totalAhorroProyectado: Number(totalAhorroProyectado.toFixed(2)),
      tasaAhorroPromedio: tasaAhorroPromedio,
      mesesCerradosCount: mesesCerradosCount,
      mesesProyectadosCount: mesesProyectadosCount,
      mesesRegistradosCount: mesesAnio.length,
      meses: mesesAnio
    };
  }

  /**
   * Obtiene la lista de movimientos fijos aplicables a un mes específico.
   * Si existen fijos configurados explícitamente con r.mes === mesActualStr, devuelve esos.
   * Si no, busca la configuración del mes previo más cercano o fijos base/legacy.
   */
  function getRecurrentesParaMes(recurrentesConfig = [], mesActualStr = null) {
    if (!mesActualStr) {
      mesActualStr = obtenerMesImpacto(new Date());
    } else {
      mesActualStr = normalizarMes(mesActualStr);
    }

    const items = (recurrentesConfig || []).filter(r => r && (r.id || r.nombre));
    if (items.length === 0) return [];

    // 1. Si hay fijos guardados explícitamente para este mes exacto
    const delMes = items.filter(r => r.mes && normalizarMes(r.mes) === mesActualStr);
    if (delMes.length > 0) {
      return delMes.map(r => ({ ...r, mes: mesActualStr }));
    }

    // 2. Si no hay para este mes específico, buscar el mes previo más cercano con fijos
    const mesesConFijos = Array.from(new Set(
      items.filter(r => r.mes).map(r => normalizarMes(r.mes))
    )).sort();

    const mesesAnteriores = mesesConFijos.filter(m => m < mesActualStr);
    if (mesesAnteriores.length > 0) {
      const ultimoMesPrevio = mesesAnteriores[mesesAnteriores.length - 1];
      return items
        .filter(r => normalizarMes(r.mes) === ultimoMesPrevio)
        .map(r => ({ ...r, mes: mesActualStr }));
    }

    // 3. Fallback a fijos sin mes (plantilla base/legacy)
    const sinMes = items.filter(r => !r.mes);
    if (sinMes.length > 0) {
      return sinMes.map(r => ({ ...r, mes: mesActualStr }));
    }

    // 4. Si solo hay meses posteriores, tomar el primero
    if (mesesConFijos.length > 0) {
      return items
        .filter(r => normalizarMes(r.mes) === mesesConFijos[0])
        .map(r => ({ ...r, mes: mesActualStr }));
    }

    return [];
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

    const recurrentesDelMes = getRecurrentesParaMes(recurrentesConfig, mesActualStr);

    recurrentesDelMes.forEach(rec => {
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
        const notas = String(t.notas || '').toLowerCase();
        const nomLower = recNom.toLowerCase();
        if (notas.includes(`[fijo: ${recId.toLowerCase()}]`)) return true;
        if (nomLower && (notas.includes(`[fijo: ${nomLower}]`) || notas.startsWith(`[fijo] ${nomLower}`) || notas === `[fijo] ${nomLower}`)) return true;

        // Coincidencia exacta por tipo, categoría y monto idéntico (protege sueldos y evita duplicidad sin sustituir montos diferentes)
        const tipoMatch = (rec.tipo === 'Ingreso_Fijo' && t.tipo === TIPOS_TRANSACCION.INGRESO) ||
                          (rec.tipo !== 'Ingreso_Fijo' && t.tipo === TIPOS_TRANSACCION.GASTO_DIRECTO);
        if (tipoMatch) {
          const catTx = normalizarCategoria(t.categoria, t.tipo);
          const catRec = normalizarCategoria(rec.categoria, t.tipo);
          if (catTx && catRec && catTx === catRec) {
            const mTx = parseFloat(t.monto) || 0;
            const mRec = parseFloat(rec.monto) || 0;
            if (mRec > 0 && Math.abs(mTx - mRec) < 0.01) return true;
          }
        }
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
    const mesAnteriorStr = sumarMeses(mesActualStr, -1);

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
        // Las tarjetas de crédito SOLO suman transacciones reales del Drive (nunca fijos proyectados)
        if (tx.esFijoProyectado) return;

        if (tx.estado === 'LIQUIDADO' || tx.estado === 'LIQUIDADA' || tx.esLiquidado === true) {
          return;
        }

        if (tarjetaCoincide(tx.tarjetaAfectada, tarjeta)) {
          const monto = parseFloat(tx.monto) || 0;
          let txMesTC = normalizarMes(tx.mesImpactoTC);
          if (!txMesTC && tx.fecha) {
            if (tx.tipo === TIPOS_TRANSACCION.PREPAGO_TC) {
              txMesTC = sumarMeses(obtenerMesImpacto(tx.fecha), 1);
            } else {
              const ciclo = calcularCicloTarjeta(tx.fecha, tarjeta.diaCorte, tarjeta.diaVencimiento);
              txMesTC = ciclo.mesImpactoTC;
            }
          }
          const txMesEf = normalizarMes(tx.mesImpactoEfectivo);

          if (tx.tipo === TIPOS_TRANSACCION.CONSUMO_TC && txMesTC === mesActualStr) {
            consumos += monto;
          }
          if (tx.tipo === TIPOS_TRANSACCION.PREPAGO_TC && (txMesTC === mesActualStr || (txMesEf === mesAnteriorStr && !tx.mesImpactoTC))) {
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
      let txMesEfectivo = normalizarMes(tx.mesImpactoEfectivo);
      let txMesFecha = normalizarMes(tx.fecha);
      let txMesTC = normalizarMes(tx.mesImpactoTC);
      if (!txMesEfectivo && txMesFecha) txMesEfectivo = txMesFecha;
      if (!txMesFecha && txMesEfectivo) txMesFecha = txMesEfectivo;
      const esFijo = tx.esFijoProyectado || tx.recurrenteId || (tx.notas && String(tx.notas).includes('[Fijo'));
      const tipoNorm = normalizarTipo(tx.tipo, tx.metodoPago, tx.tarjetaAfectada);

      if (txMesEfectivo === mesActualStr) {
        if (tipoNorm === TIPOS_TRANSACCION.INGRESO) {
          totalIngresos += monto;
          if (esFijo) totalIngresosFijos += monto;
          else totalIngresosVariables += monto;

          const cat = normalizarCategoria(tx.categoria, TIPOS_TRANSACCION.INGRESO);
          ingresosPorCategoria[cat] = (ingresosPorCategoria[cat] || 0) + monto;
        } else if (tipoNorm === TIPOS_TRANSACCION.GASTO_DIRECTO) {
          totalGastosDirectos += monto;
          if (esFijo) totalGastosFijos += monto;
          else totalGastosVariables += monto;

          const cat = normalizarCategoria(tx.categoria, TIPOS_TRANSACCION.GASTO_DIRECTO);
          gastosPorCategoria[cat] = (gastosPorCategoria[cat] || 0) + monto;
        } else if (tipoNorm === TIPOS_TRANSACCION.PREPAGO_TC) {
          totalPrepagosRealizados += monto;
        }
      }

      // En la gráfica de gastos por categoría, incluir los consumos con tarjeta realizados en este mes en sus categorías reales
      if (tipoNorm === TIPOS_TRANSACCION.CONSUMO_TC && txMesFecha === mesActualStr && tx.estado !== 'LIQUIDADO' && tx.estado !== 'LIQUIDADA' && !tx.esLiquidado) {
        const cat = normalizarCategoria(tx.categoria, TIPOS_TRANSACCION.CONSUMO_TC);
        gastosPorCategoria[cat] = (gastosPorCategoria[cat] || 0) + monto;
      }
    });

    // Asegurar formato de dos decimales para cada categoría real
    Object.keys(gastosPorCategoria).forEach(k => {
      gastosPorCategoria[k] = Number(gastosPorCategoria[k].toFixed(2));
    });

    // Total salidas considera gastos directos, prepagos realizados en efectivo y la obligación facturada de TC
    const totalSalidasEfectivo = totalGastosDirectos + totalPrepagosRealizados + salidaEfectivaTCDelMes;
    const balanceLibreNeto = totalIngresos - totalSalidasEfectivo;

    // 3. Proyección de Deuda de Tarjetas para el Mes Siguiente y Cuotas Futuras (Ocupación de Línea)
    const estadoTarjetas = tarjetasConfig.map(tarjeta => {
      let consumosCiclo = 0;
      let prepagosCiclo = 0;
      let pagosVencidosRegistrados = 0;
      let cuotasFuturasComprometidas = 0;
      let prepagosFuturos = 0;

      const cardId = String(tarjeta.id || '').trim().toLowerCase();
      const cardName = String(tarjeta.nombre || '').trim().toLowerCase();

      transaccionesConsolidadas.forEach(tx => {
        // Las tarjetas de crédito SOLO suman transacciones reales del Drive (nunca fijos proyectados)
        if (tx.esFijoProyectado) return;

        if (tx.estado === 'LIQUIDADO' || tx.estado === 'LIQUIDADA' || tx.esLiquidado === true) {
          return;
        }

        if (tarjetaCoincide(tx.tarjetaAfectada, tarjeta)) {
          const monto = parseFloat(tx.monto) || 0;
          let txMesTC = normalizarMes(tx.mesImpactoTC);
          if (!txMesTC && tx.fecha) {
            if (tx.tipo === TIPOS_TRANSACCION.PREPAGO_TC) {
              txMesTC = sumarMeses(obtenerMesImpacto(tx.fecha), 1);
            } else {
              const ciclo = calcularCicloTarjeta(tx.fecha, tarjeta.diaCorte, tarjeta.diaVencimiento);
              txMesTC = ciclo.mesImpactoTC;
            }
          }
          const txMesEf = normalizarMes(tx.mesImpactoEfectivo);

          // 1. Vencimientos del próximo mes
          if (tx.tipo === TIPOS_TRANSACCION.CONSUMO_TC && txMesTC === mesSiguienteStr) {
            consumosCiclo += monto;
          }
          if (tx.tipo === TIPOS_TRANSACCION.PREPAGO_TC && (txMesTC === mesSiguienteStr || (txMesEf === mesActualStr && !tx.mesImpactoTC))) {
            prepagosCiclo += monto;
          }
          if (tx.tipo === TIPOS_TRANSACCION.PAGO_TC_VENCIDA && txMesTC === mesSiguienteStr) {
            pagosVencidosRegistrados += monto;
          }

          // 2. Cuotas futuras comprometidas (posteriores al mes siguiente: mes > mesSiguienteStr)
          if (tx.tipo === TIPOS_TRANSACCION.CONSUMO_TC && txMesTC > mesSiguienteStr) {
            cuotasFuturasComprometidas += monto;
          }
          if (tx.tipo === TIPOS_TRANSACCION.PREPAGO_TC && txMesTC > mesSiguienteStr && txMesEf !== mesActualStr) {
            prepagosFuturos += monto;
          }
        }
      });

      const deudaBruta = consumosCiclo;
      const deudaNeta = Math.max(0, deudaBruta - prepagosCiclo - pagosVencidosRegistrados);
      const cuotasFuturasNetas = Math.max(0, cuotasFuturasComprometidas - prepagosFuturos);

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

      // Cálculo de Línea de Crédito Utilizada y Disponible
      const limiteCredito = tarjeta.limiteCredito || 0;
      const pendienteMesActual = facturaMesActual.pendiente;
      const deudaTotalTarjeta = Number((pendienteMesActual + deudaNeta + cuotasFuturasNetas).toFixed(2));
      const lineaUtilizada = deudaTotalTarjeta;
      const lineaDisponible = Number(Math.max(0, limiteCredito - deudaTotalTarjeta).toFixed(2));
      const porcentajeLineaUtilizada = limiteCredito > 0 ? Math.min(100, Math.round((deudaTotalTarjeta / limiteCredito) * 100)) : 0;

      return {
        id: tarjeta.id,
        nombre: tarjeta.nombre,
        colorHex: tarjeta.colorHex || '#3b82f6',
        limiteCredito: limiteCredito,
        lineaUtilizada: lineaUtilizada,
        lineaDisponible: lineaDisponible,
        porcentajeLineaUtilizada: porcentajeLineaUtilizada,
        cuotasFuturasComprometidas: Number(cuotasFuturasNetas.toFixed(2)),
        desgloseLinea: {
          pendienteMesActual: Number(pendienteMesActual.toFixed(2)),
          proximoMes: Number(deudaNeta.toFixed(2)),
          cuotasFuturas: Number(cuotasFuturasNetas.toFixed(2)),
          totalComprometido: deudaTotalTarjeta
        },
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
    const totalCuotasFuturas = estadoTarjetas.reduce((acc, t) => acc + t.cuotasFuturasComprometidas, 0);
    const totalLineaCredito = estadoTarjetas.reduce((acc, t) => acc + t.limiteCredito, 0);
    const totalLineaUtilizada = estadoTarjetas.reduce((acc, t) => acc + t.lineaUtilizada, 0);
    const totalLineaDisponible = estadoTarjetas.reduce((acc, t) => acc + t.lineaDisponible, 0);

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
        totalCuotasFuturas: Number(totalCuotasFuturas.toFixed(2)),
        totalLineaCredito: Number(totalLineaCredito.toFixed(2)),
        totalLineaUtilizada: Number(totalLineaUtilizada.toFixed(2)),
        totalLineaDisponible: Number(totalLineaDisponible.toFixed(2)),
        desgloseTarjetas: estadoTarjetas
      },
      categorias: {
        gastos: gastosPorCategoria,
        ingresos: ingresosPorCategoria
      },
      presupuestos: calcularEstadoPresupuestos(gastosPorCategoria, presupuestosConfig),
      recurrentesEstadoMes: recurrentesEstadoMes,
      historicoAhorro: calcularHistoricoAhorro(transaccionesConsolidadas, mesActualStr, closedMonths, recurrentesConfig),
      transaccionesConsolidadas: transaccionesConsolidadas
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

      // Alerta de Alto Uso de Línea (considera deuda actual + próximo mes + cuotas futuras)
      if (tarjeta.limiteCredito > 0) {
        const usoPorcentaje = (tarjeta.porcentajeLineaUtilizada !== undefined) 
          ? tarjeta.porcentajeLineaUtilizada 
          : Math.round((tarjeta.consumosCiclo / tarjeta.limiteCredito) * 100);
        if (usoPorcentaje >= 70) {
          const cuotasMsg = (tarjeta.cuotasFuturasComprometidas > 0)
            ? ` (incluye S/ ${tarjeta.cuotasFuturasComprometidas.toFixed(2)} en cuotas futuras)`
            : '';
          alertas.push({
            id: `limite-${tarjeta.id}`,
            tipo: 'warning',
            titulo: `Uso Alto de Línea (${usoPorcentaje}%) en ${tarjeta.nombre}`,
            mensaje: `Has ocupado S/ ${tarjeta.lineaUtilizada.toFixed(2)} de tu límite de S/ ${tarjeta.limiteCredito.toFixed(2)}${cuotasMsg}. Disponible: S/ ${tarjeta.lineaDisponible.toFixed(2)}.`,
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

  /**
   * Obtiene el desglose detallado de todos los movimientos (directos, consumos TC y fijos)
   * que contribuyen al gasto de una categoría específica en un mes determinado.
   *
   * @param {Array} transaccionesConsolidadas - Transacciones consolidadas del mes (incluye fijos generados)
   * @param {string} categoria - Nombre de la categoría (ej. 'Supermercado', 'Servicios')
   * @param {string} mesActualStr - Mes en formato 'YYYY-MM'
   * @returns {Object} { categoria, mes, totalGastado, movimientosCount, movimientos: Array }
   */
  function obtenerDetalleGastosPorCategoria(transaccionesConsolidadas = [], categoria = '', mesActualStr = null, mostrarTodosLosMeses = false) {
    if (!mesActualStr) {
      mesActualStr = obtenerMesImpacto(new Date());
    } else {
      mesActualStr = normalizarMes(mesActualStr);
    }

    const catBuscada = normalizarCategoria(categoria, TIPOS_TRANSACCION.GASTO_DIRECTO);
    const movimientos = [];
    const todosMovimientos = [];
    let totalGastado = 0;
    let totalGastadoHistorico = 0;

    (transaccionesConsolidadas || []).forEach(tx => {
      if (!tx) return;
      if (tx.estado === 'LIQUIDADO' || tx.estado === 'LIQUIDADA' || tx.esLiquidado === true) {
        return;
      }

      const monto = parseFloat(tx.monto) || 0;
      let txMesEfectivo = normalizarMes(tx.mesImpactoEfectivo);
      let txMesFecha = normalizarMes(tx.fecha);
      let txMesTC = normalizarMes(tx.mesImpactoTC);

      if (!txMesEfectivo && txMesFecha) txMesEfectivo = txMesFecha;
      if (!txMesFecha && txMesEfectivo) txMesFecha = txMesEfectivo;

      const esFijo = !!(tx.esFijoProyectado || tx.recurrenteId || (tx.notas && String(tx.notas).includes('[Fijo')));
      const tipoNorm = normalizarTipo(tx.tipo, tx.metodoPago, tx.tarjetaAfectada);

      // Verificación robusta e insensible a mayúsculas/acentos
      const coincideCategoria = sonCategoriasEquivalentes(tx.categoria, categoria) || 
                                sonCategoriasEquivalentes(tx.categoria, catBuscada);

      if (!coincideCategoria) return;

      // 1. Gastos Directos
      if (tipoNorm === TIPOS_TRANSACCION.GASTO_DIRECTO) {
        const itemGasto = {
          id: tx.id || `tx-dir-${todosMovimientos.length}`,
          fecha: tx.fecha || '',
          mes: txMesEfectivo || txMesFecha || '',
          concepto: tx.notas || tx.nombre || tx.categoria || catBuscada,
          tipo: esFijo ? 'Gasto_Fijo' : 'Gasto_Directo',
          tipoLabel: esFijo ? 'Gasto Fijo' : 'Gasto Directo',
          icono: esFijo ? '⚙️' : '📉',
          origen: tx.metodoPago || 'Efectivo',
          monto: Number(monto.toFixed(2)),
          esFijo: esFijo
        };

        totalGastadoHistorico += monto;
        todosMovimientos.push(itemGasto);

        if (txMesEfectivo === mesActualStr) {
          totalGastado += monto;
          movimientos.push(itemGasto);
        }
      }

      // 2. Consumos con Tarjeta de Crédito realizados/vencidos en este mes
      if (tipoNorm === TIPOS_TRANSACCION.CONSUMO_TC) {
        const cuotaStr = (tx.cuotaActual && tx.totalCuotas)
          ? `Cuota ${tx.cuotaActual}/${tx.totalCuotas}`
          : (tx.numeroCuota && tx.totalCuotas ? `Cuota ${tx.numeroCuota}/${tx.totalCuotas}` : null);

        const itemTC = {
          id: tx.id || `tx-tc-${todosMovimientos.length}`,
          fecha: tx.fecha || '',
          mes: txMesTC || txMesFecha || txMesEfectivo || '',
          concepto: tx.notas || tx.nombre || tx.categoria || catBuscada,
          tipo: 'Consumo_TC',
          tipoLabel: 'Tarjeta de Crédito',
          icono: '💳',
          origen: tx.tarjetaAfectada || tx.metodoPago || 'Tarjeta de Crédito',
          monto: Number(monto.toFixed(2)),
          cuotaInfo: cuotaStr
        };

        totalGastadoHistorico += monto;
        todosMovimientos.push(itemTC);

        if (txMesFecha === mesActualStr) {
          totalGastado += monto;
          movimientos.push(itemTC);
        }
      }
    });

    // Ordenar movimientos por fecha descendente
    movimientos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    todosMovimientos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    const itemsFinales = mostrarTodosLosMeses ? todosMovimientos : movimientos;

    return {
      categoria: catBuscada,
      mes: mesActualStr,
      totalGastado: Number((mostrarTodosLosMeses ? totalGastadoHistorico : totalGastado).toFixed(2)),
      totalGastadoMes: Number(totalGastado.toFixed(2)),
      totalGastadoHistorico: Number(totalGastadoHistorico.toFixed(2)),
      movimientosCount: itemsFinales.length,
      movimientosMesCount: movimientos.length,
      movimientosHistoricoCount: todosMovimientos.length,
      movimientos: itemsFinales,
      movimientosMes: movimientos,
      movimientosHistorico: todosMovimientos
    };
  }

  // Exportar para Node.js y Navegador
  const FinancialEngine = {
    TIPOS_TRANSACCION,
    CATEGORIAS_GASTO,
    CATEGORIAS_INGRESO,
    normalizarTipo,
    normalizarCategoria,
    sonCategoriasEquivalentes,
    combinarTransaccionesConRecurrentes,
    getRecurrentesParaMes,
    calcularCicloTarjeta,
    normalizarMes,
    obtenerMesImpacto,
    sumarMeses,
    sumarMesesAFecha,
    tarjetaCoincide,
    dividirEnCuotas,
    obtenerComprasEnCuotasPendientes,
    obtenerDetalleGastosPorCategoria,
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
