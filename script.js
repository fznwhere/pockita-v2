let transactions = JSON.parse(localStorage.getItem('pockita_tx')) || [];
let recurringTemplates = JSON.parse(localStorage.getItem('pockita_recur')) || [];
let savingsGoals = JSON.parse(localStorage.getItem('pockita_goals')) || [];
let debtsData = JSON.parse(localStorage.getItem('pockita_debts')) || [];
let titipanData = JSON.parse(localStorage.getItem('pockita_titipan')) || []; 
let recurringAppliedMonths = JSON.parse(localStorage.getItem('pockita_applied_months')) || [];
let isBalanceHidden = JSON.parse(localStorage.getItem('pockita_hide_balance')) || false; 
let memberCards = JSON.parse(localStorage.getItem('pockita_members')) || [];
let cycleConfig = JSON.parse(localStorage.getItem('pockita_cycle')) || null;
let cooldownItems = JSON.parse(localStorage.getItem('pockita_cooldown')) || [];

let pockitaMethods = JSON.parse(localStorage.getItem('pockita_custom_methods')) || {
    'Cash': '', 'BCA': '', 'Mandiri': '', 'DANA': '', 'GoPay': '', 'ShopeePay': '', 'Koin': ''
};
if (!pockitaMethods.hasOwnProperty('Mandiri')) pockitaMethods['Mandiri'] = '';
if (!pockitaMethods.hasOwnProperty('ShopeePay')) pockitaMethods['ShopeePay'] = '';
if (!pockitaMethods.hasOwnProperty('Koin')) pockitaMethods['Koin'] = '';
localStorage.setItem('pockita_custom_methods', JSON.stringify(pockitaMethods));

let savedSources = new Set(JSON.parse(localStorage.getItem('pockita_sources')) || []);
let savedDetails = new Set(JSON.parse(localStorage.getItem('pockita_details')) || []);

let chartTargetObj = null; let chartRealisasiObj = null; let chartKomparasiObj = null;
let editingTxId = null; let currentHistoryMode = 'bulan'; 
let balancesByMethodCache = {}; let grandTotalCache = 0;

const iconEdit = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
const iconDelete = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;

// ==================== NAVIGASI UTAMA & SUB-HALAMAN ALA BIBIT ====================
function switchMainView(viewName) {
    closeSubpage(false);
    document.querySelectorAll('.main-view').forEach(v => v.style.display = 'none');
    document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));

    document.getElementById(`view-${viewName}`).style.display = 'block';
    const navBtn = document.getElementById(`nav-${viewName}`);
    if (navBtn) navBtn.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (viewName === 'analysis') setTimeout(renderCharts, 50);
}

