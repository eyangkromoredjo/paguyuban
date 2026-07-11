import { db } from './firebase-config.js';
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { formatRp } from './utils.js';

let penggunaLogin = null;
let dataMaster = {
    anggota: [],
    arisan: { iuran_bulanan: [], pengeluaran: [] },
    transaksi: []
};

function updateTopbarUser() {
    const user = JSON.parse(sessionStorage.getItem('kromoredjo_user'));
    if (user) {
        penggunaLogin = user;
        const levelMap = { admin: '👑 Admin', pengurus: '🛡️ Pengurus', anggota: '🔑 Anggota', guest: '👤 Tamu' };
        const roleText = levelMap[user.level] || user.level;
        const topbarUserEl = document.getElementById('topbar-user');
        if (topbarUserEl) topbarUserEl.innerHTML = `${roleText}<br>${user.username}`;
    } else {
        window.location.href = '../dashboard.html';
    }
}

window.keluar = function() {
    sessionStorage.removeItem('kromoredjo_user');
    window.location.href = '../dashboard.html';
};

function populateLedgerFilters() {
    const monthNames = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    const now = new Date();
    const currentYear = now.getFullYear();
    const years = [];
    for (let y = 2021; y <= currentYear + 5; y++) years.push(y);

    ['mulai', 'sampai'].forEach(prefix => {
        const mEl = document.getElementById(`filter-${prefix}-bulan`);
        const yEl = document.getElementById(`filter-${prefix}-tahun`);
        if (!mEl || !yEl) return;
        mEl.innerHTML = '<option value="">-Bulan-</option>' + monthNames.map((num, idx) => `<option value="${String(idx+1).padStart(2,'0')}">${num}</option>`).join('');
        yEl.innerHTML = '<option value="">-Tahun-</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
    });
    resetFilterBukuKas();
}

window.resetFilterBukuKas = function() {
    const now = new Date();
    const searchEl = document.getElementById('search-ledger');
    if (searchEl) searchEl.value = '';
    
    document.getElementById('filter-mulai-bulan').value = '01';
    document.getElementById('filter-mulai-tahun').value = '';
    document.getElementById('filter-sampai-bulan').value = String(now.getMonth() + 1).padStart(2, '0');
    document.getElementById('filter-sampai-tahun').value = '';
    renderBukuKasArisan();
};


