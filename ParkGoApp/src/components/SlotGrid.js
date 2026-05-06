import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Colors } from '../utils/colors';
import { ALEX_COLS, ALEX_ROWS, orderedSlotNos, slotStateLabel } from '../utils/slotGrid';

function slotTone(state) {
  const s = Number(state);
  if (s === 0) return { border: 'rgba(16,185,129,0.45)', bg: 'rgba(16,185,129,0.10)', text: '#bbf7d0' };
  if (s === 2) return { border: 'rgba(245,158,11,0.45)', bg: 'rgba(245,158,11,0.10)', text: '#fef08a' };
  return { border: 'rgba(239,68,68,0.45)', bg: 'rgba(239,68,68,0.10)', text: '#fecaca' };
}

export function SlotGrid({ slots, selectedSlotNo, onSelect, showLegend = true }) {
  const map = useMemo(() => {
    const m = new Map();
    for (const s of Array.isArray(slots) ? slots : []) {
      const key = String(s.slot_no ?? '').trim();
      if (key) m.set(key, Number(s.state));
    }
    return m;
  }, [slots]);

  const all = useMemo(() => orderedSlotNos(), []);

  return (
    <View style={{ gap: 12 }}>
      {showLegend ? (
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <LegendChip label="Available" tone={slotTone(0)} />
          <LegendChip label="Reserved" tone={slotTone(2)} />
          <LegendChip label="Occupied" tone={slotTone(1)} />
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        {ALEX_ROWS.map((r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
            {ALEX_COLS.map((c) => {
              const slotNo = `${r}${c}`;
              const state = map.has(slotNo) ? map.get(slotNo) : 0;
              const isFree = Number(state) === 0;
              const isSelected = String(selectedSlotNo || '').trim() === slotNo;
              const tone = slotTone(state);
              return (
                <Pressable
                  key={slotNo}
                  accessibilityRole="button"
                  accessibilityLabel={`Parking slot ${slotNo}, ${slotStateLabel(state)}`}
                  accessibilityState={{ disabled: !isFree, selected: isSelected }}
                  hitSlop={6}
                  onPress={() => {
                    if (isFree) onSelect?.(slotNo);
                  }}
                  disabled={!isFree}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 52,
                    aspectRatio: 1,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: isSelected ? Colors.logoBlueLight : tone.border,
                    backgroundColor: tone.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: !isFree ? 0.55 : pressed ? 0.85 : 1,
                    shadowColor: '#000',
                    shadowOpacity: isSelected ? 0.18 : 0,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 6 },
                  })}
                >
                  <Text style={{ color: Colors.text, fontWeight: '900', fontSize: 14 }}>{slotNo}</Text>
                  <Text style={{ color: tone.text, fontWeight: '700', fontSize: 11 }}>
                    {slotStateLabel(state)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function LegendChip({ label, tone }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: tone.border,
        backgroundColor: tone.bg,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: tone.text }} />
      <Text style={{ color: Colors.text, fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </View>
  );
}

