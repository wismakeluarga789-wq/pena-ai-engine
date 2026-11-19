
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1. KONFIGURASI SUPABASE
const SUPABASE_URL = "https://qyeiwnwekqwhxwwbwyfq.supabase.co";
const SUPABASE_KEY = "sb_publishable_fjFOriVPPgI6_pFhIAurCw_jNwuX_kj";

// 2. ALAMAT CLOUDFLARE WORKER
const WORKER_URL = "https://pena-ai-backend-groq.wismakeluarga789.workers.dev";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const el = (id) => document.getElementById(id);

el("loginBtn").onclick = async () => {
  el("authMessage").textContent = "Sedang masuk...";

  const { data, error } = await supabase.auth.signInWithPassword({
    email: el("email").value.trim(),
    password: el("password").value
  });

  if (error) {
    el("authMessage").textContent = error.message;
    return;
  }

  tampilkanStudio();
};

el("signupBtn").onclick = async () => {
  el("authMessage").textContent = "Sedang mendaftarkan akun...";

  const { error } = await supabase.auth.signUp({
    email: el("email").value.trim(),
    password: el("password").value
  });

  if (error) {
    el("authMessage").textContent = error.message;
    return;
  }

  el("authMessage").textContent =
    "Pendaftaran berhasil. Periksa email jika konfirmasi diminta.";
};

el("logoutBtn").onclick = async () => {
  await supabase.auth.signOut();
  el("studioSection").hidden = true;
  el("authSection").hidden = false;
};

function tampilkanStudio() {
  el("authSection").hidden = true;
  el("studioSection").hidden = false;
}

el("writeBtn").onclick = async () => {
  const prompt = el("prompt").value.trim();

  if (!prompt) {
    el("writeMessage").textContent = "Masukkan ide tulisan dahulu.";
    return;
  }

  el("writeBtn").disabled = true;
  el("writeMessage").textContent = "PENA AI sedang menulis...";

  try {
    const { data } = await supabase.auth.getSession();
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
        judul: el("title").value.trim() || "Tulisan Baru",
        prompt,
        jenis: "Novel"
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Gagal membuat tulisan.");
    }

    el("result").textContent = result.text;
    el("writeMessage").textContent = "Tulisan berhasil dibuat dan disimpan.";

  } catch (error) {
    el("writeMessage").textContent = error.message;
  } finally {
    el("writeBtn").disabled = false;
  }
};

// Periksa sesi login ketika aplikasi dibuka
const { data: sessionData } = await supabase.auth.getSession();

if (sessionData.session) {
  tampilkanStudio();
}
