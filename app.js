import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://qyeiwnwekqwhxwwbwyfq.supabase.co";
const SUPABASE_KEY = "sb_publishable_fjFOriVPPgI6_pFhIAurCw_jNwuX_kj";

const WORKER_URL =
  "https://pena-ai-backend-groq.wismakeluarga789.workers.dev";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);


// =====================================================
// STATE
// =====================================================

let currentUser = null;
let currentNovel = null;

let chapterData = [];
let currentChapterIndex = -1;
let chapterSearchText = "";
let editingCharacterId = null;
let editingCharacterBaseUpdatedAt = null;
let characterRecords = [];
let storyBibleRecord = null;

// =====================================================
// MULTI-DEVICE SYNC STATE
// =====================================================
let realtimeChannel = null;
let realtimeUserId = null;
let realtimeRefreshTimer = null;
let realtimeQueuedEvents = new Map();
let realtimeToastTimer = null;
let syncReturnHandlersInstalled = false;
let syncReturnRunning = false;
let lastSyncReturnAt = 0;
let styleBaseUpdatedAt = null;

// =====================================================
// MANUSCRIPT PROTECTION STATE
// =====================================================
let chapterDraftTimer = null;
let activeChapterDraftMeta = null;
let activeChapterOriginalText = "";
let manuscriptUnloadGuardInstalled = false;


// =====================================================
// VIDEO GALERI: putar hanya saat kartu terlihat di layar
// =====================================================
let galleryVideoObserver = null;

function aturPemutaranVideoGaleri() {
  const videos = Array.from(document.querySelectorAll("video[data-gallery-video]"));
  if (!videos.length) return;

  const reducedMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    videos.forEach(video => video.pause());
    return;
  }

  videos.forEach(video => {
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
  });

  const playSafely = video => {
    if (document.hidden) return;
    const result = video.play();
    if (result && typeof result.catch === "function") result.catch(() => {});
  };

  if (!("IntersectionObserver" in window)) {
    videos.forEach(playSafely);
    return;
  }

  if (galleryVideoObserver) galleryVideoObserver.disconnect();
  galleryVideoObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const video = entry.target;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.18) {
        playSafely(video);
      } else {
        video.pause();
      }
    });
  }, { threshold: [0, 0.18, 0.4] });

  videos.forEach(video => galleryVideoObserver.observe(video));
}

if (!window.__penaGalleryVisibilityHandler) {
  window.__penaGalleryVisibilityHandler = true;
  document.addEventListener("visibilitychange", () => {
    const videos = document.querySelectorAll("video[data-gallery-video]");
    if (document.hidden) {
      videos.forEach(video => video.pause());
      return;
    }
    videos.forEach(video => {
      const rect = video.getBoundingClientRect();
      const visible = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
      if (visible && !video.closest("[hidden]")) {
        const result = video.play();
        if (result && typeof result.catch === "function") result.catch(() => {});
      }
    });
  });
}


// =====================================================
// HELPER
// =====================================================

function el(id) {
  return document.getElementById(id);
}


// =====================================================
// MULTI-DEVICE SYNCHRONIZATION
// =====================================================

function tampilkanInfoSinkronisasi(text, type = "info", duration = 4200) {
  let toast = el("penaSyncToast");
  if (!toast && document.body) {
    toast = document.createElement("div");
    toast.id = "penaSyncToast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.style.cssText = [
      "position:fixed",
      "top:14px",
      "right:14px",
      "z-index:100000",
      "max-width:min(360px,calc(100vw - 28px))",
      "padding:11px 15px",
      "border:1px solid rgba(190,150,220,.35)",
      "border-radius:12px",
      "background:rgba(24,16,34,.96)",
      "color:#fff",
      "font:500 12px/1.55 system-ui,sans-serif",
      "box-shadow:0 12px 35px rgba(0,0,0,.32)",
      "backdrop-filter:blur(8px)",
      "display:none"
    ].join(";");
    document.body.appendChild(toast);
  }
  if (!toast) return;

  clearTimeout(realtimeToastTimer);
  toast.textContent = text;
  toast.style.borderColor = type === "error"
    ? "rgba(255,110,125,.65)"
    : type === "warning"
      ? "rgba(255,195,90,.65)"
      : "rgba(120,220,180,.48)";
  toast.style.display = "block";

  // Warning/info notices must never cover the editor indefinitely.
  // Older calls passed duration=0, which left the toast visible forever.
  const hideAfter = Number(duration) > 0 ? Number(duration) : 8500;
  realtimeToastTimer = setTimeout(() => {
    if (toast) toast.style.display = "none";
  }, hideAfter);
}

function storyBibleFormBerubah() {
  if (!Array.isArray(STORY_BIBLE_FIELDS)) return false;
  return STORY_BIBLE_FIELDS.some(([column, id]) => {
    const field = el(id);
    if (!field) return false;
    const saved = String(storyBibleRecord?.[column] ?? "").trim();
    return String(field.value ?? "").trim() !== saved;
  });
}

function gayaFormBerubah() {
  if (!currentNovel) return false;
  const fields = [
    ["styleGenre", "genre", "Drama"],
    ["styleWriting", "gaya", "Natural"],
    ["styleMood", "nuansa", "Emosional"],
    ["styleMode", "mode", "Normal"]
  ];
  return fields.some(([id, column, fallback]) => {
    const field = el(id);
    if (!field) return false;
    return String(field.value || fallback) !== String(currentNovel[column] || fallback);
  });
}

function karakterFormSedangDiedit() {
  if (editingCharacterId) return true;
  return [
    "charName", "charAge", "charRole", "charTrait",
    "charBackground", "charRelationship", "charGoal",
    "charSecret", "charNotes"
  ].some(id => String(el(id)?.value || "").trim() !== "");
}

function pasangPemulihanSinkronisasi() {
  if (syncReturnHandlersInstalled) return;
  syncReturnHandlersInstalled = true;

  window.addEventListener("focus", sinkronkanSaatKembali);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) sinkronkanSaatKembali();
  });
  window.addEventListener("online", sinkronkanSaatKembali);
}

async function hentikanSinkronisasiRealtime() {
  if (realtimeRefreshTimer) {
    clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = null;
  }
  realtimeQueuedEvents.clear();

  const oldChannel = realtimeChannel;
  realtimeChannel = null;
  realtimeUserId = null;

  if (oldChannel) {
    try {
      await supabase.removeChannel(oldChannel);
    } catch (error) {
      console.warn("Gagal menutup kanal sinkronisasi:", error);
    }
  }
}

async function pasangSinkronisasiRealtime(user) {
  if (!user?.id) return;
  if (realtimeChannel && realtimeUserId === user.id) return;

  await hentikanSinkronisasiRealtime();
  pasangPemulihanSinkronisasi();

  const tables = ["novel", "novel_bab", "novel_karakter", "novel_story_bible"];
  const channel = supabase.channel(`pena-sync-${user.id}`);

  tables.forEach(table => {
    ["INSERT", "UPDATE"].forEach(event => {
      channel.on(
        "postgres_changes",
        {
          event,
          schema: "public",
          table,
          filter: `user_id=eq.${user.id}`
        },
        payload => jadwalkanPerubahanRealtime(table, payload)
      );
    });
  });

  realtimeChannel = channel;
  realtimeUserId = user.id;

  channel.subscribe((status, error) => {
    if (realtimeChannel !== channel || currentUser?.id !== user.id) return;

    if (status === "SUBSCRIBED") {
      tampilkanInfoSinkronisasi("Sinkronisasi antarperangkat aktif.", "success", 3500);
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      console.error("Realtime PENA AI:", error || status);
      tampilkanInfoSinkronisasi(
        "Sinkronisasi langsung terputus. Perubahan akan diperiksa saat aplikasi aktif kembali.",
        "warning",
        0
      );
    } else if (status === "CLOSED") {
      tampilkanInfoSinkronisasi("Koneksi sinkronisasi ditutup.", "warning", 5000);
    }
  });
}

function jadwalkanPerubahanRealtime(table, payload) {
  if (!currentUser) return;
  const row = payload?.new || payload?.old || {};
  if (row.user_id && String(row.user_id) !== String(currentUser.id)) return;

  const queued = realtimeQueuedEvents.get(table) || [];
  queued.push(payload);
  realtimeQueuedEvents.set(table, queued);
  if (realtimeRefreshTimer) clearTimeout(realtimeRefreshTimer);

  realtimeRefreshTimer = setTimeout(async () => {
    const pending = Array.from(realtimeQueuedEvents.entries());
    realtimeQueuedEvents.clear();
    realtimeRefreshTimer = null;

    for (const [changedTable, eventPayloads] of pending) {
      try {
        await prosesPerubahanRealtime(changedTable, eventPayloads);
      } catch (error) {
        console.error(`Gagal menyinkronkan tabel ${changedTable}:`, error);
      }
    }
  }, 450);
}

async function prosesPerubahanRealtime(table, payloads) {
  if (!currentUser) return;
  const rows = (Array.isArray(payloads) ? payloads : [payloads])
    .map(payload => payload?.new || payload?.old || {})
    .filter(row => !row.user_id || String(row.user_id) === String(currentUser.id));
  if (!rows.length) return;

  if (table === "novel") {
    await Promise.all([muatNovel(), muatBeranda()]);
    if (currentNovel && rows.some(row => String(row.id) === String(currentNovel.id))) {
      await segarkanNovelAktifDariDatabase();
    }
    tampilkanInfoSinkronisasi("Daftar novel diperbarui dari perangkat lain.", "success");
    return;
  }

  if (table === "novel_bab") {
    await muatBeranda();
    if (!currentNovel || !rows.some(row => String(row.novel_id) === String(currentNovel.id))) return;

    if (el("chapterEditText")) {
      simpanDrafBabLokal(false);
      tampilkanInfoSinkronisasi(
        "Bab ini berubah di perangkat lain. Teks yang sedang kamu edit tidak ditimpa; simpan draf lokal sebelum memuat versi terbaru.",
        "warning",
        8500
      );
      msg("chapterActionMessage", "Ada perubahan bab dari perangkat lain. Simpan draf lokal terlebih dahulu; sistem akan menolak penyimpanan yang menimpa versi lebih baru.");
    } else {
      await muatBab(true);
      tampilkanInfoSinkronisasi("Bab diperbarui dari perangkat lain.", "success");
    }
    return;
  }

  if (!currentNovel || !rows.some(row => String(row.novel_id) === String(currentNovel.id))) return;

  if (table === "novel_karakter") {
    if (karakterFormSedangDiedit()) {
      tampilkanInfoSinkronisasi(
        "Profil karakter berubah di perangkat lain. Form yang sedang kamu isi tetap dipertahankan.",
        "warning",
        0
      );
      msg("characterMessage", "Ada perubahan profil dari perangkat lain. Sistem akan memeriksa konflik sebelum menyimpan agar perubahan tidak saling menimpa.");
    } else {
      await muatKarakter();
      tampilkanInfoSinkronisasi("Profil karakter diperbarui dari perangkat lain.", "success");
    }
    return;
  }

  if (table === "novel_story_bible") {
    if (storyBibleFormBerubah()) {
      tampilkanInfoSinkronisasi(
        "Story Bible berubah di perangkat lain. Isian lokal belum ditimpa; salin drafmu sebelum memuat versi terbaru.",
        "warning",
        0
      );
      msg("storyBibleMessage", "Ada perubahan Story Bible dari perangkat lain. Penyimpanan akan memeriksa versi agar tidak menimpa perubahan tersebut.");
    } else {
      await muatStoryBible();
      tampilkanInfoSinkronisasi("Story Bible diperbarui dari perangkat lain.", "success");
    }
  }
}

async function segarkanNovelAktifDariDatabase() {
  if (!currentNovel || !currentUser) return false;
  const novelId = currentNovel.id;
  const styleDirty = gayaFormBerubah();

  const { data, error } = await supabase
    .from("novel")
    .select("*")
    .eq("id", novelId)
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Gagal menyegarkan novel aktif:", error);
    return false;
  }

  if (!data) {
    currentNovel = null;
    chapterData = [];
    currentChapterIndex = -1;
    characterRecords = [];
    storyBibleRecord = null;
    editingCharacterId = null;
    editingCharacterBaseUpdatedAt = null;
    bukaHalaman("novelPage");
    await Promise.all([muatNovel(), muatBeranda()]);
    tampilkanInfoSinkronisasi("Novel ini sudah dihapus dari perangkat lain.", "warning", 0);
    return false;
  }

  currentNovel = data;
  if (el("detailTitle")) el("detailTitle").textContent = data.judul || "-";
  if (el("detailInfo")) {
    el("detailInfo").textContent = `${data.genre || "Drama"} · ${data.gaya || "Natural"} · ${data.nuansa || "Emosional"} · Bab ${data.bab_selesai || 0}`;
  }
  if (el("detailPremise")) el("detailPremise").textContent = data.premis || "Belum ada premis.";

  if (!styleDirty) {
    muatGaya();
  } else {
    msg("styleMessage", "Novel berubah di perangkat lain. Pilihan gaya lokal dipertahankan; simpan akan ditolak bila memakai versi yang sudah kedaluwarsa.");
  }
  return true;
}

