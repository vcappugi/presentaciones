document.addEventListener('DOMContentLoaded', () => {
    initExecutiveSummary();
    setupCategoryPills();
});

// Referencias DOM
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error-message');
const summaryCards = document.getElementById('summary-cards');
const chartsSection = document.getElementById('charts-section');
const tableSection = document.getElementById('table-section');
const tableBody = document.getElementById('table-body');

// Variables globales para gráficos
let chartDesempeno = null;
let chartParticipacion = null;
let chartTendencia = null;

// Variables globales de datos y estado de filtrado por categoría
let dataHistoricaGlobal = [];
let dataPeriodoActualGlobal = [];
let empresaCategoriasGlobal = {};
let activeCategoryGlobal = 'TODAS';

function setupCategoryPills() {
    const pills = document.querySelectorAll('#category-pills .nav-link');
    pills.forEach(btn => {
        btn.addEventListener('click', (e) => {
            pills.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            activeCategoryGlobal = e.target.getAttribute('data-category');
            filtrarYRenderizar();
        });
    });
}

function filtrarYRenderizar() {
    const periodo = localStorage.getItem('bel_periodo');
    const dimension = localStorage.getItem('bel_dimension') || 'REAL';

    // 1. Filtrar datos del periodo actual por la categoría activa
    let datosFiltradosActual = dataPeriodoActualGlobal;
    if (activeCategoryGlobal !== 'TODAS') {
        datosFiltradosActual = dataPeriodoActualGlobal.filter(row => {
            const cat = empresaCategoriasGlobal[row.empresa] || 'Sin Categoría';
            return cat.toLowerCase() === activeCategoryGlobal.toLowerCase();
        });
    }

    // 2. Procesar y agrupar por empresa para la categoría filtrada
    const resumenEmpresas = procesarDatos(datosFiltradosActual);

    // 3. Renderizar dashboard (Tarjetas, Tabla de Ranking y Gráficos por Empresa)
    renderDashboard(resumenEmpresas, periodo, dimension);

    // 4. Filtrar datos históricos por categoría para la tendencia
    let datosFiltradosHistoricos = dataHistoricaGlobal;
    if (activeCategoryGlobal !== 'TODAS') {
        datosFiltradosHistoricos = dataHistoricaGlobal.filter(row => {
            const cat = empresaCategoriasGlobal[row.empresa] || 'Sin Categoría';
            return cat.toLowerCase() === activeCategoryGlobal.toLowerCase();
        });
    }
    renderTrendChart(datosFiltradosHistoricos);
}

