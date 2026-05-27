document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('table-body-plan');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');
    
    // Modal elements
    const modal = document.getElementById('plan-modal');
    const btnNuevoPlan = document.getElementById('btn-nuevo-plan');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelModal = document.getElementById('btn-cancel-modal');
    const formPlan = document.getElementById('form-plan');
    const modalTitle = document.getElementById('modal-title');
    
    // CSV elements
    const btnDownloadCsv = document.getElementById('btn-download-csv');
    const btnUploadCsv = document.getElementById('btn-upload-csv');
    const fileCsv = document.getElementById('file-csv');
    
    // Filter elements
    const filterPlan = document.getElementById('filter-plan');
    const filterGrupo = document.getElementById('filter-grupo');
    
    let planes = [];

    // Cargar planes
    const fetchPlanes = async () => {
        showLoading();
        try {
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/plan?order=plan.asc,grupo.asc,cta.asc`, {
                method: 'GET',
                headers: {
                    'apikey': CONFIG.SUPABASE_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) throw new Error('Error al cargar el plan de cuentas');
            
            planes = await response.json();
            populateFilters();
            renderTable();
        } catch (error) {
            showError(error.message);
        }
    };

    // Poblar los selects de filtros
    const populateFilters = () => {
        const uniquePlanes = [...new Set(planes.map(p => p.plan).filter(Boolean))].sort();
        const uniqueGrupos = [...new Set(planes.map(p => p.grupo).filter(Boolean))].sort();

        filterPlan.innerHTML = '<option value="">Todos</option>';
        uniquePlanes.forEach(p => {
            filterPlan.innerHTML += `<option value="${p}">${p}</option>`;
        });

        filterGrupo.innerHTML = '<option value="">Todos</option>';
        uniqueGrupos.forEach(g => {
            filterGrupo.innerHTML += `<option value="${g}">${g}</option>`;
        });
    };

    // Renderizar tabla
    const renderTable = () => {
        tableBody.innerHTML = '';
        hideLoading();
        
        const selectedPlan = filterPlan.value;
        const selectedGrupo = filterGrupo.value;

        const filteredPlanes = planes.filter(p => {
            const matchPlan = selectedPlan === "" || p.plan === selectedPlan;
            const matchGrupo = selectedGrupo === "" || p.grupo === selectedGrupo;
            return matchPlan && matchGrupo;
        });
        
        if (filteredPlanes.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 20px; color: var(--text-secondary);">No hay cuentas registradas que coincidan con los filtros</td></tr>`;
            return;
        }

        filteredPlanes.forEach(plan => {
            const tr = document.createElement('tr');
            
            const badgeClass = plan.activo !== false ? 'badge-active' : 'badge-inactive';
            const badgeText = plan.activo !== false ? 'Activo' : 'Inactivo';
            const toggleBtnClass = plan.activo !== false ? 'inactive' : '';
            const toggleBtnText = plan.activo !== false ? 'Desactivar' : 'Activar';

            tr.innerHTML = `
                <td>${plan.plan || '-'}</td>
                <td style="font-weight: 600;">${plan.cta || '-'}</td>
                <td>${plan.denominacion || '-'}</td>
                <td>${plan.grupo || '-'}</td>
                <td>${plan.subgrupo1 || '-'}</td>
                <td>${plan.subgrupo2 || '-'}</td>
                <td><span class="badge ${badgeClass}">${badgeText}</span></td>
                <td>
                    <button class="btn-action btn-edit" onclick="editPlan(${plan.id})">Editar</button>
                    <button class="btn-action btn-toggle ${toggleBtnClass}" onclick="toggleStatus(${plan.id}, ${plan.activo !== false})">${toggleBtnText}</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    };

    // Guardar (Crear o Actualizar)
    formPlan.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('plan-id').value;
        const isEdit = !!id;
        
        const planData = {
            plan: document.getElementById('plan-codigo').value,
            cta: document.getElementById('plan-cta').value,
            denominacion: document.getElementById('plan-denominacion').value,
            grupo: document.getElementById('plan-grupo').value,
            subgrupo1: document.getElementById('plan-subgrupo1').value,
            subgrupo2: document.getElementById('plan-subgrupo2').value,
            activo: document.getElementById('plan-activo').checked
        };

        const url = isEdit 
            ? `${CONFIG.SUPABASE_URL}/rest/v1/plan?id=eq.${id}`
            : `${CONFIG.SUPABASE_URL}/rest/v1/plan`;
            
        const method = isEdit ? 'PATCH' : 'POST';

        try {
            const response = await fetch(url, {
                method: method,
                headers: {
                    'apikey': CONFIG.SUPABASE_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(isEdit ? planData : [planData])
            });

            if (!response.ok) throw new Error('Error al guardar la cuenta');

            closeModal();
            fetchPlanes();
        } catch (error) {
            alert(error.message);
        }
    });

    // Función global para editar
    window.editPlan = (id) => {
        const plan = planes.find(p => p.id === id);
        if (!plan) return;

        document.getElementById('plan-id').value = plan.id;
        document.getElementById('plan-codigo').value = plan.plan || '';
        document.getElementById('plan-cta').value = plan.cta || '';
        document.getElementById('plan-denominacion').value = plan.denominacion || '';
        document.getElementById('plan-grupo').value = plan.grupo || '';
        document.getElementById('plan-subgrupo1').value = plan.subgrupo1 || '';
        document.getElementById('plan-subgrupo2').value = plan.subgrupo2 || '';
        document.getElementById('plan-activo').checked = plan.activo !== false; // Default true

        modalTitle.textContent = 'Editar Cuenta';
        modal.classList.add('active');
    };

    // Función global para desactivar/activar
    window.toggleStatus = async (id, currentStatus) => {
        const newStatus = !currentStatus;
        const confirmMsg = newStatus ? '¿Estás seguro de reactivar esta cuenta?' : '¿Estás seguro de desactivar esta cuenta? No aparecerá en los reportes.';
        
        if (!confirm(confirmMsg)) return;

        try {
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/plan?id=eq.${id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': CONFIG.SUPABASE_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ activo: newStatus })
            });

            if (!response.ok) throw new Error('Error al cambiar el estado');

            fetchPlanes();
        } catch (error) {
            alert(error.message);
        }
    };

    // Funciones del Modal
    const openModalNew = () => {
        formPlan.reset();
        document.getElementById('plan-id').value = '';
        document.getElementById('plan-activo').checked = true;
        modalTitle.textContent = 'Nueva Cuenta';
        modal.classList.add('active');
    };

    const closeModal = () => {
        modal.classList.remove('active');
    };

    btnNuevoPlan.addEventListener('click', openModalNew);
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

    // Listeners para filtros
    if(filterPlan) filterPlan.addEventListener('change', renderTable);
    if(filterGrupo) filterGrupo.addEventListener('change', renderTable);

    // --- LÓGICA CSV ---

    // Descargar plantilla
    if (btnDownloadCsv) {
        btnDownloadCsv.addEventListener('click', () => {
            const csvContent = "plan,cta,denominacion,grupo,subgrupo1,subgrupo2,activo\nPC01,111000,Caja General,1-ACTIVO,CIRCULANTE,CAJA Y BANCOS,true";
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", "plantilla_plan.csv");
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    // Parseador básico de CSV
    const parseCSV = (str) => {
        const arr = [];
        let quote = false;
        for (let row = 0, col = 0, c = 0; c < str.length; c++) {
            let cc = str[c], nc = str[c+1];
            arr[row] = arr[row] || [];
            arr[row][col] = arr[row][col] || '';
            if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; continue; }
            if (cc == '"') { quote = !quote; continue; }
            if (cc == ',' && !quote) { ++col; continue; }
            if (cc == '\\r' && nc == '\\n' && !quote) { ++row; col = 0; ++c; continue; }
            if (cc == '\\n' && !quote) { ++row; col = 0; continue; }
            if (cc == '\\r' && !quote) { ++row; col = 0; continue; }
            arr[row][col] += cc;
        }
        return arr;
    };

    // Subir CSV
    if (btnUploadCsv && fileCsv) {
        btnUploadCsv.addEventListener('click', () => {
            fileCsv.click();
        });

        fileCsv.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                const text = event.target.result;
                const data = parseCSV(text);
                if (data.length < 2) {
                    alert('El archivo CSV parece estar vacío o no tiene el formato correcto.');
                    return;
                }

                // Validar cabeceras
                const headers = data[0].map(h => h.trim().toLowerCase());
                const expectedHeaders = ['plan', 'cta', 'denominacion', 'grupo', 'subgrupo1', 'subgrupo2', 'activo'];
                
                let valid = true;
                expectedHeaders.forEach(h => {
                    if (!headers.includes(h)) valid = false;
                });

                if (!valid) {
                    alert('Las columnas del CSV no coinciden con la plantilla esperada.');
                    return;
                }

                showLoading();

                const toInsert = [];
                const toUpdate = [];

                for (let i = 1; i < data.length; i++) {
                    const row = data[i];
                    if (row.length < 7 || !row[0] || !row[1]) continue; // saltar filas vacias o incompletas

                    const planVal = row[headers.indexOf('plan')].trim();
                    const ctaVal = row[headers.indexOf('cta')].trim();
                    const denomVal = row[headers.indexOf('denominacion')].trim();
                    const grupoVal = row[headers.indexOf('grupo')].trim();
                    const subg1Val = row[headers.indexOf('subgrupo1')].trim();
                    const subg2Val = row[headers.indexOf('subgrupo2')].trim();
                    let activoVal = row[headers.indexOf('activo')].trim().toLowerCase();
                    activoVal = activoVal === 'true' || activoVal === '1' || activoVal === 'si' || activoVal === 'sí';

                    const record = {
                        plan: planVal,
                        cta: ctaVal,
                        denominacion: denomVal,
                        grupo: grupoVal,
                        subgrupo1: subg1Val,
                        subgrupo2: subg2Val,
                        activo: activoVal
                    };

                    // Buscar si existe para hacer UPSERT manual
                    const existing = planes.find(p => p.plan === planVal && p.cta === ctaVal);

                    if (existing) {
                        toUpdate.push({ id: existing.id, ...record });
                    } else {
                        toInsert.push(record);
                    }
                }

                try {
                    // 1. Insertar nuevos
                    if (toInsert.length > 0) {
                        const resInsert = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/plan`, {
                            method: 'POST',
                            headers: {
                                'apikey': CONFIG.SUPABASE_KEY,
                                'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                                'Content-Type': 'application/json',
                                'Prefer': 'return=minimal'
                            },
                            body: JSON.stringify(toInsert)
                        });
                        if (!resInsert.ok) throw new Error('Error al insertar nuevas cuentas');
                    }

                    // 2. Actualizar existentes (peticiones individuales)
                    if (toUpdate.length > 0) {
                        const updatePromises = toUpdate.map(async (record) => {
                            const { id, ...dataToUpdate } = record;
                            return fetch(`${CONFIG.SUPABASE_URL}/rest/v1/plan?id=eq.${id}`, {
                                method: 'PATCH',
                                headers: {
                                    'apikey': CONFIG.SUPABASE_KEY,
                                    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                                    'Content-Type': 'application/json',
                                    'Prefer': 'return=minimal'
                                },
                                body: JSON.stringify(dataToUpdate)
                            });
                        });
                        await Promise.all(updatePromises);
                    }

                    alert(`Proceso completado.\\nInsertados: ${toInsert.length}\\nActualizados: ${toUpdate.length}`);
                } catch (err) {
                    alert('Ocurrió un error al procesar el CSV: ' + err.message);
                } finally {
                    fileCsv.value = ''; // limpiar input
                    fetchPlanes(); // recargar
                }
            };
            reader.readAsText(file);
        });
    }

    // Inicializar
    fetchPlanes();
});
