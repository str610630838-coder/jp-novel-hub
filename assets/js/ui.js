'use strict';

// ===== Toast 通知 =====
let toastWrap = null;
function showToast(msg, duration = 2500) {
  if (!toastWrap) {
    toastWrap = document.createElement('div');
    toastWrap.className = 'toast-wrap';
    document.body.appendChild(toastWrap);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  toastWrap.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

// ===== 主题 =====
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  setTheme(saved);
}
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
}

// ===== 格式化数字 =====
function fmtNum(n) {
  if (!n) return '0';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return n.toLocaleString();
}

function fmtDate(str) {
  if (!str) return '';
  return str.split(' ')[0];
}

// ===== 生成封面色 =====
const COVER_COLORS = [
  'linear-gradient(135deg,#1a237e,#3f51b5)',
  'linear-gradient(135deg,#1b5e20,#43a047)',
  'linear-gradient(135deg,#4a148c,#7b1fa2)',
  'linear-gradient(135deg,#bf360c,#e64a19)',
  'linear-gradient(135deg,#004d40,#00897b)',
  'linear-gradient(135deg,#880e4f,#e91e63)',
  'linear-gradient(135deg,#1a237e,#00bcd4)',
  'linear-gradient(135deg,#37474f,#607d8b)',
];
function getCoverColor(id) {
  let hash = 0;
  for (const c of String(id)) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return COVER_COLORS[Math.abs(hash) % COVER_COLORS.length];
}

// ===== 渲染小说卡片 =====
function renderNovelCard(novel) {
  const src = CONFIG.sources[novel.source] || {};
  const card = document.createElement('div');
  card.className = 'novel-card';
  card.dataset.id = novel.id;
  card.dataset.source = novel.source;

  const synopsis = (novel.synopsis || '').replace(/<[^>]*>/g, '').trim() || '暂无简介';
  const tags = (novel.tags || []).slice(0, 3);

  card.innerHTML = `
    <div class="card-top ${novel.source}"></div>
    <div class="card-body">
      <div class="card-source">${src.shortName || novel.source}</div>
      <div class="card-title">${escHtml(novel.title)}</div>
      <div class="card-author">✍ ${escHtml(novel.author)}</div>
      <div class="card-synopsis">${escHtml(synopsis)}</div>
      <div class="card-tags">
        ${novel.genre ? `<span class="tag primary">${escHtml(novel.genre)}</span>` : ''}
        ${tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}
      </div>
    </div>
    <div class="card-footer">
      <span>${fmtNum(novel.wordCount)} 字</span>
      <span>${novel.chapterCount ? novel.chapterCount + ' 话' : ''}</span>
      ${novel.isComplete ? '<span class="complete-badge">完结</span>' : ''}
    </div>`;

  card.addEventListener('click', () => {
    location.href = `novel.html?source=${novel.source}&id=${encodeURIComponent(novel.id)}`;
  });
  return card;
}

// ===== 渲染加载态 =====
function renderLoading(container) {
  container.innerHTML = `
    <div class="loading-wrap">
      <div class="spinner"></div>
      <span>正在从远端获取数据…</span>
    </div>`;
}

// ===== 渲染空态 =====
function renderEmpty(container, msg = '没有找到相关小说') {
  container.innerHTML = `
    <div class="empty-state">
      <span class="emoji">📭</span>
      <h3>${msg}</h3>
      <p>试试其他关键词，或切换来源</p>
    </div>`;
}

// ===== 渲染错误态 =====
function renderError(container, err) {
  container.innerHTML = `
    <div class="error-state">
      <span class="emoji">⚠️</span>
      <p>${escHtml(String(err))}</p>
      <button class="btn btn-outline btn-sm" onclick="location.reload()">重试</button>
    </div>`;
}

// ===== 渲染分页 =====
function renderPagination(container, currentPage, total, perPage, onPage) {
  container.innerHTML = '';
  if (total <= perPage) return;

  const totalPages = Math.min(Math.ceil(total / perPage), 50);
  if (totalPages <= 1) return;

  const prev = document.createElement('button');
  prev.className = 'page-btn';
  prev.textContent = '← 上一页';
  prev.disabled = currentPage <= 1;
  prev.onclick = () => onPage(currentPage - 1);
  container.appendChild(prev);

  const range = getPaginationRange(currentPage, totalPages);
  let last = 0;
  range.forEach(p => {
    if (p - last > 1) {
      const dots = document.createElement('span');
      dots.textContent = '…';
      dots.style.cssText = 'color:var(--text-faint);padding:0 4px;';
      container.appendChild(dots);
    }
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (p === currentPage ? ' active' : '');
    btn.textContent = p;
    btn.onclick = () => onPage(p);
    container.appendChild(btn);
    last = p;
  });

  const next = document.createElement('button');
  next.className = 'page-btn';
  next.textContent = '下一页 →';
  next.disabled = currentPage >= totalPages;
  next.onclick = () => onPage(currentPage + 1);
  container.appendChild(next);
}

function getPaginationRange(cur, total) {
  const delta = 2;
  const pages = [];
  for (let i = Math.max(1, cur - delta); i <= Math.min(total, cur + delta); i++) pages.push(i);
  if (!pages.includes(1)) pages.unshift(1);
  if (!pages.includes(total)) pages.push(total);
  return pages;
}

// ===== HTML 转义 =====
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===== URL 参数 =====
function getParams() {
  return Object.fromEntries(new URLSearchParams(location.search));
}

// ===== localStorage 工具 =====
const Storage = {
  get(key, def = null) {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : def; }
    catch { return def; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  },
  getReadProgress(source, id) {
    return this.get(`progress:${source}:${id}`, { chapter: null, chapterIdx: 0 });
  },
  setReadProgress(source, id, chapter, chapterIdx) {
    this.set(`progress:${source}:${id}`, { chapter, chapterIdx, ts: Date.now() });
  },
};
