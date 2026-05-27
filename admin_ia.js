document.addEventListener('DOMContentLoaded', () => {
    initChatModule();
});

// Referencias DOM
const inputApiKey = document.getElementById('input-api-key');
const btnSaveKey = document.getElementById('btn-save-key');
const btnDeleteKey = document.getElementById('btn-delete-key');
const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');
const chatMessages = document.getElementById('chat-messages');
const aiStatusIndicator = document.getElementById('ai-status-indicator');
const contextInfo = document.getElementById('context-info');
const dbStatusBadge = document.getElementById('db-status-badge');

// Variables de Estado
let geminiApiKey = '';
let dbContextString = '';
let conversationHistory = []; // Almacena el hilo conversacional
let activeModel = 'gemini-1.5-flash'; // Modelo por defecto

// Resuelve dinámicamente qué modelo está disponible para la clave API provista
async function resolveActiveModel(apiKey) {
    if (!apiKey) return 'gemini-1.5-flash';
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await fetch(url);
        if (!response.ok) {
            console.warn('No se pudo consultar el catálogo de modelos, usando fallback por defecto.');
            return activeModel;
        }
        
        const data = await response.json();
        if (data && data.models) {
            // Filtrar modelos válidos que soporten generación de contenido
            const eligibleModels = data.models
                .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                .map(m => m.name.replace('models/', ''));
            
            console.log('Modelos Gemini disponibles y autorizados para esta API Key:', eligibleModels);
            
            // Prioridad de selección descendente según optimización y vigencia
            const priorities = [
                'gemini-1.5-flash',
                'gemini-1.5-flash-8b',
                'gemini-2.5-flash',
                'gemini-2.0-flash',
                'gemini-2.0-flash-exp',
                'gemini-1.5-pro',
                'gemini-pro'
            ];
            
            for (const preferred of priorities) {
                if (eligibleModels.includes(preferred)) {
                    activeModel = preferred;
                    console.log(`[IA] Modelo seleccionado óptimo: ${activeModel}`);
                    return activeModel;
                }
            }
            
            // Si no coincide con nuestra lista preferida, usar el primero disponible que sirva
            if (eligibleModels.length > 0) {
                activeModel = eligibleModels[0];
                console.log(`[IA] Modelo seleccionado por compatibilidad: ${activeModel}`);
                return activeModel;
            }
        }
    } catch (e) {
        console.error('Error auto-detectando modelos con la API Key:', e);
    }
    return activeModel;
}

async function initChatModule() {
    // 1. Cargar clave API desde CONFIG (preconfigurada) o desde localStorage (personalizada)
    geminiApiKey = (typeof CONFIG !== 'undefined' && CONFIG.GEMINI_API_KEY) || localStorage.getItem('bel_gemini_key') || '';
    updateApiKeyUI();
    if (geminiApiKey) {
        resolveActiveModel(geminiApiKey);
    }

    // 2. Escuchar eventos de la clave API
    btnSaveKey.addEventListener('click', saveApiKey);
    btnDeleteKey.addEventListener('click', deleteApiKey);
    inputApiKey.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveApiKey();
    });

    // 3. Escuchar eventos del chat
    btnSend.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // 4. Escuchar clics en preguntas sugeridas
    document.querySelectorAll('.suggested-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const question = btn.getAttribute('data-question');
            chatInput.value = question;
            sendMessage();
        });
    });

    // 5. Cargar contexto de Supabase en segundo plano
    await fetchSupabaseContext();
}

