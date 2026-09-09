/**
 * api.js
 * Capa de Comunicación con Google Apps Script y Manejo de Cola Offline
 */

(function (global) {
  'use strict';

  const STORAGE_KEYS = {
    API_URL: 'finanzas_pwa_api_url',
    TRANSACTIONS: 'finanzas_pwa_txs',
    CARDS: 'finanzas_pwa_cards',
    BUDGETS: 'finanzas_pwa_budgets',
    RECURRENTES: 'finanzas_pwa_recurrentes',
    CLOSED_MONTHS: 'finanzas_pwa_meses_cerrados',
    OFFLINE_QUEUE: 'finanzas_pwa_offline_queue'
  };

  // URL predeterminada para sincronización automática en cualquier dispositivo (GitHub Pages)
  const DEFAULT_API_URL = '';

  // Datos semilla iniciales (sin gastos de prueba ficticios)
  const SEED_RECURRENTES = [];

  // Presupuestos predeterminados semilla (13 categorías maestras unificadas)
  const SEED_BUDGETS = [
    { categoria: 'Hogar', monto: 1400, moneda: 'PEN' },
    { categoria: 'Servicios', monto: 350, moneda: 'PEN' },
    { categoria: 'Supermercado', monto: 800, moneda: 'PEN' },
    { categoria: 'Alimentación', monto: 400, moneda: 'PEN' },
    { categoria: 'Restaurantes', monto: 300, moneda: 'PEN' },
    { categoria: 'Transporte', monto: 250, moneda: 'PEN' },
    { categoria: 'Suscripciones', monto: 100, moneda: 'PEN' },
    { categoria: 'Salud', monto: 200, moneda: 'PEN' },
    { categoria: 'Educación', monto: 200, moneda: 'PEN' },
    { categoria: 'Compras', monto: 300, moneda: 'PEN' },
    { categoria: 'Tecnología', monto: 200, moneda: 'PEN' },
    { categoria: 'Entretenimiento', monto: 200, moneda: 'PEN' },
    { categoria: 'Otros Gastos', monto: 200, moneda: 'PEN' }
  ];

  // Datos semilla iniciales si la app se abre por primera vez sin configurar Sheets
  const SEED_CARDS = [
    {
      id: 'TC_BCP',
      nombre: 'BCP Visa Signature',
      diaCorte: 20,
      diaVencimiento: 10,
      moneda: 'PEN',
      limiteCredito: 10000,
      colorHex: '#0033a0'
    },
    {
      id: 'TC_BBVA',
      nombre: 'BBVA Mastercard Black',
      diaCorte: 5,
      diaVencimiento: 25,
      moneda: 'PEN',
      limiteCredito: 8000,
      colorHex: '#004481'
    }
  ];

  class ApiService {
    constructor() {
      this.apiUrl = localStorage.getItem(STORAGE_KEYS.API_URL) || DEFAULT_API_URL || '';
      this.isOnline = navigator.onLine;

      // Escuchadores de conectividad
      window.addEventListener('online', () => {
        this.isOnline = true;
        console.log('[API] Conexión a Internet restablecida. Sincronizando cola...');
        this.syncOfflineQueue();
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        console.warn('[API] Dispositivo fuera de línea. Operando en modo Local/Offline.');
      });
    }

    getApiUrl() {
      return this.apiUrl;
    }

    setApiUrl(url) {
      this.apiUrl = (url || '').trim();
      localStorage.setItem(STORAGE_KEYS.API_URL, this.apiUrl);
    }

    getLocalBudgets() {
      const raw = localStorage.getItem(STORAGE_KEYS.BUDGETS);
      if (!raw) {
        localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(SEED_BUDGETS));
        return SEED_BUDGETS;
      }
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : SEED_BUDGETS;
      } catch (e) {
        return SEED_BUDGETS;
      }
    }

    setLocalBudgets(budgets) {
      localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(budgets));
    }

    async saveBudgets(budgets) {
      this.setLocalBudgets(budgets);
      if (!this.apiUrl || !this.isOnline) {
        return { success: true, offline: true, budgets };
      }
      try {
        await fetch(this.apiUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'saveBudgets', budgets: budgets })
        });
        return { success: true, budgets };
      } catch (err) {
        console.warn('[API] Error al guardar presupuestos en Sheets:', err);
        return { success: true, offline: true, budgets };
      }
    }

    getLocalRecurrentes() {
      const raw = localStorage.getItem(STORAGE_KEYS.RECURRENTES);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        // Filtrar y eliminar cualquier semilla de prueba demo ('REC-1' a 'REC-5')
        const cleaned = parsed.filter(r => {
          if (!r || !r.id) return false;
          const idStr = String(r.id);
          if (['REC-1', 'REC-2', 'REC-3', 'REC-4', 'REC-5'].includes(idStr)) return false;
          if (r.nombre && (r.nombre === 'Suscripciones Digitales' || r.nombre === 'Alquiler de Vivienda' || r.nombre === 'Servicios Luz y Agua' || r.nombre === 'Internet Hogar' || r.nombre === 'Sueldo Principal')) return false;
          return true;
        });
        if (cleaned.length !== parsed.length) {
          localStorage.setItem(STORAGE_KEYS.RECURRENTES, JSON.stringify(cleaned));
        }
        return cleaned;
      } catch (e) {
        return [];
      }
    }

    saveLocalRecurrentes(items) {
      localStorage.setItem(STORAGE_KEYS.RECURRENTES, JSON.stringify(items || []));
    }

    async saveRecurrente(item) {
      const list = this.getLocalRecurrentes();
      const idx = list.findIndex(r => r.id === item.id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...item };
      } else {
        if (!item.id) item.id = 'REC-' + Date.now();
        list.push(item);
      }
      this.saveLocalRecurrentes(list);

      if (!this.apiUrl || !this.isOnline) {
        return { success: true, offline: true, recurrente: item };
      }

      try {
        await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'saveRecurrente', recurrente: item }),
          redirect: 'follow'
        });
        return { success: true, recurrente: item };
      } catch (err) {
        console.warn('[API] Error al guardar recurrente en Sheets:', err);
        return { success: true, offline: true, recurrente: item };
      }
    }

    async deleteRecurrente(id) {
      const list = this.getLocalRecurrentes().filter(r => r.id !== id);
      this.saveLocalRecurrentes(list);

      if (!this.apiUrl || !this.isOnline) {
        return { success: true, localOnly: true };
      }

      try {
        await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'deleteRecurrente', id: id }),
          redirect: 'follow'
        });
        return { success: true };
      } catch (err) {
        console.warn('[API] Error al eliminar recurrente en Sheets:', err);
        return { success: true, localOnly: true };
      }
    }

    // ========================================================================
    // GESTIÓN DE MESES CERRADOS (HISTORIAL DE AHORRO)
    // ========================================================================
    getLocalClosedMonths() {
      const raw = localStorage.getItem(STORAGE_KEYS.CLOSED_MONTHS);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    }

    saveLocalClosedMonths(list) {
      localStorage.setItem(STORAGE_KEYS.CLOSED_MONTHS, JSON.stringify(list || []));
    }

    async fetchClosedMonths() {
      if (!this.apiUrl || !this.isOnline) {
        return this.getLocalClosedMonths();
      }

      try {
        const url = `${this.apiUrl}${this.apiUrl.includes('?') ? '&' : '?'}action=getClosedMonths`;
        const res = await fetch(url, { redirect: 'follow', cache: 'no-store' });
        const data = await res.json();
        if (data.success && Array.isArray(data.closedMonths)) {
          this.saveLocalClosedMonths(data.closedMonths);
          return data.closedMonths;
        }
      } catch (err) {
        console.warn('[API] Error al consultar closedMonths en Sheets:', err);
      }
      return this.getLocalClosedMonths();
    }

    async saveClosedMonth(monthData) {
      if (monthData && monthData.mes) {
        monthData.mes = String(monthData.mes).replace(/^'+/, '').trim();
      }
      const list = this.getLocalClosedMonths();
      const idx = list.findIndex(m => m.mes === monthData.mes);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...monthData };
      } else {
        list.push(monthData);
      }
      this.saveLocalClosedMonths(list);

      if (!this.apiUrl || !this.isOnline) {
        return { success: true, offline: true, monthData };
      }

      try {
        await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'saveClosedMonth', monthData: monthData }),
          redirect: 'follow'
        });
        return { success: true, monthData };
      } catch (err) {
        console.warn('[API] Error al guardar mes cerrado en Sheets:', err);
        return { success: true, offline: true, monthData };
      }
    }

    async reopenMonth(mesKey) {
      const cleanKey = String(mesKey || '').replace(/^'+/, '').trim();
      const list = this.getLocalClosedMonths().filter(m => m.mes !== cleanKey);
      this.saveLocalClosedMonths(list);

      if (!this.apiUrl || !this.isOnline) {
        return { success: true, localOnly: true };
      }

      try {
        await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'reopenMonth', mes: cleanKey }),
          redirect: 'follow'
        });
        return { success: true };
      } catch (err) {
        console.warn('[API] Error al reabrir mes en Sheets:', err);
        return { success: true, localOnly: true };
      }
    }

    async consolidatePastMonths() {
      if (!this.apiUrl || !this.isOnline) {
        return { success: true, count: 0, offline: true };
      }

      try {
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'consolidatePastMonths' }),
          redirect: 'follow'
        });
        return await response.json();
      } catch (err) {
        console.warn('[API] Error al consolidar meses pasados en Sheets:', err);
        return { success: false, error: err.message };
      }
    }

    getLocalCards() {
      const raw = localStorage.getItem(STORAGE_KEYS.CARDS);
      if (!raw) {
        localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify(SEED_CARDS));
        return SEED_CARDS;
      }
      try {
        return JSON.parse(raw);
      } catch (e) {
        return SEED_CARDS;
      }
    }

    saveLocalCards(cards) {
      localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify(cards));
    }

    getLocalTransactions() {
      const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      if (!raw) return [];
      try {
        return JSON.parse(raw);
      } catch (e) {
        return [];
      }
    }

    saveLocalTransactions(txs) {
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(txs));
    }

    getOfflineQueue() {
      const raw = localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
      if (!raw) return [];
      try {
        return JSON.parse(raw);
      } catch (e) {
        return [];
      }
    }

    addToOfflineQueue(action, payload) {
      const queue = this.getOfflineQueue();
      queue.push({ action, payload, queuedAt: new Date().toISOString() });
      localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
    }

    clearOfflineQueue() {
      localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify([]));
    }

    /**
     * Prueba de conectividad con la Web App de Apps Script
     */
    async testConnection(testUrl = null) {
      const url = testUrl || this.apiUrl;
      if (!url) {
        return { success: false, error: 'Ingresa la URL del Web App de Apps Script' };
      }

      try {
        const pingUrl = `${url}${url.includes('?') ? '&' : '?'}action=ping`;
        const res = await fetch(pingUrl, {
          method: 'GET',
          redirect: 'follow',
          cache: 'no-store'
        });
        const json = await res.json();
        return json;
      } catch (err) {
        return { success: false, error: 'No se pudo conectar: ' + err.message };
      }
    }

    /**
     * Obtiene datos completos (tarjetas y transacciones).
     * Si no hay red o la URL no está configurada, recurre al almacenamiento local.
     */
    async fetchAllData() {
      const localCards = this.getLocalCards();
      const localTxs = this.getLocalTransactions();
      const localBudgets = this.getLocalBudgets();
      const localRecurrentes = this.getLocalRecurrentes();
      const localClosedMonths = this.getLocalClosedMonths();

      if (!this.apiUrl || !this.isOnline) {
        return {
          cards: localCards,
          transactions: localTxs,
          budgets: localBudgets,
          recurrentes: localRecurrentes,
          closedMonths: localClosedMonths,
          source: 'local'
        };
      }

      try {
        const url = `${this.apiUrl}${this.apiUrl.includes('?') ? '&' : '?'}action=getAll`;
        const res = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          cache: 'no-store'
        });
        const data = await res.json();

        if (data.success) {
          const cards = data.cards && data.cards.length > 0 ? data.cards : localCards;
          const transactions = data.transactions || [];
          const budgets = data.budgets && data.budgets.length > 0 ? data.budgets : localBudgets;
          const recurrentes = data.recurrentes !== undefined ? data.recurrentes : localRecurrentes;
          const closedMonths = data.closedMonths !== undefined ? data.closedMonths : localClosedMonths;

          // Actualizar caché local
          this.saveLocalCards(cards);
          this.saveLocalTransactions(transactions);
          this.setLocalBudgets(budgets);
          this.saveLocalRecurrentes(recurrentes);
          this.saveLocalClosedMonths(closedMonths);

          return {
            cards: cards,
            transactions: transactions,
            budgets: budgets,
            recurrentes: recurrentes,
            closedMonths: closedMonths,
            source: 'remote'
          };
        } else {
          return { cards: localCards, transactions: localTxs, budgets: localBudgets, recurrentes: localRecurrentes, closedMonths: localClosedMonths, source: 'local_fallback' };
        }
      } catch (err) {
        console.warn('[API] Error al consultar Google Sheets, usando datos locales:', err);
        return { cards: localCards, transactions: localTxs, budgets: localBudgets, recurrentes: localRecurrentes, closedMonths: localClosedMonths, source: 'local_fallback' };
      }
    }

    /**
     * Guarda una transacción tanto en local como en Sheets
     */
    async saveTransaction(preparedTx) {
      // 1. Guardar de inmediato en localStorage para respuesta instantánea (optimistic UI)
      const localTxs = this.getLocalTransactions();
      localTxs.unshift(preparedTx);
      this.saveLocalTransactions(localTxs);

      // 2. Si no hay conexión o no hay API configurada, encolar
      if (!this.apiUrl || !this.isOnline) {
        this.addToOfflineQueue('addTransaction', preparedTx);
        return { success: true, savedLocally: true, offlineQueued: true };
      }

      // 3. Enviar a Google Apps Script
      try {
        const res = await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Usar text/plain evita preflight OPTIONS en Apps Script
          body: JSON.stringify({
            action: 'addTransaction',
            data: preparedTx
          }),
          redirect: 'follow'
        });
        const json = await res.json();
        return json;
      } catch (err) {
        console.warn('[API] Error al enviar a Sheets, guardado en cola offline:', err);
        this.addToOfflineQueue('addTransaction', preparedTx);
        return { success: true, savedLocally: true, offlineQueued: true };
      }
    }

    /**
     * Guarda un lote de transacciones (ej: cuotas sin intereses o fijos del mes)
     */
    async saveTransactions(txArray) {
      if (!Array.isArray(txArray) || txArray.length === 0) return { success: true };

      // 1. Guardar de inmediato localmente
      const localTxs = this.getLocalTransactions();
      localTxs.unshift(...txArray);
      this.saveLocalTransactions(localTxs);

      // 2. Si no hay conexión, encolar cada una
      if (!this.apiUrl || !this.isOnline) {
        txArray.forEach(tx => this.addToOfflineQueue('addTransaction', tx));
        return { success: true, savedLocally: true, offlineQueued: true, count: txArray.length };
      }

      // 3. Enviar a Apps Script vía batchSync
      try {
        const res = await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'batchSync',
            data: txArray
          }),
          redirect: 'follow'
        });
        const json = await res.json();
        return json;
      } catch (err) {
        console.warn('[API] Error al enviar lote a Sheets, guardado en cola offline:', err);
        txArray.forEach(tx => this.addToOfflineQueue('addTransaction', tx));
        return { success: true, savedLocally: true, offlineQueued: true, count: txArray.length };
      }
    }

    /**
     * Elimina una transacción local y remotamente
     */
    async deleteTransaction(txId) {
      const localTxs = this.getLocalTransactions();
      const updated = localTxs.filter(t => t.id !== txId);
      this.saveLocalTransactions(updated);

      if (!this.apiUrl || !this.isOnline) {
        this.addToOfflineQueue('deleteTransaction', { id: txId });
        return { success: true, localOnly: true };
      }

      try {
        const res = await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'deleteTransaction',
            id: txId
          }),
          redirect: 'follow'
        });
        return await res.json();
      } catch (err) {
        this.addToOfflineQueue('deleteTransaction', { id: txId });
        return { success: true, localOnly: true };
      }
    }

    /**
     * Sincroniza las transacciones pendientes guardadas en modo offline
     */
    async syncOfflineQueue() {
      const queue = this.getOfflineQueue();
      if (!queue.length || !this.apiUrl || !this.isOnline) return;

      console.log(`[API] Sincronizando ${queue.length} elementos pendientes...`);
      const pendingTxs = queue.filter(item => item.action === 'addTransaction').map(item => item.payload);

      if (pendingTxs.length > 0) {
        try {
          const res = await fetch(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'batchSync',
              data: pendingTxs
            }),
            redirect: 'follow'
          });
          const json = await res.json();
          if (json.success) {
            console.log('[API] ✅ Sincronización exitosa con Google Sheets');
            this.clearOfflineQueue();
            if (window.onSyncSuccess) window.onSyncSuccess(json.syncedCount);
          }
        } catch (err) {
          console.warn('[API] No se pudo sincronizar cola en este intento:', err);
        }
      }
    }
  }

  global.ApiService = new ApiService();
})(typeof window !== 'undefined' ? window : this);
