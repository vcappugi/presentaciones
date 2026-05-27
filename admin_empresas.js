document.addEventListener('DOMContentLoaded', () => {
    // Referencias DOM
    const tableBody = document.getElementById('table-body-empresas');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    
    // Modal
    const modal = document.getElementById('empresa-modal');
    const modalTitle = document.getElementById('modal-title');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelModal = document.getElementById('btn-cancel-modal');
    const formEmpresa = document.getElementById('form-empresa');
    const btnNuevaEmpresa = document.getElementById('btn-nueva-empresa');
    const btnSaveModal = document.getElementById('btn-save-modal');

    // Headers base para Supabase
    const headers = {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
        'Content-Type': 'application/json'
    };
    const baseUrl = `${CONFIG.SUPABASE_URL}/rest/v1/empresas`;

    // Cargar tabla inicial
    fetchEmpresas();

    // Eventos Modal
    btnNuevaEmpresa.addEventListener('click', () => openModal());
    btnCloseModal.addEventListener('click', closeModal);
    btnCancelModal.addEventListener('click', closeModal);
    
    // Enviar Formulario (Crear o Editar)
    formEmpresa.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveEmpresa();
    });

    function openModal(empresa = null) {
        if (empresa) {
            modalTitle.textContent = 'Editar Empresa';
            document.getElementById('empresa-id').value = empresa.id;
            document.getElementById('empresa-nombre').value = empresa.nombre || '';
            document.getElementById('empresa-admin').value = empresa.administrador || '';
            document.getElementById('empresa-direccion').value = empresa.direccion || '';
            document.getElementById('empresa-mail').value = empresa.mail || '';
            document.getElementById('empresa-plan').value = empresa.plan || '';
            document.getElementById('empresa-telefono').value = empresa.telefono || '';
        } else {
            modalTitle.textContent = 'Nueva Empresa';
            formEmpresa.reset();
            document.getElementById('empresa-id').value = '';
        }
        modal.classList.add('active');
    }

    function closeModal() {
        modal.classList.remove('active');
        formEmpresa.reset();
    }

    async function fetchEmpresas() {
        tableBody.innerHTML = '';
        loadingEl.classList.remove('hidden');
        errorEl.classList.add('hidden');

        try {
            // Ordenamos por id ascendente
            const response = await fetch(`${baseUrl}?order=id.asc`, { method: 'GET', headers });
            if (!response.ok) throw new Error(`Error en lectura: ${response.statusText}`);
            
            const data = await response.json();
            renderTable(data);
        } catch (error) {
            console.error(error);
            errorEl.textContent = 'Error al cargar empresas: ' + error.message;
            errorEl.classList.remove('hidden');
        } finally {
            loadingEl.classList.add('hidden');
        }
    }

    function renderTable(data) {
        if (!data || data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">No hay empresas registradas.</td></tr>';
            return;
        }

        data.forEach(emp => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${emp.id}</td>
                <td style="font-weight: 600;">${emp.nombre || '-'}</td>
                <td>${emp.administrador || '-'}</td>
                <td>${emp.plan || '-'}</td>
                <td>${emp.telefono || '-'}</td>
                <td>
                    <button class="btn-action btn-edit" data-empresa='${JSON.stringify(emp).replace(/'/g, "&apos;")}'>Editar</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        // Añadir eventos a los botones de editar
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const empData = JSON.parse(e.target.getAttribute('data-empresa'));
                openModal(empData);
            });
        });
    }

    async function saveEmpresa() {
        const id = document.getElementById('empresa-id').value;
        const payload = {
            nombre: document.getElementById('empresa-nombre').value.trim(),
            administrador: document.getElementById('empresa-admin').value.trim() || null,
            direccion: document.getElementById('empresa-direccion').value.trim() || null,
            mail: document.getElementById('empresa-mail').value.trim() || null,
            plan: document.getElementById('empresa-plan').value.trim() || null,
            telefono: document.getElementById('empresa-telefono').value.trim() || null
        };

        btnSaveModal.disabled = true;
        btnSaveModal.textContent = 'Guardando...';

        try {
            let response;
            if (id) {
                // UPDATE (PATCH)
                // Prefer=return=representation para que devuelva el registro editado (opcional)
                response = await fetch(`${baseUrl}?id=eq.${id}`, {
                    method: 'PATCH',
                    headers: {
                        ...headers,
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify(payload)
                });
            } else {
                // INSERT (POST)
                response = await fetch(baseUrl, {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify(payload)
                });
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Error al guardar la empresa');
            }

            closeModal();
            fetchEmpresas(); // Recargar tabla
            
        } catch (error) {
            console.error(error);
            alert('Error al guardar: ' + error.message);
        } finally {
            btnSaveModal.disabled = false;
            btnSaveModal.textContent = 'Guardar';
        }
    }
});
