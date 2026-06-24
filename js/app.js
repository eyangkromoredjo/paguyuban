import { db } from './firebase-config.js';

import { ref, get, set, update, push, remove, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

import { formatRp, toast, cleanNumber, applyMask } from './utils.js';



// 1. KONFIGURASI AKUN MASTER & HAK AKSES

// PERINGATAN KEAMANAN: Akun master dengan password yang di-hardcode di sisi klien sangat tidak aman.
// Siapapun dapat melihatnya. Sebaiknya, kelola semua akun (termasuk admin) di dalam database Firebase
// dan berikan mereka level 'admin' atau 'pengurus'.
const AKUN_MASTER = []; // Dikosongkan untuk keamanan



const HAK_AKSES = {

  admin:    { tambah: true,  edit: true,  hapus: true,  kelolaAkun: true },

  pengurus: { tambah: true,  edit: true,  hapus: false, kelolaAkun: false },

  anggota:  { tambah: true,  edit: false, hapus: false, kelolaAkun: false },

  guest:    { tambah: false, edit: false, hapus: false, kelolaAkun: false }

};



let penggunaLogin = null;

let filterAktif = 'semua', idHapusPending = null;

let openedCardMemberIds = []; // Track opened cards untuk preserve state saat re-render



// 2. FUNGSI DATABASE UTAMA

window.ambilData = async function() {

  const snapshot = await get(ref(db, "anggota"));

  return snapshot.exists() ? Object.values(snapshot.val()) : [];

};



async function catatLog(aksi, detail = "") {

  if (!penggunaLogin) return;

  try {

    const logRef = push(ref(db, "logs"));

    await set(logRef, {

      waktu: Date.now(),

      nama: penggunaLogin.username,

      level: penggunaLogin.level,

      aksi: aksi,

      detail: detail

    });

  } catch (e) { console.error("Gagal mencatat log:", e); }

}



async function simpanSatu(anggota) {

  await set(ref(db, "anggota/" + anggota.id), anggota);

}



// 3. LOGIKA LOGIN

window.handleLogin = async function() {

  const uInput = document.getElementById('input-username').value.trim().toLowerCase();

  const pInput = document.getElementById('input-pass').value;

  

  // Cek Akun Master

  const master = AKUN_MASTER.find(a => a.username.toLowerCase() === uInput && a.password === pInput);

  if (master) return proceedLogin(master);



  // Cek Anggota di Firebase

  const data = await window.ambilData();

  const user = data.find(m =>

    m.bolehDaftar &&

    m.password === pInput &&

    (

      (m.nama && m.nama.toLowerCase() === uInput) ||

      (m.panggilan && m.panggilan.toLowerCase() === uInput)

    )

  );



  if (user) {

    proceedLogin({

      id: user.id,

      username: user.panggilan,

      nama: user.nama,

      level: user.level || 'anggota'

    });

  } else {

    document.getElementById('pesan-error').style.display = 'block';

    toast("Login Gagal: Username atau Password salah.");

  }

};



function proceedLogin(akun) {

  penggunaLogin = akun;

  console.log('[DEBUG] User login:', akun);
  console.log('[DEBUG] User level:', akun.level);
  console.log('[DEBUG] Hak akses:', HAK_AKSES[akun.level]);

  sessionStorage.setItem('kromoredjo_user', JSON.stringify(akun));

  document.getElementById('halaman-login').classList.remove('aktif');

  document.getElementById('halaman-app').classList.add('aktif');

  

  // Setup UI berdasarkan level

  const levelMap = { admin: '👑 Admin', pengurus: '🛡️ Pengurus', anggota: '🔑 Anggota', guest: '👤 Tamu' };

  const roleText = levelMap[akun.level] || akun.level;

  document.getElementById('topbar-user').innerHTML = `${roleText}<br>${akun.username}`;

  

  // Tampilkan Grid Layanan di Dashboard jika bukan Guest

  const serviceGrid = document.getElementById('dash-service-grid');

  if (serviceGrid) serviceGrid.style.display = (akun.level !== 'guest') ? 'block' : 'none';



  const canAdd = HAK_AKSES[akun.level]?.tambah;

  if(document.getElementById('btn-tambah-anggota')) 

    document.getElementById('btn-tambah-anggota').style.display = canAdd ? 'flex' : 'none';



  const shortcutLogs = document.getElementById('shortcut-logs');

  if(shortcutLogs) shortcutLogs.style.display = akun.level === 'admin' ? 'flex' : 'none';



  const navLaporan = document.getElementById('nav-laporan');

  // Kontrol visibilitas sub-laporan untuk anggota

  const isAnggota = akun.level === 'anggota';



  // Kontrol visibilitas sub-manajemen arisan untuk anggota (Dashboard)

  ['sub-nav-iuran-arisan', 'sub-nav-pengeluaran-arisan', 'sub-nav-tipe-arisan', 'sub-nav-penerima-arisan'].forEach(id => {

    const el = document.getElementById(id);

    if (el) el.style.display = isAnggota ? 'none' : 'flex';

  });



  ['sub-nav-iuran', 'sub-nav-pengeluaran', 'sub-nav-siklus', 'sub-nav-putaran'].forEach(id => {

    const el = document.getElementById(id);

    if (el) el.style.display = isAnggota ? 'none' : 'flex';

  });



  const btnClearLedger = document.getElementById('btn-bersihkan-ledger');

  if(btnClearLedger) btnClearLedger.style.display = HAK_AKSES[akun.level]?.hapus ? 'inline-block' : 'none';



  const accessBox = document.getElementById('dash-admin-access');

  if(accessBox) accessBox.style.display = akun.level === 'admin' ? 'block' : 'none';



  const btnClearLogs = document.getElementById('btn-bersihkan-log');

  if(btnClearLogs) btnClearLogs.style.display = akun.level === 'admin' ? 'inline-block' : 'none';



  const dashPengurus = document.getElementById('dash-pengurus-section');

  if(dashPengurus) {

    const displayStyle = (akun.level !== 'guest') ? 'block' : 'none';

    dashPengurus.style.display = displayStyle;

    console.log(`[DEBUG] dash-pengurus-section display set to: ${displayStyle} for user level: ${akun.level}`);

  }



  applyMask('input-nominal');

  applyMask('trx-jumlah');



  startRealtimeStats(); // Sekarang fungsi ini pasti terpanggil

  toast('Selamat datang, ' + akun.nama);

  catatLog("Login", "Masuk ke aplikasi");

}



window.toggleLaporanSubmenu = function() {

  const submenu = document.getElementById('laporan-submenu');

  const chevron = document.getElementById('laporan-chevron');

  const isClosed = !submenu.style.maxHeight || submenu.style.maxHeight === '0px';



  if (isClosed) {

    submenu.style.maxHeight = '500px';

    submenu.style.opacity = '1';

    submenu.style.marginBottom = '0.5rem';

    chevron.style.transform = 'rotate(0deg)';

  } else {

    submenu.style.maxHeight = '0px';

    submenu.style.opacity = '0';

    submenu.style.marginBottom = '0';

    chevron.style.transform = 'rotate(-90deg)';

  }

};



function renderAccessCards(dataAnggota) {

  const body = document.getElementById('access-table-body');

  if (!body || penggunaLogin?.level !== 'admin') return;



  let html = '';

  // 1. Tampilkan Akun Master Statis

  AKUN_MASTER.forEach(a => {

    html += `

      <tr>

        <td style="padding: 0.7rem 0.8rem; border-bottom: 1px solid rgba(201,168,76,0.1); font-size: 0.75rem; vertical-align: middle;"><strong>${a.nama}</strong><br><small style="opacity:0.6;">@${a.username}</small></td>

        <td style="padding: 0.7rem 0.8rem; border-bottom: 1px solid rgba(201,168,76,0.1); vertical-align: middle;"><span class="badge" style="background:var(--em); color:var(--ct); font-size:0.55rem; padding: 2px 6px; border-radius:4px; font-family:'Cinzel'; font-weight:bold;">${a.level.toUpperCase()}</span></td>

        <td style="padding: 0.7rem 0.8rem; border-bottom: 1px solid rgba(201,168,76,0.1); font-size: 0.65rem; opacity: 0.7; font-style: italic; vertical-align: middle;">Akun Master Sistem</td>

      </tr>`;

  });



  // 2. Tampilkan Anggota yang memiliki akses login

  dataAnggota

    .filter(a => a.bolehDaftar)

    .sort((a, b) => {

      const levelA = a.level || 'anggota';

      const levelB = b.level || 'anggota';



      // Urutkan berdasarkan level: pengurus dulu, baru anggota

      if (levelA !== levelB) {

        if (levelA === 'pengurus') return -1;

        if (levelB === 'pengurus') return 1;

      }



      // Jika level sama, urutkan berdasarkan Nama/Panggilan A-Z

      const namaA = (a.panggilan || a.nama).toLowerCase();

      const namaB = (b.panggilan || b.nama).toLowerCase();

      return namaA.localeCompare(namaB);

    })

    .forEach(a => {

    html += `

      <tr>

        <td style="padding: 0.7rem 0.8rem; border-bottom: 1px solid rgba(201,168,76,0.1); font-size: 0.75rem; vertical-align: middle;"><strong>${a.panggilan || a.nama}</strong>${a.jabatan ? `<br><small style="color:var(--em); font-weight:600;">${a.jabatan}</small>` : ''}</td>

        <td style="padding: 0.7rem 0.8rem; border-bottom: 1px solid rgba(201,168,76,0.1); vertical-align: middle;"><span class="badge" style="background:rgba(201,168,76,0.1); color:var(--em); font-size:0.55rem; padding: 2px 6px; border:1px solid rgba(201,168,76,0.3); border-radius:4px; font-family:'Cinzel'; font-weight:bold;">${(a.level || 'anggota').toUpperCase()}</span></td>

        <td style="padding: 0.7rem 0.8rem; border-bottom: 1px solid rgba(201,168,76,0.1); font-size: 0.65rem; opacity: 0.7; font-style: italic; vertical-align: middle;">Anggota Trah</td>

      </tr>`;

  });

  body.innerHTML = html;

}



function renderPengurusDashboard(dataAnggota) {

  const body = document.getElementById('dash-pengurus-body');

  if (!body) return;

  console.log("[DEBUG] renderPengurusDashboard called. Total anggota:", dataAnggota.length);



  // Ambil hanya anggota yang levelnya admin atau pengurus

  const officers = dataAnggota

    .filter(a => a.level === 'admin' || a.level === 'pengurus')

    .sort((a, b) => (a.jabatan || 'zzz').localeCompare(b.jabatan || 'zzz'));



  body.innerHTML = officers.map(o => `

    <tr>

      <td style="padding: 0.8rem; border-bottom: 1px solid var(--border); font-size: 0.8rem;"><strong>${o.nama}</strong><br><small style="color:var(--text-light); font-size:0.6rem;">${o.level.toUpperCase()}</small></td>

      <td style="padding: 0.8rem; border-bottom: 1px solid var(--border); font-size: 0.8rem; color: var(--primary); font-weight: 700;">${o.jabatan || (o.level === 'admin' ? 'Penasehat' : 'Anggota Pengurus')}</td>

    </tr>

  `).join('');

  console.log("[DEBUG] Officers found for dashboard:", officers.length, officers);



  if (officers.length === 0) {

    body.innerHTML = `<tr><td colspan="2" style="text-align:center; padding:1rem; opacity:0.7;">Belum ada pengurus yang ditetapkan.</td></tr>`;

  }

}



window.keluar = function() {

  sessionStorage.removeItem('kromoredjo_user');

  window.location.reload();

};



// ══ LOGIKA ARISAN & PERIODE ══

window.bukaSettingNominal = async function() {

    const snap = await get(ref(db, "settings/arisan"));

    const n = snap.exists() ? snap.val().nominal : 0;

    const inputNominal = document.getElementById('input-nominal');

    if(inputNominal) inputNominal.value = n ? n.toLocaleString('id-ID') : '';

    window.bukaModal('modal-nominal');

};



window.simpanNominal = async function() {

    const n = cleanNumber(document.getElementById('input-nominal').value);

    if(!n || n < 1) return toast('Masukkan nominal valid.');

    await set(ref(db, "settings/arisan"), { nominal: n });

    await window.updateLabelNominal();

    catatLog("Update Iuran", "Mengubah nominal iuran menjadi " + formatRp(n));

    window.tutupModal('modal-nominal');

    toast('Nominal iuran disimpan.');

    

    // Reset tampilan daftar anggota ke semula

    filterAktif = 'semua';

    const searchInput = document.getElementById('search-anggota');

    if (searchInput) searchInput.value = '';

    document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('aktif'));

    const btnSemua = document.querySelector('.fbtn[onclick*="semua"]');

    if (btnSemua) btnSemua.classList.add('aktif');

    window.renderAnggota();

};



