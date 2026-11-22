# Photobooth

Jalankan:

    npm install
    npm run dev

Buka http://localhost:3000 (kamera hanya jalan di localhost atau HTTPS).

Produksi: `npm run build && npm start`

Cetak otomatis tanpa dialog (kiosk): jalankan Chrome dengan
    chrome --kiosk-printing http://localhost:3000
dan jadikan printer photobooth sebagai printer default.
