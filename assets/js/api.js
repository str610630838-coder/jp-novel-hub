'use strict';

// ===== 代理请求 =====
async function proxyFetch(url, proxyIndex = 0) {
  const proxies = CONFIG.proxies;
  const errors = [];

  for (let i = proxyIndex; i < proxies.length; i++) {
    try {
      const proxyUrl = proxies[i] + encodeURIComponent(url);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(proxyUrl, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      errors.push(`Proxy ${i}: HTTP ${res.status}`);
    } catch (e) {
      errors.push(`Proxy ${i}: ${e.message}`);
    }
  }
  throw new Error(`请求失败: ${errors.join(' | ')}`);
}

async function proxyFetchText(url) {
  const res = await proxyFetch(url);
  return res.text();
}

function parseDoc(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

// ===== なろう API =====
const NarouAPI = {
  async search(keyword, opts = {}) {
    const { page = 1, order = 'weekly', lim = 20 } = opts;
    const params = new URLSearchParams({
      out: 'json',
      order,
      lim,
      st: (page - 1) * lim + 1,
      of: 't-w-s-l-n-gf-g-k-ga-e-u',
    });
    if (keyword && keyword.trim()) params.set('word', keyword.trim());

    const url = `${CONFIG.sources.narou.apiBase}?${params}`;
    const res = await proxyFetch(url);
    const text = await res.text();

    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error('なろうAPI返回数据格式错误'); }

    if (!Array.isArray(data) || data.length < 1) throw new Error('なろうAPI响应异常');

    return {
      total: data[0].allcount || 0,
      novels: data.slice(1).map(n => ({
        id: (n.ncode || '').toLowerCase(),
        title: n.title || '(无标题)',
        author: n.writer || '未知作者',
        synopsis: n.story || '',
        wordCount: n.length || 0,
        chapterCount: n.general_all_no || 1,
        genre: CONFIG.narouGenres[n.genre] || CONFIG.narouBigGenres[n.biggenre] || 'その他',
        tags: (n.keyword || '').split(/[\s　]/).filter(Boolean).slice(0, 6),
        isComplete: n.end === 1,
        isSingle: n.noveltype === 2,
        userId: n.userid,
        source: 'narou',
        updatedAt: n.general_lastup || '',
      })),
    };
  },

  _parseChaptersFromDoc(doc, chapters, chapterTitleRef) {
    let currentChapterTitle = chapterTitleRef.value || '';

    const newList = doc.querySelectorAll('.p-eplist > *');
    if (newList.length > 0) {
      newList.forEach(el => {
        if (el.matches('.p-eplist__chapter-title')) {
          currentChapterTitle = el.textContent.trim();
        } else if (el.matches('.p-eplist__sublist')) {
          const link = el.querySelector('a.p-eplist__subtitle, a');
          if (link) {
            const m = (link.getAttribute('href') || '').match(/\/(\d+)\/?$/);
            chapters.push({
              num: m ? parseInt(m[1]) : chapters.length + 1,
              title: link.textContent.trim(),
              chapterTitle: currentChapterTitle,
            });
          }
        }
      });
    } else {
      doc.querySelectorAll('.novel_sublist2 > *').forEach(el => {
        if (el.matches('.chapter_title')) {
          currentChapterTitle = el.textContent.trim();
        } else if (el.matches('.subtitle')) {
          const link = el.querySelector('a');
          if (link) {
            const m = (link.getAttribute('href') || '').match(/\/(\d+)\/?$/);
            chapters.push({
              num: m ? parseInt(m[1]) : chapters.length + 1,
              title: link.textContent.trim(),
              chapterTitle: currentChapterTitle,
            });
          }
        }
      });
    }

    chapterTitleRef.value = currentChapterTitle;
  },

  async getChapterList(ncode) {
    const baseUrl = `${CONFIG.sources.narou.readerBase}${ncode}/`;
    const html = await proxyFetchText(baseUrl);
    const doc = parseDoc(html);

    const title = doc.querySelector('.p-novel__title, .novel_title')?.textContent?.trim() || '';
    const authorEl = doc.querySelector('.p-novel__author a, .p-novel__author, .novel_writername a, .novel_writername');
    const author = authorEl?.textContent?.trim() || '';
    const synopsis = doc.querySelector('.p-novel__summary, #novel_ex')?.textContent?.trim() || '';

    // 短篇：新版用 .p-novel__body，旧版用 #novel_honbun
    const isSingle = !!doc.querySelector('.p-novel__body, #novel_honbun');
    if (isSingle) {
      return { title, author, synopsis, isSingle: true, chapters: [{ num: null, title, chapterTitle: '' }] };
    }

    const chapters = [];
    const chapterTitleRef = { value: '' };
    this._parseChaptersFromDoc(doc, chapters, chapterTitleRef);

    // 处理分页：获取最后一页编号
    const lastPageLink = doc.querySelector('.c-pager__item--last');
    if (lastPageLink) {
      const lastHref = lastPageLink.getAttribute('href') || '';
      const lastPageM = lastHref.match(/[?&]p=(\d+)/);
      const totalPages = lastPageM ? parseInt(lastPageM[1]) : 1;

      if (totalPages > 1) {
        const pagePromises = [];
        for (let p = 2; p <= totalPages; p++) {
          pagePromises.push(proxyFetchText(`${baseUrl}?p=${p}`));
        }
        const pageHtmls = await Promise.all(pagePromises);
        pageHtmls.forEach(ph => {
          this._parseChaptersFromDoc(parseDoc(ph), chapters, chapterTitleRef);
        });
      }
    }

    return { title, author, synopsis, isSingle: false, chapters };
  },

  async getChapterContent(ncode, chapterNum) {
    const base = CONFIG.sources.narou.readerBase;
    const url = chapterNum ? `${base}${ncode}/${chapterNum}/` : `${base}${ncode}/`;
    const html = await proxyFetchText(url);
    const doc = parseDoc(html);

    const title = doc.querySelector('.p-novel__title--rensai, .p-novel__title, .novel_subtitle, .novel_title')?.textContent?.trim() || '';
    const sanitize = (el) => {
      if (!el) return '';
      el.querySelectorAll('script, style, [id^="ad"], .novel_bn, .ss').forEach(e => e.remove());
      return el.innerHTML;
    };

    // 新版：正文 = .p-novel__text（排除后记），后记 = .p-novel__text--afterword
    const newBody = doc.querySelector('.js-novel-text.p-novel__text:not(.p-novel__text--afterword), .p-novel__text:not(.p-novel__text--afterword)');
    const newAfterword = doc.querySelector('.p-novel__text--afterword');

    return {
      title,
      preface: sanitize(doc.querySelector('#novel_p')),
      body: sanitize(newBody || doc.querySelector('#novel_honbun')),
      afterword: sanitize(newAfterword || doc.querySelector('#novel_a')),
    };
  },
};

// ===== 青空文庫 API =====
const AozoraAPI = {
  async search(keyword, opts = {}) {
    const { page = 1 } = opts;
    const url = `${CONFIG.sources.aozora.searchBase}?option=1&keyword=${encodeURIComponent(keyword || '夏目漱石')}`;
    const html = await proxyFetchText(url);
    const doc = parseDoc(html);

    const novels = [];
    doc.querySelectorAll('table.list tr, table tr').forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        const titleLink = cells[0]?.querySelector('a');
        const authorLink = cells[1]?.querySelector('a');
        if (!titleLink) return;
        const href = titleLink.getAttribute('href') || '';
        const m = href.match(/\/cards\/(\d+)\/card(\d+)\.html/);
        if (!m) return;
        novels.push({
          id: `${m[1]}-${m[2]}`,
          personId: m[1],
          bookId: m[2],
          title: titleLink.textContent.trim(),
          author: authorLink?.textContent?.trim() || '',
          synopsis: '',
          wordCount: 0,
          chapterCount: 1,
          tags: ['公有领域', '青空文庫'],
          isComplete: true,
          source: 'aozora',
        });
      }
    });

    const perPage = 20;
    const start = (page - 1) * perPage;
    return {
      total: novels.length,
      novels: novels.slice(start, start + perPage),
    };
  },

  async getBookInfo(personId, bookId) {
    const url = `${CONFIG.sources.aozora.cardBase}/cards/${personId}/card${bookId}.html`;
    const html = await proxyFetchText(url);
    const doc = parseDoc(html);

    const title = doc.querySelector('.title')?.textContent?.trim() || '';
    const author = doc.querySelector('.author')?.textContent?.trim() || '';
    const note = doc.querySelector('.bibliographic_note, .notes')?.textContent?.trim() || '';

    // 找到 HTML 版本链接
    const textLink = [...doc.querySelectorAll('a')].find(a => {
      const h = a.getAttribute('href') || '';
      return h.includes('/files/') && h.endsWith('.html');
    });

    let textUrl = null;
    if (textLink) {
      const h = textLink.getAttribute('href');
      textUrl = h.startsWith('http') ? h : `${CONFIG.sources.aozora.cardBase}/cards/${personId}/${h.replace(/^\.\//, '')}`;
    }

    return {
      title,
      author,
      synopsis: note,
      textUrl,
      isSingle: true,
      chapters: [{ num: null, id: 'main', title: title || '正文', chapterTitle: '' }],
    };
  },

  async getContent(textUrl) {
    const html = await proxyFetchText(textUrl);
    const doc = parseDoc(html);

    const mainText = doc.querySelector('.main_text') || doc.querySelector('#honbun') || doc.querySelector('body');
    mainText?.querySelectorAll('script, style, .bibliographical_note').forEach(e => e.remove());

    return {
      title: doc.querySelector('.title')?.textContent?.trim() || '',
      author: doc.querySelector('.author')?.textContent?.trim() || '',
      body: mainText?.innerHTML || '',
    };
  },
};

