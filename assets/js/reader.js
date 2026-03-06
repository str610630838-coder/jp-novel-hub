'use strict';

/* =====================================================
   滚动阅读器 - 核心逻辑
   一章一加载，自然滚动，进度条跟随滚动位置。
   ===================================================== */

const state = {
  source: '',
  novelId: '',
  chapterId: null,
  chapterIdx: 0,
  chapters: [],

  fontSize: 17,
  lineHeight: 2.0,
  readerTheme: 'dark',

  navVisible: true,
  settingsOpen: false,
  isLoading: false,
};

// ===== DOM 引用 =====
const elContent  = () => document.getElementById('reader-content');
const elProgress = () => document.getElementById('progress-fill');
const elPrev     = () => document.getElementById('btn-prev');
const elNext     = () => document.getElementById('btn-next');
const elChTitle  = () => document.getElementById('reader-chapter-title');
const elChInfo   = () => document.getElementById('chapter-info-display');

// ===== 初始化 =====
async function init() {
  initTheme();

  state.fontSize    = Storage.get('reader_fontSize',   17);
  state.lineHeight  = Storage.get('reader_lineHeight', 2.0);
  state.readerTheme = Storage.get('reader_theme',     'dark');

  const params = getParams();
  state.source    = params.source || '';
  state.novelId   = decodeURIComponent(params.id      || '');
  state.chapterId = params.chapter ? decodeURIComponent(params.chapter) : null;
  state.chapterIdx = parseInt(params.idx) || 0;

  if (!state.source || !state.novelId) { showContentError('参数错误，请从首页重新进入'); return; }

  applyReaderTheme();
  bindEvents();

  getChapterList(state.source, state.novelId).then(info => {
    state.chapters = info.chapters || [];
    const backEl = document.getElementById('btn-back');
    if (backEl) backEl.textContent = `← ${info.title || '返回'}`;
    updateChapterInfo();
    updateNavBtns();
  }).catch(e => console.warn('获取目录失败:', e));

  await loadChapter();
}

// ===== 加载章节内容 =====
async function loadChapter() {
  if (state.isLoading) return;
  state.isLoading = true;

  const content = elContent();
  content.innerHTML = `
    <div class="page-loading">
      <div class="spinner"></div>
      <span>正在加载章节内容…</span>
    </div>`;
  elProgress().style.width = '0%';
  elPrev().disabled = true;
  elNext().disabled = true;

  // 滚回顶部
  window.scrollTo({ top: 0, behavior: 'instant' });

  try {
    const chId = (!state.chapterId || state.chapterId === 'null') ? null : state.chapterId;
    const data  = await getChapterContent(state.source, state.novelId, chId);

    const title = data.title || '';
    document.title = title ? `${title} · 日文小说` : '日文小说';
    if (elChTitle()) elChTitle().textContent = title;

    let html = `<h1 class="ch-title">${escHtml(title)}</h1>`;
    if (data.preface) html += `<div class="reader-foreword">${data.preface}</div><hr>`;
    html += data.body || '<p>（本章内容为空）</p>';
    if (data.afterword) html += `<hr><div class="reader-afterword">${data.afterword}</div>`;

    // 章尾导航
    html += `
      <div class="chapter-end-nav">
        <button class="btn-chapter-end" id="bottom-prev" onclick="prevChapter()">← 上一章</button>
        <button class="btn-chapter-end btn-chapter-end-next" id="bottom-next" onclick="nextChapter()">下一章 →</button>
      </div>`;

    content.innerHTML = html;

    updateChapterInfo();
    updateNavBtns();
    updateProgressBar();

    Storage.setReadProgress(state.source, state.novelId, state.chapterId, state.chapterIdx);

  } catch (err) {
    console.error(err);
    showContentError(`加载失败：${err.message}<br>
      <small style="color:var(--text-faint)">可能为跨域限制，可稍后重试或访问原站</small>`);
  } finally {
    state.isLoading = false;
    updateNavBtns();
  }
}