window.updateLabelNominal = async function() {

    const snap = await get(ref(db, "settings/arisan"));

    const n = snap.exists() ? snap.val().nominal : 0;

    const label = document.getElementById('label-nominal');

    if(label) label.textContent = n ? formatRp(n) : 'Belum diatur';

};



window.bukaBuatPeriode = function() {

    const now = new Date();

    document.getElementById('input-bulan').value = now.getMonth() + 1;

    document.getElementById('input-tahun').value = now.getFullYear();

    window.bukaModal('modal-periode');

};



window.simpanPeriode = async function() {

    const bulan = document.getElementById('input-bulan').value;

    const tahun = document.getElementById('input-tahun').value;

    const key = `${tahun}_${bulan}`;

    

    const snap = await get(ref(db, "arisan"));

    const arisan = snap.val() || {};

    if(arisan[key]) return toast('Periode sudah ada.');



    const dataAnggota = await window.ambilData();

    const aktif = dataAnggota.filter(a => a.kehidupan !== 'wafat' && a.status === 'aktif');

    

    const pData = {

        id: key, bulan, tahun, status: 'berjalan', pemenang: null,

        pembayaran: aktif.map(a => ({ id: a.id, nama: a.nama, generasi: a.generasi, lunas: false }))

    };

    await set(ref(db, "arisan/" + key), pData);

    window.tutupModal('modal-periode');

    catatLog("Buat Arisan", "Membuka periode arisan " + key);

    await window.renderPeriode();

    toast('Periode arisan dibuat.');

};



window.renderPeriode = async function() {

    await window.updateLabelNominal();

    const snap = await get(ref(db, "arisan"));

    const arisan = snap.val() || {};

    const keys = Object.keys(arisan).sort().reverse();

    const container = document.getElementById('daftar-periode');

    if(!container) return;

    

    if(!keys.length) {

        container.innerHTML = '<div class="kosong-info">Belum ada periode arisan.</div>';

        return;

    }

    

    const nominalSnap = await get(ref(db, "settings/arisan"));

    const nominal = nominalSnap.exists() ? nominalSnap.val().nominal : 0;



    container.innerHTML = `<div class="periode-grid">${keys.map(k => kartuPeriode(arisan[k], nominal)).join('')}</div>`;

};



function kartuPeriode(p, nominal) {

    const list = p.pembayaran || [];

    const lunas = list.filter(x => x.lunas).length;

    const total = list.length;

    const pct = total ? Math.round(lunas/total*100) : 0;

    const selesai = p.status === 'selesai';

    const BULAN_NM = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    

    return `

      <div class="periode-card ${selesai ? '' : 'aktif-periode'}">

        <div class="periode-header">

          <p class="periode-bulan">${BULAN_NM[p.bulan]} ${p.tahun}</p>

          <span class="periode-badge ${p.status}">${selesai ? 'Selesai' : 'Berjalan'}</span>

        </div>

        <div class="periode-stats" style="display:flex; gap:10px; font-size:0.8rem; margin-bottom:10px;">

            <span>Lunas: ${lunas}</span> <span>Belum: ${total-lunas}</span>

        </div>

        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>

        <div class="periode-aksi" style="margin-top:10px;">

            <button class="btn-sm solid" onclick="window.bukaDetail('${p.id}')">Detail</button>

        </div>

      </div>`;

}



function kartu(anggota) {

    const isMale = anggota.gender === 'L' || anggota.jenisKelamin === 'L' || anggota.gender === 'Laki-laki' || anggota.jenisKelamin === 'Laki-laki';

    const genderClass = isMale ? 'male' : 'female';

    const inisial = (anggota.nama || '??').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

    const lahirRaw = anggota.lahir || anggota.tanggalLahir || '';

    const lahir = lahirRaw ? new Date(lahirRaw).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

    const urutanVal = anggota.urutan || anggota.urutan_anak;

    const urutanTeks = urutanVal ? `<p class="a-urutan">✦ Anak ke-${urutanVal}</p>` : '';

    const statusKey = anggota.kehidupan === 'wafat' || anggota.status === 'wafat' ? 'wafat-b' : ((anggota.kehidupan === 'aktif' || anggota.status === 'aktif') ? 'aktif' : 'tidak-aktif');

    const statusLabel = statusKey === 'wafat-b' ? 'Wafat' : statusKey === 'aktif' ? 'Aktif' : 'Tidak Aktif';

    const wafatIcon = statusKey === 'wafat-b' ? '🪦 ' : '';



    return `

      <div class="a-card ${genderClass}">

        <div class="a-top">

          <div class="a-avatar">${inisial}</div>

          <div>

            <p class="a-nama">${wafatIcon}${anggota.nama || '-'}</p>

            <p class="a-panggilan">${anggota.panggilan ? '"' + anggota.panggilan + '"' : ''}</p>

          </div>

        </div>

        ${urutanTeks}

        <div class="a-info">

          ${anggota.hp ? `📱 ${anggota.hp}<br>` : ''}

          ${lahir ? `🎂 ${lahir}<br>` : ''}

          ${anggota.alamat ? `📍 ${anggota.alamat}` : ''}

        </div>

        <div class="a-badges">

          <span class="badge ${statusKey}">${statusLabel}</span>

          ${anggota.bolehDaftar ? '<span class="badge trah">Trah</span>' : ''}

          ${anggota.bolehDaftar ? '<span class="badge aktif">Login Aktif</span>' : '<span class="badge tidak-aktif">Login Mati</span>'}

        </div>

        ${(penggunaLogin?.level === 'admin' || penggunaLogin?.level === 'pengurus') ? `

          <div class="a-aksi" style="margin-top:0.85rem; display:flex; gap:0.6rem; flex-wrap:wrap;">

            <button onclick="window.bukaEdit('${anggota.id}')" style="padding:0.5rem 1rem; background:var(--emas); color:var(--coklat-tua); border:none; border-radius:6px; font-weight:600; cursor:pointer; font-size:0.8rem;">✏ Edit</button>

            ${penggunaLogin?.level === 'admin' ? `<button onclick="window.bukaKonfirmasiHapus('${anggota.id}', '${anggota.nama.replace(/'/g, "\\'")}')" style="padding:0.5rem 1rem; background:#E05C5C; color:#FFF; border:none; border-radius:6px; font-weight:600; cursor:pointer; font-size:0.8rem;">🗑 Hapus</button>` : ''}

          </div>

        ` : ''}

        ${penggunaLogin?.level === 'admin' ? `

          <div class="a-akses-control" style="margin-top:0.85rem; display:flex; flex-direction:column; gap:0.5rem;">

            <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.78rem; color:var(--text-dark);">

              <input type="checkbox" onchange="window.toggleIzinDaftar('${anggota.id}', this.checked)" ${anggota.bolehDaftar ? 'checked' : ''}>

              Izinkan login anggota

            </label>

            ${anggota.bolehDaftar ? `

              <div style="display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center; font-size:0.72rem; color:var(--text-muted);">

                <span>Username: ${anggota.panggilan ? anggota.panggilan.toLowerCase() : '-'} </span>

                <span>Password: ${anggota.password ? anggota.password : '(otomatis)'}</span>

              </div>

            ` : ''}

            <div style="display:flex; flex-wrap:wrap; gap:0.6rem; align-items:center; margin-top:0.4rem; font-size:0.72rem; color:var(--text-muted);">

              <label style="display:flex; flex-direction:column; gap:0.25rem;">

                <span style="font-size:0.68rem; opacity:0.8;">Hak Akses</span>

                <select onchange="window.updateLevelAnggota('${anggota.id}', this.value)" ${!anggota.bolehDaftar ? 'disabled' : ''} style="padding:0.45rem 0.6rem; border-radius:8px; border:1px solid var(--emas); background: var(--cokelat-sogan); color: var(--krem-hangat); min-width:130px; ${!anggota.bolehDaftar ? 'opacity: 0.7; cursor: not-allowed;' : 'cursor: pointer;'}">

                  <option value="anggota" ${anggota.level === 'anggota' ? 'selected' : ''}>Anggota</option>

                  <option value="pengurus" ${anggota.level === 'pengurus' ? 'selected' : ''}>Pengurus</option>

                  <option value="admin" ${anggota.level === 'admin' ? 'selected' : ''}>Admin</option>

                </select>

              </label>

            </div>

          </div>

        ` : ''}

      </div>`;

}