// ===== カクヨム API =====
const KakuyomuAPI = {
  async search(keyword, opts = {}) {
    const { page = 1 } = opts;
    const url = `${CONFIG.sources.kakuyomu.searchBase}?genre_name=all&order=weekly_review_count&q=${encodeURIComponent(keyword || '')}`;
    const html = await proxyFetchText(url);
    const doc = parseDoc(html);

    const novels = [];

    // 尝试从 __NEXT_DATA__ 解析
    const nextDataEl = doc.querySelector('#__NEXT_DATA__');
    if (nextDataEl) {
      try {
        const data = JSON.parse(nextDataEl.textContent);
        const works =
          data?.props?.pageProps?.works ||
          data?.props?.pageProps?.searchResult?.works ||
          data?.props?.pageProps?.queryOptions?.works || [];

        works.forEach(w => {
          if (!w.id && !w.workId) return;
          novels.push({
            id: w.id || w.workId,
            title: w.title || '(無題)',
            author: w.author?.activityName || w.author?.name || '',
            synopsis: w.introduction || w.catchphrase || '',
            wordCount: w.totalCharacterCount || 0,
            chapterCount: w.episodeCount || 0,
            tags: (w.tagLabels || []).slice(0, 5),
            isComplete: w.workStatus === 'COMPLETED',
            source: 'kakuyomu',
          });
        });
      } catch (e) {
        console.warn('カクヨム __NEXT_DATA__ parse error:', e);
      }
    }

    // Fallback: 解析 HTML
    if (novels.length === 0) {
      doc.querySelectorAll('[class*="WorkCard"], [class*="work-card"], .searchCard').forEach(card => {
        const a = card.querySelector('a[href*="/works/"]');
        if (!a) return;
        const m = (a.getAttribute('href') || '').match(/\/works\/(\d+)/);
        if (!m) return;
        const title = a.textContent.trim() || card.querySelector('[class*="Title"]')?.textContent?.trim() || '';
        novels.push({
          id: m[1],
          title,
          author: card.querySelector('[class*="Author"], [class*="author"]')?.textContent?.trim() || '',
          synopsis: card.querySelector('[class*="introduction"], [class*="catchphrase"]')?.textContent?.trim() || '',
          tags: [],
          source: 'kakuyomu',
        });
      });
    }

    return { total: novels.length > 0 ? novels.length * 5 : 0, novels };
  },

  async getChapterList(workId) {
    const url = `${CONFIG.sources.kakuyomu.readerBase}/works/${workId}`;
    const html = await proxyFetchText(url);
    const doc = parseDoc(html);

    let title = doc.querySelector('h1')?.textContent?.trim() || '';
    const chapters = [];

    const nextDataEl = doc.querySelector('#__NEXT_DATA__');
    if (nextDataEl) {
      try {
        const data = JSON.parse(nextDataEl.textContent);
        const pp = data?.props?.pageProps;
        title = pp?.work?.title || title;
        const toc = pp?.tableOfContents || pp?.work?.tableOfContents || [];
        toc.forEach(section => {
          const eps = section.episodeUnions || section.episodes || [];
          eps.forEach(ep => {
            chapters.push({
              id: ep.id || ep.episodeId,
              title: ep.title || '',
              chapterTitle: section.title || '',
            });
          });
        });
      } catch (e) {
        console.warn('カクヨム TOC parse error:', e);
      }
    }

    return { title, chapters };
  },

  async getChapterContent(workId, episodeId) {
    const url = `${CONFIG.sources.kakuyomu.readerBase}/works/${workId}/episodes/${episodeId}`;
    const html = await proxyFetchText(url);
    const doc = parseDoc(html);

    const title = doc.querySelector('h1, [class*="EpisodeTitle"], [class*="episode-title"]')?.textContent?.trim() || '';
    const body = doc.querySelector('[class*="episodeBody"], [class*="EpisodeBody"], .widget-episodeBody, #content-main');
    body?.querySelectorAll('script, style').forEach(e => e.remove());

    return { title, preface: '', body: body?.innerHTML || '', afterword: '' };
  },
};

