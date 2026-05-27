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
    
    // Evento delegado para Anexos (asegurar un solo listener)
    tableBody.addEventListener('click', (e) => {
        const link = e.target.closest('.anexo-link');
        if (link) {
            e.preventDefault();
            const tipo = link.getAttribute('data-tipo');
            openAnexosModal(tipo, valorEmpresa, valorDimension || 'REAL', valorPeriodo);
        }
    });
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
    const fetchData = () => {
        if (!valorEmpresa || !valorPeriodo) {
            tableBody.innerHTML = '<tr><td colspan="2" style="text-align: center; padding: 20px; color: var(--text-secondary);">Seleccione una empresa y un periodo y presione consultar</td></tr>';
            loadingEl.classList.add('hidden');
            return;
        }

        loadingEl.classList.remove('hidden');
        errorEl.classList.add('hidden');
        tableBody.innerHTML = '';
        summaryCards.style.display = 'none';

        const urlConsulta = `${CONFIG.SUPABASE_URL}/rest/v1/ct?empresa=eq.${encodeURIComponent(valorEmpresa)}&periodo=eq.${encodeURIComponent(valorPeriodo)}`;

        fetch(urlConsulta, {
            method: 'GET',
            headers: {
                'apikey': CONFIG.SUPABASE_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) throw new Error(`Error en la petición: ${response.status}`);
            return response.json();
        })
        .then(data => renderData(data))
        .catch(error => {
            console.error('Error fetching data:', error);
            errorEl.textContent = 'Error al cargar los datos: ' + error.message;
            errorEl.classList.remove('hidden');
        })
        .finally(() => {
            loadingEl.classList.add('hidden');
        });
    };

    const renderData = (data) => {
        if (!data || data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="2" style="text-align: center; padding: 20px; color: var(--text-secondary);">No hay datos disponibles para esta empresa y periodo.</td></tr>';
            return;
        }

        let isClosed = false;
        if (data[0] && data[0].cerrado === 'Periodo Cerrado') {
            isClosed = true;
        }

        thMonto.innerHTML = isClosed ? 'Monto 🔒' : 'Monto';

        // Agrupar por clase
        const agrupado = {};
        let totalActivos = 0;
        let totalPasivos = 0;

        data.forEach(row => {
            const clase = (row.clase || 'Sin Clase').toUpperCase();
            const monto = parseFloat(row.monto) || 0;

            if (!agrupado[clase]) agrupado[clase] = { total: 0, items: [] };

            agrupado[clase].total += monto;
            agrupado[clase].items.push(row);

            if (clase.includes('ACTIVO')) totalActivos += monto;
            else if (clase.includes('PASIVO')) totalPasivos += monto;
        });

        const totalNeto = totalActivos - totalPasivos;
        cardActivos.innerHTML = formatMonto(totalActivos, false);
        cardPasivos.innerHTML = formatMonto(totalPasivos, false);
        cardNeto.innerHTML = formatMonto(totalNeto, false);
        cardNeto.style.color = totalNeto < 0 ? '#ef4444' : 'var(--secondary-color)';
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

        let claseIndex = 0;
        Object.keys(agrupado).sort().forEach(clase => {
            claseIndex++;
            const groupData = agrupado[clase];
            const groupId = `ct-group-${claseIndex}`;

            const trGroup = document.createElement('tr');
            trGroup.style.backgroundColor = 'var(--row-g-bg)';
            trGroup.style.fontWeight = 'bold';
            trGroup.style.color = 'var(--primary-color)';
            trGroup.innerHTML = `
                <td style="font-size: 1.1rem; user-select: none; position: sticky; left: 0; background-color: var(--row-g-bg); z-index: 1;">
                    <span class="toggle-icon" style="display:inline-block; width:20px; font-size: 0.9rem;">▼</span>
                    ${clase}
                </td>
                <td style="text-align: right; font-size: 1.1rem;">${formatMonto(groupData.total, isClosed)}</td>
            `;
            tableBody.appendChild(trGroup);
            makeCollapsible(trGroup, groupId);

            groupData.items.sort((a, b) => (a.orden || 999) - (b.orden || 999)).forEach(item => {
                const trItem = document.createElement('tr');
                trItem.className = groupId;
                trItem.style.transition = 'background-color 0.2s';
                
                const ctaName = item.denominacion || '-';
                let ctaDisplay = `<span style="color: var(--text-primary);">${ctaName}</span>`;
                if (ctaName === 'CAJA Y BANCO' || ctaName === 'INVENTARIOS') {
                    ctaDisplay = `<a class="anexo-link" data-tipo="${ctaName}">${ctaName} 🔍</a>`;
                }

                trItem.innerHTML = `
                    <td style="padding-left: 45px; position: sticky; left: 0; background-color: var(--surface-color); z-index: 1;">
                        ${ctaDisplay}
                    </td>
                    <td style="text-align: right;">${formatMonto(parseFloat(item.monto), isClosed)}</td>
                `;
                tableBody.appendChild(trItem);
            });
        });

        // Fila Total General
        const trTotal = document.createElement('tr');
        trTotal.innerHTML = `
            <td style="font-size: 1.1rem; user-select: none; position: sticky; left: 0; background-color: var(--primary-color); color: white; z-index: 1; font-weight: bold; text-transform: uppercase;">
                Capital de Trabajo Neto
            </td>
            <td style="text-align: right; font-size: 1.1rem; background-color: var(--primary-color); color: white; font-weight: bold;">
                ${formatMonto(totalNeto, isClosed, 'white')}
            </td>
        `;
        tableBody.appendChild(trTotal);
    };

    // Llamada inicial
    fetchData();
});
