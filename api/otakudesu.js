const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const router = express.Router();
const PROXY = 'https://proxy.liyao.space/------';
const BASE_URL = 'https://otakudesu.best';
const PROXY_BASE_URL = PROXY + BASE_URL;

router.use(cors());
router.use(express.json());

// Helper untuk fetch halaman Otakudesu
async function fetchPage(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    return cheerio.load(response.data);
  } catch (err) {
    console.error(`Error fetch ${url}:`, err.message);
    throw new Error(`Gagal mengambil data: ${url}`);
  }
}

// Helper format image URL (harus cek format Otakudesu)
function formatImageUrl(imageUrl) {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${BASE_URL}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
}

// Helper untuk hapus prefix proxy di url gambar & link download
function cleanUrl(url) {
  if (!url) return url;
  return url.replace('https://proxy.liyao.space/------', '');
}

// Get nonce for streaming requests
async function getNonce() {
  try {
    const { data } = await axios.post(
      `${BASE_URL}/wp-admin/admin-ajax.php`,
      new URLSearchParams({ action: 'aa1208d27f29ca340c92c66d1926f13f' }),
      {
        headers: {
          'x-requested-with': 'XMLHttpRequest',
          'origin': BASE_URL,
          'referer': `${BASE_URL}/`,
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        }
      }
    );
    return data?.data || data;
  } catch (error) {
    console.error('[OTAKU] getNonce ERROR:', error.message);
    throw new Error(`Failed to get nonce: ${error.message}`);
  }
}

// Get basic episode data
async function getEpisodeBasicData(slug) {
  try {
    const url = `${PROXY_BASE_URL}/episode/${slug}/`;
    const $ = await fetchPage(url);
    
    const title = $('h1').first().text().trim() || $('.posttl').first().text().trim();
    const mainIframe = cleanUrl($('#pembed iframe').first().attr('src') || $('iframe').first().attr('src') || null);
    
    // Extract mirror links
    const mirrorRaw = { m360p: [], m480p: [], m720p: [] };
    $('.mirrorstream ul').each((_, ul) => {
      const $ul = $(ul);
      const qClass = $ul.attr('class');
      let quality = '';
      
      // Cek apakah class langsung seperti m360p, m480p, m720p
      if (qClass && ['m360p', 'm480p', 'm720p'].includes(qClass)) {
        quality = qClass;
      } else if (qClass && qClass.startsWith('m')) {
        // Fallback: class seperti m360, m480, m720
        const qLower = qClass.toLowerCase();
        if (qLower.includes('360')) quality = 'm360p';
        else if (qLower.includes('480')) quality = 'm480p';
        else if (qLower.includes('720')) quality = 'm720p';
      }
      
      // Jika quality tidak ditemukan, default ke m360p
      if (!quality) quality = 'm360p';
      
      if (quality && mirrorRaw[quality]) {
        $ul.find('li a').each((_, el) => {
          const $el = $(el);
          const nama = $el.text().trim().toLowerCase();
          const content = $el.attr('data-content')?.trim();
          if (content && nama) {
            mirrorRaw[quality].push({ nama, content });
          }
        });
      }
    });
    
    // Extract download links
    const download = {};
    $('.download ul li').each((_, li) => {
      const $li = $(li);
      const quality = $li.find('strong').text().trim();
      const size = $li.find('i').text().trim();
      if (quality) {
        const qualityKey = quality.toLowerCase();
        download[qualityKey] = {
          size,
          links: []
        };
        $li.find('a').each((_, a) => {
          const $a = $(a);
          const nama = $a.text().trim();
          const href = cleanUrl($a.attr('href'));
          if (href && nama) {
            download[qualityKey].links.push({ nama, href });
          }
        });
      }
    });
    
    return { title, mainIframe, mirrorRaw, download };
  } catch (error) {
    console.error('[OTAKU] getEpisodeBasicData ERROR:', error.message);
    throw new Error(`Failed to get episode basic data: ${error.message}`);
  }
}

