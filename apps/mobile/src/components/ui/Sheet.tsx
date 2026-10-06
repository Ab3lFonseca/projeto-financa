import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View, type ViewStyle } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "../Icon";
import { PressableRow } from "./Interactive";
import { IconBadge } from "./Layout";
import { motion } from "./motion";
import { Text } from "./Text";

/** Na web, o fundo atrás da folha fica levemente desfocado (dá profundidade); no celular não existe e é ignorado. */
const blurBackdrop = (Platform.OS === "web" ? { backdropFilter: "blur(3px)" } : {}) as ViewStyle;

/** Folha que sobe de baixo (seletores, filtros, calendário). Fecha ao tocar fora. */
export function Sheet({ visible, onClose, title, children, scroll = true }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode; scroll?: boolean }) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  const content = scroll ? (
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
      {children}
    </ScrollView>
  ) : (
    children
  );
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View
          entering={FadeIn.duration(motion.base)}
          exiting={FadeOut.duration(motion.fast + 40)}
          style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay }, blurBackdrop]}
        >
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Fechar" />
        </Animated.View>
        <Animated.View
          // Sobe com uma mola amortecida (pousa sem quicar) e desce com a curva padrão do app.
          entering={SlideInDown.springify().damping(24).stiffness(240).mass(0.9)}
          exiting={SlideOutDown.duration(motion.base).easing(motion.easing)}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 12),
            maxHeight: "88%",
            width: "100%",
            maxWidth: 640,
            alignSelf: "center",
          }}
        >
          <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 12 }} />
          {title ? (
            <Text variant="heading" style={{ marginBottom: 12 }}>
              {title}
            </Text>
          ) : null}
          {content}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export type Option<T extends string> = { value: T; label: string; subtitle?: string; icon?: string; color?: string | null };

/** Lista de opções em folha: categoria, conta, cartão... */
export function OptionSheet<T extends string>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
  empty,
  footer,
}: {
  visible: boolean;
  title: string;
  options: Option<T>[];
  selected?: T | null;
  onSelect: (v: T) => void;
  onClose: () => void;
  empty?: string;
  footer?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {options.length === 0 ? (
        <Text tone="muted" style={{ paddingVertical: 16 }}>
          {empty ?? "Nada por aqui ainda."}
        </Text>
      ) : (
        options.map((o) => (
          <PressableRow
            key={o.value}
            label={o.label}
            onPress={() => {
              onSelect(o.value);
              onClose();
            }}
          >
            {() => (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }} aria-selected={o.value === selected}>
                {o.icon ? <IconBadge icon={o.icon} color={o.color} size={36} /> : null}
                <View style={{ flex: 1 }}>
                  <Text weight="500">{o.label}</Text>
                  {o.subtitle ? (
                    <Text variant="caption" tone="muted">
                      {o.subtitle}
                    </Text>
                  ) : null}
                </View>
                {o.value === selected ? <Icon name="check" size={20} color={colors.primary} /> : null}
              </View>
            )}
          </PressableRow>
        ))
      )}
      {footer}
    </Sheet>
  );
}
