"use client";

import * as React from "react";
import Link from "next/link";
import { APP_HOSTNAME, BRAND_NAME, BRAND_URL, CONTACT_EMAIL, GENKAN_URL } from "@/shared/brand";
import { authClient } from "@/features/auth/client";
import "./landing.css";

/**
 * Kicks off the OIDC dance: redirects to Genkan's /oauth2/authorize, which
 * (after sign-in or sign-up on Genkan) bounces back to menu's
 * /api/auth/oauth2/callback/genkan. Better Auth's `generic-oauth` plugin
 * exchanges the code for tokens and creates the local session — by the
 * time the browser lands on `/dashboard` the user is signed in.
 */
function startGenkanSignIn(e: React.MouseEvent) {
  e.preventDefault();
  authClient.signIn.oauth2({ providerId: "genkan", callbackURL: "/dashboard" });
}

type LangCode = "en" | "pt" | "es" | "fr";

type MetaPart = string | { italic: string; rest: string };

type Headline = { roman: string; tagline: string };

type Copy = {
  nav: { features: string; how: string; pricing: string; signin: string; cta: string };
  hero: {
    eyebrow: string;
    headline: Headline;
    ctaPrimary: string;
    meta: MetaPart[];
  };
  features: {
    eyebrow: string;
    h: string;
    p: string;
    items: { n: string; h: string; p: string }[];
  };
  how: {
    eyebrow: string;
    h: string;
    p: string;
    steps: { n: string; h: string; p: string; ill: string }[];
  };
  pricing: {
    eyebrow: string;
    h: string;
    p: string;
    free: { tier: string; priceMain: string; priceSub: string; desc: string; cta: string; feats: string[] };
    pro: { tier: string; priceMain: string; priceSub: string; desc: string; cta: string; feats: string[] };
    foot: string;
  };
  closing: { eyebrow: string; h: string; p: string; ctaPrimary: string; ctaGhost: string };
  // `left` accepts inline parts so the brand name can be a real anchor
  // pointing at the parent brand site (BRAND_URL). Plain strings render
  // as text; objects render as anchors.
  footer: { left: (string | { text: string; href: string })[]; links: string[] };
  boa: string;
  editor: { title: string; restaurant: string; item: string; desc: string; section: string; price: string; publish: string; live: string; add: string };
  phone: { eyebrow: string; live: string };
};

const LANGS: { code: LangCode; label: string; name: string; flag: string }[] = [
  { code: "en", label: "EN", name: "English", flag: "🇬🇧" },
  { code: "pt", label: "PT", name: "Português", flag: "🇵🇹" },
  { code: "es", label: "ES", name: "Español", flag: "🇪🇸" },
  { code: "fr", label: "FR", name: "Français", flag: "🇫🇷" },
];

