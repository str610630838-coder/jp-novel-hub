'use strict';

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
};

// ===== 初始化 =====
async function init() {
  initTheme();

  // 读取偏好
  state.fontSize = Storage.get('reader_fontSize', 17);
  state.lineHeight = Storage.get('reader_lineHeight', 2.0);
  state.readerTheme = Storage.get('reader_theme', 'dark');

  const params = getParams();
  state.source = params.source || '';
  state.novelId = decodeURIComponent(params.id || '');
  state.chapterId = params.chapter ? decodeURIComponent(params.chapter) : null;
  state.chapterIdx = parseInt(params.idx) || 0;

  if (!state.source || !state.novelId) {
    showError('参数错误');
    return;
  }

  // 应用阅读器设置
  applyReaderSettings();

  // 绑定 UI 事件
  bindEvents();

  // 先获取章节列表（用于上下章导航）
  try {
    const info = await getChapterList(state.source, state.novelId);
    state.chapters = info.chapters || [];
    document.getElementById('novel-back-title').textContent = info.title || '返回';
    updateNavInfo();
  } catch (e) {
    console.warn('获取目录失败:', e);
  }

  // 加载章节内容
  await loadChapter();
}

// ===== 加载章节 =====
async function loadChapter() {
  const content = document.getElementById('reader-content');
  const heading = document.getElementById('chapter-heading');

  content.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><span>加载中…</span></div>';
  heading.textContent = '';
  document.getElementById('progress-fill').style.width = '0%';

  try {
    const chId = state.chapterId === 'null' || state.chapterId === '' ? null : state.chapterId;
    const data = await getChapterContent(state.source, state.novelId, chId);

    heading.textContent = data.title || '';
    document.title = data.title ? `${data.title} - 日文小说` : '日文小说';

    let html = '';
    if (data.preface) {
      html += `<div class="reader-foreword">${data.preface}</div>`;
      html += '<hr class="reader-section-divider">';
    }
    html += `<div class="reader-body-text">${data.body || '<p>（内容为空）</p>'}</div>`;
    if (data.afterword) {
      html += '<hr class="reader-section-divider">';
      html += `<div class="reader-afterword">${data.afterword}</div>`;
    }
    content.innerHTML = html;

    // 保存阅读进度
    Storage.setReadProgress(state.source, state.novelId, state.chapterId, state.chapterIdx);

    // 滚动到顶
    window.scrollTo({ top: 0, behavior: 'instant' });

    // 更新章节导航
    updateNavInfo();
    updateChapterBtns();

  } catch (err) {
    console.error(err);
    content.innerHTML = `
      <div class="error-state" style="padding:60px 0">
        <span class="emoji">⚠️</span>
        <p>加载失败：${escHtml(String(err.message))}</p>
        <p style="color:var(--text-faint);font-size:12px;margin-top:8px">
          可能是跨域限制，请稍后重试或直接访问原站
        </p>
        <button class="btn btn-outline btn-sm" style="margin-top:16px" onclick="loadChapter()">重试</button>
      </div>`;
  }
}

// ===== 章节导航 =====
function prevChapter() {
  if (state.chapterIdx <= 0) return;
  state.chapterIdx--;
  const ch = state.chapters[state.chapterIdx];
  if (ch) {
    state.chapterId = ch.num || ch.id;
    updateUrl();
    loadChapter();
  }
}

function nextChapter() {
  if (state.chapterIdx >= state.chapters.length - 1) return;
  state.chapterIdx++;
  const ch = state.chapters[state.chapterIdx];
  if (ch) {
    state.chapterId = ch.num || ch.id;
    updateUrl();
    loadChapter();
  }
}

function updateUrl() {
  const qs = new URLSearchParams({
    source: state.source,
    id: state.novelId,
    chapter: state.chapterId || '',
    idx: state.chapterIdx,
  });
  history.replaceState(null, '', '?' + qs.toString());
}

function updateNavInfo() {
  const total = state.chapters.length;
  const info = document.getElementById('nav-chapter-info');
  const chTitle = state.chapters[state.chapterIdx]?.title || '';
  if (info) info.textContent = total > 1 ? `${state.chapterIdx + 1} / ${total}` : chTitle;

  const readerTitle = document.getElementById('reader-chapter-title');
  if (readerTitle) {
    const ch = state.chapters[state.chapterIdx];
    readerTitle.textContent = ch?.title || '';
  }
}

function updateChapterBtns() {
  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');
  if (prevBtn) prevBtn.disabled = state.chapterIdx <= 0;
  if (nextBtn) nextBtn.disabled = state.chapterIdx >= state.chapters.length - 1;
}

