document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('table-body');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    const successEl = document.getElementById('success-message');
    
    // Modal References
    const modal = document.getElementById('categoria-modal');
    const btnNuevo = document.getElementById('btn-nuevo');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelModal = document.getElementById('btn-cancel-modal');
    const form = document.getElementById('categoria-form');
    const modalTitle = document.getElementById('modal-title');

    // Cargar categorías
    const loadCategorias = async () => {
        try {
            loadingEl.style.display = 'block';
            errorEl.classList.add('hidden');
            tableBody.innerHTML = '';
            
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/categor%C3%ADa_actividad?order=id.asc`, {
                method: 'GET',
                headers: {
                    'apikey': CONFIG.SUPABASE_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
                }
            });

            if (!response.ok) throw new Error('Error al cargar categorías de actividad');

            const data = await response.json();
            renderTable(data);
        } catch (error) {
            console.error('Error:', error);
            errorEl.textContent = 'Error al conectar con la base de datos (Supabase). Asegúrate de que la tabla "categoría_actividad" exista.';
            errorEl.classList.remove('hidden');
        } finally {
            loadingEl.style.display = 'none';
        }
    };

    const renderTable = (data) => {
        tableBody.innerHTML = '';
        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-secondary);">No hay categorías registradas.</td></tr>';
            return;
        }

        data.forEach(item => {
            const tr = document.createElement('tr');
            
            const isActive = item.active === true || String(item.active).toLowerCase() === 'true';
            const badgeClass = isActive ? 'badge-active' : 'badge-inactive';
            const badgeText = isActive ? 'Activo' : 'Inactivo';

            tr.innerHTML = `
                <td style="font-weight: bold; text-align: center;">${item.id}</td>
                <td style="font-weight: 500;">${item.description || ''}</td>
                <td style="text-align: center;"><span class="badge ${badgeClass}">${badgeText}</span></td>
                <td style="text-align: center;">
                    <button class="btn-action btn-edit" title="Editar" data-id="${item.id}" data-description="${item.description || ''}" data-active="${isActive}">✏️ Editar</button>
                    <button class="btn-action btn-delete" title="Eliminar" data-id="${item.id}" data-description="${item.description || ''}">🗑️ Eliminar</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        // Add Edit Event Listeners
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                document.getElementById('form-id').value = target.dataset.id;
                document.getElementById('form-descripcion').value = target.dataset.description;
                document.getElementById('form-activo').checked = target.dataset.active === 'true';
                modalTitle.textContent = 'Editar Categoría';
                modal.classList.add('active');
            });
        });

        // Add Delete Event Listeners
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                const id = target.dataset.id;
                const description = target.dataset.description;
                eliminarCategoria(id, description);
            });
        });
    };

    // Save (Create or Update)
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('form-id').value;
        const descripcion = document.getElementById('form-descripcion').value.trim();
        const activo = document.getElementById('form-activo').checked;

        const payload = {
            description: descripcion,
            active: activo
        };

        try {
            let url = `${CONFIG.SUPABASE_URL}/rest/v1/categor%C3%ADa_actividad`;
            let method = 'POST';

            if (id) {
                // Edit / Patch
                url += `?id=eq.${id}`;
                method = 'PATCH';
            }

            const response = await fetch(url, {
                method: method,
                headers: {
                    'apikey': CONFIG.SUPABASE_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Error al guardar categoría en Supabase');

            modal.classList.remove('active');
            showSuccess(id ? 'Categoría actualizada correctamente.' : 'Categoría creada exitosamente.');
            loadCategorias();
        } catch (error) {
            console.error('Error:', error);
            alert('Ocurrió un error al intentar guardar la categoría: ' + error.message);
        }
    });

    // Delete Categoria
    const eliminarCategoria = async (id, description) => {
        if (!confirm(`¿Estás seguro de eliminar la categoría "${description}"?`)) return;
        try {
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/categor%C3%ADa_actividad?id=eq.${id}`, {
                method: 'DELETE',
                headers: {
                    'apikey': CONFIG.SUPABASE_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
                }
            });
            if (!response.ok) throw new Error('Error al eliminar la categoría de Supabase');
            showSuccess(`Categoría "${description}" eliminada correctamente.`);
            loadCategorias();
        } catch (error) {
            console.error(error);
            alert('Error al intentar eliminar la categoría: ' + error.message);
        }
    };

    // Modal Control
    btnNuevo.addEventListener('click', () => {
        form.reset();
        document.getElementById('form-id').value = '';
        document.getElementById('form-activo').checked = true;
        modalTitle.textContent = 'Nueva Categoría';
        modal.classList.add('active');
    });

    const closeModal = () => modal.classList.remove('active');
    btnCloseModal.addEventListener('click', closeModal);
    btnCancelModal.addEventListener('click', closeModal);

    // Toast/Status Messages
    const showSuccess = (msg) => {
        successEl.textContent = msg;
        successEl.classList.remove('hidden');
        setTimeout(() => successEl.classList.add('hidden'), 4000);
    };

    // Initialize
    loadCategorias();
});