function openSubpage(subKey, title) {
    document.querySelectorAll('.main-view').forEach(v => v.style.display = 'none');
    document.querySelectorAll('.subpage-content').forEach(s => s.style.display = 'none');
    document.getElementById('bottom-nav').style.display = 'none';

    document.getElementById('subpage-title').innerText = title;
    document.getElementById('subpage-container').style.display = 'block';
    document.getElementById(`sub-${subKey}`).style.display = 'block';

    if (subKey === 'daily') renderDailyCyclePage();
    if (subKey === 'member') renderMemberCards();
    if (subKey === 'wallet') renderModalMethodList();
    if (subKey === 'simulator') updateSimulator();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeSubpage(returnHome = true) {
    document.getElementById('subpage-container').style.display = 'none';
    document.querySelectorAll('.subpage-content').forEach(s => s.style.display = 'none');
    document.getElementById('bottom-nav').style.display = 'flex';
    if (returnHome) {
        document.querySelectorAll('.main-view').forEach(v => v.style.display = 'none');
        document.getElementById('view-home').style.display = 'block';
        document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('nav-home').classList.add('active');
    }
}

function jumpToWalletManager(e) {
    e.preventDefault();
    closeTxModal();
    openSubpage('wallet', 'Atur Dompet');
}

// ==================== BOTTOM SHEET TRANSAKSI ====================
function openTxModal(defaultType = 'expense') {
    document.getElementById('txModal').style.display = 'flex';
    if (editingTxId === null) {
        document.getElementById('tx-sheet-title').innerText = 'Catat Transaksi';
        switchForm(defaultType);
    }
}

function closeTxModal() {
    document.getElementById('txModal').style.display = 'none';
    if (editingTxId !== null) {
        resetFormButtons();
        document.getElementById('form-pemasukan').reset();
        document.getElementById('form-pengeluaran').reset();
        document.getElementById('form-transfer').reset();
        clearMoodSelection();
        setDefaultDateTime();
    }
}

function closeTxModalOnBackdrop(e) {
    if (e.target.id === 'txModal') closeTxModal();
}

function switchForm(type) {
    document.getElementById('card-pemasukan').style.display = type === 'income' ? 'block' : 'none';
    document.getElementById('card-pengeluaran').style.display = type === 'expense' ? 'block' : 'none';
    document.getElementById('card-transfer').style.display = type === 'transfer' ? 'block' : 'none';
    
    document.getElementById('tab-pemasukan').className = type === 'income' ? 'tab-btn active' : 'tab-btn';
    document.getElementById('tab-pengeluaran').className = type === 'expense' ? 'tab-btn active' : 'tab-btn';
    document.getElementById('tab-transfer').className = type === 'transfer' ? 'tab-btn active' : 'tab-btn';
    if (type === 'expense') toggleCooldownOption();
}

function switchDebtForm(type) {
    document.getElementById('card-piutang').style.display = type === 'piutang' ? 'block' : 'none';
    document.getElementById('card-hutang').style.display = type === 'hutang' ? 'block' : 'none';
    document.getElementById('tab-piutang-btn').className = type === 'piutang' ? 'tab-btn active' : 'tab-btn';
    document.getElementById('tab-hutang-btn').className = type === 'hutang' ? 'tab-btn active' : 'tab-btn';
}

// ==================== MOOD TAGS & COOLDOWN TIMER ====================
function selectMoodTag(btn, tag) {
    const hiddenInput = document.getElementById('out-mood-tag');
    if (btn.classList.contains('selected')) {
        btn.classList.remove('selected');
        hiddenInput.value = '';
    } else {
        document.querySelectorAll('.mood-chip').forEach(c => c.classList.remove('selected'));
        btn.classList.add('selected');
        hiddenInput.value = tag;
    }
}

function clearMoodSelection() {
    document.querySelectorAll('.mood-chip').forEach(c => c.classList.remove('selected'));
    const hiddenInput = document.getElementById('out-mood-tag');
    if (hiddenInput) hiddenInput.value = '';
}

function toggleCooldownOption() {
    const cat = document.getElementById('out-kategori').value;
    const box = document.getElementById('cooldown-action-box');
    box.style.display = (cat === 'keinginan' && editingTxId === null) ? 'block' : 'none';
}

function saveToCooldown() {
    const amount = parseUang(document.getElementById('out-jumlah').value);
    const detail = document.getElementById('out-detail').value.trim();
    const catatan = document.getElementById('out-catatan').value.trim();
    const method = document.getElementById('out-metode').value;
    const moodTag = document.getElementById('out-mood-tag').value;

    if (amount <= 0 || !detail) {
        return alert("Isi nominal dan keterangan dulu sebelum menahan belanja!");
    }

    cooldownItems.push({
        id: Date.now(),
        amount,
        category: 'keinginan',
        detail,
        catatan,
        method,
        moodTag,
        unlockAt: Date.now() + (15 * 60 * 1000)
    });
    localStorage.setItem('pockita_cooldown', JSON.stringify(cooldownItems));
    document.getElementById('form-pengeluaran').reset();
    clearMoodSelection();
    setDefaultDateTime();
    closeTxModal();
    renderCooldownWidget();
}

function cancelCooldownItem(id) {
    cooldownItems = cooldownItems.filter(c => c.id !== id);
    localStorage.setItem('pockita_cooldown', JSON.stringify(cooldownItems));
    renderCooldownWidget();
}

function proceedCooldownItem(id) {
    const item = cooldownItems.find(c => c.id === id);
    if (!item) return;
    const now = new Date();
    transactions.push({
        id: Date.now(),
        type: 'expense',
        amount: item.amount,
        desc: item.detail,
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().split(' ')[0].slice(0, 5),
        method: item.method,
        category: item.category,
        catatan: item.catatan,
        moodTag: item.moodTag
    });
    savedDetails.add(item.detail);
    cooldownItems = cooldownItems.filter(c => c.id !== id);
    localStorage.setItem('pockita_cooldown', JSON.stringify(cooldownItems));
    renderApp();
}

function renderCooldownWidget() {
    const container = document.getElementById('home-cooldown-container');
    if (!container) return;
    if (cooldownItems.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    cooldownItems.forEach(item => {
        const diff = Math.max(0, item.unlockAt - Date.now());
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        const timerText = diff > 0 ? `⏳ ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : '✅ Waktu Tunggu Selesai';

        html += `
        <div class="cooldown-card">
            <div class="cooldown-top">
                <strong style="font-size:0.88rem;">🛑 Ditahan: ${item.detail}</strong>
                <span class="cooldown-timer-pill">${timerText}</span>
            </div>
            <div style="font-size:0.82rem; color:var(--text-muted);">Nominal: <strong style="color:var(--expense-red);">Rp ${formatRupiah(item.amount)}</strong> (${item.method})</div>
            <div class="cooldown-actions">
                <button class="btn-cd-cancel" onclick="cancelCooldownItem(${item.id})">✓ Batal Beli (Hemat!)</button>
                <button class="btn-cd-proceed" onclick="proceedCooldownItem(${item.id})">Tetap Catat Keluar</button>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}
setInterval(() => { if (cooldownItems.length > 0) renderCooldownWidget(); }, 1000);

// ==================== SIKLUS UANG SAKU MINIM (BATAS HARIAN) ====================
document.getElementById('form-cycle').addEventListener('submit', function(e) {
    e.preventDefault();
    const budget = parseUang(document.getElementById('cycle-budget').value);
    const days = parseInt(document.getElementById('cycle-days').value) || 7;
    const deadPct = parseInt(document.getElementById('cycle-dead-pct').value) || 0;
    const startDate = document.getElementById('cycle-start').value;

    if (budget <= 0 || !startDate) return alert("Isi nominal pegangan dan tanggal mulai!");

    cycleConfig = { budget, days, deadPct, startDate };
    localStorage.setItem('pockita_cycle', JSON.stringify(cycleConfig));
    renderDailyCyclePage();
    renderHomeDailyWidget();
});

function fillCycleFromBalance(e) {
    e.preventDefault();
    document.getElementById('cycle-budget').value = formatRupiah(Math.max(0, grandTotalCache));
}

function calculateDailyStats() {
    if (!cycleConfig) return null;
    const deadAmount = Math.round(cycleConfig.budget * (cycleConfig.deadPct / 100));
    const usableBudget = Math.max(0, cycleConfig.budget - deadAmount);

    const usedInCycle = transactions
        .filter(tx => tx.type === 'expense' && tx.date >= cycleConfig.startDate)
        .reduce((sum, tx) => sum + tx.amount, 0);

    const remainingCycle = usableBudget - usedInCycle;
    const startObj = new Date(cycleConfig.startDate + 'T00:00:00');
    const todayObj = new Date();
    todayObj.setHours(0, 0, 0, 0);

    const elapsedDays = Math.max(0, Math.floor((todayObj - startObj) / 86400000));
    const remainingDays = Math.max(1, cycleConfig.days - elapsedDays);
    const dailySafe = remainingCycle > 0 ? Math.floor(remainingCycle / remainingDays) : 0;

    return { deadAmount, usableBudget, usedInCycle, remainingCycle, remainingDays, dailySafe };
}

function renderHomeDailyWidget() {
    const widget = document.getElementById('home-daily-widget');
    if (!widget) return;

    const stats = calculateDailyStats();
    if (!stats) {
        widget.innerHTML = `
            <div class="daily-mini-top">
                <span style="font-size:0.82rem; font-weight:700; color:var(--primary-orange);">🛡️ Mode Uang Saku Minim</span>
                <span class="daily-badge daily-badge-warn">Belum Diatur</span>
            </div>
            <div style="font-size:0.82rem; color:var(--text-muted);">Ketuk di sini untuk mengatur batas aman jajan harianmu →</div>`;
        return;
    }

    let badgeClass = 'daily-badge-safe';
    let badgeLabel = 'Aman';
    if (stats.remainingCycle <= 0) {
        badgeClass = 'daily-badge-danger';
        badgeLabel = 'Habis / Defisit';
    } else if (stats.dailySafe < 10000) {
        badgeClass = 'daily-badge-warn';
        badgeLabel = 'Hemat Ketat';
    }

    widget.innerHTML = `
        <div class="daily-mini-top">
            <span style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">BATAS AMAN HARI INI</span>
            <span class="daily-badge ${badgeClass}">${badgeLabel} • Sisa ${stats.remainingDays} Hari</span>
        </div>
        <div class="daily-mini-amount">Rp ${formatRupiah(stats.dailySafe)} <small style="font-size:0.75rem; font-weight:600; color:var(--text-muted);">/ hari</small></div>
        <div class="daily-mini-sub">
            <span>Sisa dana aktif: <b>Rp ${formatRupiah(Math.max(0, stats.remainingCycle))}</b></span>
            <span>Saldo mati: <b>Rp ${formatRupiah(stats.deadAmount)}</b></span>
        </div>`;
}

function renderDailyCyclePage() {
    const box = document.getElementById('daily-summary-box');
    const stats = calculateDailyStats();
    if (!stats) {
        box.innerHTML = '';
        return;
    }

    document.getElementById('cycle-budget').value = formatRupiah(cycleConfig.budget);
    document.getElementById('cycle-days').value = cycleConfig.days;
    document.getElementById('cycle-dead-pct').value = cycleConfig.deadPct;
    document.getElementById('cycle-start').value = cycleConfig.startDate;

    box.innerHTML = `
        <div class="sim-hero-card">
            <span class="balance-title">BATAS AMAN HARI INI</span>
            <h2 class="balance-amount" style="font-size:2.1rem;">Rp ${formatRupiah(stats.dailySafe)}</h2>
            <p style="font-size:0.76rem; opacity:0.85; margin-top:4px;">Tersisa ${stats.remainingDays} hari dari target ${cycleConfig.days} hari</p>
            <div class="sim-metrics-row">
                <div>Saldo Mati (${cycleConfig.deadPct}%)<br><strong>Rp ${formatRupiah(stats.deadAmount)}</strong></div>
                <div>Terpakai<br><strong style="color:#FF7B4A;">Rp ${formatRupiah(stats.usedInCycle)}</strong></div>
                <div>Sisa Aktif<br><strong style="color:#4ADE80;">Rp ${formatRupiah(Math.max(0, stats.remainingCycle))}</strong></div>
            </div>
        </div>`;
}

/* ==================== SIMULATOR ANGGARAN CUSTOM ==================== */
const DEFAULT_SIM_ITEMS = [
    { id: 'sim_1', label: 'Kuota Internet (28–30 Hari)', value: 25000, max: 150000 },
    { id: 'sim_2', label: 'Bensin (Full Tank)', value: 30000, max: 200000 },
    { id: 'sim_3', label: 'Makan Wajib di Luar', value: 0, max: 500000 },
    { id: 'sim_4', label: 'Makan / Jajan Bosan & Stres', value: 45000, max: 300000 },
    { id: 'sim_5', label: 'Belajar di Luar & Traktir', value: 45000, max: 300000 },
    { id: 'sim_6', label: 'Print, Belajar & Keperluan Lain', value: 0, max: 300000 }
];

let simItems = JSON.parse(localStorage.getItem('pockita_sim_items')) || JSON.parse(JSON.stringify(DEFAULT_SIM_ITEMS));

function saveSimState() {
    localStorage.setItem('pockita_sim_items', JSON.stringify(simItems));
    const incomeEl = document.getElementById('sim-income');
    if (incomeEl) localStorage.setItem('pockita_sim_income', incomeEl.value);
}

function formatRpSim(num) {
    const abs = Math.abs(Math.round(num)).toLocaleString('id-ID');
    return (num < 0 ? '-Rp ' : 'Rp ') + abs;
}

function renderSimulatorItems() {
    const container = document.getElementById('sim-sliders-container');
    if (!container) return;

    if (simItems.length === 0) {
        container.innerHTML = `<p class="sub-info" style="text-align:center; padding: 12px 0;">Belum ada pos pengeluaran. Tambahkan di bawah.</p>`;
        updateSimulator();
        return;
    }

    container.innerHTML = simItems.map(item => `
        <div class="slider-item">
            <div class="slider-label">
                <div class="slider-label-left">
                    <span class="slider-label-text">${item.label}</span>
                    <span class="sim-item-actions">
                        <button type="button" class="btn-sim-mini" onclick="editSimulatorItem('${item.id}')" title="Ubah nama">✏️</button>
                        <button type="button" class="btn-sim-mini del" onclick="deleteSimulatorItem('${item.id}')" title="Hapus pos">×</button>
                    </span>
                </div>
                <strong id="val-${item.id}">${formatRpSim(item.value)}</strong>
            </div>
            <input type="range" min="0" max="${item.max}" step="5000" value="${item.value}" oninput="onSimSliderInput('${item.id}', this.value)">
        </div>
    `).join('');

    updateSimulator();
}

function onSimSliderInput(id, val) {
    const item = simItems.find(i => i.id === id);
    if (!item) return;
    item.value = Number(val) || 0;
    const labelEl = document.getElementById(`val-${id}`);
    if (labelEl) labelEl.textContent = formatRpSim(item.value);
    saveSimState();
    updateSimulator();
}

function updateSimulator() {
    const incomeInput = document.getElementById('sim-income');
    if (!incomeInput) return;

    const income = parseInt(incomeInput.value.replace(/\D/g, ''), 10) || 0;
    const totalOut = simItems.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    const sisa = income - totalOut;

    const sisaEl = document.getElementById('sim-sisa');
    const outEl = document.getElementById('sim-total-out');
    const d14El = document.getElementById('sim-daily-14');
    const d30El = document.getElementById('sim-daily-30');

    if (sisaEl) {
        sisaEl.textContent = formatRpSim(sisa);
        sisaEl.style.color = sisa < 0 ? '#FF6B6B' : '#4ADE80';
    }
    if (outEl) outEl.textContent = formatRpSim(totalOut);
    if (d14El) d14El.textContent = formatRpSim(Math.max(0, Math.floor(sisa / 14)));
    if (d30El) d30El.textContent = formatRpSim(Math.max(0, Math.floor(sisa / 30)));

    saveSimState();
}

function addSimulatorItem() {
    const labelInput = document.getElementById('new-sim-label');
    const maxInput = document.getElementById('new-sim-max');
    if (!labelInput) return;

    const label = labelInput.value.trim();
    if (!label) {
        labelInput.focus();
        return;
    }

    const customMax = maxInput ? (parseInt(maxInput.value.replace(/\D/g, ''), 10) || 300000) : 300000;
    simItems.push({
        id: 'sim_' + Date.now(),
        label: label,
        value: 0,
        max: Math.max(10000, customMax)
    });

    labelInput.value = '';
    if (maxInput) maxInput.value = '';
    saveSimState();
    renderSimulatorItems();
}

function editSimulatorItem(id) {
    const item = simItems.find(i => i.id === id);
    if (!item) return;
    const newName = prompt('Ubah nama pos pengeluaran:', item.label);
    if (newName && newName.trim()) {
        item.label = newName.trim();
        saveSimState();
        renderSimulatorItems();
    }
}

function deleteSimulatorItem(id) {
    simItems = simItems.filter(i => i.id !== id);
    saveSimState();
    renderSimulatorItems();
}

function resetSimulatorItems() {
    if (!confirm('Kembalikan daftar pos pengeluaran simulator ke bawaan awal?')) return;
    simItems = JSON.parse(JSON.stringify(DEFAULT_SIM_ITEMS));
    saveSimState();
    renderSimulatorItems();
}

document.addEventListener('DOMContentLoaded', () => {
    const savedIncome = localStorage.getItem('pockita_sim_income');
    const incomeEl = document.getElementById('sim-income');
    if (savedIncome && incomeEl) incomeEl.value = savedIncome;
    renderSimulatorItems();
});

// ==================== CORE UTILITIES & FORMATTING ====================
function toggleBalance(e) {
    e.stopPropagation();
    isBalanceHidden = !isBalanceHidden;
    localStorage.setItem('pockita_hide_balance', isBalanceHidden);
    renderApp();
}

function toggleBreakdown(e) {
    if (isBalanceHidden) return; 
    const breakdown = document.getElementById('balance-breakdown');
    breakdown.style.display = breakdown.style.display === 'none' ? 'block' : 'none';
}

function initMonthPicker() {
    const now = new Date();
    document.getElementById('global-month-picker').value = now.toISOString().slice(0, 7);
    document.getElementById('filter-hari').value = now.toISOString().split('T')[0];
    document.getElementById('cycle-start').value = now.toISOString().split('T')[0];
}

function getSelectedMonth() { return document.getElementById('global-month-picker').value; }
function changeGlobalMonth() {
    setHistoryMode('bulan');
    if (document.getElementById('view-analysis').style.display === 'block') renderCharts();
}

function attachMoneyFormat() {
    document.querySelectorAll('.format-uang').forEach(input => {
        input.removeEventListener('input', formatUangLive); 
        input.addEventListener('input', formatUangLive);
    });
}
function formatUangLive(e) {
    let val = e.target.value.replace(/[^0-9]/g, '');
    e.target.value = val !== '' ? new Intl.NumberFormat('id-ID').format(val) : '';
}
function parseUang(str) { return parseInt(str.toString().replace(/[^0-9]/g, '')) || 0; }
function formatRupiah(angka) { return new Intl.NumberFormat('id-ID').format(angka); }
function formatK(angka) {
    return angka >= 1000 ? ((angka % 1000 === 0) ? (angka / 1000) + 'K' : (angka / 1000).toFixed(1).replace('.0', '') + 'K') : angka.toString();
}

// ==================== METODE PEMBAYARAN / DOMPET ====================
function populateSelectMethods() {
    const arrMethods = Object.keys(pockitaMethods);
    ['in-metode', 'out-metode', 'tf-metode-dari', 'tf-metode-ke', 'recur-metode', 'piutang-metode', 'hutang-metode'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const currentVal = el.value;
            el.innerHTML = '';
            arrMethods.forEach(m => el.innerHTML += `<option value="${m}">${m}</option>`);
            if (currentVal && arrMethods.includes(currentVal)) el.value = currentVal;
        }
    });
    renderModalMethodList();
}

function renderModalMethodList() {
    const list = document.getElementById('modal-method-list');
    if (!list) return;
    list.innerHTML = '';
    for (let method in pockitaMethods) {
        const imgData = pockitaMethods[method] || `assets/img/${method.toLowerCase().replace(/[^a-z0-9]/g, '')}.png`;
        const bal = balancesByMethodCache[method] || 0;
        list.innerHTML += `
            <li class="transaction-item" style="padding: 10px 0;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${imgData}" class="method-icon" style="width:30px;height:30px;" onerror="this.outerHTML='<div class=\\'method-icon fallback-icon\\' style=\\'width:30px;height:30px;\\'>${method.charAt(0)}</div>'">
                    <div>
                        <div style="font-weight:700; font-size:0.92rem;">${method}</div>
                        <div style="font-size:0.76rem; color:var(--text-muted);">Saldo: Rp ${formatRupiah(bal)}</div>
                    </div>
                </div>
                <button class="btn-delete" onclick="deleteMethod('${method}')">${iconDelete}</button>
            </li>`;
    }
}

function saveNewMethod() {
    const nameInput = document.getElementById('new-method-name');
    const fileInput = document.getElementById('new-method-file');
    const name = nameInput.value.trim();
    if (!name) return alert("Nama metode tidak boleh kosong!");

    if (fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) { pockitaMethods[name] = e.target.result; finalizeSaveMethod(nameInput, fileInput); };
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        pockitaMethods[name] = '';
        finalizeSaveMethod(nameInput, fileInput);
    }
}

function finalizeSaveMethod(nameInput, fileInput) {
    localStorage.setItem('pockita_custom_methods', JSON.stringify(pockitaMethods));
    nameInput.value = '';
    fileInput.value = '';
    populateSelectMethods();
    renderApp();
}

function deleteMethod(name) {
    if (confirm(`Hapus metode ${name}?`)) {
        delete pockitaMethods[name];
        localStorage.setItem('pockita_custom_methods', JSON.stringify(pockitaMethods));
        populateSelectMethods();
        renderApp();
    }
}

// ==================== KARTU MEMBER ====================
function saveMemberCard() {
    const nameInput = document.getElementById('new-member-name');
    const fileInput = document.getElementById('new-member-file');
    const name = nameInput.value.trim();
    if (!name || !fileInput.files || !fileInput.files[0]) return alert("Nama kartu dan gambar barcode wajib diisi!");

    const reader = new FileReader();
    reader.onload = function(e) { 
        memberCards.push({ id: Date.now(), name: name, image: e.target.result });
        localStorage.setItem('pockita_members', JSON.stringify(memberCards));
        nameInput.value = '';
        fileInput.value = '';
        renderMemberCards();
    };
    reader.readAsDataURL(fileInput.files[0]);
}

window.deleteMemberCard = function(id) {
    if (confirm("Hapus kartu member ini?")) {
        memberCards = memberCards.filter(c => c.id !== id);
        localStorage.setItem('pockita_members', JSON.stringify(memberCards));
        renderMemberCards();
    }
}

window.showFullscreenImg = function(src) {
    let overlay = document.getElementById('fullscreen-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'fullscreen-overlay';
        overlay.className = 'fullscreen-overlay';
        overlay.innerHTML = `<span class="close-fullscreen" onclick="this.parentElement.style.display='none'">×</span><img id="fullscreen-img-element" class="fullscreen-img" src="">`;
        document.body.appendChild(overlay);
    }
    document.getElementById('fullscreen-img-element').src = src;
    overlay.style.display = 'flex';
}

function renderMemberCards() {
    const list = document.getElementById('member-card-list');
    if (!list) return;
    list.innerHTML = '';
    if (memberCards.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:0.82rem; padding: 14px 0; grid-column: span 2;">Belum ada kartu member tersimpan.</div>`;
    } else {
        memberCards.forEach(c => {
            list.innerHTML += `
            <div class="member-card-item">
                <button class="member-card-delete" onclick="deleteMemberCard(${c.id})">✖</button>
                <img src="${c.image}" class="member-card-img" onclick="showFullscreenImg('${c.image}')" title="Klik perbesar">
                <div class="member-card-name">${c.name}</div>
            </div>`;
        });
    }
}

// ==================== UANG TITIPAN (REZE'S BOMB VIOLET) ====================
document.getElementById('form-titipan').addEventListener('submit', function(e) {
    e.preventDefault();
    const title = document.getElementById('titipan-judul').value;
    const modal = parseUang(document.getElementById('titipan-modal').value);
    const date = document.getElementById('titipan-tanggal').value; 

    if (modal <= 0) return;
    titipanData.push({ id: Date.now(), title: title, modal: modal, date: date, items: [] });
    localStorage.setItem('pockita_titipan', JSON.stringify(titipanData));
    this.reset();
    setDefaultDateTime();
    renderApp();
});

window.toggleTitipan = function(id) {
    let el = document.getElementById('titipan-content-' + id);
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

window.tambahItemTitipan = function(e, id) {
    e.preventDefault();
    let name = document.getElementById(`titipan-item-name-${id}`).value;
    let price = parseUang(document.getElementById(`titipan-item-price-${id}`).value);
    
    let session = titipanData.find(t => t.id === id);
    if (session && price > 0) {
        session.items.push({ name, price });
        localStorage.setItem('pockita_titipan', JSON.stringify(titipanData));
        renderApp();
        setTimeout(() => { document.getElementById(`titipan-content-${id}`).style.display = 'block'; }, 50);
    }
}

window.hapusItemTitipan = function(id, index) {
    let session = titipanData.find(t => t.id === id);
    if (session) {
        session.items.splice(index, 1);
        localStorage.setItem('pockita_titipan', JSON.stringify(titipanData));
        renderApp();
        setTimeout(() => { document.getElementById(`titipan-content-${id}`).style.display = 'block'; }, 50);
    }
}

window.hapusTitipan = function(id) {
    if (confirm("Hapus seluruh riwayat titipan ini?")) {
        titipanData = titipanData.filter(t => t.id !== id);
        localStorage.setItem('pockita_titipan', JSON.stringify(titipanData));
        renderApp();
    }
}

function renderTitipan() {
    const container = document.getElementById('list-titipan');
    if (!container) return;
    container.innerHTML = '';
    if (titipanData.length === 0) {
        container.innerHTML = `<div class="empty-state" style="padding: 10px 0;"><img src="assets/img/pochita-sleep.png" class="empty-state-img empty-neon-orange" style="width:45px;height:45px;" alt="Kosong">Belum ada riwayat titipan.</div>`;
        return;
    }

    titipanData.slice().reverse().forEach(t => {
        let terpakai = t.items.reduce((sum, item) => sum + item.price, 0);
        let sisa = t.modal - terpakai;
        let itemsHtml = '';
        t.items.forEach((item, index) => {
            itemsHtml += `
                <li class="titipan-item">
                    <span>${item.name}</span> 
                    <span>Rp ${formatRupiah(item.price)} <button style="background:transparent;border:none;color:var(--expense-red);margin-left:5px;cursor:pointer;" onclick="hapusItemTitipan(${t.id}, ${index})">✖</button></span>
                </li>`;
        });
        if (itemsHtml === '') itemsHtml = `<li style="text-align:center; font-size:0.8rem; color:var(--text-muted); padding: 5px 0;">Belum ada barang ditambahkan.</li>`;

        let formattedDate = new Date(t.date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        container.innerHTML += `
        <div class="person-group" style="border-color: var(--reze-violet);">
            <button class="person-header" onclick="toggleTitipan(${t.id})" style="background: #F4ECF8; color: var(--reze-violet);">
                <span>🛒 ${t.title} <small style="font-weight:normal; color:var(--text-muted); display:block; margin-top:2px;">📅 ${formattedDate}</small></span>
                <span style="text-align:right;">Sisa: Rp ${formatRupiah(sisa)} ▼</span>
            </button>
            <div class="person-content" id="titipan-content-${t.id}">
                <div class="titipan-summary">
                    <div>Modal: <br><strong>Rp ${formatRupiah(t.modal)}</strong></div>
                    <div>Terpakai: <br><strong style="color:var(--expense-red)">Rp ${formatRupiah(terpakai)}</strong></div>
                    <div>Sisa: <br><strong style="color:var(--income-green)">Rp ${formatRupiah(sisa)}</strong></div>
                </div>
                <ul class="titipan-item-list">${itemsHtml}</ul>
                <form class="titipan-add-form" onsubmit="tambahItemTitipan(event, ${t.id})">
                    <input type="text" id="titipan-item-name-${t.id}" placeholder="Nama barang..." required style="flex: 2;">
                    <input type="text" inputmode="numeric" id="titipan-item-price-${t.id}" class="format-uang" placeholder="Harga Rp" required style="flex: 1.5;">
                    <button type="submit">+</button>
                </form>
                <button class="btn-delete" style="width:100%; margin-top: 12px; border-radius: 8px; background: #FDECEC; color: var(--expense-red); height: 38px;" onclick="hapusTitipan(${t.id})">Hapus Sesi Ini</button>
            </div>
        </div>`;
    });
}

// ==================== TRANSAKSI BERULANG ====================
function checkAndApplyRecurring() {
    const realMonth = new Date().toISOString().slice(0, 7); 
    if (recurringAppliedMonths.includes(realMonth)) return;
    if (recurringTemplates.length === 0) return;

    recurringTemplates.forEach(tpl => {
        transactions.push({ id: Date.now() + Math.random(), type: 'expense', amount: tpl.amount, category: tpl.category || 'kebutuhan', desc: `Auto: ${tpl.name}`, date: `${realMonth}-01`, time: "00:01", method: tpl.method });
    });

    recurringAppliedMonths.push(realMonth);
    localStorage.setItem('pockita_applied_months', JSON.stringify(recurringAppliedMonths));
    localStorage.setItem('pockita_tx', JSON.stringify(transactions));
}

function setHistoryMode(mode) {
    currentHistoryMode = mode;
    document.getElementById('btn-mode-semua').className = mode === 'semua' ? 'time-btn active' : 'time-btn';
    document.getElementById('btn-mode-bulan').className = mode === 'bulan' ? 'time-btn active' : 'time-btn';
    document.getElementById('btn-mode-hari').className = mode === 'hari' ? 'time-btn active' : 'time-btn';
    document.getElementById('filter-hari').style.display = mode === 'hari' ? 'inline-block' : 'none';
    renderApp();
}

function clearHistorySearch() {
    const input = document.getElementById('search-history');
    if (input) input.value = '';
    renderApp();
}

function matchesHistorySearch(tx, rawSearch) {
    if (!rawSearch) return true;
    const numericQuery = rawSearch.replace(/[^0-9]/g, '');
    const isPureAmountQuery = /^[rp\s.,0-9]+$/i.test(rawSearch) && numericQuery.length > 0;

    if (isPureAmountQuery && tx.amount.toString().includes(numericQuery)) {
        return true;
    }

    return (
        (tx.desc && tx.desc.toLowerCase().includes(rawSearch)) ||
        (tx.catatan && tx.catatan.toLowerCase().includes(rawSearch)) ||
        (tx.method && tx.method.toLowerCase().includes(rawSearch)) ||
        (tx.methodTo && tx.methodTo.toLowerCase().includes(rawSearch)) ||
        (tx.category && tx.category.toLowerCase().includes(rawSearch)) ||
        (tx.moodTag && tx.moodTag.toLowerCase().includes(rawSearch))
    );
}

// ==================== RENDER UTAMA APLIKASI ====================
function buildTransactionItemHTML(tx, showDate = false) {
    let isAuto = tx.desc.startsWith('Auto: ');
    let isTarget = tx.desc.startsWith('Target: ');
    let isBeriPiutang = tx.desc.startsWith('Memberi Piutang: ');
    let isTerimaPiutang = tx.desc.startsWith('Terima Piutang: ');
    let isTerimaHutang = tx.desc.startsWith('Menerima Hutang: ');
    let isBayarHutang = tx.desc.startsWith('Bayar Hutang: ');
    let isTransfer = tx.type === 'transfer';
    
    let isPiutang = isBeriPiutang || isTerimaPiutang;
    let isHutang = isTerimaHutang || isBayarHutang;

    let cleanDesc = tx.desc.replace('Auto: ', '').replace('Target: ', '').replace('Memberi Piutang: ', '').replace('Terima Piutang: ', '').replace('Menerima Hutang: ', '').replace('Bayar Hutang: ', '');
    if (tx.category === 'biaya admin') {
        cleanDesc = cleanDesc.replace('Biaya Admin Mutasi: ', '').replace(' ke ', ' ➡ ');
    }

    let pillExtra = '';
    if (isAuto) pillExtra += `<span class="pill-outline pill-outline-auto">AUTO</span>`;
    if (isTarget) pillExtra += `<span class="pill-outline pill-outline-target">TAGIHAN</span>`;
    if (isPiutang) pillExtra += `<span class="pill-outline pill-outline-piutang">PIUTANG</span>`;
    if (isHutang) pillExtra += `<span class="pill-outline pill-outline-hutang">HUTANG</span>`;
    if (isTransfer) pillExtra += `<span class="pill-outline pill-outline-transfer">⇄ MUTASI</span>`;
    if (tx.moodTag) pillExtra += `<span class="pill-outline pill-outline-mood">${tx.moodTag}</span>`;

    let catName = (tx.category && typeof tx.category === 'string') ? tx.category.toLowerCase() : "umum";
    let catColorClass = 'pill-outline-kebutuhan';
    if (catName === 'keinginan') catColorClass = 'pill-outline-keinginan';
    else if (catName === 'tabungan') catColorClass = 'pill-outline-tabungan';
    else if (catName === 'biaya admin') catColorClass = 'pill-outline-admin';
    
    let pillKategori = tx.type === 'expense' && !isPiutang && !isHutang && !isTransfer ? `<span class="pill-outline ${catColorClass}">${catName.toUpperCase()}</span>` : '';
    
    let txDisplayAmount = `Rp ${formatRupiah(tx.amount)}`;
    let txColorClass = tx.type === 'income' ? 'tx-income' : 'tx-expense';
    let sign = tx.type === 'income' ? '+' : '-';

    if (isTransfer) {
        txColorClass = 'tx-transfer';
        sign = '';
        cleanDesc = `${tx.method} ➡ ${tx.methodTo}`;
    }

    let catatanUI = tx.catatan ? `<div class="tx-note">📝 ${tx.catatan}</div>` : '';

    let dateMeta = '';
    if (showDate && tx.date) {
        const dObj = new Date(tx.date + 'T00:00:00');
        const formattedShortDate = dObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        dateMeta = `${formattedShortDate} • `;
    }

    return `
        <div class="tx-kiri">
            <div class="tx-title">${cleanDesc}</div>
            ${catatanUI}
            <div class="pill-container">${pillKategori}${pillExtra}</div>
            <span class="tx-meta">${tx.method} • ${dateMeta}Jam ${tx.time}</span>
        </div>
        <div class="tx-kanan">
            <div class="tx-amount ${txColorClass}">${sign} ${txDisplayAmount}</div>
            <div class="tx-actions">
                <button class="btn-edit" onclick="editTransaksi(${tx.id})" title="Edit">${iconEdit}</button>
                <button class="btn-delete" onclick="hapusTransaksi(${tx.id})" title="Hapus">${iconDelete}</button>
            </div>
        </div>`;
}

function renderApp() {
    const activeMonth = getSelectedMonth();
    const transactionContainer = document.getElementById('daftar-transaksi');
    const homeRecentContainer = document.getElementById('home-recent-tx');
    const filterMetode = document.getElementById('filter-metode');
    const filterTipe = document.getElementById('filter-tipe') ? document.getElementById('filter-tipe').value : 'Utama';
    const filterMood = document.getElementById('filter-mood') ? document.getElementById('filter-mood').value : 'Semua';
    
    const searchInput = document.getElementById('search-history');
    const rawSearch = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const clearBtn = document.getElementById('btn-clear-search');
    if (clearBtn) clearBtn.style.display = rawSearch ? 'flex' : 'none';

    transactionContainer.innerHTML = '';
    let grandTotalSaldo = 0;
    let balancesByMethod = {};

    transactions.forEach(tx => {
        if (!balancesByMethod[tx.method]) balancesByMethod[tx.method] = 0;
        if (tx.type === 'income') { 
            grandTotalSaldo += tx.amount;
            balancesByMethod[tx.method] += tx.amount; 
        } else if (tx.type === 'expense') { 
            grandTotalSaldo -= tx.amount;
            balancesByMethod[tx.method] -= tx.amount; 
        } else if (tx.type === 'transfer') {
            if (!balancesByMethod[tx.methodTo]) balancesByMethod[tx.methodTo] = 0;
            balancesByMethod[tx.method] -= tx.amount; 
            balancesByMethod[tx.methodTo] += tx.amount; 
        }
    });

    balancesByMethodCache = balancesByMethod;
    grandTotalCache = grandTotalSaldo;

    const saldoEl = document.getElementById('total-saldo');
    const eyeBtn = document.getElementById('btn-toggle-eye');
    const breakdownContainer = document.getElementById('balance-breakdown');
    breakdownContainer.innerHTML = '';

    if (isBalanceHidden) {
        saldoEl.innerText = '***';
        eyeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
        breakdownContainer.style.display = 'none'; 
    } else {
        saldoEl.innerText = formatRupiah(grandTotalSaldo);
        eyeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
        for (const [method, amount] of Object.entries(balancesByMethod)) {
            breakdownContainer.innerHTML += `<div class="breakdown-item"><span>${method}</span><span>Rp ${formatRupiah(amount)}</span></div>`;
        }
    }

    // RENDER 3 TRANSAKSI TERAKHIR DI BERANDA (DENGAN TANGGAL)
    const recentTxs = transactions.slice().sort((a, b) => {
        const timeA = new Date((a.date || '') + 'T' + (a.time || '00:00')).getTime() || a.id;
        const timeB = new Date((b.date || '') + 'T' + (b.time || '00:00')).getTime() || b.id;
        return timeB === timeA ? b.id - a.id : timeB - timeA;
    }).slice(0, 3);

    if (recentTxs.length === 0) {
        homeRecentContainer.innerHTML = `<div class="empty-state" style="padding:12px 0;"><img src="assets/img/pochita-sleep.png" class="empty-state-img empty-neon-orange" style="width:46px;height:46px;" alt="Kosong">Belum ada transaksi. Tekan tombol + di bawah untuk mulai mencatat.</div>`;
    } else {
        const ulRecent = document.createElement('ul');
        ulRecent.className = 'transaction-list';
        recentTxs.forEach(tx => {
            const li = document.createElement('li');
            li.className = 'transaction-item';
            li.innerHTML = buildTransactionItemHTML(tx, true);
            ulRecent.appendChild(li);
        });
        homeRecentContainer.innerHTML = '';
        homeRecentContainer.appendChild(ulRecent);
    }

    // RENDER HALAMAN RIWAYAT LENGKAP (MENDUKUNG MODE SEMUA & PENCARIAN LINTAS WAKTU)
    const isAllTimeFlatView = currentHistoryMode === 'semua' || rawSearch !== '';
    let displayTransactions = [];

    if (isAllTimeFlatView) {
        displayTransactions = transactions.slice();
    } else if (currentHistoryMode === 'bulan') {
        displayTransactions = transactions.filter(tx => tx.date.startsWith(activeMonth));
    } else {
        const specificDate = document.getElementById('filter-hari').value;
        displayTransactions = transactions.filter(tx => tx.date === specificDate);
    }

    updateDatalist('sumber-list', savedSources);
    updateDatalist('detail-list', savedDetails);
    populateSelectMethods(); 

    if (filterTipe === 'Utama') {
        displayTransactions = displayTransactions.filter(tx => tx.type !== 'transfer');
    } else {
        displayTransactions = displayTransactions.filter(tx => tx.type === filterTipe);
    }

    if (filterMood !== 'Semua') {
        displayTransactions = displayTransactions.filter(tx => tx.moodTag === filterMood);
    }

    const currentFilter = filterMetode.value; 
    filterMetode.innerHTML = '<option value="Semua">Semua Dompet</option>';
    Object.keys(pockitaMethods).forEach(method => {
        const isSelected = method === currentFilter ? 'selected' : '';
        filterMetode.innerHTML += `<option value="${method}" ${isSelected}>${method}</option>`;
    });

    if (currentFilter !== 'Semua') { 
        displayTransactions = displayTransactions.filter(tx => tx.method === currentFilter || (tx.type === 'transfer' && tx.methodTo === currentFilter)); 
    }

    if (rawSearch !== '') {
        displayTransactions = displayTransactions.filter(tx => matchesHistorySearch(tx, rawSearch));
    }

    if (displayTransactions.length === 0) {
        transactionContainer.innerHTML = `<div class="empty-state"><img src="assets/img/pochita-sleep.png" class="empty-state-img empty-neon-orange" alt="Kosong">Tidak ada riwayat transaksi yang cocok.</div>`;
    } else if (isAllTimeFlatView) {
        if (rawSearch !== '') {
            transactionContainer.innerHTML = `<div class="search-scope-info">🔍 Ditemukan ${displayTransactions.length} transaksi dari semua bulan</div>`;
        }

        const ulFlat = document.createElement('ul');
        ulFlat.className = 'transaction-list';

        displayTransactions.sort((a, b) => {
            const timeA = new Date((a.date || '') + 'T' + (a.time || '00:00')).getTime() || a.id;
            const timeB = new Date((b.date || '') + 'T' + (b.time || '00:00')).getTime() || b.id;
            return timeB === timeA ? b.id - a.id : timeB - timeA;
        }).forEach(tx => {
            const li = document.createElement('li');
            li.className = 'transaction-item';
            li.innerHTML = buildTransactionItemHTML(tx, true);
            ulFlat.appendChild(li);
        });

        transactionContainer.appendChild(ulFlat);
    } else {
        const groupedTx = {};
        displayTransactions.forEach(tx => {
            if (!groupedTx[tx.method]) groupedTx[tx.method] = [];
            groupedTx[tx.method].push(tx);
            if (tx.type === 'transfer' && currentFilter !== 'Semua' && tx.methodTo === currentFilter && tx.method !== currentFilter) {
                if (!groupedTx[tx.methodTo]) groupedTx[tx.methodTo] = [];
                groupedTx[tx.methodTo].push(tx);
            }
        });

        for (const method in groupedTx) {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'method-group';
            const imgData = pockitaMethods[method] || `assets/img/${method.toLowerCase().replace(/[^a-z0-9]/g, '')}.png`;

            groupDiv.innerHTML = `<div class="method-group-title"><img src="${imgData}" class="method-icon" onerror="this.outerHTML='<div class=\\'method-icon fallback-icon\\'>${method.charAt(0)}</div>'">${method}</div>`;
            
            const txsByDate = {};
            groupedTx[method].forEach(tx => {
                if (!txsByDate[tx.date]) txsByDate[tx.date] = [];
                if (!txsByDate[tx.date].find(x => x.id === tx.id)) txsByDate[tx.date].push(tx);
            });

            const sortedDates = Object.keys(txsByDate).sort((a, b) => new Date(b) - new Date(a));

            sortedDates.forEach(dateStr => {
                const d = new Date(dateStr + 'T00:00:00');
                const formattedDate = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

                const dateHeader = document.createElement('div');
                dateHeader.className = 'date-group-title';
                dateHeader.innerText = `📅 ${formattedDate}`;
                groupDiv.appendChild(dateHeader);

                const ul = document.createElement('ul');
                ul.className = 'transaction-list';

                txsByDate[dateStr].sort((a, b) => {
                    const timeA = new Date((a.date || '') + 'T' + (a.time || '00:00')).getTime() || a.id;
                    const timeB = new Date((b.date || '') + 'T' + (b.time || '00:00')).getTime() || b.id;
                    return timeB === timeA ? b.id - a.id : timeB - timeA;
                }).forEach(tx => {
                    const li = document.createElement('li');
                    li.className = 'transaction-item';
                    li.innerHTML = buildTransactionItemHTML(tx, false);
                    ul.appendChild(li);
                });
                groupDiv.appendChild(ul);
            });
            transactionContainer.appendChild(groupDiv);
        }
    }

    renderHomeDailyWidget();
    renderCooldownWidget();
    renderPlans();
    localStorage.setItem('pockita_tx', JSON.stringify(transactions));
    localStorage.setItem('pockita_sources', JSON.stringify([...savedSources]));
    localStorage.setItem('pockita_details', JSON.stringify([...savedDetails]));
    attachMoneyFormat();
}

// ==================== EDIT & SIMPAN TRANSAKSI ====================
function editTransaksi(id) {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    
    editingTxId = id;
    document.getElementById('tx-sheet-title').innerText = 'Edit Transaksi';
    openTxModal(tx.type);
    switchForm(tx.type);

    if (tx.type === 'income') {
        document.getElementById('in-jumlah').value = formatRupiah(tx.amount);
        document.getElementById('in-sumber').value = tx.desc;
        document.getElementById('in-catatan').value = tx.catatan || '';
        document.getElementById('in-tanggal').value = tx.date;
        document.getElementById('in-waktu').value = tx.time;
        document.getElementById('in-metode').value = tx.method;
        document.getElementById('btn-submit-income').innerText = "Update Pemasukan ✓";
        document.getElementById('btn-submit-income').style.backgroundColor = "var(--secondary-orange)"; 
    } else if (tx.type === 'expense') {
        document.getElementById('out-jumlah').value = formatRupiah(tx.amount);
        document.getElementById('out-kategori').value = tx.category || 'kebutuhan';
        let cleanText = tx.desc.replace('Auto: ', '').replace('Target: ', '').replace('Memberi Piutang: ', '').replace('Terima Piutang: ', '').replace('Menerima Hutang: ', '').replace('Bayar Hutang: ', '');
        document.getElementById('out-detail').value = cleanText;
        document.getElementById('out-catatan').value = tx.catatan || '';
        document.getElementById('out-tanggal').value = tx.date;
        document.getElementById('out-waktu').value = tx.time;
        document.getElementById('out-metode').value = tx.method;

        clearMoodSelection();
        if (tx.moodTag) {
            document.getElementById('out-mood-tag').value = tx.moodTag;
            document.querySelectorAll('.mood-chip').forEach(c => {
                if (c.innerText === tx.moodTag) c.classList.add('selected');
            });
        }

        document.getElementById('btn-submit-expense').innerText = "Update Pengeluaran ✓";
        document.getElementById('btn-submit-expense').style.backgroundColor = "var(--secondary-orange)";
        toggleCooldownOption();
    } else if (tx.type === 'transfer') {
        document.getElementById('tf-jumlah').value = formatRupiah(tx.amount);
        document.getElementById('tf-metode-dari').value = tx.method;
        document.getElementById('tf-metode-ke').value = tx.methodTo;
        document.getElementById('tf-catatan').value = tx.catatan || '';
        document.getElementById('tf-tanggal').value = tx.date;
        document.getElementById('tf-waktu').value = tx.time;
        document.getElementById('tf-admin').value = '';
        document.getElementById('tf-admin').disabled = true;
        document.getElementById('btn-submit-transfer').innerText = "Update Mutasi ✓";
        document.getElementById('btn-submit-transfer').style.backgroundColor = "var(--secondary-orange)";
    }
}

function resetFormButtons() {
    document.getElementById('btn-submit-income').innerText = "Simpan Pemasukan";
    document.getElementById('btn-submit-income').style.backgroundColor = "var(--income-green)";
    document.getElementById('btn-submit-expense').innerText = "Simpan Pengeluaran";
    document.getElementById('btn-submit-expense').style.backgroundColor = "var(--expense-red)";
    document.getElementById('btn-submit-transfer').innerText = "Mutasi Saldo";
    document.getElementById('btn-submit-transfer').style.backgroundColor = "var(--suit-slate)";
    document.getElementById('tf-admin').disabled = false;
    editingTxId = null;
}

function simpanTransaksi(type, idAmount, idDesc, idDate, idTime, idMethod, idKategori = null, idMethodTo = null, idCatatan = null, idAdmin = null) {
    const amount = parseUang(document.getElementById(idAmount).value);
    const desc = idDesc && document.getElementById(idDesc) ? document.getElementById(idDesc).value : ''; 
    const date = document.getElementById(idDate).value;
    const time = document.getElementById(idTime).value;
    const method = document.getElementById(idMethod).value;
    const category = idKategori ? document.getElementById(idKategori).value : null;
    const methodTo = idMethodTo ? document.getElementById(idMethodTo).value : null;
    const catatan = idCatatan && document.getElementById(idCatatan) ? document.getElementById(idCatatan).value : '';
    const admin = idAdmin && document.getElementById(idAdmin) ? parseUang(document.getElementById(idAdmin).value) : 0;
    const moodTag = type === 'expense' ? document.getElementById('out-mood-tag').value : '';

    if (amount <= 0) return;
    if (type === 'transfer' && method === methodTo) return alert("Pilih dompet tujuan yang berbeda!");

    if (editingTxId !== null) {
        const idx = transactions.findIndex(t => t.id === editingTxId);
        const oldDesc = transactions[idx].desc;
        const linkedGoalId = transactions[idx].goalId; 
        const linkedDebtId = transactions[idx].debtId; 

        let finalDesc = desc;
        if (oldDesc.startsWith('Auto: ')) finalDesc = 'Auto: ' + desc;
        if (oldDesc.startsWith('Target: ')) finalDesc = 'Target: ' + desc;
        if (oldDesc.startsWith('Memberi Piutang: ')) finalDesc = 'Memberi Piutang: ' + desc;
        if (oldDesc.startsWith('Terima Piutang: ')) finalDesc = 'Terima Piutang: ' + desc;
        if (oldDesc.startsWith('Menerima Hutang: ')) finalDesc = 'Menerima Hutang: ' + desc;
        if (oldDesc.startsWith('Bayar Hutang: ')) finalDesc = 'Bayar Hutang: ' + desc;

        transactions[idx] = { id: editingTxId, type, amount, desc: finalDesc, date, time, method, methodTo, category, goalId: linkedGoalId, debtId: linkedDebtId, catatan, moodTag };
        resetFormButtons();
    } else {
        const newTxId = Date.now();
        transactions.push({ id: newTxId, type, amount, desc, date, time, method, methodTo, category, catatan, moodTag });
        
        if (type === 'transfer' && admin > 0) {
            transactions.push({ 
                id: newTxId + 1, type: 'expense', amount: admin, desc: `${method} ➡ ${methodTo}`, 
                date, time, method, category: 'biaya admin', catatan 
            });
        }
    }
    
    if (type === 'income') savedSources.add(desc);
    if (type === 'expense') savedDetails.add(desc);

    document.getElementById(type === 'income' ? 'form-pemasukan' : (type === 'expense' ? 'form-pengeluaran' : 'form-transfer')).reset();
    clearMoodSelection();
    setDefaultDateTime();
    closeTxModal();
    renderApp();
    if (document.getElementById('view-analysis').style.display === 'block') renderCharts();
}

document.getElementById('form-pemasukan').addEventListener('submit', function(e) { e.preventDefault(); simpanTransaksi('income', 'in-jumlah', 'in-sumber', 'in-tanggal', 'in-waktu', 'in-metode', null, null, 'in-catatan', null); });
document.getElementById('form-pengeluaran').addEventListener('submit', function(e) { e.preventDefault(); simpanTransaksi('expense', 'out-jumlah', 'out-detail', 'out-tanggal', 'out-waktu', 'out-metode', 'out-kategori', null, 'out-catatan', null); });
document.getElementById('form-transfer').addEventListener('submit', function(e) { e.preventDefault(); simpanTransaksi('transfer', 'tf-jumlah', null, 'tf-tanggal', 'tf-waktu', 'tf-metode-dari', null, 'tf-metode-ke', 'tf-catatan', 'tf-admin'); });

function hapusTransaksi(id) {
    if (confirm("Hapus transaksi ini?")) {
        transactions = transactions.filter(tx => tx.id !== id);
        renderApp();
        if (document.getElementById('view-analysis').style.display === 'block') renderCharts();
    }
}

// ==================== GRAFIK & ANALISIS (CHAINSAW MAN PALETTE) ====================
function renderCharts() {
    const activeMonth = getSelectedMonth();
    const monthlyTx = transactions.filter(tx => tx.date.startsWith(activeMonth) && tx.type !== 'transfer');
    let totalPemasukanBulanIni = monthlyTx.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);

    let pengeluaranAktual = { kebutuhan: 0, keinginan: 0, tabungan: 0, biayaadmin: 0 };
    monthlyTx.filter(tx => tx.type === 'expense').forEach(tx => {
        const cat = (tx.category && typeof tx.category === 'string') ? tx.category.toLowerCase() : 'kebutuhan';
        if (pengeluaranAktual.hasOwnProperty(cat)) pengeluaranAktual[cat] += tx.amount;
        else if (cat === 'biaya admin') pengeluaranAktual.biayaadmin += tx.amount;
        else pengeluaranAktual.kebutuhan += tx.amount;
    });

    let targetIdeal = { kebutuhan: totalPemasukanBulanIni * 0.5, keinginan: totalPemasukanBulanIni * 0.3, tabungan: totalPemasukanBulanIni * 0.2 };
    updateStatusBadge('kebutuhan', pengeluaranAktual.kebutuhan + pengeluaranAktual.biayaadmin, targetIdeal.kebutuhan);
    updateStatusBadge('keinginan', pengeluaranAktual.keinginan, targetIdeal.keinginan);
    updateStatusBadge('tabungan', pengeluaranAktual.tabungan, targetIdeal.tabungan);

    renderMoodInsights(monthlyTx);

    if (totalPemasukanBulanIni === 0) {
        document.getElementById('empty-target-chart').style.display = 'flex';
        document.getElementById('chartTarget').style.display = 'none';
    } else {
        document.getElementById('empty-target-chart').style.display = 'none';
        document.getElementById('chartTarget').style.display = 'block';
        if (chartTargetObj) chartTargetObj.destroy();
        const ctxTarget = document.getElementById('chartTarget').getContext('2d');
        chartTargetObj = new Chart(ctxTarget, {
            type: 'pie',
            data: { labels: ['Kebutuhan Ideal', 'Keinginan Ideal', 'Tabungan Ideal'], datasets: [{ data: [targetIdeal.kebutuhan, targetIdeal.keinginan, targetIdeal.tabungan], backgroundColor: ['#255C99', '#D4820A', '#1B9A59'], borderWidth: 2, borderColor: '#FFFFFF' }] },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
    }

    if (monthlyTx.length === 0) {
        document.getElementById('empty-realisasi-chart').style.display = 'flex';
        document.getElementById('chartRealisasi').style.display = 'block';
        document.getElementById('chartRealisasi').style.display = 'none';
    } else {
        document.getElementById('empty-realisasi-chart').style.display = 'none';
        document.getElementById('chartRealisasi').style.display = 'block';

        let totalTerpakai = pengeluaranAktual.kebutuhan + pengeluaranAktual.keinginan + pengeluaranAktual.tabungan + pengeluaranAktual.biayaadmin;
        let sisaPemasukan = totalPemasukanBulanIni - totalTerpakai;
        
        let labelChart2 = ['Kebutuhan', 'Keinginan', 'Tabungan'];
        let dataChart2 = [pengeluaranAktual.kebutuhan + pengeluaranAktual.biayaadmin, pengeluaranAktual.keinginan, pengeluaranAktual.tabungan];
        let colorChart2 = ['#255C99', '#D4820A', '#1B9A59'];

        if (sisaPemasukan > 0) {
            labelChart2.push('Sisa Pemasukan');
            dataChart2.push(sisaPemasukan);
            colorChart2.push('#DCDCD3'); 
        }

        if (chartRealisasiObj) chartRealisasiObj.destroy();
        const ctxRealisasi = document.getElementById('chartRealisasi').getContext('2d');
        chartRealisasiObj = new Chart(ctxRealisasi, {
            type: 'pie',
            data: { labels: labelChart2, datasets: [{ data: dataChart2, backgroundColor: colorChart2, borderWidth: 2, borderColor: '#FFFFFF' }] },
            options: { 
                responsive: true, 
                plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function(context) {
                    let label = context.label || ''; let val = context.raw || 0;
                    if (totalPemasukanBulanIni === 0) return `${label}: Rp ${formatRupiah(val)}`;
                    let persentase = ((val / totalPemasukanBulanIni) * 100).toFixed(1);
                    if (label.includes('Sisa')) return ` Tersisa: Rp ${formatRupiah(val)} - ${persentase}%`;
                    let batas = label === 'Kebutuhan' ? 50 : (label === 'Keinginan' ? 30 : 20);
                    return ` ${label}: Rp ${formatRupiah(val)} - ${persentase}% / Batas ${batas}%`;
                }}}} 
            }
        });
    }
    renderBarChartKomparasi();
}

function renderMoodInsights(monthlyTx) {
    const container = document.getElementById('mood-insight-list');
    if (!container) return;
    const expenses = monthlyTx.filter(tx => tx.type === 'expense');
    const totalOut = expenses.reduce((s, tx) => s + tx.amount, 0);

    if (totalOut === 0) {
        container.innerHTML = `<p style="font-size:0.82rem; color:var(--text-muted); text-align:center;">Belum ada pengeluaran di bulan ini.</p>`;
        return;
    }

    const tags = ['#Wajib', '#BosanStres', '#SosialTraktir', '#Darurat'];
    let html = '';
    tags.forEach(tag => {
        const sum = expenses.filter(tx => tx.moodTag === tag).reduce((s, tx) => s + tx.amount, 0);
        const pct = Math.round((sum / totalOut) * 100);
        const color = tag === '#BosanStres' ? '#D62828' : (tag === '#SosialTraktir' ? '#D4820A' : (tag === '#Darurat' ? '#7B3FA0' : '#1B9A59'));
        html += `
        <div class="mood-row">
            <div class="mood-row-header">
                <span>${tag}</span>
                <span>Rp ${formatRupiah(sum)} (${pct}%)</span>
            </div>
            <div class="mood-bar-bg"><div class="mood-bar-fill" style="width:${pct}%; background:${color};"></div></div>
        </div>`;
    });
    container.innerHTML = html;
}

function updateStatusBadge(catName, aktual, target) {
    const badge = document.getElementById(`badge-${catName}`);
    const imgEl = document.getElementById(`img-${catName}`);
    const maxNominalEl = document.getElementById(`max-${catName}`);
    const frontBg = document.getElementById(`bg-${catName}`);
    maxNominalEl.innerText = formatK(target);

    let defaultColor = "var(--primary-orange)";
    if (catName === 'kebutuhan') defaultColor = "#1B9A59";
    if (catName === 'keinginan') defaultColor = "#D4820A";
    if (catName === 'tabungan') defaultColor = "#D62828";
    frontBg.style.backgroundColor = defaultColor;

    imgEl.style.display = "block";
    if (target === 0) { badge.innerHTML = "0%"; imgEl.src = "assets/img/mode-aman.png"; return; }

    const rasio = aktual / target;
    let pct = Math.round(rasio * 100);
    if (pct > 999) pct = ">999"; 
    badge.innerHTML = `${pct}%`;

    if (rasio > 1.0) imgEl.src = "assets/img/mode-bahaya.png";
    else if (rasio >= 0.85) imgEl.src = "assets/img/mode-waspada.png";
    else imgEl.src = "assets/img/mode-aman.png";
}

function renderBarChartKomparasi() {
    let monthsLabel = []; let expensesData = []; let incomesData = []; let sisaData = [];
    for (let i = 5; i >= 0; i--) {
        let d = new Date(); d.setMonth(d.getMonth() - i);
        let mStr = d.toISOString().slice(0, 7); 
        monthsLabel.push(d.toLocaleString('id-ID', { month: 'short', year: 'numeric' }));
        
        let outSum = transactions.filter(tx => tx.date.startsWith(mStr) && tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0);
        let inSum = transactions.filter(tx => tx.date.startsWith(mStr) && tx.type === 'income').reduce((s, tx) => s + tx.amount, 0);
        expensesData.push(outSum); incomesData.push(inSum); sisaData.push(inSum - outSum); 
    }

    if (chartKomparasiObj) chartKomparasiObj.destroy();
    const ctxBar = document.getElementById('chartKomparasi').getContext('2d');
    chartKomparasiObj = new Chart(ctxBar, {
        type: 'bar',
        data: { labels: monthsLabel, datasets: [
            { label: 'Pemasukan', data: incomesData, backgroundColor: '#1B9A59', borderRadius: 6 },
            { label: 'Pengeluaran', data: expensesData, backgroundColor: '#D62828', borderRadius: 6 },
            { label: 'Sisa Saldo Net', data: sisaData, backgroundColor: '#D4820A', borderRadius: 6 }
        ]},
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom' } } }
    });
}

// ==================== RENCANA (RUTIN, CELENGAN, HUTANG/PIUTANG) ====================
document.getElementById('form-berulang').addEventListener('submit', function(e) {
    e.preventDefault();
    const amount = parseUang(document.getElementById('recur-jumlah').value);
    const category = document.getElementById('recur-kategori').value;
    const name = document.getElementById('recur-nama').value;
    const method = document.getElementById('recur-metode').value;

    recurringTemplates.push({ id: Date.now(), amount, category, name, method });
    localStorage.setItem('pockita_recur', JSON.stringify(recurringTemplates));
    
    const realMonth = new Date().toISOString().slice(0, 7);
    transactions.push({ id: Date.now() + Math.random(), type: 'expense', amount, category, desc: `Auto: ${name}`, date: `${realMonth}-01`, time: "00:01", method });
    localStorage.setItem('pockita_tx', JSON.stringify(transactions));
    this.reset();
    renderApp();
});

document.getElementById('form-goals').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('goal-nama').value;
    const target = parseUang(document.getElementById('goal-target').value);
    const category = document.getElementById('goal-kategori').value; 
    savingsGoals.push({ id: Date.now(), name, target, category });
    localStorage.setItem('pockita_goals', JSON.stringify(savingsGoals));
    this.reset();
    renderApp();
});

