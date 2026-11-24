# AltBatch

AltBatch drafts alt text for a batch of images from a small website. When Chrome's built-in Gemini Nano is available, ordinary photos are described on your own computer. Images the on-device model cannot handle, charts that need a long description, and images you send yourself go to a cloud model, and each card says why. You review and approve every description before exporting.

Built for the #BuildHybridAI hackathon with Firebase AI Logic hybrid inference (`firebase/ai`, `InferenceMode.PREFER_ON_DEVICE` plus `ONLY_IN_CLOUD`).

Live demo: https://altbatch.web.app (desktop Chrome; without the on-device model every image uses the cloud path).

## What it does

1. Paste HTML, or choose a folder or several images.
2. Press "Start on-device model" (downloads Gemini Nano once, with a progress bar).
3. Press "Draft alt text". Each image becomes a card with an editable draft, a "Decorative" box, an "Approved" box, a "Send to cloud" button and a **Device** or **Cloud** badge (from `response.inferenceSource`). A counter shows how many images never left this computer.
4. Export the HTML with alt filled in, or a CSV (`file, kind, alt, source, reason`). Optionally save the session (text only) to Firestore.

## Hybrid split

| Case | Where it runs | Reason shown on the card |
|---|---|---|
| JPEG or PNG photo within the on-device image limit | Device (Gemini Nano) | none |
| WebP, GIF, SVG or any non JPEG/PNG | Cloud (Gemini Flash-Lite) | Format not supported on device |
| Estimated image tokens above the device limit (9216 x margin) | Cloud | Too large for on-device model |
| Device judges the image to be a chart | Cloud, for a long description | Needs a long description |
| No on-device model, or the device call failed | Cloud | On-device model unavailable |
| You press "Send to cloud" | Cloud | Sent to cloud by you |

Both handles use the same JSON structure `{ kind: photo|chart|decorative, alt, longDescription? }`: `responseConstraint` on the device, `responseSchema` in the cloud.

The SDK has no token counter for hybrid inference. AltBatch estimates tokens from width and height (one token per 28x28 pixel patch, a heuristic) and multiplies the 9216 limit by `device_token_margin` from Firebase Remote Config (default 0.8; if Remote Config is unreachable the default is used).

## Run it

Requirements: Node 20+, a Firebase project with Firebase AI Logic (Gemini Developer API) enabled, Anonymous Authentication, Firestore, App Check.

```bash
npm install
cp .env.example .env.local   # fill in your Firebase web app values
npm run dev                  # http://localhost:5173
npm test                     # routing unit tests (no Firebase needed)
npm run build
```

Local App Check: `npm run dev` sets `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true`. Open the browser console, copy the printed debug token, and register it in Firebase console > App Check > Manage debug tokens. Never commit the token. For a deployed site set `VITE_RECAPTCHA_SITE_KEY` (a reCAPTCHA Enterprise key, now part of Google Cloud Fraud Defense, registered in App Check).

Deploy (you run this yourself): `firebase deploy --only hosting,firestore:rules` after editing `.firebaserc`.

## Turn on Chrome's on-device model

- Desktop Chrome 139 or newer on Windows 10/11, macOS 13+, Linux or ChromeOS (Chromebook Plus). Chrome on Android and iOS is not supported.
- At least 22 GB free on the Chrome profile volume; a GPU with more than 4 GB VRAM, or 16 GB RAM and 4 CPU cores.
- For image input on localhost, enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and restart Chrome.
- Click "Start on-device model". The download can take several minutes. Check `chrome://on-device-internals` for status.
- On-device output is English only (Chrome's model lists English, Japanese, Spanish, German and French).

## What we tested

- On-device drafting was verified on Windows 11 with an RTX 4080, in Chrome started inside a signed-in desktop session with `--enable-features=OptimizationGuideOnDeviceModel:BypassPerfRequirement/true,PromptAPIForGeminiNano,PromptAPIForGeminiNanoMultimodalInput`.
- The same Chrome started over SSH without a desktop session downloaded the model but could not create a session ("The device is unable to create a session to run the model"); `chrome://on-device-internals` showed the model service crashing. If you see that message, start Chrome from the desktop.
- The cloud path was verified on https://altbatch.web.app with no on-device model.

## No on-device model? Cloud only

AltBatch does not depend on Gemini Nano. Without it, every card reads "On-device model unavailable" with a **Cloud** badge, and the same steps run through the cloud handle. The first cloud call asks for your consent. If you decline, cloud images are skipped.

## Privacy

- Images that stay on the device are never sent anywhere.
- Images sent to the cloud go to Gemini through Firebase AI Logic. On the Gemini API free tier, Google may use inputs to improve its products, so the app asks first.
- Saved sessions contain text only (file name, alt, kind, source, reason). Images are never stored. `firestore.rules` lets each anonymous user read and write only their own documents.
- AI monitoring in the Firebase console does not show on-device calls.

## Layout

`src/routing.ts` routing rules and reasons, `src/draft.ts` per-card pipeline, `src/ai.ts` the two model handles, `src/firebase.ts` App Check, anonymous auth, Remote Config, `src/session.ts` Firestore, `src/export.ts` HTML and CSV, `demo/` generated sample images (a WebP, a bar chart and a large PNG exercise each cloud reason).

## License

Apache-2.0, see `LICENSE`.
