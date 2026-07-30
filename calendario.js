// Configuración y variables de estado del calendario
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let allEvents = []; // Todos los eventos cargados
let filteredEvents = []; // Eventos filtrados localmente
let companies = []; // Lista de todas las empresas
let allowedCompaniesList = null; // Lista de empresas permitidas para el usuario (null = todas/admin)

const MONTHS_ES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

// Iniciar aplicación al cargar el DOM
document.addEventListener("DOMContentLoaded", async () => {
    // Verificar sesión y cargar datos del menú (el script menu.js ya hace la protección de sesión)
    const loggedUser = sessionStorage.getItem('loggedUser') || localStorage.getItem('loggedUser');
    if (!loggedUser) {
        window.location.href = 'login.html';
        return;
    }

    // Inicializar elementos del UI
    initUI();
    
    // Cargar empresas y eventos
    await loadInitialData();

    // Renderizar
    renderCalendar();
});

// Inicializar controles del calendario y eventos
function initUI() {
    // 1. Llenar los selectores de mes y año
    const selectMonth = document.getElementById("select-month");
    const selectYear = document.getElementById("select-year");

    MONTHS_ES.forEach((name, idx) => {
        const opt = document.createElement("option");
        opt.value = idx;
        opt.textContent = name;
        if (idx === currentMonth) opt.selected = true;
        selectMonth.appendChild(opt);
    });

    const startYear = currentYear - 5;
    const endYear = currentYear + 5;
    for (let y = startYear; y <= endYear; y++) {
        const opt = document.createElement("option");
        opt.value = y;
        opt.textContent = y;
        if (y === currentYear) opt.selected = true;
        selectYear.appendChild(opt);
    }

    // Escuchar cambios en los selectores
    selectMonth.addEventListener("change", (e) => {
        currentMonth = parseInt(e.target.value);
        renderCalendar();
    });

    selectYear.addEventListener("change", (e) => {
        currentYear = parseInt(e.target.value);
        renderCalendar();
    });

    // Escuchar botones de navegación del mes
    document.getElementById("btn-prev-month").addEventListener("click", () => {
        if (currentMonth === 0) {
            currentMonth = 11;
            currentYear--;
        } else {
            currentMonth--;
        }
        updateSelectors();
        renderCalendar();
    });

    document.getElementById("btn-next-month").addEventListener("click", () => {
        if (currentMonth === 11) {
            currentMonth = 0;
            currentYear++;
        } else {
            currentMonth++;
        }
        updateSelectors();
        renderCalendar();
    });

    // Escuchar filtros locales
    document.getElementById("search-activity").addEventListener("input", filterEventsLocally);
    document.getElementById("filter-company").addEventListener("change", filterEventsLocally);

    // Escuchar cierre de modal
    document.getElementById("btn-close-modal").addEventListener("click", closeModal);
    document.getElementById("day-detail-modal").addEventListener("click", (e) => {
        if (e.target.id === "day-detail-modal") closeModal();
    });

    // Configuración del botón + Nueva Actividad para administradores
    const loggedUser = sessionStorage.getItem('loggedUser') || localStorage.getItem('loggedUser');
    const userObj = loggedUser ? JSON.parse(loggedUser) : null;
    const isAdmin = userObj && userObj.rol === 'admin';
    const btnNueva = document.getElementById("btn-nueva-actividad");
    if (btnNueva) {
        btnNueva.style.display = isAdmin ? "block" : "none";
        btnNueva.addEventListener("click", window.openNuevaActividadModal);
    }

    // Escuchar cierre de modal de actividad
    const btnCloseActividadModal = document.getElementById("btn-close-actividad-modal");
    const btnCancelActividadModal = document.getElementById("btn-cancel-actividad-modal");
    if (btnCloseActividadModal) btnCloseActividadModal.addEventListener("click", closeActividadModal);
    if (btnCancelActividadModal) btnCancelActividadModal.addEventListener("click", closeActividadModal);
    
    const activityModal = document.getElementById("actividad-form-modal");
    if (activityModal) {
        activityModal.addEventListener("click", (e) => {
            if (e.target.id === "actividad-form-modal") closeActividadModal();
        });
    }

    const formActividad = document.getElementById("form-actividad");
    if (formActividad) {
        formActividad.addEventListener("submit", async (e) => {
            e.preventDefault();
            await window.saveActividad();
        });
    }
}

// Sincronizar los dropdowns con las variables de estado
function updateSelectors() {
    document.getElementById("select-month").value = currentMonth;
    document.getElementById("select-year").value = currentYear;
}

// Cargar empresas y eventos de Supabase
async function loadInitialData() {
    const loadingEl = document.getElementById("loading");
    const errorEl = document.getElementById("error-message");
    
    loadingEl.style.display = "block";
    errorEl.classList.add("hidden");

    try {
        const headers = {
            'apikey': CONFIG.SUPABASE_KEY,
            'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
        };

        // 1. Obtener empresas permitidas
        allowedCompaniesList = await window.getAllowedCompanies();

        // 2. Obtener todas las empresas desde la base de datos
        const resEmpresas = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/empresas?order=nombre.asc`, { headers });
        if (!resEmpresas.ok) throw new Error("No se pudo cargar la lista de empresas.");
        companies = await resEmpresas.json();

        // Llenar selector de empresas para filtros
        const filterCompanySelect = document.getElementById("filter-company");
        companies.forEach(company => {
            // Si el usuario no es admin, solo mostrar empresas permitidas
            if (allowedCompaniesList === null || allowedCompaniesList.includes(company.nombre)) {
                const opt = document.createElement("option");
                opt.value = company.id;
                opt.textContent = company.nombre;
                filterCompanySelect.appendChild(opt);
            }
        });

        // 3. Obtener eventos (calendario)
        // Usamos embedding para traer detalles de la empresa y la bitácora de una sola vez
        const resEvents = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/calendario?select=id,fecha,description,delivered,modified,hora,empresas(id,nombre,categoria),detalle_actividad(id,description,created_at)&order=fecha.asc`, { headers });
        if (!resEvents.ok) throw new Error("No se pudieron cargar las actividades del calendario.");
        const rawEvents = await resEvents.json();

        // APLICAR CRUD LOCAL:
        
        // A. Cargar creados locales
        const localCreated = JSON.parse(localStorage.getItem('local_created_events') || "[]");
        let combinedEvents = [...rawEvents, ...localCreated];
        
        // B. Filtrar eliminados locales
        const localDeletedIds = JSON.parse(localStorage.getItem('local_deleted_ids') || "[]");
        combinedEvents = combinedEvents.filter(event => {
            return !localDeletedIds.includes(String(event.id)) && !localDeletedIds.includes(Number(event.id));
        });
        
        // C. Aplicar modificaciones locales (tanto modified flag como todas las propiedades editadas)
        const localModified = JSON.parse(localStorage.getItem('local_modified_events') || "{}");
        combinedEvents.forEach(event => {
            if (localModified[event.id]) {
                const mod = localModified[event.id];
                event.description = mod.description !== undefined ? mod.description : event.description;
                event.hora = mod.hora !== undefined ? mod.hora : event.hora;
                event.fecha = mod.fecha !== undefined ? mod.fecha : event.fecha;
                event.delivered = mod.delivered !== undefined ? mod.delivered : event.delivered;
                event.modified = mod.modified !== undefined ? mod.modified : event.modified;
                if (mod.empresa_id) {
                    const comp = companies.find(c => String(c.id) === String(mod.empresa_id));
                    if (comp) {
                        event.empresas = { id: comp.id, nombre: comp.nombre, categoria: comp.categoria };
                    }
                }
            }
        });
        
        // También aplicar el flag local de 'local_modified_ids' por compatibilidad anterior
        const localModifiedIds = JSON.parse(localStorage.getItem('local_modified_ids') || "[]");
        combinedEvents.forEach(event => {
            if (localModifiedIds.includes(String(event.id)) || localModifiedIds.includes(Number(event.id))) {
                event.modified = true;
            }
        });

        // Aplicar el flag local de 'local_delivered_ids' para actividades marcadas como entregadas desde el detalle
        const localDeliveredIds = JSON.parse(localStorage.getItem('local_delivered_ids') || "[]");
        combinedEvents.forEach(event => {
            if (localDeliveredIds.includes(String(event.id)) || localDeliveredIds.includes(Number(event.id))) {
                event.delivered = true;
            }
        });

        // Filtrar por permisos del usuario
        allEvents = combinedEvents.filter(event => {
            const companyName = event.empresas ? event.empresas.nombre : null;
            if (!companyName) return true; // Actividades generales
            return allowedCompaniesList === null || allowedCompaniesList.includes(companyName);
        });

        // FALLBACK: si no hay eventos en Supabase y no hay locales creados, cargar mock events para demo
        if (allEvents.length === 0) {
            console.log("Supabase 'calendario' table is empty. Loading premium mock events...");
            allEvents = generateMockEvents();
            showDemoNotice();
        }

        filteredEvents = [...allEvents];

    } catch (err) {
        console.error(err);
        errorEl.textContent = "Error al conectar con la base de datos: " + err.message;
        errorEl.classList.remove("hidden");
    } finally {
        loadingEl.style.display = "none";
    }
}

