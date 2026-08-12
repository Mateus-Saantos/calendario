/* =========================================================
   Cronograma de Escala — módulo de cálculo + interface
   ========================================================= */

const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const weekdayLabels = ["D","S","T","Q","Q","S","S"];

const OVERRIDES_STORAGE_KEY = 'escala-overrides-2026';
const CONFIG_STORAGE_KEY = 'escala-config-v1';

const DEFAULT_CONFIG = {
  nome: '',
  tipo: '12x36',            // '12x36' | '5x2' | 'personalizada'
  referenceDate: '2026-08-08',
  referenceStatus: 'folga', // 'folga' | 'trabalho'
  custom: { trabalho: 3, folga: 2 }
};

/* ---------- Utilidades de data (sem bugs de timezone) ----------
   Trabalha sempre com componentes locais (ano, mês, dia) e usa
   Date.UTC só internamente para calcular diferença de dias, o que
   evita qualquer problema de fuso horário / horário de verão. */

function parseLocalDateKey(key){
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dateKey(date){
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameDay(a, b){
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function daysBetween(dateA, dateB){
  const utcA = Date.UTC(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
  const utcB = Date.UTC(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
  return Math.round((utcA - utcB) / 86400000);
}

/* ---------- Módulo de cálculo de escalas ----------
   Toda escala de "bloco" (N dias trabalhando / M dias de folga que
   se repetem) usa a mesma matemática de ciclo. 12x36 é o caso
   particular workDays=1 / offDays=1 (alternância diária). */

function calculateBlockCycle(date, refDate, refStatus, workDays, offDays){
  const cycleLen = workDays + offDays;
  const diff = daysBetween(date, refDate);
  const mod = ((diff % cycleLen) + cycleLen) % cycleLen;
  if(refStatus === 'trabalho'){
    return mod < workDays ? 'trabalho' : 'folga';
  }
  return mod < offDays ? 'folga' : 'trabalho';
}

function calculate12x36(date, config){
  const ref = parseLocalDateKey(config.referenceDate);
  return calculateBlockCycle(date, ref, config.referenceStatus, 1, 1);
}

function calculate5x2(date, config){
  const ref = parseLocalDateKey(config.referenceDate);
  return calculateBlockCycle(date, ref, config.referenceStatus, 5, 2);
}

function calculateCustom(date, config){
  const ref = parseLocalDateKey(config.referenceDate);
  const work = Math.max(1, parseInt(config.custom?.trabalho, 10) || 1);
  const off = Math.max(1, parseInt(config.custom?.folga, 10) || 1);
  return calculateBlockCycle(date, ref, config.referenceStatus, work, off);
}

function calculateScheduleDate(date, config){
  switch(config.tipo){
    case '5x2': return calculate5x2(date, config);
    case 'personalizada': return calculateCustom(date, config);
    case '12x36':
    default: return calculate12x36(date, config);
  }
}

/* ---------- Persistência: configuração da escala ---------- */

function loadConfig(){
  try{
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if(raw) return Object.assign({}, DEFAULT_CONFIG, JSON.parse(raw));
  }catch(e){
    console.error('Erro ao ler configuração:', e);
  }
  return Object.assign({}, DEFAULT_CONFIG);
}

function saveConfig(config){
  try{
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  }catch(e){
    console.error('Erro ao salvar configuração:', e);
  }
}

function hasStoredConfig(){
  return localStorage.getItem(CONFIG_STORAGE_KEY) !== null;
}

/* ---------- Persistência: edições manuais por dia (já existente) ---------- */

function loadOverrides(){
  try{
    const raw = localStorage.getItem(OVERRIDES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch(e){
    console.error('Erro ao ler edições:', e);
    return {};
  }
}

function saveOverrides(overrides){
  try{
    localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
  }catch(e){
    console.error('Erro ao salvar edições:', e);
  }
}

/* ---------- Compartilhamento por URL ---------- */

function parseSharedConfigFromURL(){
  const params = new URLSearchParams(window.location.search);
  if(!params.has('escala')) return null;

  const tipo = params.get('escala');
  // Links antigos podem trazer "invertida" na URL — ignoramos esse parâmetro
  // de propósito para não quebrar links já compartilhados.
  const cfg = {
    nome: params.get('nome') || '',
    tipo: ['12x36', '5x2', 'personalizada'].includes(tipo) ? tipo : '12x36',
    referenceDate: params.get('data') || DEFAULT_CONFIG.referenceDate,
    referenceStatus: params.get('estado') === 'trabalho' ? 'trabalho' : 'folga',
    custom: {
      trabalho: parseInt(params.get('wdias'), 10) || DEFAULT_CONFIG.custom.trabalho,
      folga: parseInt(params.get('fdias'), 10) || DEFAULT_CONFIG.custom.folga
    }
  };
  return cfg;
}

function buildShareURL(config){
  const params = new URLSearchParams();
  params.set('nome', config.nome || '');
  params.set('escala', config.tipo);
  params.set('data', config.referenceDate);
  params.set('estado', config.referenceStatus);
  if(config.tipo === 'personalizada'){
    params.set('wdias', config.custom.trabalho);
    params.set('fdias', config.custom.folga);
  }
  const base = window.location.origin + window.location.pathname;
  return `${base}?${params.toString()}`;
}

function cleanURL(){
  window.history.replaceState(null, '', window.location.pathname);
}

/* =========================================================
   Estado da aplicação
   ========================================================= */

let currentConfig = loadConfig();
let pendingSharedConfig = null;

const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const REAL_CURRENT_YEAR = today.getFullYear();
let displayYear = REAL_CURRENT_YEAR;
const container = document.getElementById('calendar');

/* =========================================================
   Toast
   ========================================================= */

function showToast(message){
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2200);
}

/* =========================================================
   Cabeçalho (nome / tipo de escala)
   ========================================================= */

function updateHeader(){
  const h1 = document.querySelector('header h1');
  h1.textContent = currentConfig.nome ? currentConfig.nome : 'Cronograma de Escala';

  const eyebrow = document.querySelector('.eyebrow');
  const labels = { '12x36': 'Escala 12x36', '5x2': 'Escala 5x2', 'personalizada': 'Escala personalizada' };
  eyebrow.textContent = labels[currentConfig.tipo] || 'Escala';

  document.getElementById('yearBtn').textContent = displayYear;
}

/* =========================================================
   Menu de três pontos
   ========================================================= */

const menuBtn = document.getElementById('menuBtn');
const menuDropdown = document.getElementById('menuDropdown');

menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  menuDropdown.classList.toggle('open');
});

document.addEventListener('click', () => {
  menuDropdown.classList.remove('open');
});

menuDropdown.querySelectorAll('button[data-action]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuDropdown.classList.remove('open');
    const action = btn.dataset.action;
    if(action === 'config') openSettings();
    if(action === 'share') shareSchedule();
    if(action === 'about') aboutOverlay.classList.add('open');
  });
});

/* =========================================================
   Seletor de ano
   ========================================================= */

const yearBtn = document.getElementById('yearBtn');
const yearDropdown = document.getElementById('yearDropdown');
const yearList = document.getElementById('yearList');
const yearInput = document.getElementById('yearInput');
const yearGo = document.getElementById('yearGo');
const yearToday = document.getElementById('yearToday');

function buildYearList(){
  yearList.innerHTML = '';
  for(let y = REAL_CURRENT_YEAR - 5; y <= REAL_CURRENT_YEAR + 5; y++){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = y;
    if(y === displayYear) btn.classList.add('selected');
    btn.addEventListener('click', () => setDisplayYear(y));
    yearList.appendChild(btn);
  }
}

function setDisplayYear(year){
  if(!year || isNaN(year)) return;
  displayYear = year;
  yearBtn.textContent = displayYear;
  yearDropdown.classList.remove('open');
  render();
}

yearBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  yearInput.value = displayYear;
  buildYearList();
  yearDropdown.classList.toggle('open');
});

