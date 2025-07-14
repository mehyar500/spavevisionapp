# SpaceVision App

SpaceVision is a progressive web app (PWA) that uses AI to analyze skin conditions from uploaded or captured photos. It provides personalized analysis, skincare routine suggestions, and product recommendations. The app is built with a mobile-first, clean, modern design targeted at Gen Z users.

The entire application runs on Cloudflare infrastructure:
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Cloudflare Workers
- **AI**: Cloudflare Workers AI (open-source LLM)
- **Storage**: Cloudflare R2 for photos, KV for data
- **Deployment**: Via Wrangler to Cloudflare Workers and Pages

## Features
- Photo upload/camera capture
- AI-powered skin analysis
- Personalized routines and recommendations
- PWA for offline capabilities