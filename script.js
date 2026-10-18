const STORAGE_KEY = 'media-tracker-items-v1';
const categoryNames = { anime: 'Аниме', movie: 'Фильм', series: 'Сериал', cartoon: 'Мультфильм' };
const statusNames = { planned: 'В планах', watching: 'Смотрю', finished: 'Закончил' };
const demoItems = [
  { id: 'demo-1', title: 'Вайолет Эвергарден', category: 'anime', year: 2018, status: 'finished', rating: 9.2, poster: 'https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=600&q=80' },
  { id: 'demo-2', title: 'Интерстеллар', category: 'movie', year: 2014, status: 'finished', rating: 9.0, poster: 'https://images.unsplash.com/photo-1446776877081-d282a0f896e2?auto=format&fit=crop&w=600&q=80' },
  { id: 'demo-3', title: 'Аркейн', category: 'series', year: 2021, status: 'watching', rating: 9.4, poster: 'https://images.unsplash.com/photo-1519608487953-e999c86e7451?auto=format&fit=crop&w=600&q=80' },
  { id: 'demo-4', title: 'Душа', category: 'cartoon', year: 2020, status: 'planned', rating: 8.6, poster: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=600&q=80' },
  { id: 'demo-5', title: 'Дюна', category: 'movie', year: 2021, status: 'planned', rating: 8.3, poster: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=600&q=80' },
  { id: 'demo-6', title: 'Атака титанов', category: 'anime', year: 2013, status: 'watching', rating: 9.1, poster: 'https://images.unsplash.com/photo-1518568740560-333139a27e72?auto=format&fit=crop&w=600&q=80' }
];

const $ = (selector) => document.querySelector(selector);
let items = loadItems();
let activeCategory = 'all';
let activeStatus = 'all';
let activeNav = 'all';
let toastTimer;

function loadItems() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : demoItems;
  } catch { return demoItems; }
}
function saveItems() { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
function escapeHTML(value) { const el = document.createElement('div'); el.textContent = value; return el.innerHTML; }
function posterMarkup(item) {
  const initial = escapeHTML(item.title.charAt(0).toUpperCase());
  if (!item.poster) return `<div class="poster-fallback">${initial}</div>`;
  return `<img src="${escapeHTML(item.poster)}" alt="Постер: ${escapeHTML(item.title)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'poster-fallback',textContent:'${initial}'}))">`;
}
function filteredItems() {
  const query = $('#searchInput').value.trim().toLocaleLowerCase('ru');
  return items.filter((item) => {
    const categoryMatches = activeCategory === 'all' || item.category === activeCategory;
    const navMatches = activeNav === 'all' || item.status === activeNav;
    const statusMatches = activeStatus === 'all' || item.status === activeStatus;
    return categoryMatches && navMatches && statusMatches && item.title.toLocaleLowerCase('ru').includes(query);
  });
}
function render() {
  const list = filteredItems();
  $('#mediaGrid').innerHTML = list.map((item) => `<article class="media-card">
    <div class="poster">${posterMarkup(item)}<span class="badge">${statusNames[item.status]}</span></div>
    <div class="card-actions"><button class="card-action" data-edit="${item.id}" aria-label="Редактировать ${escapeHTML(item.title)}">✎</button><button class="card-action delete" data-delete="${item.id}" aria-label="Удалить ${escapeHTML(item.title)}">×</button></div>
    <div class="card-info"><h2 class="card-title" title="${escapeHTML(item.title)}">${escapeHTML(item.title)}</h2><div class="metadata"><span>${categoryNames[item.category]} · ${item.year}</span><span class="rating">★ ${Number(item.rating).toFixed(1)}</span></div></div>
  </article>`).join('');
  $('#emptyState').hidden = list.length !== 0;
  $('#totalCount').textContent = items.length;
  $('#finishedCount').textContent = items.filter((item) => item.status === 'finished').length;
  $('#sidebarCount').textContent = `${items.length} ${plural(items.length, 'запись', 'записи', 'записей')}`;
  $('#resultInfo').textContent = list.length ? `Найдено: ${list.length} ${plural(list.length, 'запись', 'записи', 'записей')}` : 'Измените условия поиска или добавьте запись';
}
function plural(number, one, few, many) { const n = Math.abs(number) % 100, last = n % 10; return n > 10 && n < 20 ? many : last > 1 && last < 5 ? few : last === 1 ? one : many; }
function showToast(message) { clearTimeout(toastTimer); const toast = $('#toast'); toast.textContent = message; toast.classList.add('visible'); toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600); }
function openForm(item) {
  const form = $('#mediaForm'); form.reset(); $('#mediaId').value = item?.id || '';
  $('#dialogTitle').textContent = item ? 'Редактировать запись' : 'Добавить запись';
  if (item) Object.entries(item).forEach(([key, value]) => { const input = $(`#${key}`); if (input) input.value = value; });
  $('#mediaDialog').showModal(); $('#title').focus();
}
function closeForm() { $('#mediaDialog').close(); }

$('#addButton').addEventListener('click', () => openForm());
$('#emptyAddButton').addEventListener('click', () => openForm());
$('#closeDialog').addEventListener('click', closeForm);
$('#cancelDialog').addEventListener('click', closeForm);
$('#searchInput').addEventListener('input', render);
$('#statusFilter').addEventListener('change', (event) => { activeStatus = event.target.value; render(); });
$('#categoryFilters').addEventListener('click', (event) => { const button = event.target.closest('[data-category]'); if (!button) return; activeCategory = button.dataset.category; document.querySelectorAll('[data-category]').forEach((chip) => chip.classList.toggle('active', chip === button)); render(); });
$('.main-nav').addEventListener('click', (event) => { const link = event.target.closest('[data-nav]'); if (!link) return; activeNav = link.dataset.nav; document.querySelectorAll('[data-nav]').forEach((nav) => nav.classList.toggle('active', nav === link)); $('#pageTitle').textContent = activeNav === 'all' ? 'Каталог' : statusNames[activeNav]; $('#menuButton').setAttribute('aria-expanded', 'false'); $('.sidebar').classList.remove('open'); render(); });
$('#mediaGrid').addEventListener('click', (event) => {
  const editId = event.target.closest('[data-edit]')?.dataset.edit; const deleteId = event.target.closest('[data-delete]')?.dataset.delete;
  if (editId) openForm(items.find((item) => item.id === editId));
  if (deleteId) { const item = items.find((entry) => entry.id === deleteId); if (item && confirm(`Удалить «${item.title}»?`)) { items = items.filter((entry) => entry.id !== deleteId); saveItems(); render(); showToast('Запись удалена'); } }
});
$('#mediaForm').addEventListener('submit', (event) => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
  const entry = { id: data.id || `item-${Date.now()}`, title: data.title.trim(), category: data.category, year: Number(data.year), status: data.status, rating: Number(data.rating), poster: data.poster.trim() };
  const index = items.findIndex((item) => item.id === entry.id); const editing = index !== -1;
  if (editing) items[index] = entry; else items.unshift(entry); saveItems(); closeForm(); render(); showToast(editing ? 'Изменения сохранены' : 'Запись добавлена');
});
$('#menuButton').addEventListener('click', () => { const sidebar = $('.sidebar'); sidebar.classList.toggle('open'); $('#menuButton').setAttribute('aria-expanded', String(sidebar.classList.contains('open'))); });
$('#mediaDialog').addEventListener('click', (event) => { if (event.target === $('#mediaDialog')) closeForm(); });
render();
