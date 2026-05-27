// Configuración de Supabase
const supabaseUrl = CONFIG.SUPABASE_URL;
const supabaseKey = CONFIG.SUPABASE_KEY;
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Estado de la aplicación
let state = {
    empresa: 'Empresa 1',
    mes: 'Enero'
};

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar UI
    initSidebar();
    initFilters();
    
    // Cargar datos iniciales
    fetchData();
});

function initSidebar() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            // Actualizar clase activa
            navItems.forEach(nav => nav.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            // Actualizar estado y título
            const empresaSeleccionada = e.currentTarget.getAttribute('data-empresa');
            state.empresa = empresaSeleccionada;
            document.getElementById('current-empresa').textContent = empresaSeleccionada;
            
            // Recargar datos
            fetchData();
        });
    });
}

function initFilters() {
    const mesSelect = document.getElementById('mes-filter');
    mesSelect.addEventListener('change', (e) => {
        state.mes = e.target.value;
        fetchData();
    });
}

async function fetchData() {
    const tableBody = document.getElementById('table-body');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    
    // Reset estado de UI
    tableBody.innerHTML = '';
    loadingEl.classList.remove('hidden');
    errorEl.classList.add('hidden');
    
    try {
        // Consultar a Supabase
        // Filtramos por la empresa y el mes seleccionados
        const { data, error } = await supabase
            .from('gyp')
            .select('*')
            .eq('empresa', state.empresa)
            .eq('mes', state.mes);
            
        if (error) {
            throw error;
        }
        
        renderTable(data);
    } catch (error) {
        console.error('Error fetching data:', error);
        errorEl.textContent = 'Error al cargar los datos: ' + error.message;
        errorEl.classList.remove('hidden');
    } finally {
        loadingEl.classList.add('hidden');
    }
}

function renderTable(data) {
    const tableBody = document.getElementById('table-body');
    const tableHeader = document.getElementById('table-header');
    
    tableBody.innerHTML = '';
    
    if (!data || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="100%" style="text-align: center; padding: 20px; color: #6b7280;">No hay datos disponibles para esta selección.</td></tr>';
        return;
    }
    
    // Generar cabeceras dinámicamente basadas en el primer objeto
    const columns = Object.keys(data[0]);
    tableHeader.innerHTML = '';
    columns.forEach(col => {
        const th = document.createElement('th');
        // Capitalizar y reemplazar guiones bajos
        th.textContent = col.replace(/_/g, ' ').toUpperCase();
        tableHeader.appendChild(th);
    });
    
    // Generar filas
    data.forEach(row => {
        const tr = document.createElement('tr');
        columns.forEach(col => {
            const td = document.createElement('td');
            // Formatear si es número (opcional)
            let val = row[col];
            if (typeof val === 'number') {
                // Formato simple, se puede mejorar
                val = val.toLocaleString('es-VE'); 
            }
            td.textContent = val !== null ? val : '-';
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });
}