yearDropdown.addEventListener('click', (e) => e.stopPropagation());

document.addEventListener('click', () => {
  yearDropdown.classList.remove('open');
});

yearGo.addEventListener('click', () => setDisplayYear(parseInt(yearInput.value, 10)));
yearInput.addEventListener('keydown', (e) => {
  if(e.key === 'Enter') setDisplayYear(parseInt(yearInput.value, 10));
});
yearToday.addEventListener('click', () => setDisplayYear(REAL_CURRENT_YEAR));

/* =========================================================
   Modal: edição de dia (status manual + comentário)
   ========================================================= */

const modalOverlay = document.getElementById('modalOverlay');
const modalDate = document.getElementById('modalDate');
const modalStatus = document.getElementById('modalStatus');
const modalComment = document.getElementById('modalComment');
const modalClose = document.getElementById('modalClose');
const modalSave = document.getElementById('modalSave');
const modalReset = document.getElementById('modalReset');

let currentKey = null;
let currentAutoType = null;

function openDayModal(date){
  const overrides = loadOverrides();
  currentKey = dateKey(date);
  currentAutoType = calculateScheduleDate(date, currentConfig);
  const existing = overrides[currentKey];

  const dd = String(date.getDate()).padStart(2, '0');
  modalDate.textContent = `${dd} de ${monthNames[date.getMonth()]}`;
  modalStatus.value = existing ? existing.status : currentAutoType;
  modalComment.value = existing ? (existing.comment || '') : '';

  modalOverlay.classList.add('open');
}