window.bukaDetail = async function(id) {

    const snap = await get(ref(db, `arisan/${id}`));

    if(!snap.exists()) return;

    const p = snap.val();

    document.getElementById('detail-judul').textContent = `Detail Arisan ${id}`;

    const tbody = document.getElementById('tabel-bayar-body');

    const list = p.pembayaran || [];

    

    tbody.innerHTML = list.map(x => `

        <tr>

            <td>${x.nama}</td>

            <td>Gen ${x.generasi}</td>

            <td>

                <span class="status-bayar ${x.lunas ? 'lunas' : 'belum'}" 

                      onclick="${p.status !== 'selesai' ? `window.toggleBayar('${id}','${x.id}')` : ''}">

                    ${x.lunas ? 'Lunas' : 'Belum'}

                </span>

            </td>

        </tr>

    `).join('');

    window.bukaModal('modal-detail');

};



window.toggleBayar = async function(pid, aid) {

    const snap = await get(ref(db, `arisan/${pid}`));

    const p = snap.val();

    const list = p.pembayaran || [];

    const item = list.find(x => String(x.id) === String(aid));

    if(item) item.lunas = !item.lunas;

    await set(ref(db, `arisan/${pid}`), p);

    catatLog("Update Bayar", `Mengubah status bayar ${item.nama} pada periode ${pid}`);

    window.bukaDetail(pid);

    window.renderPeriode();

};



// 4. LOGIKA IZIN AKSES (OTOMATIS PASSWORD)

window.toggleIzinDaftar = async function(id, val) {

  if (!HAK_AKSES[penggunaLogin.level]?.kelolaAkun) return toast("Hanya Admin yang bisa memberi akses.");

  

  const d = await window.ambilData();

  const a = d.find(x => String(x.id) === String(id));

  if(!a) return;



  if (val) {

    // Cegah pemberian akses jika anggota sudah wafat

    if (a.kehidupan === 'wafat') {

      toast("Gagal: Anggota yang sudah wafat tidak dapat diberi izin akses.");

      window.renderAnggota(); // Render ulang untuk meriset UI checkbox

      return;

    }

    const tgl = a.tanggalLahir || a.lahir;

    if (!tgl || !a.panggilan) {

      alert('Gagal: Anggota harus punya Nama Panggilan dan Tgl Lahir untuk membuat password otomatis.');

      window.renderAnggota(); 

      return;

    }

    

    // Generate: panggilan + tahun lahir (contoh: budi1990)

    const tahun = tgl.split('-')[0];

    a.password = a.panggilan.toLowerCase() + tahun;

    a.level = a.level || 'anggota';

    a.bolehDaftar = true;

    toast('Akses Aktif! Username: ' + a.panggilan + ', Pass: ' + a.password);

    catatLog("Akses Login", "Memberikan izin login ke " + a.nama);

  } else {

    a.bolehDaftar = false;

    a.password = null;

    toast('Akses login dicabut.');

  }



  await simpanSatu(a);

  await window.renderAnggota(); // <-- TAMBAHKAN BARIS INI

};



window.updateLevelAnggota = async function(id, newLevel) {

  if (!HAK_AKSES[penggunaLogin.level]?.kelolaAkun) return toast("Hanya Admin yang bisa mengelola level.");

  

  const d = await window.ambilData();

  const a = d.find(x => String(x.id) === String(id));

  if(!a) return;

  if (!a.bolehDaftar) return toast("Aktifkan terlebih dahulu izin login sebelum memilih level.");



  a.level = newLevel;

  await simpanSatu(a);

  toast(`Level ${a.nama} diperbarui menjadi ${newLevel.toUpperCase()}.`);

  await window.renderAnggota();

};



// Expand/Collapse All Cards

window.expandAllCards = function() {

  document.querySelectorAll('.a-card-stack').forEach(card => {

    card.classList.add('terbuka');

  });

  toast('Semua kartu dibuka');

};



window.collapseAllCards = function() {

  document.querySelectorAll('.a-card-stack').forEach(card => {

    card.classList.remove('terbuka');

  });

  toast('Semua kartu ditutup');

};



window.updateJabatanAnggota = async function(id, newJabatan) {

  if (!HAK_AKSES[penggunaLogin.level]?.kelolaAkun) return;

  const data = await window.ambilData();

  const a = data.find(x => String(x.id) === String(id));

  if(!a) return;

  a.jabatan = newJabatan.trim();

  await simpanSatu(a);

  toast(`Jabatan untuk ${a.nama} telah disimpan.`);

  await window.renderAnggota(); // Render ulang untuk menampilkan perubahan

};



// Daftar Jabatan Terstruktur

const JABATAN_LIST = [

  { group: "Struktur Inti", roles: ["Penasihat", "Ketua Paguyuban", "Wakil Ketua", "Sekretaris", "Bendahara"] },

  { group: "Seksi / Divisi", roles: ["Seksi Humas", "Seksi Acara", "Seksi Konsumsi", "Seksi Dana & Sosial", "Seksi Dokumentasi"] },

  { group: "Koordinator", roles: ["Koordinator Wilayah", "Perwakilan Generasi"] }

];



// Fungsi untuk membuat HTML dropdown jabatan

function generateJabatanOptions(selectedValue = "") {

  let optionsHtml = `<option value="">-- Pilih Jabatan --</option>`;

  JABATAN_LIST.forEach(cat => {

    optionsHtml += `<optgroup label="${cat.group}">`;

    cat.roles.forEach(role => {

      optionsHtml += `<option value="${role}" ${selectedValue === role ? 'selected' : ''}>${role}</option>`;

    });

    optionsHtml += `</optgroup>`;

  });

  return optionsHtml;

}



window.tambahJabatanPengurus = async function() {

  if (!HAK_AKSES[penggunaLogin.level]?.kelolaAkun) return toast("Hanya Admin yang bisa menambah jabatan.");

  const id = document.getElementById('select-calon-pengurus').value;

  const jabatan = document.getElementById('select-jabatan-baru').value;



  if (!id || !jabatan) return toast("Harap pilih anggota dan isi nama jabatan.");



  const d = await window.ambilData();

  const a = d.find(x => String(x.id) === String(id));

  if(!a) return;



  a.level = 'pengurus';

  a.jabatan = jabatan;

  await simpanSatu(a);

  const action = a.level === 'pengurus' ? 'diperbarui' : 'ditambahkan';

  toast(`${a.nama} telah ${action} sebagai ${jabatan}.`);

  await window.renderAnggota(); // Render ulang untuk menampilkan perubahan

};



window.hapusJabatanPengurus = async function(id) {

  if (!HAK_AKSES[penggunaLogin.level]?.kelolaAkun) return toast("Hanya Admin yang bisa mencopot jabatan.");

  if (!confirm('Anda yakin ingin mencopot jabatan dari anggota ini? Mereka akan kembali menjadi anggota biasa.')) return;



  const d = await window.ambilData();

  const a = d.find(x => String(x.id) === String(id));

  if(!a) return;



  a.level = 'anggota';

  a.jabatan = ''; // Hapus jabatan

  await simpanSatu(a);

  toast(`${a.nama} telah dicopot dari jabatannya.`);

  await window.renderAnggota(); // Render ulang untuk menampilkan perubahan

}



// 5. UI & RENDER

