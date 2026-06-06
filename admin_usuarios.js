document.addEventListener('DOMContentLoaded', () => {
    // Referencias DOM
    const tableBody = document.getElementById('table-body-usuarios');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    
    // Modal
    const modal = document.getElementById('usuario-modal');
    const modalTitle = document.getElementById('modal-title');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelModal = document.getElementById('btn-cancel-modal');
    const formUsuario = document.getElementById('form-usuario');
    const btnNuevoUsuario = document.getElementById('btn-nuevo-usuario');
    const btnSaveModal = document.getElementById('btn-save-modal');

    // Headers base para Supabase
    const headers = {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
        'Content-Type': 'application/json'
    };
    const baseUrl = `${CONFIG.SUPABASE_URL}/rest/v1/usuario`;

    // Cargar tabla inicial
    fetchUsuarios();

    // Eventos Modal
    if (btnNuevoUsuario) btnNuevoUsuario.addEventListener('click', () => openModal());
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
    if (btnCancelModal) btnCancelModal.addEventListener('click', closeModal);
    
    // Enviar Formulario (Crear o Editar)
    formUsuario.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveUsuario();
    });

    function openModal(user = null) {
        if (user) {
            modalTitle.textContent = 'Editar Usuario';
            document.getElementById('usuario-id').value = user.id;
            document.getElementById('usuario-nickname').value = user.nickname || '';
            document.getElementById('usuario-nombre').value = user.nombre || '';
            document.getElementById('usuario-password').value = user.password || '';
            document.getElementById('usuario-rol').value = user.rol || 'usuario';
        } else {
            modalTitle.textContent = 'Nuevo Usuario';
            formUsuario.reset();
            document.getElementById('usuario-id').value = '';
            document.getElementById('usuario-rol').value = 'usuario';
        }
        modal.classList.add('active');
    }

    function closeModal() {
        modal.classList.remove('active');
        formUsuario.reset();
    }

    async function fetchUsuarios() {
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
            errorEl.textContent = 'Error al cargar usuarios: ' + error.message;
            errorEl.classList.remove('hidden');
        } finally {
            loadingEl.classList.add('hidden');
        }
    }

    function renderTable(data) {
        if (!data || data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">No hay usuarios registrados.</td></tr>';
            return;
        }

        data.forEach(user => {
            const tr = document.createElement('tr');
            
            const roleBadgeClass = user.rol === 'admin' ? 'badge-admin' : 'badge-user';
            
            tr.innerHTML = `
                <td>${user.id}</td>
                <td style="font-weight: 600;">${user.nickname || '-'}</td>
                <td>${user.nombre || '-'}</td>
                <td><span class="badge ${roleBadgeClass}">${user.rol || 'usuario'}</span></td>
                <td>
                    <div class="password-container">
                        <span class="password-text" data-password="${user.password || ''}">••••••••</span>
                        <button class="btn-toggle-password" title="Ver contraseña">👁️</button>
                    </div>
                </td>
                <td style="text-align: right;">
                    <button class="btn-action btn-edit" data-user='${JSON.stringify(user).replace(/'/g, "&apos;")}'>Editar</button>
                    <button class="btn-action btn-delete" data-id="${user.id}" data-nickname="${user.nickname || ''}" style="margin-left: 5px;">Eliminar</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        // Configurar toggle de contraseñas
        tableBody.querySelectorAll('.btn-toggle-password').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const container = e.target.closest('.password-container');
                const textEl = container.querySelector('.password-text');
                const rawPassword = textEl.getAttribute('data-password');
                
                if (textEl.textContent === '••••••••') {
                    textEl.textContent = rawPassword;
                    e.target.textContent = '🙈';
                    e.target.setAttribute('title', 'Ocultar contraseña');
                } else {
                    textEl.textContent = '••••••••';
                    e.target.textContent = '👁️';
                    e.target.setAttribute('title', 'Ver contraseña');
                }
            });
        });

        // Añadir eventos a los botones de editar
        tableBody.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const userData = JSON.parse(btn.getAttribute('data-user'));
                openModal(userData);
            });
        });

        // Añadir eventos a los botones de eliminar
        tableBody.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = btn.getAttribute('data-id');
                const nickname = btn.getAttribute('data-nickname');
                if (confirm(`¿Estás seguro de que deseas eliminar al usuario "${nickname}"?`)) {
                    await deleteUsuario(id);
                }
            });
        });
    }

    async function saveUsuario() {
        const id = document.getElementById('usuario-id').value;
        const payload = {
            nickname: document.getElementById('usuario-nickname').value.trim(),
            nombre: document.getElementById('usuario-nombre').value.trim(),
            password: document.getElementById('usuario-password').value.trim(),
            rol: document.getElementById('usuario-rol').value
        };

        btnSaveModal.disabled = true;
        btnSaveModal.textContent = 'Guardando...';

        try {
            let response;
            if (id) {
                // UPDATE (PATCH)
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
                throw new Error(errorData.message || 'Error al guardar el usuario');
            }

            closeModal();
            fetchUsuarios(); // Recargar tabla
            
        } catch (error) {
            console.error(error);
            alert('Error al guardar usuario: ' + error.message);
        } finally {
            btnSaveModal.disabled = false;
            btnSaveModal.textContent = 'Guardar';
        }
    }

    async function deleteUsuario(id) {
        try {
            const response = await fetch(`${baseUrl}?id=eq.${id}`, {
                method: 'DELETE',
                headers: {
                    ...headers,
                    'Prefer': 'return=minimal'
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Error al eliminar el usuario');
            }

            fetchUsuarios(); // Recargar tabla
            
        } catch (error) {
            console.error(error);
            alert('Error al eliminar usuario: ' + error.message);
        }
    }
});
