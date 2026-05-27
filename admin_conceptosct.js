document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('table-body');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    const successEl = document.getElementById('success-message');
    
    // Modal
    const modal = document.getElementById('concepto-modal');
    const btnNuevo = document.getElementById('btn-nuevo');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelModal = document.getElementById('btn-cancel-modal');
    const form = document.getElementById('concepto-form');
    const modalTitle = document.getElementById('modal-title');

    // Cargar Conceptos
    const loadConceptos = async () => {
        try {
            loadingEl.classList.remove('hidden');
            errorEl.classList.add('hidden');
            
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/conceptosct?order=orden.asc`, {
                method: 'GET',
                headers: {
                    'apikey': CONFIG.SUPABASE_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
                }
            });

            if (!response.ok) throw new Error('Error al cargar conceptos');

            const data = await response.json();
            renderTable(data);
        } catch (error) {
            console.error('Error:', error);
            errorEl.textContent = 'Error de conexión con la base de datos.';
            errorEl.classList.remove('hidden');
        } finally {
            loadingEl.classList.add('hidden');
        }
    };

    const renderTable = (data) => {
        tableBody.innerHTML = '';
        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No hay conceptos registrados.</td></tr>';
            return;
        }

        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: bold; width: 80px; text-align: center;">${item.orden || '-'}</td>
                <td>${item.denominacion || ''}</td>
                <td>
                    <span style="display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: 600; 
                        background-color: ${item.clase === 'ACTIVOS CORRIENTES' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)'};
                        color: ${item.clase === 'ACTIVOS CORRIENTES' ? '#3b82f6' : '#ef4444'};">
                        ${item.clase || ''}
                    </span>
                </td>
                <td style="text-align: center;">
                    <button class="action-btn btn-edit" title="Editar" data-id="${item.id}" data-orden="${item.orden || ''}" data-denominacion="${item.denominacion || ''}" data-clase="${item.clase || ''}">✏️</button>
                    <button class="action-btn btn-delete" title="Eliminar" data-id="${item.id}">🗑️</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        // Eventos Editar
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                document.getElementById('form-id').value = target.dataset.id;
                document.getElementById('form-orden').value = target.dataset.orden;
                document.getElementById('form-denominacion').value = target.dataset.denominacion;
                document.getElementById('form-clase').value = target.dataset.clase;
                modalTitle.textContent = 'Editar Concepto';
                modal.classList.add('active');
            });
        });

        // Eventos Eliminar
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                if (confirm('¿Estás seguro de que deseas eliminar este concepto? Esta acción no se puede deshacer y puede afectar los reportes.')) {
                    await deleteConcepto(id);
                }
            });
        });
    };

    const deleteConcepto = async (id) => {
        try {
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/conceptosct?id=eq.${id}`, {
                method: 'DELETE',
                headers: {
                    'apikey': CONFIG.SUPABASE_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
                }
            });

            if (!response.ok) throw new Error('Error al eliminar');
            
            showSuccess('Concepto eliminado correctamente.');
            loadConceptos();
        } catch (error) {
            console.error('Error:', error);
            errorEl.textContent = 'Error al eliminar el concepto.';
            errorEl.classList.remove('hidden');
        }
    };

    // Guardar (Crear o Actualizar)
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('form-id').value;
        const orden = document.getElementById('form-orden').value;
        const denominacion = document.getElementById('form-denominacion').value.toUpperCase();
        const clase = document.getElementById('form-clase').value;

        const payload = {
            orden: parseInt(orden),
            denominacion: denominacion,
            clase: clase
        };

        try {
            let url = `${CONFIG.SUPABASE_URL}/rest/v1/conceptosct`;
            let method = 'POST';

            if (id) {
                // Editar
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

            if (!response.ok) throw new Error('Error al guardar');

            modal.classList.remove('active');
            showSuccess(id ? 'Concepto actualizado correctamente.' : 'Concepto creado exitosamente.');
            loadConceptos();
        } catch (error) {
            console.error('Error:', error);
            alert('Error al guardar el concepto.');
        }
    });

    // Control de Modal
    btnNuevo.addEventListener('click', () => {
        form.reset();
        document.getElementById('form-id').value = '';
        modalTitle.textContent = 'Nuevo Concepto';
        modal.classList.add('active');
    });

    const closeModal = () => modal.classList.remove('active');
    btnCloseModal.addEventListener('click', closeModal);
    btnCancelModal.addEventListener('click', closeModal);

    // Mensajes
    const showSuccess = (msg) => {
        successEl.textContent = msg;
        successEl.classList.remove('hidden');
        setTimeout(() => successEl.classList.add('hidden'), 3000);
    };

    // Inicio
    loadConceptos();
});