window.renderBukuKasArisan = function() {
    let transactions = [];

    // 1. Proses Pemasukan dari Iuran Bulanan (Sosial & Tabungan)
    const iuranBulanan = Array.isArray(dataMaster.arisan.iuran_bulanan) 
        ? dataMaster.arisan.iuran_bulanan 
        : Object.values(dataMaster.arisan.iuran_bulanan || {});

    iuranBulanan.forEach(bulan => {
        const pembayaran = Array.isArray(bulan.pembayaran) 
            ? bulan.pembayaran 
            : Object.values(bulan.pembayaran || {});

        let totalSosialPeriode = 0;
        let totalTabunganPeriode = 0;
        let jumlahOrangSosial = 0;
        let jumlahOrangTabungan = 0;
        // PERBAIKAN: Menggunakan tanggal akhir bulan dari periode, bukan tanggal 1.
        // Ini lebih akurat untuk merepresentasikan transaksi rekapitulasi bulanan.
        let tglPeriode;
        if (bulan.periode && bulan.periode.includes('-')) {
            const [year, month] = bulan.periode.split('-');
            // new Date(year, month, 0) akan menghasilkan tanggal terakhir dari bulan yang sesuai.
            // Contoh: jika month adalah '05' (Mei), parseInt(month) adalah 5. new Date(year, 5, 0) akan menghasilkan 31 Mei.
            const lastDay = new Date(year, parseInt(month), 0).getDate();
            tglPeriode = `${bulan.periode}-${String(lastDay).padStart(2, '0')}`;
        } else {
            tglPeriode = new Date().toISOString().split('T')[0]; // Fallback jika format periode tidak sesuai
        }

        pembayaran.forEach(p => {
            if (p.paid) {
                const member = dataMaster.anggota.find(a => String(a.id) === String(p.memberId));
                if (member) {
                    const kom = member.iuranKomponen || { sosial: false, tabungan: false };
                    const defaultNom = member.nominalIuran || { sosial: 10000, tabungan: 5000 };

                    // Correct logic: Prioritize overrideNominal if it exists, otherwise use member's default.
                    const sosialAmount = p.overrideNominal ? (p.overrideNominal.sosial || 0) : (kom.sosial ? (defaultNom.sosial || 10000) : 0);
                    if (sosialAmount > 0) {
                        totalSosialPeriode += sosialAmount;
                        jumlahOrangSosial++;
                    }

                    const tabunganAmount = p.overrideNominal ? (p.overrideNominal.tabungan || 0) : (kom.tabungan ? (defaultNom.tabungan || 5000) : 0);
                    if (tabunganAmount > 0) {
                        totalTabunganPeriode += tabunganAmount;
                        jumlahOrangTabungan++;
                    }
                }
            }
        });

        if (totalSosialPeriode > 0) {
            transactions.push({
                tanggal: tglPeriode,
                deskripsi: `Total pemasukan Dana Sosial (${bulan.periode}), ${jumlahOrangSosial} orang`,
                kategori: 'Dana Sosial',
                tipe: 'masuk',
                jumlah: totalSosialPeriode
            });
        }
        if (totalTabunganPeriode > 0) {
            transactions.push({
                tanggal: tglPeriode,
                deskripsi: `Total pemasukan Tabungan Mandiri (${bulan.periode}), ${jumlahOrangTabungan} orang`,
                kategori: 'Tabungan Mandiri',
                tipe: 'masuk',
                jumlah: totalTabunganPeriode
            });
        }
    });

    // 2. Proses Pengeluaran dari Buku Besar (hanya kategori 'Sosial')
    dataMaster.transaksi.forEach(t => {
        if (t.tipe === 'keluar' && t.kategori === 'Sosial') {
            transactions.push({
                tanggal: t.tanggal,
                deskripsi: t.deskripsi,
                kategori: 'Pengeluaran Sosial',
                tipe: 'keluar',
                jumlah: parseInt(t.jumlah) || 0
            });
        }
    });

    // 3. Filter dan Urutkan
    const cari = (document.getElementById('search-ledger')?.value || '').toLowerCase();
    if (cari) {
        transactions = transactions.filter(t => (t.deskripsi || '').toLowerCase().includes(cari));
    }

    const mBul = document.getElementById('filter-mulai-bulan')?.value;
    const mTah = document.getElementById('filter-mulai-tahun')?.value;
    const sBul = document.getElementById('filter-sampai-bulan')?.value;
    const sTah = document.getElementById('filter-sampai-tahun')?.value;

    if (mTah || sTah) {
        const startVal = (mTah ? parseInt(mTah) : 1981) * 12 + (mBul ? parseInt(mBul) : 1);
        const endVal = (sTah ? parseInt(sTah) : 2100) * 12 + (sBul ? parseInt(sBul) : 12);
        transactions = transactions.filter(t => {
            const dt = new Date(t.tanggal);
            if (isNaN(dt)) return false;
            const currentVal = dt.getFullYear() * 12 + (dt.getMonth() + 1);
            return currentVal >= startVal && currentVal <= endVal;
        });
    }

    transactions.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

    // 4. Render ke Tabel
    const body = document.getElementById('ledger-body');
    if (!body) return;

    let html = '', totalMasuk = 0, totalKeluar = 0;
    transactions.forEach(t => {
        const isMasuk = t.tipe === 'masuk';
        if (isMasuk) totalMasuk += t.jumlah; else totalKeluar += t.jumlah;

        html += `
            <tr>
                <td>${t.tanggal.split('-').reverse().join('/')}</td>
                <td>${t.deskripsi}</td>
                <td><span class="badge" style="background:rgba(201,168,76,0.1); color:var(--text-mid)">${t.kategori}</span></td>
                <td class="text-right txt-masuk">${isMasuk ? formatRp(t.jumlah) : '-'}</td>
                <td class="text-right txt-keluar">${!isMasuk ? formatRp(t.jumlah) : '-'}</td>
            </tr>`;
    });

    body.innerHTML = html || '<tr><td colspan="5" class="text-center" style="padding:2rem; opacity:0.5">Belum ada transaksi.</td></tr>';
    document.getElementById('ledger-total-masuk').textContent = formatRp(totalMasuk);
    document.getElementById('ledger-total-keluar').textContent = formatRp(totalKeluar);
    const saldo = totalMasuk - totalKeluar;
    document.getElementById('ledger-saldo-akhir').textContent = formatRp(saldo);
    document.getElementById('ledger-saldo-akhir').style.color = saldo >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
};

function initPage() {
    updateTopbarUser();
    populateLedgerFilters();

    onValue(ref(db), (snap) => {
        const val = snap.val();
        dataMaster.anggota = val.anggota ? Object.values(val.anggota) : [];
        dataMaster.arisan = val.arisan_global || { iuran_bulanan: [], pengeluaran: [] };
        dataMaster.transaksi = val.transaksi ? Object.values(val.transaksi) : [];
        renderBukuKasArisan();
    });
}

document.addEventListener('DOMContentLoaded', initPage);