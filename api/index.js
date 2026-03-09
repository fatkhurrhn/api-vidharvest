require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const http = require('http');

const BASE_URL = process.env.EVERYTHINGMOE_URL || 'https://everythingmoe.com';
const PORT = process.env.PORT || 3000;

// HANDLER UTAMA
async function handler(req, res) {
  // Set CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS request
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  // Cuma GET doang
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // ============= ROUTING =============
  
  // ROOT - tampilkan HTML sederhana
  if (req.url === '/') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial; background: #0f0f0f; color: #fff; padding: 20px; }
          h1 { color: #bb86fc; }
          h2 { color: #03dac6; margin-top: 30px; }
          code { background: #333; padding: 2px 6px; border-radius: 4px; }
          .endpoint { background: #1e1e1e; padding: 15px; margin: 10px 0; border-left: 3px solid #bb86fc; border-radius: 0 8px 8px 0; }
          button { background: #bb86fc; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold; }
          pre { background: #1e1e1e; padding: 15px; border-radius: 8px; overflow: auto; margin-top: 20px; }
          input { background: #333; border: 1px solid #555; color: #fff; padding: 10px; border-radius: 5px; width: 300px; }
        </style>
      </head>
      <body>
        <h1>nyari apa?</h1>
      </body>
      </html>
    `);
    return;
  }

  // ============= API HOME =============s
if (req.url === '/api/home' || req.url === '/api/') {
  try {
    console.log('🔍 Fetching homepage:', BASE_URL);
    
    const { data: html } = await axios.get(BASE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(html);

    // Meta info
    const title = $('title').text();
    const description = $('meta[name="description"]').attr('content') || '';
    
    let lastUpdate = '';
    $('#lastedit').each((i, el) => {
      lastUpdate = $(el).text().trim();
    });

    // Semua section
    const sections = {};

    const sectionIds = [
      'sec-streaming', 'sec-donghua', 'sec-manga', 'sec-manhwa',
      'sec-novel', 'sec-drama', 'sec-game', 'sec-apps',
      'sec-download', 'sec-music', 'sec-schedule', 'sec-database',
      'sec-western', 'sec-tools', 'sec-utils', 'sec-quiz',
      'sec-trend', 'sec-wiki', 'sec-artboard', 'sec-vtuber',
      'sec-gacha', 'sec-cosplay', 'sec-amv', 'sec-forums'
    ];

    sectionIds.forEach(sectionId => {
      const sectionName = sectionId.replace('sec-', '');
      const items = [];

      // ============= API HOME (bagian parsing per item) =============
// ... di dalam loop sectionIds ...

$(`#${sectionId} .section-item`).each((index, el) => {
  const $item = $(el);
  
  // ===== BASIC INFO =====
  let rank = $item.attr('data-rank');
  if (!rank) {
    const text = $item.text().trim();
    const match = text.match(/^(\d+)\./);
    rank = match ? match[1] : (index + 1).toString();
  }

  const $link = $item.find('a').first();
  let title = $link.text().trim();
  let slug = '';
  const href = $link.attr('href') || '';
  if (href.startsWith('/s/')) {
    slug = href.replace('/s/', '');
  }
  
  let url = $link.attr('href') || '';
  title = title.replace(/^\d+\.\s*/, '').trim();

  if (url && !url.startsWith('http')) {
    url = url.startsWith('/') ? `${BASE_URL}${url}` : `${BASE_URL}/${url}`;
  }

  const $img = $item.find('img');
  let icon = $img.attr('src') || '';
  if (icon && !icon.startsWith('http')) {
    icon = `https:${icon}`;
  }

  // Tags (addtag)
  const tags = [];
  $item.find('.addtag').each((i, tag) => {
    tags.push($(tag).text().trim());
  });

  // Filter tags
  const filter = $item.attr('data-filter') || '';
  const filterTags = filter.split(',').map(f => f.trim()).filter(f => f);

  const isLicensed = $item.hasClass('section-licensed');

  // ===== CEK APAKAH ITEM SEDANG EXPAND =====
  const isExpanded = $item.find('.section-expand').length > 0;
  
  const pros = [];
  const cons = [];
  let note = '';
  const alternativeLinks = [];
  let commentCount = 0;

  if (isExpanded) {
    // Kalo lagi expand, ambil dari HTML yang muncul
    const $expandBase = $item.find('.expand-base');
    if ($expandBase.length) {
      $expandBase.find('.rpositive').each((i, el) => {
        pros.push($(el).text().trim());
      });
      $expandBase.find('.rnegative').each((i, el) => {
        cons.push($(el).text().trim());
      });
      const $footnote = $expandBase.find('.footnote');
      if ($footnote.length) {
        note = $footnote.text().trim();
      }
    }

    const $tagCont = $item.find('.section-tag-cont');
    if ($tagCont.length) {
      $tagCont.find('a').each((i, el) => {
        const $a = $(el);
        const linkUrl = $a.attr('href') || '';
        const linkText = $a.find('.tags-text').text().trim();
        
        if (linkUrl && linkText) {
          let fullUrl = linkUrl;
          if (!fullUrl.startsWith('http')) {
            fullUrl = fullUrl.startsWith('//') ? `https:${fullUrl}` : 
                     fullUrl.startsWith('/') ? `${BASE_URL}${fullUrl}` : 
                     `https://${fullUrl}`;
          }
          alternativeLinks.push({ text: linkText, url: fullUrl });
        }
      });
    }

    const $commentLink = $item.find('.bookmark-btn a[href*="#comments"]');
    if ($commentLink.length) {
      const commentText = $commentLink.text().trim();
      const match = commentText.match(/(\d+)/);
      if (match) commentCount = parseInt(match[1]);
    }
  }

  // Cari main URL dari data-link attribute atau dari href
  let mainUrl = $link.attr('data-link') || url;
  if (mainUrl && !mainUrl.startsWith('http')) {
    mainUrl = `https://${mainUrl}`;
  }

  items.push({
    rank: parseInt(rank) || index + 1,
    title: title || 'Untitled',
    slug: slug || null,
    url: mainUrl || '#',
    icon: icon || '',
    tags: tags,
    filterTags: filterTags,
    isLicensed: isLicensed,
    pros: pros,
    cons: cons,
    note: note || undefined,
    links: {
      main: {
        url: mainUrl || url || '#',
        title: title
      },
      alternatives: alternativeLinks
    },
    commentCount: commentCount,
    isExpanded: isExpanded // info apakah data ini dari expand atau tidak
  });
});

      if (items.length > 0) {
        sections[sectionName] = items;
      }
    });

    const totalItems = Object.values(sections).reduce((acc, items) => acc + items.length, 0);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      data: {
        meta: {
          title,
          description,
          lastUpdate: lastUpdate || 'Unknown',
          totalSections: Object.keys(sections).length,
          totalItems
        },
        sections
      }
    }));

  } catch (error) {
    console.error('❌ Home Error:', error.message);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: 'Gagal ambil data homepage',
      message: error.message
    }));
  }
  return;
}

  // ============= API DETAIL SITE =============
  const siteMatch = req.url.match(/^\/api\/site\/([a-zA-Z0-9-]+)$/);
  if (siteMatch) {
    const slug = siteMatch[1];
    const siteUrl = `${BASE_URL}/s/${slug}`;
    
    try {
      console.log(`🔍 Fetching site detail: ${siteUrl}`);
      
      const { data: html } = await axios.get(siteUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(html);

      // Cek apakah halaman ada
      const pageTitle = $('title').text();
      if (pageTitle.includes('404') || pageTitle.includes('Not Found')) {
        throw new Error('Site not found');
      }

      // ===== PARSING DATA DARI HTML =====
      
      // 1. Data dari tag <script> (siteData)
      let siteData = {};
      $('script').each((i, script) => {
        const content = $(script).html() || '';
        if (content.includes('var siteData =')) {
          const match = content.match(/var siteData = ({.+?});/s);
          if (match) {
            try {
              siteData = JSON.parse(match[1]);
            } catch (e) {
              console.log('Gagal parse siteData:', e.message);
            }
          }
        }
      });

      // 2. Header info
      const headerElement = $('#info-header');
      const $header = $(headerElement);
      const mainTitle = $header.find('a').text().trim();
      const mainIcon = $header.find('img').attr('src') || '';
      const mainLink = $header.find('a').attr('href') || '';
      
      const rankTag = $header.find('.addtag').text().trim();

      // 3. Alternative links
      const altLinks = [];
      $('.section-tag-cont a.section-tags').each((i, el) => {
        const $el = $(el);
        altLinks.push({
          text: $el.find('.tags-text').text().trim(),
          url: $el.attr('href') || '',
        });
      });

      // 4. Pros and Cons
      const pros = [];
      const cons = [];
      
      $('.rpositive').each((i, el) => {
        pros.push($(el).text().trim());
      });
      
      $('.rnegative').each((i, el) => {
        cons.push($(el).text().trim());
      });

      // 5. Note
      let note = '';
      const $footnote = $('.footnote');
      if ($footnote.length) {
        note = $footnote.text().trim();
      }

      // 6. Screenshots
      const screenshots = [];
      $('.site-ss-img').each((i, el) => {
        const src = $(el).attr('src');
        if (src) {
          screenshots.push({
            url: src.startsWith('http') ? src : `https:${src}`,
          });
        }
      });

      // 7. Path/Breadcrumb
      const path = [];
      $('.path-top-site a').each((i, el) => {
        path.push({
          text: $(el).text().trim(),
          href: $(el).attr('href') || ''
        });
      });

      // 8. Filter tags
      const filterTags = siteData.filter ? siteData.filter.split(',').map(f => f.trim()) : [];

      // 9. Comment count
      let commentCount = 0;
      const commentText = $('#comment-btn').text().trim();
      const commentMatch = commentText.match(/(\d+)/);
      if (commentMatch) {
        commentCount = parseInt(commentMatch[1]);
      }

      // ===== SUSUN RESPONSE =====
      const response = {
        success: true,
        data: {
          meta: {
            title: mainTitle || siteData.title || pageTitle.replace(' - EverythingMoe', ''),
            slug: slug,
            icon: mainIcon || siteData.icon || '',
            mainUrl: mainLink || siteData.link || '',
            rank: rankTag || siteData.rank || '',
            section: siteData.type || '',
          },
          details: {
            pros: pros,
            cons: cons,
            note: note || siteData.expand?.info || null,
            filterTags: filterTags,
          },
          links: {
            main: {
              url: mainLink || siteData.link || '',
              title: mainTitle || siteData.title || ''
            },
            alternatives: altLinks.length > 0 ? altLinks : (() => {
              // Parse dari siteData.expand kalo ada
              const altFromData = [];
              if (siteData.expand?.altlink) {
                const parts = siteData.expand.altlink.split('#');
                parts.forEach(part => {
                  const [text, url] = part.split('<<');
                  if (text && url) {
                    altFromData.push({ text, url });
                  }
                });
              }
              return altFromData;
            })()
          },
          media: {
            screenshots: screenshots.length > 0 ? screenshots : (siteData.ss?.map(s => ({
              url: `https://static.everythingmoe.com/img/ss/${s.img}.jpg`,
              type: s.type
            })) || [])
          },
          commentCount: commentCount,
          navigation: {
            path: path,
          }
        }
      };

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(response, null, 2));

    } catch (error) {
      console.error(`❌ Detail Error for ${slug}:`, error.message);
      
      res.statusCode = error.message.includes('not found') ? 404 : 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: false,
        error: error.message.includes('not found') ? 'Site not found' : 'Gagal ambil detail site',
        message: error.message
      }));
    }
    return;
  }

  // ============= 404 - ENDPOINT LAIN =============
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ 
    success: false, 
    error: 'Endpoint not found. Available: /api/home, /api/site/:slug' 
  }));
}

// JALANKAN SERVER KALO FILE INI DI-RUN LANGSUNG
if (require.main === module) {
  const server = http.createServer(handler);
  server.listen(PORT, () => {
    console.log(`✅ API siap!`);
    console.log(`📌 Buka: http://localhost:${PORT}`);
    console.log(`🔗 Test Home: http://localhost:${PORT}/api/home`);
    console.log(`🔗 Test Detail: http://localhost:${PORT}/api/site/animekai`);
  });
}

// EXPORT BUAT VERCEL
module.exports = handler;