const COPY: Record<LangCode, Copy> = {
  en: {
    nav: { features: "What it does", how: "How it works", pricing: "Pricing", signin: "Sign in", cta: "Get started" },
    hero: {
      eyebrow: "at the table",
      headline: { roman: "One menu. Every screen it lives on.", tagline: "A good menu, always current, on every screen." },
      ctaPrimary: "Try it with your menu",
      meta: ["Always free for one restaurant", "No card. No setup call.", { italic: "to go", rest: ", your menu wherever guests are." }],
    },
    features: {
      eyebrow: "your menu",
      h: "Three things, done with care.",
      p: "Menu is small on purpose. It does the menu, the bit guests actually look at, and tries not to do anything else.",
      items: [
        { n: "i.", h: "One QR. Always today's menu.", p: "Stick a code on the table once. Edit prices, swap a daily special, mark something out of stock. It lands instantly. No reprinting, no Wi-Fi gymnastics." },
        { n: "ii.", h: "Written for guests, not for SEO.", p: "Add translations once and the menu speaks back in the guest's language. Allergens sit in a line under each dish, photos are optional. Reads like a printed menu, not a marketplace listing." },
        { n: "iii.", h: "A quiet measure of the room.", p: "A small, calm dashboard tells you which hours get the most scans, which dishes get tapped open, and which sections quietly get skipped. No funnels. No heat-maps that look like the weather." },
      ],
    },
    how: {
      eyebrow: "how it works",
      h: "From printed menu to QR in an afternoon.",
      p: "Most kitchens are open by Tuesday. The slow part is deciding which dishes earn their place. That bit's still on you.",
      steps: [
        { n: "step one", h: "Upload, paste, or photograph.", p: "Drop a PDF of your existing menu, paste a Word doc, or shoot the printed card. We tidy it into sections you can edit.", ill: "menu.pdf  →  parsed" },
        { n: "step two", h: "Adjust until it sounds like you.", p: "Rename a section. Bump a price. Add the dessert that only happens on Saturdays. Save.", ill: "edit · preview · save" },
        { n: "step three", h: "Print the QR. Hang it up.", p: "Brass plate, table tent, or a sticker on the window. Same code forever. The menu behind it changes whenever you want.", ill: "[ QR ] static" },
      ],
    },
    pricing: {
      eyebrow: "plans",
      h: "Two prices. Both honest.",
      p: "Start free, always. Upgrade when you outgrow it, not before.",
      free: {
        tier: "Free", priceMain: "€0", priceSub: "forever",
        desc: "For the corner café and the place that opens four nights a week.",
        cta: "Start free",
        feats: ["One restaurant", "1,000 guest views per month", "Multiple translations", "Allergens & dietary tags"],
      },
      pro: {
        tier: "Casa", priceMain: "€2", priceSub: "per month",
        desc: "For everyone past a thousand views, and anyone running more than one room.",
        cta: "Choose Casa",
        feats: ["Multiple restaurants", "Unlimited guest views", "Hour-by-hour scan analytics", "PDF export"],
      },
      foot: "No card on file for the free tier. Cancel Casa anytime.",
    },
    closing: {
      eyebrow: "at the table",
      h: "Put your menu online this afternoon.",
      p: "Always free for one restaurant. Bring your existing menu and leave with a QR you can print before service.",
      ctaPrimary: "Bring your menu over",
      ctaGhost: "Email us instead",
    },
    footer: { left: ["Menu · an ", { text: BRAND_NAME, href: BRAND_URL }, " product · made in Lisbon"], links: ["Privacy", "Contact"] },
    boa: "Enjoy your meal.",
    editor: { title: "Menu", restaurant: "Restaurant", item: "Item name", desc: "Description", section: "Section", price: "Price (€)", publish: "⌘ S to save", live: "live", add: "+ add item" },
    phone: { eyebrow: "at the table", live: "updated just now" },
  },
  pt: {
    nav: { features: "à vossa carta", how: "como funciona", pricing: "modelos", signin: "Entrar", cta: "Começar" },
    hero: {
      eyebrow: "à mesa",
      headline: { roman: "Uma carta. Em todos os ecrãs onde vive.", tagline: "Uma boa carta. Sempre actual, em qualquer ecrã." },
      ctaPrimary: "Experimente com a sua carta",
      meta: ["Grátis em beta", "Sem cartão. Sem chamada.", { italic: "para levar", rest: " a sua carta para todo o lado." }],
    },
    features: {
      eyebrow: "a vossa carta",
      h: "Três coisas, feitas com cuidado.",
      p: "O Menu é pequeno de propósito. Trata da carta. É isso que os clientes vêem mesmo, e tenta não fazer mais nada.",
      items: [
        { n: "i.", h: "Um QR. A carta de hoje, sempre.", p: "Cole o código na mesa uma vez. Mude preços, troque o prato do dia, marque um esgotado. Chega lá no momento. Sem reimpressão, sem ginástica de Wi-Fi." },
        { n: "ii.", h: "Escrito para o cliente, não para o Google.", p: "Entradas multilingues com um botão, alergénios numa linha por baixo, fotos se quiser. Lê-se como uma carta impressa." },
        { n: "iii.", h: "Uma medida tranquila da sala.", p: "Um painel pequeno e calmo diz-lhe que horas têm mais leituras, que pratos são abertos e que secções passam ao lado. Sem funis. Sem mapas de calor." },
      ],
    },
    how: {
      eyebrow: "como funciona",
      h: "De carta impressa a QR numa tarde.",
      p: "A maioria das cozinhas está pronta até terça. A parte lenta é decidir que pratos merecem entrar. Isso continua convosco.",
      steps: [
        { n: "passo um", h: "Carregar, colar ou fotografar.", p: "Deixe cair um PDF, cole um Word ou tire uma foto à carta. Arrumamos por secções editáveis.", ill: "menu.pdf  →  lido" },
        { n: "passo dois", h: "Ajustar até soar a vocês.", p: "Renomeie uma secção. Suba um preço. Acrescente a sobremesa que só há ao sábado. Guardar.", ill: "editar · pré-ver · guardar" },
        { n: "passo três", h: "Imprimir o QR. Pendurar.", p: "Placa em latão, em cima da mesa ou autocolante na montra. O mesmo código para sempre. A carta por trás muda quando quiser.", ill: "[ QR ] fixo" },
      ],
    },
    pricing: {
      eyebrow: "modelos",
      h: "Dois preços. Ambos honestos.",
      p: "Comece grátis, sempre. Passe a Casa quando precisar, não antes.",
      free: {
        tier: "Grátis", priceMain: "€0", priceSub: "para sempre",
        desc: "Para o café da esquina e a casa que abre quatro noites por semana.",
        cta: "Começar grátis",
        feats: ["Um restaurante", "1.000 visualizações por mês", "Várias traduções", "Alergénios e dietas"],
      },
      pro: {
        tier: "Casa", priceMain: "€2", priceSub: "por mês",
        desc: "Para quem passa as mil visualizações, e para quem tem mais que uma sala.",
        cta: "Escolher Casa",
        feats: ["Vários restaurantes", "Visualizações ilimitadas", "Análise de scans por hora", "Exportação para PDF"],
      },
      foot: "Sem cartão no plano grátis. Cancele a Casa quando quiser.",
    },
    closing: {
      eyebrow: "à mesa",
      h: "Coloque a carta online esta tarde.",
      p: "Grátis em beta. Traga a sua carta, saia com um QR pronto a imprimir antes do serviço.",
      ctaPrimary: "Traga a sua carta",
      ctaGhost: "Escreva-nos",
    },
    footer: { left: ["Menu · um produto ", { text: BRAND_NAME, href: BRAND_URL }, " · feito em Lisboa"], links: ["Privacidade", "Contacto"] },
    boa: "Boa mesa.",
    editor: { title: "Carta", restaurant: "Restaurante", item: "Nome do prato", desc: "Descrição", section: "Secção", price: "Preço (€)", publish: "⌘ S para guardar", live: "ao vivo", add: "+ adicionar" },
    phone: { eyebrow: "à mesa", live: "actualizado agora" },
  },
  es: {
    nav: { features: "Qué hace", how: "Cómo funciona", pricing: "Precios", signin: "Entrar", cta: "Empezar" },
    hero: {
      eyebrow: "à mesa",
      headline: { roman: "Una carta. En cada pantalla donde vive.", tagline: "Una buena carta. Siempre al día, en cualquier pantalla." },
      ctaPrimary: "Pruébalo con tu carta",
      meta: ["Gratis durante la beta", "Sin tarjeta. Sin llamadas.", { italic: "para llevar", rest: " tu carta a todas partes." }],
    },
    features: {
      eyebrow: "vuestra carta",
      h: "Tres cosas, hechas con cuidado.",
      p: "Menu es pequeño a propósito. Hace la carta, la parte que los clientes miran, y procura no hacer nada más.",
      items: [
        { n: "i.", h: "Un QR. Siempre la carta de hoy.", p: "Pega el código en la mesa una vez. Cambia precios, intercambia un plato del día, marca un agotado. Aparece al instante." },
        { n: "ii.", h: "Escrito para el cliente, no para Google.", p: "Entradas multilingües con un toque, alérgenos en una línea, fotos opcionales. Se lee como una carta impresa." },
        { n: "iii.", h: "Una medida tranquila de la sala.", p: "Un panel pequeño y calmo te dice qué horas tienen más escaneos, qué platos se abren y qué secciones pasan desapercibidas." },
      ],
    },
    how: {
      eyebrow: "cómo funciona",
      h: "De carta impresa a QR en una tarde.",
      p: "La mayoría de cocinas estará lista el martes. La parte lenta es decidir qué platos entran. Eso sigue siendo cosa vuestra.",
      steps: [
        { n: "paso uno", h: "Sube, pega o fotografía.", p: "Suelta un PDF, pega un Word o saca una foto. Lo ordenamos en secciones editables.", ill: "menu.pdf  →  leído" },
        { n: "paso dos", h: "Ajusta hasta que suene a ti.", p: "Renombra una sección. Sube un precio. Añade el postre que solo hay los sábados. Guardar.", ill: "editar · ver · guardar" },
        { n: "paso tres", h: "Imprime el QR. Cuélgalo.", p: "Placa de latón, atril de mesa o pegatina en el escaparate. El mismo código para siempre.", ill: "[ QR ] fijo" },
      ],
    },
    pricing: {
      eyebrow: "modelos",
      h: "Dos precios. Los dos honestos.",
      p: "Empieza gratis, siempre. Pasa a Casa cuando lo necesites, no antes.",
      free: {
        tier: "Gratis", priceMain: "€0", priceSub: "para siempre",
        desc: "Para la cafetería de barrio y el sitio que abre cuatro noches.",
        cta: "Empezar gratis",
        feats: ["Un restaurante", "1.000 visitas al mes", "Varias traducciones", "Alérgenos y dietas"],
      },
      pro: {
        tier: "Casa", priceMain: "€2", priceSub: "al mes",
        desc: "Para los que pasan de las mil visitas, y para quien tiene más de una sala.",
        cta: "Elegir Casa",
        feats: ["Varios restaurantes", "Visitas ilimitadas", "Análisis de escaneos por hora", "Exportar a PDF"],
      },
      foot: "Sin tarjeta en el plan gratis. Cancela Casa cuando quieras.",
    },
    closing: {
      eyebrow: "à mesa",
      h: "Pon tu carta online esta tarde.",
      p: "Gratis durante la beta. Trae tu carta, vete con un QR listo para imprimir.",
      ctaPrimary: "Trae tu carta",
      ctaGhost: "Escríbenos",
    },
    footer: { left: ["Menu · un producto ", { text: BRAND_NAME, href: BRAND_URL }, " · hecho en Lisboa"], links: ["Privacidad", "Contacto"] },
    boa: "Boa mesa.",
    editor: { title: "Carta", restaurant: "Restaurante", item: "Nombre del plato", desc: "Descripción", section: "Sección", price: "Precio (€)", publish: "⌘ S para guardar", live: "en vivo", add: "+ añadir" },
    phone: { eyebrow: "à mesa", live: "actualizado ahora" },
  },
  fr: {
    nav: { features: "Ce qu'il fait", how: "Comment", pricing: "Tarifs", signin: "Se connecter", cta: "Commencer" },
    hero: {
      eyebrow: "à mesa",
      headline: { roman: "Une carte. Sur chaque écran où elle vit.", tagline: "Une bonne carte. Toujours à jour, sur chaque écran." },
      ctaPrimary: "Essayez avec votre carte",
      meta: ["Gratuit en bêta", "Pas de carte. Pas d'appel.", { italic: "para levar", rest: ". Votre carte vous suit partout." }],
    },
    features: {
      eyebrow: "votre carte",
      h: "Trois choses, faites avec soin.",
      p: "Menu est petit, c'est voulu. Il s'occupe de la carte, la seule chose que vos clients regardent, et essaie de ne rien faire d'autre.",
      items: [
        { n: "i.", h: "Un QR. Toujours la carte du jour.", p: "Collez le code une fois. Modifiez prix et plats du jour, marquez un épuisé. C'est en ligne aussitôt." },
        { n: "ii.", h: "Écrit pour les clients, pas pour Google.", p: "Entrées multilingues d'un clic, allergènes en une ligne, photos optionnelles. Ça se lit comme une vraie carte." },
        { n: "iii.", h: "Une mesure discrète de la salle.", p: "Un petit tableau de bord calme indique quelles heures sont les plus scannées, quels plats sont ouverts et quelles sections passent inaperçues." },
      ],
    },
    how: {
      eyebrow: "comment ça marche",
      h: "De la carte papier au QR en un après-midi.",
      p: "La plupart des cuisines sont prêtes mardi. Le plus long, c'est de choisir quels plats gardent leur place. Ça, c'est à vous.",
      steps: [
        { n: "étape un", h: "Importez, collez ou photographiez.", p: "Déposez un PDF, collez un Word, ou photographiez la carte. On range tout en sections éditables.", ill: "menu.pdf  →  analysé" },
        { n: "étape deux", h: "Ajustez à votre voix.", p: "Renommez une section. Changez un prix. Ajoutez le dessert du samedi. Enregistrer.", ill: "éditer · aperçu · publier" },
        { n: "étape trois", h: "Imprimez le QR. Affichez-le.", p: "Plaque en laiton, chevalet de table, sticker en vitrine. Le même code à vie. La carte derrière change quand vous voulez.", ill: "[ QR ] fixe" },
      ],
    },
    pricing: {
      eyebrow: "modèles",
      h: "Deux prix. Tous deux honnêtes.",
      p: "Commencez gratuitement, toujours. Passez à Casa quand il le faut, pas avant.",
      free: {
        tier: "Gratuit", priceMain: "0 €", priceSub: "pour toujours",
        desc: "Pour le café du coin et l'adresse qui ouvre quatre soirs par semaine.",
        cta: "Commencer",
        feats: ["Un restaurant", "1 000 vues par mois", "Plusieurs traductions", "Allergènes et régimes"],
      },
      pro: {
        tier: "Casa", priceMain: "2 €", priceSub: "par mois",
        desc: "Pour ceux qui dépassent les mille vues, et pour ceux qui ont plus d'une salle.",
        cta: "Choisir Casa",
        feats: ["Plusieurs restaurants", "Vues illimitées", "Analyses des scans par heure", "Export PDF"],
      },
      foot: "Aucune carte requise pour le gratuit. Annulez Casa à tout moment.",
    },
    closing: {
      eyebrow: "à mesa",
      h: "Mettez votre carte en ligne cet après-midi.",
      p: "Gratuit en bêta. Apportez votre carte, repartez avec un QR à imprimer avant le service.",
      ctaPrimary: "Apportez votre carte",
      ctaGhost: "Écrivez-nous",
    },
    footer: { left: ["Menu · un produit ", { text: BRAND_NAME, href: BRAND_URL }, " · fait à Lisbonne"], links: ["Confidentialité", "Contact"] },
    boa: "Boa mesa.",
    editor: { title: "Carte", restaurant: "Restaurant", item: "Nom du plat", desc: "Description", section: "Section", price: "Prix (€)", publish: "⌘ S pour enregistrer", live: "en direct", add: "+ ajouter" },
    phone: { eyebrow: "à mesa", live: "mis à jour à l'instant" },
  },
};

