import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import ytdl from 'ytdl-core';
import tiktokdl from '@tobyg74/tiktok-api-dl';
import instagramDl from 'instagram-url-downloader';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { randomBytes } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Buat folder temp untuk download
const TEMP_DIR = path.join(__dirname, '../temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Route untuk homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API endpoint buat info
app.get('/api/info', (req, res) => {
    res.json({
        name: 'VidHarvest API',
        version: '1.0.0',
        endpoints: {
            scrape: '/api/scrape (GET) - Get scraped data',
            download: '/api/download (POST) - Process video URL',
            downloadFile: '/api/download/file (POST) - Download video file',
            info: '/api/info (GET) - This information'
        }
    });
});

// API endpoint buat scrape
app.get('/api/scrape', async (req, res) => {
    try {
        const url = 'https://www.savethevideo.com/home';
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        const scrapedData = {
            siteInfo: {
                title: $('title').text(),
                description: $('meta[name="description"]').attr('content'),
                keywords: $('meta[name="keywords"]').attr('content'),
            },
            mainContent: {
                headline: $('h1 span').first().text().trim(),
                subheadline: $('p.mt-3.text-base.text-gray-700').first().text().trim(),
            },
            features: [],
            supportedSites: ["youtube", "tiktok", "instagram", "facebook", "twitter", "vimeo", "dailymotion"],
            stats: []
        };
        
        // Scrape features
        $('dl div.relative').each((i, element) => {
            const feature = {
                title: $(element).find('p.text-lg').text().trim(),
                description: $(element).find('dd.mt-2').text().trim()
            };
            if (feature.title && feature.description) {
                scrapedData.features.push(feature);
            }
        });
        
        // Scrape stats
        $('dl.space-y-10 div').each((i, element) => {
            const stat = {
                title: $(element).find('p.mt-5').text().trim(),
                description: $(element).find('dd.mt-2').text().trim()
            };
            if (stat.title && stat.description) {
                scrapedData.stats.push(stat);
            }
        });
        
        scrapedData.metadata = {
            scrapedAt: new Date().toISOString(),
            url: url,
            status: 'success'
        };
        
        res.json({
            success: true,
            data: scrapedData
        });
        
    } catch (error) {
        console.error('Scraping error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to scrape website',
            message: error.message
        });
    }
});

// Fungsi untuk download file
async function downloadFile(url, outputPath) {
    const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 30000
    });
    
    await pipeline(response.data, createWriteStream(outputPath));
    return outputPath;
}

