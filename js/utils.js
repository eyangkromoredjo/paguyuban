export function formatRp(n) {
    return 'Rp ' + (parseInt(n) || 0).toLocaleString('id-ID');
}

export function toast(msg) {
    const t = document.getElementById('toast');
    if (t) {
        t.textContent = msg;
        t.classList.add('tampil');
        setTimeout(() => t.classList.remove('tampil'), 3000);
    } else {
        console.warn("Toast element not found. Message:", msg);
    }
}

export function cleanNumber(s) {
    if (!s) return 0;
    return parseInt(s.toString().replace(/\D/g, '')) || 0;
}

export function applyMask(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
        let val = el.value.replace(/\D/g, '');
        el.value = val ? parseInt(val).toLocaleString('id-ID') : '';
    });
}

export function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input || !btn) return;

    const eyeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeOffIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`;

    if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = eyeOffIcon;
    } else {
        input.type = 'password';
        btn.innerHTML = eyeIcon;
    }
}