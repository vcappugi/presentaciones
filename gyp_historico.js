// Variables globales para almacenar estado de filtros y datos
let currentGypData = null;
let currentDivisiones = [];
let currentMesesOrdenados = [];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Obtener los parámetros de la URL
    const urlParams = new URLSearchParams(window.location.search);
    let valorEmpresa = urlParams.get('empresa');
    let valorPeriodo = urlParams.get('periodo');
    let valorDimension = urlParams.get('dimension');
    
    // Si los parámetros no están en la URL, intentar buscarlos en la memoria
    if (!valorEmpresa || !valorPeriodo || !valorDimension) {
        valorEmpresa = localStorage.getItem('bel_empresa');
        valorPeriodo = localStorage.getItem('bel_periodo');
        valorDimension = localStorage.getItem('bel_dimension');
    } else {
        // Si vienen en la URL, actualizar la memoria para futuras referencias
        localStorage.setItem('bel_empresa', valorEmpresa);
        localStorage.setItem('bel_periodo', valorPeriodo);
        localStorage.setItem('bel_dimension', valorDimension);
    }

    // Referencias a elementos del DOM
    const tituloEmpresa = document.getElementById('titulo-empresa');
    const tituloPeriodo = document.getElementById('titulo-periodo');
    const errorEl = document.getElementById('error-message');
    const loadingEl = document.getElementById('loading');
    const tableBody = document.getElementById('table-body');

    // Validar que existan los parámetros
    if (!valorEmpresa || !valorPeriodo || !valorDimension) {
        errorEl.textContent = 'Faltan parámetros de filtro. Por favor, ingresa desde el inicio para seleccionarlos.';
        errorEl.classList.remove('hidden');
        loadingEl.classList.add('hidden');
        return;
    }

    // Actualizar títulos en la interfaz
    if (tituloEmpresa) tituloEmpresa.textContent = valorEmpresa;
    if (tituloPeriodo) tituloPeriodo.textContent = `${valorPeriodo} (${valorDimension})`;

    // 2. Construir la URL de consulta a Supabase
    // Determinar la lista de meses desde Enero hasta el mes seleccionado
    const MESES_ORDEN = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const partesPeriodo = valorPeriodo.split('-');
    let mesesConsulta = [valorPeriodo];
    
    if (partesPeriodo.length === 2) {
        const mesSeleccionado = partesPeriodo[0].toLowerCase();
        const año = partesPeriodo[1];
        const idx = MESES_ORDEN.indexOf(mesSeleccionado);
        
        if (idx !== -1) {
            mesesConsulta = [];
            // Mantener capitalización (ej. Ene o ene o ENE)
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
    }

    // Consulta con "in." para múltiples meses
    const mesesEncoded = mesesConsulta.map(m => encodeURIComponent(m)).join(',');
    const urlConsulta = `${CONFIG.SUPABASE_URL}/rest/v1/gyp?empresa=eq.${encodeURIComponent(valorEmpresa)}&periodo=in.(${mesesEncoded})&dimension=eq.${encodeURIComponent(valorDimension)}`;

    // Pasamos los meses consultados a renderTable para asegurar el orden de las columnas
    const mesesOrdenados = mesesConsulta;

    // 3. Realizar la petición fetch en paralelo a Supabase (divisiones e histórico gyp)
    const urlDivi = `${CONFIG.SUPABASE_URL}/rest/v1/divi?empresa=eq.${encodeURIComponent(valorEmpresa)}&order=id.asc`;

    Promise.all([
        fetch(urlDivi, {
            method: 'GET',
            headers: {
                'apikey': CONFIG.SUPABASE_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        }).then(res => res.ok ? res.json() : []),
        fetch(urlConsulta, {
            method: 'GET',
            headers: {
                'apikey': CONFIG.SUPABASE_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        }).then(response => {
            if (!response.ok) {
                throw new Error(`Error en la petición: ${response.status} ${response.statusText}`);
            }
            return response.json();
        })
    ])
    .then(([divisiones, gypData]) => {
        currentGypData = gypData;
        currentDivisiones = divisiones || [];
        currentMesesOrdenados = mesesOrdenados;

        // Esperar a que la barra de filtros esté en el DOM para inyectar el de divisiones
        const interval = setInterval(() => {
            const container = document.querySelector('.filters-container');
            if (container) {
                clearInterval(interval);
                setupDivisionFilter(container, currentDivisiones);
            }
        }, 50);

        renderTable(currentGypData, currentMesesOrdenados, 'all', currentDivisiones);
    })
    .catch(error => {
        console.error('Error fetching data:', error);
        errorEl.textContent = 'Error al cargar los datos: ' + error.message;
        errorEl.classList.remove('hidden');
    })
    .finally(() => {
        loadingEl.classList.add('hidden');
    });
});

function setupDivisionFilter(container, divisiones) {
    // Eliminar filtro previo si existe para evitar duplicados
    const oldFilter = document.getElementById('divi-filter-group');
    if (oldFilter) oldFilter.remove();

    if (!divisiones || divisiones.length === 0) return;

    // Crear el contenedor de filtro
    const diviFilterGroup = document.createElement('div');
    diviFilterGroup.id = 'divi-filter-group';
    diviFilterGroup.className = 'col-12 col-md-auto filter-group';
    
    let optionsHtml = '<option value="all" selected>Consolidado</option>';
    divisiones.forEach(div => {
        optionsHtml += `<option value="${div.columna}">${div.division}</option>`;
    });

    diviFilterGroup.innerHTML = `
        <div class="d-flex align-items-center">
            <label for="select-division" class="form-label me-2 mb-0 fw-semibold text-dark text-nowrap" style="font-size: 0.85rem;">División:</label>
            <select id="select-division" class="form-select form-select-sm" style="min-width: 130px;">
                ${optionsHtml}
            </select>
        </div>
    `;

    // Insertar antes del botón "Consultar Reporte"
    const btnConsultar = document.getElementById('btn-consultar');
    if (btnConsultar) {
        const containerToUse = btnConsultar.parentElement;
        containerToUse.parentNode.insertBefore(diviFilterGroup, containerToUse);
    } else {
        container.appendChild(diviFilterGroup);
    }

    // Escuchar cambios en el filtro
    const selectDivision = document.getElementById('select-division');
    if (selectDivision) {
        selectDivision.addEventListener('change', (e) => {
            renderTable(currentGypData, currentMesesOrdenados, e.target.value, currentDivisiones);
        });
    }
}

function renderTable(data, mesesOrdenados, divisionSelected = 'all', divisiones = []) {
    const tableBody = document.getElementById('table-body');
    const tableHeader = document.getElementById('table-header');
    
    tableBody.innerHTML = '';
    tableHeader.innerHTML = '';
    
    if (!data || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="100%" style="text-align: center; padding: 20px; color: #6b7280;">No hay datos disponibles para esta empresa y periodo.</td></tr>';
        return;
    }
    
    // Identificar periodos cerrados
    let periodosCerrados = {};
    data.forEach(row => {
        if (row.cerrado === 'Periodo Cerrado' && row.periodo) {
            periodosCerrados[row.periodo.toLowerCase()] = true;
        }
    });

    // Cabeceras dinámicas
    const headers = ['DENOMINACION'];
    mesesOrdenados.forEach(m => {
        const lock = periodosCerrados[m.toLowerCase()] ? ' 🔒' : '';
        headers.push(m.toUpperCase() + lock);
    });
    headers.push('TENDENCIA');
    headers.push('TOTAL');
    headers.push('% / INGRESOS');
    
    headers.forEach((h, index) => {
        const th = document.createElement('th');
        th.textContent = h;
        if (index > 0) th.style.textAlign = 'right'; // Alineación a la derecha para montos y %
        if (h === 'TENDENCIA') th.style.textAlign = 'center';
        tableHeader.appendChild(th);
    });

    window._mesesOrdenados = mesesOrdenados;

    // Procesar datos para agrupamiento
    const agrupado = {};
    let totalGYP = 0;
    // Ingresos totales para el TOTAL de meses (para porcentaje global)
    let totalIngresos = 0;
    let totalCostos = 0;
    let totalGastos = 0;
    let totalIngresosOperacionales = 0;
    let totalOtrosIngresos = 0;
    let totalOtrosEgresos = 0;

    let totalesMesGYP = {};
    let totalesMesIngresos = {};
    let totalesMesCostos = {};
    let totalesMesGastos = {};
    let totalesMesIngresosOperacionales = {};
    let totalesMesOtrosIngresos = {};
    let totalesMesOtrosEgresos = {};
    mesesOrdenados.forEach(m => {
        totalesMesGYP[m] = 0;
        totalesMesIngresos[m] = 0;
        totalesMesCostos[m] = 0;
        totalesMesGastos[m] = 0;
        totalesMesIngresosOperacionales[m] = 0;
        totalesMesOtrosIngresos[m] = 0;
        totalesMesOtrosEgresos[m] = 0;
    });

    data.forEach(row => {
        const g = row.grupo || 'Sin Grupo';
        const sg2 = row.subgrupo2 || 'Sin Subgrupo 2';
        const sg = row.subgrupo || 'Sin Subgrupo';
        let monto = 0;
        if (!divisiones || divisiones.length === 0) {
            monto = parseFloat(row.monto) || 0;
        } else if (divisionSelected === 'all') {
            divisiones.forEach(d => {
                monto += parseFloat(row[d.columna]) || 0;
            });
        } else {
            monto = parseFloat(row[divisionSelected]) || 0;
        }
        monto = Math.round((monto + Number.EPSILON) * 100) / 100;
        const periodoRow = row.periodo;

        // Sumar para tarjetas de resumen globales
        totalGYP += monto;
        if (g.toUpperCase().includes('INGRESO') && !g.toUpperCase().includes('OTROS')) {
            totalIngresos += monto;
            if (totalesMesIngresos[periodoRow] !== undefined) totalesMesIngresos[periodoRow] += monto;
        }
        if (g.toUpperCase().includes('COSTO') && !g.toUpperCase().includes('OTROS')) {
            totalCostos += monto;
            if (totalesMesCostos[periodoRow] !== undefined) totalesMesCostos[periodoRow] += monto;
        }
        if (g.toUpperCase().includes('GASTO') && !g.toUpperCase().includes('OTROS')) {
            totalGastos += monto;
            if (totalesMesGastos[periodoRow] !== undefined) totalesMesGastos[periodoRow] += monto;
        }
        if (g.toUpperCase().includes('OTROS INGRESOS')) {
            totalOtrosIngresos += monto;
            if (totalesMesOtrosIngresos[periodoRow] !== undefined) totalesMesOtrosIngresos[periodoRow] += monto;
        }
        if (g.toUpperCase().includes('OTROS EGRESOS')) {
            totalOtrosEgresos += monto;
            if (totalesMesOtrosEgresos[periodoRow] !== undefined) totalesMesOtrosEgresos[periodoRow] += monto;
        }
        if (sg2.toUpperCase().includes('INGRESOS OPERACIONALES')) {
            totalIngresosOperacionales += monto;
            if (totalesMesIngresosOperacionales[periodoRow] !== undefined) totalesMesIngresosOperacionales[periodoRow] += monto;
        }
        if (totalesMesGYP[periodoRow] !== undefined) totalesMesGYP[periodoRow] += monto;

        if (!agrupado[g]) {
            agrupado[g] = { totalAcumulado: 0, montosMes: {}, subgrupos1: {} };
            mesesOrdenados.forEach(m => agrupado[g].montosMes[m] = 0);
        }
        agrupado[g].totalAcumulado += monto;
        if (agrupado[g].montosMes[periodoRow] !== undefined) agrupado[g].montosMes[periodoRow] += monto;

        if (!agrupado[g].subgrupos1[sg]) {
            agrupado[g].subgrupos1[sg] = { totalAcumulado: 0, montosMes: {}, subgrupos2: {} };
            mesesOrdenados.forEach(m => agrupado[g].subgrupos1[sg].montosMes[m] = 0);
        }
        agrupado[g].subgrupos1[sg].totalAcumulado += monto;
        if (agrupado[g].subgrupos1[sg].montosMes[periodoRow] !== undefined) agrupado[g].subgrupos1[sg].montosMes[periodoRow] += monto;

        if (!agrupado[g].subgrupos1[sg].subgrupos2[sg2]) {
            agrupado[g].subgrupos1[sg].subgrupos2[sg2] = { totalAcumulado: 0, montosMes: {}, items: {} };
            mesesOrdenados.forEach(m => agrupado[g].subgrupos1[sg].subgrupos2[sg2].montosMes[m] = 0);
        }
        agrupado[g].subgrupos1[sg].subgrupos2[sg2].totalAcumulado += monto;
        if (agrupado[g].subgrupos1[sg].subgrupos2[sg2].montosMes[periodoRow] !== undefined) agrupado[g].subgrupos1[sg].subgrupos2[sg2].montosMes[periodoRow] += monto;
        
        // Agrupar items por cuenta o denominacion
        const itemKey = (row.cta || '') + ' - ' + (row.denominacion || '');
        if (!agrupado[g].subgrupos1[sg].subgrupos2[sg2].items[itemKey]) {
            agrupado[g].subgrupos1[sg].subgrupos2[sg2].items[itemKey] = {
                cta: row.cta,
                denominacion: row.denominacion,
                totalAcumulado: 0,
                montosMes: {}
            };
            mesesOrdenados.forEach(m => agrupado[g].subgrupos1[sg].subgrupos2[sg2].items[itemKey].montosMes[m] = 0);
        }
        agrupado[g].subgrupos1[sg].subgrupos2[sg2].items[itemKey].totalAcumulado += monto;
        if (agrupado[g].subgrupos1[sg].subgrupos2[sg2].items[itemKey].montosMes[periodoRow] !== undefined) {
            agrupado[g].subgrupos1[sg].subgrupos2[sg2].items[itemKey].montosMes[periodoRow] += monto;
        }
    });

    // Función auxiliar para formatear montos
    const formatMonto = (m, showLock = false) => {
        if (m === 0) return '-';
        const val = m.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const txt = m < 0 ? `<span style="color: #ef4444;">${val}</span>` : val;
        return showLock ? `🔒 ${txt}` : txt;
    };
    
    // Función auxiliar para el indicador de variación
    const getVariationIndicator = (currentMonto, prevMonto) => {
        if (prevMonto === undefined || prevMonto === null) return '';
        if (currentMonto > prevMonto + 0.001) {
            return '&nbsp;<span style="color: #16a34a; font-size: 0.85rem;" title="Aumentó">▲</span>';
        } else if (currentMonto < prevMonto - 0.001) {
            return '&nbsp;<span style="color: #dc2626; font-size: 0.85rem;" title="Disminuyó">▼</span>';
        } else {
            return '&nbsp;<span style="color: #2563eb; font-size: 0.85rem;" title="Igual">=</span>';
        }
    };
    
    // Función auxiliar para generar SVG de minigráfico (sparkline)
    const createSparkline = (dataPoints, title) => {
        if (!dataPoints || dataPoints.length === 0) return '';
        
        const width = 60;
        const height = 24;
        const padding = 3;
        
        const min = Math.min(...dataPoints);
        const max = Math.max(...dataPoints);
        const range = max - min === 0 ? 1 : max - min;
        
        const stepX = (width - padding * 2) / (dataPoints.length > 1 ? dataPoints.length - 1 : 1);
        
        const points = dataPoints.map((val, i) => {
            const x = padding + i * stepX;
            const y = height - padding - ((val - min) / range) * (height - padding * 2);
            return `${x},${y}`;
        }).join(' ');
        
        const circles = dataPoints.map((val, i) => {
            const x = padding + i * stepX;
            const y = height - padding - ((val - min) / range) * (height - padding * 2);
            return `<circle cx="${x}" cy="${y}" r="2" fill="#2563eb" />`;
        }).join('');
        
        const dataStr = encodeURIComponent(JSON.stringify(dataPoints));
        const titleStr = encodeURIComponent(title);
        
        return `<div style="cursor: pointer; display: inline-block; width: ${width}px; height: ${height}px;" onclick="openSparklineModal('${titleStr}', '${dataStr}')" title="Ver gráfico">
            <svg width="${width}" height="${height}" style="overflow: visible;">
                <polyline points="${points}" fill="none" stroke="#93c5fd" stroke-width="2" />
                ${circles}
            </svg>
        </div>`;
    };
    
    // Función auxiliar para el cálculo porcentual (usando el totalIngresos acumulado)
    const calcPorcentaje = (m) => {
        if (!totalIngresos) return '0,00 %';
        const pct = (m / totalIngresos) * 100;
        const val = pct.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
        return pct < 0 ? `<span style="color: #ef4444;">${val}</span>` : val;
    };


    // Función global para actualizar visibilidad
    const updateVisibility = () => {
        const collapsedIds = new Set();
        const allRows = tableBody.querySelectorAll('tr');
        allRows.forEach(r => {
            if (r.classList.contains('collapsed')) {
                collapsedIds.add(r.getAttribute('data-node-id'));
            }
        });

        allRows.forEach(r => {
            const parentAttr = r.getAttribute('data-parent-ids');
            if (parentAttr) {
                const parentIds = parentAttr.split(' ');
                const isHidden = parentIds.some(pid => collapsedIds.has(pid));
                r.style.display = isHidden ? 'none' : '';
            }
        });
    };

    // Helper para filas colapsables
    const makeCollapsible = (tr, nodeId) => {
        tr.style.cursor = 'pointer';
        tr.setAttribute('data-node-id', nodeId);
        tr.addEventListener('click', function() {
            this.classList.toggle('collapsed');
            const icon = this.querySelector('.toggle-icon');
            if (icon) {
                icon.textContent = this.classList.contains('collapsed') ? '▶' : '▼';
            }
            updateVisibility();
        });
    };

    // Cálculos globales
    const utilidadBrutaAcumulada = totalIngresos - totalCostos;

    // Helper para ordenar grupos
    const getGroupOrder = (name) => {
        const n = String(name).toUpperCase();
        if (n.includes('INGRESO') && !n.includes('OTROS')) return 1;
        if (n.includes('COSTO') && !n.includes('OTROS')) return 2;
        if (n.includes('GASTO') && !n.includes('OTROS')) return 3;
        if (n.includes('OTROS INGRESOS')) return 4;
        if (n.includes('OTROS EGRESOS')) return 5;
        return 99;
    };

    // Renderizar
    let gIndex = 0;
    let hasRenderedUtilidadBruta = false;
    let hasRenderedResultadoOperativo = false;
    
    const sortedGroupKeys = Object.keys(agrupado).sort((a, b) => getGroupOrder(a) - getGroupOrder(b));
    for (const gName of sortedGroupKeys) {
        const gData = agrupado[gName];
        gIndex++;
        const gId = `g${gIndex}`;

        // Celdas de meses para Grupo
        let celdasMesesG = '';
        mesesOrdenados.forEach((m, index) => {
            let indicator = '';
            if (index > 0) {
                const prevM = mesesOrdenados[index - 1];
                indicator = getVariationIndicator(gData.montosMes[m] || 0, gData.montosMes[prevM] || 0);
            }
            celdasMesesG += `<td style="text-align: right; font-size: 1.1rem; white-space: nowrap;">${formatMonto(gData.montosMes[m] || 0)}${indicator}</td>`;
        });
        
        const sparklineG = createSparkline(mesesOrdenados.map(m => gData.montosMes[m] || 0), gName);

        // Fila de Grupo
        const trG = document.createElement('tr');
        trG.style.backgroundColor = 'var(--row-g-bg)';
        trG.style.fontWeight = 'bold';
        trG.style.color = 'var(--primary-color)';
        trG.className = 'collapsed';
        trG.innerHTML = `
            <td style="font-size: 1.1rem; user-select: none; position: sticky; left: 0; background-color: var(--row-g-bg); z-index: 1;">
                <span class="toggle-icon" style="display:inline-block; width:20px; font-size: 0.9rem;">▶</span>
                ${gName}
            </td>
            ${celdasMesesG}
            <td style="text-align: center; vertical-align: middle;">${sparklineG}</td>
            <td style="text-align: right; font-size: 1.1rem;">${formatMonto(gData.totalAcumulado)}</td>
            <td style="text-align: right; font-size: 1.1rem;">${calcPorcentaje(gData.totalAcumulado)}</td>
        `;
        makeCollapsible(trG, gId);
        tableBody.appendChild(trG);

        let sg1Index = 0;
        for (const [sg1Name, sg1Data] of Object.entries(gData.subgrupos1)) {
            sg1Index++;
            const sg1Id = `${gId}-sg1${sg1Index}`;

            let celdasMesesSg1 = '';
            mesesOrdenados.forEach((m, index) => {
                let indicator = '';
                if (index > 0) {
                    const prevM = mesesOrdenados[index - 1];
                    indicator = getVariationIndicator(sg1Data.montosMes[m] || 0, sg1Data.montosMes[prevM] || 0);
                }
                celdasMesesSg1 += `<td style="text-align: right; white-space: nowrap;">${formatMonto(sg1Data.montosMes[m] || 0)}${indicator}</td>`;
            });
            
            const sparklineSg1 = createSparkline(mesesOrdenados.map(m => sg1Data.montosMes[m] || 0), sg1Name);

            // Fila de Subgrupo 1
            const trSg1 = document.createElement('tr');
            trSg1.setAttribute('data-parent-ids', gId);
            trSg1.style.backgroundColor = 'var(--row-sg2-bg)';
            trSg1.style.fontWeight = '600';
            trSg1.className = 'collapsed';
            trSg1.innerHTML = `
                <td style="padding-left: 25px; user-select: none; position: sticky; left: 0; background-color: var(--row-sg2-bg); z-index: 1;">
                    <span class="toggle-icon" style="display:inline-block; width:20px; font-size: 0.8rem;">▶</span>
                     ${sg1Name}
                </td>
                ${celdasMesesSg1}
                <td style="text-align: center; vertical-align: middle;">${sparklineSg1}</td>
                <td style="text-align: right;">${formatMonto(sg1Data.totalAcumulado)}</td>
                <td style="text-align: right;">${calcPorcentaje(sg1Data.totalAcumulado)}</td>
            `;
            makeCollapsible(trSg1, sg1Id);
            tableBody.appendChild(trSg1);

            let sg2Index = 0;
            for (const [sg2Name, sg2Data] of Object.entries(sg1Data.subgrupos2)) {
                sg2Index++;
                const sg2Id = `${sg1Id}-sg2${sg2Index}`;

                let celdasMesesSg2 = '';
                mesesOrdenados.forEach((m, index) => {
                    let indicator = '';
                    if (index > 0) {
                        const prevM = mesesOrdenados[index - 1];
                        indicator = getVariationIndicator(sg2Data.montosMes[m] || 0, sg2Data.montosMes[prevM] || 0);
                    }
                    celdasMesesSg2 += `<td style="text-align: right; white-space: nowrap;">${formatMonto(sg2Data.montosMes[m])}${indicator}</td>`;
                });
                
                const sparklineSg2 = createSparkline(mesesOrdenados.map(m => sg2Data.montosMes[m] || 0), sg2Name);

                // Fila de Subgrupo 2
                const trSg2 = document.createElement('tr');
                trSg2.setAttribute('data-parent-ids', `${gId} ${sg1Id}`);
                trSg2.style.backgroundColor = 'var(--row-sg-bg)';
                trSg2.className = 'collapsed';
                trSg2.innerHTML = `
                    <td style="padding-left: 45px; user-select: none; position: sticky; left: 0; background-color: var(--row-sg-bg); z-index: 1;">
                        <span class="toggle-icon" style="display:inline-block; width:20px; font-size: 0.8rem;">▶</span>
                         ${sg2Name}
                    </td>
                    ${celdasMesesSg2}
                    <td style="text-align: center; vertical-align: middle;">${sparklineSg2}</td>
                    <td style="text-align: right;">${formatMonto(sg2Data.totalAcumulado)}</td>
                    <td style="text-align: right;">${calcPorcentaje(sg2Data.totalAcumulado)}</td>
                `;
                makeCollapsible(trSg2, sg2Id);
                tableBody.appendChild(trSg2);

                // Filas de datos ordenadas por número de cuenta (cta)
                Object.values(sg2Data.items).sort((a, b) => {
                    const ctaA = String(a.cta || '').trim();
                    const ctaB = String(b.cta || '').trim();
                    return ctaA.localeCompare(ctaB, undefined, { numeric: true, sensitivity: 'base' });
                }).forEach(item => {
                    const trItem = document.createElement('tr');
                    trItem.setAttribute('data-parent-ids', `${gId} ${sg1Id} ${sg2Id}`);
                    
                    let celdasMesesItem = '';
                    mesesOrdenados.forEach((m, index) => {
                        const isClosed = !!periodosCerrados[m.toLowerCase()];
                        const currentMonto = item.montosMes[m] || 0;
                        let indicator = '';
                        if (index > 0) {
                            const prevM = mesesOrdenados[index - 1];
                            indicator = getVariationIndicator(currentMonto, item.montosMes[prevM] || 0);
                        }
                        celdasMesesItem += `<td style="text-align: right; white-space: nowrap;">${formatMonto(currentMonto, isClosed)}${indicator}</td>`;
                    });
                    
                    const sparklineItem = createSparkline(mesesOrdenados.map(m => item.montosMes[m] || 0), item.denominacion);
                    
                    trItem.innerHTML = `
                        <td style="padding-left: 65px; position: sticky; left: 0; background-color: var(--surface-color); z-index: 1;">
                            <span style="color: var(--text-primary);">${item.denominacion || ''}</span>
                            <br>
                            <span style="font-size: 0.8rem; color: var(--text-secondary);">${item.cta || ''}</span>
                        </td>
                        ${celdasMesesItem}
                        <td style="text-align: center; vertical-align: middle;">${sparklineItem}</td>
                        <td style="text-align: right; font-weight: bold;">${formatMonto(item.totalAcumulado)}</td>
                        <td style="text-align: right; font-weight: bold;">${calcPorcentaje(item.totalAcumulado)}</td>
                    `;
                    tableBody.appendChild(trItem);
                });
            }
        }

        // Fila de Utilidad Bruta justo después de Costos
        if (gName.toUpperCase().includes('COSTO') && !hasRenderedUtilidadBruta) {
            const trUB = document.createElement('tr');
            trUB.style.backgroundColor = '#f0fdf4';
            trUB.style.color = '#15803d';
            trUB.style.fontWeight = 'bold';
            
            let celdasMesesUB = '';
            mesesOrdenados.forEach((m, index) => {
                const isClosed = !!periodosCerrados[m.toLowerCase()];
                const ubMes = totalesMesIngresos[m] - totalesMesCostos[m];
                let indicator = '';
                if (index > 0) {
                    const prevM = mesesOrdenados[index - 1];
                    const prevUbMes = totalesMesIngresos[prevM] - totalesMesCostos[prevM];
                    indicator = getVariationIndicator(ubMes, prevUbMes);
                }
                celdasMesesUB += `<td style="text-align: right; white-space: nowrap;">${formatMonto(ubMes, isClosed)}${indicator}</td>`;
            });
            
            const sparklineUB = createSparkline(mesesOrdenados.map(m => totalesMesIngresos[m] - totalesMesCostos[m]), 'UTILIDAD BRUTA');
            
            const pctUB = totalIngresos ? (utilidadBrutaAcumulada / totalIngresos) * 100 : 0;
            const pctUBStr = pctUB.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
            
            trUB.innerHTML = `
                <td style="font-size: 1.15rem; user-select: none; position: sticky; left: 0; background-color: #f0fdf4; z-index: 1; padding-left: 15px;">
                    <span style="display:inline-block; margin-right: 5px;">★</span>
                    UTILIDAD BRUTA
                </td>
                ${celdasMesesUB}
                <td style="text-align: center; vertical-align: middle;">${sparklineUB}</td>
                <td style="text-align: right; font-size: 1.15rem;">${formatMonto(utilidadBrutaAcumulada)}</td>
                <td style="text-align: right; font-size: 1.15rem;">${pctUBStr}</td>
            `;
            tableBody.appendChild(trUB);
            
            // Fila de Margen de Utilidad Bruta
            const trMargenUB = document.createElement('tr');
            trMargenUB.style.backgroundColor = '#f0fdf4';
            trMargenUB.style.color = '#15803d';
            trMargenUB.style.fontWeight = 'bold';
            
            let celdasMesesMargen = '';
            mesesOrdenados.forEach((m, index) => {
                const ubMes = totalesMesIngresos[m] - totalesMesCostos[m];
                const ioMes = totalesMesIngresosOperacionales[m];
                const margenMes = ioMes ? (ubMes / ioMes) * 100 : 0;
                let indicator = '';
                if (index > 0) {
                    const prevM = mesesOrdenados[index - 1];
                    const prevUbMes = totalesMesIngresos[prevM] - totalesMesCostos[prevM];
                    const prevIoMes = totalesMesIngresosOperacionales[prevM];
                    const prevMargenMes = prevIoMes ? (prevUbMes / prevIoMes) * 100 : 0;
                    indicator = getVariationIndicator(margenMes, prevMargenMes);
                }
                const margenMesStr = margenMes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
                celdasMesesMargen += `<td style="text-align: right; white-space: nowrap;">${margenMesStr}${indicator}</td>`;
            });
            
            const sparklineMargenUB = createSparkline(mesesOrdenados.map(m => {
                const ubMes = totalesMesIngresos[m] - totalesMesCostos[m];
                const ioMes = totalesMesIngresosOperacionales[m];
                return ioMes ? (ubMes / ioMes) * 100 : 0;
            }), 'MARGEN DE UTILIDAD BRUTA');

            const margenUBAcumulada = totalIngresosOperacionales ? (utilidadBrutaAcumulada / totalIngresosOperacionales) * 100 : 0;
            const margenUBAcumuladaStr = margenUBAcumulada.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
            
            trMargenUB.innerHTML = `
                <td style="font-size: 1.15rem; user-select: none; position: sticky; left: 0; background-color: #f0fdf4; z-index: 1; padding-left: 15px;">
                    <span style="display:inline-block; margin-right: 5px;">★</span>
                    MARGEN DE UTILIDAD BRUTA
                </td>
                ${celdasMesesMargen}
                <td style="text-align: center; vertical-align: middle;">${sparklineMargenUB}</td>
                <td style="text-align: right; font-size: 1.15rem;">${margenUBAcumuladaStr}</td>
                <td style="text-align: right; font-size: 1.15rem;"></td>
            `;
            tableBody.appendChild(trMargenUB);
            
            hasRenderedUtilidadBruta = true;
        }

        // Fila de Resultado Operativo justo después de Gastos
        if (gName.toUpperCase().includes('GASTO') && !hasRenderedResultadoOperativo) {
            const trRO = document.createElement('tr');
            trRO.style.backgroundColor = '#f0fdf4';
            trRO.style.color = '#15803d';
            trRO.style.fontWeight = 'bold';
            
            const resultadoOperativoAcumulado = utilidadBrutaAcumulada - totalGastos;
            
            let celdasMesesRO = '';
            mesesOrdenados.forEach((m, index) => {
                const isClosed = !!periodosCerrados[m.toLowerCase()];
                const ubMes = totalesMesIngresos[m] - totalesMesCostos[m];
                const roMes = ubMes - totalesMesGastos[m];
                let indicator = '';
                if (index > 0) {
                    const prevM = mesesOrdenados[index - 1];
                    const prevUbMes = totalesMesIngresos[prevM] - totalesMesCostos[prevM];
                    const prevRoMes = prevUbMes - totalesMesGastos[prevM];
                    indicator = getVariationIndicator(roMes, prevRoMes);
                }
                celdasMesesRO += `<td style="text-align: right; white-space: nowrap;">${formatMonto(roMes, isClosed)}${indicator}</td>`;
            });
            
            const sparklineRO = createSparkline(mesesOrdenados.map(m => (totalesMesIngresos[m] - totalesMesCostos[m]) - totalesMesGastos[m]), 'RESULTADO OPERATIVO');
            
            const pctRO = totalIngresos ? (resultadoOperativoAcumulado / totalIngresos) * 100 : 0;
            const pctROStr = pctRO.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
            
            trRO.innerHTML = `
                <td style="font-size: 1.15rem; user-select: none; position: sticky; left: 0; background-color: #f0fdf4; z-index: 1; padding-left: 15px;">
                    <span style="display:inline-block; margin-right: 5px;">★</span>
                    RESULTADO OPERATIVO
                </td>
                ${celdasMesesRO}
                <td style="text-align: center; vertical-align: middle;">${sparklineRO}</td>
                <td style="text-align: right; font-size: 1.15rem;">${formatMonto(resultadoOperativoAcumulado)}</td>
                <td style="text-align: right; font-size: 1.15rem;">${pctROStr}</td>
            `;
            tableBody.appendChild(trRO);
            
            // Fila de Margen de Utilidad Operativa
            const trMargenRO = document.createElement('tr');
            trMargenRO.style.backgroundColor = '#f0fdf4';
            trMargenRO.style.color = '#15803d';
            trMargenRO.style.fontWeight = 'bold';
            
            let celdasMesesMargenRO = '';
            mesesOrdenados.forEach((m, index) => {
                const ubMes = totalesMesIngresos[m] - totalesMesCostos[m];
                const roMes = ubMes - totalesMesGastos[m];
                const ioMes = totalesMesIngresosOperacionales[m];
                const margenROMes = ioMes ? (roMes / ioMes) * 100 : 0;
                let indicator = '';
                if (index > 0) {
                    const prevM = mesesOrdenados[index - 1];
                    const prevUbMes = totalesMesIngresos[prevM] - totalesMesCostos[prevM];
                    const prevRoMes = prevUbMes - totalesMesGastos[prevM];
                    const prevIoMes = totalesMesIngresosOperacionales[prevM];
                    const prevMargenROMes = prevIoMes ? (prevRoMes / prevIoMes) * 100 : 0;
                    indicator = getVariationIndicator(margenROMes, prevMargenROMes);
                }
                const margenROMesStr = margenROMes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
                celdasMesesMargenRO += `<td style="text-align: right; white-space: nowrap;">${margenROMesStr}${indicator}</td>`;
            });
            
            const sparklineMargenRO = createSparkline(mesesOrdenados.map(m => {
                const ubMes = totalesMesIngresos[m] - totalesMesCostos[m];
                const roMes = ubMes - totalesMesGastos[m];
                const ioMes = totalesMesIngresosOperacionales[m];
                return ioMes ? (roMes / ioMes) * 100 : 0;
            }), 'MARGEN DE UTILIDAD OPERATIVA');

            const margenROAcumulado = totalIngresosOperacionales ? (resultadoOperativoAcumulado / totalIngresosOperacionales) * 100 : 0;
            const margenROAcumuladoStr = margenROAcumulado.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
            
            trMargenRO.innerHTML = `
                <td style="font-size: 1.15rem; user-select: none; position: sticky; left: 0; background-color: #f0fdf4; z-index: 1; padding-left: 15px;">
                    <span style="display:inline-block; margin-right: 5px;">★</span>
                    MARGEN DE UTILIDAD OPERATIVA
                </td>
                ${celdasMesesMargenRO}
                <td style="text-align: center; vertical-align: middle;">${sparklineMargenRO}</td>
                <td style="text-align: right; font-size: 1.15rem;">${margenROAcumuladoStr}</td>
                <td style="text-align: right; font-size: 1.15rem;"></td>
            `;
            tableBody.appendChild(trMargenRO);

            hasRenderedResultadoOperativo = true;
        }
    }

    // Fila de Resultado Neto al final
    const trRN = document.createElement('tr');
    trRN.style.backgroundColor = '#dcfce7'; // Verde más intenso
    trRN.style.color = '#166534';
    trRN.style.fontWeight = 'bold';
    
    const resultadoNetoAcumulado = utilidadBrutaAcumulada - totalGastos + totalOtrosIngresos - totalOtrosEgresos;
    
    let celdasMesesRN = '';
    let totalesMesRN = {};
    mesesOrdenados.forEach((m, index) => {
        const isClosed = !!periodosCerrados[m.toLowerCase()];
        const ubMes = totalesMesIngresos[m] - totalesMesCostos[m];
        const roMes = ubMes - totalesMesGastos[m];
        const rnMes = roMes + totalesMesOtrosIngresos[m] - totalesMesOtrosEgresos[m];
        totalesMesRN[m] = rnMes;
        let indicator = '';
        if (index > 0) {
            const prevM = mesesOrdenados[index - 1];
            const prevUbMes = totalesMesIngresos[prevM] - totalesMesCostos[prevM];
            const prevRoMes = prevUbMes - totalesMesGastos[prevM];
            const prevRnMes = prevRoMes + totalesMesOtrosIngresos[prevM] - totalesMesOtrosEgresos[prevM];
            indicator = getVariationIndicator(rnMes, prevRnMes);
        }
        celdasMesesRN += `<td style="text-align: right; font-size: 1.25rem; white-space: nowrap;">${formatMonto(rnMes, isClosed)}${indicator}</td>`;
    });
    
    const sparklineRN = createSparkline(mesesOrdenados.map(m => totalesMesRN[m]), 'RESULTADO NETO');
    
    const pctRN = totalIngresos ? (resultadoNetoAcumulado / totalIngresos) * 100 : 0;
    const pctRNStr = pctRN.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
    
    trRN.innerHTML = `
        <td style="font-size: 1.25rem; user-select: none; position: sticky; left: 0; background-color: #dcfce7; z-index: 1; padding-left: 15px;">
            <span style="display:inline-block; margin-right: 5px;">🏆</span>
            RESULTADO NETO
        </td>
        ${celdasMesesRN}
        <td style="text-align: center; vertical-align: middle;">${sparklineRN}</td>
        <td style="text-align: right; font-size: 1.25rem;">${formatMonto(resultadoNetoAcumulado)}</td>
        <td style="text-align: right; font-size: 1.25rem;">${pctRNStr}</td>
    `;
    tableBody.appendChild(trRN);
    
    // Fila de Margen de Utilidad Neta
    const trMargenRN = document.createElement('tr');
    trMargenRN.style.backgroundColor = '#dcfce7';
    trMargenRN.style.color = '#166534';
    trMargenRN.style.fontWeight = 'bold';
    
    let celdasMesesMargenRN = '';
    mesesOrdenados.forEach((m, index) => {
        const ubMes = totalesMesIngresos[m] - totalesMesCostos[m];
        const roMes = ubMes - totalesMesGastos[m];
        const rnMes = roMes + totalesMesOtrosIngresos[m] - totalesMesOtrosEgresos[m];
        const ioMes = totalesMesIngresosOperacionales[m];
        const margenRNMes = ioMes ? (rnMes / ioMes) * 100 : 0;
        let indicator = '';
        if (index > 0) {
            const prevM = mesesOrdenados[index - 1];
            const prevUbMes = totalesMesIngresos[prevM] - totalesMesCostos[prevM];
            const prevRoMes = prevUbMes - totalesMesGastos[prevM];
            const prevRnMes = prevRoMes + totalesMesOtrosIngresos[prevM] - totalesMesOtrosEgresos[prevM];
            const prevIoMes = totalesMesIngresosOperacionales[prevM];
            const prevMargenRNMes = prevIoMes ? (prevRnMes / prevIoMes) * 100 : 0;
            indicator = getVariationIndicator(margenRNMes, prevMargenRNMes);
        }
        const margenRNMesStr = margenRNMes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
        celdasMesesMargenRN += `<td style="text-align: right; font-size: 1.15rem; white-space: nowrap;">${margenRNMesStr}${indicator}</td>`;
    });
    
    const sparklineMargenRN = createSparkline(mesesOrdenados.map(m => {
        const ubMes = totalesMesIngresos[m] - totalesMesCostos[m];
        const roMes = ubMes - totalesMesGastos[m];
        const rnMes = roMes + totalesMesOtrosIngresos[m] - totalesMesOtrosEgresos[m];
        const ioMes = totalesMesIngresosOperacionales[m];
        return ioMes ? (rnMes / ioMes) * 100 : 0;
    }), 'MARGEN DE UTILIDAD NETA');
    
    const margenRNAcumulado = totalIngresosOperacionales ? (resultadoNetoAcumulado / totalIngresosOperacionales) * 100 : 0;
    const margenRNAcumuladoStr = margenRNAcumulado.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
    
    trMargenRN.innerHTML = `
        <td style="font-size: 1.15rem; user-select: none; position: sticky; left: 0; background-color: #dcfce7; z-index: 1; padding-left: 15px;">
            <span style="display:inline-block; margin-right: 5px;">🏆</span>
            MARGEN DE UTILIDAD NETA
        </td>
        ${celdasMesesMargenRN}
        <td style="text-align: center; vertical-align: middle;">${sparklineMargenRN}</td>
        <td style="text-align: right; font-size: 1.15rem;">${margenRNAcumuladoStr}</td>
        <td style="text-align: right; font-size: 1.15rem;"></td>
    `;
    tableBody.appendChild(trMargenRN);

    // Actualizar tarjetas de resumen
    const summaryCards = document.getElementById('summary-cards');
    const cardTotalGyp = document.getElementById('card-total-gyp');
    const cardPorcentaje = document.getElementById('card-porcentaje-ingresos');

    if (summaryCards) {
        summaryCards.style.display = 'flex';
        cardTotalGyp.innerHTML = formatMonto(resultadoNetoAcumulado);
        
        const margenText = margenRNAcumulado.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
        cardPorcentaje.innerHTML = margenRNAcumulado < 0 ? `<span style="color: #ef4444;">${margenText}</span>` : margenText;
    }

    // Inicializar visibilidad para ocultar los items colapsados por defecto
    updateVisibility();

    // Dibujar gráfico
    renderChart(mesesOrdenados, totalesMesRN);
}

let chartInstance = null;

function renderChart(mesesOrdenados, dataMensual) {
    const ctx = document.getElementById('gyp-chart');
    if (!ctx) return;

    const labels = mesesOrdenados.map(m => m.toUpperCase());
    const dataPoints = mesesOrdenados.map(m => dataMensual[m]);

    if (chartInstance) {
        chartInstance.destroy();
    }

    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = '#4b5563';

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Resultado Neto',
                data: dataPoints,
                borderColor: 'rgb(74, 160, 68)',
                backgroundColor: 'rgba(74, 160, 68, 0.1)',
                borderWidth: 3,
                pointBackgroundColor: 'rgb(74, 160, 68)',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#1f2937',
                    bodyColor: '#1f2937',
                    borderColor: '#e5e7eb',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            let val = context.raw || 0;
                            return 'Resultado Neto: ' + val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: '#f3f4f6',
                        drawBorder: false
                    },
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString('es-VE');
                        }
                    }
                },
                x: {
                    grid: {
                        display: false,
                        drawBorder: false
                    }
                }
            }
        }
    });
}

