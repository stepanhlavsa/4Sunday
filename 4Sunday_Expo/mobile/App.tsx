import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  ApiError,
  loadSession,
  saveSession,
  request,
  clearConnection,
  normalize,
  Session,
  Song,
  EventItem,
  TeamEvent,
  MenuItem,
  ExportFile,
} from "./src/api";
import { shareFile } from "./src/files";
import TransportHost from "./src/TransportHost";
import { demoEvents, demoSongs, demoTeam, demoMenu } from "./src/demo";
type Tab = "events" | "songs" | "team" | "menu";
type Preview = {
  title: string;
  text: string;
  links?: { label: string; url: string }[];
  file?: ExportFile;
};
function Button({
  title,
  onPress,
  disabled = false,
  danger = false,
  primary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        primary && s.primary,
        danger && s.danger,
        (pressed || disabled) && { opacity: 0.5 },
      ]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <TransportHost />
      <Main />
    </SafeAreaProvider>
  );
}
function Main() {
  const [session, setSession] = useState<Session | null>(null),
    [demo, setDemo] = useState(false),
    [boot, setBoot] = useState(true);
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [remember, setRemember] = useState(true);
  const [tab, setTab] = useState<Tab>("events"),
    [eid, setEid] = useState(0),
    [query, setQuery] = useState(""),
    [expanded, setExpanded] = useState<number | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]),
    [songs, setSongs] = useState<Song[]>([]),
    [team, setTeam] = useState<TeamEvent[]>([]),
    [menu, setMenu] = useState<MenuItem[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null);
  const [confirmation, setConfirmation] = useState<{
    text: string;
    run: () => Promise<void>;
  } | null>(null);
  const lock = useRef(false);
  function clearData() {
    setEvents([]);
    setSongs([]);
    setTeam([]);
    setMenu([]);
    setPreview(null);
    setConfirmation(null);
    setExpanded(null);
    setEid(0);
    setQuery("");
    setTab("events");
  }
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operace selhala.");
      if (e instanceof ApiError && e.status === 401) {
        setSession(null);
        clearData();
        clearConnection();
        await saveSession(null).catch(() => {});
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function refresh(current: Session, view: Tab, eventId: number) {
    const home = await request<{ events: EventItem[]; menu: MenuItem[] }>(
      current,
      "events",
    );
    let catalog: Song[] = [];
    let upcoming: TeamEvent[] = [];
    if (view === "songs") {
      const r = await request<{ songs: Song[]; warning: string }>(
        current,
        "songs",
        { eid: eventId },
      );
      catalog = r.songs;
      if (r.warning) setNotice(r.warning);
    }
    if (view === "team")
      upcoming = (
        await request<{ events: TeamEvent[] }>(current, "team_events")
      ).events;
    setEvents(home.events);
    setMenu(home.menu);
    setSongs(catalog);
    setTeam(upcoming);
  }
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const saved = await loadSession();
        if (!live) return;
        if (saved) {
          setUsername(saved.username);
          setSession(saved);
          await run(() => refresh(saved, "events", 0));
        }
      } catch {
        if (live)
          setError("Uložené přihlášení nelze přečíst. Přihlaste se znovu.");
      } finally {
        if (live) setBoot(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  function navigate(next: Tab, eventId = 0) {
    if (lock.current) return;
    setTab(next);
    setEid(eventId);
    setExpanded(null);
    setQuery("");
    setError("");
    setNotice("");
    setSongs([]);
    setTeam([]);
    if (demo) {
      setEvents(demoEvents);
      setSongs(demoSongs);
      setTeam(demoTeam);
      setMenu(demoMenu);
      return;
    }
    if (session) void run(() => refresh(session, next, eventId));
  }
  async function login() {
    const next: Session = { username: username.trim(), password };
    await request(next, "login");
    setSession(next);
    setPassword("");
    setDemo(false);
    clearData();
    try {
      await saveSession(remember ? next : null);
    } catch {
      setNotice("Přihlášení funguje, ale nepodařilo se je uložit do telefonu.");
    }
    await refresh(next, "events", 0);
  }
  function startDemo() {
    clearData();
    setDemo(true);
    setError("");
    setNotice("");
    setEvents(demoEvents);
    setSongs(demoSongs);
    setTeam(demoTeam);
    setMenu(demoMenu);
  }
  async function mutate(action: string, params: Record<string, unknown>) {
    if (!session) return;
    const r = await request<{ message: string }>(session, action, params);
    // Never retry a toggle automatically: it may have succeeded before a timeout.
    if (action === "activate_team") {
      clearData();
      await refresh(session, "events", 0);
    } else await refresh(session, tab, eid);
    setNotice(r.message);
  }
  function confirm(text: string, fn: () => Promise<void>) {
    setConfirmation({ text, run: fn });
  }
  function external(link: string) {
    try {
      const u = new URL(link);
      if (
        u.protocol !== "https:" ||
        u.hostname !== "www.wtts.org" ||
        u.username ||
        u.password
      )
        throw Error();
    } catch {
      setError("Odkaz není povolen.");
      return;
    }
    confirm(
      "Otevřít WTTS v prohlížeči? Prohlížeč má vlastní přihlášení, může vás požádat o jméno a heslo.",
      () => Linking.openURL(link).then(() => {}),
    );
  }
  async function exportItem(
    kind: "song" | "event",
    id: number,
    format: "PDF" | "XML",
    title: string,
  ) {
    if (demo) {
      setPreview({
        title,
        text: "Demonstrační režim: export používá skutečná data až po přihlášení k WTTS.",
      });
      return;
    }
    if (!session) return;
    const file = await request<ExportFile>(session, "export", {
      kind,
      id,
      format,
    });
    if (format === "PDF") await shareFile(file);
    else
      setPreview({
        title,
        text: file.text || "Export neobsahuje čitelný text.",
        file,
      });
  }
  async function dialog(song: Song, type: string) {
    if (!session) return;
    const data = await request<{
      text: string;
      links: { label: string; url: string }[];
    }>(session, "dialog", { sid: song.sid, type });
    setPreview({
      title:
        (type === "attachments" ? "Přílohy · " : "Náhled editace · ") +
        song.name,
      text:
        "Informativní náhled. Ukládání změn a správa příloh nejsou podporovány ani ve zdrojovém PHP.\n\n" +
        data.text,
      links: data.links,
    });
  }
  function songCard(song: Song, index: number, catalog = false) {
    const open = !catalog || expanded === song.sid;
    return (
      <View style={s.song} key={`${song.sid}-${index}`}>
        <Pressable
          disabled={!catalog || busy}
          accessibilityRole={catalog ? "button" : undefined}
          onPress={() => setExpanded(open ? null : song.sid)}
          style={s.songHead}
        >
          <View style={s.number}>
            <Text style={s.numberText}>
              {String(index + 1).padStart(2, "0")}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.songTitle}>{song.name}</Text>
            <Text style={s.muted}>Tónina {song.key || "neuvedena"}</Text>
          </View>
          {catalog && <Text style={s.accent}>{open ? "−" : "+"}</Text>}
        </Pressable>
        {open && (
          <View style={s.songActions}>
            <View style={s.row}>
              {(song.pdf || song.actions?.PDF) && (
                <Button
                  title="PDF ↗"
                  primary
                  disabled={busy}
                  onPress={() =>
                    void run(() =>
                      exportItem("song", song.sid, "PDF", song.name),
                    )
                  }
                />
              )}
              {(song.xml || song.actions?.XML) && (
                <Button
                  title="Text / XML"
                  disabled={busy}
                  onPress={() =>
                    void run(() =>
                      exportItem("song", song.sid, "XML", song.name),
                    )
                  }
                />
              )}
            </View>
            {catalog && (
              <>
                <Text style={s.muted}>
                  Naposledy: {song.last_planned || "neuvedeno"}
                </Text>
                {!!eid && !!song.schedule && (
                  <Button
                    title="Plánovat / odebrat"
                    primary
                    disabled={busy}
                    onPress={() =>
                      confirm(
                        `Změnit zařazení písně „${song.name}“ v události č. ${eid}?`,
                        () => mutate("schedule", { eid, sid: song.sid }),
                      )
                    }
                  />
                )}
                <View style={s.row}>
                  {song.attachments && (
                    <Button
                      title="Přílohy"
                      disabled={busy}
                      onPress={() =>
                        void run(() => dialog(song, "attachments"))
                      }
                    />
                  )}
                  {song.editable && (
                    <Button
                      title="Náhled editace"
                      disabled={busy}
                      onPress={() => void run(() => dialog(song, "edit-song"))}
                    />
                  )}
                  {song.drawer && (
                    <Button
                      title="Do šuplíku"
                      danger
                      disabled={busy}
                      onPress={() =>
                        confirm(
                          `Přesunout „${song.name}“ do šuplíku na WTTS?`,
                          () => mutate("drawer", { sid: song.sid }),
                        )
                      }
                    />
                  )}
                </View>
              </>
            )}
          </View>
        )}
      </View>
    );
  }
  function menuNode(
    item: MenuItem,
    path: number[],
    parents: string[] = [],
  ): React.ReactNode {
    const activation =
      path.length === 3 &&
      ["tym", "team"].includes(normalize(parents[0])) &&
      ["aktivovat", "activate"].includes(normalize(parents[1]));
    function choose() {
      if (activation) {
        if (!demo)
          confirm(`Aktivovat tým „${item.label}“?`, () =>
            mutate("activate_team", { path, label: item.label }),
          );
        return;
      }
      if (!item.url) return;
      const command = new URL(item.url).searchParams.get("command");
      if (command === "scheduled-events") navigate("events");
      else if (command === "list-team-events") navigate("team");
      else if (command === "list-songs") navigate("songs");
      else external(item.url);
    }
    return (
      <View
        key={path.join(".")}
        style={{
          marginLeft: path.length > 1 ? 12 : 0,
          gap: 8,
          marginBottom: 10,
        }}
      >
        {item.url || activation ? (
          <Button
            title={item.label + (activation ? " →" : "")}
            disabled={busy}
            onPress={choose}
          />
        ) : (
          <Text style={s.section}>{item.label}</Text>
        )}
        {item.children.map((c, i) =>
          menuNode(c, [...path, i], [...parents, item.label]),
        )}
      </View>
    );
  }
  const active = !!session || demo;
  if (boot)
    return (
      <SafeAreaView style={s.screen}>
        <ActivityIndicator color="#68d6ba" style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <View>
          <Text style={s.logo}>
            4Sunday<Text style={s.accent}>.</Text>
          </Text>
          <Text style={s.muted}>
            {demo
              ? "UKÁZKOVÁ DATA"
              : active
                ? "Váš tým. Vaše písně."
                : "HUDBA PRO SPOLEČNÉ CHVÍLE"}
          </Text>
        </View>
        {active && (
          <Button
            title="Obnovit"
            disabled={busy}
            onPress={() =>
              demo
                ? navigate(tab, eid)
                : void run(() => refresh(session!, tab, eid))
            }
          />
        )}
      </View>
      {!!error && (
        <View style={s.error}>
          <Text accessibilityRole="alert" style={s.errorText}>
            {error}
          </Text>
        </View>
      )}
      {!!notice && (
        <View style={s.notice}>
          <Text style={s.text}>{notice}</Text>
        </View>
      )}
      {busy && (
        <View style={s.loading}>
          <ActivityIndicator color="#68d6ba" />
          <Text style={s.muted}>Komunikuji s WTTS…</Text>
        </View>
      )}
      {!active ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.content}
          >
            <View style={s.hero}>
              <Text style={s.eyebrow}>VÍTEJTE</Text>
              <Text style={s.heading}>{"Vše připravené\nna neděli."}</Text>
              <Text style={s.subtitle}>
                Písně, plánování a zpěvníky z WTTS na jednom místě.
              </Text>
            </View>
            <View style={s.card}>
              <Text style={s.section}>Přihlášení k WTTS</Text>
              {Platform.OS === "web" && (
                <Text style={s.muted}>
                  Na webu je dostupná ukázka. Pro přímé připojení použijte
                  aplikaci na Androidu nebo iOS.
                </Text>
              )}
              <Text style={s.muted}>Uživatelské jméno / e-mail</Text>
              <TextInput
                accessibilityLabel="Uživatelské jméno"
                style={s.input}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                editable={!busy}
              />
              <Text style={s.muted}>Heslo WTTS</Text>
              <TextInput
                accessibilityLabel="Heslo"
                style={s.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                editable={!busy}
              />
              {Platform.OS !== "web" && (
                <View style={s.row}>
                  <Switch
                    value={remember}
                    onValueChange={setRemember}
                    disabled={busy}
                    trackColor={{ true: "#319b83" }}
                  />
                  <Text style={s.text}>Zapamatovat přihlášení</Text>
                </View>
              )}
              <Text style={s.muted}>
                Připojení přímo k www.wtts.org. Při zapnutí zapamatování se
                jméno a heslo uloží do zabezpečeného úložiště telefonu.
              </Text>
              <Button
                title="Přihlásit se →"
                primary
                disabled={
                  busy || !username || !password || Platform.OS === "web"
                }
                onPress={() => void run(login)}
              />
            </View>
            <Button
              title="Prohlédnout ukázku bez přihlášení"
              disabled={busy}
              onPress={startDemo}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <>
          <View style={s.titleRow}>
            <Text style={s.heading}>
              {tab === "events"
                ? "Nedělní plán"
                : tab === "songs"
                  ? eid
                    ? "Plánovat písně"
                    : "Písně"
                  : tab === "team"
                    ? "Události"
                    : "Váš prostor"}
            </Text>
            <Text style={s.muted}>
              {tab === "events"
                ? `${events.length} událostí`
                : tab === "songs"
                  ? `${songs.length} písní`
                  : ""}
            </Text>
          </View>
          {tab === "songs" && (
            <View style={s.searchBox}>
              {!!eid && (
                <View style={s.row}>
                  <Text style={s.muted}>Událost č. {eid}</Text>
                  <Button
                    title="Zpět na plán"
                    disabled={busy}
                    onPress={() => navigate("events")}
                  />
                </View>
              )}
              <TextInput
                style={s.input}
                accessibilityLabel="Vyhledat píseň"
                placeholder="Hledat píseň…"
                placeholderTextColor="#8291a8"
                value={query}
                onChangeText={setQuery}
              />
            </View>
          )}
          {tab === "songs" ? (
            <FlatList
              data={songs.filter((x) =>
                normalize(x.name).includes(normalize(query)),
              )}
              keyExtractor={(x, i) => `${x.sid}-${i}`}
              renderItem={({ item, index }) => songCard(item, index, true)}
              contentContainerStyle={s.content}
              ListEmptyComponent={
                <Text style={s.empty}>
                  {busy ? "Načítám…" : "Žádné odpovídající písně."}
                </Text>
              }
              refreshing={busy}
              onRefresh={() =>
                demo
                  ? navigate(tab, eid)
                  : void run(() => refresh(session!, tab, eid))
              }
            />
          ) : (
            <ScrollView contentContainerStyle={s.content}>
              {tab === "events" && (
                <>
                  {events.map((event) => (
                    <View key={event.eid} style={s.card}>
                      <Text style={s.eyebrow}>
                        SPOLEČNĚ · {event.songs.length} PÍSNÍ
                      </Text>
                      <Text style={s.eventTitle}>{event.title}</Text>
                      <View style={s.row}>
                        {event.links.plan && (
                          <Button
                            title="Plánovat"
                            primary
                            disabled={busy}
                            onPress={() => navigate("songs", event.eid)}
                          />
                        )}
                        {event.links.pdf && (
                          <Button
                            title="PDF zpěvník"
                            disabled={busy}
                            onPress={() =>
                              void run(() =>
                                exportItem(
                                  "event",
                                  event.eid,
                                  "PDF",
                                  event.title,
                                ),
                              )
                            }
                          />
                        )}
                        {event.links.xml && (
                          <Button
                            title="XML"
                            disabled={busy}
                            onPress={() =>
                              void run(() =>
                                exportItem(
                                  "event",
                                  event.eid,
                                  "XML",
                                  event.title,
                                ),
                              )
                            }
                          />
                        )}
                      </View>
                      {event.songs.map((song, i) => songCard(song, i))}
                    </View>
                  ))}
                  {!events.length && !busy && (
                    <Text style={s.empty}>
                      Žádné naplánované události. Zkuste jiný tým v Menu.
                    </Text>
                  )}
                  <Text style={s.muted}>
                    Řazení písní na WTTS zatím není podporováno. Pořadí odpovídá
                    načtenému plánu.
                  </Text>
                </>
              )}
              {tab === "team" && (
                <>
                  {team.map((event) => (
                    <View key={event.eid} style={s.card}>
                      <Text style={s.eyebrow}>{event.date}</Text>
                      <Text style={s.eventTitle}>{event.title}</Text>
                      <Text style={s.subtitle}>
                        Plánuje: {event.scheduler || "neuvedeno"}
                      </Text>
                      {event.plan && (
                        <Button
                          title="Plánovat písně →"
                          primary
                          disabled={busy}
                          onPress={() => navigate("songs", event.eid)}
                        />
                      )}
                      {event.toggle && (
                        <Button
                          title="Změnit plánujícího"
                          disabled={busy}
                          onPress={() =>
                            confirm(
                              `Změnit plánujícího události „${event.title}“?`,
                              () =>
                                mutate("team_event", {
                                  eid: event.eid,
                                  operation: "toggle",
                                }),
                            )
                          }
                        />
                      )}
                      {event.cancel && (
                        <Button
                          title="Zrušit událost"
                          danger
                          disabled={busy}
                          onPress={() =>
                            confirm(
                              `Opravdu zrušit událost „${event.title}“ na WTTS?`,
                              () =>
                                mutate("team_event", {
                                  eid: event.eid,
                                  operation: "cancel",
                                }),
                            )
                          }
                        />
                      )}
                    </View>
                  ))}
                  {!team.length && !busy && (
                    <Text style={s.empty}>Žádné následující události.</Text>
                  )}
                </>
              )}
              {tab === "menu" && (
                <>
                  <View style={s.card}>
                    <Text style={s.section}>
                      {session?.username || "Demonstrační účet"}
                    </Text>
                    <Text style={s.muted}>
                      Položky menu pocházejí z WTTS. Ostatní funkce se otevírají
                      v prohlížeči s vlastním přihlášením.
                    </Text>
                  </View>
                  {menu.map((item, i) => menuNode(item, [i]))}
                  <Button
                    title={demo ? "Ukončit ukázku" : "Odhlásit"}
                    danger
                    disabled={busy}
                    onPress={() =>
                      confirm("Odhlásit se z 4Sunday?", async () => {
                        let remoteError = false;
                        try {
                          if (session) await request(session, "logout");
                        } catch {
                          remoteError = true;
                        }
                        await saveSession(null);
                        clearConnection();
                        setSession(null);
                        setDemo(false);
                        clearData();
                        if (remoteError)
                          setNotice(
                            "Údaje byly odstraněny z telefonu a místní relace ukončena. Odhlášení na WTTS se kvůli spojení nepodařilo potvrdit.",
                          );
                      })
                    }
                  />
                </>
              )}
            </ScrollView>
          )}
          <View style={s.tabs}>
            {(
              [
                ["events", "◷", "Plán"],
                ["songs", "♫", "Písně"],
                ["team", "▦", "Události"],
                ["menu", "☰", "Menu"],
              ] as const
            ).map(([id, icon, label]) => (
              <Pressable
                key={id}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === id, disabled: busy }}
                disabled={busy}
                style={[s.tab, tab === id && s.selectedTab]}
                onPress={() => navigate(id)}
              >
                <Text style={[s.tabIcon, tab === id && s.accent]}>{icon}</Text>
                <Text style={[s.muted, tab === id && s.accent]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <Modal
        visible={!!preview}
        animationType="slide"
        onRequestClose={() => setPreview(null)}
      >
        <SafeAreaView style={s.screen}>
          <View style={s.header}>
            <Text style={[s.section, { flex: 1 }]}>{preview?.title}</Text>
            <Button title="Zavřít" onPress={() => setPreview(null)} />
          </View>
          <ScrollView contentContainerStyle={s.content}>
            <Text selectable style={s.previewText}>
              {preview?.text}
            </Text>
            {preview?.file && (
              <>
                <Text style={s.muted}>
                  Textový náhled nezachovává sazbu. Pro tisk použijte PDF. XML
                  je původní výstup WTTS, který může obsahovat i HTML.
                </Text>
                <Button
                  title="Uložit / sdílet původní XML"
                  primary
                  disabled={busy}
                  onPress={() => void run(() => shareFile(preview.file!))}
                />
              </>
            )}
            {preview?.links?.map((l, i) => (
              <Button
                key={i}
                title={l.label}
                onPress={() => {
                  setPreview(null);
                  external(l.url);
                }}
              />
            ))}
          </ScrollView>
          {!!error && <Text style={s.errorText}>{error}</Text>}
        </SafeAreaView>
      </Modal>
      <Modal
        visible={!!confirmation}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmation(null)}
      >
        <View style={s.overlay}>
          <View style={s.confirm}>
            <Text style={s.section}>Potvrzení</Text>
            <Text style={s.subtitle}>{confirmation?.text}</Text>
            <View style={s.row}>
              <Button title="Zpět" onPress={() => setConfirmation(null)} />
              <Button
                title="Pokračovat"
                primary
                onPress={() => {
                  const fn = confirmation?.run;
                  setConfirmation(null);
                  if (fn) void run(fn);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0c1422" },
  header: {
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: "#263346",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    fontSize: 29,
    fontWeight: "800",
    color: "#f4f6fa",
    letterSpacing: -1,
  },
  accent: { color: "#6de0be" },
  text: { color: "#eaf0f8", fontSize: 15 },
  muted: { color: "#9dacc0", fontSize: 13, lineHeight: 20 },
  content: {
    padding: 18,
    gap: 16,
    paddingBottom: 32,
    width: "100%",
    maxWidth: 860,
    alignSelf: "center",
  },
  hero: { paddingVertical: 20, gap: 14 },
  eyebrow: {
    color: "#6de0be",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  heading: {
    fontSize: 29,
    lineHeight: 37,
    color: "#f2f5fa",
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  subtitle: { color: "#b8c5d7", fontSize: 16, lineHeight: 25 },
  card: {
    backgroundColor: "#142033",
    borderColor: "#29374c",
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 14,
  },
  section: { color: "#eff4fb", fontSize: 19, fontWeight: "700" },
  input: {
    backgroundColor: "#0c1728",
    borderColor: "#34465f",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: "#f3f7fc",
    fontSize: 16,
    minHeight: 50,
  },
  button: {
    backgroundColor: "#223149",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 12,
    minHeight: 46,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  primary: { backgroundColor: "#237e69" },
  danger: { backgroundColor: "#65333e" },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 9 },
  song: {
    backgroundColor: "#17253a",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 8,
  },
  songHead: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    gap: 12,
  },
  number: { width: 32, height: 34, justifyContent: "center" },
  numberText: { color: "#6de0be", fontSize: 15, fontWeight: "700" },
  songTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#eff4fb",
    lineHeight: 25,
  },
  songActions: { paddingHorizontal: 14, paddingBottom: 14, gap: 12 },
  eventTitle: {
    fontSize: 22,
    color: "#f4f7fc",
    fontWeight: "700",
    lineHeight: 29,
  },
  titleRow: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 4,
  },
  searchBox: { paddingHorizontal: 18, paddingBottom: 10, gap: 9 },
  empty: { color: "#a8b6ca", textAlign: "center", padding: 25, lineHeight: 24 },
  tabs: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: "#2a374b",
    padding: 8,
    gap: 4,
    backgroundColor: "#101b2c",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    gap: 4,
    borderRadius: 12,
  },
  selectedTab: { backgroundColor: "#1b3540" },
  tabIcon: { color: "#b0bfd2", fontSize: 22 },
  error: {
    backgroundColor: "#482933",
    padding: 14,
    margin: 12,
    borderRadius: 12,
  },
  errorText: { color: "#ffccd1", fontSize: 14, lineHeight: 22, padding: 5 },
  notice: {
    backgroundColor: "#1d3a3b",
    padding: 12,
    marginHorizontal: 12,
    borderRadius: 12,
  },
  loading: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    padding: 10,
  },
  previewText: { color: "#eaf0f8", fontSize: 17, lineHeight: 28 },
  overlay: {
    flex: 1,
    backgroundColor: "#000b",
    justifyContent: "center",
    padding: 24,
  },
  confirm: {
    backgroundColor: "#17253a",
    borderRadius: 20,
    padding: 24,
    gap: 20,
    maxWidth: 550,
    width: "100%",
    alignSelf: "center",
  },
});