window.renderAnggota = async function() {

  const data = await window.ambilData();

  

  // SIMPAN STATE CARD YANG TERBUKA SEBELUM RENDER (PALING AWAL!)

  const openedStackIds = new Set();

  document.querySelectorAll('.a-card-stack.terbuka').forEach(cardStack => {

    const id = cardStack.getAttribute('data-anggota-id');

    if (id) openedStackIds.add(id);

  });



  // LOGIKA KHUSUS HALAMAN PENGURUS (MANAJEMEN JABATAN)

  if (filterAktif === 'pengurus') {

    const container = document.getElementById('daftar-pengurus');

    if (!container) return;

    console.log('[DEBUG] Rendering jabatan pengurus. User level:', penggunaLogin?.level);
    console.log('[DEBUG] Admins and pengurus found:', data.filter(a => a.level === 'admin' || a.level === 'pengurus').length);

    const adminsAndPengurus = data.filter(a => a.level === 'admin' || a.level === 'pengurus');

    const isAdmin = penggunaLogin.level === 'admin';

    console.log('[DEBUG] isAdmin:', isAdmin);



    let html = `<style>
      .tabel-jabatan { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
      .tabel-jabatan th { 
        font-family: 'Outfit', sans-serif; 
        font-size: 0.65rem; 
        font-weight: 700; 
        color: #c9a84c; 
        text-transform: uppercase; 
        letter-spacing: 0.05em; 
        padding: 0.75rem 1rem; 
        text-align: left; 
        border-bottom: 2px solid rgba(201,168,76,0.3); 
        background: rgba(201,168,76,0.1);
      }
      .tabel-jabatan td { 
        padding: 0.75rem 1rem; 
        border-bottom: 1px solid rgba(201,168,76,0.2); 
        color: #f5ecd7; 
        font-size: 0.85rem;
      }
      .tabel-jabatan tr:hover { background: rgba(201,168,76,0.15); }
      .badge-level { 
        background: rgba(201,168,76,0.2); 
        color: #c9a84c; 
        font-size: 0.5rem; 
        padding: 2px 6px; 
        border-radius: 3px; 
        font-weight: 700; 
        letter-spacing: 0.5px;
        border: 1px solid rgba(201,168,76,0.3);
      }
      @media (max-width: 768px) {
        .tabel-jabatan th, .tabel-jabatan td { padding: 0.5rem; font-size: 0.75rem; }
        .tambah-jabatan-grid { grid-template-columns: 1fr !important; }
      }
    </style>

    <div class="panel" style="background:rgba(201,168,76,0.05); border:1px solid #c9a84c; padding:1.5rem; border-radius:12px;">

      <h3 style="font-family:'Cinzel'; color:#c9a84c; margin-bottom:0.5rem; font-size:1rem;">Daftar Jabatan Pengurus</h3>

      <p style="font-size:0.75rem; color:#f5ecd7; margin-bottom:1.5rem; line-height:1.4;">${canManage ? 'Admin: Silakan isi kolom jabatan sesuai hasil kesepakatan rapat.' : 'Berikut adalah nama-nama yang mendapatkan amanah kepengurusan.'}</p>

      <div class="table-wrapper" style="border-radius: 8px; overflow-x: auto; border: 1px solid var(--border);">
        <table class="tabel-jabatan">
          <thead>
            <tr>
              <th style="width: 35%;">Nama Pengurus</th>
              <th style="width: 45%;">Jabatan Organisasi</th>
              <th style="width: 20%; text-align: right;">Aksi</th>
            </tr>
          </thead>
          <tbody>
      `;

    if (adminsAndPengurus.length === 0) {
      html += `
        <tr>
          <td colspan="3" style="text-align:center; padding:2rem 1rem; color:var(--cb); font-style:italic; font-size:0.85rem;">
            Belum ada pengurus yang ditetapkan.<br>
            <span style="font-size:0.75rem; opacity:0.7;">${canManage ? 'Gunakan form di bawah untuk menambahkan pengurus.' : 'Hubungi Admin untuk penetapan jabatan.'}</span>
          </td>
        </tr>`;
    } else {
      adminsAndPengurus.forEach(a => {
        html += `<tr>
          <td>
            <strong style="color:var(--text-dark); font-size:0.9rem;">${a.nama}</strong><br>
            <span class="badge-level">${a.level.toUpperCase()}</span>
          </td>
          <td>
            ${canManage ? `
            <div style="display:flex; gap:8px; align-items:center;">
              <select id="jabatan-select-${a.id}" style="flex:1; padding:8px; background:rgba(0,0,0,0.2); border:1px solid var(--em); color:white; border-radius:6px; font-size:0.85rem;">
                ${generateJabatanOptions(a.jabatan)}
              </select>
              <button class="btn-sm solid" onclick="window.updateJabatanAnggota('${a.id}', document.getElementById('jabatan-select-${a.id}').value)">✏ Ubah</button>
            </div>
            ` : `<span style="color:var(--em); font-weight:600; font-size:0.9rem;">${a.jabatan || '<em style="opacity:0.5; font-weight:normal; color: var(--cb);">Belum ada jabatan</em>'}</span>`
            }
          </td>
          <td style="text-align: right;">
            ${canManage ? `
            <button class="btn-sm danger" onclick="window.hapusJabatanPengurus('${a.id}')"
              style="padding:6px 12px; background:#E53935; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:0.75rem; font-weight:600; display:inline-block;">
              🗑 Hapus
            </button>
            ` : ''}
          </td>
        </tr>`;
      });
    }

    html += `</tbody></table></div></div>`;



    // Tambahkan UI untuk mengangkat anggota menjadi pengurus (hanya untuk admin)

    if (canManage) {

      // Kandidat adalah anggota yang sudah punya akses login (termasuk yang sudah jadi pengurus untuk bisa diubah jabatannya)

      const kandidat = data.filter(a => a.bolehDaftar && a.kehidupan !== 'wafat' && a.level !== 'admin');

      html += `

        <div style="margin-top:2rem; border-top:1px solid rgba(201,168,76,0.2); padding-top:1.5rem;">

          <h4 style="font-family:'Cinzel'; color:var(--em); margin-bottom:0.5rem; font-size:0.9rem;">Tambah/Ubah Jabatan Pengurus</h4>

          <p style="font-size:0.75rem; color:var(--cb); margin-bottom:1rem;">Pilih anggota untuk menambah atau mengubah jabatan. Anggota yang sudah memiliki jabatan juga akan muncul di sini.</p>

          <div class="tambah-jabatan-grid" style="display:grid; grid-template-columns: 1fr 1fr auto; gap:10px;">

            <select id="select-calon-pengurus" style="padding:8px; background:rgba(0,0,0,0.2); border:1px solid var(--em); color:white; border-radius:6px; font-size:0.85rem;">

              <option value="">-- Pilih Anggota --</option>

              ${kandidat.map(k => `<option value="${k.id}">${k.nama} (Gen ${k.generasi})${k.jabatan ? ' - ' + k.jabatan : ''}</option>`).join('')}

            </select>

            <select id="select-jabatan-baru" style="padding:8px; background:rgba(0,0,0,0.2); border:1px solid var(--em); color:white; border-radius:6px; font-size:0.85rem;">

              ${generateJabatanOptions()}

            </select>

            <button class="btn-sm solid" onclick="window.tambahJabatanPengurus()" style="height:auto; padding:8px 16px; width:100%;">+ Simpan Jabatan</button>

          </div>

        </div>

      `;

    }



    container.innerHTML = html;

    console.log('[DEBUG] HTML inserted to container. Container children:', container.children.length);
    console.log('[DEBUG] Container computed styles:', {
      display: window.getComputedStyle(container).display,
      visibility: window.getComputedStyle(container).visibility,
      opacity: window.getComputedStyle(container).opacity,
      height: window.getComputedStyle(container).height,
      overflow: window.getComputedStyle(container).overflow
    });
    console.log('[DEBUG] Container innerHTML (first 500 chars):', container.innerHTML.substring(0, 500));


    // Restore card state untuk halaman pengurus

    document.querySelectorAll('.a-card-stack').forEach(cardStack => {

      const id = cardStack.getAttribute('data-anggota-id');

      if (id && openedStackIds.has(id)) {

        cardStack.classList.add('terbuka');

      }

    });

    return;

  }



  // LOGIKA DAFTAR ANGGOTA BIASA

  const cari = (document.getElementById('search-anggota')?.value || '').toLowerCase();

  const container = document.getElementById('daftar-anggota');

  if (!container) return;



  // Tampilkan filter bar jika di mode daftar

  const filters = document.getElementById('anggota-filters');

  if (filters) filters.style.display = 'block';



  // Fungsi pembantu untuk cek apakah anggota adalah jalur keturunan (Trah)

  const isTrah = (p) => !!(p.parentId || p.idOrangTua || String(p.generasi) === '0');



  // Logika Pengurutan Silsilah (Lineage Sorting)

  const getLineageKey = (m) => {

    let path = [], cur = m;

    while (cur) {

      // Jika anggota saat ini adalah Menantu, lompat ke pasangan Trah-nya untuk mendapatkan jalur silsilah yang benar

      if (!isTrah(cur)) {

        const sId = cur.idPasangan || cur.spouseId;

        const spouse = data.find(x => String(x.id) === String(sId));

        if (spouse) cur = spouse;

        else { // Jika tidak ada pasangan trah, gunakan urutan sendiri dan berhenti

          const uVal = parseInt(cur.urutan || cur.urutan_anak);

          path.unshift((isNaN(uVal) ? 99 : uVal).toString().padStart(3, '0'));

          break;

        }

      }



      const uVal = parseInt(cur.urutan || cur.urutan_anak);

      path.unshift((isNaN(uVal) ? 99 : uVal).toString().padStart(3, '0'));

      const pid = cur.idOrangTua || cur.parentId;

      cur = pid ? data.find(x => String(x.id) === String(pid)) : null;

    }

    return path.join('-');

  };



  const filtered = data

    .filter(a => {

      const checkMatch = (p) => !cari || p.nama.toLowerCase().includes(cari) || (p.panggilan || '').toLowerCase().includes(cari);

      let isMatch = checkMatch(a);

      

      // Tetap tampilkan jika pasangannya yang cocok dengan pencarian (agar stack tetap utuh)

      const sId = a.idPasangan || a.spouseId;

      if (!isMatch && sId) {

        const spouseObj = data.find(m => String(m.id) === String(sId));

        if (spouseObj && checkMatch(spouseObj)) isMatch = true;

      }

      

      const matchGen = filterAktif === 'semua' ? true : (filterAktif === 'wafat' ? a.kehidupan === 'wafat' : a.generasi == filterAktif);

      return isMatch && matchGen;

    })

    .sort((a, b) => getLineageKey(a).localeCompare(getLineageKey(b)));



  if (!filtered.length) {

    container.innerHTML = '<div class="kosong-info">Data tidak ditemukan.</div>';

    return;

  }



  const perGen = {};

  if (filterAktif === 'wafat') {

    perGen['wafat'] = filtered;

  } else {

    filtered.forEach(a => {

      if (!perGen[a.generasi]) perGen[a.generasi] = [];

      perGen[a.generasi].push(a);

    });

  }



  let htmlOutput = '';

  Object.keys(perGen).sort().forEach(g => {

    // Selalu buka semua generasi 0-7

    const isExpanded = true;



    let genCardsHtml = '';

    const renderedIds = new Set();

    const members = perGen[g];

    let lastParentId = null;

    let familyContentHtml = '';



    members.forEach(a => {

      if (renderedIds.has(a.id)) return;



      const isMale = (p) => p.gender === 'L' || p.jenisKelamin === 'L' || p.gender === 'Laki-laki';



      // Mencari Pasangan untuk Stacking

      // Matikan stacking jika filter "Wafat" aktif agar tidak membawa pasangan yang masih hidup ke kategori wafat

      const partners = filterAktif === 'wafat' ? [] : data.filter(m => {

        if (m.id === a.id) return false;

        const sIdA = a.idPasangan || a.spouseId;

        const sIdM = m.idPasangan || m.spouseId;

        return (sIdA && String(m.id) === String(sIdA)) || (sIdM && String(a.id) === String(sIdM));

      });



      let stack = partners.length > 0 ? [a, ...partners] : [a];

      // Urutkan stack: Trah di depan, lalu Laki-laki di depan

      stack.sort((x, y) => {

        const xT = isTrah(x), yT = isTrah(y);

        if (xT !== yT) return xT ? -1 : 1;

        return isMale(x) ? -1 : 1;

      });



      const mainMember = stack[0];

      let pId = mainMember.idOrangTua || mainMember.parentId || "root";



      // Pastikan pId merujuk ke ID anggota Trah untuk header keluarga yang konsisten

      const parentObj = data.find(m => String(m.id) === String(pId));

      if (parentObj && !isTrah(parentObj)) {

        const sId = parentObj.idPasangan || parentObj.spouseId;

        if (sId) pId = sId;

      }



      // Header Keluarga (jika orang tua berubah)

      if (pId !== lastParentId && g !== '0' && g !== 'wafat') {

        if (familyContentHtml) {

          genCardsHtml += `<div class="family-content">${familyContentHtml}</div>`;

          familyContentHtml = '';

        }

        let ortu = data.find(m => String(m.id) === String(pId));

        if (ortu) {

          // Validasi: Jika orang tua yang dirujuk bukan Trah, cari pasangannya yang merupakan Trah

          if (!isTrah(ortu)) {

            const sId = ortu.idPasangan || ortu.spouseId;

            const trahParent = data.find(m => String(m.id) === String(sId) && isTrah(m));

            if (trahParent) ortu = trahParent;

          }

          genCardsHtml += `<div class="family-header ${isExpanded ? '' : 'collapsed'}" onclick="this.classList.toggle('collapsed')"><span>✦✦ Keluarga ${ortu.nama}</span></div>`;

        }

        lastParentId = pId;

      }



      if (partners.length > 0) {

        const mainMemberId = stack[0].id;

        familyContentHtml += `<div class="a-card-stack" data-anggota-id="${mainMemberId}" onclick="if(!event.target.closest('.a-aksi') && !event.target.closest('.a-akses-control') && !event.target.closest('input') && !event.target.closest('select')) this.classList.toggle('terbuka')">${stack.map(member => kartu(member, data)).join('')}</div>`;

        stack.forEach(m => renderedIds.add(m.id));

      } else {

        familyContentHtml += kartu(a, data);

        renderedIds.add(a.id);

      }

    });



    if (familyContentHtml) genCardsHtml += `<div class="family-content">${familyContentHtml}</div>`;



    const isInduk = String(g) === '0';

    const lbl = g === 'wafat' ? '🪦 Yang Telah Wafat' : `✦ Generasi ${isInduk ? '0 (Induk)' : g}`;

    htmlOutput += `<div class="gen-section ${isExpanded ? '' : 'collapsed'}">

      <div class="gen-label" onclick="this.parentElement.classList.toggle('collapsed')"><span>${lbl}</span></div>

      <div class="anggota-grid">${genCardsHtml}</div>

    </div>`;

  });



  // Simpan ID dari card stack yang terbuka sebelum render

  container.innerHTML = htmlOutput;

  

  // Restore state card yang terbuka setelah render untuk halaman anggota

  document.querySelectorAll('.a-card-stack').forEach(cardStack => {

    const id = cardStack.getAttribute('data-anggota-id');

    if (id && openedStackIds.has(id)) {

      cardStack.classList.add('terbuka');

    }

  });

};