// Modal logic para Sparklines
let sparklineModalChart = null;

window.openSparklineModal = function(titleEnc, dataEnc) {
    const title = decodeURIComponent(titleEnc);
    const dataPoints = JSON.parse(decodeURIComponent(dataEnc));
    const labels = window._mesesOrdenados || [];
    
    let modal = document.getElementById('sparkline-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'sparkline-modal';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
        modal.style.zIndex = '9999';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        
        modal.innerHTML = `
            <div style="background: white; border-radius: 8px; padding: 20px; width: 80%; max-width: 800px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 id="sparkline-modal-title" style="margin: 0; color: #1f2937; font-family: 'Inter', sans-serif;"></h3>
                    <button onclick="document.getElementById('sparkline-modal').style.display = 'none'" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #6b7280;">&times;</button>
                </div>
                <div style="height: 400px; width: 100%;">
                    <canvas id="sparkline-modal-canvas"></canvas>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    document.getElementById('sparkline-modal-title').textContent = 'Tendencia: ' + title;
    modal.style.display = 'flex';
    
    const ctx = document.getElementById('sparkline-modal-canvas');
    if (sparklineModalChart) {
        sparklineModalChart.destroy();
    }
    
    sparklineModalChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(l => l.toUpperCase()),
            datasets: [{
                label: title,
                data: dataPoints,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                borderWidth: 3,
                pointBackgroundColor: '#2563eb',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 5,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.raw.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString('es-VE');
                        }
                    }
                }
            }
        }
    });
};
