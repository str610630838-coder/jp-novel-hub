'use strict';

let currentSource = 'narou';
let currentPage = 1;
let currentKeyword = '';
let currentOrder = 'weekly';
let isLoading = false;

const grid = document.getElementById('novel-grid');
const pagination = document.getElementById('pagination');
const resultsTitle = document.getElementById('results-title');
const sortSelect = document.getElementById('sort-select');

function init() {
  initTheme();

  // 主题切换
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // 来源标签
  document.querySelectorAll('.source-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentSource = tab.dataset.source;
      currentPage = 1;

      // 只有 naろう 支持排序
      const sortGroup = document.getElementById('sort-group');
      if (sortGroup) sortGroup.style.visibility = currentSource === 'narou' ? 'visible' : 'hidden';

      loadNovels();
    });
  });

  // 搜索
  const mainSearch = document.getElementById('main-search');
  const searchBtn = document.getElementById('search-btn');
  const navSearch = document.getElementById('nav-search-input');
  const navSearchBtn = document.getElementById('nav-search-btn');

  function doSearch(kw) {
    currentKeyword = kw.trim();
    currentPage = 1;
    if (mainSearch) mainSearch.value = currentKeyword;
    if (navSearch) navSearch.value = currentKeyword;
    loadNovels();
  }

  searchBtn?.addEventListener('click', () => doSearch(mainSearch.value));
  mainSearch?.addEventListener('keydown', e => e.key === 'Enter' && doSearch(mainSearch.value));
  navSearchBtn?.addEventListener('click', () => doSearch(navSearch.value));
  navSearch?.addEventListener('keydown', e => e.key === 'Enter' && doSearch(navSearch.value));

  // 排序
  sortSelect?.addEventListener('change', () => {
    currentOrder = sortSelect.value;
    currentPage = 1;
    loadNovels();
  });

  // URL 恢复搜索
  const params = getParams();
  if (params.q) {
    currentKeyword = params.q;
    if (mainSearch) mainSearch.value = currentKeyword;
    if (navSearch) navSearch.value = currentKeyword;
  }
  if (params.source && CONFIG.sources[params.source]) {
    currentSource = params.source;
    document.querySelectorAll('.source-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.source === currentSource);
    });
  }

  loadNovels();
}

async function loadNovels() {
  if (isLoading) return;
  isLoading = true;

  // 更新 URL
  const qs = new URLSearchParams();
  if (currentKeyword) qs.set('q', currentKeyword);
  if (currentSource !== 'narou') qs.set('source', currentSource);
  history.replaceState(null, '', '?' + qs.toString());

  renderLoading(grid);
  pagination.innerHTML = '';

  const srcName = CONFIG.sources[currentSource]?.name || currentSource;
  if (currentKeyword) {
    resultsTitle.textContent = `"${currentKeyword}" 的搜索结果 · ${srcName}`;
  } else {
    const orderName = CONFIG.narouOrders?.[currentOrder] || '热门';
    resultsTitle.textContent = `${srcName} · ${orderName}`;
  }

  try {
    const opts = { page: currentPage, order: currentOrder, lim: 20 };
    const result = await searchNovels(currentSource, currentKeyword, opts);

    if (!result.novels || result.novels.length === 0) {
      renderEmpty(grid, currentKeyword ? `没有找到"${currentKeyword}"相关结果` : '暂无内容');
      isLoading = false;
      return;
    }

    grid.innerHTML = '';
    result.novels.forEach(novel => grid.appendChild(renderNovelCard(novel)));

    renderPagination(pagination, currentPage, result.total, 20, (p) => {
      currentPage = p;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      loadNovels();
    });

  } catch (err) {
    console.error(err);
    renderError(grid, `加载失败：${err.message || '网络错误，请稍后重试'}`);
  } finally {
    isLoading = false;
  }
}

document.addEventListener('DOMContentLoaded', init);