// Genera eventos ficticios premium para demostrar el funcionamiento
function generateMockEvents() {
    const today = new Date();
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const dToday = formatDate(today);
    
    const dMinus3 = new Date(today);
    dMinus3.setDate(today.getDate() - 3);
    const dateMinus3 = formatDate(dMinus3);

    const dMinus4 = new Date(today);
    dMinus4.setDate(today.getDate() - 4);
    const dateMinus4 = formatDate(dMinus4);

    const dPlus2 = new Date(today);
    dPlus2.setDate(today.getDate() + 2);
    const datePlus2 = formatDate(dPlus2);

    const dPlus3 = new Date(today);
    dPlus3.setDate(today.getDate() + 3);
    const datePlus3 = formatDate(dPlus3);

    const dPlus4 = new Date(today);
    dPlus4.setDate(today.getDate() + 4);
    const datePlus4 = formatDate(dPlus4);

    const dPlus7 = new Date(today);
    dPlus7.setDate(today.getDate() + 7);
    const datePlus7 = formatDate(dPlus7);

    let mockList = [
        {
            id: 101,
            fecha: dateMinus3,
            description: "Auditoría de Conciliaciones Bancarias y Anexos de Caja",
            delivered: true,
            modified: false,
            hora: "09:00",
            empresas: { id: 2, nombre: "AUTO PARTES LARA", categoria: "APL" },
            detalle_actividad: [
                { id: 1011, calendario_id: 101, description: "Entrega inicial de reportes bancarios", created_at: dateMinus4 + "T08:00:00Z" }
            ]
        },
        {
            id: 102,
            fecha: dToday,
            description: "Presentación de Resultados de GyP Acumulado del Mes",
            delivered: false,
            modified: true,
            hora: "10:30",
            empresas: { id: 3, nombre: "BELTRAC (MUNDO BEL)", categoria: "Otras Empresas" },
            detalle_actividad: []
        },
        {
            id: 103,
            fecha: dToday,
            description: "Comité de Presupuestos y Flujo de Caja Estimado",
            delivered: true,
            modified: false,
            hora: "14:00",
            empresas: { id: 4, nombre: "ALIMENTOS CAMPO LINDO", categoria: "Otras Empresas" },
            detalle_actividad: [
                { id: 1031, calendario_id: 103, description: "Entregado en junta matutina", created_at: dToday + "T10:00:00Z" }
            ]
        },
        {
            id: 104,
            fecha: datePlus2,
            description: "Revisión de Inventarios Físicos y Costos de Venta",
            delivered: false,
            modified: false,
            hora: "11:00",
            empresas: { id: 8, nombre: "HORMIGONES", categoria: "Otras Empresas" },
            detalle_actividad: []
        },
        {
            id: 105,
            fecha: datePlus2,
            description: "Plan de Inversiones de Flujo de Caja Operativo",
            delivered: true,
            modified: true,
            hora: "15:30",
            empresas: { id: 9, nombre: "HOTEL", categoria: "Otras Empresas" },
            detalle_actividad: [
                { id: 1051, calendario_id: 105, description: "Entrega tardía del plan de inversiones", created_at: datePlus3 + "T09:00:00Z" }
            ]
        },
        {
            id: 106,
            fecha: datePlus7,
            description: "Presentación Semestral de Balance General e Indicadores",
            delivered: false,
            modified: false,
            hora: "08:30",
            empresas: { id: 10, nombre: "INMOBILIARIA Y CONDOMINIO", categoria: "Otras Empresas" },
            detalle_actividad: []
        }
    ];

    // Caso de prueba crucial: Un día en el que TODAS las empresas tienen una actividad (datePlus4)
    companies.forEach((company, index) => {
        // Distribuir horas secuencialmente para que se vea premium y ordenado
        const hour = 8 + Math.floor(index / 2);
        const minutes = (index % 2 === 0) ? "00" : "30";
        const timeStr = `${String(hour).padStart(2, '0')}:${minutes}`;
        
        mockList.push({
            id: 1000 + index,
            fecha: datePlus4,
            description: `Presentación Anual de Plan Financiero y Estrategia - ${company.nombre}`,
            delivered: index % 3 === 0,
            modified: index % 4 === 0,
            hora: timeStr,
            empresas: { id: company.id, nombre: company.nombre, categoria: company.categoria },
            detalle_actividad: []
        });
    });

    // Aplicar eliminados locales a los eventos simulados
    const localDeletedIds = JSON.parse(localStorage.getItem('local_deleted_ids') || "[]");
    let filteredMock = mockList.filter(event => {
        return !localDeletedIds.includes(String(event.id)) && !localDeletedIds.includes(Number(event.id));
    });
    
    // Aplicar modificaciones locales a los eventos simulados
    const localModified = JSON.parse(localStorage.getItem('local_modified_events') || "{}");
    filteredMock.forEach(event => {
        if (localModified[event.id]) {
            const mod = localModified[event.id];
            event.description = mod.description !== undefined ? mod.description : event.description;
            event.hora = mod.hora !== undefined ? mod.hora : event.hora;
            event.fecha = mod.fecha !== undefined ? mod.fecha : event.fecha;
            event.delivered = mod.delivered !== undefined ? mod.delivered : event.delivered;
            event.modified = mod.modified !== undefined ? mod.modified : event.modified;
            if (mod.empresa_id) {
                const comp = companies.find(c => String(c.id) === String(mod.empresa_id));
                if (comp) {
                    event.empresas = { id: comp.id, nombre: comp.nombre, categoria: comp.categoria };
                }
            }
        }
    });

    const localModifiedIds = JSON.parse(localStorage.getItem('local_modified_ids') || "[]");
    filteredMock.forEach(event => {
        if (localModifiedIds.includes(String(event.id)) || localModifiedIds.includes(Number(event.id))) {
            event.modified = true;
        }
    });

    const localDeliveredIds = JSON.parse(localStorage.getItem('local_delivered_ids') || "[]");
    filteredMock.forEach(event => {
        if (localDeliveredIds.includes(String(event.id)) || localDeliveredIds.includes(Number(event.id))) {
            event.delivered = true;
        }
    });

    // Filtrar mockList por permisos del usuario
    return filteredMock.filter(event => {
        const companyName = event.empresas ? event.empresas.nombre : null;
        if (!companyName) return true;
        return allowedCompaniesList === null || allowedCompaniesList.includes(companyName);
    });
}