document.getElementById('form-piutang').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('piutang-nama').value;
    const target = parseUang(document.getElementById('piutang-jumlah').value);
    const method = document.getElementById('piutang-metode').value; 
    const category = document.getElementById('piutang-kategori').value; 
    const note = document.getElementById('piutang-catatan').value; 

    if (target <= 0) return;
    const debtId = Date.now();
    debtsData.push({ id: debtId, type: 'piutang', name, target, note, method, category });
    localStorage.setItem('pockita_debts', JSON.stringify(debtsData));

    const now = new Date();
    transactions.push({ id: Date.now() + 1, type: 'expense', amount: target, category, desc: `Memberi Piutang: ${name}`, date: now.toISOString().split('T')[0], time: now.toTimeString().split(' ')[0].slice(0, 5), method, debtId });
    localStorage.setItem('pockita_tx', JSON.stringify(transactions));
    this.reset();
    renderApp();
});

document.getElementById('form-hutang').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('hutang-nama').value;
    const target = parseUang(document.getElementById('hutang-jumlah').value);
    const method = document.getElementById('hutang-metode').value; 
    const note = document.getElementById('hutang-catatan').value; 

    if (target <= 0) return;
    const debtId = Date.now();
    debtsData.push({ id: debtId, type: 'hutang', name, target, note, method });
    localStorage.setItem('pockita_debts', JSON.stringify(debtsData));

    const now = new Date();
    transactions.push({ id: Date.now() + 1, type: 'income', amount: target, category: 'umum', desc: `Menerima Hutang: ${name}`, date: now.toISOString().split('T')[0], time: now.toTimeString().split(' ')[0].slice(0, 5), method, debtId });
    localStorage.setItem('pockita_tx', JSON.stringify(transactions));
    this.reset();
    renderApp();
});

