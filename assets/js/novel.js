'use strict';

let novelData = null;
let allChapters = [];
let chapterPage = 1;
const CHAPTERS_PER_PAGE = 50;

async function init() {
  initTheme();
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

  const { source, id } = getParams();
  if (!source || !id) {
    document.body.innerHTML = '<div style="text-align:center;padding:80px;color:var(--text-muted)">参数错误，请从首页进入</div>';
    return;
  }

  document.title = '加载中… - 日文小说';
  renderSkeletonDetail();

  try {
    const info = await getChapterList(source, id);
    novelData = { ...info, source, id };
    allChapters = info.chapters || [];
    renderDetail(novelData);
    renderChapters(1);
  } catch (err) {
    console.error(err);
    document.getElementById('novel-detail').innerHTML = `
      <div class="error-state" style="padding:80px 20px">
        <span class="emoji">⚠️</span>
        <p>加载失败：${escHtml(String(err.message))}</p>
        <a href="index.html" class="btn btn-outline btn-sm">返回首页</a>
      </div>`;
  }
}

function renderSkeletonDetail() {
  document.getElementById('novel-detail').innerHTML = `
    <div class="loading-wrap" style="padding:80px">
      <div class="spinner"></div>
      <span>正在获取小说信息…</span>
    </div>`;
}

function renderDetail(data) {
  const { source, id, title, author, synopsis, isSingle, chapters } = data;
  const src = CONFIG.sources[source] || {};
  const coverColor = getCoverColor(id);
  const progress = Storage.getReadProgress(source, id);

  document.title = `${title} - 日文小说`;

  const wordCount = data.wordCount || 0;
  const chapterCount = chapters.length;

  document.getElementById('novel-detail').innerHTML = `
    <a href="index.html" class="back-link">← 返回首页</a>

    <div class="novel-header">
      <div class="novel-cover" style="background:${coverColor}">${src.emoji || '📖'}</div>
      <div class="novel-meta">
        <span class="novel-source-badge badge-${source}">${src.name || source}</span>
        <h1 class="novel-title">${escHtml(title)}</h1>
        <div class="novel-author">✍️ ${escHtml(author || '未知作者')}</div>

        <div class="novel-stats">
          ${wordCount ? `<div class="stat-item"><span class="stat-label">字数</span><span class="stat-value">${fmtNum(wordCount)}</span></div>` : ''}
          ${chapterCount ? `<div class="stat-item"><span class="stat-label">章节数</span><span class="stat-value">${chapterCount} 话</span></div>` : ''}
          ${data.isComplete ? `<div class="stat-item"><span class="stat-label">状态</span><span class="stat-value" style="color:var(--success)">✓ 完结</span></div>` : ''}
          ${data.updatedAt ? `<div class="stat-item"><span class="stat-label">更新</span><span class="stat-value">${fmtDate(data.updatedAt)}</span></div>` : ''}
        </div>

        <div class="novel-actions">
          <button class="btn" id="btn-start-read">
            ${progress.chapter && !isSingle ? '继续阅读' : '开始阅读'}
          </button>
          <a href="${getSourceUrl(source, id)}" target="_blank" class="btn btn-outline btn-sm">
            原站查看 ↗
          </a>
        </div>
      </div>
    </div>

    ${synopsis ? `
      <div>
        <div class="section-title">📋 简介</div>
        <div class="novel-synopsis-box">${escHtml(synopsis)}</div>
      </div>` : ''}

    <div id="chapter-section">
      <div class="section-title">📑 章节目录
        <span style="font-size:12px;color:var(--text-muted);font-weight:400">共 ${chapterCount} 话</span>
      </div>
      <div class="chapter-list" id="chapter-list"></div>
      <div class="pagination" id="chapter-pagination"></div>
    </div>`;

  document.getElementById('btn-start-read').addEventListener('click', () => {
    if (isSingle) {
      goToReader(source, id, null, 0);
    } else {
      const prog = Storage.getReadProgress(source, id);
      const idx = prog.chapterIdx || 0;
      const ch = allChapters[idx] || allChapters[0];
      if (ch) goToReader(source, id, ch.num || ch.id, idx);
    }
  });
}

function renderChapters(page) {
  chapterPage = page;
  const list = document.getElementById('chapter-list');
  const pag = document.getElementById('chapter-pagination');
  if (!list) return;

  const start = (page - 1) * CHAPTERS_PER_PAGE;
  const slice = allChapters.slice(start, start + CHAPTERS_PER_PAGE);
  const progress = Storage.getReadProgress(novelData.source, novelData.id);

  list.innerHTML = '';
  let lastChapterTitle = '';

  slice.forEach((ch, localIdx) => {
    const globalIdx = start + localIdx;

    if (ch.chapterTitle && ch.chapterTitle !== lastChapterTitle) {
      lastChapterTitle = ch.chapterTitle;
      const groupEl = document.createElement('div');
      groupEl.className = 'chapter-group-title';
      groupEl.textContent = ch.chapterTitle;
      list.appendChild(groupEl);
    }

    const item = document.createElement('div');
    item.className = 'chapter-item' + (globalIdx < (progress.chapterIdx || 0) ? ' read' : '');
    item.innerHTML = `
      <span class="chapter-num">${ch.num || (globalIdx + 1)}</span>
      <span class="chapter-title-text">${escHtml(ch.title)}</span>`;
    item.addEventListener('click', () => goToReader(novelData.source, novelData.id, ch.num || ch.id, globalIdx));
    list.appendChild(item);
  });

  renderPagination(pag, page, allChapters.length, CHAPTERS_PER_PAGE, (p) => {
    renderChapters(p);
    document.getElementById('chapter-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function goToReader(source, id, chapterId, chapterIdx) {
  const url = `reader.html?source=${source}&id=${encodeURIComponent(id)}&chapter=${encodeURIComponent(chapterId || '')}&idx=${chapterIdx}`;
  location.href = url;
}

function getSourceUrl(source, id) {
  switch (source) {
    case 'narou':    return `https://ncode.syosetu.com/${id}/`;
    case 'aozora': {
      const [p, b] = id.split('-');
      return `https://www.aozora.gr.jp/cards/${p}/card${b}.html`;
    }
    case 'kakuyomu': return `https://kakuyomu.jp/works/${id}`;
    case 'hameln':   return `https://syosetu.org/novel/${id}/`;
    default: return '#';
  }
}

document.addEventListener('DOMContentLoaded', init);