// Fungsi untuk format duration
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Fungsi untuk format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ENDPOUT DOWNLOAD - Get video info
app.post('/api/download', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'URL is required'
            });
        }

        console.log('📥 Processing URL:', url);

        // Deteksi platform dari URL
        let platform = 'unknown';
        if (url.includes('youtube.com') || url.includes('youtu.be')) platform = 'youtube';
        else if (url.includes('tiktok.com')) platform = 'tiktok';
        else if (url.includes('instagram.com')) platform = 'instagram';
        else if (url.includes('facebook.com') || url.includes('fb.watch')) platform = 'facebook';
        else if (url.includes('twitter.com') || url.includes('x.com')) platform = 'twitter';
        else if (url.includes('vimeo.com')) platform = 'vimeo';
        else if (url.includes('dailymotion.com')) platform = 'dailymotion';

        let videoInfo = {};

        // PROSES SESUAI PLATFORM
        switch (platform) {
            case 'youtube':
                try {
                    const info = await ytdl.getInfo(url);
                    const formats = ytdl.filterFormats(info.formats, 'videoandaudio');
                    
                    videoInfo = {
                        title: info.videoDetails.title,
                        thumbnail: info.videoDetails.thumbnails.pop().url,
                        duration: formatDuration(info.videoDetails.lengthSeconds),
                        formats: formats.slice(0, 6).map(f => ({
                            quality: f.qualityLabel || 'Unknown',
                            format: f.container,
                            size: f.contentLength ? formatBytes(parseInt(f.contentLength)) : 'Unknown',
                            url: f.url,
                            itag: f.itag
                        }))
                    };
                } catch (ytError) {
                    console.error('YouTube error:', ytError);
                    throw new Error('Failed to process YouTube video');
                }
                break;

            case 'tiktok':
                try {
                    // Pake @tobyg74/tiktok-api-dl
                    const tiktokResult = await tiktokdl(url, { 
                        version: "v2" 
                    });
                    
                    if (tiktokResult.status === 'success') {
                        const result = tiktokResult.result;
                        
                        videoInfo = {
                            title: result.title || 'TikTok Video',
                            thumbnail: result.cover || 'https://via.placeholder.com/320x180?text=TikTok',
                            duration: result.duration ? formatDuration(result.duration) : '00:45',
                            formats: [
                                {
                                    quality: 'HD Video',
                                    format: 'mp4',
                                    size: result.video?.size || '~5 MB',
                                    url: result.video?.urlNoWatermark || result.video?.urlWatermark,
                                    type: 'video'
                                },
                                {
                                    quality: 'Audio',
                                    format: 'mp3',
                                    size: result.music?.size || '~2 MB',
                                    url: result.music?.url,
                                    type: 'audio'
                                }
                            ]
                        };
                    } else {
                        throw new Error('TikTok download failed');
                    }
                } catch (ttError) {
                    console.error('TikTok error:', ttError);
                    // Fallback ke dummy data kalo error
                    videoInfo = {
                        title: 'TikTok Video',
                        thumbnail: 'https://via.placeholder.com/320x180?text=TikTok',
                        duration: '00:45',
                        formats: [
                            { quality: 'HD', format: 'mp4', size: '~5 MB', url: '#' },
                            { quality: 'Audio', format: 'mp3', size: '~2 MB', url: '#' }
                        ]
                    };
                }
                break;

            case 'instagram':
                try {
                    // Pake instagram-url-downloader
                    const instaResult = await instagramDl(url);
                    
                    if (instaResult && instaResult.url_list && instaResult.url_list.length > 0) {
                        videoInfo = {
                            title: 'Instagram Video',
                            thumbnail: instaResult.thumbnail || 'https://via.placeholder.com/320x180?text=Instagram',
                            duration: '00:30',
                            formats: instaResult.url_list.map((videoUrl, idx) => ({
                                quality: idx === 0 ? 'HD' : 'SD',
                                format: 'mp4',
                                size: '~3 MB',
                                url: videoUrl
                            }))
                        };
                    } else {
                        throw new Error('Instagram download failed');
                    }
                } catch (igError) {
                    console.error('Instagram error:', igError);
                    videoInfo = {
                        title: 'Instagram Video',
                        thumbnail: 'https://via.placeholder.com/320x180?text=Instagram',
                        duration: '00:30',
                        formats: [
                            { quality: 'HD', format: 'mp4', size: '~3 MB', url: '#' }
                        ]
                    };
                }
                break;

            default:
                return res.status(400).json({
                    success: false,
                    message: `Platform ${platform} not supported yet`
                });
        }

        // Response sukses
        res.json({
            success: true,
            platform: platform,
            url: url,
            ...videoInfo,
            message: 'Video processed successfully'
        });

    } catch (error) {
        console.error('Download error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ENDPOINT DOWNLOAD FILE - Perbaikan
app.post('/api/download/file', async (req, res) => {
  try {
    const { url, format, quality, title } = req.body;
    
    if (!url || url === '#') {
      return res.status(400).json({
        success: false,
        message: 'Valid download URL is required'
      });
    }

    console.log(`📦 Downloading: ${title || 'video'}.${format}`);

    // Set headers yang benar untuk download
    const contentType = format === 'mp3' ? 'audio/mpeg' : 'video/mp4';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title || 'video')}.${format}"`);

    // Download file dari URL dan pipe ke response
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      timeout: 60000 // 60 detik timeout
    });

    // Pipe stream ke response
    response.data.pipe(res);

    // Handle error
    response.data.on('error', (err) => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Download failed' });
      }
    });

  } catch (error) {
    console.error('File download error:', error.message);
    
    // Kalau belum kirim headers, kirim error JSON
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
});

// Cleanup temp files periodically (every hour)
setInterval(() => {
    fs.readdir(TEMP_DIR, (err, files) => {
        if (err) return;
        const now = Date.now();
        files.forEach(file => {
            const filepath = path.join(TEMP_DIR, file);
            fs.stat(filepath, (err, stats) => {
                if (err) return;
                // Delete files older than 1 hour
                if (now - stats.mtimeMs > 3600000) {
                    fs.unlink(filepath, () => {});
                }
            });
        });
    });
}, 3600000);

// Handle 404 untuk API routes
app.use('/api', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'API endpoint not found',
        available: [
            '/api/scrape (GET)',
            '/api/download (POST)', 
            '/api/download/file (POST)',
            '/api/info (GET)'
        ]
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 VidHarvest API running on http://localhost:${PORT}`);
    console.log(`📌 Endpoints:`);
    console.log(`   - GET  /api/info`);
    console.log(`   - GET  /api/scrape`);
    console.log(`   - POST /api/download`);
    console.log(`   - POST /api/download/file`);
    console.log(`   - GET  / (homepage)`);
    console.log(`📁 Temp directory: ${TEMP_DIR}`);
});

export default app;