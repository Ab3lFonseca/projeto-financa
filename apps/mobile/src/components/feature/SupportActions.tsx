import { View } from "react-native";
import { Icon } from "@/components/Icon";
import { GoChevron, PressableRow } from "@/components/ui/Interactive";
import { Card, Divider, IconBadge } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import { mailtoLink, SUPPORT, whatsappLink } from "@/content/contact";
import { openLink } from "@/lib/open-url";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Os dois canais do suporte, com um toque: o e-mail abre o programa de e-mail com assunto e texto prontos, e o WhatsApp abre a conversa com a
 * mensagem inicial escrita. `message` é o que já vai preenchido (e vira o assunto do e-mail).
 */
export function SupportActions({ message = "Olá! Preciso de ajuda com o Finança.", subject = "Ajuda com o Finança" }: { message?: string; subject?: string }) {
  const { colors } = useTheme();
  return (
    <Card style={{ paddingVertical: 6 }}>
      <PressableRow onPress={() => void openLink(whatsappLink(message))} label="Falar no WhatsApp">
        {({ hovered }) => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}>
            <IconBadge icon="message-circle" color="#22C55E" size={44} />
            <View style={{ flex: 1 }}>
              <Text weight="600">Falar no WhatsApp</Text>
              <Text variant="caption" tone="muted">
                {SUPPORT.whatsappDisplay} · abre a conversa já com a mensagem
              </Text>
            </View>
            <GoChevron hovered={hovered} />
          </View>
        )}
      </PressableRow>
      <Divider inset={56} />
      <PressableRow onPress={() => void openLink(mailtoLink(subject, message))} label="Enviar e-mail">
        {({ hovered }) => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}>
            <IconBadge icon="mail" color={colors.primary} size={44} />
            <View style={{ flex: 1 }}>
              <Text weight="600">Enviar e-mail</Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {SUPPORT.email}
              </Text>
            </View>
            <GoChevron hovered={hovered} />
          </View>
        )}
      </PressableRow>
    </Card>
  );
}

/** Aviso fixo: o suporte nunca pede senha, código nem dados do cartão. */
export function SupportSafetyNote() {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.warningSoft }}>
      <Icon name="shield-alert" size={18} color={colors.warning} />
      <Text variant="bodySm" style={{ flex: 1 }}>
        Nunca peça nem passe a sua senha, o código do aplicativo autenticador ou os dados do cartão a ninguém, nem a quem diga ser do Finança.
      </Text>
    </View>
  );
}
