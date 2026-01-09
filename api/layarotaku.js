const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { safeTrack, trackError } = require('./utils/metrics');

const router = express.Router();

// Base URL
const BASE_URL = 'https://www.layarotaku.com';

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
  
  // Jika URL sudah lengkap, kembalikan apa adanya tapi hapus www.
  if (imageUrl.startsWith('http')) {
    return imageUrl.replace('www.', '');
  }
  
  // Jika URL relatif, tambahkan BASE_URL tanpa www.
  return `${BASE_URL.replace('www.', '')}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
}

// Fungsi helper untuk mengekstrak informasi episode dari teks
function extractEpisodeInfo(text, link) {
  let episodeNumber = '';
  
  // Cek apakah ini adalah movie
  const movieMatch = text.match(/\b(?:Movie|The\s+Movie)\b/i);
  if (movieMatch) {
    episodeNumber = 'Movie';
  } else {
    // Coba ekstrak dari teks judul
    const episodeMatch = text.match(/Episode\s+(\d+)/i) || 
                        text.match(/Eps\s*(\d+)/i);
    
    if (episodeMatch && episodeMatch[1]) {
      episodeNumber = episodeMatch[1];
    } 
    // Jika tidak ditemukan di judul, coba ekstrak dari URL/slug
    else if (link) {
      // Format: nama-anime-episode-XX
      const episodeSlugMatch = link.match(/episode-(\d+)/i);
      if (episodeSlugMatch && episodeSlugMatch[1]) {
        episodeNumber = episodeSlugMatch[1];
      } 
      // Format: nama-anime-XX (tanpa kata "episode")
      else {
        const directNumberMatch = link.match(/[^a-zA-Z0-9](\d+)(?:-end)?$/);
        if (directNumberMatch && directNumberMatch[1]) {
          episodeNumber = directNumberMatch[1];
        }
      }
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
    let animeName = episodeTitle.split(/\s+Sub/i)[0].trim();
    episodeTitle = `${animeName} Episode ${episodeNumber} Subtitle Indonesia`;
  } else if (!episodeTitle.includes("Movie") && episodeNumber === 'Movie') {
    let animeName = episodeTitle.split(/\s+Sub/i)[0].trim();
    episodeTitle = `${animeName} Movie Subtitle Indonesia`;
  }
  
  return {
    number: episodeNumber,
    title: episodeTitle,
    date: episodeDate
  };
}

// Endpoint untuk jadwal rilis anime
router.get('/schedule', async (req, res) => {
  try {
    const $ = await fetchPage(`${BASE_URL}/jadwal-rilis`);
    
    const schedule = [];
    
    // Mencari semua div dengan class schedulepage
    $('.bixbox.schedulepage').each((i, dayContainer) => {
      const dayElement = $(dayContainer).find('.releases h3');
      const day = dayElement.text().trim();
      
      const animeList = [];
      
      // Mencari semua anime dalam hari tersebut
      $(dayContainer).find('.bs').each((j, animeItem) => {
        const title = $(animeItem).find('.tt').text().trim();
        const link = $(animeItem).find('a').attr('href');
        let slug = '';
        
        if (link) {
          // Ekstrak slug dari URL
          const slugMatch = link.match(/\/anime\/([^/]+)/);
          if (slugMatch && slugMatch[1]) {
            slug = slugMatch[1];
          }
        }
        
        // Ekstrak timer
        const timerElement = $(animeItem).find('.epx');
        let timer = timerElement.text().trim();
        
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
          day,
          anime: animeList
        });
      }
    });
    
    // Track performance untuk endpoint schedule
    safeTrack('layarotaku_schedule_success', { scheduleCount: schedule.length });
    
    res.json(schedule);
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint untuk detail anime
router.get('/anime/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const $ = await fetchPage(`${BASE_URL}/anime/${slug}`);
    
    const anime = {
      title: $('h1.entry-title').text().trim(),
      alternativeTitles: $('.alternative-title').text().trim() || $('.alt-title').text().trim(),
      image: formatImageUrl($('.thumb img').attr('src')),
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
        anime.score = ratingMatch[1];
      }
    }
    
    // Ekstrak genre - perbaikan selector
    $('.genxed a[rel="tag"]').each((i, el) => {
      const genre = $(el).text().trim();
      if (genre) {
        anime.genres.push(genre);
      }
    });
    
    // Info anime
    $('.info .info-item, .spe span, .infox .infoxs').each((i, el) => {
      const text = $(el).text().trim();
      const [key, value] = text.split(':').map(item => item.trim());
      
      if (key && value) {
        // Memetakan key dari layarotaku ke format anichin
        let normalizedKey = key.toLowerCase();
        
        // Pemetaan key
        const keyMapping = {
          'status': 'status',
          'studio': 'studio',
          'dirilis': 'released',
          'durasi': 'duration',
          'season': 'season',
          'tipe': 'type',
          'episode': 'episodes',
          'director': 'director',
          'producers': 'producers',
          'casts': 'casts',
          'diperbarui pada': 'updated on',
          'network': 'network',
          'country': 'country',
          'posted by': 'posted by',
          'released on': 'released on'
        };
        
        if (keyMapping[normalizedKey]) {
          normalizedKey = keyMapping[normalizedKey];
        }
        
        anime.info[normalizedKey] = value;
      }
    });
    
    // Daftar episode - perbaikan selector
    $('.eplister ul li').each((i, el) => {
      const episodeLink = $(el).find('a').attr('href');
      const episodeNumber = $(el).find('.epl-num').text().trim();
      const episodeTitle = $(el).find('.epl-title').text().trim();
      const episodeDate = $(el).find('.epl-date').text().trim();
      
      // Ekstrak slug dari URL
      let episodeSlug = '';
      if (episodeLink) {
        episodeSlug = episodeLink.replace(`${BASE_URL}/`, '').replace(/\/$/, '');
      }
      
      // Cek apakah ini adalah movie
      let number = episodeNumber;
      if (!number) {
        if (episodeTitle.match(/\b(?:Movie|The\s+Movie)\b/i)) {
          number = '1'; // Gunakan angka untuk movie
        } else {
          number = '1'; // Default jika tidak ada nomor dan bukan movie
        }
      }
      
      // Pastikan number selalu berupa angka
      if (number === 'movie' || number === 'Movie') {
        number = '1';
      }
      
      let title = episodeTitle;
      
      if (!title.includes("Episode") && number) {
        let animeName = title.split(/\s+Sub/i)[0].trim();
        title = `${animeName} Episode ${number} Subtitle Indonesia`;
      }
      
      anime.episodes.push({
        number: number,
        title: title,
        date: episodeDate,
        slug: episodeSlug
      });
    });
    
    // Urutkan episode dari terbaru ke terlama
    anime.episodes.sort((a, b) => {
      return parseInt(b.number) - parseInt(a.number);
    });
    
    // Track performance untuk endpoint anime detail
    safeTrack('layarotaku_anime_detail', { 
      slug: slug,
      episodeCount: anime.episodes.length,
      genreCount: anime.genres.length 
    });
    
    res.json(anime);
  } catch (error) {
    console.error('Error fetching anime details:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint untuk detail episode
router.get('/episode/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    // Jika slug berisi full URL, ekstrak bagian slug saja
    const cleanSlug = slug.includes('/') ? slug.split('/').pop() : slug;
    const $ = await fetchPage(`${BASE_URL}/${cleanSlug}`);
    
    const pageTitle = $('h1.entry-title').text().trim();
    let episodeDate = '';
    
    // Coba dapatkan tanggal dari berbagai sumber
    $('.updated, .date').each((i, el) => {
      const dateText = $(el).text().trim();
      if (dateText) {
        episodeDate = dateText;
      }
    });
    
    if (!episodeDate) {
      const releaseText = $('body').text().match(/Released\s+on\s+([A-Za-z]+\s+\d+,\s+\d{4})/i) ||
                         $('body').text().match(/Dirilis\s+pada\s+([A-Za-z]+\s+\d+,\s+\d{4})/i);
      if (releaseText && releaseText[1]) {
        episodeDate = releaseText[1];
      }
    }
    
    const episodeInfo = extractEpisodeInfo(pageTitle, cleanSlug);
    
    if (!episodeInfo.date && episodeDate) {
      episodeInfo.date = episodeDate;
    }
    
    // Jika nomor episode masih belum ditemukan, coba ekstrak dari URL dengan berbagai format
    if (!episodeInfo.number) {
      // Format: nama-XX atau nama-anime-XX
      const directNumberMatch = cleanSlug.match(/[^a-zA-Z0-9](\d+)(?:-end)?$/);
      if (directNumberMatch && directNumberMatch[1]) {
        episodeInfo.number = directNumberMatch[1];
      }
    }
    
    // Ekstrak URL iframe video
    let iframeSrc = '';
    $('iframe').each((i, el) => {
      const src = $(el).attr('src');
      if (src) {
        iframeSrc = src;
        return false;
      }
    });
    
    // Jika tidak ada iframe, coba cari dari teks HTML
    if (!iframeSrc) {
      const htmlContent = $.html();
      const iframeMatch = htmlContent.match(/src=["'](https?:\/\/[^"']+)["']/i);
      if (iframeMatch && iframeMatch[1]) {
        iframeSrc = iframeMatch[1];
      }
    }
    
    // Ekstrak server video
    const videoServers = [];
    
    // Coba selector mirrorstream
    $('.mirrorstream ul.mirror li').each((i, el) => {
      const serverName = $(el).text().trim();
      const serverData = $(el).attr('data-frame');
      
      if (serverName && serverData) {
        videoServers.push({
          name: serverName,
          url: serverData // Sesuaikan dengan anichin.js yang menggunakan 'url'
        });
      }
    });
    
    // Coba selector select.mirror option seperti di anichin.js
    if (videoServers.length === 0) {
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
    }
    
    if (videoServers.length > 0 && !iframeSrc) {
      iframeSrc = videoServers[0].url;
    }
    
    // Ekstrak download links
    const downloadLinks = [];
    
    // Coba selector .mctnx .soraddlx .soraurlx seperti di anichin.js
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
    
    // Coba selector alternatif untuk download links
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
    
    // Navigasi episode (prev/next)
    let prevEpisode = null;
    let nextEpisode = null;
    
    // Coba selector .naveps .nvs a
    $('.naveps .nvs a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim().toLowerCase();
      
      if (href) {
        const endpoint = href.replace(`${BASE_URL}/`, '').replace(/\/$/, '');
        
        if (text.includes('prev') || text.includes('sebelum')) {
          prevEpisode = endpoint;
        } else if (text.includes('next') || text.includes('selanjut')) {
          nextEpisode = endpoint;
        }
      }
    });
    
    // Coba selector alternatif untuk navigasi
    if (!prevEpisode && !nextEpisode) {
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
    }
    
    // Cari slug anime dari breadcrumb atau link lain
    let animeSlug = '';
    
    // Coba dapatkan dari breadcrumb dengan schema.org markup
    $('.ts-breadcrumb [itemtype="http://schema.org/ListItem"]').each((i, el) => {
      // Kita cari item kedua dalam breadcrumb (index 1), yang biasanya adalah link ke anime
      if (i === 1) {
        const link = $(el).find('a').attr('href');
        if (link && link.includes('/anime/')) {
          animeSlug = link.replace(/^https?:\/\/[^\/]+\/anime\//, '').replace(/\/$/, '');
          return false; // break each loop
        }
      }
    });
    
    // Jika tidak ditemukan dari breadcrumb schema.org, coba dari meta data
    if (!animeSlug) {
      $('meta[property="og:url"]').each((i, el) => {
        const content = $(el).attr('content');
        if (content && content.includes('/anime/')) {
          const match = content.match(/\/anime\/([^\/]+)/);
          if (match && match[1]) {
            animeSlug = match[1];
            return false; // break each loop
          }
        }
      });
    }
    
    // Jika tidak ditemukan dari meta, coba dari link biasa
    if (!animeSlug) {
      $('.breadcrumb a, .series a, .serieslink a, a[href*="/anime/"]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('/anime/')) {
          animeSlug = href.replace(/^https?:\/\/[^\/]+\/anime\//, '').replace(/\/$/, '');
          return false; // break each loop
        }
      });
    }
    
    // Jika masih tidak ditemukan, coba ekstrak dari title
    if (!animeSlug) {
      const animeTitleMatch = pageTitle.match(/^(.+?)(?:\s+Episode|\s+Eps)/i);
      if (animeTitleMatch && animeTitleMatch[1]) {
        // Konversi judul anime menjadi slug format
        let slugCandidate = animeTitleMatch[1].trim()
          .toLowerCase()
          .replace(/[^\w\s-]/g, '') // Hapus karakter khusus
          .replace(/\s+/g, '-');    // Ganti spasi dengan tanda hubung
        
        // Hapus tanda hubung berlebih
        slugCandidate = slugCandidate.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
        
        if (slugCandidate) {
          animeSlug = slugCandidate;
        }
      }
    }
    
    // Jika masih tidak ditemukan, coba ekstrak dari slug episode
    if (!animeSlug) {
      // Format: nama-anime-episode-XX
      const episodeFormatMatch = cleanSlug.match(/^(.+?)-episode-\d+/);
      if (episodeFormatMatch && episodeFormatMatch[1]) {
        animeSlug = episodeFormatMatch[1];
      } 
      // Format: nama-anime-XX
      else {
        const slugMatch = cleanSlug.match(/^([^-]+(?:-[^-]+)*)-\d+/);
        if (slugMatch && slugMatch[1]) {
          animeSlug = slugMatch[1];
        }
      }
    }
    
    // Format output sesuai dengan anichin.js
    const episode = {
      number: episodeInfo.number || "1",
      title: episodeInfo.title,
      date: episodeInfo.date,
      iframeSrc,
      videoServers,
      downloadLinks,
      prevEpisode,
      nextEpisode,
      animeSlug // Sesuai dengan format anichin.js yang menggunakan donghuaSlug
    };
    
    // Track performance untuk endpoint episode detail
    safeTrack('layarotaku_episode_detail', { 
      slug: cleanSlug,
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

// Endpoint untuk list anime
router.get('/anime-list', async (req, res) => {
  try {
    const $ = await fetchPage(`${BASE_URL}/anime/list-mode/`);
    
    // Objek untuk menyimpan anime berdasarkan abjad
    const animeByAlphabet = {};
    
    // Ambil semua huruf dari navigasi
    const alphabets = [];
    $('#tsnlistssc a').each((i, el) => {
      const alphabet = $(el).text().trim();
      if (alphabet && alphabet.length === 1) {
        alphabets.push(alphabet);
        animeByAlphabet[alphabet] = [];
      }
    });
    
    // Proses setiap blok abjad
    $('.blix').each((i, el) => {
      // Ambil huruf abjad dari span
      const alphabetElement = $(el).find('span a');
      const alphabet = alphabetElement.text().trim();
      
      // Jika abjad valid, proses semua anime dalam blok ini
      if (alphabet && alphabet.length === 1) {
        // Pastikan array untuk huruf ini ada
        if (!animeByAlphabet[alphabet]) {
          animeByAlphabet[alphabet] = [];
          // Tambahkan ke daftar abjad jika belum ada
          if (!alphabets.includes(alphabet)) {
            alphabets.push(alphabet);
          }
        }
        
        $(el).find('li').each((j, item) => {
          const link = $(item).find('a');
          const title = link.text().trim();
          const href = link.attr('href');
          
          let slug = '';
          if (href) {
            const slugMatch = href.match(/\/anime\/([^/]+)/);
            if (slugMatch && slugMatch[1]) {
              slug = slugMatch[1];
            }
          }
          
          if (title && slug) {
            animeByAlphabet[alphabet].push({
              title,
              slug
            });
          }
        });
      }
    });
    
    // Hitung total anime
    let totalAnime = 0;
    Object.keys(animeByAlphabet).forEach(key => {
      totalAnime += animeByAlphabet[key].length;
    });
    
    res.json({
      animeByAlphabet,
      alphabets,
      total: totalAnime
    });
  } catch (error) {
    console.error('Error fetching anime list:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint untuk pencarian anime
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim() === '') {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const page = parseInt(req.query.page) || 1;
    let url = `${BASE_URL}/?s=${encodeURIComponent(q)}&post_type=anime`;
    
    // Jika halaman lebih dari 1, tambahkan parameter page
    if (page > 1) {
      url = `${BASE_URL}/page/${page}/?s=${encodeURIComponent(q)}&post_type=anime`;
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
        const slugMatch = link.match(/\/anime\/([^/]+)/);
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
    console.error('Error searching anime:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 