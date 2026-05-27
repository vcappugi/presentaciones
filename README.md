# 📊 Dashboard Corporativo de Presentaciones - Corporación BEL

Un sistema premium de analítica financiera y resumen ejecutivo corporativo, integrado en tiempo real con **Supabase** y potenciado con un **Asistente Financiero Avanzado impulsado por IA (Google Gemini)**.

El dashboard está diseñado con una interfaz moderna, limpia y responsiva (optimizada para dispositivos móviles y escritorio usando **Bootstrap 5**), soportando personalización dinámica de temas (Claro, Oscuro, Azul, Negro).

---

## ✨ Características Principales

### 📈 1. Resumen Ejecutivo (Dashboard Inicial)
* **Indicadores Clave (KPIs):** Visualización consolidada de Ingresos, Resultado Neto, Margen Neto General y conteo de empresas registradas.
* **Evolución Mensual de Ingresos:** Un gráfico de línea de ancho completo que unifica y consolida los ingresos históricos de todas las empresas cronológicamente.
* **Desempeño Comparativo:** Gráfico de barras de Ingresos vs. Resultado Neto y gráfico de torta de participación en ingresos por empresa.
* **Ranking de Empresas:** Tabla interactiva interactiva potenciada por **Bootstrap DataTables** con ordenamiento dinámico por Resultado Neto. Permite hacer clic en cualquier fila para profundizar en la ficha detallada de la empresa.

### 💼 2. Análisis del Capital de Trabajo (Actual e Histórico)
* **Estructura Corriente:** Visualización clara de Activos Corrientes, Pasivos Corrientes y Capital de Trabajo Neto.
* **Detalle Interactivo:** Desglose del Capital de Trabajo en menús colapsables según su clasificación.
* **Anexos Dinámicos de Cuentas:** Acceso inmediato mediante ventanas modales interactivas a los detalles de cuentas específicas (como el desglose de dinero exacto en cada caja/banco o las existencias de inventarios).
* **Evolución Histórica:** Gráfico de líneas mensual del comportamiento acumulado del Capital de Trabajo.

### 🤖 3. Análisis Financiero con IA (Gemini Financial Assistant)
* **Chat Inteligente:** Un chat interactivo integrado en el Panel Administrativo que actúa como un Asistente Contable y Financiero experto.
* **Inyección de Contexto en Tiempo Real:** El sistema extrae automáticamente los balances financieros de pérdidas y ganancias (GyP), los saldos del Capital de Trabajo y los anexos de cuentas de Supabase, los comprime y los inyecta en el prompt del sistema. La IA responde basándose **estrictamente** en las cifras reales de la organización.
* **Auto-Descubrimiento de Modelos (Model Resolver):** Consulta en tiempo real el catálogo autorizado de tu API Key para seleccionar de forma inteligente el modelo más eficiente y compatible de Gemini disponible (`gemini-1.5-flash`, `gemini-1.5-flash-8b`, `gemini-2.5-flash`, etc.).
* **Integración Segura:** Permite definir la Clave API de Gemini de manera fija en el archivo de configuración o configurarla temporalmente a nivel de navegador mediante `localStorage`.

### ⚙️ 4. Panel Administrativo Central
Módulos dedicados para gestionar los catálogos maestros y datos organizacionales:
* **Gestión de Empresas:** Registro, edición y asignación de planes.
* **Gestión de Periodos:** Apertura, cierre y control mensual.
* **Conceptos de Capital de Trabajo (CT):** Definición del orden y cuentas que estructuran el Capital de Trabajo.
* **Plan de Cuentas:** Administración detallada de las cuentas contables de la corporación.

---

## 🛠️ Tecnología Utilizada

* **Frontend:** HTML5, Javascript (Vanilla ES6), HSL CSS3.
* **Framework CSS:** Bootstrap 5 (Estilos premium fluidos y responsivos).
* **Gráficos:** Chart.js (Interactivos con Tooltips personalizados).
* **Tablas:** JQuery DataTables (Filtrado rápido, paginación y traducciones automáticas al español).
* **Backend de Datos:** Supabase (Consumido directamente vía REST API con tokens seguros).
* **Modelos de IA:** Google Gemini API (`v1beta` generateContent).

---

## ⚙️ Configuración y Despliegue

### 1. Requisitos de Configuración
Crea o edita el archivo [`config.js`](file:///Library/WebServer/Documents/presentaciones/config.js) en la raíz del proyecto para enlazar tu base de datos y tu IA:

```javascript
const CONFIG = {
    // Dirección URL de tu proyecto en Supabase
    SUPABASE_URL: 'https://tu-proyecto.supabase.co',

    // Clave Anónima / Pública de tu Supabase
    SUPABASE_KEY: 'tu-supabase-anon-key-aqui',

    // Clave API de Google Gemini (AI Studio)
    GEMINI_API_KEY: 'tu-gemini-api-key-aqui'
};
```

### 2. Despliegue Local
El proyecto es una aplicación web estática pura (no requiere servidores backend complejos o compilación). Puedes ejecutarlo:
* Utilizando la extensión **Live Server** en VS Code.
* Con cualquier servidor web básico como `nginx`, `Apache` o levantando un servidor local rápido con NodeJS/Python:
  ```bash
  # Con NodeJS (requiere tener instalado http-server globalmente)
  npx http-server -p 8080
  
  # Con Python 3
  python -m http-server 8080
  ```

---

## 🔒 Convenciones y Unidades
* **Moneda:** Todos los reportes, KPI Cards, gráficos y anexos detallados muestran valores expresados en **MM $ (Millones de Dólares)**.
* **Fórmulas Contables Claves Aplicadas:**
  * $\text{Utilidad Bruta} = \text{Ingresos} - \text{Costos}$
  * $\text{Resultado Neto} = \text{Utilidad Bruta} - \text{Gastos} + \text{Otros Ingresos} - \text{Otros Egresos}$
  * $\text{Margen Neto} = \frac{\text{Resultado Neto}}{\text{Ingresos Operacionales}} \times 100$
  * $\text{Capital de Trabajo Neto} = \text{Total Activos Corrientes} - \text{Total Pasivos Corrientes}$
