const ANCHOR = new Date(2026, 7, 8); // 8 ago 2026 = folga
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const weekdayLabels = ["D","S","T","Q","Q","S","S"];
const STORAGE_KEY = 'escala-overrides-2026';

function dayType(date){
  const diff = Math.round((date - ANCHOR) / 86400000);
  const mod = ((diff % 2) + 2) % 2; // handles negative diffs correctly
  return mod === 0 ? 'folga' : 'trabalho';
}

function isSameDay(a,b){
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

function dateKey(date){
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,'0');
  const d = String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

function loadOverrides(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch(e){
    console.error('Erro ao ler overrides:', e);
    return {};
  }
}

function saveOverrides(overrides){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  }catch(e){
    console.error('Erro ao salvar overrides:', e);
  }
}

const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // "hoje" real, atualiza sozinho
const container = document.getElementById('calendar');

// ---- Modal ----
const modalOverlay = document.getElementById('modalOverlay');
const modalDate = document.getElementById('modalDate');
const modalStatus = document.getElementById('modalStatus');
const modalComment = document.getElementById('modalComment');
const modalClose = document.getElementById('modalClose');
const modalSave = document.getElementById('modalSave');
const modalReset = document.getElementById('modalReset');

let currentKey = null;
let currentAutoType = null;

function openModal(date){
  const overrides = loadOverrides();
  currentKey = dateKey(date);
  currentAutoType = dayType(date);
  const existing = overrides[currentKey];

  const dd = String(date.getDate()).padStart(2,'0');
  modalDate.textContent = `${dd} de ${monthNames[date.getMonth()]}`;
  modalStatus.value = existing ? existing.status : currentAutoType;
  modalComment.value = existing ? (existing.comment || '') : '';

  modalOverlay.classList.add('open');
}

function closeModal(){
  modalOverlay.classList.remove('open');
  currentKey = null;
}

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
  if(e.target === modalOverlay) closeModal();
});

modalSave.addEventListener('click', () => {
  if(!currentKey) return;
  const overrides = loadOverrides();
  const status = modalStatus.value;
  const comment = modalComment.value.trim();

  if(status === currentAutoType && comment === ''){
    // volta a ser igual ao automático e sem comentário: não precisa guardar nada
    delete overrides[currentKey];
  }else{
    overrides[currentKey] = { status, comment };
  }
  saveOverrides(overrides);
  closeModal();
  render();
});

modalReset.addEventListener('click', () => {
  if(!currentKey) return;
  const overrides = loadOverrides();
  delete overrides[currentKey];
  saveOverrides(overrides);
  closeModal();
  render();
});

// ---- Render do calendário ----
function render(){
  container.innerHTML = '';
  const overrides = loadOverrides();

  for(let monthIdx=0; monthIdx<12; monthIdx++){
    const year = 2026;
    const first = new Date(year, monthIdx, 1);
    const daysInMonth = new Date(year, monthIdx+1, 0).getDate();
    const startWeekday = first.getDay();

    let folgaCount = 0, trabalhoCount = 0;
    const cells = [];

    for(let i=0; i<startWeekday; i++){
      cells.push('<div class="day empty"></div>');
    }
    for(let d=1; d<=daysInMonth; d++){
      const date = new Date(year, monthIdx, d);
      const key = dateKey(date);
      const autoType = dayType(date);
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
      const title = comment ? ` title="${comment.replace(/"/g,'&quot;')}"` : '';
      cells.push(`<div class="day ${cls}" data-date="${key}"${title}>${d}${pin}</div>`);
    }

    const monthEl = document.createElement('div');
    monthEl.className = 'month';
    monthEl.innerHTML = `
      <div class="month-title">
        <span>${monthNames[monthIdx]} ${year}</span>
        <span class="month-count">${folgaCount} folgas · ${trabalhoCount} trab.</span>
      </div>
      <div class="weekdays">${weekdayLabels.map(w=>`<div>${w}</div>`).join('')}</div>
      <div class="grid">${cells.join('')}</div>
    `;
    container.appendChild(monthEl);
  }

  // clique nos dias (delegado no container, funciona pra todos os meses)
  container.querySelectorAll('.day:not(.empty)').forEach(el => {
    el.addEventListener('click', () => {
      const [y,m,d] = el.dataset.date.split('-').map(Number);
      openModal(new Date(y, m-1, d));
    });
  });
}

render();

const elementoHoje = document.querySelector('.day.today');
if (elementoHoje) {
  elementoHoje.scrollIntoView({
    behavior: 'instant',
    block: 'center'
  });
}