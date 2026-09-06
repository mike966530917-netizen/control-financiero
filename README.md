# 📱 Finanzas Pro PWA: Control de Flujo, Ciclos de Tarjetas & Prepagos Anticipados

Aplicación Web Progresiva (PWA) de alto rendimiento, optimizada para dispositivos móviles (smartphone) y conectada en tiempo real con **Google Sheets** como base de datos serverless mediante **Google Apps Script**.

---

## 🎯 1. Modelo de Negocio y Lógica Financiera

El sistema distingue de forma matemática entre la **Fecha de la Transacción** y la **Fecha del Flujo de Caja Real (Liquidación/Pago)**:

| Tipo | Flujo de Efectivo (Mes) | Deuda TC (Mes) | Comportamiento |
| :--- | :--- | :--- | :--- |
| **Ingreso** | Mes Actual ($M$) | N/A | Suma al balance de efectivo disponible. |
| **Gasto Directo** | Mes Actual ($M$) | N/A | Salida inmediata de dinero (Efectivo/Débito/Transferencia). |
| **Consumo TC** | N/A (Diferido) | Mes Vencimiento ($M+1$) | **NO** resta efectivo hoy. Incrementa la deuda proyectada para el ciclo. |
| **⚡ Prepago TC** | **Mes Actual ($M$)** | **Mes Vencimiento ($M+1$)** | **DOBLE IMPACTO**: Salida real de efectivo hoy y reduce la deuda a pagar el próximo mes. |
| **Pago TC Vencida** | Mes Actual ($M$) | Mes Vencimiento | Liquidación de la cuota facturada que venció en el mes actual. |

### Fórmulas del Sistema

1. **Balance Neto del Mes en Curso (Flujo Libre):**
   $$\text{Balance Neto} = \sum \text{Ingresos} - \Big(\sum \text{Gastos Directos} + \sum \text{Prepagos a TC} + \sum \text{Liquidación de TC Vencidas}\Big)$$

2. **Deuda Proyectada a Pagar el Mes Siguiente por Tarjeta:**
   $$\text{Deuda a Pagar} = \sum \text{Consumos en Ciclo} - \sum \text{Prepagos Aplicados a este Ciclo}$$

---

## 🏗️ 2. Arquitectura de Datos en Google Sheets

La base de datos se estructura en 3 pestañas principales:

### Pestaña `TRANSACCIONES`
| Columna | Descripción |
| :--- | :--- |
| `ID` | Identificador único (`TX-timestamp-rand`). |
| `Fecha` | Fecha de la operación (`YYYY-MM-DD`). |
| `Hora` | Hora del registro (`HH:mm:ss`). |
| `Tipo` | `Ingreso`, `Gasto_Directo`, `Consumo_TC`, `Prepago_TC`, `Pago_TC_Vencida`. |
| `Metodo_Pago` | `Efectivo`, `Débito BCP`, `Transferencia`, etc. |
| `Tarjeta_Afectada` | ID de la tarjeta (ej. `TC_BCP`). |
| `Categoria` | `Alimentación`, `Transporte`, `Sueldo`, etc. |
| `Monto` | Importe numérico en dos decimales. |
| `Moneda` | `PEN` (Soles) o `USD`. |
| `Mes_Impacto_Efectivo` | Mes donde se debita el dinero (`YYYY-MM`). |
| `Mes_Impacto_TC` | Mes donde vence el pago de la tarjeta (`YYYY-MM`). |
| `Notas` | Detalle opcional del movimiento. |

### Pestaña `TARJETAS_CONFIG`
| Columna | Descripción |
| :--- | :--- |
| `ID_Tarjeta` | Código identificador (ej. `TC_BCP`, `TC_BBVA`). |
| `Nombre_Tarjeta` | Nombre amigable (ej. `BCP Visa Signature`). |
| `Dia_Corte` | Día del mes en que corta el ciclo de facturación (ej. `20`). |
| `Dia_Vencimiento` | Día límite de pago en el mes de liquidación (ej. `10`). |
| `Moneda` | `PEN` / `USD`. |
| `Limite_Credito` | Línea de crédito disponible. |
| `Color_Hex` | Color identificador para la UI móvil. |