function updateApiKeyUI() {
    const isHardcoded = typeof CONFIG !== 'undefined' && CONFIG.GEMINI_API_KEY;

    if (geminiApiKey) {
        inputApiKey.value = isHardcoded ? '•••••••• (Preconfigurada)' : '••••••••••••••••••••••••••••••••';
        inputApiKey.disabled = true;
        btnSaveKey.style.display = 'none';
        
        if (isHardcoded) {
            btnDeleteKey.classList.add('hidden'); // Ocultar borrar si es fija en el config.js
        } else {
            btnDeleteKey.classList.remove('hidden');
        }
        
        chatInput.disabled = false;
        btnSend.disabled = false;
        aiStatusIndicator.style.backgroundColor = '#10b981'; // Verde (Conectado)
    } else {
        inputApiKey.value = '';
        inputApiKey.disabled = false;
        inputApiKey.placeholder = 'Ingresa tu Gemini API Key...';
        btnSaveKey.style.display = 'inline-block';
        btnDeleteKey.classList.add('hidden');
        
        chatInput.disabled = true;
        btnSend.disabled = true;
        aiStatusIndicator.style.backgroundColor = '#ef4444'; // Rojo (Desconectado)
    }
}

async function saveApiKey() {
    const key = inputApiKey.value.trim();
    if (!key || key.startsWith('•••')) {
        alert('Por favor, ingresa una clave API válida.');
        return;
    }
    geminiApiKey = key;
    localStorage.setItem('bel_gemini_key', key);
    updateApiKeyUI();
    
    // Validar y resolver el modelo correspondiente para esta API Key
    await resolveActiveModel(geminiApiKey);
}

function deleteApiKey() {
    const isHardcoded = typeof CONFIG !== 'undefined' && CONFIG.GEMINI_API_KEY;
    if (isHardcoded) {
        alert('La clave API está definida como fija en el archivo config.js y no puede eliminarse desde aquí.');
        return;
    }
    
    if (confirm('¿Estás seguro de que deseas eliminar tu clave API de este navegador?')) {
        geminiApiKey = '';
        localStorage.removeItem('bel_gemini_key');
        updateApiKeyUI();
    }
}

// 6. Consultar y consolidar la base de datos de Supabase para el Prompt del Sistema
async function fetchSupabaseContext() {
    contextInfo.textContent = 'Consultando base de datos...';
    
    try {
        const headers = {
            'apikey': CONFIG.SUPABASE_KEY,
            'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
        };

        // A. Consultar Empresas
        const resEmp = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/empresas`, { headers });
        const empresas = resEmp.ok ? await resEmp.json() : [];

        // B. Consultar Periodos
        const resPer = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/periodos`, { headers });
        const periodos = resPer.ok ? await resPer.json() : [];

        // C. Consultar todos los datos financieros de GyP
        const resGyp = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/gyp`, { headers });
        const gypData = resGyp.ok ? await resGyp.json() : [];

        // D. Consultar datos de Capital de Trabajo (ct)
        const resCt = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/ct`, { headers });
        const ctData = resCt.ok ? await resCt.json() : [];

        // E. Consultar criterios / conceptos de Capital de Trabajo (conceptosct)
        const resConceptos = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/conceptosct`, { headers });
        const conceptosData = resConceptos.ok ? await resConceptos.json() : [];

        // F. Consultar anexos de cuentas (caja y banco, inventarios, etc.)
        const resAnexos = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/anexos`, { headers });
        const anexosData = resAnexos.ok ? await resAnexos.json() : [];

        // Procesar y consolidar datos financieros en JSON súper compactos
        const resumenFinanciero = consolidarDatosFinancieros(gypData);
        const resumenCapitalDeTrabajo = consolidarCapitalDeTrabajo(ctData);
        const resumenAnexos = consolidarAnexos(anexosData);
        const criteriosCT = conceptosData.map(c => ({ orden: c.orden, denominacion: c.denominacion, clase: c.clase }));

        const databaseSummary = {
            empresas_registradas: empresas.map(e => ({ id: e.id, nombre: e.nombre, administrador: e.administrador, plan: e.plan })),
            periodos_registrados: periodos.map(p => ({ periodo: p.periodo, cerrado: p.cerrado })),
            criterios_y_cuentas_capital_de_trabajo: criteriosCT,
            resumen_consolidado_por_empresa_y_periodo: resumenFinanciero,
            capital_de_trabajo_por_empresa: resumenCapitalDeTrabajo,
            anexos_detallados_por_cuenta_y_periodo: resumenAnexos
        };

        dbContextString = JSON.stringify(databaseSummary, null, 2);
        contextInfo.textContent = 'Contexto contable y Capital de Trabajo inyectado con éxito (Supabase)';
        dbStatusBadge.className = 'badge bg-success-subtle text-success border border-success-subtle rounded-pill py-1 px-3';
        dbStatusBadge.textContent = 'Supabase Conectado';

    } catch (err) {
        console.error('Error cargando contexto Supabase:', err);
        contextInfo.textContent = 'Error al cargar contexto de base de datos.';
        dbStatusBadge.className = 'badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill py-1 px-3';
        dbStatusBadge.textContent = 'Error de Base de Datos';
    }
}

