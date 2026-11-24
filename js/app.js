/* 鳥類カウント：入力、一覧、集計、設定の処理。
 * 色や余白を変更する場合は css/style.css を編集してください。
 * 保存キー KEY/SETTINGS_KEY/NEXT_ID_KEY を不用意に変更すると過去の記録が見えなくなります。
 */

'use strict';
const DEFAULT_SPECIES = [
  'ドバト',
  'ハシボソガラス',
  'ハシブトガラス',
  'ハシブトガラ',
  'ヤマガラ',
  'ヒガラ',
  'シジュウカラ',
  'ヒヨドリ',
  'ムクドリ',
  'スズメ'];
const DEFAULT_CHOICES = {
  sex: ['U', 'M', 'F'],
  age: ['U', 'A', 'J'],
  method: ['V', 'S', 'SV', 'C', 'NFC', '死体'],
  behavior: ['採餌', '飛翔', '休息', '渡り・移動', '抱卵', '羽繕い', '水浴び'],
  posture: ['U', 'Tucked', 'Untucked', 'Standing on one leg', 'Sitting']
};
const KEY = 'bird-counter-records-v1';
const SETTINGS_KEY = 'bird-counter-settings-v1';
const NEXT_ID_KEY = 'bird-counter-next-id-v1';
const CUSTOM_KEY = 'bird-counter-custom-fields-v1';
let CUSTOM_FIELDS = [];
try { const v = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); if (Array.isArray(v)) CUSTOM_FIELDS = v.filter(f => f && typeof f.id === 'string' && typeof f.name === 'string' && ['single', 'multi', 'number', 'text'].includes(f.type) && Array.isArray(f.options)); } catch (e) { console.warn('追加項目を読み込めません', e) }
function saveCustomFields(next) { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(next)); CUSTOM_FIELDS = next; return true } catch (e) { alert('追加項目を保存できませんでした'); return false } }
function newFieldId() { return 'field_' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + Math.random().toString(36).slice(2)) }
function fieldValue(r, f) { const v = r.customFields?.[f.id]; return Array.isArray(v) ? v.join('、') : v ?? '' }

