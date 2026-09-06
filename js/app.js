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
    setupSettingsModal();
    setupBudgetsModal();
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

    const { cards, transactions, budgets, source } = await ApiService.fetchAllData();
    AppState.cards = cards;
    AppState.transactions = transactions;
    AppState.budgets = budgets || ApiService.getLocalBudgets();
    window.cachedCards = cards;
    window.cachedBudgets = AppState.budgets;

    // Actualizar campos dinámicos de la UI con las tarjetas cargadas
    UIManager.renderDynamicFormFields(cards);

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
  }

  /**
   * Recalcula el modelo financiero y actualiza todos los componentes de la vista
   */
  function recalculateAndRender() {
    const summary = FinancialEngine.calcularConsolidadoFinanciero(
      AppState.transactions,
      AppState.cards,
      AppState.selectedMonth,
      AppState.budgets
    );

    UIManager.renderDashboard(summary);
    UIManager.renderTransactionsList(AppState.transactions, AppState.currentFilter);
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
   * Guardar transacción desde el Numpad Drawer
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

      // Construir objeto de transacción crudo
      const rawTx = {
        id: 'TX-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        fecha: fecha,
        tipo: tipo,
        monto: monto,
        categoria: categoria,
        tarjetaAfectada: (tipo === 'Consumo_TC' || tipo === 'Prepago_TC') ? tarjetaAfectada : '',
        metodoPago: (tipo === 'Ingreso' || tipo === 'Gasto_Directo' || tipo === 'Prepago_TC') ? metodoPago : '',
        notas: notas
      };

      try {
        // Preparar con la lógica financiera (calcula cortes, vencimientos y doble impacto contable)
        const preparedTx = FinancialEngine.prepararTransaccion(rawTx, AppState.cards);

        // Desactivar botón durante guardado
        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';

        // Guardar vía API (con guardado local inmediato y sincronización a Sheets)
        await ApiService.saveTransaction(preparedTx);

        // Actualizar estado local
        AppState.transactions.unshift(preparedTx);

        // Cerrar drawer y refrescar vista
        UIManager.closeDrawer();
        recalculateAndRender();

        if (tipo === 'Prepago_TC') {
          UIManager.showToast(`⚡ Prepago de S/ ${monto.toFixed(2)} registrado: redujo la deuda del próximo mes!`, 'success');
        } else {
          UIManager.showToast('Transacción registrada exitosamente', 'success');
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

})();
