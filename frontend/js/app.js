/**
 * app.js
 * Controlador Principal de la Aplicación PWA
 * Inicialización, Gestión del Estado y Coordinación de Módulos
 */

(function () {
  'use strict';

  // Estado global de la aplicación
  const AppState = {
    selectedMonth: FinancialEngine.obtenerMesImpacto(new Date()),
    cards: [],
    transactions: [],
    budgets: [],
    recurrentes: [],
    closedMonths: [],
    currentFilter: 'ALL',
    deferredPrompt: null
  };

  // Inicialización al cargar el DOM
  document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Iniciando PWA Financiera con Ciclos y Prepagos...');

    // 1. Inicializar UI y Service Worker
    UIManager.init();
    registerServiceWorker();
    setupPwaInstallPrompt();

    // 2. Conectar eventos de la barra superior y modales
    setupTopBarEvents();
    setupCloseMonthActions();
    setupSettingsModal();
    setupBudgetsModal();
    setupRecurrentesActions();
    setupLiquidarCuotasActions();
    setupSaveTransactionAction();
    setupFilterPills();

    // 3. Cargar datos iniciales
    await loadAppData();
  });

  /**
   * Registro del Service Worker para funcionamiento PWA offline
   */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => console.log('[PWA] Service Worker registrado con éxito:', reg.scope))
          .catch((err) => console.warn('[PWA] Error al registrar Service Worker:', err));
      });
    }
  }

  /**
   * Manejo de evento de instalación de PWA en la pantalla de inicio
   */
  function setupPwaInstallPrompt() {
    const installBtn = document.getElementById('btn-install-pwa');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      AppState.deferredPrompt = e;
      if (installBtn) installBtn.classList.remove('hidden');
    });

    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!AppState.deferredPrompt) return;
        AppState.deferredPrompt.prompt();
        const { outcome } = await AppState.deferredPrompt.userChoice;
        console.log(`[PWA] Respuesta a instalación: ${outcome}`);
        AppState.deferredPrompt = null;
        installBtn.classList.add('hidden');
      });
    }

    window.addEventListener('appinstalled', () => {
      console.log('[PWA] Aplicación instalada en pantalla de inicio');
      if (installBtn) installBtn.classList.add('hidden');
    });
  }

  /**
   * Configuración de la barra superior y selector de mes
   */
  function setupTopBarEvents() {
    const currentMonthLabel = document.getElementById('current-month-display');
    const prevMonthBtn = document.getElementById('btn-prev-month');
    const nextMonthBtn = document.getElementById('btn-next-month');
    const syncStatusBadge = document.getElementById('sync-status-badge');

    updateMonthLabel();

    if (prevMonthBtn) {
      prevMonthBtn.addEventListener('click', () => {
        AppState.selectedMonth = FinancialEngine.sumarMeses(AppState.selectedMonth, -1);
        updateMonthLabel();
        recalculateAndRender();
      });
    }

    if (syncStatusBadge) {
      syncStatusBadge.style.cursor = 'pointer';
      syncStatusBadge.title = 'Haz clic para refrescar datos desde Google Sheets';
      syncStatusBadge.addEventListener('click', async () => {
        syncStatusBadge.textContent = 'Actualizando...';
        await loadAppData();
        UIManager.showToast('Datos sincronizados con Google Sheets', 'info');
      });
    }

    if (nextMonthBtn) {
      nextMonthBtn.addEventListener('click', () => {
        AppState.selectedMonth = FinancialEngine.sumarMeses(AppState.selectedMonth, 1);
        updateMonthLabel();
        recalculateAndRender();
      });
    }

    // Callbacks globales de sincronización
    window.onSyncSuccess = (count) => {
      UIManager.showToast(`Sincronizados ${count} movimientos con Google Sheets`, 'success');
      loadAppData();
    };

    window.onDeleteTransaction = async (id) => {
      const tx = AppState.transactions.find(t => t.id === id);
      const currentMonth = FinancialEngine.obtenerMesImpacto(new Date());
      const txMes = tx ? FinancialEngine.normalizarMes(tx.fecha) : null;
      const isClosed = AppState.closedMonths.some(m => FinancialEngine.normalizarMes(m.mes) === txMes);
      if (tx && (txMes < currentMonth || isClosed)) {
        UIManager.showToast('No se pueden eliminar transacciones de meses pasados o cerrados en la app. Realiza la edición en Google Sheets.', 'warning');
        return;
      }
      await ApiService.deleteTransaction(id);
      AppState.transactions = AppState.transactions.filter(t => t.id !== id);
      recalculateAndRender();
      UIManager.showToast('Movimiento eliminado', 'warning');
    };
  }

  function updateMonthLabel() {
    const currentMonthLabel = document.getElementById('current-month-display');
    if (!currentMonthLabel) return;

    const [anio, mesNum] = AppState.selectedMonth.split('-').map(Number);
    const nombresMeses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    currentMonthLabel.textContent = `${nombresMeses[mesNum - 1]} ${anio}`;
  }

  /**
   * Filtros de transacciones recientes
   */
  function setupFilterPills() {
    const pills = document.querySelectorAll('.tx-filter-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.className = 'tx-filter-pill px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700/50 cursor-pointer');
        pill.className = 'tx-filter-pill px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/40 cursor-pointer';

        AppState.currentFilter = pill.getAttribute('data-filter');
        UIManager.renderTransactionsList(AppState.transactions, AppState.currentFilter);
      });
    });
  }

  /**
   * Carga de datos desde Google Sheets o LocalStorage
   */
  async function loadAppData() {
    const syncBadge = document.getElementById('sync-status-badge');
    if (syncBadge) {
      syncBadge.textContent = 'Sincronizando...';
      syncBadge.className = 'text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30';
    }

    const { cards, transactions, budgets, recurrentes, closedMonths, source } = await ApiService.fetchAllData();
    AppState.cards = cards;
    AppState.transactions = transactions;
    AppState.budgets = budgets || ApiService.getLocalBudgets();
    AppState.recurrentes = recurrentes || ApiService.getLocalRecurrentes();
    AppState.closedMonths = closedMonths || ApiService.getLocalClosedMonths() || [];
    window.cachedCards = cards;
    window.cachedTransactions = transactions;
    window.cachedBudgets = AppState.budgets;
    window.cachedRecurrentes = AppState.recurrentes;

    // Actualizar campos dinámicos de la UI con las tarjetas cargadas
    UIManager.renderDynamicFormFields(cards);
    UIManager.renderRecurrentesList(AppState.recurrentes);

    if (syncBadge) {
      if (source === 'remote') {
        syncBadge.textContent = '● Sheets Conectado';
        syncBadge.className = 'text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
      } else {
        syncBadge.textContent = '○ Modo Local / Offline';
        syncBadge.className = 'text-[11px] px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400 border border-slate-600';
      }
    }

    recalculateAndRender();

    // Si está conectado a Sheets y la hoja CONSOLIDADO_MENSUAL está vacía, auto-consolidar meses pasados
    if (source === 'remote' && (!closedMonths || closedMonths.length === 0)) {
      ApiService.consolidatePastMonths().then(res => {
        if (res && res.count > 0) {
          ApiService.fetchClosedMonths().then(cm => {
            if (cm && cm.length > 0) {
              AppState.closedMonths = cm;
              recalculateAndRender();
            }
          });
        }
      }).catch(e => console.warn('[AutoConsolidate] Error silencioso:', e));
    }
  }

  // Exponer globalmente para botones de recarga/refresco interactivo
  window.loadAppData = loadAppData;
  window.refreshAllData = async () => {
    await loadAppData();
    const modalDetalle = document.getElementById('modal-detalle-categoria');
    if (modalDetalle && !modalDetalle.classList.contains('hidden') && window.UIManager && window.UIManager.currentDetalleCategoria) {
      window.UIManager.openDetalleCategoriaModal(window.UIManager.currentDetalleCategoria, window.UIManager.currentDetallePeriodo || 'ACTUAL');
    }
  };

  /**
   * Recalcula el modelo financiero y actualiza todos los componentes de la vista
   */
  function recalculateAndRender() {
    const summary = FinancialEngine.calcularConsolidadoFinanciero(
      AppState.transactions,
      AppState.cards,
      AppState.selectedMonth,
      AppState.budgets,
      AppState.recurrentes,
      AppState.closedMonths
    );

    window.cachedTransactions = AppState.transactions;
    window.cachedCards = AppState.cards;
    window.AppState = AppState;
    window.cachedRecurrentesEstadoMes = summary.recurrentesEstadoMes;
    window.lastSummary = summary;

    // Mostrar banner de solo lectura si el mes seleccionado es pasado o está cerrado
    const currentMonth = FinancialEngine.obtenerMesImpacto(new Date());
    const isPastOrClosed = (AppState.selectedMonth < currentMonth) || AppState.closedMonths.some(m => FinancialEngine.normalizarMes(m.mes) === AppState.selectedMonth);
    const closedBanner = document.getElementById('closed-month-banner');
    if (closedBanner) {
      if (isPastOrClosed) {
        closedBanner.classList.remove('hidden');
      } else {
        closedBanner.classList.add('hidden');
      }
    }

    UIManager.renderDashboard(summary);
    UIManager.renderTransactionsList(AppState.transactions, AppState.currentFilter);
    UIManager.renderRecurrentesList(AppState.recurrentes, AppState.selectedMonth, summary.recurrentesEstadoMes);
    UIManager.renderHistoricalSavings(summary.historicoAhorro, window.currentSavingsYear);
  }

  /**
   * Configuración de Cierre Contable de Meses e Historial
   */
  function setupCloseMonthActions() {
    const btnToggleClose = document.getElementById('btn-toggle-close-month');
    const btnConfirmClose = document.getElementById('btn-confirm-close-month');

    if (btnToggleClose) {
      btnToggleClose.addEventListener('click', async () => {
        const isClosed = AppState.closedMonths.some(m => m.mes === AppState.selectedMonth);
        if (isClosed) {
          if (confirm(`¿Deseas reabrir el periodo ${AppState.selectedMonth}?`)) {
            await handleReopenMonth(AppState.selectedMonth);
          }
        } else {
          const summary = FinancialEngine.calcularConsolidadoFinanciero(
            AppState.transactions,
            AppState.cards,
            AppState.selectedMonth,
            AppState.budgets,
            AppState.recurrentes,
            AppState.closedMonths
          );
          UIManager.openCloseMonthModal(summary);
        }
      });
    }

    if (btnConfirmClose) {
      btnConfirmClose.addEventListener('click', async () => {
        const summary = FinancialEngine.calcularConsolidadoFinanciero(
          AppState.transactions,
          AppState.cards,
          AppState.selectedMonth,
          AppState.budgets,
          AppState.recurrentes,
          AppState.closedMonths
        );
        const { flujoEfectivo, mesActual } = summary;
        const notesInput = document.getElementById('close-modal-notes');
        const notes = notesInput ? notesInput.value.trim() : '';

        const tcComprometido = flujoEfectivo.facturacionTC ? flujoEfectivo.facturacionTC.salidaEfectiva : flujoEfectivo.pagosTCVencidas;
        const monthData = {
          mes: mesActual,
          ingresosTotales: flujoEfectivo.ingresos,
          gastosDirectos: flujoEfectivo.gastosDirectos,
          prepagosTC: flujoEfectivo.prepagosRealizados,
          pagosTC: tcComprometido,
          flujoLibreNeto: flujoEfectivo.balanceLibreNeto,
          ahorroNeto: flujoEfectivo.balanceLibreNeto,
          tasaAhorro: flujoEfectivo.ingresos > 0 ? Math.round((flujoEfectivo.balanceLibreNeto / flujoEfectivo.ingresos) * 100) : 0,
          notas: notes,
          fechaCierre: new Date().toISOString()
        };

        btnConfirmClose.disabled = true;
        btnConfirmClose.textContent = 'Guardando...';

        try {
          await ApiService.saveClosedMonth(monthData);
          const existingIdx = AppState.closedMonths.findIndex(m => m.mes === mesActual);
          if (existingIdx >= 0) {
            AppState.closedMonths[existingIdx] = monthData;
          } else {
            AppState.closedMonths.push(monthData);
          }

          UIManager.closeCloseMonthModal();
          UIManager.showToast(`Mes ${mesActual} cerrado formalmente`, 'success');
          recalculateAndRender();
        } catch (err) {
          console.error('Error al cerrar mes:', err);
          UIManager.showToast('Error al registrar cierre de mes', 'danger');
        } finally {
          btnConfirmClose.disabled = false;
          btnConfirmClose.innerHTML = '<span>🔒</span> Confirmar Cierre';
        }
      });
    }

    const btnConsolidatePast = document.getElementById('btn-consolidate-past-months');
    if (btnConsolidatePast) {
      btnConsolidatePast.addEventListener('click', async () => {
        try {
          btnConsolidatePast.disabled = true;
          btnConsolidatePast.innerHTML = '<span>⏳</span> Consolidando...';
          
          await ApiService.consolidatePastMonths();

          // Obtener los datos oficiales actualizados directamente de Sheets
          const remoteClosed = await ApiService.fetchClosedMonths();
          if (remoteClosed && remoteClosed.length > 0) {
            AppState.closedMonths = remoteClosed;
          } else if (window.lastSummary && window.lastSummary.historicoAhorro) {
            // Si estamos en modo offline, guardar el cálculo local
            const currentM = FinancialEngine.obtenerMesImpacto(new Date());
            const pastUnsaved = window.lastSummary.historicoAhorro.todos.filter(m => 
              m.mes < currentM && !m.esCierreOficial && !m.esProyectado
            );
            for (const m of pastUnsaved) {
              const monthData = {
                mes: m.mes,
                ingresosTotales: m.ingresos,
                gastosDirectos: m.salidas,
                prepagosTC: 0,
                pagosTC: 0,
                flujoLibreNeto: m.ahorroNeto,
                ahorroNeto: m.ahorroNeto,
                tasaAhorro: m.tasaAhorro,
                notas: 'Cierre consolidado de mes pasado',
                fechaCierre: new Date().toISOString()
              };
              await ApiService.saveClosedMonth(monthData);
              const idx = AppState.closedMonths.findIndex(cm => cm.mes === m.mes);
              if (idx >= 0) AppState.closedMonths[idx] = monthData;
              else AppState.closedMonths.push(monthData);
            }
          }

          await loadAppData();
          UIManager.showToast('🎉 Meses pasados consolidados en CONSOLIDADO_MENSUAL', 'success');
        } catch (e) {
          console.error('Error al consolidar meses pasados:', e);
          UIManager.showToast('Error al consolidar meses pasados', 'error');
        } finally {
          btnConsolidatePast.disabled = false;
          btnConsolidatePast.innerHTML = '<span>📊</span> <span class="hidden sm:inline">Consolidar en Sheet</span><span class="sm:hidden">Sheet</span>';
        }
      });
    }

    window.onTriggerCloseMonth = (mes) => {
      AppState.selectedMonth = mes;
      updateMonthLabel();
      const summary = FinancialEngine.calcularConsolidadoFinanciero(
        AppState.transactions,
        AppState.cards,
        AppState.selectedMonth,
        AppState.budgets,
        AppState.recurrentes,
        AppState.closedMonths
      );
      UIManager.openCloseMonthModal(summary);
    };

    window.onTriggerReopenMonth = async (mes) => {
      if (confirm(`¿Deseas reabrir el periodo ${mes}?`)) {
        await handleReopenMonth(mes);
      }
    };
  }

  async function handleReopenMonth(mes) {
    try {
      await ApiService.reopenMonth(mes);
      AppState.closedMonths = AppState.closedMonths.filter(m => m.mes !== mes);
      UIManager.showToast(`Mes ${mes} reabierto`, 'warning');
      recalculateAndRender();
    } catch (err) {
      console.error('Error al reabrir mes:', err);
      UIManager.showToast('Error al reabrir mes', 'danger');
    }
  }

  /**
   * Configuración del modal de Presupuestos por Categoría
   */
  function setupBudgetsModal() {
    const openBtn = document.getElementById('btn-open-budgets-modal');
    const closeBtn = document.getElementById('btn-close-budgets-modal');
    const cancelBtn = document.getElementById('btn-cancel-budgets');
    const saveBtn = document.getElementById('btn-save-budgets');

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        UIManager.openBudgetsModal(AppState.budgets);
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', () => UIManager.closeBudgetsModal());
    if (cancelBtn) cancelBtn.addEventListener('click', () => UIManager.closeBudgetsModal());

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const newBudgets = UIManager.getBudgetsFromModal();
        AppState.budgets = newBudgets;
        window.cachedBudgets = newBudgets;
        UIManager.closeBudgetsModal();
        UIManager.showToast('Presupuestos actualizados con éxito', 'success');
        recalculateAndRender();
        await ApiService.saveBudgets(newBudgets);
      });
    }
  }

  /**
   * Configuración de la gestión de Movimientos Fijos Recurrentes
   */
  function setupRecurrentesActions() {
    const btnAdd = document.getElementById('btn-add-recurrente');
    const btnCloseModal = document.getElementById('btn-close-recurrente-modal');
    const btnCancelModal = document.getElementById('btn-cancel-recurrente');
    const btnSaveModal = document.getElementById('btn-save-recurrente');
    const btnApplyMonth = document.getElementById('btn-apply-recurrentes-month');
    const btnSaveConfirmRec = document.getElementById('btn-save-confirm-rec');

    if (btnAdd) {
      btnAdd.addEventListener('click', () => {
        UIManager.openRecurrenteModal();
      });
    }

    if (btnCloseModal) btnCloseModal.addEventListener('click', () => UIManager.closeRecurrenteModal());
    if (btnCancelModal) btnCancelModal.addEventListener('click', () => UIManager.closeRecurrenteModal());

    if (btnSaveModal) {
      btnSaveModal.addEventListener('click', async () => {
        const item = UIManager.getRecurrenteFromModal();
        if (!item) return;

        const idx = AppState.recurrentes.findIndex(r => r.id === item.id);
        if (idx >= 0) {
          AppState.recurrentes[idx] = item;
        } else {
          AppState.recurrentes.push(item);
        }

        UIManager.closeRecurrenteModal();
        recalculateAndRender();
        UIManager.showToast(`Movimiento fijo "${item.nombre}" guardado`, 'success');
        await ApiService.saveRecurrente(item);
      });
    }

    // Toggle activo/inactivo
    window.onToggleRecurrente = async (id) => {
      const item = AppState.recurrentes.find(r => r.id === id);
      if (!item) return;
      item.activo = !item.activo;
      recalculateAndRender();
      await ApiService.saveRecurrente(item);
      UIManager.showToast(`"${item.nombre}" ${item.activo ? 'activado' : 'desactivado'}`, 'info');
    };

    // Eliminar recurrente
    window.onDeleteRecurrente = async (id) => {
      AppState.recurrentes = AppState.recurrentes.filter(r => r.id !== id);
      recalculateAndRender();
      await ApiService.deleteRecurrente(id);
      UIManager.showToast('Movimiento fijo eliminado', 'warning');
    };

    // Clic en Confirmar / Ajustar recibo específico del mes
    window.onConfirmRecurrenteClick = (id) => {
      const item = AppState.recurrentes.find(r => r.id === id);
      if (!item) return;
      const statusInfo = (window.cachedRecurrentesEstadoMes || []).find(e => String(e.id) === String(id));
      UIManager.openConfirmRecurrenteModal(item, AppState.selectedMonth, statusInfo);
    };

    // Guardar confirmación / ajuste mensual
    if (btnSaveConfirmRec) {
      btnSaveConfirmRec.addEventListener('click', async () => {
        const data = UIManager.getConfirmRecurrenteData();
        if (!data) return;

        const rec = AppState.recurrentes.find(r => r.id === data.recurrenteId);
        if (!rec) {
          UIManager.showToast('Movimiento fijo no encontrado', 'error');
          return;
        }

        const mes = AppState.selectedMonth;
        const recId = String(rec.id).trim();
        const recNom = String(rec.nombre || '').trim();

        // Buscar si ya existe transacción asentada para este recurrente en el mes
        const existingTx = AppState.transactions.find(t => {
          const mEf = FinancialEngine.normalizarMes(t.mesImpactoEfectivo || t.fecha);
          const mTC = FinancialEngine.normalizarMes(t.mesImpactoTC);
          const mF = FinancialEngine.normalizarMes(t.fecha);
          if (mEf !== mes && mTC !== mes && mF !== mes) return false;

          if (t.recurrenteId && String(t.recurrenteId).trim() === recId) return true;
          const notas = String(t.notas || '');
          return notas.includes(`[Fijo: ${recId}]`) || notas.includes(`[Fijo: ${recNom}]`) || notas === `[Fijo] ${recNom}`;
        });

        const metodoLower = String(data.metodoPago || '').toLowerCase();
        const tarjeta = AppState.cards.find(c => {
          const cId = String(c.id || '').toLowerCase();
          const cNom = String(c.nombre || '').toLowerCase();
          return cId === metodoLower || cNom === metodoLower || (metodoLower !== '' && (metodoLower.includes(cId.replace(/^tc[_-]/, '')) || metodoLower.includes('tarjeta') || metodoLower.includes('tc')));
        });

        const esTC = (rec.tipo === 'Gasto_Fijo' && tarjeta);
        const tipoTx = rec.tipo === 'Ingreso_Fijo' ? 'Ingreso' : (esTC ? 'Consumo_TC' : 'Gasto_Directo');

        if (existingTx) {
          existingTx.monto = data.monto;
          existingTx.fecha = data.fecha;
          existingTx.metodoPago = data.metodoPago;
          existingTx.tipo = tipoTx;
          existingTx.tarjetaAfectada = esTC ? tarjeta.id : '';
          existingTx.categoria = rec.categoria;
          existingTx.notas = `[Fijo: ${rec.id}] ${rec.nombre}`;
          const prepared = FinancialEngine.prepararTransaccion(existingTx, AppState.cards);
          Object.assign(existingTx, prepared);
          await ApiService.saveTransaction(existingTx);
        } else {
          const rawTx = {
            id: 'TX-REC-' + Date.now(),
            recurrenteId: rec.id,
            fecha: data.fecha,
            tipo: tipoTx,
            tarjetaAfectada: esTC ? tarjeta.id : '',
            categoria: rec.categoria,
            monto: data.monto,
            metodoPago: data.metodoPago,
            notas: `[Fijo: ${rec.id}] ${rec.nombre}`
          };
          const prepared = FinancialEngine.prepararTransaccion(rawTx, AppState.cards);
          AppState.transactions.unshift(prepared);
          await ApiService.saveTransaction(prepared);
        }

        UIManager.closeConfirmRecurrenteModal();
        recalculateAndRender();
        UIManager.showToast(`✅ Recibo "${rec.nombre}" registrado en S/ ${data.monto.toFixed(2)} para ${mes}`, 'success');
      });
    }

    // Botón Registrar todos los fijos activos en este Mes
    if (btnApplyMonth) {
      btnApplyMonth.addEventListener('click', async () => {
        const activos = AppState.recurrentes.filter(r => r.activo);
        if (activos.length === 0) {
          UIManager.showToast('No hay movimientos fijos activos para registrar', 'warning');
          return;
        }

        const mes = AppState.selectedMonth; // 'YYYY-MM'
        const [anio, mesNum] = mes.split('-').map(Number);
        const maxDiasMes = new Date(anio, mesNum, 0).getDate();
        const pad = (n) => String(n).padStart(2, '0');

        const newTxs = [];
        for (let i = 0; i < activos.length; i++) {
          const rec = activos[i];
          const recId = String(rec.id).trim();
          const recNom = String(rec.nombre || '').trim();
          const diaAjustado = Math.min(parseInt(rec.diaMes, 10) || 1, maxDiasMes);
          const fechaTx = `${anio}-${pad(mesNum)}-${pad(diaAjustado)}`;
          const tagFijo = `[Fijo: ${recId}] ${recNom}`;

          const yaExiste = AppState.transactions.some(t => {
            const mEf = FinancialEngine.normalizarMes(t.mesImpactoEfectivo || t.fecha);
            const mTC = FinancialEngine.normalizarMes(t.mesImpactoTC);
            const mF = FinancialEngine.normalizarMes(t.fecha);
            if (mEf !== mes && mTC !== mes && mF !== mes) return false;

            if (t.recurrenteId && String(t.recurrenteId).trim() === recId) return true;
            const notas = String(t.notas || '');
            return notas.includes(`[Fijo: ${recId}]`) || notas.includes(`[Fijo: ${recNom}]`) || notas === `[Fijo] ${recNom}`;
          });

          if (!yaExiste) {
            const metodoLower = String(rec.metodoPago || '').toLowerCase();
            const tarjeta = AppState.cards.find(c => {
              const cId = String(c.id || '').toLowerCase();
              const cNom = String(c.nombre || '').toLowerCase();
              return cId === metodoLower || cNom === metodoLower || (metodoLower !== '' && (metodoLower.includes(cId.replace(/^tc[_-]/, '')) || metodoLower.includes('tarjeta') || metodoLower.includes('tc')));
            });

            const esTC = (rec.tipo === 'Gasto_Fijo' && tarjeta);
            const tipoTx = rec.tipo === 'Ingreso_Fijo' ? 'Ingreso' : (esTC ? 'Consumo_TC' : 'Gasto_Directo');

            const rawTx = {
              id: 'TX-REC-' + Date.now() + '-' + i,
              recurrenteId: rec.id,
              fecha: fechaTx,
              tipo: tipoTx,
              tarjetaAfectada: esTC ? tarjeta.id : '',
              monto: parseFloat(rec.monto) || 0,
              categoria: rec.categoria,
              metodoPago: rec.metodoPago || 'Efectivo',
              notas: tagFijo
            };
            const prepared = FinancialEngine.prepararTransaccion(rawTx, AppState.cards);
            newTxs.push(prepared);
          }
        }

        if (newTxs.length === 0) {
          UIManager.showToast(`Los movimientos fijos ya estaban registrados para ${mes}`, 'info');
          return;
        }

        btnApplyMonth.disabled = true;
        btnApplyMonth.textContent = 'Registrando...';

        await ApiService.saveTransactions(newTxs);
        AppState.transactions.unshift(...newTxs);
        recalculateAndRender();

        btnApplyMonth.disabled = false;
        btnApplyMonth.innerHTML = '<span>⚡</span> <span>Registrar en este Mes</span>';
        UIManager.showToast(`✅ Se registraron ${newTxs.length} movimientos fijos en ${mes}!`, 'success');
      });
    }
  }

  /**
   * Guardar transacción desde el Numpad Drawer (con soporte de cuotas sin intereses)
   */
  function setupSaveTransactionAction() {
    const saveBtn = document.getElementById('btn-save-transaction');
    if (!saveBtn) return;

    saveBtn.addEventListener('click', async () => {
      const monto = UIManager.getNumpadAmount();
      if (monto <= 0) {
        UIManager.showToast('Ingresa un monto válido mayor a 0', 'error');
        return;
      }

      const tipo = UIManager.currentType;
      const fecha = document.getElementById('tx-date-input').value || new Date().toISOString().slice(0, 10);
      const categoria = document.getElementById('tx-category-select').value;
      const tarjetaAfectada = document.getElementById('tx-card-select').value;
      const metodoPago = document.getElementById('tx-method-select').value;
      const notas = (document.getElementById('tx-notes-input').value || '').trim();

      const currentMonth = FinancialEngine.obtenerMesImpacto(new Date());
      const txMes = FinancialEngine.normalizarMes(fecha);
      const isClosed = AppState.closedMonths.some(m => FinancialEngine.normalizarMes(m.mes) === txMes);
      if (txMes < currentMonth || isClosed) {
        UIManager.showToast('No se pueden registrar transacciones en meses pasados o cerrados en la app. Modifícalo directamente en Google Sheet.', 'warning');
        return;
      }

      const cuotasSelect = document.getElementById('tx-cuotas-select');
      const numCuotas = (tipo === 'Consumo_TC' && cuotasSelect) ? (parseInt(cuotasSelect.value, 10) || 1) : 1;

      // Construir objeto de transacción crudo
      const rawTx = {
        id: 'TX-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        fecha: fecha,
        tipo: tipo,
        monto: monto,
        categoria: categoria || (tipo === 'Pago_TC_Vencida' ? 'Pago Factura TC' : 'General'),
        tarjetaAfectada: (tipo === 'Consumo_TC' || tipo === 'Prepago_TC' || tipo === 'Pago_TC_Vencida') ? tarjetaAfectada : '',
        metodoPago: (tipo === 'Ingreso' || tipo === 'Gasto_Directo' || tipo === 'Prepago_TC' || tipo === 'Pago_TC_Vencida') ? metodoPago : '',
        cuotas: numCuotas,
        notas: notas
      };

      try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';

        if (tipo === 'Consumo_TC' && numCuotas > 1) {
          // Dividir en cuotas sin intereses
          const cuotasList = FinancialEngine.dividirEnCuotas(rawTx, AppState.cards);
          await ApiService.saveTransactions(cuotasList);
          AppState.transactions.unshift(...cuotasList);
          UIManager.closeDrawer();
          recalculateAndRender();
          const montoCuota = (monto / numCuotas).toFixed(2);
          UIManager.showToast(`🎉 Compra en ${numCuotas} cuotas registrada (S/ ${montoCuota}/mes)`, 'success');
        } else {
          // Transacción única normal
          const preparedTx = FinancialEngine.prepararTransaccion(rawTx, AppState.cards);
          await ApiService.saveTransaction(preparedTx);
          AppState.transactions.unshift(preparedTx);
          UIManager.closeDrawer();
          recalculateAndRender();

          if (tipo === 'Prepago_TC') {
            UIManager.showToast(`⚡ Prepago de S/ ${monto.toFixed(2)} registrado: redujo la deuda del próximo mes!`, 'success');
          } else if (tipo === 'Pago_TC_Vencida') {
            const cardObj = AppState.cards.find(c => c.id === tarjetaAfectada);
            const cardNom = cardObj ? cardObj.nombre : 'Tarjeta';
            UIManager.showToast(`🏦 Pago de factura de S/ ${monto.toFixed(2)} registrado para ${cardNom}!`, 'success');
          } else {
            UIManager.showToast('Transacción registrada exitosamente', 'success');
          }
        }
      } catch (err) {
        console.error('Error al registrar transacción:', err);
        UIManager.showToast('Error: ' + err.message, 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Confirmar y Guardar';
      }
    });
  }

  /**
   * Modal de Configuración y Gestión de Tarjetas
   */
  function setupSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const openBtn = document.getElementById('btn-open-settings');
    const closeBtn = document.getElementById('btn-close-settings');
    const apiUrlInput = document.getElementById('setting-api-url');
    const btnTestConn = document.getElementById('btn-test-connection');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    const cardsListContainer = document.getElementById('settings-cards-list');
    const btnAddCard = document.getElementById('btn-add-new-card');

    if (!modal) return;

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        if (apiUrlInput) apiUrlInput.value = ApiService.getApiUrl();
        renderSettingsCardsList();
        modal.classList.remove('hidden');
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    }

    if (btnTestConn) {
      btnTestConn.addEventListener('click', async () => {
        const url = apiUrlInput.value.trim();
        btnTestConn.textContent = 'Probando...';
        btnTestConn.disabled = true;

        const res = await ApiService.testConnection(url);
        btnTestConn.disabled = false;
        btnTestConn.textContent = 'Probar Conexión';

        if (res.success) {
          UIManager.showToast('✅ Conexión exitosa con Google Apps Script', 'success');
        } else {
          UIManager.showToast('❌ Falló la conexión: ' + (res.error || 'Revisa permisos'), 'error');
        }
      });
    }

    if (btnSaveSettings) {
      btnSaveSettings.addEventListener('click', async () => {
        const url = apiUrlInput.value.trim();
        ApiService.setApiUrl(url);
        UIManager.showToast('Configuración guardada', 'success');
        modal.classList.add('hidden');
        await loadAppData();
      });
    }

    function renderSettingsCardsList() {
      if (!cardsListContainer) return;
      cardsListContainer.innerHTML = AppState.cards.map((c, idx) => `
        <div class="p-3 bg-slate-800 rounded-xl flex items-center justify-between text-xs">
          <div>
            <p class="font-bold text-slate-100">${c.nombre}</p>
            <p class="text-slate-400">Corte: día ${c.diaCorte} • Vence: día ${c.diaVencimiento} • Límite: S/ ${c.limiteCredito}</p>
          </div>
          <button class="btn-delete-card text-rose-400 p-1 hover:text-rose-300" data-index="${idx}">Eliminar</button>
        </div>
      `).join('');

      cardsListContainer.querySelectorAll('.btn-delete-card').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          AppState.cards.splice(idx, 1);
          ApiService.saveLocalCards(AppState.cards);
          renderSettingsCardsList();
          UIManager.renderDynamicFormFields(AppState.cards);
          recalculateAndRender();
        });
      });
    }

    if (btnAddCard) {
      btnAddCard.addEventListener('click', () => {
        const nombre = prompt('Nombre de la tarjeta (ej. BCP Visa Oro):');
        if (!nombre) return;
        const diaCorte = parseInt(prompt('Día de corte del ciclo (1-31):', '20'), 10) || 20;
        const diaVencimiento = parseInt(prompt('Día límite de pago / vencimiento (1-31):', '10'), 10) || 10;
        const limite = parseFloat(prompt('Límite de crédito en S/:', '5000')) || 5000;

        const newCard = {
          id: 'TC_' + Date.now().toString(36).toUpperCase(),
          nombre: nombre,
          diaCorte: diaCorte,
          diaVencimiento: diaVencimiento,
          moneda: 'PEN',
          limiteCredito: limite,
          colorHex: '#3b82f6'
        };

        AppState.cards.push(newCard);
        ApiService.saveLocalCards(AppState.cards);
        renderSettingsCardsList();
        UIManager.renderDynamicFormFields(AppState.cards);
        recalculateAndRender();
        UIManager.showToast(`Tarjeta ${nombre} agregada`, 'success');
      });
    }
  }

  /**
   * Manejo de la acción de liquidar / adelantar cuotas de tarjeta de crédito
   */
  function setupLiquidarCuotasActions() {
    const confirmBtn = document.getElementById('btn-confirm-liquidar');
    if (!confirmBtn) return;

    confirmBtn.addEventListener('click', async () => {
      const data = UIManager.getLiquidarSelectedData();
      if (!data || !data.cuotasSeleccionadas || data.cuotasSeleccionadas.length === 0) {
        UIManager.showToast('Selecciona al menos una cuota para liquidar', 'warning');
        return;
      }

      if (data.totalMonto <= 0) {
        UIManager.showToast('El monto total a liquidar debe ser mayor a 0', 'error');
        return;
      }

      const card = AppState.cards.find(c => String(c.id).toLowerCase() === String(data.tarjetaId).toLowerCase());
      const cardNom = card ? card.nombre : 'Tarjeta';

      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span>⚡</span> Liquidando...';

      try {
        const cuotaIds = data.cuotasSeleccionadas.map(c => c.id);

        // 1. Marcar cuotas seleccionadas como LIQUIDADAS en AppState.transactions
        AppState.transactions.forEach(t => {
          if (cuotaIds.includes(t.id)) {
            t.estado = 'LIQUIDADA';
            t.esLiquidado = true;
            t.fechaLiquidacion = data.fecha;
            t.notas = (t.notas ? t.notas + ' ' : '') + `[LIQUIDADA ANTICIPADAMENTE en ${AppState.selectedMonth}]`;
          }
        });

        // 2. Registrar transacción Prepago_TC con impacto efectivo en el mes actual
        const rawPrepago = {
          id: 'TX-LIQ-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          fecha: data.fecha || new Date().toISOString().slice(0, 10),
          tipo: 'Prepago_TC',
          monto: data.totalMonto,
          categoria: 'Prepago Voluntario',
          tarjetaAfectada: data.tarjetaId,
          metodoPago: data.cuentaOrigen || 'Efectivo',
          notas: `[Liquidación Anticipada] ${data.cuotasSeleccionadas.length} cuota(s) de ${cardNom} extinguidas.`,
          mesImpactoEfectivo: AppState.selectedMonth,
          mesImpactoTC: AppState.selectedMonth
        };

        const preparedPrepago = FinancialEngine.prepararTransaccion(rawPrepago, AppState.cards);
        // Garantizar que el impacto efectivo quede asignado al mes actual
        preparedPrepago.mesImpactoEfectivo = AppState.selectedMonth;

        // 3. Guardar prepago y persistir cambios locales
        await ApiService.saveTransaction(preparedPrepago);
        AppState.transactions.unshift(preparedPrepago);
        ApiService.saveLocalTransactions(AppState.transactions);

        // 4. Si hay conexión y backend Sheets activo, eliminar las cuotas remotas para que no reaparezcan
        if (ApiService.apiUrl && ApiService.isOnline) {
          for (const cId of cuotaIds) {
            try {
              await ApiService.deleteTransaction(cId);
            } catch (delErr) {
              console.warn(`[Liquidación] Aviso al eliminar cuota remota ${cId}:`, delErr);
            }
          }
        }

        // 5. Cerrar modal y redibujar
        UIManager.closeLiquidarCuotasModal();
        recalculateAndRender();

        UIManager.showToast(`✅ Se liquidaron ${data.cuotasSeleccionadas.length} cuota(s) por S/ ${data.totalMonto.toFixed(2)}. ¡Línea de crédito liberada!`, 'success');
      } catch (err) {
        console.error('Error al liquidar cuotas:', err);
        UIManager.showToast('Error al liquidar cuotas: ' + err.message, 'error');
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<span>⚡</span> Confirmar y Liquidar Cuotas';
      }
    });
  }

})();