async function periksaPembaruanBabSaatEditorAktif() {
  const textarea = el("chapterEditText");
  const chapter = chapterData[currentChapterIndex];
  if (!textarea || !chapter || !currentNovel || !currentUser) return;

  try {
    const { data, error } = await supabase
      .from("novel_bab")
      .select("id, updated_at")
      .eq("id", chapter.id)
      .eq("novel_id", currentNovel.id)
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      simpanDrafBabLokal(false);
      tampilkanInfoSinkronisasi(
        "Bab ini tidak ditemukan lagi di cloud. Draf pada perangkat ini tetap dipertahankan.",
        "warning",
        8500
      );
      msg("chapterActionMessage", "Bab mungkin telah dihapus dari perangkat lain. Salin draf lokal sebelum meninggalkan editor.");
      return;
    }

    const localVersion = String(chapter.updated_at ?? "");
    const remoteVersion = String(data.updated_at ?? "");
    if (localVersion !== remoteVersion) {
      simpanDrafBabLokal(false);
      tampilkanInfoSinkronisasi(
        "Bab benar-benar diperbarui dari perangkat lain. Draf yang sedang kamu edit tidak ditimpa.",
        "warning",
        8500
      );
      msg("chapterActionMessage", "Ada versi bab yang lebih baru di cloud. Draf lokal tetap aman; muat versi terbaru dan gabungkan perubahan sebelum menyimpan.");
    }
  } catch (error) {
    console.warn("Gagal memeriksa versi bab saat aplikasi aktif kembali:", error);
    // Kegagalan pemeriksaan tidak boleh menghapus atau mengganti teks editor.
  }
}

async function sinkronkanSaatKembali() {
  if (!currentUser || syncReturnRunning || document.hidden) return;
  const now = Date.now();
  if (now - lastSyncReturnAt < 4500) return;
  lastSyncReturnAt = now;
  syncReturnRunning = true;

  try {
    await Promise.all([muatNovel(), muatBeranda()]);
    if (!currentNovel) return;

    const novelStillExists = await segarkanNovelAktifDariDatabase();
    if (!novelStillExists) return;

    if (el("chapterEditText")) {
      // Verify the remote updated_at first; merely returning to the tab is not a conflict.
      await periksaPembaruanBabSaatEditorAktif();
    } else {
      await muatBab(true);
    }

    if (!karakterFormSedangDiedit()) {
      await muatKarakter();
    }

    if (!storyBibleFormBerubah()) {
      await muatStoryBible();
    } else {
      tampilkanInfoSinkronisasi("Story Bible lokal belum disimpan dan dipertahankan.", "warning", 8500);
    }
  } catch (error) {
    console.warn("Sinkronisasi saat aplikasi aktif kembali gagal:", error);
  } finally {
    syncReturnRunning = false;
  }
}


function msg(id, text) {
  const x = el(id);

  if (x) {
    x.textContent = text || "";
  }
}


// =====================================================
// MANUSCRIPT PROTECTION — DRAF OTOMATIS LOKAL
// =====================================================

function kunciDrafBab(chapter) {
  if (!currentUser?.id || !currentNovel?.id || !chapter?.id) return null;
  return [
    "pena-ai",
    "chapter-draft-v1",
    encodeURIComponent(String(currentUser.id)),
    encodeURIComponent(String(currentNovel.id)),
    encodeURIComponent(String(chapter.id))
  ].join(":");
}

function bacaDrafBabLokal(key) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft.text !== "string") return null;
    return draft;
  } catch (error) {
    console.warn("Tidak dapat membaca draf lokal:", error);
    return null;
  }
}

function hapusDrafBabLokal(key = activeChapterDraftMeta?.key) {
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn("Tidak dapat menghapus draf lokal:", error);
  }
}

function editorBabBerubah() {
  const textarea = el("chapterEditText");
  if (!textarea || !activeChapterDraftMeta) return false;
  return textarea.value !== activeChapterOriginalText;
}

function simpanDrafBabLokal(tampilkanStatus = true) {
  const textarea = el("chapterEditText");
  const meta = activeChapterDraftMeta;
  if (!textarea || !meta || !currentUser || !currentNovel) return false;

  const text = textarea.value;
  if (text === activeChapterOriginalText) {
    hapusDrafBabLokal(meta.key);
    if (tampilkanStatus) msg("chapterDraftStatus", "Tidak ada perubahan yang perlu dipulihkan.");
    return true;
  }

  const draft = {
    version: 1,
    userId: String(currentUser.id),
    novelId: String(currentNovel.id),
    chapterId: String(meta.chapterId),
    baseUpdatedAt: meta.baseUpdatedAt || null,
    savedAt: new Date().toISOString(),
    text
  };

  try {
    localStorage.setItem(meta.key, JSON.stringify(draft));
    if (tampilkanStatus) {
      const time = new Date(draft.savedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
      msg("chapterDraftStatus", `✓ Draf otomatis tersimpan di perangkat ini pukul ${time}. Belum dikirim ke cloud.`);
    }
    return true;
  } catch (error) {
    console.error("Gagal menyimpan draf lokal:", error);
    if (tampilkanStatus) {
      msg("chapterDraftStatus", "Penyimpanan lokal gagal. Salin tulisanmu sebagai cadangan.");
    }
    return false;
  }
}

function jadwalkanDrafBabLokal() {
  clearTimeout(chapterDraftTimer);
  msg("chapterDraftStatus", "Menyimpan draf otomatis...");
  chapterDraftTimer = setTimeout(() => {
    chapterDraftTimer = null;
    simpanDrafBabLokal(true);
  }, 700);
}

function pasangPeringatanNaskah() {
  if (manuscriptUnloadGuardInstalled) return;
  manuscriptUnloadGuardInstalled = true;

  window.addEventListener("beforeunload", event => {
    if (!editorBabBerubah()) return;
    simpanDrafBabLokal(false);
    event.preventDefault();
    event.returnValue = "";
  });

  window.addEventListener("pagehide", () => {
    if (editorBabBerubah()) simpanDrafBabLokal(false);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && editorBabBerubah()) simpanDrafBabLokal(false);
  });
}