// ===== 阅读器设置 =====
function applyReaderSettings() {
  document.documentElement.style.setProperty('--reader-font-size', state.fontSize + 'px');
  document.documentElement.style.setProperty('--reader-line-height', state.lineHeight);

  // 清除旧主题
  document.body.classList.remove('reader-theme-white', 'reader-theme-sepia', 'reader-theme-dark', 'reader-theme-deep');
  document.body.classList.add(`reader-theme-${state.readerTheme}`);
  document.body.style.background = 'var(--reader-bg)';

  const fsDisplay = document.getElementById('font-size-display');
  if (fsDisplay) fsDisplay.textContent = state.fontSize + 'px';

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
  applyReaderSettings();
}

function changeLineHeight(lh) {
  state.lineHeight = lh;
  Storage.set('reader_lineHeight', lh);
  applyReaderSettings();
}

function changeReaderTheme(theme) {
  state.readerTheme = theme;
  Storage.set('reader_theme', theme);
  applyReaderSettings();
}

// ===== 阅读进度条 =====
function updateProgress() {
  const scrolled = window.scrollY;
  const total = document.documentElement.scrollHeight - window.innerHeight;
  const pct = total > 0 ? (scrolled / total) * 100 : 0;
  const fill = document.getElementById('progress-fill');
  if (fill) fill.style.width = pct.toFixed(1) + '%';
}

// ===== 自动隐藏导航栏 =====
let lastScrollY = 0;
let hideTimer = null;
function handleScroll() {
  updateProgress();
  const diff = window.scrollY - lastScrollY;
  lastScrollY = window.scrollY;

  if (diff > 30) {
    setNavVisible(false);
  } else if (diff < -20 || window.scrollY < 80) {
    setNavVisible(true);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => setNavVisible(false), 4000);
  }
}

function setNavVisible(v) {
  state.navVisible = v;
  document.querySelector('.reader-nav')?.classList.toggle('hidden', !v);
  document.querySelector('.reader-bottom-nav')?.classList.toggle('hidden', !v);
}

// ===== 章节目录弹窗 =====
function openTocModal() {
  let modal = document.getElementById('toc-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'toc-modal';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:200;
      background:rgba(0,0,0,0.7);
      display:flex;align-items:flex-end;
    `;
    modal.innerHTML = `
      <div style="
        background:var(--surface);
        border-radius:16px 16px 0 0;
        width:100%;max-height:70vh;
        overflow-y:auto;
        padding:20px;
        border-top:1px solid var(--border);
      ">
        <div style="font-size:15px;font-weight:600;margin-bottom:16px">目录</div>
        <div id="toc-list" class="chapter-list"></div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  const list = document.getElementById('toc-list');
  list.innerHTML = '';
  state.chapters.forEach((ch, idx) => {
    const item = document.createElement('div');
    item.className = 'chapter-item' + (idx === state.chapterIdx ? ' read' : '');
    item.innerHTML = `
      <span class="chapter-num">${ch.num || idx + 1}</span>
      <span class="chapter-title-text">${escHtml(ch.title)}</span>`;
    item.style.background = idx === state.chapterIdx ? 'var(--surface2)' : '';
    item.addEventListener('click', () => {
      state.chapterIdx = idx;
      state.chapterId = ch.num || ch.id;
      updateUrl();
      loadChapter();
      modal.remove();
    });
    list.appendChild(item);
  });

  // 滚动到当前章节
  setTimeout(() => {
    const items = list.querySelectorAll('.chapter-item');
    items[state.chapterIdx]?.scrollIntoView({ block: 'center' });
  }, 50);
}

// ===== 绑定事件 =====
function bindEvents() {
  document.getElementById('btn-prev')?.addEventListener('click', prevChapter);
  document.getElementById('btn-next')?.addEventListener('click', nextChapter);

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

  window.addEventListener('scroll', handleScroll, { passive: true });

  // 点击内容区显示/隐藏导航
  document.getElementById('reader-content')?.addEventListener('click', () => {
    setNavVisible(!state.navVisible);
  });
}

function showError(msg) {
  document.getElementById('reader-content').innerHTML = `
    <div class="error-state" style="padding:80px 0">
      <span class="emoji">⚠️</span>
      <p>${escHtml(msg)}</p>
      <a href="index.html" class="btn btn-outline btn-sm">返回首页</a>
    </div>`;
}

document.addEventListener('DOMContentLoaded', init);
