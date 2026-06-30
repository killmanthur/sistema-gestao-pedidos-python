// static/js/autocomplete.js
// Autocomplete simples para um <input> de texto. Mostra um dropdown logo abaixo
// do campo, com os resultados MAIS parecidos primeiro (prefixo > início de
// palavra > contém). Reaproveita o visual de ".tag-suggestions".

const MAX_RESULTADOS = 8;

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Pontua quão bem "nome" casa com a busca "q". Menor = melhor. -1 = não casa.
function pontuar(nome, q) {
    const n = nome.toLowerCase();
    const idx = n.indexOf(q);
    if (idx === -1) return -1;
    if (n.startsWith(q)) return 0;                                   // prefixo
    if (new RegExp('\\b' + escapeRegex(q)).test(n)) return 1;        // início de palavra
    return 2;                                                        // contém
}

/**
 * Liga o autocomplete a um input.
 * @param {HTMLInputElement} input
 * @param {() => string[]} getItens  função que devolve a lista atual de nomes
 */
export function attachAutocomplete(input, getItens) {
    if (!input || input.dataset.acLigado) return;
    input.dataset.acLigado = '1';
    input.setAttribute('autocomplete', 'off');
    input.removeAttribute('list');   // garante que o datalist nativo não apareça

    // O dropdown é posicionado em relação ao container do input.
    const parent = input.parentElement;
    if (parent && getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
    }

    const lista = document.createElement('ul');
    lista.className = 'tag-suggestions';
    (parent || input).appendChild(lista);

    let resultados = [];
    let ativo = -1;

    function fechar() {
        lista.classList.remove('open');
        lista.innerHTML = '';
        ativo = -1;
    }

    function abrir() {
        const q = input.value.trim().toLowerCase();
        if (!q) return fechar();

        resultados = (getItens() || [])
            .map(nome => ({ nome, p: pontuar(nome, q) }))
            .filter(o => o.p !== -1)
            .sort((a, b) =>
                a.p - b.p ||
                a.nome.toLowerCase().indexOf(q) - b.nome.toLowerCase().indexOf(q) ||
                a.nome.localeCompare(b.nome))
            .slice(0, MAX_RESULTADOS)
            .map(o => o.nome);

        if (resultados.length === 0) return fechar();

        lista.innerHTML = resultados.map((n, i) =>
            `<li data-i="${i}">${escapeHtml(n)}</li>`).join('');
        lista.classList.add('open');
        ativo = -1;
    }

    function escolher(nome) {
        input.value = nome;
        fechar();
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    input.addEventListener('input', abrir);
    input.addEventListener('focus', () => { if (input.value.trim()) abrir(); });
    input.addEventListener('blur', () => setTimeout(fechar, 150));

    input.addEventListener('keydown', (e) => {
        const itens = Array.from(lista.querySelectorAll('li'));
        if (!lista.classList.contains('open') || itens.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            ativo = Math.min(ativo + 1, itens.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            ativo = Math.max(ativo - 1, 0);
        } else if (e.key === 'Enter') {
            if (ativo >= 0) { e.preventDefault(); escolher(resultados[ativo]); }
            return;
        } else if (e.key === 'Escape') {
            fechar();
            return;
        } else {
            return;
        }
        itens.forEach((li, i) => li.classList.toggle('active', i === ativo));
        itens[ativo]?.scrollIntoView({ block: 'nearest' });
    });

    lista.addEventListener('mousedown', (e) => {
        const li = e.target.closest('li');
        if (!li) return;
        e.preventDefault();   // evita o blur antes do clique
        escolher(resultados[Number(li.dataset.i)]);
    });
}
