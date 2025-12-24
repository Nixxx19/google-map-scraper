import express from 'express';
import cors from 'cors';
import path from 'path';
import { scrapeGoogleMapsList } from './scraper-module';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store active scraping sessions
const activeSessions = new Map<string, {
  status: 'running' | 'completed' | 'error';
  progress: number;
  total: number;
  message: string;
  results?: any[];
  error?: string;
}>();

// API endpoint to start scraping
app.post('/api/scrape', async (req, res) => {
  const { listUrl, maxItems = 200 } = req.body;
  
  if (!listUrl) {
    return res.status(400).json({ error: 'List URL is required' });
  }

  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Initialize session
  activeSessions.set(sessionId, {
    status: 'running',
    progress: 0,
    total: maxItems,
    message: 'Starting scraper...'
  });

  // Start scraping in background
  scrapeGoogleMapsList(listUrl, maxItems, (update) => {
    const session = activeSessions.get(sessionId);
    if (session) {
      session.progress = update.current;
      session.total = update.total;
      session.message = update.message;
      if (update.status) {
        session.status = update.status;
      }
      if (update.results) {
        session.results = update.results;
        session.status = 'completed';
      }
      if (update.error) {
        session.error = update.error;
        session.status = 'error';
      }
    }
  }).catch((error) => {
    const session = activeSessions.get(sessionId);
    if (session) {
      session.status = 'error';
      session.error = error.message || 'Unknown error occurred';
    }
  });

  res.json({ sessionId });
});

// API endpoint to get scraping status
app.get('/api/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json(session);
});

// API endpoint to download results
app.get('/api/download/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);
  
  if (!session || !session.results) {
    return res.status(404).json({ error: 'Results not found' });
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="google_maps_places_${sessionId}.json"`);
  res.json(session.results);
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📱 Open your browser and navigate to http://localhost:${PORT}`);
});

