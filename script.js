import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { addDoc, collection, deleteDoc, doc, getFirestore, onSnapshot, orderBy, query, updateDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const STORAGE_KEY = 'media-tracker-items-v1';
const MIGRATION_KEY = 'media-tracker-firestore-migration-v1';
const categoryNames = { anime: 'Аниме', movie: 'Фильм', series: 'Сериал', cartoon: 'Мультфильм' };
const statusNames = { planned: 'В планах', watching: 'Смотрю', finished: 'Закончил' };
const $ = (selector) => document.querySelector(selector);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const notesCollection = collection(db, 'notes');
let items = [];
let activeCategory = 'all';
let activeStatus = 'all';
let activeNav = 'all';
let toastTimer;
let isLoading = true;
let databaseAvailable = true;
let migrationChecked = false;

function readLegacyItems() {
  try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); return Array.isArray(saved) ? saved : []; } catch { return []; }
}
function escapeHTML(value) { const el = document.createElement('div'); el.textContent = value ?? ''; return el.innerHTML; }
function posterMarkup(item) {
  const initial = escapeHTML(String(item.title || '').charAt(0).toUpperCase() || 'M');
  return item.poster ? `<img src="${escapeHTML(item.poster)}" alt="Постер: ${escapeHTML(item.title)}">` : `<div class="poster-fallback">${initial}</div>`;
}
function filteredItems() {
  const queryText = $('#searchInput').value.trim().toLocaleLowerCase('ru');
  return items.filter((item) => (activeCategory === 'all' || item.category === activeCategory)
    && (activeNav === 'all' || item.status === activeNav)
    && (activeStatus === 'all' || item.status === activeStatus)
    && String(item.title).toLocaleLowerCase('ru').includes(queryText));
}
function plural(number, one, few, many) { const n = Math.abs(number) % 100; const last = n % 10; return n > 10 && n < 20 ? many : last > 1 && last < 5 ? few : last === 1 ? one : many; }
function render() {
  const list = filteredItems();
  $('#loadingState').hidden = !isLoading;
  $('#mediaGrid').hidden = isLoading;
  $('#mediaGrid').innerHTML = list.map((item) => `<article class="media-card">
    <div class="poster">${posterMarkup(item)}<span class="badge">${statusNames[item.status] || 'Без статуса'}</span></div>
    <div class="card-actions"><button class="card-action" data-edit="${escapeHTML(item.id)}" aria-label="Редактировать ${escapeHTML(item.title)}">✎</button><button class="card-action delete" data-delete="${escapeHTML(item.id)}" aria-label="Удалить ${escapeHTML(item.title)}">×</button></div>
    <div class="card-info"><h2 class="card-title" title="${escapeHTML(item.title)}">${escapeHTML(item.title)}</h2><div class="metadata"><span>${categoryNames[item.category] || 'Другое'} · ${item.year}</span><span class="rating">★ ${Number(item.rating).toFixed(1)}</span></div></div>
  </article>`).join('');
  $('#emptyState').hidden = isLoading || list.length !== 0;
  $('#totalCount').textContent = items.length;
  $('#finishedCount').textContent = items.filter((item) => item.status === 'finished').length;
  $('#sidebarCount').textContent = `${items.length} ${plural(items.length, 'запись', 'записи', 'записей')}`;
  $('#resultInfo').textContent = isLoading ? 'Подключаемся к базе данных…' : list.length ? `Найдено: ${list.length} ${plural(list.length, 'запись', 'записи', 'записей')}` : 'Измените условия поиска или добавьте запись';
}
function showToast(message) { clearTimeout(toastTimer); const toast = $('#toast'); toast.textContent = message; toast.classList.add('visible'); toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600); }
function showDatabaseError(message = 'База данных недоступна. Проверьте подключение к интернету и настройки Firestore.') {
  databaseAvailable = false; isLoading = false; const box = $('#databaseMessage'); box.textContent = message; box.hidden = false; render();
}
function requireDatabase() { if (databaseAvailable) return true; showToast('Невозможно сохранить изменения: база данных недоступна'); return false; }
function openForm(item) {
  if (!requireDatabase()) return;
  const form = $('#mediaForm'); form.reset(); $('#mediaId').value = item?.id || '';
  $('#dialogTitle').textContent = item ? 'Редактировать запись' : 'Добавить запись';
  if (item) Object.entries(item).forEach(([key, value]) => { const input = $(`#${key}`); if (input) input.value = value; });
  $('#mediaDialog').showModal(); $('#title').focus();
}
function closeForm() { $('#mediaDialog').close(); }
function noteData(data) { return { title: data.title.trim(), category: data.category, year: Number(data.year), status: data.status, rating: Number(data.rating), poster: data.poster.trim() }; }
async function migrateLegacyItems() {
  if (migrationChecked || localStorage.getItem(MIGRATION_KEY)) return;
  migrationChecked = true;
  const legacyItems = readLegacyItems();
  if (!legacyItems.length) { localStorage.setItem(MIGRATION_KEY, 'none'); return; }
  if (!confirm(`Найдены ${legacyItems.length} старых записей на этом устройстве. Загрузить их в общий облачный каталог?`)) { localStorage.setItem(MIGRATION_KEY, 'declined'); return; }
  try {
    await Promise.all(legacyItems.map((item) => addDoc(notesCollection, {
      title: String(item.title || '').trim(), category: item.category || 'movie', year: Number(item.year) || new Date().getFullYear(), status: item.status || 'planned', rating: Number(item.rating) || 1, poster: String(item.poster || '').trim(), createdAt: Date.now()
    })));
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(MIGRATION_KEY, 'complete');
    showToast('Старые записи перенесены в облако');
  } catch (error) { console.error('Migration failed:', error); showDatabaseError('Не удалось перенести старые записи. Они остались сохранены на этом устройстве.'); }
}