window.renderBaganPengurus = async function() {

  const data = await window.ambilData();

  const container = document.getElementById('bagan-organisasi-visual');

  if(!container) return;



  const normalizeJabatan = (value) => {

    const jab = String(value || '').toLowerCase().trim();

    if (!jab) return '';

    if (jab.includes('penasihat')) return 'penasihat';

    if (jab.includes('wakil ketua')) return 'wakil ketua';

    if (jab.includes('ketua')) return 'ketua paguyuban';

    if (jab.includes('sekretaris')) return 'sekretaris';

    if (jab.includes('bendahara')) return 'bendahara';

    if (jab.includes('humas')) return 'seksi humas';

    if (jab.includes('acara')) return 'seksi acara';

    if (jab.includes('konsumsi')) return 'seksi konsumsi';

    if (jab.includes('dana')) return 'seksi dana & sosial';

    if (jab.includes('dokumentasi')) return 'seksi dokumentasi';

    if (jab.includes('koordinator wilayah')) return 'koordinator wilayah';

    if (jab.includes('perwakilan generasi')) return 'perwakilan generasi';

    return jab;

  };



  const jabatanOrder = JABATAN_LIST.flatMap(g => g.roles.map(r => r.toLowerCase()));

  const sortFunc = (a, b) => {

    if (a.level === 'admin' && b.level !== 'admin') return -1;

    if (b.level === 'admin' && a.level !== 'admin') return 1;

    const jabatanA = normalizeJabatan(a.jabatan || '');

    const jabatanB = normalizeJabatan(b.jabatan || '');

    const indexA = jabatanOrder.indexOf(jabatanA);

    const indexB = jabatanOrder.indexOf(jabatanB);

    const rankA = indexA === -1 ? Infinity : indexA;

    const rankB = indexB === -1 ? Infinity : indexB;

    if (rankA !== rankB) return rankA - rankB;

    return jabatanA.localeCompare(jabatanB);

  };



  const allPengurus = data.filter(a => a.level === 'admin' || a.level === 'pengurus').sort(sortFunc);

  if (allPengurus.length === 0) {

    container.innerHTML = '<div class="kosong-info">Belum ada data pengurus untuk ditampilkan.</div>';

    return;

  }



  const createCard = (anggota) => {

    const inisial = (anggota.nama || '??').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

    const foto = anggota.foto ? `<img src="${anggota.foto}" alt="${anggota.nama}" onerror="this.style.display='none'; this.parentElement.textContent='${inisial}';">` : inisial;

    const displayName = anggota.panggilan || anggota.nama;

    return `<div class="bagan-card"><div class="bagan-avatar">${foto}</div><p class="bagan-nama">${displayName}</p><p class="bagan-jabatan">${anggota.jabatan || (anggota.level === 'admin' ? 'Penasihat' : 'Pengurus')}</p></div>`;

  };



  // Pisahkan anggota ke dalam grup masing-masing berdasarkan jabatan

  const intiOrder = ['ketua paguyuban', 'wakil ketua', 'sekretaris', 'bendahara'];

  const seksiRoles = JABATAN_LIST.find(g => g.group.includes('Seksi')).roles.map(r => r.toLowerCase());

  const koordinatorRoles = JABATAN_LIST.find(g => g.group.includes('Koordinator')).roles.map(r => r.toLowerCase());



  const penasihat = [];

  const inti = [];

  const seksi = [];

  const koordinator = [];



  allPengurus.forEach(p => {

    const j = normalizeJabatan(p.jabatan || '');



    if (j === 'penasihat') {

      penasihat.push(p);

    } else if (intiOrder.includes(j)) {

      inti.push(p);

    } else if (seksiRoles.includes(j)) {

      seksi.push(p);

    } else if (koordinatorRoles.includes(j)) {

      koordinator.push(p);

    } else {

      // Handle unassigned roles based on level

      if (p.level === 'admin') {

        penasihat.push(p); // Admin tanpa jabatan spesifik menjadi Penasihat

      } else {

        seksi.push(p); // Pengurus tanpa jabatan spesifik masuk ke seksi umum

      }

    }

  });



  // Pastikan urutan 'inti' sesuai dengan standar

  inti.sort((a, b) => {

    const ja = normalizeJabatan(a.jabatan || '');

    const jb = normalizeJabatan(b.jabatan || '');

    return intiOrder.indexOf(ja) - intiOrder.indexOf(jb);

  });



  const renderGroup = (title, members, levelClass) => `

    <div class="org-chart-group">

      <div class="org-chart-title">${title}</div>

      <div class="org-level ${levelClass}">

        ${members.map(createCard).join('')}

      </div>

    </div>`;



  let html = `<div class="org-chart">`; 



  if (penasihat.length > 0) {

    html += renderGroup('Penasihat', penasihat, 'org-level-penasihat');

  }



  if (inti.length > 0) {

    html += renderGroup('Struktur Inti', inti, 'org-level-inti');

  }



  if (seksi.length > 0) {

    html += renderGroup('Seksi / Divisi', seksi, 'org-level-seksi');

  }



  if (koordinator.length > 0) {

    html += renderGroup('Koordinator', koordinator, 'org-level-koordinator');

  }



  html += `</div>`;

  container.innerHTML = html;

};



// ══ LOGIKA BUKU BESAR (LEDGER) ══

window.renderBukuBesar = async function() {

  const snapshot = await get(ref(db, "transaksi"));

  let list = snapshot.exists() ? Object.entries(snapshot.val()).map(([id, data]) => ({ id, ...data })) : [];



  // 1. Filter berdasarkan kata kunci pencarian (Keterangan/Kategori)

  const cari = (document.getElementById('search-ledger')?.value || '').toLowerCase();

  if (cari) {

    list = list.filter(t => 

      (t.deskripsi || '').toLowerCase().includes(cari) || 

      (t.kategori || '').toLowerCase().includes(cari)

    );

  }



  // Filter berdasarkan range bulan/tahun dari UI

  const mBul = document.getElementById('filter-mulai-bulan')?.value;

  const mTah = document.getElementById('filter-mulai-tahun')?.value;

  const sBul = document.getElementById('filter-sampai-bulan')?.value;

  const sTah = document.getElementById('filter-sampai-tahun')?.value;



  if (mTah || sTah) {

    const startVal = (mTah ? parseInt(mTah) : 1981) * 12 + parseInt(mBul);

    const endVal = (sTah ? parseInt(sTah) : 2100) * 12 + parseInt(sBul);

    list = list.filter(t => {

      const dt = new Date(t.tanggal);

      if (isNaN(dt)) return false;

      const currentVal = dt.getFullYear() * 12 + (dt.getMonth() + 1);

      return currentVal >= startVal && currentVal <= endVal;

    });

  }



  list.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));



  const canEdit = HAK_AKSES[penggunaLogin.level]?.edit;

  const canHapus = HAK_AKSES[penggunaLogin.level]?.hapus;

  let html = '', totalMasuk = 0, totalKeluar = 0;



  list.forEach(t => {

    const isMasuk = t.tipe === 'masuk';

    if (isMasuk) totalMasuk += t.jumlah; else totalKeluar += t.jumlah;

    const isLocked = ['Tabungan', 'Sosial'].includes(t.kategori);



    html += `

      <tr>

        <td style="white-space:nowrap">${t.tanggal.split('-').reverse().join('/')}</td>

        <td>${t.deskripsi}<br><small style="color:var(--cb); font-size:0.7rem">Oleh: ${t.inputOleh || 'Admin'}</small></td>

        <td><span class="badge" style="background:rgba(201,168,76,0.1); color:var(--el)">${t.kategori}</span></td>

        <td class="txt-masuk" style="color: ${isMasuk ? '#2e7d32' : 'inherit'}; font-weight: 600;">${isMasuk ? formatRp(t.jumlah) : '-'}</td>

        <td class="txt-keluar" style="color: ${!isMasuk ? '#c62828' : 'inherit'}; font-weight: 600;">${!isMasuk ? formatRp(t.jumlah) : '-'}</td>

        <td style="text-align:center; white-space:nowrap;">

          ${(canEdit && !isLocked) ? `<button class="btn-sm" onclick="window.bukaEditTransaksi('${t.id}')">Edit</button>` : ''}

          ${(canHapus && !isLocked) ? `<button class="btn-sm danger" onclick="window.hapusTransaksi('${t.id}')">Hapus</button>` : ''}

          ${isLocked ? '<span style="font-size:0.65rem; opacity:0.6; font-style:italic;">🔒 Sistem</span>' : ''}

        </td>

      </tr>`;

  });



  const body = document.getElementById('ledger-body');

  if (body) {

    body.innerHTML = html || '<tr><td colspan="6" style="text-align:center; padding:2rem; opacity:0.5">Belum ada transaksi.</td></tr>';

    document.getElementById('ledger-total-masuk').textContent = formatRp(totalMasuk);

    document.getElementById('ledger-total-keluar').textContent = formatRp(totalKeluar);

    const saldo = totalMasuk - totalKeluar;

    document.getElementById('ledger-saldo-akhir').textContent = formatRp(saldo);

    document.getElementById('ledger-saldo-akhir').style.color = saldo >= 0 ? 'var(--em)' : '#e8a0a0';

  }

};



