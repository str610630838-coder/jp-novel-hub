'use strict';

const CONFIG = {
  proxies: [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest=',
  ],

  sources: {
    narou: {
      id: 'narou',
      name: '小説家になろう',
      shortName: 'なろう',
      color: '#2196f3',
      className: 'narou',
      emoji: '📘',
      apiBase: 'https://api.syosetu.com/novelapi/api/',
      readerBase: 'https://ncode.syosetu.com/',
    },
    aozora: {
      id: 'aozora',
      name: '青空文庫',
      shortName: '青空文庫',
      color: '#4caf50',
      className: 'aozora',
      emoji: '🍃',
      searchBase: 'https://www.aozora.gr.jp/search/search.php',
      cardBase: 'https://www.aozora.gr.jp',
    },
    kakuyomu: {
      id: 'kakuyomu',
      name: 'カクヨム',
      shortName: 'カクヨム',
      color: '#e91e63',
      className: 'kakuyomu',
      emoji: '📗',
      searchBase: 'https://kakuyomu.jp/search',
      readerBase: 'https://kakuyomu.jp',
    },
    hameln: {
      id: 'hameln',
      name: 'ハーメルン',
      shortName: 'ハーメルン',
      color: '#ff9800',
      className: 'hameln',
      emoji: '📙',
      searchBase: 'https://syosetu.org/search.php',
      readerBase: 'https://syosetu.org',
    },
  },

  narouBigGenres: {
    1: '恋愛', 2: 'ファンタジー', 3: '文芸',
    4: 'SF', 98: 'その他', 99: 'ノンジャンル',
  },

  narouGenres: {
    101: '異世界転生', 102: '異世界転移',
    201: '現代ファンタジー', 202: '現実世界',
    301: 'SF', 302: '宇宙・時代',
    401: '恋愛・異世界', 402: '恋愛・現実',
    9901: 'その他',
  },

  narouOrders: {
    'weekly': '本周排行',
    'hyoka': '综合评分',
    'new': '最新更新',
    'favnovelcnt': '收藏数',
    'impressioncnt': '感想数',
  },
};
