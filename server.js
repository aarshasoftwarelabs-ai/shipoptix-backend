require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const sharp = require('sharp');

const app = express();
const port = process.env.PORT || 3000;

// Setup Middleware
app.use(cors());
app.use(express.json());

// Setup Multer for handling file uploads (stored in memory)
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.get('/', (req, res) => {
  res.send('ShipOptix AI Backend is Running!');
});

app.post('/api/analyze-product', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ 
            error: 'Server Misconfiguration: GEMINI_API_KEY is missing.',
            details: 'The backend server on Render is missing the Gemini API key. Please add it in Render Environment Variables.'
        });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
      Analyze this e-commerce product image. 
      Please provide:
      1. A short, catchy product title.
      2. 5 comma-separated SEO tags for an e-commerce store.
      3. A suggested category (e.g., Electronics, Fashion, Home).
      
      Format your response EXACTLY as a JSON object with keys: title, tags, category. Do not include markdown code block formatting.
    `;

    const imageParts = [
      {
        inlineData: {
          data: req.file.buffer.toString('base64'),
          mimeType: req.file.mimetype,
        },
      },
    ];

    const result = await model.generateContent([prompt, ...imageParts]);
    const responseText = result.response.text();
    
    // Clean up potential markdown formatting in response
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
        const parsedData = JSON.parse(cleanJson);
        res.json(parsedData);
    } catch (parseError) {
        res.json({
            title: "Analyzed Product",
            tags: "product, e-commerce, item",
            category: "General",
            raw_text: responseText
        });
    }

  } catch (error) {
    console.error('AI Processing Error:', error);
    res.status(500).json({ error: 'Failed to process image with AI', details: error.message });
  }
});

app.post('/api/generate-shipping-variants', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const numVariantsStr = req.body.numVariants || '10';
    let numVariants = parseInt(numVariantsStr, 10);
    if (isNaN(numVariants) || numVariants < 10) numVariants = 10;
    if (numVariants > 100) numVariants = 100;

    const originalBuffer = req.file.buffer;
    
    // Simulate Gemini shipping cost calculation based on image size/complexities 
    // (A real app might analyze the image content to determine category and weight)
    const simulatedShippingCosts = [18.50, 24.00, 21.75, 19.99];
    const estimatedCost = simulatedShippingCosts[Math.floor(Math.random() * simulatedShippingCosts.length)];

    const generatedVariants = [];

    for (let i = 0; i < numVariants; i++) {
      // Generate random microscopic variations to bypass AI hashing
      const resizeOffset = Math.floor(Math.random() * 5) + 1; // 1 to 5 pixels
      const brightness = 1 + (Math.random() * 0.02 - 0.01); // +/- 1%
      
      const modifiedBuffer = await sharp(originalBuffer)
        .resize({ width: 800 + resizeOffset }) // Slight resize
        .modulate({ brightness: brightness }) // Slight brightness change
        .withMetadata(false) // Strip EXIF
        .toBuffer();

      generatedVariants.push(modifiedBuffer.toString('base64'));
    }

    res.json({
      estimatedCost: estimatedCost,
      variants: generatedVariants
    });

  } catch (error) {
    console.error('Variant Generation Error:', error);
    res.status(500).json({ error: 'Failed to generate variants', details: error.message });
  }
});

app.post('/api/remove-background', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const { removeBackground } = require('@imgly/background-removal-node');
    
    // Convert Buffer to Blob as required by @imgly/background-removal-node
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    
    // Remove background (downloads models automatically on first run)
    const resultBlob = await removeBackground(blob);
    
    // Convert back to base64
    const arrayBuffer = await resultBlob.arrayBuffer();
    const resultBuffer = Buffer.from(arrayBuffer);
    const base64Image = resultBuffer.toString('base64');
    
    res.json({
      image: base64Image,
    });
  } catch (error) {
    console.error('Background Removal Error:', error);
    res.status(500).json({ error: 'Failed to remove background', details: error.message });
  }
});


app.post('/api/calculate-shipping', (req, res) => {
  try {
    const { weight, length, width, height } = req.body;

    if (!weight || !length || !width || !height) {
      return res.status(400).json({ error: 'Missing dimensions or weight' });
    }

    const w = parseFloat(weight);
    const l = parseFloat(length);
    const wid = parseFloat(width);
    const h = parseFloat(height);

    // standard volumetric weight calculation for courier
    const volumetricWeight = (l * wid * h) / 5000;
    
    // Pick the larger weight
    const chargeableWeight = Math.max(w, volumetricWeight);
    
    // Base rate: ₹20 per kg
    const cost = chargeableWeight * 20;

    res.json({
      cost: cost,
      chargeableWeight: chargeableWeight,
      actualWeight: w,
      volumetricWeight: volumetricWeight
    });

  } catch (error) {
    console.error('Calculation Error:', error);
    res.status(500).json({ error: 'Failed to calculate shipping', details: error.message });
  }
});


app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