function closeDayModal(){
  modalOverlay.classList.remove('open');
  currentKey = null;
}

modalClose.addEventListener('click', closeDayModal);
modalOverlay.addEventListener('click', (e) => { if(e.target === modalOverlay) closeDayModal(); });

modalSave.addEventListener('click', () => {
  if(!currentKey) return;
  const overrides = loadOverrides();
  const status = modalStatus.value;
  const comment = modalComment.value.trim();

  if(status === currentAutoType && comment === ''){
    delete overrides[currentKey];
  }else{
    overrides[currentKey] = { status, comment };
  }
  saveOverrides(overrides);
  closeDayModal();
  render();
});

modalReset.addEventListener('click', () => {
  if(!currentKey) return;
  const overrides = loadOverrides();
  delete overrides[currentKey];
  saveOverrides(overrides);
  closeDayModal();
  render();
});

/* =========================================================
   Modal: Configurações
   ========================================================= */

const settingsOverlay = document.getElementById('settingsOverlay');
const settingsClose = document.getElementById('settingsClose');
const settingsCancel = document.getElementById('settingsCancel');
const settingsSave = document.getElementById('settingsSave');

const cfgNome = document.getElementById('cfgNome');
const cfgTipo = document.getElementById('cfgTipo');
const cfgCustomGroup = document.getElementById('cfgCustomGroup');
const cfgCustomWork = document.getElementById('cfgCustomWork');
const cfgCustomOff = document.getElementById('cfgCustomOff');
const cfgRefDate = document.getElementById('cfgRefDate');

function updateSettingsVisibility(){
  const tipo = cfgTipo.value;
  cfgCustomGroup.classList.toggle('show', tipo === 'personalizada');
}

function fillSettingsForm(config){
  cfgNome.value = config.nome || '';
  cfgTipo.value = config.tipo;
  cfgCustomWork.value = config.custom?.trabalho ?? 3;
  cfgCustomOff.value = config.custom?.folga ?? 2;
  cfgRefDate.value = config.referenceDate;
  const radio = document.querySelector(`input[name="cfgRefStatus"][value="${config.referenceStatus}"]`);
  if(radio) radio.checked = true;
  updateSettingsVisibility();
}

function openSettings(){
  fillSettingsForm(currentConfig);
  settingsOverlay.classList.add('open');
}

function closeSettings(){
  settingsOverlay.classList.remove('open');
}

cfgTipo.addEventListener('change', updateSettingsVisibility);
settingsClose.addEventListener('click', closeSettings);
settingsCancel.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', (e) => { if(e.target === settingsOverlay) closeSettings(); });

settingsSave.addEventListener('click', () => {
  const refStatusInput = document.querySelector('input[name="cfgRefStatus"]:checked');
  if(!cfgRefDate.value){
    showToast('Defina uma data de referência');
    return;
  }
  const newConfig = {
    nome: cfgNome.value.trim(),
    tipo: cfgTipo.value,
    referenceDate: cfgRefDate.value,
    referenceStatus: refStatusInput ? refStatusInput.value : 'folga',
    custom: {
      trabalho: Math.max(1, parseInt(cfgCustomWork.value, 10) || 1),
      folga: Math.max(1, parseInt(cfgCustomOff.value, 10) || 1)
    }
  };
  currentConfig = newConfig;
  saveConfig(currentConfig);
  updateHeader();
  closeSettings();
  render();
  showToast('Configurações salvas!');
});

