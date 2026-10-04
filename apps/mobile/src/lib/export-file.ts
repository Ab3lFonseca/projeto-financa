import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

/**
 * Entrega um arquivo de texto ao usuário: baixa no navegador (web) ou abre a folha de
 * compartilhamento do sistema (iOS/Android), onde ele escolhe salvar em Arquivos, Drive, e-mail...
 */
export async function saveTextFile(
  filename: string,
  content: string,
  mimeType = "application/json",
  opts: { dialogTitle?: string; uti?: string } = {},
): Promise<"saved" | "unavailable"> {
  if (Platform.OS === "web") {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return "saved";
  }
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: opts.dialogTitle ?? "Salvar meus dados", UTI: opts.uti ?? "public.json" });
  return "saved";
}
