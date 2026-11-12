# TaskTide: Proje Tanıtım Dokümanı

**Proje:** TaskTide, görev ve proje yönetim sistemi REST API'si
**Eğitim:** Node.js ile Backend Programlama, Bitirme Projesi (TaskFlow yönergesi)
**Hazırlayan:** [Ad Soyad] · Kasım 2026
**Kaynak kod:** https://github.com/orewakm/tasktide_backend

## 1. Projenin amacı

Bir yazılım ekibinin görevleri, projeleri ve kimin neyle uğraştığını tek bir yerden takip edebilmesi için bir REST API geliştirmek. Görevler oluşturulur, çalışanlara atanır, öncelik verilir, durumları takip edilir ve görev üzerinde harcanan süre ölçülür.

Projede yönergedeki TaskFlow senaryosunu temel aldım ve onu gerçek hayatta kullanılabilecek bir Kanban panosuna dönüştürdüm. Bu dokümanda **"görev" kelimesi API'deki "kart" (card) kaynağına karşılık gelir.**

## 2. Senaryo

Bir yazılım şirketinde her proje için bir **pano** (board) açılır. Pano sahibi ekip arkadaşlarını email ile davet eder; davet kabul edilince kişi panonun üyesi olur. Panoda "Yapılacak", "Devam Ediyor", "Tamamlandı" gibi **sütunlar** bulunur. Görevler bu sütunlarda **kart** olarak tutulur.

- Bir kart oluşturulur, bir çalışana atanır ve önceliği belirlenir (düşük, orta, yüksek).
- Kart sütunlar arasında sürüklenerek ilerletilir; iş bitince "tamamlandı" olarak işaretlenir.
- Kartın atandığı kişi ilerleme notları yazar ve kart üzerinde zamanlayıcı başlatıp durdurur.
- Ekip, panodaki tüm değişiklikleri sayfayı yenilemeden anında görür.
- Raporlarda kaç görevin tamamlandığı, kaçının beklediği ve kimin ne kadar süre çalıştığı görülür.

## 3. Yönergedeki gereksinimlerin karşılığı

| Yönerge | Projedeki karşılığı |
|---|---|
| Görev ekleme | `POST /api/columns/:id/cards` |
| Görev listeleme | `GET /api/boards/:id/cards` (pano bazında) ve `GET /api/cards` (filtreli, sayfalı liste) |
| Görev detayı | `GET /api/cards/:id` |
| Görev güncelleme | `PATCH /api/cards/:id` |
| Görev silme | `DELETE /api/cards/:id` |
| Görevin çalışana atanması | Kartta `assigneeId` alanı (sadece panonun aktif üyeleri atanabilir) |
| Durum takibi | Sütunlar ve `completed` alanı (tamamlandı / bekliyor) |
| Öncelik yönetimi | `priority`: `low`, `medium`, `high` |
| Routing yapısı | Her kaynak için ayrı Express router: auth, boards, invitations, columns, cards, notes, time-entries, admin |
| Logger middleware | Her isteği konsola yazar: zaman damgası, method, endpoint, durum kodu ve süre |
| Postman testleri | `postman/TaskTide.postman_collection.json` (her endpoint için bir istek, gövde ve query parametreleriyle) |

**İsteğe bağlı bölümler de yapıldı:**

- **Filtreleme, arama, sayfalama, sıralama:** `GET /api/cards?status=completed&priority=high&assigneeId=me&search=login&sort=created_at&order=desc&page=1&limit=10`
- **Validation:** Tüm istek gövdeleri ve parametreler Zod ile doğrulanır. Eksik veya hatalı veride API, hangi alanın neden hatalı olduğunu listeleyen bir mesajla `400 Bad Request` döner (title, description, priority, assignee dahil).
- **Raporlama:** `GET /api/boards/:id/summary` tamamlanan ve bekleyen görev sayılarını toplamda, sütuna, önceliğe ve kişiye göre verir. `GET /api/boards/:id/stats` ise kişi, kart ve gün bazında harcanan süreyi gösterir.
- **Dokümantasyon:** README'de tüm endpoint'ler ve kurulum adımları bulunur. Ayrıca 42 otomatik entegrasyon testi, yazılı test senaryosu görevi görür.

## 4. Sistem özeti

**Teknolojiler:** Node.js 24, Express 5, TypeScript, PostgreSQL 17, Redis, Socket.IO, Zod, Vitest, Docker.
TypeScript, JavaScript'e derlenip Node.js üzerinde çalışır; tip kontrolü hataları kod çalışmadan önce yakalar.

**Mimari:** Her istek aynı katmanlardan geçer:
`route → controller → service → repository`

- **Route:** URL'yi doğru controller'a yönlendirir.
- **Controller:** İsteği okur ve doğrular, yanıtı gönderir.
- **Service:** İş kurallarını ve yetkileri kontrol eder.
- **Repository:** Veritabanıyla konuşur (parametreli SQL; SQL injection'a karşı güvenli).

Hatalar tek bir hata yakalayıcıda toplanır ve her zaman aynı JSON formatında döner.

**Veri modeli:** `users`, `boards`, `board_members` (davetli / aktif), `columns`, `cards`, `card_notes`, `time_entries`. Silinen pano, sütun ve kartlar veritabanından tamamen silinmez, `deleted_at` ile işaretlenir (soft delete).

**Yetkiler:**

- Üye olmayan biri panoyu göremez (404).
- Üyeler görev oluşturur, düzenler ve taşır.
- Pano sahibi bunlara ek olarak silme işlemlerini ve üyeleri yönetir; üyeler bunları denerse 403 alır.
- Admin tüm kullanıcıları listeler, süper admin ise rolleri değiştirir.

**Öne çıkan özellikler:**

- **Oturumlar Redis'te tutulur.** Çıkış yapınca oturum anında biter.
- **Aynı anda düzenleme koruması:** iki kişi aynı kartı aynı anda düzenlerse ikincisi `409 Conflict` alır, kimsenin değişikliği sessizce kaybolmaz.
- **Gerçek zamanlı güncellemeler:** Socket.IO ile her değişiklik panoyu açık tutan herkese anında gider; kimlerin çevrimiçi olduğu da görünür.
- **Zamanlayıcı kuralı:** her kullanıcının aynı anda tek bir çalışan zamanlayıcısı olabilir; bu kural veritabanı seviyesinde garanti edilir.

## 5. Kurulum ve teslim

Kurulum adımları `README.md` dosyasındadır. En kısa yol tek komuttur:

```bash
docker compose up --build
```

Bu komut PostgreSQL, Redis ve API'yi birlikte başlatır. API `http://localhost:8000` adresinde çalışır.

**Repoda teslim edilenler:**

- kaynak kod ve `package.json`;
- bu tanıtım dokümanı;
- `README.md` (kurulum notu);
- Postman koleksiyonu ve Postman test ekran görüntüleri (`postman/screenshots/`).
