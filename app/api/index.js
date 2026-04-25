let app;
try {
    const mod = await import('../server.js');
    app = mod.default;
} catch (err) {
    // If server.js crashes during import, return the error as JSON
    // instead of Vercel's generic "FUNCTION_INVOCATION_FAILED"
    const express = (await import('express')).default;
    app = express();
    app.all('*', (_req, res) => {
        res.status(500).json({
            error: err.message,
            stack: err.stack,
        });
    });
}
export default app;
