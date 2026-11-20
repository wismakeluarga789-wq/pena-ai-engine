import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://qyeiwnwekqwhxwwbwyfq.supabase.co";
const SUPABASE_KEY = "sb_publishable_fjFOriVPPgI6_pFhIAurCw_jNwuX_kj";
const WORKER_URL = "https://pena-ai-backend-groq.wismakeluarga789.workers.dev";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentNovel = null;

function el(id) {
  return document.getElementById(id);
}

function msg(id, text) {
  const x = el(id);
  if (x) x.textContent = text || "";
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
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

/* =====================================================
   LOGIN / STUDIO
===================================================== */

function tampilkanStudio() {
  if (el("authSection")) el("authSection").hidden = true;
  if (el("studioSection")) el("studioSection").hidden = false;
}

function tampilkanLogin() {
  if (el("authSection")) el("authSection").hidden = false;
  if (el("studioSection")) el("studioSection").hidden = true;
}

function bukaHalaman(id) {
  document.querySelectorAll(".page").forEach(page => {
    page.hidden = true;
  });

  const page = el(id);
  if (page) page.hidden = false;

  document.querySelectorAll(".menuBtn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === id);
  });
}

/* =====================================================
   LOGIN
===================================================== */

async function login() {
  msg("authMessage", "Sedang masuk...");

  const email = el("email")?.value.trim() || "";
  const password = el("password")?.value || "";

  if (!email || !password) {
    msg("authMessage", "Email dan password wajib diisi.");
    return;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      msg("authMessage", error.message);
      return;
    }

    currentUser = data.user;
    tampilkanStudio();
    await muatBeranda();
    await muatNovel();
  } catch (error) {
    console.error("Login error:", error);
    msg("authMessage", error.message || "Gagal masuk.");
  }
}

async function daftar() {
  msg("authMessage", "Sedang mendaftarkan akun...");

  const email = el("email")?.value.trim() || "";
  const password = el("password")?.value || "";

  if (!email || !password) {
    msg("authMessage", "Email dan password wajib diisi.");
    return;
  }

  if (password.length < 6) {
    msg("authMessage", "Password minimal 6 karakter.");
    return;
  }

  try {
    const { error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) {
      msg("authMessage", error.message);
      return;
    }

    msg(
      "authMessage",
      "Pendaftaran berhasil. Periksa email jika konfirmasi diminta."
    );
  } catch (error) {
    console.error("Signup error:", error);
    msg("authMessage", error.message || "Gagal mendaftarkan akun.");
  }
}

async function logout() {
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.error("Logout error:", error);
  }

  currentUser = null;
  currentNovel = null;
  tampilkanLogin();
}

/* =====================================================
   BERANDA
===================================================== */

async function muatBeranda() {
  if (!currentUser) return;

  const novelCount = await supabase
    .from("novel")
    .select("*", { count: "exact", head: true })
    .eq("user_id", currentUser.id);

  const babCount = await supabase
    .from("novel_bab")
    .select("*", { count: "exact", head: true })
    .eq("user_id", currentUser.id);

  if (el("totalNovel")) {
    el("totalNovel").textContent = novelCount.count || 0;
  }

  if (el("totalBab")) {
    el("totalBab").textContent = babCount.count || 0;
  }
}

/* =====================================================
   BUAT NOVEL
===================================================== */

async function buatNovel() {
  if (!currentUser) {
    alert("Silakan login terlebih dahulu.");
    return;
  }

  const judul = window.prompt("Judul novel:");
  if (!judul || !judul.trim()) return;

  const genre =
    window.prompt("Genre novel:", "Drama") || "Drama";

  const premis =
    window.prompt("Premis singkat cerita:", "") || "";

  try {
    const { data, error } = await supabase
      .from("novel")
      .insert({
        user_id: currentUser.id,
        judul: judul.trim(),
        genre: genre.trim(),
        gaya: "Natural",
        nuansa: "Emosional",
        mode: "Normal",
        premis: premis.trim(),
        target_bab: 100,
        bab_selesai: 0,
        status: "aktif"
      })
      .select()
      .single();

    if (error) {
      alert("Gagal membuat novel:\n\n" + error.message);
      return;
    }

    currentNovel = data;
    await muatBeranda();
    await bukaNovel(data.id);
  } catch (error) {
    alert("Gagal membuat novel:\n\n" + (error.message || error));
  }
}