function tambahTabunganGoal(id) {
    const inputEl = document.getElementById(`input-add-goal-${id}`);
    const methodEl = document.getElementById(`method-add-goal-${id}`); 
    let moneyToAdd = parseUang(inputEl.value);
    const selectedMethod = methodEl.value;
    if (moneyToAdd <= 0) return;

    const goal = savingsGoals.find(g => g.id === id);
    let collectedAmount = transactions.filter(tx => tx.goalId === goal.id).reduce((sum, tx) => sum + tx.amount, 0);
    let remaining = goal.target - collectedAmount;

    if (moneyToAdd > remaining) {
        moneyToAdd = remaining;
        alert(`Nominal dilebihkan. Otomatis disesuaikan dengan sisa target (Rp ${formatRupiah(remaining)}).`);
    }

    const now = new Date();
    transactions.push({ id: Date.now(), type: 'expense', amount: moneyToAdd, category: goal.category || 'tabungan', desc: `Target: ${goal.name}`, date: now.toISOString().split('T')[0], time: now.toTimeString().split(' ')[0].slice(0, 5), method: selectedMethod, goalId: goal.id });
    localStorage.setItem('pockita_tx', JSON.stringify(transactions));
    renderApp();
}

function bayarDebt(id) {
    const inputEl = document.getElementById(`input-bayar-debt-${id}`);
    const methodEl = document.getElementById(`method-bayar-debt-${id}`); 
    let moneyPaid = parseUang(inputEl.value);
    const selectedMethod = methodEl.value;
    if (moneyPaid <= 0) return;

    const debt = debtsData.find(d => d.id === id);
    let collectedAmount = debt.type === 'piutang'
        ? transactions.filter(tx => tx.debtId === debt.id && tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0)
        : transactions.filter(tx => tx.debtId === debt.id && tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);

    let remaining = debt.target - collectedAmount;
    if (moneyPaid > remaining) {
        moneyPaid = remaining;
        alert(`Nominal dilebihkan. Otomatis disesuaikan dengan sisa pinjaman (Rp ${formatRupiah(remaining)}).`);
    }

    const now = new Date();
    if (debt.type === 'piutang') {
        transactions.push({ id: Date.now(), type: 'income', amount: moneyPaid, category: 'umum', desc: `Terima Piutang: ${debt.name}`, date: now.toISOString().split('T')[0], time: now.toTimeString().split(' ')[0].slice(0, 5), method: selectedMethod, debtId: debt.id });
    } else {
        transactions.push({ id: Date.now(), type: 'expense', amount: moneyPaid, category: 'umum', desc: `Bayar Hutang: ${debt.name}`, date: now.toISOString().split('T')[0], time: now.toTimeString().split(' ')[0].slice(0, 5), method: selectedMethod, debtId: debt.id });
    }

    localStorage.setItem('pockita_tx', JSON.stringify(transactions));
    renderApp();
}

