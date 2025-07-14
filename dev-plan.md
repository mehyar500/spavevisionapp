# SpaceVision App Development Plan

## Overview
SpaceVision is a progressive web app (PWA) that allows users to upload or take pictures of their skin for AI-powered analysis. Using an open-source LLM from Cloudflare, the app provides skin analysis, routine suggestions, and product recommendations in a user-friendly manner. The design is mobile-first, clean, modern, and targeted at Gen Z users. The entire app runs on Cloudflare infrastructure, deployed via Wrangler, utilizing services like Workers AI, R2 for photo storage (S3 alternative), and KV for data persistence.

## Tech Stack
- **Frontend**: React + TypeScript + Vite for fast development and PWA support.
- **CSS**: Tailwind CSS for styling, with a centralized theme configuration.
- **Backend**: Cloudflare Workers for serverless logic.
- **AI**: Cloudflare Workers AI (e.g., @cf/meta/llama-2-7b-chat-fp16 or similar open-source LLM) for text-based analysis; combine with image processing if needed.
- **Storage**: Cloudflare R2 for storing user-uploaded photos, KV for lightweight data like user sessions and analysis results.
- **Deployment**: Wrangler CLI for deploying to Cloudflare Pages/Workers.
- **Other**: PWA features via Vite PWA plugin, camera access via Web APIs.

## System Design
The system follows a serverless architecture on Cloudflare:

```mermaid
graph TD
    A[User Device] -->|Upload/Take Photo| B[PWA Frontend (React + Vite)]
    B -->|API Call| C[Cloudflare Worker (Backend Logic)]
    C -->|Store Image| D[R2 Bucket (Photo Storage)]
    C -->|Analyze Image| E[Workers AI (LLM for Skin Analysis)]
    C -->|Store Results| F[KV Namespace (Data Persistence)]
    E -->|Generate Suggestions| C
    C -->|Response| B
    B -->|Display Analysis & Suggestions| A
```

- **Boxes Explanation**:
  - **User Device**: Mobile-first PWA interface.
  - **PWA Frontend**: Handles UI, camera integration, and API calls.
  - **Cloudflare Worker**: Orchestrates requests, handles auth, and integrates services.
  - **R2 Bucket**: Secure storage for skin photos.
  - **Workers AI**: Processes image data (e.g., describe image then analyze with LLM) for skin condition detection, routines, and product suggestions.
  - **KV Namespace**: Stores user data, analysis history.

## Folder Structure
Centralized structure for maintainability:

```
spacevision-app/
├── src/
│   ├── assets/          # Images, icons
│   ├── components/      # Reusable UI components (e.g., CameraUpload.tsx)
│   ├── pages/           # Main views (e.g., Home.tsx, Analysis.tsx)
│   ├── services/        # API calls, Cloudflare integrations
│   ├── styles/          # Tailwind config, global CSS
│   ├── types/           # TypeScript interfaces
│   ├── utils/           # Helpers (e.g., image processing)
│   └── App.tsx          # Main app entry
├── public/              # Static assets, manifest.json for PWA
├── wrangler.toml        # Cloudflare config
├── vite.config.ts       # Vite setup with PWA plugin
├── tailwind.config.js   # Centralized Tailwind config
├── tsconfig.json
├── package.json
└── README.md
```

## Development Steps
1. **Setup Project**:
   - Initialize with `npm create vite@latest` (React + TS).
   - Add dependencies: Tailwind, Vite PWA plugin, Wrangler.
   - Configure Tailwind in centralized files.

2. **Frontend Development**:
   - Build mobile-first UI with Tailwind (clean, modern Gen Z aesthetic: vibrant colors, minimalism).
   - Implement camera/upload feature using HTML Media Capture.
   - Create pages for home, upload, analysis results.

3. **Backend & AI Integration**:
   - Set up Cloudflare Worker with Wrangler.
   - Integrate R2 for photo upload/storage.
   - Use Workers AI to analyze images (e.g., extract features, prompt LLM for suggestions).
   - Store results in KV.

4. **PWA Features**:
   - Add service worker, manifest for offline support and installability.

5. **Testing**:
   - Unit tests with Vitest.
   - E2E tests for upload/analysis flow.
   - Test on mobile devices.

6. **Deployment**:
   - Deploy frontend to Cloudflare Pages.
   - Deploy worker with `wrangler deploy`.
   - Bind R2/KV/AI in wrangler.toml.

## Potential Challenges & Solutions
- **AI Accuracy**: Fine-tune prompts for skin analysis; use open-source models.
- **Privacy**: Ensure photos are encrypted in R2; comply with data regs.
- **Performance**: Optimize for mobile with lazy loading.

This plan provides a complete roadmap to build and deploy SpaceVision on Cloudflare.