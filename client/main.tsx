import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui';
import './style.css';

export async function request(path: string, options: RequestInit = {}) {
    const token = localStorage.getItem('token');
    const apiOrigin = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
    const response = await fetch(`${apiOrigin}/api${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options.headers,
        },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Request failed.');
    return data;
}

createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
