// Cargar Google Charts
if (typeof google !== 'undefined') {
    google.charts.load('current', {'packages':['corechart']});
}

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

    // Actualizar títulos en la interfaz si existen
    if (tituloEmpresa) tituloEmpresa.textContent = valorEmpresa;
    if (tituloPeriodo) tituloPeriodo.textContent = `${valorPeriodo} (${valorDimension})`;

    // 2. Construir la URL de consulta a Supabase según el formato indicado
    const urlConsulta = `${CONFIG.SUPABASE_URL}/rest/v1/gyp?empresa=eq.${encodeURIComponent(valorEmpresa)}&periodo=eq.${encodeURIComponent(valorPeriodo)}&dimension=eq.${encodeURIComponent(valorDimension)}&order=grupo.asc,cta.asc`;

    // 3. Realizar la petición fetch a Supabase
    fetch(urlConsulta, {
        method: 'GET',
        headers: {
            'apikey': CONFIG.SUPABASE_KEY,
            'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Error en la petición: ${response.status} ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        renderTable(data);
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

function renderTable(data) {
    const tableBody = document.getElementById('table-body');
    const tableHeader = document.getElementById('table-header');
    
    tableBody.innerHTML = '';
    tableHeader.innerHTML = '';
    
    if (!data || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: #6b7280;">No hay datos disponibles para esta empresa y periodo.</td></tr>';
        return;
    }
    
    // Determinar si el periodo está cerrado
    const isPeriodoCerrado = data.length > 0 && data[0].cerrado === 'Periodo Cerrado';
    const lockIcon = isPeriodoCerrado ? ' 🔒' : '';

    // Cabeceras fijas
    const headers = ['DENOMINACION', ' ', `MONTO${lockIcon}`, '% / INGRESOS'];
    headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        if (h.includes('MONTO') || h === '% / INGRESOS') th.style.textAlign = 'right';
        tableHeader.appendChild(th);
    });

    // Procesar datos para agrupamiento
    const agrupado = {};
    let totalGYP = 0;
    let totalIngresos = 0;
    let totalCostos = 0;
    let totalGastos = 0;
    let totalIngresosOperacionales = 0;
    let totalOtrosIngresos = 0;
    let totalOtrosEgresos = 0;

    data.forEach(row => {
        const g = row.grupo || 'Sin Grupo';
        const sg2 = row.subgrupo2 || 'Sin Subgrupo 2';
        const sg = row.subgrupo || 'Sin Subgrupo';
        let monto = parseFloat(row.monto) || 0;
        monto = Math.round((monto + Number.EPSILON) * 100) / 100;

        // Sumar para tarjetas de resumen
        totalGYP += monto;
        if (g.toUpperCase().includes('INGRESO') && !g.toUpperCase().includes('OTROS')) {
            totalIngresos += monto;
        }
        if (g.toUpperCase().includes('COSTO') && !g.toUpperCase().includes('OTROS')) {
            totalCostos += monto;
        }
        if (g.toUpperCase().includes('GASTO') && !g.toUpperCase().includes('OTROS')) {
            totalGastos += monto;
        }
        if (g.toUpperCase().includes('OTROS INGRESOS')) {
            totalOtrosIngresos += monto;
        }
        if (g.toUpperCase().includes('OTROS EGRESOS')) {
            totalOtrosEgresos += monto;
        }
        if (sg2.toUpperCase().includes('INGRESOS OPERACIONALES')) {
            totalIngresosOperacionales += monto;
        }

        if (!agrupado[g]) {
            agrupado[g] = { total: 0, subgrupos1: {} };
        }
        agrupado[g].total += monto;

        if (!agrupado[g].subgrupos1[sg]) {
            agrupado[g].subgrupos1[sg] = { total: 0, subgrupos2: {} };
        }
        agrupado[g].subgrupos1[sg].total += monto;

        if (!agrupado[g].subgrupos1[sg].subgrupos2[sg2]) {
            agrupado[g].subgrupos1[sg].subgrupos2[sg2] = { total: 0, items: [] };
        }
        agrupado[g].subgrupos1[sg].subgrupos2[sg2].total += monto;
        
        agrupado[g].subgrupos1[sg].subgrupos2[sg2].items.push(row);
    });

    // Función auxiliar para formatear montos
    const formatMonto = (m, showLock = false) => {
        const val = m.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const txt = m < 0 ? `<span style="color: #ef4444;">${val}</span>` : val;
        return showLock ? `🔒 ${txt}` : txt;
    };
    
    // Función auxiliar para el cálculo porcentual
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
    const utilidadBruta = totalIngresos - totalCostos;

    // Renderizar
    let gIndex = 0;
    let hasRenderedUtilidadBruta = false;
    let hasRenderedResultadoOperativo = false;
    for (const [gName, gData] of Object.entries(agrupado)) {
        gIndex++;
        const gId = `g${gIndex}`;
        // Fila de Grupo
        const trG = document.createElement('tr');
        trG.style.backgroundColor = 'var(--row-g-bg)';
        trG.style.fontWeight = 'bold';
        trG.style.color = 'var(--primary-color)';
        trG.className = 'collapsed';
        trG.innerHTML = `
            <td colspan="2" style="font-size: 1.1rem; user-select: none;">
                <span class="toggle-icon" style="display:inline-block; width:20px; font-size: 0.9rem;">▶</span>
                ${gName}
            </td>
            <td style="text-align: right; font-size: 1.1rem;">${formatMonto(gData.total)}</td>
            <td style="text-align: right; font-size: 1.1rem;">${calcPorcentaje(gData.total)}</td>
        `;
        makeCollapsible(trG, gId);
        tableBody.appendChild(trG);

        let sg1Index = 0;
        for (const [sg1Name, sg1Data] of Object.entries(gData.subgrupos1)) {
            sg1Index++;
            const sg1Id = `${gId}-sg1${sg1Index}`;

            // Fila de Subgrupo 1
            const trSg1 = document.createElement('tr');
            trSg1.setAttribute('data-parent-ids', gId);
            trSg1.style.backgroundColor = 'var(--row-sg2-bg)';
            trSg1.style.fontWeight = '600';
            trSg1.className = 'collapsed';
            trSg1.innerHTML = `
                <td colspan="2" style="padding-left: 25px; user-select: none;">
                    <span class="toggle-icon" style="display:inline-block; width:20px; font-size: 0.8rem;">▶</span>
                     ${sg1Name}
                </td>
                <td style="text-align: right;">${formatMonto(sg1Data.total)}</td>
                <td style="text-align: right;">${calcPorcentaje(sg1Data.total)}</td>
            `;
            makeCollapsible(trSg1, sg1Id);
            tableBody.appendChild(trSg1);

            let sg2Index = 0;
            for (const [sg2Name, sg2Data] of Object.entries(sg1Data.subgrupos2)) {
                sg2Index++;
                const sg2Id = `${sg1Id}-sg2${sg2Index}`;

                // Fila de Subgrupo 2
                const trSg2 = document.createElement('tr');
                trSg2.setAttribute('data-parent-ids', `${gId} ${sg1Id}`);
                trSg2.style.backgroundColor = 'var(--row-sg-bg)';
                trSg2.className = 'collapsed';
                trSg2.innerHTML = `
                    <td colspan="2" style="padding-left: 45px; user-select: none;">
                        <span class="toggle-icon" style="display:inline-block; width:20px; font-size: 0.8rem;">▶</span>
                         ${sg2Name}
                    </td>
                    <td style="text-align: right;">${formatMonto(sg2Data.total)}</td>
                    <td style="text-align: right;">${calcPorcentaje(sg2Data.total)}</td>
                `;
                makeCollapsible(trSg2, sg2Id);
                tableBody.appendChild(trSg2);

                sg2Data.items.forEach(item => {
                    const trItem = document.createElement('tr');
                    trItem.setAttribute('data-parent-ids', `${gId} ${sg1Id} ${sg2Id}`);
                    trItem.style.backgroundColor = 'var(--surface-color)';
                    trItem.innerHTML = `
                        <td style="padding-left: 65px; color: var(--text-secondary); font-size: 0.95rem;">${item.cta || '-'}</td>
                        <td style="color: var(--text-primary); font-size: 0.95rem;">${item.denominacion || '-'}</td>
                        <td style="text-align: right; font-size: 0.95rem;">${formatMonto(parseFloat(item.monto))}</td>
                        <td style="text-align: right; font-size: 0.95rem;">${calcPorcentaje(parseFloat(item.monto))}</td>
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
            
            const utilidadBrutaStr = utilidadBruta.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const pctUB = totalIngresos ? (utilidadBruta / totalIngresos) * 100 : 0;
            const pctUBStr = pctUB.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
            
            trUB.innerHTML = `
                <td colspan="2" style="font-size: 1.15rem; user-select: none; padding-left: 15px;">
                    <span style="display:inline-block; margin-right: 5px;">★</span>
                    UTILIDAD BRUTA
                </td>
                <td style="text-align: right; font-size: 1.15rem;">${utilidadBrutaStr}</td>
                <td style="text-align: right; font-size: 1.15rem;">${pctUBStr}</td>
            `;
            tableBody.appendChild(trUB);
            
            // Fila de Margen de Utilidad Bruta
            const trMargenUB = document.createElement('tr');
            trMargenUB.style.backgroundColor = '#f0fdf4';
            trMargenUB.style.color = '#15803d';
            trMargenUB.style.fontWeight = 'bold';
            
            const margenUB = totalIngresosOperacionales ? (utilidadBruta / totalIngresosOperacionales) * 100 : 0;
            const margenUBStr = margenUB.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
            
            trMargenUB.innerHTML = `
                <td colspan="2" style="font-size: 1.15rem; user-select: none; padding-left: 15px;">
                    <span style="display:inline-block; margin-right: 5px;">★</span>
                    MARGEN DE UTILIDAD BRUTA
                </td>
                <td style="text-align: right; font-size: 1.15rem;">${margenUBStr}</td>
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
            
            const resultadoOperativo = utilidadBruta - totalGastos;
            const roStr = resultadoOperativo.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const pctRO = totalIngresos ? (resultadoOperativo / totalIngresos) * 100 : 0;
            const pctROStr = pctRO.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
            
            trRO.innerHTML = `
                <td colspan="2" style="font-size: 1.15rem; user-select: none; padding-left: 15px;">
                    <span style="display:inline-block; margin-right: 5px;">★</span>
                    RESULTADO OPERATIVO
                </td>
                <td style="text-align: right; font-size: 1.15rem;">${roStr}</td>
                <td style="text-align: right; font-size: 1.15rem;">${pctROStr}</td>
            `;
            tableBody.appendChild(trRO);
            
            // Fila de Margen de Utilidad Operativa
            const trMargenRO = document.createElement('tr');
            trMargenRO.style.backgroundColor = '#f0fdf4';
            trMargenRO.style.color = '#15803d';
            trMargenRO.style.fontWeight = 'bold';
            
            const margenRO = totalIngresosOperacionales ? (resultadoOperativo / totalIngresosOperacionales) * 100 : 0;
            const margenROStr = margenRO.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
            
            trMargenRO.innerHTML = `
                <td colspan="2" style="font-size: 1.15rem; user-select: none; padding-left: 15px;">
                    <span style="display:inline-block; margin-right: 5px;">★</span>
                    MARGEN DE UTILIDAD OPERATIVA
                </td>
                <td style="text-align: right; font-size: 1.15rem;">${margenROStr}</td>
                <td style="text-align: right; font-size: 1.15rem;"></td>
            `;
            tableBody.appendChild(trMargenRO);

            hasRenderedResultadoOperativo = true;
        }
    }

    // Fila de Resultado Neto al final
    const trRN = document.createElement('tr');
    trRN.style.backgroundColor = '#dcfce7';
    trRN.style.color = '#166534';
    trRN.style.fontWeight = 'bold';
    
    const resultadoNeto = utilidadBruta - totalGastos + totalOtrosIngresos - totalOtrosEgresos;
    const rnStr = resultadoNeto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pctRN = totalIngresos ? (resultadoNeto / totalIngresos) * 100 : 0;
    const pctRNStr = pctRN.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
    
    trRN.innerHTML = `
        <td colspan="2" style="font-size: 1.25rem; user-select: none; padding-left: 15px;">
            <span style="display:inline-block; margin-right: 5px;">🏆</span>
            RESULTADO NETO
        </td>
        <td style="text-align: right; font-size: 1.25rem;">${rnStr}</td>
        <td style="text-align: right; font-size: 1.25rem;">${pctRNStr}</td>
    `;
    tableBody.appendChild(trRN);
    
    // Fila de Margen de Utilidad Neta
    const trMargenRN = document.createElement('tr');
    trMargenRN.style.backgroundColor = '#dcfce7';
    trMargenRN.style.color = '#166534';
    trMargenRN.style.fontWeight = 'bold';
    
    const margenRN = totalIngresosOperacionales ? (resultadoNeto / totalIngresosOperacionales) * 100 : 0;
    const margenRNStr = margenRN.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
    
    trMargenRN.innerHTML = `
        <td colspan="2" style="font-size: 1.15rem; user-select: none; padding-left: 15px;">
            <span style="display:inline-block; margin-right: 5px;">🏆</span>
            MARGEN DE UTILIDAD NETA
        </td>
        <td style="text-align: right; font-size: 1.15rem;">${margenRNStr}</td>
        <td style="text-align: right; font-size: 1.15rem;"></td>
    `;
    tableBody.appendChild(trMargenRN);

    // Actualizar tarjetas de resumen
    const summaryCards = document.getElementById('summary-cards');
    const cardTotalGyp = document.getElementById('card-total-gyp');
    const cardPorcentaje = document.getElementById('card-porcentaje-ingresos');

    if (summaryCards) {
        summaryCards.style.display = 'flex';
        cardTotalGyp.innerHTML = formatMonto(resultadoNeto);
        
        const margenText = margenRN.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
        cardPorcentaje.innerHTML = margenRN < 0 ? `<span style="color: #ef4444;">${margenText}</span>` : margenText;
    }

    // Inicializar visibilidad para ocultar los items colapsados por defecto
    updateVisibility();

    // Dibujar gráfico de torta
    renderPieChart(agrupado);
}

function renderPieChart(agrupado) {
    const drawChart = () => {
        const chartDiv = document.getElementById('gyp-pie-chart');
        if (!chartDiv) return;

        // Limpiar contenedor
        chartDiv.innerHTML = '';

        const dataArray = [['Grupo', 'Total GYP']];
        for (const [gName, gData] of Object.entries(agrupado)) {
            dataArray.push([gName, Math.abs(gData.total)]);
        }

        const data = google.visualization.arrayToDataTable(dataArray);

        const options = {
            is3D: true,
            backgroundColor: 'transparent',
            legend: {
                position: 'right',
                textStyle: { color: '#4b5563', fontName: 'Inter', fontSize: 12 }
            },
            chartArea: { left: 10, top: 10, width: '100%', height: '90%' },
            colors: ['#4aa044', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#64748b', '#84cc16']
        };

        const chart = new google.visualization.PieChart(chartDiv);
        
        // Formateador de números
        const formatter = new google.visualization.NumberFormat({
            pattern: '#,##0.00'
        });
        formatter.format(data, 1);

        chart.draw(data, options);
    };

    if (typeof google !== 'undefined' && google.visualization && google.visualization.PieChart) {
        drawChart();
    } else if (typeof google !== 'undefined') {
        google.charts.setOnLoadCallback(drawChart);
    }
}