### Pestaña `CONSOLIDADO_MENSUAL`
Métricas consolidadas de: `Mes`, `Ingresos_Totales`, `Gastos_Directos`, `Prepagos_TC`, `TC_Vencidas_Pagadas`, `Flujo_Libre_Neto`, `Nuevos_Consumos_TC`, `Deuda_Proyectada_Mes_Siguiente`.

---

## 🚀 3. Guía de Despliegue Paso a Paso

### Paso 3.1: Configurar Google Sheets y Google Apps Script
1. Abre tu Google Drive y crea una nueva **Hoja de cálculo de Google** (nómbrala ej. *Mis Finanzas y Tarjetas*).
2. En el menú superior de la hoja, ve a **Extensiones** $\rightarrow$ **Apps Script**.
3. En el editor de Apps Script:
   - Borra el código existente en `Código.gs`.
   - Abre el archivo `c:/PROYECTOS/backend/Code.gs` de este repositorio, copia todo su contenido y pégalo en el editor.
4. Ejecuta la función de configuración inicial:
   - En el menú desplegable superior del editor, selecciona la función **`setupSheets`** y presiona **Ejecutar**.
   - Concede los permisos de lectura/escritura solicitados por Google.
   - ¡Listo! Revisa tu Google Sheet: se habrán creado y formateado automáticamente las 3 pestañas con colores, validaciones y tarjetas de ejemplo.
5. Publicar como Web API (Webhook):
   - Haz clic en el botón azul **Implementar** (arriba a la derecha) $\rightarrow$ **Nueva implementación**.
   - Tipo: Selecciona **Aplicación web** (ícono de engranaje).
   - Descripción: `API Finanzas PWA v1`.
   - Ejecutar como: **Yo (tu cuenta de correo)**.
   - Quién tiene acceso: **Cualquier persona** (*Anyone*).
   - Presiona **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).

---

### Paso 3.2: Configurar la PWA en el Celular
1. Abre la PWA en el navegador de tu celular:
   - Puedes alojar la carpeta `frontend/` de forma gratuita en servicios como **GitHub Pages**, **Vercel**, **Cloudflare Pages** o **Netlify**.
   - Si pruebas en tu red local: ejecuta un servidor estático (ej. `npx serve frontend` o la extensión *Live Server* de VS Code) y accede desde la IP local de tu PC en tu teléfono (ej. `http://192.168.1.50:5000/frontend`).
2. En la PWA, toca el ícono de **⚙️ Configuración** (esquina superior derecha).
3. Pega la **URL de la aplicación web** que copiaste en el Paso 3.1 y pulsa **Probar Conexión** $\rightarrow$ **Guardar y Sincronizar**.
4. Verás el indicador superior cambiar a **● Sheets Conectado**.

---

### Paso 3.3: Guardar como Acceso Directo / Instalar PWA
- **En Android (Google Chrome):**
  - Aparecerá el botón **📲 Instalar** en la parte superior, o toca el menú de tres puntos (⋮) $\rightarrow$ **Instalar aplicación** / **Agregar a la pantalla principal**.
- **En iOS (Safari):**
  - Toca el botón **Compartir** (cuadrado con flecha hacia arriba) $\rightarrow$ baja y selecciona **Agregar a pantalla de inicio** (Add to Home Screen).
  - La aplicación se abrirá a pantalla completa como una App nativa, sin barras del navegador y con soporte 100% offline.

---

## 📱 4. Experiencia de Usuario Móvil (3 Vistas con 1 Toque)

La PWA incluye una barra superior de navegación por pestañas optimizada para smartphone:

1. **Pestaña `📱 Dashboard` (Control Operativo Diario):**
   - **Banner de Alerta Superior:** Notificación destacada si hay un vencimiento urgente o un corte inminente.
   - **Tarjeta 1 (Flujo Disponible del Mes):** Saldo libre real tras salidas efectivas (gastos + prepagos hechos hoy + TC vencidas).
   - **Tarjeta 2 (Deuda Proyectada Tarjetas):** Total acumulado para el próximo mes, con el ahorro por prepagos.
   - **Tarjeta 3 (Calendario de Vencimientos por Tarjeta):** Días de corte, fecha límite de pago, barra de progreso y botón rápido **`⚡ Prepagar`**.
   - **Movimientos Registrados:** Filtros rápidos por tipo y opción de eliminar transacciones.

