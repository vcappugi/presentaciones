document.addEventListener('DOMContentLoaded', () => {
    const filtrosContainer = document.getElementById('filtros-container');
    if (filtrosContainer) {
        fetch('filtros.html')
            .then(response => response.text())
            .then(html => {
                filtrosContainer.innerHTML = html;
                initFiltros();
            })
            .catch(error => console.error('Error cargando filtros:', error));
    }
});

function initFiltros() {
    const selectEmpresa = document.getElementById('select-empresa');
    const selectPeriodo = document.getElementById('select-periodo');
    const btnConsultar = document.getElementById('btn-consultar');
    const selectDimension = document.getElementById('select-dimension');

    if (!selectEmpresa || !selectPeriodo || !btnConsultar || !selectDimension) return;

    const currentPath = window.location.pathname;
    const currentPage = currentPath.split('/').pop() || 'index.html';
    const isIndex = currentPage === 'index.html' || currentPage === '';

    if (isIndex) {
        const empresaGroup = selectEmpresa.closest('.filter-group');
        if (empresaGroup) {
            empresaGroup.style.display = 'none';
        }
    }

    // Función genérica para cargar opciones desde Supabase
    const fetchOpciones = async (tabla, selectElement) => {
        try {
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${tabla}`, {
                method: 'GET',
                headers: {
                    'apikey': CONFIG.SUPABASE_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) throw new Error('Error en la petición');
            
            const data = await response.json();
            selectElement.innerHTML = '';
            
            if (data.length === 0) {
                selectElement.innerHTML = `<option value="">No hay opciones</option>`;
                return;
            }

            // Intentar deducir la columna a mostrar
            const firstRow = data[0];
            const possibleCols = ['empresa', 'periodo', 'nombre', 'descripcion'];
            let colName = Object.keys(firstRow)[0];
            for (let c of possibleCols) {
                if (firstRow.hasOwnProperty(c)) {
                    colName = c;
                    break;
                }
            }

            if (tabla === 'periodos') {
                const MESES_ORDEN = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
                data.sort((a, b) => {
                    const valA = String(a[colName]).toLowerCase();
                    const valB = String(b[colName]).toLowerCase();
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
            }

            data.forEach(item => {
                const val = item[colName];
                const option = document.createElement('option');
                option.value = val;
                option.textContent = val;
                selectElement.appendChild(option);
            });
        } catch (error) {
            console.error(`Error cargando ${tabla}:`, error);
            selectElement.innerHTML = `<option value="">Error de conexión</option>`;
        }
    };

    // Cargar datos al cargar la página
    Promise.all([
        fetchOpciones('empresas', selectEmpresa),
        fetchOpciones('periodos', selectPeriodo)
    ]).then(() => {
        // Primero intentamos leer de la URL
        const urlParams = new URLSearchParams(window.location.search);
        let urlEmpresa = urlParams.get('empresa');
        let urlPeriodo = urlParams.get('periodo');
        let urlDimension = urlParams.get('dimension');

        // Si hay en la URL, los seleccionamos. Si no, restauramos de memoria.
        if (urlEmpresa) selectEmpresa.value = urlEmpresa;
        else if (localStorage.getItem('bel_empresa')) selectEmpresa.value = localStorage.getItem('bel_empresa');

        if (urlPeriodo) selectPeriodo.value = urlPeriodo;
        else if (localStorage.getItem('bel_periodo')) selectPeriodo.value = localStorage.getItem('bel_periodo');

        if (urlDimension) selectDimension.value = urlDimension;
        else if (localStorage.getItem('bel_dimension')) selectDimension.value = localStorage.getItem('bel_dimension');
    });

    // Manejar click del botón
    btnConsultar.addEventListener('click', () => {
        const empresa = selectEmpresa.value;
        const periodo = selectPeriodo.value;
        const dimension = selectDimension.value;
        
        if ((isIndex || empresa) && periodo && dimension) {
            // Guardar en memoria
            if (empresa) localStorage.setItem('bel_empresa', empresa);
            localStorage.setItem('bel_periodo', periodo);
            localStorage.setItem('bel_dimension', dimension);
            
            let targetPage = currentPage;
            if (isIndex) {
                targetPage = 'index.html';
                window.location.href = `${targetPage}?periodo=${encodeURIComponent(periodo)}&dimension=${encodeURIComponent(dimension)}`;
            } else {
                if (currentPage === 'admin.html' || currentPage === 'admin_empresas.html' || currentPage === '') {
                    targetPage = 'empresa_divisiones.html';
                }
                window.location.href = `${targetPage}?empresa=${encodeURIComponent(empresa)}&periodo=${encodeURIComponent(periodo)}&dimension=${encodeURIComponent(dimension)}`;
            }
        } else {
            if (isIndex) {
                alert('Por favor, selecciona un periodo y una dimensión.');
            } else {
                alert('Por favor, selecciona una empresa, un periodo y una dimensión.');
            }
        }
    });
}

