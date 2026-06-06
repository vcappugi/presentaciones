// Cargar Google Charts
if (typeof google !== 'undefined') {
    google.charts.load('current', {'packages':['corechart']});
}

document.addEventListener('DOMContentLoaded', async () => {
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

    // Verificar si la empresa seleccionada está permitida para el usuario actual
    const allowed = await window.getAllowedCompanies();
    if (allowed && (!valorEmpresa || !allowed.includes(valorEmpresa))) {
        alert('Acceso denegado: No tienes permisos para ver esta empresa.');
        window.location.href = 'index.html';
        return;
    }

    // Referencias a elementos del DOM
    const errorEl = document.getElementById('error-message');
    const loadingEl = document.getElementById('loading');

    // Validar que existan los parámetros
    if (!valorEmpresa || !valorPeriodo || !valorDimension) {
        errorEl.textContent = 'Faltan parámetros de filtro. Por favor, ingresa desde el inicio para seleccionarlos.';
        errorEl.classList.remove('hidden');
        loadingEl.classList.add('hidden');
        return;
    }

    // Actualizar enlace al dashboard simple
    const btnVerSimple = document.getElementById('btn-ver-simple');
    if (btnVerSimple) {
        btnVerSimple.href = `empresa1.html?empresa=${encodeURIComponent(valorEmpresa)}&periodo=${encodeURIComponent(valorPeriodo)}&dimension=${encodeURIComponent(valorDimension)}`;
    }

    // Cargar Divisiones de la empresa y luego el GyP
    fetchDivisiones(valorEmpresa, valorPeriodo, valorDimension);
});

