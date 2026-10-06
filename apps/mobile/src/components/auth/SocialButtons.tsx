import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { Icon } from "@/components/Icon";
import { errorText } from "@/components/ui/ApiErrorMessage";
import { glow, smooth, useHover } from "@/components/ui/hover";
import { AnimatedPressable, useSpringPress } from "@/components/ui/Interactive";
import { Text } from "@/components/ui/Text";
import { api, type OAuthProvider } from "@/lib/api/endpoints";
import { beginOAuth, OAUTH_LOOK } from "@/lib/oauth";
import { toast } from "@/lib/ui-store";
import { withAlpha } from "@/theme/color";
import { useTheme } from "@/theme/ThemeProvider";

/** Selo redondo do provedor: uma letra (ou o ícone da maçã) na cor da marca. */
function ProviderMark({ id }: { id: string }) {
  const look = OAUTH_LOOK[id] ?? { mark: "?", color: "#64748B" };
  return (
    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: look.color, alignItems: "center", justifyContent: "center" }}>
      {id === "apple" ? (
        <Icon name="apple" size={16} color="#FFFFFF" />
      ) : (
        <Text variant="caption" weight="800" style={{ color: "#FFFFFF", fontSize: look.mark.length > 1 ? 10 : 14, lineHeight: 16 }}>
          {look.mark}
        </Text>
      )}
    </View>
  );
}

function ProviderButton({ provider, verb, busy, disabled, onPress }: { provider: OAuthProvider; verb: string; busy: boolean; disabled: boolean; onPress: () => void }) {
  const { colors, radius } = useTheme();
  const { hovered, hoverProps } = useHover();
  const press = useSpringPress();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${verb} com ${provider.label}`}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      {...hoverProps}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        { height: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: hovered ? colors.accent : colors.border, backgroundColor: hovered ? colors.surfaceAlt : colors.surface, opacity: disabled && !busy ? 0.55 : 1 },
        smooth,
        hovered ? glow(withAlpha(colors.accent, 0.25)) : null,
        press.style,
      ]}
    >
      <ProviderMark id={provider.id} />
      <Text weight="600">{busy ? "Abrindo…" : `${verb} com ${provider.label}`}</Text>
    </AnimatedPressable>
  );
}

/**
 * "Continuar com Google / Facebook / ..." (os provedores vêm do servidor: só aparecem os que estão ligados). Sem nenhum ligado, não mostra nada.
 * O Instagram não tem login próprio: quem usa entra pelo Facebook.
 */
export function SocialButtons({ verb = "Continuar", separator = "ou" }: { verb?: string; separator?: string }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const providers = useQuery({ queryKey: ["oauth-providers"], queryFn: api.auth.oauthProviders, staleTime: 60 * 60_000, retry: 1 });
  const list = providers.data?.providers ?? [];
  if (list.length === 0) return null;

  const start = async (id: string) => {
    setBusy(id);
    try {
      await beginOAuth(id);
    } catch (err) {
      toast.error(errorText(err));
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <Text variant="caption" tone="faint">
          {separator}
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>
      {list.map((p) => (
        <ProviderButton key={p.id} provider={p} verb={verb} busy={busy === p.id} disabled={busy !== null} onPress={() => void start(p.id)} />
      ))}
    </View>
  );
}
