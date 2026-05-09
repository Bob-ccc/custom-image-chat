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

Then open `http://localhost:3000/chat`.

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
