// Validación temprana: Falla rápido si Vercel no inyectó las variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY || !process.env.GEMINI_API_KEY) {
    throw new Error("ERROR CRÍTICO: Faltan variables de entorno en Vercel.");
}

export const CONFIG = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY
};
