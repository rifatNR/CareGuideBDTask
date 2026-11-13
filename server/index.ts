import 'dotenv/config';
import express from 'express';
import { apiRouter, errorHandler } from './routes';
import { connectDb } from './db';

async function main() {
    await connectDb();
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        const allowedOrigin = process.env.FRONTEND_URL;
        if (allowedOrigin && req.headers.origin === allowedOrigin) {
            res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
            res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
        }
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        next();
    });
    app.use('/api', apiRouter);
    app.use(errorHandler);
    const port = Number(process.env.PORT ?? 4000);
    app.listen(port, '0.0.0.0', () => console.log(`App running on port ${port}`));
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
