async function tulisCepat() {

  const promptText =
    el("prompt").value.trim();

  if (!promptText) {

    msg(
      "writeMessage",
      "Masukkan ide tulisan dahulu."
    );

    return;
  }


  const button =
    el("writeBtn");


  button.disabled = true;


  msg(
    "writeMessage",
    "PENA AI sedang menulis..."
  );


  try {

    // =================================================
    // AMBIL SESSION LOGIN
    // =================================================

    const {
      data
    } =
      await supabase.auth.getSession();


    const token =
      data.session?.access_token;


    if (!token) {

      throw new Error(
        "Silakan login kembali."
      );

    }


    // =================================================
    // KIRIM KE CLOUDFLARE WORKER
    // =================================================

    const response =
      await fetch(
        WORKER_URL,
        {
          method: "POST",

          headers: {

            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${token}`

          },

          body:
            JSON.stringify({

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

        }
      );


    // =================================================
    // PENTING:
    // RESPONSE BODY DIBACA HANYA SATU KALI
    // =================================================

    let result;

    try {

      result =
        await response.json();

    } catch (parseError) {

      throw new Error(
        "Backend mengirim response yang tidak valid."
      );

    }


    // =================================================
    // CEK RESPONSE
    // =================================================

    if (
      !response.ok ||
      !result ||
      !result.success
    ) {

      throw new Error(
        result?.error ||
        `Gagal membuat tulisan. Status server: ${response.status}`
      );

    }


    // =================================================
    // AMBIL HASIL TULISAN
    // =================================================

    const hasilTulisan =
      result.hasil_tulisan ||
      result.text ||
      result.content ||
      "";


    if (!hasilTulisan.trim()) {

      throw new Error(
        "AI berhasil merespons, tetapi hasil tulisan kosong."
      );

    }


    // =================================================
    // TAMPILKAN HASIL
    // =================================================

    el("result").textContent =
      hasilTulisan;


    // =================================================
    // PESAN SUKSES
    // =================================================

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

    button.disabled = false;

  }

}
