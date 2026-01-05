// static/js/apiClient.js
import { AppState } from './state.js';

async function apiCall(endpoint, options = {}) {
    const defaultHeaders = { 'Content-Type': 'application/json' };
    const config = { ...options, headers: { ...defaultHeaders, ...options.headers } };
    if (config.body && typeof config.body !== 'string') config.body = JSON.stringify(config.body);

    const response = await fetch(endpoint, config);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${response.status}`);
    }
    return (response.status === 204) ? { status: 'ok' } : response.json();
}

export const pedidosAPI = {
    getAtivos: () => apiCall(`/api/pedidos/ativos`),
    updateStatus: (id, status, comprador) => apiCall(`/api/pedidos/${id}/status`, { method: 'PUT', body: { status, comprador, editor_nome: AppState.currentUser.nome } }),
    updateComprador: (id, comprador) => apiCall(`/api/pedidos/${id}/comprador`, { method: 'PUT', body: { comprador, editor_nome: AppState.currentUser.nome } }),
    delete: (id) => apiCall(`/api/pedidos/${id}`, { method: 'DELETE', body: { editor_nome: AppState.currentUser.nome } })
};

export const sugestoesAPI = {
    create: (dados) => apiCall('/api/sugestoes/', { method: 'POST', body: dados }),
    update: (id, dados) => apiCall(`/api/sugestoes/${id}`, { method: 'PUT', body: dados }),
    delete: (id) => apiCall(`/api/sugestoes/${id}`, { method: 'DELETE', body: { editor_nome: AppState.currentUser.nome } }),
    atenderItens: (id, itens) => apiCall(`/api/sugestoes/${id}/atender-itens`, { method: 'POST', body: { itens } })
};

export const separacoesAPI = {
    create: (dados) => apiCall('/api/separacoes', { method: 'POST', body: dados }),
    update: (id, dados) => apiCall(`/api/separacoes/${id}`, { method: 'PUT', body: dados }),
    updateStatus: (id, status) => apiCall(`/api/separacoes/${id}/status`, { method: 'PUT', body: { status, editor_nome: AppState.currentUser.nome } }),
    addObservacao: (id, texto) => apiCall(`/api/separacoes/${id}/observacao`, { method: 'POST', body: { texto, autor: AppState.currentUser.nome, role: AppState.currentUser.role } }),
    getFila: () => apiCall('/api/separacoes/fila-separadores'),
    updateFila: (nomes) => apiCall('/api/separacoes/fila-separadores', { method: 'PUT', body: nomes })
};