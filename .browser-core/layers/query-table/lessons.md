# query-table — bekleyen dersler

Canlıda görülmüş ama tarife henüz girmemiş dersler. Bir ders tekrar görülünce
ilgili tarife taşınır ve buradan silinir. Biçim: tarih, ders, kanıt, durum.

- **Oyun alanı hash rotası kullanır: rota değişimi sayfayı yenilemez.**
  Rotalar arasında geçmek için `location.hash = '#/<sayfa>'` atanır; sayfa
  yeniden yüklenmeden değişir. `navigate_page` ile yenileme yalnız şu anki
  rotayı yeniden yükler. `?theme=dark` parametresi hash'ten ÖNCE gelir
  (`/?theme=dark#/sorting`); hash'in içine konursa okunmaz.
  - Kanıt: `apps/playground/router.ts` (`createWebHashHistory`),
    `apps/playground/harness/theme.ts` (`themeFromUrl`); iki ayrı oturumda
    (responsive ölçümü ve AI içeriği turu) aynı karışıklık yaşandı.
  - Tarih: 2026-10-06 · Durum: `tekrarlandı`
