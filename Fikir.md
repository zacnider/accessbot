🎓 Proje Fikri: "LiveTutor" — Gerçek Zamanlı Kişisel Öğretmen Ajanı
Konsept: Öğrenci kamerasını açar, defterini/kitabını gösterir ve sesli konuşarak soru sorar. Ajan hem soruyu duyar hem görüntüyü analiz eder, anında cevap verir. Türkçe soru sorulabilir, ajan farklı dilde de yanıt verebilir.

✨ Öne Çıkan Özellikler
Görüntü Analizi — Öğrenci kameraya matematik sorusunu, diyagramı veya metni gösterir, ajan "görür" ve analiz eder.
Gerçek Zamanlı Ses — Öğrenci konuşurken ajan dinler, anında yanıt üretir, doğal bir konuşma akışı olur.
Kesinti Yönetimi — Öğrenci ajanı yarıda kesebilir ("dur, şunu sormak istiyorum"), ajan bunu anlayıp yön değiştirir.
Çok Dilli Destek — Türkçe, İngilizce, Almanca... Öğrenci hangi dilde sorarsa o dilde yanıt alır.

🛠️ Teknik Stack
KatmanTeknolojiAI ModelGemini 2.0 Flash (Live API)BackendPython + Google ADKHostingGoogle Cloud RunFrontendReact veya basit HTML/JSSes/VideoWebRTC veya Gemini Live stream

🏗️ Mimari (Özet)
Öğrenci (tarayıcı)
  │── Ses + Kamera görüntüsü
  ▼
Google Cloud Run (Backend)
  │── Gemini Live API (ses anlama + görüntü analizi)
  │── ADK Agent Logic (interrupt handling, dil tespiti)
  ▼
Öğrenciye sesli + metin yanıt

📅 Önerilen Geliştirme Takvimi (18 gün)
Hafta 1 — Gemini Live API bağlantısı, temel ses akışı, Google Cloud Run kurulumu
Hafta 2 — Kamera/görüntü analizi entegrasyonu, kesinti yönetimi, çok dilli destek
Son 4 gün — Demo videosu, mimari diyagram, README hazırlama, Cloud deployment kanıtı