// Muestra una notificación sobre el modo demostración en la parte superior
function showDemoNotice() {
    if (document.getElementById("demo-notice")) return;

    const mainContent = document.querySelector(".main-content");
    const notice = document.createElement("div");
    notice.id = "demo-notice";
    notice.className = "alert alert-warning alert-dismissible fade show d-flex align-items-center justify-content-between mb-4 shadow-sm border-0 border-start border-warning border-4";
    notice.setAttribute("role", "alert");
    notice.style.backgroundColor = "var(--surface-color)";
    notice.style.color = "var(--text-primary)";
    notice.style.borderLeftWidth = "4px";
    notice.style.borderLeftStyle = "solid";
    notice.style.borderLeftColor = "var(--accent-color)";
    
    notice.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <svg style="width: 24px; height: 24px; color: var(--accent-color); flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div>
                <strong>Modo Demostración:</strong> La tabla <code>calendario</code> en Supabase está vacía. Se han generado actividades de prueba, incluyendo un día con actividades para todas las empresas.
            </div>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close" style="position: relative; top: 0; right: 0; padding: 0.5rem;"></button>
    `;

    const topBar = document.querySelector(".top-bar");
    if (topBar && topBar.nextSibling) {
        mainContent.insertBefore(notice, topBar.nextSibling);
    } else {
        mainContent.prepend(notice);
    }
}

// Filtrar eventos localmente según búsqueda de texto y empresa elegida
function filterEventsLocally() {
    const searchText = document.getElementById("search-activity").value.toLowerCase().trim();
    const filterCompanyId = document.getElementById("filter-company").value;

    filteredEvents = allEvents.filter(event => {
        // Filtro de empresa
        if (filterCompanyId) {
            const companyId = event.empresas ? event.empresas.id : null;
            if (String(companyId) !== String(filterCompanyId)) {
                return false;
            }
        }

        // Filtro de texto (búsqueda en la descripción o en el nombre de la empresa)
        if (searchText) {
            const description = (event.description || "").toLowerCase();
            const companyName = event.empresas ? (event.empresas.nombre || "").toLowerCase() : "";
            if (!description.includes(searchText) && !companyName.includes(searchText)) {
                return false;
            }
        }

        return true;
    });

    renderCalendar();
}

// Generador de colores pastel estables para las empresas
function getCompanyColor(companyName) {
    if (!companyName) {
        // Estilo general neutro
        return {
            bg: "rgba(107, 114, 128, 0.1)",
            text: "var(--text-secondary)",
            border: "rgba(107, 114, 128, 0.2)"
        };
    }

    let hash = 0;
    for (let i = 0; i < companyName.length; i++) {
        hash = companyName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    
    // Detectar si el tema actual es oscuro
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.getAttribute('data-theme') === 'black';
    const s = 65; // saturación estable
    
    // Lightness adaptada a temas oscuros/claros para asegurar legibilidad
    const l = isDark ? 20 : 92;
    const textL = isDark ? 90 : 25;
    const borderL = isDark ? 35 : 75;

    return {
        bg: `hsl(${h}, ${s}%, ${l}%)`,
        text: `hsl(${h}, ${s}%, ${textL}%)`,
        border: `hsl(${h}, ${s}%, ${borderL}%)`
    };
}

// Dibujar y renderizar la cuadrícula del calendario
function renderCalendar() {
    const gridBody = document.getElementById("calendar-grid-body");
    gridBody.innerHTML = "";

    // Actualizar el subtítulo del mes
    document.getElementById("calendar-subtitle").textContent = `${MONTHS_ES[currentMonth]} ${currentYear}`;

    // Primer día del mes (0 = Lunes, 6 = Domingo)
    let firstDayIndex = (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7;
    
    // Días totales del mes actual
    let totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

    // Días totales del mes anterior
    let prevMonthTotalDays = new Date(currentYear, currentMonth, 0).getDate();

    // 1. Renderizar casillas del mes anterior (relleno)
    for (let i = firstDayIndex - 1; i >= 0; i--) {
        const prevDayNum = prevMonthTotalDays - i;
        const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        
        const cell = createDayCell(prevDayNum, prevMonth, prevYear, true);
        gridBody.appendChild(cell);
    }

    // 2. Renderizar casillas del mes actual
    for (let day = 1; day <= totalDays; day++) {
        const cell = createDayCell(day, currentMonth, currentYear, false);
        gridBody.appendChild(cell);
    }

    // 3. Renderizar casillas del mes siguiente (relleno para completar múltiplos de 7)
    const totalCellsSoFar = firstDayIndex + totalDays;
    const remainingCells = (7 - (totalCellsSoFar % 7)) % 7;
    
    for (let i = 1; i <= remainingCells; i++) {
        const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
        const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
        
        const cell = createDayCell(i, nextMonth, nextYear, true);
        gridBody.appendChild(cell);
    }
}

// Crear el elemento HTML de la casilla de un día
function createDayCell(dayNum, month, year, isOtherMonth) {
    const cell = document.createElement("div");
    cell.className = "calendar-day-cell";
    if (isOtherMonth) cell.classList.add("other-month");

    // Formatear fecha para búsqueda de eventos (formato local sin problemas de zona horaria)
    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(dayNum).padStart(2, '0');
    const dateKey = `${year}-${monthStr}-${dayStr}`;

    // Obtener fecha de hoy
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    if (dateKey === todayKey && !isOtherMonth) {
        cell.classList.add("today");
    }

    // Encabezado de la celda (número del día e indicador de eventos)
    const dayHeader = document.createElement("div");
    dayHeader.className = "day-header";
    
    const numSpan = document.createElement("span");
    numSpan.className = "day-num";
    numSpan.textContent = dayNum;
    dayHeader.appendChild(numSpan);

    const indicator = document.createElement("span");
    indicator.className = "day-indicator";
    dayHeader.appendChild(indicator);

    cell.appendChild(dayHeader);

    // Obtener eventos para este día
    const dayEvents = filteredEvents.filter(e => e.fecha === dateKey);

    if (dayEvents.length > 0) {
        cell.classList.add("has-events");
        
        const eventsList = document.createElement("div");
        eventsList.className = "day-events-list";

        dayEvents.forEach(event => {
            const pill = document.createElement("div");
            pill.className = "day-event-pill";
            
            const companyName = event.empresas ? event.empresas.nombre : "General";
            const colors = getCompanyColor(companyName);
            
            pill.style.backgroundColor = colors.bg;
            pill.style.color = colors.text;
            pill.style.border = `1px solid ${colors.border}`;
            
            // Texto en formato: "HH:MM [Empresa]: Descripcion"
            const timePrefix = event.hora ? `${event.hora} ` : '';
            const cleanCompanyName = companyName.replace(/^(AGROPECUARIA|INVERSIONES|CONCESIONARIA|CORPORACIÓN)\s+/i, '');
            
            // Obtener color del semáforo
            const semaforoColor = getSemaforoColor(event);
            let semaforoDotHtml = '';
            if (semaforoColor === 'white') {
                semaforoDotHtml = `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: #ffffff; border: 1px solid #ccc; margin-right: 5px; flex-shrink: 0;" title="Sin entrega"></span>`;
            } else if (semaforoColor === 'green') {
                semaforoDotHtml = `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: #10b981; margin-right: 5px; flex-shrink: 0;" title="Entregado a tiempo"></span>`;
            } else if (semaforoColor === 'yellow') {
                semaforoDotHtml = `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: #f59e0b; margin-right: 5px; flex-shrink: 0;" title="Entrega pendiente hoy"></span>`;
            } else if (semaforoColor === 'red') {
                semaforoDotHtml = `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: #ef4444; margin-right: 5px; flex-shrink: 0;" title="Entrega tardía / Vencida"></span>`;
            }
            
            pill.style.display = "flex";
            pill.style.alignItems = "center";
            pill.innerHTML = `${semaforoDotHtml}<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-grow: 1;">${timePrefix}${cleanCompanyName}: ${event.description}</span>`;
            pill.title = `${timePrefix}${companyName}: ${event.description}`;
            
            eventsList.appendChild(pill);
        });

        cell.appendChild(eventsList);
    }

    // Clic en la casilla abre el modal de detalle
    cell.addEventListener("click", () => {
        openDayDetail(dateKey, dayNum, month, year, dayEvents);
    });

    return cell;
}