/* =====================================================
   DAFTAR NOVEL
===================================================== */

async function muatNovel() {
  if (!currentUser) return;

  const box = el("novelList");
  if (!box) return;

  box.innerHTML = `<div class="card">Memuat novel...</div>`;

  const { data, error } = await supabase
    .from("novel")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("updated_at", { ascending: false });

  if (error) {
    box.innerHTML = `
      <div class="card">
        Gagal memuat novel.<br><br>
        ${escapeHTML(error.message)}
      </div>
    `;
    return;
  }

  if (!data || data.length === 0) {
    box.innerHTML = `
      <div class="card">
        <h3>Belum ada novel</h3>
        <p>Buat novel pertama kamu dan mulai menulis.</p>
        <button id="emptyCreateNovel">+ Buat Novel Baru</button>
      </div>
    `;

    const emptyBtn = el("emptyCreateNovel");
    if (emptyBtn) emptyBtn.onclick = buatNovel;
    return;
  }

  box.innerHTML = data.map(novel => `
    <div class="card">
      <h3>${escapeHTML(novel.judul)}</h3>
      <p>
        ${escapeHTML(novel.genre || "Drama")}
        ·
        ${escapeHTML(novel.gaya || "Natural")}
      </p>
      <p>
        Bab ${novel.bab_selesai || 0}
        dari ${novel.target_bab || 100}
      </p>
      <button class="openNovelButton" data-id="${novel.id}">
        Buka Novel
      </button>
    </div>
  `).join("");

  document.querySelectorAll(".openNovelButton").forEach(button => {
    button.onclick = () => bukaNovel(button.dataset.id);
  });
}

/* =====================================================
   BUKA NOVEL
===================================================== */

async function bukaNovel(id) {
  if (!currentUser) return;

  const { data, error } = await supabase
    .from("novel")
    .select("*")
    .eq("id", id)
    .eq("user_id", currentUser.id)
    .single();

  if (error) {
    alert("Gagal membuka novel:\n\n" + error.message);
    return;
  }

  currentNovel = data;

  if (el("detailTitle")) {
    el("detailTitle").textContent = data.judul || "-";
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
      data.premis || "Belum ada premis.";
  }

  bukaHalaman("detailPage");

  await muatBab();
  await muatKarakter();
  muatGaya();
}

/* =====================================================
   BAB
===================================================== */

async function muatBab() {
  if (!currentNovel || !currentUser) return;

  const box = el("chapterList");
  if (!box) return;

  box.innerHTML = `<div class="card">Memuat bab...</div>`;

  const { data, error } = await supabase
    .from("novel_bab")
    .select("*")
    .eq("novel_id", currentNovel.id)
    .eq("user_id", currentUser.id)
    .order("nomor_bab", { ascending: true });

  if (error) {
    box.innerHTML = `
      <div class="card">
        Gagal memuat bab.<br><br>
        ${escapeHTML(error.message)}
      </div>
    `;
    return;
  }

  if (!data || data.length === 0) {
    box.innerHTML = `
      <div class="card">
        <h3>Belum ada bab</h3>
        <p>Klik "Tulis Bab Berikutnya" untuk memulai cerita.</p>
      </div>
    `;
    return;
  }

  box.innerHTML = data.map(bab => `
    <article class="card">
      <h3>
        Bab ${bab.nomor_bab}
        ${bab.judul_bab
          ? " — " + escapeHTML(bab.judul_bab)
          : ""}
      </h3>

      <p>${tanggal(bab.created_at)}</p>

      <div class="chapter-text">
        ${escapeHTML(bab.isi_bab || "").replace(/\n/g, "<br><br>")}
      </div>
    </article>
  `).join("");
}

/* =====================================================
   TULIS BAB
===================================================== */

async function tulisBab() {
  if (!currentNovel) {
    msg("chapterMessage", "Novel belum dipilih.");
    return;
  }

  const button = el("writeNextChapter");
  if (button) button.disabled = true;

  msg(
    "chapterMessage",
    "PENA AI sedang menulis bab berikutnya..."
  );

  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      throw new Error("Sesi login sudah berakhir.");
    }

    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        action: "write_chapter",
        novel_id: Number(currentNovel.id)
      })
    });

    let result = null;

    try {
      result = await response.json();
    } catch {
      throw new Error(
        `Backend mengirim response tidak valid. Status server: ${response.status}`
      );
    }

    if (!response.ok || !result?.success) {
      throw new Error(
        result?.error ||
        `Gagal menulis bab. Status server: ${response.status}`
      );
    }

    msg(
      "chapterMessage",
      "Bab berhasil ditulis dan disimpan."
    );

    await bukaNovel(currentNovel.id);
    await muatBeranda();

  } catch (error) {
    console.error("PENA AI chapter error:", error);
    msg(
      "chapterMessage",
      error.message || "Gagal menulis bab."
    );
  } finally {
    if (button) button.disabled = false;
  }
}