// ===== 章节导航 =====
function nextChapter() {
  if (state.chapterIdx >= state.chapters.length - 1) {
    showToast('已是最后一章');
    return;
  }
  state.chapterIdx++;
  const ch = state.chapters[state.chapterIdx];
  if (ch) {
    state.chapterId = ch.num || ch.id;
    updateUrl();
    loadChapter();
  }
}

function prevChapter() {
  if (state.chapterIdx <= 0) {
    showToast('已是第一章');
    return;
  }
  state.chapterIdx--;
  const ch = state.chapters[state.chapterIdx];
  if (ch) {
    state.chapterId = ch.num || ch.id;
    updateUrl();
    loadChapter();
  }
}

// ===== 更新 URL =====
function updateUrl() {
  const qs = new URLSearchParams({
    source:  state.source,
    id:      state.novelId,
    chapter: state.chapterId || '',
    idx:     state.chapterIdx,
  });
  history.replaceState(null, '', '?' + qs.toString());
}

// ===== 更新章节信息显示 =====
function updateChapterInfo() {
  const ch = state.chapters[state.chapterIdx];
  const chTitle = ch?.title || '';
  if (elChTitle() && chTitle) elChTitle().textContent = chTitle;
  if (elChInfo()) {
    const total = state.chapters.length;
    elChInfo().textContent = total > 0
      ? `第 ${state.chapterIdx + 1} 章 / 共 ${total} 章`
      : '—';
  }
}

// ===== 更新按钮状态 =====
function updateNavBtns() {
  const isFirst = state.chapterIdx <= 0;
  const isLast  = state.chapters.length > 0 && state.chapterIdx >= state.chapters.length - 1;
  if (elPrev()) elPrev().disabled = isFirst || state.isLoading;
  if (elNext()) elNext().disabled = isLast  || state.isLoading;

  // 同步章末导航按钮
  const bp = document.getElementById('bottom-prev');
  const bn = document.getElementById('bottom-next');
  if (bp) bp.disabled = isFirst;
  if (bn) bn.disabled = isLast;
}

// ===== 进度条（跟随页面滚动）=====
function updateProgressBar() {
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
  if (elProgress()) elProgress().style.width = pct.toFixed(1) + '%';
}

// ===== 应用阅读器主题 =====
function applyReaderTheme() {
  document.body.classList.remove(
    'reader-theme-white', 'reader-theme-sepia',
    'reader-theme-dark',  'reader-theme-deep'
  );
  document.body.classList.add(`reader-theme-${state.readerTheme}`);
  document.body.style.background = 'var(--reader-bg)';

  document.documentElement.style.setProperty('--reader-font-size',  state.fontSize + 'px');
  document.documentElement.style.setProperty('--reader-line-height', state.lineHeight);

  const fsEl = document.getElementById('font-size-display');
  if (fsEl) fsEl.textContent = state.fontSize + 'px';

  document.querySelectorAll('.setting-btn[data-lh]').forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.dataset.lh) === state.lineHeight);
  });
  document.querySelectorAll('.theme-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.theme === state.readerTheme);
  });
}

function changeFontSize(delta) {
  state.fontSize = Math.max(12, Math.min(26, state.fontSize + delta));
  Storage.set('reader_fontSize', state.fontSize);
  applyReaderTheme();
}

function changeLineHeight(lh) {
  state.lineHeight = lh;
  Storage.set('reader_lineHeight', lh);
  applyReaderTheme();
}

function changeReaderTheme(theme) {
  state.readerTheme = theme;
  Storage.set('reader_theme', theme);
  applyReaderTheme();
}

// ===== 导航栏显示/隐藏 =====
function setNavVisible(v) {
  state.navVisible = v;
  document.querySelector('.reader-nav')?.classList.toggle('hidden', !v);
  document.querySelector('.reader-bottom-nav')?.classList.toggle('hidden', !v);
  document.querySelector('.progress-bar-wrap')?.classList.toggle('hidden', !v);
}
function toggleNav() { setNavVisible(!state.navVisible); }

