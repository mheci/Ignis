# Media fixtures

These small generated inputs contain no user data. `study.jpg` and `study.webp` are a 96×64 two-color rectangle (Pillow, JPEG quality 86 / lossless WebP). `picture.mp4` is a half-second 96×64 color field at 12 fps, H.264/yuv420p, no audio. `sound.mp4` is a half-second 440-Hz AAC sine tone, no video. FFmpeg created the MP4 inputs with `-movflags +faststart`. The tests compare decoded pixels/tracks rather than expecting byte-identical output from different encoders.