// Fetch iframe URL for streaming
async function fetchIframeUrl(payload, nonce, slug) {
  try {
    const body = new URLSearchParams({
      ...payload,
      nonce,
      action: '2a3505c93b0035d3f455df82bf976b84'
    });
    
    const { data } = await axios.post(
      `${BASE_URL}/wp-admin/admin-ajax.php`,
      body.toString(),
      {
        headers: {
          'x-requested-with': 'XMLHttpRequest',
          'origin': BASE_URL,
          'referer': `${BASE_URL}/episode/${slug}/`,
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        }
      }
    );
    
    if (!data?.data) return null;
    
    const html = Buffer.from(data.data, 'base64').toString('utf-8');
    const match = html.match(/src="([^"]+)"/) || html.match(/<iframe[^>]+src=[\"']?([^\"' >]+)/i);
    return match ? match[1] : null;
  } catch (error) {
    console.error('[OTAKU] fetchIframeUrl ERROR:', error.message);
    return null;
  }
}

// Process mirror links for streaming
async function processMirrorLinks(mirrorRaw, nonce, slug) {
  const mirror = { m360p: [], m480p: [], m720p: [] };
  
  for (const quality of Object.keys(mirrorRaw)) {
    const promises = mirrorRaw[quality].map(async (m) => {
      try {
        // Pastikan content ada
        if (!m.content) {
          console.warn(`[OTAKU] Mirror ${m.nama} tidak memiliki content`);
          return { nama: m.nama, url: null, id: null };
        }
        const payload = JSON.parse(Buffer.from(m.content, 'base64').toString('utf-8'));
        const url = await fetchIframeUrl(payload, nonce, slug);
        // Pastikan id (content) selalu disertakan
        return { nama: m.nama, url, id: m.content, content: m.content };
      } catch (error) {
        console.warn(`[OTAKU] Failed to process mirror ${m.nama}:`, error.message);
        // Tetap simpan id meskipun url gagal
        return { nama: m.nama, url: null, id: m.content || null, content: m.content || null };
      }
    });
    
    mirror[quality] = await Promise.all(promises);
  }
  
  return mirror;
}

// Episode streaming links with enhanced error handling
async function getEpisodeStreaming(slug) {
  try {
    const [nonce, episodeData] = await Promise.all([
      getNonce(),
      getEpisodeBasicData(slug)
    ]);
    
    const mirrorUrls = await processMirrorLinks(episodeData.mirrorRaw, nonce, slug);
    
    return {
      title: episodeData.title,
      iframe: episodeData.mainIframe,
      mirror: mirrorUrls,
      download: episodeData.download
    };
  } catch (error) {
    throw new Error(`Failed to get episode streaming: ${error.message}`);
  }
}

// Helper resolve url video Otakudesu dari data-content base64 mirror (legacy, untuk backward compatibility)
async function resolveOtakuIframeUrl(dataContentBase64, refererUrl = null) {
  const { id, i, q } = JSON.parse(Buffer.from(dataContentBase64, 'base64').toString('utf8'));
  try {
    const nonce = await getNonce();
    const slug = refererUrl ? refererUrl.match(/\/episode\/([^\/]+)/)?.[1] : '';
    return await fetchIframeUrl({ id, i, q }, nonce, slug || '');
  } catch (e) {
    console.error('[OTAKU] resolveOtakuIframeUrl ERROR:', e && e.message, e && e.stack);
    return null;
  }
}

