// Shared Geolocation & Photo Utilities for Safety Guard

export function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this device."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === 1) {
          reject(new Error("GPS permission denied. Please allow location access in your browser settings."));
        } else {
          reject(new Error("Could not retrieve GPS location. Ensure your device's GPS is enabled."));
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(",");
  const mime = parts[0].match(/:(.*?);/)[1];
  const raw = atob(parts[1]);
  const u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    u8[i] = raw.charCodeAt(i);
  }
  return new Blob([u8], { type: mime });
}

export async function uploadPhoto(guardId, dataUrl, supabase) {
  if (!dataUrl) throw new Error("No photo data. Camera may be unavailable.");
  const blob = dataUrlToBlob(dataUrl);
  const fileName = `guard_${guardId}_${Date.now()}.jpg`;
  const { error: uploadErr } = await supabase.storage
    .from("guard-photos")
    .upload(fileName, blob, { contentType: "image/jpeg" });

  if (uploadErr) {
    if (uploadErr.message.includes("bucket")) {
      throw new Error('Storage bucket "guard-photos" not found. Ask admin to create it in Supabase.');
    }
    throw new Error("Photo upload failed: " + uploadErr.message);
  }

  const { data: urlData } = supabase.storage
    .from("guard-photos")
    .getPublicUrl(fileName);
  return urlData.publicUrl;
}
