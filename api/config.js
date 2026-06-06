module.exports = (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    // Desactivar caché para asegurar que obtenga siempre las variables actuales
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    
    const config = {
        SUPABASE_URL: process.env.SUPABASE_URL || '',
        SUPABASE_KEY: process.env.SUPABASE_KEY || '',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || ''
    };
    
    res.status(200).send(`const CONFIG = ${JSON.stringify(config)};`);
};
