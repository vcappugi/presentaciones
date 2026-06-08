// Verificar sesión antes de continuar
const loggedUser = sessionStorage.getItem('loggedUser') || localStorage.getItem('loggedUser');
if (!loggedUser) {
    window.location.href = 'login.html';
} else {
    // Proteger páginas de administración
    const userObj = JSON.parse(loggedUser);
    const path = window.location.pathname;
    const page = path.split('/').pop() || 'index.html';
    if (page.startsWith('admin') && userObj.rol !== 'admin') {
        alert('Acceso denegado: Se requieren permisos de administrador.');
        window.location.href = 'index.html';
    }
}

// Función global para obtener empresas permitidas para el usuario logueado
window.getAllowedCompanies = async function() {
    if (!loggedUser) return [];
    const userObj = JSON.parse(loggedUser);
    if (userObj.rol === 'admin') {
        return null; // admin ve todo
    }
    
    const cached = sessionStorage.getItem('allowedCompanies');
    if (cached) {
        return JSON.parse(cached);
    }
    
    try {
        const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/empresas?usuario=eq.${encodeURIComponent(userObj.nickname)}`, {
            method: 'GET',
            headers: {
                'apikey': CONFIG.SUPABASE_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
            }
        });
        if (!response.ok) throw new Error('Error al consultar empresas permitidas');
        const data = await response.json();
        const allowed = data.map(c => c.nombre);
        sessionStorage.setItem('allowedCompanies', JSON.stringify(allowed));
        return allowed;
    } catch (err) {
        console.error('Error en getAllowedCompanies:', err);
        return [];
    }
};

// Configuración inicial de tema
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificar si la empresa actual está permitida (para páginas de reporte)
    const path = window.location.pathname;
    const page = path.split('/').pop() || 'index.html';
    const isReportPage = [
        'empresa_divisiones.html', 'empresa1.html', 'gyp_historico.html', 
        'gyp_comparativo.html', 'ct_actual.html', 'ct_historico.html', 
        'fc_actual.html', 'fc_historico.html'
    ].includes(page);

    if (isReportPage) {
        const urlParams = new URLSearchParams(window.location.search);
        let valorEmpresa = urlParams.get('empresa');
        if (!valorEmpresa) {
            valorEmpresa = localStorage.getItem('bel_empresa');
        }
        
        if (valorEmpresa) {
            const allowed = await window.getAllowedCompanies();
            if (allowed && !allowed.includes(valorEmpresa)) {
                alert('Acceso denegado: No tienes permisos para ver esta empresa.');
                if (allowed.length > 0) {
                    localStorage.setItem('bel_empresa', allowed[0]);
                    const periodo = urlParams.get('periodo') || localStorage.getItem('bel_periodo') || '';
                    const dimension = urlParams.get('dimension') || localStorage.getItem('bel_dimension') || 'REAL';
                    window.location.href = `${page}?empresa=${encodeURIComponent(allowed[0])}&periodo=${encodeURIComponent(periodo)}&dimension=${encodeURIComponent(dimension)}`;
                    return;
                } else {
                    window.location.href = 'index.html';
                    return;
                }
            }
        }
    }

    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
        fetch('menu.html')
            .then(response => response.text())
            .then(html => {
                sidebarContainer.innerHTML = html;
                
                // Inicializar datos del usuario en el sidebar
                const userObj = JSON.parse(loggedUser);
                const nameEl = document.getElementById('user-display-name');
                const roleEl = document.getElementById('user-display-role');
                const avatarEl = document.getElementById('user-display-avatar');
                const logoutBtn = document.getElementById('btn-logout');
                
                if (nameEl) nameEl.textContent = userObj.nombre || userObj.nickname || 'Usuario';
                if (roleEl) roleEl.textContent = userObj.rol === 'admin' ? 'Administrador' : 'Usuario';
                if (avatarEl) {
                    const firstChar = (userObj.nombre || userObj.nickname || 'U').charAt(0).toUpperCase();
                    avatarEl.textContent = firstChar;
                }

                // Ocultar sección de administración si no es admin
                if (userObj.rol !== 'admin') {
                    const adminLink = document.getElementById('nav-admin-link');
                    const adminSep = document.getElementById('nav-admin-separator');
                    if (adminLink) adminLink.style.display = 'none';
                    if (adminSep) adminSep.style.display = 'none';
                }

                // Configurar logout
                if (logoutBtn) {
                    logoutBtn.addEventListener('click', () => {
                        sessionStorage.removeItem('loggedUser');
                        localStorage.removeItem('loggedUser');
                        window.location.href = 'login.html';
                    });
                    
                    // Efectos visuales de hover
                    logoutBtn.addEventListener('mouseenter', () => {
                        logoutBtn.style.background = 'rgba(239, 68, 68, 0.25)';
                        logoutBtn.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                        logoutBtn.style.color = '#ef4444';
                    });
                    logoutBtn.addEventListener('mouseleave', () => {
                        logoutBtn.style.background = 'rgba(239, 68, 68, 0.12)';
                        logoutBtn.style.borderColor = 'rgba(239, 68, 68, 0.25)';
                        logoutBtn.style.color = '#f87171';
                    });
                }
                
                // Highlight active menu item based on current URL
                const path = window.location.pathname;
                const page = path.split('/').pop() || 'index.html';
                
                if (page === 'index.html') {
                    document.getElementById('nav-inicio')?.classList.add('active');
                } else if (page === 'empresa1.html' || page === 'empresa_divisiones.html') {
                    document.getElementById('nav-empresa-divisiones')?.classList.add('active');
                    const header = document.getElementById('nav-gyp-group');
                    if (header) {
                        header.nextElementSibling.style.display = 'block';
                        const icon = header.querySelector('.collapsible-icon');
                        if (icon) icon.style.transform = 'rotate(90deg)';
                    }
                } else if (page === 'gyp_historico.html') {
                    document.getElementById('nav-gyp-historico')?.classList.add('active');
                    const header = document.getElementById('nav-gyp-group');
                    if (header) {
                        header.nextElementSibling.style.display = 'block';
                        const icon = header.querySelector('.collapsible-icon');
                        if (icon) icon.style.transform = 'rotate(90deg)';
                    }
                } else if (page === 'gyp_comparativo.html') {
                    document.getElementById('nav-gyp-comparativo')?.classList.add('active');
                    const header = document.getElementById('nav-gyp-group');
                    if (header) {
                        header.nextElementSibling.style.display = 'block';
                        const icon = header.querySelector('.collapsible-icon');
                        if (icon) icon.style.transform = 'rotate(90deg)';
                    }
                } else if (page === 'ct_actual.html') {
                    document.getElementById('nav-ct')?.classList.add('active');
                    const header = document.getElementById('nav-ct-group');
                    if (header) {
                        header.nextElementSibling.style.display = 'block';
                        const icon = header.querySelector('.collapsible-icon');
                        if (icon) icon.style.transform = 'rotate(90deg)';
                    }
                } else if (page === 'ct_historico.html') {
                    document.getElementById('nav-ct-historico')?.classList.add('active');
                    const header = document.getElementById('nav-ct-group');
                    if (header) {
                        header.nextElementSibling.style.display = 'block';
                        const icon = header.querySelector('.collapsible-icon');
                        if (icon) icon.style.transform = 'rotate(90deg)';
                    }
                } else if (page === 'fc_actual.html') {
                    document.getElementById('nav-fc-actual')?.classList.add('active');
                    const header = document.getElementById('nav-fc-group');
                    if (header) {
                        header.nextElementSibling.style.display = 'block';
                        const icon = header.querySelector('.collapsible-icon');
                        if (icon) icon.style.transform = 'rotate(90deg)';
                    }
                } else if (page === 'fc_historico.html') {
                    document.getElementById('nav-fc-historico')?.classList.add('active');
                    const header = document.getElementById('nav-fc-group');
                    if (header) {
                        header.nextElementSibling.style.display = 'block';
                        const icon = header.querySelector('.collapsible-icon');
                        if (icon) icon.style.transform = 'rotate(90deg)';
                    }
                } else if (page === 'admin.html' || page === 'admin_empresas.html' || page === 'admin_plan.html' || page === 'admin_periodos.html' || page === 'admin_conceptosct.html' || page === 'admin_conceptosfc.html' || page === 'admin_ia.html' || page === 'admin_usuarios.html') {
                    document.getElementById('nav-admin')?.classList.add('active');
                }

                // Inicializar menú responsive (Hamburger y Overlay)
                initResponsiveMenu();

                // Inicializar menús colapsables
                initCollapsibleMenu();
                
                // Inicializar selector de temas
                initThemeSelector();
            })
            .catch(error => console.error('Error loading menu:', error));
    }
});

function initResponsiveMenu() {
    // Crear y añadir el overlay si no existe
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
    }

    // Insertar el botón hamburguesa dentro de page-title
    const pageTitle = document.querySelector('.page-title');
    if (pageTitle && !document.querySelector('.menu-toggle')) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'menu-toggle';
        toggleBtn.innerHTML = '☰';
        pageTitle.insertBefore(toggleBtn, pageTitle.firstChild);
    }

    const toggleBtn = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');

    if (toggleBtn && sidebar && overlay) {
        // Abrir/Cerrar menú
        toggleBtn.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar.classList.add('open');
                overlay.classList.add('active');
            } else {
                document.body.classList.toggle('sidebar-collapsed');
            }
        });

        // Cerrar menú al tocar fuera
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        });
        
        // Cerrar menú al hacer clic en un enlace en móviles
        const navItems = sidebar.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                if (item.classList.contains('nav-collapsible-header')) {
                    return;
                }
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('open');
                    overlay.classList.remove('active');
                }
            });
        });
    }
}

function initThemeSelector() {
    const themeBtns = document.querySelectorAll('.theme-btn');
    const currentTheme = localStorage.getItem('theme') || 'light';
    
    themeBtns.forEach(btn => {
        if (btn.getAttribute('data-set-theme') === currentTheme) {
            btn.classList.add('active');
        }
        
        btn.addEventListener('click', (e) => {
            const theme = e.target.getAttribute('data-set-theme');
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
            
            themeBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
}

function initCollapsibleMenu() {
    const headers = document.querySelectorAll('.nav-collapsible-header');
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const sidebar = document.querySelector('.sidebar');
            const overlay = document.querySelector('.sidebar-overlay');
            let wasCollapsed = false;

            // Expandir la barra si estaba colapsada (Desktop o Móvil)
            if (document.body.classList.contains('sidebar-collapsed')) {
                document.body.classList.remove('sidebar-collapsed');
                wasCollapsed = true;
            }
            if (window.innerWidth <= 768 && sidebar && !sidebar.classList.contains('open')) {
                sidebar.classList.add('open');
                if (overlay) overlay.classList.add('active');
                wasCollapsed = true;
            }

            const content = header.nextElementSibling;
            const icon = header.querySelector('.collapsible-icon');
            
            // Si la barra estaba colapsada, forzar la apertura del submenú
            if (wasCollapsed) {
                content.style.display = 'block';
                if (icon) icon.style.transform = 'rotate(90deg)';
            } else {
                // Alternar comportamiento de apertura/cierre normal
                if (content.style.display === 'none' || content.style.display === '') {
                    content.style.display = 'block';
                    if (icon) icon.style.transform = 'rotate(90deg)';
                } else {
                    content.style.display = 'none';
                    if (icon) icon.style.transform = 'rotate(0deg)';
                }
            }
        });
    });
}
