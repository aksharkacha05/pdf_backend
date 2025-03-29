require('dotenv').config();
const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();

// Enhanced Middleware
app.use(cors({
  origin: '*' // For development, restrict in production
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Improved File Upload Configuration
const upload = multer({
  storage: multer.memoryStorage(), // Use memory storage for better performance
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed (max 10MB)'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Enhanced Health Check
app.get('/', (req, res) => {
  res.json({ 
    status: 'ready',
    endpoints: {
      extractText: 'POST /extract-text',
      translate: 'POST /translate',
      combined: 'POST /process-pdf' // New combined endpoint
    },
    limits: 'PDFs up to 10MB'
  });
});

// New Combined Endpoint (Handles both extraction and translation)
app.post('/process-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'No PDF file uploaded' 
      });
    }

    // 1. Extract text from PDF buffer (no temp file needed)
    const data = await pdf(req.file.buffer);
    let extractedText = data.text;

    // 2. Auto-translate if text > 50 characters
    let translation = '';
    if (extractedText.length > 50) {
      const translated = await translateText(
        extractedText.substring(0, 500), // Limit for free API
        'auto', // Auto-detect source language
        'en'    // Default to English
      );
      translation = translated;
    }

    res.json({
      success: true,
      metadata: {
        pages: data.numpages,
        textLength: extractedText.length
      },
      extractedText: extractedText.substring(0, 1000) + (extractedText.length > 1000 ? '...' : ''), // Preview
      translatedText: translation,
      downloadLink: null // Can implement later
    });

  } catch (err) {
    console.error('Processing error:', err);
    res.status(500).json({
      success: false,
      error: 'PDF processing failed',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Improved Text Extraction Endpoint
app.post('/extract-text', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'No PDF file uploaded' 
      });
    }

    // Process directly from memory
    const data = await pdf(req.file.buffer);
    
    res.json({ 
      success: true,
      text: data.text,
      pages: data.numpages,
      textLength: data.text.length
    });

  } catch (err) {
    handleError(res, err, 'Text extraction failed');
  }
});

// Enhanced Translation Endpoint
app.post('/translate', async (req, res) => {
  try {
    const { text, fromLang = 'auto', toLang = 'en' } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ 
        success: false,
        error: 'Valid text is required for translation' 
      });
    }

    const result = await translateText(text, fromLang, toLang);
    res.json({
      success: true,
      translatedText: result,
      characters: text.length
    });

  } catch (err) {
    handleError(res, err, 'Translation failed');
  }
});

// Helper Functions
async function translateText(text, fromLang, toLang) {
  const response = await axios.get('https://api.mymemory.translated.net/get', {
    params: {
      q: text.substring(0, 500), // Free tier limit
      langpair: `${fromLang}|${toLang}`,
      de: 'your-email@example.com' // Required for MyMemory
    },
    timeout: 5000
  });

  if (!response.data?.responseData?.translatedText) {
    throw new Error(response.data?.responseStatus || 'Translation service error');
  }
  return response.data.responseData.translatedText;
}

function handleError(res, err, context) {
  console.error(context, err);
  res.status(500).json({
    success: false,
    error: context,
    details: process.env.NODE_ENV === 'development' ? {
      message: err.message,
      stack: err.stack
    } : undefined
  });
}

// Server Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Endpoints:');
  console.log(`http://localhost:${PORT}/process-pdf`);
  console.log(`http://localhost:${PORT}/extract-text`);
  console.log(`http://localhost:${PORT}/translate`);
});

// Process cleanup
process.on('SIGTERM', () => {
  console.log('Server shutting down');
  process.exit(0);
});