function hapusPlan(type, id) {
    if (type === 'debt') {
        const debt = debtsData.find(x => x.id === id);
        let collectedAmount = debt.type === 'piutang'
            ? transactions.filter(tx => tx.debtId === id && tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0)
            : transactions.filter(tx => tx.debtId === id && tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);
        
        let confirmMsg = "Hapus item ini? (Riwayat cicilan yang sudah masuk tidak akan berubah)";
        if (collectedAmount === 0) confirmMsg = "Hapus item ini? Karena belum ada cicilan, transaksi awalnya di Riwayat juga akan dihapus agar saldo kembali normal.";

        if (confirm(confirmMsg)) {
            debtsData = debtsData.filter(x => x.id !== id);
            if (collectedAmount === 0) {
                transactions = transactions.filter(tx => tx.debtId !== id);
                localStorage.setItem('pockita_tx', JSON.stringify(transactions));
            }
            localStorage.setItem('pockita_debts', JSON.stringify(debtsData));
            renderApp();
        }
    } else {
        if (confirm("Hapus item rencana ini? (Riwayat saldomu tidak akan berubah)")) {
            if (type === 'recur') recurringTemplates = recurringTemplates.filter(x => x.id !== id);
            if (type === 'goal') savingsGoals = savingsGoals.filter(x => x.id !== id);
            localStorage.setItem('pockita_recur', JSON.stringify(recurringTemplates));
            localStorage.setItem('pockita_goals', JSON.stringify(savingsGoals));
            renderApp();
        }
    }
}

