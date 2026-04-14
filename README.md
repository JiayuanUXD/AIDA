# AIDA - UI Design Analysis Tool

AIDA is a powerful full-stack application that analyzes discrepancies between Figma designs and actual build implementations using AI models like Gemini.

## 🚀 Quick Start (Local)

**Prerequisites:** Node.js 18+

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   Create a `.env.local` file and add your keys:
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   FIGMA_ACCESS_TOKEN=your_figma_token
   ```

3. **Run the app:**
   ```bash
   npm run dev
   ```

---

## ☁️ Deployment (Google Cloud Run)

This project is optimized for deployment on **Google Cloud Run**.

### 1. Build & Push
Using Google Cloud Build (configured in `cloudbuild.yaml`):
```bash
gcloud builds submit --config cloudbuild.yaml .
```

### 2. Deploy to Cloud Run
```bash
gcloud run deploy aida-app \
  --image asia-east2-docker.pkg.dev/[PROJECT_ID]/cloud-run-source-deploy/aida:[TAG] \
  --region asia-east2 \
  --set-env-vars="GOOGLE_CLOUD_STORAGE_BUCKET=[YOUR_BUCKET],GEMINI_API_KEY=[YOUR_KEY]"
```

---

## 🔑 Environment Variables

| Variable | Description |
| :--- | :--- |
| `GEMINI_API_KEY` | Your Google Gemini API Key |
| `FIGMA_ACCESS_TOKEN` | Figma Personal Access Token |
| `GOOGLE_CLOUD_STORAGE_BUCKET` | GCS Bucket for persistent storage |
| `PORT` | Server port (default: 3000) |
| `NODE_ENV` | Set to `production` in Cloud Run |

---

## 🛠 Tech Stack
- **Frontend**: React, Vite, Tailwind CSS, Lucide
- **Backend**: Node.js, Express, TypeScript
- **AI**: Google Generative AI (Gemini), Kimi, Doubao
- **Storage**: Local Filesystem (fallback) or Google Cloud Storage
