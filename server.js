require('dotenv').config();
const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const cors = require('cors');
const axios = require('axios');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'running',
    message: 'PDF Processing Service is operational'
  });
});

// PDF text extraction endpoint
app.post('/extract-text', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'No PDF file uploaded' 
      });
    }

    // Read the uploaded PDF file
    const dataBuffer = fs.readFileSync(req.file.path);
    
    // Parse PDF and extract text
    const data = await pdf(dataBuffer);
    
    // Clean up - delete the uploaded file after processing
    fs.unlinkSync(req.file.path);

    res.status(200).json({ 
      success: true,
      text: data.text 
    });
  } catch (err) {
    console.error('PDF processing error:', err);
    
    // Clean up file if something went wrong
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ 
      success: false,
      error: 'Failed to process PDF',
      details: err.message 
    });
  }
});

// Translation endpoint
app.post('/translate', async (req, res) => {
  try {
    const { text, fromLang = 'en', toLang = 'es' } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ 
        success: false,
        error: 'Valid text is required for translation' 
      });
    }

    // Limit text length for free API
    const textToTranslate = text.length > 500 ? text.substring(0, 500) : text;
    
    const response = await axios.get('https://api.mymemory.translated.net/get', {
      params: {
        q: textToTranslate,
        langpair: `${fromLang}|${toLang}`
      },
      timeout: 10000 // 10 seconds timeout
    });

    if (response.data && response.data.responseData) {
      res.status(200).json({
        success: true,
        translatedText: response.data.responseData.translatedText
      });
    } else {
      throw new Error('Invalid response from translation service');
    }
  } catch (err) {
    console.error('Translation error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Translation failed',
      details: err.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false,
    error: 'Internal server error',
    details: err.message 
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API endpoints:`);
  console.log(`- POST http://localhost:${PORT}/extract-text`);
  console.log(`- POST http://localhost:${PORT}/translate`);
});