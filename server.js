require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3-flash-preview';

if (!GEMINI_KEY) {
  console.error('ERROR: GEMINI_API_KEY not set in .env');
  process.exit(1);
}

async function callGemini(parts, schema = null) {
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: schema
      ? { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0.1 }
      : { temperature: 0.4, maxOutputTokens: 8192 }
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
}

// ─── STEP 1: Extract brand identity from company profile PDF ─────────────────
app.post('/api/extract-brand', upload.single('pdf'), async (req, res) => {
  try {
    const b64 = req.file.buffer.toString('base64');

    const schema = {
      type: 'object',
      properties: {
        companyName:       { type: 'string' },
        tagline:           { type: 'string' },
        industry:          { type: 'string' },
        primaryColor:      { type: 'string', description: 'Main brand hex color e.g. #1A2B3C' },
        secondaryColor:    { type: 'string', description: 'Secondary hex color' },
        accentColor:       { type: 'string', description: 'Accent/highlight hex color' },
        textColor:         { type: 'string', description: 'Main text hex color' },
        bgColor:           { type: 'string', description: 'Page background hex color' },
        headerDark:        { type: 'boolean', description: 'true if header uses dark background' },
        fontStyle:         { type: 'string', enum: ['modern', 'classic', 'bold', 'minimal', 'technical'] },
        tone:              { type: 'string', enum: ['professional', 'technical', 'friendly', 'luxury', 'corporate'] },
        layoutStyle:       { type: 'string', enum: ['clean', 'dense', 'minimal', 'structured'] },
        address:           { type: 'string' },
        phone:             { type: 'string' },
        email:             { type: 'string' },
        website:           { type: 'string' },
        logoText:          { type: 'string', description: 'Short text/initials to represent logo' },
        logoDescription:   { type: 'string' }
      }
    };

    const text = await callGemini([
      {
        text: [
          'You are a brand analyst. Extract the complete brand identity from this company profile PDF.',
          'Infer hex color codes from the visual design (headers, section titles, highlights).',
          'If exact hex codes are not visible, make your best guess based on the colors shown.',
          'Return ONLY valid JSON. No markdown, no explanation.'
        ].join(' ')
      },
      { inlineData: { mimeType: 'application/pdf', data: b64 } }
    ], schema);

    res.json(JSON.parse(text));
  } catch (err) {
    console.error('[extract-brand]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── STEP 2: Extract content from any source PDF ─────────────────────────────
app.post('/api/extract-content', upload.single('pdf'), async (req, res) => {
  try {
    const b64 = req.file.buffer.toString('base64');

    const schema = {
      type: 'object',
      properties: {
        documentType: { type: 'string', description: 'e.g. product datasheet, brochure, price list, menu, catalog' },
        title:        { type: 'string' },
        subtitle:     { type: 'string' },
        summary:      { type: 'string', description: 'Brief description of what this document is about' },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              heading:   { type: 'string' },
              body:      { type: 'string', description: 'Full text content of this section' },
              isTable:   { type: 'boolean' },
              tableRows: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    value: { type: 'string' }
                  }
                }
              }
            }
          }
        },
        highlights: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key features, bullet points, or highlights'
        },
        specs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              value: { type: 'string' }
            }
          }
        },
        notes:   { type: 'string' },
        contact: { type: 'string' }
      }
    };

    const text = await callGemini([
      {
        text: [
          'Extract ALL content from this PDF completely and accurately.',
          'Preserve every piece of data, specification, table, and text.',
          'Structure tables as arrays of label/value pairs.',
          'Return ONLY valid JSON. No markdown, no explanation.'
        ].join(' ')
      },
      { inlineData: { mimeType: 'application/pdf', data: b64 } }
    ], schema);

    res.json(JSON.parse(text));
  } catch (err) {
    console.error('[extract-content]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── STEP 3: Generate branded HTML document ───────────────────────────────────
app.post('/api/generate', async (req, res) => {
  try {
    const { brand, content } = req.body;
    if (!brand || !content) return res.status(400).json({ error: 'brand and content required' });

    const fontMap = {
      modern:    { heading: "'Barlow', sans-serif",    body: "'Barlow', sans-serif" },
      classic:   { heading: "'Playfair Display', serif", body: "'Lora', serif" },
      bold:      { heading: "'Oswald', sans-serif",    body: "'Source Sans Pro', sans-serif" },
      minimal:   { heading: "'DM Sans', sans-serif",   body: "'DM Sans', sans-serif" },
      technical: { heading: "'IBM Plex Sans', sans-serif", body: "'IBM Plex Sans', sans-serif" }
    };

    const fonts = fontMap[brand.fontStyle] || fontMap.modern;

    const prompt = `You are a world-class document designer. Create a stunning, print-ready HTML document.

## Brand Identity
${JSON.stringify(brand, null, 2)}

## Document Content
${JSON.stringify(content, null, 2)}

## Design Requirements
- Use these exact brand colors:
  Primary: ${brand.primaryColor || '#1A2B3C'}
  Secondary: ${brand.secondaryColor || '#2C4A6A'}
  Accent: ${brand.accentColor || '#3DB87A'}
  Text: ${brand.textColor || '#1A1A1A'}
  Background: ${brand.bgColor || '#FFFFFF'}

- Font headings: ${fonts.heading}
- Font body: ${fonts.body}
- Import Google Fonts in the <head>

- Document structure:
  1. A strong branded header (company name, logo area, document title)
  2. Content sections matching the extracted data
  3. Tables for specs/data (striped rows using brand colors)
  4. Highlights/features as a styled list
  5. A branded footer with contact info

- Technical requirements:
  - Complete self-contained HTML (<!DOCTYPE html> ... </html>)
  - All CSS inline in <style> tag in <head>
  - A4 paper size: @page { size: A4; margin: 15mm 18mm; }
  - @media print rules to hide any UI chrome
  - Responsive but optimized for print
  - Professional, NOT generic — make it look genuinely branded

Return ONLY the complete HTML. Nothing else. No markdown fences.`;

    const html = await callGemini([{ text: prompt }]);

    // Clean up any accidental markdown fences
    const cleaned = html.replace(/^```html\s*/i, '').replace(/\s*```$/, '').trim();
    res.json({ html: cleaned });
  } catch (err) {
    console.error('[generate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 ReBrand AI running → http://localhost:${PORT}\n`);
});