// ===== 目录弹窗 =====
function openTocModal() {
  document.getElementById('toc-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'toc-modal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:200;
    background:rgba(0,0,0,0.65);
    display:flex;align-items:flex-end;`;

  modal.innerHTML = `
    <div style="
      background:var(--surface);
      border-radius:16px 16px 0 0;
      width:100%; max-height:72vh;
      overflow-y:auto;
      padding:20px;
      border-top:1px solid var(--border);
    ">
      <div style="font-size:15px;font-weight:600;margin-bottom:16px;display:flex;justify-content:space-between">
        <span>目录</span>
        <button onclick="document.getElementById('toc-modal').remove()"
                style="background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer">✕</button>
      </div>
      <div id="toc-list" class="chapter-list"></div>
    </div>`;

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  const list = document.getElementById('toc-list');
  let lastGroup = '';
  state.chapters.forEach((ch, idx) => {
    if (ch.chapterTitle && ch.chapterTitle !== lastGroup) {
      lastGroup = ch.chapterTitle;
      const g = document.createElement('div');
      g.className = 'chapter-group-title';
      g.textContent = ch.chapterTitle;
      list.appendChild(g);
    }
    const item = document.createElement('div');
    item.className = 'chapter-item' + (idx === state.chapterIdx ? ' read' : '');
    item.style.background = idx === state.chapterIdx ? 'var(--surface2)' : '';
    item.innerHTML = `
      <span class="chapter-num">${ch.num || idx + 1}</span>
      <span class="chapter-title-text">${escHtml(ch.title)}</span>`;
    item.addEventListener('click', () => {
      state.chapterIdx = idx;
      state.chapterId  = ch.num || ch.id;
      updateUrl();
      loadChapter();
      modal.remove();
    });
    list.appendChild(item);
  });

  setTimeout(() => {
    list.querySelectorAll('.chapter-item')[state.chapterIdx]?.scrollIntoView({ block: 'center' });
  }, 60);
}

// ===== 显示内容区错误 =====
function showContentError(htmlMsg) {
  elContent().innerHTML = `
    <div class="page-error">
      <span style="font-size:40px">⚠️</span>
      <p>${htmlMsg}</p>
      <button class="btn btn-outline btn-sm" onclick="loadChapter()" style="margin-top:12px">重试</button>
      <a href="index.html" class="btn btn-outline btn-sm" style="margin-top:8px">返回首页</a>
    </div>`;
}

// ===== 绑定所有事件 =====
function bindEvents() {
  elPrev()?.addEventListener('click', prevChapter);
  elNext()?.addEventListener('click', nextChapter);

  document.getElementById('btn-settings')?.addEventListener('click', () => {
    state.settingsOpen = !state.settingsOpen;
    document.getElementById('settings-panel')?.classList.toggle('open', state.settingsOpen);
  });
  document.getElementById('btn-toc')?.addEventListener('click', openTocModal);
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  document.getElementById('btn-font-dec')?.addEventListener('click', () => changeFontSize(-1));
  document.getElementById('btn-font-inc')?.addEventListener('click', () => changeFontSize(1));

  document.querySelectorAll('.setting-btn[data-lh]').forEach(btn => {
    btn.addEventListener('click', () => changeLineHeight(parseFloat(btn.dataset.lh)));
  });
  document.querySelectorAll('.theme-swatch').forEach(s => {
    s.addEventListener('click', () => changeReaderTheme(s.dataset.theme));
  });

  // 点击正文中间区域 显示/隐藏导航栏
  document.getElementById('reader-content')?.addEventListener('click', e => {
    if (state.settingsOpen) {
      state.settingsOpen = false;
      document.getElementById('settings-panel')?.classList.remove('open');
      return;
    }
    // 只有点击非按钮区域才切换导航
    if (!e.target.closest('button, a')) {
      toggleNav();
    }
  });

  // 滚动更新进度条
  window.addEventListener('scroll', updateProgressBar, { passive: true });

  // 键盘导航
  document.addEventListener('keydown', e => {
    if (['ArrowRight', 'PageDown'].includes(e.key)) { e.preventDefault(); nextChapter(); }
    if (['ArrowLeft',  'PageUp'].includes(e.key))   { e.preventDefault(); prevChapter(); }
  });
}

document.addEventListener('DOMContentLoaded', init);
