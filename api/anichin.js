const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { safeTrack, trackError } = require('./utils/metrics');

const router = express.Router();

// Base URL
const BASE_URL = 'https://anichin.watch';

// Middleware
router.use(cors());
router.use(express.json());

// Fungsi helper untuk scraping
async function fetchPage(url) {
  try {
    // Create HTTPS agent with SSL verification disabled
    const httpsAgent = new (require('https').Agent)({
      rejectUnauthorized: false,
      secureOptions: require('constants').SSL_OP_LEGACY_SERVER_CONNECT
    });

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      httpsAgent,
      httpAgent: httpsAgent
    });
    return cheerio.load(response.data);
  } catch (error) {
    console.error(`Error fetching ${url}:`, error.message);
    throw new Error(`Failed to fetch ${url}`);
  }
}

// Fungsi untuk memodifikasi URL gambar
function formatImageUrl(imageUrl) {
  if (!imageUrl) return '';
  
  // Jika URL menggunakan format WordPress.com image proxy (i1.wp.com, i2.wp.com, dll)
  // ekstrak URL asli dari anichin.cafe
  const wpProxyMatch = imageUrl.match(/i[0-9]\.wp\.com\/(anichin\.cafe\/[^?]+)/);
  if (wpProxyMatch && wpProxyMatch[1]) {
    return `https://${wpProxyMatch[1]}`;
  }
  
  // Hapus protokol dari URL jika ada
  let cleanUrl = imageUrl.replace(/^https?:\/\//, '');
  
  // Jika URL dimulai dengan domain anichin.cafe, format dengan https://
  if (cleanUrl.startsWith('anichin.cafe')) {
    return `https://${cleanUrl}`;
  }
  
  // Kembalikan URL asli jika tidak cocok dengan pola di atas
  return imageUrl;
}

// Endpoint untuk jadwal donghua
router.get('/schedule', async (req, res) => {
  try {
    const $ = await fetchPage(`${BASE_URL}/schedule`);
    
    const schedule = [];
    
    // Fungsi untuk menerjemahkan nama hari ke Bahasa Indonesia
    function translateDayToIndonesian(day) {
      const translations = {
        'Monday': 'Senin',
        'Tuesday': 'Selasa',
        'Wednesday': 'Rabu',
        'Thursday': 'Kamis',
        'Friday': 'Jumat',
        'Saturday': 'Sabtu',
        'Sunday': 'Minggu'
      };
      
      return translations[day] || day;
    }
    
    // Mencari semua div dengan class schedulepage
    $('.bixbox.schedulepage').each((i, dayContainer) => {
      const dayElement = $(dayContainer).find('.releases h3 span');
      const day = dayElement.text().trim() || $(dayContainer).find('.releases h3').text().trim() || $(dayContainer).find('.releases h1 span').text().trim();
      
      const animeList = [];
      
      // Mencari semua anime dalam hari tersebut
      $(dayContainer).find('.bs').each((j, animeItem) => {
        const title = $(animeItem).find('.tt').text().trim();
        const link = $(animeItem).find('a').attr('href');
        let slug = '';
        
        if (link) {
          // Ekstrak slug dari URL
          const slugMatch = link.match(/\/donghua\/([^/]+)/) || link.match(/\/donghua\/([^/]+)/);
          if (slugMatch && slugMatch[1]) {
            slug = slugMatch[1];
          }
        }
        
        // Ekstrak timer
        const timerElement = $(animeItem).find('.epx');
        let timer = timerElement.text().trim();
        
        // Format timer ke bahasa Indonesia
        if (timer.includes('released')) {
          timer = 'sudah rilis';
        } else if (timer.includes('at')) {
          timer = timer.replace('at', 'Jam');
        }
        
        // Ekstrak episode
        const episodeElement = $(animeItem).find('.sb');
        let episode = episodeElement.text().trim();
        
        // Tambahkan ke daftar anime
        if (title && slug) {
          animeList.push({
            title,
            slug,
            timer,
            episode
          });
        }
      });
      
      // Tambahkan ke jadwal jika ada anime
      if (animeList.length > 0) {
        schedule.push({
          day: translateDayToIndonesian(day),
          anime: animeList
        });
      }
    });
    
    // Track performance untuk endpoint schedule
    safeTrack('anichin_schedule_success', { scheduleCount: schedule.length });
    
    res.json(schedule);
  } catch (error) {
    console.error('Error fetching schedule:', error);
    
    // Track error untuk endpoint schedule
    trackError(error, { 
      endpoint: 'anichin_schedule',
      operation: 'fetch_schedule'
    });
    
    res.status(500).json({ error: error.message });
  }
});

// Endpoint untuk detail donghua
router.get('/donghua/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const $ = await fetchPage(`${BASE_URL}/donghua/${slug}`);
    
    const donghua = {
      title: $('.entry-title').text().trim() || $('.post-title').text().trim() || $('h1.title').text().trim(),
      alternativeTitles: $('.alternative-title').text().trim() || $('.alt-title').text().trim(),
      image: formatImageUrl($('.thumb img').attr('src') || $('.poster img').attr('src')),
      synopsis: $('.entry-content p').text().trim() || $('.sinopsis').text().trim() || $('.desc p').text().trim(),
      score: '',
      info: {},
      genres: [],
      episodes: [],
      batchDownloads: []
    };
    
    // Ekstrak nilai rating/score
    const ratingText = $('.rating strong').text().trim();
    if (ratingText) {
      const ratingMatch = ratingText.match(/Rating\s+(\d+\.\d+)/i);
      if (ratingMatch && ratingMatch[1]) {
        donghua.score = ratingMatch[1];
      }
    }
    
    // Ekstrak genre
    $('.genxed a').each((i, el) => {
      const genre = $(el).text().trim();
      if (genre) {
        donghua.genres.push(genre);
      }
    });
    
    // Jika tidak menemukan genre dari div.genxed, coba selector lain
    if (donghua.genres.length === 0) {
      $('.genre a, .genres a, .mgen a').each((i, el) => {
        const genre = $(el).text().trim();
        if (genre) {
          donghua.genres.push(genre);
        }
      });
    }
    
    // Info donghua
    $('.info .info-item, .spe span, .infox .infox').each((i, el) => {
      const text = $(el).text().trim();
      const [key, value] = text.split(':').map(item => item.trim());
      if (key && value) {
        donghua.info[key.toLowerCase()] = value;
      }
    });
    
    // Ekstrak batch download links
    $('.bixbox .mctnx .soraddlx').each((i, batchContainer) => {
      const batchTitle = $(batchContainer).find('.sorattlx h3').text().trim();
      const batchEpisodes = [];
      
      const episodeRangeMatch = batchTitle.match(/Episode\s+(\d+)\s*-\s*(\d+)/i);
      let episodeRange = '';
      
      if (episodeRangeMatch && episodeRangeMatch.length >= 3) {
        episodeRange = `${episodeRangeMatch[1]}-${episodeRangeMatch[2]}`;
      }
      
      const qualityLinks = [];
      
      $(batchContainer).find('.soraurlx').each((j, qualityContainer) => {
        const quality = $(qualityContainer).find('strong').text().trim();
        const links = [];
        
        $(qualityContainer).find('a').each((k, linkEl) => {
          const href = $(linkEl).attr('href');
          const text = $(linkEl).text().trim();
          
          if (href && !href.includes('javascript:')) {
            links.push({
              name: text,
              url: href
            });
          }
        });
        
        if (links.length > 0) {
          qualityLinks.push({
            quality,
            links
          });
        }
      });
      
      if (qualityLinks.length > 0) {
        donghua.batchDownloads.push({
          title: batchTitle,
          episodeRange,
          qualityLinks
        });
      }
    });
    
    // Episode list
    $('.episodelist li, .eps-list .eps-item, .eplister li, #episode_list li, .episodelist a').each((i, el) => {
      const episodeLink = $(el).find('a').attr('href') || $(el).attr('href');
      const episodeText = $(el).text().trim();
      
      let episodeNumber = '';
      const episodeMatch = episodeText.match(/Episode\s+(\d+)/i) || 
                          episodeText.match(/Ep\s*(\d+)/i) ||
                          (episodeLink && episodeLink.match(/episode-(\d+)/i));
      
      if (episodeMatch && episodeMatch[1]) {
        episodeNumber = episodeMatch[1];
      }
      
      // Cek apakah ini adalah movie
      if (!episodeNumber) {
        if (episodeText.match(/\b(?:Movie|The\s+Movie)\b/i)) {
          episodeNumber = '1';
        } else {
          episodeNumber = '1'; // Default jika tidak ada nomor dan bukan movie
        }
      }
      
      let episodeTitle = episodeText;
      let episodeDate = '';
      
      const dateMatch = episodeText.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+,\s+\d{4}/i) ||
                       episodeText.match(/\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i) ||
                       episodeText.match(/\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/);
      
      if (dateMatch && dateMatch[0]) {
        episodeDate = dateMatch[0];
        episodeTitle = episodeTitle.replace(dateMatch[0], '').trim();
      }
      
      episodeTitle = episodeTitle.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      episodeTitle = episodeTitle.replace(/^\d+\s+/, '');
      episodeTitle = episodeTitle.replace(/\s+Sub$/i, '');
      
      if (!episodeTitle.includes("Episode") && episodeNumber && episodeNumber !== 'Movie') {
        let donghuaName = episodeTitle.split(/\s+Sub/i)[0].trim();
        episodeTitle = `${donghuaName} Episode ${episodeNumber} Subtitle Indonesia`;
      } else if (!episodeTitle.includes("Movie") && episodeNumber === 'Movie') {
        let donghuaName = episodeTitle.split(/\s+Sub/i)[0].trim();
        episodeTitle = `${donghuaName} Movie Subtitle Indonesia`;
      }
      
      if (episodeLink) {
        let endpoint = '';
        if (episodeLink) {
          endpoint = episodeLink.replace(/^https?:\/\/[^\/]+\//, '');
          endpoint = endpoint.replace(/\/$/, '');
        }
        
        donghua.episodes.push({
          number: episodeNumber,
          title: episodeTitle,
          date: episodeDate,
          slug: endpoint
        });
      }
    });
    
    // Track performance untuk endpoint donghua detail
    safeTrack('anichin_donghua_detail', { 
      slug: slug,
      episodeCount: donghua.episodes.length,
      genreCount: donghua.genres.length 
    });
    
    res.json(donghua);
  } catch (error) {
    console.error('Error fetching donghua details:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint untuk detail episode
router.get('/episode/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const $ = await fetchPage(`${BASE_URL}/${slug}`);
    
    function extractEpisodeInfo(text, link) {
      let episodeNumber = '';
      
      // Cek apakah ini adalah movie
      const movieMatch = text.match(/\b(?:Movie|The\s+Movie)\b/i);
      if (movieMatch) {
        episodeNumber = 'Movie';
      } else {
        const episodeMatch = text.match(/Episode\s+(\d+)/i) || 
                            text.match(/Ep\s*(\d+)/i) ||
                            (link && link.match(/episode-(\d+)/i));
        
        if (episodeMatch && episodeMatch[1]) {
          episodeNumber = episodeMatch[1];
        }
        
        // Jika masih kosong, gunakan nilai default "1"
        if (!episodeNumber) {
          episodeNumber = "1";
        }
      }
      
      let episodeTitle = text;
      let episodeDate = '';
      
      const dateMatch = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+,\s+\d{4}/i) ||
                       text.match(/\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i) ||
                       text.match(/\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/);
      
      if (dateMatch && dateMatch[0]) {
        episodeDate = dateMatch[0];
        episodeTitle = episodeTitle.replace(dateMatch[0], '').trim();
      }
      
      episodeTitle = episodeTitle.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      episodeTitle = episodeTitle.replace(/^\d+\s+/, '');
      episodeTitle = episodeTitle.replace(/\s+Sub$/i, '');
      
      if (!episodeTitle.includes("Episode") && episodeNumber && episodeNumber !== 'Movie') {
        let donghuaName = episodeTitle.split(/\s+Sub/i)[0].trim();
        episodeTitle = `${donghuaName} Episode ${episodeNumber} Subtitle Indonesia`;
      } else if (!episodeTitle.includes("Movie") && episodeNumber === 'Movie') {
        let donghuaName = episodeTitle.split(/\s+Sub/i)[0].trim();
        episodeTitle = `${donghuaName} Movie Subtitle Indonesia`;
      }
      
      return {
        number: episodeNumber,
        title: episodeTitle,
        date: episodeDate
      };
    }
    
    const pageTitle = $('.entry-title').text().trim() || $('.post-title').text().trim() || $('h1.title').text().trim();
    let episodeDate = '';
    
    $('.updated').each((i, el) => {
      const dateText = $(el).text().trim();
      if (dateText) {
        episodeDate = dateText;
      }
    });
    
    if (!episodeDate) {
      const releaseText = $('body').text().match(/Released\s+on\s+([A-Za-z]+\s+\d+,\s+\d{4})/i);
      if (releaseText && releaseText[1]) {
        episodeDate = releaseText[1];
      }
    }
    
    const episodeInfo = extractEpisodeInfo(pageTitle, slug);
    
    if (!episodeInfo.date && episodeDate) {
      episodeInfo.date = episodeDate;
    }
    
    let iframeSrc = '';
    $('iframe').each((i, el) => {
      const src = $(el).attr('src');
      if (src) {
        iframeSrc = src;
        return false;
      }
    });
    
    if (!iframeSrc) {
      const htmlContent = $.html();
      const iframeMatch = htmlContent.match(/src=["'](https?:\/\/[^"']+)["']/i);
      if (iframeMatch && iframeMatch[1]) {
        iframeSrc = iframeMatch[1];
      }
    }
    
    const videoServers = [];
    $('select.mirror option').each((i, el) => {
      const value = $(el).attr('value');
      const serverName = $(el).text().trim();
      
      if (value && serverName && serverName !== 'Select Video Server') {
        try {
          const decodedValue = Buffer.from(value, 'base64').toString('utf-8');
          const srcMatch = decodedValue.match(/src=["'](https?:\/\/[^"']+)["']/i);
          if (srcMatch && srcMatch[1]) {
            videoServers.push({
              name: serverName,
              url: srcMatch[1]
            });
          }
        } catch (e) {
          console.error('Error decoding base64:', e);
        }
      }
    });
    
    if (videoServers.length > 0 && !iframeSrc) {
      iframeSrc = videoServers[0].url;
    }
    
    // Fungsi untuk mengekstrak cookie name player dari HTML/script
    function extractCookieNamePlayer($) {
      let cookieName = null;
      const htmlContent = $.html();
      
      // Pattern 1: Cari di script untuk Cookies.get/set dengan cookie name
      const cookiePattern1 = /Cookies\.(get|set)\s*\(\s*['"]([a-z0-9]{6,15})['"]/gi;
      let match;
      while ((match = cookiePattern1.exec(htmlContent)) !== null) {
        if (match[2] && match[2].length >= 6) {
          cookieName = match[2];
          break;
        }
      }
      
      // Pattern 2: Cari pattern anichin.click/hls/{id}.m3u8
      if (!cookieName) {
        const hlsMatch = htmlContent.match(/anichin\.click\/hls\/([a-z0-9]{6,15})\.m3u8/i);
        if (hlsMatch && hlsMatch[1]) {
          cookieName = hlsMatch[1];
        }
      }
      
      // Pattern 3: Cari di script untuk player setup dengan cookie name
      if (!cookieName) {
        $('script').each((i, el) => {
          const scriptContent = $(el).html() || '';
          
          // Cari pattern seperti: cookie: "v70s5sm" atau cookie: 'v70s5sm'
          const cookieMatch = scriptContent.match(/cookie\s*[:=]\s*['"]([a-z0-9]{6,15})['"]/i);
          if (cookieMatch && cookieMatch[1]) {
            cookieName = cookieMatch[1];
            return false; // break
          }
          
          // Cari di jwplayer setup
          const jwMatch = scriptContent.match(/jwplayer.*?cookie\s*[:=]\s*['"]([a-z0-9]{6,15})['"]/i);
          if (jwMatch && jwMatch[1]) {
            cookieName = jwMatch[1];
            return false;
          }
        });
      }
      
      // Pattern 4: Cari di URL iframe atau video source yang mengandung anichin
      if (!cookieName) {
        $('iframe, video source').each((i, el) => {
          const src = $(el).attr('src') || '';
          if (src.includes('anichin.click') || src.includes('anichin.club')) {
            const urlMatch = src.match(/[\/=]([a-z0-9]{6,15})(?:\.m3u8|[\?&]|$)/i);
            if (urlMatch && urlMatch[1]) {
              cookieName = urlMatch[1];
              return false;
            }
          }
        });
      }
      
      return cookieName;
    }
    
    // Fungsi untuk mengekstrak OK.RU ID dari URL
    function extractOkruId(url) {
      if (!url) return null;
      
      // Pattern 1: ok.ru/videoembed/{id}
      const okruMatch1 = url.match(/ok\.ru\/videoembed\/(\d+)/i);
      if (okruMatch1 && okruMatch1[1]) {
        return okruMatch1[1];
      }
      
      // Pattern 2: ok.ru/video/{id}
      const okruMatch2 = url.match(/ok\.ru\/video\/(\d+)/i);
      if (okruMatch2 && okruMatch2[1]) {
        return okruMatch2[1];
      }
      
      // Pattern 3: odnoklassniki.ru/videoembed/{id}
      const okruMatch3 = url.match(/odnoklassniki\.ru\/videoembed\/(\d+)/i);
      if (okruMatch3 && okruMatch3[1]) {
        return okruMatch3[1];
      }
      
      return null;
    }
    
    // Ekstrak cookie name player
    const cookieNamePlayer = extractCookieNamePlayer($);
    
    // Ekstrak OK.RU ID dari iframeSrc atau videoServers
    let okruId = null;
    if (iframeSrc) {
      okruId = extractOkruId(iframeSrc);
    }
    if (!okruId && videoServers.length > 0) {
      for (const server of videoServers) {
        okruId = extractOkruId(server.url);
        if (okruId) break;
      }
    }
    
    // Log untuk debugging (optional)
    if (cookieNamePlayer) {
      console.log(`[ANICHIN] Cookie name player ditemukan: ${cookieNamePlayer}`);
    }
    if (okruId) {
      console.log(`[ANICHIN] OK.RU ID ditemukan: ${okruId}`);
    }
    
    // Ganti URL dengan format baru
    const playerBaseUrl = 'https://anichin.cloud/player';
    
    // Ganti iframeSrc jika ada cookie name (untuk Anichin player)
    if (cookieNamePlayer && iframeSrc) {
      // Cek apakah URL adalah anichin player
      if (iframeSrc.includes('anichin.click') || iframeSrc.includes('anichin.club') || iframeSrc.includes('anichin.watch')) {
        iframeSrc = `${playerBaseUrl}/${cookieNamePlayer}`;
      }
    }
    
    // Ganti iframeSrc jika ada OK.RU ID (untuk OK.RU player)
    if (okruId && iframeSrc && (iframeSrc.includes('ok.ru') || iframeSrc.includes('odnoklassniki.ru'))) {
      iframeSrc = `${playerBaseUrl}/${okruId}`;
    }
    
    // Ganti videoServers URL
    videoServers.forEach(server => {
      // Ganti untuk Anichin player
      if (cookieNamePlayer && server.url) {
        if (server.url.includes('anichin.click') || server.url.includes('anichin.club') || server.url.includes('anichin.watch')) {
          server.url = `${playerBaseUrl}/${cookieNamePlayer}`;
        }
      }
      
      // Ganti untuk OK.RU player
      if (okruId && server.url && (server.url.includes('ok.ru') || server.url.includes('odnoklassniki.ru'))) {
        server.url = `${playerBaseUrl}/${okruId}`;
      }
    });
    
    const downloadLinks = [];
    
    $('.mctnx .soraddlx .soraurlx').each((i, el) => {
      const quality = $(el).find('strong').text().trim();
      const links = [];
      
      $(el).find('a').each((j, link) => {
        const href = $(link).attr('href');
        const text = $(link).text().trim();
        
        if (href && !href.includes('javascript:')) {
          links.push({
            name: text,
            url: href
          });
        }
      });
      
      if (quality && links.length > 0) {
        downloadLinks.push({
          quality: quality,
          links: links
        });
      }
    });
    
    if (downloadLinks.length === 0) {
      $('.dlbutton a, .download-eps a, .download a, .sdlbutton a, .smokeddl a, .smokeddl .smokeurl a, .button-download a, a.button.button-primary, a[href*="download"], a[href*=".mp4"], a[href*="zippy"], a[href*="mega.nz"]').each((i, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        
        if (href && !href.includes('javascript:') && !downloadLinks.some(link => link.links && link.links.some(l => l.url === href))) {
          let quality = text;
          
          const qualityMatch = text.match(/(\d+p)/i);
          if (qualityMatch) {
            quality = qualityMatch[1];
          } else if (text.match(/720/i)) {
            quality = '720p';
          } else if (text.match(/1080/i)) {
            quality = '1080p';
          } else if (text.match(/480/i)) {
            quality = '480p';
          } else if (text.match(/360/i)) {
            quality = '360p';
          } else {
            quality = 'unknown';
          }
          
          let qualityEntry = downloadLinks.find(link => link.quality === quality);
          if (!qualityEntry) {
            qualityEntry = {
              quality: quality,
              links: []
            };
            downloadLinks.push(qualityEntry);
          }
          
          qualityEntry.links.push({
            name: text,
            url: href
          });
        }
      });
    }
    
    let prevEpisode = null;
    let nextEpisode = null;
    
    $('.naveps a, .bixbox .nvs a, .nvs a, a.prev, a.next, .pager a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim().toLowerCase();
      
      if (href) {
        const endpoint = href.replace(/^https?:\/\/[^\/]+\//, '').replace(/\/$/, '');
        
        if (text.includes('prev') || text.includes('sebelum')) {
          prevEpisode = endpoint;
        } else if (text.includes('next') || text.includes('selanjut')) {
          nextEpisode = endpoint;
        }
      }
    });
    
    let donghuaSlug = '';
    $('.breadcrumb a, .series a, .serieslink a, a[href*="/donghua/"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('/donghua/')) {
        donghuaSlug = href.replace(/^https?:\/\/[^\/]+\/donghua\//, '').replace(/\/$/, '');
      }
    });
    
    if (!donghuaSlug) {
      const slugParts = slug.split('-episode-');
      if (slugParts.length > 1) {
        donghuaSlug = slugParts[0];
      }
    }
    
    const episode = {
      number: episodeInfo.number || "1",
      title: episodeInfo.title,
      date: episodeInfo.date,
      iframeSrc,
      videoServers,
      downloadLinks,
      prevEpisode,
      nextEpisode,
      donghuaSlug
    };
    
    // Track performance untuk endpoint episode detail
    safeTrack('anichin_episode_detail', { 
      slug: slug,
      episodeNumber: episode.number,
      hasVideo: !!episode.iframeSrc,
      downloadLinksCount: episode.downloadLinks.length 
    });
    
    res.json(episode);
  } catch (error) {
    console.error('Error fetching episode details:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint untuk list donghua
router.get('/donghua-list', async (req, res) => {
  try {
    const $ = await fetchPage(`${BASE_URL}/donghua/list-mode/`);
    
    // Objek untuk menyimpan anime berdasarkan abjad
    const donghuaByAlphabet = {};
    
    // Ambil semua huruf dari navigasi
    const alphabets = [];
    $('#tsnlistssc a').each((i, el) => {
      const alphabet = $(el).text().trim();
      if (alphabet && alphabet.length === 1) {
        alphabets.push(alphabet);
        donghuaByAlphabet[alphabet] = [];
      }
    });
    
    // Proses setiap blok abjad
    $('.blix').each((i, el) => {
      // Ambil huruf abjad dari span
      const alphabetElement = $(el).find('span a');
      const alphabet = alphabetElement.text().trim();
      
      // Jika abjad valid, proses semua anime dalam blok ini
      if (alphabet && alphabet.length === 1) {
        $(el).find('li').each((j, item) => {
          const link = $(item).find('a');
          const title = link.text().trim();
          const href = link.attr('href');
          
          let slug = '';
          if (href) {
            const slugMatch = href.match(/\/donghua\/([^/]+)/);
            if (slugMatch && slugMatch[1]) {
              slug = slugMatch[1];
            }
          }
          
          if (title && slug) {
            donghuaByAlphabet[alphabet].push({
              title,
              slug
            });
          }
        });
      }
    });
    
    // Hitung total donghua
    let totalDonghua = 0;
    Object.keys(donghuaByAlphabet).forEach(key => {
      totalDonghua += donghuaByAlphabet[key].length;
    });
    
    res.json({
      donghuaByAlphabet,
      alphabets,
      total: totalDonghua
    });
  } catch (error) {
    console.error('Error fetching donghua list:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint untuk pencarian donghua
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim() === '') {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const page = parseInt(req.query.page) || 1;
    let url = `${BASE_URL}/?s=${encodeURIComponent(q)}&post_type=donghua`;
    
    // Jika halaman lebih dari 1, tambahkan parameter page
    if (page > 1) {
      url = `${BASE_URL}/page/${page}/?s=${encodeURIComponent(q)}&post_type=donghua`;
    }
    
    const $ = await fetchPage(url);
    
    const searchResults = [];
    
    // Mencari hasil pencarian
    $('.listupd .bs, .bixbox .bs').each((i, el) => {
      const title = $(el).find('.tt, .entry-title').text().trim();
      const link = $(el).find('a').attr('href');
      const image = $(el).find('img').attr('src');
      let slug = '';
      
      if (link) {
        // Ekstrak slug dari URL
        const slugMatch = link.match(/\/donghua\/([^/]+)/);
        if (slugMatch && slugMatch[1]) {
          slug = slugMatch[1];
        }
      }
      
      // Ekstrak informasi tambahan
      let type = '';
      let score = '';
      let season = '';
      
      $(el).find('.typez, .type').each((j, typeEl) => {
        type = $(typeEl).text().trim();
      });
      
      $(el).find('.rating, .score').each((j, scoreEl) => {
        score = $(scoreEl).text().trim();
      });
      
      $(el).find('.season').each((j, seasonEl) => {
        season = $(seasonEl).text().trim();
      });
      
      // Tambahkan ke hasil pencarian jika ada title dan slug
      if (title && slug) {
        searchResults.push({
          title,
          slug,
          image: formatImageUrl(image),
          type,
          score,
          season
        });
      }
    });
    
    // Mencari informasi pagination
    const pagination = {
      currentPage: page,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: page > 1
    };
    
    $('.hpage .page-numbers, .pagination .page-numbers').each((i, el) => {
      const pageText = $(el).text().trim();
      
      // Mencari total halaman dari link terakhir yang bukan "Next"
      if (pageText !== '…' && pageText.toLowerCase() !== 'next' && !isNaN(parseInt(pageText))) {
        const pageNum = parseInt(pageText);
        if (pageNum > pagination.totalPages) {
          pagination.totalPages = pageNum;
        }
      }
    });
    
    // Cek apakah ada halaman berikutnya
    pagination.hasNextPage = pagination.currentPage < pagination.totalPages;
    
    res.json({
      query: q,
      searchResults,
      pagination
    });
  } catch (error) {
    console.error('Error searching donghua:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 