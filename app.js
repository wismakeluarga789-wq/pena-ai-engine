import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://qyeiwnwekqwhxwwbwyfq.supabase.co";
const SUPABASE_KEY = "sb_publishable_fjFOriVPPgI6_pFhIAurCw_jNwuX_kj";

const WORKER_URL =
  "https://pena-ai-backend-groq.wismakeluarga789.workers.dev";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let currentUser = null;
let currentNovel = null;


/* =====================================================
   HELPER
===================================================== */

const el = (id) => document.getElementById(id);

function setMessage(id, text) {
  const target = el(id);
  if (target) target.textContent = text || "";
}

function formatTanggal(value) {
  if (!value) return "-";

  const d = new Date(value);

  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function escapeHTML(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function tampilkanStudio() {
  el("authSection").hidden = true;
  el("studioSection").hidden = false;
}

function tampilkanLogin() {
  el("authSection").hidden = false;
  el("studioSection").hidden = true;
}

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.hidden = true;
  });

  const page = el(pageId);

  if (page) {
    page.hidden = false;
  }

  document.querySelectorAll(".menuBtn").forEach(btn => {
    btn.classList.toggle(
      "active",
      btn.dataset.page === pageId
    );
  });
}


/* =====================================================
   LOGIN
===================================================== */

el("loginBtn").onclick = async () => {

  setMessage("authMessage", "Sedang masuk...");

  const email = el("email").value.trim();
  const password = el("password").value;

  if (!email || !password) {
    setMessage(
      "authMessage",
      "Email dan password wajib diisi."
    );
    return;
  }

  const { data, error } =
    await supabase.auth.signInWithPassword({
      email,
      password
    });

  if (error) {
    setMessage("authMessage", error.message);
    return;
  }

  currentUser = data.user;

  setMessage("authMessage", "");

  tampilkanStudio();

  await muatBeranda();
  await muatNovel();
};


el("signupBtn").onclick = async () => {

  setMessage(
    "authMessage",
    "Sedang mendaftarkan akun..."
  );

  const email = el("email").value.trim();
  const password = el("password").value;

  if (!email || !password) {
    setMessage(
      "authMessage",
      "Email dan password wajib diisi."
    );
    return;
  }

  if (password.length < 6) {
    setMessage(
      "authMessage",
      "Password minimal 6 karakter."
    );
    return;
  }

  const { error } =
    await supabase.auth.signUp({
      email,
      password
    });

  if (error) {
    setMessage("authMessage", error.message);
    return;
  }

  setMessage(
    "authMessage",
    "Pendaftaran berhasil. Periksa email jika konfirmasi diminta."
  );
};


el("logoutBtn").onclick = async () => {

  await supabase.auth.signOut();

  currentUser = null;
  currentNovel = null;

  tampilkanLogin();

  setMessage(
    "authMessage",
    "Anda sudah keluar."
  );
};


/* =====================================================
   MENU
===================================================== */

document.querySelectorAll(".menuBtn").forEach(btn => {

  btn.onclick = async () => {

    const page = btn.dataset.page;

    showPage(page);

    if (page === "homePage") {
      await muatBeranda();
    }

    if (page === "novelPage") {
      await muatNovel();
    }
  };

});


/* =====================================================
   BERANDA
===================================================== */

async function muatBeranda() {

  if (!currentUser) return;

  const { count: totalNovel } =
    await supabase
      .from("novel")
      .select("*", {
        count: "exact",
        head: true
      })
      .eq("user_id", currentUser.id);

  const { count: totalBab } =
    await supabase
      .from("novel_bab")
      .select("*", {
        count: "exact",
        head: true
      })
      .eq("user_id", currentUser.id);

  el("totalNovel").textContent =
    totalNovel || 0;

  el("totalBab").textContent =
    totalBab || 0;
}


/* =====================================================
   NOVEL
===================================================== */

