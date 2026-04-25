export default async function handler(req, res) {
    try {
        const mod = await import('../server.js');
        const app = mod.default;
        
        // Express app is just a function that takes (req, res)
        return app(req, res);
    } catch (err) {
        console.error("IMPORT ERROR:", err);
        return res.status(500).json({
            error: err.message,
            stack: err.stack,
            name: err.name,
            code: err.code
        });
    }
}