$('#addButton').addEventListener('click', () => openForm());
$('#emptyAddButton').addEventListener('click', () => openForm());
$('#closeDialog').addEventListener('click', closeForm);
$('#cancelDialog').addEventListener('click', closeForm);
$('#searchInput').addEventListener('input', render);
$('#statusFilter').addEventListener('change', (event) => { activeStatus = event.target.value; render(); });
$('#categoryFilters').addEventListener('click', (event) => { const button = event.target.closest('[data-category]'); if (!button) return; activeCategory = button.dataset.category; document.querySelectorAll('[data-category]').forEach((chip) => chip.classList.toggle('active', chip === button)); render(); });
$('.main-nav').addEventListener('click', (event) => { const link = event.target.closest('[data-nav]'); if (!link) return; activeNav = link.dataset.nav; document.querySelectorAll('[data-nav]').forEach((nav) => nav.classList.toggle('active', nav === link)); $('#pageTitle').textContent = activeNav === 'all' ? 'Каталог' : statusNames[activeNav]; $('#menuButton').setAttribute('aria-expanded', 'false'); $('.sidebar').classList.remove('open'); render(); });
$('#mediaGrid').addEventListener('click', async (event) => {
  const editId = event.target.closest('[data-edit]')?.dataset.edit;
  const deleteId = event.target.closest('[data-delete]')?.dataset.delete;
  if (editId) openForm(items.find((item) => item.id === editId));
  if (deleteId && requireDatabase()) {
    const item = items.find((entry) => entry.id === deleteId);
    if (!item || !confirm(`Удалить «${item.title}»?`)) return;
    try { await deleteDoc(doc(db, 'notes', deleteId)); showToast('Запись удалена'); } catch (error) { console.error('Delete failed:', error); showDatabaseError(); }
  }
});
$('#mediaForm').addEventListener('submit', async (event) => {
  event.preventDefault(); if (!requireDatabase()) return;
  const formData = Object.fromEntries(new FormData(event.currentTarget)); const data = noteData(formData);
  try {
    if (formData.id) { await updateDoc(doc(db, 'notes', formData.id), data); showToast('Изменения сохранены'); }
    else { await addDoc(notesCollection, { ...data, createdAt: Date.now() }); showToast('Запись добавлена'); }
    closeForm();
  } catch (error) { console.error('Save failed:', error); showDatabaseError('Не удалось сохранить запись. Проверьте правила и подключение к Firestore.'); }
});
$('#menuButton').addEventListener('click', () => { const sidebar = $('.sidebar'); sidebar.classList.toggle('open'); $('#menuButton').setAttribute('aria-expanded', String(sidebar.classList.contains('open'))); });
$('#mediaDialog').addEventListener('click', (event) => { if (event.target === $('#mediaDialog')) closeForm(); });

onSnapshot(query(notesCollection, orderBy('createdAt')), (snapshot) => {
  items = snapshot.docs.map((note) => ({ id: note.id, ...note.data() }));
  isLoading = false; databaseAvailable = true; $('#databaseMessage').hidden = true; render(); migrateLegacyItems();
}, (error) => { console.error('Firestore subscription failed:', error); showDatabaseError('Не удалось загрузить каталог. Убедитесь, что Firestore включён, а правила доступа опубликованы.'); });

render();