async function muatNovel() {

  if (!currentUser) return;

  const container = el("novelList");

  container.innerHTML =
    `<div class="card">Memuat novel...</div>`;

  const { data, error } =
    await supabase
      .from("novel")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("updated_at", {
        ascending: false
      });

  if (error) {
    container.innerHTML = `
      <div class="card">
        Gagal memuat novel.<br>
        ${escapeHTML(error.message)}
      </div>
    `;
    return;
  }

  if (!data || data.length === 0) {

    container.innerHTML = `
      <div class="card">
        <h3>Belum ada novel</h3>

        <p>
          Buat novel pertama kamu dan
          mulai bangun ceritanya bab demi bab.
        </p>

        <button onclick="buatNovelBaru()">
          + Buat Novel Baru
        </button>
      </div>
    `;

    return;
  }

  container.innerHTML = data.map(novel => {

    const progress =
      novel.target_bab > 0
        ? Math.round(
            (novel.bab_selesai / novel.target_bab) * 100
          )
        : 0;

    return `
      <div
        class="card novel-card"
        data-id="${novel.id}">

        <h3>
          ${escapeHTML(novel.judul)}
        </h3>

        <p>
          ${escapeHTML(novel.genre || "Drama")}
          ·
          ${escapeHTML(novel.gaya || "Natural")}
        </p>

        <p>
          ${escapeHTML(
            novel.nuansa || "Emosional"
          )}
        </p>

        <p>
          Bab ${novel.bab_selesai || 0}
          dari ${novel.target_bab || 0}
        </p>

        <p>
          ${progress}% selesai
        </p>

        <button
          onclick="bukaNovel(${novel.id})">
          Buka Novel
        </button>

      </div>
    `;

  }).join("");
}


/* =====================================================
   BUAT NOVEL BARU
===================================================== */

async function buatNovelBaru() {

  const judul =
    prompt("Judul novel:");

  if (!judul || !judul.trim()) {
    return;
  }

  const genre =
    prompt(
      "Genre novel:",
      "Drama"
    ) || "Drama";

  const premis =
    prompt(
      "Premis singkat cerita:",
      ""
    ) || "";

  const { data, error } =
    await supabase
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

    alert(
      "Gagal membuat novel:\n\n" +
      error.message
    );

    return;
  }

  currentNovel = data;

  await muatBeranda();

  await bukaNovel(data.id);
}


/* =====================================================
   TOMBOL NOVEL BARU
===================================================== */

el("newNovelBtn").onclick =
  buatNovelBaru;

el("newNovelFromHome").onclick =
  buatNovelBaru;


/* =====================================================
   BUKA NOVEL
===================================================== */

async function bukaNovel(id) {

  const { data, error } =
    await supabase
      .from("novel")
      .select("*")
      .eq("id", id)
      .eq("user_id", currentUser.id)
      .single();

  if (error) {

    alert(
      "Gagal membuka novel:\n\n" +
      error.message
    );

    return;
  }

  currentNovel = data;

  el("detailTitle").textContent =
    data.judul || "-";

  el("detailInfo").textContent =
    `${data.genre || "Drama"} · ` +
    `${data.gaya || "Natural"} · ` +
    `${data.nuansa || "Emosional"} · ` +
    `Bab ${data.bab_selesai || 0}`;

  el("detailPremise").textContent =
    data.premis || "Belum ada premis.";

  showPage("detailPage");

  await muatBab();
  await muatKarakter();
  muatGaya();
}


/* =====================================================
   KEMBALI
===================================================== */

el("backToNovels").onclick =
  async () => {

    currentNovel = null;

    showPage("novelPage");

    await muatNovel();
  };


/* =====================================================
   TAB DETAIL
===================================================== */

document.querySelectorAll(".detailTab")
  .forEach(btn => {

    btn.onclick = () => {

      document
        .querySelectorAll(".detailContent")
        .forEach(section => {
          section.hidden = true;
        });

      document
        .querySelectorAll(".detailTab")
        .forEach(tab => {
          tab.classList.remove("active");
        });

      const target =
        el(btn.dataset.detail);

      if (target) {
        target.hidden = false;
      }

      btn.classList.add("active");
    };

  });


/* =====================================================
   MUAT BAB
===================================================== */

