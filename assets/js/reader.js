'use strict';

/* =====================================================
   翻页阅读器 - 核心逻辑
   原理：CSS multi-column 将内容自动排进多个等宽列，
         通过 translateX 水平滑动实现翻页。
   ===================================================== */

const state = {
  // 书籍定位
  source: '',
  novelId: '',
  chapterId: null,
  chapterIdx: 0,
  chapters: [],          // 完整章节列表

  // 分页状态
  currentPage: 0,        // 当前页（0-based）
  totalPages: 1,         // 本章总页数
  pageHeight: 0,         // 单页高度（px）

  // 阅读偏好
  fontSize: 17,
  lineHeight: 2.0,
  readerTheme: 'dark',

  // UI 状态
  navVisible: true,
  settingsOpen: false,
  isLoading: false,
};

// ===== DOM 引用 =====
const elViewport  = () => document.getElementById('page-viewport');
const elCanvas    = () => document.getElementById('page-canvas');
const elProgress  = () => document.getElementById('progress-fill');
const elPrev      = () => document.getElementById('btn-prev');
const elNext      = () => document.getElementById('btn-next');
const elPageNum   = () => document.getElementById('page-num-display');
const elPageCh    = () => document.getElementById('page-chapter-display');
const elChTitle   = () => document.getElementById('reader-chapter-title');

// ===== 初始化 =====
async function init() {
  initTheme();

  // 读取用户偏好
  state.fontSize    = Storage.get('reader_fontSize',    17);
  state.lineHeight  = Storage.get('reader_lineHeight',  2.0);
  state.readerTheme = Storage.get('reader_theme',      'dark');

  const params = getParams();
  state.source    = params.source || '';
  state.novelId   = decodeURIComponent(params.id      || '');
  state.chapterId = params.chapter ? decodeURIComponent(params.chapter) : null;
  state.chapterIdx = parseInt(params.idx) || 0;

  if (!state.source || !state.novelId) { showPageError('参数错误，请从首页重新进入'); return; }

  applyReaderTheme();
  bindEvents();

  // 并行：获取章节目录 + 加载章节内容
  getChapterList(state.source, state.novelId).then(info => {
    state.chapters = info.chapters || [];
    const backEl = document.getElementById('btn-back');
    if (backEl) backEl.textContent = `← ${info.title || '返回'}`;
    updatePageInfo();
  }).catch(e => console.warn('获取目录失败:', e));

  await loadChapter();
}

// ===== 加载章节内容 =====
async function loadChapter() {
  if (state.isLoading) return;
  state.isLoading = true;

  elCanvas().innerHTML = `
    <div class="page-loading">
      <div class="spinner"></div>
      <span>正在加载章节内容…</span>
    </div>`;
  elProgress().style.width = '0%';
  elPrev().disabled = true;
  elNext().disabled = true;

  try {
    const chId = (!state.chapterId || state.chapterId === 'null') ? null : state.chapterId;
    const data  = await getChapterContent(state.source, state.novelId, chId);

    // 更新标题
    const title = data.title || '';
    document.title = title ? `${title} · 日文小说` : '日文小说';
    if (elChTitle()) elChTitle().textContent = title;

    // 构造 HTML（注意：内容在同一 canvas 里，由 CSS columns 自动分页）
    let html = `<p class="ch-title">${escHtml(title)}</p>`;
    if (data.preface) html += `<div class="reader-foreword">${data.preface}</div><hr>`;
    html += data.body || '<p>（本章内容为空）</p>';
    if (data.afterword) html += `<hr><div class="reader-afterword">${data.afterword}</div>`;

    // 渲染并等待字体 + 布局稳定后再分页
    renderAndPaginate(html, 0);

    // 保存阅读进度
    Storage.setReadProgress(state.source, state.novelId, state.chapterId, state.chapterIdx);

  } catch (err) {
    console.error(err);
    showPageError(`加载失败：${err.message}<br>
      <small style="color:var(--text-faint)">可能为跨域限制，可稍后重试或访问原站</small>`);
  } finally {
    state.isLoading = false;
  }
}

// ===== 渲染内容并计算分页 =====
function renderAndPaginate(html, targetPage) {
  const canvas   = elCanvas();
  const viewport = elViewport();

  // 先关闭动画，避免分页计算时出现闪烁
  canvas.classList.add('instant');
  canvas.innerHTML = html;

  // 等待两帧让浏览器完成布局
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      calcAndGo(targetPage);
    });
  });
}

// ===== 计算页数并跳转 =====
function calcAndGo(targetPage) {
  const viewport = elViewport();
  const canvas   = elCanvas();

  const vh = viewport.clientHeight;
  state.pageHeight = vh;

  // 清除旧的 column 布局残留，让内容自然流高
  canvas.style.columnWidth = '';
  canvas.style.height      = '';
  canvas.style.transform   = '';

  // 再给一帧让浏览器完成布局后读取真实高度
  requestAnimationFrame(() => {
    const totalHeight = canvas.scrollHeight;
    state.totalPages = Math.max(1, Math.ceil(totalHeight / vh));

    canvas.classList.remove('instant');

    goToPage(Math.min(targetPage, state.totalPages - 1), false);
    updatePageInfo();
    updateNavBtns();
  });
}

