const axios = require('axios');
const { getJakartaISOString, getJakartaTimestamp } = require('./dateHelper');

// Konfigurasi untuk berbagai analytics services
const ANALYTICS_CONFIG = {
  // Google Analytics 4 (jika ingin menggunakan)
  GA4_MEASUREMENT_ID: process.env.GA4_MEASUREMENT_ID,
  GA4_API_SECRET: process.env.GA4_API_SECRET,
  
  // Custom metrics endpoint (jika ada)
  CUSTOM_METRICS_URL: process.env.CUSTOM_METRICS_URL,
  
  // Enable/disable tracking
  ENABLE_TRACKING: process.env.NODE_ENV === 'production' || process.env.ENABLE_TRACKING === 'true'
};

/**
 * Safe tracking function untuk server-side metrics
 * @param {string} eventName - Nama event yang akan ditrack
 * @param {object} data - Data metrics yang akan dikirim
 * @param {object} options - Options tambahan
 */
async function safeTrack(eventName, data = {}, options = {}) {
  try {
    // Selalu log ke console untuk debugging
    const logData = {
      timestamp: getJakartaISOString(),
      event: eventName,
      data: data,
      userAgent: options.userAgent || 'API-Server',
      ip: options.ip || 'unknown'
    };
    
    console.log(`[METRICS] ${eventName}:`, JSON.stringify(logData));
    
    // Jika tracking dinonaktifkan, hanya log saja
    if (!ANALYTICS_CONFIG.ENABLE_TRACKING) {
      return;
    }
    
    // Kirim ke Google Analytics 4 (jika dikonfigurasi)
    if (ANALYTICS_CONFIG.GA4_MEASUREMENT_ID && ANALYTICS_CONFIG.GA4_API_SECRET) {
      await sendToGA4(eventName, data, options);
    }
    
    // Kirim ke custom metrics endpoint (jika dikonfigurasi)
    if (ANALYTICS_CONFIG.CUSTOM_METRICS_URL) {
      await sendToCustomEndpoint(eventName, data, options);
    }
    
  } catch (error) {
    console.error('Error tracking metrics:', error);
  }
}

/**
 * Kirim metrics ke Google Analytics 4
 */
async function sendToGA4(eventName, data, options) {
  try {
    const payload = {
      client_id: options.clientId || 'api-server',
      events: [{
        name: eventName,
        params: {
          ...data,
          timestamp: getJakartaTimestamp(),
          source: 'api-server'
        }
      }]
    };
    
    await axios.post(
      `https://www.google-analytics.com/mp/collect?measurement_id=${ANALYTICS_CONFIG.GA4_MEASUREMENT_ID}&api_secret=${ANALYTICS_CONFIG.GA4_API_SECRET}`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );
    
    console.log(`[GA4] Event sent: ${eventName}`);
  } catch (error) {
    console.error('Error sending to GA4:', error.message);
  }
}

/**
 * Kirim metrics ke custom endpoint
 */
async function sendToCustomEndpoint(eventName, data, options) {
  try {
    const payload = {
      event: eventName,
      data: data,
      timestamp: getJakartaISOString(),
      source: 'anime-scraper-api',
      userAgent: options.userAgent,
      ip: options.ip
    };
    
    await axios.post(ANALYTICS_CONFIG.CUSTOM_METRICS_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Anime-Scraper-Metrics/1.0'
      },
      timeout: 5000
    });
    
    console.log(`[CUSTOM] Event sent: ${eventName}`);
  } catch (error) {
    console.error('Error sending to custom endpoint:', error.message);
  }
}

/**
 * Track error dengan context tambahan
 */
function trackError(error, context = {}) {
  const errorData = {
    message: error.message,
    stack: error.stack?.substring(0, 500),
    name: error.name,
    code: error.code,
    ...context
  };
  
  return safeTrack('api_error', errorData);
}

/**
 * Track performance metrics
 */
function trackPerformance(operation, duration, metadata = {}) {
  const perfData = {
    operation,
    duration_ms: duration,
    timestamp: Date.now(),
    ...metadata
  };
  
  return safeTrack('api_performance', perfData);
}

/**
 * Middleware untuk tracking request metrics
 */
function createTrackingMiddleware() {
  return (req, res, next) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const route = req.route ? req.route.path : req.path;
      
      safeTrack('api_request', {
        method: req.method,
        route: route,
        status: res.statusCode,
        duration_ms: duration,
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress
      }, {
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress
      });
    });
    
    next();
  };
}

module.exports = {
  safeTrack,
  trackError,
  trackPerformance,
  createTrackingMiddleware
}; 