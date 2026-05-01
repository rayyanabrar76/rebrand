# ReBrand AI

Upload any company profile PDF + any source document → get a fully rebranded document in seconds.

## How It Works

1. **Upload company profile** → Gemini extracts brand colors, typography style, tone, and contact info
2. **Upload any source PDF** → Gemini extracts all content, tables, specs, and structure
3. **AI generates** a complete, print-ready HTML document styled in your brand identity

Works with any document type: product datasheets, catalogs, menus, price lists, brochures, reports.

---

## Setup

### 1. Clone & Install
```bash
git clone <your-repo>
cd rebrand-ai
npm install
```

### 2. Configure API Key
```bash
cp .env.example .env
```
Edit `.env` and add your Gemini API key:
```
GEMINI_API_KEY=your_key_here
```
Get a free key at: https://aistudio.google.com/app/apikey

### 3. Run
```bash
npm start
# or for development with auto-restart:
npm run dev
```

Open http://localhost:3000

---

## Deploy Globally

### Option A: Railway (Recommended — easiest)
1. Push code to GitHub
2. Go to railway.app → New Project → Deploy from GitHub
3. Add env variable: `GEMINI_API_KEY=your_key`
4. Done — Railway gives you a live URL

### Option B: Render
1. Push to GitHub
2. render.com → New Web Service → connect repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add env variable in the dashboard

### Option C: DigitalOcean App Platform
1. Connect GitHub repo
2. Set environment variable
3. Deploy

---

## Project Structure

```
rebrand-ai/
├── server.js          ← Express backend (API proxy to Gemini)
├── public/
│   └── index.html     ← React frontend
├── .env               ← Your secrets (never commit this)
├── .env.example       ← Template
└── package.json
```

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `POST /api/extract-brand` | multipart/form-data (pdf) | Extract brand identity |
| `POST /api/extract-content` | multipart/form-data (pdf) | Extract document content |
| `POST /api/generate` | JSON { brand, content } | Generate branded HTML |

---

## Notes
- PDF size limit: 25MB
- Generation takes 15–30 seconds depending on document complexity
- Output is an HTML file — open in browser and use Print → Save as PDF for a PDF output
- The Gemini key lives only in `.env` on your server — never exposed to the browser