function formatWaktuRevisi(value) {
  if (!value) return "Waktu tidak diketahui";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waktu tidak diketahui";
  return date.toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

async function buatSnapshotBab(chapter, revisionNote = "Sebelum perubahan") {
  const { data, error } = await supabase
    .from("novel_bab_revisions")
    .insert({
      chapter_id: chapter.id,
      novel_id: currentNovel.id,
      user_id: currentUser.id,
      nomor_bab: Number(chapter.nomor_bab) || 0,
      judul_bab: String(chapter.judul_bab || ""),
      isi_bab: String(chapter.isi_bab || ""),
      source_updated_at: chapter.updated_at || null,
      revision_note: revisionNote
    })
    .select("revision_id")
    .single();

  if (error) {
    throw new Error("Riwayat versi belum siap. Jalankan SQL Manuscript Protection terlebih dahulu. Detail: " + error.message);
  }
  return data?.revision_id ?? null;
}

async function hapusSnapshotBab(revisionId) {
  if (!revisionId || !currentUser) return;
  try {
    await supabase
      .from("novel_bab_revisions")
      .delete()
      .eq("revision_id", revisionId)
      .eq("user_id", currentUser.id);
  } catch (error) {
    console.warn("Snapshot sementara tidak berhasil dibersihkan:", error);
  }
}

async function bukaRiwayatVersi(chapterId) {
  if (!currentUser || !currentNovel) return;
  const chapter = chapterData.find(item => String(item.id) === String(chapterId));
  if (!chapter) {
    alert("Bab tidak ditemukan.");
    return;
  }

  const old = el("penaRevisionOverlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "penaRevisionOverlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(8,4,12,.82);backdrop-filter:blur(7px);";
  overlay.innerHTML = `
    <section style="width:min(100%,760px);max-height:calc(100vh - 28px);overflow:auto;padding:22px;border:1px solid rgba(218,158,221,.28);border-radius:18px;background:linear-gradient(145deg,#291833,#170f20);color:#fff;box-shadow:0 24px 90px #0009;">
      <header style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
        <div><small style="color:#d8a6dd;letter-spacing:1px;">PENA AI · MANUSCRIPT PROTECTION</small><h2 style="margin:6px 0;">Riwayat Versi Bab ${escapeHTML(chapter.nomor_bab)}</h2><p style="margin:0;color:#c8b5ce;font-size:13px;">Maksimal 30 versi terakhir disimpan untuk setiap bab.</p></div>
        <button type="button" id="penaRevisionClose" style="background:#ffffff12;color:#fff;border:1px solid #ffffff30;border-radius:9px;padding:7px 11px;cursor:pointer;">×</button>
      </header>
      <p id="penaRevisionStatus" style="color:#f4c8e8;font-size:13px;">Memuat riwayat versi...</p>
      <div id="penaRevisionList"></div>
    </section>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  el("penaRevisionClose").onclick = close;
  overlay.addEventListener("click", event => { if (event.target === overlay) close(); });

  const list = el("penaRevisionList");
  const status = el("penaRevisionStatus");
  const { data, error } = await supabase
    .from("novel_bab_revisions")
    .select("revision_id,chapter_id,novel_id,user_id,nomor_bab,judul_bab,isi_bab,source_updated_at,revision_note,created_at")
    .eq("chapter_id", chapter.id)
    .eq("novel_id", currentNovel.id)
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (!overlay.isConnected) return;
  if (error) {
    status.textContent = "Gagal memuat riwayat: " + error.message;
    return;
  }

  if (!data?.length) {
    status.textContent = "Belum ada riwayat versi. Versi pertama akan tercatat saat kamu menyimpan perubahan bab.";
    return;
  }

  status.textContent = `${data.length} versi ditemukan. Versi terbaru berada di urutan paling atas.`;
  list.innerHTML = data.map((revision, index) => {
    const preview = String(revision.isi_bab || "");
    const excerpt = preview.slice(0, 340);
    const wordCount = hitungKata(preview);
    return `
      <article style="margin:12px 0;padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(255,255,255,.04);">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;">
          <strong>Versi ${data.length - index} · ${escapeHTML(formatWaktuRevisi(revision.created_at))}</strong>
          <small style="color:#cbb8d2;">${formatAngka(wordCount)} kata</small>
        </div>
        <p style="margin:7px 0;color:#d6c7dc;font-size:12px;">${escapeHTML(revision.revision_note || "Sebelum perubahan")} · ${escapeHTML(revision.judul_bab || "Tanpa judul")}</p>
        <details style="color:#eee;margin:8px 0;"><summary style="cursor:pointer;color:#e7b8df;">Pratinjau isi versi</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:230px;overflow:auto;background:#100a15;padding:12px;border-radius:9px;color:#e8e0eb;font:12px/1.65 system-ui,sans-serif;">${escapeHTML(excerpt)}${preview.length > excerpt.length ? "\n\n[Pratinjau dipotong. Buka untuk melihat bagian awal.]" : ""}</pre></details>
        <button type="button" class="penaRestoreRevisionBtn" data-revision-id="${escapeHTML(String(revision.revision_id))}" style="background:linear-gradient(110deg,#b93c91,#7044a8);color:white;border:0;border-radius:9px;padding:9px 13px;cursor:pointer;">Pulihkan versi ini</button>
      </article>`;
  }).join("");

  list.querySelectorAll(".penaRestoreRevisionBtn").forEach(button => {
    button.onclick = () => pulihkanVersiBab(button.dataset.revisionId, chapter.id, overlay);
  });
}

async function pulihkanVersiBab(revisionId, chapterId, overlay) {
  const index = chapterData.findIndex(item => String(item.id) === String(chapterId));
  const current = chapterData[index];
  if (!current || !currentUser || !currentNovel) return;

  const { data: revision, error: readError } = await supabase
    .from("novel_bab_revisions")
    .select("revision_id,chapter_id,novel_id,user_id,nomor_bab,judul_bab,isi_bab,source_updated_at,created_at")
    .eq("revision_id", revisionId)
    .eq("chapter_id", current.id)
    .eq("novel_id", currentNovel.id)
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (readError || !revision) {
    alert("Versi yang dipilih tidak dapat dibaca. " + (readError?.message || "Versi tidak ditemukan."));
    return;
  }

  if (!confirm(`Pulihkan versi dari ${formatWaktuRevisi(revision.created_at)}?\n\nIsi bab saat ini akan disimpan dahulu ke riwayat, lalu diganti dengan versi pilihan.`)) return;

  let safetyRevisionId = null;
  try {
    safetyRevisionId = await buatSnapshotBab(current, `Sebelum memulihkan versi ${revisionId}`);
    let query = supabase
      .from("novel_bab")
      .update({
        isi_bab: revision.isi_bab,
        judul_bab: revision.judul_bab,
        updated_at: new Date().toISOString()
      })
      .eq("id", current.id)
      .eq("novel_id", currentNovel.id)
      .eq("user_id", currentUser.id);

    if (current.updated_at) query = query.eq("updated_at", current.updated_at);
    else query = query.is("updated_at", null);

    const { data, error } = await query.select().maybeSingle();
    if (error) throw error;
    if (!data) {
      await hapusSnapshotBab(safetyRevisionId);
      alert("Pemulihan dibatalkan karena bab telah berubah di perangkat lain. Versi terbaru tidak ditimpa.");
      return;
    }

    chapterData[index] = data;
    hapusDrafBabLokal(kunciDrafBab(current));
    activeChapterDraftMeta = null;
    activeChapterOriginalText = "";
    if (overlay?.isConnected) overlay.remove();
    renderChapterWorkspace();
    tampilkanInfoSinkronisasi("Versi bab berhasil dipulihkan. Versi sebelumnya tetap tersimpan di riwayat.", "success", 5500);
  } catch (error) {
    // Bila jaringan terputus setelah server memproses update, snapshot tetap dipertahankan sebagai jaring pengaman.
    alert("Gagal memulihkan versi: " + (error?.message || String(error)) + (safetyRevisionId ? " Snapshot sebelum pemulihan tetap disimpan di riwayat." : ""));
  }
}

function pasangPeringatanNavigasiEditor() {
  const textarea = el("chapterEditText");
  if (!textarea || !editorBabBerubah()) return true;
  simpanDrafBabLokal(false);
  return confirm("Ada perubahan naskah yang belum disimpan ke cloud. Draf sudah dicadangkan di perangkat ini. Tetap tinggalkan editor?");
}


function escapeHTML(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function tanggal(value) {

  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString(
    "id-ID",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );
}


function hitungKata(text = "") {

  const clean = String(text)
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) {
    return 0;
  }

  return clean.split(" ").length;
}


function formatAngka(number) {

  return Number(number || 0)
    .toLocaleString("id-ID");
}


function estimasiWaktuBaca(jumlahKata) {

  if (!jumlahKata) {
    return "0 menit";
  }

  const menit = Math.max(
    1,
    Math.ceil(jumlahKata / 200)
  );

  return `${menit} menit`;
}


function scrollKeAtas() {

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


// =====================================================
// NOVEL EXPORT CENTER
// =====================================================

function namaFileAman(value) {
  return String(value || "pena-ai")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "pena-ai";
}


function unduhBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}


function ambilDataEkspor(scope) {
  if (!currentNovel) {
    throw new Error("Novel belum dibuka.");
  }

  let chapters = [];

  if (scope === "current") {
    const current = chapterData[currentChapterIndex];
    if (!current) {
      throw new Error("Bab yang sedang dibuka tidak ditemukan.");
    }
    chapters = [current];
  } else {
    chapters = [...chapterData].sort(
      (a, b) => Number(a.nomor_bab || 0) - Number(b.nomor_bab || 0)
    );
  }

  if (!chapters.length) {
    throw new Error("Belum ada bab yang dapat diekspor.");
  }

  const invalid = chapters.filter(chapter => {
    const content = String(chapter.isi_bab || "").trim();
    return !content || /^(?:\.{2,}|…+|kosong)$/i.test(content);
  });

  if (invalid.length) {
    const numbers = invalid.map(chapter => `Bab ${chapter.nomor_bab}`).join(", ");
    throw new Error(`Ekspor dihentikan karena isi ${numbers} kosong atau hanya placeholder. Lengkapi bab tersebut terlebih dahulu.`);
  }

  return chapters;
}


function buatTeksNovel(chapters, authorName, isWholeNovel) {
  const novelTitle = currentNovel?.judul || "Novel Tanpa Judul";
  const lines = [
    novelTitle,
    authorName ? `Penulis: ${authorName}` : "Naskah dibuat dengan PENA AI",
    currentNovel?.genre ? `Genre: ${currentNovel.genre}` : "",
    "",
  ];

  if (isWholeNovel) {
    lines.push("DAFTAR ISI", "");
    chapters.forEach(chapter => {
      lines.push(`Bab ${chapter.nomor_bab} — ${chapter.judul_bab || "Tanpa Judul"}`);
    });
    lines.push("", "============================================================", "");
  }

  chapters.forEach((chapter, index) => {
    if (index > 0 || isWholeNovel) {
      lines.push("", "============================================================", "");
    }
    lines.push(`BAB ${chapter.nomor_bab}`, chapter.judul_bab || "Tanpa Judul", "");
    lines.push(String(chapter.isi_bab || "").trim(), "");
  });

  return lines.join("\n");
}


function buatParagrafNovel(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);
}


async function eksporWord(chapters, authorName, isWholeNovel) {
  // Library DOCX dimuat hanya ketika penulis memilih format Word.
  const docx = await import("https://esm.sh/docx@9.15.4");
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    Footer,
    PageNumber,
    PageBreak
  } = docx;

  const novelTitle = currentNovel?.judul || "Novel Tanpa Judul";
  const children = [];

  // Sampul
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2300, after: 260 },
      children: [new TextRun({ text: "PENA AI  ·  NOVEL STUDIO", bold: true, color: "8B5A91", size: 20, font: "Georgia" })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800, after: 420 },
      children: [new TextRun({ text: novelTitle, bold: true, size: 44, font: "Georgia", color: "25152B" })]
    })
  );

  if (!isWholeNovel && chapters[0]) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
      children: [new TextRun({ text: `Bab ${chapters[0].nomor_bab} — ${chapters[0].judul_bab || "Tanpa Judul"}`, size: 26, font: "Georgia", color: "76527B" })]
    }));
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 260, after: 140 },
      children: [new TextRun({ text: authorName || "Naskah dari PENA AI", size: 24, font: "Georgia", color: "555555" })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 120 },
      children: [new TextRun({ text: [currentNovel?.genre, currentNovel?.nuansa].filter(Boolean).join(" · "), size: 20, color: "777777" })]
    }),
    new Paragraph({ children: [new PageBreak()] })
  );

  // Daftar isi statis agar langsung terlihat saat dokumen dibuka.
  if (isWholeNovel) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 320 },
      children: [new TextRun({ text: "DAFTAR ISI", bold: true, size: 30, font: "Georgia" })]
    }));

    chapters.forEach(chapter => {
      children.push(new Paragraph({
        spacing: { after: 150 },
        children: [new TextRun({ text: `Bab ${chapter.nomor_bab}  —  ${chapter.judul_bab || "Tanpa Judul"}`, size: 23, font: "Times New Roman" })]
      }));
    });

    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  chapters.forEach((chapter, index) => {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: index > 0,
      alignment: AlignmentType.CENTER,
      spacing: { before: 180, after: 120 },
      children: [new TextRun({ text: `BAB ${chapter.nomor_bab}`, bold: true, size: 22, font: "Georgia", color: "76527B" })]
    }));

    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: true,
      spacing: { after: 360 },
      children: [new TextRun({ text: chapter.judul_bab || "Tanpa Judul", bold: true, size: 32, font: "Georgia", color: "25152B" })]
    }));

    buatParagrafNovel(chapter.isi_bab).forEach(paragraph => {
      children.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { firstLine: 360 },
        spacing: { after: 130, line: 360 },
        children: [new TextRun({ text: paragraph, size: 24, font: "Times New Roman" })]
      }));
    });
  });

  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "PENA AI  ·  Halaman ", size: 18, color: "777777" }),
          PageNumber.CURRENT
        ]
      })
    ]
  });

  const document = new Document({
    creator: "PENA AI",
    title: novelTitle,
    description: "Naskah novel diekspor dari PENA AI Novel Studio.",
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, footer: 720 }
        }
      },
      footers: { default: footer },
      children
    }]
  });

  const blob = await Packer.toBlob(document);
  const suffix = isWholeNovel ? "lengkap" : `bab-${chapters[0].nomor_bab}`;
  unduhBlob(blob, `${namaFileAman(novelTitle)}-${suffix}.docx`);
}


function bukaPdfCetak(chapters, authorName, isWholeNovel, printWindow) {
  const novelTitle = currentNovel?.judul || "Novel Tanpa Judul";
  const escape = value => escapeHTML(String(value ?? ""));

  const toc = isWholeNovel
    ? `<section class="contents"><h2>Daftar Isi</h2><ol>${chapters.map(chapter => `<li>Bab ${escape(chapter.nomor_bab)} — ${escape(chapter.judul_bab || "Tanpa Judul")}</li>`).join("")}</ol></section>`
    : "";

  const chapterMarkup = chapters.map(chapter => {
    const paragraphs = buatParagrafNovel(chapter.isi_bab)
      .map(paragraph => `<p>${escape(paragraph)}</p>`)
      .join("");
    return `<section class="chapter"><div class="chapter-number">BAB ${escape(chapter.nomor_bab)}</div><h1>${escape(chapter.judul_bab || "Tanpa Judul")}</h1>${paragraphs}</section>`;
  }).join("");

  const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(novelTitle)}</title>
<style>
@page { size: A4; margin: 23mm 22mm 22mm; @bottom-center { content: counter(page); font: 9pt Georgia,serif; color: #777; } }
* { box-sizing: border-box; }
body { margin: 0; color: #19151b; background: #fff; font-family: "Times New Roman",serif; font-size: 11.5pt; line-height: 1.75; }
.cover { min-height: 245mm; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; page-break-after: always; break-after: page; }
.brand { color: #81518c; font: bold 10pt Georgia,serif; letter-spacing: 2px; margin-bottom: 35mm; }
.cover h1 { max-width: 100%; margin: 0 0 14mm; font: bold 30pt Georgia,serif; line-height: 1.25; }
.cover .subtitle { margin: 0 0 5mm; color: #76527b; font: 13pt Georgia,serif; }
.cover .author { margin-top: 16mm; color: #555; font: 12pt Georgia,serif; }
.cover .meta { margin-top: 5mm; color: #777; font: 10pt Georgia,serif; }
.contents { page-break-after: always; break-after: page; }
.contents h2 { text-align: center; font: bold 19pt Georgia,serif; margin: 0 0 13mm; }
.contents ol { padding-left: 9mm; }
.contents li { margin: 0 0 5mm; }
.chapter { page-break-before: always; break-before: page; }
.chapter-number { margin: 0 0 5mm; text-align: center; font: bold 10pt Georgia,serif; letter-spacing: 1.8px; color: #76527b; }
.chapter h1 { margin: 0 0 12mm; text-align: center; font: bold 20pt Georgia,serif; line-height: 1.35; page-break-after: avoid; break-after: avoid; }
p { margin: 0 0 3.5mm; text-align: justify; text-indent: 1.1cm; orphans: 3; widows: 3; }
@media screen { body { max-width: 210mm; margin: 12mm auto; padding: 18mm 22mm; box-shadow: 0 2px 24px #0002; } .cover { min-height: 245mm; } }
</style>
</head>
<body>
<section class="cover"><div class="brand">PENA AI · NOVEL STUDIO</div><h1>${escape(novelTitle)}</h1>${!isWholeNovel && chapters[0] ? `<div class="subtitle">Bab ${escape(chapters[0].nomor_bab)} — ${escape(chapters[0].judul_bab || "Tanpa Judul")}</div>` : ""}<div class="author">${escape(authorName || "Naskah dari PENA AI")}</div><div class="meta">${escape([currentNovel?.genre, currentNovel?.nuansa].filter(Boolean).join(" · "))}</div></section>
${toc}${chapterMarkup}
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.document.title = `${novelTitle} - PENA AI`;
  setTimeout(() => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch (error) {
      console.error("Gagal membuka dialog cetak PDF:", error);
    }
  }, 900);
}


function pasangStyleEkspor() {
  if (el("penaExportStyles")) return;

  const style = document.createElement("style");
  style.id = "penaExportStyles";
  style.textContent = `
    .pena-export-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(8,4,12,.78);backdrop-filter:blur(7px)}
    .pena-export-card{width:min(100%,520px);max-height:calc(100vh - 36px);overflow:auto;padding:26px;border:1px solid rgba(218,158,221,.28);border-radius:20px;background:linear-gradient(145deg,#291833,#170f20);box-shadow:0 24px 90px #0009;color:#fff}
    .pena-export-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
    .pena-export-head h2{margin:5px 0 6px;font:700 25px Georgia,serif}
    .pena-export-head p{margin:0;color:#c7b4cb;font-size:12px;line-height:1.6}
    .pena-export-close{border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;border-radius:9px;padding:8px 11px;font-size:18px;cursor:pointer}
    .pena-export-card label{margin:15px 0 7px}
    .pena-export-card select,.pena-export-card input{width:100%;box-sizing:border-box;background:#130b1a;color:#fff;border:1px solid #624767;border-radius:10px;padding:12px;font-size:13px}
    .pena-export-note{margin-top:14px;padding:12px 14px;border-radius:11px;background:rgba(255,255,255,.055);color:#cdbbd1;font-size:11px;line-height:1.6}
    .pena-export-actions{display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap;margin-top:20px}
    .pena-export-actions button{padding:11px 16px;border-radius:10px;cursor:pointer}
    .pena-export-cancel{background:transparent;border:1px solid rgba(255,255,255,.2);color:#eadbea}
    .pena-export-start{background:linear-gradient(110deg,#c53691,#7545a8);border:0;color:#fff;font-weight:700}
    .pena-export-start:disabled{opacity:.55;cursor:wait}
    .pena-export-message{min-height:18px;margin:12px 0 0;color:#ffd0e9;font-size:12px;line-height:1.5}
    @media(max-width:560px){.pena-export-card{padding:20px}.pena-export-head h2{font-size:21px}}
  `;
  document.head.appendChild(style);
}


function bukaModalEkspor() {
  if (!currentNovel || !chapterData.length) {
    alert("Belum ada bab yang dapat diekspor.");
    return;
  }

  pasangStyleEkspor();
  const oldModal = el("penaExportOverlay");
  if (oldModal) oldModal.remove();

  const current = chapterData[currentChapterIndex];
  const overlay = document.createElement("div");
  overlay.id = "penaExportOverlay";
  overlay.className = "pena-export-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "penaExportTitle");
  overlay.innerHTML = `
    <div class="pena-export-card">
      <div class="pena-export-head">
        <div>
          <span class="eyebrow">PENA AI · PUBLISHING TOOLS</span>
          <h2 id="penaExportTitle">Novel Export Center</h2>
          <p>Siapkan naskahmu untuk disimpan, diedit, atau dicetak.</p>
        </div>
        <button type="button" class="pena-export-close" id="penaExportCloseTop" aria-label="Tutup">×</button>
      </div>

      <label for="penaExportScope">Materi yang diekspor</label>
      <select id="penaExportScope">
        <option value="all">Seluruh novel (${chapterData.length} bab)</option>
        <option value="current">Bab yang sedang dibuka${current ? ` — Bab ${escapeHTML(current.nomor_bab)}` : ""}</option>
      </select>

      <label for="penaExportFormat">Format file</label>
      <select id="penaExportFormat">
        <option value="docx">Microsoft Word (.docx) — bisa diedit</option>
        <option value="pdf">PDF (.pdf) — melalui dialog Simpan sebagai PDF</option>
        <option value="txt">Teks (.txt) — paling ringan</option>
      </select>

      <label for="penaExportAuthor">Nama penulis (opsional)</label>
      <input id="penaExportAuthor" type="text" maxlength="100" placeholder="Masukkan nama penulis untuk sampul">

      <div class="pena-export-note">
        Word dan PDF dilengkapi sampul. Ekspor seluruh novel juga menyertakan daftar isi dan pemisah halaman setiap bab. Ekspor berjalan dari data yang sudah tersimpan; tidak memakai kuota AI.
      </div>
      <p id="penaExportMessage" class="pena-export-message" aria-live="polite"></p>
      <div class="pena-export-actions">
        <button type="button" class="pena-export-cancel" id="penaExportCancel">Batal</button>
        <button type="button" class="pena-export-start" id="penaExportStart">Siapkan File ↓</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  el("penaExportCloseTop").onclick = close;
  el("penaExportCancel").onclick = close;
  overlay.addEventListener("click", event => {
    if (event.target === overlay) close();
  });

  el("penaExportStart").onclick = async () => {
    const startButton = el("penaExportStart");
    const message = el("penaExportMessage");
    const scope = el("penaExportScope").value;
    const format = el("penaExportFormat").value;
    const authorName = el("penaExportAuthor").value.trim();
    let printWindow = null;

    try {
      const chapters = ambilDataEkspor(scope);
      const isWholeNovel = scope === "all";

      if (format === "pdf") {
        // Jendela dibuka langsung dari klik pengguna agar tidak diblokir browser.
        printWindow = window.open("about:blank", "_blank");
        if (!printWindow) {
          throw new Error("Browser memblokir jendela PDF. Izinkan pop-up untuk situs PENA AI, lalu coba lagi.");
        }
      }

      startButton.disabled = true;
      startButton.textContent = "Menyiapkan...";
      message.textContent = format === "docx"
        ? "Menyusun dokumen Word..."
        : format === "pdf"
          ? "Menyiapkan halaman cetak PDF..."
          : "Menyiapkan file teks...";

      if (format === "docx") {
        await eksporWord(chapters, authorName, isWholeNovel);
      } else if (format === "pdf") {
        bukaPdfCetak(chapters, authorName, isWholeNovel, printWindow);
      } else {
        const content = buatTeksNovel(chapters, authorName, isWholeNovel);
        const blob = new Blob(["\uFEFF", content], { type: "text/plain;charset=utf-8" });
        const suffix = isWholeNovel ? "lengkap" : `bab-${chapters[0].nomor_bab}`;
        unduhBlob(blob, `${namaFileAman(currentNovel?.judul)}-${suffix}.txt`);
      }

      close();
    } catch (error) {
      if (printWindow && !printWindow.closed) printWindow.close();
      message.textContent = error?.message || "Ekspor gagal. Silakan coba kembali.";
      startButton.disabled = false;
      startButton.textContent = "Coba Lagi ↓";
    }
  };
}


// =====================================================
// LOGIN / STUDIO
// =====================================================

function tampilkanStudio() {

  if (el("authSection")) {
    el("authSection").hidden = true;
  }

  if (el("studioSection")) {
    el("studioSection").hidden = false;
  }

  aturPemutaranVideoGaleri();
  if (currentUser) {
    pasangSinkronisasiRealtime(currentUser).catch(error => {
      console.error("Gagal memasang sinkronisasi Realtime:", error);
      tampilkanInfoSinkronisasi("Sinkronisasi belum tersambung. Periksa setup Realtime Supabase.", "warning", 0);
    });
  }
}


function tampilkanLogin() {

  if (el("authSection")) {
    el("authSection").hidden = false;
  }

  if (el("studioSection")) {
    el("studioSection").hidden = true;
  }
}


// =====================================================
// NAVIGASI HALAMAN
// =====================================================

function bukaHalaman(id) {

  if (id !== "detailPage" && el("chapterEditText")) {
    if (!pasangPeringatanNavigasiEditor()) return false;
    renderChapterWorkspace();
  }

  document
    .querySelectorAll(".page")
    .forEach(page => {
      page.hidden = true;
    });


  const page = el(id);

  if (page) {
    page.hidden = false;
  }

  if (id === "homePage") aturPemutaranVideoGaleri();


  document
    .querySelectorAll(".menuBtn")
    .forEach(btn => {

      btn.classList.toggle(
        "active",
        btn.dataset.page === id
      );

    });
}


// =====================================================
// LOGIN
// =====================================================

async function login() {

  msg(
    "authMessage",
    "Sedang masuk..."
  );


  const email =
    el("email")?.value.trim() || "";

  const password =
    el("password")?.value || "";


  if (!email || !password) {

    msg(
      "authMessage",
      "Email dan password wajib diisi."
    );

    return;
  }


  try {

    const {
      data,
      error
    } =
      await supabase.auth.signInWithPassword({
        email,
        password
      });


    if (error) {

      msg(
        "authMessage",
        error.message
      );

      return;
    }


    currentUser =
      data.user;


    tampilkanStudio();

    await muatBeranda();

    await muatNovel();

  } catch (error) {

    console.error(
      "Login error:",
      error
    );

    msg(
      "authMessage",
      error.message ||
      "Gagal masuk."
    );
  }
}


// =====================================================
// DAFTAR
// =====================================================

async function daftar() {

  msg(
    "authMessage",
    "Sedang mendaftarkan akun..."
  );


  const email =
    el("email")?.value.trim() || "";

  const password =
    el("password")?.value || "";


  if (!email || !password) {

    msg(
      "authMessage",
      "Email dan password wajib diisi."
    );

    return;
  }


  if (password.length < 6) {

    msg(
      "authMessage",
      "Password minimal 6 karakter."
    );

    return;
  }


  try {

    const {
      error
    } =
      await supabase.auth.signUp({
        email,
        password
      });


    if (error) {

      msg(
        "authMessage",
        error.message
      );

      return;
    }


    msg(
      "authMessage",
      "Pendaftaran berhasil. Periksa email jika konfirmasi diminta."
    );

  } catch (error) {

    console.error(
      "Signup error:",
      error
    );

    msg(
      "authMessage",
      error.message ||
      "Gagal mendaftarkan akun."
    );
  }
}


// =====================================================
// LOGOUT
// =====================================================

async function logout() {

  if (el("chapterEditText")) {
    if (editorBabBerubah()) {
      simpanDrafBabLokal(false);
      const proceed = confirm("Ada naskah yang belum disimpan ke cloud. Draf sudah dicadangkan di perangkat ini. Tetap logout dari perangkat ini?");
      if (!proceed) return;
    }
    renderChapterWorkspace();
  }

  try {

    await hentikanSinkronisasiRealtime();
    // Logout perangkat ini saja; perangkat lain tetap login.
    await supabase.auth.signOut({ scope: "local" });

  } catch (error) {

    console.error(
      "Logout error:",
      error
    );
  }


  currentUser = null;

  currentNovel = null;

  chapterData = [];

  currentChapterIndex = -1;

  tampilkanLogin();
}


// =====================================================
// BERANDA
// =====================================================

async function muatBeranda() {

  if (!currentUser) {
    return;
  }


  const novelCount =
    await supabase
      .from("novel")
      .select(
        "*",
        {
          count: "exact",
          head: true
        }
      )
      .eq(
        "user_id",
        currentUser.id
      );


  const babCount =
    await supabase
      .from("novel_bab")
      .select(
        "*",
        {
          count: "exact",
          head: true
        }
      )
      .eq(
        "user_id",
        currentUser.id
      );


  if (el("totalNovel")) {

    el("totalNovel").textContent =
      novelCount.count || 0;
  }


  if (el("totalBab")) {

    el("totalBab").textContent =
      babCount.count || 0;
  }
}


// =====================================================
// BUAT NOVEL
// =====================================================

async function buatNovel() {

  if (!currentUser) {

    alert(
      "Silakan login terlebih dahulu."
    );

    return;
  }


  const judul =
    window.prompt(
      "Judul novel:"
    );


  if (
    !judul ||
    !judul.trim()
  ) {
    return;
  }


  const genre =
    window.prompt(
      "Genre novel:",
      "Drama"
    ) ||
    "Drama";


  const premis =
    window.prompt(
      "Premis singkat cerita:",
      ""
    ) ||
    "";


  try {

    const {
      data,
      error
    } =
      await supabase
        .from("novel")
        .insert({

          user_id:
            currentUser.id,

          judul:
            judul.trim(),

          genre:
            genre.trim(),

          gaya:
            "Natural",

          nuansa:
            "Emosional",

          mode:
            "Normal",

          premis:
            premis.trim(),

          target_bab:
            null,

          bab_selesai:
            0,

          status:
            "aktif"

        })
        .select()
        .single();


    if (error) {

      alert(
        "Gagal membuat novel:\n\n" +
        error.message
      );

      return;
    }


    currentNovel =
      data;


    await muatBeranda();

    await bukaNovel(
      data.id
    );

  } catch (error) {

    alert(
      "Gagal membuat novel:\n\n" +
      (
        error.message ||
        error
      )
    );
  }
}


// =====================================================
// DAFTAR NOVEL
// =====================================================

async function muatNovel() {

  if (!currentUser) {
    return;
  }


  const box =
    el("novelList");


  if (!box) {
    return;
  }


  box.innerHTML = `
    <div class="card">
      Memuat novel...
    </div>
  `;


  const {
    data,
    error
  } =
    await supabase
      .from("novel")
      .select("*")
      .eq(
        "user_id",
        currentUser.id
      )
      .order(
        "updated_at",
        {
          ascending: false
        }
      );


  if (error) {

    box.innerHTML = `
      <div class="card">
        Gagal memuat novel.
        <br><br>
        ${escapeHTML(error.message)}
      </div>
    `;

    return;
  }


  if (
    !data ||
    data.length === 0
  ) {

    box.innerHTML = `
      <div class="card">

        <h3>
          Belum ada novel
        </h3>

        <p>
          Buat novel pertama kamu
          dan mulai menulis.
        </p>

        <button
          id="emptyCreateNovel">
          + Buat Novel Baru
        </button>

      </div>
    `;


    const emptyBtn =
      el("emptyCreateNovel");


    if (emptyBtn) {
      emptyBtn.onclick =
        buatNovel;
    }


    return;
  }


  box.innerHTML =
    data.map(novel => {

      const novelTitle =
        novel.judul || "Novel tanpa judul";

      return `

        <article class="card novel-card">

          <div class="novel-card-copy">
            <h3>
              ${escapeHTML(novelTitle)}
            </h3>

            <p class="novel-card-meta">
              ${escapeHTML(novel.genre || "Drama")}
              ·
              ${escapeHTML(novel.gaya || "Natural")}
              ·
              ${escapeHTML(novel.nuansa || "Emosional")}
            </p>

            <p class="novel-card-count">
              ${Number(novel.bab_selesai) || 0} bab tersimpan
            </p>
          </div>

          <div class="novel-card-actions">
            <button
              class="openNovelButton primary-btn"
              data-id="${escapeHTML(String(novel.id))}">
              Buka Novel
            </button>

            <button
              class="deleteNovelButton danger-btn"
              data-id="${escapeHTML(String(novel.id))}"
              data-title="${escapeHTML(novelTitle)}"
              aria-label="Hapus novel ${escapeHTML(novelTitle)}">
              🗑 Hapus Novel
            </button>
          </div>

        </article>
      `;
    })
    .join("");


  document
    .querySelectorAll(
      ".openNovelButton"
    )
    .forEach(button => {

      button.onclick =
        () =>
          bukaNovel(
            button.dataset.id
          );

    });


  document
    .querySelectorAll(
      ".deleteNovelButton"
    )
    .forEach(button => {

      button.onclick =
        () =>
          hapusNovel(
            button.dataset.id,
            button.dataset.title,
            button
          );

    });
}


// =====================================================
// HAPUS NOVEL BESERTA SELURUH ISINYA
// =====================================================

async function hapusNovel(novelId, novelTitle = "Novel ini", triggerButton = null) {

  if (!currentUser || !novelId) {
    alert("Sesi login tidak valid. Silakan login kembali.");
    return;
  }

  const title = String(novelTitle || "Novel tanpa judul");
  const confirmed = window.confirm(
    `Yakin ingin menghapus novel "${title}"?\n\n` +
    "Semua bab, profil karakter, dan Story Bible milik novel ini akan dihapus permanen.\n" +
    "Tindakan ini tidak dapat dibatalkan."
  );

  if (!confirmed) return;

  const originalButtonText = triggerButton?.textContent || "🗑 Hapus Novel";
  if (triggerButton) {
    triggerButton.disabled = true;
    triggerButton.textContent = "Menghapus...";
  }

  try {
    // RPC ini menjalankan penghapusan dalam satu transaksi database.
    // Jika salah satu langkah gagal, seluruh penghapusan dibatalkan.
    const { data, error } = await supabase.rpc(
      "delete_user_novel",
      { p_novel_id: Number(novelId) }
    );

    if (error) {
      throw new Error(error.message || "Database menolak penghapusan novel.");
    }

    if (data !== true) {
      throw new Error("Novel tidak ditemukan atau bukan milik akun yang sedang login.");
    }

    if (String(currentNovel?.id) === String(novelId)) {
      currentNovel = null;
      chapterData = [];
      currentChapterIndex = -1;
      chapterSearchText = "";
      characterRecords = [];
      storyBibleRecord = null;
    }

    await Promise.all([
      muatNovel(),
      muatBeranda()
    ]);

    alert(
      `Novel "${title}" berhasil dihapus beserta semua bab, profil karakter, dan Story Bible-nya.`
    );

  } catch (error) {
    console.error("Gagal menghapus novel:", error);
    alert(
      "Novel belum berhasil dihapus. Tidak ada perubahan sebagian karena proses dijalankan dalam satu transaksi.\n\n" +
      (error.message || String(error)) +
      "\n\nPastikan SQL penghapusan novel sudah dijalankan di Supabase."
    );
  } finally {
    if (triggerButton && document.body.contains(triggerButton)) {
      triggerButton.disabled = false;
      triggerButton.textContent = originalButtonText;
    }
  }
}


// =====================================================
// BUKA NOVEL
// =====================================================

async function bukaNovel(id) {

  if (!currentUser) {
    return;
  }


  const {
    data,
    error
  } =
    await supabase
      .from("novel")
      .select("*")
      .eq(
        "id",
        id
      )
      .eq(
        "user_id",
        currentUser.id
      )
      .single();


  if (error) {

    alert(
      "Gagal membuka novel:\n\n" +
      error.message
    );

    return;
  }


  currentNovel =
    data;


  if (el("detailTitle")) {

    el("detailTitle").textContent =
      data.judul ||
      "-";
  }


  if (el("detailInfo")) {

    el("detailInfo").textContent =
      `${data.genre || "Drama"} · ` +
      `${data.gaya || "Natural"} · ` +
      `${data.nuansa || "Emosional"} · ` +
      `Bab ${data.bab_selesai || 0}`;
  }


  if (el("detailPremise")) {

    el("detailPremise").textContent =
      data.premis ||
      "Belum ada premis.";
  }


  bukaHalaman(
    "detailPage"
  );


  await muatBab();

  await muatKarakter();

  await muatStoryBible();

  muatGaya();
}


// =====================================================
// MUAT SEMUA BAB
// =====================================================

async function muatBab(preserveCurrent = false) {

  if (
    !currentNovel ||
    !currentUser
  ) {
    return;
  }

  const previousChapterId = preserveCurrent && chapterData[currentChapterIndex]
    ? chapterData[currentChapterIndex].id
    : null;


  const box =
    el("chapterList");


  if (!box) {
    return;
  }


  box.innerHTML = `
    <div class="card">
      Memuat bab...
    </div>
  `;


  const {
    data,
    error
  } =
    await supabase
      .from("novel_bab")
      .select("*")
      .eq(
        "novel_id",
        currentNovel.id
      )
      .eq(
        "user_id",
        currentUser.id
      )
      .order(
        "nomor_bab",
        {
          ascending: true
        }
      );


  if (error) {

    box.innerHTML = `
      <div class="card">

        Gagal memuat bab.

        <br><br>

        ${escapeHTML(
          error.message
        )}

      </div>
    `;

    return;
  }


  chapterData =
    data || [];


  if (
    chapterData.length === 0
  ) {

    currentChapterIndex =
      -1;


    box.innerHTML = `

      <div class="card">

        <h3>
          Belum ada bab
        </h3>

        <p>
          Klik "Tulis Bab Berikutnya"
          untuk memulai cerita.
        </p>

      </div>

    `;

    return;
  }


  // ===================================================
  // DEFAULT KE BAB TERAKHIR
  // ===================================================

  if (previousChapterId !== null) {
    currentChapterIndex = chapterData.findIndex(
      chapter => String(chapter.id) === String(previousChapterId)
    );
  } else {
    currentChapterIndex = -1;
  }

  if (currentChapterIndex < 0) {
    currentChapterIndex = chapterData.length - 1;
  }

  renderChapterWorkspace();
}


// =====================================================
// RENDER WORKSPACE BAB
// =====================================================

function renderChapterWorkspace() {

  const box =
    el("chapterList");


  if (!box) {
    return;
  }


  const currentChapter =
    chapterData[
      currentChapterIndex
    ];


  if (!currentChapter) {
    return;
  }


  const kata =
    hitungKata(
      currentChapter.isi_bab
    );


  const filtered =
    chapterData.filter(
      bab => {

        const target =
          `${bab.nomor_bab} ${bab.judul_bab || ""}`
            .toLowerCase();

        return target.includes(
          chapterSearchText
            .toLowerCase()
        );

      }
    );


  box.innerHTML = `

    <div class="chapter-workspace">

      <!-- =========================================
           SEARCH
      ========================================== -->

      <div class="card">

        <div
          style="
            display:flex;
            gap:10px;
            align-items:center;
            flex-wrap:wrap;
          ">

          <input
            id="chapterSearch"
            type="text"
            placeholder="Cari bab atau judul..."
            value="${escapeHTML(
              chapterSearchText
            )}"
            style="
              flex:1;
              min-width:220px;
            "
          >

          <span>
            ${chapterData.length}
            bab
          </span>

        </div>

      </div>


      <!-- =========================================
           LAYOUT
      ========================================== -->

      <div
        style="
          display:grid;
          grid-template-columns:
            minmax(220px, 30%)
            minmax(0, 1fr);
          gap:16px;
          align-items:start;
        ">


        <!-- =======================================
             DAFTAR BAB
        ======================================== -->

        <div
          class="card"
          style="
            position:sticky;
            top:20px;
          ">

          <h3>
            Daftar Bab
          </h3>


          <div
            style="
              max-height:70vh;
              overflow-y:auto;
              padding-right:5px;
            ">

            ${filtered.length
              ? filtered.map(
                  bab => {

                    const index =
                      chapterData.findIndex(
                        x =>
                          String(x.id) ===
                          String(bab.id)
                      );


                    const active =
                      index ===
                      currentChapterIndex;


                    const babWords =
                      hitungKata(
                        bab.isi_bab
                      );


                    return `

                      <button
                        class="chapter-select-btn"
                        data-index="${index}"
                        style="
                          width:100%;
                          text-align:left;
                          padding:12px;
                          margin-bottom:8px;
                          border-radius:10px;
                          cursor:pointer;
                          border:1px solid
                            ${active
                              ? "rgba(180,100,255,.8)"
                              : "rgba(255,255,255,.08)"};
                          background:
                            ${active
                              ? "rgba(120,60,180,.25)"
                              : "rgba(255,255,255,.03)"};
                        ">

                        <strong>
                          Bab ${bab.nomor_bab}
                        </strong>

                        <br>

                        <small>
                          ${escapeHTML(
                            bab.judul_bab ||
                            "Tanpa judul"
                          )}
                        </small>

                        <br>

                        <small>
                          ${formatAngka(
                            babWords
                          )}
                          kata
                        </small>

                      </button>

                    `;

                  }
                ).join("")
              : `

                <p>
                  Bab tidak ditemukan.
                </p>

              `
            }

          </div>

        </div>


        <!-- =======================================
             EDITOR BAB
        ======================================== -->

        <div>

          <div class="card">

            <!-- NAVIGASI -->

            <div
              style="
                display:flex;
                justify-content:space-between;
                gap:10px;
                flex-wrap:wrap;
                align-items:center;
                margin-bottom:15px;
              ">

              <button
                id="prevChapterBtn"
                ${currentChapterIndex <= 0
                  ? "disabled"
                  : ""}>

                ← Bab Sebelumnya

              </button>


              <strong>

                Bab ${currentChapter.nomor_bab}

              </strong>


              <button
                id="nextChapterBtn"
                ${currentChapterIndex >=
                  chapterData.length - 1
                  ? "disabled"
                  : ""}>

                Bab Berikutnya →

              </button>

            </div>


            <!-- JUDUL -->

            <h2>
              ${escapeHTML(
                currentChapter.judul_bab ||
                `Bab ${currentChapter.nomor_bab}`
              )}
            </h2>


            <!-- INFO -->

            <div
              style="
                display:flex;
                gap:10px;
                flex-wrap:wrap;
                margin-bottom:20px;
                opacity:.8;
              ">

              <span>
                📅
                ${tanggal(
                  currentChapter.created_at
                )}
              </span>

              <span>
                ·
              </span>

              <span>
                📝
                ${formatAngka(
                  kata
                )}
                kata
              </span>

              <span>
                ·
              </span>

              <span>
                ⏱
                ±${estimasiWaktuBaca(
                  kata
                )}
              </span>

            </div>


            <!-- ISI BAB -->

            <div
              id="chapterContentArea">

              <div
                class="chapter-text"
                style="
                  line-height:1.9;
                  white-space:normal;
                ">

                ${escapeHTML(
                  currentChapter.isi_bab ||
                  ""
                ).replace(
                  /\n/g,
                  "<br><br>"
                )}

              </div>

            </div>


            <!-- TOMBOL -->

            <div
              style="
                display:flex;
                gap:10px;
                flex-wrap:wrap;
                margin-top:25px;
                padding-top:20px;
                border-top:1px solid
                  rgba(255,255,255,.08);
              ">

              <button
                id="copyCurrentChapterBtn">

                📋 Salin Bab

              </button>


              <button
                id="editCurrentChapterBtn">

                ✏️ Edit Bab

              </button>


              <button
                id="exportNovelBtn">

                📥 Ekspor

              </button>

              <button
                id="chapterHistoryBtn">

                📜 Riwayat Versi

              </button>

              <button
                id="deleteCurrentChapterBtn">

                🗑️ Hapus Bab

              </button>

            </div>


            <div
              id="chapterActionMessage"
              style="
                margin-top:12px;
              ">
            </div>

          </div>

        </div>

      </div>

    </div>

  `;


  // ===================================================
  // EVENT SEARCH
  // ===================================================

  const search =
    el("chapterSearch");


  if (search) {

    search.oninput =
      function () {

        chapterSearchText =
          this.value;

        if (el("chapterEditText")) {
          msg("chapterDraftStatus", "Selesaikan atau batalkan edit bab terlebih dahulu sebelum memperbarui daftar pencarian.");
          return;
        }

        renderChapterWorkspace();

      };

  }


  // ===================================================
  // PILIH BAB
  // ===================================================

  document
    .querySelectorAll(
      ".chapter-select-btn"
    )
    .forEach(button => {

      button.onclick =
        () => {

          if (el("chapterEditText")) {
            if (!pasangPeringatanNavigasiEditor()) return;
            renderChapterWorkspace();
          }

          currentChapterIndex =
            Number(
              button.dataset.index
            );

          renderChapterWorkspace();

          scrollKeAtas();

        };

    });


  // ===================================================
  // SEBELUMNYA
  // ===================================================

  const prev =
    el("prevChapterBtn");


  if (prev) {

    prev.onclick =
      () => {

        if (
          currentChapterIndex > 0
        ) {
          if (el("chapterEditText")) {
            if (!pasangPeringatanNavigasiEditor()) return;
            renderChapterWorkspace();
          }

          currentChapterIndex--;

          renderChapterWorkspace();

          scrollKeAtas();

        }

      };

  }


  // ===================================================
  // BERIKUTNYA
  // ===================================================

  const next =
    el("nextChapterBtn");


  if (next) {

    next.onclick =
      () => {

        if (
          currentChapterIndex <
          chapterData.length - 1
        ) {
          if (el("chapterEditText")) {
            if (!pasangPeringatanNavigasiEditor()) return;
            renderChapterWorkspace();
          }

          currentChapterIndex++;

          renderChapterWorkspace();

          scrollKeAtas();

        }

      };

  }


  // ===================================================
  // SALIN
  // ===================================================

  const copyBtn =
    el("copyCurrentChapterBtn");


  if (copyBtn) {

    copyBtn.onclick =
      async () => {

        try {

          await navigator.clipboard.writeText(
            currentChapter.isi_bab ||
            ""
          );


          msg(
            "chapterActionMessage",
            "Bab berhasil disalin."
          );

        } catch {

          msg(
            "chapterActionMessage",
            "Gagal menyalin bab."
          );

        }

      };

  }


  // ===================================================
  // EKSPOR NOVEL
  // ===================================================

  const exportBtn =
    el("exportNovelBtn");

  if (exportBtn) {
    exportBtn.onclick = () => {
      bukaModalEkspor();
    };
  }

  const historyBtn = el("chapterHistoryBtn");
  if (historyBtn) {
    historyBtn.onclick = () => bukaRiwayatVersi(currentChapter.id);
  }


  // ===================================================
  // EDIT
  // ===================================================

  const editBtn =
    el("editCurrentChapterBtn");


  if (editBtn) {

    editBtn.onclick =
      () => {

        modeEditBab();

      };

  }


  // ===================================================
  // HAPUS
  // ===================================================

  const deleteBtn =
    el("deleteCurrentChapterBtn");


  if (deleteBtn) {

    deleteBtn.onclick =
      () => {

        hapusBab(
          currentChapter.id
        );

      };

  }
}


// =====================================================
// MODE EDIT BAB
// =====================================================

function pasangStylePerlindunganNaskah() {
  if (el("penaManuscriptStyles")) return;
  const style = document.createElement("style");
  style.id = "penaManuscriptStyles";
  style.textContent = `
    .pena-manuscript-editor{display:grid;gap:12px}
    .pena-draft-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:11px 13px;border:1px solid rgba(150,115,180,.28);border-radius:11px;background:rgba(110,75,135,.12);color:#e9d9f0;font-size:12px;line-height:1.5}
    .pena-draft-actions{display:flex;gap:7px;flex-wrap:wrap}
    .pena-draft-actions button{border:1px solid rgba(255,255,255,.18);border-radius:8px;background:rgba(255,255,255,.06);color:#fff;padding:7px 10px;cursor:pointer}
    .pena-draft-warning{margin:0;padding:10px 12px;border-radius:9px;background:rgba(190,120,35,.15);border:1px solid rgba(230,170,80,.35);color:#ffe0a8;font-size:12px;line-height:1.6}
    .pena-draft-footnote{margin:0;color:#bfaec9;font-size:11px;line-height:1.6}
    #chapterEditText{background:#100d16;color:#f4eef7;border:1px solid rgba(190,150,220,.28);border-radius:12px;outline:none}
    #chapterEditText:focus{border-color:rgba(190,130,240,.75);box-shadow:0 0 0 3px rgba(160,100,210,.12)}
    @media(max-width:600px){.pena-draft-toolbar{align-items:flex-start}.pena-draft-actions{width:100%}.pena-draft-actions button{flex:1}}
  `;
  document.head.appendChild(style);
}

function modeEditBab() {
  const chapter = chapterData[currentChapterIndex];
  if (!chapter) return;
  pasangStylePerlindunganNaskah();

  const area = el("chapterContentArea");
  if (!area) return;

  activeChapterOriginalText = String(chapter.isi_bab || "");
  activeChapterDraftMeta = {
    chapterId: chapter.id,
    key: kunciDrafBab(chapter),
    baseUpdatedAt: chapter.updated_at || null
  };
  pasangPeringatanNaskah();

  const existingDraft = bacaDrafBabLokal(activeChapterDraftMeta.key);
  const hasRecoverableDraft = Boolean(
    existingDraft &&
    typeof existingDraft.text === "string" &&
    existingDraft.text !== activeChapterOriginalText
  );
  const baseChanged = Boolean(
    hasRecoverableDraft &&
    existingDraft.baseUpdatedAt &&
    chapter.updated_at &&
    String(existingDraft.baseUpdatedAt) !== String(chapter.updated_at)
  );
  const initialDraftStatus = hasRecoverableDraft
    ? `Draf lokal ditemukan (${formatWaktuRevisi(existingDraft.savedAt)}). Gunakan tombol Pulihkan Draf jika ingin memakainya.`
    : "Autosave draf lokal aktif. Setiap perubahan akan dicadangkan di perangkat ini.";

  area.innerHTML = `
    <div class="pena-manuscript-editor">
      <div class="pena-draft-toolbar">
        <span id="chapterDraftStatus" role="status" aria-live="polite">${escapeHTML(initialDraftStatus)}</span>
        <div class="pena-draft-actions">
          <button type="button" id="restoreLocalChapterDraftBtn"
  style="display:block !important; background:red !important; color:white !important; font-size:20px !important; padding:15px !important;">
  🔥 TES PULIHKAN DRAF
</button>
          ${existingDraft ? `<button type="button" id="discardLocalChapterDraftBtn">Hapus Draf Lokal</button>` : ""}
        </div>
      </div>
      ${baseChanged ? `<p class="pena-draft-warning">Perhatian: bab di cloud berubah setelah draf lokal dibuat. Draf tetap bisa dipulihkan, tetapi penyimpanan akan memeriksa konflik versi.</p>` : ""}
      <textarea
        id="chapterEditText"
        spellcheck="true"
        aria-label="Edit isi bab"
        style="width:100%;min-height:650px;padding:20px;resize:vertical;line-height:1.8;font-size:16px;box-sizing:border-box;">${escapeHTML(activeChapterOriginalText)}</textarea>
      <p class="pena-draft-footnote">Draf otomatis tersimpan di browser/perangkat ini, bukan ke cloud. Klik <strong>Simpan Perubahan</strong> untuk menyimpan ke Supabase dan membuat versi pemulihan.</p>
    </div>
  `;

  const actionMessage = el("chapterActionMessage");
  if (actionMessage) {
    actionMessage.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;">
        <button id="saveEditedChapterBtn">💾 Simpan Perubahan</button>
        <button id="cancelEditChapterBtn">Batal</button>
      </div>
    `;
  }

  const textarea = el("chapterEditText");
  if (textarea) {
    textarea.addEventListener("input", jadwalkanDrafBabLokal);
  }

  const restoreBtn = el("restoreLocalChapterDraftBtn");
  if (restoreBtn) {
    restoreBtn.onclick = () => {
      const latestDraft = bacaDrafBabLokal(activeChapterDraftMeta?.key);
      if (!latestDraft || typeof latestDraft.text !== "string") {
        msg("chapterDraftStatus", "Belum ada draf lokal yang tersimpan untuk bab ini pada perangkat/browser ini.");
        return;
      }
      if (String(latestDraft.userId) !== String(currentUser?.id) ||
          String(latestDraft.novelId) !== String(currentNovel?.id) ||
          String(latestDraft.chapterId) !== String(activeChapterDraftMeta?.chapterId)) {
        msg("chapterDraftStatus", "Draf ditemukan, tetapi identitas novel atau bab tidak cocok. Draf tidak diterapkan demi keamanan.");
        return;
      }
      if (latestDraft.text === activeChapterOriginalText) {
        msg("chapterDraftStatus", "Draf lokal ditemukan, tetapi isinya sama dengan versi cloud. Tidak ada perubahan yang perlu dipulihkan.");
        return;
      }
      textarea.value = latestDraft.text;
      msg("chapterDraftStatus", `Draf lokal dipulihkan dari ${formatWaktuRevisi(latestDraft.savedAt)}. Periksa tulisan lalu klik Simpan Perubahan jika sudah siap.`);
      textarea.focus();
    };
  }

  const discardBtn = el("discardLocalChapterDraftBtn");
  if (discardBtn) {
    discardBtn.onclick = () => {
      if (!confirm("Hapus draf otomatis lokal untuk bab ini? Isi bab di cloud tidak akan berubah.")) return;
      hapusDrafBabLokal(activeChapterDraftMeta?.key);
      if (textarea) textarea.value = activeChapterOriginalText;
      msg("chapterDraftStatus", "Draf lokal dihapus. Isi bab cloud tetap aman.");
      discardBtn.remove();
    };
  }

  const saveBtn = el("saveEditedChapterBtn");
  if (saveBtn) saveBtn.onclick = simpanEditBab;

  const cancelBtn = el("cancelEditChapterBtn");
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      if (editorBabBerubah()) {
        simpanDrafBabLokal(false);
        const proceed = confirm("Perubahan belum disimpan ke cloud. Draf sudah dicadangkan di perangkat ini dan bisa dipulihkan nanti. Keluar dari editor?");
        if (!proceed) return;
      }
      if (chapterDraftTimer) {
        clearTimeout(chapterDraftTimer);
        chapterDraftTimer = null;
      }
      renderChapterWorkspace();
    };
  }
}

// =====================================================
// SIMPAN EDIT BAB
// =====================================================

async function simpanEditBab() {
  const chapter = chapterData[currentChapterIndex];
  const textarea = el("chapterEditText");
  if (!chapter || !textarea || !currentUser || !currentNovel) return;

  const isiBaru = textarea.value;
  const saveBtn = el("saveEditedChapterBtn");
  if (saveBtn) saveBtn.disabled = true;
  msg("chapterActionMessage", "Menyimpan versi aman dan perubahan naskah...");

  if (isiBaru === String(chapter.isi_bab || "")) {
    hapusDrafBabLokal(activeChapterDraftMeta?.key);
    activeChapterDraftMeta = null;
    activeChapterOriginalText = "";
    renderChapterWorkspace();
    msg("chapterActionMessage", "Tidak ada perubahan baru. Naskah sudah sesuai dengan versi cloud.");
    return;
  }

  let revisionId = null;
  try {
    // Simpan versi lama terlebih dahulu agar selalu ada titik pemulihan.
    revisionId = await buatSnapshotBab(chapter, "Sebelum edit manual");

    let updateQuery = supabase
      .from("novel_bab")
      .update({
        isi_bab: isiBaru,
        updated_at: new Date().toISOString()
      })
      .eq("id", chapter.id)
      .eq("novel_id", currentNovel.id)
      .eq("user_id", currentUser.id);

    // Optimistic locking: mencegah draf lama menimpa versi yang diubah perangkat lain.
    if (chapter.updated_at) updateQuery = updateQuery.eq("updated_at", chapter.updated_at);
    else updateQuery = updateQuery.is("updated_at", null);

    const { data, error } = await updateQuery.select().maybeSingle();
    if (error) throw error;

    if (!data) {
      await hapusSnapshotBab(revisionId);
      msg("chapterActionMessage", "Konflik versi: bab sudah diubah atau dihapus dari perangkat lain. Draf lokalmu tetap tersedia dan tidak ditimpa. Pulihkan/salin draf, muat versi terbaru, lalu gabungkan secara manual.");
      tampilkanInfoSinkronisasi("Penyimpanan diblokir agar tulisan dari perangkat lain tidak tertimpa.", "warning", 0);
      if (saveBtn) saveBtn.disabled = false;
      return;
    }

    chapterData[currentChapterIndex] = data;
    hapusDrafBabLokal(activeChapterDraftMeta?.key);
    activeChapterDraftMeta = null;
    activeChapterOriginalText = "";
    renderChapterWorkspace();
    msg("chapterActionMessage", "Perubahan tersimpan ke cloud. Versi sebelumnya tersedia di Riwayat Versi.");
    tampilkanInfoSinkronisasi("Naskah tersimpan dan versi sebelumnya dicadangkan.", "success", 4200);
  } catch (error) {
    // Snapshot dipertahankan bila respons jaringan ambigu: server mungkin sudah menerima update.
    msg("chapterActionMessage", "Gagal menyimpan: " + (error?.message || String(error)) + " Draf lokal tetap dipertahankan. Jika snapshot sudah dibuat, versi sebelumnya tetap tersedia di riwayat.");
    if (saveBtn) saveBtn.disabled = false;
  }
}

// =====================================================
// HAPUS BAB
// =====================================================

async function hapusBab(id) {

  const chapter =
    chapterData.find(
      bab =>
        String(bab.id) ===
        String(id)
    );


  if (!chapter) {
    return;
  }


  const yakin =
    confirm(
      `Hapus Bab ${chapter.nomor_bab}?\n\n` +
      `Bab yang sudah dihapus tidak dapat dipulihkan.`
    );


  if (!yakin) {
    return;
  }


  try {

    const {
      error
    } =
      await supabase
        .from("novel_bab")
        .delete()
        .eq(
          "id",
          id
        )
        .eq(
          "novel_id",
          currentNovel.id
        )
        .eq(
          "user_id",
          currentUser.id
        );


    if (error) {

      alert(
        "Gagal menghapus bab:\n\n" +
        error.message
      );

      return;
    }

    hapusDrafBabLokal(kunciDrafBab(chapter));
    if (String(activeChapterDraftMeta?.chapterId) === String(chapter.id)) {
      activeChapterDraftMeta = null;
      activeChapterOriginalText = "";
    }

    const sisaBab =
      chapterData.filter(
        bab =>
          String(bab.id) !==
          String(id)
      );


    let babTertinggi = 0;


    sisaBab.forEach(
      bab => {

        const nomor =
          Number(
            bab.nomor_bab
          ) || 0;


        if (
          nomor >
          babTertinggi
        ) {

          babTertinggi =
            nomor;

        }

      }
    );


    await supabase
      .from("novel")
      .update({

        bab_selesai:
          babTertinggi,

        updated_at:
          new Date().toISOString()

      })
      .eq(
        "id",
        currentNovel.id
      )
      .eq(
        "user_id",
        currentUser.id
      );


    currentNovel.bab_selesai =
      babTertinggi;


    await muatBab();

    await muatBeranda();


    if (el("detailInfo")) {

      el("detailInfo").textContent =
        `${currentNovel.genre || "Drama"} · ` +
        `${currentNovel.gaya || "Natural"} · ` +
        `${currentNovel.nuansa || "Emosional"} · ` +
        `Bab ${currentNovel.bab_selesai || 0}`;

    }

  } catch (error) {

    alert(
      "Gagal menghapus bab:\n\n" +
      (
        error.message ||
        error
      )
    );
  }
}


// =====================================================
// TULIS BAB BERIKUTNYA
// =====================================================

async function tulisBab() {

  if (!currentNovel) {

    msg(
      "chapterMessage",
      "Novel belum dipilih."
    );

    return;
  }


  const button =
    el("writeNextChapter");


  if (button) {
    button.disabled = true;
  }


  msg(
    "chapterMessage",
    "PENA AI sedang menulis bab berikutnya..."
  );


  try {

    const {
      data
    } =
      await supabase.auth.getSession();


    const token =
      data.session?.access_token;


    if (!token) {

      throw new Error(
        "Sesi login sudah berakhir."
      );

    }


    const response =
      await fetch(
        WORKER_URL,
        {

          method:
            "POST",

          headers:
            {

              "Content-Type":
                "application/json",

              "Authorization":
                `Bearer ${token}`

            },

          body:
            JSON.stringify({

              action:
                "write_chapter",

              novel_id:
                Number(
                  currentNovel.id
                )

            })

        }
      );


    let result =
      null;


    try {

      result =
        await response.json();

    } catch {

      throw new Error(
        `Backend mengirim response tidak valid. Status server: ${response.status}`
      );

    }


    if (
      !response.ok ||
      !result?.success
    ) {

      throw new Error(
        result?.error ||
        `Gagal menulis bab. Status server: ${response.status}`
      );

    }


    msg(
      "chapterMessage",
      `Bab ${result.nomor_bab || ""} berhasil ditulis dan disimpan.`
    );


    await bukaNovel(
      currentNovel.id
    );


    await muatBeranda();

  } catch (error) {

    console.error(
      "PENA AI chapter error:",
      error
    );


    msg(
      "chapterMessage",
      error.message ||
      "Gagal menulis bab."
    );

  } finally {

    if (button) {
      button.disabled = false;
    }

  }
}


// =====================================================
// KARAKTER - PROFIL, EDIT, DAN HAPUS
// =====================================================

const CHARACTER_SNAPSHOT_FIELDS = [
  "nama", "umur", "peran", "sifat", "latar_belakang",
  "hubungan", "tujuan", "rahasia", "catatan"
];

function resetFormKarakter() {
  editingCharacterId = null;
  editingCharacterBaseUpdatedAt = null;

  [
    "charName", "charAge", "charRole", "charTrait",
    "charBackground", "charRelationship", "charGoal",
    "charSecret", "charNotes"
  ].forEach(id => {
    if (el(id)) el(id).value = "";
  });

  const saveButton = el("addCharacterBtn");
  if (saveButton) saveButton.textContent = "＋ Simpan Karakter";

  const cancelButton = el("cancelCharacterEditBtn");
  if (cancelButton) cancelButton.hidden = true;
}

function mulaiEditKarakter(characterId) {
  const character = characterRecords.find(c => String(c.id) === String(characterId));
  if (!character) {
    msg("characterMessage", "Data karakter tidak ditemukan. Muat ulang daftar karakter.");
    return;
  }

  editingCharacterId = String(character.id);
  editingCharacterBaseUpdatedAt = character.updated_at || null;
  const values = {
    charName: character.nama,
    charAge: character.umur,
    charRole: character.peran,
    charTrait: character.sifat,
    charBackground: character.latar_belakang,
    charRelationship: character.hubungan,
    charGoal: character.tujuan,
    charSecret: character.rahasia,
    charNotes: character.catatan
  };

  Object.entries(values).forEach(([id, value]) => {
    if (el(id)) el(id).value = value ?? "";
  });

  const saveButton = el("addCharacterBtn");
  if (saveButton) saveButton.textContent = "💾 Simpan Perubahan";

  const cancelButton = el("cancelCharacterEditBtn");
  if (cancelButton) cancelButton.hidden = false;

  msg("characterMessage", `Sedang mengedit profil ${character.nama}.`);
  el("charName")?.focus();
  el("characterSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function hapusKarakter(characterId) {
  const character = characterRecords.find(c => String(c.id) === String(characterId));
  if (!character || !currentNovel || !currentUser) return;

  const confirmed = window.confirm(`Hapus karakter "${character.nama}" dari novel ini?`);
  if (!confirmed) return;

  msg("characterMessage", "Menghapus karakter...");

  const { error } = await supabase
    .from("novel_karakter")
    .delete()
    .eq("id", character.id)
    .eq("novel_id", currentNovel.id)
    .eq("user_id", currentUser.id);

  if (error) {
    msg("characterMessage", `Gagal menghapus karakter: ${error.message}`);
    return;
  }

  if (String(editingCharacterId) === String(character.id)) resetFormKarakter();
  msg("characterMessage", `Karakter ${character.nama} berhasil dihapus.`);
  await muatKarakter();
}

async function muatKarakter() {
  if (!currentNovel || !currentUser) return;

  const box = el("characterList");
  if (!box) return;

  box.innerHTML = '<div class="card">Memuat profil karakter...</div>';

  const { data, error } = await supabase
    .from("novel_karakter")
    .select("*")
    .eq("novel_id", currentNovel.id)
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: true });

  if (error) {
    characterRecords = [];
    box.innerHTML = `<div class="card">Gagal memuat karakter.<br><br>${escapeHTML(error.message)}</div>`;
    return;
  }

  characterRecords = Array.isArray(data) ? data : [];

  if (!characterRecords.length) {
    box.innerHTML = '<div class="card"><h3>Belum ada karakter</h3><p class="muted">Tambahkan tokoh utama, pendukung, dan antagonis beserta tujuan serta rahasianya.</p></div>';
    updateStoryBibleStatus();
    return;
  }

  box.innerHTML = characterRecords.map(c => `
    <article class="card character-profile-card">
      <div class="story-card-heading">
        <span>♙</span>
        <div>
          <h3>${escapeHTML(c.nama || "Tanpa nama")}</h3>
          <p>${escapeHTML(c.peran || "Peran belum diisi")}${c.umur ? ` · ${escapeHTML(c.umur)} tahun` : ""}</p>
        </div>
      </div>
      ${c.sifat ? `<p><strong>Sifat:</strong> ${escapeHTML(c.sifat)}</p>` : ""}
      ${c.latar_belakang ? `<p><strong>Latar belakang:</strong> ${escapeHTML(c.latar_belakang)}</p>` : ""}
      ${c.hubungan ? `<p><strong>Hubungan:</strong> ${escapeHTML(c.hubungan)}</p>` : ""}
      ${c.tujuan ? `<p><strong>Tujuan:</strong> ${escapeHTML(c.tujuan)}</p>` : ""}
      ${c.rahasia ? `<p><strong>Rahasia:</strong> ${escapeHTML(c.rahasia)}</p>` : ""}
      ${c.catatan ? `<p><strong>Catatan:</strong> ${escapeHTML(c.catatan)}</p>` : ""}
      <div class="character-card-actions">
        <button class="outline-btn" type="button" data-char-edit="${escapeHTML(c.id)}">✏️ Edit Profil</button>
        <button class="danger-btn" type="button" data-char-delete="${escapeHTML(c.id)}">🗑️ Hapus</button>
      </div>
    </article>
  `).join("");

  box.querySelectorAll("[data-char-edit]").forEach(button => {
    button.addEventListener("click", () => mulaiEditKarakter(button.dataset.charEdit));
  });

  box.querySelectorAll("[data-char-delete]").forEach(button => {
    button.addEventListener("click", () => hapusKarakter(button.dataset.charDelete));
  });

  updateStoryBibleStatus();
}

async function simpanKarakter() {
  if (!currentNovel || !currentUser) return;

  const nama = el("charName")?.value.trim() || "";
  if (!nama) {
    msg("characterMessage", "Nama karakter wajib diisi.");
    el("charName")?.focus();
    return;
  }

  const button = el("addCharacterBtn");
  if (button) button.disabled = true;
  msg("characterMessage", editingCharacterId ? "Memperbarui profil karakter..." : "Menyimpan karakter...");

  const payload = {
    novel_id: currentNovel.id,
    user_id: currentUser.id,
    nama,
    umur: el("charAge")?.value ? Number(el("charAge").value) : null,
    peran: el("charRole")?.value.trim() || "",
    sifat: el("charTrait")?.value.trim() || "",
    latar_belakang: el("charBackground")?.value.trim() || "",
    hubungan: el("charRelationship")?.value.trim() || "",
    tujuan: el("charGoal")?.value.trim() || "",
    rahasia: el("charSecret")?.value.trim() || "",
    catatan: el("charNotes")?.value.trim() || "",
    updated_at: new Date().toISOString()
  };

  try {
    let result;

    if (editingCharacterId) {
      let updateQuery = supabase
        .from("novel_karakter")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", editingCharacterId)
        .eq("novel_id", currentNovel.id)
        .eq("user_id", currentUser.id);

      if (editingCharacterBaseUpdatedAt) {
        updateQuery = updateQuery.eq("updated_at", editingCharacterBaseUpdatedAt);
      } else {
        updateQuery = updateQuery.is("updated_at", null);
      }

      result = await updateQuery.select().maybeSingle();
      if (!result.error && !result.data) {
        msg("characterMessage", "Konflik versi: profil ini sudah diubah atau dihapus dari perangkat lain. Perubahan lokal dipertahankan dan belum disimpan. Salin draf, batalkan edit, lalu buka ulang profil terbaru.");
        tampilkanInfoSinkronisasi("Penyimpanan profil diblokir agar perubahan perangkat lain tidak tertimpa.", "warning", 0);
        return;
      }
    } else {
      result = await supabase
        .from("novel_karakter")
        .insert(payload);
    }

    if (result.error) {
      msg("characterMessage", `Gagal menyimpan karakter: ${result.error.message}`);
      return;
    }
    if (editingCharacterId && !result.data) {
      msg("characterMessage", "Profil tidak lagi tersedia. Muat ulang daftar karakter sebelum menyimpan.");
      return;
    }

    const wasEditing = Boolean(editingCharacterId);
    resetFormKarakter();
    msg("characterMessage", wasEditing ? "Perubahan profil karakter berhasil disimpan." : "Karakter berhasil disimpan.");
    await muatKarakter();
  } catch (error) {
    msg("characterMessage", `Gagal menyimpan karakter: ${error.message || error}`);
  } finally {
    if (button) button.disabled = false;
  }
}


// =====================================================
// STORY BIBLE - SIMPANAN KANON NOVEL
// =====================================================

const STORY_BIBLE_FIELDS = [
  ["world_description", "bibleWorld", "Dunia cerita"],
  ["world_rules", "bibleRules", "Aturan dunia"],
  ["locations", "bibleLocations", "Lokasi penting"],
  ["factions", "bibleFactions", "Kelompok / organisasi"],
  ["relationships", "bibleRelationships", "Hubungan antartokoh"],
  ["timeline", "bibleTimeline", "Kronologi"],
  ["canon_facts", "bibleCanonFacts", "Fakta kanon"],
  ["secrets", "bibleSecrets", "Rahasia / misteri"],
  ["continuity_notes", "bibleContinuityNotes", "Catatan kontinuitas"]
];

function updateStoryBibleStatus() {
  const status = el("storyBibleStatus");
  if (!status) return;

  const filled = STORY_BIBLE_FIELDS.filter(([column, id]) => (el(id)?.value || "").trim()).length;
  const characters = characterRecords.length;
  status.textContent = `${filled} dari ${STORY_BIBLE_FIELDS.length} bagian Story Bible terisi · ${characters} profil karakter tersimpan. Catatan ini menjadi acuan saat AI menulis bab berikutnya.`;
}

async function muatStoryBible() {
  if (!currentNovel || !currentUser) return;

  msg("storyBibleMessage", "");
  const status = el("storyBibleStatus");
  if (status) status.textContent = "Memuat Story Bible...";

  const { data, error } = await supabase
    .from("novel_story_bible")
    .select("*")
    .eq("novel_id", currentNovel.id)
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Gagal memuat Story Bible:", error);
    if (status) status.textContent = "Tabel Story Bible belum siap. Jalankan file SQL setup dari paket PENA AI terlebih dahulu.";
    msg("storyBibleMessage", `Belum dapat memuat Story Bible: ${error.message}`);
    return;
  }

  storyBibleRecord = data || null;
  STORY_BIBLE_FIELDS.forEach(([column, id]) => {
    const field = el(id);
    if (field) field.value = storyBibleRecord?.[column] || "";
  });

  updateStoryBibleStatus();
}

async function simpanStoryBible() {
  if (!currentNovel || !currentUser) {
    msg("storyBibleMessage", "Buka sebuah novel terlebih dahulu.");
    return;
  }

  const button = el("saveStoryBibleBtn");
  if (button) button.disabled = true;
  msg("storyBibleMessage", "Menyimpan Story Bible...");

  const payload = {
    novel_id: currentNovel.id,
    user_id: currentUser.id,
    updated_at: new Date().toISOString()
  };

  STORY_BIBLE_FIELDS.forEach(([column, id]) => {
    payload[column] = el(id)?.value.trim() || "";
  });

  try {
    let data = null;
    let error = null;

    if (storyBibleRecord?.id) {
      let updateQuery = supabase
        .from("novel_story_bible")
        .update(payload)
        .eq("id", storyBibleRecord.id)
        .eq("novel_id", currentNovel.id)
        .eq("user_id", currentUser.id);

      if (storyBibleRecord.updated_at) {
        updateQuery = updateQuery.eq("updated_at", storyBibleRecord.updated_at);
      } else {
        updateQuery = updateQuery.is("updated_at", null);
      }

      ({ data, error } = await updateQuery.select().maybeSingle());
      if (!error && !data) {
        msg("storyBibleMessage", "Konflik versi: Story Bible sudah diubah atau dihapus dari perangkat lain. Isian lokal tetap dipertahankan dan belum disimpan. Salin draf lalu muat versi terbaru sebelum menggabungkan perubahan.");
        tampilkanInfoSinkronisasi("Penyimpanan Story Bible diblokir agar perubahan lain tidak tertimpa.", "warning", 0);
        return;
      }
    } else {
      // INSERT, bukan upsert: jika perangkat lain membuat dokumen pada saat bersamaan,
      // constraint unik akan menolak duplikasi tanpa menimpa isi perangkat lain.
      ({ data, error } = await supabase
        .from("novel_story_bible")
        .insert(payload)
        .select()
        .single());
    }

    if (error) throw error;

    storyBibleRecord = data;
    msg("storyBibleMessage", "Story Bible berhasil disimpan dan disinkronkan.");
    updateStoryBibleStatus();
  } catch (error) {
    console.error("Gagal menyimpan Story Bible:", error);
    msg("storyBibleMessage", `Gagal menyimpan Story Bible: ${error.message || error}. Pastikan SQL setup sudah dijalankan di Supabase.`);
  } finally {
    if (button) button.disabled = false;
  }
}

// =====================================================
// GAYA NOVEL
// =====================================================

function muatGaya() {

  if (!currentNovel) {
    return;
  }

  styleBaseUpdatedAt = currentNovel.updated_at || null;


  if (el("styleGenre")) {

    el("styleGenre").value =
      currentNovel.genre ||
      "Drama";

  }


  if (el("styleWriting")) {

    el("styleWriting").value =
      currentNovel.gaya ||
      "Natural";

  }


  if (el("styleMood")) {

    el("styleMood").value =
      currentNovel.nuansa ||
      "Emosional";

  }


  if (el("styleMode")) {

    el("styleMode").value =
      currentNovel.mode ||
      "Normal";

  }
}


// =====================================================
// SIMPAN GAYA
// =====================================================

async function simpanGaya() {

  if (
    !currentNovel ||
    !currentUser
  ) {
    return;
  }


  const button =
    el("saveStyleBtn");


  if (button) {
    button.disabled = true;
  }


  try {

    let updateQuery = supabase
      .from("novel")
      .update({
        genre: el("styleGenre")?.value || "Drama",
        gaya: el("styleWriting")?.value || "Natural",
        nuansa: el("styleMood")?.value || "Emosional",
        mode: el("styleMode")?.value || "Normal",
        updated_at: new Date().toISOString()
      })
      .eq("id", currentNovel.id)
      .eq("user_id", currentUser.id);

    if (styleBaseUpdatedAt) {
      updateQuery = updateQuery.eq("updated_at", styleBaseUpdatedAt);
    } else {
      updateQuery = updateQuery.is("updated_at", null);
    }

    const { data, error } = await updateQuery.select().maybeSingle();

    if (error) {
      msg("styleMessage", "Gagal menyimpan gaya: " + error.message);
      return;
    }
    if (!data) {
      msg("styleMessage", "Konflik versi: pengaturan novel sudah berubah di perangkat lain. Pilihan lokal belum disimpan. Muat ulang pengaturan terbaru sebelum mencoba lagi.");
      tampilkanInfoSinkronisasi("Penyimpanan gaya diblokir agar pengaturan perangkat lain tidak tertimpa.", "warning", 0);
      return;
    }

    currentNovel = data;
    styleBaseUpdatedAt = data.updated_at || null;


    if (el("detailInfo")) {

      el("detailInfo").textContent =
        `${data.genre || "Drama"} · ` +
        `${data.gaya || "Natural"} · ` +
        `${data.nuansa || "Emosional"} · ` +
        `Bab ${data.bab_selesai || 0}`;

    }


    msg(
      "styleMessage",
      "Gaya novel berhasil disimpan."
    );

  } catch (error) {

    msg(
      "styleMessage",
      "Gagal menyimpan gaya: " +
      (
        error.message ||
        error
      )
    );

  } finally {

    if (button) {
      button.disabled = false;
    }

  }
}


// =====================================================
// AI WRITER
// =====================================================

async function tulisCepat() {

  const promptText =
    el("prompt")?.value.trim() ||
    "";


  if (!promptText) {

    msg(
      "writeMessage",
      "Masukkan ide tulisan dahulu."
    );

    return;
  }


  const button =
    el("writeBtn");


  if (button) {
    button.disabled = true;
  }


  msg(
    "writeMessage",
    "PENA AI sedang menulis..."
  );


  try {

    const {
      data,
      error:
        sessionError
    } =
      await supabase.auth.getSession();


    if (sessionError) {
      throw new Error(
        sessionError.message
      );
    }


    const token =
      data.session?.access_token;


    if (!token) {

      throw new Error(
        "Silakan login kembali."
      );

    }


    const response =
      await fetch(
        WORKER_URL,
        {

          method:
            "POST",

          headers:
            {

              "Content-Type":
                "application/json",

              "Authorization":
                `Bearer ${token}`

            },

          body:
            JSON.stringify({

              action:
                "write",

              novel_id:
                currentNovel?.id ||
                null,

              judul:
                el("title")?.value.trim() ||
                currentNovel?.judul ||
                "Tulisan Baru",

              prompt:
                promptText,

              jenis:
                "Novel",

              genre:
                currentNovel?.genre ||
                "",

              gaya:
                currentNovel?.gaya ||
                "",

              nuansa:
                currentNovel?.nuansa ||
                "",

              premis:
                currentNovel?.premis ||
                ""

            })

        }
      );


    let result;


    try {

      result =
        await response.json();

    } catch {

      throw new Error(
        `Backend mengirim response yang tidak valid. Status server: ${response.status}`
      );

    }


    if (
      !response.ok ||
      !result ||
      !result.success
    ) {

      throw new Error(
        result?.error ||
        result?.message ||
        `Gagal membuat tulisan. Status server: ${response.status}`
      );

    }


    const hasilTulisan =
      result.hasil_tulisan ||
      result.text ||
      result.content ||
      "";


    if (
      !String(
        hasilTulisan
      ).trim()
    ) {

      throw new Error(
        "AI berhasil merespons, tetapi hasil tulisan kosong."
      );

    }


    if (el("result")) {

      el("result").textContent =
        hasilTulisan;

    }


    msg(
      "writeMessage",
      "Tulisan berhasil dibuat dan disimpan."
    );

  } catch (error) {

    console.error(
      "PENA AI error:",
      error
    );


    msg(
      "writeMessage",
      error.message ||
      "Terjadi kesalahan saat membuat tulisan."
    );

  } finally {

    if (button) {
      button.disabled = false;
    }

  }
}


// =====================================================
// COPY HASIL AI
// =====================================================

async function copyResult() {

  const text =
    el("result")?.textContent.trim() ||
    "";


  if (!text) {

    msg(
      "writeMessage",
      "Belum ada tulisan."
    );

    return;
  }


  try {

    await navigator.clipboard.writeText(
      text
    );


    msg(
      "writeMessage",
      "Tulisan berhasil disalin."
    );

  } catch {

    msg(
      "writeMessage",
      "Gagal menyalin tulisan."
    );

  }
}


// =====================================================
// PINTASAN MODE CERITA DARI DASHBOARD
// =====================================================

function bukaTabGaya() {
  bukaHalaman("detailPage");

  document.querySelectorAll(".detailContent").forEach(section => {
    section.hidden = section.id !== "styleSection";
  });

  document.querySelectorAll(".detailTab").forEach(tab => {
    tab.classList.toggle(
      "active",
      tab.dataset.detail === "styleSection"
    );
  });

  muatGaya();
  scrollKeAtas();
}

async function gunakanPintasanMode(modePilihan) {
  if (!currentUser) {
    alert("Silakan login terlebih dahulu.");
    return;
  }

  if (!currentNovel) {
    await muatNovel();
    bukaHalaman("novelPage");
    alert(
      "Buka novel yang ingin kamu atur terlebih dahulu. Setelah masuk ke novel, kembali ke Beranda dan pilih pintasan Mode Cerita."
    );
    return;
  }

  bukaTabGaya();

  if (modePilihan === "romansa") {
    if (el("styleGenre")) el("styleGenre").value = "Romansa";
    if (el("styleMood")) el("styleMood").value = "Romantis";
    msg(
      "styleMessage",
      `Genre Romansa dan nuansa Romantis sudah dipilih untuk novel “${currentNovel.judul || "tanpa judul"}”. Periksa pilihan, lalu klik Simpan Gaya.`
    );
    return;
  }

  if (modePilihan === "dewasa") {
    if (el("styleMode")) el("styleMode").value = "Dewasa 18+";
    msg(
      "styleMessage",
      `Mode Dewasa 18+ sudah dipilih untuk novel “${currentNovel.judul || "tanpa judul"}”. Pastikan seluruh karakter romantis berusia 18 tahun ke atas, lalu klik Simpan Gaya.`
    );
  }
}


// =====================================================
// EVENT
// =====================================================

function pasangEvent() {

  const events = {

    loginBtn:
      login,

    signupBtn:
      daftar,

    logoutBtn:
      logout,

    newNovelBtn:
      buatNovel,

    newNovelFromHome:
      buatNovel,

    writeNextChapter:
      tulisBab,

    addCharacterBtn:
      simpanKarakter,

    cancelCharacterEditBtn:
      async () => {
        resetFormKarakter();
        await muatKarakter();
      },

    saveStoryBibleBtn:
      simpanStoryBible,

    saveStyleBtn:
      simpanGaya,

    modeRomanceShortcut:
      () => gunakanPintasanMode("romansa"),

    modeAdultShortcut:
      () => gunakanPintasanMode("dewasa"),

    writeBtn:
      tulisCepat,

    copyResult:
      copyResult

  };


  Object.entries(events)
    .forEach(
      ([id, handler]) => {

        const node =
          el(id);


        if (node) {
          node.onclick =
            handler;
        }

      }
    );


  // ===================================================
  // MENU UTAMA
  // ===================================================

  document
    .querySelectorAll(
      ".menuBtn"
    )
    .forEach(btn => {

      btn.onclick =
        async () => {

          const page =
            btn.dataset.page;


          bukaHalaman(
            page
          );


          if (
            page ===
            "homePage"
          ) {

            await muatBeranda();

          }


          if (
            page ===
            "novelPage"
          ) {

            await muatNovel();

          }

        };

    });


  // ===================================================
  // PINTASAN TOMBOL DASHBOARD
  // ===================================================

  document.querySelectorAll("[data-page-jump]").forEach(button => {
    button.onclick = async () => {
      const page = button.dataset.pageJump;
      bukaHalaman(page);
      if (page === "novelPage") await muatNovel();
      if (page === "homePage") await muatBeranda();
      if (page === "writePage") scrollKeAtas();
    };
  });


  // ===================================================
  // TAB DETAIL NOVEL
  // ===================================================

  document
    .querySelectorAll(
      ".detailTab"
    )
    .forEach(btn => {

      btn.onclick =
        () => {

          document
            .querySelectorAll(
              ".detailContent"
            )
            .forEach(x => {

              x.hidden =
                true;

            });


          document
            .querySelectorAll(
              ".detailTab"
            )
            .forEach(x => {

              x.classList.remove(
                "active"
              );

            });


          const target =
            el(
              btn.dataset.detail
            );


          if (target) {
            target.hidden =
              false;
          }


          btn.classList.add(
            "active"
          );

        };

    });
}


// =====================================================
// MULAI APLIKASI
// =====================================================

async function mulai() {

  try {

    pasangEvent();


    const {
      data,
      error
    } =
      await supabase.auth.getSession();


    if (error) {

      console.error(
        "Session error:",
        error
      );

      tampilkanLogin();

      return;
    }


    if (data.session) {

      currentUser =
        data.session.user;


      tampilkanStudio();


      await muatBeranda();

      await muatNovel();

    } else {

      tampilkanLogin();

    }

  } catch (error) {

    console.error(
      "PENA AI startup error:",
      error
    );

    tampilkanLogin();
  }
}


// =====================================================
// START
// =====================================================

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    mulai
  );

} else {

  mulai();

}


// =====================================================
// GLOBAL
// =====================================================

window.bukaNovel =
  bukaNovel;

window.buatNovel =
  buatNovel;

window.tulisCepat =
  tulisCepat;

window.tulisBab =
  tulisBab;