// Abrir el modal con las actividades de un día seleccionado
function openDayDetail(dateKey, dayNum, month, year, dayEvents) {
    const modal = document.getElementById("day-detail-modal");
    const titleEl = document.getElementById("modal-date-title");
    const containerEl = document.getElementById("modal-events-container");

    const loggedUser = sessionStorage.getItem('loggedUser') || localStorage.getItem('loggedUser');
    const userObj = loggedUser ? JSON.parse(loggedUser) : null;
    const isAdmin = userObj && userObj.rol === 'admin';

    // Formatear título del día de forma amigable (Ej: Jueves, 30 de Julio de 2026)
    const dateObj = new Date(year, month, dayNum);
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStrFormatted = dateObj.toLocaleDateString('es-ES', options);
    
    // Capitalizar la primera letra del día de la semana
    titleEl.textContent = dateStrFormatted.charAt(0).toUpperCase() + dateStrFormatted.slice(1);
    
    containerEl.innerHTML = "";

    if (dayEvents.length === 0) {
        containerEl.innerHTML = `<div class="no-events-message">No hay actividades programadas para este día.</div>`;
    } else {
        // Ordenar eventos por hora para visualizarlos de forma secuencial
        const sortedEvents = [...dayEvents].sort((a, b) => {
            if (!a.hora) return 1;
            if (!b.hora) return -1;
            return a.hora.localeCompare(b.hora);
        });

        sortedEvents.forEach(event => {
            const item = document.createElement("div");
            item.className = "modal-event-item";

            const companyName = event.empresas ? event.empresas.nombre : "Actividad General";
            const colors = getCompanyColor(companyName);

            item.innerHTML = `
                <div class="event-meta">
                    <span class="company-badge-large" style="background-color: ${colors.bg}; color: ${colors.text}; border: 1.5px solid ${colors.border};">
                        ${companyName}
                    </span>
                    <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 500;">
                        ${event.empresas && event.empresas.categoria ? event.empresas.categoria : ''}
                    </span>
                </div>
                <div class="event-desc">
                    ${event.description || 'Sin descripción'}
                </div>
                <div class="event-details-row" style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; font-size: 0.8rem; align-items: center; justify-content: space-between; width: 100%;">
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                        <!-- Hora badge -->
                        <span style="display: flex; align-items: center; gap: 4px; background: var(--bg-color); padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-color); color: var(--text-primary); font-weight: 600;">
                            <svg style="width: 13px; height: 13px; opacity: 0.7; fill: none; stroke: currentColor; stroke-width: 2;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            ${event.hora || 'Sin hora'}
                        </span>
                        <!-- Semáforo badge -->
                        ${renderSemaforoBadge(event)}
                        <!-- Delivered badge -->
                        ${renderDeliveredBadge(event.delivered)}
                        <!-- Modified badge -->
                        ${renderModifiedBadge(event.modified)}
                    </div>
                    
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <!-- Botón para ver detalles de la actividad -->
                        <button class="btn btn-sm btn-outline-primary" style="font-size: 0.75rem; font-weight: 600; padding: 4px 10px; border-radius: 6px; border-color: var(--primary-color); color: var(--primary-color); background: transparent; transition: all 0.2s;" 
                                onmouseenter="this.style.background='var(--primary-color)'; this.style.color='white';" 
                                onmouseleave="this.style.background='transparent'; this.style.color='var(--primary-color)';"
                                onclick="window.toggleActividadDetalles(${event.id})">
                            Ver Detalles
                        </button>
                        
                        <!-- Botones de administración (solo para rol admin) -->
                        ${isAdmin ? `
                        <button class="btn btn-sm btn-outline-warning" style="font-size: 0.75rem; font-weight: 600; padding: 4px 10px; border-radius: 6px; border-color: var(--accent-color); color: var(--accent-color); background: transparent; transition: all 0.2s;" 
                                onmouseenter="this.style.background='var(--accent-color)'; this.style.color='white';" 
                                onmouseleave="this.style.background='transparent'; this.style.color='var(--accent-color)';"
                                onclick="window.openEditarActividadModal(${event.id})">
                            Modificar
                        </button>
                        <button class="btn btn-sm btn-outline-danger" style="font-size: 0.75rem; font-weight: 600; padding: 4px 10px; border-radius: 6px; border-color: #ef4444; color: #ef4444; background: transparent; transition: all 0.2s;" 
                                onmouseenter="this.style.background='#ef4444'; this.style.color='white';" 
                                onmouseleave="this.style.background='transparent'; this.style.color='#ef4444';"
                                onclick="window.eliminarActividad(${event.id})">
                            Eliminar
                        </button>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Caja desplegable con la bitácora de detalles y formulario de creación -->
                <div class="actividad-detalles-box" id="detalles-box-${event.id}" style="display: none; margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border-color);">
                    <h5 style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Bitácora de Detalles</h5>
                    <div class="detalles-list" id="detalles-list-${event.id}" style="max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; padding-right: 5px;">
                        <!-- Se llena dinámicamente -->
                    </div>
                    <!-- Formulario de creación (solo disponible para rol admin) -->
                    <div id="admin-form-box-${event.id}" style="display: none; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-color);">
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <input type="text" class="input-search" id="input-new-detalle-${event.id}" placeholder="Escribe un nuevo detalle de la actividad..." style="font-size: 0.8rem; padding: 8px 12px;">
                            <div style="display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap;">
                                <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                                    <div style="display: flex; flex-direction: column;">
                                        <span style="font-size: 0.65rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">Fecha y Hora</span>
                                        <input type="datetime-local" class="input-search" id="input-date-time-${event.id}" style="font-size: 0.8rem; padding: 5px 8px; width: 190px;">
                                    </div>
                                    <label style="font-size: 0.8rem; color: var(--text-primary); display: flex; align-items: center; gap: 6px; cursor: pointer; margin-top: 14px; font-weight: 600; user-select: none;">
                                        <input type="checkbox" id="input-checkbox-delivered-${event.id}" style="width: 15px; height: 15px; cursor: pointer; accent-color: var(--primary-color);"> Marcar Entregado
                                    </label>
                                    <label style="font-size: 0.8rem; color: var(--text-primary); display: flex; align-items: center; gap: 6px; cursor: pointer; margin-top: 14px; font-weight: 600; user-select: none;">
                                        <input type="checkbox" id="input-checkbox-modified-${event.id}" style="width: 15px; height: 15px; cursor: pointer; accent-color: var(--primary-color);"> Marcar Modificado
                                    </label>
                                </div>
                                <button onclick="window.saveActividadDetalle(${event.id})" style="font-size: 0.8rem; font-weight: 700; background-color: var(--primary-color); border: 1px solid var(--primary-color); color: white; padding: 8px 16px; border-radius: 8px; cursor: pointer; transition: opacity 0.2s; height: 34px; display: flex; align-items: center; white-space: nowrap;" onmouseenter="this.style.opacity='0.85'" onmouseleave="this.style.opacity='1'">
                                    Registrar Detalle
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            containerEl.appendChild(item);
        });
    }

    modal.classList.add("active");
}

