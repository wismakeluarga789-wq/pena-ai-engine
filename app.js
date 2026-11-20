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


// =====================================================
// HELPER
// =====================================================

function el(id) {
  return document.getElementById(id);
}


function msg(id, text) {
  const x = el(id);

  if (x) {
    x.textContent = text || "";
  }
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
// LOGIN / STUDIO
// =====================================================

function tampilkanStudio() {

  if (el("authSection")) {
    el("authSection").hidden = true;
  }

  if (el("studioSection")) {
    el("studioSection").hidden = false;
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

  document
    .querySelectorAll(".page")
    .forEach(page => {
      page.hidden = true;
    });


  const page = el(id);

  if (page) {
    page.hidden = false;
  }


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

  try {

    await supabase.auth.signOut();

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

      return `

        <div class="card">

          <h3>
            ${escapeHTML(
              novel.judul
            )}
          </h3>

          <p>
            ${escapeHTML(
              novel.genre ||
              "Drama"
            )}

            ·

            ${escapeHTML(
              novel.gaya ||
              "Natural"
            )}
          </p>

          <p>
            Bab
            ${novel.bab_selesai || 0}
          </p>

          <button
            class="openNovelButton"
            data-id="${novel.id}">

            Buka Novel

          </button>

        </div>
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

  muatGaya();
}


// =====================================================
// MUAT SEMUA BAB
// =====================================================

async function muatBab() {

  if (
    !currentNovel ||
    !currentUser
  ) {
    return;
  }


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

  currentChapterIndex =
    chapterData.length - 1;


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

function modeEditBab() {

  const chapter =
    chapterData[
      currentChapterIndex
    ];


  if (!chapter) {
    return;
  }


  const area =
    el("chapterContentArea");


  if (!area) {
    return;
  }


  area.innerHTML = `

    <textarea
      id="chapterEditText"
      style="
        width:100%;
        min-height:650px;
        padding:20px;
        resize:vertical;
        line-height:1.8;
        font-size:16px;
        box-sizing:border-box;
      ">${escapeHTML(
        chapter.isi_bab ||
        ""
      )}</textarea>

  `;


  const actionMessage =
    el("chapterActionMessage");


  if (actionMessage) {

    actionMessage.innerHTML = `

      <div
        style="
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          margin-top:10px;
        ">

        <button
          id="saveEditedChapterBtn">

          💾 Simpan Perubahan

        </button>


        <button
          id="cancelEditChapterBtn">

          Batal

        </button>

      </div>

    `;

  }


  const saveBtn =
    el("saveEditedChapterBtn");


  if (saveBtn) {

    saveBtn.onclick =
      simpanEditBab;

  }


  const cancelBtn =
    el("cancelEditChapterBtn");


  if (cancelBtn) {

    cancelBtn.onclick =
      () => {

        renderChapterWorkspace();

      };

  }
}


// =====================================================
// SIMPAN EDIT BAB
// =====================================================

async function simpanEditBab() {

  const chapter =
    chapterData[
      currentChapterIndex
    ];


  if (!chapter) {
    return;
  }


  const textarea =
    el("chapterEditText");


  if (!textarea) {
    return;
  }


  const isiBaru =
    textarea.value;


  const saveBtn =
    el("saveEditedChapterBtn");


  if (saveBtn) {
    saveBtn.disabled = true;
  }


  msg(
    "chapterActionMessage",
    "Menyimpan perubahan..."
  );


  try {

    const {
      data,
      error
    } =
      await supabase
        .from("novel_bab")
        .update({

          isi_bab:
            isiBaru,

          updated_at:
            new Date().toISOString()

        })
        .eq(
          "id",
          chapter.id
        )
        .eq(
          "novel_id",
          currentNovel.id
        )
        .eq(
          "user_id",
          currentUser.id
        )
        .select()
        .single();


    if (error) {

      msg(
        "chapterActionMessage",
        "Gagal menyimpan: " +
        error.message
      );

      if (saveBtn) {
        saveBtn.disabled = false;
      }

      return;
    }


    chapterData[
      currentChapterIndex
    ] =
      data;


    msg(
      "chapterActionMessage",
      "Perubahan berhasil disimpan."
    );


    renderChapterWorkspace();

  } catch (error) {

    msg(
      "chapterActionMessage",
      "Gagal menyimpan: " +
      (
        error.message ||
        error
      )
    );


    if (saveBtn) {
      saveBtn.disabled = false;
    }
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
// KARAKTER
// =====================================================

async function muatKarakter() {

  if (
    !currentNovel ||
    !currentUser
  ) {
    return;
  }


  const box =
    el("characterList");


  if (!box) {
    return;
  }


  const {
    data,
    error
  } =
    await supabase
      .from("novel_karakter")
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
        "created_at",
        {
          ascending: true
        }
      );


  if (error) {

    box.innerHTML = `
      <div class="card">

        Gagal memuat karakter.

        <br><br>

        ${escapeHTML(
          error.message
        )}

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
        Belum ada karakter.
      </div>
    `;

    return;
  }


  box.innerHTML =
    data.map(c => {

      return `

        <div class="card">

          <h3>
            ${escapeHTML(
              c.nama
            )}
          </h3>

          ${
            c.umur
              ? `<p>Umur: ${c.umur}</p>`
              : ""
          }

          ${
            c.peran
              ? `<p>${escapeHTML(
                  c.peran
                )}</p>`
              : ""
          }

          ${
            c.sifat
              ? `<p>${escapeHTML(
                  c.sifat
                )}</p>`
              : ""
          }

          ${
            c.latar_belakang
              ? `<p>${escapeHTML(
                  c.latar_belakang
                )}</p>`
              : ""
          }

        </div>

      `;

    }).join("");
}


// =====================================================
// SIMPAN KARAKTER
// =====================================================

async function simpanKarakter() {

  if (
    !currentNovel ||
    !currentUser
  ) {
    return;
  }


  const nama =
    el("charName")?.value.trim() ||
    "";


  if (!nama) {

    msg(
      "characterMessage",
      "Nama karakter wajib diisi."
    );

    return;
  }


  const button =
    el("addCharacterBtn");


  if (button) {
    button.disabled = true;
  }


  msg(
    "characterMessage",
    "Menyimpan karakter..."
  );


  try {

    const {
      error
    } =
      await supabase
        .from("novel_karakter")
        .insert({

          novel_id:
            currentNovel.id,

          user_id:
            currentUser.id,

          nama,

          umur:
            el("charAge")?.value
              ? Number(
                  el("charAge").value
                )
              : null,

          peran:
            el("charRole")?.value.trim() ||
            "",

          sifat:
            el("charTrait")?.value.trim() ||
            "",

          latar_belakang:
            el("charBackground")?.value.trim() ||
            ""

        });


    if (error) {

      msg(
        "characterMessage",
        "Gagal menyimpan karakter: " +
        error.message
      );

      return;
    }


    [
      "charName",
      "charAge",
      "charRole",
      "charTrait",
      "charBackground"
    ]
      .forEach(id => {

        if (el(id)) {
          el(id).value = "";
        }

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
// GAYA NOVEL
// =====================================================

function muatGaya() {

  if (!currentNovel) {
    return;
  }


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

    const {
      data,
      error
    } =
      await supabase
        .from("novel")
        .update({

          genre:
            el("styleGenre")?.value ||
            "Drama",

          gaya:
            el("styleWriting")?.value ||
            "Natural",

          nuansa:
            el("styleMood")?.value ||
            "Emosional",

          mode:
            el("styleMode")?.value ||
            "Normal",

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
        )
        .select()
        .single();


    if (error) {

      msg(
        "styleMessage",
        "Gagal menyimpan gaya: " +
        error.message
      );

      return;
    }


    currentNovel =
      data;


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

    saveStyleBtn:
      simpanGaya,

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
