// 수집 대상 커뮤니티 정의.
// 각 소스는 "베스트/인기글 목록 페이지" 한 곳만 읽고, 제목·링크·수치만 추출한다(본문·이미지는 가져오지 않음).
// parse($)는 [{ title, url, comments, views, likes }] 를 목록 순서(=해당 사이트 내 순위)대로 반환한다.

const num = (s) => {
  const m = String(s ?? '').replace(/,/g, '').match(/\d+/);
  return m ? Number(m[0]) : null;
};
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export const sources = [
  {
    id: 'dcinside',
    name: '디시인사이드',
    board: '실시간 베스트',
    color: '#3b4890',
    home: 'https://gall.dcinside.com/board/lists/?id=dcbest',
    url: 'https://gall.dcinside.com/board/lists/?id=dcbest',
    parse($) {
      return $('tr.ub-content[data-no]').toArray().flatMap((el) => {
        const $el = $(el);
        if (/notice/.test($el.attr('data-type') || '')) return [];
        if (!/^\d+$/.test(clean($el.find('.gall_num').text()))) return [];
        const a = $el.find('td.gall_tit > a').first();
        return [{
          title: clean(a.text()),
          url: a.attr('href'),
          comments: num($el.find('.reply_num').text()),
          views: num($el.find('.gall_count').text()),
          likes: num($el.find('.gall_recommend').text()),
        }];
      });
    },
  },
  {
    id: 'ruliweb',
    name: '루리웹',
    board: '유머 베스트',
    color: '#1a70dc',
    home: 'https://bbs.ruliweb.com/best/humor_only',
    url: 'https://bbs.ruliweb.com/best/humor_only',
    parse($) {
      return $('tr.table_body').toArray().flatMap((el) => {
        const $el = $(el);
        const a = $el.find('a.subject_link').first();
        if (!/^\/best\//.test(a.attr('href') || '')) return []; // 장터·광고 고정글 제외
        return [{
          title: clean(a.find('.text_over').first().text()),
          url: (a.attr('href') || '').replace(/\?.*$/, ''),
          comments: num($el.find('.num_reply').text()),
          views: num($el.find('td.hit').text()),
          likes: num($el.find('td.recomd').text()),
        }];
      });
    },
  },
  {
    id: 'inven',
    name: '인벤',
    board: '오픈이슈갤러리 추천글',
    color: '#c0392b',
    home: 'https://www.inven.co.kr/board/webzine/2097?my=chu',
    url: 'https://www.inven.co.kr/board/webzine/2097?my=chu',
    parse($) {
      return $('div.board-list table tbody tr').toArray().flatMap((el) => {
        const $el = $(el);
        if ($el.hasClass('notice')) return [];
        const a = $el.find('a.subject-link').first();
        if (!a.length) return [];
        const title = a.clone();
        title.find('.category').remove();
        return [{
          title: clean(title.text()),
          url: (a.attr('href') || '').replace(/\?.*$/, ''),
          comments: num($el.find('.con-comment').text()),
          views: num($el.find('td.view').text()),
          likes: num($el.find('td.reco').text()),
        }];
      });
    },
  },
  {
    id: 'bobaedream',
    name: '보배드림',
    board: '베스트글',
    color: '#0a56a5',
    home: 'https://www.bobaedream.co.kr/list?code=best',
    url: 'https://www.bobaedream.co.kr/list?code=best',
    parse($) {
      return $('table#boardlist tbody tr').toArray().flatMap((el) => {
        const $el = $(el);
        const a = $el.find('a.bsubject').first();
        if (!a.length) return [];
        return [{
          title: clean(a.attr('title') || a.text()),
          url: (a.attr('href') || '').replace(/&vdate=.*$/, ''),
          comments: num($el.find('.totreply').text()),
          views: num($el.find('td.count').text()),
          likes: num($el.find('td.recomm font').first().text()),
        }];
      });
    },
  },
  {
    id: 'humoruniv',
    name: '웃긴대학',
    board: '웃긴자료',
    color: '#d6336c',
    encoding: 'euc-kr',
    home: 'https://web.humoruniv.com/board/humor/list.html?table=pds',
    url: 'https://web.humoruniv.com/board/humor/list.html?table=pds',
    parse($) {
      return $('tr[id^="li_chk_pds"]').toArray().map((el) => {
        const $el = $(el);
        const a = $el.find('td.li_sbj a').first();
        const und = $el.find('td.li_und');
        return {
          title: clean($el.find('[id^="title_chk_pds"]').text()),
          url: a.attr('href'),
          comments: num($el.find('.list_comment_num').text()),
          views: num(und.eq(0).text()),
          likes: num(und.eq(1).text()),
        };
      });
    },
  },
  {
    id: 'dogdrip',
    name: '개드립',
    board: '개드립 인기글',
    color: '#2f9e44',
    home: 'https://www.dogdrip.net/dogdrip',
    url: 'https://www.dogdrip.net/dogdrip',
    parse($) {
      return $('li.webzine:not(.notice)').toArray().flatMap((el) => {
        const $el = $(el);
        const a = $el.find('a.title-link').first();
        if (!a.length) return [];
        return [{
          title: clean(a.text()),
          url: (a.attr('href') || '').replace(/\?.*$/, ''),
          comments: num(a.next('span').text()),
          views: null,
          likes: num($el.find('.list-meta .fa-thumbs-up').closest('span').next('span').text()),
        }];
      });
    },
  },
];