async function fetchDivisiones(empresa, periodo, dimension) {
    const errorEl = document.getElementById('error-message');
    const loadingEl = document.getElementById('loading');
    
    try {
        const urlDivi = `${CONFIG.SUPABASE_URL}/rest/v1/divi?empresa=eq.${encodeURIComponent(empresa)}&order=id.asc`;
        const resDivi = await fetch(urlDivi, {
            method: 'GET',
            headers: {
                'apikey': CONFIG.SUPABASE_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!resDivi.ok) {
            throw new Error(`Error al consultar divisiones: ${resDivi.status} ${resDivi.statusText}`);
        }
        
        let divisiones = await resDivi.json();
        
        if (!divisiones || divisiones.length === 0) {
            // Si la empresa no tiene divisiones configuradas en la tabla divi, usamos el campo "monto" de forma directa
            divisiones = [{
                division: 'Monto',
                columna: 'monto'
            }];
        }

        // Consultar datos GyP
        const urlGyp = `${CONFIG.SUPABASE_URL}/rest/v1/gyp?empresa=eq.${encodeURIComponent(empresa)}&periodo=eq.${encodeURIComponent(periodo)}&dimension=eq.${encodeURIComponent(dimension)}&order=grupo.asc,cta.asc`;
        const resGyp = await fetch(urlGyp, {
            method: 'GET',
            headers: {
                'apikey': CONFIG.SUPABASE_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!resGyp.ok) {
            throw new Error(`Error al consultar GyP: ${resGyp.status} ${resGyp.statusText}`);
        }
        
        const gypData = await resGyp.json();
        
        renderDivisionesTable(gypData, divisiones);
        
    } catch (error) {
        console.error('Error cargando datos:', error);
        errorEl.textContent = 'Error al cargar los datos: ' + error.message;
        errorEl.classList.remove('hidden');
    } finally {
        loadingEl.classList.add('hidden');
    }
}

function renderDivisionesTable(gypData, divisiones) {
    const tableBody = document.getElementById('table-body');
    const tableHeader = document.getElementById('table-header');
    
    tableBody.innerHTML = '';
    tableHeader.innerHTML = '';
    
    const isSingleVirtual = divisiones.length === 1 && divisiones[0].columna === 'monto';
    
    if (!gypData || gypData.length === 0) {
        const totalCols = divisiones.length + (isSingleVirtual ? 3 : 4);
        tableBody.innerHTML = `<tr><td colspan="${totalCols}" style="text-align: center; padding: 20px; color: #6b7280;">No hay datos disponibles para esta empresa y periodo.</td></tr>`;
        return;
    }
    
    // Determinar si el periodo está cerrado
    const isPeriodoCerrado = gypData.length > 0 && gypData[0].cerrado === 'Periodo Cerrado';
    const lockIcon = isPeriodoCerrado ? ' 🔒' : '';

    // Cabeceras de tabla
    // Cuenta, Denominación, [Divisiones...], Total Consolidado, % / Ingresos
    const thCuenta = document.createElement('th');
    thCuenta.textContent = 'CUENTA';
    tableHeader.appendChild(thCuenta);
    
    const thDenom = document.createElement('th');
    thDenom.textContent = 'DENOMINACION';
    tableHeader.appendChild(thDenom);
    
    // Agregar cabecera por cada división
    divisiones.forEach(div => {
        const th = document.createElement('th');
        th.textContent = `${div.division.toUpperCase()}${lockIcon}`;
        th.style.textAlign = 'right';
        tableHeader.appendChild(th);
    });
    
    if (!isSingleVirtual) {
        const thTotal = document.createElement('th');
        thTotal.textContent = 'TOTAL CONSOLIDADO';
        thTotal.style.textAlign = 'right';
        tableHeader.appendChild(thTotal);
    }
    
    const thPct = document.createElement('th');
    thPct.textContent = '% / INGRESOS';
    thPct.style.textAlign = 'right';
    tableHeader.appendChild(thPct);

    // Estructura de datos para agrupamiento
    // agrupado[grupo][subgrupo1][subgrupo2]
    const agrupado = {};
    
    // Inicializar contadores para sumas totales por división
    // Usaremos la columna de la división en gyp como clave del mapa
    const totalIngresosDiv = {};
    const totalCostosDiv = {};
    const totalGastosDiv = {};
    const totalOtrosIngresosDiv = {};
    const totalOtrosEgresosDiv = {};
    const totalIngresosOperacionalesDiv = {};
    
    divisiones.forEach(div => {
        totalIngresosDiv[div.columna] = 0;
        totalCostosDiv[div.columna] = 0;
        totalGastosDiv[div.columna] = 0;
        totalOtrosIngresosDiv[div.columna] = 0;
        totalOtrosEgresosDiv[div.columna] = 0;
        totalIngresosOperacionalesDiv[div.columna] = 0;
    });

    let totalIngresosConsolidated = 0;
    let totalCostosConsolidated = 0;
    let totalGastosConsolidated = 0;
    let totalOtrosIngresosConsolidated = 0;
    let totalOtrosEgresosConsolidated = 0;
    let totalIngresosOperacionalesConsolidated = 0;

    gypData.forEach(row => {
        const g = row.grupo || 'Sin Grupo';
        const sg = row.subgrupo || 'Sin Subgrupo';
        const sg2 = row.subgrupo2 || 'Sin Subgrupo 2';

        // Sumar valores por cada división
        divisiones.forEach(div => {
            const val = parseFloat(row[div.columna]) || 0;
            const valRounded = Math.round((val + Number.EPSILON) * 100) / 100;
            
            if (g.toUpperCase().includes('INGRESO') && !g.toUpperCase().includes('OTROS')) {
                totalIngresosDiv[div.columna] += valRounded;
            }
            if (g.toUpperCase().includes('COSTO') && !g.toUpperCase().includes('OTROS')) {
                totalCostosDiv[div.columna] += valRounded;
            }
            if (g.toUpperCase().includes('GASTO') && !g.toUpperCase().includes('OTROS')) {
                totalGastosDiv[div.columna] += valRounded;
            }
            if (g.toUpperCase().includes('OTROS INGRESOS')) {
                totalOtrosIngresosDiv[div.columna] += valRounded;
            }
            if (g.toUpperCase().includes('OTROS EGRESOS')) {
                totalOtrosEgresosDiv[div.columna] += valRounded;
            }
            if (sg2.toUpperCase().includes('INGRESOS OPERACIONALES')) {
                totalIngresosOperacionalesDiv[div.columna] += valRounded;
            }
        });

        // Crear la estructura de árbol agrupado
        if (!agrupado[g]) {
            agrupado[g] = { totalDiv: {}, totalConsolidated: 0, subgrupos1: {} };
            divisiones.forEach(d => agrupado[g].totalDiv[d.columna] = 0);
        }
        
        if (!agrupado[g].subgrupos1[sg]) {
            agrupado[g].subgrupos1[sg] = { totalDiv: {}, totalConsolidated: 0, subgrupos2: {} };
            divisiones.forEach(d => agrupado[g].subgrupos1[sg].totalDiv[d.columna] = 0);
        }
        
        if (!agrupado[g].subgrupos1[sg].subgrupos2[sg2]) {
            agrupado[g].subgrupos1[sg].subgrupos2[sg2] = { totalDiv: {}, totalConsolidated: 0, items: [] };
            divisiones.forEach(d => agrupado[g].subgrupos1[sg].subgrupos2[sg2].totalDiv[d.columna] = 0);
        }

        // Sumar cada división al total del item, subgrupo2, subgrupo1 y grupo
        let itemConsolidatedTotal = 0;
        
        divisiones.forEach(div => {
            const val = parseFloat(row[div.columna]) || 0;
            const valRounded = Math.round((val + Number.EPSILON) * 100) / 100;
            
            agrupado[g].totalDiv[div.columna] += valRounded;
            agrupado[g].subgrupos1[sg].totalDiv[div.columna] += valRounded;
            agrupado[g].subgrupos1[sg].subgrupos2[sg2].totalDiv[div.columna] += valRounded;
            
            itemConsolidatedTotal += valRounded;
        });

        itemConsolidatedTotal = Math.round((itemConsolidatedTotal + Number.EPSILON) * 100) / 100;
        
        agrupado[g].totalConsolidated += itemConsolidatedTotal;
        agrupado[g].subgrupos1[sg].totalConsolidated += itemConsolidatedTotal;
        agrupado[g].subgrupos1[sg].subgrupos2[sg2].totalConsolidated += itemConsolidatedTotal;

        // Añadir el item a la lista del subgrupo2
        agrupado[g].subgrupos1[sg].subgrupos2[sg2].items.push({
            ...row,
            consolidatedTotal: itemConsolidatedTotal
        });
    });

    // Calcular totales consolidados generales
    divisiones.forEach(div => {
        totalIngresosConsolidated += totalIngresosDiv[div.columna];
        totalCostosConsolidated += totalCostosDiv[div.columna];
        totalGastosConsolidated += totalGastosDiv[div.columna];
        totalOtrosIngresosConsolidated += totalOtrosIngresosDiv[div.columna];
        totalOtrosEgresosConsolidated += totalOtrosEgresosDiv[div.columna];
        totalIngresosOperacionalesConsolidated += totalIngresosOperacionalesDiv[div.columna];
    });

    // Redondear totales consolidados
    totalIngresosConsolidated = Math.round((totalIngresosConsolidated + Number.EPSILON) * 100) / 100;
    totalCostosConsolidated = Math.round((totalCostosConsolidated + Number.EPSILON) * 100) / 100;
    totalGastosConsolidated = Math.round((totalGastosConsolidated + Number.EPSILON) * 100) / 100;
    totalOtrosIngresosConsolidated = Math.round((totalOtrosIngresosConsolidated + Number.EPSILON) * 100) / 100;
    totalOtrosEgresosConsolidated = Math.round((totalOtrosEgresosConsolidated + Number.EPSILON) * 100) / 100;
    totalIngresosOperacionalesConsolidated = Math.round((totalIngresosOperacionalesConsolidated + Number.EPSILON) * 100) / 100;

    // Utilidades/Resultados consolidados
    const utilidadBrutaConsolidated = totalIngresosConsolidated - totalCostosConsolidated;
    const resultadoOperativoConsolidated = utilidadBrutaConsolidated - totalGastosConsolidated;
    const resultadoNetoConsolidated = utilidadBrutaConsolidated - totalGastosConsolidated + totalOtrosIngresosConsolidated - totalOtrosEgresosConsolidated;
    const margenUtilidadNetaConsolidated = totalIngresosOperacionalesConsolidated ? (resultadoNetoConsolidated / totalIngresosOperacionalesConsolidated) * 100 : 0;

    // Helpers para formatear
    const formatVal = (m) => {
        const val = m.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return m < 0 ? `<span style="color: #ef4444;">${val}</span>` : val;
    };
    
    const calcPorcentaje = (m) => {
        if (!totalIngresosConsolidated) return '0,00 %';
        const pct = (m / totalIngresosConsolidated) * 100;
        const val = pct.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
        return pct < 0 ? `<span style="color: #ef4444;">${val}</span>` : val;
    };

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

    // Renderizar Filas de Agrupamiento y de Cuentas
    let gIndex = 0;
    let hasRenderedUtilidadBruta = false;
    let hasRenderedResultadoOperativo = false;
    
    const sortedGroupKeys = Object.keys(agrupado).sort((a, b) => getGroupOrder(a) - getGroupOrder(b));
    
    for (const gName of sortedGroupKeys) {
        const gData = agrupado[gName];
        gIndex++;
        const gId = `g${gIndex}`;
        
        // Fila de Grupo
        const trG = document.createElement('tr');
        trG.style.backgroundColor = 'var(--row-g-bg)';
        trG.style.fontWeight = 'bold';
        trG.style.color = 'var(--primary-color)';
        trG.className = 'collapsed';
        
        let colsHtml = `
            <td colspan="2" style="font-size: 1.05rem; user-select: none;">
                <span class="toggle-icon" style="display:inline-block; width:20px; font-size: 0.9rem;">▶</span>
                ${gName}
            </td>
        `;
        
        divisiones.forEach(d => {
            colsHtml += `<td style="text-align: right; font-size: 1.05rem;">${formatVal(gData.totalDiv[d.columna])}</td>`;
        });
        
        if (!isSingleVirtual) {
            colsHtml += `<td style="text-align: right; font-size: 1.05rem;">${formatVal(gData.totalConsolidated)}</td>`;
        }
        
        colsHtml += `
            <td style="text-align: right; font-size: 1.05rem;">${calcPorcentaje(gData.totalConsolidated)}</td>
        `;
        
        trG.innerHTML = colsHtml;
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
            
            let sg1Html = `
                <td colspan="2" style="padding-left: 25px; user-select: none;">
                    <span class="toggle-icon" style="display:inline-block; width:20px; font-size: 0.8rem;">▶</span>
                    ${sg1Name}
                </td>
            `;
            
            divisiones.forEach(d => {
                sg1Html += `<td style="text-align: right;">${formatVal(sg1Data.totalDiv[d.columna])}</td>`;
            });
            
            if (!isSingleVirtual) {
                sg1Html += `<td style="text-align: right;">${formatVal(sg1Data.totalConsolidated)}</td>`;
            }
            
            sg1Html += `
                <td style="text-align: right;">${calcPorcentaje(sg1Data.totalConsolidated)}</td>
            `;
            
            trSg1.innerHTML = sg1Html;
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
                
                let sg2Html = `
                    <td colspan="2" style="padding-left: 45px; user-select: none;">
                        <span class="toggle-icon" style="display:inline-block; width:20px; font-size: 0.8rem;">▶</span>
                        ${sg2Name}
                    </td>
                `;
                
                divisiones.forEach(d => {
                    sg2Html += `<td style="text-align: right;">${formatVal(sg2Data.totalDiv[d.columna])}</td>`;
                });
                
                if (!isSingleVirtual) {
                    sg2Html += `<td style="text-align: right;">${formatVal(sg2Data.totalConsolidated)}</td>`;
                }
                
                sg2Html += `
                    <td style="text-align: right;">${calcPorcentaje(sg2Data.totalConsolidated)}</td>
                `;
                
                trSg2.innerHTML = sg2Html;
                makeCollapsible(trSg2, sg2Id);
                tableBody.appendChild(trSg2);

                // Cuentas individuales
                sg2Data.items.forEach(item => {
                    const trItem = document.createElement('tr');
                    trItem.setAttribute('data-parent-ids', `${gId} ${sg1Id} ${sg2Id}`);
                    trItem.style.backgroundColor = 'var(--surface-color)';
                    
                    let itemHtml = `
                        <td style="padding-left: 65px; color: var(--text-secondary); font-size: 0.95rem;">${item.cta || '-'}</td>
                        <td style="color: var(--text-primary); font-size: 0.95rem;">${item.denominacion || '-'}</td>
                    `;
                    
                    divisiones.forEach(d => {
                        const v = parseFloat(item[d.columna]) || 0;
                        itemHtml += `<td style="text-align: right; font-size: 0.95rem;">${formatVal(v)}</td>`;
                    });
                    
                    if (!isSingleVirtual) {
                        itemHtml += `<td style="text-align: right; font-size: 0.95rem; font-weight: 500;">${formatVal(item.consolidatedTotal)}</td>`;
                    }
                    
                    itemHtml += `
                        <td style="text-align: right; font-size: 0.95rem;">${calcPorcentaje(item.consolidatedTotal)}</td>
                    `;
                    
                    trItem.innerHTML = itemHtml;
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
            
            let ubHtml = `
                <td colspan="2" style="font-size: 1.1rem; user-select: none; padding-left: 15px;">
                    <span style="display:inline-block; margin-right: 5px;">★</span>
                    UTILIDAD BRUTA
                </td>
            `;
            
            divisiones.forEach(d => {
                const ubDiv = totalIngresosDiv[d.columna] - totalCostosDiv[d.columna];
                ubHtml += `<td style="text-align: right; font-size: 1.1rem;">${formatVal(ubDiv)}</td>`;
            });
            
            const pctUB = totalIngresosConsolidated ? (utilidadBrutaConsolidated / totalIngresosConsolidated) * 100 : 0;
            const pctUBStr = pctUB.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
            
            if (!isSingleVirtual) {
                ubHtml += `<td style="text-align: right; font-size: 1.1rem;">${formatVal(utilidadBrutaConsolidated)}</td>`;
            }
            
            ubHtml += `
                <td style="text-align: right; font-size: 1.1rem;">${pctUBStr}</td>
            `;
            
            trUB.innerHTML = ubHtml;
            tableBody.appendChild(trUB);
            
            // Fila de Margen de Utilidad Bruta
            const trMargenUB = document.createElement('tr');
            trMargenUB.style.backgroundColor = '#f0fdf4';
            trMargenUB.style.color = '#15803d';
            trMargenUB.style.fontWeight = 'bold';
            
            let margenUBHtml = `
                <td colspan="2" style="font-size: 1.1rem; user-select: none; padding-left: 15px;">
                    <span style="display:inline-block; margin-right: 5px;">★</span>
                    MARGEN DE UTILIDAD BRUTA
                </td>
            `;
            
            divisiones.forEach(d => {
                const ubDiv = totalIngresosDiv[d.columna] - totalCostosDiv[d.columna];
                const den = totalIngresosOperacionalesDiv[d.columna];
                const pct = den ? (ubDiv / den) * 100 : 0;
                margenUBHtml += `<td style="text-align: right; font-size: 1.1rem;">${pct.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</td>`;
            });
            
            const margenUBConsolidated = totalIngresosOperacionalesConsolidated ? (utilidadBrutaConsolidated / totalIngresosOperacionalesConsolidated) * 100 : 0;
            const margenUBConsolidatedStr = margenUBConsolidated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
            
            if (!isSingleVirtual) {
                margenUBHtml += `<td style="text-align: right; font-size: 1.1rem;">${margenUBConsolidatedStr}</td>`;
            }
            
            margenUBHtml += `
                <td style="text-align: right; font-size: 1.1rem;"></td>
            `;
            
            trMargenUB.innerHTML = margenUBHtml;
            tableBody.appendChild(trMargenUB);
            
            hasRenderedUtilidadBruta = true;
        }

        // Fila de Resultado Operativo justo después de Gastos
        if (gName.toUpperCase().includes('GASTO') && !hasRenderedResultadoOperativo) {
            const trRO = document.createElement('tr');
            trRO.style.backgroundColor = '#f0fdf4';
            trRO.style.color = '#15803d';
            trRO.style.fontWeight = 'bold';
            
            let roHtml = `
                <td colspan="2" style="font-size: 1.1rem; user-select: none; padding-left: 15px;">
                    <span style="display:inline-block; margin-right: 5px;">★</span>
                    RESULTADO OPERATIVO
                </td>
            `;
            
            divisiones.forEach(d => {
                const ubDiv = totalIngresosDiv[d.columna] - totalCostosDiv[d.columna];
                const roDiv = ubDiv - totalGastosDiv[d.columna];
                roHtml += `<td style="text-align: right; font-size: 1.1rem;">${formatVal(roDiv)}</td>`;
            });
            
            const pctRO = totalIngresosConsolidated ? (resultadoOperativoConsolidated / totalIngresosConsolidated) * 100 : 0;
            const pctROStr = pctRO.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
            
            if (!isSingleVirtual) {
                roHtml += `<td style="text-align: right; font-size: 1.1rem;">${formatVal(resultadoOperativoConsolidated)}</td>`;
            }
            
            roHtml += `
                <td style="text-align: right; font-size: 1.1rem;">${pctROStr}</td>
            `;
            
            trRO.innerHTML = roHtml;
            tableBody.appendChild(trRO);
            
            // Fila de Margen de Utilidad Operativa
            const trMargenRO = document.createElement('tr');
            trMargenRO.style.backgroundColor = '#f0fdf4';
            trMargenRO.style.color = '#15803d';
            trMargenRO.style.fontWeight = 'bold';
            
            let margenROHtml = `
                <td colspan="2" style="font-size: 1.1rem; user-select: none; padding-left: 15px;">
                    <span style="display:inline-block; margin-right: 5px;">★</span>
                    MARGEN DE UTILIDAD OPERATIVA
                </td>
            `;
            
            divisiones.forEach(d => {
                const ubDiv = totalIngresosDiv[d.columna] - totalCostosDiv[d.columna];
                const roDiv = ubDiv - totalGastosDiv[d.columna];
                const den = totalIngresosOperacionalesDiv[d.columna];
                const pct = den ? (roDiv / den) * 100 : 0;
                margenROHtml += `<td style="text-align: right; font-size: 1.1rem;">${pct.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</td>`;
            });
            
            const margenROConsolidated = totalIngresosOperacionalesConsolidated ? (resultadoOperativoConsolidated / totalIngresosOperacionalesConsolidated) * 100 : 0;
            const margenROConsolidatedStr = margenROConsolidated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
            
            if (!isSingleVirtual) {
                margenROHtml += `<td style="text-align: right; font-size: 1.1rem;">${margenROConsolidatedStr}</td>`;
            }
            
            margenROHtml += `
                <td style="text-align: right; font-size: 1.1rem;"></td>
            `;
            
            trMargenRO.innerHTML = margenROHtml;
            tableBody.appendChild(trMargenRO);

            hasRenderedResultadoOperativo = true;
        }
    }

    // Fila de Resultado Neto al final
    const trRN = document.createElement('tr');
    trRN.style.backgroundColor = '#dcfce7';
    trRN.style.color = '#166534';
    trRN.style.fontWeight = 'bold';
    
    let rnHtml = `
        <td colspan="2" style="font-size: 1.2rem; user-select: none; padding-left: 15px;">
            <span style="display:inline-block; margin-right: 5px;">🏆</span>
            RESULTADO NETO
        </td>
    `;
    
    divisiones.forEach(d => {
        const ubDiv = totalIngresosDiv[d.columna] - totalCostosDiv[d.columna];
        const rnDiv = ubDiv - totalGastosDiv[d.columna] + totalOtrosIngresosDiv[d.columna] - totalOtrosEgresosDiv[d.columna];
        rnHtml += `<td style="text-align: right; font-size: 1.2rem;">${formatVal(rnDiv)}</td>`;
    });
    
    const pctRN = totalIngresosConsolidated ? (resultadoNetoConsolidated / totalIngresosConsolidated) * 100 : 0;
    const pctRNStr = pctRN.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
    
    if (!isSingleVirtual) {
        rnHtml += `<td style="text-align: right; font-size: 1.2rem;">${formatVal(resultadoNetoConsolidated)}</td>`;
    }
    
    rnHtml += `
        <td style="text-align: right; font-size: 1.2rem;">${pctRNStr}</td>
    `;
    
    trRN.innerHTML = rnHtml;
    tableBody.appendChild(trRN);
    
    // Fila de Margen de Utilidad Neta
    const trMargenRN = document.createElement('tr');
    trMargenRN.style.backgroundColor = '#dcfce7';
    trMargenRN.style.color = '#166534';
    trMargenRN.style.fontWeight = 'bold';
    
    let margenRNHtml = `
        <td colspan="2" style="font-size: 1.15rem; user-select: none; padding-left: 15px;">
            <span style="display:inline-block; margin-right: 5px;">🏆</span>
            MARGEN DE UTILIDAD NETA
        </td>
    `;
    
    divisiones.forEach(d => {
        const ubDiv = totalIngresosDiv[d.columna] - totalCostosDiv[d.columna];
        const rnDiv = ubDiv - totalGastosDiv[d.columna] + totalOtrosIngresosDiv[d.columna] - totalOtrosEgresosDiv[d.columna];
        const den = totalIngresosOperacionalesDiv[d.columna];
        const pct = den ? (rnDiv / den) * 100 : 0;
        margenRNHtml += `<td style="text-align: right; font-size: 1.15rem;">${pct.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</td>`;
    });
    
    const margenRNStr = margenUtilidadNetaConsolidated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
    
    if (!isSingleVirtual) {
        margenRNHtml += `<td style="text-align: right; font-size: 1.15rem;">${margenRNStr}</td>`;
    }
    
    margenRNHtml += `
        <td style="text-align: right; font-size: 1.15rem;"></td>
    `;
    
    trMargenRN.innerHTML = margenRNHtml;
    tableBody.appendChild(trMargenRN);

    // Actualizar tarjetas de resumen
    const summaryCards = document.getElementById('summary-cards');
    const cardTotalGyp = document.getElementById('card-total-gyp');
    const cardPorcentaje = document.getElementById('card-porcentaje-ingresos');

    if (summaryCards) {
        summaryCards.style.display = 'flex';
        cardTotalGyp.innerHTML = formatVal(resultadoNetoConsolidated);
        
        const margenText = margenUtilidadNetaConsolidated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
        cardPorcentaje.innerHTML = resultadoNetoConsolidated < 0 ? `<span style="color: #ef4444;">${margenText}</span>` : margenText;
    }

    // Inicializar visibilidad para ocultar los items colapsados por defecto
    updateVisibility();

    // Dibujar gráfico de torta
    renderPieChartDivisiones(divisiones, totalIngresosDiv);
}

function renderPieChartDivisiones(divisiones, totalIngresosDiv) {
    const chartDiv = document.getElementById('gyp-pie-chart');
    if (!chartDiv) return;

    // Si solo hay una columna virtual de "monto" (sin divisiones reales), ocultar la sección del gráfico
    const chartSection = chartDiv.closest('section');
    if (divisiones.length === 1 && divisiones[0].columna === 'monto') {
        if (chartSection) chartSection.style.display = 'none';
        return;
    } else {
        if (chartSection) chartSection.style.display = 'block';
    }

    const drawChart = () => {
        // Limpiar contenedor
        chartDiv.innerHTML = '';

        const dataArray = [['División', 'Ingresos']];
        divisiones.forEach(div => {
            const val = totalIngresosDiv[div.columna] || 0;
            // Para gráficos de torta, omitir valores menores o iguales a cero
            if (val > 0) {
                dataArray.push([div.division.toUpperCase(), val]);
            }
        });

        // Si no hay ingresos en ninguna división para graficar
        if (dataArray.length <= 1) {
            chartDiv.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-secondary);">No hay ingresos registrados para graficar en este periodo</div>';
            return;
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
            colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#64748b', '#84cc16']
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