// Cerrar el modal
function closeModal() {
    document.getElementById("day-detail-modal").classList.remove("active");
}

// Helpers para renderizar los badges de entregado y modificado en el modal
function renderDeliveredBadge(delivered) {
    const isTrue = delivered === true || String(delivered).toLowerCase() === 'true';
    if (isTrue) {
        return `<span style="background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.25); padding: 4px 8px; border-radius: 6px; font-weight: 600; display: flex; align-items: center; gap: 4px;">
            <svg style="width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 3;" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            Entregado
        </span>`;
    } else {
        return `<span style="background: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.25); padding: 4px 8px; border-radius: 6px; font-weight: 600; display: flex; align-items: center; gap: 4px;">
            <svg style="width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 3;" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Pendiente
        </span>`;
    }
}

function renderModifiedBadge(modified) {
    const isTrue = modified === true || String(modified).toLowerCase() === 'true';
    if (isTrue) {
        return `<span style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.25); padding: 4px 8px; border-radius: 6px; font-weight: 600; display: flex; align-items: center; gap: 4px;">
            <svg style="width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2.5;" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
            Modificado
        </span>`;
    } else {
        return `<span style="background: rgba(107, 114, 128, 0.1); color: var(--text-secondary); border: 1px solid var(--border-color); padding: 4px 8px; border-radius: 6px; font-weight: 600; display: flex; align-items: center; gap: 4px;">
            Original
        </span>`;
    }
}

// Helpers para semáforo (colores de entrega según plazos)
function getSemaforoColor(event) {
    const isDelivered = event.delivered === true || String(event.delivered).toLowerCase() === 'true';
    
    // Formatear fechas para comparación (solo YYYY-MM-DD)
    const todayStr = new Date().toISOString().slice(0, 10);
    const eventDateStr = event.fecha; // YYYY-MM-DD
    
    if (!isDelivered) {
        if (todayStr === eventDateStr) {
            return 'yellow';
        }
        return 'white';
    } else {
        // Entregado es true
        let deliveryDateStr = localStorage.getItem('delivery_date_' + event.id);
        if (!deliveryDateStr && event.detalle_actividad && event.detalle_actividad.length > 0) {
            const sorted = [...event.detalle_actividad].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            deliveryDateStr = sorted[0].created_at;
        }
        
        if (!deliveryDateStr) {
            // Si está marcado como entregado pero no tiene detalles registrados, asumimos que se entregó a tiempo (Verde)
            return 'green';
        }
        
        // Comparar solo la parte de la fecha (YYYY-MM-DD)
        const delDateOnlyObj = new Date(deliveryDateStr);
        const delDateStr = delDateOnlyObj.toISOString().slice(0, 10);
        
        if (delDateStr < eventDateStr) {
            return 'green';
        } else if (delDateStr === eventDateStr) {
            return 'yellow';
        } else {
            return 'red';
        }
    }
}

