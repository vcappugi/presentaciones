// Variables globales
let monthlyMetrics = {};
let mesesConsulta = [];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Obtener parámetros de la URL o localStorage
    const urlParams = new URLSearchParams(window.location.search);
    let valorEmpresa = urlParams.get('empresa');
    let valorPeriodo = urlParams.get('periodo');
    let valorDimension = urlParams.get('dimension');
    
    if (!valorEmpresa || !valorPeriodo || !valorDimension) {
        valorEmpresa = localStorage.getItem('bel_empresa');
        valorPeriodo = localStorage.getItem('bel_periodo');
        valorDimension = localStorage.getItem('bel_dimension') || 'REAL';
    } else {
        localStorage.setItem('bel_empresa', valorEmpresa);
        localStorage.setItem('bel_periodo', valorPeriodo);
        localStorage.setItem('bel_dimension', valorDimension);
    }

    const headerText = document.getElementById('header-empresa-periodo');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');

    // Validar parámetros
    if (!valorEmpresa || !valorPeriodo || !valorDimension) {
        errorEl.textContent = 'Faltan parámetros de filtro. Por favor, selecciona una empresa y un periodo desde la barra superior.';
        errorEl.classList.remove('hidden');
        loadingEl.style.display = 'none';
        return;
    }

    // Actualizar texto del encabezado
    if (headerText) {
        headerText.textContent = `| ${valorEmpresa} | ${valorPeriodo} (${valorDimension})`;
    }

    // 2. Determinar la lista de meses desde Enero hasta el mes seleccionado
    const MESES_ORDEN = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const partesPeriodo = valorPeriodo.split('-');
    
    if (partesPeriodo.length === 2) {
        const mesSeleccionado = partesPeriodo[0].toLowerCase();
        const año = partesPeriodo[1];
        const idx = MESES_ORDEN.indexOf(mesSeleccionado);
        
        if (idx !== -1) {
            mesesConsulta = [];
            const isUpper = partesPeriodo[0] === partesPeriodo[0].toUpperCase();
            const isCapitalized = partesPeriodo[0][0] === partesPeriodo[0][0].toUpperCase() && !isUpper;
            
            for (let i = 0; i <= idx; i++) {
                let m = MESES_ORDEN[i];
                if (isUpper) {
                    m = m.toUpperCase();
                } else if (isCapitalized) {
                    m = m.charAt(0).toUpperCase() + m.slice(1);
                }
                mesesConsulta.push(`${m}-${año}`);
            }
        }
    } else {
        mesesConsulta = [valorPeriodo];
    }

    // 3. Inicializar estructura de métricas mensuales
    monthlyMetrics = {};
    mesesConsulta.forEach(m => {
        monthlyMetrics[m] = {
            ingresos: 0,
            costos: 0,
            gastos: 0,
            otrosIngresos: 0,
            otrosEgresos: 0,
            ingresosOperacionales: 0,
            activosCorrientes: 0,
            pasivosCorrientes: 0,
            inventarios: 0,
            cajaBanco: 0,
            margenBruto: 0,
            margenOperativo: 0,
            margenNeto: 0,
            capitalTrabajo: 0,
            razonCorriente: 0,
            pruebaAcida: 0,
            efectivoPasivo: 0,
            utilidadBruta: 0,
            resultadoOperativo: 0,
            resultadoNeto: 0
        };
    });

    // 4. Construir URLs de Supabase
    const mesesEncoded = mesesConsulta.map(m => encodeURIComponent(m)).join(',');
    const urlGyp = `${CONFIG.SUPABASE_URL}/rest/v1/gyp?empresa=eq.${encodeURIComponent(valorEmpresa)}&periodo=in.(${mesesEncoded})&dimension=eq.${encodeURIComponent(valorDimension)}`;
    const urlCt = `${CONFIG.SUPABASE_URL}/rest/v1/ct?empresa=eq.${encodeURIComponent(valorEmpresa)}&periodo=in.(${mesesEncoded})`;
    const urlDivi = `${CONFIG.SUPABASE_URL}/rest/v1/divi?empresa=eq.${encodeURIComponent(valorEmpresa)}&order=id.asc`;

    // 5. Consultas en paralelo
    Promise.all([
        fetch(urlGyp, {
            method: 'GET',
            headers: {
                'apikey': CONFIG.SUPABASE_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        }).then(res => res.ok ? res.json() : []),
        fetch(urlCt, {
            method: 'GET',
            headers: {
                'apikey': CONFIG.SUPABASE_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        }).then(res => res.ok ? res.json() : []),
        fetch(urlDivi, {
            method: 'GET',
            headers: {
                'apikey': CONFIG.SUPABASE_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        }).then(res => res.ok ? res.json() : [])
    ])
    .then(([gypData, ctData, divisiones]) => {
        if ((!gypData || gypData.length === 0) && (!ctData || ctData.length === 0)) {
            loadingEl.style.display = 'none';
            errorEl.textContent = 'No hay datos financieros registrados en Supabase para la empresa y periodo seleccionados.';
            errorEl.classList.remove('hidden');
            return;
        }

        // A. Procesar pérdidas y ganancias (GyP)
        gypData.forEach(row => {
            const per = row.periodo;
            if (!monthlyMetrics[per]) return;

            let monto = 0;
            if (!divisiones || divisiones.length === 0) {
                monto = parseFloat(row.monto) || 0;
            } else {
                divisiones.forEach(d => {
                    monto += parseFloat(row[d.columna]) || 0;
                });
            }
            monto = Math.round((monto + Number.EPSILON) * 100) / 100;

            const gUpper = (row.grupo || '').toUpperCase();
            const sg2Upper = (row.subgrupo2 || '').toUpperCase();

            if (gUpper.includes('INGRESO') && !gUpper.includes('OTROS')) {
                monthlyMetrics[per].ingresos += monto;
            }
            if (gUpper.includes('COSTO') && !gUpper.includes('OTROS')) {
                monthlyMetrics[per].costos += monto;
            }
            if (gUpper.includes('GASTO') && !gUpper.includes('OTROS')) {
                monthlyMetrics[per].gastos += monto;
            }
            if (gUpper.includes('OTROS INGRESOS')) {
                monthlyMetrics[per].otrosIngresos += monto;
            }
            if (gUpper.includes('OTROS EGRESOS')) {
                monthlyMetrics[per].otrosEgresos += monto;
            }
            if (sg2Upper.includes('INGRESOS OPERACIONALES')) {
                monthlyMetrics[per].ingresosOperacionales += monto;
            }
        });

        // B. Procesar capital de trabajo (CT)
        ctData.forEach(row => {
            const per = row.periodo;
            if (!monthlyMetrics[per]) return;

            const claseUpper = (row.clase || '').toUpperCase();
            const denomUpper = (row.denominacion || '').toUpperCase().trim();
            const monto = parseFloat(row.monto) || 0;

            if (claseUpper.includes('ACTIVO')) {
                monthlyMetrics[per].activosCorrientes += monto;
            } else if (claseUpper.includes('PASIVO')) {
                monthlyMetrics[per].pasivosCorrientes += monto;
            }

            if (denomUpper === 'INVENTARIOS') {
                monthlyMetrics[per].inventarios += monto;
            }
            if (denomUpper === 'CAJA Y BANCO') {
                monthlyMetrics[per].cajaBanco += monto;
            }
        });

        // C. Calcular indicadores mensuales
        Object.keys(monthlyMetrics).forEach(per => {
            const m = monthlyMetrics[per];

            // Sub-totales GyP
            m.utilidadBruta = m.ingresos - m.costos;
            m.resultadoOperativo = m.utilidadBruta - m.gastos;
            m.resultadoNeto = m.resultadoOperativo + m.otrosIngresos - m.otrosEgresos;

            // Denominador para ratios de rentabilidad (se prefiere ingresos operacionales si hay)
            const divIng = m.ingresosOperacionales || m.ingresos || 0;

            m.margenBruto = divIng ? (m.utilidadBruta / divIng) * 100 : 0;
            m.margenOperativo = divIng ? (m.resultadoOperativo / divIng) * 100 : 0;
            m.margenNeto = divIng ? (m.resultadoNeto / divIng) * 100 : 0;

            // Sub-totales CT
            m.capitalTrabajo = m.activosCorrientes - m.pasivosCorrientes;
            m.razonCorriente = m.pasivosCorrientes ? (m.activosCorrientes / m.pasivosCorrientes) : 0;
            m.pruebaAcida = m.pasivosCorrientes ? ((m.activosCorrientes - m.inventarios) / m.pasivosCorrientes) : 0;
            m.efectivoPasivo = m.pasivosCorrientes ? (m.cajaBanco / m.pasivosCorrientes) : 0;
        });

        // D. Renderizar la vista
        renderDashboard(valorPeriodo);
    })
    .catch(error => {
        console.error('Error cargando indicadores:', error);
        errorEl.textContent = 'Error al cargar los datos: ' + error.message;
        errorEl.classList.remove('hidden');
    })
    .finally(() => {
        loadingEl.style.display = 'none';
    });
});

let chartRentObj = null;
let chartLiqObj = null;

function renderDashboard(selectedPeriod) {
    const metrics = monthlyMetrics[selectedPeriod];

    if (metrics) {
        // KPI Margen Neto
        const valMargen = metrics.margenNeto;
        const margenNetoEl = document.getElementById('kpi-margen-neto');
        margenNetoEl.textContent = valMargen.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
        margenNetoEl.style.color = valMargen < 0 ? '#ef4444' : 'var(--primary-color)';

        // KPI Razón Corriente
        const valRC = metrics.razonCorriente;
        const razonCorrienteEl = document.getElementById('kpi-razon-corriente');
        razonCorrienteEl.textContent = valRC.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' x';
        razonCorrienteEl.style.color = valRC < 1.0 ? '#ef4444' : 'rgb(74, 160, 68)';

        // KPI Prueba Ácida
        const valPA = metrics.pruebaAcida;
        const pruebaAcidaEl = document.getElementById('kpi-prueba-acida');
        pruebaAcidaEl.textContent = valPA.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' x';
        pruebaAcidaEl.style.color = valPA < 0.8 ? '#ef4444' : 'var(--accent-color)';

        // KPI Capital de Trabajo
        const valCT = metrics.capitalTrabajo;
        const capitalTrabajoEl = document.getElementById('kpi-capital-trabajo');
        capitalTrabajoEl.textContent = valCT.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MM $';
        capitalTrabajoEl.style.color = valCT < 0 ? '#ef4444' : '#8b5cf6';
    }

    // Mostrar las tarjetas de resumen
    document.getElementById('summary-cards').style.display = 'flex';

    // Renderizar Gráficos
    document.getElementById('charts-section').style.display = 'flex';
    renderCharts();

    // Renderizar Tabla
    document.getElementById('table-section').style.display = 'block';
    renderTable();
}

function renderCharts() {
    const cssStyles = getComputedStyle(document.documentElement);
    const textPrimary = cssStyles.getPropertyValue('--text-primary').trim() || '#1f2937';
    const textSecondary = cssStyles.getPropertyValue('--text-secondary').trim() || '#4b5563';
    const borderColor = cssStyles.getPropertyValue('--border-color').trim() || '#e5e7eb';

    const labels = mesesConsulta.map(m => m.toUpperCase());

    // Datos Rentabilidad
    const mbData = mesesConsulta.map(m => monthlyMetrics[m].margenBruto);
    const moData = mesesConsulta.map(m => monthlyMetrics[m].margenOperativo);
    const mnData = mesesConsulta.map(m => monthlyMetrics[m].margenNeto);

    // Datos Liquidez
    const rcData = mesesConsulta.map(m => monthlyMetrics[m].razonCorriente);
    const paData = mesesConsulta.map(m => monthlyMetrics[m].pruebaAcida);

    // Gráfico Rentabilidad
    const ctxRent = document.getElementById('chart-rentabilidad').getContext('2d');
    if (chartRentObj) chartRentObj.destroy();
    chartRentObj = new Chart(ctxRent, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Margen Bruto (%)',
                    data: mbData,
                    borderColor: 'rgb(74, 160, 68)',
                    backgroundColor: 'rgba(74, 160, 68, 0.05)',
                    borderWidth: 2.5,
                    tension: 0.25,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true
                },
                {
                    label: 'Margen Operativo (%)',
                    data: moData,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.05)',
                    borderWidth: 2.5,
                    tension: 0.25,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true
                },
                {
                    label: 'Margen Neto (%)',
                    data: mnData,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.05)',
                    borderWidth: 2.5,
                    tension: 0.25,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: textPrimary,
                        font: { family: 'Inter', weight: '500', size: 11 }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: borderColor },
                    ticks: { color: textSecondary, font: { family: 'Inter' } }
                },
                y: {
                    grid: { color: borderColor },
                    ticks: { color: textSecondary, font: { family: 'Inter' } }
                }
            }
        }
    });

    // Gráfico Liquidez
    const ctxLiq = document.getElementById('chart-liquidez').getContext('2d');
    if (chartLiqObj) chartLiqObj.destroy();
    chartLiqObj = new Chart(ctxLiq, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Razón Corriente (x)',
                    data: rcData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    borderWidth: 2.5,
                    tension: 0.25,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true
                },
                {
                    label: 'Prueba Ácida (x)',
                    data: paData,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.05)',
                    borderWidth: 2.5,
                    tension: 0.25,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: textPrimary,
                        font: { family: 'Inter', weight: '500', size: 11 }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: borderColor },
                    ticks: { color: textSecondary, font: { family: 'Inter' } }
                },
                y: {
                    grid: { color: borderColor },
                    ticks: { color: textSecondary, font: { family: 'Inter' } }
                }
            }
        }
    });
}

