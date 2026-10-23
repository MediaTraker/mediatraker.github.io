import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { addDoc, collection, deleteDoc, doc, getDocs, getFirestore, onSnapshot, orderBy, query, updateDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';
import { TMDB_API_KEY } from './tmdb-config.js';

const STORAGE_KEY = 'media-tracker-items-v1';
const MIGRATION_KEY = 'media-tracker-firestore-migration-v1';
const categoryNames = { anime: 'Аниме', movie: 'Фильм', series: 'Сериал', cartoon: 'Мультфильм' };
const statusNames = { planned: 'В планах', watching: 'Смотрю', finished: 'Закончил' };
const $ = (selector) => document.querySelector(selector);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
let items = [], notesCollection = null, unsubscribeNotes = null, currentUser = null;
let activeCategory = 'all', activeStatus = 'all', activeNav = 'all', toastTimer;
let isLoading = false, databaseAvailable = false, migrationChecked = false, importingOldNotes = false, tmdbTimer = null, tmdbRequestId = 0;

function escapeHTML(value) { const el = document.createElement('div'); el.textContent = value ?? ''; return el.innerHTML; }
function plural(number, one, few, many) { const n = Math.abs(number) % 100, last = n % 10; return n > 10 && n < 20 ? many : last > 1 && last < 5 ? few : last === 1 ? one : many; }
function authError(error) {
  const code = error?.code || 'unknown-error';
  const details = code === 'auth/unauthorized-domain' ? 'Добавьте домен сайта в Firebase Authorized domains.' : code === 'auth/network-request-failed' ? 'Проверьте подключение к интернету.' : code.includes('permission-denied') ? 'Проверьте правила Firestore.' : 'Попробуйте ещё раз.';
  return `Ошибка (${code}): ${details}`;
}
function showAuthMessage(message = '') { $('#authMessage').textContent = message; }
function showToast(message) { clearTimeout(toastTimer); const toast = $('#toast'); toast.textContent = message; toast.classList.add('visible'); toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600); }
function showDatabaseError(error, fallback = 'Операция с каталогом не выполнена.') { databaseAvailable = false; isLoading = false; const message = typeof error === 'string' ? error : `${fallback} ${authError(error)}`; console.error('Firestore operation failed:', error); $('#databaseMessage').textContent = message; $('#databaseMessage').hidden = false; render(); }
function requireDatabase() { if (databaseAvailable && notesCollection) return true; showToast('Каталог сейчас недоступен'); return false; }
function readLegacyItems() { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); return Array.isArray(saved) ? saved : []; } catch { return []; } }
function posterMarkup(item) { const initial = escapeHTML(String(item.title || '').charAt(0).toUpperCase() || 'M'); return item.poster ? `<img src="${escapeHTML(item.poster)}" alt="Постер: ${escapeHTML(item.title)}">` : `<div class="poster-fallback">${initial}</div>`; }
function genreChips(item) { return Array.isArray(item.genres) ? item.genres.map((genre) => `<span class="genre-chip">${escapeHTML(genre)}</span>`).join('') : ''; }
function tmdbType(item) { return item.type === 'series' ? 'series' : item.type === 'movie' ? 'movie' : ''; }
function oldDataButton(item) { return item.poster && (item.tmdbId || item.type || item.genres?.length) ? '' : `<button class="card-fetch" data-fetch="${escapeHTML(item.id)}">Загрузить данные</button>`; }
function filteredItems() { const queryText = $('#searchInput').value.trim().toLocaleLowerCase('ru'); return items.filter((item) => (activeCategory === 'all' || item.category === activeCategory) && (activeNav === 'all' || item.status === activeNav) && (activeStatus === 'all' || item.status === activeStatus) && String(item.title).toLocaleLowerCase('ru').includes(queryText)); }
function render() {
  const list = filteredItems();
  $('#loadingState').hidden = !isLoading; $('#mediaGrid').hidden = isLoading;
  $('#mediaGrid').innerHTML = list.map((item) => `<article class="media-card"><div class="poster">${posterMarkup(item)}<span class="badge">${statusNames[item.status] || 'Без статуса'}</span></div><div class="card-actions"><button class="card-action" data-edit="${escapeHTML(item.id)}" aria-label="Редактировать ${escapeHTML(item.title)}">✎</button><button class="card-action delete" data-delete="${escapeHTML(item.id)}" aria-label="Удалить ${escapeHTML(item.title)}">×</button></div><div class="card-info"><h2 class="card-title" title="${escapeHTML(item.title)}">${escapeHTML(item.title)}</h2><div class="metadata"><span>${categoryNames[item.category] || 'Другое'} · ${item.year}</span><span class="rating">${item.rating ? `★ ${Number(item.rating).toFixed(1)}` : '—'}</span></div><div class="genres">${genreChips(item)}</div>${oldDataButton(item)}</div></article>`).join('');
  $('#emptyState').hidden = isLoading || list.length !== 0; $('#totalCount').textContent = items.length; $('#finishedCount').textContent = items.filter((item) => item.status === 'finished').length; $('#sidebarCount').textContent = `${items.length} ${plural(items.length, 'запись', 'записи', 'записей')}`; $('#resultInfo').textContent = isLoading ? 'Загружаем ваш каталог…' : list.length ? `Найдено: ${list.length} ${plural(list.length, 'запись', 'записи', 'записей')}` : 'Измените условия поиска или добавьте запись';
}
function openForm(item) { if (!requireDatabase()) return; const form = $('#mediaForm'); form.reset(); $('#mediaId').value = item?.id || ''; $('#dialogTitle').textContent = item ? 'Редактировать запись' : 'Добавить запись'; if (item) Object.entries(item).forEach(([key, value]) => { const input = $(`#${key}`); if (input) input.value = Array.isArray(value) ? value.join(', ') : value; }); $('#mediaDialog').showModal(); $('#title').focus(); }
function closeForm() { $('#mediaDialog').close(); }
function noteData(data) { const type = data.type || (data.category === 'series' ? 'series' : data.category === 'movie' ? 'movie' : ''); return { title: data.title.trim(), category: data.category, type, year: Number(data.year), status: data.status, rating: Number(data.rating), poster: data.poster.trim(), genres: data.genres.split(',').map((genre) => genre.trim()).filter(Boolean), tmdbId: data.tmdbId ? Number(data.tmdbId) : null }; }
function clearTmdbResults() { $('#tmdbResults').hidden = true; $('#tmdbResults').innerHTML = ''; }
function tmdbYear(result) { return (result.release_date || result.first_air_date || '').slice(0, 4); }
function tmdbLabel(result) { return result.media_type === 'movie' ? 'movie' : 'series'; }
function renderTmdbResults(results) {
  $('#tmdbResults').innerHTML = results.length ? results.map((result) => `<button type="button" class="tmdb-result" data-tmdb-id="${result.id}" data-tmdb-type="${result.media_type}"><img src="${result.poster_path ? `https://image.tmdb.org/t/p/w92${result.poster_path}` : ''}" alt=""><span><strong>${escapeHTML(result.title || result.name || 'Без названия')}</strong><small>${tmdbYear(result) || 'Год неизвестен'} · ${tmdbLabel(result)}</small></span></button>`).join('') : '<p class="tmdb-state">Ничего не найдено.</p>';
  $('#tmdbResults').hidden = false;
}
async function tmdbFetch(path, params = {}) { const url = new URL(`https://api.themoviedb.org/3${path}`); url.search = new URLSearchParams({ api_key: TMDB_API_KEY, language: 'ru-RU', ...params }); const response = await fetch(url); if (!response.ok) throw new Error(`TMDB ${response.status}`); return response.json(); }
async function searchTmdb(title) {
  const requestId = ++tmdbRequestId; if (title.length < 2) { clearTmdbResults(); return; }
  $('#tmdbResults').hidden = false; $('#tmdbResults').innerHTML = '<p class="tmdb-state">Ищем…</p>';
  try { const data = await tmdbFetch('/search/multi', { query: title }); if (requestId !== tmdbRequestId) return; renderTmdbResults((data.results || []).filter((result) => result.media_type === 'movie' || result.media_type === 'tv').slice(0, 6)); } catch (error) { if (requestId === tmdbRequestId) { console.error('TMDB search failed:', error); $('#tmdbResults').innerHTML = '<p class="tmdb-state">Поиск временно недоступен.</p>'; } }
}
async function fillFromTmdb(id, type, targetId = null) {
  const results = $('#tmdbResults'); results.hidden = false; results.innerHTML = '<p class="tmdb-state">Загружаем данные…</p>';
  try {
    const detail = await tmdbFetch(`/${type}/${id}`); const genres = (detail.genres || []).map((genre) => genre.name); const data = { title: detail.title || detail.name || '', category: type === 'tv' ? 'series' : 'movie', type: type === 'tv' ? 'series' : 'movie', year: (detail.release_date || detail.first_air_date || '').slice(0, 4), rating: Number(detail.vote_average || 0).toFixed(1), poster: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : '', genres, tmdbId: detail.id };
    if (targetId) { await updateDoc(doc(notesCollection, targetId), data); showToast('Данные TMDB обновлены'); } else { $('#title').value = data.title; $('#year').value = data.year; $('#category').value = data.category; $('#type').value = data.type; $('#rating').value = data.rating; $('#poster').value = data.poster; $('#genres').value = data.genres.join(', '); $('#tmdbId').value = data.tmdbId; clearTmdbResults(); }
  } catch (error) { console.error('TMDB details failed:', error); results.innerHTML = '<p class="tmdb-state">Не удалось загрузить данные. Можно заполнить поля вручную.</p>'; }
}
function updateProfile(user) { $('#userName').textContent = user.displayName || user.email || 'Пользователь'; $('#userAvatar').hidden = !user.photoURL; $('#userAvatar').src = user.photoURL || ''; }
function setSignedInView(user) { $('#authScreen').hidden = true; $('#appShell').hidden = false; updateProfile(user); window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }
function setSignedOutView() { $('#appShell').hidden = true; $('#authScreen').hidden = false; $('#loadingState').hidden = true; }
function subscribeToNotes(user) {
  if (unsubscribeNotes) unsubscribeNotes();
  notesCollection = collection(db, 'users', user.uid, 'notes'); isLoading = true; databaseAvailable = true; $('#databaseMessage').hidden = true; render();
  unsubscribeNotes = onSnapshot(query(notesCollection, orderBy('createdAt')), (snapshot) => { items = snapshot.docs.map((note) => ({ id: note.id, ...note.data() })); isLoading = false; databaseAvailable = true; render(); if (!importingOldNotes) $('#importPanel').hidden = !snapshot.empty; migrateLegacyItems(); }, (error) => showDatabaseError(error, 'Не удалось загрузить каталог.'));
}
async function migrateLegacyItems() {
  if (migrationChecked || localStorage.getItem(MIGRATION_KEY)) return;
  migrationChecked = true; const legacyItems = readLegacyItems();
  if (!legacyItems.length) { localStorage.setItem(MIGRATION_KEY, 'none'); return; }
  if (!confirm(`Найдены ${legacyItems.length} старых локальных записей. Загрузить их в ваш каталог?`)) { localStorage.setItem(MIGRATION_KEY, 'declined'); return; }
  try { await Promise.all(legacyItems.map((item) => addDoc(notesCollection, { title: String(item.title || '').trim(), category: item.category || 'movie', year: Number(item.year) || new Date().getFullYear(), status: item.status || 'planned', rating: Number(item.rating) || 1, poster: String(item.poster || '').trim(), createdAt: Date.now() }))); localStorage.removeItem(STORAGE_KEY); localStorage.setItem(MIGRATION_KEY, 'complete'); showToast('Локальные записи перенесены'); } catch (error) { showDatabaseError(error, 'Не удалось перенести локальные записи.'); }
}
async function importTopLevelNotes() {
  if (!requireDatabase()) return;
  const button = $('#importButton'); importingOldNotes = true; button.disabled = true; $('#importMessage').textContent = 'Читаем старые записи…';
  try {
    const oldNotes = await getDocs(collection(db, 'notes'));
    const documents = oldNotes.docs;
    if (!documents.length) { $('#importMessage').textContent = 'В старом каталоге записей не найдено.'; return; }
    for (let start = 0; start < documents.length; start += 500) {
      const batch = writeBatch(db); const portion = documents.slice(start, start + 500);
      portion.forEach((oldNote) => batch.set(doc(notesCollection), oldNote.data()));
      $('#importMessage').textContent = `Импортируем: ${Math.min(start + portion.length, documents.length)} из ${documents.length}…`;
      await batch.commit();
    }
    $('#importMessage').textContent = `Импортировано записей: ${documents.length}.`; showToast('Импорт завершён');
  } catch (error) { console.error('Legacy import failed:', error); $('#importMessage').textContent = authError(error); } finally { importingOldNotes = false; button.disabled = false; }
}
function signIn() {
  showAuthMessage(''); $('#signInButton').disabled = true;
  const popupRequest = signInWithPopup(auth, provider);
  popupRequest.catch((error) => { const hint = ' Откройте сайт в Chrome или Safari, не внутри приложения-мессенджера.'; showAuthMessage(`${authError(error)}${hint}`); console.error('Google sign-in failed:', error); }).finally(() => { $('#signInButton').disabled = false; });
}

$('#signInButton').addEventListener('click', signIn);
$('#signOutButton').addEventListener('click', async () => { try { await signOut(auth); } catch (error) { showAuthMessage(authError(error)); console.error('Sign-out failed:', error); } });
$('#importButton').addEventListener('click', importTopLevelNotes);
$('#addButton').addEventListener('click', () => openForm()); $('#emptyAddButton').addEventListener('click', () => openForm()); $('#closeDialog').addEventListener('click', closeForm); $('#cancelDialog').addEventListener('click', closeForm); $('#searchInput').addEventListener('input', render);
$('#title').addEventListener('input', (event) => { clearTimeout(tmdbTimer); tmdbTimer = setTimeout(() => searchTmdb(event.target.value.trim()), 400); });
$('#tmdbResults').addEventListener('click', (event) => { const result = event.target.closest('[data-tmdb-id]'); if (!result) return; fillFromTmdb(result.dataset.tmdbId, result.dataset.tmdbType); });
$('#statusFilter').addEventListener('change', (event) => { activeStatus = event.target.value; render(); });
$('#categoryFilters').addEventListener('click', (event) => { const button = event.target.closest('[data-category]'); if (!button) return; activeCategory = button.dataset.category; document.querySelectorAll('[data-category]').forEach((chip) => chip.classList.toggle('active', chip === button)); render(); });
$('.main-nav').addEventListener('click', (event) => { const link = event.target.closest('[data-nav]'); if (!link) return; activeNav = link.dataset.nav; document.querySelectorAll('[data-nav]').forEach((nav) => nav.classList.toggle('active', nav === link)); $('#pageTitle').textContent = activeNav === 'all' ? 'Каталог' : statusNames[activeNav]; $('.sidebar').classList.remove('open'); render(); });
$('#mediaGrid').addEventListener('click', async (event) => { const fetchId = event.target.closest('[data-fetch]')?.dataset.fetch, editId = event.target.closest('[data-edit]')?.dataset.edit, deleteId = event.target.closest('[data-delete]')?.dataset.delete; if (fetchId) { const item = items.find((entry) => entry.id === fetchId); if (item) { openForm(item); searchTmdb(item.title); } return; } if (editId) openForm(items.find((item) => item.id === editId)); if (deleteId && requireDatabase()) { const item = items.find((entry) => entry.id === deleteId); if (!item || !confirm(`Удалить «${item.title}»?`)) return; try { await deleteDoc(doc(notesCollection, deleteId)); showToast('Запись удалена'); } catch (error) { showDatabaseError(error, 'Не удалось удалить запись.'); } } });
$('#mediaForm').addEventListener('submit', async (event) => { event.preventDefault(); if (!requireDatabase()) return; const formData = Object.fromEntries(new FormData(event.currentTarget)), data = noteData(formData); try { if (formData.id) { await updateDoc(doc(notesCollection, formData.id), data); showToast('Изменения сохранены'); } else { await addDoc(notesCollection, { ...data, createdAt: Date.now() }); showToast('Запись добавлена'); } closeForm(); } catch (error) { showDatabaseError(error, 'Не удалось сохранить запись.'); } });
$('#menuButton').addEventListener('click', () => { const sidebar = $('.sidebar'); sidebar.classList.toggle('open'); $('#menuButton').setAttribute('aria-expanded', String(sidebar.classList.contains('open'))); });
$('#mediaDialog').addEventListener('click', (event) => { if (event.target === $('#mediaDialog')) closeForm(); });

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (!user) { if (unsubscribeNotes) unsubscribeNotes(); unsubscribeNotes = null; notesCollection = null; items = []; isLoading = false; databaseAvailable = false; $('#importPanel').hidden = true; render(); setSignedOutView(); return; }
  setSignedInView(user); subscribeToNotes(user);
});
