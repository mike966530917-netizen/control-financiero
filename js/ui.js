/**
 * ui.js
 * Controlador de Interfaz de Usuario, Numpad Táctil, Renderizado del Dashboard y Modales
 */

(function (global) {
  'use strict';

  class UIManager {
    constructor() {
      // Estado del Numpad
      this.numpadValue = '0';
      this.currentType = 'Gasto_Directo';
      this.selectedCardId = '';
      this.selectedMethod = 'Efectivo';
      this.selectedCategory = 'Alimentación';
      this.selectedDate = new Date().toISOString().slice(0, 10);
      this.notes = '';

      // Catálogo Maestro Unificado de Categorías
      const catsGasto = (typeof FinancialEngine !== 'undefined' && FinancialEngine.CATEGORIAS_GASTO) ? FinancialEngine.CATEGORIAS_GASTO : [
        'Hogar', 'Servicios', 'Supermercado', 'Alimentación', 'Restaurantes',
        'Transporte', 'Suscripciones', 'Salud', 'Educación', 'Compras',
        'Tecnología', 'Entretenimiento', 'Otros Gastos'
      ];

      const catsIngreso = (typeof FinancialEngine !== 'undefined' && FinancialEngine.CATEGORIAS_INGRESO) ? FinancialEngine.CATEGORIAS_INGRESO : [
        'Sueldo', 'Freelance / Negocio', 'Inversiones / Rentas', 'Otros Ingresos'
      ];

      this.categoriesByType = {
        Ingreso: catsIngreso,
        Gasto_Directo: catsGasto,
        Consumo_TC: catsGasto,
        Prepago_TC: ['Amortización Capital', 'Prepago Voluntario', 'Reducción Saldo'],
        Pago_TC_Vencida: ['Liquidación Mensual', 'Pago Total Facturado']
      };

      this.paymentMethods = ['Efectivo', 'Débito BCP', 'Débito BBVA', 'Transferencia', 'Yape / Plin'];

      // Vistas y Gráficos
      this.currentView = 'view-dashboard';
      this.categoryChart = null;
      this.cashflowChart = null;
      this.showAllTransactions = false;
    }

    init() {
      this.setupNumpadEvents();
      this.setupDrawerEvents();
      this.setupTypeSelector();
      this.setupTabNavigation();

      const closeConfirmBtn = document.getElementById('btn-close-confirm-modal');
      const cancelConfirmBtn = document.getElementById('btn-cancel-confirm-rec');
      if (closeConfirmBtn) closeConfirmBtn.addEventListener('click', () => this.closeConfirmRecurrenteModal());
      if (cancelConfirmBtn) cancelConfirmBtn.addEventListener('click', () => this.closeConfirmRecurrenteModal());

      const closeCloseModalBtn = document.getElementById('btn-close-close-modal');
      const cancelCloseMonthBtn = document.getElementById('btn-cancel-close-month');
      if (closeCloseModalBtn) closeCloseModalBtn.addEventListener('click', () => this.closeCloseMonthModal());
      if (cancelCloseMonthBtn) cancelCloseMonthBtn.addEventListener('click', () => this.closeCloseMonthModal());

      const closeLiquidarModalBtn = document.getElementById('btn-close-liquidar-modal');
      const cancelLiquidarBtn = document.getElementById('btn-cancel-liquidar');
      if (closeLiquidarModalBtn) closeLiquidarModalBtn.addEventListener('click', () => this.closeLiquidarCuotasModal());
      if (cancelLiquidarBtn) cancelLiquidarBtn.addEventListener('click', () => this.closeLiquidarCuotasModal());

      const closeDetalleCatBtn = document.getElementById('btn-close-detalle-cat-modal');
      const okDetalleCatBtn = document.getElementById('btn-ok-detalle-cat');
      const modalDetalle = document.getElementById('modal-detalle-categoria');
      if (closeDetalleCatBtn) closeDetalleCatBtn.addEventListener('click', () => this.closeDetalleCategoriaModal());
      if (okDetalleCatBtn) okDetalleCatBtn.addEventListener('click', () => this.closeDetalleCategoriaModal());
      if (modalDetalle) {
        modalDetalle.addEventListener('click', (e) => {
          if (e.target === modalDetalle) this.closeDetalleCategoriaModal();
        });
      }

      // Botón de refresco en vivo dentro del modal de categoría
      const refreshDetalleCatBtn = document.getElementById('btn-refresh-detalle-cat');
      if (refreshDetalleCatBtn) {
        refreshDetalleCatBtn.addEventListener('click', async () => {
          const icon = document.getElementById('detalle-cat-refresh-icon');
          if (icon) icon.classList.add('animate-spin');
          try {
            if (window.refreshAllData) {
              await window.refreshAllData();
            } else if (window.loadAppData) {
              await window.loadAppData();
            }
            this.openDetalleCategoriaModal(this.currentDetalleCategoria || '', this.currentDetallePeriodo || 'ACTUAL');
            this.showToast('Gastos actualizados desde Google Sheets', 'success');
          } catch (e) {
            this.showToast('Error al refrescar: ' + e.message, 'error');
          } finally {
            if (icon) icon.classList.remove('animate-spin');
          }
        });
      }

      // Conmutadores de periodo dentro del modal de categoría
      const btnPeriodoActual = document.getElementById('btn-detalle-periodo-actual');
      const btnPeriodoTodos = document.getElementById('btn-detalle-periodo-todos');
      if (btnPeriodoActual) {
        btnPeriodoActual.addEventListener('click', () => {
          this.openDetalleCategoriaModal(this.currentDetalleCategoria || '', 'ACTUAL');
        });
      }
      if (btnPeriodoTodos) {
        btnPeriodoTodos.addEventListener('click', () => {
          this.openDetalleCategoriaModal(this.currentDetalleCategoria || '', 'TODOS');
        });
      }

      // Botón de refresco en vivo en Movimientos Registrados
      const refreshTxsBtn = document.getElementById('btn-refresh-txs');
      if (refreshTxsBtn) {
        refreshTxsBtn.addEventListener('click', async () => {
          const icon = document.getElementById('txs-refresh-icon');
          if (icon) icon.classList.add('animate-spin');
          try {
            if (window.refreshAllData) {
              await window.refreshAllData();
            } else if (window.loadAppData) {
              await window.loadAppData();
            }
            this.showToast('Movimientos actualizados desde Google Sheets', 'success');
          } catch (e) {
            this.showToast('Error al actualizar: ' + e.message, 'error');
          } finally {
            if (icon) icon.classList.remove('animate-spin');
          }
        });
      }

      // Selector de filtro de categoría en Movimientos Registrados
      const catFilterSelect = document.getElementById('tx-category-filter-select');
      if (catFilterSelect) {
        catFilterSelect.addEventListener('change', () => {
          this.selectedCategoryFilter = catFilterSelect.value;
          const allTxs = window.cachedTransactions || (window.AppState && window.AppState.transactions) || [];
          this.renderTransactionsList(allTxs, this.currentFilter || 'ALL');
        });
      }

      // Escuchador global delegado e infalible para ver detalle de categorías
      document.addEventListener('click', (e) => {
        let el = e.target;
        if (el && el.nodeType === 3) el = el.parentElement;
        if (!el || typeof el.closest !== 'function') return;

        const trigger = el.closest('.btn-inspect-category, .btn-inspect-category-btn, [data-inspect-cat]');
        if (trigger) {
          const cat = trigger.getAttribute('data-inspect-cat') || trigger.getAttribute('data-categoria');
          console.log('[LUPA v5.2] Click delegado detectado — trigger:', trigger.tagName, '| cat:', cat);
          if (cat) {
            e.preventDefault();
            this.openDetalleCategoriaModal(cat);
          } else {
            console.warn('[LUPA v5.2] El trigger no tiene data-inspect-cat ni data-categoria:', trigger.outerHTML.slice(0, 200));
          }
        }
      });

      const btnToggleTxs = document.getElementById('btn-toggle-all-txs');
      if (btnToggleTxs) {
        btnToggleTxs.addEventListener('click', () => {
          this.showAllTransactions = !this.showAllTransactions;
          const allTxs = window.cachedTransactions || [];
          this.renderTransactionsList(allTxs, this.currentFilter || 'ALL');
        });
      }

      // Selector de año en Historial de Ahorro
      const btnPrevYear = document.getElementById('btn-prev-savings-year');
      const btnNextYear = document.getElementById('btn-next-savings-year');
      if (btnPrevYear) {
        btnPrevYear.addEventListener('click', () => {
          const curr = parseInt(window.currentSavingsYear || new Date().getFullYear(), 10);
          window.currentSavingsYear = String(curr - 1);
          if (window.lastSummary && window.lastSummary.historicoAhorro) {
            this.renderHistoricalSavings(window.lastSummary.historicoAhorro, window.currentSavingsYear);
          }
        });
      }
      if (btnNextYear) {
        btnNextYear.addEventListener('click', () => {
          const curr = parseInt(window.currentSavingsYear || new Date().getFullYear(), 10);
          window.currentSavingsYear = String(curr + 1);
          if (window.lastSummary && window.lastSummary.historicoAhorro) {
            this.renderHistoricalSavings(window.lastSummary.historicoAhorro, window.currentSavingsYear);
          }
        });
      }
    }

    setupTabNavigation() {
      const tabBtns = document.querySelectorAll('.tab-nav-btn');
      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const targetView = btn.getAttribute('data-view');
          this.switchView(targetView);
        });
      });
    }

    switchView(viewId) {
      this.currentView = viewId;
      const views = ['view-dashboard', 'view-recurrentes', 'view-charts', 'view-alerts'];
      views.forEach(v => {
        const el = document.getElementById(v);
        if (el) {
          if (v === viewId) el.classList.remove('hidden');
          else el.classList.add('hidden');
        }
      });

      const tabBtns = document.querySelectorAll('.tab-nav-btn');
      tabBtns.forEach(btn => {
        const btnView = btn.getAttribute('data-view');
        if (btnView === viewId) {
          btn.className = 'tab-nav-btn py-1.5 rounded-lg flex items-center justify-center gap-1 bg-sky-600 text-white shadow-sm transition';
        } else {
          btn.className = 'tab-nav-btn py-1.5 rounded-lg flex items-center justify-center gap-1 text-slate-400 hover:text-slate-200 transition';
        }
      });

      // Si se abre la pestaña de fijos recurrentes, refrescar lista
      if (viewId === 'view-recurrentes' && window.cachedRecurrentes) {
        this.renderRecurrentesList(window.cachedRecurrentes, window.cachedRecurrentesMes, window.cachedRecurrentesEstadoMes);
      }

      // Redibujar gráficos y presupuestos si se abre la pestaña de gráficos
      if (viewId === 'view-charts' && window.lastSummary) {
        setTimeout(() => {
          this.renderCharts(window.lastSummary);
          if (window.lastSummary.presupuestos) {
            this.renderBudgetsProgress(window.lastSummary.presupuestos);
          }
        }, 50);
      }
    }

    // ==========================================================================
    // LÓGICA DEL NUMPAD
    // ==========================================================================
    setupNumpadEvents() {
      const keys = document.querySelectorAll('[data-numpad-key]');
      keys.forEach(key => {
        key.addEventListener('click', (e) => {
          e.preventDefault();
          const keyValue = key.getAttribute('data-numpad-key');
          this.handleNumpadInput(keyValue);
        });
      });
    }

    handleNumpadInput(val) {
      if (val === 'clear') {
        this.numpadValue = '0';
      } else if (val === 'backspace') {
        if (this.numpadValue.length > 1) {
          this.numpadValue = this.numpadValue.slice(0, -1);
        } else {
          this.numpadValue = '0';
        }
      } else if (val === '.') {
        if (!this.numpadValue.includes('.')) {
          this.numpadValue += '.';
        }
      } else if (val === '00') {
        if (this.numpadValue !== '0') {
          // Validar decimales
          if (this.numpadValue.includes('.')) {
            const parts = this.numpadValue.split('.');
            if (parts[1].length === 0) this.numpadValue += '00';
            else if (parts[1].length === 1) this.numpadValue += '0';
          } else {
            if (this.numpadValue.length < 8) {
              this.numpadValue += '00';
            }
          }
        }
      } else {
        // Dígitos 0-9
        if (this.numpadValue === '0' && val !== '.') {
          this.numpadValue = val;
        } else {
          // Limitar a 2 decimales
          if (this.numpadValue.includes('.')) {
            const parts = this.numpadValue.split('.');
            if (parts[1].length >= 2) return;
          }
          // Limitar longitud máxima
          if (this.numpadValue.replace('.', '').length < 9) {
            this.numpadValue += val;
          }
        }
      }

      this.updateNumpadDisplay();
      this.updateImpactPreview();
    }

    updateNumpadDisplay() {
      const display = document.getElementById('numpad-display-amount');
      if (!display) return;

      const num = parseFloat(this.numpadValue) || 0;
      // Mostrar con formato amigable
      if (this.numpadValue.endsWith('.')) {
        display.textContent = `S/ ${this.numpadValue}`;
      } else {
        display.textContent = `S/ ${this.numpadValue}`;
      }
    }

    getNumpadAmount() {
      return parseFloat(this.numpadValue) || 0;
    }

    resetNumpad() {
      this.numpadValue = '0';
      this.updateNumpadDisplay();
      const notesInput = document.getElementById('tx-notes-input');
      if (notesInput) notesInput.value = '';
    }

    // ==========================================================================
    // SELECCIÓN DE TIPO Y FORMULARIO DINÁMICO
    // ==========================================================================
    setupTypeSelector() {
      const chips = document.querySelectorAll('.type-chip');
      chips.forEach(chip => {
        chip.addEventListener('click', () => {
          chips.forEach(c => c.className = 'type-chip');
          const type = chip.getAttribute('data-type');
          this.currentType = type;

          if (type === 'Ingreso') chip.classList.add('active-ingreso');
          else if (type === 'Gasto_Directo') chip.classList.add('active-gasto');
          else if (type === 'Consumo_TC') chip.classList.add('active-consumo');
          else if (type === 'Prepago_TC') chip.classList.add('active-prepago');
          else if (type === 'Pago_TC_Vencida') chip.classList.add('active-pago');

          this.renderDynamicFormFields();
          this.updateImpactPreview();
        });
      });
    }

    renderDynamicFormFields(cards = []) {
      if (!cards.length && window.cachedCards) {
        cards = window.cachedCards;
      }

      const cardContainer = document.getElementById('field-card-container');
      const methodContainer = document.getElementById('field-method-container');
      const cardSelect = document.getElementById('tx-card-select');
      const methodSelect = document.getElementById('tx-method-select');
      const categorySelect = document.getElementById('tx-category-select');

      // Llenar tarjetas
      if (cardSelect) {
        cardSelect.innerHTML = cards.map(c => 
          `<option value="${c.id}">${c.nombre} (Corte: ${c.diaCorte} / Vence: ${c.diaVencimiento})</option>`
        ).join('');
        if (this.selectedCardId) cardSelect.value = this.selectedCardId;
        else if (cards[0]) this.selectedCardId = cards[0].id;
      }

      // Llenar métodos de pago
      if (methodSelect) {
        methodSelect.innerHTML = this.paymentMethods.map(m => 
          `<option value="${m}">${m}</option>`
        ).join('');
        methodSelect.value = this.selectedMethod;
      }

      // Llenar categorías según tipo
      if (categorySelect) {
        const cats = this.categoriesByType[this.currentType] || ['General'];
        categorySelect.innerHTML = cats.map(cat => 
          `<option value="${cat}">${cat}</option>`
        ).join('');
        this.selectedCategory = cats[0];
      }

      // Visibilidad condicional
      const cuotasContainer = document.getElementById('field-cuotas-container');
      const cuotasSelect = document.getElementById('tx-cuotas-select');
      const cuotaBadge = document.getElementById('tx-cuota-preview-badge');

      if (this.currentType === 'Ingreso') {
        if (cardContainer) cardContainer.classList.add('hidden');
        if (methodContainer) methodContainer.classList.remove('hidden');
        if (cuotasContainer) cuotasContainer.classList.add('hidden');
        if (cuotasSelect) cuotasSelect.value = '1';
        if (cuotaBadge) cuotaBadge.textContent = '1 cuota (Directo)';
      } else if (this.currentType === 'Gasto_Directo') {
        if (cardContainer) cardContainer.classList.add('hidden');
        if (methodContainer) methodContainer.classList.remove('hidden');
        if (cuotasContainer) cuotasContainer.classList.add('hidden');
        if (cuotasSelect) cuotasSelect.value = '1';
        if (cuotaBadge) cuotaBadge.textContent = '1 cuota (Directo)';
      } else if (this.currentType === 'Consumo_TC') {
        if (cardContainer) cardContainer.classList.remove('hidden');
        if (methodContainer) methodContainer.classList.add('hidden');
        if (cuotasContainer) cuotasContainer.classList.remove('hidden');
      } else if (this.currentType === 'Prepago_TC') {
        // En prepago se requieren AMBOS: la tarjeta que se amortiza y la cuenta de donde sale el dinero
        if (cardContainer) cardContainer.classList.remove('hidden');
        if (methodContainer) methodContainer.classList.remove('hidden');
        if (cuotasContainer) cuotasContainer.classList.add('hidden');
        if (cuotasSelect) cuotasSelect.value = '1';
        if (cuotaBadge) cuotaBadge.textContent = '1 cuota (Directo)';
      } else if (this.currentType === 'Pago_TC_Vencida') {
        // En pago de tarjeta vencida se requieren AMBOS: la tarjeta que se liquida y la cuenta de donde sale el dinero
        if (cardContainer) cardContainer.classList.remove('hidden');
        if (methodContainer) methodContainer.classList.remove('hidden');
        if (cuotasContainer) cuotasContainer.classList.add('hidden');
        if (cuotasSelect) cuotasSelect.value = '1';
        if (cuotaBadge) cuotaBadge.textContent = '1 cuota (Directo)';
      }
    }

    updateImpactPreview() {
      const previewBox = document.getElementById('impact-preview-box');
      if (!previewBox) return;

      const monto = this.getNumpadAmount();
      const cards = window.cachedCards || [];
      const tarjeta = cards.find(c => c.id === this.selectedCardId);

      if (this.currentType === 'Ingreso') {
        previewBox.innerHTML = `
          <div class="text-xs text-emerald-400 flex items-center gap-1.5">
            <span>📈</span> Suma directa de <strong>S/ ${monto.toFixed(2)}</strong> al flujo de efectivo de este mes.
          </div>
        `;
      } else if (this.currentType === 'Gasto_Directo') {
        previewBox.innerHTML = `
          <div class="text-xs text-rose-400 flex items-center gap-1.5">
            <span>📉</span> Salida inmediata de <strong>S/ ${monto.toFixed(2)}</strong> del flujo de efectivo disponible hoy.
          </div>
        `;
      } else if (this.currentType === 'Consumo_TC') {
        const cuotasSelect = document.getElementById('tx-cuotas-select');
        const numCuotas = cuotasSelect ? (parseInt(cuotasSelect.value, 10) || 1) : 1;

        if (tarjeta) {
          const ciclo = FinancialEngine.calcularCicloTarjeta(this.selectedDate, tarjeta.diaCorte, tarjeta.diaVencimiento);
          if (numCuotas > 1) {
            const montoCuota = (monto / numCuotas).toFixed(2);
            const ultimoMes = FinancialEngine.sumarMeses(ciclo.mesImpactoTC, numCuotas - 1);
            previewBox.innerHTML = `
              <div class="text-xs text-sky-300 bg-sky-950/40 p-2.5 rounded-2xl border border-sky-500/30 space-y-0.5">
                <p class="font-bold text-sky-400 flex items-center gap-1">🔢 COMPRA EN ${numCuotas} CUOTAS SIN INTERESES (${tarjeta.nombre}):</p>
                <p>• <strong>Monto mensual:</strong> S/ ${montoCuota} cada mes.</p>
                <p>• <strong>Primera cuota vence:</strong> ${ciclo.fechaVencimiento} (Mes ${ciclo.mesImpactoTC}).</p>
                <p>• <strong>Última cuota vence en:</strong> Mes ${ultimoMes}.</p>
                <p>• <strong>NO</strong> resta efectivo hoy.</p>
              </div>
            `;
          } else {
            previewBox.innerHTML = `
              <div class="text-xs text-blue-300">
                <p class="font-medium text-blue-400">💳 Consumo directo (${tarjeta.nombre}):</p>
                <p>• <strong>NO</strong> resta efectivo hoy.</p>
                <p>• Corte: <strong>${ciclo.fechaCorte}</strong> | Se pagará el: <strong>${ciclo.fechaVencimiento}</strong> (Mes ${ciclo.mesImpactoTC}).</p>
              </div>
            `;
          }
        }
      } else if (this.currentType === 'Prepago_TC') {
        const nombreTarjeta = tarjeta ? tarjeta.nombre : 'Tarjeta Seleccionada';
        previewBox.innerHTML = `
          <div class="text-xs text-amber-300 bg-amber-950/40 p-2.5 rounded-xl border border-amber-500/20">
            <p class="font-bold text-amber-400 flex items-center gap-1">⚡ DOBLE IMPACTO DEL PREPAGO:</p>
            <p>1️⃣ <strong>Hoy:</strong> Salida de S/ ${monto.toFixed(2)} de tu efectivo (${this.selectedMethod}).</p>
            <p>2️⃣ <strong>Mes Siguiente:</strong> Reduce en S/ ${monto.toFixed(2)} la deuda que tendrías que pagar en ${nombreTarjeta}.</p>
          </div>
        `;
      } else if (this.currentType === 'Pago_TC_Vencida') {
        const nombreTarjeta = tarjeta ? tarjeta.nombre : 'Tarjeta Seleccionada';
        previewBox.innerHTML = `
          <div class="text-xs text-purple-300 bg-purple-950/40 p-2.5 rounded-xl border border-purple-500/20">
            <p class="font-bold text-purple-400 flex items-center gap-1">🏦 PAGO DE FACTURA DE TARJETA:</p>
            <p>1️⃣ <strong>Hoy:</strong> Salida de S/ ${monto.toFixed(2)} de tu efectivo (${this.selectedMethod}).</p>
            <p>2️⃣ <strong>Tarjeta:</strong> Liquida la factura vencida de ${nombreTarjeta}.</p>
          </div>
        `;
      }
    }

    // ==========================================================================
    // CONTROL DEL BOTTOM DRAWER
    // ==========================================================================
    setupDrawerEvents() {
      const drawer = document.getElementById('transaction-drawer');
      const backdrop = document.getElementById('drawer-backdrop');
      const openBtn = document.getElementById('fab-add-transaction');
      const closeBtn = document.getElementById('btn-close-drawer');
      const dateInput = document.getElementById('tx-date-input');
      const cardSelect = document.getElementById('tx-card-select');
      const methodSelect = document.getElementById('tx-method-select');
      const categorySelect = document.getElementById('tx-category-select');
      const cuotasSelect = document.getElementById('tx-cuotas-select');
      const cuotaBadge = document.getElementById('tx-cuota-preview-badge');

      if (dateInput) {
        dateInput.value = this.selectedDate;
        dateInput.addEventListener('change', (e) => {
          this.selectedDate = e.target.value;
          this.updateImpactPreview();
        });
      }

      if (cardSelect) {
        cardSelect.addEventListener('change', (e) => {
          this.selectedCardId = e.target.value;
          this.updateImpactPreview();
        });
      }

      if (methodSelect) {
        methodSelect.addEventListener('change', (e) => {
          this.selectedMethod = e.target.value;
          this.updateImpactPreview();
        });
      }

      if (categorySelect) {
        categorySelect.addEventListener('change', (e) => {
          this.selectedCategory = e.target.value;
        });
      }

      if (cuotasSelect) {
        cuotasSelect.addEventListener('change', (e) => {
          const val = parseInt(e.target.value, 10) || 1;
          if (cuotaBadge) {
            cuotaBadge.textContent = val > 1 ? `${val} cuotas sin intereses` : '1 cuota (Directo)';
          }
          this.updateImpactPreview();
        });
      }

      if (openBtn) {
        openBtn.addEventListener('click', () => this.openDrawer());
      }

      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.closeDrawer());
      }

      if (backdrop) {
        backdrop.addEventListener('click', () => this.closeDrawer());
      }
    }

    openDrawer(preselectedType = null, preselectedCardId = null, preselectedAmount = null) {
      const drawer = document.getElementById('transaction-drawer');
      const backdrop = document.getElementById('drawer-backdrop');
      if (!drawer || !backdrop) return;

      this.resetNumpad();

      if (preselectedType) {
        const targetChip = document.querySelector(`[data-type="${preselectedType}"]`);
        if (targetChip) targetChip.click();
      }

      if (preselectedCardId) {
        this.selectedCardId = preselectedCardId;
        const cardSelect = document.getElementById('tx-card-select');
        if (cardSelect) cardSelect.value = preselectedCardId;
      }

      if (preselectedAmount !== null && preselectedAmount !== undefined) {
        this.numpadValue = parseFloat(preselectedAmount).toFixed(2);
        this.updateNumpadDisplay();
      }

      this.updateImpactPreview();

      backdrop.classList.add('open');
      drawer.classList.add('open');
    }

    closeDrawer() {
      const drawer = document.getElementById('transaction-drawer');
      const backdrop = document.getElementById('drawer-backdrop');
      if (!drawer || !backdrop) return;

      backdrop.classList.remove('open');
      drawer.classList.remove('open');
    }

    // ==========================================================================
    // RENDERIZADO DEL DASHBOARD Y CARDS
    // ==========================================================================
    renderDashboard(summary) {
      if (!summary) return;

      const { flujoEfectivo, tarjetasCredito, mesActual, mesSiguiente } = summary;

      // 1. TARJETA 1: FLUJO DISPONIBLE DEL MES
      const cardBalanceEl = document.getElementById('metric-free-balance');
      const cardIncomeEl = document.getElementById('metric-total-income');
      const cardOutflowsEl = document.getElementById('metric-total-outflows');
      const cardPrepaidsCurrentEl = document.getElementById('metric-prepaids-current');
      const cardExpiredTcEl = document.getElementById('metric-expired-tc');
      const cardIncomeSubEl = document.getElementById('metric-income-sub');
      const cardOutflowsSubEl = document.getElementById('metric-outflows-sub');
      const metricTcBadgeEl = document.getElementById('metric-tc-badge');
      const metricTcSubEl = document.getElementById('metric-tc-sub');
      const quickPayTcContainer = document.getElementById('quick-pay-tc-container');
      const btnQuickPayAmount = document.getElementById('btn-quick-pay-amount');
      const btnQuickPayTc = document.getElementById('btn-quick-pay-tc');

      if (cardBalanceEl) {
        cardBalanceEl.textContent = `S/ ${flujoEfectivo.balanceLibreNeto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
        if (flujoEfectivo.balanceLibreNeto >= 0) {
          cardBalanceEl.className = 'text-3xl font-extrabold text-emerald-400';
        } else {
          cardBalanceEl.className = 'text-3xl font-extrabold text-rose-400';
        }
      }

      if (cardIncomeEl) cardIncomeEl.textContent = `+S/ ${flujoEfectivo.ingresos.toFixed(2)}`;
      if (cardIncomeSubEl) {
        const fijosInc = flujoEfectivo.ingresosFijos || 0;
        const varInc = flujoEfectivo.ingresosVariables || 0;
        cardIncomeSubEl.textContent = `Fijos: S/ ${fijosInc.toFixed(2)} | Var: S/ ${varInc.toFixed(2)}`;
      }

      if (cardOutflowsEl) cardOutflowsEl.textContent = `-S/ ${flujoEfectivo.gastosDirectos.toFixed(2)}`;
      if (cardOutflowsSubEl) {
        const fijosGas = flujoEfectivo.gastosFijos || 0;
        const varGas = flujoEfectivo.gastosVariables || 0;
        cardOutflowsSubEl.textContent = `Fijos: S/ ${fijosGas.toFixed(2)} | Var: S/ ${varGas.toFixed(2)}`;
      }

      if (cardPrepaidsCurrentEl) cardPrepaidsCurrentEl.textContent = `-S/ ${flujoEfectivo.prepagosRealizados.toFixed(2)}`;

      const factTC = flujoEfectivo.facturacionTC || {
        totalFacturado: 0,
        pagado: flujoEfectivo.pagosTCVencidas || 0,
        pendiente: 0,
        salidaEfectiva: flujoEfectivo.pagosTCVencidas || 0,
        desglosePorTarjeta: []
      };

      if (cardExpiredTcEl) cardExpiredTcEl.textContent = `-S/ ${factTC.salidaEfectiva.toFixed(2)}`;
      if (metricTcSubEl) {
        metricTcSubEl.textContent = `Pagado: S/ ${factTC.pagado.toFixed(2)} | Pend: S/ ${factTC.pendiente.toFixed(2)}`;
      }
      if (metricTcBadgeEl) {
        if (factTC.pendiente <= 0 && factTC.totalFacturado > 0) {
          metricTcBadgeEl.textContent = '✅ Pagado';
          metricTcBadgeEl.className = 'text-[9px] px-1.5 py-0.2 rounded font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/30';
        } else if (factTC.pendiente > 0) {
          metricTcBadgeEl.textContent = `⚠️ S/ ${factTC.pendiente.toFixed(2)} pendiente`;
          metricTcBadgeEl.className = 'text-[9px] px-1.5 py-0.2 rounded font-bold bg-purple-900/80 text-purple-200 border border-purple-400/40';
        } else {
          metricTcBadgeEl.textContent = 'Sin deuda';
          metricTcBadgeEl.className = 'text-[9px] px-1.5 py-0.2 rounded font-bold bg-slate-800 text-slate-400';
        }
      }

      if (quickPayTcContainer) {
        const tarjetasPendientes = (factTC.desglosePorTarjeta || []).filter(t => t.pendiente > 0);
        if (tarjetasPendientes.length > 0) {
          quickPayTcContainer.classList.remove('hidden');
          if (btnQuickPayAmount) {
            btnQuickPayAmount.textContent = `Pendiente: S/ ${factTC.pendiente.toFixed(2)}`;
          }
          const listEl = document.getElementById('quick-pay-cards-list');
          if (listEl) {
            listEl.innerHTML = tarjetasPendientes.map(card => `
              <button class="btn-pay-single-card w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-purple-900/70 to-indigo-900/70 hover:from-purple-800/80 hover:to-indigo-800/80 border border-purple-500/40 text-white font-bold text-xs flex items-center justify-between shadow-md shadow-purple-950/40 active:scale-[0.98] transition cursor-pointer" data-card-id="${card.id}" data-amount="${card.pendiente}">
                <div class="flex items-center gap-2">
                  <div class="w-2.5 h-2.5 rounded-full" style="background-color: ${card.colorHex}"></div>
                  <span>💳 Pagar ${card.nombre}</span>
                </div>
                <span class="bg-black/40 px-2 py-0.5 rounded-lg text-purple-200 text-[11px] font-extrabold">
                  S/ ${card.pendiente.toFixed(2)}
                </span>
              </button>
            `).join('');

            listEl.querySelectorAll('.btn-pay-single-card').forEach(btn => {
              btn.addEventListener('click', () => {
                const cardId = btn.getAttribute('data-card-id');
                const amount = parseFloat(btn.getAttribute('data-amount')) || 0;
                this.openDrawer('Pago_TC_Vencida', cardId, amount);
              });
            });
          }
        } else {
          quickPayTcContainer.classList.add('hidden');
        }
      }

      // Estado del botón Cerrar/Reabrir Mes en el Navegador de Mes
      const closeBtn = document.getElementById('btn-toggle-close-month');
      const closeLabel = document.getElementById('label-close-month-btn');
      const isClosed = summary.historicoAhorro && summary.historicoAhorro.mesesCerrados && summary.historicoAhorro.mesesCerrados.some(m => m.mes === mesActual);

      if (closeBtn && closeLabel) {
        if (isClosed) {
          closeBtn.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/60 hover:bg-emerald-900/60 transition cursor-pointer flex items-center gap-1';
          closeLabel.textContent = 'Mes Cerrado 🔓';
          closeBtn.title = 'Haga clic para reabrir este periodo';
        } else {
          closeBtn.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-800 text-slate-300 border border-slate-700 hover:border-slate-500 transition cursor-pointer flex items-center gap-1';
          closeLabel.textContent = 'Cerrar Mes 🔒';
          closeBtn.title = 'Haga clic para cerrar oficialmente este periodo';
        }
      }

      // 2. TARJETA 2: DEUDA PROYECTADA PRÓXIMO MES (Suma total de todas las tarjetas)
      const metricProjectedDebtEl = document.getElementById('metric-projected-debt');
      const metricGrossTcEl = document.getElementById('metric-gross-tc');
      const metricAppliedPrepaidsEl = document.getElementById('metric-applied-prepaids');
      const labelNextMonthEl = document.getElementById('label-next-month');

      if (metricProjectedDebtEl) {
        metricProjectedDebtEl.textContent = `S/ ${tarjetasCredito.deudaTotalProyectada.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
      }
      if (metricGrossTcEl) metricGrossTcEl.textContent = `S/ ${tarjetasCredito.nuevosConsumosCiclo.toFixed(2)}`;
      if (metricAppliedPrepaidsEl) metricAppliedPrepaidsEl.textContent = `-S/ ${tarjetasCredito.totalPrepagosAplicados.toFixed(2)}`;
      if (labelNextMonthEl) labelNextMonthEl.textContent = `Impacto en: ${mesSiguiente}`;

      // 3. TARJETA 3: CALENDARIO & ESTADO POR TARJETA (Pago individual y proyección)
      const cardsContainer = document.getElementById('cards-schedule-container');
      if (cardsContainer) {
        if (!tarjetasCredito.desgloseTarjetas || tarjetasCredito.desgloseTarjetas.length === 0) {
          cardsContainer.innerHTML = `<div class="text-sm text-slate-400 p-4 text-center">No hay tarjetas configuradas.</div>`;
        } else {
          cardsContainer.innerHTML = tarjetasCredito.desgloseTarjetas.map(card => {
            const factura = card.facturaMesActual || {
              deudaFacturada: 0,
              pagado: 0,
              pendiente: 0,
              fechaVencimiento: '',
              estado: 'SIN_DEUDA'
            };

            let facturaBadge = '';
            if (factura.estado === 'PAGADO') {
              facturaBadge = '<span class="text-[9px] px-1.5 py-0.5 rounded font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/30">✅ Pagado este mes</span>';
            } else if (factura.pendiente > 0) {
              facturaBadge = `<span class="text-[9px] px-1.5 py-0.5 rounded font-bold bg-purple-900/80 text-purple-200 border border-purple-400/40">Vence: ${factura.fechaVencimiento || 'Este mes'}</span>`;
            } else {
              facturaBadge = '<span class="text-[9px] px-1.5 py-0.5 rounded font-bold bg-slate-800 text-slate-400">Sin Factura</span>';
            }

            return `
              <div class="p-3.5 rounded-2xl glass-panel border border-slate-700/50 flex flex-col gap-3">
                <!-- Cabecera de la tarjeta -->
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2.5">
                    <div class="w-3.5 h-3.5 rounded-full" style="background-color: ${card.colorHex}"></div>
                    <div>
                      <h4 class="font-bold text-sm text-slate-100">${card.nombre}</h4>
                      <p class="text-[11px] text-slate-400">Corte: día ${card.diaCorte} • Vence: día ${card.diaVencimiento}</p>
                    </div>
                  </div>
                  <button class="btn-quick-prepay bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold py-1.5 px-3 rounded-xl border border-amber-500/30 flex items-center gap-1 active:scale-95 transition" data-card-id="${card.id}">
                    ⚡ Prepagar
                  </button>
                </div>

                <!-- 1. FACTURA ESTE MES (Pago por Tarjeta) -->
                <div class="bg-purple-950/25 border border-purple-500/25 rounded-xl p-2.5 space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1">
                      <span>💳</span> Factura Este Mes (${mesActual})
                    </span>
                    ${facturaBadge}
                  </div>
                  <div class="grid grid-cols-3 gap-2 bg-slate-900/40 p-2 rounded-lg text-center">
                    <div>
                      <span class="text-[9px] text-slate-400 block uppercase">Facturado</span>
                      <span class="text-xs font-bold text-slate-200">S/ ${factura.deudaFacturada.toFixed(2)}</span>
                    </div>
                    <div>
                      <span class="text-[9px] text-emerald-400 block uppercase">Pagado</span>
                      <span class="text-xs font-bold text-emerald-300">S/ ${factura.pagado.toFixed(2)}</span>
                    </div>
                    <div>
                      <span class="text-[9px] text-purple-400 block uppercase">Por Pagar</span>
                      <span class="text-xs font-extrabold text-purple-200">S/ ${factura.pendiente.toFixed(2)}</span>
                    </div>
                  </div>
                  ${factura.pendiente > 0 ? `
                    <button class="btn-card-pay-action w-full py-2 px-3 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-purple-900/40 active:scale-95 transition cursor-pointer" data-card-id="${card.id}" data-amount="${factura.pendiente}">
                      <span>💳</span> Pagar ${card.nombre} (S/ ${factura.pendiente.toFixed(2)})
                    </button>
                  ` : ''}
                </div>

                <!-- 2. PROYECCIÓN PRÓXIMO MES (Suma Total) -->
                <div class="space-y-1.5 pt-0.5">
                  <div class="flex items-center justify-between text-[10px] text-sky-400 font-semibold uppercase tracking-wider">
                    <span>🔮 Próximo Mes (${mesSiguiente})</span>
                    <span class="text-slate-400 font-normal">Vence: ${card.fechaVencimientoProxima}</span>
                  </div>
                  <div class="grid grid-cols-3 gap-2 bg-slate-900/50 p-2 rounded-xl text-center">
                    <div>
                      <span class="text-[10px] text-slate-400 uppercase tracking-wider block">Consumos</span>
                      <span class="text-xs font-bold text-slate-200">S/ ${card.consumosCiclo.toFixed(2)}</span>
                    </div>
                    <div>
                      <span class="text-[10px] text-amber-400 uppercase tracking-wider block">Prepagado</span>
                      <span class="text-xs font-bold text-amber-300">-S/ ${card.prepagosCiclo.toFixed(2)}</span>
                    </div>
                    <div>
                      <span class="text-[10px] text-rose-400 uppercase tracking-wider block">Por Pagar</span>
                      <span class="text-xs font-extrabold text-rose-300">S/ ${card.deudaNetaProyectada.toFixed(2)}</span>
                    </div>
                  </div>

                  <!-- Barra de amortización -->
                  <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                    <div class="bg-amber-400 h-full rounded-full transition-all duration-500" style="width: ${card.porcentajeAmortizado}%"></div>
                  </div>
                  <div class="flex justify-between text-[10px] text-slate-400">
                    <span>${card.porcentajeAmortizado}% amortizado por prepagos</span>
                    <span>Límite: S/ ${(card.limiteCredito || 0).toLocaleString()}</span>
                  </div>
                </div>

                <!-- 3. LÍNEA DE CRÉDITO Y CUOTAS FUTURAS -->
                <div class="bg-slate-900/60 border border-slate-700/60 rounded-xl p-2.5 space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1">
                      <span>📊</span> Línea de Crédito
                    </span>
                    <span class="text-[10px] font-bold ${card.porcentajeLineaUtilizada >= 90 ? 'text-rose-400' : (card.porcentajeLineaUtilizada >= 70 ? 'text-amber-400' : 'text-emerald-400')}">
                      ${card.porcentajeLineaUtilizada || 0}% ocupada
                    </span>
                  </div>

                  <div class="grid grid-cols-3 gap-2 bg-slate-950/60 p-2 rounded-lg text-center">
                    <div>
                      <span class="text-[9px] text-slate-400 block uppercase">Límite</span>
                      <span class="text-xs font-bold text-slate-200">S/ ${(card.limiteCredito || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div>
                      <span class="text-[9px] ${(card.porcentajeLineaUtilizada >= 70) ? 'text-amber-400' : 'text-slate-300'} block uppercase">Ocupada</span>
                      <span class="text-xs font-bold ${(card.porcentajeLineaUtilizada >= 90) ? 'text-rose-400' : ((card.porcentajeLineaUtilizada >= 70) ? 'text-amber-400' : 'text-slate-200')}">
                        S/ ${(card.lineaUtilizada || 0).toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span class="text-[9px] text-emerald-400 block uppercase">Disponible</span>
                      <span class="text-xs font-extrabold text-emerald-300">S/ ${(card.lineaDisponible || 0).toFixed(2)}</span>
                    </div>
                  </div>

                  <!-- Barra de uso de línea con semáforo -->
                  <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500 ${(card.porcentajeLineaUtilizada >= 90) ? 'bg-rose-500' : ((card.porcentajeLineaUtilizada >= 70) ? 'bg-amber-400' : 'bg-emerald-500')}" 
                      style="width: ${card.porcentajeLineaUtilizada || 0}%"></div>
                  </div>

                  <!-- Desglose de ocupación: Mes actual, Próximo mes y Cuotas futuras -->
                  <div class="flex flex-wrap items-center justify-between text-[10px] text-slate-400 gap-1 pt-0.5">
                    <span>Hoy: S/ ${(card.desgloseLinea ? card.desgloseLinea.pendienteMesActual : 0).toFixed(2)}</span>
                    <span>Próx: S/ ${(card.desgloseLinea ? card.desgloseLinea.proximoMes : 0).toFixed(2)}</span>
                    <span class="${(card.cuotasFuturasComprometidas > 0) ? 'text-amber-300 font-bold' : ''}">
                      Cuotas Futuras: S/ ${(card.cuotasFuturasComprometidas || 0).toFixed(2)}
                    </span>
                  </div>

                  <!-- Botón para Adelantar / Liquidar Cuotas -->
                  <button class="btn-open-liquidar-cuotas w-full py-1.5 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer" data-card-id="${card.id}">
                    <span>⚡</span> Adelantar / Liquidar Cuotas Futuras
                  </button>
                </div>
              </div>
            `;
          }).join('');

          // Asignar eventos a los botones rápidos de prepagar
          document.querySelectorAll('.btn-quick-prepay').forEach(btn => {
            btn.addEventListener('click', () => {
              const cardId = btn.getAttribute('data-card-id');
              this.openDrawer('Prepago_TC', cardId);
            });
          });

          // Asignar eventos a los botones de pagar factura por tarjeta
          document.querySelectorAll('.btn-card-pay-action').forEach(btn => {
            btn.addEventListener('click', () => {
              const cardId = btn.getAttribute('data-card-id');
              const amount = parseFloat(btn.getAttribute('data-amount')) || 0;
              this.openDrawer('Pago_TC_Vencida', cardId, amount);
            });
          });

          // Asignar eventos a los botones de adelantar/liquidar cuotas
          document.querySelectorAll('.btn-open-liquidar-cuotas').forEach(btn => {
            btn.addEventListener('click', () => {
              const cardId = btn.getAttribute('data-card-id');
              this.openLiquidarCuotasModal(cardId);
            });
          });
        }
      }

      // 4. GENERAR Y RENDERIZAR ALERTAS INTELIGENTES
      window.lastSummary = summary;
      const alertas = FinancialEngine.generarAlertasFinancieras(summary, new Date());
      this.renderAlerts(alertas);

      // 5. RENDERIZAR GRÁFICOS DE ANALÍTICA
      this.renderCharts(summary);

      // 6. RENDERIZAR PRESUPUESTOS E HISTORIAL DE AHORRO MENSUAL
      this.renderBudgetsProgress(summary.presupuestos);
      this.renderHistoricalSavings(summary.historicoAhorro);
    }

    // ==========================================================================
    // RENDERIZADO DEL CENTRO DE ALERTAS FINANCIERAS INTELIGENTES
    // ==========================================================================
    renderAlerts(alertas) {
      const badge = document.getElementById('alerts-count-badge');
      const container = document.getElementById('alerts-list-container');
      const quickBanner = document.getElementById('quick-alert-banner');

      if (badge) {
        if (alertas.length > 0) {
          badge.textContent = alertas.length;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }

      // Quick banner superior en la pestaña Dashboard
      if (quickBanner) {
        if (alertas.length > 0) {
          const topAlert = alertas[0];
          quickBanner.innerHTML = `
            <div class="flex items-center gap-2.5 overflow-hidden">
              <span class="text-xl flex-shrink-0">${topAlert.icono}</span>
              <div class="truncate">
                <p class="font-bold text-slate-100 text-xs truncate">${topAlert.titulo}</p>
                <p class="text-[10px] text-slate-400 truncate">${topAlert.mensaje}</p>
              </div>
            </div>
            <button onclick="UIManager.switchView('view-alerts')" class="flex-shrink-0 text-[11px] text-sky-300 font-bold bg-sky-950/70 border border-sky-500/40 px-2.5 py-1 rounded-xl hover:bg-sky-900/60 active:scale-95 transition whitespace-nowrap">
              Ver Alertas (${alertas.length})
            </button>
          `;
          quickBanner.classList.remove('hidden');
        } else {
          quickBanner.classList.add('hidden');
        }
      }

      if (!container) return;

      if (!alertas.length) {
        container.innerHTML = `
          <div class="p-8 text-center text-slate-400 glass-panel rounded-3xl border border-slate-800 space-y-2">
            <span class="text-4xl block mb-1">🎉</span>
            <p class="font-bold text-sm text-slate-200">¡Finanzas bajo control!</p>
            <p class="text-xs text-slate-400">No hay vencimientos inminentes, sobregiros ni alertas de liquidez pendientes para este ciclo.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = alertas.map(alert => {
        let borderClass = 'border-slate-700 bg-slate-900/60 text-slate-200';
        let badgeStyle = 'bg-slate-800 text-slate-300';

        if (alert.tipo === 'danger') {
          borderClass = 'border-rose-500/40 bg-rose-950/30 text-rose-200';
          badgeStyle = 'bg-rose-500/20 text-rose-300 border border-rose-500/30';
        } else if (alert.tipo === 'warning') {
          borderClass = 'border-amber-500/40 bg-amber-950/30 text-amber-200';
          badgeStyle = 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
        } else if (alert.tipo === 'tip') {
          borderClass = 'border-yellow-400/50 bg-yellow-950/30 text-yellow-100';
          badgeStyle = 'bg-yellow-400/20 text-yellow-300 border border-yellow-400/40';
        } else if (alert.tipo === 'success') {
          borderClass = 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200';
          badgeStyle = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        } else if (alert.tipo === 'info') {
          borderClass = 'border-sky-500/40 bg-sky-950/30 text-sky-200';
          badgeStyle = 'bg-sky-500/20 text-sky-300 border border-sky-500/30';
        }

        let actionHtml = '';
        if (alert.accion && alert.accion.tipo === 'Prepago_TC') {
          actionHtml = `
            <div class="pt-1">
              <button class="text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 py-1.5 px-3 rounded-xl flex items-center gap-1.5 active:scale-95 transition" onclick="UIManager.openDrawer('Prepago_TC', '${alert.accion.tarjetaId || ''}')">
                <span>⚡</span> Prepagar a esta Tarjeta
              </button>
            </div>
          `;
        }

        return `
          <div class="p-4 rounded-3xl glass-panel border ${borderClass} flex flex-col gap-2 shadow-xl">
            <div class="flex items-center justify-between">
              <span class="font-bold text-sm text-white flex items-center gap-2">
                <span>${alert.icono}</span> ${alert.titulo}
              </span>
              <span class="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full ${badgeStyle}">
                ${alert.tipo}
              </span>
            </div>
            <p class="text-xs text-slate-300 leading-relaxed">${alert.mensaje}</p>
            ${actionHtml}
          </div>
        `;
      }).join('');
    }

    // ==========================================================================
    // RENDERIZADO DE GRÁFICOS Y ANALÍTICA CON CHART.JS
    // ==========================================================================
    renderCharts(summary) {
      if (typeof Chart === 'undefined') {
        console.warn('[UI] Chart.js aún cargando...');
        return;
      }

      const { flujoEfectivo, tarjetasCredito, categorias } = summary;

      // 1. Estadísticas de Analítica
      const statSavings = document.getElementById('chart-stat-savings');
      const statTopCat = document.getElementById('chart-stat-top-cat');
      const statPrepaids = document.getElementById('chart-stat-prepaids');
      const catTotal = document.getElementById('chart-cat-total');

      const ratioAhorro = flujoEfectivo.ingresos > 0 
        ? Math.round((Math.max(0, flujoEfectivo.balanceLibreNeto) / flujoEfectivo.ingresos) * 100)
        : 0;

      if (statSavings) statSavings.textContent = `${ratioAhorro}%`;
      if (statPrepaids) statPrepaids.textContent = `S/ ${tarjetasCredito.totalPrepagosAplicados.toFixed(2)}`;

      // Mayor categoría de gasto
      const gastosCats = categorias.gastos || {};
      let maxCat = 'Ninguno';
      let maxMonto = 0;
      let totalGastado = 0;

      Object.entries(gastosCats).forEach(([cat, monto]) => {
        totalGastado += monto;
        if (monto > maxMonto) {
          maxMonto = monto;
          maxCat = cat;
        }
      });

      if (statTopCat) statTopCat.textContent = maxCat !== 'Ninguno' ? maxCat : 'Sin Gastos';
      if (catTotal) catTotal.textContent = `Total: S/ ${totalGastado.toFixed(2)}`;

      // 2. Gráfico de Dona: Gastos por Categoría
      const catCanvas = document.getElementById('chart-categories-canvas');
      const catLegend = document.getElementById('chart-categories-legend');

      if (catCanvas) {
        const labels = Object.keys(gastosCats);
        const dataValues = Object.values(gastosCats);

        const colors = [
          '#38bdf8', '#f43f5e', '#10b981', '#fbbf24', 
          '#a855f7', '#ec4899', '#f97316', '#06b6d4', '#64748b'
        ];

        if (this.categoryChart) {
          this.categoryChart.destroy();
        }

        if (labels.length === 0) {
          this.categoryChart = new Chart(catCanvas, {
            type: 'doughnut',
            data: {
              labels: ['Sin consumos registrados'],
              datasets: [{
                data: [1],
                backgroundColor: ['#334155'],
                borderWidth: 0
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } }
            }
          });
          if (catLegend) catLegend.innerHTML = `<span class="text-[11px] text-slate-500 col-span-2 text-center">Registra gastos para ver su distribución</span>`;
        } else {
          this.categoryChart = new Chart(catCanvas, {
            type: 'doughnut',
            data: {
              labels: labels,
              datasets: [{
                data: dataValues,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#0f172a'
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              cutout: '68%',
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) => ` S/ ${ctx.parsed.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`
                  }
                }
              },
              onClick: (evt, elements) => {
                if (elements && elements.length > 0) {
                  const idx = elements[0].index;
                  const cat = labels[idx];
                  if (cat) this.openDetalleCategoriaModal(cat);
                }
              }
            }
          });

          if (catLegend) {
            catLegend.innerHTML = labels.map((label, idx) => {
              const val = dataValues[idx];
              const pct = totalGastado > 0 ? Math.round((val / totalGastado) * 100) : 0;
              const color = colors[idx % colors.length];
              return `
                <button type="button" class="btn-inspect-category w-full flex items-center justify-between p-2 bg-slate-900/60 hover:bg-slate-800/80 rounded-xl border border-slate-800 hover:border-sky-500/40 cursor-pointer transition select-none text-left" data-inspect-cat="${label}" title="Toca para ver los gastos de ${label}">
                  <div class="flex items-center gap-2 truncate pointer-events-none">
                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${color}"></span>
                    <span class="text-slate-300 font-medium truncate text-xs">${label}</span>
                  </div>
                  <div class="flex items-center gap-1 flex-shrink-0 ml-1 pointer-events-none">
                    <span class="text-[11px] text-slate-400">S/ ${val.toFixed(2)}</span>
                    <span class="font-bold text-sky-400 text-xs">(${pct}%)</span>
                  </div>
                </button>
              `;
            }).join('');
          }
        }
      }

      // 3. Gráfico de Barras: Comparativa de Flujo Mensual
      const cashCanvas = document.getElementById('chart-cashflow-canvas');
      if (cashCanvas) {
        if (this.cashflowChart) {
          this.cashflowChart.destroy();
        }

        this.cashflowChart = new Chart(cashCanvas, {
          type: 'bar',
          data: {
            labels: ['Ingresos', 'Salidas Reales', 'Deuda TC Próxima'],
            datasets: [{
              label: 'Monto en Soles (S/)',
              data: [
                flujoEfectivo.ingresos,
                flujoEfectivo.totalSalidas,
                tarjetasCredito.deudaTotalProyectada
              ],
              backgroundColor: ['#10b981', '#f43f5e', '#38bdf8'],
              borderRadius: 10,
              borderSkipped: false
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => ` S/ ${ctx.parsed.y.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: '#94a3b8', font: { size: 10 } }
              },
              y: {
                grid: { color: 'rgba(255, 255, 255, 0.06)' },
                ticks: { color: '#94a3b8', font: { size: 10 } }
              }
            }
          }
        });
      }
    }

    // ==========================================================================
    // ==========================================================================
    // RENDERIZADO DE MOVIMIENTOS RECIENTES (Límite 5 más recientes por defecto)
    // ==========================================================================
    renderTransactionsList(transactions, currentFilter = 'ALL') {
      const container = document.getElementById('recent-transactions-list');
      const toggleContainer = document.getElementById('tx-toggle-container');
      const btnToggle = document.getElementById('btn-toggle-all-txs');
      if (!container) return;

      this.currentFilter = currentFilter;

      let filtered = (transactions || []).filter(t => {
        if (t.estado === 'LIQUIDADO' || t.estado === 'LIQUIDADA' || t.esLiquidado === true) return false;
        return true;
      });

      if (currentFilter !== 'ALL') {
        filtered = filtered.filter(t => t.tipo === currentFilter);
      }

      if (this.selectedCategoryFilter && this.selectedCategoryFilter !== 'ALL') {
        filtered = filtered.filter(t => {
          if (!t.categoria) return false;
          return t.categoria === this.selectedCategoryFilter ||
                 (window.FinancialEngine && window.FinancialEngine.sonCategoriasEquivalentes &&
                  window.FinancialEngine.sonCategoriasEquivalentes(t.categoria, this.selectedCategoryFilter));
        });
      }

      if (!filtered.length) {
        container.innerHTML = `
          <div class="text-center py-8 text-slate-400 text-sm">
            <span class="text-3xl block mb-2">📋</span>
            No hay transacciones registradas para este filtro.
          </div>
        `;
        if (toggleContainer) toggleContainer.classList.add('hidden');
        return;
      }

      // Ordenar cronológicamente descendente (más recientes primero)
      const sorted = [...filtered].sort((a, b) => {
        const dateA = (a.fecha || '') + ' ' + (a.hora || '00:00:00');
        const dateB = (b.fecha || '') + ' ' + (b.hora || '00:00:00');
        return dateB.localeCompare(dateA);
      });

      // Limitar a los 5 más recientes por defecto
      let itemsToShow = sorted;
      if (sorted.length > 5) {
        if (toggleContainer) toggleContainer.classList.remove('hidden');
        if (this.showAllTransactions) {
          itemsToShow = sorted;
          if (btnToggle) btnToggle.innerHTML = 'Mostrar solo los 5 más recientes';
        } else {
          itemsToShow = sorted.slice(0, 5);
          if (btnToggle) btnToggle.innerHTML = `👁️ Mostrar más movimientos (${sorted.length - 5} restantes)`;
        }
      } else {
        if (toggleContainer) toggleContainer.classList.add('hidden');
        itemsToShow = sorted;
      }

      const currentCalendarMonth = (window.FinancialEngine && window.FinancialEngine.obtenerMesImpacto)
        ? window.FinancialEngine.obtenerMesImpacto(new Date())
        : new Date().toISOString().slice(0, 7);
      const closedMonthsList = (window.AppState && window.AppState.closedMonths) || [];
      const closedMonthsSet = new Set(closedMonthsList.map(cm => (window.FinancialEngine && window.FinancialEngine.normalizarMes) ? window.FinancialEngine.normalizarMes(cm.mes) : cm.mes));

      container.innerHTML = itemsToShow.map(tx => {
        let badgeColor = 'bg-slate-700 text-slate-300';
        let sign = '';
        let amountColor = 'text-slate-100';
        let typeIcon = '💸';

        const txMes = (window.FinancialEngine && window.FinancialEngine.normalizarMes)
          ? window.FinancialEngine.normalizarMes(tx.fecha)
          : (tx.fecha ? tx.fecha.slice(0, 7) : '');
        const isPastOrClosed = (txMes && txMes < currentCalendarMonth) || closedMonthsSet.has(txMes);

        if (tx.tipo === 'Ingreso') {
          badgeColor = 'bg-emerald-950/60 border border-emerald-500/30 text-emerald-400';
          sign = '+';
          amountColor = 'text-emerald-400 font-bold';
          typeIcon = '📈';
        } else if (tx.tipo === 'Gasto_Directo') {
          badgeColor = 'bg-rose-950/60 border border-rose-500/30 text-rose-400';
          sign = '-';
          amountColor = 'text-rose-400 font-bold';
          typeIcon = '📉';
        } else if (tx.tipo === 'Consumo_TC') {
          badgeColor = 'bg-blue-950/60 border border-blue-500/30 text-blue-400';
          sign = '';
          amountColor = 'text-blue-400 font-semibold';
          typeIcon = '💳';
        } else if (tx.tipo === 'Prepago_TC') {
          badgeColor = 'bg-amber-950/60 border border-amber-500/30 text-amber-300';
          sign = '-';
          amountColor = 'text-amber-300 font-bold';
          typeIcon = '⚡';
        } else if (tx.tipo === 'Pago_TC_Vencida') {
          badgeColor = 'bg-purple-950/60 border border-purple-500/30 text-purple-300';
          sign = '-';
          amountColor = 'text-purple-300 font-bold';
          typeIcon = '🏦';
        }

        return `
          <div class="p-3 rounded-2xl glass-panel flex items-center justify-between border border-slate-800">
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-slate-800/80 flex-shrink-0">
                ${typeIcon}
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <button type="button" class="btn-inspect-category-btn font-bold text-sm text-slate-100 hover:text-sky-300 active:scale-95 transition flex items-center gap-1.5 cursor-pointer bg-transparent border-0 p-0 text-left" data-inspect-cat="${tx.categoria || tx.tipo}" title="Ver todos los gastos en ${tx.categoria || tx.tipo}">
                    <span class="pointer-events-none">${tx.categoria || tx.tipo}</span>
                    <span class="text-[10px] text-sky-400/80 bg-sky-950/60 px-1 py-0.2 rounded border border-sky-500/20 pointer-events-none">🔍</span>
                  </button>
                  <span class="text-[10px] px-2 py-0.5 rounded-md ${badgeColor}">${tx.tipo.replace('_', ' ')}</span>
                  ${(tx.totalCuotas && tx.totalCuotas > 1) ? `<span class="text-[10px] px-2 py-0.5 rounded-md bg-sky-950/80 border border-sky-500/40 text-sky-300 font-extrabold">Cuota ${tx.cuotaActual}/${tx.totalCuotas}</span>` : ''}
                </div>
                <p class="text-[11px] text-slate-400 truncate mt-0.5">
                  ${tx.fecha} • ${tx.tarjetaAfectada || tx.metodoPago || 'Efectivo'}
                  ${tx.mesImpactoTC ? `(Vence ${(window.FinancialEngine && window.FinancialEngine.normalizarMes) ? window.FinancialEngine.normalizarMes(tx.mesImpactoTC) : tx.mesImpactoTC})` : ''}
                  ${tx.notas ? `• <span class="text-slate-300">${tx.notas}</span>` : ''}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-3 flex-shrink-0 ml-2">
              <span class="text-sm ${amountColor}">
                ${sign}S/ ${(parseFloat(tx.monto) || 0).toFixed(2)}
              </span>
              ${isPastOrClosed ? `
                <span class="text-slate-600 text-xs p-1 select-none" title="Mes pasado o cerrado: solo editable en Google Sheet">🔒</span>
              ` : `
                <button class="btn-delete-tx text-slate-500 hover:text-rose-400 p-1 rounded active:scale-90 transition cursor-pointer" data-tx-id="${tx.id}" title="Eliminar">
                  ✕
                </button>
              `}
            </div>
          </div>
        `;
      }).join('');

      // Eventos de borrado
      container.querySelectorAll('.btn-delete-tx').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-tx-id');
          if (confirm('¿Eliminar este movimiento?')) {
            if (window.onDeleteTransaction) window.onDeleteTransaction(id);
          }
        });
      });
    }

    // ==========================================================================
    // RENDERIZADO DE PRESUPUESTOS POR CATEGORÍA
    // ==========================================================================
    renderBudgetsProgress(presupuestos = []) {
      const container = document.getElementById('budgets-progress-container');
      if (!container) return;

      if (!presupuestos || presupuestos.length === 0) {
        container.innerHTML = `
          <div class="text-center py-4 text-slate-500 text-xs">
            No hay presupuestos asignados. Presiona "Ajustar" para definir tus límites.
          </div>
        `;
        return;
      }

      container.innerHTML = presupuestos.map(p => {
        let barColor = 'bg-sky-500';
        let badgeBg = 'bg-sky-950/60 text-sky-400 border-sky-500/30';
        let statusBadge = `${p.porcentaje}%`;

        if (p.estado === 'exceeded') {
          barColor = 'bg-rose-500';
          badgeBg = 'bg-rose-950/80 text-rose-300 border-rose-500/50 animate-pulse';
          statusBadge = `🚨 ${p.porcentaje}% (Excedido)`;
        } else if (p.estado === 'danger') {
          barColor = 'bg-rose-500';
          badgeBg = 'bg-rose-950/60 text-rose-300 border-rose-500/40';
          statusBadge = `⚠️ ${p.porcentaje}%`;
        } else if (p.estado === 'warning') {
          barColor = 'bg-amber-500';
          badgeBg = 'bg-amber-950/60 text-amber-300 border-amber-500/30';
          statusBadge = `${p.porcentaje}%`;
        }

        const widthPercent = Math.min(100, Math.max(3, p.porcentaje));

        return `
          <button type="button" class="btn-inspect-category w-full text-left p-3 bg-slate-900/60 hover:bg-slate-800/80 active:scale-[0.99] rounded-2xl border border-slate-800 hover:border-sky-500/40 space-y-1.5 cursor-pointer transition select-none" data-inspect-cat="${p.categoria}" title="Toca para ver qué gastos suman este monto">
            <div class="flex items-center justify-between text-xs pointer-events-none">
              <div class="flex items-center gap-2 font-bold text-slate-200">
                <span>${p.categoria}</span>
                <span class="text-[10px] text-sky-300 font-semibold px-2 py-0.5 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center gap-1">
                  🔍 Ver detalle
                </span>
              </div>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-md border ${badgeBg}">
                ${statusBadge}
              </span>
            </div>

            <div class="w-full h-2 rounded-full bg-slate-800 overflow-hidden pointer-events-none">
              <div class="h-full rounded-full ${barColor} transition-all duration-500" style="width: ${widthPercent}%"></div>
            </div>

            <div class="flex items-center justify-between text-[11px] text-slate-400 pointer-events-none">
              <span>Gastado: <strong class="text-slate-200">S/ ${(parseFloat(p.gastado) || 0).toFixed(2)}</strong></span>
              <span>Límite: <strong class="text-slate-300">S/ ${(parseFloat(p.presupuesto) || 0).toFixed(2)}</strong></span>
            </div>
            ${p.restante > 0 ? `
              <p class="text-[10px] text-emerald-400/90 text-right font-medium pointer-events-none">Te quedan S/ ${(parseFloat(p.restante) || 0).toFixed(2)}</p>
            ` : p.excedido > 0 ? `
              <p class="text-[10px] text-rose-400 text-right font-medium pointer-events-none">Sobregiro de S/ ${(parseFloat(p.excedido) || 0).toFixed(2)}</p>
            ` : ''}
          </button>
        `;
      }).join('');

      container.querySelectorAll('.btn-inspect-category').forEach(el => {
        el.addEventListener('click', (e) => {
          let target = e.target;
          if (target && target.nodeType === 3) target = target.parentElement;
          const catEl = (target && typeof target.closest === 'function') ? target.closest('[data-categoria], [data-inspect-cat]') : el;
          const cat = (catEl ? (catEl.getAttribute('data-categoria') || catEl.getAttribute('data-inspect-cat')) : null) || el.getAttribute('data-categoria');
          if (cat) this.openDetalleCategoriaModal(cat);
        });
      });
    }

    // ==========================================================================
    // RENDERIZADO DE HISTORIAL DE AHORRO MENSUAL Y RESUMEN ANUAL
    // ==========================================================================
    renderHistoricalSavings(historicoAhorro, selectedYear = null) {
      const container = document.getElementById('historical-savings-container');
      const labelTotal = document.getElementById('label-total-savings-history');
      if (!container) return;

      const currentYear = selectedYear || (window.currentSavingsYear || new Date().getFullYear().toString());
      window.currentSavingsYear = currentYear;

      const resumenAnual = (typeof FinancialEngine !== 'undefined' && FinancialEngine.calcularResumenAnual)
        ? FinancialEngine.calcularResumenAnual(historicoAhorro, currentYear)
        : {
            anio: currentYear,
            totalIngresos: 0,
            totalSalidas: 0,
            totalAhorro: 0,
            tasaAhorroPromedio: 0,
            mesesCerradosCount: 0,
            meses: (historicoAhorro && historicoAhorro.todos) || []
          };

      // Actualizar tarjeta anual
      const yearDisplayEl = document.getElementById('savings-year-display');
      const annualSavingsEl = document.getElementById('annual-stat-savings');
      const annualRateEl = document.getElementById('annual-stat-rate');
      const annualClosedCountEl = document.getElementById('annual-stat-closed-count');
      const annualIncomeEl = document.getElementById('annual-stat-income');
      const annualOutflowsEl = document.getElementById('annual-stat-outflows');

      if (yearDisplayEl) yearDisplayEl.textContent = resumenAnual.anio;
      if (annualSavingsEl) {
        annualSavingsEl.textContent = `S/ ${resumenAnual.totalAhorro.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
        annualSavingsEl.className = resumenAnual.totalAhorro >= 0 ? 'text-base font-black text-emerald-400' : 'text-base font-black text-rose-400';
      }
      if (annualRateEl) {
        const projText = (resumenAnual.totalAhorroProyectado !== undefined && resumenAnual.totalAhorroProyectado !== 0)
          ? ` • Proy: S/ ${resumenAnual.totalAhorroProyectado.toFixed(2)}`
          : '';
        annualRateEl.textContent = `Tasa: ${resumenAnual.tasaAhorroPromedio}%${projText}`;
      }
      if (annualClosedCountEl) annualClosedCountEl.textContent = `${resumenAnual.mesesCerradosCount} / 12`;
      if (annualIncomeEl) annualIncomeEl.textContent = `S/ ${resumenAnual.totalIngresos.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
      if (annualOutflowsEl) annualOutflowsEl.textContent = `S/ ${resumenAnual.totalSalidas.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
      if (labelTotal) labelTotal.textContent = `Total Ahorro: S/ ${resumenAnual.totalAhorro.toFixed(2)}`;

      const mesesParaMostrar = (resumenAnual.meses && resumenAnual.meses.length > 0)
        ? resumenAnual.meses
        : ((historicoAhorro && historicoAhorro.todos) || []);

      if (!mesesParaMostrar.length) {
        container.innerHTML = `
          <div class="text-center py-6 text-slate-500 text-xs">
            No hay registros de ahorro para el año ${currentYear}.
          </div>
        `;
        return;
      }

      container.innerHTML = mesesParaMostrar.map(m => {
        const isClosed = m.esCerrado;
        const isProjected = m.esProyectado;
        const ahorroPositivo = m.ahorroNeto >= 0;
        let badgeClass = 'bg-sky-950/60 text-sky-300 border-sky-500/30';
        if (m.esCierreOficial || isClosed) {
          badgeClass = 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40';
        } else if (isProjected) {
          badgeClass = 'bg-purple-950/70 text-purple-300 border-purple-500/40';
        }
        const ahorroColor = ahorroPositivo ? 'text-emerald-400' : 'text-rose-400';
        const signoAhorro = ahorroPositivo ? '+' : '';

        const [anio, mesNum] = m.mes.split('-').map(Number);
        const nombresMeses = [
          'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        const mesNombre = `${nombresMeses[mesNum - 1] || m.mes} ${anio}`;

        return `
          <div class="p-3 rounded-2xl glass-panel border border-slate-800 flex items-center justify-between gap-2">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="font-bold text-sm text-slate-100">${mesNombre}</span>
                <span class="text-[10px] px-2 py-0.5 rounded-md border ${badgeClass}">
                  ${m.estadoTexto}
                </span>
              </div>
              <p class="text-[11px] text-slate-400">
                Ingresos: S/ ${m.ingresos.toFixed(2)} • Salidas: S/ ${m.salidas.toFixed(2)}
              </p>
            </div>
            <div class="flex items-center gap-3">
              <div class="text-right">
                <span class="text-sm font-extrabold ${ahorroColor} block">
                  ${signoAhorro}S/ ${m.ahorroNeto.toFixed(2)}
                </span>
                <span class="text-[10px] font-semibold text-slate-400">
                  Tasa: ${m.tasaAhorro}%
                </span>
              </div>
              <div>
                ${isProjected ? `
                  <span class="text-[10px] px-2 py-1 rounded-lg bg-purple-950/40 text-purple-300 border border-purple-800/40 font-semibold inline-block" title="Proyectado por sueldos futuros y cuotas TC">
                    🔮 Futuro
                  </span>
                ` : (m.esCierreOficial ? `
                  <button class="btn-reopen-month-row text-[10px] px-2 py-1 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 transition cursor-pointer" data-month="${m.mes}" title="Mes cerrado y guardado en Google Sheet. Clic para reabrir.">
                    🔓 Reabrir
                  </button>
                ` : `
                  <button class="btn-close-month-row text-[10px] px-2 py-1 rounded-lg bg-sky-600/80 hover:bg-sky-500 text-white font-bold transition cursor-pointer" data-month="${m.mes}" title="Cerrar periodo y registrar en Google Sheet">
                    🔒 Cerrar y Guardar
                  </button>
                `)}
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Asignar listeners a botones de cierre / reapertura en la lista
      container.querySelectorAll('.btn-close-month-row').forEach(btn => {
        btn.addEventListener('click', () => {
          const mes = btn.getAttribute('data-month');
          if (window.onTriggerCloseMonth) window.onTriggerCloseMonth(mes);
        });
      });

      container.querySelectorAll('.btn-reopen-month-row').forEach(btn => {
        btn.addEventListener('click', () => {
          const mes = btn.getAttribute('data-month');
          if (window.onTriggerReopenMonth) window.onTriggerReopenMonth(mes);
        });
      });
    }

    // ==========================================================================
    // MODAL DE CIERRE DE MES
    // ==========================================================================
    openCloseMonthModal(summary) {
      const modal = document.getElementById('modal-close-month');
      if (!modal || !summary) return;

      const { flujoEfectivo, mesActual } = summary;
      const [anio, mesNum] = mesActual.split('-').map(Number);
      const nombresMeses = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
      ];
      const mesNombre = `${nombresMeses[mesNum - 1] || mesActual} ${anio}`;

      const targetLabel = document.getElementById('close-month-target-label');
      const incEl = document.getElementById('close-modal-income');
      const expEl = document.getElementById('close-modal-expenses');
      const prepEl = document.getElementById('close-modal-prepayments');
      const tcEl = document.getElementById('close-modal-tc');
      const netEl = document.getElementById('close-modal-net-savings');
      const rateEl = document.getElementById('close-modal-savings-rate');

      if (targetLabel) targetLabel.textContent = `Periodo: ${mesNombre} (${mesActual})`;
      if (incEl) incEl.textContent = `+S/ ${flujoEfectivo.ingresos.toFixed(2)}`;
      if (expEl) expEl.textContent = `-S/ ${flujoEfectivo.gastosDirectos.toFixed(2)}`;
      if (prepEl) prepEl.textContent = `-S/ ${flujoEfectivo.prepagosRealizados.toFixed(2)}`;

      const tcComprometido = flujoEfectivo.facturacionTC ? flujoEfectivo.facturacionTC.salidaEfectiva : flujoEfectivo.pagosTCVencidas;
      if (tcEl) tcEl.textContent = `-S/ ${tcComprometido.toFixed(2)}`;
      if (netEl) {
        netEl.textContent = `S/ ${flujoEfectivo.balanceLibreNeto.toFixed(2)}`;
        netEl.className = flujoEfectivo.balanceLibreNeto >= 0 ? 'font-black text-emerald-400 text-base' : 'font-black text-rose-400 text-base';
      }
      if (rateEl) {
        const tasa = flujoEfectivo.ingresos > 0 ? Math.round((flujoEfectivo.balanceLibreNeto / flujoEfectivo.ingresos) * 100) : 0;
        rateEl.textContent = `${tasa}%`;
      }

      modal.classList.remove('hidden');
    }

    closeCloseMonthModal() {
      const modal = document.getElementById('modal-close-month');
      if (modal) modal.classList.add('hidden');
    }

    // ==========================================================================
    // MODAL DE PRESUPUESTOS POR CATEGORÍA
    // ==========================================================================
    openBudgetsModal(currentBudgets = []) {
      const modal = document.getElementById('budgets-modal');
      const formContainer = document.getElementById('budgets-form-container');
      if (!modal || !formContainer) return;

      const categories = (typeof FinancialEngine !== 'undefined' && FinancialEngine.CATEGORIAS_GASTO)
        ? FinancialEngine.CATEGORIAS_GASTO
        : [
            'Hogar', 'Servicios', 'Supermercado', 'Alimentación', 'Restaurantes',
            'Transporte', 'Suscripciones', 'Salud', 'Educación', 'Compras',
            'Tecnología', 'Entretenimiento', 'Otros Gastos'
          ];

      const budgetMap = {};
      currentBudgets.forEach(b => {
        budgetMap[b.categoria] = b.monto;
      });

      formContainer.innerHTML = categories.map(cat => {
        const val = budgetMap[cat] !== undefined ? budgetMap[cat] : 300;
        return `
          <div class="flex items-center justify-between gap-3 p-2 bg-slate-950/60 rounded-xl border border-slate-800">
            <label class="text-xs font-semibold text-slate-200 flex-1 truncate">${cat}</label>
            <div class="flex items-center gap-1 w-32">
              <span class="text-xs text-slate-400 font-bold">S/</span>
              <input type="number" step="10" min="0" data-cat="${cat}" value="${val}" 
                class="budget-input w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-right font-bold text-sky-300 focus:outline-none focus:border-sky-500">
            </div>
          </div>
        `;
      }).join('');

      modal.classList.remove('hidden');
    }

    closeBudgetsModal() {
      const modal = document.getElementById('budgets-modal');
      if (modal) modal.classList.add('hidden');
    }

    getBudgetsFromModal() {
      const inputs = document.querySelectorAll('.budget-input');
      const list = [];
      inputs.forEach(inp => {
        const cat = inp.getAttribute('data-cat');
        const val = parseFloat(inp.value) || 0;
        list.push({
          categoria: cat,
          monto: val,
          moneda: 'PEN'
        });
      });
      return list;
    }

    // ==========================================================================
    // RENDERIZADO DE MOVIMIENTOS RECURRENTES / FIJOS
    // ==========================================================================
    renderRecurrentesList(recurrentes = [], mesActual = null, estadoMesList = []) {
      window.cachedRecurrentes = recurrentes;
      window.cachedRecurrentesMes = mesActual;
      window.cachedRecurrentesEstadoMes = estadoMesList;

      const incomeListEl = document.getElementById('recurrentes-ingresos-list');
      const expenseListEl = document.getElementById('recurrentes-gastos-list');
      const totalIncomeEl = document.getElementById('rec-total-income');
      const totalExpenseEl = document.getElementById('rec-total-expenses');
      const netBalanceEl = document.getElementById('rec-net-balance');
      const countIncomeEl = document.getElementById('rec-income-count');
      const countExpenseEl = document.getElementById('rec-expense-count');

      const ingresos = recurrentes.filter(r => r.tipo === 'Ingreso_Fijo');
      const gastos = recurrentes.filter(r => r.tipo === 'Gasto_Fijo');

      // Calcular totales considerando el monto del mes (confirmado o proyectado)
      let sumIngresos = 0;
      ingresos.filter(r => r.activo).forEach(r => {
        const est = (estadoMesList || []).find(e => String(e.id) === String(r.id));
        sumIngresos += est ? (parseFloat(est.montoMes) || 0) : (parseFloat(r.monto) || 0);
      });

      let sumGastos = 0;
      gastos.filter(r => r.activo).forEach(r => {
        const est = (estadoMesList || []).find(e => String(e.id) === String(r.id));
        sumGastos += est ? (parseFloat(est.montoMes) || 0) : (parseFloat(r.monto) || 0);
      });

      const balanceFijo = sumIngresos - sumGastos;

      if (totalIncomeEl) totalIncomeEl.textContent = `+S/ ${sumIngresos.toFixed(2)}`;
      if (totalExpenseEl) totalExpenseEl.textContent = `-S/ ${sumGastos.toFixed(2)}`;
      if (netBalanceEl) {
        netBalanceEl.textContent = `${balanceFijo >= 0 ? '+' : ''}S/ ${balanceFijo.toFixed(2)}`;
        netBalanceEl.className = `font-extrabold text-sm ${balanceFijo >= 0 ? 'text-sky-300' : 'text-rose-400'}`;
      }
      if (countIncomeEl) countIncomeEl.textContent = `${ingresos.length} items (${ingresos.filter(r => r.activo).length} activos)`;
      if (countExpenseEl) countExpenseEl.textContent = `${gastos.length} items (${gastos.filter(r => r.activo).length} activos)`;

      const renderItem = (item, isIncome) => {
        const montoBase = parseFloat(item.monto) || 0;
        const colorClass = isIncome ? 'text-emerald-400' : 'text-rose-400';
        const sign = isIncome ? '+' : '-';
        const opacityClass = item.activo ? 'opacity-100' : 'opacity-50 grayscale';

        const est = (estadoMesList || []).find(e => String(e.id) === String(item.id));
        const estadoMes = est ? est.estadoMes : 'proyectado';
        const montoMes = est ? (parseFloat(est.montoMes) || montoBase) : montoBase;
        const esConfirmado = estadoMes === 'confirmado';

        const badgeHtml = !item.activo
          ? `<span class="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-500 font-semibold">Inactivo</span>`
          : (esConfirmado
            ? `<span class="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30 flex items-center gap-1">✓ Confirmado este mes: S/ ${montoMes.toFixed(2)}</span>`
            : `<span class="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30 flex items-center gap-1">⏳ Proyectado: S/ ${montoMes.toFixed(2)}</span>`
          );

        const confirmBtnHtml = item.activo
          ? `<button class="btn-confirm-rec text-[11px] font-bold py-1 px-2.5 rounded-xl border active:scale-95 transition ${esConfirmado ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30' : 'bg-sky-500/20 text-sky-300 border-sky-500/40 hover:bg-sky-500/30'}" data-rec-id="${item.id}" title="${esConfirmado ? 'Ajustar importe real para este mes' : 'Confirmar recibo/monto de este mes'}">
              ${esConfirmado ? '✏️ Ajustar' : '✓ Confirmar'}
             </button>`
          : '';

        return `
          <div class="p-3.5 rounded-2xl glass-panel border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${opacityClass} transition">
            <div class="flex items-center gap-3 flex-1 min-w-0">
              <button class="btn-toggle-rec text-lg p-1.5 rounded-xl flex-shrink-0 ${item.activo ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-800 text-slate-500'}" data-rec-id="${item.id}" title="${item.activo ? 'Desactivar' : 'Activar'}">
                ${item.activo ? '✓' : '○'}
              </button>
              <div class="truncate flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-bold text-sm text-slate-100 truncate">${item.nombre}</span>
                  <span class="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-semibold">${item.categoria}</span>
                  ${badgeHtml}
                </div>
                <p class="text-[11px] text-slate-400 truncate mt-0.5">
                  Base: S/ ${montoBase.toFixed(2)}/mes • Día ${item.diaMes || 1} • ${item.metodoPago || 'Efectivo'} ${item.notas ? `• ${item.notas}` : ''}
                </p>
              </div>
            </div>

            <div class="flex items-center justify-between sm:justify-end gap-2 flex-shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-800/50">
              <div class="text-right mr-1">
                <span class="text-xs text-slate-400 block">Este mes</span>
                <span class="text-sm font-black ${colorClass}">
                  ${sign}S/ ${montoMes.toFixed(2)}
                </span>
              </div>
              ${confirmBtnHtml}
              <button class="btn-edit-rec text-slate-400 hover:text-sky-400 p-1.5 rounded-lg active:scale-90 transition" data-rec-id="${item.id}" title="Editar configuración base">
                ⚙️
              </button>
              <button class="btn-delete-rec text-slate-500 hover:text-rose-400 p-1.5 rounded-lg active:scale-90 transition" data-rec-id="${item.id}" title="Eliminar">
                ✕
              </button>
            </div>
          </div>
        `;
      };

      if (incomeListEl) {
        incomeListEl.innerHTML = ingresos.length === 0
          ? `<p class="text-xs text-slate-500 p-3 text-center">No hay ingresos fijos configurados.</p>`
          : ingresos.map(r => renderItem(r, true)).join('');
      }

      if (expenseListEl) {
        expenseListEl.innerHTML = gastos.length === 0
          ? `<p class="text-xs text-slate-500 p-3 text-center">No hay gastos fijos configurados.</p>`
          : gastos.map(r => renderItem(r, false)).join('');
      }

      // Eventos de botones
      document.querySelectorAll('.btn-toggle-rec').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-rec-id');
          if (window.onToggleRecurrente) window.onToggleRecurrente(id);
        });
      });

      document.querySelectorAll('.btn-confirm-rec').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-rec-id');
          if (window.onConfirmRecurrenteClick) window.onConfirmRecurrenteClick(id);
        });
      });

      document.querySelectorAll('.btn-edit-rec').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-rec-id');
          const found = recurrentes.find(r => r.id === id);
          if (found) this.openRecurrenteModal(found);
        });
      });

      document.querySelectorAll('.btn-delete-rec').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-rec-id');
          if (confirm('¿Eliminar este movimiento fijo?')) {
            if (window.onDeleteRecurrente) window.onDeleteRecurrente(id);
          }
        });
      });
    }

    openRecurrenteModal(item = null) {
      const modal = document.getElementById('recurrente-modal');
      const title = document.getElementById('recurrente-modal-title');
      const idInput = document.getElementById('rec-id-input');
      const nombreInput = document.getElementById('rec-nombre-input');
      const tipoSelect = document.getElementById('rec-tipo-select');
      const montoInput = document.getElementById('rec-monto-input');
      const catSelect = document.getElementById('rec-categoria-select');
      const diaInput = document.getElementById('rec-dia-input');
      const metodoSelect = document.getElementById('rec-metodo-select');
      const notasInput = document.getElementById('rec-notas-input');
      const activoInput = document.getElementById('rec-activo-input');

      if (!modal) return;

      const updateCategoryOptions = (tipo) => {
        const cats = (tipo === 'Ingreso_Fijo')
          ? FinancialEngine.CATEGORIAS_INGRESO
          : FinancialEngine.CATEGORIAS_GASTO;
        catSelect.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
      };

      tipoSelect.onchange = () => {
        updateCategoryOptions(tipoSelect.value);
      };

      // Llenar métodos de pago disponibles (base + tarjetas configuradas)
      const paymentOpts = [...this.paymentMethods];
      if (this.cards && this.cards.length > 0) {
        this.cards.forEach(card => {
          if (!paymentOpts.includes(card.nombre)) paymentOpts.push(card.nombre);
        });
      }
      metodoSelect.innerHTML = paymentOpts.map(m => `<option value="${m}">${m}</option>`).join('');

      if (item) {
        title.innerHTML = '<span>⚙️</span> Editar Configuración Base';
        idInput.value = item.id || '';
        nombreInput.value = item.nombre || '';
        tipoSelect.value = item.tipo || 'Gasto_Fijo';
        updateCategoryOptions(tipoSelect.value);
        montoInput.value = item.monto || '';
        catSelect.value = item.categoria || (tipoSelect.value === 'Ingreso_Fijo' ? 'Sueldo' : 'Servicios');
        diaInput.value = item.diaMes || 1;
        metodoSelect.value = item.metodoPago || paymentOpts[0];
        notasInput.value = item.notas || '';
        activoInput.checked = item.activo !== false;
      } else {
        title.innerHTML = '<span>➕</span> Nuevo Movimiento Fijo';
        idInput.value = '';
        nombreInput.value = '';
        tipoSelect.value = 'Gasto_Fijo';
        updateCategoryOptions('Gasto_Fijo');
        montoInput.value = '';
        catSelect.value = 'Servicios';
        diaInput.value = 1;
        metodoSelect.value = paymentOpts[0];
        notasInput.value = '';
        activoInput.checked = true;
      }

      modal.classList.remove('hidden');
    }

    closeRecurrenteModal() {
      const modal = document.getElementById('recurrente-modal');
      if (modal) modal.classList.add('hidden');
    }

    getRecurrenteFromModal() {
      const idInput = document.getElementById('rec-id-input');
      const nombreInput = document.getElementById('rec-nombre-input');
      const tipoSelect = document.getElementById('rec-tipo-select');
      const montoInput = document.getElementById('rec-monto-input');
      const catSelect = document.getElementById('rec-categoria-select');
      const diaInput = document.getElementById('rec-dia-input');
      const metodoSelect = document.getElementById('rec-metodo-select');
      const notasInput = document.getElementById('rec-notas-input');
      const activoInput = document.getElementById('rec-activo-input');

      const nombre = (nombreInput.value || '').trim();
      const monto = parseFloat(montoInput.value) || 0;

      if (!nombre) {
        this.showToast('Ingresa un concepto o nombre', 'error');
        return null;
      }
      if (monto <= 0) {
        this.showToast('Ingresa un monto mayor a 0', 'error');
        return null;
      }

      return {
        id: idInput.value || ('REC-' + Date.now()),
        nombre: nombre,
        tipo: tipoSelect.value,
        monto: monto,
        categoria: catSelect.value,
        diaMes: parseInt(diaInput.value, 10) || 1,
        metodoPago: metodoSelect.value,
        notas: (notasInput.value || '').trim(),
        activo: activoInput.checked
      };
    }

    // ==========================================================================
    // MODAL DE CONFIRMACIÓN / AJUSTE MENSUAL DE RECIBOS
    // ==========================================================================
    openConfirmRecurrenteModal(item, mesActual, statusInfo = null) {
      const modal = document.getElementById('modal-confirm-recurrente');
      if (!modal || !item) return;

      const idInput = document.getElementById('confirm-rec-id');
      const mesLabel = document.getElementById('confirm-rec-mes-label');
      const nombreEl = document.getElementById('confirm-rec-nombre');
      const catBadge = document.getElementById('confirm-rec-categoria-badge');
      const baseInfo = document.getElementById('confirm-rec-base-info');
      const montoInput = document.getElementById('confirm-rec-monto-input');
      const fechaInput = document.getElementById('confirm-rec-fecha-input');
      const metodoSelect = document.getElementById('confirm-rec-metodo-select');

      if (idInput) idInput.value = item.id;
      if (mesLabel) mesLabel.textContent = `Ajustar importe real para el periodo: ${mesActual || ''}`;
      if (nombreEl) nombreEl.textContent = item.nombre;
      if (catBadge) catBadge.textContent = item.categoria;
      if (baseInfo) baseInfo.textContent = `Presupuesto habitual: S/ ${(parseFloat(item.monto) || 0).toFixed(2)}`;

      const montoInicial = statusInfo && statusInfo.montoMes != null
        ? statusInfo.montoMes
        : item.monto;
      if (montoInput) montoInput.value = montoInicial;

      // Fecha por defecto en el mes seleccionado
      const [anio, mesNum] = (mesActual || new Date().toISOString().slice(0, 7)).split('-').map(Number);
      const maxDiasMes = new Date(anio, mesNum, 0).getDate();
      const diaAjustado = Math.min(parseInt(item.diaMes, 10) || 1, maxDiasMes);
      const pad = (n) => String(n).padStart(2, '0');
      const fechaDefecto = `${anio}-${pad(mesNum)}-${pad(diaAjustado)}`;

      if (fechaInput) {
        fechaInput.value = (statusInfo && statusInfo.fechaConfirmada) ? statusInfo.fechaConfirmada : fechaDefecto;
      }

      // Llenar selector de método
      if (metodoSelect) {
        const paymentOpts = [...this.paymentMethods];
        if (this.cards && this.cards.length > 0) {
          this.cards.forEach(card => {
            if (!paymentOpts.includes(card.nombre)) paymentOpts.push(card.nombre);
          });
        }
        metodoSelect.innerHTML = paymentOpts.map(m => `<option value="${m}">${m}</option>`).join('');
        metodoSelect.value = item.metodoPago || paymentOpts[0];
      }

      modal.classList.remove('hidden');
      if (montoInput) {
        setTimeout(() => {
          montoInput.focus();
          montoInput.select();
        }, 100);
      }
    }

    closeConfirmRecurrenteModal() {
      const modal = document.getElementById('modal-confirm-recurrente');
      if (modal) modal.classList.add('hidden');
    }

    getConfirmRecurrenteData() {
      const idInput = document.getElementById('confirm-rec-id');
      const montoInput = document.getElementById('confirm-rec-monto-input');
      const fechaInput = document.getElementById('confirm-rec-fecha-input');
      const metodoSelect = document.getElementById('confirm-rec-metodo-select');

      const recurrenteId = (idInput?.value || '').trim();
      const monto = parseFloat(montoInput?.value) || 0;
      const fecha = (fechaInput?.value || '').trim();
      const metodoPago = (metodoSelect?.value || '').trim();

      if (!recurrenteId) {
        this.showToast('Error: falta el identificador del movimiento', 'error');
        return null;
      }
      if (monto <= 0) {
        this.showToast('Ingresa un monto válido mayor a 0', 'error');
        return null;
      }
      if (!fecha) {
        this.showToast('Selecciona la fecha del recibo', 'error');
        return null;
      }

      return {
        recurrenteId,
        monto,
        fecha,
        metodoPago
      };
    }

    // ==========================================================================
    // MODAL DE LIQUIDACIÓN / ADELANTO DE CUOTAS FUTURAS DE TARJETA
    // ==========================================================================
    openLiquidarCuotasModal(tarjetaId) {
      const modal = document.getElementById('modal-liquidar-cuotas');
      if (!modal) return;

      const cardIdInput = document.getElementById('liquidar-tarjeta-id');
      const labelTarjeta = document.getElementById('liquidar-tarjeta-label');
      const cardSummaryEl = document.getElementById('liquidar-card-summary');
      const cuotasListEl = document.getElementById('liquidar-cuotas-list');
      const cuentaOrigenSelect = document.getElementById('liquidar-cuenta-origen');
      const fechaInput = document.getElementById('liquidar-fecha-input');
      const totalComprasCountEl = document.getElementById('liquidar-total-compras-count');

      if (cardIdInput) cardIdInput.value = tarjetaId || '';

      // Obtener tarjeta desde el consolidado o caché
      const cardsList = (window.lastSummary && window.lastSummary.tarjetasCredito && window.lastSummary.tarjetasCredito.desgloseTarjetas) || this.cards || [];
      const card = cardsList.find(c => String(c.id).toLowerCase() === String(tarjetaId).toLowerCase()) || {
        id: tarjetaId,
        nombre: 'Tarjeta de Crédito',
        limiteCredito: 0,
        lineaUtilizada: 0,
        lineaDisponible: 0,
        cuotasFuturasComprometidas: 0
      };

      if (labelTarjeta) {
        labelTarjeta.textContent = `Extinguir cuotas futuras de ${card.nombre} con efectivo disponible este mes`;
      }

      // Resumen de línea en el modal
      if (cardSummaryEl) {
        cardSummaryEl.innerHTML = `
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-100">${card.nombre}</span>
            <span class="text-[11px] font-semibold text-slate-400">Límite: S/ ${(card.limiteCredito || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="grid grid-cols-3 gap-2 text-center pt-1">
            <div class="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
              <span class="text-[9px] text-slate-400 uppercase block">Ocupada</span>
              <span class="font-bold text-amber-300 text-xs">S/ ${(card.lineaUtilizada || 0).toFixed(2)}</span>
            </div>
            <div class="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
              <span class="text-[9px] text-emerald-400 uppercase block">Disponible</span>
              <span class="font-bold text-emerald-300 text-xs">S/ ${(card.lineaDisponible || 0).toFixed(2)}</span>
            </div>
            <div class="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
              <span class="text-[9px] text-amber-400 uppercase block">En Cuotas Futuras</span>
              <span class="font-bold text-amber-200 text-xs">S/ ${(card.cuotasFuturasComprometidas || 0).toFixed(2)}</span>
            </div>
          </div>
        `;
      }

      // Llenar selector de cuenta de origen
      if (cuentaOrigenSelect) {
        const paymentOpts = [...this.paymentMethods];
        cuentaOrigenSelect.innerHTML = paymentOpts.map(m => `<option value="${m}">${m}</option>`).join('');
      }

      // Fecha por defecto: hoy
      if (fechaInput) {
        fechaInput.value = new Date().toISOString().slice(0, 10);
      }

      // Obtener compras con cuotas pendientes posteriores al mes actual
      const mesActual = (window.lastSummary && window.lastSummary.mesActual) || new Date().toISOString().slice(0, 7);
      const allTxs = window.cachedTransactions || (typeof AppState !== 'undefined' ? AppState.transactions : []) || [];
      const comprasPendientes = (typeof FinancialEngine !== 'undefined' && FinancialEngine.obtenerComprasEnCuotasPendientes)
        ? FinancialEngine.obtenerComprasEnCuotasPendientes(allTxs, tarjetaId, mesActual)
        : [];

      if (totalComprasCountEl) {
        totalComprasCountEl.textContent = `${comprasPendientes.length} compra${comprasPendientes.length === 1 ? '' : 's'}`;
      }

      if (cuotasListEl) {
        if (comprasPendientes.length === 0) {
          cuotasListEl.innerHTML = `
            <div class="text-center py-6 px-4 bg-slate-950/40 rounded-2xl border border-dashed border-slate-800 space-y-1">
              <span class="text-2xl block">🎉</span>
              <p class="font-semibold text-slate-300">No hay compras en cuotas pendientes</p>
              <p class="text-[11px] text-slate-500">Esta tarjeta no tiene cuotas futuras pendientes para liquidar.</p>
            </div>
          `;
        } else {
          cuotasListEl.innerHTML = comprasPendientes.map(compra => {
            return `
              <div class="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2" data-compra-container="${compra.compraId}">
                <div class="flex items-center justify-between pb-1 border-b border-slate-800/80">
                  <div class="truncate mr-2">
                    <span class="font-bold text-slate-100 text-xs block truncate">${compra.descripcion || compra.categoria}</span>
                    <span class="text-[10px] text-slate-400">Total compra: S/ ${compra.montoTotalCompra.toFixed(2)} (${compra.cuotasRestantesCount} cuota${compra.cuotasRestantesCount === 1 ? '' : 's'} restante${compra.cuotasRestantesCount === 1 ? '' : 's'})</span>
                  </div>
                  <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="text-xs font-black text-amber-300">S/ ${compra.montoPendienteTotal.toFixed(2)}</span>
                    <button type="button" class="btn-toggle-compra-all text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-2 py-0.5 rounded font-bold transition cursor-pointer" data-compra-id="${compra.compraId}">
                      Todas
                    </button>
                  </div>
                </div>
                <div class="space-y-1.5">
                  ${compra.cuotas.map(c => {
                    const montoStr = (Math.abs(c.monto * 100 - Math.round(c.monto * 100)) > 0.0001)
                      ? Number(c.monto.toFixed(6)).toString()
                      : c.monto.toFixed(2);
                    const nCuota = c.cuotaActual || c.numeroCuota || 1;
                    const totCuota = c.totalCuotas || 1;

                    return `
                    <label class="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800/80 cursor-pointer border border-slate-800/60 transition">
                      <div class="flex items-center gap-2">
                        <input type="checkbox" class="cuota-item-checkbox rounded accent-amber-500 text-amber-500 focus:ring-0 w-4 h-4 cursor-pointer" 
                          data-tx-id="${c.id}" 
                          data-monto="${c.monto}" 
                          data-compra-id="${compra.compraId}">
                        <span class="text-xs font-semibold text-slate-200">Cuota ${nCuota}/${totCuota}</span>
                        <span class="text-[10px] text-sky-400 font-mono bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-800/40">${c.mesImpactoTC}</span>
                      </div>
                      <span class="text-xs font-bold text-amber-300">S/ ${montoStr}</span>
                    </label>
                  `;}).join('')}
                </div>
              </div>
            `;
          }).join('');

          // Listeners de checkboxes de cuotas
          cuotasListEl.querySelectorAll('.cuota-item-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
              this.updateLiquidarPreviewTotal();
            });
          });

          // Listener de botón "Todas" por compra
          cuotasListEl.querySelectorAll('.btn-toggle-compra-all').forEach(btn => {
            btn.addEventListener('click', () => {
              const compraId = btn.getAttribute('data-compra-id');
              const checkboxes = cuotasListEl.querySelectorAll(`.cuota-item-checkbox[data-compra-id="${compraId}"]`);
              const someUnchecked = Array.from(checkboxes).some(cb => !cb.checked);
              checkboxes.forEach(cb => { cb.checked = someUnchecked; });
              this.updateLiquidarPreviewTotal();
            });
          });
        }
      }

      this.updateLiquidarPreviewTotal();
      modal.classList.remove('hidden');
    }

    closeLiquidarCuotasModal() {
      const modal = document.getElementById('modal-liquidar-cuotas');
      if (modal) modal.classList.add('hidden');
    }

    updateLiquidarPreviewTotal() {
      const previewEl = document.getElementById('liquidar-preview-total');
      const confirmBtn = document.getElementById('btn-confirm-liquidar');
      const checkboxes = document.querySelectorAll('.cuota-item-checkbox:checked');

      let sum = 0;
      checkboxes.forEach(cb => {
        sum += parseFloat(cb.getAttribute('data-monto')) || 0;
      });

      const sumDisplay = (Math.abs(sum * 100 - Math.round(sum * 100)) > 0.0001)
        ? Number(sum.toFixed(6)).toString()
        : sum.toFixed(2);

      if (previewEl) {
        previewEl.textContent = `S/ ${sumDisplay}`;
      }

      if (confirmBtn) {
        confirmBtn.disabled = sum <= 0;
      }
    }

    getLiquidarSelectedData() {
      const tarjetaId = document.getElementById('liquidar-tarjeta-id')?.value;
      const cuentaOrigen = document.getElementById('liquidar-cuenta-origen')?.value;
      const fecha = document.getElementById('liquidar-fecha-input')?.value;
      const checkboxes = document.querySelectorAll('.cuota-item-checkbox:checked');

      const cuotasSeleccionadas = Array.from(checkboxes).map(cb => ({
        id: cb.getAttribute('data-tx-id'),
        monto: parseFloat(cb.getAttribute('data-monto')) || 0,
        compraId: cb.getAttribute('data-compra-id')
      }));

      const totalMonto = Number(cuotasSeleccionadas.reduce((acc, c) => acc + c.monto, 0).toFixed(4));

      return {
        tarjetaId,
        cuentaOrigen,
        fecha,
        cuotasSeleccionadas,
        totalMonto
      };
    }

    openDetalleCategoriaModal(categoria, periodo = 'ACTUAL') {
      console.log('[LUPA v5.2] openDetalleCategoriaModal llamada con:', categoria, '| periodo:', periodo);
      const modal = document.getElementById('modal-detalle-categoria');
      if (!modal) {
        console.warn('[UI] Modal de detalle de categoría no encontrado en el DOM.');
        return;
      }

      // Mostrar modal inmediatamente para que el usuario vea respuesta visual
      modal.style.display = 'flex';

      if (!categoria) {
        console.warn('[LUPA v5.2] categoria es null/undefined — abortando renderizado interno');
        return;
      }

      this.currentDetalleCategoria = categoria;
      this.currentDetallePeriodo = periodo;

      try {
        const titleEl = document.getElementById('detalle-cat-title');
        const subtitleEl = document.getElementById('detalle-cat-subtitle');
        const iconEl = document.getElementById('detalle-cat-icon');
        const summaryEl = document.getElementById('detalle-cat-summary');
        const countEl = document.getElementById('detalle-cat-count');
        const listEl = document.getElementById('detalle-cat-movements-list');
        const footerTotalEl = document.getElementById('detalle-cat-total-footer');
        const mesPillEl = document.getElementById('detalle-cat-mes-pill');
        const todosPillEl = document.getElementById('detalle-cat-todos-pill');
        const btnActual = document.getElementById('btn-detalle-periodo-actual');
        const btnTodos = document.getElementById('btn-detalle-periodo-todos');

        const safeNum = (v) => {
          const parsed = parseFloat(v);
          return isNaN(parsed) ? 0 : parsed;
        };
        const safeFixed = (v) => safeNum(v).toFixed(2);

        const summary = window.lastSummary || {};
        const mesActual = summary.mesActual || (window.AppState && window.AppState.selectedMonth) || new Date().toISOString().slice(0, 7);
        const txs = summary.transaccionesConsolidadas || window.cachedTransactions || (window.AppState && window.AppState.transactions) || [];

        const mostrarTodos = (periodo === 'TODOS');

        // Obtener desglose desde el motor financiero
        let detalle = null;
        if (window.FinancialEngine && typeof window.FinancialEngine.obtenerDetalleGastosPorCategoria === 'function') {
          detalle = window.FinancialEngine.obtenerDetalleGastosPorCategoria(txs, categoria, mesActual, mostrarTodos);
        }
        if (!detalle) {
          detalle = {
            categoria: categoria || 'General',
            mes: mesActual,
            totalGastado: 0,
            movimientosCount: 0,
            movimientosHistoricoCount: 0,
            movimientos: []
          };
        }

        // Estilos y textos de selector de periodos
        if (mesPillEl) mesPillEl.textContent = mesActual;
        if (todosPillEl) todosPillEl.textContent = detalle.movimientosHistoricoCount || 0;

        if (btnActual && btnTodos) {
          if (mostrarTodos) {
            btnActual.className = 'flex-1 py-1.5 rounded-lg font-semibold text-slate-400 hover:text-slate-200 transition text-center cursor-pointer';
            btnTodos.className = 'flex-1 py-1.5 rounded-lg font-bold bg-sky-600 text-white transition text-center cursor-pointer shadow-sm';
          } else {
            btnActual.className = 'flex-1 py-1.5 rounded-lg font-bold bg-sky-600 text-white transition text-center cursor-pointer shadow-sm';
            btnTodos.className = 'flex-1 py-1.5 rounded-lg font-semibold text-slate-400 hover:text-slate-200 transition text-center cursor-pointer';
          }
        }

        // Buscar si tiene presupuesto configurado
        const catNorm = (categoria || '').trim().toLowerCase();
        const presupuesto = (summary.presupuestos || []).find(p => {
          if (!p || !p.categoria) return false;
          const pNorm = p.categoria.trim().toLowerCase();
          return pNorm === catNorm || 
                 (window.FinancialEngine && window.FinancialEngine.sonCategoriasEquivalentes && 
                  window.FinancialEngine.sonCategoriasEquivalentes(p.categoria, categoria));
        }) || null;

        if (titleEl) titleEl.textContent = detalle.categoria || categoria;
        if (subtitleEl) subtitleEl.textContent = mostrarTodos 
          ? `Mostrando histórico acumulado de todos los meses`
          : `Periodo actual: ${mesActual || 'Mes en curso'}`;

        // Iconos representativos por categoría
        const iconos = {
          'Supermercado': '🛒',
          'Restaurantes': '🍽️',
          'Alimentación': '🍲',
          'Servicios': '💡',
          'Transporte': '🚗',
          'Hogar': '🏠',
          'Educación': '📚',
          'Salud': '💊',
          'Compras': '🛍️',
          'Tecnología': '💻',
          'Suscripciones': '📺',
          'Entretenimiento': '🎬',
          'Otros Gastos': '📦'
        };
        if (iconEl) iconEl.textContent = iconos[detalle.categoria] || '📊';

        // Resumen del presupuesto
        if (summaryEl) {
          const totalGastadoVal = safeNum(detalle.totalGastado);
          if (presupuesto && !mostrarTodos) {
            const limiteVal = safeNum(presupuesto.limite != null ? presupuesto.limite : (presupuesto.presupuesto != null ? presupuesto.presupuesto : 0));
            const porcentajeVal = limiteVal > 0 ? Math.round((totalGastadoVal / limiteVal) * 100) : (totalGastadoVal > 0 ? 100 : 0);
            const restanteVal = limiteVal - totalGastadoVal;

            const isDanger = (presupuesto.estado === 'PELIGRO' || presupuesto.estado === 'exceeded' || presupuesto.estado === 'danger' || restanteVal < 0 || porcentajeVal >= 90);
            const isWarning = (presupuesto.estado === 'ALERTA' || presupuesto.estado === 'warning' || porcentajeVal >= 70);

            let badgeBg = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            let badgeText = `${porcentajeVal}% consumido`;
            let barBg = 'bg-emerald-400';
            if (isDanger) {
              badgeBg = 'bg-rose-500/20 text-rose-400 border-rose-500/30';
              barBg = 'bg-rose-500';
              badgeText = restanteVal < 0 ? `Excedido (+S/ ${safeFixed(Math.abs(restanteVal))})` : `${porcentajeVal}% consumido`;
            } else if (isWarning) {
              badgeBg = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
              barBg = 'bg-amber-400';
            }
            const widthPercent = Math.min(100, Math.max(2, porcentajeVal));

            summaryEl.innerHTML = `
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="text-slate-400 font-semibold">Presupuesto mensual:</span>
                <span class="text-slate-200 font-bold">S/ ${safeFixed(limiteVal)}</span>
              </div>
              <div class="flex items-center justify-between text-xs mb-2">
                <span class="text-slate-300 font-extrabold">Total gastado (${mesActual}):</span>
                <span class="text-white font-extrabold text-sm">S/ ${safeFixed(totalGastadoVal)}</span>
              </div>
              <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-1.5">
                <div class="${barBg} h-full rounded-full transition-all duration-500" style="width: ${widthPercent}%"></div>
              </div>
              <div class="flex items-center justify-between text-[11px]">
                <span class="text-slate-400">Disponible: <b class="${restanteVal < 0 ? 'text-rose-400' : 'text-emerald-400'}">S/ ${safeFixed(restanteVal)}</b></span>
                <span class="px-2 py-0.5 rounded border text-[10px] font-bold ${badgeBg}">${badgeText}</span>
              </div>
            `;
          } else {
            summaryEl.innerHTML = `
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-400 font-semibold">${mostrarTodos ? 'Gasto total histórico:' : `Total gastado en ${detalle.categoria}:`}</span>
                <span class="text-white font-extrabold text-sm">S/ ${safeFixed(totalGastadoVal)}</span>
              </div>
              <p class="text-[10px] text-slate-400 mt-1">${mostrarTodos ? 'Suma acumulada de todas las compras y gastos registrados' : 'Periodo activo ' + mesActual}</p>
            `;
          }
        }

        // Contador
        if (countEl) {
          const count = detalle.movimientosCount || (detalle.movimientos ? detalle.movimientos.length : 0);
          countEl.textContent = `${count} ${count === 1 ? 'gasto' : 'gastos'}`;
        }

        // Lista de movimientos contribuyentes
        if (listEl) {
          if (!detalle.movimientos || detalle.movimientos.length === 0) {
            if (!mostrarTodos && detalle.movimientosHistoricoCount > 0) {
              listEl.innerHTML = `
                <div class="p-4 text-center text-xs text-slate-300 bg-slate-950/70 rounded-2xl border border-sky-500/30 space-y-2.5">
                  <p class="font-bold text-slate-100 text-sm">No hay gastos en ${detalle.categoria} para ${mesActual}.</p>
                  <p class="text-xs text-slate-400">Se encontraron <strong class="text-sky-400">${detalle.movimientosHistoricoCount} gastos</strong> de esta categoría registrados en otros meses.</p>
                  <button type="button" onclick="window.UIManager.openDetalleCategoriaModal('${detalle.categoria}', 'TODOS')" class="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-md shadow-sky-600/30 transition active:scale-95 cursor-pointer inline-flex items-center gap-1.5">
                    <span>🔍</span> Ver los ${detalle.movimientosHistoricoCount} gastos históricos
                  </button>
                </div>
              `;
            } else {
              listEl.innerHTML = `
                <div class="p-4 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800/80">
                  No hay gastos registrados en ${detalle.categoria} ${mostrarTodos ? 'en ningún mes' : 'para ' + mesActual}.
                </div>
              `;
            }
          } else {
            listEl.innerHTML = detalle.movimientos.map(m => {
              const iconBadge = m.icono || (m.tipo === 'Consumo_TC' ? '💳' : (m.esFijo ? '⚙️' : '📉'));
              let badgeTipo = `<span class="text-[9px] px-1.5 py-0.5 rounded font-bold bg-slate-800 text-slate-300">${m.tipoLabel || 'Gasto'}</span>`;
              if (m.tipo === 'Consumo_TC') {
                badgeTipo = `<span class="text-[9px] px-1.5 py-0.5 rounded font-bold bg-purple-950 text-purple-300 border border-purple-500/30">💳 TC</span>`;
              } else if (m.esFijo) {
                badgeTipo = `<span class="text-[9px] px-1.5 py-0.5 rounded font-bold bg-sky-950 text-sky-300 border border-sky-500/30">⚙️ Fijo</span>`;
              }

              return `
                <div class="p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-900/80 border border-slate-800/80 flex items-center justify-between gap-2 transition">
                  <div class="flex items-center gap-2.5 min-w-0 flex-1">
                    <div class="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-sm flex-shrink-0">
                      ${iconBadge}
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="font-bold text-xs text-slate-200 truncate">${m.concepto || detalle.categoria}</span>
                        ${badgeTipo}
                        ${m.cuotaInfo ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/30 font-semibold">${m.cuotaInfo}</span>` : ''}
                      </div>
                      <div class="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                        <span class="font-semibold text-slate-300">📅 ${m.fecha || m.mes || 'Sin fecha'}</span>
                        <span>•</span>
                        <span class="truncate">🏦 ${m.origen || 'General'}</span>
                      </div>
                    </div>
                  </div>
                  <span class="text-xs font-black text-rose-400 flex-shrink-0 ml-2">
                    -S/ ${safeFixed(m.monto)}
                  </span>
                </div>
              `;
            }).join('');
          }
        }

        if (footerTotalEl) {
          footerTotalEl.textContent = `Total en ${detalle.categoria}: S/ ${safeFixed(detalle.totalGastado)}`;
        }

        // Mostrar modal infaliblemente
        modal.style.display = 'flex';
      } catch (err) {
        console.error('[UI] Error al desplegar detalle de categoría:', err);
        this.showToast(`Error al abrir detalle: ${err.message}`, 'error');
        modal.style.display = 'flex';
      }
    }

    closeDetalleCategoriaModal() {
      const modal = document.getElementById('modal-detalle-categoria');
      if (modal) {
        modal.style.display = 'none';
      }
    }

    // ==========================================================================
    // TOAST NOTIFICATIONS
    // ==========================================================================
    showToast(message, type = 'success') {
      const container = document.getElementById('toast-container');
      if (!container) return;

      const toast = document.createElement('div');
      let colors = 'bg-emerald-600 text-white border-emerald-500';
      if (type === 'error') colors = 'bg-rose-600 text-white border-rose-500';
      if (type === 'warning') colors = 'bg-amber-600 text-white border-amber-500';

      toast.className = `p-3.5 rounded-xl shadow-xl flex items-center gap-2 text-sm font-medium border ${colors} transform transition-all duration-300 translate-y-2 opacity-0`;
      toast.innerHTML = `<span>${type === 'success' ? '✓' : '⚠️'}</span><span>${message}</span>`;

      container.appendChild(toast);

      setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
      }, 10);

      setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
  }

  global.UIManager = new UIManager();
})(typeof window !== 'undefined' ? window : this);
