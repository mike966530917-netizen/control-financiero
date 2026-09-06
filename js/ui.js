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

      // Categorías por tipo
      this.categoriesByType = {
        Ingreso: ['Sueldo', 'Freelance', 'Venta', 'Inversión', 'Otros Ingresos'],
        Gasto_Directo: ['Alimentación', 'Transporte', 'Servicios', 'Hogar', 'Salud', 'Educación', 'Ocio', 'Otros'],
        Consumo_TC: ['Supermercado', 'Restaurantes', 'Tecnología', 'Viajes', 'Ropa', 'Suscripciones', 'Otros'],
        Prepago_TC: ['Amortización Capital', 'Prepago Voluntario', 'Reducción Saldo'],
        Pago_TC_Vencida: ['Liquidación Mensual', 'Pago Total Facturado']
      };

      this.paymentMethods = ['Efectivo', 'Débito BCP', 'Débito BBVA', 'Transferencia', 'Yape / Plin'];

      // Vistas y Gráficos
      this.currentView = 'view-dashboard';
      this.categoryChart = null;
      this.cashflowChart = null;
    }

    init() {
      this.setupNumpadEvents();
      this.setupDrawerEvents();
      this.setupTypeSelector();
      this.setupTabNavigation();
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
      const views = ['view-dashboard', 'view-charts', 'view-alerts'];
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
          btn.className = 'tab-nav-btn py-1.5 rounded-lg flex items-center justify-center gap-1.5 bg-sky-600 text-white shadow-sm transition';
        } else {
          btn.className = 'tab-nav-btn py-1.5 rounded-lg flex items-center justify-center gap-1.5 text-slate-400 hover:text-slate-200 transition';
        }
      });

      // Redibujar gráficos si se abre la pestaña de gráficos
      if (viewId === 'view-charts' && window.lastSummary) {
        setTimeout(() => this.renderCharts(window.lastSummary), 50);
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
      if (this.currentType === 'Ingreso') {
        if (cardContainer) cardContainer.classList.add('hidden');
        if (methodContainer) methodContainer.classList.remove('hidden');
      } else if (this.currentType === 'Gasto_Directo') {
        if (cardContainer) cardContainer.classList.add('hidden');
        if (methodContainer) methodContainer.classList.remove('hidden');
      } else if (this.currentType === 'Consumo_TC') {
        if (cardContainer) cardContainer.classList.remove('hidden');
        if (methodContainer) methodContainer.classList.add('hidden');
      } else if (this.currentType === 'Prepago_TC') {
        // En prepago se requieren AMBOS: la tarjeta que se amortiza y la cuenta de donde sale el dinero
        if (cardContainer) cardContainer.classList.remove('hidden');
        if (methodContainer) methodContainer.classList.remove('hidden');
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
        if (tarjeta) {
          const ciclo = FinancialEngine.calcularCicloTarjeta(this.selectedDate, tarjeta.diaCorte, tarjeta.diaVencimiento);
          previewBox.innerHTML = `
            <div class="text-xs text-blue-300">
              <p class="font-medium text-blue-400">💳 Consumo diferido (${tarjeta.nombre}):</p>
              <p>• <strong>NO</strong> resta efectivo hoy.</p>
              <p>• Corte: <strong>${ciclo.fechaCorte}</strong> | Se pagará el: <strong>${ciclo.fechaVencimiento}</strong> (Mes ${ciclo.mesImpactoTC}).</p>
            </div>
          `;
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

    openDrawer(preselectedType = null, preselectedCardId = null) {
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

      if (cardBalanceEl) {
        cardBalanceEl.textContent = `S/ ${flujoEfectivo.balanceLibreNeto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
        if (flujoEfectivo.balanceLibreNeto >= 0) {
          cardBalanceEl.className = 'text-3xl font-extrabold text-emerald-400';
        } else {
          cardBalanceEl.className = 'text-3xl font-extrabold text-rose-400';
        }
      }

      if (cardIncomeEl) cardIncomeEl.textContent = `+S/ ${flujoEfectivo.ingresos.toFixed(2)}`;
      if (cardOutflowsEl) cardOutflowsEl.textContent = `-S/ ${flujoEfectivo.gastosDirectos.toFixed(2)}`;
      if (cardPrepaidsCurrentEl) cardPrepaidsCurrentEl.textContent = `-S/ ${flujoEfectivo.prepagosRealizados.toFixed(2)}`;
      if (cardExpiredTcEl) cardExpiredTcEl.textContent = `-S/ ${flujoEfectivo.pagosTCVencidas.toFixed(2)}`;

      // 2. TARJETA 2: DEUDA PROYECTADA PRÓXIMO MES
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

      // 3. TARJETA 3: CALENDARIO & ESTADO DE TARJETAS
      const cardsContainer = document.getElementById('cards-schedule-container');
      if (cardsContainer) {
        if (!tarjetasCredito.desgloseTarjetas || tarjetasCredito.desgloseTarjetas.length === 0) {
          cardsContainer.innerHTML = `<div class="text-sm text-slate-400 p-4 text-center">No hay tarjetas configuradas.</div>`;
        } else {
          cardsContainer.innerHTML = tarjetasCredito.desgloseTarjetas.map(card => {
            return `
              <div class="p-3.5 rounded-2xl glass-panel border border-slate-700/50 flex flex-col gap-2.5">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2.5">
                    <div class="w-3.5 h-3.5 rounded-full" style="background-color: ${card.colorHex}"></div>
                    <div>
                      <h4 class="font-bold text-sm text-slate-100">${card.nombre}</h4>
                      <p class="text-[11px] text-slate-400">Corte: día ${card.diaCorte} • Vence: ${card.fechaVencimientoProxima}</p>
                    </div>
                  </div>
                  <button class="btn-quick-prepay bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold py-1.5 px-3 rounded-xl border border-amber-500/30 flex items-center gap-1 active:scale-95 transition" data-card-id="${card.id}">
                    ⚡ Prepagar
                  </button>
                </div>

                <div class="grid grid-cols-3 gap-2 bg-slate-900/50 p-2.5 rounded-xl text-center">
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
                <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div class="bg-amber-400 h-full rounded-full transition-all duration-500" style="width: ${card.porcentajeAmortizado}%"></div>
                </div>
                <div class="flex justify-between text-[10px] text-slate-400">
                  <span>${card.porcentajeAmortizado}% amortizado por prepagos</span>
                  <span>Límite: S/ ${card.limiteCredito.toLocaleString()}</span>
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
              }
            }
          });

          if (catLegend) {
            catLegend.innerHTML = labels.map((label, idx) => {
              const val = dataValues[idx];
              const pct = totalGastado > 0 ? Math.round((val / totalGastado) * 100) : 0;
              const color = colors[idx % colors.length];
              return `
                <div class="flex items-center justify-between p-2 bg-slate-900/60 rounded-xl border border-slate-800">
                  <div class="flex items-center gap-2 truncate">
                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${color}"></span>
                    <span class="text-slate-300 font-medium truncate text-xs">${label}</span>
                  </div>
                  <span class="font-bold text-slate-100 flex-shrink-0 ml-1 text-xs">${pct}%</span>
                </div>
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
    // RENDERIZADO DE MOVIMIENTOS RECIENTES
    // ==========================================================================
    renderTransactionsList(transactions, currentFilter = 'ALL') {
      const container = document.getElementById('recent-transactions-list');
      if (!container) return;

      let filtered = transactions;
      if (currentFilter !== 'ALL') {
        filtered = transactions.filter(t => t.tipo === currentFilter);
      }

      if (!filtered.length) {
        container.innerHTML = `
          <div class="text-center py-8 text-slate-400 text-sm">
            <span class="text-3xl block mb-2">📋</span>
            No hay transacciones registradas en este periodo.
          </div>
        `;
        return;
      }

      container.innerHTML = filtered.slice(0, 20).map(tx => {
        let badgeColor = 'bg-slate-700 text-slate-300';
        let sign = '';
        let amountColor = 'text-slate-100';
        let typeIcon = '💸';

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
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-slate-800/80">
                ${typeIcon}
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-bold text-sm text-slate-100">${tx.categoria || tx.tipo}</span>
                  <span class="text-[10px] px-2 py-0.5 rounded-md ${badgeColor}">${tx.tipo.replace('_', ' ')}</span>
                </div>
                <p class="text-[11px] text-slate-400">
                  ${tx.fecha} • ${tx.tarjetaAfectada || tx.metodoPago || 'Efectivo'}
                  ${tx.mesImpactoTC ? `(Vence ${(window.FinancialEngine && window.FinancialEngine.normalizarMes) ? window.FinancialEngine.normalizarMes(tx.mesImpactoTC) : tx.mesImpactoTC})` : ''}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-sm ${amountColor}">
                ${sign}S/ ${(parseFloat(tx.monto) || 0).toFixed(2)}
              </span>
              <button class="btn-delete-tx text-slate-500 hover:text-rose-400 p-1 rounded active:scale-90 transition" data-tx-id="${tx.id}" title="Eliminar">
                ✕
              </button>
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
          <div class="p-3 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-1.5">
            <div class="flex items-center justify-between text-xs">
              <span class="font-bold text-slate-200">${p.categoria}</span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-md border ${badgeBg}">
                ${statusBadge}
              </span>
            </div>

            <div class="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div class="h-full rounded-full ${barColor} transition-all duration-500" style="width: ${widthPercent}%"></div>
            </div>

            <div class="flex items-center justify-between text-[11px] text-slate-400">
              <span>Gastado: <strong class="text-slate-200">S/ ${p.gastado.toFixed(2)}</strong></span>
              <span>Límite: <strong class="text-slate-300">S/ ${p.presupuesto.toFixed(2)}</strong></span>
            </div>
            ${p.restante > 0 ? `
              <p class="text-[10px] text-emerald-400/90 text-right font-medium">Te quedan S/ ${p.restante.toFixed(2)}</p>
            ` : p.excedido > 0 ? `
              <p class="text-[10px] text-rose-400 text-right font-medium">Sobregiro de S/ ${p.excedido.toFixed(2)}</p>
            ` : ''}
          </div>
        `;
      }).join('');
    }

    // ==========================================================================
    // RENDERIZADO DE HISTORIAL DE AHORRO MENSUAL (MESES CERRADOS)
    // ==========================================================================
    renderHistoricalSavings(historicoAhorro) {
      const container = document.getElementById('historical-savings-container');
      const labelTotal = document.getElementById('label-total-savings-history');
      if (!container) return;

      if (!historicoAhorro || !historicoAhorro.todos || historicoAhorro.todos.length === 0) {
        container.innerHTML = `
          <div class="text-center py-4 text-slate-500 text-xs">
            Sin meses registrados aún.
          </div>
        `;
        if (labelTotal) labelTotal.textContent = 'Ahorro Cerrado: S/ 0.00';
        return;
      }

      if (labelTotal) {
        labelTotal.textContent = `Ahorro Cerrado: S/ ${historicoAhorro.totalAhorroCerrado.toFixed(2)}`;
      }

      container.innerHTML = historicoAhorro.todos.map(m => {
        const isClosed = m.esCerrado;
        const ahorroPositivo = m.ahorroNeto >= 0;
        const badgeClass = isClosed 
          ? 'bg-indigo-950/60 text-indigo-300 border-indigo-500/30' 
          : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30';
        const ahorroColor = ahorroPositivo ? 'text-emerald-400' : 'text-rose-400';
        const signoAhorro = ahorroPositivo ? '+' : '';

        // Formatear nombre de mes legible (ej. 2026-09 -> Septiembre 2026)
        const [anio, mesNum] = m.mes.split('-').map(Number);
        const nombresMeses = [
          'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        const mesNombre = `${nombresMeses[mesNum - 1] || m.mes} ${anio}`;

        return `
          <div class="p-3 rounded-2xl glass-panel border border-slate-800 flex items-center justify-between">
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
            <div class="text-right">
              <span class="text-sm font-extrabold ${ahorroColor} block">
                ${signoAhorro}S/ ${m.ahorroNeto.toFixed(2)}
              </span>
              <span class="text-[10px] font-semibold text-slate-400">
                Tasa: ${m.tasaAhorro}%
              </span>
            </div>
          </div>
        `;
      }).join('');
    }

    // ==========================================================================
    // MODAL DE PRESUPUESTOS POR CATEGORÍA
    // ==========================================================================
    openBudgetsModal(currentBudgets = []) {
      const modal = document.getElementById('budgets-modal');
      const formContainer = document.getElementById('budgets-form-container');
      if (!modal || !formContainer) return;

      const categories = [
        'Supermercado', 'Alimentación', 'Transporte', 'Servicios',
        'Suscripciones', 'Restaurantes', 'Compras', 'Salud', 'Entretenimiento', 'Varios'
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
