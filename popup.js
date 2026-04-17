// Sticky Notes v2.0 — popup.js
// Debugger fixes: uses chrome.tabs.sendMessage (not postMessage), reloads list
//   on NOTES_UPDATED from content script, all DOM is safe (textContent only)
// Security: no innerHTML, data validated before render

'use strict';

let allNotes   = [];
let currentTab = null;
let urlKey     = '';

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  try {
    const host = new URL(tab.url).hostname;
    urlKey = 'sn:' + host;
    document.getElementById('site-label').textContent = host || 'this page';
  } catch (_) {
    urlKey = 'sn:unknown';
    document.getElementById('site-label').textContent = 'this page';
  }

  await loadNotes();

  // Listen for content script updates so popup stays in sync
  chrome.runtime.onMessage.addListener(msg => {
    if (msg && msg.action === 'NOTES_UPDATED') loadNotes();
  });

  // Add note button
  document.getElementById('add-btn').addEventListener('click', addNote);

  // Search filter
  document.getElementById('search-input').addEventListener('input', e => {
    renderList(e.target.value.trim().toLowerCase());
  });
});

// ── Load from storage ─────────────────────────────────────────────────────────
async function loadNotes() {
  return new Promise(resolve => {
    chrome.storage.local.get([urlKey], data => {
      const raw = data[urlKey];
      allNotes = Array.isArray(raw) ? raw.filter(n => n && typeof n.id === 'string') : [];
      renderList(document.getElementById('search-input').value.trim().toLowerCase());
      resolve();
    });
  });
}

// ── Render note cards ─────────────────────────────────────────────────────────
function renderList(query = '') {
  const list   = document.getElementById('notes-list');
  const empty  = document.getElementById('empty-state');
  const stats  = document.getElementById('stats-text');

  // Clear safely
  while (list.firstChild) list.removeChild(list.firstChild);

  const filtered = query
    ? allNotes.filter(n => (n.content || '').toLowerCase().includes(query))
    : allNotes;

  const count = allNotes.length;
  stats.textContent = count === 0
    ? 'No notes on this page'
    : `${count} note${count !== 1 ? 's' : ''} on this page`;

  if (filtered.length === 0) {
    empty.classList.remove('hidden');
    if (query) {
      empty.querySelector('p').textContent = 'No notes match your search.';
      empty.querySelector('span').textContent = 'Try different keywords.';
    } else {
      empty.querySelector('p').textContent = 'No notes on this page yet.';
      empty.querySelector('span').textContent = 'Click "Add Note" to get started.';
    }
    return;
  }

  empty.classList.add('hidden');

  filtered.forEach(note => {
    const card = document.createElement('div');
    card.className = 'note-card';

    // Top row: color swatch + preview
    const top = document.createElement('div');
    top.className = 'note-card-top';

    const swatch = document.createElement('div');
    swatch.className = `note-color-swatch color-${note.color || 'yellow'}`;

    const preview = document.createElement('div');
    preview.className = 'note-preview' + (!note.content ? ' empty' : '');
    preview.textContent = note.content
      ? note.content.slice(0, 100)
      : '(empty note)'; // safe: textContent

    top.appendChild(swatch);
    top.appendChild(preview);

    // Meta row: timestamp + hidden badge
    const meta = document.createElement('div');
    meta.className = 'note-meta';
    const dateStr = note.updatedAt ? formatDate(note.updatedAt) : '';
    const hiddenTag = note.hidden ? ' · hidden' : '';
    const pinnedTag = note.pinned ? ' · 📌' : '';
    const minTag    = note.minimized ? ' · minimized' : '';
    meta.textContent = dateStr + hiddenTag + pinnedTag + minTag; // safe

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'note-actions';

    const showBtn = makeBtn('Show', 'na-btn show', () => send('SHOW_NOTE', note.id));
    const hideBtn = makeBtn('Hide', 'na-btn hide', () => send('HIDE_NOTE', note.id));
    const delBtn  = makeBtn('Delete', 'na-btn delete', () => send('DELETE_NOTE', note.id));

    actions.appendChild(showBtn);
    actions.appendChild(hideBtn);
    actions.appendChild(delBtn);

    card.appendChild(top);
    card.appendChild(meta);
    card.appendChild(actions);
    list.appendChild(card);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeBtn(label, className, onClick) {
  const btn = document.createElement('button');
  btn.className = className;
  btn.textContent = label; // safe
  btn.addEventListener('click', onClick);
  return btn;
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month:'short', day:'numeric' }) + ' ' +
         d.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' });
}

// ── Add note — sends to content script directly (fixed: was using postMessage) ──
async function addNote() {
  if (!currentTab) return;
  try {
    await chrome.tabs.sendMessage(currentTab.id, { action: 'ADD_STICKY_NOTE' });
    await loadNotes();
  } catch (e) {
    // Content script not injected yet — inject and retry once
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ['content.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: currentTab.id },
        files: ['content.css']
      });
      await new Promise(r => setTimeout(r, 120));
      await chrome.tabs.sendMessage(currentTab.id, { action: 'ADD_STICKY_NOTE' });
      await loadNotes();
    } catch (err) {
      console.warn('[StickyNotes] Could not inject into this page:', err);
    }
  }
}

// ── Send message to content script ────────────────────────────────────────────
function send(action, id) {
  if (!currentTab) return;
  chrome.tabs.sendMessage(currentTab.id, { action, id })
    .then(() => loadNotes())
    .catch(err => console.warn('[StickyNotes] send error:', err));
}