function renderSemaforoBadge(event) {
    const color = getSemaforoColor(event);
    let label = "Sin entrega";
    let bg = "rgba(107, 114, 128, 0.05)";
    let border = "1px solid var(--border-color)";
    let text = "var(--text-secondary)";
    let dotBg = "#ffffff";
    let dotBorder = "1px solid #ccc";
    
    if (color === 'green') {
        label = "A tiempo";
        bg = "rgba(16, 185, 129, 0.1)";
        border = "1px solid rgba(16, 185, 129, 0.25)";
        text = "#10b981";
        dotBg = "#10b981";
        dotBorder = "none";
    } else if (color === 'yellow') {
        label = "Vence hoy";
        bg = "rgba(245, 158, 11, 0.1)";
        border = "1px solid rgba(245, 158, 11, 0.25)";
        text = "#f59e0b";
        dotBg = "#f59e0b";
        dotBorder = "none";
    } else if (color === 'red') {
        label = "Vencido / Tardío";
        bg = "rgba(239, 68, 68, 0.1)";
        border = "1px solid rgba(239, 68, 68, 0.25)";
        text = "#ef4444";
        dotBg = "#ef4444";
        dotBorder = "none";
    }
    
    return `<span style="background: ${bg}; color: ${text}; border: ${border}; padding: 4px 8px; border-radius: 6px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${dotBg}; border: ${dotBorder};"></span>
        ${label}
    </span>`;
}

// Funciones globales para control de detalles (bitácora de actividades)
window.toggleActividadDetalles = async function(eventId) {
    const box = document.getElementById(`detalles-box-${eventId}`);
    if (!box) return;
    
    if (box.style.display === "none" || box.style.display === "") {
        box.style.display = "block";
        await window.loadActividadDetalles(eventId);
        
        // Inicializar fecha y hora actual en el input datetime-local
        const dateTimeEl = document.getElementById(`input-date-time-${eventId}`);
        if (dateTimeEl && !dateTimeEl.value) {
            const now = new Date();
            const tzoffset = now.getTimezoneOffset() * 60000;
            const localISOTime = (new Date(now - tzoffset)).toISOString().slice(0, 16);
            dateTimeEl.value = localISOTime;
        }
    } else {
        box.style.display = "none";
    }
};

window.loadActividadDetalles = async function(eventId) {
    const listEl = document.getElementById(`detalles-list-${eventId}`);
    if (!listEl) return;
    
    listEl.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-secondary); font-style: italic; padding: 5px 0;">Cargando bitácora de detalles...</div>`;
    
    // Validar si el usuario tiene rol de administrador
    const loggedUser = sessionStorage.getItem('loggedUser') || localStorage.getItem('loggedUser');
    const userObj = loggedUser ? JSON.parse(loggedUser) : null;
    const isAdmin = userObj && userObj.rol === 'admin';
    const formBox = document.getElementById(`admin-form-box-${eventId}`);
    if (formBox) {
        formBox.style.display = isAdmin ? "block" : "none";
    }
    
    let dbDetails = [];
    try {
        const headers = {
            'apikey': CONFIG.SUPABASE_KEY,
            'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
        };
        const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/detalle_actividad?calendario_id=eq.${eventId}&order=created_at.asc`, { headers });
        if (response.ok) {
            dbDetails = await response.json();
        }
    } catch (err) {
        console.error("Error al consultar detalle_actividad de Supabase:", err);
    }
    
    // Obtener detalles locales persistidos por localStorage (para desarrollo o fallback RLS)
    const localDetails = JSON.parse(localStorage.getItem(`local_details_${eventId}`) || "[]");
    
    // Inyectar datos de demostración si es una de nuestras actividades demo iniciales y está vacío
    if (dbDetails.length === 0 && localDetails.length === 0) {
        const mockEvent = allEvents.find(e => String(e.id) === String(eventId));
        if (mockEvent && mockEvent.detalle_actividad && mockEvent.detalle_actividad.length > 0) {
            dbDetails = [...mockEvent.detalle_actividad];
        }
    }
    
    // Combinar detalles
    const allDetails = [...dbDetails, ...localDetails];
    
    // Ordenar cronológicamente por fecha de creación
    allDetails.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    listEl.innerHTML = "";
    if (allDetails.length === 0) {
        listEl.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-secondary); font-style: italic; padding: 5px 0;">No hay detalles registrados para esta actividad.</div>`;
        return;
    }
    
    allDetails.forEach(d => {
        const detailItem = document.createElement("div");
        detailItem.style.padding = "8px 10px";
        detailItem.style.marginBottom = "6px";
        detailItem.style.borderRadius = "8px";
        detailItem.style.backgroundColor = "var(--bg-color)";
        detailItem.style.border = "1px solid var(--border-color)";
        detailItem.style.fontSize = "0.82rem";
        
        const dateObj = new Date(d.created_at);
        const dateStr = d.created_at ? dateObj.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Demo';
        
        detailItem.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="font-weight: 700; color: var(--text-primary); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.5px;">Registro de Bitácora</span>
                <span style="font-size: 0.7rem; color: var(--text-secondary); font-weight: 500;">${dateStr}</span>
            </div>
            <div style="color: var(--text-primary); line-height: 1.4; word-break: break-word;">${d.description}</div>
        `;
        listEl.appendChild(detailItem);
    });
};

window.saveActividadDetalle = async function(eventId) {
    const inputEl = document.getElementById(`input-new-detalle-${eventId}`);
    const dateTimeEl = document.getElementById(`input-date-time-${eventId}`);
    const checkboxEl = document.getElementById(`input-checkbox-modified-${eventId}`);
    const deliveredCheckboxEl = document.getElementById(`input-checkbox-delivered-${eventId}`);
    if (!inputEl) return;
    
    const text = inputEl.value.trim();
    if (!text) {
        alert("Por favor escribe un detalle para guardar.");
        return;
    }
    
    const customDate = dateTimeEl && dateTimeEl.value ? new Date(dateTimeEl.value).toISOString() : new Date().toISOString();
    const newDetail = {
        calendario_id: eventId,
        description: text,
        created_at: customDate
    };
    
    let savedOnSupabase = false;
    try {
        const headers = {
            'apikey': CONFIG.SUPABASE_KEY,
            'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        };
        const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/detalle_actividad`, {
            method: 'POST',
            headers,
            body: JSON.stringify([newDetail])
        });
        if (response.ok) {
            savedOnSupabase = true;
        } else {
            console.warn("Error RLS o inserción en Supabase, guardando localmente.");
        }
    } catch (err) {
        console.error("Error guardando detalle en Supabase:", err);
    }
    
    if (!savedOnSupabase) {
        // Fallback local en localStorage
        const localDetails = JSON.parse(localStorage.getItem(`local_details_${eventId}`) || "[]");
        newDetail.id = `local_${Date.now()}`;
        newDetail.isLocal = true;
        localDetails.push(newDetail);
        localStorage.setItem(`local_details_${eventId}`, JSON.stringify(localDetails));
        showToastNotice("Guardado en almacenamiento local (RLS de Supabase activo)");
    } else {
        showToastNotice("Detalle de actividad guardado en la base de datos.");
    }
    
    // Obtener evento padre para encontrar su fecha
    const parentEvent = allEvents.find(e => String(e.id) === String(eventId));
    
    // Actualizar marca de modificado si está seleccionada
    const isModifiedChecked = checkboxEl && checkboxEl.checked;
    if (isModifiedChecked) {
        try {
            const headers = {
                'apikey': CONFIG.SUPABASE_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            };
            await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/calendario?id=eq.${eventId}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ modified: true })
            });
        } catch (err) {
            console.error("Error al actualizar modified en Supabase:", err);
        }
        
        // Guardar modificación local
        const localModifiedIds = JSON.parse(localStorage.getItem('local_modified_ids') || "[]");
        if (!localModifiedIds.includes(String(eventId)) && !localModifiedIds.includes(Number(eventId))) {
            localModifiedIds.push(String(eventId));
            localStorage.setItem('local_modified_ids', JSON.stringify(localModifiedIds));
        }
        
        // Actualizar estado local en memoria
        allEvents.forEach(e => {
            if (String(e.id) === String(eventId)) e.modified = true;
        });
        filteredEvents.forEach(e => {
            if (String(e.id) === String(eventId)) e.modified = true;
        });
    }

    // Actualizar marca de entregado si está seleccionada
    const isDeliveredChecked = deliveredCheckboxEl && deliveredCheckboxEl.checked;
    if (isDeliveredChecked) {
        try {
            const headers = {
                'apikey': CONFIG.SUPABASE_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            };
            await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/calendario?id=eq.${eventId}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ delivered: true })
            });
        } catch (err) {
            console.error("Error al actualizar delivered en Supabase:", err);
        }
        
        // Guardar entrega local
        const localDeliveredIds = JSON.parse(localStorage.getItem('local_delivered_ids') || "[]");
        if (!localDeliveredIds.includes(String(eventId)) && !localDeliveredIds.includes(Number(eventId))) {
            localDeliveredIds.push(String(eventId));
            localStorage.setItem('local_delivered_ids', JSON.stringify(localDeliveredIds));
        }
        
        // Actualizar estado local en memoria
        allEvents.forEach(e => {
            if (String(e.id) === String(eventId)) e.delivered = true;
        });
        filteredEvents.forEach(e => {
            if (String(e.id) === String(eventId)) e.delivered = true;
        });
    }

    if (isModifiedChecked || isDeliveredChecked) {
        // Re-renderizar cuadrícula del calendario
        renderCalendar();
    }
    
    inputEl.value = "";
    
    // Refrescar modal del día con los datos actualizados y mantener abierta la bitácora
    if (parentEvent && parentEvent.fecha) {
        const dayEvents = filteredEvents.filter(e => e.fecha === parentEvent.fecha);
        const [y, m, d] = parentEvent.fecha.split('-');
        const dayNum = parseInt(d);
        const monthIndex = parseInt(m) - 1;
        const yearNum = parseInt(y);
        
        // Re-renderizar modal
        openDayDetail(parentEvent.fecha, dayNum, monthIndex, yearNum, dayEvents);
        
        // Volver a abrir automáticamente la bitácora expandida
        await window.toggleActividadDetalles(eventId);
    } else {
        await window.loadActividadDetalles(eventId);
    }
};

