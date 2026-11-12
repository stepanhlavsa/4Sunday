import React, { useEffect, useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import type { Song } from "./api";

export type DragScroll = {
  offset: () => number;
  begin: () => void;
  step: (pageY: number) => number;
};
type Props = {
  songs: Song[];
  disabled: boolean;
  scroll: DragScroll;
  onDragging: (active: boolean) => void;
  onReorder: (songs: Song[]) => void;
  renderSong: (song: Song, index: number) => React.ReactNode;
};
type Row = { y: number; height: number };
type Drag = {
  from: number;
  to: number;
  dy: number;
  startY: number;
  pageY: number;
  scrollY: number;
  rows: Row[];
};
export function moved<T>(items: T[], from: number, to: number): T[] {
  const copy = [...items];
  copy.splice(to, 0, copy.splice(from, 1)[0]);
  return copy;
}

/** Separate handle preserves taps on PDF/XML and ordinary scrolling on cards. */
export default function DraggableSongs(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const rows = useRef<Row[]>([]);
  const active = useRef<Drag | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const valid =
    props.songs.length > 1 &&
    props.songs.every((s) => s.sid > 0) &&
    new Set(props.songs.map((s) => s.sid)).size === props.songs.length;
  function stop(commit: boolean) {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    const d = active.current;
    active.current = null;
    setDrag(null);
    latest.current.onDragging(false);
    if (commit && d && d.from !== d.to)
      latest.current.onReorder(moved(latest.current.songs, d.from, d.to));
  }
  function update(pageY: number, autoScroll: boolean) {
    const d = active.current;
    if (!d) return;
    const offset = autoScroll
      ? latest.current.scroll.step(pageY)
      : latest.current.scroll.offset();
    const row = d.rows[d.from];
    const last = d.rows[d.rows.length - 1];
    const dy = Math.max(
      -row.y,
      Math.min(
        last.y + last.height - row.y - row.height,
        pageY - d.startY + offset - d.scrollY,
      ),
    );
    const center =
      row.y + row.height / 2 + pageY - d.startY + offset - d.scrollY;
    let to = d.from;
    for (let i = 0; i < d.rows.length; i++) {
      const middle = d.rows[i].y + d.rows[i].height / 2;
      if (i < d.from && center < middle) {
        to = i;
        break;
      }
      if (i > d.from && center > middle) to = i;
    }
    active.current = { ...d, pageY, dy, to };
    setDrag(active.current);
  }
  function begin(index: number, pageY: number) {
    if (
      latest.current.disabled ||
      !valid ||
      active.current ||
      latest.current.songs.some((_, i) => !rows.current[i]?.height)
    )
      return;
    latest.current.scroll.begin();
    active.current = {
      from: index,
      to: index,
      dy: 0,
      startY: pageY,
      pageY,
      scrollY: latest.current.scroll.offset(),
      rows: rows.current
        .slice(0, latest.current.songs.length)
        .map((r) => ({ ...r })),
    };
    setDrag(active.current);
    latest.current.onDragging(true);
    ticker.current = setInterval(() => {
      if (active.current) update(active.current.pageY, true);
    }, 32);
  }
  useEffect(
    () => () => {
      if (ticker.current) clearInterval(ticker.current);
      if (active.current) latest.current.onDragging(false);
    },
    [],
  );
  return (
    <View>
      {props.songs.map((song, index) => {
        const selected = drag?.from === index;
        let shift = 0;
        if (drag) {
          if (selected) shift = drag.dy;
          else if (index > drag.from && index <= drag.to)
            shift = -drag.rows[drag.from].height;
          else if (index < drag.from && index >= drag.to)
            shift = drag.rows[drag.from].height;
        }
        return (
          <View
            key={song.sid + ":" + index}
            onLayout={(e) => {
              rows.current[index] = {
                y: e.nativeEvent.layout.y,
                height: e.nativeEvent.layout.height,
              };
            }}
            style={[
              styles.row,
              { transform: [{ translateY: shift }], zIndex: selected ? 10 : 0 },
              selected && styles.active,
            ]}
          >
            {valid && (
              <DragHandle
                label={`Přesunout píseň ${song.name}`}
                disabled={props.disabled}
                position={selected ? drag!.to + 1 : index + 1}
                total={props.songs.length}
                onStart={(y) => begin(index, y)}
                onMove={(y) => update(y, false)}
                onEnd={() => stop(true)}
                onCancel={() => stop(false)}
                onStep={(delta) => {
                  const to = index + delta;
                  if (!props.disabled && to >= 0 && to < props.songs.length)
                    props.onReorder(moved(props.songs, index, to));
                }}
              />
            )}
            <View style={styles.song}>{props.renderSong(song, index)}</View>
          </View>
        );
      })}
    </View>
  );
}
function DragHandle(props: {
  label: string;
  disabled: boolean;
  position: number;
  total: number;
  onStart: (y: number) => void;
  onMove: (y: number) => void;
  onEnd: () => void;
  onCancel: () => void;
  onStep: (delta: number) => void;
}) {
  const latest = useRef(props);
  latest.current = props;
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.disabled,
      onMoveShouldSetPanResponder: () => !latest.current.disabled,
      onPanResponderGrant: (e) => latest.current.onStart(e.nativeEvent.pageY),
      onPanResponderMove: (_, g) => latest.current.onMove(g.moveY),
      onPanResponderRelease: () => latest.current.onEnd(),
      onPanResponderTerminate: () => latest.current.onCancel(),
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    }),
  ).current;
  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={props.label}
      accessibilityHint="Přetažením změňte pořadí. Akce zvýšení posune dolů, snížení nahoru."
      accessibilityState={{ disabled: props.disabled }}
      accessibilityValue={{ min: 1, max: props.total, now: props.position }}
      accessibilityActions={[
        { name: "increment", label: "Posunout dolů" },
        { name: "decrement", label: "Posunout nahoru" },
      ]}
      onAccessibilityAction={(e) =>
        props.onStep(e.nativeEvent.actionName === "increment" ? 1 : -1)
      }
      style={[styles.handle, props.disabled && styles.disabled]}
    >
      <Text selectable={false} style={styles.icon}>
        ☰
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "stretch", gap: 6 },
  song: { flex: 1, minWidth: 0 },
  handle: {
    width: 42,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: "#263d55",
    justifyContent: "center",
    alignItems: "center",
  },
  icon: { color: "#8fe6ce", fontSize: 24 },
  disabled: { opacity: 0.45 },
  active: {
    backgroundColor: "#244b4a",
    borderRadius: 14,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
