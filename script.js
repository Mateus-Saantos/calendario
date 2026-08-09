
const ANCHOR = new Date(2026, 7, 8); // 8 ago 2026 = folga
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const weekdayLabels = ["D","S","T","Q","Q","S","S"];

function dayType(date){
  const diff = Math.round((date - ANCHOR) / 86400000);
  const mod = ((diff % 2) + 2) % 2; // handles negative diffs correctly
  return mod === 0 ? 'folga' : 'trabalho';
}

function isSameDay(a,b){
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // "hoje" real, atualiza sozinho
const container = document.getElementById('calendar');

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
    const type = dayType(date);
    const isToday = isSameDay(date, today);
    const isPast = date < today && !isToday;
    if(type === 'folga') folgaCount++;
    if(type === 'trabalho') trabalhoCount++;
    const cls = `${type}${isPast ? ' past' : ''}${isToday ? ' today' : ''}`;
    cells.push(`<div class="day ${cls}">${d}</div>`);
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