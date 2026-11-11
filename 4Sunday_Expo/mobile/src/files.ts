import { Platform } from "react-native";
import * as FS from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { ExportFile } from "./api";
export async function shareFile(file: ExportFile) {
  if (Platform.OS === "web") {
    const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: file.mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = file.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  if (!FS.cacheDirectory) throw new Error("Dočasné úložiště není dostupné.");
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Sdílení není na tomto zařízení dostupné.");
  const uri =
    FS.cacheDirectory + file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  await FS.writeAsStringAsync(uri, file.base64, {
    encoding: FS.EncodingType.Base64,
  });
  try {
    await Sharing.shareAsync(uri, {
      mimeType: file.mime,
      dialogTitle: "4Sunday – uložit nebo sdílet",
      UTI: file.mime === "application/pdf" ? "com.adobe.pdf" : "public.data",
    });
  } finally {
    await FS.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}