async function muatBab() {

  if (!currentNovel) return;

  const container =
    el("chapterList");

  container.innerHTML =
    `<div class="card">Memuat bab...</div>`;

  const { data, error } =
    await supabase
      .from("novel_bab")
      .select("*")
      .eq("novel_id", currentNovel.id)
      .eq("user_id", currentUser.id)
      .order("nomor_bab", {
        ascending: true
      });

  if (error) {

    container.innerHTML = `
      <div class="card">
        Gagal memuat bab.<br>
        ${escapeHTML(error.message)}
      </div>
    `;

    return;
  }

  if (!data || data.length === 0) {

    container.innerHTML = `
      <div class="card">
        <h3>Belum ada bab</h3>

        <p>
          Klik tombol "Tulis Bab Berikutnya"
          untuk memulai cerita.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML = data.map(bab => {

    return `
      <article class="card chapter-card">

        <h3>
          Bab ${bab.nomor_bab}
          ${bab.judul_bab
            ? " — " + escapeHTML(bab.judul_bab)
            : ""}
        </h3>

        <p>
          ${formatTanggal(bab.created_at)}
        </p>

        <div class="chapter-text">
          ${escapeHTML(bab.isi_bab || "")
            .replace(/\n/g, "<br><br>")}
        </div>

      </article>
    `;

  }).join("");
}


/* =====================================================
   TULIS BAB BERIKUTNYA
===================================================== */

el("writeNextChapter").onclick =
  async () => {

    if (!currentNovel) {
      setMessage(
        "chapterMessage",
        "Novel belum dipilih."
      );
      return;
    }

    const button =
      el("writeNextChapter");

    button.disabled = true;

    setMessage(
      "chapterMessage",
      "PENA AI sedang menulis bab berikutnya..."
    );

    try {

      const { data } =
        await supabase.auth.getSession();

      const token =
        data.session?.access_token;

      if (!token) {
        throw new Error(
          "Sesi login sudah berakhir. Silakan login kembali."
        );
      }

      const response =
        await fetch(WORKER_URL, {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${token}`
          },

          body: JSON.stringify({

            action:
              "write_chapter",

            novel_id:
              currentNovel.id

          })

        });

      const result =
        await response.json();

      if (!response.ok ||
          !result.success) {

        throw new Error(
          result.error ||
          "Gagal menulis bab."
        );
      }

      setMessage(
        "chapterMessage",
        "Bab berhasil ditulis dan disimpan."
      );

      await bukaNovel(
        currentNovel.id
      );

      await muatBeranda();

    } catch (error) {

      setMessage(
        "chapterMessage",
        error.message
      );

    } finally {

      button.disabled = false;

    }

  };


/* =====================================================
   KARAKTER
===================================================== */

async function muatKarakter() {

  if (!currentNovel) return;

  const container =
    el("characterList");

  container.innerHTML =
    `<div class="card">Memuat karakter...</div>`;

  const { data, error } =
    await supabase
      .from("novel_karakter")
      .select("*")
      .eq("novel_id", currentNovel.id)
      .eq("user_id", currentUser.id)
      .order("created_at", {
        ascending: true
      });

  if (error) {

    container.innerHTML = `
      <div class="card">
        Gagal memuat karakter.<br>
        ${escapeHTML(error.message)}
      </div>
    `;

    return;
  }

  if (!data || data.length === 0) {

    container.innerHTML = `
      <div class="card">
        Belum ada karakter.
      </div>
    `;

    return;
  }

  container.innerHTML =
    data.map(character => {

      return `
        <div class="card">

          <h3>
            ${escapeHTML(character.nama)}
          </h3>

          <p>
            ${character.umur
              ? "Umur: " +
                escapeHTML(character.umur)
              : ""}
          </p>

          <p>
            ${escapeHTML(
              character.peran || ""
            )}
          </p>

          <p>
            ${escapeHTML(
              character.sifat || ""
            )}
          </p>

          ${
            character.latar_belakang
              ? `
                <p>
                  ${escapeHTML(
                    character.latar_belakang
                  )}
                </p>
              `
              : ""
          }

        </div>
      `;

    }).join("");
}


/* =====================================================
   TAMBAH KARAKTER
===================================================== */

el("addCharacterBtn").onclick =
  async () => {

    if (!currentNovel) {
      return;
    }

    const nama =
      el("charName").value.trim();

    const umur =
      el("charAge").value;

    const peran =
      el("charRole").value.trim();

    const sifat =
      el("charTrait").value.trim();

    const latar =
      el("charBackground").value.trim();

    if (!nama) {

      setMessage(
        "characterMessage",
        "Nama karakter wajib diisi."
      );

      return;
    }

    const button =
      el("addCharacterBtn");

    button.disabled = true;

    setMessage(
      "characterMessage",
      "Menyimpan karakter..."
    );

    const { error } =
      await supabase
        .from("novel_karakter")
        .insert({

          novel_id:
            currentNovel.id,

          user_id:
            currentUser.id,

          nama,

          umur:
            umur
              ? Number(umur)
              : null,

          peran,

          sifat,

          latar_belakang:
            latar

        });

    if (error) {

      setMessage(
        "characterMessage",
        "Gagal menyimpan karakter: " +
        error.message
      );

      button.disabled = false;

      return;
    }

    el("charName").value = "";
    el("charAge").value = "";
    el("charRole").value = "";
    el("charTrait").value = "";
    el("charBackground").value = "";

    setMessage(
      "characterMessage",
      "Karakter berhasil disimpan."
    );

    button.disabled = false;

    await muatKarakter();
  };


/* =====================================================
   GAYA NOVEL
===================================================== */