function showToastNotice(msg) {
    // Si ya existe uno, removerlo
    const existing = document.getElementById("toast-notice-box");
    if (existing) existing.remove();
    
    const notice = document.createElement("div");
    notice.id = "toast-notice-box";
    notice.style.position = "fixed";
    notice.style.bottom = "20px";
    notice.style.right = "20px";
    notice.style.backgroundColor = "var(--surface-color)";
    notice.style.color = "var(--text-primary)";
    notice.style.borderLeft = "4px solid var(--primary-color)";
    notice.style.padding = "14px 20px";
    notice.style.borderRadius = "8px";
    notice.style.boxShadow = "0 10px 25px rgba(0,0,0,0.15)";
    notice.style.zIndex = "9999";
    notice.style.fontSize = "0.85rem";
    notice.style.fontWeight = "600";
    notice.style.display = "flex";
    notice.style.alignItems = "center";
    notice.style.gap = "8px";
    
    notice.innerHTML = `
        <svg style="width: 16px; height: 16px; color: var(--primary-color); fill: none; stroke: currentColor; stroke-width: 2.5;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <span>${msg}</span>
    `;
    
    document.body.appendChild(notice);
    setTimeout(() => {
        notice.style.opacity = "0";
        notice.style.transition = "opacity 0.5s ease";
        setTimeout(() => notice.remove(), 500);
    }, 3000);
}

// Funciones globales para crear, editar y eliminar actividades (CRUD de Actividades)
window.openNuevaActividadModal = function() {
    document.getElementById('actividad-modal-title').textContent = "Nueva Actividad";
    document.getElementById('form-actividad-id').value = "";
    document.getElementById('form-actividad').reset();
    
    // Asignar fecha de hoy y hora por defecto
    const today = new Date();
    const dateVal = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    document.getElementById('form-actividad-fecha').value = dateVal;
    document.getElementById('form-actividad-hora').value = "08:00";
    document.getElementById('form-actividad-entregado').checked = false;
    document.getElementById('form-actividad-modificado').checked = false;
    
    // Llenar selector de empresas
    const companySelect = document.getElementById('form-actividad-empresa');
    companySelect.innerHTML = "";
    companies.forEach(company => {
        if (allowedCompaniesList === null || allowedCompaniesList.includes(company.nombre)) {
            const opt = document.createElement("option");
            opt.value = company.id;
            opt.textContent = company.nombre;
            companySelect.appendChild(opt);
        }
    });
    
    document.getElementById('actividad-form-modal').classList.add('active');
};

window.openEditarActividadModal = function(eventId) {
    const event = allEvents.find(e => String(e.id) === String(eventId));
    if (!event) return;
    
    document.getElementById('actividad-modal-title').textContent = "Editar Actividad";
    document.getElementById('form-actividad-id').value = event.id;
    document.getElementById('form-actividad-fecha').value = event.fecha;
    document.getElementById('form-actividad-hora').value = event.hora || "08:00";
    document.getElementById('form-actividad-descripcion').value = event.description || "";
    document.getElementById('form-actividad-entregado').checked = event.delivered === true || String(event.delivered).toLowerCase() === 'true';
    document.getElementById('form-actividad-modificado').checked = event.modified === true || String(event.modified).toLowerCase() === 'true';
    
    // Llenar selector de empresas y preseleccionar la correcta
    const companySelect = document.getElementById('form-actividad-empresa');
    companySelect.innerHTML = "";
    companies.forEach(company => {
        if (allowedCompaniesList === null || allowedCompaniesList.includes(company.nombre)) {
            const opt = document.createElement("option");
            opt.value = company.id;
            opt.textContent = company.nombre;
            if (event.empresas && String(company.id) === String(event.empresas.id)) {
                opt.selected = true;
            }
            companySelect.appendChild(opt);
        }
    });
    
    document.getElementById('actividad-form-modal').classList.add('active');
};

window.closeActividadModal = function() {
    document.getElementById('actividad-form-modal').classList.remove('active');
};