function consolidarDatosFinancieros(data) {
    const agrupado = {};

    data.forEach(row => {
        const key = `${row.empresa}_${row.periodo}_${row.dimension}`;
        let monto = parseFloat(row.monto) || 0;
        monto = Math.round((monto + Number.EPSILON) * 100) / 100;

        if (!agrupado[key]) {
            agrupado[key] = {
                empresa: row.empresa || 'Desconocida',
                periodo: row.periodo || 'Desconocido',
                dimension: row.dimension || 'REAL',
                ingresos: 0,
                costos: 0,
                gastos: 0,
                otrosIngresos: 0,
                otrosEgresos: 0,
                ingresosOperacionales: 0
            };
        }

        const g = (row.grupo || '').toUpperCase();
        const sg2 = (row.subgrupo2 || '').toUpperCase();

        if (g.includes('INGRESO') && !g.includes('OTROS')) agrupado[key].ingresos += monto;
        if (g.includes('COSTO') && !g.includes('OTROS')) agrupado[key].costos += monto;
        if (g.includes('GASTO') && !g.includes('OTROS')) agrupado[key].gastos += monto;
        if (g.includes('OTROS INGRESOS')) agrupado[key].otrosIngresos += monto;
        if (g.includes('OTROS EGRESOS')) agrupado[key].otrosEgresos += monto;
        if (sg2.includes('INGRESOS OPERACIONALES')) agrupado[key].ingresosOperacionales += monto;
    });

    return Object.values(agrupado).map(item => {
        const utilidadBruta = item.ingresos - item.costos;
        const resultadoNeto = utilidadBruta - item.gastos + item.otrosIngresos - item.otrosEgresos;
        
        const divIngresos = item.ingresosOperacionales || item.ingresos || 0;
        const margenNeto = divIngresos ? ((resultadoNeto / divIngresos) * 100).toFixed(2) + ' %' : '0,00 %';

        return {
            empresa: item.empresa,
            periodo: item.periodo,
            dimension: item.dimension,
            ingresos: Math.round(item.ingresos),
            costos: Math.round(item.costos),
            gastos: Math.round(item.gastos),
            resultado_neto: Math.round(resultadoNeto),
            margen_neto: margenNeto
        };
    });
}

function consolidarCapitalDeTrabajo(ctData) {
    const agrupado = {};
    ctData.forEach(row => {
        const key = `${row.empresa}_${row.periodo}`;
        if (!agrupado[key]) {
            agrupado[key] = {
                empresa: row.empresa || 'Desconocida',
                periodo: row.periodo || 'Desconocido',
                activos_corrientes: 0,
                pasivos_corrientes: 0,
                cuentas: []
            };
        }
        const monto = parseFloat(row.monto) || 0;
        const clase = (row.clase || '').toUpperCase();
        if (clase.includes('ACTIVO')) {
            agrupado[key].activos_corrientes += monto;
        } else if (clase.includes('PASIVO')) {
            agrupado[key].pasivos_corrientes += monto;
        }
        agrupado[key].cuentas.push({
            denominacion: row.denominacion,
            clase: row.clase,
            monto: Math.round(monto)
        });
    });
    
    return Object.values(agrupado).map(item => ({
        empresa: item.empresa,
        periodo: item.periodo,
        total_activos_corrientes: Math.round(item.activos_corrientes),
        total_pasivos_corrientes: Math.round(item.pasivos_corrientes),
        capital_de_trabajo_neto: Math.round(item.activos_corrientes - item.pasivos_corrientes),
        cuentas_desglose: item.cuentas
    }));
}

