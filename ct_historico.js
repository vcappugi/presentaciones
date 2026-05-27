let currentChart = null; // Para destruir la instancia de la gráfica al recargar
let modalChart = null; // Para la gráfica del modal

document.addEventListener('DOMContentLoaded', () => {
    // 1. Obtener los parámetros de la URL
    const urlParams = new URLSearchParams(window.location.search);
    let valorEmpresa = urlParams.get('empresa');
    let valorPeriodo = urlParams.get('periodo');
    let valorDimension = urlParams.get('dimension');
    
    if (!valorEmpresa || !valorPeriodo) {
        valorEmpresa = localStorage.getItem('bel_empresa');
        valorPeriodo = localStorage.getItem('bel_periodo');
        valorDimension = localStorage.getItem('bel_dimension') || 'REAL';
    } else {
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
    const chartPanel = document.getElementById('chart-panel');
    const cardActivos = document.getElementById('card-activos');
    const cardPasivos = document.getElementById('card-pasivos');
    const cardNeto = document.getElementById('card-neto');

    // Anexos Modal Elements
    const anexosModal = document.getElementById('anexos-modal');
    const anexosModalClose = document.getElementById('anexos-modal-close');
    const anexosModalTitle = document.getElementById('anexos-modal-title');
    const anexosModalSubtitle = document.getElementById('anexos-modal-subtitle');
    const anexosTableBody = document.getElementById('anexos-table-body');
    const anexosLoading = document.getElementById('anexos-loading');
    const anexosError = document.getElementById('anexos-error');

    if (anexosModalClose) {
        anexosModalClose.addEventListener('click', () => anexosModal.classList.remove('active'));
    }
    window.addEventListener('click', (e) => {
        if (e.target === anexosModal) anexosModal.classList.remove('active');
    });

    const openAnexosModal = async (tipo, empresa, dimension, periodo) => {
        anexosModalTitle.innerHTML = `Anexo: ${tipo} <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: normal; font-family: monospace;">(Expresado en MM $)</span>`;
        anexosModalSubtitle.textContent = `${empresa} | Dimensión: ${dimension} | Periodo: ${periodo}`;
        anexosTableBody.innerHTML = '';
        anexosLoading.style.display = 'block';
        anexosError.style.display = 'none';
        anexosModal.classList.add('active');

        try {
            const url = new URL(`${CONFIG.SUPABASE_URL}/rest/v1/anexos`);
            url.searchParams.append('select', '*');
            url.searchParams.append('empresa', `eq.${empresa}`);
            url.searchParams.append('dimension', `eq.${dimension}`);
            url.searchParams.append('periodo', `eq.${periodo}`);
            url.searchParams.append('tipo', `eq.${tipo}`);
            url.searchParams.append('order', 'descripcion.asc');

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'apikey': CONFIG.SUPABASE_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
                }
            });

            if (!response.ok) throw new Error('Error al cargar anexos');
            const data = await response.json();
            
            anexosLoading.style.display = 'none';

            if (data.length === 0) {
                anexosTableBody.innerHTML = `<tr><td colspan="2" style="text-align: center; color: var(--text-secondary); padding: 20px;">No hay anexos registrados.</td></tr>`;
                return;
            }

            let total = 0;
            data.forEach(row => {
                const monto = parseFloat(row.monto) || 0;
                total += monto;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.descripcion}</td>
                    <td style="text-align: right;">${formatMonto(monto)}</td>
                `;
                anexosTableBody.appendChild(tr);
            });

            const trTotal = document.createElement('tr');
            trTotal.innerHTML = `
                <td style="font-weight: bold; text-align: right;">TOTAL:</td>
                <td style="text-align: right; font-weight: bold; color: var(--primary-color);">${formatMonto(total)}</td>
            `;
            anexosTableBody.appendChild(trTotal);
            
        } catch (error) {
            console.error(error);
            anexosLoading.style.display = 'none';
            anexosError.textContent = 'Error al consultar los anexos.';
            anexosError.style.display = 'block';
        }
    };
    
    // Evento delegado para Anexos
    tableBody.addEventListener('click', (e) => {
        const link = e.target.closest('.anexo-link');
        if (link) {
            e.preventDefault();
            const tipo = link.getAttribute('data-tipo');
            openAnexosModal(tipo, valorEmpresa, valorDimension || 'REAL', valorPeriodo);
        }
    });

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

    // Ocultar dimensión
    const hideDimensionInterval = setInterval(() => {
        const filtroDimension = document.getElementById('select-dimension');
        if (filtroDimension) {
            filtroDimension.parentElement.style.display = 'none';
            clearInterval(hideDimensionInterval);
        }
    }, 100);

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

    const fetchData = () => {
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
        chartPanel.style.display = 'none';

        // Determinar los meses a consultar
        const MESES_ORDEN = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        const partesPeriodo = valorPeriodo.split('-');
        let mesesConsulta = [valorPeriodo];

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
                    if (isUpper) m = m.toUpperCase();
                    else if (isCapitalized) m = m.charAt(0).toUpperCase() + m.slice(1);
                    
                    mesesConsulta.push(`${m}-${año}`);
                }
            }
        }

        const mesesEncoded = mesesConsulta.map(m => encodeURIComponent(m)).join(',');
        const urlConsulta = `${CONFIG.SUPABASE_URL}/rest/v1/ct?empresa=eq.${encodeURIComponent(valorEmpresa)}&periodo=in.(${mesesEncoded})`;

        fetch(urlConsulta, {
            method: 'GET',
            headers: {
                'apikey': CONFIG.SUPABASE_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
            return response.json();
        })
        .then(data => renderData(data, mesesConsulta))
        .catch(error => {
            console.error('Error fetching data:', error);
            errorEl.textContent = 'Error al cargar los datos: ' + error.message;
            errorEl.classList.remove('hidden');
        })
        .finally(() => {
            loadingEl.classList.add('hidden');
        });
    };

    const renderData = (data, mesesOrdenados) => {
        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td style="text-align: center; padding: 20px; color: var(--text-secondary);">No hay datos disponibles para esta empresa.</td></tr>`;
            return;
        }

        // Construir Cabeceras
        let headerHtml = `<th style="min-width: 250px;">Denominación</th>`;
        mesesOrdenados.forEach(m => {
            headerHtml += `<th style="text-align: right;">${m}</th>`;
        });
        headerHtml += `<th style="text-align: center;">Tendencia</th>`;
        headerHtml += `<th style="text-align: right;">Total Acumulado</th>`;
        tableHeader.innerHTML = headerHtml;

        // Agrupación
        const agrupado = {};
        const totalesMesPorClase = {};
        const periodosCerrados = {}; // Guardar el estado de cierre de cada mes
        
        data.forEach(row => {
            if (row.cerrado === 'Periodo Cerrado') {
                periodosCerrados[row.periodo.toLowerCase()] = true;
            }

            const clase = (row.clase || 'Sin Clase').toUpperCase();
            const mesStr = row.periodo; // ej: "ene-26"
            const monto = parseFloat(row.monto) || 0;

            if (!agrupado[clase]) {
                agrupado[clase] = { items: {}, totalHistorico: 0 };
            }
            if (!totalesMesPorClase[clase]) {
                totalesMesPorClase[clase] = {};
                mesesOrdenados.forEach(m => totalesMesPorClase[clase][m] = 0);
            }

            const ctaKey = row.denominacion || 'Sin Denominación';
            if (!agrupado[clase].items[ctaKey]) {
                agrupado[clase].items[ctaKey] = {
                    montosMes: {},
                    totalAcumulado: 0,
                    orden: row.orden || 999
                };
                mesesOrdenados.forEach(m => agrupado[clase].items[ctaKey].montosMes[m] = 0);
            }

            // Sumar en el mes correspondiente
            // Asegurar que el string del periodo en data concuerde con mesesOrdenados
            // Si el backend devuelve "Ene-26" pero mesesOrdenados tiene "ene-26", lo uniformizamos:
            const mesMatch = mesesOrdenados.find(m => m.toLowerCase() === mesStr.toLowerCase());
            if (mesMatch) {
                agrupado[clase].items[ctaKey].montosMes[mesMatch] += monto;
                agrupado[clase].items[ctaKey].totalAcumulado += monto;
                agrupado[clase].totalHistorico += monto;
                totalesMesPorClase[clase][mesMatch] += monto;
            }
        });

        // Actualizar Tarjetas (Con el Total Histórico Final, sumatoria de toda la fila)
        let sumActivos = 0;
        let sumPasivos = 0;
        const netosMensuales = {}; // Para la fila inferior
        mesesOrdenados.forEach(m => netosMensuales[m] = 0);

        Object.keys(agrupado).forEach(clase => {
            if (clase.includes('ACTIVO')) sumActivos += agrupado[clase].totalHistorico;
            else if (clase.includes('PASIVO')) sumPasivos += agrupado[clase].totalHistorico;
        });

        // Calcular netos mensuales (Activos - Pasivos)
        const claseActivoRef = Object.keys(totalesMesPorClase).find(c => c.includes('ACTIVO'));
        const clasePasivoRef = Object.keys(totalesMesPorClase).find(c => c.includes('PASIVO'));
        
        mesesOrdenados.forEach(m => {
            const act = claseActivoRef ? totalesMesPorClase[claseActivoRef][m] : 0;
            const pas = clasePasivoRef ? totalesMesPorClase[clasePasivoRef][m] : 0;
            netosMensuales[m] = act - pas;
        });

        const sumNeto = sumActivos - sumPasivos;

        cardActivos.innerHTML = formatMonto(sumActivos, false);
        cardPasivos.innerHTML = formatMonto(sumPasivos, false);
        cardNeto.innerHTML = formatMonto(sumNeto, false);
        cardNeto.style.color = sumNeto < 0 ? '#ef4444' : 'var(--secondary-color)';
        summaryCards.style.display = 'flex';

        const makeCollapsible = (rowHeader, childClass) => {
            rowHeader.style.cursor = 'pointer';
            rowHeader.addEventListener('click', () => {
                const icon = rowHeader.querySelector('.toggle-icon');
                const isCollapsed = icon.textContent === '▶';
                icon.textContent = isCollapsed ? '▼' : '▶';

                const children = document.querySelectorAll(`.${childClass}`);
                children.forEach(child => child.style.display = isCollapsed ? 'table-row' : 'none');
            });
        };

        // Renderizar Filas
        let claseIndex = 0;
        Object.keys(agrupado).sort().forEach(clase => {
            claseIndex++;
            const groupData = agrupado[clase];
            const groupId = `ct-group-${claseIndex}`;

            // Totales mensuales de esta clase para la fila Grupo
            let celdasMesesGrupo = '';
            mesesOrdenados.forEach((m, idx) => {
                const isClosed = !!periodosCerrados[m.toLowerCase()];
                const currentVal = totalesMesPorClase[clase][m];
                const prevVal = idx > 0 ? totalesMesPorClase[clase][mesesOrdenados[idx - 1]] : undefined;
                const indicator = getIndicatorHtml(currentVal, prevVal);
                celdasMesesGrupo += `<td style="text-align: right;">${formatMonto(currentVal, isClosed)} ${indicator}</td>`;
            });

            const sparklineDataGroup = mesesOrdenados.map(m => totalesMesPorClase[clase][m]);
            const sparklineHtmlGroup = createSparkline(sparklineDataGroup);

            const trGroup = document.createElement('tr');
            trGroup.style.backgroundColor = 'var(--row-g-bg)';
            trGroup.style.fontWeight = 'bold';
            trGroup.style.color = 'var(--primary-color)';
            trGroup.innerHTML = `
                <td style="font-size: 1.1rem; user-select: none; position: sticky; left: 0; background-color: var(--row-g-bg); z-index: 1;">
                    <span class="toggle-icon" style="display:inline-block; width:20px; font-size: 0.9rem;">▼</span>
                    ${clase}
                </td>
                ${celdasMesesGrupo}
                <td style="text-align: center; vertical-align: middle;" class="sparkline-cell" data-title="${clase}" data-vals="${sparklineDataGroup.join(',')}">${sparklineHtmlGroup}</td>
                <td style="text-align: right; font-size: 1.1rem;">${formatMonto(groupData.totalHistorico)}</td>
            `;
            tableBody.appendChild(trGroup);
            makeCollapsible(trGroup, groupId);

            // Filas de cuentas (items)
            Object.keys(groupData.items).sort((a, b) => {
                const ordenA = groupData.items[a].orden;
                const ordenB = groupData.items[b].orden;
                if (ordenA !== ordenB) return ordenA - ordenB;
                return a.localeCompare(b);
            }).forEach(ctaName => {
                const item = groupData.items[ctaName];
                
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
                trItem.className = groupId;
                trItem.style.transition = 'background-color 0.2s';
                
                let ctaDisplay = `<span style="color: var(--text-primary);">${ctaName}</span>`;
                if (ctaName === 'CAJA Y BANCO' || ctaName === 'INVENTARIOS') {
                    ctaDisplay = `<a class="anexo-link" data-tipo="${ctaName}">${ctaName} 🔍</a>`;
                }

                trItem.innerHTML = `
                    <td style="padding-left: 45px; position: sticky; left: 0; background-color: var(--surface-color); z-index: 1;">
                        ${ctaDisplay}
                    </td>
                    ${celdasMesesItem}
                    <td style="text-align: center; vertical-align: middle;" class="sparkline-cell" data-title="${ctaName}" data-vals="${sparklineDataItem.join(',')}">${sparklineHtmlItem}</td>
                    <td style="text-align: right; font-weight: bold;">${formatMonto(item.totalAcumulado)}</td>
                `;
                tableBody.appendChild(trItem);
            });
        });

        // Fila Total General
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
                Capital Neto
            </td>
            ${celdasNetosMensuales}
            <td style="text-align: center; vertical-align: middle; background-color: var(--primary-color);" class="sparkline-cell" data-title="Capital Neto" data-vals="${sparklineDataTotal.join(',')}">
                ${sparklineHtmlTotal.replace('var(--primary-color)', 'white')}
            </td>
            <td style="text-align: right; font-size: 1.1rem; background-color: var(--primary-color); color: white; font-weight: bold;">
                ${formatMonto(sumNeto, false, 'white')}
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

        // Renderizar Gráfica
        renderChart(mesesOrdenados, totalesMesPorClase);
    };

    const renderChart = (mesesOrdenados, totalesMesPorClase) => {
        chartPanel.style.display = 'block';
        const ctx = document.getElementById('ct-line-chart').getContext('2d');
        
        if (currentChart) {
            currentChart.destroy();
        }

        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.getAttribute('data-theme') === 'black';
        const textColor = isDarkMode ? '#cbd5e1' : '#475569';
        const gridColor = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';

        const datasets = [];
        
        // Identificar la llave de Activos y Pasivos dinámicamente
        const claseActivo = Object.keys(totalesMesPorClase).find(c => c.includes('ACTIVO'));
        const clasePasivo = Object.keys(totalesMesPorClase).find(c => c.includes('PASIVO'));

        if (claseActivo) {
            datasets.push({
                label: 'Activos Corrientes',
                data: mesesOrdenados.map(m => totalesMesPorClase[claseActivo][m]),
                borderColor: '#4f46e5', // Primary color
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                borderWidth: 3,
                tension: 0.3, // Suavizado de la línea
                fill: true
            });
        }

        if (clasePasivo) {
            datasets.push({
                label: 'Pasivo Corriente',
                data: mesesOrdenados.map(m => totalesMesPorClase[clasePasivo][m]),
                borderColor: '#ef4444', // Red color
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderWidth: 3,
                tension: 0.3,
                fill: true
            });
        }

        currentChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: mesesOrdenados.map(m => m.toUpperCase()),
                datasets: datasets
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
                        position: 'top',
                        labels: {
                            color: textColor,
                            font: { family: 'Inter', size: 13 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('es-VE', { style: 'decimal', minimumFractionDigits: 2 }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { family: 'Inter' } }
                    },
                    y: {
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            font: { family: 'Inter' },
                            callback: function(value) {
                                return new Intl.NumberFormat('es-VE', { notation: "compact", compactDisplay: "short" }).format(value);
                            }
                        }
                    }
                }
            }
        });
    };

    fetchData();
});