/* =====================================================
   KARAKTER
===================================================== */

async function muatKarakter() {
  if (!currentNovel || !currentUser) return;

  const box = el("characterList");
  if (!box) return;

  const { data, error } = await supabase
    .from("novel_karakter")
    .select("*")
    .eq("novel_id", currentNovel.id)
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: true });

  if (error) {
    box.innerHTML = `
      <div class="card">
        Gagal memuat karakter.<br><br>
        ${escapeHTML(error.message)}
      </div>
    `;
    return;
  }

  if (!data || data.length === 0) {
    box.innerHTML = `
      <div class="card">
        Belum ada karakter.
      </div>
    `;
    return;
  }

  box.innerHTML = data.map(c => `
    <div class="card">
      <h3>${escapeHTML(c.nama)}</h3>

      ${c.umur ? `<p>Umur: ${c.umur}</p>` : ""}
      ${c.peran ? `<p>${escapeHTML(c.peran)}</p>` : ""}
      ${c.sifat ? `<p>${escapeHTML(c.sifat)}</p>` : ""}
      ${c.latar_belakang
        ? `<p>${escapeHTML(c.latar_belakang)}</p>`
        : ""}
    </div>
  `).join("");
}

async function simpanKarakter() {
  if (!currentNovel || !currentUser) return;

  const nama = el("charName")?.value.trim() || "";

  if (!nama) {
    msg("characterMessage", "Nama karakter wajib diisi.");
    return;
  }

  const button = el("addCharacterBtn");
  if (button) button.disabled = true;

  msg("characterMessage", "Menyimpan karakter...");

  try {
    const { error } = await supabase
      .from("novel_karakter")
      .insert({
        novel_id: currentNovel.id,
        user_id: currentUser.id,
        nama,
        umur: el("charAge")?.value
          ? Number(el("charAge").value)
          : null,
        peran: el("charRole")?.value.trim() || "",
        sifat: el("charTrait")?.value.trim() || "",
        latar_belakang:
          el("charBackground")?.value.trim() || ""
      });

    if (error) {
      msg(
        "characterMessage",
        "Gagal menyimpan karakter: " + error.message
      );
      return;
    }

    ["charName", "charAge", "charRole", "charTrait", "charBackground"]
      .forEach(id => {
        if (el(id)) el(id).value = "";
      });

    msg(
      "characterMessage",
      "Karakter berhasil disimpan."
    );

    await muatKarakter();

  } catch (error) {
    msg(
      "characterMessage",
      "Gagal menyimpan karakter: " +
      (error.message || error)
    );
  } finally {
    if (button) button.disabled = false;
  }
}

/* =====================================================
   GAYA
===================================================== */

function muatGaya() {
  if (!currentNovel) return;

  if (el("styleGenre")) {
    el("styleGenre").value =
      currentNovel.genre || "Drama";
  }

  if (el("styleWriting")) {
    el("styleWriting").value =
      currentNovel.gaya || "Natural";
  }

  if (el("styleMood")) {
    el("styleMood").value =
      currentNovel.nuansa || "Emosional";
  }

  if (el("styleMode")) {
    el("styleMode").value =
      currentNovel.mode || "Normal";
  }
}

async function simpanGaya() {
  if (!currentNovel || !currentUser) return;

  const button = el("saveStyleBtn");
  if (button) button.disabled = true;

  try {
    const { data, error } = await supabase
      .from("novel")
      .update({
        genre: el("styleGenre")?.value || "Drama",
        gaya: el("styleWriting")?.value || "Natural",
        nuansa: el("styleMood")?.value || "Emosional",
        mode: el("styleMode")?.value || "Normal",
        updated_at: new Date().toISOString()
      })
      .eq("id", currentNovel.id)
      .eq("user_id", currentUser.id)
      .select()
      .single();

    if (error) {
      msg(
        "styleMessage",
        "Gagal menyimpan gaya: " + error.message
      );
      return;
    }

    currentNovel = data;

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
      (error.message || error)
    );
  } finally {
    if (button) button.disabled = false;
  }
}