/* =========================================================
   Compartilhar escala
   ========================================================= */

async function shareSchedule(){
  const url = buildShareURL(currentConfig);
  try{
    await navigator.clipboard.writeText(url);
    showToast('Link copiado!');
  }catch(e){
    window.prompt('Copie o link da sua escala:', url);
  }
}

/* =========================================================
   Conflito: config local existente vs link compartilhado
   ========================================================= */

const conflictOverlay = document.getElementById('conflictOverlay');
const conflictKeep = document.getElementById('conflictKeep');
const conflictLoad = document.getElementById('conflictLoad');

conflictKeep.addEventListener('click', () => {
  conflictOverlay.classList.remove('open');
  pendingSharedConfig = null;
  cleanURL();
});

conflictLoad.addEventListener('click', () => {
  if(pendingSharedConfig){
    currentConfig = pendingSharedConfig;
    saveConfig(currentConfig);
    updateHeader();
    render();
  }
  conflictOverlay.classList.remove('open');
  pendingSharedConfig = null;
  cleanURL();
  showToast('Escala carregada!');
});

/* =========================================================
   Sobre
   ========================================================= */

const aboutOverlay = document.getElementById('aboutOverlay');
const aboutClose = document.getElementById('aboutClose');
aboutClose.addEventListener('click', () => aboutOverlay.classList.remove('open'));
aboutOverlay.addEventListener('click', (e) => { if(e.target === aboutOverlay) aboutOverlay.classList.remove('open'); });

/* =========================================================
   Render do calendário
   ========================================================= */

function render(){
  container.innerHTML = '';
  const overrides = loadOverrides();

  for(let monthIdx = 0; monthIdx < 12; monthIdx++){
    const year = displayYear;
    const first = new Date(year, monthIdx, 1);
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const startWeekday = first.getDay();

    let folgaCount = 0, trabalhoCount = 0;
    const cells = [];

    for(let i = 0; i < startWeekday; i++){
      cells.push('<div class="day empty"></div>');
    }
    for(let d = 1; d <= daysInMonth; d++){
      const date = new Date(year, monthIdx, d);
      const key = dateKey(date);
      const autoType = calculateScheduleDate(date, currentConfig);
      const override = overrides[key];
      const type = override ? override.status : autoType;
      const comment = override ? (override.comment || '') : '';
      const isManual = !!override;

      const isToday = isSameDay(date, today);
      const isPast = date < today && !isToday;

      if(type === 'folga') folgaCount++;
      if(type === 'trabalho') trabalhoCount++;

      const cls = `${type}${isPast ? ' past' : ''}${isToday ? ' today' : ''}${isManual ? ' manual' : ''}`;
      const pin = comment ? '<span class="pin">📌</span>' : '';
      const title = comment ? ` title="${comment.replace(/"/g, '&quot;')}"` : '';
      cells.push(`<div class="day ${cls}" data-date="${key}"${title}>${d}${pin}</div>`);
    }

    const monthEl = document.createElement('div');
    monthEl.className = 'month';
    monthEl.innerHTML = `
      <div class="month-title">
        <span>${monthNames[monthIdx]} ${year}</span>
        <span class="month-count">${folgaCount} folgas · ${trabalhoCount} trab.</span>
      </div>
      <div class="weekdays">${weekdayLabels.map(w => `<div>${w}</div>`).join('')}</div>
      <div class="grid">${cells.join('')}</div>
    `;
    container.appendChild(monthEl);
  }

  container.querySelectorAll('.day:not(.empty)').forEach(el => {
    el.addEventListener('click', () => {
      const [y, m, d] = el.dataset.date.split('-').map(Number);
      openDayModal(new Date(y, m - 1, d));
    });
  });
}

/* =========================================================
   Inicialização
   ========================================================= */

function init(){
  const shared = parseSharedConfigFromURL();
  const localExists = hasStoredConfig();

  if(shared && localExists){
    pendingSharedConfig = shared;
    conflictOverlay.classList.add('open');
  }else if(shared && !localExists){
    currentConfig = shared;
    saveConfig(currentConfig);
    cleanURL();
  }

  updateHeader();
  render();

  const elementoHoje = document.querySelector('.day.today');
  if(elementoHoje){
    elementoHoje.scrollIntoView({ behavior: 'instant', block: 'center' });
  }
}

init();