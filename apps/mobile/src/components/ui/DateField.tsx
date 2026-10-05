import { addMonths, daysInMonth, formatISODate, monthNamePt, parseISODate, startOfMonth, type ISODate } from "@app/shared";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { formatDateRelative, formatDateShort, weekdayOf } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "../Icon";
import { Chip } from "./Controls";
import { SelectField } from "./Inputs";
import { Sheet } from "./Sheet";
import { Text } from "./Text";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Calendário em folha (funciona igual em todas as plataformas, sem módulo nativo). */
export function DatePickerSheet({
  visible,
  value,
  today,
  onSelect,
  onClose,
  title = "Escolher data",
  min,
  max,
}: {
  visible: boolean;
  value: ISODate;
  today: ISODate;
  onSelect: (d: ISODate) => void;
  onClose: () => void;
  title?: string;
  min?: ISODate;
  max?: ISODate;
}) {
  const { colors, radius } = useTheme();
  const [view, setView] = useState(startOfMonth(value));
  const { year, month } = parseISODate(view);
  const lead = weekdayOf(view);
  const days = daysInMonth(year, month);
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const pick = (d: ISODate) => {
    onSelect(d);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="Hoje" selected={value === today} onPress={() => pick(today)} />
          <Chip label="Ontem" selected={value === formatISODate(...(Object.values(parseISODate(addDaysISO(today, -1))) as [number, number, number]))} onPress={() => pick(addDaysISO(today, -1))} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Mês anterior" onPress={() => setView(addMonths(view, -1))} hitSlop={10} style={{ padding: 6 }}>
            <Icon name="chevron-left" size={22} color={colors.text} />
          </Pressable>
          <Text weight="700">
            {monthNamePt(view).charAt(0).toUpperCase() + monthNamePt(view).slice(1)} de {year}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Próximo mês" onPress={() => setView(addMonths(view, 1))} hitSlop={10} style={{ padding: 6 }}>
            <Icon name="chevron-right" size={22} color={colors.text} />
          </Pressable>
        </View>
        <View style={{ flexDirection: "row" }}>
          {WEEKDAYS.map((w, i) => (
            <Text key={i} variant="caption" tone="faint" align="center" style={{ flex: 1 }}>
              {w}
            </Text>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {cells.map((day, i) => {
            if (day === null) return <View key={i} style={{ width: `${100 / 7}%`, height: 44 }} />;
            const iso = formatISODate(year, month, day);
            const selected = iso === value;
            const isToday = iso === today;
            const disabled = (min && iso < min) || (max && iso > max);
            return (
              <Pressable
                key={i}
                disabled={!!disabled}
                accessibilityRole="button"
                accessibilityLabel={formatDateShort(iso)}
                accessibilityState={{ selected, disabled: !!disabled }}
                onPress={() => pick(iso)}
                style={{ width: `${100 / 7}%`, height: 44, alignItems: "center", justifyContent: "center" }}
              >
                <View style={{ width: 38, height: 38, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: selected ? colors.primary : "transparent", borderWidth: isToday && !selected ? 1.5 : 0, borderColor: colors.primary, opacity: disabled ? 0.3 : 1 }}>
                  <Text variant="bodySm" weight={selected || isToday ? "700" : "400"} style={{ color: selected ? colors.onPrimary : colors.text }}>
                    {day}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Sheet>
  );
}

function addDaysISO(iso: ISODate, days: number): ISODate {
  const { year, month, day } = parseISODate(iso);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return formatISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Campo de data: mostra "Hoje"/"Ontem"/"4 out 2026" e abre o calendário. */
export function DateField({ label, value, onChange, today, error, min, max }: { label?: string; value: ISODate; onChange: (d: ISODate) => void; today: ISODate; error?: string | null; min?: ISODate; max?: ISODate }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <SelectField label={label} value={formatDateRelative(value, today)} onPress={() => setOpen(true)} error={error} left={<Icon name="calendar" size={18} color={colors.textFaint} />} />
      <DatePickerSheet visible={open} value={value} today={today} onSelect={onChange} onClose={() => setOpen(false)} title={label ?? "Escolher data"} min={min} max={max} />
    </>
  );
}