// ===== ハーメルン API =====
const HamelnAPI = {
  async search(keyword, opts = {}) {
    const { page = 1 } = opts;
    const url = `${CONFIG.sources.hameln.searchBase}?search=${encodeURIComponent(keyword || '')}&page=${page}`;
    const html = await proxyFetchText(url);
    const doc = parseDoc(html);

    const novels = [];
    doc.querySelectorAll('.novel_list_item, .search_list li, .list_body li').forEach(item => {
      const titleEl = item.querySelector('a.title, a[href*="/novel/"]');
      if (!titleEl) return;
      const m = (titleEl.getAttribute('href') || '').match(/\/novel\/(\d+)\//);
      if (!m) return;
      novels.push({
        id: m[1],
        title: titleEl.textContent.trim(),
        author: item.querySelector('.author a, .author')?.textContent?.trim() || '',
        synopsis: item.querySelector('.ex, .description')?.textContent?.trim() || '',
        tags: [],
        source: 'hameln',
      });
    });

    return { total: novels.length > 0 ? novels.length * 3 : 0, novels };
  },

  async getChapterList(novelId) {
    const url = `${CONFIG.sources.hameln.readerBase}/novel/${novelId}/`;
    const html = await proxyFetchText(url);
    const doc = parseDoc(html);

    const title = doc.querySelector('.novel_title, h1')?.textContent?.trim() || '';
    const chapters = [];

    doc.querySelectorAll('.chapter_wrap .ss a, #ss a').forEach((a, idx) => {
      const m = (a.getAttribute('href') || '').match(/\/(\d+)\.html$/);
      if (m) {
        chapters.push({ num: parseInt(m[1]), title: a.textContent.trim(), chapterTitle: '' });
      }
    });

    return { title, chapters };
  },

  async getChapterContent(novelId, chapterNum) {
    const url = `${CONFIG.sources.hameln.readerBase}/novel/${novelId}/${chapterNum}.html`;
    const html = await proxyFetchText(url);
    const doc = parseDoc(html);

    const title = doc.querySelector('.chapter_title, h1, .novel_subtitle')?.textContent?.trim() || '';
    const body = doc.querySelector('#honbun, .novel_body, .ss_body');
    body?.querySelectorAll('script, style').forEach(e => e.remove());

    return { title, preface: '', body: body?.innerHTML || '', afterword: '' };
  },
};

// ===== 统一接口 =====
async function searchNovels(source, keyword, opts = {}) {
  switch (source) {
    case 'narou':    return NarouAPI.search(keyword, opts);
    case 'aozora':   return AozoraAPI.search(keyword, opts);
    case 'kakuyomu': return KakuyomuAPI.search(keyword, opts);
    case 'hameln':   return HamelnAPI.search(keyword, opts);
    default: throw new Error(`未知来源: ${source}`);
  }
}

async function getChapterList(source, id) {
  switch (source) {
    case 'narou':    return NarouAPI.getChapterList(id);
    case 'aozora': {
      const [personId, bookId] = id.split('-');
      return AozoraAPI.getBookInfo(personId, bookId);
    }
    case 'kakuyomu': return KakuyomuAPI.getChapterList(id);
    case 'hameln':   return HamelnAPI.getChapterList(id);
    default: throw new Error(`未知来源: ${source}`);
  }
}

async function getChapterContent(source, novelId, chapterId) {
  switch (source) {
    case 'narou':    return NarouAPI.getChapterContent(novelId, chapterId);
    case 'aozora': {
      const [personId, bookId] = novelId.split('-');
      const info = await AozoraAPI.getBookInfo(personId, bookId);
      if (!info.textUrl) throw new Error('找不到青空文庫文本文件');
      const content = await AozoraAPI.getContent(info.textUrl);
      return { title: content.title, preface: '', body: content.body, afterword: '' };
    }
    case 'kakuyomu': return KakuyomuAPI.getChapterContent(novelId, chapterId);
    case 'hameln':   return HamelnAPI.getChapterContent(novelId, chapterId);
    default: throw new Error(`未知来源: ${source}`);
  }
}