window.resetFilterBukuBesar = function() {

  const now = new Date();

  const searchEl = document.getElementById('search-ledger');

  if (searchEl) searchEl.value = '';

  

  document.getElementById('filter-mulai-bulan').value = '01';

  document.getElementById('filter-mulai-tahun').value = '';

  document.getElementById('filter-sampai-bulan').value = String(now.getMonth() + 1).padStart(2, '0');

  document.getElementById('filter-sampai-tahun').value = '';

  window.renderBukuBesar();

};



window.resetTrxForm = function() {

  document.getElementById('trx-id').value = '';

  document.getElementById('trx-tanggal').value = new Date().toISOString().split('T')[0];

  document.getElementById('trx-deskripsi').value = '';

  document.getElementById('trx-jumlah').value = '';

  document.getElementById('trx-kategori').value = 'Sosial';

  const radioMasuk = document.querySelector('input[name="trx-tipe"][value="masuk"]');

  if(radioMasuk) radioMasuk.checked = true;

  document.getElementById('modal-trx-judul').textContent = 'Tambah Transaksi';

};



window.simpanTransaksi = async function() {

  const id = document.getElementById('trx-id').value;

  const tgl = document.getElementById('trx-tanggal').value;

  const dsk = document.getElementById('trx-deskripsi').value.trim();

  const jml = cleanNumber(document.getElementById('trx-jumlah').value);

  const kat = document.getElementById('trx-kategori').value;

  const tip = document.querySelector('input[name="trx-tipe"]:checked').value;



  if (!tgl || !dsk || isNaN(jml)) return toast('Harap isi semua field transaksi.');



  if (['Tabungan', 'Sosial'].includes(kat)) return toast('Gunakan modul Arisan untuk kategori ini.');



  const trxData = {

    tanggal: tgl, deskripsi: dsk, jumlah: jml, kategori: kat, tipe: tip,

    inputOleh: penggunaLogin.nama, updatedAt: Date.now()

  };



  if (!id) {

    const newTrxRef = push(ref(db, "transaksi"));

    trxData.createdAt = Date.now();

    await set(newTrxRef, trxData);

  } else {

    await update(ref(db, `transaksi/${id}`), trxData);

  }



  window.tutupModal('modal-transaksi');

  toast(id ? 'Transaksi diperbarui.' : 'Transaksi dicatat.');

  catatLog(id ? "Edit Transaksi" : "Tambah Transaksi", dsk + " (" + formatRp(jml) + ")");

  window.renderBukuBesar();

};



window.bukaEditTransaksi = async function(id) {

  const snapshot = await get(ref(db, `transaksi/${id}`));

  if (!snapshot.exists()) return;

  const t = snapshot.val();

  document.getElementById('trx-id').value = id;

  document.getElementById('trx-tanggal').value = t.tanggal;

  document.getElementById('trx-deskripsi').value = t.deskripsi;

  document.getElementById('trx-jumlah').value = t.jumlah ? t.jumlah.toLocaleString('id-ID') : '';

  document.getElementById('trx-kategori').value = t.kategori;

  const radio = document.querySelector(`input[name="trx-tipe"][value="${t.tipe}"]`);

  if(radio) radio.checked = true;

  document.getElementById('modal-trx-judul').textContent = 'Edit Transaksi';

  window.bukaModal('modal-transaksi');

};



window.hapusTransaksi = async function(id) {

  if (!confirm('Hapus transaksi ini?')) return;

  const snapshot = await get(ref(db, `transaksi/${id}`));

  if (!snapshot.exists()) return;

  const t = snapshot.val();

  const isSystem = (t.deskripsi && t.deskripsi.includes('[IURAN]')) || (t.deskripsi && t.deskripsi.includes('[ARISAN]'));



  let pesan = 'Hapus transaksi ini?';

  if (isSystem) {

    pesan = 'Peringatan: Menghapus data sistem di sini tidak akan mengubah data di modul Arisan. Lanjutkan?';

  }



  if (!confirm(pesan)) return;



  await remove(ref(db, `transaksi/${id}`));

  toast('Transaksi dihapus.');

  catatLog("Hapus Transaksi", "ID Transaksi: " + id);

  window.renderBukuBesar();

};



// 6. STATISTIK REALTIME

function startRealtimeStats() {

  let dataAnggotaCached = [];

  let ledgerData = { sIn: 0, sOut: 0, tIn: 0, tOut: 0, oIn: 0, oOut: 0, totalNet: 0, sosialNet: 0 };



  const refreshDashboardUI = () => {

    const info = document.getElementById('dash-arisan-info');

    if (!info) return;

    info.style.display = 'block';



    const elSos = document.getElementById('dash-sosial');

    const elTab = document.getElementById('dash-tabungan');

    const elTot = document.getElementById('dash-total-kas');



    // 1. Dana Tabungan: Diambil dari total iuran (tabungan) di Manajemen Arisan

    let totalTabunganArisan = 0;

    let totalSosialArisan = 0;



    if (window.arisanGlobalData) {

      const history = window.arisanGlobalData.iuran_bulanan || {};

      const historyArray = Array.isArray(history) ? history : Object.values(history);

      

      historyArray.forEach(bulan => {

        const payments = Array.isArray(bulan.pembayaran) ? bulan.pembayaran : Object.values(bulan.pembayaran || {});

        payments.forEach(p => {

          if (p.paid) {

            // Mengambil nominal dari data anggota atau default

            const m = dataAnggotaCached.find(a => String(a.id) === String(p.memberId));

            totalTabunganArisan += parseInt(m?.nominalIuran?.tabungan) || 5000;

            totalSosialArisan += parseInt(m?.nominalIuran?.sosial) || 10000;

          }

        });

      });

    }



    // 2. Dana Sosial: Buku Besar (Sosial) + Iuran Sosial Arisan

    // Pengeluaran Sosial sudah otomatis memotong saldo ledgerData.sosialNet

    const saldoSosialLedger = ledgerData.sosialNet;

    const saldoSosialArisan = totalSosialArisan;



    if (elSos) elSos.textContent = formatRp(saldoSosialLedger + saldoSosialArisan);

    if (elTab) elTab.textContent = formatRp(totalTabunganArisan);

    

    // 3. Total Saldo Kas: Sesuai rincian kas Buku Besar (Saldo Akhir)

    if (elTot) elTot.textContent = formatRp(ledgerData.totalNet);

  };



  onValue(ref(db, "anggota"), (snapshot) => {

    const data = snapshot.exists() ? Object.values(snapshot.val()) : [];

    dataAnggotaCached = data;

    

    // Hitung statistik dasar

    const total = data.length;

    const wafat = data.filter(a => a.kehidupan === 'wafat').length;

    const hidup = total - wafat;



    // Update elemen UI di Hero Section

    if(document.getElementById('stat-total')) document.getElementById('stat-total').textContent = total;

    if(document.getElementById('stat-aktif')) document.getElementById('stat-aktif').textContent = hidup;

    if(document.getElementById('stat-wafat')) document.getElementById('stat-wafat').textContent = wafat;



    // Hitung dan Render Anggota per Generasi

    const perGen = {};

    data.forEach(a => {

      const g = a.generasi || '0';

      if(!perGen[g]) perGen[g] = 0;

      perGen[g]++;

    });

    const statsGen = document.getElementById('stats-per-gen');

    if (statsGen) {

      statsGen.innerHTML = Object.keys(perGen).sort().map(g => `

        <div class="stat-card" style="padding: 1rem; text-align: center;">

          <p class="stat-lbl" style="font-size: 0.65rem;">Gen ${g}</p>

          <p class="stat-num" style="font-size: 1.2rem; margin-top: 4px;">${perGen[g]}</p>

        </div>

      `).join('');

    }



    updateTabunganPribadi(dataAnggotaCached);

    renderAccessCards(dataAnggotaCached);

    renderPengurusDashboard(dataAnggotaCached);

    refreshDashboardUI();

  });



  onValue(ref(db, "transaksi"), (snapshot) => {

    const trans = snapshot.exists() ? Object.values(snapshot.val()) : [];

    let sIn=0, sOut=0, tIn=0, tOut=0, oIn=0, oOut=0;

    trans.forEach(t => {

        const v = Number(t.jumlah) || 0;

        if(t.kategori === 'Sosial') t.tipe === 'masuk' ? sIn+=v : sOut+=v;

        else if(t.kategori === 'Tabungan') t.tipe === 'masuk' ? tIn+=v : tOut+=v;

        else t.tipe === 'masuk' ? oIn+=v : oOut+=v;

    });

    

    ledgerData.sosialNet = sIn - sOut;

    ledgerData.totalNet = (sIn + tIn + oIn) - (sOut + tOut + oOut);

    refreshDashboardUI();



    if (document.getElementById('panel-buku-besar')?.classList.contains('aktif') && typeof window.renderBukuBesar === 'function') {

      window.renderBukuBesar();

    }

  });



  // Listener Riwayat Arisan untuk Tabungan Pribadi

  onValue(ref(db, "arisan_global"), (snapshot) => {

    window.arisanGlobalData = snapshot.val();

    refreshDashboardUI();

    updateTabunganPribadi(dataAnggotaCached);

  });

}