const LEGACY = [['flock', '群れ', 'number', 'flockSize', ''], ['sex', '性別', 'single', 'sex', ''], ['age', '年齢', 'single', 'age', ''], ['method', '確認方法', 'multi', 'methods', ''], ['behavior', '行動', 'multi', 'behavior', ''], ['posture', '姿勢', 'single', 'posture', ''], ['distance', '距離', 'number', 'distanceM', 'm'], ['memo', 'メモ', 'text', 'freeMemo', '']];
const EXTRA = [{ id: 'plumage', name: '羽衣', type: 'single', unit: '', options: ['幼綿羽', '幼羽', '幼羽→1W', '夏羽', '夏羽→冬羽', '冬羽', '冬羽→夏羽'], hidden: false }, { id: 'direction', name: '方角', type: 'single', unit: '', options: ['北', '北東', '東', '南東', '南', '南西', '西', '北西'], hidden: false }];
let fieldOrder = [], unified = false;
let SPECIES = [...DEFAULT_SPECIES]; let CHOICES = structuredClone(DEFAULT_CHOICES);
try { const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); unified = saved?.unifiedFields === true; if (Array.isArray(saved?.fieldOrder)) fieldOrder = saved.fieldOrder; if (Array.isArray(saved?.species)) SPECIES = [...saved.species]; for (const k of Object.keys(CHOICES)) if (Array.isArray(saved?.choices?.[k])) CHOICES[k] = [...saved.choices[k]]; } catch (e) { console.warn(e) }
function persistSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ species: SPECIES, choices: CHOICES, fieldOrder, unifiedFields: unified })); return true } catch (e) { alert('設定を保存できませんでした'); return false } }
function orderedFields() { const ids = [...new Set([...fieldOrder, ...CUSTOM_FIELDS.map(f => f.id)])]; return ids.map(id => CUSTOM_FIELDS.find(f => f.id === id)).filter(Boolean).map(f => ({ id: f.id, label: f.name, csv: f.name + (f.unit ? ' (' + f.unit + ')' : ''), custom: f })) }
function orderedValue(r, f, csv = false) { const v = r.customFields?.[f.id]; return Array.isArray(v) ? v.join(csv ? ';' : '、') : v ?? '' }
const $ = id => document.getElementById(id);
let records = []; try { const stored = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(stored)) records = stored; } catch (e) { console.warn('保存済みデータを読み込めませんでした', e) }
// v1.1: Assign stable sequential IDs to legacy UUID records without dropping any data.
// Keep the previous identifier in legacyId for traceability; do not reuse deleted IDs.
let nextId = 1;
let migrationReady = true;
try {
  const raw = Number(localStorage.getItem(NEXT_ID_KEY));
  const used = new Set();
  for (const r of records) { if (Number.isSafeInteger(r.id) && r.id > 0) used.add(r.id) }
  const maxExisting = used.size ? Math.max(...used) : 0;
  nextId = Math.max(Number.isSafeInteger(raw) && raw > 0 ? raw : 1, maxExisting + 1);
  let changed = false;
  for (const r of records) {
    if (Number.isSafeInteger(r.id) && r.id > 0) continue;
    const old = r.id;
    while (used.has(nextId)) nextId++;
    r.legacyId = old;
    r.id = nextId++;
    used.add(r.id); changed = true;
  }
  if (changed) {
    // Preserve original data in a separate backup key before migrating.
    const backupKey = 'bird-counter-pre-v1.1-backup';
    if (localStorage.getItem(backupKey) === null) localStorage.setItem(backupKey, localStorage.getItem(KEY) || '[]');
    localStorage.setItem(KEY, JSON.stringify(records));
  }
  localStorage.setItem(NEXT_ID_KEY, String(nextId));
} catch (e) { migrationReady = false; console.error('ID移行に失敗しました。保存を停止します。', e) }
// Migrate legacy optional fields once; rollback all keys if storage fails.
if (!unified && migrationReady) {
  const keys = [KEY, CUSTOM_KEY, SETTINGS_KEY]; let previous;
  try {
    previous = keys.map(k => localStorage.getItem(k));
    const defaults = LEGACY.map(([id, name, type, prop, unit]) => ({ id, name, type, unit, options: CHOICES[id] || [], hidden: false }));
    defaults.splice(6, 0, ...EXTRA.filter(f => !CUSTOM_FIELDS.some(x => x.name === f.name)));
    const nextFields = [...defaults, ...CUSTOM_FIELDS];
    const nextRecords = records.map(r => { const next = { ...r, customFields: { ...r.customFields } }; for (const [id, , , prop] of LEGACY) { if (r[prop] != null && !Object.hasOwn(next.customFields, id)) next.customFields[id] = r[prop]; delete next[prop] } return next });
    fieldOrder = [...new Set([...fieldOrder, ...nextFields.map(f => f.id)])];
    // Insert new defaults before distance for existing default ordering, without moving existing fields.
    for (const f of EXTRA) { if (nextFields.some(x => x.id === f.id)) { fieldOrder = fieldOrder.filter(x => x !== f.id); const i = fieldOrder.indexOf('distance'); fieldOrder.splice(i < 0 ? fieldOrder.length : i, 0, f.id) } }
    localStorage.setItem(KEY, JSON.stringify(nextRecords)); localStorage.setItem(CUSTOM_KEY, JSON.stringify(nextFields)); unified = true;
    if (!persistSettings()) throw Error('settings'); records = nextRecords; CUSTOM_FIELDS = nextFields;
  } catch (e) { if (previous) keys.forEach((k, i) => { try { previous[i] === null ? localStorage.removeItem(k) : localStorage.setItem(k, previous[i]) } catch { } }); migrationReady = false; alert('記録項目の移行に失敗しました。保存を停止します。') }
}
let chosen = '', answers = {}, editingId = null; let latestLocation = null; let rangeStart = null, rangeEnd = null, rangeMode = '';
function show(page) { for (const id of ['home', 'entry', 'records', 'settings']) $(id).classList.toggle('hidden', id !== page); $('navHome').classList.toggle('active', page === 'home' || page === 'entry'); $('navRecords').classList.toggle('active', page === 'records'); $('navSettings').classList.toggle('active', page === 'settings'); render(); if (page === 'settings') renderSettings(); window.scrollTo(0, 0) }
function openEntry(name) { editingId = null; $('deleteBtn').classList.add('hidden'); $('saveBtn').textContent = '記録する'; chosen = name; answers = { sex: '', age: '', method: [], behavior: [], posture: '', customFields: {} }; $('entryTitle').textContent = name === 'その他' ? 'その他の種' : name; $('customWrap').classList.toggle('hidden', name !== 'その他'); for (const id of ['customSpecies']) $(id).value = ''; $('count').value = '1'; $('error').textContent = ''; renderCustomEntry(); show('entry'); }
function renderCustomEntry() {
  const root = $('orderedFields'); root.querySelectorAll('[data-custom-field]').forEach(el => el.remove());
  for (const f of CUSTOM_FIELDS) {
    if (f.hidden) continue;
    const wrap = document.createElement('div'), label = document.createElement('label'); label.textContent = f.name + (f.unit ? ' (' + f.unit + ')' : ''); wrap.dataset.field = f.id; wrap.dataset.customField = "true"; wrap.append(label);
    const value = answers.customFields?.[f.id] ?? (f.type === 'multi' ? [] : '');
    if (f.type === 'single' || f.type === 'multi') {
      const chips = document.createElement('div'); chips.className = 'chips';
      for (const option of f.options) {
        const active = f.type === 'multi' ? Array.isArray(value) && value.includes(option) : value === option;
        const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (active ? ' active' : ''); b.textContent = option;
        b.onclick = () => { if (f.type === 'multi') { const cur = Array.isArray(answers.customFields[f.id]) ? answers.customFields[f.id] : []; answers.customFields[f.id] = cur.includes(option) ? cur.filter(x => x !== option) : [...cur, option] } else answers.customFields[f.id] = active ? '' : option; renderCustomEntry() }; chips.append(b)
      } wrap.append(chips);
    } else { const input = document.createElement(f.type === 'text' ? 'textarea' : 'input'); if (f.type === 'number') { input.type = 'number'; input.step = f.id === 'flock' ? '1' : 'any'; input.inputMode = 'decimal'; if (f.id === 'flock') input.min = '1'; if (f.id === 'distance') input.min = '0' } else input.rows = 2; input.value = value; input.oninput = () => { answers.customFields[f.id] = input.value }; wrap.append(input) } root.append(wrap);
  }
  const nodes = new Map([...root.children].map(el => [el.dataset.field, el])); for (const f of orderedFields()) { const el = nodes.get(f.id); if (el) root.append(el) }
}
function renderChoices() { for (const [key, values] of Object.entries(CHOICES)) { const box = $(key + 'Chips'); box.replaceChildren(); for (const value of values) { const multiple = Array.isArray(answers[key]); const active = multiple ? answers[key].includes(value) : answers[key] === value; const b = document.createElement('button'); b.className = 'chip' + (active ? ' active' : ''); b.textContent = value; b.type = 'button'; b.setAttribute('aria-pressed', String(active)); b.onclick = () => { if (multiple) answers[key] = active ? answers[key].filter(x => x !== value) : [...answers[key], value]; else answers[key] = active ? '' : value; renderChoices() }; box.append(b) } } }
function render() {
  const grid = $('speciesGrid'); grid.replaceChildren(); for (const name of SPECIES) { const b = document.createElement('button'); b.textContent = name; b.onclick = () => openEntry(name); grid.append(b) } $('total').textContent = SPECIES.length + '種'; $('recordCount').textContent = records.length + '件';
  const head = $('recordHead'); head.replaceChildren(); const tr = document.createElement('tr'); const fields = orderedFields(); const headers = ['ID', '日付', '時間', '種名', '数', ...fields.map(f => f.label), '緯度', '経度', 'GPS精度(m)']; headers.forEach((v, i) => { const th = document.createElement('th'); th.textContent = v; tr.append(th) }); head.append(tr);
  const list = $('recordList'); list.replaceChildren(); for (const r of records) { const row = document.createElement('tr'); const vals = [r.id, formatDate(r.timestamp), formatTime(r.timestamp), r.species, r.count, ...fields.map(f => orderedValue(r, f)), r.latitude ?? '', r.longitude ?? '', r.gpsAccuracyM ?? '']; vals.forEach((v, i) => { const td = document.createElement('td'); td.textContent = String(v); td.title = String(v); row.append(td) }); row.onclick = () => { if (rangeMode) { const index = records.findIndex(x => x.id === r.id); if (rangeMode === 'start') { rangeStart = index; rangeEnd = null; rangeMode = 'end' } else { rangeEnd = index; rangeMode = '' } renderRange(); return } editRecord(r) }; row.dataset.recordIndex = String(records.findIndex(x => x.id === r.id)); list.append(row) } renderRange();
}
function renderRange() {
  $('rangeStart').classList.toggle('selected', rangeMode === 'start'); $('rangeEnd').classList.toggle('selected', rangeMode === 'end');
  $('rangeEnd').disabled = rangeStart === null;
  const complete = rangeStart !== null && rangeEnd !== null;
  const low = complete ? Math.min(rangeStart, rangeEnd) : rangeStart;
  const high = complete ? Math.max(rangeStart, rangeEnd) : rangeStart;
  for (const row of $('recordList').rows) { const i = Number(row.dataset.recordIndex); row.classList.toggle('in-range', low !== null && i >= low && i <= high); row.classList.toggle('range-edge', low !== null && (i === low || i === high)); }
  const hint = $('rangeHint'); const summary = $('rangeSummary'); summary.replaceChildren(); summary.classList.toggle('hidden', !complete);
  if (rangeMode === 'start') hint.textContent = '開始する記録の行をタップしてください。';
  else if (rangeMode === 'end') hint.textContent = '終了する記録の行をタップしてください。';
  else if (!complete) hint.textContent = '集計する場合は「開始行を選択」を押してください。';
  else {
    const chosenRecords = records.slice(low, high + 1); const totals = new Map(); let total = 0;
    for (const r of chosenRecords) { const n = Number(r.count) || 0; total += n; const v = totals.get(r.species) || { count: 0, rows: 0 }; v.count += n; v.rows++; totals.set(r.species, v) }
    hint.textContent = `${chosenRecords.length}件の記録を選択中（表では新しい記録が下に表示されます）`;
    const h = document.createElement('strong'); h.textContent = `集計結果：${totals.size}種・${total}羽（${chosenRecords.length}記録）`; summary.append(h);
    const table = document.createElement('table'); const thead = document.createElement('thead'); const tr = document.createElement('tr'); for (const name of ['種名', '合計個体数', '記録件数']) { const th = document.createElement('th'); th.textContent = name; tr.append(th) } thead.append(tr); table.append(thead); const tbody = document.createElement('tbody'); for (const [species, v] of [...totals].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0], 'ja'))) { const row = document.createElement('tr'); for (const value of [species, v.count, v.rows]) { const td = document.createElement('td'); td.textContent = value; row.append(td) } tbody.append(row) } table.append(tbody); summary.append(table);
  }
}
$('rangeStart').onclick = () => { rangeMode = 'start'; renderRange() }; $('rangeEnd').onclick = () => { if (rangeStart !== null) { rangeMode = 'end'; renderRange() } }; $('rangeClear').onclick = () => { rangeStart = null; rangeEnd = null; rangeMode = ''; renderRange() };