/* =====================================================
   TULIS CEPAT
===================================================== */

async function tulisCepat() {
  const promptText = el("prompt")?.value.trim() || "";

  if (!promptText) {
    msg("writeMessage", "Masukkan ide tulisan dahulu.");
    return;
  }

  const button = el("writeBtn");
  if (button) button.disabled = true;

  msg("writeMessage", "PENA AI sedang menulis...");

  try {
    const { data, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) {
      throw new Error(sessionError.message);
    }

    const token = data.session?.access_token;

    if (!token) {
      throw new Error("Silakan login kembali.");
    }

    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        action: "write",
        judul:
          el("title")?.value.trim() ||
          "Tulisan Baru",
        prompt: promptText,
        jenis: "Novel"
      })
    });

    /*
      BODY RESPONSE HANYA DIBACA SEKALI.
      Jangan panggil response.json(), response.text(),
      atau response.blob() lagi setelah bagian ini.
    */
    let result;

    try {
      result = await response.json();
    } catch (parseError) {
      throw new Error(
        `Backend mengirim response yang tidak valid. Status server: ${response.status}`
      );
    }

    if (!response.ok || !result || !result.success) {
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

    if (!String(hasilTulisan).trim()) {
      throw new Error(
        "AI berhasil merespons, tetapi hasil tulisan kosong."
      );
    }

    if (el("result")) {
      el("result").textContent = hasilTulisan;
    }

    msg(
      "writeMessage",
      "Tulisan berhasil dibuat dan disimpan."
    );

  } catch (error) {
    console.error("PENA AI error:", error);

    msg(
      "writeMessage",
      error.message ||
      "Terjadi kesalahan saat membuat tulisan."
    );

  } finally {
    if (button) button.disabled = false;
  }
}

/* =====================================================
   COPY
===================================================== */

async function copyResult() {
  const text = el("result")?.textContent.trim() || "";

  if (!text) {
    msg("writeMessage", "Belum ada tulisan.");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    msg("writeMessage", "Tulisan berhasil disalin.");
  } catch {
    msg("writeMessage", "Gagal menyalin tulisan.");
  }
}

/* =====================================================
   PASANG EVENT
===================================================== */

function pasangEvent() {
  const events = {
    loginBtn: login,
    signupBtn: daftar,
    logoutBtn: logout,
    newNovelBtn: buatNovel,
    newNovelFromHome: buatNovel,
    writeNextChapter: tulisBab,
    addCharacterBtn: simpanKarakter,
    saveStyleBtn: simpanGaya,
    writeBtn: tulisCepat,
    copyResult: copyResult
  };

  Object.entries(events).forEach(([id, handler]) => {
    const node = el(id);
    if (node) node.onclick = handler;
  });

  document.querySelectorAll(".menuBtn").forEach(btn => {
    btn.onclick = async () => {
      const page = btn.dataset.page;
      bukaHalaman(page);

      if (page === "homePage") {
        await muatBeranda();
      }

      if (page === "novelPage") {
        await muatNovel();
      }
    };
  });

  document.querySelectorAll(".detailTab").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".detailContent").forEach(x => {
        x.hidden = true;
      });

      document.querySelectorAll(".detailTab").forEach(x => {
        x.classList.remove("active");
      });

      const target = el(btn.dataset.detail);

      if (target) {
        target.hidden = false;
      }

      btn.classList.add("active");
    };
  });
}

/* =====================================================
   START
===================================================== */

async function mulai() {
  try {
    pasangEvent();

    const { data, error } =
      await supabase.auth.getSession();

    if (error) {
      console.error("Session error:", error);
      tampilkanLogin();
      return;
    }

    if (data.session) {
      currentUser = data.session.user;

      tampilkanStudio();

      await muatBeranda();
      await muatNovel();
    } else {
      tampilkanLogin();
    }
  } catch (error) {
    console.error("PENA AI startup error:", error);
    tampilkanLogin();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mulai);
} else {
  mulai();
}

/* =====================================================
   GLOBAL
===================================================== */

window.bukaNovel = bukaNovel;
window.buatNovel = buatNovel;
window.tulisCepat = tulisCepat;
window.tulisBab = tulisBab;