type DemoMenu = {
  restaurant: string;
  subtitle: string;
  sections: { title: string; items: { id: number; name: string; desc: string; price: string }[] }[];
};

const DEMO_MENUS: Record<LangCode, DemoMenu> = {
  en: {
    restaurant: "House Tavern", subtitle: "14 Flower Street · Lisbon",
    sections: [
      { title: "to begin", items: [
        { id: 1, name: "House bread, butter", desc: "slow crumb, Tavira sea salt", price: "2.50" },
        { id: 2, name: "Veal croquettes", desc: "three per plate, old mustard", price: "6.00" },
      ]},
      { title: "today's specials", items: [
        { id: 3, name: "Cod à lagareiro", desc: "smashed potato, sautéed greens", price: "18.50" },
        { id: 4, name: "Duck rice", desc: "slow oven, mountain chouriço", price: "16.00" },
      ]},
    ],
  },
  pt: {
    restaurant: "Tasca do Avô", subtitle: "Rua das Flores, 14 · Lisboa",
    sections: [
      { title: "para começar", items: [
        { id: 1, name: "Pão da casa, manteiga", desc: "miolo lento, sal de Tavira", price: "2,50" },
        { id: 2, name: "Croquetes de vitela", desc: "três por dose, mostarda antiga", price: "6,00" },
      ]},
      { title: "ementa do dia", items: [
        { id: 3, name: "Bacalhau à lagareiro", desc: "batata a murro, grelos salteados", price: "18,50" },
        { id: 4, name: "Arroz de pato", desc: "forno lento, chouriço da serra", price: "16,00" },
      ]},
    ],
  },
  es: {
    restaurant: "Taberna de la Casa", subtitle: "Calle de las Flores 14 · Lisboa",
    sections: [
      { title: "para empezar", items: [
        { id: 1, name: "Pan de la casa, mantequilla", desc: "miga lenta, sal de Tavira", price: "2,50" },
        { id: 2, name: "Croquetas de ternera", desc: "tres por ración, mostaza antigua", price: "6,00" },
      ]},
      { title: "menú del día", items: [
        { id: 3, name: "Bacalao à lagareiro", desc: "patata aplastada, grelos salteados", price: "18,50" },
        { id: 4, name: "Arroz de pato", desc: "horno lento, chouriço serrano", price: "16,00" },
      ]},
    ],
  },
  fr: {
    restaurant: "Taverne de la Maison", subtitle: "14 rue des Fleurs · Lisbonne",
    sections: [
      { title: "pour commencer", items: [
        { id: 1, name: "Pain maison, beurre", desc: "mie lente, sel de Tavira", price: "2,50 €" },
        { id: 2, name: "Croquettes de veau", desc: "trois par assiette, moutarde ancienne", price: "6,00 €" },
      ]},
      { title: "plats du jour", items: [
        { id: 3, name: "Morue à lagareiro", desc: "pommes écrasées, jeunes pousses sautées", price: "18,50 €" },
        { id: 4, name: "Riz au canard", desc: "four lent, chouriço des montagnes", price: "16,00 €" },
      ]},
    ],
  },
};

