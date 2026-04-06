# How to add a video on the Welcome page

Edit `src/pages/WelcomePage.js` and set **one** of these at the top of the file:

## 1. YouTube

1. Upload your video to YouTube and copy the **video ID** from the URL (e.g. `https://www.youtube.com/watch?v=ABC123` → ID is `ABC123`).
2. In `WelcomePage.js` set:
   ```js
   const VIDEO_YOUTUBE_ID = 'ABC123';
   ```

## 2. Vimeo

1. Upload to Vimeo and copy the video ID from the URL (e.g. `https://vimeo.com/123456789` → ID is `123456789`).
2. In `WelcomePage.js` set:
   ```js
   const VIDEO_VIMEO_ID = '123456789';
   ```

## 3. Local video file

1. Put your video file (e.g. `demo.mp4`) in the **`public`** folder.
2. In `WelcomePage.js` set:
   ```js
   const VIDEO_LOCAL_PATH = 'demo.mp4';
   ```

Only one of the three should be set. Leave the others as empty strings `''`.
