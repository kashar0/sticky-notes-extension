// Sticky Notes v2.0 — content.js
// Security: all DOM manipulation uses textContent / createElement — no innerHTML
// Debugger fixes: drag handle separates from edit area, race condition resolved,
//   popup reload triggered via message, postMessage replaced with direct chrome.runtime

'use strict';

const NOTE_COLORS = ['yellow','green','blue','pink','purple','orange'];
const noteElements = {}; // { id: { el, textarea } }

function getUrlKey() {
  try { return 'sn:' + new URL(location.href).hostname; } catch(_) { return 'sn:unknown'; }
}

// ── Safe timestamp display ────────────────────────────────────────────────────
function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month:'short', day:'numeric' }) + ' ' +
         d.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' });
}

// ── Create a note DOM element ─────────────────────────────────────────────────
function createNote(note) {
  const { id, content='', color='yellow', pos={ top:120, left:120 },
          hidden=false, pinned=false, minimized=false, updatedAt=null } = note;

  const el = document.createElement('div');
  el.className = `sn-note sn-color-${color}`;
  el.style.top  = Math.max(0, pos.top)  + 'px';
  el.style.left = Math.max(0, pos.left) + 'px';
  if (hidden)    el.style.display = 'none';
  if (minimized) el.classList.add('sn-minimized');

  // ── Header (drag handle) ──────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'sn-header';

  // Color dots
  const dots = document.createElement('div');
  dots.className = 'sn-color-dots';
  NOTE_COLORS.forEach(c => {
    const dot = document.createElement('span');
    dot.className = `sn-dot sn-dot-${c}`;
    if (c === color) dot.classList.add('active');
    dot.title = c;
    dot.addEventListener('mousedown', e => e.stopPropagation()); // don't trigger drag
    dot.addEventListener('click', () => {
      el.className = `sn-note sn-color-${c}`;
      if (minimized) el.classList.add('sn-minimized');
      dots.querySelectorAll('.sn-dot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      saveNotes();
    });
    dots.appendChild(dot);
  });

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'sn-header-actions';

  const pinBtn = document.createElement('button');
  pinBtn.className = 'sn-btn sn-btn-pin' + (pinned ? ' pinned' : '');
  pinBtn.title = 'Pin (lock position)';
  pinBtn.textContent = '📌';
  pinBtn.addEventListener('mousedown', e => e.stopPropagation());
  pinBtn.addEventListener('click', () => {
    pinBtn.classList.toggle('pinned');
    saveNotes();
  });

  const minBtn = document.createElement('button');
  minBtn.className = 'sn-btn';
  minBtn.title = 'Minimize';
  minBtn.textContent = '▾';
  minBtn.addEventListener('mousedown', e => e.stopPropagation());
  minBtn.addEventListener('click', () => {
    el.classList.toggle('sn-minimized');
    minBtn.textContent = el.classList.contains('sn-minimized') ? '▸' : '▾';
    saveNotes();
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'sn-btn sn-btn-delete';
  delBtn.title = 'Delete note';
  delBtn.textContent = '✕';
  delBtn.addEventListener('mousedown', e => e.stopPropagation());
  delBtn.addEventListener('click', () => {
    el.remove();
    delete noteElements[id];
    saveNotes();
    chrome.runtime.sendMessage({ action: 'NOTES_UPDATED' }).catch(() => {});
  });

  actions.appendChild(pinBtn);
  actions.appendChild(minBtn);
  actions.appendChild(delBtn);
  header.appendChild(dots);
  header.appendChild(actions);

  // ── Timestamp ─────────────────────────────────────────────────────────────
  const ts = document.createElement('div');
  ts.className = 'sn-timestamp';
  ts.textContent = updatedAt ? 'Updated ' + formatDate(updatedAt) : '';

  // ── Textarea (edit area, separate from drag handle) ───────────────────────
  const textarea = document.createElement('textarea');
  textarea.className = 'sn-body';
  textarea.placeholder = 'Type your note…';
  textarea.value = content; // safe — value property, not innerHTML
  textarea.addEventListener('input', () => {
    ts.textContent = 'Updated ' + formatDate(Date.now());
    saveNotes();
    chrome.runtime.sendMessage({ action: 'NOTES_UPDATED' }).catch(() => {});
  });
  textarea.addEventListener('mousedown', e => e.stopPropagation()); // don't trigger drag

  el.appendChild(header);
  el.appendChild(ts);
  el.appendChild(textarea);
  document.body.appendChild(el);

  // ── Drag (header only) ────────────────────────────────────────────────────
  makeDraggable(el, header, pinBtn);

  noteElements[id] = { el, textarea };
  return { el, textarea };
}

// ── Dragging — operates only on the header bar ────────────────────────────────
function makeDraggable(el, handle, pinBtn) {
  handle.addEventListener('mousedown', e => {
    if (pinBtn.classList.contains('pinned')) return;
    if (e.target.closest('.sn-btn, .sn-dot')) return; // buttons/dots inside header exempt

    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const ox = e.clientX - rect.left;
    const oy = e.clientY - rect.top;

    function onMove(e) {
      el.style.left = (e.clientX - ox + window.scrollX) + 'px';
      el.style.top  = (e.clientY - oy + window.scrollY) + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      saveNotes();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ── Persist ────────────────────────────────────────────────────────────────────
function saveNotes() {
  const notes = [];
  for (const id in noteElements) {
    const { el, textarea } = noteElements[id];
    const colorMatch = [...el.classList].find(c => c.startsWith('sn-color-') && c !== 'sn-color-');
    const color = colorMatch ? colorMatch.replace('sn-color-','') : 'yellow';
    const pinned = el.querySelector('.sn-btn-pin')?.classList.contains('pinned') || false;
    notes.push({
      id,
      content: textarea.value,
      color,
      pos: { top: parseInt(el.style.top)||120, left: parseInt(el.style.left)||120 },
      hidden: el.style.display === 'none',
      pinned,
      minimized: el.classList.contains('sn-minimized'),
      updatedAt: Date.now()
    });
  }
  const key = getUrlKey();
  chrome.storage.local.set({ [key]: notes });
}

// ── Load on page ready ────────────────────────────────────────────────────────
function loadNotes() {
  const key = getUrlKey();
  chrome.storage.local.get([key], data => {
    const notes = Array.isArray(data[key]) ? data[key] : [];
    notes.forEach(note => {
      // Validate data structure before using (Security agent: storage safety)
      if (!note || typeof note.id !== 'string') return;
      createNote(note);
    });
  });
}

// ── Message handler (from popup) ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.action !== 'string') return;

  if (msg.action === 'ADD_STICKY_NOTE') {
    const offset = Object.keys(noteElements).length * 28;
    const id = 'sn-' + Date.now();
    createNote({ id, content:'', color:'yellow', pos:{ top:120+offset, left:120+offset } });
    saveNotes();
    sendResponse({ ok: true });
    return true;
  }

  const entry = noteElements[msg.id];
  if (!entry) { sendResponse({ ok: false }); return; }

  const { el } = entry;
  if (msg.action === 'SHOW_NOTE')   { el.style.display = ''; saveNotes(); }
  if (msg.action === 'HIDE_NOTE')   { el.style.display = 'none'; saveNotes(); }
  if (msg.action === 'DELETE_NOTE') {
    el.remove();
    delete noteElements[msg.id];
    saveNotes();
    chrome.runtime.sendMessage({ action: 'NOTES_UPDATED' }).catch(() => {});
  }
  sendResponse({ ok: true });
  return true;
});

// Boot
loadNotes();