async function initExecutiveSummary() {
    // 1. Obtener parámetros de periodo y dimensión
    const urlParams = new URLSearchParams(window.location.search);
    let periodo = urlParams.get('periodo');
    let dimension = urlParams.get('dimension');

    if (!periodo) {
        periodo = localStorage.getItem('bel_periodo');
    }
    if (!dimension) {
        dimension = localStorage.getItem('bel_dimension') || 'REAL';
    }

    // Si aún no tenemos periodo, necesitamos consultar los periodos disponibles
    if (!periodo) {
        try {
            const resPeriodos = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/periodos`, {
                method: 'GET',
                headers: {
                    'apikey': CONFIG.SUPABASE_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
                }
            });
            if (resPeriodos.ok) {
                const periodos = await resPeriodos.json();
                if (periodos.length > 0) {
                    // Ordenar cronológicamente para tomar el último
                    const MESES_ORDEN = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
                    periodos.sort((a, b) => {
                        const valA = String(a.periodo).toLowerCase();
                        const valB = String(b.periodo).toLowerCase();
                        const partesA = valA.split('-');
                        const partesB = valB.split('-');
                        
                        const mesA = partesA[0];
                        const anoA = partesA[1] || '';
                        const mesB = partesB[0];
                        const anoB = partesB[1] || '';
                        
                        if (anoA !== anoB) return anoA.localeCompare(anoB);
                        
                        const idxA = MESES_ORDEN.indexOf(mesA);
                        const idxB = MESES_ORDEN.indexOf(mesB);
                        return idxA - idxB;
                    });
                    periodo = periodos[periodos.length - 1].periodo;
                }
            }
        } catch (err) {
            console.error('Error fetching periodos:', err);
        }
    }

    if (!periodo) {
        loadingEl.style.display = 'none';
        errorEl.textContent = 'No se encontraron periodos disponibles en la base de datos.';
        errorEl.classList.remove('hidden');
        return;
    }

    // Asegurar que estén guardados en localStorage
    localStorage.setItem('bel_periodo', periodo);
    localStorage.setItem('bel_dimension', dimension);

    // Actualizar filtros en la UI si el filtros.js ya cargó, pero como se hace en paralelo
    // filtros.js leerá del URL/localStorage automáticamente.

    // 2. Consultar datos financieros consolidados
    consultarDatosConsolidados(periodo, dimension);
}

async function consultarDatosConsolidados(periodo, dimension) {
    loadingEl.style.display = 'block';
    errorEl.classList.add('hidden');
    summaryCards.style.display = 'none';
    chartsSection.style.display = 'none';
    tableSection.style.display = 'none';
    
    const trendSection = document.getElementById('trend-chart-section');
    if (trendSection) trendSection.style.display = 'none';

    try {
        // Consultar TODOS los datos de la dimensión (independientemente del periodo) para construir el histórico unificado
        const url = `${CONFIG.SUPABASE_URL}/rest/v1/gyp?dimension=eq.${encodeURIComponent(dimension)}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': CONFIG.SUPABASE_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Error en la petición de datos: ${response.statusText}`);
        }

        const fetchedData = await response.json();
        const allowedCompanies = await window.getAllowedCompanies();
        const allData = allowedCompanies 
            ? fetchedData.filter(row => allowedCompanies.includes(row.empresa))
            : fetchedData;

        if (!allData || allData.length === 0) {
            loadingEl.style.display = 'none';
            errorEl.textContent = `No hay datos disponibles en la base de datos para la dimensión ${dimension}.`;
            errorEl.classList.remove('hidden');
            return;
        }

        // Filtrar datos para el periodo seleccionado actual
        const datosPeriodoActual = allData.filter(row => String(row.periodo).toLowerCase() === String(periodo).toLowerCase());

        if (datosPeriodoActual.length === 0) {
            console.warn(`No hay registros específicos para el periodo ${periodo}`);
        }

        // Obtener el mapeo de empresas y sus categorías desde Supabase
        const resEmpresas = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/empresas`, {
            method: 'GET',
            headers: {
                'apikey': CONFIG.SUPABASE_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
            }
        });
        const catMap = {};
        if (resEmpresas.ok) {
            const empresasData = await resEmpresas.json();
            empresasData.forEach(e => {
                catMap[e.nombre] = e.categoria || 'Sin Categoría';
            });
        }

        // Almacenar en variables globales para filtrado dinámico local
        dataHistoricaGlobal = allData;
        dataPeriodoActualGlobal = datosPeriodoActual;
        empresaCategoriasGlobal = catMap;

        // Mostrar selector de categorías
        const categorySelectorRow = document.getElementById('category-selector-row');
        if (categorySelectorRow) {
            categorySelectorRow.style.display = 'block';
        }

        // Ejecutar el filtrado y renderizado inicial
        filtrarYRenderizar();

    } catch (error) {
        console.error(error);
        loadingEl.style.display = 'none';
        errorEl.textContent = 'Ocurrió un error al procesar el Resumen Ejecutivo: ' + error.message;
        errorEl.classList.remove('hidden');
    }
}

function procesarDatos(data) {
    const agrupado = {};

    data.forEach(row => {
        const empresaName = row.empresa || 'Empresa Desconocida';
        const g = row.grupo || '';
        const sg2 = row.subgrupo2 || '';
        let monto = parseFloat(row.monto) || 0;
        monto = Math.round((monto + Number.EPSILON) * 100) / 100;

        if (!agrupado[empresaName]) {
            agrupado[empresaName] = {
                nombre: empresaName,
                ingresos: 0,
                costos: 0,
                gastos: 0,
                otrosIngresos: 0,
                otrosEgresos: 0,
                ingresosOperacionales: 0
            };
        }

        const gUpper = g.toUpperCase();
        const sg2Upper = sg2.toUpperCase();

        if (gUpper.includes('INGRESO') && !gUpper.includes('OTROS')) {
            agrupado[empresaName].ingresos += monto;
        }
        if (gUpper.includes('COSTO') && !gUpper.includes('OTROS')) {
            agrupado[empresaName].costos += monto;
        }
        if (gUpper.includes('GASTO') && !gUpper.includes('OTROS')) {
            agrupado[empresaName].gastos += monto;
        }
        if (gUpper.includes('OTROS INGRESOS')) {
            agrupado[empresaName].otrosIngresos += monto;
        }
        if (gUpper.includes('OTROS EGRESOS')) {
            agrupado[empresaName].otrosEgresos += monto;
        }
        if (sg2Upper.includes('INGRESOS OPERACIONALES')) {
            agrupado[empresaName].ingresosOperacionales += monto;
        }
    });

    // Calcular utilidades finales por empresa
    const listaEmpresas = Object.values(agrupado).map(emp => {
        const utilidadBruta = emp.ingresos - emp.costos;
        const resultadoOperativo = utilidadBruta - emp.gastos;
        const resultadoNeto = utilidadBruta - emp.gastos + emp.otrosIngresos - emp.otrosEgresos;
        const otrosNetos = emp.otrosIngresos - emp.otrosEgresos;

        // Margen Neto
        const divIngresos = emp.ingresosOperacionales || emp.ingresos || 0;
        const margenNeto = divIngresos ? (resultadoNeto / divIngresos) * 100 : 0;

        return {
            ...emp,
            utilidadBruta,
            resultadoOperativo,
            resultadoNeto,
            otrosNetos,
            margenNeto
        };
    });

    return listaEmpresas;
}

function renderDashboard(empresas, periodo, dimension) {
    loadingEl.style.display = 'none';

    // 1. Calcular consolidados generales
    let consolidatedIngresos = 0;
    let consolidatedNeto = 0;
    let consolidatedIngOperacionales = 0;

    empresas.forEach(emp => {
        consolidatedIngresos += emp.ingresos;
        consolidatedNeto += emp.resultadoNeto;
        consolidatedIngOperacionales += emp.ingresosOperacionales || emp.ingresos || 0;
    });

    const consolidatedMargen = consolidatedIngOperacionales ? (consolidatedNeto / consolidatedIngOperacionales) * 100 : 0;

    // 2. Rellenar Tarjetas de Resumen
    document.getElementById('card-ingresos-totales').textContent = formatMonto(consolidatedIngresos);
    
    const cardNeto = document.getElementById('card-utilidad-neta');
    cardNeto.textContent = formatMonto(consolidatedNeto);
    cardNeto.style.color = consolidatedNeto < 0 ? '#ef4444' : 'var(--primary-color)';

    const cardMargen = document.getElementById('card-margen-consolidado');
    cardMargen.textContent = consolidatedMargen.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
    cardMargen.style.color = consolidatedMargen < 0 ? '#ef4444' : 'var(--accent-color)';

    document.getElementById('card-empresas-count').textContent = empresas.length;

    summaryCards.style.display = 'flex';

    // 3. Ordenar empresas por Resultado Neto descendente para la tabla y gráficos
    empresas.sort((a, b) => b.resultadoNeto - a.resultadoNeto);

    // Encontrar ingresos máximos para la barra de progreso
    const maxIngresos = empresas.length > 0 ? Math.max(...empresas.map(emp => emp.ingresos || 0)) : 1;

    // 4. Generar Tabla
    if ($.fn.DataTable.isDataTable('#ranking-table')) {
        $('#ranking-table').DataTable().destroy();
    }

    tableBody.innerHTML = '';
    empresas.forEach(emp => {
        const tr = document.createElement('tr');
        tr.className = 'ranking-row';
        tr.title = `Haz clic para ver el dashboard detallado de ${emp.nombre}`;
        
        // Redirección al hacer clic
        tr.addEventListener('click', () => {
            window.location.href = `empresa_divisiones.html?empresa=${encodeURIComponent(emp.nombre)}&periodo=${encodeURIComponent(periodo)}&dimension=${encodeURIComponent(dimension)}`;
        });

        const margenStr = emp.margenNeto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
        const margenBadgeClass = emp.margenNeto < 0 ? 'bg-danger-subtle text-danger border border-danger-subtle' : 'bg-success-subtle text-success border border-success-subtle';

        tr.innerHTML = `
            <td style="padding: 12px 15px; font-weight: 600; color: var(--secondary-color);"><span class="company-link">${emp.nombre}</span></td>
            <td class="text-end" style="padding: 12px 15px;">
                <div style="font-weight: 600; color: var(--text-primary); font-variant-numeric: tabular-nums;">${formatMonto(emp.ingresos)}</div>
                <div class="progress mt-1 ms-auto" style="height: 4px; width: 85px; background-color: var(--border-color); border-radius: 2px;">
                    <div class="progress-bar" style="width: ${maxIngresos > 0 ? Math.max(0, Math.min(100, (emp.ingresos / maxIngresos * 100))) : 0}%; background-color: var(--secondary-color); height: 100%;"></div>
                </div>
            </td>
            <td class="text-end text-muted" style="padding: 12px 15px; font-variant-numeric: tabular-nums;">${formatMonto(emp.costos)}</td>
            <td class="text-end text-muted" style="padding: 12px 15px; font-variant-numeric: tabular-nums;">${formatMonto(emp.gastos)}</td>
            <td class="text-end text-muted" style="padding: 12px 15px; font-variant-numeric: tabular-nums;">${formatMonto(emp.otrosIngresos)}</td>
            <td class="text-end text-muted" style="padding: 12px 15px; font-variant-numeric: tabular-nums;">${formatMonto(emp.otrosEgresos)}</td>
            <td class="text-end fw-bold" style="padding: 12px 15px; font-variant-numeric: tabular-nums; color: ${emp.resultadoNeto < 0 ? '#dc2626' : '#16a34a'} !important; font-size: 1.05rem;">${formatMonto(emp.resultadoNeto)}</td>
            <td class="text-end" style="padding: 12px 15px;">
                <span class="badge rounded-2 ${margenBadgeClass}" style="padding: 6px 10px; font-weight: 600;">${margenStr}</span>
            </td>
        `;
        tableBody.appendChild(tr);
    });

    tableSection.style.display = 'block';

    // Inicializar DataTable con traducción al español y ordenación por defecto
    $('#ranking-table').DataTable({
        language: {
            url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/es-ES.json'
        },
        order: [[6, 'desc']], // Ordenar por la columna de Resultado Neto (columna índice 6) de forma descendente por defecto
        pageLength: 10,
        lengthMenu: [5, 10, 25, 50]
    });

    // 5. Renderizar Gráficos con Chart.js
    chartsSection.style.display = 'flex';
    renderCharts(empresas);
}

function renderCharts(empresas) {
    // Obtener variables de colores de CSS según tema actual
    const cssStyles = getComputedStyle(document.documentElement);
    const textPrimary = cssStyles.getPropertyValue('--text-primary').trim() || '#1f2937';
    const textSecondary = cssStyles.getPropertyValue('--text-secondary').trim() || '#4b5563';
    const borderColor = cssStyles.getPropertyValue('--border-color').trim() || '#e5e7eb';
    
    // Destruir gráficos previos si existen
    if (chartDesempeno) chartDesempeno.destroy();
    if (chartParticipacion) chartParticipacion.destroy();

    const labels = empresas.map(emp => emp.nombre);
    const ingresosData = empresas.map(emp => emp.ingresos);
    const utilidadesData = empresas.map(emp => emp.resultadoNeto);

    // Gráfico 1: Desempeño Comparativo (Ingresos vs Utilidad Neta)
    const ctxDesempeno = document.getElementById('chart-desempeno').getContext('2d');
    chartDesempeno = new Chart(ctxDesempeno, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Ingresos',
                    data: ingresosData,
                    backgroundColor: 'rgba(59, 130, 246, 0.75)', // Azul
                    borderColor: 'rgb(59, 130, 246)',
                    borderWidth: 1.5,
                    borderRadius: 4
                },
                {
                    label: 'Resultado Neto',
                    data: utilidadesData,
                    backgroundColor: utilidadesData.map(val => val < 0 ? 'rgba(239, 68, 68, 0.75)' : 'rgba(16, 185, 129, 0.75)'), // Rojo o Verde
                    borderColor: utilidadesData.map(val => val < 0 ? 'rgb(239, 68, 68)' : 'rgb(16, 185, 129)'),
                    borderWidth: 1.5,
                    borderRadius: 4
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
                        font: { family: 'Inter', weight: '500' }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.raw !== null) {
                                label += formatMonto(context.raw);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: borderColor },
                    ticks: {
                        color: textSecondary,
                        font: { family: 'Inter' }
                    }
                },
                y: {
                    grid: { color: borderColor },
                    ticks: {
                        color: textSecondary,
                        font: { family: 'Inter' },
                        callback: function(value) {
                            return value.toLocaleString('es-VE', { maximumFractionDigits: 0 });
                        }
                    }
                }
            }
        }
    });

    // Gráfico 2: Participación de Ingresos (Dona)
    const ctxParticipacion = document.getElementById('chart-participacion').getContext('2d');
    
    // Paleta de colores armoniosa para participación
    const colorPalette = [
        'rgba(59, 130, 246, 0.85)',   // Azul
        'rgba(16, 185, 129, 0.85)',   // Verde
        'rgba(245, 158, 11, 0.85)',   // Ambar
        'rgba(139, 92, 246, 0.85)',   // Violeta
        'rgba(236, 72, 153, 0.85)',   // Rosa
        'rgba(20, 184, 166, 0.85)',   // Turquesa
        'rgba(249, 115, 22, 0.85)'    // Naranja
    ];
    const borderPalette = colorPalette.map(c => c.replace('0.85', '1.0'));

    chartParticipacion = new Chart(ctxParticipacion, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: ingresosData,
                backgroundColor: colorPalette.slice(0, labels.length),
                borderColor: borderPalette.slice(0, labels.length),
                borderWidth: 1.5,
                hoverOffset: 12
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textPrimary,
                        padding: 15,
                        font: { family: 'Inter', size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.raw || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total ? ((val / total) * 100).toFixed(2) : 0;
                            return `${context.label}: ${formatMonto(val)} (${percentage}%)`;
                        }
                    }
                }
            },
            cutout: '60%'
        }
    });
}

function formatMonto(monto) {
    if (monto === 0) return '0,00';
    return monto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderTrendChart(allData) {
    const trendSection = document.getElementById('trend-chart-section');
    if (!trendSection) return;
    
    // Obtener variables de colores de CSS según tema actual
    const cssStyles = getComputedStyle(document.documentElement);
    const textPrimary = cssStyles.getPropertyValue('--text-primary').trim() || '#1f2937';
    const textSecondary = cssStyles.getPropertyValue('--text-secondary').trim() || '#4b5563';
    const borderColor = cssStyles.getPropertyValue('--border-color').trim() || '#e5e7eb';
    const themeColor = cssStyles.getPropertyValue('--primary-color').trim() || '#2563eb';

    // Agrupar ingresos por periodo consolidando todas las empresas
    const ingresosPorPeriodo = {};
    
    allData.forEach(row => {
        const p = row.periodo;
        if (!p) return;
        
        const gUpper = (row.grupo || '').toUpperCase();
        if (gUpper.includes('INGRESO') && !gUpper.includes('OTROS')) {
            const monto = parseFloat(row.monto) || 0;
            if (!ingresosPorPeriodo[p]) {
                ingresosPorPeriodo[p] = 0;
            }
            ingresosPorPeriodo[p] += monto;
        }
    });

    // Obtener y ordenar cronológicamente los periodos
    const periodosUnicos = Object.keys(ingresosPorPeriodo);
    if (periodosUnicos.length === 0) {
        trendSection.style.display = 'none';
        return;
    }

    const MESES_ORDEN = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    periodosUnicos.sort((a, b) => {
        const valA = String(a).toLowerCase();
        const valB = String(b).toLowerCase();
        const partesA = valA.split('-');
        const partesB = valB.split('-');
        
        const mesA = partesA[0];
        const anoA = partesA[1] || '';
        const mesB = partesB[0];
        const anoB = partesB[1] || '';
        
        if (anoA !== anoB) return anoA.localeCompare(anoB);
        
        const idxA = MESES_ORDEN.indexOf(mesA);
        const idxB = MESES_ORDEN.indexOf(mesB);
        return idxA - idxB;
    });

    const labels = periodosUnicos;
    const dataIngresos = periodosUnicos.map(p => Math.round(ingresosPorPeriodo[p]));

    // Mostrar contenedor del gráfico de tendencia
    trendSection.style.display = 'block';

    const ctxTrend = document.getElementById('chart-tendencia-ingresos').getContext('2d');
    
    if (chartTendencia) {
        chartTendencia.destroy();
    }

    const softFillColor = themeColor.startsWith('#') ? themeColor + '18' : 'rgba(59, 130, 246, 0.12)';

    chartTendencia = new Chart(ctxTrend, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ingresos Totales Consolidados (Todas las Empresas)',
                data: dataIngresos,
                borderColor: themeColor,
                backgroundColor: softFillColor,
                borderWidth: 3,
                tension: 0.35,
                fill: true,
                pointBackgroundColor: themeColor,
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: textPrimary,
                        font: { family: 'Inter', weight: '600', size: 12 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ` Ingresos Totales: $ ${formatMonto(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: borderColor },
                    ticks: {
                        color: textSecondary,
                        font: { family: 'Inter', weight: '500' }
                    }
                },
                y: {
                    grid: { color: borderColor },
                    ticks: {
                        color: textSecondary,
                        font: { family: 'Inter' },
                        callback: function(value) {
                            return value.toLocaleString('es-VE', { maximumFractionDigits: 0 });
                        }
                    }
                }
            }
        }
    });
}

