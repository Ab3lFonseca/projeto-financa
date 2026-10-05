import { z } from "zod";
import { hexColor } from "./common";

/** Temas disponíveis. `system` segue o claro/escuro do aparelho; `custom` usa as 4 cores escolhidas pela pessoa. */
export const THEME_PRESET_IDS = ["system", "light", "dark", "blue", "purple", "green", "red", "custom"] as const;
export type ThemePresetId = (typeof THEME_PRESET_IDS)[number];


/** As 4 cores (#RRGGBB; o app normaliza #RGB antes de enviar) que a pessoa escolhe no tema personalizado; o resto da paleta é derivado delas. */
export const customColorsSchema = z.strictObject({
  primary: hexColor,
  accent: hexColor,
  background: hexColor,
  surface: hexColor,
});
export type CustomColors = z.infer<typeof customColorsSchema>;

/**
 * Preferência de aparência guardada na conta. As cores personalizadas ficam guardadas mesmo com outro tema
 * selecionado (a pessoa pode voltar a elas sem refazer). `custom` é obrigatório quando `preset` é "custom".
 */
export const appearanceSchema = z
  .strictObject({
    preset: z.enum(THEME_PRESET_IDS),
    custom: customColorsSchema.optional(),
  })
  .refine((a) => a.preset !== "custom" || a.custom !== undefined, { message: "Defina as cores do tema personalizado", path: ["custom"] });
export type Appearance = z.infer<typeof appearanceSchema>;