function consolidarAnexos(anexosData) {
    const agrupado = {};
    anexosData.forEach(row => {
        const key = `${row.empresa}_${row.periodo}_${row.tipo}`;
        if (!agrupado[key]) {
            agrupado[key] = {
                empresa: row.empresa || 'Desconocida',
                periodo: row.periodo || 'Desconocido',
                tipo_anexo: row.tipo || 'General',
                total: 0,
                detalles: []
            };
        }
        const monto = parseFloat(row.monto) || 0;
        agrupado[key].total += monto;
        agrupado[key].detalles.push({
            descripcion: row.descripcion,
            monto: Math.round(monto)
        });
    });
    
    return Object.values(agrupado).map(item => ({
        empresa: item.empresa,
        periodo: item.periodo,
        tipo_anexo: item.tipo_anexo,
        total_acumulado: Math.round(item.total),
        anexos_desglose: item.detalles
    }));
}


// 7. Enviar y procesar mensaje
async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    if (!geminiApiKey) {
        alert('Por favor, ingresa tu Gemini API Key en la barra superior para chatear.');
        return;
    }

    // Mostrar mensaje del usuario
    appendMessage('user', text);
    chatInput.value = '';
    chatInput.disabled = true;
    btnSend.disabled = true;

    // Mostrar indicador de "Escribiendo..."
    const typingBubble = appendTypingIndicator();

    try {
        // Estructurar el System Prompt (Instrucción del sistema de Gemini)
        const systemPrompt = `Eres un Asistente Financiero y Contable experto de Corporación BEL.
Tienes acceso directo y 100% veraz a los siguientes datos contables reales extraídos en tiempo real de nuestra base de datos de Supabase, incluyendo el estado de pérdidas y ganancias (GyP), los saldos de Capital de Trabajo y los Anexos detallados de cuentas:
---
${dbContextString || 'No hay datos disponibles en este momento.'}
---
Fórmulas de Cálculo Claves:
- Utilidad Bruta = Ingresos - Costos
- Resultado Neto = Utilidad Bruta - Gastos + Otros Ingresos - Otros Egresos
- Margen Neto = Resultado Neto / Ingresos (o Ingresos Operacionales) * 100
- Capital de Trabajo Neto = Total Activos Corrientes - Total Pasivos Corrientes

Tu objetivo es responder de manera profesional, estructurada y en español a las consultas del administrador.
Usa formato markdown para las respuestas, incluyendo listas, negritas y especialmente tablas de markdown para presentar cifras o comparativas de manera súper legible.
Basa tus respuestas ÚNICAMENTE en el JSON contable proveído. Si te preguntan por cifras o detalles que no están en el contexto (como desglose de anexos no existentes), dilo cortésmente.`;

        // Añadir mensaje del usuario al historial
        conversationHistory.push({
            role: 'user',
            parts: [{ text: text }]
        });

        // Crear una copia profunda del historial para enviar al API, inyectando el System Prompt
        // en el primer mensaje de la conversación para que el modelo tenga el contexto completo
        const contentsToSend = JSON.parse(JSON.stringify(conversationHistory));
        if (contentsToSend.length > 0) {
            contentsToSend[0].parts[0].text = `${systemPrompt}\n\n[INSTRUCCIÓN IMPORTANTE] Analiza y responde a la siguiente pregunta basándote estrictamente en el contexto contable anterior:\n${contentsToSend[0].parts[0].text}`;
        }

        // Resolver el modelo antes de enviar por si acaso no se ha resuelto
        await resolveActiveModel(geminiApiKey);

        // Llamar a la API oficial de Google Gemini con detección dinámica de modelo
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${geminiApiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: contentsToSend
            })
        });

        // Eliminar indicador de escritura
        typingBubble.remove();

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || 'Error al comunicarse con la API de Gemini');
        }

        const data = await response.json();
        const aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No obtuve una respuesta válida de la IA.';

        // Añadir respuesta de la IA al historial de conversación
        conversationHistory.push({
            role: 'model',
            parts: [{ text: aiResponseText }]
        });

        // Mostrar respuesta de la IA en pantalla
        appendMessage('ai', aiResponseText);

    } catch (error) {
        console.error(error);
        if (typingBubble) typingBubble.remove();
        appendMessage('ai', `❌ **Error:** ${error.message}. Por favor, verifica tu Gemini API Key o la conexión a internet e inténtalo de nuevo.`);
    } finally {
        chatInput.disabled = false;
        btnSend.disabled = false;
        chatInput.focus();
    }
}

