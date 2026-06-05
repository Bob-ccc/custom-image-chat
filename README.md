# Custom Image Chat

Standalone Nuxt app/layer for the `/chat` custom image and video generation tool.

## Use Inside The Main App

The main app imports this layer's component and API handlers through thin wrappers:

- `pages/chat.vue` renders `CustomImageChatApp`.
- `server/api/chat/*` re-export handlers from this layer.

Change files in this layer first when working on the custom image chat experience.

## Run Standalone

```bash
npm install
npm run dev
```

Then open `http://localhost:3000/` (HiDream), `http://localhost:3000/chat`, or `http://localhost:3000/gpt`.

`/` is a pure-frontend HiDream page (`/hidream` redirects here). It calls the public HiDream Hugging Face Space directly from the browser, supports up to 4 concurrent tasks, keeps generation history in `localStorage`, and shows a retry banner after refresh (Gradio cannot resume the same SSE session). `/gpt` is the GPT image generator that previously lived at `/`.

If this directory is moved into its own git repository, commit the generated lockfile from `npm install` in that repository.

## Deploy To Vercel

Use this directory as the Vercel project root:

```txt
layers/custom-image-chat
```

Optional environment variable:

```txt
NUXT_UPSTREAM_PROXY=
```

The app stores user-entered provider keys in the browser local storage and sends them only to same-origin `/api/chat/*` proxy routes.
