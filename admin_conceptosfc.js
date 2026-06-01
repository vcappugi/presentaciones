document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('table-body');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    const successEl = document.getElementById('success-message');
    
    // Modal References
    const modal = document.getElementById('concepto-modal');
    const btnNuevo = document.getElementById('btn-nuevo');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelModal = document.getElementById('btn-cancel-modal');
    const form = document.getElementById('concepto-form');
    const modalTitle = document.getElementById('modal-title');

    // Color mapper for classes
    const getClassBadgeStyle = (clase) => {
        const c = String(clase).toUpperCase();
        if (c.includes('OPERACIÓN') || c.includes('OPERACION')) {
            return { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }; // Blue
        } else if (c.includes('INVERSIÓN') || c.includes('INVERSION')) {
            return { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }; // Green
        } else if (c.includes('FINANCIACIÓN') || c.includes('FINANCIACION')) {
            return { bg: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }; // Purple
        }
        return { bg: 'rgba(156, 163, 175, 0.1)', color: '#9ca3af' }; // Grey
    };

    // Load Concepts
    const loadConceptos = async () => {
        try {
            loadingEl.classList.remove('hidden');
            errorEl.classList.add('hidden');
            
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/conceptosfc?order=orden.asc`, {
                method: 'GET',
                headers: {
                    'apikey': CONFIG.SUPABASE_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
                }
            });

            if (!response.ok) throw new Error('Error al cargar conceptos de flujo de caja');

            const data = await response.json();
            renderTable(data);
        } catch (error) {
            console.error('Error:', error);
            errorEl.textContent = 'Error de conexión con la base de datos (Supabase).';
            errorEl.classList.remove('hidden');
        } finally {
            loadingEl.classList.add('hidden');
        }
    };

    const renderTable = (data) => {
        tableBody.innerHTML = '';
        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--text-secondary);">No hay conceptos de flujo de caja registrados.</td></tr>';
            return;
        }

        data.forEach(item => {
            const tr = document.createElement('tr');
            const badgeStyle = getClassBadgeStyle(item.clase);
            
            tr.innerHTML = `
                <td style="font-weight: bold; text-align: center;">${item.orden || '-'}</td>
                <td>${item.denominacion || ''}</td>
                <td>
                    <span style="display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: 600; 
                        background-color: ${badgeStyle.bg};
                        color: ${badgeStyle.color};">
                        ${item.clase || ''}
                    </span>
                </td>
                <td class="text-muted" style="font-size: 0.9rem;">${item.grupo || '-'}</td>
                <td class="text-muted" style="font-size: 0.9rem;">${item.subgrupo1 || '-'}</td>
                <td class="text-muted" style="font-size: 0.9rem;">${item.subgrupo2 || '-'}</td>
                <td style="text-align: center;">
                    <button class="action-btn btn-edit" title="Editar" data-id="${item.id}" data-orden="${item.orden || ''}" data-denominacion="${item.denominacion || ''}" data-clase="${item.clase || ''}" data-grupo="${item.grupo || ''}" data-subgrupo1="${item.subgrupo1 || ''}" data-subgrupo2="${item.subgrupo2 || ''}">✏️ Editar</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        // Add Edit Event Listeners
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                document.getElementById('form-id').value = target.dataset.id;
                document.getElementById('form-orden').value = target.dataset.orden;
                document.getElementById('form-denominacion').value = target.dataset.denominacion;
                document.getElementById('form-clase').value = target.dataset.clase;
                document.getElementById('form-grupo').value = target.dataset.grupo;
                document.getElementById('form-subgrupo1').value = target.dataset.subgrupo1;
                document.getElementById('form-subgrupo2').value = target.dataset.subgrupo2;
                modalTitle.textContent = 'Editar Concepto Flujo de Caja';
                modal.classList.add('active');
            });
        });
    };

    // Save (Create or Update)
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('form-id').value;
        const orden = document.getElementById('form-orden').value;
        const denominacion = document.getElementById('form-denominacion').value.toUpperCase();
        const clase = document.getElementById('form-clase').value;
        const grupo = document.getElementById('form-grupo').value.trim().toUpperCase();
        const subgrupo1 = document.getElementById('form-subgrupo1').value.trim().toUpperCase();
        const subgrupo2 = document.getElementById('form-subgrupo2').value.trim().toUpperCase();

        const payload = {
            orden: parseInt(orden),
            denominacion: denominacion,
            clase: clase,
            grupo: grupo || null,
            subgrupo1: subgrupo1 || null,
            subgrupo2: subgrupo2 || null
        };

        try {
            let url = `${CONFIG.SUPABASE_URL}/rest/v1/conceptosfc`;
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

            if (!response.ok) throw new Error('Error al guardar concepto en Supabase');

            modal.classList.remove('active');
            showSuccess(id ? 'Concepto de Flujo de Caja actualizado correctamente.' : 'Concepto de Flujo de Caja creado exitosamente.');
            loadConceptos();
        } catch (error) {
            console.error('Error:', error);
            alert('Ocurrió un error al intentar guardar el concepto: ' + error.message);
        }
    });

    // Modal Control
    btnNuevo.addEventListener('click', () => {
        form.reset();
        document.getElementById('form-id').value = '';
        modalTitle.textContent = 'Nuevo Concepto Flujo de Caja';
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
    loadConceptos();
});