window.renderLogs = async function() {

  const snap = await get(ref(db, "logs"));

  const logs = snap.exists() ? Object.values(snap.val()) : [];

  logs.sort((a, b) => b.waktu - a.waktu);

  const body = document.getElementById('log-body');

  if (!body) return;

  body.innerHTML = logs.map(l => `

    <tr>

      <td style="white-space:nowrap; font-size:0.65rem; line-height:1.2; padding: 8px 12px 8px 0; vertical-align: top;">

        ${new Date(l.waktu).toLocaleDateString('id-ID', {day:'2-digit', month:'2-digit', year:'2-digit'})}<br>

        <span style="opacity:0.7;">${new Date(l.waktu).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}</span>

      </td>

      <td style="font-size:0.7rem; line-height:1.2; padding: 8px 12px; vertical-align: top;">

        <strong style="color:var(--em);">${l.nama}</strong><br><span style="font-size:0.55rem; opacity:0.7;">${l.level.toUpperCase()}</span>

      </td>

      <td style="padding: 8px 12px; vertical-align: top;"><span class="badge" style="background:var(--cs); color:var(--em); font-size:0.55rem; padding:2px 5px; border-radius:4px;">${l.aksi}</span></td>

      <td style="font-size:0.7rem; line-height:1.3; padding: 8px 0 8px 12px; vertical-align: top; min-width:100px;">${l.detail}</td>

    </tr>

  `).join('');

};



window.hapusSemuaLog = async function() {

  if (penggunaLogin?.level !== 'admin') return toast('Hanya Admin yang dapat menghapus seluruh log.');

  // Dialog konfirmasi dipindahkan ke dalam modal otorisasi itu sendiri.

  

  // Reset input dan buka modal

  document.getElementById('input-password-otorisasi').value = '';

  window.bukaModal('modal-otorisasi');

  setTimeout(() => document.getElementById('input-password-otorisasi').focus(), 100);

};



window.konfirmasiBersihkanLog = async function() {

  const pw = document.getElementById('input-password-otorisasi').value;

  if (pw !== 'bnLm9ufo') {

    toast('Kata sandi salah.');

    return;

  }

  

  window.tutupModal('modal-otorisasi');

  try {

    await remove(ref(db, "logs"));

    toast('Log aktivitas berhasil dibersihkan.');

    // Mencatat log aksi pembersihan itu sendiri

    await catatLog("Bersihkan Log", "Menghapus seluruh riwayat aktivitas sistem");

    window.renderLogs();

  } catch (e) {

    console.error(e);

    toast('Gagal membersihkan log.');

  }

};



function updateTabunganPribadi(members) {

  if (!penggunaLogin || !penggunaLogin.id || !window.arisanGlobalData || !members.length) return;



  const currentMember = members.find(m => String(m.id) === String(penggunaLogin.id));

  if (!currentMember) return;



  // Default tabungan jika tidak diatur khusus adalah 5.000

  const nominalTab = parseInt(currentMember.nominalIuran?.tabungan) || 5000;

  const history = window.arisanGlobalData.iuran_bulanan || [];

  let totalTabunganUser = 0;



  const historyArray = Array.isArray(history) ? history : Object.values(history);

  historyArray.forEach(bulan => {

    const payments = Array.isArray(bulan.pembayaran) ? bulan.pembayaran : Object.values(bulan.pembayaran || {});

    const myPayment = payments.find(p => String(p.memberId) === String(penggunaLogin.id));

    if (myPayment && myPayment.paid) {

      totalTabunganUser += nominalTab;

    }

  });



  const box = document.getElementById('user-tabungan-box');

  const val = document.getElementById('user-tabungan-val');

  if (box && val) {

    box.style.display = 'block';

    val.textContent = formatRp(totalTabunganUser);

  }

}



// 7. HELPER UI

window.bukaPanel = function(nama, el, pushState = true) {

  document.querySelectorAll('.panel').forEach(p => p.classList.remove('aktif'));

  document.getElementById('panel-' + nama).classList.add('aktif');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('aktif'));



  // Update Judul Topbar sesuai panel yang aktif agar navigasi lebih jelas

  const titleMap = { 'dashboard': 'Beranda', 'anggota': 'Manajemen Keluarga', 'logs': 'Log Aktivitas' };

  if (document.getElementById('topbar-judul')) {

    document.getElementById('topbar-judul').textContent = titleMap[nama] || 'Paguyuban';

  }



  const backBtn = document.getElementById('topbar-back-btn');

  if (backBtn) {

    backBtn.style.display = (nama === 'dashboard') ? 'none' : 'flex';

  }

  

  if (el) el.classList.add('aktif');

  if (nama === 'anggota') {

    // Jika navigasi baru dari menu utama, arahkan ke hub menu dengan history state

    if (pushState) {

      window.switchSubPanelAnggota('menu', true);

      return; // Navigasi selanjutnya dihandle oleh switchSubPanelAnggota

    }

  }

  if (nama === 'buku-besar') window.renderBukuBesar();

  if (nama === 'logs') window.renderLogs();



  // Simpan state ke history agar tombol back browser/topbar berfungsi antar panel

  if (pushState) {

    history.pushState({ panel: nama }, "", "#" + nama);

  }

};



window.switchSubPanelAnggota = function(sub, pushState = true) {

  const menu = document.getElementById('section-anggota-menu');

  const listSub = document.getElementById('sub-panel-daftar');

  const pengurusSub = document.getElementById('sub-panel-pengurus');

  const baganSub = document.getElementById('sub-panel-bagan');

  const container = document.getElementById('daftar-anggota');

  const btnTambahAnggota = document.getElementById('btn-tambah-anggota');

  const title = document.getElementById('anggota-panel-title');

  

  // Sembunyikan semua sub-section terlebih dahulu

  if (menu) menu.style.display = 'none';

  if (listSub) listSub.style.display = 'none';

  if (pengurusSub) pengurusSub.style.display = 'none';

  if (baganSub) baganSub.style.display = 'none';



  // Sembunyikan tombol tambah anggota secara default, akan ditampilkan jika di tab 'daftar'

  if (btnTambahAnggota) btnTambahAnggota.style.display = 'none';



  if (sub === 'menu') {

    if (menu) menu.style.display = 'block';

    if (title) title.innerHTML = 'Manajemen <em>Keluarga</em>';

  } else if (sub === 'daftar') {

    filterAktif = 'semua';

    if (listSub) listSub.style.display = 'block';

    if (btnTambahAnggota) btnTambahAnggota.style.display = 'block'; // Tampilkan di sini

    if (title) title.innerHTML = 'Daftar <em>Anggota</em>';

    window.renderAnggota();

  } else if (sub === 'pengurus') {

    filterAktif = 'pengurus';

    console.log('[DEBUG] Switching to pengurus panel. pengurusSub:', pengurusSub);
    console.log('[DEBUG] panel-anggota:', document.getElementById('panel-anggota'));
    console.log('[DEBUG] panel-anggota classList:', document.getElementById('panel-anggota')?.classList);

    if (pengurusSub) {
      pengurusSub.style.display = 'block';
      console.log('[DEBUG] pengurusSub display set to block');
      console.log('[DEBUG] pengurusSub computed display:', window.getComputedStyle(pengurusSub).display);
    }

    if (title) title.innerHTML = 'Jabatan <em>Pengurus</em>';

    window.renderAnggota();

  } else if (sub === 'bagan') {

    filterAktif = 'bagan';

    if (baganSub) baganSub.style.display = 'block';

    // btnTambahAnggota tetap tersembunyi

    if (title) title.innerHTML = 'Bagan <em>Struktur</em>';

    window.renderBaganPengurus();

  }



  if (pushState) {

    history.pushState({ panel: 'anggota', sub: sub }, "", "#anggota-" + sub);

  }

};



window.filterGen = function(gen, el) {

  filterAktif = gen;

  document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('aktif'));

  if (el) el.classList.add('aktif');

  window.renderAnggota();

};



window.bukaModal = (id) => document.getElementById(id).classList.add('aktif');

window.tutupModal = (id) => document.getElementById(id).classList.remove('aktif');



window.addEventListener('popstate', (e) => {

  const state = e.state || { panel: 'dashboard' };

  const panel = state.panel || 'dashboard';

  const sub = state.sub;



  const navItems = document.querySelectorAll('.nav-item');

  let targetNav = null;

  navItems.forEach(item => {

    if (item.getAttribute('onclick')?.includes(`'${panel}'`)) targetNav = item;

  });



  window.bukaPanel(panel, targetNav, false);

  if (panel === 'anggota') {

    window.switchSubPanelAnggota(sub || 'menu', false);

  }

});



// Re-check session on load

window.addEventListener('load', () => {

  const saved = sessionStorage.getItem('kromoredjo_user');

  if (saved) {

    const akun = JSON.parse(saved);

    proceedLogin(akun);

    

    // Set initial state untuk history

    const hash = window.location.hash.substring(1) || 'dashboard';



    if (hash.startsWith('anggota-')) {

      const sub = hash.replace('anggota-', '');

      history.replaceState({ panel: 'anggota', sub: sub }, "", "#" + hash);

      window.bukaPanel('anggota', null, false);

      window.switchSubPanelAnggota(sub, false);

    } else {

      history.replaceState({ panel: hash }, "", "#" + hash);



      // Sinkronisasi Panel berdasarkan hash URL (Contoh: #anggota)

      if (hash) {

      const panelMap = { 'anggota': 'anggota', 'logs': 'logs', 'dashboard': 'dashboard' };

      if (panelMap[hash]) {

        // Cari elemen navigasi terkait untuk memberikan class 'aktif'

        const navItems = document.querySelectorAll('.nav-item');

        let targetNav = null;

        navItems.forEach(item => {

          if (item.getAttribute('onclick')?.includes(`'${panelMap[hash]}'`)) targetNav = item;

        });

        window.bukaPanel(panelMap[hash], targetNav, false);

      }

    }

    }

  }

});



// Integrasi fungsi modal-anggota yang hilang di app.js baru

window.toggleTglWafat = function() {

  const v = document.getElementById('form-kehidupan').value;

  const g = document.getElementById('group-tgl-wafat');

  const inp = document.getElementById('form-tgl-wafat');

  g.style.opacity = v === 'wafat' ? '1' : '.3';

  inp.disabled = v !== 'wafat';

};



window.bukaFormTambah = function() {

  if (!HAK_AKSES[penggunaLogin.level]?.tambah) return toast("Anda tidak memiliki akses ini.");

  document.getElementById('modal-judul-form').textContent = 'Tambah Anggota Baru';

  resetFormFields();

  window.bukaModal('modal-anggota');

};



