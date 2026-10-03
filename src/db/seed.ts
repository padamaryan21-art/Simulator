import { config } from "dotenv";

config({ path: ".env.local" });
config();

/**
 * Idempotent seed. Contains NO credentials or sessions.
 * Personas/topics are starting points; everything is editable from the dashboard.
 */
async function main() {
  const { db } = await import("./index");
  const s = await import("./schema");

  const accountSeeds = [
    { displayName: "Rodel Gonzales", username: "RodelGonzales2002" },
    { displayName: "Jennelyn", username: "AteJen" },
    { displayName: "Cecille Cruz", username: "AteTess1996" },
    { displayName: "Ma. Grace", username: "whiterabbitxoxo00" },
    { displayName: "Ernesto", username: "Ernesto0002" },
  ];
  await db.insert(s.telegramAccounts).values(accountSeeds).onConflictDoNothing();
  const accounts = await db.select().from(s.telegramAccounts);
  const accountByUsername = new Map(accounts.map((a) => [a.username, a]));

  const personaSeeds = [
    {
      name: "Rodel",
      username: "RodelGonzales2002",
      personality: "Easygoing, jokey, mahilig mang-asar nang pabiro.",
      occupation: "",
      languageStyle: "Casual Taglish, maiikling mensahe.",
      messageLength: "SHORT" as const,
    },
    {
      name: "Jennelyn",
      username: "AteJen",
      personality: "Maalaga, madaldal, parang ate ng barkada.",
      occupation: "",
      languageStyle: "Tagalog na may konting English, may 'te' at 'naman'.",
      messageLength: "MEDIUM" as const,
    },
    {
      name: "Cecille",
      username: "AteTess1996",
      personality: "Praktikal, tahimik minsan, diretso magsalita.",
      occupation: "",
      languageStyle: "Taglish, straightforward.",
      messageLength: "SHORT" as const,
    },
    {
      name: "Ma. Grace",
      username: "whiterabbitxoxo00",
      personality: "Masayahin, mahilig sa emoji at kwento tungkol sa araw-araw.",
      occupation: "",
      languageStyle: "Malambing na Tagalog, madalas may emoji.",
      messageLength: "MEDIUM" as const,
      emojiFrequency: 70,
    },
    {
      name: "Ernesto",
      username: "Ernesto0002",
      personality: "Medyo seryoso, mahilig magbigay ng payo, minsan nagbibiro.",
      occupation: "",
      languageStyle: "Tagalog, bihirang mag-emoji.",
      messageLength: "SHORT" as const,
      emojiFrequency: 10,
    },
  ];

  const existingPersonas = await db.select().from(s.personas);
  const personaIds: string[] = [];
  for (const { username, ...p } of personaSeeds) {
    const acct = accountByUsername.get(username);
    const found = existingPersonas.find((x) => x.name === p.name);
    if (found) {
      personaIds.push(found.id);
      continue;
    }
    const [row] = await db
      .insert(s.personas)
      .values({ ...p, telegramAccountId: acct?.id })
      .returning({ id: s.personas.id });
    personaIds.push(row.id);
  }

  const groupSeeds = [
    {
      name: "LakiPH Private Simulation",
      type: "PRIVATE_SIMULATION" as const,
      purpose: "Testing Claude-generated conversations.",
      automationEnabled: true,
      requiresApproval: true,
      url: null,
    },
    {
      name: "LakiPH Community",
      type: "REAL_COMMUNITY" as const,
      purpose: "Real community. Human approval required for every message.",
      automationEnabled: false,
      requiresApproval: true,
      url: "https://t.me/LakiPHCommunity",
    },
  ];
  const existingGroups = await db.select().from(s.groups);
  for (const g of groupSeeds) {
    if (existingGroups.some((x) => x.name === g.name)) continue;
    const [row] = await db.insert(s.groups).values(g).returning({ id: s.groups.id });
    if (g.type === "PRIVATE_SIMULATION") {
      await db
        .insert(s.groupParticipants)
        .values(personaIds.map((personaId) => ({ groupId: row.id, personaId })));
    }
  }

  const categories = [
    "LAKIPH",
    "FOOD",
    "WORK",
    "FAMILY",
    "HOBBY",
    "SHOPPING",
    "MOVIES",
    "MUSIC",
    "WEEKEND",
    "WEATHER",
    "DAILY_LIFE",
    "RANDOM",
    "CUSTOM",
  ];
  await db
    .insert(s.topicCategories)
    .values(categories.map((key) => ({ key, label: key.replace("_", " ") })))
    .onConflictDoNothing();
  const cats = await db.select().from(s.topicCategories);
  const catId = (k: string) => cats.find((c) => c.key === k)!.id;

  const existingTopics = await db.select({ title: s.topics.title }).from(s.topics);
  const topicSeeds = [
    // FOOD
    ["FOOD", "Ulam ngayong gabi", "Pag-usapan kung ano ang kinain o lulutuin."],
    [
      "FOOD",
      "Street food cravings",
      "Isaw, fishball, kwek-kwek: ano ang paborito at saan masarap.",
    ],
    [
      "FOOD",
      "Almusal vs. tanghalian",
      "Ano ang kinakain tuwing umaga at kung nakakapag-almusal pa ba.",
    ],
    ["FOOD", "Kape o milk tea?", "Debate tungkol sa kape, milk tea at iba pang inumin."],
    ["FOOD", "Handaan at pagkain sa okasyon", "Mga pagkain sa pista, birthday at Noche Buena."],
    [
      "FOOD",
      "Diet na hindi natutuloy",
      "Pagtatangkang magdiet at mga tukso ng masarap na pagkain.",
    ],
    // WORK
    ["WORK", "Pagod sa trabaho", "Kwentuhan tungkol sa araw sa trabaho."],
    ["WORK", "Sahod at budget", "Kung paano pinagkakasya ang sahod hanggang katapusan."],
    ["WORK", "Mga katrabaho at boss", "Mga nakakatawa o nakakainis na pangyayari sa opisina."],
    ["WORK", "Overtime at puyat", "Reklamo at tips kapag may OT at kulang sa tulog."],
    ["WORK", "Side hustle", "Mga raket o maliit na negosyo sa tabi ng trabaho."],
    // FAMILY
    ["FAMILY", "Kwento ng pamilya", "Mga kwento tungkol sa nanay, tatay, kapatid at anak."],
    ["FAMILY", "Mga pamangkin", "Kakulitan at kwento tungkol sa mga pamangkin."],
    ["FAMILY", "Uwi sa probinsya", "Plano o alaala ng pag-uwi sa probinsya."],
    ["FAMILY", "Bahay at gawaing-bahay", "Linis, laba, luto at pag-aayos ng bahay."],
    ["FAMILY", "Reunion at pagtitipon", "Mga family gathering at kung sino ang laging late."],
    // HOBBY
    ["HOBBY", "Mga libangan ngayon", "Ano ang pinagkakaabalahan tuwing libre."],
    ["HOBBY", "Mobile games", "Mga nilalaro sa phone at kung sino ang adik."],
    ["HOBBY", "Pagluluto at baking", "Mga nasubukang recipe at pumalpak na luto."],
    ["HOBBY", "Pag-eehersisyo", "Jogging, zumba, gym o plano na hindi natutuloy."],
    ["HOBBY", "Halaman at alaga", "Mga halaman, aso at pusa sa bahay."],
    // SHOPPING
    ["SHOPPING", "Online shopping", "Mga nabili online at mga hindi tugma sa picture."],
    ["SHOPPING", "Sale at 11.11", "Mga sale, voucher at pagpigil sa sarili."],
    ["SHOPPING", "Palengke vs. mall", "Saan mas tipid at mas masaya mamili."],
    ["SHOPPING", "Grocery at presyo ng bilihin", "Pagtaas ng presyo at mga tipid tips."],
    ["SHOPPING", "Bagong gadget", "Phone, earphones at iba pang gusto bilhin."],
    // MOVIES
    ["MOVIES", "Napanood kamakailan", "Mga palabas o pelikulang pinanood."],
    ["MOVIES", "Teleserye at K-drama", "Mga seryeng sinusubaybayan at spoiler warnings."],
    ["MOVIES", "Netflix marathon", "Mga pinag-puyatang panoorin."],
    ["MOVIES", "Paboritong pelikulang Pinoy", "Mga klasikong pelikulang Pinoy at mga linya."],
    // MUSIC
    ["MUSIC", "Kantang paulit-ulit", "Mga kantang pinapakinggan ngayon."],
    ["MUSIC", "OPM throwback", "Mga lumang kanta at alaala nito."],
    ["MUSIC", "Videoke night", "Mga kantang pang-videoke at sintunadong kaibigan."],
    ["MUSIC", "Concert at mga banda", "Mga gustong puntahang concert at paboritong banda."],
    // WEEKEND
    ["WEEKEND", "Plano sa weekend", "Ano ang gagawin sa darating na weekend."],
    ["WEEKEND", "Tamad na Linggo", "Pahinga, tulog at paglilinis tuwing Linggo."],
    ["WEEKEND", "Gala at lakad", "Mga lugar na gustong puntahan kasama ang barkada."],
    ["WEEKEND", "Simba at pagtitipon", "Mga gawain tuwing Linggo kasama ang pamilya."],
    // WEATHER
    ["WEATHER", "Ulan at init", "Kumusta ang panahon sa kani-kanilang lugar."],
    ["WEATHER", "Bagyo at baha", "Paghahanda at karanasan tuwing may bagyo."],
    ["WEATHER", "Sobrang init", "Reklamo sa init at paraan para makaiwas."],
    ["WEATHER", "Malamig na umaga", "Malamig na panahon at kumot na ayaw bitawan."],
    // DAILY_LIFE
    ["DAILY_LIFE", "Traffic at biyahe", "Reklamo at kwento tungkol sa biyahe."],
    ["DAILY_LIFE", "Gising nang maaga", "Gawain sa umaga at pagbangon kahit antok."],
    ["DAILY_LIFE", "Kuryente at internet", "Brownout, mabagal na WiFi at load."],
    ["DAILY_LIFE", "Mga kapitbahay", "Karaoke ng kapitbahay at mga chismis sa lugar."],
    ["DAILY_LIFE", "Bayarin at due dates", "Kuryente, tubig at iba pang bayarin."],
    ["DAILY_LIFE", "Pagtulog at puyat", "Gaano katagal natutulog at bakit puyat."],
    ["DAILY_LIFE", "Kumusta ka na?", "Simpleng kumustahan at update sa buhay."],
    // RANDOM
    ["RANDOM", "Random na tanong", "Kakaibang tanong na biglang naisip ng isa."],
    ["RANDOM", "Kung ikaw ang papipiliin", "Mga 'would you rather' na tanong."],
    ["RANDOM", "Nakakatawang alaala", "Nakakahiya o nakakatawang kwento noong kabataan."],
    ["RANDOM", "Mga meme at biro", "Mga nakitang meme at pabirong asaran."],
    ["RANDOM", "Pangarap at plano", "Mga pangarap sa susunod na taon."],
    ["RANDOM", "Mga pamahiin", "Mga pamahiin at paniniwala na sinusunod pa rin."],
  ] as const;
  const newTopics = topicSeeds.filter(
    ([, title]) => !existingTopics.some((t) => t.title === title),
  );
  if (newTopics.length) {
    await db.insert(s.topics).values(
      newTopics.map(([cat, title, description]) => ({
        categoryId: catId(cat),
        title,
        description,
        promptSeed: description,
      })),
    );
  }

  // LakiPH topics: low priority and long cooldown so the brand is never the constant subject.
  // The AI may only mention game names/facts that a person has Confirmed in LakiPH Knowledge.
  const lakiphTopicSeeds = [
    [
      "Mga laro sa LakiPH",
      "Casual na usapan tungkol sa mga uri ng laro sa LakiPH (Slots, Fish, Live Casino, Poker, Lottery).",
      "Banggitin lang ang mga uri at pangalan ng laro mula sa confirmed knowledge. Walang payo, hula, o pangako ng panalo.",
    ],
    [
      "Fishing games",
      "Pagkukwentuhan tungkol sa mga fishing game sa LakiPH.",
      "Ordinaryong kwentuhan tungkol sa konsepto ng fishing games at mga pangalang nasa confirmed knowledge. Walang tips sa pagpanalo.",
    ],
    [
      "Tongits at Pusoy",
      "Mga larong baraha na kilala ng mga Pilipino at kung paano nilalaro noon.",
      "Alaala at kwento tungkol sa Tongits at Pusoy kasama ang pamilya o barkada; banggitin ang LakiPH nang pasimple lamang kung confirmed sa knowledge.",
    ],
    [
      "Live casino at baccarat",
      "Usapan tungkol sa live casino games gaya ng baccarat at roulette bilang libangan.",
      "Pangkalahatang kuryosidad lamang; walang estratehiya, hula, o paghikayat na tumaya.",
    ],
    [
      "Pag-download ng app",
      "Mga tanong tungkol sa Android app at iOS Lite app ng LakiPH.",
      "Banggitin lamang ang mga app na nasa confirmed knowledge; walang links at walang paghikayat na mag-download.",
    ],
    [
      "Maglaro nang responsable",
      "Paalala tungkol sa 18+ at paglalaro nang may limitasyon.",
      "Magkaibigang nagpapaalalahanan na maglaro nang responsable, magtakda ng limitasyon, at huwag gamitin ang pambayad sa bills. Gamitin ang confirmed 18+ na paalala kung mayroon.",
    ],
  ] as const;
  const lakiphCat = catId("LAKIPH");
  const newLakiph = lakiphTopicSeeds.filter(
    ([title]) => !existingTopics.some((t) => t.title === title),
  );
  if (newLakiph.length) {
    await db.insert(s.topics).values(
      newLakiph.map(([title, description, promptSeed]) => ({
        categoryId: lakiphCat,
        title,
        description,
        promptSeed,
        priority: 2,
        cooldownMinutes: 720,
      })),
    );
  }

  await db.insert(s.automationState).values({ id: 1, state: "STOPPED" }).onConflictDoNothing();
  await db
    .insert(s.websiteSources)
    .values({ name: "LakiPH Website", baseUrl: "https://www.laki.ph/" })
    .onConflictDoNothing();

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