function renderTable() {
    const tableHeader = document.getElementById('table-header');
    const tableBody = document.getElementById('table-body');

    // 1. Cabeceras de meses
    tableHeader.innerHTML = '<th class="text-dark" style="width: 250px; padding: 12px 15px;">Indicador</th>';
    mesesConsulta.forEach(m => {
        const th = document.createElement('th');
        th.className = 'text-dark text-end';
        th.style.padding = '12px 15px';
        th.textContent = m.toUpperCase();
        tableHeader.appendChild(th);
    });

    tableBody.innerHTML = '';

    // Función auxiliar para renderizar filas de datos
    const renderRow = (label, key, isPercent = false, isRatio = false) => {
        const tr = document.createElement('tr');
        let cellsHtml = `<td style="padding: 12px 15px; font-weight: 500; color: var(--text-primary);">${label}</td>`;
        
        mesesConsulta.forEach(m => {
            const val = monthlyMetrics[m][key];
            let displayVal = '-';
            
            if (val !== undefined && val !== null) {
                if (isPercent) {
                    displayVal = val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
                } else if (isRatio) {
                    displayVal = val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' x';
                } else {
                    displayVal = val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                }
            }

            let styleStr = 'padding: 12px 15px; font-variant-numeric: tabular-nums;';
            if (val < 0) {
                styleStr += ' color: #ef4444; font-weight: 600;';
            }
            cellsHtml += `<td class="text-end" style="${styleStr}">${displayVal}</td>`;
        });
        
        tr.innerHTML = cellsHtml;
        tableBody.appendChild(tr);
    };

    // Fila grupo RENTABILIDAD
    const trRent = document.createElement('tr');
    trRent.className = 'table-light';
    trRent.innerHTML = `<td colspan="${mesesConsulta.length + 1}" style="font-weight: bold; color: var(--secondary-color); padding: 10px 15px; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.5px;">Rentabilidad</td>`;
    tableBody.appendChild(trRent);

    renderRow('Ingresos Totales (MM $)', 'ingresos');
    renderRow('Utilidad Bruta (MM $)', 'utilidadBruta');
    renderRow('Margen Bruto (%)', 'margenBruto', true);
    renderRow('Resultado Operativo (MM $)', 'resultadoOperativo');
    renderRow('Margen Operativo (%)', 'margenOperativo', true);
    renderRow('Resultado Neto (MM $)', 'resultadoNeto');
    renderRow('Margen Neto (%)', 'margenNeto', true);

    // Fila grupo LIQUIDEZ Y ESTRUCTURA
    const trLiq = document.createElement('tr');
    trLiq.className = 'table-light';
    trLiq.innerHTML = `<td colspan="${mesesConsulta.length + 1}" style="font-weight: bold; color: var(--secondary-color); padding: 10px 15px; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.5px;">Liquidez y Solvencia</td>`;
    tableBody.appendChild(trLiq);

    renderRow('Activos Corrientes (MM $)', 'activosCorrientes');
    renderRow('Pasivos Corrientes (MM $)', 'pasivosCorrientes');
    renderRow('Capital de Trabajo Neto (MM $)', 'capitalTrabajo');
    renderRow('Razón Corriente (x)', 'razonCorriente', false, true);
    renderRow('Prueba Ácida (x)', 'pruebaAcida', false, true);
    renderRow('Efectivo / Pasivo Corriente (x)', 'efectivoPasivo', false, true);
}