function resetFormFields() {

  ['form-id','form-nama','form-panggilan','form-hp','form-lahir','form-alamat','form-tgl-wafat','form-id-orang-tua', 'form-urutan', 'form-foto'].forEach(id => {

    const el = document.getElementById(id);

    if(el) el.value = '';

  });

  document.getElementById('form-generasi').value = '4';

  document.getElementById('form-status').value = 'aktif';

  document.getElementById('form-kehidupan').value = 'hidup';

  const radioL = document.querySelector('input[name="form-gender"][value="L"]');

  if(radioL) radioL.checked = true;

  window.toggleTglWafat();

  window.updateFormOptions();

}



window.updateFormOptions = async function(curParentId = "", curSpouseId = "") {

  const data = await window.ambilData();

  const genEl = document.getElementById("form-generasi");

  if(!genEl) return;

  const currentGen = parseInt(genEl.value);

  const currentMemberId = document.getElementById('form-id').value;



  const selectOrangTua = document.getElementById('form-id-orang-tua');

  if(selectOrangTua) {

    let html = '<option value="">- Tanpa Data (Akar) -</option>';

    data.filter(a => {

      const isPrevGen = parseInt(a.generasi) < currentGen;

      const isNotSelf = String(a.id) !== String(currentMemberId);

      const isTrah = !!(a.parentId || a.idOrangTua || String(a.generasi) === '0');

      return isPrevGen && isNotSelf && isTrah;

    }).forEach(p => {

      html += `<option value="${p.id}" ${String(p.id) === String(curParentId) ? 'selected' : ''}>${p.nama} (Gen ${p.generasi})</option>`;

    });

    selectOrangTua.innerHTML = html;

  }



  const selectPasangan = document.getElementById('form-id-pasangan');

  if(selectPasangan) {

    let html = '<option value="">- Tanpa Pasangan -</option>';

    data.filter(a => String(a.generasi) === String(currentGen) && String(a.id) !== String(currentMemberId)).forEach(p => {

      html += `<option value="${p.id}" ${String(p.id) === String(curSpouseId) ? 'selected' : ''}>${p.nama}</option>`;

    });

    selectPasangan.innerHTML = html;

  }

};



window.bukaEdit = async function(id) {

  const data = await window.ambilData();

  const a = data.find(x => String(x.id) === String(id));

  if(!a) return;



  const isOwner = a.createdBy === penggunaLogin.username;

  const canEdit = HAK_AKSES[penggunaLogin.level]?.edit || (penggunaLogin.level === 'anggota' && isOwner);



  if (!canEdit) return toast("Anda tidak memiliki akses ini.");



  document.getElementById('modal-judul-form').textContent = 'Edit Data Anggota';

  document.getElementById('form-id').value = a.id;

  document.getElementById('form-nama').value = a.nama;

  document.getElementById('form-panggilan').value = a.panggilan || '';

  document.getElementById('form-generasi').value = a.generasi;

  document.getElementById('form-urutan').value = a.urutan || '';

  document.getElementById('form-hp').value = a.hp || '';

  document.getElementById('form-lahir').value = a.tanggalLahir || a.lahir || '';

  document.getElementById('form-alamat').value = a.alamat || '';

  document.getElementById('form-foto').value = a.foto || '';

  document.getElementById('form-status').value = a.status || 'aktif';

  document.getElementById('form-kehidupan').value = a.kehidupan || 'hidup';

  document.getElementById('form-tgl-wafat').value = a.tglWafat || '';

  

  const genderRadio = document.querySelector(`input[name="form-gender"][value="${a.gender || 'L'}"]`);

  if(genderRadio) genderRadio.checked = true;



  window.toggleTglWafat();

  await window.updateFormOptions(a.parentId || a.idOrangTua, a.spouseId || a.idPasangan);

  window.bukaModal('modal-anggota');

};



window.bukaKonfirmasiHapus = function(id, nama) {

  if (!HAK_AKSES[penggunaLogin.level]?.hapus) return toast("Anda tidak memiliki akses hapus.");

  idHapusPending = id;

  document.getElementById('konfirm-nama').textContent = nama;

  window.bukaModal('modal-hapus');

};



window.konfirmasiHapus = async function() {

  if(!idHapusPending) return;

  await remove(ref(db, "anggota/" + idHapusPending));

  idHapusPending = null;

  window.tutupModal('modal-hapus');

  catatLog("Hapus Anggota", "Menghapus ID: " + idHapusPending);

  window.renderAnggota();

  toast("Anggota berhasil dihapus.");

};



window.simpanAnggota = async function() {

  const rawNama = document.getElementById('form-nama').value.trim();

  // Fungsi standarisasi: Huruf besar di awal kata

  const formatTeks = (str) => str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');



  const nama = formatTeks(rawNama);

  const gen = document.getElementById('form-generasi').value;

  if (!nama) return toast("Nama lengkap wajib diisi.");



  const id = document.getElementById('form-id').value;



  // Cek Duplikasi: Nama dan Generasi yang sama

  const allData = await window.ambilData();

  const isDuplicate = allData.some(a => 

    a.nama.toLowerCase().trim() === nama.toLowerCase() && 

    String(a.generasi) === String(gen) && 

    String(a.id) !== String(id)

  );



  if (isDuplicate) {

    return toast(`Anggota dengan nama "${nama}" di Generasi ${gen} sudah terdaftar.`);

  }



  const kh = document.getElementById('form-kehidupan').value;

  const gender = document.querySelector('input[name="form-gender"]:checked').value;



  // Jika sedang edit, gunakan data yang sudah diambil tadi untuk efisiensi

  const dataLama = id ? allData.find(x => String(x.id) === String(id)) : null;



  const obj = {

    ...dataLama, // Pertahankan data lama (termasuk password, bolehDaftar, dll)

    id: id || 'a_' + Date.now(),

    bolehDaftar: kh === 'wafat' ? false : (dataLama ? (dataLama.bolehDaftar || false) : false),

    password: kh === 'wafat' ? null : (dataLama ? (dataLama.password || null) : null),

    nama,

    panggilan: formatTeks(document.getElementById('form-panggilan').value.trim()),

    generasi: document.getElementById('form-generasi').value,

    parentId: document.getElementById('form-id-orang-tua').value,

    spouseId: document.getElementById('form-id-pasangan').value,

    urutan: document.getElementById('form-urutan').value,

    gender,

    status: kh === 'wafat' ? 'tidak-aktif' : document.getElementById('form-status').value,

    kehidupan: kh,

    tglWafat: kh === 'wafat' ? document.getElementById('form-tgl-wafat').value : '',

    hp: document.getElementById('form-hp').value.trim(),

    tanggalLahir: document.getElementById('form-lahir').value,

    alamat: document.getElementById('form-alamat').value.trim(),

    foto: document.getElementById('form-foto').value.trim(),

    updatedAt: Date.now(),

    createdBy: dataLama ? (dataLama.createdBy || 'admin') : penggunaLogin.username

  };



  await set(ref(db, "anggota/" + obj.id), obj);

  toast(id ? 'Data berhasil diperbarui.' : 'Anggota baru ditambahkan.');

  catatLog(id ? "Edit Anggota" : "Tambah Anggota", nama);

  window.tutupModal('modal-anggota');

  

  // Reset tampilan ke semula setelah simpan

  filterAktif = 'semua';

  const searchInput = document.getElementById('search-anggota');

  if (searchInput) searchInput.value = '';

  document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('aktif'));

  const btnSemua = document.querySelector('.fbtn[onclick*="semua"]');

  if (btnSemua) btnSemua.classList.add('aktif');

  window.renderAnggota();

};



window.togglePasswordVisibility = function(inputId, btn) {

  const input = document.getElementById(inputId);

  const eyeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;

  const eyeOffIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`;



  if (input.type === 'password') {

    input.type = 'text';

    btn.innerHTML = eyeOffIcon;

  } else {

    input.type = 'password';

    btn.innerHTML = eyeIcon;

  }

};

// FUNGSI GANTI PASSWORD DARI HALAMAN LOGIN
window.gantiPasswordDariLogin = async function() {
  const passLama = document.getElementById('input-pass-lama-ganti')?.value?.trim();
  const passBaru = document.getElementById('input-pass-baru-ganti')?.value?.trim();
  const passKonfirmasi = document.getElementById('input-pass-konfirmasi-ganti')?.value?.trim();

  if (!passLama || !passBaru || !passKonfirmasi) {
    return alert("Semua kolom wajib diisi.");
  }
  if (passBaru.length < 6) {
    return alert("Kata sandi baru minimal 6 karakter.");
  }
  if (passBaru !== passKonfirmasi) {
    return alert("Konfirmasi kata sandi tidak cocok.");
  }

  // Cari user berdasarkan username dari sessionStorage (jika sudah login)
  // atau minta user masukkan username di modal (mode lupa password)
  const savedUser = sessionStorage.getItem('kromoredjo_user');
  let userId = null;

  if (savedUser) {
    // User sudah login — pakai id dari session
    userId = JSON.parse(savedUser).id;
 } else {
    // Belum login — cari berdasarkan username yang diisi di modal
    const uInput = document.getElementById('input-username-ganti')?.value?.trim().toLowerCase();
    if (!uInput) return alert("Silakan isi nama pengguna terlebih dahulu.");
    const data = await window.ambilData();
    const found = data.find(m =>
      m.bolehDaftar &&
      ((m.nama && m.nama.toLowerCase() === uInput) ||
       (m.panggilan && m.panggilan.toLowerCase() === uInput))
    );
    if (!found) return alert("Username tidak ditemukan.");
    userId = found.id;
  }

  // Ambil data user dari Firebase dan verifikasi password lama
  const snapshot = await get(ref(db, `anggota/${userId}`));
  if (!snapshot.exists()) return alert("Data pengguna tidak ditemukan.");

  const userData = snapshot.val();
  if (userData.password !== passLama) {
    return alert("Kata sandi lama tidak sesuai.");
  }

  // Simpan password baru
  userData.password = passBaru;
  await set(ref(db, `anggota/${userId}`), userData);

  // Bersihkan form dan tutup modal
  document.getElementById('input-pass-lama-ganti').value = '';
  document.getElementById('input-pass-baru-ganti').value = '';
  document.getElementById('input-pass-konfirmasi-ganti').value = '';
  window.tutupModal('modal-ganti-password-login');

  alert("✅ Kata sandi berhasil diubah. Silakan login ulang dengan kata sandi baru.");

  // Jika sedang login, logout otomatis
  if (savedUser) {
    sessionStorage.removeItem('kromoredjo_user');
    setTimeout(() => location.reload(), 500);
  }
};