// 1. Endpoint jadwal rilis anime
router.get('/schedule', async (req, res) => {
  try {
    const $ = await fetchPage(`${PROXY_BASE_URL}/jadwal-rilis/`);
    const schedule = [];
    $('.kglist321').each((i, dayElem) => {
      const day = $(dayElem).find('h2').text().trim();
      if (!day) return;
      const animeList = [];
      $(dayElem).find('ul li a').each((j, animeElem) => {
        const title = $(animeElem).text().trim();
        const link = $(animeElem).attr('href');
        let slug = '';
        if (link) {
          const match = link.match(/\/anime\/([^\/?#]+)/);
          if (match && match[1]) {
            slug = match[1];
          } else {
            slug = link.split('/')?.filter(Boolean).pop() || '';
          }
        }
        if (title && slug) {
          animeList.push({ title, slug });
        }
      });
      if (animeList.length > 0) {
        schedule.push({ day, anime: animeList });
      }
    });
    res.json(schedule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Endpoint detail anime (format identik layarwibu.js, verifikasi selector cocok dengan source anime.html)
router.get('/anime/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const $ = await fetchPage(`${PROXY_BASE_URL}/anime/${slug}/`);
    // --- TITLE ---
    const titleRaw = $('.jdlrx h1').first().text().replace(/\s*Subtitle Indonesia.*/i,'').trim();
    const title = titleRaw;
    if (!title) return res.status(404).json({ error: 'Anime tidak ditemukan atau struktur halaman berubah' });
    // --- INFOZINGLE ---
    const keyMapping = {
      'judul': 'title',
      'japanese': 'alternativeTitles',
      'skor': 'score',
      'produser': 'producers',
      'tipe': 'type',
      'status': 'status',
      'total episode': 'total_episode',
      'durasi': 'duration',
      'tanggal rilis': 'released',
      'studios': 'studio',
      'studio': 'studio',
      'genre': 'genres'
    };
    const info = {};
    let alternativeTitles = '';
    let score = '';
    let status = '';
    let type = '';
    let total_episode = '';
    let producers = '';
    let duration = '';
    let released = '';
    let studio = '';
    $(".infozingle p").each((i, p) => {
      const txt = $(p).text().trim();
      const m = txt.match(/^([^:]+):\s*(.+)$/);
      if (m) {
        const keyRaw = m[1].toLowerCase();
        const value = m[2].trim();
        const mapped = keyMapping[keyRaw] || keyRaw;
        info[mapped] = value;
        if (mapped==='alternativeTitles') alternativeTitles = value;
        if (mapped==='score') score = value;
        if (mapped==='status') status = value;
        if (mapped==='type') type = value;
        if (mapped==='total_episode') total_episode = value;
        if (mapped==='producers') producers = value;
        if (mapped==='duration') duration = value;
        if (mapped==='released') released = value;
        if (mapped==='studio') studio = value;
      }
    });
    function safeImg(selArr) {for(const sel of selArr){let s=$(sel).attr('src');if(s)return s;}return '';}    
    let image = safeImg(['.fotoanime img','.imganime img']);
    if (!image) image = $('.fotoanime').find('img').attr('src') || '';
    let genres = [];
    if(info.genres){
      genres = info.genres.split(',').map(g=>g.trim()).filter(Boolean);
      delete info.genres;
    } else if ($(".infozingle p:contains('Genre') a").length > 0){
      $(".infozingle p:contains('Genre') a").each((i, el) => genres.push($(el).text().trim()));
    }
    let synopsis = '';
    if ($('.sinopc p').length > 0) {
      synopsis = $('.sinopc p').map((i, el) => $(el).text()).get().join(' ');
    } else if ($('.deskripsi').length > 0) {
      synopsis = $('.deskripsi').text().replace(/^Sinopsis:/i, '').trim();
    }
    const episodes = [];
    $('.episodelist .smokelister:contains("Episode List")').next('ul').find('li').each((i, el) => {
      const anchor = $(el).find('a');
      const epTitle = anchor.text().trim();
      const link = anchor.attr('href');
      let numMatch = epTitle.match(/Episode\s+(\d+)/i) || epTitle.match(/Episode\s+(\d+)\s*\(/i);
      let number = numMatch && numMatch[1] ? numMatch[1] : String(i+1);
      const match = (link||'').match(/\/episode\/([^\/?#]+)/);
      const slug = match && match[1] ? match[1] : '';
      const date = $(el).find('.zeebr').text().trim();
      if (epTitle && slug) episodes.push({ number, title: epTitle, date, slug });
    });
    // --- BATCH SECTION ---
    let batchDownloads = [];
    let batchId = null;
    let batchAvailable = false;
    let batchTitle = "";
    let episodeRange = episodes.length ? `1-${episodes.length}` : '';
    let batchData = null;
    // Cari link batch (<a href="/batch/batchid" ...>)
    $('.episodelist .smokelister:contains("Batch")').next('ul').find('a').each((i,el)=>{
      const href = $(el).attr('href') || '';
      const m = href.match(/\/batch\/([^\/?#]+)/);
      if(m && m[1]) {
        batchId = m[1];
        batchAvailable = true;
        batchTitle = title+" Batch Subtitle Indonesia";
      }
    });
    if (batchId) {
      try {
        const baseOrigin = req.protocol + '://' + req.get('host');
        const bresp = await axios.get(`${baseOrigin}/otakudesu/batch/${batchId}`);
        const bjson = bresp.data;
        // SELALU ambil batchDownloads, baik link asli atau plaintext host
        if (bjson && Array.isArray(bjson.batchDownloads) && bjson.batchDownloads.length) {
          batchData = bjson.batchDownloads[0];
          batchData.batchId = batchId;
          batchDownloads = [batchData];
        } else {
          batchDownloads = [{
            title: batchTitle,
            episodeRange,
            qualityLinks: [],
            batchId
          }];
        }
      } catch (e) {
        batchDownloads = [{
          title: batchTitle,
          episodeRange,
          qualityLinks: [],
          batchId
        }];
      }
    }
    if (!batchDownloads.length && batchId) {
      batchDownloads = [{
        title: batchTitle,
        episodeRange,
        qualityLinks: [],
        batchId
      }];
    }
    // PATCH BERSIHKAN DEBUG DAN SANITASI URL PADA ENDPOINT /anime/:slug
    let imageFixed = cleanUrl(image);
    if (batchDownloads && batchDownloads.length > 0) {
      batchDownloads = batchDownloads.map(batch => {
        // patch semua links.download url
        if (Array.isArray(batch.qualityLinks)) {
          batch.qualityLinks = batch.qualityLinks.map(q => {
            if (Array.isArray(q.links)) {
              q.links = q.links.map(l => ({
                ...l,
                url: l.url ? cleanUrl(l.url) : l.url
              }));
            }
            return q;
          });
        }
        return batch;
      });
    }
    const result = {
      title,
      alternativeTitles,
      image: imageFixed,
      synopsis,
      score,
      status,
      info,
      genres,
      episodes,
      batchDownloads,
      batchId,
      batchAvailable: !!batchAvailable
    };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Endpoint batch download (benar-benar robust!
// Ambil semua host text dari text(), kurangi strong/i, split by wh space)
router.get('/batch/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const $ = await fetchPage(`${PROXY_BASE_URL}/batch/${id}/`);
    let title = $('.jdlrx h1').text().replace(/\s*\[BATCH\].*/i,'').replace(/subtitle indonesia/i,'').trim();
    if (!title) return res.status(404).json({ error: 'Batch tidak ditemukan atau struktur halaman berubah' });
    let episodeRange = '';
    const h2txt = $('.subheading h2').first().text();
    let rMatch = h2txt.match(/Episode\s*(\d+)\s*[–-]\s*(\d+)/i) || h2txt.match(/([\d]+)\s*[-–]\s*([\d]+)/);
    if (rMatch) episodeRange = `${rMatch[1]}-${rMatch[2]}`;
    const qualityLinks = [];
    $('.batchlink ul li').each((i, el) => {
      const quality = $(el).find('strong').text().trim();
      const size = $(el).find('i').text().trim();
      let links = [];
      const aList = $(el).find('a');
      if (aList.length > 0) {
        aList.each((_, a) => links.push({ name: $(a).text().trim(), url: cleanUrl($(a).attr('href')) }));
      }
      if (links.length === 0) {
        let full = $(el).text();
        let strong = $(el).find('strong').text();
        let sizeTxt = $(el).find('i').text();
        let hostsText = full.replace(strong, '').replace(sizeTxt, '').trim();
        let hosts = hostsText.split(/\s+/).filter(Boolean);
        links = hosts.map(name => ({
          name,
          url: null,
          note: 'Batch via safelink, buka website asli untuk download'
        }));
      }
      if (quality && links.length)
        qualityLinks.push({ quality, size, links });
    });
    return res.json({
      batchDownloads: [
        {
          title: title + " Batch Subtitle Indonesia",
          episodeRange,
          qualityLinks
        }
      ]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Endpoint detail episode (resolve semua videoServers.url)
router.get('/episode/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    
    // Get streaming data menggunakan fungsi baru
    const streamingData = await getEpisodeStreaming(slug);
    
    // Get additional data dari halaman (navigasi, anime slug, dll)
    const $ = await fetchPage(`${PROXY_BASE_URL}/episode/${slug}`);
    const titleEp = streamingData.title || $('.posttl').first().text().trim();
    let number = '1', title = titleEp, date = '';
    const numMatch = titleEp.match(/Episode\s+(\d+)/i);
    if (numMatch && numMatch[1]) number = numMatch[1];
    
    // Convert mirror format ke videoServers format (backward compatibility)
    const videoServers = [];
    Object.keys(streamingData.mirror).forEach(quality => {
      const qualityUpper = quality.replace('m', '').toUpperCase();
      streamingData.mirror[quality].forEach(mirror => {
        // Gabungkan name dengan quality (contoh: "vidhide 360p")
        const nameWithQuality = `${mirror.nama} ${qualityUpper}`;
        videoServers.push({
          name: nameWithQuality,
          url: mirror.url
        });
      });
    });
    
    // Convert download format ke downloadLinks format (backward compatibility)
    const downloadLinks = [];
    Object.keys(streamingData.download).forEach(quality => {
      const downloadData = streamingData.download[quality];
      const links = (downloadData.links || []).map(d => ({
        name: d.nama,
        url: d.href
      }));
      if (links.length > 0) {
        downloadLinks.push({
          quality,
          size: downloadData.size || '',
          links
        });
      }
    });
    
    // --- Anime Slug ---
    let animeSlug = '';
    const allEps = $(".flir a:contains('See All Episodes')").attr('href') || '';
    if (allEps) {
      const m = allEps.match(/\/anime\/([^\/]+)/);
      if (m && m[1]) animeSlug = m[1];
    }
    
    // --- Navigasi episode ---
    let prevEpisode = null, nextEpisode = null;
    const $navs = $('.flir a');
    $navs.each((i, a) => {
      const txt = $(a).text().toLowerCase();
      const href = $(a).attr('href') || '';
      if (/prev|sebelum/.test(txt)) {
        const m = href.match(/\/episode\/([^\/]+)/);
        if (m && m[1]) prevEpisode = m[1];
      }
      if (/see all/i.test(txt)) return; // Skip all episode link
      if (/next|selanjut/.test(txt)) {
        const m = href.match(/\/episode\/([^\/]+)/);
        if (m && m[1]) nextEpisode = m[1];
      }
    });
    
    const episode = {
      number,
      title,
      date,
      iframeSrc: streamingData.iframe,
      videoServers,
      downloadLinks,
      prevEpisode,
      nextEpisode,
      animeSlug
    };
    res.json(episode);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: resolve video url (streaming) Otakudesu, tanpa browser!
router.get('/episode/:slug/mirror', async (req, res) => {
  try {
    const { slug } = req.params;
    const mirrorIdx = parseInt(req.query.mirror) || 0;
    const $ = await fetchPage(`${PROXY_BASE_URL}/episode/${slug}`);
    // Ambil mirrorstream mirror ke-n
    let found = null;
    let foundName = '';
    $('.mirrorstream ul').each((_, ul) => {
      $(ul).find('li a').each((i, a) => {
        if (i === mirrorIdx && !found) {
          found = $(a).attr('data-content');
          foundName = $(a).text().trim();
        }
      });
    });
    if (!found) return res.status(404).json({ error: 'Mirror not found', mirrorIdx });
    const resolvedUrl = await resolveOtakuIframeUrl(found);
    if (!resolvedUrl) return res.status(500).json({ error: 'No video url found for that mirror' });
    res.json({
      name: foundName,
      url: resolvedUrl
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Endpoint list genre
router.get('/genres', async (req, res) => {
  try {
    // TODO: Cek selector genre Otakudesu
    const $ = await fetchPage(`${PROXY_BASE_URL}/genres/`);
    const genres = [];
    res.json(genres);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Endpoint anime per genre
router.get('/genres/:genre', async (req, res) => {
  try {
    // TODO: Cek selector, struktur list Otakudesu
    const { genre } = req.params;
    const page = parseInt(req.query.page) || 1;
    const $ = await fetchPage(`${PROXY_BASE_URL}/genres/${genre}?page=${page}`);
    const animeList = [];
    res.json({ genre, animeList });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Endpoint get server-url (dummy/simbolik, karena bisa beda implementasi di Otakudesu)
router.get('/server-url', async (req, res) => {
  try {
    res.json({});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Endpoint anime-list
router.get('/anime-list', async (req, res) => {
  try {
    // Scraping dari HTML
    const $ = await fetchPage(`${PROXY_BASE_URL}/anime-list/`);
    
    // Objek untuk menyimpan anime berdasarkan abjad
    const animeByAlphabet = {};
    const alphabets = ['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 
                      'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
    
    // Initialize all alphabet buckets
    alphabets.forEach(letter => {
      animeByAlphabet[letter] = [];
    });
    
    // Coba berbagai selector untuk menemukan daftar anime
    // Selector 1: Struktur seperti layarotaku/sokuja (.blix)
    $('.blix').each((i, el) => {
      const alphabetElement = $(el).find('span a');
      const alphabet = alphabetElement.text().trim();
      
      if (alphabet && alphabet.length === 1) {
        $(el).find('li').each((j, item) => {
          const link = $(item).find('a');
          const title = link.text().trim();
          const href = link.attr('href');
          
          let slug = '';
          if (href) {
            const slugMatch = href.match(/\/anime\/([^\/]+)/);
            if (slugMatch && slugMatch[1]) {
              slug = slugMatch[1];
            }
          }
          
          if (title && slug) {
            const firstChar = title.charAt(0).toUpperCase();
            const key = /[A-Z]/.test(firstChar) ? firstChar : '#';
            if (animeByAlphabet[key]) {
              animeByAlphabet[key].push({ title, slug });
            }
          }
        });
      }
    });
    
    // Selector 2: Struktur alternatif - cari semua link ke /anime/
    if (Object.values(animeByAlphabet).every(arr => arr.length === 0)) {
      $('a[href*="/anime/"]').each((i, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        const title = $el.text().trim();
        
        if (href && title) {
          const slugMatch = href.match(/\/anime\/([^\/]+)/);
          if (slugMatch && slugMatch[1]) {
            const slug = slugMatch[1];
            // Skip jika ini adalah link navigasi atau bukan link anime utama
            if (!href.includes('/episode/') && !href.includes('/batch/') && title.length > 2) {
              const firstChar = title.charAt(0).toUpperCase();
              const key = /[A-Z]/.test(firstChar) ? firstChar : '#';
              if (animeByAlphabet[key]) {
                // Cek duplikasi
                const exists = animeByAlphabet[key].some(item => item.slug === slug);
                if (!exists) {
                  animeByAlphabet[key].push({ title, slug });
                }
              }
            }
          }
        }
      });
    }
    
    // Selector 3: Cari di dalam container umum
    if (Object.values(animeByAlphabet).every(arr => arr.length === 0)) {
      $('.venser, .venkonten, .content, main, article').find('a[href*="/anime/"]').each((i, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        const title = $el.text().trim();
        
        if (href && title && !href.includes('/episode/') && !href.includes('/batch/')) {
          const slugMatch = href.match(/\/anime\/([^\/]+)/);
          if (slugMatch && slugMatch[1]) {
            const slug = slugMatch[1];
            if (title.length > 2) {
              const firstChar = title.charAt(0).toUpperCase();
              const key = /[A-Z]/.test(firstChar) ? firstChar : '#';
              if (animeByAlphabet[key]) {
                const exists = animeByAlphabet[key].some(item => item.slug === slug);
                if (!exists) {
                  animeByAlphabet[key].push({ title, slug });
                }
              }
            }
          }
        }
      });
    }
    
    // Hitung total anime
    let total = 0;
    Object.keys(animeByAlphabet).forEach(key => {
      total += animeByAlphabet[key].length;
    });
    
    // Sort alphabets - hanya ambil yang memiliki anime
    const sortedAlphabets = alphabets.filter(a => animeByAlphabet[a] && animeByAlphabet[a].length > 0);
    
    // Return the formatted response (mengikuti struktur layarwibu.js)
    res.json({
      animeByAlphabet,
      alphabets: sortedAlphabets.length > 0 ? sortedAlphabets : alphabets,
      total
    });
  } catch (err) {
    console.error('[OTAKU] Error fetching anime list:', err);
    res.status(500).json({ error: err.message });
  }
});

// 9. Endpoint search
router.get('/search', async (req, res) => {
  try {
    // TODO: Search AJAX Otakudesu jika ada
    const { q } = req.query;
    res.json({});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Endpoint all-anime
router.get('/all-anime', async (req, res) => {
  try {
    // TODO: Ambil semua data anime jika support AJAX/sejenis
    res.json({});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