// ===== 跳转到指定页 =====
function goToPage(n, animate = true) {
  const canvas = elCanvas();
  state.currentPage = Math.max(0, Math.min(n, state.totalPages - 1));

  if (!animate) {
    canvas.classList.add('instant');
    canvas.style.transform = `translateY(-${state.currentPage * state.pageHeight}px)`;
    requestAnimationFrame(() => canvas.classList.remove('instant'));
  } else {
    canvas.style.transform = `translateY(-${state.currentPage * state.pageHeight}px)`;
  }

  updatePageInfo();
  updateNavBtns();
  updateProgressBar();
}

// ===== 翻页：下一页 =====
function nextPage() {
  if (state.currentPage < state.totalPages - 1) {
    goToPage(state.currentPage + 1);
  } else {
    // 最后一页 → 加载下一章
    nextChapter();
  }
}

// ===== 翻页：上一页 =====
function prevPage() {
  if (state.currentPage > 0) {
    goToPage(state.currentPage - 1);
  } else {
    // 第一页 → 加载上一章（跳到最后一页）
    prevChapter();
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
    loadChapter().then(() => goToPage(0, false));
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
    // 加载完后跳到最后一页
    loadChapter().then(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        goToPage(state.totalPages - 1, false);
      }));
    });
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

// ===== 更新底部页码显示 =====
function updatePageInfo() {
  const ch = state.chapters[state.chapterIdx];
  const chTitle = ch?.title || '';

  if (elPageNum()) {
    if (state.totalPages > 0) {
      elPageNum().textContent = `第 ${state.currentPage + 1} 页 / 共 ${state.totalPages} 页`;
    } else {
      elPageNum().textContent = '—';
    }
  }
  if (elPageCh())    elPageCh().textContent = chTitle;
  if (elChTitle())   elChTitle().textContent = chTitle;
}

// ===== 更新按钮状态 =====
function updateNavBtns() {
  const isFirst = state.chapterIdx <= 0 && state.currentPage <= 0;
  const isLast  = state.chapterIdx >= state.chapters.length - 1 && state.currentPage >= state.totalPages - 1;
  if (elPrev()) elPrev().disabled = isFirst;
  if (elNext()) elNext().disabled = isLast;
}

// ===== 进度条 =====
function updateProgressBar() {
  const pct = state.totalPages > 1
    ? (state.currentPage / (state.totalPages - 1)) * 100
    : 100;
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

  document.documentElement.style.setProperty('--reader-font-size',   state.fontSize + 'px');
  document.documentElement.style.setProperty('--reader-line-height',  state.lineHeight);

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
  // 重新分页（保留当前页比例）
  const ratio = state.totalPages > 1 ? state.currentPage / (state.totalPages - 1) : 0;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    calcAndGo(Math.round(ratio * (state.totalPages - 1)));
  }));
}

function changeLineHeight(lh) {
  state.lineHeight = lh;
  Storage.set('reader_lineHeight', lh);
  applyReaderTheme();
  requestAnimationFrame(() => requestAnimationFrame(() => calcAndGo(0)));
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

  // 定位到当前章节
  setTimeout(() => {
    list.querySelectorAll('.chapter-item')[state.chapterIdx]?.scrollIntoView({ block: 'center' });
  }, 60);
}

// ===== 显示页内错误 =====
function showPageError(htmlMsg) {
  elCanvas().style.columnWidth = '';
  elCanvas().style.height      = '';
  elCanvas().style.transform   = '';
  elCanvas().style.width       = '';
  elCanvas().innerHTML = `
    <div class="page-error">
      <span style="font-size:40px">⚠️</span>
      <p>${htmlMsg}</p>
      <button class="btn btn-outline btn-sm" onclick="loadChapter()" style="margin-top:12px">重试</button>
      <a href="index.html" class="btn btn-outline btn-sm" style="margin-top:8px">返回首页</a>
    </div>`;
}

// ===== 绑定所有事件 =====
function bindEvents() {
  // 按钮
  elPrev()?.addEventListener('click', prevPage);
  elNext()?.addEventListener('click', nextPage);
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

  // ── 点击翻页（上1/3 上一页 | 下1/3 下一页 | 中间 显隐导航）──
  elViewport()?.addEventListener('click', e => {
    if (state.settingsOpen) {
      state.settingsOpen = false;
      document.getElementById('settings-panel')?.classList.remove('open');
      return;
    }
    const vh   = elViewport().clientHeight;
    const zone = e.clientY / vh;
    if (zone < 0.3)      prevPage();
    else if (zone > 0.7) nextPage();
    else                 toggleNav();
  });

  // ── 触摸滑动翻页（上下滑）──
  let touchStartX = 0, touchStartY = 0;
  elViewport()?.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  elViewport()?.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 40) {
      dy < 0 ? nextPage() : prevPage();
    }
  }, { passive: true });

  // ── 键盘翻页 ──
  document.addEventListener('keydown', e => {
    if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); nextPage(); }
    if (['ArrowUp',   'ArrowLeft',  'PageUp'].includes(e.key))        { e.preventDefault(); prevPage(); }
  });

  // ── 窗口大小改变重新分页 ──
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      // 保留比例
      const ratio = state.totalPages > 1 ? state.currentPage / (state.totalPages - 1) : 0;
      calcAndGo(Math.round(ratio * Math.max(1, state.totalPages - 1)));
    }, 250);
  });

  // 首次进入提示
  if (!Storage.get('reader_hint_shown')) {
    const hint = document.getElementById('tap-hint');
    if (hint) {
      hint.style.display = 'flex';
      setTimeout(() => hint.remove(), 3000);
    }
    Storage.set('reader_hint_shown', true);
  }
}

document.addEventListener('DOMContentLoaded', init);
