// Configuración inicial de tema
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

document.addEventListener('DOMContentLoaded', () => {
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
        fetch('menu.html')
            .then(response => response.text())
            .then(html => {
                sidebarContainer.innerHTML = html;
                
                // Highlight active menu item based on current URL
                const path = window.location.pathname;
                const page = path.split('/').pop() || 'index.html';
                
                if (page === 'index.html') {
                    document.getElementById('nav-inicio')?.classList.add('active');
                } else if (page === 'empresa1.html') {
                    document.getElementById('nav-gyp')?.classList.add('active');
                    const header = document.getElementById('nav-gyp-group');
                    if (header) {
                        header.nextElementSibling.style.display = 'block';
                        header.querySelector('.collapsible-icon').style.transform = 'rotate(90deg)';
                    }
                } else if (page === 'gyp_historico.html') {
                    document.getElementById('nav-gyp-historico')?.classList.add('active');
                    const header = document.getElementById('nav-gyp-group');
                    if (header) {
                        header.nextElementSibling.style.display = 'block';
                        header.querySelector('.collapsible-icon').style.transform = 'rotate(90deg)';
                    }
                } else if (page === 'gyp_comparativo.html') {
                    document.getElementById('nav-gyp-comparativo')?.classList.add('active');
                    const header = document.getElementById('nav-gyp-group');
                    if (header) {
                        header.nextElementSibling.style.display = 'block';
                        header.querySelector('.collapsible-icon').style.transform = 'rotate(90deg)';
                    }
                } else if (page === 'ct_actual.html') {
                    document.getElementById('nav-ct')?.classList.add('active');
                    const header = document.getElementById('nav-ct-group');
                    if (header) {
                        header.nextElementSibling.style.display = 'block';
                        header.querySelector('.collapsible-icon').style.transform = 'rotate(90deg)';
                    }
                } else if (page === 'ct_historico.html') {
                    document.getElementById('nav-ct-historico')?.classList.add('active');
                    const header = document.getElementById('nav-ct-group');
                    if (header) {
                        header.nextElementSibling.style.display = 'block';
                        header.querySelector('.collapsible-icon').style.transform = 'rotate(90deg)';
                    }
                } else if (page === 'admin.html' || page === 'admin_empresas.html' || page === 'admin_plan.html' || page === 'admin_periodos.html' || page === 'admin_conceptosct.html' || page === 'admin_conceptosfc.html' || page === 'admin_ia.html') {
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
            const content = header.nextElementSibling;
            const icon = header.querySelector('.collapsible-icon');
            if (content.style.display === 'none' || content.style.display === '') {
                content.style.display = 'block';
                if (icon) icon.style.transform = 'rotate(90deg)';
            } else {
                content.style.display = 'none';
                if (icon) icon.style.transform = 'rotate(0deg)';
            }
        });
    });
}
