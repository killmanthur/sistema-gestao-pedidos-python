// static/js/header-scroll.js
document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('header');
    if (!header) return;

    const scrollThreshold = 1; 

    const handleScroll = () => {
        if (window.scrollY > scrollThreshold) {
            header.classList.add('header-compact');
        } else {
            header.classList.remove('header-compact');
        }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Executa uma vez no início para o estado correto
});