function safeReadJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return parsed !== null ? parsed : fallback;
    } catch (e) {
        return fallback;
    }
}

function safeSaveStorage(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        alert("Penyimpanan penuh! Hapus kartu member lama atau download backup JSON.");
        return false;
    }
}

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, ''');
}

function onSubmit(id, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('submit', handler);
}

let transactions = safeReadJSON('pockita_tx', []);
let recurringTemplates = safeReadJSON('pockita_recur', []);
let savingsGoals = safeReadJSON('pockita_goals', []);
let debtsData = safeReadJSON('pockita_debts', []);
let titipanData = safeReadJSON('pockita_titipan', []);
let recurringAppliedMonths = safeReadJSON('pockita_applied_months', []);
let isBalanceHidden = Boolean(safeReadJSON('pockita_hide_balance', false));
let memberCards = safeReadJSON('pockita_members', []);
let cycleConfig = safeReadJSON('pockita_cycle', null);
let cooldownItems = safeReadJSON('pockita_cooldown', []);
let wishlistItems = safeReadJSON('pockita_wishlist', []);
let ratioConfig = safeReadJSON('pockita_ratio_mode', { preset: '50-30-20', need: 50, want: 30, save: 20 });

let pockitaMethods = safeReadJSON('pockita_custom_methods', {
    'Cash': '', 'BCA': '', 'Mandiri': '', 'DANA': '', 'GoPay': '', 'ShopeePay': '', 'Koin': ''
});
if (!pockitaMethods || typeof pockitaMethods !== 'object') {
    pockitaMethods = { 'Cash': '', 'BCA': '', 'Mandiri': '', 'DANA': '', 'GoPay': '', 'ShopeePay': '', 'Koin': '' };
}

let savedSources = new Set(safeReadJSON('pockita_sources', []));
let savedDetails = new Set(safeReadJSON('pockita_details', []));

let chartTargetObj = null;
let chartRealisasiObj = null;
let chartKomparasiObj = null;
let editingTxId = null;
let currentHistoryMode = 'bulan';
let balancesByMethodCache = {};
let grandTotalCache = 0;
let searchDebounceTimer = null;
let isHistoryCalVisible = true;

const iconEdit = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
const iconDelete = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

// ==================== NAVIGASI UTAMA & SUB-HALAMAN ====================
function switchMainView(viewName) {
    closeSubpage(false);
    document.querySelectorAll('.main-view').forEach(v => v.style.display = 'none');
    document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));

    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) targetView.style.display = 'block';
    const navBtn = document.getElementById(`nav-${viewName}`);
    if (navBtn) navBtn.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (viewName === 'analysis') setTimeout(renderCharts, 50);
    if (viewName === 'history') {
        renderHistoryCalendar();
        renderHistoryList();
    }
    if (viewName === 'member') renderMemberCards();
}

function openSubpage(subKey, title) {
    document.querySelectorAll('.main-view').forEach(v => v.style.display = 'none');
    document.querySelectorAll('.subpage-content').forEach(s => s.style.display = 'none');
    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) bottomNav.style.display = 'none';

    const titleEl = document.getElementById('subpage-title');
    if (titleEl) titleEl.innerText = title;
    const containerEl = document.getElementById('subpage-container');
    if (containerEl) containerEl.style.display = 'block';
    const subEl = document.getElementById(`sub-${subKey}`);
    if (subEl) subEl.style.display = 'block';

    if (subKey === 'daily') renderDailyCyclePage();
    if (subKey === 'wallet') renderModalMethodList();
    if (subKey === 'simulator') renderSimulatorItems();
    if (subKey === 'wishlist') renderWishlist();
    if (subKey === 'goals' || subKey === 'debts' || subKey === 'titipan' || subKey === 'recurring') renderPlans();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeSubpage(returnHome = true) {
    const containerEl = document.getElementById('subpage-container');
    if (containerEl) containerEl.style.display = 'none';
    document.querySelectorAll('.subpage-content').forEach(s => s.style.display = 'none');
    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) bottomNav.style.display = 'flex';
    if (returnHome) {
        document.querySelectorAll('.main-view').forEach(v => v.style.display = 'none');
        const homeEl = document.getElementById('view-home');
        if (homeEl) homeEl.style.display = 'block';
        document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));
        const navHome = document.getElementById('nav-home');
        if (navHome) navHome.classList.add('active');
    }
}

// ==================== BACKUP & RESTORE JSON ====================
function exportFullBackupJSON() {
    const backupPayload = {
        app: 'Pockita',
        version: '3.0',
        exportedAt: new Date().toISOString(),
        data: {
            pockita_tx: transactions,
            pockita_recur: recurringTemplates,
            pockita_goals: savingsGoals,
            pockita_debts: debtsData,
            pockita_titipan: titipanData,
            pockita_applied_months: recurringAppliedMonths,
            pockita_hide_balance: isBalanceHidden,
            pockita_members: memberCards,
            pockita_cycle: cycleConfig,
            pockita_cooldown: cooldownItems,
            pockita_wishlist: wishlistItems,
            pockita_ratio_mode: ratioConfig,
            pockita_custom_methods: pockitaMethods,
            pockita_sources: [...savedSources],
            pockita_details: [...savedDetails],
            pockita_sim_items: simItems,
            pockita_sim_income: localStorage.getItem('pockita_sim_income') || '300.000'
        }
    };

    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Pockita_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function restoreFullBackupJSON() {
    const fileInput = document.getElementById('restore-json-file');
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
        return alert("Pilih file backup .json terlebih dahulu!");
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            const d = parsed.data || parsed;
            if (!Array.isArray(d.pockita_tx)) return alert("Format file backup tidak valid!");

            if (!confirm(`Pulihkan ${d.pockita_tx.length} transaksi dari backup? Data saat ini akan diganti.`)) return;

            transactions = d.pockita_tx || [];
            recurringTemplates = d.pockita_recur || [];
            savingsGoals = d.pockita_goals || [];
            debtsData = d.pockita_debts || [];
            titipanData = d.pockita_titipan || [];
            recurringAppliedMonths = d.pockita_applied_months || [];
            isBalanceHidden = Boolean(d.pockita_hide_balance);
            memberCards = d.pockita_members || [];
            cycleConfig = d.pockita_cycle || null;
            cooldownItems = d.pockita_cooldown || [];
            wishlistItems = d.pockita_wishlist || [];
            ratioConfig = d.pockita_ratio_mode || { preset: '50-30-20', need: 50, want: 30, save: 20 };
            if (d.pockita_custom_methods) pockitaMethods = d.pockita_custom_methods;
            savedSources = new Set(d.pockita_sources || []);
            savedDetails = new Set(d.pockita_details || []);
            if (Array.isArray(d.pockita_sim_items)) simItems = d.pockita_sim_items;

            safeSaveStorage('pockita_tx', JSON.stringify(transactions));
            safeSaveStorage('pockita_recur', JSON.stringify(recurringTemplates));
            safeSaveStorage('pockita_goals', JSON.stringify(savingsGoals));
            safeSaveStorage('pockita_debts', JSON.stringify(debtsData));
            safeSaveStorage('pockita_titipan', JSON.stringify(titipanData));
            safeSaveStorage('pockita_applied_months', JSON.stringify(recurringAppliedMonths));
            safeSaveStorage('pockita_hide_balance', JSON.stringify(isBalanceHidden));
            safeSaveStorage('pockita_members', JSON.stringify(memberCards));
            safeSaveStorage('pockita_cycle', JSON.stringify(cycleConfig));
            safeSaveStorage('pockita_cooldown', JSON.stringify(cooldownItems));
            safeSaveStorage('pockita_wishlist', JSON.stringify(wishlistItems));
            safeSaveStorage('pockita_ratio_mode', JSON.stringify(ratioConfig));
            safeSaveStorage('pockita_custom_methods', JSON.stringify(pockitaMethods));
            safeSaveStorage('pockita_sources', JSON.stringify([...savedSources]));
            safeSaveStorage('pockita_details', JSON.stringify([...savedDetails]));
            safeSaveStorage('pockita_sim_items', JSON.stringify(simItems));

            fileInput.value = '';
            initRatioUI();
            renderApp();
            alert("Data berhasil dipulihkan!");
        } catch (err) {
            alert("Gagal membaca file JSON.");
        }
    };
    reader.readAsText(fileInput.files[0]);
}

// ==================== BOTTOM SHEET TRANSAKSI ====================
function openTxModal(defaultType = 'expense') {
    const modal = document.getElementById('txModal');
    if (modal) modal.style.display = 'flex';
    if (editingTxId === null) {
        const title = document.getElementById('tx-sheet-title');
        if (title) title.innerText = 'Catat Transaksi';
        switchForm(defaultType);
    }
}

function closeTxModal() {
    const modal = document.getElementById('txModal');
    if (modal) modal.style.display = 'none';
    if (editingTxId !== null) {
        resetFormButtons();
        ['form-pemasukan', 'form-pengeluaran', 'form-transfer'].forEach(id => {
            const f = document.getElementById(id);
            if (f) f.reset();
        });
        clearMoodSelection();
        setDefaultDateTime();
    }
}

function closeTxModalOnBackdrop(e) {
    if (e.target && e.target.id === 'txModal') closeTxModal();
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

// ==================== MOOD TAGS & COOLDOWN 15 MENIT ====================
function selectMoodTag(btn, tag) {
    const hiddenInput = document.getElementById('out-mood-tag');
    if (!hiddenInput) return;
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
    const catEl = document.getElementById('out-kategori');
    const box = document.getElementById('cooldown-action-box');
    if (catEl && box) {
        box.style.display = (catEl.value === 'keinginan' && editingTxId === null) ? 'block' : 'none';
    }
}

function saveToCooldown() {
    const amount = parseUang(document.getElementById('out-jumlah').value);
    const detail = document.getElementById('out-detail').value.trim();
    const catatan = document.getElementById('out-catatan').value.trim();
    const method = document.getElementById('out-metode').value;
    const moodTag = document.getElementById('out-mood-tag').value;

    if (amount <= 0 || !detail) return alert("Isi nominal dan detail dulu sebelum menahan belanja!");

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
    safeSaveStorage('pockita_cooldown', JSON.stringify(cooldownItems));

    document.getElementById('form-pengeluaran').reset();
    clearMoodSelection();
    setDefaultDateTime();
    closeTxModal();
    renderCooldownWidget();
}

function cancelCooldownItem(id) {
    cooldownItems = cooldownItems.filter(c => c.id !== id);
    safeSaveStorage('pockita_cooldown', JSON.stringify(cooldownItems));
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
    safeSaveStorage('pockita_cooldown', JSON.stringify(cooldownItems));
    renderApp();
}

function renderCooldownWidget() {
    const container = document.getElementById('home-cooldown-container');
    if (!container) return;
    if (cooldownItems.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = cooldownItems.map(item => {
        const diff = Math.max(0, item.unlockAt - Date.now());
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        const timerText = diff > 0 ? `⏳ ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : '✅ Waktu Tunggu Selesai';
        return `
        <div class="cooldown-card">
            <div class="cooldown-top">
                <strong style="font-size:0.84rem;">🛑 Ditahan: ${escapeHTML(item.detail)}</strong>
                <span class="cooldown-timer-pill">${timerText}</span>
            </div>
            <div style="font-size:0.78rem; color:var(--text-muted);">Nominal: <strong style="color:var(--expense-red);">Rp ${formatRupiah(item.amount)}</strong> (${escapeHTML(item.method)})</div>
            <div class="cooldown-actions">
                <button type="button" class="btn-cd-cancel" onclick="cancelCooldownItem(${item.id})">✓ Batal Beli</button>
                <button type="button" class="btn-cd-proceed" onclick="proceedCooldownItem(${item.id})">Tetap Catat</button>
            </div>
        </div>`;
    }).join('');
}
setInterval(() => { if (cooldownItems.length > 0) renderCooldownWidget(); }, 1000);

// ==================== BATAS HARIAN ====================
onSubmit('form-cycle', function(e) {
    e.preventDefault();
    const budget = parseUang(document.getElementById('cycle-budget').value);
    const days = parseInt(document.getElementById('cycle-days').value) || 7;
    const deadPct = parseInt(document.getElementById('cycle-dead-pct').value) || 0;
    const startDate = document.getElementById('cycle-start').value;

    if (budget <= 0 || !startDate) return alert("Isi nominal pegangan dan tanggal mulai!");
    cycleConfig = { budget, days, deadPct, startDate };
    safeSaveStorage('pockita_cycle', JSON.stringify(cycleConfig));
    renderDailyCyclePage();
    renderHomeDailyWidget();
});

function fillCycleFromBalance(e) {
    e.preventDefault();
    const el = document.getElementById('cycle-budget');
    if (el) el.value = formatRupiah(Math.max(0, grandTotalCache));
}

function calculateDailyStats() {
    if (!cycleConfig) return null;
    const deadAmount = Math.round(cycleConfig.budget * (cycleConfig.deadPct / 100));
    const usableBudget = Math.max(0, cycleConfig.budget - deadAmount);

    const usedInCycle = transactions
        .filter(tx => {
            if (!tx.date || tx.date < cycleConfig.startDate) return false;
            if (tx.type === 'expense') {
                if (tx.goalId || tx.debtId) return false;
                if ((tx.category || '').toLowerCase() === 'tabungan') return false;
                return true;
            }
            if (tx.type === 'transfer' && (tx.adminFee || 0) > 0) return true;
            return false;
        })
        .reduce((sum, tx) => sum + (tx.type === 'transfer' ? (tx.adminFee || 0) : tx.amount), 0);

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
                <span style="font-size:0.8rem; font-weight:800; color:var(--primary-orange);">🛡️ Mode Uang Saku Minim</span>
                <span class="daily-badge daily-badge-warn">Belum Diatur</span>
            </div>
            <div style="font-size:0.78rem; color:var(--text-muted);">Ketuk di sini untuk mengatur batas aman jajan harianmu →</div>`;
        return;
    }

    let badgeClass = 'daily-badge-safe';
    let badgeLabel = 'Aman';
    if (stats.remainingCycle <= 0) {
        badgeClass = 'daily-badge-danger';
        badgeLabel = 'Habis';
    } else if (stats.dailySafe < 10000) {
        badgeClass = 'daily-badge-warn';
        badgeLabel = 'Hemat Ketat';
    }

    widget.innerHTML = `
        <div class="daily-mini-top">
            <span style="font-size:0.74rem; font-weight:800; color:var(--text-muted);">BATAS AMAN HARI INI</span>
            <span class="daily-badge ${badgeClass}">${badgeLabel} • Sisa ${stats.remainingDays} Hari</span>
        </div>
        <div class="daily-mini-amount">Rp ${formatRupiah(stats.dailySafe)} <small style="font-size:0.74rem; font-weight:600; color:var(--text-muted);">/ hari</small></div>
        <div class="daily-mini-sub">
            <span>Sisa aktif: <b>Rp ${formatRupiah(Math.max(0, stats.remainingCycle))}</b></span>
            <span>Saldo mati: <b>Rp ${formatRupiah(stats.deadAmount)}</b></span>
        </div>`;
}

function renderDailyCyclePage() {
    const box = document.getElementById('daily-summary-box');
    const stats = calculateDailyStats();
    if (!box) return;
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
            <span class="balance-pill">BATAS AMAN HARI INI</span>
            <div class="balance-value" style="font-size:1.95rem;">Rp ${formatRupiah(stats.dailySafe)}</div>
            <p style="font-size:0.74rem; opacity:0.85;">Tersisa ${stats.remainingDays} hari dari target ${cycleConfig.days} hari</p>
            <div class="sim-metrics-row">
                <div>Saldo Mati (${cycleConfig.deadPct}%)<br><strong>Rp ${formatRupiah(stats.deadAmount)}</strong></div>
                <div>Konsumsi<br><strong style="color:#FF7B4A;">Rp ${formatRupiah(stats.usedInCycle)}</strong></div>
                <div>Sisa Aktif<br><strong style="color:#4ADE80;">Rp ${formatRupiah(Math.max(0, stats.remainingCycle))}</strong></div>
            </div>
        </div>`;
}

// ==================== SIMULATOR ANGGARAN ====================
const DEFAULT_SIM_ITEMS = [
    { id: 'sim_1', label: 'Kuota Internet (28–30 Hari)', value: 25000, max: 150000 },
    { id: 'sim_2', label: 'Bensin (Full Tank)', value: 30000, max: 200000 },
    { id: 'sim_3', label: 'Makan Wajib di Luar', value: 0, max: 500000 },
    { id: 'sim_4', label: 'Makan / Jajan Bosan & Stres', value: 45000, max: 300000 },
    { id: 'sim_5', label: 'Belajar di Luar & Traktir', value: 45000, max: 300000 },
    { id: 'sim_6', label: 'Print, Belajar & Keperluan Lain', value: 0, max: 300000 }
];

let simItems = safeReadJSON('pockita_sim_items', JSON.parse(JSON.stringify(DEFAULT_SIM_ITEMS)));
if (!Array.isArray(simItems)) simItems = JSON.parse(JSON.stringify(DEFAULT_SIM_ITEMS));

function saveSimState() {
    safeSaveStorage('pockita_sim_items', JSON.stringify(simItems));
    const incomeEl = document.getElementById('sim-income');
    if (incomeEl) safeSaveStorage('pockita_sim_income', incomeEl.value);
}

function formatRpSim(num) {
    const abs = Math.abs(Math.round(num)).toLocaleString('id-ID');
    return (num < 0 ? '-Rp ' : 'Rp ') + abs;
}

function renderSimulatorItems() {
    const container = document.getElementById('sim-sliders-container');
    if (!container) return;

    container.innerHTML = simItems.map(item => `
        <div class="slider-item">
            <div class="slider-label">
                <div class="slider-label-left">
                    <span>${escapeHTML(item.label)}</span>
                    <button type="button" class="btn-sim-mini" onclick="editSimulatorItem('${item.id}')">✏️</button>
                    <button type="button" class="btn-sim-mini" onclick="deleteSimulatorItem('${item.id}')">×</button>
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
    if (!label) return labelInput.focus();

    const customMax = maxInput ? (parseInt(maxInput.value.replace(/\D/g, ''), 10) || 300000) : 300000;
    simItems.push({ id: 'sim_' + Date.now(), label, value: 0, max: Math.max(10000, customMax) });
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
    if (!confirm('Kembalikan pos simulator ke bawaan awal?')) return;
    simItems = JSON.parse(JSON.stringify(DEFAULT_SIM_ITEMS));
    saveSimState();
    renderSimulatorItems();
}

// ==================== DAFTAR BELANJA ====================
onSubmit('form-wishlist', function(e) {
    e.preventDefault();
    const name = document.getElementById('wish-nama').value.trim();
    const price = parseUang(document.getElementById('wish-harga').value);
    const category = document.getElementById('wish-kategori').value;
    if (!name) return;

    wishlistItems.push({ id: Date.now(), name, price, category, done: false });
    safeSaveStorage('pockita_wishlist', JSON.stringify(wishlistItems));
    this.reset();
    renderWishlist();
});

function toggleWishlistItem(id) {
    const item = wishlistItems.find(w => w.id === id);
    if (!item) return;
    item.done = !item.done;
    safeSaveStorage('pockita_wishlist', JSON.stringify(wishlistItems));
    renderWishlist();
}

function logWishlistToExpense(id) {
    const item = wishlistItems.find(w => w.id === id);
    if (!item) return;
    item.done = true;
    safeSaveStorage('pockita_wishlist', JSON.stringify(wishlistItems));
    renderWishlist();

    openTxModal('expense');
    switchForm('expense');
    document.getElementById('out-detail').value = item.name;
    document.getElementById('out-kategori').value = item.category || 'kebutuhan';
    if (item.price > 0) document.getElementById('out-jumlah').value = formatRupiah(item.price);
    toggleCooldownOption();
}

function deleteWishlistItem(id) {
    wishlistItems = wishlistItems.filter(w => w.id !== id);
    safeSaveStorage('pockita_wishlist', JSON.stringify(wishlistItems));
    renderWishlist();
}

function renderWishlist() {
    const container = document.getElementById('list-wishlist');
    const totalEstEl = document.getElementById('wishlist-total-est');
    if (!container) return;

    const totalUnchecked = wishlistItems.filter(w => !w.done).reduce((sum, w) => sum + (w.price || 0), 0);
    if (totalEstEl) totalEstEl.innerText = `Est: Rp ${formatRupiah(totalUnchecked)}`;

    if (wishlistItems.length === 0) {
        container.innerHTML = `<div class="empty-state"><img src="assets/img/pochita-sleep.png" class="empty-state-img" alt="Kosong" onerror="this.style.display='none'">Daftar belanja masih kosong.</div>`;
        return;
    }

    const sorted = wishlistItems.slice().sort((a, b) => Number(a.done) - Number(b.done) || b.id - a.id);
    container.innerHTML = sorted.map(w => {
        const catClass = w.category === 'keinginan' ? 'pill-outline-keinginan' : 'pill-outline-kebutuhan';
        const priceLabel = w.price > 0 ? ` • Rp ${formatRupiah(w.price)}` : '';
        return `
        <div class="wish-item">
            <div class="wish-left">
                <input type="checkbox" class="wish-check" ${w.done ? 'checked' : ''} onchange="toggleWishlistItem(${w.id})">
                <div>
                    <div class="wish-title ${w.done ? 'done' : ''}">${escapeHTML(w.name)}</div>
                    <div class="pill-container">
                        <span class="pill-outline ${catClass}">${(w.category || 'kebutuhan').toUpperCase()}</span>
                        <span style="font-size:0.7rem; color:var(--text-muted); font-weight:600;">${priceLabel}</span>
                    </div>
                </div>
            </div>
            <div class="wish-actions">
                <button type="button" class="btn-wish-log" onclick="logWishlistToExpense(${w.id})">Catat</button>
                <button type="button" class="btn-delete" onclick="deleteWishlistItem(${w.id})">${iconDelete}</button>
            </div>
        </div>`;
    }).join('');
}

// ==================== CORE UTILITIES ====================
function toggleBalance(e) {
    e.stopPropagation();
    isBalanceHidden = !isBalanceHidden;
    safeSaveStorage('pockita_hide_balance', JSON.stringify(isBalanceHidden));
    renderApp();
}

function toggleBreakdown(e) {
    if (isBalanceHidden) return;
    const breakdown = document.getElementById('balance-breakdown');
    if (breakdown) breakdown.style.display = breakdown.style.display === 'none' ? 'block' : 'none';
}

function initMonthPicker() {
    const now = new Date();
    const mPicker = document.getElementById('global-month-picker');
    const fHari = document.getElementById('filter-hari');
    const cStart = document.getElementById('cycle-start');
    if (mPicker && !mPicker.value) mPicker.value = now.toISOString().slice(0, 7);
    if (fHari) fHari.value = now.toISOString().split('T')[0];
    if (cStart && !cStart.value) cStart.value = now.toISOString().split('T')[0];
}

function getSelectedMonth() {
    const mPicker = document.getElementById('global-month-picker');
    return (mPicker && mPicker.value) ? mPicker.value : new Date().toISOString().slice(0, 7);
}

function changeGlobalMonth() {
    setHistoryMode('bulan');
    renderHistoryCalendar();
    const analysisView = document.getElementById('view-analysis');
    if (analysisView && analysisView.style.display === 'block') renderCharts();
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
function parseUang(str) { return parseInt((str || '').toString().replace(/[^0-9]/g, '')) || 0; }
function formatRupiah(angka) { return new Intl.NumberFormat('id-ID').format(angka || 0); }
function formatK(angka) {
    return angka >= 1000 ? ((angka % 1000 === 0) ? (angka / 1000) + 'K' : (angka / 1000).toFixed(1).replace('.0', '') + 'K') : angka.toString();
}

// ==================== DOMPET / METODE PEMBAYARAN ====================
function populateSelectMethods() {
    const arrMethods = Object.keys(pockitaMethods);
    ['in-metode', 'out-metode', 'tf-metode-dari', 'tf-metode-ke', 'recur-metode', 'piutang-metode', 'hutang-metode'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const currentVal = el.value;
            el.innerHTML = '';
            arrMethods.forEach(m => el.innerHTML += `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`);
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
        const safeMethod = escapeHTML(method);
        list.innerHTML += `
            <li class="transaction-item">
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${imgData}" class="method-icon" onerror="this.outerHTML='<div class=\\'method-icon fallback-icon\\'>${safeMethod.charAt(0)}</div>'">
                    <div>
                        <div style="font-weight:700; font-size:0.88rem;">${safeMethod}</div>
                        <div style="font-size:0.74rem; color:var(--text-muted);">Saldo: Rp ${formatRupiah(bal)}</div>
                    </div>
                </div>
                <button type="button" class="btn-delete" onclick="deleteMethod('${safeMethod.replace(/'/g, "\\'")}')">${iconDelete}</button>
            </li>`;
    }
}

function saveNewMethod() {
    const nameInput = document.getElementById('new-method-name');
    const fileInput = document.getElementById('new-method-file');
    const name = nameInput.value.trim();
    if (!name) return alert("Nama dompet tidak boleh kosong!");

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
    safeSaveStorage('pockita_custom_methods', JSON.stringify(pockitaMethods));
    nameInput.value = '';
    fileInput.value = '';
    populateSelectMethods();
    renderApp();
}

function deleteMethod(name) {
    if (confirm(`Hapus dompet ${name}?`)) {
        delete pockitaMethods[name];
        safeSaveStorage('pockita_custom_methods', JSON.stringify(pockitaMethods));
        populateSelectMethods();
        renderApp();
    }
}

// ==================== KARTU MEMBER ====================
function compressBarcodeImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const maxDim = 900;
            let width = img.width;
            let height = img.height;
            if (width > maxDim || height > maxDim) {
                if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
                else { width = Math.round((width * maxDim) / height); height = maxDim; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function saveMemberCard() {
    const nameInput = document.getElementById('new-member-name');
    const fileInput = document.getElementById('new-member-file');
    const name = nameInput.value.trim();
    if (!name || !fileInput.files || !fileInput.files[0]) return alert("Nama kartu dan foto barcode wajib diisi!");

    compressBarcodeImage(fileInput.files[0], function(compressedDataUrl) {
        memberCards.push({ id: Date.now(), name, image: compressedDataUrl });
        if (safeSaveStorage('pockita_members', JSON.stringify(memberCards))) {
            nameInput.value = '';
            fileInput.value = '';
            renderMemberCards();
        } else {
            memberCards.pop();
        }
    });
}

function deleteMemberCard(id) {
    if (confirm("Hapus kartu member ini?")) {
        memberCards = memberCards.filter(c => c.id !== id);
        safeSaveStorage('pockita_members', JSON.stringify(memberCards));
        renderMemberCards();
    }
}

function showFullscreenImg(src) {
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
    if (memberCards.length === 0) {
        list.innerHTML = `<div class="empty-state" style="grid-column: span 2;">Belum ada kartu member tersimpan.</div>`;
        return;
    }
    list.innerHTML = memberCards.map(c => `
        <div class="member-card-item">
            <button type="button" class="member-card-delete" onclick="deleteMemberCard(${c.id})">✖</button>
            <img src="${c.image}" class="member-card-img" onclick="showFullscreenImg('${c.image}')">
            <div class="member-card-name">${escapeHTML(c.name)}</div>
        </div>`).join('');
}

// ==================== UANG TITIPAN ====================
onSubmit('form-titipan', function(e) {
    e.preventDefault();
    const title = document.getElementById('titipan-judul').value;
    const modal = parseUang(document.getElementById('titipan-modal').value);
    const date = document.getElementById('titipan-tanggal').value;
    if (modal <= 0) return;
    titipanData.push({ id: Date.now(), title, modal, date, items: [] });
    safeSaveStorage('pockita_titipan', JSON.stringify(titipanData));
    this.reset();
    setDefaultDateTime();
    renderApp();
});

function toggleTitipan(id) {
    const el = document.getElementById('titipan-content-' + id);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function tambahItemTitipan(e, id) {
    e.preventDefault();
    const name = document.getElementById(`titipan-item-name-${id}`).value;
    const price = parseUang(document.getElementById(`titipan-item-price-${id}`).value);
    const session = titipanData.find(t => t.id === id);
    if (session && price > 0) {
        session.items.push({ name, price });
        safeSaveStorage('pockita_titipan', JSON.stringify(titipanData));
        renderApp();
    }
}

function hapusItemTitipan(id, index) {
    const session = titipanData.find(t => t.id === id);
    if (session) {
        session.items.splice(index, 1);
        safeSaveStorage('pockita_titipan', JSON.stringify(titipanData));
        renderApp();
    }
}

function hapusTitipan(id) {
    if (confirm("Hapus sesi titipan ini?")) {
        titipanData = titipanData.filter(t => t.id !== id);
        safeSaveStorage('pockita_titipan', JSON.stringify(titipanData));
        renderApp();
    }
}

function renderTitipan() {
    const container = document.getElementById('list-titipan');
    if (!container) return;
    if (titipanData.length === 0) {
        container.innerHTML = `<div class="empty-state">Belum ada riwayat titipan.</div>`;
        return;
    }

    container.innerHTML = titipanData.slice().reverse().map(t => {
        const terpakai = t.items.reduce((sum, item) => sum + item.price, 0);
        const sisa = t.modal - terpakai;
        const itemsHtml = t.items.length === 0
            ? `<li style="text-align:center; font-size:0.78rem; color:var(--text-muted); padding:6px 0;">Belum ada barang.</li>`
            : t.items.map((item, idx) => `<li class="titipan-item"><span>${escapeHTML(item.name)}</span><span>Rp ${formatRupiah(item.price)} <button type="button" style="border:none;background:transparent;color:var(--expense-red);cursor:pointer;" onclick="hapusItemTitipan(${t.id}, ${idx})">✖</button></span></li>`).join('');

        return `
        <div class="person-group">
            <button type="button" class="person-header" onclick="toggleTitipan(${t.id})">
                <span>🛒 ${escapeHTML(t.title)}</span>
                <span>Sisa: Rp ${formatRupiah(sisa)} ▼</span>
            </button>
            <div class="person-content" id="titipan-content-${t.id}">
                <div class="titipan-summary">
                    <div>Modal<br><strong>Rp ${formatRupiah(t.modal)}</strong></div>
                    <div>Terpakai<br><strong style="color:var(--expense-red)">Rp ${formatRupiah(terpakai)}</strong></div>
                    <div>Sisa<br><strong style="color:var(--income-green)">Rp ${formatRupiah(sisa)}</strong></div>
                </div>
                <ul class="titipan-item-list">${itemsHtml}</ul>
                <form class="titipan-add-form" onsubmit="tambahItemTitipan(event, ${t.id})">
                    <input type="text" id="titipan-item-name-${t.id}" placeholder="Nama barang..." required style="flex:2;">
                    <input type="text" inputmode="numeric" id="titipan-item-price-${t.id}" class="format-uang" placeholder="Harga" required style="flex:1.4;">
                    <button type="submit">+</button>
                </form>
                <button type="button" class="btn-secondary-sm" style="width:100%; margin-top:8px; color:var(--expense-red);" onclick="hapusTitipan(${t.id})">Hapus Sesi</button>
            </div>
        </div>`;
    }).join('');
}

// ==================== TRANSAKSI BERULANG ====================
function getScheduledDateInMonth(yearMonth, dayOfMonth) {
    const [y, m] = yearMonth.split('-').map(Number);
    const maxDay = new Date(y, m, 0).getDate();
    const clampedDay = Math.min(Math.max(1, dayOfMonth || 1), maxDay);
    return `${yearMonth}-${String(clampedDay).padStart(2, '0')}`;
}

function checkAndApplyRecurring() {
    if (recurringTemplates.length === 0) return;
    const now = new Date();
    const realMonth = now.toISOString().slice(0, 7);
    const nowTimeStr = now.toTimeString().slice(0, 5);
    const todayDateStr = now.toISOString().split('T')[0];

    let changed = false;
    recurringTemplates.forEach(tpl => {
        if (tpl.active === false) return;
        const key = `${realMonth}_${tpl.id}`;
        if (recurringAppliedMonths.includes(realMonth) || recurringAppliedMonths.includes(key)) return;

        const targetDate = getScheduledDateInMonth(realMonth, tpl.dayOfMonth || 1);
        const targetTime = tpl.timeOfDay || '00:01';

        if (todayDateStr > targetDate || (todayDateStr === targetDate && nowTimeStr >= targetTime)) {
            transactions.push({
                id: Date.now() + Math.random(),
                type: 'expense',
                amount: tpl.amount,
                category: tpl.category || 'kebutuhan',
                desc: `Auto: ${tpl.name}`,
                date: targetDate,
                time: targetTime,
                method: tpl.method
            });
            recurringAppliedMonths.push(key);
            changed = true;
        }
    });

    if (changed) {
        safeSaveStorage('pockita_applied_months', JSON.stringify(recurringAppliedMonths));
        safeSaveStorage('pockita_tx', JSON.stringify(transactions));
    }
}

function toggleRecurringActive(id) {
    const tpl = recurringTemplates.find(t => t.id === id);
    if (!tpl) return;
    tpl.active = tpl.active === false ? true : false;
    safeSaveStorage('pockita_recur', JSON.stringify(recurringTemplates));
    renderPlans();
}

// ==================== KALENDER & RIWAYAT ====================
function toggleHistoryCalendar() {
    isHistoryCalVisible = !isHistoryCalVisible;
    const body = document.getElementById('history-cal-body');
    const btn = document.getElementById('btn-toggle-cal');
    if (body) body.style.display = isHistoryCalVisible ? 'block' : 'none';
    if (btn) btn.innerText = isHistoryCalVisible ? 'Sembunyikan' : 'Tampilkan';
}

function renderHistoryCalendar() {
    const grid = document.getElementById('history-calendar-grid');
    const titleEl = document.getElementById('history-cal-title');
    if (!grid) return;

    const activeMonth = getSelectedMonth();
    const [year, month] = activeMonth.split('-').map(Number);
    const monthObj = new Date(year, month - 1, 1);

    if (titleEl) {
        titleEl.innerText = 'Kalender ' + monthObj.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    }

    const firstWeekday = monthObj.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const todayStr = new Date().toISOString().split('T')[0];
    const fHariEl = document.getElementById('filter-hari');
    const selectedDayStr = (currentHistoryMode === 'hari' && fHariEl) ? fHariEl.value : '';

    const dayFlags = {};
    transactions.forEach(tx => {
        if (!tx.date || !tx.date.startsWith(activeMonth)) return;
        if (!dayFlags[tx.date]) dayFlags[tx.date] = { hasIn: false, hasOut: false };
        if (tx.type === 'income') dayFlags[tx.date].hasIn = true;
        if (tx.type === 'expense' || (tx.type === 'transfer' && (tx.adminFee || 0) > 0)) dayFlags[tx.date].hasOut = true;
    });

    let html = '';
    for (let i = 0; i < firstWeekday; i++) html += `<div class="cal-day-cell empty"></div>`;

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${activeMonth}-${String(d).padStart(2, '0')}`;
        const flags = dayFlags[dateStr];
        const isToday = dateStr === todayStr ? 'today' : '';
        const isSelected = dateStr === selectedDayStr ? 'selected' : '';
        let dots = '';
        if (flags) {
            if (flags.hasIn) dots += `<span class="dot-in"></span>`;
            if (flags.hasOut) dots += `<span class="dot-out"></span>`;
        }
        html += `<button type="button" class="cal-day-cell ${isToday} ${isSelected}" onclick="selectCalendarDate('${dateStr}')"><span>${d}</span><div class="cal-dots">${dots}</div></button>`;
    }
    grid.innerHTML = html;
}

function selectCalendarDate(dateStr) {
    const hariInput = document.getElementById('filter-hari');
    if (!hariInput) return;
    if (currentHistoryMode === 'hari' && hariInput.value === dateStr) {
        setHistoryMode('bulan');
        return;
    }
    hariInput.value = dateStr;
    setHistoryMode('hari');
}

function onFilterDateChange() {
    renderHistoryCalendar();
    renderHistoryList();
}

function setHistoryMode(mode) {
    currentHistoryMode = mode;
    const bSemua = document.getElementById('btn-mode-semua');
    const bBulan = document.getElementById('btn-mode-bulan');
    const bHari = document.getElementById('btn-mode-hari');
    const fHari = document.getElementById('filter-hari');
    if (bSemua) bSemua.className = mode === 'semua' ? 'time-btn active' : 'time-btn';
    if (bBulan) bBulan.className = mode === 'bulan' ? 'time-btn active' : 'time-btn';
    if (bHari) bHari.className = mode === 'hari' ? 'time-btn active' : 'time-btn';
    if (fHari) fHari.style.display = mode === 'hari' ? 'inline-block' : 'none';
    renderHistoryCalendar();
    renderHistoryList();
}

function onHistorySearchInput() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(renderHistoryList, 150);
}

function clearHistorySearch() {
    const input = document.getElementById('search-history');
    if (input) input.value = '';
    renderHistoryList();
}

function matchesHistorySearch(tx, rawSearch) {
    if (!rawSearch) return true;
    const numericQuery = rawSearch.replace(/[^0-9]/g, '');
    if (/^[rp\s.,0-9]+$/i.test(rawSearch) && numericQuery.length > 0 && tx.amount.toString().includes(numericQuery)) {
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

function buildTransactionItemHTML(tx, showDate = false) {
    const descStr = tx.desc || '';
    const isTransfer = tx.type === 'transfer';
    let cleanDesc = descStr.replace(/^(Auto|Target|Memberi Piutang|Terima Piutang|Menerima Hutang|Bayar Hutang):\s*/i, '');

    let pillExtra = '';
    if (descStr.startsWith('Auto: ')) pillExtra += `<span class="pill-outline pill-outline-auto">AUTO</span>`;
    if (descStr.startsWith('Target: ')) pillExtra += `<span class="pill-outline pill-outline-target">TAGIHAN</span>`;
    if (descStr.includes('Piutang:')) pillExtra += `<span class="pill-outline pill-outline-piutang">PIUTANG</span>`;
    if (descStr.includes('Hutang:')) pillExtra += `<span class="pill-outline pill-outline-hutang">HUTANG</span>`;
    if (isTransfer) {
        pillExtra += `<span class="pill-outline pill-outline-transfer">⇄ MUTASI</span>`;
        if ((tx.adminFee || 0) > 0) pillExtra += `<span class="pill-outline pill-outline-admin">ADMIN: Rp ${formatRupiah(tx.adminFee)}</span>`;
        cleanDesc = `${tx.method} ➡ ${tx.methodTo}`;
    }
    if (tx.moodTag) pillExtra += `<span class="pill-outline pill-outline-mood">${escapeHTML(tx.moodTag)}</span>`;

    const catName = (tx.category || 'umum').toLowerCase();
    const catColorClass = catName === 'keinginan' ? 'pill-outline-keinginan' : (catName === 'tabungan' ? 'pill-outline-tabungan' : 'pill-outline-kebutuhan');
    const pillKategori = (tx.type === 'expense' && !descStr.includes('Piutang:') && !descStr.includes('Hutang:'))
        ? `<span class="pill-outline ${catColorClass}">${escapeHTML(catName.toUpperCase())}</span>` : '';

    const txColorClass = isTransfer ? 'tx-transfer' : (tx.type === 'income' ? 'tx-income' : 'tx-expense');
    const sign = isTransfer ? '' : (tx.type === 'income' ? '+' : '-');
    const catatanUI = tx.catatan ? `<div class="tx-note">📝 ${escapeHTML(tx.catatan)}</div>` : '';

    let dateMeta = '';
    if (showDate && tx.date) {
        const dObj = new Date(tx.date + 'T00:00:00');
        dateMeta = `${dObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} • `;
    }

    return `
        <div class="tx-kiri">
            <div class="tx-title">${escapeHTML(cleanDesc)}</div>
            ${catatanUI}
            <div class="pill-container">${pillKategori}${pillExtra}</div>
            <span class="tx-meta">${escapeHTML(tx.method)} • ${dateMeta}Jam ${escapeHTML(tx.time)}</span>
        </div>
        <div class="tx-kanan">
            <div class="tx-amount ${txColorClass}">${sign} Rp ${formatRupiah(tx.amount)}</div>
            <div class="tx-actions">
                <button type="button" class="btn-edit" onclick="editTransaksi(${tx.id})">${iconEdit}</button>
                <button type="button" class="btn-delete" onclick="hapusTransaksi(${tx.id})">${iconDelete}</button>
            </div>
        </div>`;
}

function getFilteredHistoryTransactions() {
    const activeMonth = getSelectedMonth();
    const filterTipe = document.getElementById('filter-tipe') ? document.getElementById('filter-tipe').value : 'Utama';
    const filterMood = document.getElementById('filter-mood') ? document.getElementById('filter-mood').value : 'Semua';
    const currentFilter = document.getElementById('filter-metode') ? document.getElementById('filter-metode').value : 'Semua';
    const searchInput = document.getElementById('search-history');
    const rawSearch = searchInput ? searchInput.value.trim().toLowerCase() : '';

    const isAllTimeFlatView = currentHistoryMode === 'semua' || rawSearch !== '';
    let list = isAllTimeFlatView
        ? transactions.slice()
        : (currentHistoryMode === 'bulan'
            ? transactions.filter(tx => tx.date && tx.date.startsWith(activeMonth))
            : transactions.filter(tx => tx.date === document.getElementById('filter-hari').value));

    if (filterTipe === 'Utama') list = list.filter(tx => tx.type !== 'transfer');
    else list = list.filter(tx => tx.type === filterTipe);

    if (filterMood !== 'Semua') list = list.filter(tx => tx.moodTag === filterMood);
    if (currentFilter !== 'Semua') list = list.filter(tx => tx.method === currentFilter || (tx.type === 'transfer' && tx.methodTo === currentFilter));
    if (rawSearch !== '') list = list.filter(tx => matchesHistorySearch(tx, rawSearch));

    return { list, rawSearch, isAllTimeFlatView, currentFilter };
}

function renderHistoryList() {
    const transactionContainer = document.getElementById('daftar-transaksi');
    const summaryBar = document.getElementById('history-summary-bar');
    if (!transactionContainer) return;

    const searchInput = document.getElementById('search-history');
    const clearBtn = document.getElementById('btn-clear-search');
    if (clearBtn) clearBtn.style.display = (searchInput && searchInput.value.trim()) ? 'flex' : 'none';

    const { list: displayTransactions, rawSearch, isAllTimeFlatView, currentFilter } = getFilteredHistoryTransactions();

    let sumMasuk = 0;
    let sumKeluar = 0;
    displayTransactions.forEach(tx => {
        if (tx.type === 'income') sumMasuk += tx.amount;
        else if (tx.type === 'expense') sumKeluar += tx.amount;
        else if (tx.type === 'transfer' && (tx.adminFee || 0) > 0) sumKeluar += tx.adminFee;
    });
    const sumNet = sumMasuk - sumKeluar;

    if (summaryBar) {
        summaryBar.innerHTML = `
            <div><span>MASUK</span><strong style="color:var(--income-green);">+Rp ${formatRupiah(sumMasuk)}</strong></div>
            <div><span>KELUAR</span><strong style="color:var(--expense-red);">-Rp ${formatRupiah(sumKeluar)}</strong></div>
            <div><span>SELISIH</span><strong style="color:${sumNet >= 0 ? 'var(--income-green)' : 'var(--expense-red)'};">Rp ${formatRupiah(sumNet)}</strong></div>`;
    }

    transactionContainer.innerHTML = '';
    if (displayTransactions.length === 0) {
        transactionContainer.innerHTML = `<div class="empty-state"><img src="assets/img/pochita-sleep.png" class="empty-state-img" alt="Kosong" onerror="this.style.display='none'">Tidak ada riwayat transaksi.</div>`;
        return;
    }

    if (isAllTimeFlatView) {
        if (rawSearch !== '') {
            transactionContainer.innerHTML = `<div class="search-scope-info">🔍 Ditemukan ${displayTransactions.length} transaksi</div>`;
        }
        const ulFlat = document.createElement('ul');
        ulFlat.className = 'transaction-list card-section';
        displayTransactions.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time) || b.id - a.id).forEach(tx => {
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
            const safeMethod = escapeHTML(method);
            groupDiv.innerHTML = `<div class="method-group-title"><img src="${imgData}" class="method-icon" onerror="this.outerHTML='<div class=\\'method-icon fallback-icon\\'>${safeMethod.charAt(0)}</div>'">${safeMethod}</div>`;

            const txsByDate = {};
            groupedTx[method].forEach(tx => {
                if (!txsByDate[tx.date]) txsByDate[tx.date] = [];
                if (!txsByDate[tx.date].find(x => x.id === tx.id)) txsByDate[tx.date].push(tx);
            });

            Object.keys(txsByDate).sort((a, b) => new Date(b) - new Date(a)).forEach(dateStr => {
                const formattedDate = new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                const dateHeader = document.createElement('div');
                dateHeader.className = 'date-group-title';
                dateHeader.innerText = `📅 ${formattedDate}`;
                groupDiv.appendChild(dateHeader);

                const ul = document.createElement('ul');
                ul.className = 'transaction-list';
                txsByDate[dateStr].sort((a, b) => (b.time || '').localeCompare(a.time || '') || b.id - a.id).forEach(tx => {
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
}

// ==================== RENDER UTAMA ====================
function renderApp() {
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
            const fee = tx.adminFee || 0;
            balancesByMethod[tx.method] -= (tx.amount + fee);
            balancesByMethod[tx.methodTo] += tx.amount;
            grandTotalSaldo -= fee;
        }
    });

    balancesByMethodCache = balancesByMethod;
    grandTotalCache = grandTotalSaldo;

    const saldoEl = document.getElementById('total-saldo');
    const eyeBtn = document.getElementById('btn-toggle-eye');
    const breakdownContainer = document.getElementById('balance-breakdown');
    if (breakdownContainer) breakdownContainer.innerHTML = '';

    if (isBalanceHidden) {
        if (saldoEl) saldoEl.innerText = '***';
        if (eyeBtn) eyeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
        if (breakdownContainer) breakdownContainer.style.display = 'none';
    } else {
        if (saldoEl) saldoEl.innerText = formatRupiah(grandTotalSaldo);
        if (eyeBtn) eyeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
        if (breakdownContainer) {
            const entries = Object.entries(balancesByMethod);
            breakdownContainer.innerHTML = entries.length === 0
                ? `<div class="breakdown-item"><span>Belum ada saldo</span><span>Rp 0</span></div>`
                : entries.map(([m, amt]) => `<div class="breakdown-item"><span>${escapeHTML(m)}</span><span>Rp ${formatRupiah(amt)}</span></div>`).join('');
        }
    }

    const homeRecentContainer = document.getElementById('home-recent-tx');
    const recentTxs = transactions.slice().sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time) || b.id - a.id).slice(0, 3);
    if (homeRecentContainer) {
        if (recentTxs.length === 0) {
            homeRecentContainer.innerHTML = `<div class="empty-state"><img src="assets/img/pochita-sleep.png" class="empty-state-img" alt="Kosong" onerror="this.style.display='none'">Belum ada transaksi. Tekan tombol + di bawah untuk mulai mencatat.</div>`;
        } else {
            const ul = document.createElement('ul');
            ul.className = 'transaction-list';
            recentTxs.forEach(tx => {
                const li = document.createElement('li');
                li.className = 'transaction-item';
                li.innerHTML = buildTransactionItemHTML(tx, true);
                ul.appendChild(li);
            });
            homeRecentContainer.innerHTML = '';
            homeRecentContainer.appendChild(ul);
        }
    }

    updateDatalist('sumber-list', savedSources);
    updateDatalist('detail-list', savedDetails);
    populateSelectMethods();

    const filterMetode = document.getElementById('filter-metode');
    if (filterMetode) {
        const currentFilter = filterMetode.value;
        filterMetode.innerHTML = '<option value="Semua">Semua Dompet</option>' +
            Object.keys(pockitaMethods).map(m => `<option value="${escapeHTML(m)}" ${m === currentFilter ? 'selected' : ''}>${escapeHTML(m)}</option>`).join('');
    }

    renderHistoryCalendar();
    renderHistoryList();
    renderHomeDailyWidget();
    renderCooldownWidget();
    renderPlans();

    safeSaveStorage('pockita_tx', JSON.stringify(transactions));
    safeSaveStorage('pockita_sources', JSON.stringify([...savedSources]));
    safeSaveStorage('pockita_details', JSON.stringify([...savedDetails]));
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
    } else if (tx.type === 'expense') {
        document.getElementById('out-jumlah').value = formatRupiah(tx.amount);
        document.getElementById('out-kategori').value = tx.category || 'kebutuhan';
        document.getElementById('out-detail').value = tx.desc.replace(/^(Auto|Target|Memberi Piutang|Terima Piutang|Menerima Hutang|Bayar Hutang):\s*/i, '');
        document.getElementById('out-catatan').value = tx.catatan || '';
        document.getElementById('out-tanggal').value = tx.date;
        document.getElementById('out-waktu').value = tx.time;
        document.getElementById('out-metode').value = tx.method;
        clearMoodSelection();
        if (tx.moodTag) {
            document.getElementById('out-mood-tag').value = tx.moodTag;
            document.querySelectorAll('.mood-chip').forEach(c => { if (c.innerText === tx.moodTag) c.classList.add('selected'); });
        }
        document.getElementById('btn-submit-expense').innerText = "Update Pengeluaran ✓";
        toggleCooldownOption();
    } else if (tx.type === 'transfer') {
        document.getElementById('tf-jumlah').value = formatRupiah(tx.amount);
        document.getElementById('tf-metode-dari').value = tx.method;
        document.getElementById('tf-metode-ke').value = tx.methodTo;
        document.getElementById('tf-catatan').value = tx.catatan || '';
        document.getElementById('tf-tanggal').value = tx.date;
        document.getElementById('tf-waktu').value = tx.time;
        document.getElementById('tf-admin').value = (tx.adminFee || 0) > 0 ? formatRupiah(tx.adminFee) : '';
        document.getElementById('btn-submit-transfer').innerText = "Update Mutasi ✓";
    }
}

function resetFormButtons() {
    document.getElementById('btn-submit-income').innerText = "Simpan Pemasukan";
    document.getElementById('btn-submit-expense').innerText = "Simpan Pengeluaran";
    document.getElementById('btn-submit-transfer').innerText = "Mutasi Saldo";
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
    const adminFee = idAdmin && document.getElementById(idAdmin) ? parseUang(document.getElementById(idAdmin).value) : 0;
    const moodTag = type === 'expense' ? document.getElementById('out-mood-tag').value : '';

    if (amount <= 0) return;
    if (type === 'transfer' && method === methodTo) return alert("Pilih dompet tujuan yang berbeda!");

    if (editingTxId !== null) {
        const idx = transactions.findIndex(t => t.id === editingTxId);
        const old = transactions[idx];
        const prefixMatch = (old.desc || '').match(/^(Auto|Target|Memberi Piutang|Terima Piutang|Menerima Hutang|Bayar Hutang):\s*/i);
        const finalDesc = prefixMatch ? prefixMatch[0] + desc : desc;
        transactions[idx] = { id: editingTxId, type, amount, desc: finalDesc, date, time, method, methodTo, category, goalId: old.goalId, debtId: old.debtId, catatan, moodTag, adminFee };
        resetFormButtons();
    } else {
        transactions.push({ id: Date.now(), type, amount, desc, date, time, method, methodTo, category, catatan, moodTag, adminFee });
    }

    if (type === 'income') savedSources.add(desc);
    if (type === 'expense') savedDetails.add(desc);

    document.getElementById(type === 'income' ? 'form-pemasukan' : (type === 'expense' ? 'form-pengeluaran' : 'form-transfer')).reset();
    clearMoodSelection();
    setDefaultDateTime();
    closeTxModal();
    renderApp();
    const analysisView = document.getElementById('view-analysis');
    if (analysisView && analysisView.style.display === 'block') renderCharts();
}

onSubmit('form-pemasukan', function(e) { e.preventDefault(); simpanTransaksi('income', 'in-jumlah', 'in-sumber', 'in-tanggal', 'in-waktu', 'in-metode', null, null, 'in-catatan', null); });
onSubmit('form-pengeluaran', function(e) { e.preventDefault(); simpanTransaksi('expense', 'out-jumlah', 'out-detail', 'out-tanggal', 'out-waktu', 'out-metode', 'out-kategori', null, 'out-catatan', null); });
onSubmit('form-transfer', function(e) { e.preventDefault(); simpanTransaksi('transfer', 'tf-jumlah', null, 'tf-tanggal', 'tf-waktu', 'tf-metode-dari', null, 'tf-metode-ke', 'tf-catatan', 'tf-admin'); });

function hapusTransaksi(id) {
    if (confirm("Hapus transaksi ini?")) {
        transactions = transactions.filter(tx => tx.id !== id);
        renderApp();
        const analysisView = document.getElementById('view-analysis');
        if (analysisView && analysisView.style.display === 'block') renderCharts();
    }
}

// ==================== GRAFIK & ANALISIS ====================
function initRatioUI() {
    document.querySelectorAll('.ratio-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.preset === ratioConfig.preset);
    });
    const customBox = document.getElementById('custom-ratio-box');
    if (customBox) customBox.style.display = ratioConfig.preset === 'custom' ? 'grid' : 'none';
    const nEl = document.getElementById('ratio-need');
    const wEl = document.getElementById('ratio-want');
    const sEl = document.getElementById('ratio-save');
    if (nEl) nEl.value = ratioConfig.need;
    if (wEl) wEl.value = ratioConfig.want;
    if (sEl) sEl.value = ratioConfig.save;
    const titleEl = document.getElementById('chart-target-title');
    if (titleEl) titleEl.innerText = `Target Porsi Ideal ${ratioConfig.need}/${ratioConfig.want}/${ratioConfig.save}`;
}

function setRatioPreset(preset) {
    if (preset === '50-30-20') ratioConfig = { preset, need: 50, want: 30, save: 20 };
    else if (preset === '70-20-10') ratioConfig = { preset, need: 70, want: 20, save: 10 };
    else if (preset === '50-20-30') ratioConfig = { preset, need: 50, want: 20, save: 30 };
    else ratioConfig.preset = 'custom';
    safeSaveStorage('pockita_ratio_mode', JSON.stringify(ratioConfig));
    initRatioUI();
    renderCharts();
}

function applyCustomRatio() {
    let need = Math.max(0, Math.min(100, parseInt(document.getElementById('ratio-need').value) || 0));
    let want = Math.max(0, Math.min(100, parseInt(document.getElementById('ratio-want').value) || 0));
    let save = Math.max(0, Math.min(100, 100 - need - want));
    document.getElementById('ratio-save').value = save;
    ratioConfig = { preset: 'custom', need, want, save };
    safeSaveStorage('pockita_ratio_mode', JSON.stringify(ratioConfig));
    initRatioUI();
    renderCharts();
}

function renderCharts() {
    initRatioUI();
    const activeMonth = getSelectedMonth();
    const monthlyTxAll = transactions.filter(tx => tx.date && tx.date.startsWith(activeMonth));
    const monthlyTx = monthlyTxAll.filter(tx => tx.type !== 'transfer');
    const totalPemasukanBulanIni = monthlyTx.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);

    let pengeluaranAktual = { kebutuhan: 0, keinginan: 0, tabungan: 0, biayaadmin: 0 };
    monthlyTx.filter(tx => tx.type === 'expense').forEach(tx => {
        const cat = (tx.category || 'kebutuhan').toLowerCase();
        if (Object.prototype.hasOwnProperty.call(pengeluaranAktual, cat)) pengeluaranAktual[cat] += tx.amount;
        else pengeluaranAktual.kebutuhan += tx.amount;
    });
    monthlyTxAll.filter(tx => tx.type === 'transfer').forEach(tx => {
        if ((tx.adminFee || 0) > 0) pengeluaranAktual.biayaadmin += tx.adminFee;
    });

    const targetIdeal = {
        kebutuhan: totalPemasukanBulanIni * ((ratioConfig.need || 50) / 100),
        keinginan: totalPemasukanBulanIni * ((ratioConfig.want || 30) / 100),
        tabungan: totalPemasukanBulanIni * ((ratioConfig.save || 20) / 100)
    };
    updateStatusBadge('kebutuhan', pengeluaranAktual.kebutuhan + pengeluaranAktual.biayaadmin, targetIdeal.kebutuhan);
    updateStatusBadge('keinginan', pengeluaranAktual.keinginan, targetIdeal.keinginan);
    updateStatusBadge('tabungan', pengeluaranAktual.tabungan, targetIdeal.tabungan);
    renderMoodInsights(monthlyTx);

    if (typeof Chart === 'undefined') return;

    if (totalPemasukanBulanIni === 0) {
        document.getElementById('empty-target-chart').style.display = 'flex';
        document.getElementById('chartTarget').style.display = 'none';
    } else {
        document.getElementById('empty-target-chart').style.display = 'none';
        document.getElementById('chartTarget').style.display = 'block';
        if (chartTargetObj) chartTargetObj.destroy();
        chartTargetObj = new Chart(document.getElementById('chartTarget').getContext('2d'), {
            type: 'pie',
            data: { labels: ['Kebutuhan Ideal', 'Keinginan Ideal', 'Tabungan Ideal'], datasets: [{ data: [targetIdeal.kebutuhan, targetIdeal.keinginan, targetIdeal.tabungan], backgroundColor: ['#255C99', '#D4820A', '#1B9A59'] }] },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
    }

    if (monthlyTx.length === 0 && pengeluaranAktual.biayaadmin === 0) {
        document.getElementById('empty-realisasi-chart').style.display = 'flex';
        document.getElementById('chartRealisasi').style.display = 'none';
    } else {
        document.getElementById('empty-realisasi-chart').style.display = 'none';
        document.getElementById('chartRealisasi').style.display = 'block';
        const totalTerpakai = pengeluaranAktual.kebutuhan + pengeluaranAktual.keinginan + pengeluaranAktual.tabungan + pengeluaranAktual.biayaadmin;
        const sisaPemasukan = totalPemasukanBulanIni - totalTerpakai;
        const labels = ['Kebutuhan', 'Keinginan', 'Tabungan'];
        const data = [pengeluaranAktual.kebutuhan + pengeluaranAktual.biayaadmin, pengeluaranAktual.keinginan, pengeluaranAktual.tabungan];
        const colors = ['#255C99', '#D4820A', '#1B9A59'];
        if (sisaPemasukan > 0) { labels.push('Sisa'); data.push(sisaPemasukan); colors.push('#CBD5E1'); }

        if (chartRealisasiObj) chartRealisasiObj.destroy();
        chartRealisasiObj = new Chart(document.getElementById('chartRealisasi').getContext('2d'), {
            type: 'pie',
            data: { labels, datasets: [{ data, backgroundColor: colors }] },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
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
        container.innerHTML = `<p style="font-size:0.78rem; color:var(--text-muted); text-align:center;">Belum ada pengeluaran bulan ini.</p>`;
        return;
    }

    const tags = ['#Wajib', '#BosanStres', '#SosialTraktir', '#Darurat'];
    container.innerHTML = tags.map(tag => {
        const sum = expenses.filter(tx => tx.moodTag === tag).reduce((s, tx) => s + tx.amount, 0);
        const pct = Math.round((sum / totalOut) * 100);
        const color = tag === '#BosanStres' ? '#D62828' : (tag === '#SosialTraktir' ? '#D4820A' : (tag === '#Darurat' ? '#7B3FA0' : '#1B9A59'));
        return `<div class="mood-row"><div class="mood-row-header"><span>${tag}</span><span>Rp ${formatRupiah(sum)} (${pct}%)</span></div><div class="mood-bar-bg"><div class="mood-bar-fill" style="width:${pct}%; background:${color};"></div></div></div>`;
    }).join('');
}

function updateStatusBadge(catName, aktual, target) {
    const badge = document.getElementById(`badge-${catName}`);
    const imgEl = document.getElementById(`img-${catName}`);
    const maxNominalEl = document.getElementById(`max-${catName}`);
    const frontBg = document.getElementById(`bg-${catName}`);
    if (!badge || !imgEl || !maxNominalEl || !frontBg) return;

    maxNominalEl.innerText = formatK(target);
    frontBg.style.backgroundColor = catName === 'kebutuhan' ? '#1B9A59' : (catName === 'keinginan' ? '#D4820A' : '#D62828');

    if (target === 0) { badge.innerHTML = "0%"; imgEl.src = "assets/img/mode-aman.png"; return; }
    const rasio = aktual / target;
    badge.innerHTML = `${Math.min(999, Math.round(rasio * 100))}%`;
    imgEl.src = rasio > 1.0 ? "assets/img/mode-bahaya.png" : (rasio >= 0.85 ? "assets/img/mode-waspada.png" : "assets/img/mode-aman.png");
}

function renderBarChartKomparasi() {
    if (typeof Chart === 'undefined') return;
    let monthsLabel = [], expensesData = [], incomesData = [], sisaData = [];
    for (let i = 5; i >= 0; i--) {
        let d = new Date();
        d.setMonth(d.getMonth() - i);
        let mStr = d.toISOString().slice(0, 7);
        monthsLabel.push(d.toLocaleString('id-ID', { month: 'short' }));
        let outSum = transactions.filter(tx => tx.date && tx.date.startsWith(mStr)).reduce((s, tx) => tx.type === 'expense' ? s + tx.amount : (tx.type === 'transfer' ? s + (tx.adminFee || 0) : s), 0);
        let inSum = transactions.filter(tx => tx.date && tx.date.startsWith(mStr) && tx.type === 'income').reduce((s, tx) => s + tx.amount, 0);
        expensesData.push(outSum); incomesData.push(inSum); sisaData.push(inSum - outSum);
    }

    if (chartKomparasiObj) chartKomparasiObj.destroy();
    chartKomparasiObj = new Chart(document.getElementById('chartKomparasi').getContext('2d'), {
        type: 'bar',
        data: {
            labels: monthsLabel,
            datasets: [
                { label: 'Masuk', data: incomesData, backgroundColor: '#1B9A59', borderRadius: 6 },
                { label: 'Keluar', data: expensesData, backgroundColor: '#D62828', borderRadius: 6 },
                { label: 'Sisa', data: sisaData, backgroundColor: '#D4820A', borderRadius: 6 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

// ==================== RENCANA (RUTIN, CELENGAN, HUTANG) ====================
onSubmit('form-berulang', function(e) {
    e.preventDefault();
    const amount = parseUang(document.getElementById('recur-jumlah').value);
    const category = document.getElementById('recur-kategori').value;
    const name = document.getElementById('recur-nama').value;
    const method = document.getElementById('recur-metode').value;
    const dayOfMonth = Math.min(31, Math.max(1, parseInt(document.getElementById('recur-tanggal').value) || 1));
    const timeOfDay = document.getElementById('recur-waktu').value || '07:00';

    recurringTemplates.push({ id: Date.now(), amount, category, name, method, dayOfMonth, timeOfDay, active: true });
    safeSaveStorage('pockita_recur', JSON.stringify(recurringTemplates));
    checkAndApplyRecurring();
    this.reset();
    renderApp();
});

onSubmit('form-goals', function(e) {
    e.preventDefault();
    const name = document.getElementById('goal-nama').value;
    const target = parseUang(document.getElementById('goal-target').value);
    const category = document.getElementById('goal-kategori').value;
    savingsGoals.push({ id: Date.now(), name, target, category });
    safeSaveStorage('pockita_goals', JSON.stringify(savingsGoals));
    this.reset();
    renderApp();
});

onSubmit('form-piutang', function(e) {
    e.preventDefault();
    const name = document.getElementById('piutang-nama').value;
    const target = parseUang(document.getElementById('piutang-jumlah').value);
    const method = document.getElementById('piutang-metode').value;
    const category = document.getElementById('piutang-kategori').value;
    const note = document.getElementById('piutang-catatan').value;
    if (target <= 0) return;

    const debtId = Date.now();
    debtsData.push({ id: debtId, type: 'piutang', name, target, note, method, category });
    safeSaveStorage('pockita_debts', JSON.stringify(debtsData));

    const now = new Date();
    transactions.push({ id: Date.now() + 1, type: 'expense', amount: target, category, desc: `Memberi Piutang: ${name}`, date: now.toISOString().split('T')[0], time: now.toTimeString().split(' ')[0].slice(0, 5), method, debtId });
    this.reset();
    renderApp();
});

onSubmit('form-hutang', function(e) {
    e.preventDefault();
    const name = document.getElementById('hutang-nama').value;
    const target = parseUang(document.getElementById('hutang-jumlah').value);
    const method = document.getElementById('hutang-metode').value;
    const note = document.getElementById('hutang-catatan').value;
    if (target <= 0) return;

    const debtId = Date.now();
    debtsData.push({ id: debtId, type: 'hutang', name, target, note, method });
    safeSaveStorage('pockita_debts', JSON.stringify(debtsData));

    const now = new Date();
    transactions.push({ id: Date.now() + 1, type: 'income', amount: target, category: 'umum', desc: `Menerima Hutang: ${name}`, date: now.toISOString().split('T')[0], time: now.toTimeString().split(' ')[0].slice(0, 5), method, debtId });
    this.reset();
    renderApp();
});

function tambahTabunganGoal(id) {
    const inputEl = document.getElementById(`input-add-goal-${id}`);
    const methodEl = document.getElementById(`method-add-goal-${id}`);
    let moneyToAdd = parseUang(inputEl.value);
    if (moneyToAdd <= 0) return;

    const goal = savingsGoals.find(g => g.id === id);
    const collected = transactions.filter(tx => tx.goalId === goal.id).reduce((sum, tx) => sum + tx.amount, 0);
    moneyToAdd = Math.min(moneyToAdd, goal.target - collected);

    const now = new Date();
    transactions.push({ id: Date.now(), type: 'expense', amount: moneyToAdd, category: goal.category || 'tabungan', desc: `Target: ${goal.name}`, date: now.toISOString().split('T')[0], time: now.toTimeString().split(' ')[0].slice(0, 5), method: methodEl.value, goalId: goal.id });
    renderApp();
}

function bayarDebt(id) {
    const inputEl = document.getElementById(`input-bayar-debt-${id}`);
    const methodEl = document.getElementById(`method-bayar-debt-${id}`);
    let moneyPaid = parseUang(inputEl.value);
    if (moneyPaid <= 0) return;

    const debt = debtsData.find(d => d.id === id);
    const collected = debt.type === 'piutang'
        ? transactions.filter(tx => tx.debtId === debt.id && tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0)
        : transactions.filter(tx => tx.debtId === debt.id && tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);
    moneyPaid = Math.min(moneyPaid, debt.target - collected);

    const now = new Date();
    transactions.push({
        id: Date.now(),
        type: debt.type === 'piutang' ? 'income' : 'expense',
        amount: moneyPaid,
        category: 'umum',
        desc: `${debt.type === 'piutang' ? 'Terima Piutang' : 'Bayar Hutang'}: ${debt.name}`,
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().split(' ')[0].slice(0, 5),
        method: methodEl.value,
        debtId: debt.id
    });
    renderApp();
}

function hapusPlan(type, id) {
    if (!confirm("Hapus item ini?")) return;
    if (type === 'debt') {
        debtsData = debtsData.filter(x => x.id !== id);
        safeSaveStorage('pockita_debts', JSON.stringify(debtsData));
    } else if (type === 'recur') {
        recurringTemplates = recurringTemplates.filter(x => x.id !== id);
        safeSaveStorage('pockita_recur', JSON.stringify(recurringTemplates));
    } else if (type === 'goal') {
        savingsGoals = savingsGoals.filter(x => x.id !== id);
        safeSaveStorage('pockita_goals', JSON.stringify(savingsGoals));
    }
    renderApp();
}

function renderGroupedDebts(list, container, typeStr) {
    if (!container) return;
    if (list.length === 0) {
        container.innerHTML = `<div class="empty-state">Belum ada daftar ${typeStr}.</div>`;
        return;
    }
    const arrMethods = Object.keys(pockitaMethods);
    container.innerHTML = list.map(d => {
        const collected = d.type === 'piutang'
            ? transactions.filter(tx => tx.debtId === d.id && tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0)
            : transactions.filter(tx => tx.debtId === d.id && tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);
        const pct = Math.min(Math.round((collected / d.target) * 100), 100);
        const isCompleted = collected >= d.target;
        const selectHtml = `<select id="method-bayar-debt-${d.id}" class="filter-dropdown">${arrMethods.map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('')}</select>`;
        const actionHTML = isCompleted
            ? `<span style="color:var(--income-green);font-weight:800;flex:1;">✓ LUNAS</span><button type="button" class="btn-delete" onclick="hapusPlan('debt', ${d.id})">${iconDelete}</button>`
            : `<input type="text" id="input-bayar-debt-${d.id}" class="format-uang" placeholder="+ Nominal">${selectHtml}<button type="button" class="btn-add-goal" onclick="bayarDebt(${d.id})">${d.type === 'piutang' ? 'Terima' : 'Bayar'}</button><button type="button" class="btn-delete" onclick="hapusPlan('debt', ${d.id})">${iconDelete}</button>`;

        return `
        <div class="goal-box">
            <div class="goal-info">
                <strong>👤 ${escapeHTML(d.name)}</strong>
                <span>${pct}% (${formatRupiah(collected)} / ${formatRupiah(d.target)})</span>
            </div>
            <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%; background:${isCompleted ? 'var(--income-green)' : 'var(--primary-orange)'};"></div></div>
            <div class="goal-actions" style="margin-top:8px;">${actionHTML}</div>
        </div>`;
    }).join('');
}

function renderPlans() {
    const arrMethods = Object.keys(pockitaMethods);
    const listRecur = document.getElementById('list-berulang');
    if (listRecur) {
        listRecur.innerHTML = recurringTemplates.length === 0
            ? `<div class="empty-state">Belum ada langganan rutin.</div>`
            : recurringTemplates.map(t => {
                const isPaused = t.active === false;
                return `<li class="plan-item" style="opacity:${isPaused ? '0.6' : '1'};"><span><b>${escapeHTML(t.name)}</b> • Rp ${formatRupiah(t.amount)}<br><small style="color:var(--text-muted);">Tgl ${t.dayOfMonth || 1} • ${escapeHTML(t.method)}</small></span><div style="display:flex;gap:6px;"><button type="button" class="btn-pause-recur" onclick="toggleRecurringActive(${t.id})">${isPaused ? 'Aktifkan' : 'Jeda'}</button><button type="button" class="btn-delete" onclick="hapusPlan('recur', ${t.id})">${iconDelete}</button></div></li>`;
            }).join('');
    }

    const containerGoals = document.getElementById('list-goals');
    if (containerGoals) {
        containerGoals.innerHTML = savingsGoals.length === 0
            ? `<div class="empty-state">Belum ada target celengan.</div>`
            : savingsGoals.map(g => {
                const collected = transactions.filter(tx => tx.goalId === g.id).reduce((sum, tx) => sum + tx.amount, 0);
                const pct = Math.min(Math.round((collected / g.target) * 100), 100);
                const isCompleted = collected >= g.target;
                const selectHtml = `<select id="method-add-goal-${g.id}" class="filter-dropdown">${arrMethods.map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('')}</select>`;
                const actionHTML = isCompleted
                    ? `<span style="color:var(--income-green);font-weight:800;flex:1;">✓ TERCAPAI</span><button type="button" class="btn-delete" onclick="hapusPlan('goal', ${g.id})">${iconDelete}</button>`
                    : `<input type="text" id="input-add-goal-${g.id}" class="format-uang" placeholder="+ Nominal">${selectHtml}<button type="button" class="btn-add-goal" onclick="tambahTabunganGoal(${g.id})">Setor</button><button type="button" class="btn-delete" onclick="hapusPlan('goal', ${g.id})">${iconDelete}</button>`;

                return `
                <div class="goal-box">
                    <div class="goal-info"><strong>${escapeHTML(g.name)}</strong><span>${pct}% (${formatRupiah(collected)} / ${formatRupiah(g.target)})</span></div>
                    <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%; background:${isCompleted ? 'var(--income-green)' : 'var(--primary-orange)'};"></div></div>
                    <div class="goal-actions" style="margin-top:8px;">${actionHTML}</div>
                </div>`;
            }).join('');
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
    ['in-tanggal', 'out-tanggal', 'tf-tanggal', 'titipan-tanggal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = dateStr;
    });
    ['in-waktu', 'out-waktu', 'tf-waktu'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = timeStr;
    });
}

function exportToExcel() {
    const { list: displayTx } = getFilteredHistoryTransactions();
    if (displayTx.length === 0) return alert("Tidak ada data untuk diekspor!");

    let csvContent = "data:text/csv;charset=utf-8,\uFEFFTanggal,Jam,Tipe,Kategori,Tag,Detail,Catatan,Metode,Jumlah (Rp),Biaya Admin (Rp)\n";
    displayTx.forEach(tx => {
        const tipe = tx.type === 'income' ? 'Pemasukan' : (tx.type === 'transfer' ? 'Mutasi' : 'Pengeluaran');
        const kat = tx.category ? tx.category.toUpperCase() : 'UMUM';
        const dtl = (tx.desc || '').replace(/,/g, " ");
        const cttn = (tx.catatan || '-').replace(/,/g, " ");
        const method = tx.type === 'transfer' ? `${tx.method} -> ${tx.methodTo}` : tx.method;
        csvContent += `${tx.date},${tx.time},${tipe},${kat},${tx.moodTag || '-'},${dtl},${cttn},${method},${tx.amount},${tx.adminFee || 0}\n`;
    });

    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Pockita_Laporan_${getSelectedMonth()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==================== BOOTSTRAP ====================
function bootstrapPockita() {
    const savedSimIncome = localStorage.getItem('pockita_sim_income');
    const simIncEl = document.getElementById('sim-income');
    if (savedSimIncome && simIncEl) simIncEl.value = savedSimIncome;

    initMonthPicker();
    initRatioUI();
    checkAndApplyRecurring();
    setDefaultDateTime();
    renderSimulatorItems();
    renderApp();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapPockita);
} else {
    bootstrapPockita();
}