function renderGroupedDebts(list, container, typeStr) {
    if (list.length === 0) {
        container.innerHTML = `<div class="empty-state" style="padding: 10px 0;"><img src="assets/img/pochita-sleep.png" class="empty-state-img empty-neon-orange" style="width:42px;height:42px;" alt="Kosong">Belum ada daftar ${typeStr}.</div>`;
        return;
    }

    let groups = {};
    list.forEach(item => {
        let key = item.name.trim().toLowerCase();
        if (!groups[key]) groups[key] = { name: item.name.trim(), items: [] };
        groups[key].items.push(item);
    });

    let html = '';
    for (let key in groups) {
        let g = groups[key];
        let totalTarget = 0; let totalCollected = 0; let itemsHtml = '';
        
        g.items.forEach(d => {
            let collected = d.type === 'piutang'
                ? transactions.filter(tx => tx.debtId === d.id && tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0)
                : transactions.filter(tx => tx.debtId === d.id && tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);
            
            totalTarget += d.target; totalCollected += collected;
            const pct = Math.min(Math.round((collected / d.target) * 100), 100);
            const arrMethods = Object.keys(pockitaMethods);
            let selectHtml = `<select class="filter-dropdown" style="padding:8px; border-radius:10px;">`;
            arrMethods.forEach(m => selectHtml += `<option value="${m}">${m}</option>`);
            selectHtml += `</select>`;
            let specificSelect = selectHtml.replace('<select class=', `<select id="method-bayar-debt-${d.id}" class=`);
            let isCompleted = collected >= d.target;
            
            let actionHTML = isCompleted ? 
                `<span style="color: var(--income-green); font-weight: 800; flex: 1; display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">✓ LUNAS</span><button class="btn-delete" style="margin:0; width:auto; padding: 0 10px;" onclick="hapusPlan('debt', ${d.id})">${iconDelete}</button>` : 
                `<input type="text" id="input-bayar-debt-${d.id}" class="format-uang" placeholder="+ Nominal">${specificSelect}<button class="btn-add-goal" onclick="bayarDebt(${d.id})">${d.type === 'piutang' ? 'Terima' : 'Bayar'}</button><button class="btn-delete" style="margin:0; width:auto; padding: 0 10px;" onclick="hapusPlan('debt', ${d.id})">${iconDelete}</button>`;

            let noteUI = d.note ? `<div class="piutang-note">Catatan: ${d.note}</div>` : '';
            let pillUI = d.type === 'piutang'
                ? `<span class="pill-outline ${d.category === 'kebutuhan' ? 'pill-outline-kebutuhan' : 'pill-outline-keinginan'}">${(d.category || 'umum').toUpperCase()}</span><span class="pill-outline pill-outline-method">${d.method || 'Cash'}</span>`
                : `<span class="pill-outline pill-outline-method">${d.method || 'Cash'}</span>`;

            itemsHtml += `
            <div class="goal-box">
                <div class="goal-info">
                    <span><div class="pill-container" style="margin-top:0; margin-bottom:4px;">${pillUI}</div></span>
                    <span style="text-align:right;">${pct}%<br><small style="font-weight:normal;">${formatRupiah(collected)} / ${formatRupiah(d.target)}</small></span>
                </div>
                <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${pct}%; background-color: ${isCompleted ? 'var(--income-green)' : 'var(--primary-orange)'};"></div></div>
                ${noteUI}
                <div class="goal-actions" style="margin-top: 5px;">${actionHTML}</div>
            </div>`;
        });

        let groupPct = totalTarget > 0 ? Math.min(Math.round((totalCollected / totalTarget) * 100), 100) : 0;
        let groupId = `group-${typeStr}-${key.replace(/[^a-z0-9]/g, '')}`;

        html += `
        <div class="person-group">
            <button class="person-header" onclick="document.getElementById('${groupId}').style.display = document.getElementById('${groupId}').style.display === 'none' ? 'block' : 'none'">
                <span>👤 ${g.name} <small style="font-weight:normal; color:var(--text-muted);">(${groupPct}%)</small></span>
                <span>Rp ${formatRupiah(totalTarget - totalCollected)} <small style="font-size:0.7rem">Sisa</small> ▼</span>
            </button>
            <div class="person-content" id="${groupId}">${itemsHtml}</div>
        </div>`;
    }
    container.innerHTML = html;
}