function ScrollProgress() {
  const fillRef = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, h.scrollTop / max)) : 0;
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <span className="nav-progress-track" aria-hidden="true">
      <span ref={fillRef} className="nav-progress-fill" />
    </span>
  );
}

function LangSwitcher({ lang, setLang }: { lang: LangCode; setLang: (l: LangCode) => void }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  // close the compact-mode popover on outside click / escape
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="lang-switch" role="group" aria-label="Language" ref={rootRef}>
      {/* inline row — visible on tablet+ */}
      <div className="lang-row">
        {LANGS.map((l) => (
          <button
            key={l.code}
            type="button"
            className={"lang-btn" + (lang === l.code ? " active" : "")}
            onClick={() => setLang(l.code)}
            title={l.name}
            aria-label={l.name}
            aria-pressed={lang === l.code}
          >
            <span className="flag" aria-hidden="true">{l.flag}</span>
          </button>
        ))}
      </div>
      {/* compact — visible on phone only via CSS */}
      <div className="lang-compact">
        <button
          type="button"
          className="lang-btn lang-trigger"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={current.name}
        >
          <span className="flag" aria-hidden="true">{current.flag}</span>
        </button>
        {open && (
          <div className="lang-pop" role="menu">
            {LANGS.filter((l) => l.code !== lang).map((l) => (
              <button
                key={l.code}
                type="button"
                role="menuitem"
                className="lang-btn"
                onClick={() => { setLang(l.code); setOpen(false); }}
                title={l.name}
                aria-label={l.name}
              >
                <span className="flag" aria-hidden="true">{l.flag}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function smoothScrollTo(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Nav({ c, lang, setLang }: { c: Copy; lang: LangCode; setLang: (l: LangCode) => void }) {
  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav-inner">
        <Link className="brand" href="#top" aria-label="Menu home">
          <span className="mark" aria-hidden="true">⁋</span>
          <span className="word"><em>Menu</em></span>
        </Link>
        <ul>
          <li><Link href="#features" onClick={(e) => { e.preventDefault(); smoothScrollTo("features"); }}>{c.nav.features}</Link></li>
          <li><Link href="#how" onClick={(e) => { e.preventDefault(); smoothScrollTo("how"); }}>{c.nav.how}</Link></li>
          <li><Link href="#pricing" onClick={(e) => { e.preventDefault(); smoothScrollTo("pricing"); }}>{c.nav.pricing}</Link></li>
        </ul>
        <div className="nav-right">
          <LangSwitcher lang={lang} setLang={setLang} />
          <Link href={`${GENKAN_URL}/login`} className="nav-link" onClick={startGenkanSignIn}>{c.nav.signin}</Link>
          <Link href={`${GENKAN_URL}/signup`} className="nav-cta" onClick={startGenkanSignIn}>{c.nav.cta}</Link>
        </div>
      </div>
      <ScrollProgress />
    </nav>
  );
}

function PhonePreview({
  menu,
  c,
  highlightId,
  onPick,
}: {
  menu: DemoMenu;
  c: Copy;
  highlightId: number;
  onPick: (id: number) => void;
}) {
  return (
    <div className="phone reveal">
      <div className="phone-shell">
        <div className="phone-screen">
          <div className="phone-notch" />
          <div className="phone-status" aria-hidden="true">
            <span>9:41</span>
            <span>·· ◰</span>
          </div>
          <div className="phone-head">
            <div className="small">{c.phone.eyebrow}</div>
            <h3>{menu.restaurant}</h3>
            <div className="sub">{menu.subtitle}</div>
          </div>
          <div className="menu-list">
            {menu.sections.map((s, si) => (
              <React.Fragment key={si}>
                <div className="menu-section-title">{s.title}</div>
                {s.items.map((it) => {
                  const active = highlightId === it.id;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => onPick(it.id)}
                      className={"menu-item" + (active ? " highlight" : "")}
                      aria-pressed={active}
                    >
                      <span className="menu-item-text">
                        <span className="name">{it.name}</span>
                        {it.desc && <span className="desc">{it.desc}</span>}
                      </span>
                      <span className="price">{String(it.price).includes("€") ? it.price : it.price + " €"}</span>
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div className="phone-foot">
            <span><span className="live-dot" />{c.phone.live}</span>
            <span>{LANGS.map((l) => l.label).join(" · ")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditorMock({
  menu,
  c,
  highlightId,
  onPick,
}: {
  menu: DemoMenu;
  c: Copy;
  highlightId: number;
  onPick: (id: number) => void;
}) {
  const editingItem = (() => {
    for (const s of menu.sections)
      for (const it of s.items)
        if (it.id === highlightId) return { item: it, section: s };
    return { item: menu.sections[1].items[0], section: menu.sections[1] };
  })();

  return (
    <div className="laptop reveal">
      <div className="laptop-screen">
        <div className="laptop-bar" aria-hidden="true">
          <i></i><i></i><i></i>
          <span className="url">{APP_HOSTNAME} / house-tavern / editor</span>
        </div>
        <div className="editor">
          <div className="editor-side">
            <b>{c.editor.title}</b>
            <ul>
              {menu.sections.map((s, si) => (
                <React.Fragment key={si}>
                  <li className="group-label">{s.title}</li>
                  {s.items.map((it) => {
                    const active = editingItem.item.id === it.id;
                    return (
                      <li key={it.id} className={active ? "active" : ""}>
                        <button
                          type="button"
                          className="editor-row-btn"
                          onClick={() => onPick(it.id)}
                          aria-pressed={active}
                        >
                          {it.name.length > 18 ? it.name.slice(0, 18) + "…" : it.name}
                        </button>
                      </li>
                    );
                  })}
                </React.Fragment>
              ))}
              <li className="add">{c.editor.add}</li>
            </ul>
          </div>
          <div className="editor-main">
            <span className="field-label">{c.editor.restaurant}</span>
            <div className="field-input">{menu.restaurant}</div>

            <span className="field-label">{c.editor.item}</span>
            <div className="field-input field-anim" key={"name-" + highlightId}>{editingItem.item.name}</div>

            <span className="field-label">{c.editor.desc}</span>
            <div className="field-textarea field-anim" key={"desc-" + highlightId}>{editingItem.item.desc}</div>

            <div className="editor-row" style={{ marginTop: 0 }}>
              <div>
                <span className="field-label">{c.editor.section}</span>
                <div className="field-input field-anim" key={"sec-" + highlightId}>{editingItem.section.title}</div>
              </div>
              <div>
                <span className="field-label">{c.editor.price}</span>
                <div className="field-input field-anim" key={"price-" + highlightId}>{editingItem.item.price}</div>
              </div>
            </div>

            <div className="editor-foot">
              <span>{c.editor.publish}</span>
              <span className="live">● {c.editor.live}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="laptop-base" />
    </div>
  );
}

function Hero({
  c,
  menu,
  highlightId,
  onPick,
}: {
  c: Copy;
  menu: DemoMenu;
  highlightId: number;
  onPick: (id: number) => void;
}) {
  return (
    <header className="hero" id="top">
      <div className="container">
        <div className="hero-grid">
          <div className="hero-copy">
            <div className="eyebrow">{c.hero.eyebrow}</div>
            <h1>{c.hero.headline.roman}</h1>
            <p className="tagline">{c.hero.headline.tagline}</p>
            <div className="hero-ctas">
              <Link className="btn btn-primary" href={`${GENKAN_URL}/signup`} onClick={startGenkanSignIn}>{c.hero.ctaPrimary}</Link>
            </div>
            <div className="meta-line">
              {c.hero.meta.map((m, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="dotsep">·</span>}
                  {typeof m === "string" ? (
                    <span className="meta-part">{m}</span>
                  ) : (
                    <span className="meta-part"><span className="serif-it">{m.italic}</span>{m.rest}</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
          <div className="devices">
            <EditorMock menu={menu} c={c} highlightId={highlightId} onPick={onPick} />
            <PhonePreview menu={menu} c={c} highlightId={highlightId} onPick={onPick} />
          </div>
        </div>
      </div>
    </header>
  );
}

function Features({ c }: { c: Copy }) {
  return (
    <section id="features">
      <div className="container">
        <div className="features-head reveal">
          <div className="eyebrow">{c.features.eyebrow}</div>
          <h2>{c.features.h}</h2>
          <p>{c.features.p}</p>
          <div className="ornament" aria-hidden="true"><span /><i>·</i><span /></div>
        </div>
        <div className="feat-grid">
          {c.features.items.map((it, i) => (
            <div className="feat reveal" key={i} style={{ ["--rd" as string]: i * 120 + "ms" } as React.CSSProperties}>
              <div className="swash" aria-hidden="true">❦</div>
              <div className="num">{it.n}</div>
              <h3>{it.h}</h3>
              <p>{it.p}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks({ c }: { c: Copy }) {
  return (
    <section id="how">
      <div className="container">
        <div className="sec-head reveal">
          <div className="eyebrow">{c.how.eyebrow}</div>
          <h2>{c.how.h}</h2>
          <p>{c.how.p}</p>
        </div>
        <div className="steps">
          {c.how.steps.map((s, i) => (
            <div className="step reveal" key={i} style={{ ["--rd" as string]: i * 140 + "ms" } as React.CSSProperties}>
              <div className="step-n">{s.n}</div>
              <h3>{s.h}</h3>
              <p>{s.p}</p>
              <div className="ill">{s.ill}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing({ c }: { c: Copy }) {
  return (
    <section id="pricing">
      <div className="container">
        <div className="sec-head reveal">
          <div className="eyebrow">{c.pricing.eyebrow}</div>
          <h2>{c.pricing.h}</h2>
          <p>{c.pricing.p}</p>
        </div>
        <div className="price-cards">
          <article className="menu-card reveal">
            <header className="menu-card-head">
              <span className="menu-card-tier">{c.pricing.free.tier}</span>
              <span className="menu-card-price">
                <span className="amt-main">{c.pricing.free.priceMain}</span>
                <span className="amt-sub">{c.pricing.free.priceSub}</span>
              </span>
            </header>
            <p className="menu-card-desc">{c.pricing.free.desc}</p>
            <ul className="menu-card-feats">
              {c.pricing.free.feats.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
            <div className="menu-card-foot">
              <Link className="btn btn-ghost" href={`${GENKAN_URL}/signup`} onClick={startGenkanSignIn}>{c.pricing.free.cta}</Link>
            </div>
          </article>

          <article className="menu-card reveal" style={{ ["--rd" as string]: "120ms" } as React.CSSProperties}>
            <header className="menu-card-head">
              <span className="menu-card-tier">{c.pricing.pro.tier}</span>
              <span className="menu-card-price">
                <span className="amt-main">{c.pricing.pro.priceMain}</span>
                <span className="amt-sub">{c.pricing.pro.priceSub}</span>
              </span>
            </header>
            <p className="menu-card-desc">{c.pricing.pro.desc}</p>
            <ul className="menu-card-feats">
              {c.pricing.pro.feats.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
            <div className="menu-card-foot">
              <Link className="btn btn-primary" href={`${GENKAN_URL}/signup`} onClick={startGenkanSignIn}>{c.pricing.pro.cta}</Link>
            </div>
          </article>
        </div>
        <div className="price-foot">{c.pricing.foot}</div>
      </div>
    </section>
  );
}

function Closing({ c }: { c: Copy }) {
  return (
    <>
      <section id="cta" className="closing reveal">
        <div className="container">
          <span className="eyebrow">{c.closing.eyebrow}</span>
          <h2>{c.closing.h}</h2>
          <p>{c.closing.p}</p>
          <div className="hero-ctas" style={{ justifyContent: "center" }}>
            <Link className="btn btn-primary" href={`${GENKAN_URL}/signup`} onClick={startGenkanSignIn}>{c.closing.ctaPrimary}</Link>
            <Link className="btn btn-ghost" href={`mailto:${CONTACT_EMAIL}`}>{c.closing.ctaGhost}</Link>
          </div>
        </div>
      </section>
      <div className="signoff reveal">
        <div className="container">
          <span className="boa">{c.boa}</span>
        </div>
      </div>
      <footer className="footer">
        <div className="container">
          <span>
            {c.footer.left.map((part, i) =>
              typeof part === "string" ? (
                <React.Fragment key={i}>{part}</React.Fragment>
              ) : (
                <Link key={i} href={part.href}>{part.text}</Link>
              ),
            )}
          </span>
          <span className="footer-links">
            {c.footer.links.map((l, i) => <Link key={i} href="#">{l}</Link>)}
            <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>
          </span>
        </div>
      </footer>
    </>
  );
}

function useReveal(deps: React.DependencyList) {
  React.useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".landing-root .reveal:not(.in)");
    if (typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export default function LandingPage() {
  const [lang, setLang] = React.useState<LangCode>("en");
  const c = COPY[lang];
  const menu = DEMO_MENUS[lang];

  // every item id that exists in the demo menu — drives the auto-cycle
  const itemIds = React.useMemo(() => {
    const ids: number[] = [];
    for (const s of menu.sections) for (const it of s.items) ids.push(it.id);
    return ids;
  }, [menu]);

  const [rawHighlightId, setHighlightId] = React.useState<number>(3);
  const [userInteracted, setUserInteracted] = React.useState(false);

  // Derived: if the current language doesn't have this id, fall back to the
  // first item. Avoids a synchronous setState-in-effect on lang flip.
  const highlightId = itemIds.includes(rawHighlightId) ? rawHighlightId : (itemIds[0] ?? 1);

  const pick = React.useCallback((id: number) => {
    setHighlightId(id);
    setUserInteracted(true);
  }, []);

  // Idle auto-cycle: after 6s of no click, rotate every 4s.
  // Pauses when tab is hidden. Disabled when prefers-reduced-motion.
  React.useEffect(() => {
    if (userInteracted) return;
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    if (itemIds.length < 2) return;

    let interval: number | null = null;
    let timeout: number | null = null;

    const startCycle = () => {
      interval = window.setInterval(() => {
        if (document.hidden) return;
        setHighlightId((prev) => {
          const i = itemIds.indexOf(prev);
          return itemIds[(i + 1) % itemIds.length];
        });
      }, 4000);
    };

    timeout = window.setTimeout(startCycle, 6000);

    const onVis = () => {
      if (document.hidden && interval) {
        window.clearInterval(interval);
        interval = null;
      } else if (!document.hidden && !interval && !timeout) {
        startCycle();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (timeout) window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [itemIds, userInteracted]);

  useReveal([lang]);

  React.useEffect(() => {
    const mark = document.querySelector<HTMLElement>(".landing-root .brand .mark");
    if (!mark) return;
    mark.style.transform = "translateY(2px) rotate(-12deg)";
    const id = window.setTimeout(() => { mark.style.transform = ""; }, 360);
    return () => window.clearTimeout(id);
  }, [lang]);

  return (
    <div className="landing-root" lang={lang}>
      <Nav c={c} lang={lang} setLang={setLang} />
      <Hero c={c} menu={menu} highlightId={highlightId} onPick={pick} />
      <Features c={c} />
      <HowItWorks c={c} />
      <Pricing c={c} />
      <Closing c={c} />
    </div>
  );
}
