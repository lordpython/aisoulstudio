#!/bin/bash

# Check if a URL is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <youtube-url>"
    exit 1
fi

URL=$1

# Download and convert to mp3
# -x: extract audio
# --audio-format mp3: convert to mp3
# --audio-quality 0: best quality (usually VBR 0, approx 250kbps)
# -o: output template
yt-dlp -x --audio-format mp3 --audio-quality 0 -o "%(title)s.%(ext)s" "$URL"

echo "Download and conversion complete!"