function renderPlans() {
    const arrMethods = Object.keys(pockitaMethods);
    let selectHtml = `<select class="filter-dropdown" style="padding:8px; border-radius:10px;">`;
    arrMethods.forEach(m => selectHtml += `<option value="${m}">${m}</option>`);
    selectHtml += `</select>`;

    const listRecur = document.getElementById('list-berulang');
    listRecur.innerHTML = '';
    if (recurringTemplates.length === 0) {
        listRecur.innerHTML = `<div class="empty-state"><img src="assets/img/pochita-sleep.png" class="empty-state-img empty-neon-orange" alt="Kosong">Belum ada langganan rutin.</div>`;
    } else {
        recurringTemplates.forEach(t => {
            let safeCat = t.category ? t.category.toLowerCase() : 'umum';
            let catColorClass = safeCat === 'kebutuhan' ? 'pill-outline-kebutuhan' : 'pill-outline-keinginan';
            listRecur.innerHTML += `
                <li class="plan-item">
                    <span><b>${t.name}</b> • Rp ${formatRupiah(t.amount)}<br>
                        <div class="pill-container" style="margin-top: 4px;">
                            <span class="pill-outline ${catColorClass}">${safeCat.toUpperCase()}</span>
                            <span class="pill-outline pill-outline-method">${t.method || 'Cash'}</span>
                        </div>
                    </span>
                    <button class="btn-delete" style="margin:0;" onclick="hapusPlan('recur', ${t.id})">${iconDelete}</button>
                </li>`;
        });
    }

    const containerGoals = document.getElementById('list-goals');
    containerGoals.innerHTML = '';
    if (savingsGoals.length === 0) {
        containerGoals.innerHTML = `<div class="empty-state"><img src="assets/img/pochita-sleep.png" class="empty-state-img empty-neon-orange" alt="Kosong">Belum ada target menabung/tagihan.</div>`;
    } else {
        savingsGoals.forEach(g => {
            let collectedAmount = transactions.filter(tx => tx.goalId === g.id).reduce((sum, tx) => sum + tx.amount, 0);
            const pct = Math.min(Math.round((collectedAmount / g.target) * 100), 100);
            let specificSelect = selectHtml.replace('<select class=', `<select id="method-add-goal-${g.id}" class=`);

            let isCompleted = collectedAmount >= g.target;
            let actionHTML = isCompleted ? 
                `<span style="color: var(--income-green); font-weight: 800; flex: 1; display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">✓ TERCAPAI</span><button class="btn-delete" style="margin:0; width:auto; padding: 0 10px;" onclick="hapusPlan('goal', ${g.id})">${iconDelete}</button>` : 
                `<input type="text" id="input-add-goal-${g.id}" class="format-uang" placeholder="+ Nominal">${specificSelect}<button class="btn-add-goal" onclick="tambahTabunganGoal(${g.id})">Setor</button><button class="btn-delete" style="margin:0; width:auto; padding: 0 10px;" onclick="hapusPlan('goal', ${g.id})">${iconDelete}</button>`;

            let safeCat = g.category ? g.category.toLowerCase() : 'tabungan';
            let catColorClass = safeCat === 'kebutuhan' ? 'pill-outline-kebutuhan' : (safeCat === 'keinginan' ? 'pill-outline-keinginan' : 'pill-outline-tabungan');

            containerGoals.innerHTML += `
                <div class="goal-box">
                    <div class="goal-info">
                        <span><b>${g.name}</b> <br>
                            <div class="pill-container" style="margin-top: 4px;">
                                <span class="pill-outline ${catColorClass}">${safeCat.toUpperCase()}</span>
                            </div>
                        </span>
                        <span style="text-align:right;">${pct}%<br><small style="font-weight:normal;">${formatRupiah(collectedAmount)} / ${formatRupiah(g.target)}</small></span>
                    </div>
                    <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${pct}%; background-color: ${isCompleted ? 'var(--income-green)' : 'var(--primary-orange)'};"></div></div>
                    <div class="goal-actions" style="margin-top: 12px;">${actionHTML}</div>
                </div>`;
        });
    }

    renderGroupedDebts(debtsData.filter(d => d.type === 'hutang'), document.getElementById('list-hutang'), 'hutang');
    renderGroupedDebts(debtsData.filter(d => d.type === 'piutang'), document.getElementById('list-piutang'), 'piutang');
    renderTitipan(); 
    attachMoneyFormat(); 
}

