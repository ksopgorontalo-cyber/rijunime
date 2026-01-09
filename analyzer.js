const fs = require('fs');
const cheerio = require('cheerio');

// Membaca file HTML yang telah disimpan
function readHtmlFile(filename) {
  try {
    return fs.readFileSync(filename, 'utf8');
  } catch (error) {
    console.error(`Error membaca file ${filename}:`, error.message);
    return null;
  }
}

// Analisis halaman anime
function analyzeAnimePage(html) {
  if (!html) return;
  
  console.log('\n=== ANALISIS HALAMAN ANIME ===\n');
  
  const $ = cheerio.load(html);
  
  // Informasi dasar anime
  const title = $('h1.entry-title').text().trim();
  console.log('Judul:', title);
  
  // Thumbnail/Poster
  const posterUrl = $('.thumb img').attr('src');
  console.log('Poster URL:', posterUrl);
  
  // Informasi anime (rating, tahun, status, dll)
  console.log('\nInformasi Anime:');
  $('.infox .infoxs').each((i, el) => {
    console.log($(el).text().trim());
  });
  
  // Genre
  console.log('\nGenre:');
  $('.genxed a').each((i, el) => {
    console.log('- ' + $(el).text().trim());
  });
  
  // Daftar episode
  console.log('\nDaftar Episode:');
  $('.episodelist li').each((i, el) => {
    const episodeLink = $(el).find('a').attr('href');
    const episodeText = $(el).find('a').text().trim();
    console.log(`- ${episodeText}: ${episodeLink}`);
  });
  
  // Struktur selector penting
  console.log('\nSelector Penting:');
  console.log('- Judul: h1.entry-title');
  console.log('- Poster: .thumb img');
  console.log('- Info: .infox .infoxs');
  console.log('- Genre: .genxed a');
  console.log('- Episode: .episodelist li');
}

// Analisis halaman episode
function analyzeEpisodePage(html) {
  if (!html) return;
  
  console.log('\n=== ANALISIS HALAMAN EPISODE ===\n');
  
  const $ = cheerio.load(html);
  
  // Judul episode
  const title = $('h1.entry-title').text().trim();
  console.log('Judul Episode:', title);
  
  // Player video
  const iframeSrc = $('iframe').attr('src');
  console.log('\nVideo Player URL:', iframeSrc);
  
  // Server video
  console.log('\nServer Video:');
  $('.mirrorstream ul.mirror li').each((i, el) => {
    console.log('- ' + $(el).text().trim());
  });
  
  // Navigasi episode
  const prevEpisode = $('.naveps .nvs:first-child a').attr('href');
  const nextEpisode = $('.naveps .nvs:last-child a').attr('href');
  console.log('\nNavigasi:');
  console.log('- Episode Sebelumnya:', prevEpisode);
  console.log('- Episode Selanjutnya:', nextEpisode);
  
  // Struktur selector penting
  console.log('\nSelector Penting:');
  console.log('- Judul Episode: h1.entry-title');
  console.log('- Video Player: iframe');
  console.log('- Server Video: .mirrorstream ul.mirror li');
  console.log('- Navigasi: .naveps .nvs a');
}

// Jalankan analisis
const animeHtml = readHtmlFile('layarotaku_anime.html');
const episodeHtml = readHtmlFile('layarotaku_episode.html');

analyzeAnimePage(animeHtml);
analyzeEpisodePage(episodeHtml); 