window.saveActividad = async function() {
    const id = document.getElementById('form-actividad-id').value;
    const fecha = document.getElementById('form-actividad-fecha').value;
    const hora = document.getElementById('form-actividad-hora').value;
    const empresaId = document.getElementById('form-actividad-empresa').value;
    const description = document.getElementById('form-actividad-descripcion').value.trim();
    const delivered = document.getElementById('form-actividad-entregado').checked;
    const modified = document.getElementById('form-actividad-modificado').checked;
    
    if (!fecha || !hora || !empresaId || !description) {
        alert("Por favor rellena todos los campos.");
        return;
    }
    
    const company = companies.find(c => String(c.id) === String(empresaId));
    
    const activityData = {
        fecha,
        hora,
        empresa_id: parseInt(empresaId),
        description,
        delivered,
        modified
    };
    
    let success = false;
    const headers = {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
        'Content-Type': 'application/json'
    };
    
    if (!id) {
        // CREAR NUEVO (POST)
        try {
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/calendario`, {
                method: 'POST',
                headers,
                body: JSON.stringify([activityData])
            });
            if (response.ok) {
                success = true;
                showToastNotice("Actividad creada en la base de datos.");
            }
        } catch (err) {
            console.error("Error al crear actividad:", err);
        }
        
        if (!success) {
            // Guardar localmente fallback
            const localCreated = JSON.parse(localStorage.getItem('local_created_events') || "[]");
            const newId = 20000 + Date.now();
            const newLocalEvent = {
                id: newId,
                ...activityData,
                empresas: company ? { id: company.id, nombre: company.nombre, categoria: company.categoria } : null,
                isLocal: true
            };
            localCreated.push(newLocalEvent);
            localStorage.setItem('local_created_events', JSON.stringify(localCreated));
            showToastNotice("Actividad guardada localmente (RLS de Supabase activo)");
        }
    } else {
        // EDITAR EXISTENTE (PATCH)
        try {
            const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/calendario?id=eq.${id}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify(activityData)
            });
            if (response.ok) {
                success = true;
                showToastNotice("Actividad modificada en la base de datos.");
            }
        } catch (err) {
            console.error("Error al modificar actividad:", err);
        }
        
        if (!success) {
            // Guardar modificación local fallback
            const localModified = JSON.parse(localStorage.getItem('local_modified_events') || "{}");
            localModified[id] = activityData;
            localStorage.setItem('local_modified_events', JSON.stringify(localModified));
            
            // Si el evento era de creación local, actualizarlo también allí
            const localCreated = JSON.parse(localStorage.getItem('local_created_events') || "[]");
            const idx = localCreated.findIndex(e => String(e.id) === String(id));
            if (idx !== -1) {
                localCreated[idx] = {
                    ...localCreated[idx],
                    ...activityData,
                    empresas: company ? { id: company.id, nombre: company.nombre, categoria: company.categoria } : null
                };
                localStorage.setItem('local_created_events', JSON.stringify(localCreated));
            }
            showToastNotice("Modificación guardada localmente (RLS de Supabase activo)");
        }
    }
    
    window.closeActividadModal();
    
    // Recargar datos y renderizar
    await loadInitialData();
    renderCalendar();
    
    // Refrescar el modal de detalle de día si está abierto
    const dayModal = document.getElementById("day-detail-modal");
    if (dayModal && dayModal.classList.contains("active")) {
        const dayEvents = filteredEvents.filter(e => e.fecha === fecha);
        const [y, m, d] = fecha.split('-');
        openDayDetail(fecha, parseInt(d), parseInt(m) - 1, parseInt(y), dayEvents);
    }
};

window.eliminarActividad = async function(eventId) {
    // 1. Validar que la actividad no tenga detalles en detalle_actividad
    // Consultar detalles remotos
    let dbDetails = [];
    try {
        const headers = {
            'apikey': CONFIG.SUPABASE_KEY,
            'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
        };
        const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/detalle_actividad?calendario_id=eq.${eventId}`, { headers });
        if (response.ok) {
            dbDetails = await response.json();
        }
    } catch (err) {
        console.error("Error al consultar detalles de la actividad:", err);
    }
    
    // Consultar detalles locales
    const localDetails = JSON.parse(localStorage.getItem(`local_details_${eventId}`) || "[]");
    
    const totalDetails = dbDetails.length + localDetails.length;
    if (totalDetails > 0) {
        alert("No se puede eliminar la actividad porque tiene detalles registrados en su bitácora de seguimiento.");
        return;
    }
    
    if (!confirm("¿Está seguro de que desea eliminar esta actividad?")) {
        return;
    }
    
    let deletedOnSupabase = false;
    try {
        const headers = {
            'apikey': CONFIG.SUPABASE_KEY,
            'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
        };
        const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/calendario?id=eq.${eventId}`, {
            method: 'DELETE',
            headers
        });
        if (response.ok) {
            deletedOnSupabase = true;
            showToastNotice("Actividad eliminada de la base de datos.");
        }
    } catch (err) {
        console.error("Error al eliminar en Supabase:", err);
    }
    
    if (!deletedOnSupabase) {
        // Fallback local: Añadir a local_deleted_ids
        const localDeletedIds = JSON.parse(localStorage.getItem('local_deleted_ids') || "[]");
        if (!localDeletedIds.includes(String(eventId)) && !localDeletedIds.includes(Number(eventId))) {
            localDeletedIds.push(String(eventId));
            localStorage.setItem('local_deleted_ids', JSON.stringify(localDeletedIds));
        }
        
        // Si era una actividad creada localmente, removerla también de local_created_events
        const localCreated = JSON.parse(localStorage.getItem('local_created_events') || "[]");
        const filteredCreated = localCreated.filter(e => String(e.id) !== String(eventId));
        localStorage.setItem('local_created_events', JSON.stringify(filteredCreated));
        
        // Limpiar de modificaciones locales si existía
        const localModified = JSON.parse(localStorage.getItem('local_modified_events') || "{}");
        delete localModified[eventId];
        localStorage.setItem('local_modified_events', JSON.stringify(localModified));
        
        showToastNotice("Eliminada de la vista local (RLS de Supabase activo)");
    }
    
    // Obtener la fecha de la actividad eliminada antes de recargar
    const event = allEvents.find(e => String(e.id) === String(eventId));
    const fecha = event ? event.fecha : null;
    
    // Recargar datos y renderizar
    await loadInitialData();
    renderCalendar();
    
    // Refrescar o cerrar el modal de detalle de día
    const dayModal = document.getElementById("day-detail-modal");
    if (dayModal && dayModal.classList.contains("active") && fecha) {
        const dayEvents = filteredEvents.filter(e => e.fecha === fecha);
        if (dayEvents.length > 0) {
            const [y, m, d] = fecha.split('-');
            openDayDetail(fecha, parseInt(d), parseInt(m) - 1, parseInt(y), dayEvents);
        } else {
            closeModal(); // Cerrar modal si ya no quedan eventos ese día
        }
    }
};