function muatGaya() {

  if (!currentNovel) return;

  el("styleGenre").value =
    currentNovel.genre ||
    "Drama";

  el("styleWriting").value =
    currentNovel.gaya ||
    "Natural";

  el("styleMood").value =
    currentNovel.nuansa ||
    "Emosional";

  el("styleMode").value =
    currentNovel.mode ||
    "Normal";
}


/* =====================================================
   SIMPAN GAYA
===================================================== */

el("saveStyleBtn").onclick =
  async () => {

    if (!currentNovel) {
      return;
    }

    const button =
      el("saveStyleBtn");

    button.disabled = true;

    setMessage(
      "styleMessage",
      "Menyimpan gaya..."
    );

    const genre =
      el("styleGenre").value;

    const gaya =
      el("styleWriting").value;

    const nuansa =
      el("styleMood").value;

    const mode =
      el("styleMode").value;

    const { data, error } =
      await supabase
        .from("novel")
        .update({

          genre,
          gaya,
          nuansa,
          mode,
          updated_at:
            new Date().toISOString()

        })
        .eq("id", currentNovel.id)
        .eq("user_id", currentUser.id)
        .select()
        .single();

    if (error) {

      setMessage(
        "styleMessage",
        "Gagal menyimpan gaya: " +
        error.message
      );

      button.disabled = false;

      return;
    }

    currentNovel = data;

    el("detailInfo").textContent =
      `${data.genre || "Drama"} · ` +
      `${data.gaya || "Natural"} · ` +
      `${data.nuansa || "Emosional"} · ` +
      `Bab ${data.bab_selesai || 0}`;

    setMessage(
      "styleMessage",
      "Gaya novel berhasil disimpan."
    );

    button.disabled = false;
  };


/* =====================================================
   TULIS CEPAT
===================================================== */

el("writeBtn").onclick =
  async () => {

    const promptText =
      el("prompt").value.trim();

    if (!promptText) {

      setMessage(
        "writeMessage",
        "Masukkan ide tulisan dahulu."
      );

      return;
    }

    const button =
      el("writeBtn");

    button.disabled = true;

    setMessage(
      "writeMessage",
      "PENA AI sedang menulis..."
    );

    try {

      const { data } =
        await supabase.auth.getSession();

      const token =
        data.session?.access_token;

      if (!token) {
        throw new Error(
          "Silakan login kembali."
        );
      }

      const response =
        await fetch(WORKER_URL, {

          method: "POST",

          headers: {

            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${token}`

          },

          body: JSON.stringify({

            action:
              "write",

            judul:
              el("title").value.trim() ||
              "Tulisan Baru",

            prompt:
              promptText,

            jenis:
              "Novel"

          })

        });

      const result =
        await response.json();

      if (!response.ok ||
          !result.success) {

        throw new Error(
          result.error ||
          "Gagal membuat tulisan."
        );
      }

      /*
       * Jangan ubah hasil menjadi bullet,
       * markdown, atau format laporan.
       * Tampilkan sebagai prosa langsung.
       */

      el("result").textContent =
        result.text || "";

      setMessage(
        "writeMessage",
        "Tulisan berhasil dibuat dan disimpan."
      );

    } catch (error) {

      setMessage(
        "writeMessage",
        error.message
      );

    } finally {

      button.disabled = false;

    }
  };


/* =====================================================
   COPY HASIL
===================================================== */

el("copyResult").onclick =
  async () => {

    const text =
      el("result").textContent.trim();

    if (!text) {

      setMessage(
        "writeMessage",
        "Belum ada tulisan yang bisa disalin."
      );

      return;
    }

    try {

      await navigator.clipboard.writeText(
        text
      );

      setMessage(
        "writeMessage",
        "Tulisan berhasil disalin."
      );

    } catch (error) {

      setMessage(
        "writeMessage",
        "Gagal menyalin tulisan."
      );

    }
  };


/* =====================================================
   AUTO LOGIN
===================================================== */

const {
  data: sessionData
} = await supabase.auth.getSession();

if (sessionData.session) {

  currentUser =
    sessionData.session.user;

  tampilkanStudio();

  await muatBeranda();

  await muatNovel();

} else {

  tampilkanLogin();

}


/* =====================================================
   PERUBAHAN STATUS LOGIN
===================================================== */

supabase.auth.onAuthStateChange(
  async (_event, session) => {

    if (session?.user) {

      currentUser =
        session.user;

      tampilkanStudio();

    } else {

      currentUser = null;
      currentNovel = null;

      tampilkanLogin();

    }

  }
);


/* =====================================================
   GLOBAL
===================================================== */

window.bukaNovel =
  bukaNovel;

window.buatNovelBaru =
  buatNovelBaru;