2. **Pestaña `📊 Gráficos` (Analítica Visual Interactiva):**
   - **Métricas:** Tasa de ahorro mensual (%), mayor categoría de gasto y monto amortizado por prepagos.
   - **Gráfico de Dona (Chart.js):** Distribución de tus gastos por categoría (*Alimentación, Transporte, Servicios, Ocio, etc.*) con leyenda y porcentajes interactivos.
   - **Gráfico de Barras (Chart.js):** Comparativa directa entre `Ingresos vs Salidas Reales vs Deuda Proyectada de TC`.

3. **Pestaña `🔔 Alertas` & Notificaciones Automáticas (Correo & WhatsApp):**
   - **Regla 1: Control de Gasto Progresivo (Umbral del 50% y +10% en cada aumento):**
     - El sistema no genera spam: no avisa en gastos menores al 50%.
     - En cuanto tus salidas efectivas (gastos directos + prepagos + cuotas vencidas) alcanzan o superan el **50%** de tus ingresos, se dispara la primera alerta.
     - Posteriormente, vuelve a alertar **únicamente en cada escalón del 10% adicional**: al **60%**, **70%**, **80%**, **90%** y **100%+**, informándote el saldo libre exacto restante.
   - **Regla 2: Vencimiento de Tarjetas a 5 Días:**
     - Alerta cuando faltan **$\le 5$ días** para la fecha límite de pago de cualquier tarjeta con saldo adeudado.
     - Muestra el saldo pendiente por liquidar y permite prepagar de inmediato.
   - **Notificaciones por Correo (Gmail):** Nativo y 100% gratuito. Envía un correo con diseño HTML elegante cada vez que se cruza un umbral o se acerca un vencimiento.
   - **Notificaciones por WhatsApp (CallMeBot / Twilio):** Envía un mensaje directo a tu WhatsApp personal con el detalle del gasto o recordatorio de la tarjeta.
   - **Disparador Programado (Trigger):** Se revisa en tiempo real al ingresar cada gasto y de forma programada todas las mañanas a las **8:00 AM**.

4. **Numpad Táctil Integrado (Bottom Drawer):**
   - Teclado grande tipo POS que evita la superposición del teclado virtual del móvil.
   - Selectores rápidos de 1 toque (`+ Ingreso`, `- Gasto`, `💳 Tarjeta`, `⚡ Prepago`).
   - Alerta dinámica en tiempo real que explica el impacto del movimiento antes de guardarlo.

5. **Cola Offline / Queue Sync:**
   - Si no tienes cobertura, registra tus transacciones normalmente; se guardan en el teléfono y se sincronizan solas con Google Sheets al recuperar señal.

---

## 🧪 5. Validación y Casos de Prueba (Test Cases)

Puedes verificar los resultados abriendo el archivo `test/test-runner.html` en cualquier navegador o ejecutando `node test/run-tests.js`:

### Caso 1: Caso Base (Flujo Normal)
- **Operaciones:**
  - Ingreso: `S/ 2,000.00`
  - Gasto en Efectivo: `S/ 100.00`
  - TC Mes Anterior vencida pagada hoy: `S/ 500.00`
- **Resultado Obtenido:**
  $$\text{Balance Libre Mes Actual} = 2000 - (100 + 500) = \mathbf{S/\ 1,400.00} \quad \text{✅}$$

### Caso 2: Caso con Prepago Anticipado (Doble Impacto)
- **Operaciones:**
  - Mismo mes base (Ingreso 2000, Gasto 100, TC vencida 500).
  - Nuevo consumo en TC (BCP): `S/ 600.00` (corte día 20, fecha 10 de sep $\rightarrow$ vence en octubre).
  - Prepago anticipado a TC (BCP): `S/ 100.00` con dinero de este mes.
- **Resultado en Mes Actual (Septiembre):**
  - Salidas efectivas: $100 \text{ (Gasto)} + 500 \text{ (TC Vencida)} + 100 \text{ (Prepago)} = S/\ 700.00$.
  - $$\text{Balance Libre Mes Actual} = 2000 - 700 = \mathbf{S/\ 1,300.00} \quad \text{✅}$$
- **Resultado en Mes Siguiente (Octubre):**
  - Consumo bruto ciclo: $S/\ 600.00$.
  - Amortización por prepago: $-S/\ 100.00$.
  - $$\text{Deuda Pendiente a Pagar} = 600 - 100 = \mathbf{S/\ 500.00} \quad \text{✅}$$
