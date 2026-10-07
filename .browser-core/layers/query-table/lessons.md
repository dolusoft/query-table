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
  - Tarih: 2026-10-06 · Durum: `tekrarlandı` (2026-10-07 tema turunda
    üçüncü kez)

- **Tema `<html>`'deki `data-theme` özniteliğiyle değişir.** Tema
  tarifinde `apply`: `method: attribute`, `target: html`,
  `name: data-theme`, değerler `light`/`dark`; `media` emülasyonu da açık
  tutulur.
  - Kanıt: `apps/playground/harness/theme.ts`; 2026-10-07 theme-check
    turu, 26 rota, browser-core 0.9.11.
  - Tarih: 2026-10-07 · Durum: `ilk görülme`

- **`ready_selector: main` erken tetiklenir.** `main` hemen çizilir, örnek
  tablo sonra gelir; ölçüm boş örnek üzerinde alınabiliyor ve görünürlük
  karşılaştırmasında toplu "eksik" çıkıyor. Hazır seçici örneğin kendisini
  beklemeli (`main .qt-table`; tablosuz sayfalarda sayfanın kendi
  kapsayıcısı).
  - Kanıt: responsive-check, `column-pinning` 320 px, `column-resizing`
    390 px, `row-pinning` 768 px; aynı rotalar yeniden ölçülünce temiz.
  - Tarih: 2026-10-07 · Durum: `ilk görülme`

- **Satır açma düğmesi katman sayılır.** `.qt-expand` `aria-expanded`
  taşıdığı için theme-check katman adayı yapıyor ve "açılamadı" diye
  işaretliyor; açtığı şey katman değil, satır. Tema tarifinde `ignore`
  listesine girer.
  - Kanıt: theme-check `discover: true`, `row-expansion` ve `overview`.
  - Tarih: 2026-10-07 · Durum: `ilk görülme`

- **Dar sütunda filtre düğmesi girişin içindedir; "örtme" bulgusu
  beklenir.** Skin dar sütunda (`< 6rem`) filtre düğmesini girişin sağ
  ucuna koyar, giriş o alan için 2rem dolgu ayırır. responsive-check bunu
  `.qt-filter-input`'u örten öğe sayıyor. Tarifte istisnadır.
  - Kanıt: `apps/playground/skin/mapping.css`; 768 px'te `header-slot`,
    `loading-state`, `query-model`, `sorting`; PR #66 önce/sonra tablosu.
  - Tarih: 2026-10-07 · Durum: `ilk görülme`

- **Katman açıkken tema değiştirme, renk geçişi sürerken ölçülür.**
  Oyun alanının 0,15 s'lik `transition` kuralı yüzünden `-switched`
  ölçümleri ara renk okuyor (`#797979` / `#373737`); 850 ms sonra renkler
  doğru. `open_wait_ms` en az 900 olmalı.
  - Kanıt: theme-check `switch_while_open: true`, `open_wait_ms: 300`.
  - Tarih: 2026-10-07 · Durum: `ilk görülme`
