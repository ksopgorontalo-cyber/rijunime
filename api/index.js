const express = require('express');
const cors = require('cors');
const { injectSpeedInsights } = require('@vercel/speed-insights');
const { createTrackingMiddleware, trackError } = require('./utils/metrics');
const { getJakartaISOString } = require('./utils/dateHelper');
const anichinRouter = require('./anichin');
const browserRouter = require('./browser');
const layarotakuRouter = require('./layarotaku');
const layarwibuRouter = require('./layarwibu');
const sokujaRouter = require('./sokuja');
const otakudesuRouter = require('./otakudesu');

const app = express();

// Inject Vercel Speed Insights
injectSpeedInsights();

// Enable trust proxy
app.set('trust proxy', 1);

// Advanced tracking middleware
app.use(createTrackingMiddleware());

// Middleware
app.use(cors());
app.use(express.json());

// Rute utama
app.get('/', (req, res) => {
  res.json({
    message: 'Anime Scraper API is running',
    endpoints: {
      anichin: {
        donghua: '/anichin/donghua/:slug',
        episode: '/anichin/episode/:slug',
        schedule: '/anichin/schedule',
        donghuaList: '/anichin/donghua-list',
        search: '/anichin/search?q=query&page=1'
      },
      layarotaku: {
        anime: '/layarotaku/anime/:slug',
        episode: '/layarotaku/episode/:slug',
        schedule: '/layarotaku/schedule',
        animeList: '/layarotaku/anime-list',
        search: '/layarotaku/search?q=query&page=1'
      },
      layarwibu: {
        anime: '/layarwibu/anime/:slug',
        episode: '/layarwibu/episode/:slug',
        schedule: '/layarwibu/schedule',
        animeList: '/layarwibu/anime-list',
        completed: '/layarwibu/completed',
        search: '/layarwibu/search?q=query&page=1',
        batch: '/layarwibu/batch/:id',
        genres: '/layarwibu/genres',
        genreAnime: '/layarwibu/genres/:genre'
      },
      sokuja: {
        anime: '/sokuja/anime/:slug',
        episode: '/sokuja/episode/:slug',
        schedule: '/sokuja/schedule',
        animeList: '/sokuja/anime-list',
        search: '/sokuja/search?q=query&page=1'
      },
      otakudesu: {
        anime: '/otakudesu/anime/:slug',
        episode: '/otakudesu/episode/:slug',
        schedule: '/otakudesu/schedule',
        animeList: '/otakudesu/anime-list',
        search: '/otakudesu/search?q=query&page=1',
        batch: '/otakudesu/batch/:id',
        genres: '/otakudesu/genres',
        genreAnime: '/otakudesu/genres/:genre'
      }
    }
  });
});

// Health check endpoint untuk monitoring
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: getJakartaISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: require('../package.json').version
  });
});

// Gunakan router dengan prefix
app.use('/anichin', anichinRouter);
app.use('/layarotaku', layarotakuRouter);
app.use('/layarwibu', layarwibuRouter);
app.use('/sokuja', sokujaRouter);
app.use('/otakudesu', otakudesuRouter);

// Error handler middleware
app.use((err, req, res, next) => {
  console.error('API Error:', err);

  // Track error dengan context
  trackError(err, {
    route: req.route ? req.route.path : req.path,
    method: req.method,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  // Handle specific errors
  if (err.message.includes('403')) {
    return res.status(403).json({
      error: 'Access forbidden. The source website is blocking our request.',
      retryAfter: 60
    });
  }

  if (err.message.includes('404')) {
    return res.status(404).json({
      error: 'The requested content was not found.'
    });
  }

  if (err.code === 'ECONNABORTED') {
    return res.status(504).json({
      error: 'Request timeout. Please try again.'
    });
  }

  // Default error response
  res.status(500).json({
    error: 'An error occurred while processing your request.',
    message: err.message
  });
});

// Jalankan server jika dijalankan langsung
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
  });
}

// Export untuk Vercel
module.exports = app;
