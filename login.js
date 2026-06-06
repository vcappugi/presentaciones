document.addEventListener('DOMContentLoaded', () => {
    // Redirigir si ya hay sesión activa
    const loggedUser = sessionStorage.getItem('loggedUser') || localStorage.getItem('loggedUser');
    if (loggedUser) {
        window.location.href = 'index.html';
        return;
    }

    const form = document.getElementById('form-login');
    const nicknameInput = document.getElementById('nickname');
    const passwordInput = document.getElementById('password');
    const rememberMeCheckbox = document.getElementById('remember-me');
    const btnSubmit = document.getElementById('btn-submit');
    const errorEl = document.getElementById('login-error');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const nickname = nicknameInput.value.trim();
        const password = passwordInput.value.trim();

        // Limpiar errores previos
        errorEl.style.display = 'none';
        errorEl.textContent = '';
        
        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Ingresando...';

        try {
            const headers = {
                'apikey': CONFIG.SUPABASE_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            };
            
            // Consultar usuario en Supabase con coincidencia exacta de nickname y password (case-sensitive)
            const url = `${CONFIG.SUPABASE_URL}/rest/v1/usuario?nickname=eq.${encodeURIComponent(nickname)}&password=eq.${encodeURIComponent(password)}`;
            const response = await fetch(url, { method: 'GET', headers });

            if (!response.ok) {
                throw new Error('Error al conectar con el servidor.');
            }

            const data = await response.json();

            if (data && data.length > 0) {
                // Credenciales válidas
                const user = data[0];
                const sessionData = {
                    nombre: user.nombre,
                    nickname: user.nickname,
                    rol: user.rol
                };

                const sessionString = JSON.stringify(sessionData);

                if (rememberMeCheckbox.checked) {
                    localStorage.setItem('loggedUser', sessionString);
                } else {
                    sessionStorage.setItem('loggedUser', sessionString);
                }

                // Redirigir al Inicio
                window.location.href = 'index.html';
            } else {
                // Credenciales inválidas
                showError('Usuario o contraseña incorrectos.');
            }

        } catch (error) {
            console.error(error);
            showError('Ocurrió un error: ' + error.message);
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Ingresar';
        }
    });

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
    }
});
