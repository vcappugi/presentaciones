document.addEventListener('DOMContentLoaded', () => {
    // 1. Obtener los parámetros de la URL
    const urlParams = new URLSearchParams(window.location.search);
    let valorEmpresa = urlParams.get('empresa');
    let valorPeriodo = urlParams.get('periodo');
    let valorDimension = urlParams.get('dimension');
    
    // Si los parámetros no están en la URL, intentar buscarlos en la memoria
    if (!valorEmpresa || !valorPeriodo) {
        valorEmpresa = localStorage.getItem('bel_empresa');
        valorPeriodo = localStorage.getItem('bel_periodo');
        valorDimension = localStorage.getItem('bel_dimension') || 'REAL';
    } else {
        // Si vienen en la URL, actualizar la memoria para futuras referencias
        localStorage.setItem('bel_empresa', valorEmpresa);
        localStorage.setItem('bel_periodo', valorPeriodo);
        if(valorDimension) localStorage.setItem('bel_dimension', valorDimension);
        else valorDimension = 'REAL';
    }

    const tableBody = document.getElementById('table-body');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    const summaryCards = document.getElementById('summary-cards');
    const cardIngresos = document.getElementById('card-ingresos');
    const cardEgresos = document.getElementById('card-egresos');
    const cardNeto = document.getElementById('card-neto');
    const thMonto = document.getElementById('th-monto');

    // Ocultar dimensión periódicamente ya que los filtros se cargan asíncronamente
    const hideDimensionInterval = setInterval(() => {
        const filtroDimension = document.getElementById('select-dimension');
        if (filtroDimension) {
            filtroDimension.parentElement.style.display = 'none';
            clearInterval(hideDimensionInterval);
        }
    }, 100);

    // Función auxiliar para formatear montos
    const formatMonto = (m, isClosed = false, forceColor = null) => {
        if (m === 0) return '-';
        const val = m.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        let txt = val;
        if (forceColor) {
            txt = `<span style="color: ${forceColor}; font-weight: 600;">${val}</span>`;
        } else if (m < 0) {
            txt = `<span style="color: #ef4444; font-weight: 600;">${val}</span>`;
        }
        return isClosed ? `🔒 ${txt}` : txt;
    };

    // Hacer la petición a Supabase
    const fetchData = async () => {
        if (!valorEmpresa || !valorPeriodo) {
            tableBody.innerHTML = '<tr><td colspan="2" style="text-align: center; padding: 20px; color: var(--text-secondary);">Seleccione una empresa y un periodo y presione consultar</td></tr>';
            loadingEl.classList.add('hidden');
            return;
        }

        loadingEl.classList.remove('hidden');
        errorEl.classList.add('hidden');
        tableBody.innerHTML = '';
        summaryCards.style.display = 'none';

        try {
            // Petición paralela para conceptosfc y para fc
            const urlConceptos = `${CONFIG.SUPABASE_URL}/rest/v1/conceptosfc?order=orden.asc`;
            const urlFC = `${CONFIG.SUPABASE_URL}/rest/v1/fc?empresa=eq.${encodeURIComponent(valorEmpresa)}`;

            const [resConceptos, resFC] = await Promise.all([
                fetch(urlConceptos, {
                    method: 'GET',
                    headers: {
                        'apikey': CONFIG.SUPABASE_KEY,
                        'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }),
                fetch(urlFC, {
                    method: 'GET',
                    headers: {
                        'apikey': CONFIG.SUPABASE_KEY,
                        'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                        'Content-Type': 'application/json'
                    }
                })
            ]);

            if (!resConceptos.ok) throw new Error('Error al cargar conceptos de flujo de caja');
            if (!resFC.ok) throw new Error('Error al cargar datos de flujo de caja');

            const conceptos = await resConceptos.json();
            const fcData = await resFC.json();

            renderData(conceptos, fcData);

        } catch (error) {
            console.error('Error fetching data:', error);
            errorEl.textContent = 'Error al cargar los datos: ' + error.message;
            errorEl.classList.remove('hidden');
        } finally {
            loadingEl.classList.add('hidden');
        }
    };

    const renderData = (conceptos, fcData) => {
        if (!conceptos || conceptos.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="2" style="text-align: center; padding: 20px; color: var(--text-secondary);">No hay conceptos de flujo de caja configurados.</td></tr>';
            return;
        }

        // Filtrar datos para el período seleccionado
        const selectedPeriodData = fcData.filter(row => String(row.periodo || '').trim().toLowerCase() === valorPeriodo.toLowerCase());

        // Determinar si el periodo está cerrado
        const isClosed = selectedPeriodData.length > 0 && selectedPeriodData[0].cerrado === 'Periodo Cerrado';
        thMonto.innerHTML = isClosed ? 'Monto 🔒' : 'Monto';

        // Indexar montos de fc por denominación
        const fcMontoMap = {};
        selectedPeriodData.forEach(row => {
            const key = String(row.denominacion || '').trim().toUpperCase();
            const val = parseFloat(row.monto) || 0;
            if (!fcMontoMap[key]) {
                fcMontoMap[key] = 0;
            }
            fcMontoMap[key] += val;
        });

        // Calcular Saldo Anterior de forma acumulativa
        const parsePeriodo = (p) => {
            const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
            const parts = String(p).toLowerCase().trim().split('-');
            if (parts.length !== 2) return 0;
            const mesIdx = MESES.indexOf(parts[0]);
            let year = parseInt(parts[1]);
            if (isNaN(year)) return 0;
            if (year < 100) year += 2000;
            return year * 12 + mesIdx;
        };

        const getNetFlowForPeriod = (p, data, concepts) => {
            const pData = data.filter(row => String(row.periodo || '').trim().toLowerCase() === p.toLowerCase());
            const pMontoMap = {};
            pData.forEach(row => {
                const key = String(row.denominacion || '').trim().toUpperCase();
                const val = parseFloat(row.monto) || 0;
                if (!pMontoMap[key]) {
                    pMontoMap[key] = 0;
                }
                pMontoMap[key] += val;
            });

            let totalI = 0;
            let totalE = 0;

            concepts.forEach(concept => {
                const g = (concept.grupo || 'Otros').trim();
                const denom = (concept.denominacion || '').trim();
                const key = denom.toUpperCase();
                
                const monto = pMontoMap[key] || 0;
                const valRounded = Math.round((monto + Number.EPSILON) * 100) / 100;

                const gUpper = g.toUpperCase();
                if (gUpper.includes('INGRESO')) {
                    totalI += valRounded;
                } else if (gUpper.includes('EGRESO') || gUpper.includes('INVERSION')) {
                    totalE += valRounded;
                }
            });

            return Math.round((totalI - totalE + Number.EPSILON) * 100) / 100;
        };

        const uniquePeriodsInDb = [...new Set(fcData.map(row => String(row.periodo || '').trim()))]
            .filter(p => p !== '');
        uniquePeriodsInDb.sort((a, b) => parsePeriodo(a) - parsePeriodo(b));

        const selectedKey = parsePeriodo(valorPeriodo);
        let saldoAnterior = 0;
        uniquePeriodsInDb.forEach(p => {
            if (parsePeriodo(p) < selectedKey) {
                saldoAnterior += getNetFlowForPeriod(p, fcData, conceptos);
            }
        });
        saldoAnterior = Math.round((saldoAnterior + Number.EPSILON) * 100) / 100;

        // Fila Saldo anterior
        const trSaldoAnterior = document.createElement('tr');
        trSaldoAnterior.style.backgroundColor = 'var(--row-g-bg)';
        trSaldoAnterior.style.fontWeight = 'bold';
        trSaldoAnterior.style.color = 'var(--primary-color)';
        trSaldoAnterior.innerHTML = `
            <td style="font-size: 1.1rem; user-select: none; position: sticky; left: 0; background-color: var(--row-g-bg); z-index: 1; padding-left: 30px;">
                Saldo anterior
            </td>
            <td style="text-align: right; font-size: 1.1rem;">${formatMonto(saldoAnterior, isClosed)}</td>
        `;
        tableBody.appendChild(trSaldoAnterior);

        // Estructura de agrupamiento ordenado
        const agrupado = {};
        let totalIngresos = 0;
        let totalEgresos = 0;

        conceptos.forEach(concept => {
            const g = (concept.grupo || 'Otros').trim();
            const sg = (concept.subgrupo || 'Otros').trim();
            const denom = (concept.denominacion || '').trim();
            const key = denom.toUpperCase();
            
            const monto = fcMontoMap[key] || 0;
            const valRounded = Math.round((monto + Number.EPSILON) * 100) / 100;

            const gUpper = g.toUpperCase();
            if (gUpper.includes('INGRESO')) {
                totalIngresos += valRounded;
            } else if (gUpper.includes('EGRESO') || gUpper.includes('INVERSION')) {
                totalEgresos += valRounded;
            }

            // Excluir conceptos con monto cero o vacío en la tabla
            if (valRounded === 0) {
                return;
            }

            if (!agrupado[g]) {
                agrupado[g] = { total: 0, subgrupos: {}, ordenGrupo: concept.orden };
            }
            agrupado[g].total += valRounded;

            if (!agrupado[g].subgrupos[sg]) {
                agrupado[g].subgrupos[sg] = { total: 0, items: [], ordenSubgrupo: concept.orden };
            }
            agrupado[g].subgrupos[sg].total += valRounded;
            
            agrupado[g].subgrupos[sg].items.push({
                denominacion: denom,
                monto: valRounded,
                orden: concept.orden
            });
        });

        // Redondear totales generales
        totalIngresos = Math.round((totalIngresos + Number.EPSILON) * 100) / 100;
        totalEgresos = Math.round((totalEgresos + Number.EPSILON) * 100) / 100;
        const totalNeto = Math.round((saldoAnterior + totalIngresos - totalEgresos + Number.EPSILON) * 100) / 100;

        cardIngresos.innerHTML = formatMonto(totalIngresos, false);
        cardEgresos.innerHTML = formatMonto(totalEgresos, false);
        cardNeto.innerHTML = formatMonto(totalNeto, false);
        cardNeto.style.color = totalNeto < 0 ? '#ef4444' : 'var(--secondary-color)';
        summaryCards.style.display = 'flex';

        const makeCollapsible = (rowHeader, childClass) => {
            rowHeader.style.cursor = 'pointer';
            rowHeader.addEventListener('click', () => {
                const icon = rowHeader.querySelector('.toggle-icon');
                const isCollapsed = icon.textContent === '▶';
                icon.textContent = isCollapsed ? '▼' : '▶';

                // Mostrar/Ocultar todos los subelementos
                const children = document.querySelectorAll(`[data-parent-class="${childClass}"]`);
                children.forEach(child => {
                    if (isCollapsed) {
                        child.style.display = 'table-row';
                    } else {
                        child.style.display = 'none';
                        // Si era un subgrupo, colapsar también sus items hijos
                        if (child.classList.contains('subgroup-header')) {
                            const subgroupId = child.getAttribute('data-node-id');
                            const subChildren = document.querySelectorAll(`[data-parent-class="${subgroupId}"]`);
                            subChildren.forEach(sc => sc.style.display = 'none');
                            const subIcon = child.querySelector('.toggle-icon');
                            if (subIcon) subIcon.textContent = '▶';
                            child.classList.add('collapsed');
                        }
                    }
                });
            });
        };

        // Ordenar los grupos según el menor orden de sus conceptos
        const sortedGroups = Object.keys(agrupado).sort((a, b) => {
            return agrupado[a].ordenGrupo - agrupado[b].ordenGrupo;
        });

        let gIndex = 0;
        sortedGroups.forEach(gName => {
            gIndex++;
            const gData = agrupado[gName];
            const gId = `fc-group-${gIndex}`;

            // Fila de Grupo
            const trGroup = document.createElement('tr');
            trGroup.style.backgroundColor = 'var(--row-g-bg)';
            trGroup.style.fontWeight = 'bold';
            trGroup.style.color = 'var(--primary-color)';
            trGroup.innerHTML = `
                <td style="font-size: 1.1rem; user-select: none; position: sticky; left: 0; background-color: var(--row-g-bg); z-index: 1;">
                    <span class="toggle-icon" style="display:inline-block; width:20px; font-size: 0.9rem;">▼</span>
                    ${gName.toUpperCase()}
                </td>
                <td style="text-align: right; font-size: 1.1rem;">${formatMonto(gData.total, isClosed)}</td>
            `;
            tableBody.appendChild(trGroup);
            makeCollapsible(trGroup, gId);

            // Ordenar los subgrupos según el menor orden de sus conceptos
            const sortedSubgroups = Object.keys(gData.subgrupos).sort((a, b) => {
                return gData.subgrupos[a].ordenSubgrupo - gData.subgrupos[b].ordenSubgrupo;
            });

            let sgIndex = 0;
            sortedSubgroups.forEach(sgName => {
                sgIndex++;
                const sgData = gData.subgrupos[sgName];
                const sgId = `${gId}-sg-${sgIndex}`;

                // Fila de Subgrupo
                const trSubgroup = document.createElement('tr');
                trSubgroup.className = 'subgroup-header';
                trSubgroup.setAttribute('data-parent-class', gId);
                trSubgroup.setAttribute('data-node-id', sgId);
                trSubgroup.style.backgroundColor = 'var(--row-sg2-bg)';
                trSubgroup.style.fontWeight = '600';
                trSubgroup.innerHTML = `
                    <td style="padding-left: 25px; user-select: none; position: sticky; left: 0; background-color: var(--row-sg2-bg); z-index: 1;">
                        <span class="toggle-icon" style="display:inline-block; width:20px; font-size: 0.8rem;">▼</span>
                        ${sgName}
                    </td>
                    <td style="text-align: right;">${formatMonto(sgData.total, isClosed)}</td>
                `;
                tableBody.appendChild(trSubgroup);
                makeCollapsible(trSubgroup, sgId);

                // Cuentas individuales
                sgData.items.forEach(item => {
                    const trItem = document.createElement('tr');
                    trItem.setAttribute('data-parent-class', sgId);
                    trItem.style.backgroundColor = 'var(--surface-color)';
                    trItem.innerHTML = `
                        <td style="padding-left: 50px; position: sticky; left: 0; background-color: var(--surface-color); z-index: 1; color: var(--text-primary);">
                            ${item.denominacion}
                        </td>
                        <td style="text-align: right;">${formatMonto(item.monto, isClosed)}</td>
                    `;
                    tableBody.appendChild(trItem);
                });
            });
        });

        // Fila Total General / Neto
        const trTotal = document.createElement('tr');
        trTotal.innerHTML = `
            <td style="font-size: 1.1rem; user-select: none; position: sticky; left: 0; background-color: var(--primary-color); color: white; z-index: 1; font-weight: bold; text-transform: uppercase;">
                Flujo Neto de Caja
            </td>
            <td style="text-align: right; font-size: 1.1rem; background-color: var(--primary-color); color: white; font-weight: bold;">
                ${formatMonto(totalNeto, isClosed, 'white')}
            </td>
        `;
        tableBody.appendChild(trTotal);
    };

    // Ejecutar consulta inicial
    fetchData();
});