function appendMessage(sender, text) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble shadow-sm ${sender === 'user' ? 'bubble-user' : 'bubble-ai'}`;
    
    if (sender === 'user') {
        bubble.textContent = text;
    } else {
        bubble.innerHTML = formatAIResponse(text);
    }
    
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return bubble;
}

function appendTypingIndicator() {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble bubble-ai shadow-sm';
    bubble.innerHTML = `
        <div class="typing-indicator">
            <span class="small text-muted me-2">Escribiendo</span>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return bubble;
}

// 8. Formateador básico de Markdown a HTML (incluyendo negritas, listas y Tablas)
function formatAIResponse(text) {
    if (!text) return '';
    
    let html = text;

    // Escapar caracteres html básicos para seguridad (excepto si son creados por el parser)
    html = html
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Procesar tablas de markdown
    const lines = html.split('\n');
    let inTable = false;
    let tableHtml = '';
    let tableLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.startsWith('|') && line.endsWith('|')) {
            if (!inTable) {
                inTable = true;
                tableLines = [];
            }
            tableLines.push(line);
        } else {
            if (inTable) {
                tableHtml = parseMarkdownTable(tableLines);
                // Reemplazar las líneas de la tabla en el texto original
                const tableIndex = i - tableLines.length;
                lines.splice(tableIndex, tableLines.length, tableHtml);
                i = i - tableLines.length + 1; // Ajustar puntero
                inTable = false;
            }
        }
    }
    if (inTable) {
        tableHtml = parseMarkdownTable(tableLines);
        lines.splice(lines.length - tableLines.length, tableLines.length, tableHtml);
    }

    html = lines.join('\n');

    // Procesar negritas: **texto**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Procesar listas desordenadas: * item o - item
    html = html.replace(/^\s*[\*\-]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>'); // Envolver grupos de li en ul básico

    // Procesar saltos de línea simples
    html = html.replace(/\n/g, '<br>');

    // Limpiar saltos de línea redundantes creados por listas
    html = html.replace(/<\/li><br><li>/g, '</li><li>');
    html = html.replace(/<\/ul><br>/g, '</ul>');
    html = html.replace(/<br><ul>/g, '<ul>');

    return html;
}

function parseMarkdownTable(lines) {
    if (lines.length < 2) return '';

    let html = '<div class="table-responsive"><table class="table table-sm table-striped table-bordered align-middle">';
    
    // Parsear fila de cabecera
    const headers = lines[0].split('|').map(s => s.trim()).filter(s => s !== '');
    html += '<thead><tr>';
    headers.forEach(h => {
        html += `<th>${h}</th>`;
    });
    html += '</tr></thead><tbody>';

    // Omitir la segunda fila (que suele ser el separador |---|---|)
    for (let i = 2; i < lines.length; i++) {
        const cells = lines[i].split('|').map(s => s.trim()).filter(s => s !== '');
        if (cells.length === 0) continue;
        
        html += '<tr>';
        cells.forEach((c, idx) => {
            // Alinear a la derecha si parece una cifra numérica
            const isNumeric = /^-?[\d\.,%\s\$\+]+$/.test(c) && isNaN(c);
            html += `<td style="${isNumeric ? 'text-align: right;' : ''}">${c}</td>`;
        });
        html += '</tr>';
    }

    html += '</tbody></table></div>';
    return html;
}
