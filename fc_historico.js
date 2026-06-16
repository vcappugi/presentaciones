let modalChart = null; // Para la gráfica del modal

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

    const tableHeader = document.getElementById('table-header');
    const tableBody = document.getElementById('table-body');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    const summaryCards = document.getElementById('summary-cards');
    const cardIngresos = document.getElementById('card-ingresos');
    const cardEgresos = document.getElementById('card-egresos');
    const cardNeto = document.getElementById('card-neto');

    // Modal Elements for sparkline details
    const modalOverlay = document.getElementById('sparkline-modal');
    const modalClose = document.getElementById('sparkline-modal-close');
    const modalTitle = document.getElementById('sparkline-modal-title');
    const modalCanvas = document.getElementById('sparkline-modal-chart');

    if (modalClose) {
        modalClose.addEventListener('click', () => modalOverlay.classList.remove('active'));
    }
    window.addEventListener('click', (e) => {
        if (e.target === modalOverlay) modalOverlay.classList.remove('active');
    });

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

    const getIndicatorHtml = (current, previous) => {
        if (previous === undefined || previous === null) return '';
        const size = '0.8em';
        const margin = 'margin-left: 5px;';
        if (current > previous) return `<span style="color: #22c55e; font-size: ${size}; ${margin}">▲</span>`;
        if (current < previous) return `<span style="color: #ef4444; font-size: ${size}; ${margin}">▼</span>`;
        return `<span style="color: #3b82f6; font-size: ${size}; ${margin}">•</span>`;
    };

    const createSparkline = (dataArray) => {
        if (dataArray.length === 0) return '';
        const w = 80; const h = 25;
        const max = Math.max(...dataArray);
        const min = Math.min(...dataArray);
        const range = max - min || 1;
        
        let points = '';
        let circles = '';
        dataArray.forEach((val, i) => {
            const x = (i / (dataArray.length - 1)) * w;
            const y = h - ((val - min) / range) * (h - 6) - 3;
            points += `${x},${y} `;
            circles += `<circle cx="${x}" cy="${y}" r="2" stroke="none" />`;
        });
        
        return `<svg viewBox="0 0 ${w} ${h}" class="sparkline-svg"><polyline points="${points.trim()}" />${circles}</svg>`;
    };

    const openModalChart = (title, dataArray, labels) => {
        modalTitle.textContent = title;
        modalOverlay.classList.add('active');
        if (modalChart) modalChart.destroy();
        
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.getAttribute('data-theme') === 'black';
        const textColor = isDarkMode ? '#cbd5e1' : '#475569';
        
        modalChart = new Chart(modalCanvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels.map(l => l.toUpperCase()),
                datasets: [{
                    label: title,
                    data: dataArray,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.2,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: textColor } },
                    y: { ticks: { color: textColor } }
                }
            }
        });
    };

    // Generar rango de meses desde ene-26 hasta el mes del filtro
    const getMonthsRange = (endPeriod) => {
        const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        const startYear = 26;
        const startMonthIdx = 0; // jan
        
        const parts = endPeriod.split('-');
        if (parts.length !== 2) return [endPeriod];
        
        const endMonth = parts[0].toLowerCase();
        const endYear = parseInt(parts[1]);
        const endMonthIdx = MESES.indexOf(endMonth);
        
        if (endMonthIdx === -1) return [endPeriod];
        
        const months = [];
        for (let y = startYear; y <= endYear; y++) {
            const mStart = (y === startYear) ? startMonthIdx : 0;
            const mEnd = (y === endYear) ? endMonthIdx : 11;
            
            for (let m = mStart; m <= mEnd; m++) {
                const isUpper = parts[0] === parts[0].toUpperCase();
                const isCapitalized = parts[0][0] === parts[0][0].toUpperCase() && !isUpper;
                let mesName = MESES[m];
                if (isUpper) mesName = mesName.toUpperCase();
                else if (isCapitalized) mesName = mesName.charAt(0).toUpperCase() + mesName.slice(1);
                
                months.push(`${mesName}-${y}`);
            }
        }
        return months;
    };

    const fetchData = async () => {
        if (!valorEmpresa || !valorPeriodo) {
            tableBody.innerHTML = '<tr><td style="text-align: center; padding: 20px; color: var(--text-secondary);">Seleccione una empresa y un periodo y presione consultar</td></tr>';
            loadingEl.classList.add('hidden');
            return;
        }

        loadingEl.classList.remove('hidden');
        errorEl.classList.add('hidden');
        tableBody.innerHTML = '';
        tableHeader.innerHTML = '';
        summaryCards.style.display = 'none';

        try {
            const mesesConsulta = getMonthsRange(valorPeriodo);

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
            if (!resFC.ok) throw new Error('Error al cargar datos históricos de flujo de caja');

            const conceptos = await resConceptos.json();
            const fcData = await resFC.json();

            renderData(conceptos, fcData, mesesConsulta);

        } catch (error) {
            console.error('Error fetching data:', error);
            errorEl.textContent = 'Error al cargar los datos: ' + error.message;
            errorEl.classList.remove('hidden');
        } finally {
            loadingEl.classList.add('hidden');
        }
    };

    const renderData = (conceptos, fcData, mesesOrdenados) => {
        if (!conceptos || conceptos.length === 0) {
            tableBody.innerHTML = '<tr><td style="text-align: center; padding: 20px; color: var(--text-secondary);">No hay conceptos de flujo de caja configurados.</td></tr>';
            return;
        }

        // Construir Cabeceras dinámicas
        let headerHtml = `<th style="min-width: 250px; position: sticky; left: 0; background-color: var(--surface-color); z-index: 2;">Concepto</th>`;
        mesesOrdenados.forEach(m => {
            headerHtml += `<th style="text-align: right; min-width: 110px;">${m}</th>`;
        });
        headerHtml += `<th style="text-align: center; min-width: 100px;">Tendencia</th>`;
        tableHeader.innerHTML = headerHtml;

        // Estado cerrado por mes
        const periodosCerrados = {};
        fcData.forEach(row => {
            if (row.cerrado === 'Periodo Cerrado') {
                periodosCerrados[row.periodo.toLowerCase()] = true;
            }
        });

        // Indexar montos de fc por denominación y periodo
        const fcMontoMap = {};
        fcData.forEach(row => {
            const key = String(row.denominacion || '').trim().toUpperCase();
            const mesStr = String(row.periodo || '').toLowerCase();
            const val = parseFloat(row.monto) || 0;
            
            if (!fcMontoMap[key]) {
                fcMontoMap[key] = {};
            }
            fcMontoMap[key][mesStr] = val;
        });

        // Agrupar
        const agrupado = {};
        let sumIngresosAcumulado = 0;
        let sumEgresosAcumulado = 0;

        const totalesMesPorGrupo = {}; // Para calcular totales de grupos por mes
        const netosMensuales = {}; // Flujo Neto final mensual
        
        mesesOrdenados.forEach(m => {
            netosMensuales[m] = 0;
        });

        conceptos.forEach(concept => {
            const g = (concept.grupo || 'Otros').trim();
            const sg = (concept.subgrupo || 'Otros').trim();
            const denom = (concept.denominacion || '').trim();
            const key = denom.toUpperCase();
            
            // Recopilar montos de cada mes
            const montosMes = {};
            let sumTotalItem = 0;
            
            mesesOrdenados.forEach(m => {
                const mesKey = m.toLowerCase();
                const val = (fcMontoMap[key] && fcMontoMap[key][mesKey]) || 0;
                const rounded = Math.round((val + Number.EPSILON) * 100) / 100;
                montosMes[m] = rounded;
                sumTotalItem += rounded;
            });

            // Si el item tiene monto acumulado cero en todo el rango, lo omitimos para no saturar
            if (sumTotalItem === 0) {
                return;
            }

            // Sumar a ingresos/egresos generales
            const gUpper = g.toUpperCase();
            if (gUpper.includes('INGRESO')) {
                sumIngresosAcumulado += sumTotalItem;
            } else if (gUpper.includes('EGRESO') || gUpper.includes('INVERSION')) {
                sumEgresosAcumulado += sumTotalItem;
            }

            // Inicializar totales de mes por grupo si no existen
            if (!totalesMesPorGrupo[g]) {
                totalesMesPorGrupo[g] = {};
                mesesOrdenados.forEach(m => totalesMesPorGrupo[g][m] = 0);
            }

            mesesOrdenados.forEach(m => {
                const roundedVal = montosMes[m];
                totalesMesPorGrupo[g][m] += roundedVal;

                if (gUpper.includes('INGRESO')) {
                    netosMensuales[m] += roundedVal;
                } else if (gUpper.includes('EGRESO') || gUpper.includes('INVERSION')) {
                    netosMensuales[m] -= roundedVal;
                }
            });

            if (!agrupado[g]) {
                agrupado[g] = { total: 0, subgrupos: {}, ordenGrupo: concept.orden };
            }
            agrupado[g].total += sumTotalItem;

            if (!agrupado[g].subgrupos[sg]) {
                agrupado[g].subgrupos[sg] = { total: 0, items: [], ordenSubgrupo: concept.orden };
            }
            agrupado[g].subgrupos[sg].total += sumTotalItem;
            
            agrupado[g].subgrupos[sg].items.push({
                denominacion: denom,
                montosMes: montosMes,
                totalAcumulado: sumTotalItem,
                orden: concept.orden
            });
        });

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

        // Calcular Saldo Inicial de cada mes de forma acumulativa
        const firstMonth = mesesOrdenados[0];
        const firstMonthKey = parsePeriodo(firstMonth);

        const uniquePeriodsInDb = [...new Set(fcData.map(row => String(row.periodo || '').trim()))]
            .filter(p => p !== '' && parsePeriodo(p) < firstMonthKey);

        let saldoAnterior = 0;
        uniquePeriodsInDb.forEach(p => {
            saldoAnterior += getNetFlowForPeriod(p, fcData, conceptos);
        });
        saldoAnterior = Math.round((saldoAnterior + Number.EPSILON) * 100) / 100;

        const saldoInicialMensual = {};
        let currentSaldo = saldoAnterior;
        mesesOrdenados.forEach(m => {
            saldoInicialMensual[m] = currentSaldo;
            const flow = netosMensuales[m];
            currentSaldo = Math.round((currentSaldo + flow + Number.EPSILON) * 100) / 100;
        });

        // Modificar netosMensuales (Flujo Neto de Caja) para incluir el saldo inicial
        mesesOrdenados.forEach(m => {
            netosMensuales[m] = Math.round((saldoInicialMensual[m] + netosMensuales[m] + Number.EPSILON) * 100) / 100;
        });

        const sumNetoAcumulado = Math.round((saldoInicialMensual[mesesOrdenados[0]] + sumIngresosAcumulado - sumEgresosAcumulado + Number.EPSILON) * 100) / 100;

        // KPI Cards
        cardIngresos.innerHTML = formatMonto(sumIngresosAcumulado, false);
        cardEgresos.innerHTML = formatMonto(sumEgresosAcumulado, false);
        cardNeto.innerHTML = formatMonto(sumNetoAcumulado, false);
        cardNeto.style.color = sumNetoAcumulado < 0 ? '#ef4444' : 'var(--secondary-color)';
        summaryCards.style.display = 'flex';

        const makeCollapsible = (rowHeader, childClass) => {
            rowHeader.style.cursor = 'pointer';
            rowHeader.addEventListener('click', () => {
                const icon = rowHeader.querySelector('.toggle-icon');
                const isCollapsed = icon.textContent === '▶';
                icon.textContent = isCollapsed ? '▼' : '▶';

                const children = document.querySelectorAll(`[data-parent-class="${childClass}"]`);
                children.forEach(child => {
                    if (isCollapsed) {
                        child.style.display = 'table-row';
                    } else {
                        child.style.display = 'none';
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

        // Ordenar y Renderizar
        const sortedGroups = Object.keys(agrupado).sort((a, b) => {
            return agrupado[a].ordenGrupo - agrupado[b].ordenGrupo;
        });

        // Fila Saldo inicial como primera línea de la tabla
        let celdasMesesSaldoInicial = '';
        mesesOrdenados.forEach((m, idx) => {
            const isClosed = !!periodosCerrados[m.toLowerCase()];
            const currentVal = saldoInicialMensual[m];
            const prevVal = idx > 0 ? saldoInicialMensual[mesesOrdenados[idx - 1]] : undefined;
            const indicator = getIndicatorHtml(currentVal, prevVal);
            celdasMesesSaldoInicial += `<td style="text-align: right;">${formatMonto(currentVal, isClosed)} ${indicator}</td>`;
        });

        const sparklineDataSaldoInicial = mesesOrdenados.map(m => saldoInicialMensual[m]);
        const sparklineHtmlSaldoInicial = createSparkline(sparklineDataSaldoInicial);

        const trSaldoInicial = document.createElement('tr');
        trSaldoInicial.style.backgroundColor = 'var(--row-g-bg)';
        trSaldoInicial.style.fontWeight = 'bold';
        trSaldoInicial.style.color = 'var(--primary-color)';
        trSaldoInicial.innerHTML = `
            <td style="font-size: 1.1rem; user-select: none; position: sticky; left: 0; background-color: var(--row-g-bg); z-index: 1; padding-left: 30px;">
                Saldo inicial
            </td>
            ${celdasMesesSaldoInicial}
            <td style="text-align: center; vertical-align: middle;" class="sparkline-cell" data-title="Saldo inicial" data-vals="${sparklineDataSaldoInicial.join(',')}">${sparklineHtmlSaldoInicial}</td>
        `;
        tableBody.appendChild(trSaldoInicial);

        let gIndex = 0;
        sortedGroups.forEach(gName => {
            gIndex++;
            const gData = agrupado[gName];
            const gId = `fch-group-${gIndex}`;

            // Totales mensuales de este grupo
            let celdasMesesGrupo = '';
            mesesOrdenados.forEach((m, idx) => {
                const isClosed = !!periodosCerrados[m.toLowerCase()];
                const currentVal = totalesMesPorGrupo[gName][m];
                const prevVal = idx > 0 ? totalesMesPorGrupo[gName][mesesOrdenados[idx - 1]] : undefined;
                const indicator = getIndicatorHtml(currentVal, prevVal);
                celdasMesesGrupo += `<td style="text-align: right;">${formatMonto(currentVal, isClosed)} ${indicator}</td>`;
            });

            const sparklineDataGroup = mesesOrdenados.map(m => totalesMesPorGrupo[gName][m]);
            const sparklineHtmlGroup = createSparkline(sparklineDataGroup);

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
                ${celdasMesesGrupo}
                <td style="text-align: center; vertical-align: middle;" class="sparkline-cell" data-title="${gName}" data-vals="${sparklineDataGroup.join(',')}">${sparklineHtmlGroup}</td>
            `;
            tableBody.appendChild(trGroup);
            makeCollapsible(trGroup, gId);

            // Subgrupos
            const sortedSubgroups = Object.keys(gData.subgrupos).sort((a, b) => {
                return gData.subgrupos[a].ordenSubgrupo - gData.subgrupos[b].ordenSubgrupo;
            });

            let sgIndex = 0;
            sortedSubgroups.forEach(sgName => {
                sgIndex++;
                const sgData = gData.subgrupos[sgName];
                const sgId = `${gId}-sg-${sgIndex}`;

                // Calcular totales de subgrupo mensual
                const totalesMesSubgrupo = {};
                mesesOrdenados.forEach(m => {
                    totalesMesSubgrupo[m] = sgData.items.reduce((sum, item) => sum + item.montosMes[m], 0);
                });

                let celdasMesesSubgrupo = '';
                mesesOrdenados.forEach((m, idx) => {
                    const isClosed = !!periodosCerrados[m.toLowerCase()];
                    const currentVal = totalesMesSubgrupo[m];
                    const prevVal = idx > 0 ? totalesMesSubgrupo[mesesOrdenados[idx - 1]] : undefined;
                    const indicator = getIndicatorHtml(currentVal, prevVal);
                    celdasMesesSubgrupo += `<td style="text-align: right;">${formatMonto(currentVal, isClosed)} ${indicator}</td>`;
                });

                const sparklineDataSubgroup = mesesOrdenados.map(m => totalesMesSubgrupo[m]);
                const sparklineHtmlSubgroup = createSparkline(sparklineDataSubgroup);

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
                    ${celdasMesesSubgrupo}
                    <td style="text-align: center; vertical-align: middle;" class="sparkline-cell" data-title="${sgName}" data-vals="${sparklineDataSubgroup.join(',')}">${sparklineHtmlSubgroup}</td>
                `;
                tableBody.appendChild(trSubgroup);
                makeCollapsible(trSubgroup, sgId);

                // Items individuales
                sgData.items.forEach(item => {
                    let celdasMesesItem = '';
                    mesesOrdenados.forEach((m, idx) => {
                        const isClosed = !!periodosCerrados[m.toLowerCase()];
                        const currentVal = item.montosMes[m];
                        const prevVal = idx > 0 ? item.montosMes[mesesOrdenados[idx - 1]] : undefined;
                        const indicator = getIndicatorHtml(currentVal, prevVal);
                        celdasMesesItem += `<td style="text-align: right;">${formatMonto(currentVal, isClosed)} ${indicator}</td>`;
                    });

                    const sparklineDataItem = mesesOrdenados.map(m => item.montosMes[m]);
                    const sparklineHtmlItem = createSparkline(sparklineDataItem);

                    const trItem = document.createElement('tr');
                    trItem.setAttribute('data-parent-class', sgId);
                    trItem.style.backgroundColor = 'var(--surface-color)';
                    trItem.innerHTML = `
                        <td style="padding-left: 50px; position: sticky; left: 0; background-color: var(--surface-color); z-index: 1; color: var(--text-primary);">
                            ${item.denominacion}
                        </td>
                        ${celdasMesesItem}
                        <td style="text-align: center; vertical-align: middle;" class="sparkline-cell" data-title="${item.denominacion}" data-vals="${sparklineDataItem.join(',')}">${sparklineHtmlItem}</td>
                    `;
                    tableBody.appendChild(trItem);
                });
            });
        });

        // Fila Flujo Neto de Caja
        let celdasNetosMensuales = '';
        mesesOrdenados.forEach((m, idx) => {
            const isClosed = !!periodosCerrados[m.toLowerCase()];
            const currentVal = netosMensuales[m];
            const prevVal = idx > 0 ? netosMensuales[mesesOrdenados[idx - 1]] : undefined;
            const indicator = getIndicatorHtml(currentVal, prevVal);
            celdasNetosMensuales += `<td style="text-align: right; background-color: var(--primary-color); color: white; font-weight: bold;">${formatMonto(currentVal, isClosed, 'white')} ${indicator}</td>`;
        });

        const sparklineDataTotal = mesesOrdenados.map(m => netosMensuales[m]);
        const sparklineHtmlTotal = createSparkline(sparklineDataTotal);

        const trTotal = document.createElement('tr');
        trTotal.innerHTML = `
            <td style="font-size: 1.1rem; user-select: none; position: sticky; left: 0; background-color: var(--primary-color); color: white; z-index: 1; font-weight: bold; text-transform: uppercase;">
                Flujo Neto de Caja
            </td>
            ${celdasNetosMensuales}
            <td style="text-align: center; vertical-align: middle; background-color: var(--primary-color);" class="sparkline-cell" data-title="Flujo Neto de Caja" data-vals="${sparklineDataTotal.join(',')}">
                ${sparklineHtmlTotal.replace('var(--primary-color)', 'white')}
            </td>
        `;
        tableBody.appendChild(trTotal);

        // Click event delegate para sparklines
        tableBody.addEventListener('click', (e) => {
            const cell = e.target.closest('.sparkline-cell');
            if (cell) {
                const title = cell.getAttribute('data-title');
                const rawVals = cell.getAttribute('data-vals');
                if (rawVals) {
                    const dataArray = rawVals.split(',').map(Number);
                    openModalChart(title, dataArray, mesesOrdenados);
                }
            }
        });
    };

    // Cargar inicial
    fetchData();
});
