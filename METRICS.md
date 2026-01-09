# 📊 Sistem Metrics & Tracking

Sistem monitoring dan analytics yang terintegrasi dengan `@vercel/speed-insights` untuk API scraping anime.

## 🚀 Fitur Tracking

### 1. **Speed Insights Integration**
- ✅ Client-side monitoring dengan `injectSpeedInsights()`
- ✅ Server-side tracking dengan custom metrics
- ✅ Performance monitoring untuk semua endpoints

### 2. **Advanced Metrics Tracking**
- ✅ Request/Response time tracking
- ✅ Error tracking dengan context
- ✅ Business metrics (episode count, genre count, dll)
- ✅ Browser performance monitoring

### 3. **Multi-Platform Analytics**
- ✅ Console logging untuk development
- ✅ Google Analytics 4 integration (opsional)
- ✅ Custom metrics endpoint (opsional)

## 📈 Metrics yang Ditrack

### **API Performance**
```json
{
  "event": "api_request",
  "data": {
    "method": "GET",
    "route": "/anichin/donghua/:slug",
    "status": 200,
    "duration_ms": 1250,
    "userAgent": "Mozilla/5.0...",
    "ip": "127.0.0.1"
  }
}
```

### **Business Metrics**
```json
{
  "event": "anichin_donghua_detail",
  "data": {
    "slug": "anime-slug",
    "episodeCount": 12,
    "genreCount": 5
  }
}
```

### **Error Tracking**
```json
{
  "event": "api_error",
  "data": {
    "message": "Failed to fetch data",
    "stack": "Error: Failed to fetch...",
    "endpoint": "anichin_schedule",
    "operation": "fetch_schedule"
  }
}
```

## ⚙️ Konfigurasi

### Environment Variables
```bash
# Google Analytics 4 (opsional)
GA4_MEASUREMENT_ID=G-XXXXXXXXXX
GA4_API_SECRET=your-api-secret

# Custom metrics endpoint (opsional)
CUSTOM_METRICS_URL=https://your-metrics-endpoint.com/api/metrics

# Enable/disable tracking
ENABLE_TRACKING=true
NODE_ENV=production
```

### Development Mode
Di development mode, metrics hanya akan di-log ke console tanpa dikirim ke external services.

## 🔧 Penggunaan

### Import Metrics Utility
```javascript
const { safeTrack, trackError, trackPerformance } = require('./utils/metrics');

// Track custom event
safeTrack('custom_event', { key: 'value' });

// Track error
trackError(error, { context: 'additional info' });

// Track performance
trackPerformance('operation_name', duration, { metadata: 'info' });
```

### Middleware Integration
```javascript
const { createTrackingMiddleware } = require('./utils/metrics');

// Automatic request tracking
app.use(createTrackingMiddleware());
```

## 📊 Dashboard & Monitoring

### Vercel Analytics
- Performance metrics otomatis tersedia di Vercel dashboard
- Real-time monitoring response times
- Error rates dan success rates

### Console Logs
Semua metrics akan di-log dengan format:
```
[METRICS] event_name: {"timestamp":"2025-01-28T06:23:56.951Z","event":"api_request","data":{...}}
```

### Custom Analytics (Opsional)
Jika dikonfigurasi, metrics akan dikirim ke:
- Google Analytics 4 untuk web analytics
- Custom endpoint untuk business intelligence

## 🎯 Endpoints yang Dimonitor

### Anichin.js
- `anichin_schedule_success` - Jadwal donghua
- `anichin_donghua_detail` - Detail donghua
- `anichin_episode_detail` - Detail episode

### Layarotaku.js
- `layarotaku_schedule_success` - Jadwal anime
- `layarotaku_anime_detail` - Detail anime
- `layarotaku_episode_detail` - Detail episode

### Browser.js
- `browser_fetch_success` - Browser automation performance

## 🚨 Error Monitoring

Semua error otomatis ditrack dengan:
- Error message dan stack trace
- Request context (route, method, IP)
- Timestamp dan additional metadata

## 💡 Best Practices

1. **Jangan track sensitive data** - Hindari tracking data pribadi pengguna
2. **Limit payload size** - Keep metrics data concise
3. **Async tracking** - Metrics tidak boleh menghambat response time
4. **Error handling** - Tracking errors tidak boleh crash aplikasi

## 🔍 Troubleshooting

### Common Issues
1. **"track is not a function"** - Sudah diperbaiki dengan custom safeTrack
2. **Metrics tidak muncul** - Check environment variables dan network
3. **Performance impact** - Tracking berjalan async, minimal impact

### Debug Mode
Set `ENABLE_TRACKING=false` untuk disable external tracking dan hanya log ke console. 