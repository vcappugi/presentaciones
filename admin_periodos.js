document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('table-body-periodos');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    
    // Modal elements
    const modal = document.getElementById('periodo-modal');
    const btnNuevoPeriodo = document.getElementById('btn-nuevo-periodo');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelModal = document.getElementById('btn-cancel-modal');
    const formPeriodo = document.getElementById('form-periodo');
    
    let periodos = [];

    // Cargar periodos
    const fetchPeriodos = async () => {
        showLoading();
        try {
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/periodos?order=id.asc`, {
                method: 'GET',
                headers: {
                    'apikey': CONFIG.SUPABASE_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) throw new Error('Error al cargar los periodos');
            
            periodos = await response.json();
            renderTable();
        } catch (error) {
            showError(error.message);
        }
    };

    // Renderizar tabla
    const renderTable = () => {
        tableBody.innerHTML = '';
        hideLoading();
        
        if (periodos.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px; color: var(--text-secondary);">No hay periodos registrados</td></tr>`;
            return;
        }

        periodos.forEach(p => {
            const tr = document.createElement('tr');
            
            const isOpen = p.cerrado === 'Periodo Abierto';
            const badgeClass = isOpen ? 'badge-open' : 'badge-closed';
            const badgeText = isOpen ? 'Abierto' : 'Cerrado';
            
            const toggleBtnClass = isOpen ? 'closed' : '';
            const toggleBtnText = isOpen ? 'Cerrar Periodo' : 'Abrir Periodo';

            tr.innerHTML = `
                <td>${p.id}</td>
                <td style="font-weight: 600;">${p.periodo}</td>
                <td><span class="badge ${badgeClass}">${badgeText}</span></td>
                <td>
                    <button class="btn-action btn-toggle ${toggleBtnClass}" onclick="toggleStatus(${p.id}, '${p.periodo}', '${p.cerrado}')">${toggleBtnText}</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    };

    // Guardar (Crear Nuevo)
    formPeriodo.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const periodoData = {
            periodo: document.getElementById('periodo-nombre').value,
            cerrado: document.getElementById('periodo-estado').value
        };

        try {
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/periodos`, {
                method: 'POST',
                headers: {
                    'apikey': CONFIG.SUPABASE_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify([periodoData])
            });

            if (!response.ok) throw new Error('Error al guardar el periodo');

            closeModal();
            fetchPeriodos();
        } catch (error) {
            alert(error.message);
        }
    });

    // Función global para alternar estado y actualizar masivamente
    window.toggleStatus = async (id, periodoNombre, estadoActual) => {
        const nuevoEstado = estadoActual === 'Periodo Abierto' ? 'Periodo Cerrado' : 'Periodo Abierto';
        
        const confirmMsg = `¿Estás seguro de cambiar el periodo "${periodoNombre}" a ${nuevoEstado}?\n\n¡ATENCIÓN! Esto actualizará automáticamente todos los registros de ganancias y pérdidas (GYP) correspondientes a este periodo.`;
        
        if (!confirm(confirmMsg)) return;

        showLoading();

        try {
            // 1. Actualizar la tabla de periodos
            const responsePeriodo = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/periodos?id=eq.${id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': CONFIG.SUPABASE_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ cerrado: nuevoEstado })
            });

            if (!responsePeriodo.ok) throw new Error('Error al actualizar la tabla de periodos');

            // 2. Actualización Masiva en la tabla GYP usando ilike para ignorar mayúsculas/minúsculas
            const responseGyp = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/gyp?periodo=ilike.${encodeURIComponent(periodoNombre)}`, {
                method: 'PATCH',
                headers: {
                    'apikey': CONFIG.SUPABASE_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ cerrado: nuevoEstado })
            });

            if (!responseGyp.ok) {
                console.error("Error actualizando GYP, pero se actualizó el periodo", await responseGyp.text());
                throw new Error('El periodo se actualizó, pero hubo un error al aplicar el cambio masivo a los registros de la tabla GYP.');
            }

            // Exito
            fetchPeriodos();
        } catch (error) {
            alert(error.message);
            fetchPeriodos(); // Refrescar para estar seguros del estado
        }
    };

    // Funciones del Modal
    const openModalNew = () => {
        formPeriodo.reset();
        modal.classList.add('active');
    };

    const closeModal = () => {
        modal.classList.remove('active');
    };

    btnNuevoPeriodo.addEventListener('click', openModalNew);
    btnCloseModal.addEventListener('click', closeModal);
    btnCancelModal.addEventListener('click', closeModal);

    // Helpers
    const showLoading = () => {
        loadingEl.style.display = 'block';
        errorEl.classList.add('hidden');
        tableBody.innerHTML = '';
    };

    const hideLoading = () => {
        loadingEl.style.display = 'none';
    };

    const showError = (msg) => {
        hideLoading();
        errorEl.textContent = msg;
        errorEl.classList.remove('hidden');
    };

    // Inicializar
    fetchPeriodos();
});
