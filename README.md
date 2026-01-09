# Anime Scraper API

API untuk melakukan scraping situs anime populer di Indonesia.

## Daftar API yang Tersedia

- Anichin
- Animesail
- Otakudesu
- Samehadaku
- Browser
- Episode
- Layar Otaku (New!)

## Cara Penggunaan

### Layar Otaku API

API untuk mengakses data dari situs [Layar Otaku](https://www.layarotaku.com/).

#### Endpoints

1. **Daftar Anime**
   ```
   GET /layarotaku/anime/:slug
   ```
   Contoh: `/layarotaku/anime/accel-world`

   Response:
   ```json
   {
     "title": "Accel World",
     "alternativeTitles": "...",
     "image": "https://www.layarotaku.com/...",
     "synopsis": "...",
     "score": "8.5",
     "info": {
       "status": "Completed",
       "studio": "Sunrise",
       "genre": "Action, Romance, Sci-Fi"
     },
     "genres": ["Action", "Romance", "Sci-Fi"],
     "episodes": [
       {
         "number": "24",
         "title": "Accel World Episode 24 End",
         "date": "Agustus 3, 2023",
         "slug": "accel-world-24-end",
         "link": "https://www.layarotaku.com/accel-world-24-end/"
       }
     ]
   }
   ```

2. **Detail Episode**
   ```
   GET /layarotaku/episode/:slug
   ```
   Contoh: `/layarotaku/episode/accel-world-18`

   Response:
   ```json
   {
     "number": "18",
     "title": "Accel World 18",
     "date": "Agustus 3, 2023",
     "iframeSrc": "https://www.blogger.com/video...",
     "videoServers": [],
     "prevEpisode": "accel-world-17",
     "nextEpisode": "accel-world-19",
     "animeSlug": "accel-world"
   }
   ```

3. **Pencarian Anime**
   ```
   GET /layarotaku/search?q=query
   ```
   Contoh: `/layarotaku/search?q=accel`

   Response:
   ```json
   [
     {
       "title": "Accel World",
       "slug": "accel-world",
       "image": "https://www.layarotaku.com/...",
       "link": "https://www.layarotaku.com/anime/accel-world/"
     }
   ]
   ```

## Instalasi

```bash
# Clone repository
git clone <repository-url>

# Masuk ke direktori project
cd <project-directory>

# Install dependencies
npm install

# Jalankan server
npm start
```

Server akan berjalan di `http://localhost:3000`. 