// GPS設定と鮮度管理（取得時刻から10秒以内のみ記録）
const GPS_KEY = 'bird-counter-gps-enabled-v1';
const GPS_MAX_AGE = 10000;
let gpsEnabled = true;
try { gpsEnabled = localStorage.getItem(GPS_KEY) !== 'false'; } catch (e) { }
let gpsWatch = null, gpsGeneration = 0;
function validGps() {
  const age = latestLocation ? Date.now() - Date.parse(latestLocation.gpsTimestamp) : Infinity;
  return gpsEnabled && !document.hidden && age >= 0 && age <= GPS_MAX_AGE ? latestLocation : null;
}
function showGpsCoordinates() { const el = $('gpsCoordinates'), g = validGps(); el.classList.toggle('hidden', !g); el.textContent = g ? `緯度経度：${g.latitude.toFixed(6)}, ${g.longitude.toFixed(6)}` : '' }
function stopGps() {
  gpsGeneration++;
  latestLocation = null; showGpsCoordinates();
  if (gpsWatch !== null) navigator.geolocation.clearWatch(gpsWatch);
  gpsWatch = null;
}
function updateGps() {
  stopGps();
  const button = $('refreshGps'), el = $('gpsStatus');
  button.textContent = gpsEnabled ? 'GPS ON' : 'GPS OFF';
  button.setAttribute('aria-pressed', String(gpsEnabled));
  if (!gpsEnabled) { el.textContent = '位置情報：OFF'; return; }
  if (document.hidden) return;
  if (!window.isSecureContext || !navigator.geolocation) {
    el.textContent = '位置情報APIを利用できません'; return;
  }
  const generation = gpsGeneration;
  const started = Date.now();
  el.textContent = '位置情報を取得中…';
  try {
    gpsWatch = navigator.geolocation.watchPosition(pos => {
      if (generation !== gpsGeneration || !gpsEnabled || document.hidden) return;
      latestLocation = null; showGpsCoordinates();
      if (pos.timestamp < started || Date.now() - pos.timestamp > GPS_MAX_AGE || pos.timestamp > Date.now()) {
        el.textContent = '新しい位置情報を待機中…'; return;
      }
      latestLocation = {
        latitude: pos.coords.latitude, longitude: pos.coords.longitude,
        gpsAccuracyM: pos.coords.accuracy, gpsTimestamp: new Date(pos.timestamp).toISOString()
      };
      showGpsCoordinates();
      el.textContent = `GPS取得成功（精度 約${Math.round(pos.coords.accuracy)}m）`;
    }, err => {
      if (generation !== gpsGeneration) return;
      latestLocation = null; showGpsCoordinates();
      const names = { 1: 'アクセス拒否', 2: '位置取得不可', 3: '時間切れ' };
      el.textContent = `GPS：${names[err.code] || '取得失敗'}（${err.message || '詳細なし'}）`;
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  } catch (e) { el.textContent = 'GPS取得失敗：' + e.message; }
}
$('refreshGps').onclick = () => {
  gpsEnabled = !gpsEnabled;
  try { localStorage.setItem(GPS_KEY, String(gpsEnabled)); } catch (e) { console.warn(e); }
  updateGps();
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopGps(); else updateGps();
});
window.addEventListener('pagehide', stopGps);
window.addEventListener('pageshow', e => { if (e.persisted) updateGps(); });
setInterval(() => {
  if (latestLocation && !validGps()) {
    latestLocation = null; showGpsCoordinates();
    if (gpsEnabled && !document.hidden) $('gpsStatus').textContent = '新しい位置情報を待機中…';
  }
}, 1000);

function csvCell(value) { const s = value == null ? '' : String(value); return '"' + s.replace(/"/g, '""') + '"' }
// CSVはダウンロードとiPhone共有で同じデータを使用する。
function makeCsvFile() {
  const fields = orderedFields(); const headers = ['ID', '日付', '時間', '種名', '個体数', ...fields.map(f => f.csv), '緯度', '経度', 'GPS精度_m', 'GPS取得日時'];
  const values = records.map(r => [r.id, formatDate(r.timestamp), formatTime(r.timestamp, true), r.species, r.count, ...fields.map(f => orderedValue(r, f, true)), r.latitude ?? '', r.longitude ?? '', r.gpsAccuracyM ?? '', r.gpsTimestamp || '']);
  const csv = '\uFEFF' + [headers, ...values].map(row => row.map(csvCell).join(',')).join('\r\n');
  const now = new Date(); const pad = n => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return new File([csv], `field-log-${stamp}.csv`, { type: 'text/csv;charset=utf-8' });
}
function downloadCsv(file) {
  const url = URL.createObjectURL(file), a = document.createElement('a');
  a.href = url; a.download = file.name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
$('exportCsv').onclick = () => { try { downloadCsv(makeCsvFile()) } catch (e) { alert('CSVを保存できませんでした：' + e.message) } };
$('shareCsv').onclick = () => {
  // ファイル生成と共有APIの呼び出しを同じタップ操作内で実行する。
  const status = $('csvShareStatus');
  const inform = message => { if (status) status.textContent = message; };
  let file;
  try { file = makeCsvFile() } catch (e) { inform('CSVの作成に失敗しました'); alert('CSVを作成できませんでした：' + e.message); return }
  const fallback = reason => {
    inform(reason + ' CSVを保存してSafariの共有メニューから送信してください。');
    alert(reason + ' 「CSVを保存する」から保存し、Safariで共有してください。');
  };
  if (typeof navigator.share !== 'function') {
    fallback('この環境では直接共有に対応していません。'); return;
  }
  let supported = true;
  try { if (typeof navigator.canShare === 'function') supported = navigator.canShare({ files: [file] }); }
  catch (e) { supported = false; console.warn('共有可否の判定に失敗', e) }
  if (!supported) { fallback('この環境ではCSVファイルの直接共有に対応していません。'); return; }
  inform('共有メニューを開いています…');
  try {
    // await 前に呼び出し、iOSのユーザー操作条件を満たす。
    const sharing = navigator.share({ files: [file], title: '鳥類観察記録CSV' });
    Promise.resolve(sharing).then(() => inform('共有操作が終了しました。')).catch(e => {
      if (e && e.name === 'AbortError') { inform('共有がキャンセルされました。'); return; }
      console.warn('共有できませんでした', e);
      fallback('共有に失敗しました' + (e && e.message ? '（' + e.message + '）' : '') + '。');
    });
  } catch (e) { console.warn('共有を開始できませんでした', e); fallback('共有を開始できませんでした' + (e && e.message ? '（' + e.message + '）' : '') + '。'); }
};

function formatDate(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function formatTime(value, seconds = false) { const d = new Date(value); return Number.isNaN(d.getTime()) ? '--:--' : d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) }) }
function editRecord(r) { editingId = r.id; chosen = 'その他'; answers = { sex: r.sex || '', age: r.age || '', method: [...(r.methods || [])], behavior: [...(r.behavior || [])], posture: r.posture || '', customFields: { ...(r.customFields || {}) } }; $('entryTitle').textContent = '記録を編集（ID ' + r.id + '）'; $('customWrap').classList.remove('hidden'); $('customSpecies').value = r.species || ''; $('count').value = r.count; $('error').textContent = ''; $('saveBtn').textContent = '変更を保存'; $('deleteBtn').classList.remove('hidden'); renderCustomEntry(); show('entry') }

function renderSettings() {
  const root = $('settingsContent'); root.replaceChildren();
  for (const [key, title] of [['species', '種名ボタン']]) {
    const values = key === 'species' ? SPECIES : CHOICES[key];
    const h = document.createElement('h3'); h.textContent = title; root.append(h);
    const rows = document.createElement('div'); root.append(rows);
    function update(next) { if (key === 'species') SPECIES = next; else CHOICES[key] = next; if (persistSettings()) renderSettings(); }
    values.forEach((value, i) => {
      const row = document.createElement('div'); row.className = 'setting-row';
      const name = document.createElement('span'); name.textContent = value; row.append(name);
      const button = (label, action, disabled = false) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.disabled = disabled; b.setAttribute('aria-label', value + ' ' + label); b.onclick = action; row.append(b) };
      button('↑', () => { const a = [...values];[a[i - 1], a[i]] = [a[i], a[i - 1]]; update(a) }, i === 0);
      button('↓', () => { const a = [...values];[a[i + 1], a[i]] = [a[i], a[i + 1]]; update(a) }, i === values.length - 1);
      button('編集', () => { const v = prompt('新しい名称', value); if (v === null) return; const n = v.trim(); if (!n || values.some((x, j) => j !== i && x === n)) { alert('空欄または重複した名称です'); return } const a = [...values]; a[i] = n; update(a) });
      button('削除', () => { if (confirm('「' + value + '」をボタンから削除しますか？ 過去の記録は残ります。')) update(values.filter((_, j) => i !== j)) });
      rows.append(row);
    });
    const add = document.createElement('div'); add.className = 'setting-add'; const input = document.createElement('input'); input.placeholder = '新しい項目を追加'; input.setAttribute('aria-label', title + 'の新規項目'); const b = document.createElement('button'); b.textContent = '追加'; b.onclick = () => { const n = input.value.trim(); if (!n || values.includes(n)) { alert('空欄または重複した名称です'); return } update([...values, n]) }; input.onkeydown = e => { if (e.key === 'Enter') b.click() }; add.append(input, b); root.append(add);
  }
  const note = document.createElement('p'); note.className = 'settings-note'; note.textContent = '設定はこのブラウザに保存されます。選択肢を変更しても過去の記録値は変更されません。'; root.append(note); renderCustomSettings(root);
}

function deleteCustomField(f) {
  const count = records.filter(r => { const v = r.customFields?.[f.id]; return Array.isArray(v) ? v.length > 0 : v != null && v !== '' }).length;
  if (!migrationReady) return;
  if (!confirm(`「${f.name}」を削除しますか？\n値が記録されている${count}件のデータも削除されます。\nこの操作は元に戻せません。`)) return;
  const nextRecords = records.map(r => { if (!r.customFields || !Object.hasOwn(r.customFields, f.id)) return r; const customFields = { ...r.customFields }; delete customFields[f.id]; return { ...r, customFields } });
  const nextFields = CUSTOM_FIELDS.filter(x => x.id !== f.id); const keys = [KEY, CUSTOM_KEY]; let previous;
  try { previous = keys.map(k => localStorage.getItem(k)); localStorage.setItem(KEY, JSON.stringify(nextRecords)); localStorage.setItem(CUSTOM_KEY, JSON.stringify(nextFields)); } catch (e) { if (previous) keys.forEach((k, i) => { try { if (previous[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, previous[i]) } catch { } }); alert('削除を保存できませんでした'); return }
  records = nextRecords; CUSTOM_FIELDS = nextFields; fieldOrder = fieldOrder.filter(id => id !== f.id); persistSettings(); renderSettings(); render();
}
function renderCustomSettings(root) {
  const h = document.createElement('h3'); h.textContent = '記録項目'; root.append(h);
  const description = document.createElement('p'); description.className = 'settings-note'; description.textContent = '削除ではなく非表示にすると、過去の値を残したまま入力欄を隠せます。'; root.append(description);
  function action(label, fn) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = fn; return b }
  for (const { custom: f } of orderedFields()) {
    const row = document.createElement('div'); row.className = 'setting-row'; const name = document.createElement('span'); name.textContent = f.name + (f.hidden ? '［非表示］' : ''); row.append(name);
    for (const [label, delta] of [['↑', -1], ['↓', 1]]) { const ids = orderedFields().map(x => x.id), i = ids.indexOf(f.id); const b = action(label, () => { const previous = fieldOrder;[ids[i], ids[i + delta]] = [ids[i + delta], ids[i]]; fieldOrder = ids; if (persistSettings()) { renderSettings(); render() } else fieldOrder = previous }); b.disabled = i + delta < 0 || i + delta >= ids.length; row.append(b) }
    row.append(action('名称変更', () => { const v = prompt('新しい項目名', f.name); if (v === null) return; const n = v.trim(); if (!n) return; if (saveCustomFields(CUSTOM_FIELDS.map(x => x.id === f.id ? { ...x, name: n } : x))) renderSettings() }));
    row.append(action(f.hidden ? '表示' : '非表示', () => { if (saveCustomFields(CUSTOM_FIELDS.map(x => x.id === f.id ? { ...x, hidden: !x.hidden } : x))) renderSettings() })); row.append(action('削除', () => deleteCustomField(f))); root.append(row);
    if (f.type === 'single' || f.type === 'multi') {
      const list = document.createElement('div'); list.style.paddingLeft = '12px'; root.append(list);
      f.options.forEach((opt, i) => {
        const r = document.createElement('div'); r.className = 'setting-row'; const name = document.createElement('span'); name.textContent = opt; r.append(name);
        r.append(action('↑', () => { if (i === 0) return; const a = [...f.options];[a[i - 1], a[i]] = [a[i], a[i - 1]]; updateOptions(a) }));
        r.append(action('↓', () => { if (i === f.options.length - 1) return; const a = [...f.options];[a[i + 1], a[i]] = [a[i], a[i + 1]]; updateOptions(a) }));
        r.append(action('編集', () => { const v = prompt('新しい選択肢名', opt); if (v === null) return; const n = v.trim(); if (!n || f.options.some((x, j) => j !== i && x === n)) return alert('空欄または重複です'); const a = [...f.options]; a[i] = n; updateOptions(a) }));
        r.append(action('削除', () => { if (confirm('選択肢を非表示にしますか？ 過去の記録値は残ります。')) updateOptions(f.options.filter((_, j) => j !== i)) })); list.append(r)
      });
      const add = document.createElement('div'); add.className = 'setting-add'; const inp = document.createElement('input'); inp.placeholder = '選択肢を追加'; add.append(inp, action('追加', () => { const v = inp.value.trim(); if (!v || f.options.includes(v)) return alert('空欄または重複です'); updateOptions([...f.options, v]) })); list.append(add);
      function updateOptions(options) { if (saveCustomFields(CUSTOM_FIELDS.map(x => x.id === f.id ? { ...x, options } : x))) renderSettings() }
    }
  }
  const form = document.createElement('div'); form.className = 'custom-field-create'; const heading = document.createElement('h3'); heading.textContent = '新しい記録項目を作成'; form.append(heading);
  const name = document.createElement('input'); name.placeholder = '項目名'; name.setAttribute('aria-label', '新しい項目名'); form.append(name);
  const type = document.createElement('select'); for (const [value, title] of [['single', '単一選択'], ['multi', '複数選択'], ['number', '数値'], ['text', '自由記述']]) { const o = document.createElement('option'); o.value = value; o.textContent = title; type.append(o) } form.append(type);
  form.append(action('項目を追加', () => { const n = name.value.trim(); if (!n) return alert('項目名を入力してください'); if (CUSTOM_FIELDS.some(f => f.name === n)) return alert('同じ項目名が存在します'); const f = { id: newFieldId(), name: n, type: type.value, unit: '', options: [], hidden: false }; if (saveCustomFields([...CUSTOM_FIELDS, f])) renderSettings() })); root.append(form);
}
$('otherBtn').onclick = () => openEntry('その他'); $('backBtn').onclick = () => show('home'); $('navHome').onclick = () => show('home'); $('navRecords').onclick = () => show('records'); $('navSettings').onclick = () => show('settings'); $('minus').onclick = () => { $('count').value = String(Math.max(1, (Number($('count').value) || 1) - 1)) }; $('plus').onclick = () => { $('count').value = String((Number($('count').value) || 0) + 1) };
$('saveBtn').onclick = () => { if (!migrationReady) { $('error').textContent = 'IDの移行または保存領域に問題があります。旧データを保護するため保存を停止しました。'; return } const species = chosen === 'その他' ? $('customSpecies').value.trim() : chosen; const count = Number($('count').value); if (!species || !Number.isSafeInteger(count) || count < 1) { $('error').textContent = '種名と1以上の整数の個体数を入力してください'; return } for (const f of CUSTOM_FIELDS) { if (f.type === 'number') { const v = answers.customFields[f.id]; if (v !== undefined && v !== '' && (!Number.isFinite(Number(v)) || (f.id === 'flock' && (!Number.isSafeInteger(Number(v)) || Number(v) < 1)) || (f.id === 'distance' && Number(v) < 0))) { $('error').textContent = f.name + 'は数値で入力してください'; return } } } const currentGps = validGps(); const r = { id: editingId ?? nextId, timestamp: new Date().toISOString(), species, count, customFields: { ...(editingId ? records.find(x => x.id === editingId)?.customFields || {} : {}), ...answers.customFields }, ...(editingId ? (() => { const old = records.find(x => x.id === editingId); return { latitude: old?.latitude ?? null, longitude: old?.longitude ?? null, gpsAccuracyM: old?.gpsAccuracyM ?? null, gpsTimestamp: old?.gpsTimestamp ?? null } })() : { latitude: currentGps?.latitude ?? null, longitude: currentGps?.longitude ?? null, gpsAccuracyM: currentGps?.gpsAccuracyM ?? null, gpsTimestamp: currentGps?.gpsTimestamp ?? null }) }; const next = editingId ? records.map(old => old.id === editingId ? { ...r, id: old.id, timestamp: old.timestamp } : old) : [...records, r]; try { localStorage.setItem(KEY, JSON.stringify(next)); if (!editingId) { nextId++; localStorage.setItem(NEXT_ID_KEY, String(nextId)) } records = next; show(editingId ? 'records' : 'home') } catch (e) { $('error').textContent = '保存できませんでした。端末の空き容量やブラウザ設定を確認してください。' } };
$('deleteBtn').onclick = () => { if (!migrationReady || editingId === null || !confirm('この記録を削除しますか？\n削除したIDは再利用されません。')) return; const next = records.filter(r => r.id !== editingId); try { localStorage.setItem(KEY, JSON.stringify(next)); records = next; editingId = null; show('records') } catch (e) { $('error').textContent = '削除を保存できませんでした' } };
render(); updateGps();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(err => console.warn('オフライン登録に失敗', err)));
}