function updateDatalist(id, dataSet) {
    const el = document.getElementById(id);
    if (el) { el.innerHTML = ''; dataSet.forEach(item => el.appendChild(new Option(item, item))); }
}

function setDefaultDateTime() {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].slice(0, 5);
    
    document.getElementById('in-tanggal').value = dateStr;
    document.getElementById('out-tanggal').value = dateStr;
    if (document.getElementById('tf-tanggal')) document.getElementById('tf-tanggal').value = dateStr;
    if (document.getElementById('titipan-tanggal')) document.getElementById('titipan-tanggal').value = dateStr;
    
    document.getElementById('in-waktu').value = timeStr;
    document.getElementById('out-waktu').value = timeStr;
    if (document.getElementById('tf-waktu')) document.getElementById('tf-waktu').value = timeStr;
}

function exportToExcel() {
    const activeMonth = getSelectedMonth();
    const searchInput = document.getElementById('search-history');
    const rawSearch = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const isAllTime = currentHistoryMode === 'semua' || rawSearch !== '';

    let displayTx = isAllTime
        ? transactions.slice()
        : (currentHistoryMode === 'bulan'
            ? transactions.filter(tx => tx.date.startsWith(activeMonth))
            : transactions.filter(tx => tx.date === document.getElementById('filter-hari').value));
    
    const filterTipe = document.getElementById('filter-tipe').value;
    const currentFilter = document.getElementById('filter-metode').value;
    const filterMood = document.getElementById('filter-mood').value;

    if (filterTipe === 'Utama') displayTx = displayTx.filter(tx => tx.type !== 'transfer');
    else displayTx = displayTx.filter(tx => tx.type === filterTipe);

    if (filterMood !== 'Semua') displayTx = displayTx.filter(tx => tx.moodTag === filterMood);
    if (currentFilter !== 'Semua') displayTx = displayTx.filter(tx => tx.method === currentFilter || (tx.type === 'transfer' && tx.methodTo === currentFilter));
    if (rawSearch !== '') displayTx = displayTx.filter(tx => matchesHistorySearch(tx, rawSearch));

    if (displayTx.length === 0) return alert("Tidak ada data untuk diekspor!");
    
    let csvContent = "data:text/csv;charset=utf-8,\uFEFFTanggal,Jam,Tipe,Kategori,Tag,Detail,Catatan,Metode,Jumlah (Rp)\n";
    displayTx.sort((a, b) => {
        const timeA = new Date((a.date || '') + 'T' + (a.time || '00:00')).getTime() || a.id;
        const timeB = new Date((b.date || '') + 'T' + (b.time || '00:00')).getTime() || b.id;
        return timeB === timeA ? b.id - a.id : timeB - timeA;
    }).forEach(tx => {
        let tipe = tx.type === 'income' ? 'Pemasukan' : (tx.type === 'transfer' ? 'Mutasi' : 'Pengeluaran');
        let kat = tx.category ? tx.category.toUpperCase() : 'UMUM';
        let tag = tx.moodTag || '-';
        let dtl = tx.desc.replace(/,/g, " ");
        if (tx.category === 'biaya admin') dtl = dtl.replace('Biaya Admin Mutasi: ', '').replace(' ke ', ' ➡ ');
        let cttn = tx.catatan ? tx.catatan.replace(/,/g, " ") : "-";
        let method = tx.type === 'transfer' ? `${tx.method} ➡ ${tx.methodTo}` : tx.method;
        csvContent += `${tx.date},${tx.time},${tipe},${kat},${tag},${dtl},${cttn},${method},${tx.amount}\n`;
    });

    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    let fileName = isAllTime
        ? `Pockita_Laporan_Semua_Waktu.csv`
        : (currentHistoryMode === 'bulan' ? `Pockita_Laporan_${activeMonth}.csv` : `Pockita_Laporan_Harian_${document.getElementById('filter-hari').value}.csv`);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

initMonthPicker();
checkAndApplyRecurring();
setDefaultDateTime();
renderApp();