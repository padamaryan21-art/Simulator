import type { PromptSpec } from "./build";

/**
 * The starter prompts. Each one asks for 80 conversations of 26 to 36 lines (2,080 to 2,880
 * lines), in batches of 5. Every prompt is about a different everyday topic, with 16 situations so
 * that 80 conversations never feel repetitive (each situation is used 5 times, from a new angle).
 *
 * There is a unit test that checks every one of them reaches 2,000+ lines, uses its own topic,
 * and contains nothing the importer would flag.
 */

const COMMON = { conversations: 80, linesMin: 26, linesMax: 36, batchSize: 5 } as const;

export type BuiltinPrompt = PromptSpec & { id: string; description: string };

export const BUILTIN_PROMPTS: BuiltinPrompt[] = [
  {
    id: "food-ulam-kainan",
    title: "Ulam at kainan",
    topic: "Pagkain at ulam",
    description: "Ano ang ulam, sino ang nagluto, mga paboritong pagkain at mga luto na pumalpak.",
    ...COMMON,
    situations: [
      {
        label: "Ano ulam mamaya",
        detail: "Nagtatanungan kung ano ang lulutuin o bibilhin, walang makapag-desisyon.",
      },
      {
        label: "Pumalyang luto",
        detail: "May nagkwento ng lutong nasunog, sobrang alat o walang lasa, at inaasar siya.",
      },
      {
        label: "Street food",
        detail: "Isaw, fishball, kwek-kwek, banana cue: ano ang paborito at saan masarap.",
      },
      { label: "Almusal", detail: "Tinapay, sinangag o wala talagang almusal dahil nagmamadali." },
      {
        label: "Kape o milk tea",
        detail: "Magkakaibang panlasa sa inumin; may nagsasabing sobrang tamis na ng milk tea.",
      },
      {
        label: "Handa sa okasyon",
        detail: "Inaalala ang handa sa birthday, pista o Noche Buena at ang sobrang daming tira.",
      },
      {
        label: "Diet na di natuloy",
        detail: "May nagsimulang magdiet pero natukso sa lechon kawali o ice cream.",
      },
      {
        label: "Lutong nanay",
        detail: "Namimiss ang luto ni nanay o ni lola, hindi mapantayan ng ibang luto.",
      },
      {
        label: "Libre pagkain",
        detail: "Sino ang manlilibre at sino ang laging nakakalimutan ang wallet, biruan.",
      },
      {
        label: "Tipid na ulam",
        detail: "Mga murang ulam ngayong mahal ang bilihin: itlog, tuyo, gulay, sardinas.",
      },
      {
        label: "Pagkain sa trabaho",
        detail: "Baon, kainan sa canteen at kung sino ang laging nanghihingi ng ulam.",
      },
      {
        label: "Merienda",
        detail: "Turon, pandesal, siomai, pancit: pinag-uusapan ang merienda ng hapon.",
      },
      {
        label: "Pagkaing probinsya",
        detail: "Mga pagkain na hinahanap kapag nasa Maynila: kakanin, daing, bagoong.",
      },
      {
        label: "Bagong kainan",
        detail: "May bagong bukas na karinderya o resto at nagkakayayaan kung masarap ba.",
      },
      {
        label: "Maanghang na challenge",
        detail: "Sino ang kayang kumain ng sobrang anghang at sino ang umiiyak na.",
      },
      {
        label: "Leftovers",
        detail: "Pagluluto ng tira kahapon para maging bagong ulam at ang tawad sa 'ulam kahapon'.",
      },
    ],
  },
  {
    id: "work-pagod-puyat",
    title: "Trabaho, pagod at puyat",
    topic: "Trabaho at puyat",
    description: "Mga kwentuhan tungkol sa shift, overtime, katrabaho, boss at kulang na tulog.",
    ...COMMON,
    notes:
      "Some of the friends work shifts (day, night or custom hours), so mention being on duty, just off duty or about to sleep, as it fits the time of the chat.",
    situations: [
      { label: "Kakauwi lang", detail: "Pagod na pagod pagkatapos ng duty, gusto na lang humiga." },
      {
        label: "Papasok na",
        detail: "Bago pumasok sa shift, nagkakamustahan at nagrereklamo sa biyahe.",
      },
      {
        label: "Overtime",
        detail: "Biglang na-OT at hindi pa nakakakain, inis pero tuloy ang trabaho.",
      },
      {
        label: "Katrabahong makulit",
        detail:
          "Kwento tungkol sa katrabahong laging late, madaldal o mahilig magpaiwan ng trabaho.",
      },
      {
        label: "Boss at memo",
        detail: "May bagong patakaran sa opisina at nagrereklamo ang lahat nang pabiro.",
      },
      {
        label: "Night shift life",
        detail: "Gising sa gabi, tulog sa umaga, at mga hirap sa pag-aayos ng oras.",
      },
      {
        label: "Day off na",
        detail: "Excited sa rest day, may kanya-kanyang plano at may gustong matulog lang.",
      },
      {
        label: "Traffic at biyahe",
        detail: "Mga kwento ng jeep, MRT, grab at sobrang haba ng pila.",
      },
      {
        label: "Kulang sa tulog",
        detail:
          "Kape na naman, lutang sa trabaho at nagtatawanan sa mga katangahan dahil sa puyat.",
      },
      {
        label: "Sweldo na bukas",
        detail: "Hinihintay ang sahod, plano kung saan mapupunta at sino ang uutang.",
      },
      {
        label: "Bagong pasok",
        detail: "May bagong katrabaho at pinag-uusapan kung mabait ba o hindi pa kilala.",
      },
      {
        label: "Pagod na gusto magresign",
        detail: "Biruan tungkol sa pagre-resign pero alam nilang hindi pa kaya.",
      },
      {
        label: "Lunch break",
        detail: "Kain sa break, ano ang baon at kung gaano kaikli ang oras.",
      },
      {
        label: "Sakit habang trabaho",
        detail: "Sipon, ubo o sakit ng likod sa duty at mga payo ng barkada.",
      },
      {
        label: "Schedule swap",
        detail: "Naghahanap ng papalit sa shift at nag-uusap kung sino ang pwede.",
      },
      {
        label: "Magandang araw sa trabaho",
        detail: "Isang araw na maayos ang lahat at masaya ang kwentuhan.",
      },
    ],
  },
  {
    id: "family-pamangkin-bahay",
    title: "Pamilya at mga pamangkin",
    topic: "Pamilya at bahay",
    description:
      "Kwento tungkol sa nanay, tatay, kapatid, pamangkin, gawaing-bahay at pag-uwi sa probinsya.",
    ...COMMON,
    situations: [
      {
        label: "Kulit ng pamangkin",
        detail: "Nakakatawa o nakakapagod na ginawa ng pamangkin ngayong araw.",
      },
      {
        label: "Nanay na nag-aalala",
        detail: "Tawag o text ni nanay na nagtatanong kung nakakain na at kailan uuwi.",
      },
      { label: "Uwi sa probinsya", detail: "Plano ng pag-uwi, pasalubong at sino ang sasabay." },
      { label: "Gawaing-bahay", detail: "Laba, linis, plantsa at sino ang tamad gumawa." },
      {
        label: "Kapatid na makulit",
        detail: "Away-bati ng magkakapatid, hiraman ng gamit na hindi naibabalik.",
      },
      {
        label: "Reunion",
        detail: "Paghahanda para sa family gathering at kung sino ang laging late.",
      },
      { label: "Pasukan na", detail: "Gastos sa baon, uniporme at school supplies ng mga bata." },
      {
        label: "Lolo at lola",
        detail: "Mga kwento at payo ni lola, ang mga sinasabi nilang hindi na bago pero totoo.",
      },
      { label: "Alagang hayop", detail: "Aso o pusa sa bahay na may ginawang kalokohan." },
      {
        label: "Birthday sa bahay",
        detail: "Paghahanda ng simpleng handaan, bisita at sobrang daming pagkain.",
      },
      {
        label: "Tatay na seryoso",
        detail: "Pangaral ni tatay, at ang pagtawa nila kapag natatandaan ito.",
      },
      {
        label: "Bayad sa kuryente",
        detail: "Pagkakabahagi ng bills, mataas na kuryente at tipid-tipid.",
      },
      {
        label: "Ate o kuya na responsable",
        detail: "Pasan ang pamilya, pagod pero masaya, at ang pasasalamat ng mga kapatid.",
      },
      {
        label: "Kapitbahay",
        detail: "Chismis ng kapitbahay, videoke na maingay at mga inuutangan.",
      },
      {
        label: "Simba tuwing Linggo",
        detail: "Pag-aayos ng pamilya papuntang simbahan at kainan pagkatapos.",
      },
      {
        label: "Lumang litrato",
        detail: "Natagpuan ang lumang larawan ng pamilya at nagbalik-tanaw.",
      },
    ],
  },
  {
    id: "mobile-games-casual",
    title: "Mobile games at laro sa phone",
    topic: "Mobile games",
    description:
      "Mga libreng laro sa phone (puzzle, MOBA, battle royale), rank, kaibigan sa laro at puyat sa paglalaro. Walang pustahan.",
    ...COMMON,
    notes:
      "Talk only about ordinary free-to-play video games (puzzle, MOBA, battle royale, farming, racing). No gambling, casinos, betting or real-money games of any kind.",
    situations: [
      { label: "Adik sa laro", detail: "May nagpuyat sa paglalaro at inaasar ng barkada." },
      { label: "Rank game", detail: "Umaakyat sa rank, natalo dahil sa kakampi, at inis na tawa." },
      {
        label: "Bagong update",
        detail: "May bagong update o character at pinag-uusapan ang pagbabago.",
      },
      {
        label: "Laro habang nagbabiyahe",
        detail: "Naglalaro sa jeep o bus, naubusan ng data o battery.",
      },
      { label: "Puzzle game", detail: "Stuck sa mahirap na level at humihingi ng tips sa iba." },
      {
        label: "Kaibigan sa laro",
        detail: "Pag-aaya sa isa't isa na maglaro nang sabay at pagplano ng oras.",
      },
      {
        label: "Lag at ping",
        detail: "Reklamo sa mabagal na internet at nakakagulat na pagkatalo dahil sa lag.",
      },
      {
        label: "Pamangkin na nanghihiram",
        detail: "Hiniram ng pamangkin ang phone at nabura o nagastos ang storage.",
      },
      {
        label: "Farm at city games",
        detail: "Pag-aalaga ng virtual na halaman o bayan at inaabangan ang oras ng ani.",
      },
      {
        label: "Throwback na laro",
        detail: "Mga lumang laro tulad ng Snake, Plants vs Zombies at Clash of Clans.",
      },
      {
        label: "Panalo sa tournament ng barkada",
        detail: "Munting paligsahan ng magkakaibigan na walang premyo kundi bragging rights.",
      },
      {
        label: "Storage punô",
        detail: "Kailangang magbura ng app at masakit tanggalin ang paborito.",
      },
      {
        label: "Sino ang mas magaling",
        detail: "Mapagbiro na pagtatalo kung sino ang pinakamagaling maglaro.",
      },
      {
        label: "Pahinga sa laro",
        detail: "May nagsabing titigil na muna sa paglalaro at hindi pinaniniwalaan.",
      },
      {
        label: "Libreng gamit sa laro",
        detail: "Natuwa sa libreng reward na nakuha sa daily login.",
      },
      {
        label: "Laro ng mga bata",
        detail:
          "Nakikita ang mga bata sa kalye na naglalaro ng tumbang preso at patintero, namimiss ang bata.",
      },
    ],
  },
  {
    id: "lakiph-casual-chat",
    title: "Kwentuhan tungkol sa mga laro sa app (walang payo)",
    topic: "Mga laro sa LakiPH",
    description:
      "Pangkaraniwang kwentuhan na may nabanggit na laro sa app, pero walang panalo, payout, tips o pag-aanyaya. Para sa pribadong test group lamang.",
    ...COMMON,
    notes:
      "Some chats may mention that a friend has looked at the LakiPH app or its game lobby. Keep it to casual, personal and non-factual talk: curiosity, jokes, 'ang daming laro', who is busy, who prefers other things. Nobody says how well anyone did, how to play better, or what the app offers or pays. Nobody invites another person to try it. About half of the conversations should not mention the app at all and just be normal friends' chat.",
    situations: [
      {
        label: "Nag-browse lang",
        detail:
          "May nagsabing nag-browse sa app at ang dami palang laro, tapos lumipat agad sa ibang usapan.",
      },
      {
        label: "Kulay ng lobby",
        detail: "Biruan tungkol sa makukulay na itsura ng game lobby at sa pangalan ng mga laro.",
      },
      {
        label: "Hindi hilig",
        detail: "May nagsabing mas gusto pa niya ang puzzle games kaysa dito at nagtatawanan sila.",
      },
      {
        label: "Libangan sa pahinga",
        detail:
          "Pag-uusap tungkol sa kung ano ang libangan nila sa break, kasama ang paminsan-minsang paglabas ng app.",
      },
      {
        label: "Pagod at tulog",
        detail:
          "Pag-uusap pagkatapos ng duty; ang ibang nabanggit na app ay isang biro lang sa gitna ng reklamo sa antok.",
      },
      {
        label: "Pangalan ng laro",
        detail: "Natawa sa kakaibang pangalan ng laro at hinulaan kung ano ang ibig sabihin nito.",
      },
      {
        label: "Pagkain habang nag-scroll",
        detail: "Kumakain habang nag-i-scroll sa phone at naghahati ng atensyon sa pagkain at app.",
      },
      {
        label: "Pinaalalahanan sa oras",
        detail: "May nagpaalala sa isa na huwag magpuyat sa phone at tulog muna.",
      },
      {
        label: "Pag-uusap ng ibang bagay",
        detail: "Simula ay tungkol sa app pero napunta sa weekend plans at pagkain.",
      },
      {
        label: "Pagkakaiba ng hilig",
        detail:
          "Isa ay mahilig sa pelikula, isa sa musika, isa sa laro, at nagbibiruan sa hilig ng bawat isa.",
      },
      {
        label: "Bagong disenyo",
        detail:
          "Napansin ng isa ang bagong itsura ng app at komento lang sa disenyo, hindi sa laro.",
      },
      {
        label: "Budget na tipid",
        detail:
          "Pag-uusap tungkol sa pagtitipid at pagkontrol sa gastos, may paalala sa isa't isa na maging responsable.",
      },
      {
        label: "Pamilya muna",
        detail: "Sa gitna ng usapan, isa ang kailangang asikasuhin ang pamilya at nagpaalam.",
      },
      {
        label: "Libangan ng iba",
        detail:
          "Pag-uusap kung ano ang ginagawa ng ibang kaibigan at kamag-anak para magpalipas ng oras.",
      },
      {
        label: "Laro sa bata pa",
        detail: "Mga larong kalye noong bata pa sila at paghahambing sa mga laro ngayon.",
      },
      {
        label: "Pahinga sa phone",
        detail: "Biruan na ibaba muna ang phone, lumabas at maglakad, at gawin ang ibang bagay.",
      },
    ],
  },
  {
    id: "shopping-online-sale",
    title: "Online shopping at sale",
    topic: "Pamimili at sale",
    description: "Mga nabili online, 11.11, voucher, palengke vs. mall at presyo ng bilihin.",
    ...COMMON,
    situations: [
      {
        label: "Hindi tugma sa picture",
        detail: "Dumating ang order na iba sa litrato at nagtatawanan sila.",
      },
      {
        label: "Sale at voucher",
        detail: "Naghahanap ng voucher at free shipping, plano bago mag-checkout.",
      },
      { label: "Cart na punô", detail: "Maraming laman ang cart pero tinitipid ang sarili." },
      { label: "Palengke o mall", detail: "Saan mas tipid at mas masaya mamili." },
      {
        label: "Presyo ng bilihin",
        detail: "Reklamo sa pagtaas ng presyo ng bigas, mantika at gulay.",
      },
      { label: "Bagong gadget", detail: "Gusto bumili ng earphones o phone at humihingi ng payo." },
      {
        label: "Rider at delivery",
        detail: "Hinihintay ang rider, nag-text, at ang mga nakakatawang paliwanag.",
      },
      {
        label: "Bargain sa tiangge",
        detail: "Tawaran sa ukay o tiangge at ang husay ng isa sa pagtawad.",
      },
      {
        label: "Regalo",
        detail: "Naghahanap ng regalo para sa birthday o Pasko at limitadong budget.",
      },
      {
        label: "Damit at sukat",
        detail: "Hindi kasya ang nabiling damit at sinong pwedeng pagbigyan.",
      },
      {
        label: "Grocery list",
        detail: "Nagpaplano ng grocery at nagtatalo kung ano ang kailangan talaga.",
      },
      {
        label: "Refund at return",
        detail: "Nagre-return ng item at ang hirap makipag-usap sa seller.",
      },
      { label: "Sukli na kulang", detail: "Kulang ang sukli sa tindahan at nagtatawanan." },
      {
        label: "Tipid challenge",
        detail: "Pagsubok na hindi bumili ng kahit ano sa isang linggo.",
      },
      { label: "Bagong sapatos", detail: "Excited sa bagong sapatos at ayaw madumihan." },
      {
        label: "Pagpigil sa sarili",
        detail: "Pinipigilan ang isa't isa na mag-checkout dahil kakasweldo lang.",
      },
    ],
  },
  {
    id: "movies-teleserye-kdrama",
    title: "Teleserye, K-drama at pelikula",
    topic: "Pelikula at palabas",
    description:
      "Mga seryeng sinusundan, spoiler, Netflix marathon at paboritong pelikulang Pinoy.",
    ...COMMON,
    notes:
      "Do not quote real dialogue or invent plot details about real shows beyond very general reactions. Use made-up show titles or keep to general comments like 'yung bago sa Netflix'.",
    situations: [
      { label: "Spoiler alert", detail: "May nag-spoil at galit ang isa, tawanan na lang." },
      { label: "Netflix marathon", detail: "Pinuyatan ang isang serye at inaantok na ngayon." },
      { label: "Teleserye ng gabi", detail: "Inaabangan ang teleserye at reaksyon sa kontrabida." },
      { label: "K-drama iyakan", detail: "Naiyak sa K-drama at inaasar na naman ng isa." },
      {
        label: "Pelikulang Pinoy",
        detail: "Mga klasikong pelikulang Pinoy at ang paboritong linya, sa pangkalahatan lang.",
      },
      {
        label: "Horror na pelikula",
        detail: "Nanood ng horror, natakot, at ayaw matulog nang mag-isa.",
      },
      {
        label: "Sine kasama ang barkada",
        detail: "Plano ng sine, popcorn at kung sino ang magbabayad ng tiket.",
      },
      {
        label: "Rekomendasyon",
        detail: "Humihingi ng rekomendasyon kung ano ang pwedeng panoorin ngayong weekend.",
      },
      {
        label: "Artista crush",
        detail: "Pagbibiruan tungkol sa crush na artista at ang hindi mapigilang kilig.",
      },
      {
        label: "Lumang palabas",
        detail: "Mga palabas noong bata pa at ang mga kantang tema nito.",
      },
      {
        label: "Nakakatulog sa pelikula",
        detail: "May laging nakakatulog bago matapos ang pelikula.",
      },
      {
        label: "Hindi maintindihan ang ending",
        detail: "Nagtatalo sa kahulugan ng ending ng pinanood.",
      },
      {
        label: "Libreng panonood",
        detail: "Naghahanap ng mapapanood nang libre o nakikisabay sa account ng iba, biruan lang.",
      },
      {
        label: "Palabas ng bata",
        detail: "Mga cartoon at palabas na pinapanood ng mga pamangkin.",
      },
      {
        label: "Paghahanap ng subtitle",
        detail: "Naghahanap ng subtitle o dubbing at nagrereklamo sa maling salin.",
      },
      {
        label: "Movie night plan",
        detail: "Pag-uusap sa pagsasama-sama para manood nang magkakasama, pagkain at upuan.",
      },
    ],
  },
  {
    id: "music-videoke-opm",
    title: "Musika, videoke at OPM",
    topic: "Musika at videoke",
    description: "Kantang paulit-ulit, OPM throwback, videoke night at concert.",
    ...COMMON,
    notes:
      "Do not quote song lyrics. Mention song titles or artists only in a general way ('yung kanta ni ...' or 'yung sikat na OPM noon').",
    situations: [
      {
        label: "Kantang paulit-ulit",
        detail: "Hindi mawala sa isip ang isang kanta at naiinis na ang iba.",
      },
      {
        label: "Videoke night",
        detail: "Plano ng videoke, sintunadong kaibigan at kantang laging pinipili.",
      },
      {
        label: "OPM throwback",
        detail: "Mga lumang OPM na may alaala at nagkukwentuhan tungkol dito.",
      },
      {
        label: "Concert",
        detail: "Gustong manood ng concert pero mahal ang ticket at limitadong budget.",
      },
      {
        label: "Playlist",
        detail: "Nag-aayos ng playlist para sa biyahe at nagtatalo sa mga kanta.",
      },
      { label: "Kanta sa umaga", detail: "Kantang pampagising bago pumasok sa trabaho." },
      { label: "Sintunadong biro", detail: "Pinagtatawanan ang sariling pagkanta sa banyo." },
      {
        label: "Banda noong high school",
        detail: "Mga banda at kantang kinakanta noong high school.",
      },
      {
        label: "Gitara o ukulele",
        detail: "May natutong tumugtog ng gitara at gustong magpakitang-gilas.",
      },
      {
        label: "Malungkot na kanta",
        detail: "Kantang nakakaiyak at pagbibiro sa isa na may pinagdadaanan.",
      },
      { label: "Kanta ng bata", detail: "Kantang paulit-ulit sa bahay dahil sa mga pamangkin." },
      { label: "Radyo at jeepney", detail: "Mga kantang naririnig sa jeep at tricycle." },
      {
        label: "Karaoke score",
        detail: "Biruan tungkol sa score sa videoke at sino ang laging mataas.",
      },
      { label: "Kasal at kantahan", detail: "Mga kantang pinapatugtog sa kasal at binyag." },
      {
        label: "Pasko at kantang pamasko",
        detail: "Maagang tumutugtog ng pamaskong awit at nagrereklamo ang ilan.",
      },
      {
        label: "Bagong banda",
        detail:
          "Natuklasan ang bagong banda at ibinabahagi sa iba, sa pangkalahatang paglalarawan lang.",
      },
    ],
  },
  {
    id: "weekend-gala-pahinga",
    title: "Weekend, gala at pahinga",
    topic: "Plano sa weekend",
    description: "Ano ang gagawin sa day off, gala, tamad na Linggo at pagtitipon.",
    ...COMMON,
    situations: [
      {
        label: "Plano sa Sabado",
        detail: "Nag-uusap kung anong gagawin sa Sabado at walang makapag-decide.",
      },
      { label: "Tamad na Linggo", detail: "Gusto lang humiga at manood buong araw." },
      { label: "Gala", detail: "Plano ng lakad, saan pupunta at paano pagkakasyahin ang budget." },
      { label: "Day off ng shift", detail: "Magkakaibang day off kaya mahirap magsabay-sabay." },
      { label: "Linis ng bahay", detail: "Gagamitin ang weekend para maglinis at maglaba." },
      { label: "Simba at kain", detail: "Simbang umaga, tapos kain sa labas ng pamilya." },
      {
        label: "Inuman na hindi natuloy",
        detail: "May plano ng tambay pero nag-cancel dahil sa pagod at ulan.",
      },
      { label: "Pamamasyal ng pamilya", detail: "Pasyal sa park o mall kasama ang mga bata." },
      {
        label: "Beach o ilog",
        detail: "Plano ng pagligo sa dagat o ilog at sino ang magdadala ng pagkain.",
      },
      { label: "Pagtulog ng buong araw", detail: "Bumabawi sa puyat at ayaw magpa-istorbo." },
      {
        label: "Pagbisita sa kamag-anak",
        detail: "Dadalaw sa lola o tita at magdadala ng pasalubong.",
      },
      { label: "Ehersisyo", detail: "Plano ng jogging o zumba sa umaga na hindi natutuloy." },
      {
        label: "Pag-aayos ng gamit",
        detail: "Pag-aayos ng aparador at pagtatapon ng mga lumang gamit.",
      },
      { label: "Bagong lugar", detail: "Gustong subukan ang bagong lugar na kainan o tambayan." },
      {
        label: "Last-minute lakad",
        detail: "Biglang naganap na pagyayaya at nagmamadali silang maghanda.",
      },
      {
        label: "Lunes na naman",
        detail: "Malungkot na pagtatapos ng weekend at paghahanda para sa Lunes.",
      },
    ],
  },
  {
    id: "weather-ulan-init-bagyo",
    title: "Ulan, init at bagyo",
    topic: "Panahon",
    description: "Kumusta ang panahon sa kani-kanilang lugar, baha, bagyo at sobrang init.",
    ...COMMON,
    situations: [
      { label: "Biglang ulan", detail: "Walang payong at basang-basa na sa daan." },
      {
        label: "Sobrang init",
        detail: "Reklamo sa init, paliligo ng dalawang beses at paano makaiwas.",
      },
      {
        label: "Bagyo na paparating",
        detail: "Paghahanda ng pagkain, flashlight at pag-aalala sa pamilya.",
      },
      {
        label: "Baha sa kalye",
        detail: "Hirap makauwi dahil sa baha at paghahanap ng ibang daan.",
      },
      { label: "Brownout", detail: "Walang kuryente, mainit, at paglalaro ng kwentuhan sa dilim." },
      { label: "Malamig na umaga", detail: "Ang sarap matulog sa lamig at ayaw bumangon." },
      {
        label: "Suspension ng klase",
        detail: "May walang pasok dahil sa bagyo at tuwa ng mga bata.",
      },
      { label: "Labada at ulan", detail: "Hindi natuyo ang sinampay dahil sa ulan." },
      { label: "Init ng gabi", detail: "Hindi makatulog dahil sa init at fan lang ang meron." },
      {
        label: "Bagyo sa probinsya",
        detail: "Nag-aalala sa pamilya sa probinsya at nangungumusta.",
      },
      { label: "Lamig at sipon", detail: "May sipon dahil sa ulan at payo ng barkada." },
      { label: "Pagkain pag-ulan", detail: "Mainit na sabaw, lugaw o champorado habang umuulan." },
      { label: "Biyahe sa ulan", detail: "Mahabang pila at siksikan sa jeep tuwing umuulan." },
      { label: "Araw na maganda ang panahon", detail: "Magandang panahon at ang planong lumabas." },
      { label: "Kidlat at kulog", detail: "Takot ng isa sa kulog at pang-aasar ng iba." },
      { label: "Tag-init na", detail: "Plano ng halo-halo, ice cream at paliligo sa dagat." },
    ],
  },
  {
    id: "money-sahod-budget",
    title: "Sahod, budget at tipid",
    topic: "Sahod at budget",
    description: "Pagpapalago ng sahod hanggang katapusan, tipid tips, utang, ipon at gastos.",
    ...COMMON,
    notes:
      "Talk only about ordinary budgeting, saving and bills. Never mention investing schemes, loans from apps, gambling, or any way of getting rich quickly.",
    situations: [
      { label: "Kinsenas na", detail: "Sahod na, pero ubos agad dahil sa mga bayarin." },
      { label: "Wala nang pera", detail: "Katapusan na at nagtitipid na sa pagkain." },
      { label: "Ipon challenge", detail: "Pagsubok mag-ipon ng maliit na halaga bawat linggo." },
      {
        label: "Bayad sa bills",
        detail: "Kuryente, tubig at internet; sino ang nagbabayad ng alin.",
      },
      {
        label: "Utang sa kaibigan",
        detail: "Nakalimutang magbayad ng utang at ang nakakahiyang paalala.",
      },
      { label: "Tipid tips", detail: "Mga paraan para tumipid: baon, lakad, off-peak na biyahe." },
      {
        label: "Padala sa pamilya",
        detail: "Pagpapadala ng pera sa probinsya at ang pagsisikap na magkasya.",
      },
      {
        label: "Bagong gastos",
        detail: "May biglaang gastos tulad ng gamot o repair at ang pag-aayos ng budget.",
      },
      { label: "13th month", detail: "Plano para sa 13th month pay at kung ano ang uunahin." },
      {
        label: "Notebook ng gastos",
        detail: "Nagsimulang magsulat ng gastos at gulat sa dami ng maliliit na bili.",
      },
      { label: "Pamasahe", detail: "Mataas na pamasahe at paghahanap ng mas murang ruta." },
      {
        label: "Hati sa kainan",
        detail: "Hatian sa bayad at pag-aaway kung sino ang may mas malaking kinain.",
      },
      { label: "Alkansya", detail: "Pag-iipon sa alkansya at ang tuwa sa dami ng barya." },
      { label: "Pagbabayad ng tuition", detail: "Gastos sa pag-aaral ng kapatid o pamangkin." },
      {
        label: "Gusto ng luho",
        detail: "Gusto bumili ng luho pero nagpapaalala ang barkada na magtipid.",
      },
      {
        label: "Salamat sa tulong",
        detail: "Pasasalamat sa mga nagbigay ng tulong noong kailangan.",
      },
    ],
  },
  {
    id: "health-ehersisyo-alaga",
    title: "Kalusugan, ehersisyo at alaga",
    topic: "Kalusugan at alaga",
    description: "Pag-eehersisyo, tulog, sipon at sakit, halaman at mga alagang aso at pusa.",
    ...COMMON,
    notes:
      "Only give very general everyday advice (rest, water, see a doctor if it gets worse). Never name medicines, doses or treatments.",
    situations: [
      {
        label: "Plano mag-ehersisyo",
        detail: "Sabi ng sabi na mag-eehersisyo pero hindi natutuloy.",
      },
      {
        label: "Masakit ang likod",
        detail: "Sakit ng likod at balikat dahil sa trabaho at payo ng barkada.",
      },
      {
        label: "Sipon at ubo",
        detail: "May sipon at pinaaalalahanan na magpahinga at uminom ng tubig.",
      },
      {
        label: "Kulang sa tulog",
        detail: "Nag-uusap tungkol sa pagtulog nang maaga at ang hirap nito.",
      },
      { label: "Zumba o jogging", detail: "Pagsali sa umaga na ehersisyo sa barangay." },
      { label: "Tubig at kape", detail: "Pag-inom ng tubig kaysa kape at ang hirap umiwas." },
      { label: "Aso sa bahay", detail: "Kwento ng aso na tumatahol at naglalaro." },
      {
        label: "Pusa na pasaway",
        detail: "Pusa na nagtatago, nagnanakaw ng pagkain o natutulog sa maling lugar.",
      },
      { label: "Halaman", detail: "Pag-aalaga ng halaman, nalalanta, at tips sa pagdidilig." },
      { label: "Check-up", detail: "Plano pumunta sa doktor para sa check-up at ang kaba." },
      {
        label: "Pagbaba ng timbang",
        detail: "Pagtatangka magbawas ng timbang at ang tukso ng pagkain.",
      },
      { label: "Pagod ang mata", detail: "Sakit ng mata dahil sa phone at pahinga." },
      {
        label: "Pagbabantay sa pamangkin na may sakit",
        detail: "Nag-aalala sa batang may lagnat at pag-aalaga sa kanya.",
      },
      {
        label: "Pamamasyal ng aso",
        detail: "Paglalakad ng aso sa hapon at pakikipag-usap sa kapitbahay.",
      },
      {
        label: "Kalusugan ng magulang",
        detail:
          "Pag-aalala sa kalusugan ni nanay o tatay at paalala sa pag-inom ng tubig at pahinga.",
      },
      {
        label: "Magandang pakiramdam",
        detail: "Masarap ang pakiramdam pagkatapos ng maayos na tulog at ehersisyo.",
      },
    ],
  },
];
